import type { AgentContext, AgentEvent, AgentState } from '@/types'

export const initialAgentContext: AgentContext = {
  state: 'idle',
  previousState: 'idle',
  transcript: '',
  responseCaption: '',
  tool: null,
  errorMessage: '',
  cameraActive: false,
  cameraFrameAttached: false,
  microphoneMuted: false,
  speakerMuted: false,
  wakeWordEnabled: false,
  connected: true,
  requestInFlight: false
}

const canStartListening = new Set<AgentState>([
  'idle',
  'wake-detected',
  'finished',
  'error',
  'thinking',
  'tool-use',
  'browsing',
  'speaking'
])
const canDetectWake = new Set<AgentState>(['idle', 'finished', 'error', 'speaking'])

function move(context: AgentContext, state: AgentState, changes: Partial<AgentContext> = {}): AgentContext {
  return { ...context, previousState: context.state, state, ...changes }
}

/**
 * Pure state reducer. Invalid/duplicate events are ignored so recording,
 * playback, and gateway submission cannot overlap after rapid touch events.
 */
export function transition(context: AgentContext, event: AgentEvent): AgentContext {
  switch (event.type) {
    case 'WAKE_DETECTED':
      if (context.microphoneMuted || !canDetectWake.has(context.state)) return context
      return move(context, 'wake-detected', { requestInFlight: false, tool: null })
    case 'START_LISTENING':
      if (context.microphoneMuted || !canStartListening.has(context.state)) return context
      return move(context, 'listening', {
        transcript: '', responseCaption: '', tool: null, errorMessage: '', requestInFlight: false
      })
    case 'TRANSCRIPT_PARTIAL':
      if (context.state !== 'listening' && context.state !== 'transcribing') return context
      return { ...context, transcript: event.text }
    case 'STOP_LISTENING':
      return context.state === 'listening' ? move(context, 'transcribing') : context
    case 'TRANSCRIPTION_READY':
      if (context.state !== 'listening' && context.state !== 'transcribing') return context
      return move(context, 'submitting', { transcript: event.text, requestInFlight: true })
    case 'SUBMIT':
      return context.state === 'submitting'
        ? move(context, 'thinking', { requestInFlight: true })
        : context
    case 'RESPONSE_STARTED':
      return context.requestInFlight ? move(context, 'thinking') : context
    case 'RESPONSE_DELTA':
      if (!context.requestInFlight) return context
      return { ...context, responseCaption: context.responseCaption + event.text }
    case 'TOOL_STARTED':
      if (!context.requestInFlight) return context
      return move(context, event.tool.kind === 'browser' ? 'browsing' : 'tool-use', { tool: event.tool })
    case 'TOOL_FINISHED':
      return context.state === 'tool-use' || context.state === 'browsing'
        ? move(context, 'thinking', { tool: null })
        : context
    case 'SPEAKING_STARTED':
      return context.requestInFlight ? move(context, 'speaking', { tool: null }) : context
    case 'SPEAKING_FINISHED':
    case 'FINISH':
      return move(context, 'finished', { requestInFlight: false, tool: null })
    case 'RESET':
      return move(context, context.microphoneMuted ? 'muted' : 'idle', {
        transcript: '', responseCaption: '', tool: null, errorMessage: '', requestInFlight: false
      })
    case 'MUTE_MIC':
      return move(context, 'muted', { microphoneMuted: true, requestInFlight: false, tool: null })
    case 'UNMUTE_MIC':
      return move(context, context.connected ? 'idle' : 'disconnected', { microphoneMuted: false })
    case 'SET_SPEAKER_MUTED':
      return { ...context, speakerMuted: event.muted }
    case 'SET_CAMERA':
      if (event.active) {
        if (context.state === 'camera-active') return { ...context, cameraActive: true }
        return move(context, 'camera-active', { cameraActive: true })
      }
      if (context.state !== 'camera-active') return { ...context, cameraActive: false }
      return move(context, context.previousState === 'camera-active' ? 'idle' : context.previousState, { cameraActive: false })
    case 'SET_CAMERA_FRAME':
      return { ...context, cameraFrameAttached: event.attached }
    case 'DISCONNECTED':
      return move(context, 'disconnected', { connected: false, requestInFlight: false, tool: null })
    case 'RECONNECTED':
      if (context.connected && context.state !== 'disconnected') return context
      return move(context, context.microphoneMuted ? 'muted' : 'idle', { connected: true, errorMessage: '' })
    case 'MICROPHONE_UNAVAILABLE':
      return move(context, 'microphone-unavailable', {
        errorMessage: event.message ?? 'No microphone input is available.', requestInFlight: false
      })
    case 'ERROR':
      return move(context, 'error', { errorMessage: event.message, requestInFlight: false, tool: null })
    case 'CANCEL':
      return move(context, context.microphoneMuted ? 'muted' : 'idle', {
        requestInFlight: false, tool: null, responseCaption: '', transcript: ''
      })
  }
}
