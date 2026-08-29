import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { ZodError, z } from 'zod'
import { cancelMessageSchema, chatMessageSchema } from './config.js'
import { getBrightness, getCpuTemperature, setBrightness, setMicrophoneGain, setVolume, speakerTest } from './hardware.js'
import { createHermesAdapter } from './hermes/index.js'
import { geminiTranscriptionAvailable, transcribeWithGemini } from './geminiTranscribe.js'
import { readSettings, writeSettings } from './settingsStore.js'
import type { GatewayEvent } from './types.js'

const host = process.env.LAPPY_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.LAPPY_PORT || '4318', 10)
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dist = join(root, 'dist')
const hermes = createHermesAdapter()

const sttProvider = process.env.STT_PROVIDER ?? 'browser'

// Local whisper STT daemon (spawned only when STT_PROVIDER=whisper).
const sttPort = 4390
const sttEnabled = sttProvider === 'whisper'
let sttDaemon: ReturnType<typeof spawn> | null = null
const wakePort = 4391
const localWakeEnabled = process.env.WAKE_WORD_PROVIDER === 'local'
let wakeDaemon: ReturnType<typeof spawn> | null = null

function startSttDaemon() {
  if (!sttEnabled) return
  const python = join(root, 'stt', '.venv', 'bin', 'python')
  sttDaemon = spawn(python, [join(root, 'stt', 'transcribe.py'), String(sttPort)], {
    env: { ...process.env, HF_HUB_OFFLINE: '1' },
    stdio: 'ignore'
  })
  sttDaemon.on('exit', (code) => {
    console.log(`STT daemon exited (${code}).`)
    sttDaemon = null
  })
  sttDaemon.on('error', (error) => console.log(`STT daemon failed to start: ${error.message}`))
}

function stopSttDaemon() {
  sttDaemon?.kill()
  sttDaemon = null
}

function startWakeDaemon() {
  if (!localWakeEnabled) return
  const python = join(root, 'stt', '.venv', 'bin', 'python')
  wakeDaemon = spawn(python, [join(root, 'stt', 'wake.py'), String(wakePort)], {
    env: { ...process.env }, stdio: ['ignore', 'inherit', 'inherit']
  })
  wakeDaemon.on('exit', (code) => {
    console.log(`Wake daemon exited (${code}).`)
    wakeDaemon = null
  })
  wakeDaemon.on('error', (error) => console.log(`Wake daemon failed to start: ${error.message}`))
}

function stopWakeDaemon() {
  wakeDaemon?.kill()
  wakeDaemon = null
}

function trustedBrowserOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true // Local CLI/system health and recovery commands.
  try {
    const parsed = new URL(origin)
    const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]'
    const expectedPort = parsed.port === String(port)
    const developmentPort = process.env.NODE_ENV !== 'production' && parsed.port === '4173'
    return parsed.protocol === 'http:' && loopback && (expectedPort || developmentPort)
  } catch { return false }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(body))
}

async function bodyJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 8_000_000) throw new Error('Request body is too large.')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const pendingSpeech = new Map<string, { text: string; expiresAt: number; started: boolean }>()

function createFishAudioTicket(text: string): string {
  const token = randomUUID()
  pendingSpeech.set(token, { text, expiresAt: Date.now() + 30_000, started: false })
  return token
}

