import { describe, expect, it } from 'vitest'
import { initialAgentContext, transition } from './machine'

describe('agent state machine', () => {
  it('runs the tap-to-talk conversation path', () => {
    let state = transition(initialAgentContext, { type: 'START_LISTENING' })
    expect(state.state).toBe('listening')
    state = transition(state, { type: 'STOP_LISTENING' })
    state = transition(state, { type: 'TRANSCRIPTION_READY', text: 'What is next?' })
    state = transition(state, { type: 'SUBMIT' })
    state = transition(state, { type: 'RESPONSE_STARTED' })
    state = transition(state, { type: 'RESPONSE_DELTA', text: 'Your next event' })
    state = transition(state, { type: 'SPEAKING_STARTED' })
    expect(state.state).toBe('speaking')
    expect(state.responseCaption).toBe('Your next event')
    state = transition(state, { type: 'SPEAKING_FINISHED' })
    expect(state.state).toBe('finished')
    expect(state.requestInFlight).toBe(false)
  })

  it('prevents duplicate listening and submission while muted or busy', () => {
    const muted = transition(initialAgentContext, { type: 'MUTE_MIC' })
    expect(transition(muted, { type: 'START_LISTENING' })).toBe(muted)

    let busy = transition(initialAgentContext, { type: 'START_LISTENING' })
    busy = transition(busy, { type: 'TRANSCRIPTION_READY', text: 'Hello' })
    busy = transition(busy, { type: 'SUBMIT' })
    expect(transition(busy, { type: 'WAKE_DETECTED' })).toBe(busy)
    const listeningAgain = { ...initialAgentContext, state: 'listening' as const }
    expect(transition(listeningAgain, { type: 'WAKE_DETECTED' })).toBe(listeningAgain)
  })

  it('allows a wake phrase to interrupt speech without preserving the request lock', () => {
    const speaking = { ...initialAgentContext, state: 'speaking' as const, requestInFlight: true }
    const detected = transition(speaking, { type: 'WAKE_DETECTED' })
    expect(detected.state).toBe('wake-detected')
    expect(detected.requestInFlight).toBe(false)
  })

  it('keeps a captured camera frame attached when the preview closes', () => {
    let camera = transition(initialAgentContext, { type: 'SET_CAMERA', active: true })
    expect(camera.state).toBe('camera-active')
    camera = transition(camera, { type: 'SET_CAMERA_FRAME', attached: true })
    camera = transition(camera, { type: 'SET_CAMERA', active: false })
    expect(camera.state).toBe('idle')
    expect(camera.cameraActive).toBe(false)
    expect(camera.cameraFrameAttached).toBe(true)
  })

  it('allows microphone interruption during speech', () => {
    const speaking = { ...initialAgentContext, state: 'speaking' as const, requestInFlight: true }
    const interrupted = transition(speaking, { type: 'START_LISTENING' })
    expect(interrupted.state).toBe('listening')
    expect(interrupted.requestInFlight).toBe(false)
  })

  it('does not reset active work for a duplicate healthy connection event', () => {
    const listening = transition(initialAgentContext, { type: 'START_LISTENING' })
    expect(transition(listening, { type: 'RECONNECTED' })).toBe(listening)

    const disconnected = transition(listening, { type: 'DISCONNECTED' })
    const recovered = transition(disconnected, { type: 'RECONNECTED' })
    expect(recovered.state).toBe('idle')
    expect(recovered.connected).toBe(true)
  })
})
