import type { ChatRequest, GatewayEvent, HermesAdapter, ToolKind } from '../types.js'

function toolActivity(name: string) {
  const normalized = name.toLowerCase()
  const kind: ToolKind = normalized.includes('browser') || normalized.includes('search') ? 'browser'
    : normalized.includes('calendar') ? 'calendar'
      : normalized.includes('file') ? 'files'
        : normalized.includes('terminal') || normalized.includes('shell') ? 'terminal'
          : normalized.includes('camera') || normalized.includes('image') ? 'camera' : 'other'
  const labels: Record<ToolKind, string> = { browser: 'Browser', calendar: 'Calendar', files: 'Files', terminal: 'Terminal', camera: 'Camera', other: 'Tool' }
  const actions: Record<ToolKind, string> = { browser: 'searching', calendar: 'reading', files: 'opening document', terminal: 'running command', camera: 'analyzing image', other: 'working' }
  return { kind, label: labels[kind], action: actions[kind] }
}

export class OpenAIHermesAdapter implements HermesAdapter {
  readonly id = 'openai'
  private controller: AbortController | null = null
  constructor(private readonly config: { baseUrl: string; path: string; apiKey?: string; agentName: string; sessionId?: string; healthPath?: string; responseTimeoutMs?: number }) {}

  private url(path: string) { return new URL(path, this.config.baseUrl).toString() }

  async chat(request: ChatRequest, emit: (event: GatewayEvent) => void) {
    if (!this.config.path) throw new Error('No documented OpenAI-compatible chat path is configured.')
    this.cancel()
    const controller = new AbortController()
    this.controller = controller
    const responseTimeoutMs = this.config.responseTimeoutMs ?? 90_000
    let responseTimer: ReturnType<typeof setTimeout> | null = null
    const armResponseTimeout = () => {
      if (responseTimer) clearTimeout(responseTimer)
      responseTimer = setTimeout(() => controller.abort(new Error('Gateway response timed out.')), responseTimeoutMs)
    }
    armResponseTimeout()
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: request.text }]
    if (request.imageDataUrl) content.push({ type: 'image_url', image_url: { url: request.imageDataUrl } })
    try {
      const response = await fetch(this.url(this.config.path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.config.agentName,
        messages: [{ role: 'user', content }],
        stream: true,
        ...(request.sessionId || this.config.sessionId ? { user: request.sessionId || this.config.sessionId } : {})
      }),
      signal: controller.signal
      })
      if (!response.ok || !response.body) throw new Error(`Gateway returned ${response.status}.`)
      emit({ type: 'response-start' })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let complete = ''
      let terminated = false
      const activeTools = new Map<number, ReturnType<typeof toolActivity>>()
      const finishTools = () => {
        for (const tool of activeTools.values()) emit({ type: 'tool-finish', tool })
        activeTools.clear()
      }
      const processLine = (line: string) => {
      if (!line.startsWith('data:')) return
      const payload = line.slice(5).trim()
      if (!payload) return
      if (payload === '[DONE]') {
        terminated = true
        finishTools()
        return
      }
      let parsed: { choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }> }
      try { parsed = JSON.parse(payload) }
      catch { return }
      const choice = parsed.choices?.[0]
      const text = choice?.delta?.content
      if (text) { complete += text; emit({ type: 'response-delta', text }) }
      for (const call of choice?.delta?.tool_calls ?? []) {
        const index = call.index ?? 0
        const existing = activeTools.get(index)
        if (existing) {
          if (call.function?.name || call.function?.arguments) emit({ type: 'tool-progress', tool: existing })
          continue
        }
        if (!call.function?.name) continue
        const tool = toolActivity(call.function.name)
        activeTools.set(index, tool)
        emit({ type: 'tool-start', tool })
      }
      if (choice?.finish_reason) {
        terminated = true
        finishTools()
      }
      }
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        armResponseTimeout()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) processLine(line)
      }
      buffer += decoder.decode()
      for (const line of buffer.split(/\r?\n/)) processLine(line)
      if (!terminated) throw new Error('Gateway response ended unexpectedly.')
      emit({ type: 'response-complete', text: complete })
    } finally {
      if (responseTimer) clearTimeout(responseTimer)
      if (this.controller === controller) this.controller = null
    }
  }

  cancel() { this.controller?.abort(); this.controller = null }

  async testConnection() {
    if (!this.config.baseUrl) return { ok: false, message: 'No gateway URL is configured.' }
    const path = this.config.healthPath || ''
    try {
      const response = await fetch(this.url(path), {
        method: 'GET',
        headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {},
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
        ? { ok: true, message: 'Lappy can reach the configured gateway.' }
        : { ok: false, message: `Gateway health check returned ${response.status}.` }
    } catch { return { ok: false, message: 'Lappy could not reach the configured gateway.' } }
  }
}