async function synthesizeFishAudio(request: IncomingMessage, response: ServerResponse, text: string) {
  const apiKey = process.env.FISH_AUDIO_API_KEY?.trim()
  if (!apiKey) {
    sendJson(response, 503, { error: 'Fish Audio is selected but FISH_AUDIO_API_KEY is not configured.' })
    return
  }
  const controller = new AbortController()
  request.once('aborted', () => controller.abort())
  response.once('close', () => { if (!response.writableEnded) controller.abort() })
  const upstream = await fetch(process.env.FISH_AUDIO_API_URL || 'https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      model: process.env.FISH_AUDIO_MODEL || 's2.1-pro-free'
    },
    body: JSON.stringify({
      text,
      reference_id: process.env.FISH_AUDIO_VOICE_ID || 'c8c398f58ea74012969c3d9e51dd086c',
      format: 'mp3',
      normalize: true,
      latency: 'low',
      chunk_length: 100,
      prosody: { volume: 6, normalize_loudness: true }
    }),
    signal: controller.signal
  })
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 500)
    sendJson(response, upstream.status, { error: `Fish Audio synthesis failed (${upstream.status})${detail ? `: ${detail}` : '.'}` })
    return
  }
  response.writeHead(200, {
    'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
    'cache-control': 'no-store',
    'accept-ranges': 'none',
    'x-content-type-options': 'nosniff'
  })
  if (!upstream.body) { response.end(); return }
  try {
    for await (const chunk of upstream.body) {
      if (!response.write(chunk)) await new Promise<void>((resolve) => response.once('drain', resolve))
    }
    response.end()
  } catch {
    if (!response.destroyed) response.destroy()
  }
}

async function bodyBuffer(request: IncomingMessage, limit = 10_000_000): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('Request body is too large.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function proxyLocalWake(request: IncomingMessage, response: ServerResponse, action: 'frame' | 'reset') {
  if (!wakeDaemon) { sendJson(response, 503, { error: 'Local wake-word detector is not available.' }); return }
  let body: Buffer
  try { body = await bodyBuffer(request, action === 'frame' ? 64_000 : 1000) }
  catch { sendJson(response, 413, { error: 'Wake request is too large.' }); return }
  try {
    const upstream = await fetch(`http://127.0.0.1:${wakePort}/${action}`, {
      method: 'POST',
      headers: { 'content-type': request.headers['content-type'] ?? 'application/octet-stream' },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(5000)
    })
    const result = await upstream.json()
    sendJson(response, upstream.status, result)
  } catch {
    sendJson(response, 502, { error: 'Local wake-word detector is starting.' })
  }
}

async function transcribeAudio(request: IncomingMessage, response: ServerResponse) {
  if (sttProvider === 'gemini' && !geminiTranscriptionAvailable()) {
    sendJson(response, 503, { error: 'Gemini transcription is selected but GEMINI_API_KEY is not configured.' })
    return
  }
  if (sttProvider !== 'gemini' && !sttDaemon) {
    sendJson(response, 503, { error: 'Speech recognition is not available.' })
    return
  }
  let audio: Buffer
  try {
    audio = await bodyBuffer(request)
  } catch {
    sendJson(response, 413, { error: 'Request body is too large.' })
    return
  }
  if (audio.byteLength === 0) {
    sendJson(response, 400, { error: 'Empty audio.' })
    return
  }
  const controller = new AbortController()
  request.once('aborted', () => controller.abort())
  response.once('close', () => { if (!response.writableEnded) controller.abort() })
  try {
    if (sttProvider === 'gemini') {
      const text = await transcribeWithGemini(audio, String(request.headers['content-type'] ?? 'audio/webm').split(';')[0]!, {
        signal: controller.signal
      })
      sendJson(response, 200, { text })
      return
    }
    const upstream = await fetch(`http://127.0.0.1:${sttPort}/transcribe`, {
      method: 'POST',
      headers: { 'content-type': request.headers['content-type'] ?? 'audio/webm' },
      body: new Uint8Array(audio),
      signal: controller.signal
    })
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300)
      sendJson(response, upstream.status, { error: `Speech recognition failed (${upstream.status})${detail ? `: ${detail}` : '.'}` })
      return
    }
    const result = await upstream.json() as { text?: string }
    sendJson(response, 200, { text: result.text ?? '' })
  } catch {
    sendJson(response, 502, { error: 'Speech recognition backend unavailable.' })
  }
}

