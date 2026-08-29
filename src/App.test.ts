import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe('Blobby application shell', () => {
  it('mounts the idle interface and development state switcher', async () => {
    vi.doMock('@/providers/gateway', () => ({
      LocalGatewayProvider: class {
        async connect() {}
        async send() {}
        async cancel() {}
        async testConnection() { return { ok: true, message: 'Connected.' } }
        disconnect() {}
      }
    }))
    vi.doMock('@/providers/hardware', () => ({
      LocalHardwareApi: class {
        async getRuntimeConfig() { return { sttProvider: 'browser', ttsProvider: 'local-espeak' } }
        async getSettings() { return {
          masterVolume: 1, brightness: 1, microphoneDeviceId: '', speakerDeviceId: '', wakeWordEnabled: false,
          wakeWordSensitivity: 0.5, activationSound: true, silenceTimeoutMs: 2500, maximumRecordingMs: 45000,
          cameraEnabled: false, reducedMotion: false, gatewayUrl: ''
        } }
        async listDevices() { return { microphones: [], speakers: [], cameras: [] } }
        async getCapabilities() { return { brightness: { supported: false, value: 1 } } }
        async getTemperature() { return { supported: true, celsius: 84.6, tooHot: true } }
        async saveSettings(value: unknown) { return value }
        async setVolume() {}
        async setMicrophoneGain() {}
        async setBrightness() { return { supported: false, value: 1 } }
        async testSpeaker() {}
      }
    }))
    history.replaceState({}, '', '/?dev=1')
    const { default: App } = await import('./App.vue')
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(App)
    app.mount(host)
    await nextTick()
    expect(host.querySelector('h1')?.textContent).toBe('Ready when you are')
    await vi.waitFor(() => expect(host.querySelector('.temperature')?.textContent).toBe('CPU 85°C · TOO HOT'))
    expect(host.textContent).toContain('Tap the microphone to talk')
    expect(host.textContent).not.toContain('Say “Hey Blobby”')
    expect(host.querySelector('[aria-label="Development state previews"]')).not.toBeNull()
    expect(host.querySelectorAll('.controls button')).toHaveLength(4)

    ;(host.querySelector('[aria-label="Open settings"]') as HTMLButtonElement).click()
    await nextTick()
    const settings = host.querySelector('[aria-label="Blobby settings"]') as HTMLElement
    expect(settings).not.toBeNull()
    const toggles = Array.from(settings.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    const wakeToggle = toggles[0]
    const cameraToggle = toggles[2]
    expect(wakeToggle?.disabled).toBe(true)
    if (!cameraToggle) throw new Error('Camera toggle was not rendered.')
    cameraToggle.checked = true
    cameraToggle.dispatchEvent(new Event('change'))
    await nextTick()
    const previewButton = Array.from(settings.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview camera'))
    if (!previewButton) throw new Error('Camera preview action was not rendered.')
    previewButton.click()
    await nextTick()
    expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull()
    ;(host.querySelector('.camera-overlay [aria-label="Close camera"]') as HTMLButtonElement).click()
    await nextTick()
    const cameraStateButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.dev-switcher button')).find((button) => button.textContent === 'Camera')
    if (!cameraStateButton) throw new Error('Camera state preview was not rendered.')
    cameraStateButton.click()
    await nextTick()
    expect(host.querySelector('h1')?.textContent).toBe('Camera ready')
    expect(host.textContent).toContain('Camera on')
    app.unmount()
  }, 10_000)
})
