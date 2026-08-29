import type { RuntimeConfig, TerminalSettings } from '@/types'
import type { HardwareApi } from './contracts'

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers }
  })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`)
  return body
}

export class LocalHardwareApi implements HardwareApi {
  getCapabilities() { return jsonRequest<{ brightness: { supported: boolean; value: number } }>('/api/hardware/capabilities') }
  getTemperature() { return jsonRequest<{ supported: boolean; celsius: number | null; tooHot: boolean }>('/api/hardware/temperature') }
  getRuntimeConfig() { return jsonRequest<RuntimeConfig>('/api/runtime') }
  getSettings() { return jsonRequest<TerminalSettings>('/api/settings') }
  saveSettings(settings: TerminalSettings) {
    return jsonRequest<TerminalSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
  }
  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return {
      microphones: devices.filter((device) => device.kind === 'audioinput'),
      speakers: devices.filter((device) => device.kind === 'audiooutput'),
      cameras: devices.filter((device) => device.kind === 'videoinput')
    }
  }
  async setVolume(value: number) {
    await jsonRequest('/api/hardware/volume', { method: 'POST', body: JSON.stringify({ value }) })
  }
  async setMicrophoneGain(value: number) {
    await jsonRequest('/api/hardware/microphone-gain', { method: 'POST', body: JSON.stringify({ value }) })
  }
  setBrightness(value: number) {
    return jsonRequest<{ supported: boolean; value: number }>('/api/hardware/brightness', { method: 'POST', body: JSON.stringify({ value }) })
  }
  async testSpeaker(outputDeviceId?: string) {
    const context = new AudioContext({ latencyHint: 'interactive' })
    const routedContext = context as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }
    if (outputDeviceId && routedContext.setSinkId) await routedContext.setSinkId(outputDeviceId)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 660
    gain.gain.value = 0.045
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.38)
    await new Promise<void>((resolve) => { oscillator.onended = () => resolve() })
    await context.close()
  }
}