async function routeApi(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (!url.pathname.startsWith('/api/')) return false
  if (request.method !== 'GET' && request.method !== 'HEAD' && !trustedBrowserOrigin(request)) {
    sendJson(response, 403, { error: 'Untrusted request origin.' })
    return true
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'lappy', adapter: hermes.id })
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/runtime') {
    const configuredTts = process.env.TTS_PROVIDER
    sendJson(response, 200, {
      sttProvider: sttProvider === 'whisper' ? 'whisper' : sttProvider === 'gemini' && geminiTranscriptionAvailable() ? 'gemini' : 'browser',
      ttsProvider: configuredTts === 'browser' || configuredTts === 'fish-audio' ? configuredTts : 'local-espeak',
      wakeWordProvider: localWakeEnabled && wakeDaemon ? 'local' : 'unavailable'
    })
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/tts') {
    const { text } = z.object({ text: z.string().trim().min(1).max(20_000) }).parse(await bodyJson(request))
    const token = createFishAudioTicket(text)
    sendJson(response, 201, { url: `/api/tts/${token}` })
    return true
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/tts/')) {
    const token = url.pathname.slice('/api/tts/'.length)
    const ticket = pendingSpeech.get(token)
    if (!ticket || ticket.expiresAt < Date.now() || ticket.started) {
      pendingSpeech.delete(token)
      sendJson(response, 404, { error: 'Speech stream expired.' })
      return true
    }
    ticket.started = true
    pendingSpeech.delete(token)
    await synthesizeFishAudio(request, response, ticket.text)
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/stt') {
    await transcribeAudio(request, response)
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/wake/frame') {
    await proxyLocalWake(request, response, 'frame')
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/wake/reset') {
    await proxyLocalWake(request, response, 'reset')
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/settings') {
    sendJson(response, 200, await readSettings())
    return true
  }
  if (request.method === 'PUT' && url.pathname === '/api/settings') {
    sendJson(response, 200, await writeSettings(await bodyJson(request)))
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/connection/test') {
    sendJson(response, 200, await hermes.testConnection())
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/hardware/volume') {
    const value = z.object({ value: z.number().min(0).max(1) }).parse(await bodyJson(request)).value
    await setVolume(value)
    sendJson(response, 200, { ok: true })
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/hardware/microphone-gain') {
    const value = z.object({ value: z.number().min(0).max(1) }).parse(await bodyJson(request)).value
    await setMicrophoneGain(value)
    sendJson(response, 200, { ok: true })
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/hardware/capabilities') {
    sendJson(response, 200, { brightness: await getBrightness() })
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/hardware/temperature') {
    sendJson(response, 200, await getCpuTemperature())
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/hardware/brightness') {
    const value = z.object({ value: z.number().min(0.1).max(1) }).parse(await bodyJson(request)).value
    sendJson(response, 200, await setBrightness(value))
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/hardware/speaker-test') {
    await speakerTest()
    sendJson(response, 200, { ok: true })
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/application/restart') {
    if (process.env.LAPPY_ALLOW_RESTART !== 'true') {
      sendJson(response, 501, { error: 'Restart is disabled until kiosk services are installed.' })
      return true
    }
    const child = spawn('/usr/bin/systemctl', ['--user', 'restart', 'lappy.service'], { detached: true, stdio: 'ignore', shell: false })
    child.unref()
    sendJson(response, 202, { ok: true })
    return true
  }
  if (request.method === 'POST' && url.pathname === '/api/application/exit-kiosk') {
    if (process.env.LAPPY_ALLOW_KIOSK_CONTROL !== 'true') {
      sendJson(response, 501, { error: 'Kiosk control is disabled until kiosk services are installed.' })
      return true
    }
    const child = spawn('/usr/bin/systemctl', ['--user', 'stop', 'lappy-kiosk.service'], { detached: true, stdio: 'ignore', shell: false })
    child.unref()
    sendJson(response, 202, { ok: true })
    return true
  }
  sendJson(response, 404, { error: 'Not found.' })
  return true
}

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
}

