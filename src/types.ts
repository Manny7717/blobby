export type AgentState =
  | 'idle'
  | 'wake-detected'
  | 'listening'
  | 'transcribing'
  | 'submitting'
  | 'thinking'
  | 'tool-use'
  | 'browsing'
  | 'speaking'
  | 'finished'
  | 'camera-active'
  | 'muted'
  | 'disconnected'
  | 'error'
  | 'microphone-unavailable'

export type ToolKind = 'browser' | 'calendar' | 'files' | 'terminal' | 'camera' | 'other'

export interface ToolActivity {
  kind: ToolKind
  label: string
  action: string
}

export interface AgentContext {
  state: AgentState
  previousState: AgentState
  transcript: string
  responseCaption: string
  tool: ToolActivity | null
  errorMessage: string
  cameraActive: boolean
  cameraFrameAttached: boolean
  microphoneMuted: boolean
  speakerMuted: boolean
  wakeWordEnabled: boolean
  connected: boolean
  requestInFlight: boolean
}

export type AgentEvent =
  | { type: 'WAKE_DETECTED' }
  | { type: 'START_LISTENING' }
  | { type: 'TRANSCRIPT_PARTIAL'; text: string }
  | { type: 'STOP_LISTENING' }
  | { type: 'TRANSCRIPTION_READY'; text: string }
  | { type: 'SUBMIT' }
  | { type: 'RESPONSE_STARTED' }
  | { type: 'RESPONSE_DELTA'; text: string }
  | { type: 'TOOL_STARTED'; tool: ToolActivity }
  | { type: 'TOOL_FINISHED' }
  | { type: 'SPEAKING_STARTED' }
  | { type: 'SPEAKING_FINISHED' }
  | { type: 'FINISH' }
  | { type: 'RESET' }
  | { type: 'MUTE_MIC' }
  | { type: 'UNMUTE_MIC' }
  | { type: 'SET_SPEAKER_MUTED'; muted: boolean }
  | { type: 'SET_CAMERA'; active: boolean }
  | { type: 'SET_CAMERA_FRAME'; attached: boolean }
  | { type: 'DISCONNECTED' }
  | { type: 'RECONNECTED' }
  | { type: 'MICROPHONE_UNAVAILABLE'; message?: string }
  | { type: 'ERROR'; message: string }
  | { type: 'CANCEL' }

export interface TerminalSettings {
  masterVolume: number
  brightness: number
  microphoneDeviceId: string
  speakerDeviceId: string
  wakeWordEnabled: boolean
  wakeWordSensitivity: number
  activationSound: boolean
  silenceTimeoutMs: number
  maximumRecordingMs: number
  cameraEnabled: boolean
  reducedMotion: boolean
  gatewayUrl: string
}

export type GatewayEvent =
  | { type: 'connection'; connected: boolean }
  | { type: 'response-start' }
  | { type: 'response-delta'; text: string }
  | { type: 'response-complete'; text: string }
  | { type: 'tool-start'; tool: ToolActivity }
  | { type: 'tool-progress'; tool: ToolActivity }
  | { type: 'tool-finish'; tool: ToolActivity }
  | { type: 'approval-required'; summary: string }
  | { type: 'error'; message: string }

export interface ChatRequest {
  text: string
  sessionId?: string
  imageDataUrl?: string
}

export interface RuntimeConfig {
  sttProvider: 'browser' | 'whisper' | 'gemini'
  ttsProvider: 'browser' | 'local-espeak' | 'fish-audio'
  wakeWordProvider: 'local' | 'unavailable'
}
