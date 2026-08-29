import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let root = ''
const originalConfigHome = process.env.XDG_CONFIG_HOME

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lappy-settings-test-'))
  process.env.XDG_CONFIG_HOME = root
  vi.resetModules()
})

afterEach(async () => {
  if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalConfigHome
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe('settings persistence recovery', () => {
  it('backs up corrupt JSON and returns validated defaults', async () => {
    const directory = join(root, 'lappy')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'settings.json'), '{broken-json', { mode: 0o600 })
    const { readSettings } = await import('./settingsStore.js')
    const settings = await readSettings()
    expect(settings.masterVolume).toBeGreaterThanOrEqual(0)
    expect(settings.masterVolume).toBeLessThanOrEqual(1)
    const names = await readdir(directory)
    const backup = names.find((name) => name.startsWith('settings.json.corrupt-'))
    expect(backup).toBeTruthy()
    expect(await readFile(join(directory, backup!), 'utf8')).toBe('{broken-json')
  })

  it('rejects invalid values without creating a settings file', async () => {
    const { writeSettings } = await import('./settingsStore.js')
    await expect(writeSettings({ masterVolume: 4 })).rejects.toThrow()
    await expect(readdir(join(root, 'lappy'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