async function serveStatic(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const requested = normalize(decodeURIComponent(url.pathname))
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '')
  let file = join(dist, requested === '' || requested === '.' ? 'index.html' : requested)
  if (file !== dist && !file.startsWith(`${dist}${sep}`)) { sendJson(response, 403, { error: 'Forbidden.' }); return }
  try {
    const info = await stat(file)
    if (info.isDirectory()) {
      const index = join(file, 'index.html')
      try { await access(index); file = index }
      catch { sendJson(response, 404, { error: 'Not found.' }); return }
    }
  }
  catch {
    if (extname(requested)) { sendJson(response, 404, { error: 'Not found.' }); return }
    file = join(dist, 'index.html')
  }
  response.writeHead(200, {
    'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream',
    'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'content-security-policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY'
  })
  const stream = createReadStream(file)
  stream.on('error', () => {
    if (!response.headersSent) sendJson(response, 500, { error: 'Static file unavailable.' })
    else response.destroy()
  })
  stream.pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    if (await routeApi(request, response)) return
    await serveStatic(request, response)
  } catch (reason) {
    const message = reason instanceof ZodError ? 'Invalid input.' : reason instanceof Error ? reason.message : 'Unexpected service error.'
    sendJson(response, reason instanceof ZodError ? 400 : 500, { error: message })
  }
})

const sockets = new WebSocketServer({ noServer: true, maxPayload: 8_000_000 })
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/events' || !trustedBrowserOrigin(request)) { socket.destroy(); return }
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client, request))
})

sockets.on('connection', (socket) => {
  let healthTimer: ReturnType<typeof setTimeout> | null = null
  let healthAttempt = 0
  let lastConnection: boolean | null = null
  let closed = false
  const emit = (event: GatewayEvent) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event))
  }
  const setConnection = (connected: boolean) => {
    if (lastConnection === connected) return
    lastConnection = connected
    emit({ type: 'connection', connected })
  }
  const scheduleHealthCheck = (connected: boolean) => {
    if (closed) return
    if (connected) healthAttempt = 0
    const base = connected ? 30_000 : Math.min(30_000, 1000 * 2 ** Math.min(healthAttempt++, 5))
    const delay = Math.round(base * (0.85 + Math.random() * 0.3))
    healthTimer = setTimeout(checkHealth, delay)
  }
  const checkHealth = async () => {
    const result = await hermes.testConnection()
    if (closed) return
    setConnection(result.ok)
    scheduleHealthCheck(result.ok)
  }
  void checkHealth()
  socket.on('message', async (raw) => {
    try {
      const payload = JSON.parse(String(raw))
      const cancel = cancelMessageSchema.safeParse(payload)
      if (cancel.success) { hermes.cancel(); return }
      const chat = chatMessageSchema.parse(payload)
      await hermes.chat(chat.request, emit)
      setConnection(true)
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'name' in reason && reason.name === 'AbortError') return
      const message = reason instanceof ZodError ? 'Invalid request.' : reason instanceof Error ? reason.message : 'Request failed.'
      emit({ type: 'error', message })
      if (!(reason instanceof ZodError)) {
        setConnection(false)
        if (healthTimer) clearTimeout(healthTimer)
        scheduleHealthCheck(false)
      }
    }
  })
  socket.on('close', () => {
    closed = true
    if (healthTimer) clearTimeout(healthTimer)
    hermes.cancel()
  })
})

startSttDaemon()
startWakeDaemon()
server.listen(port, host, () => {
  // Never log environment values, request bodies, or credentials.
  console.log(`Blobby service listening on http://${host}:${port} with ${hermes.id} adapter`)
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    hermes.cancel()
    stopSttDaemon()
    stopWakeDaemon()
    const forcedExit = setTimeout(() => {
      for (const client of sockets.clients) client.terminate()
      process.exit(1)
    }, 5000)
    forcedExit.unref()
    server.close(() => {
      clearTimeout(forcedExit)
      process.exit(0)
    })
    for (const client of sockets.clients) client.close(1001, 'Blobby service restarting.')
    sockets.close()
  })
}
