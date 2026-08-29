import type { ChatRequest, GatewayEvent, RuntimeConfig, TerminalSettings } from '@/types'

export interface GatewayProvider {
  connect(onEvent: (event: GatewayEvent) => void): Promise<void>
  send(request: ChatRequest): Promise<void>
  cancel(): Promise<void>
  testConnection(): Promise<{ ok: boolean; message: string }>
  disconnect(): void
}

export interface SpeechRecognitionSession {
  stop(): void
  cancel(): void
}

export interface SpeechToTextProvider {
  readonly id: string
  readonly supportsPartials: boolean
  isAvailable(): boolean
  listen(options: {
    deviceId?: string
    onPartial(text: string): void
    onFinal(text: string): void
    onError(message: string): void
  }): Promise<SpeechRecognitionSession>
}

export interface TextToSpeechProvider {
  readonly id: string
  isAvailable(): boolean
  speak(text: string, options: { volume: number; outputDeviceId?: string; onStart(): void; onEnd(): void; onError(message: string): void; onAmplitude?(level: number): void; onProgress?(progress: number): void }): void
  cancel(): void
}

export interface WakeWordProvider {
  readonly id: string
  readonly status: 'ready' | 'unavailable' | 'needs-model'
  start(onDetected: () => void): Promise<void>
  stop(): void
  setSensitivity(value: number): void
}

export interface CameraProvider {
  start(deviceId?: string): Promise<MediaStream>
  capture(video: HTMLVideoElement): string
  stop(): void
}

export interface HardwareApi {
  getCapabilities(): Promise<{ brightness: { supported: boolean; value: number } }>
  getTemperature(): Promise<{ supported: boolean; celsius: number | null; tooHot: boolean }>
  getRuntimeConfig(): Promise<RuntimeConfig>
  getSettings(): Promise<TerminalSettings>
  saveSettings(settings: TerminalSettings): Promise<TerminalSettings>
  listDevices(): Promise<{ microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] }>
  setVolume(value: number): Promise<void>
  setMicrophoneGain(value: number): Promise<void>
  setBrightness(value: number): Promise<{ supported: boolean; value: number }>
  testSpeaker(outputDeviceId?: string): Promise<void>
}
