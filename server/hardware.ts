import { readdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

function runAllowed(command: string, args: string[], timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${command} timed out.`)) }, timeoutMs)
    child.stderr.on('data', (chunk) => { if (error.length < 1000) error += String(chunk) })
    child.on('error', reject)
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(error.trim() || `${command} failed.`))
    })
  })
}

export async function setVolume(value: number) {
  const clamped = Math.max(0, Math.min(1, value))
  await runAllowed('/usr/bin/wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', clamped.toFixed(2)])
}

export async function setMicrophoneGain(value: number) {
  const clamped = Math.max(0, Math.min(1, value))
  await runAllowed('/usr/bin/wpctl', ['set-volume', '@DEFAULT_AUDIO_SOURCE@', clamped.toFixed(2)])
}

async function backlightDevice(): Promise<string | null> {
  try {
    const entries = (await readdir('/sys/class/backlight')).filter((entry) => !entry.startsWith('.'))
    return entries[0] ? join('/sys/class/backlight', entries[0]) : null
  } catch { return null }
}

export async function setBrightness(value: number): Promise<{ supported: boolean; value: number }> {
  const device = await backlightDevice()
  const clamped = Math.max(0.1, Math.min(1, value))
  if (!device) return { supported: false, value: clamped }
  const maximum = Number.parseInt(await readFile(join(device, 'max_brightness'), 'utf8'), 10)
  if (!Number.isFinite(maximum) || maximum <= 0) return { supported: false, value: clamped }
  await writeFile(join(device, 'brightness'), `${Math.max(1, Math.round(maximum * clamped))}\n`)
  return { supported: true, value: clamped }
}

export async function getBrightness(): Promise<{ supported: boolean; value: number }> {
  const device = await backlightDevice()
  if (!device) return { supported: false, value: 1 }
  try {
    const [maximum, current] = await Promise.all([
      readFile(join(device, 'max_brightness'), 'utf8'),
      readFile(join(device, 'actual_brightness'), 'utf8').catch(() => readFile(join(device, 'brightness'), 'utf8'))
    ])
    const max = Number.parseInt(maximum, 10)
    const actual = Number.parseInt(current, 10)
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(actual)) return { supported: false, value: 1 }
    return { supported: true, value: Math.max(0.1, Math.min(1, actual / max)) }
  } catch { return { supported: false, value: 1 } }
}

export async function getCpuTemperature(): Promise<{ supported: boolean; celsius: number | null; tooHot: boolean }> {
  try {
    const thermalRoot = '/sys/class/thermal'
    const zones = (await readdir(thermalRoot)).filter((entry) => entry.startsWith('thermal_zone'))
    const readings = await Promise.all(zones.map(async (zone) => {
      const path = join(thermalRoot, zone)
      const [type, raw] = await Promise.all([
        readFile(join(path, 'type'), 'utf8').catch(() => ''),
        readFile(join(path, 'temp'), 'utf8')
      ])
      const parsed = Number.parseFloat(raw.trim())
      const celsius = parsed > 1000 ? parsed / 1000 : parsed
      return { type: type.trim().toLowerCase(), celsius }
    }))
    const reading = readings.find(({ type }) => type === 'cpu-thermal')
      ?? readings.find(({ type }) => type.includes('cpu') || type.includes('soc'))
      ?? readings.find(({ celsius }) => Number.isFinite(celsius))
    if (!reading || !Number.isFinite(reading.celsius)) return { supported: false, celsius: null, tooHot: false }
    return { supported: true, celsius: reading.celsius, tooHot: reading.celsius >= 80 }
  } catch {
    return { supported: false, celsius: null, tooHot: false }
  }
}

export async function speakerTest() {
  await runAllowed('/usr/bin/speaker-test', ['-D', 'default', '-t', 'sine', '-f', '660', '-l', '1'], 7000)
}
