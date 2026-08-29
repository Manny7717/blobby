import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defaultSettings, settingsSchema, type TerminalSettings } from './config.js'

const configRoot = process.env.XDG_CONFIG_HOME || join(process.env.HOME || '/home/terminal', '.config')
const settingsPath = join(configRoot, 'lappy', 'settings.json')

export async function readSettings(): Promise<TerminalSettings> {
  try {
    const raw = await readFile(settingsPath, 'utf8')
    const parsed = settingsSchema.safeParse(JSON.parse(raw))
    if (parsed.success) {
      return {
        ...parsed.data,
        gatewayUrl: parsed.data.gatewayUrl || defaultSettings.gatewayUrl
      }
    }
    throw new Error('Settings validation failed')
  } catch (reason) {
    const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : ''
    if (code !== 'ENOENT') {
      try { await rename(settingsPath, `${settingsPath}.corrupt-${Date.now()}`) } catch { /* preserve defaults even if backup fails */ }
    }
    return { ...defaultSettings }
  }
}

export async function writeSettings(value: unknown): Promise<TerminalSettings> {
  const settings = settingsSchema.parse(value)
  await mkdir(dirname(settingsPath), { recursive: true, mode: 0o700 })
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
  return settings
}
