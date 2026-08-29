<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  PhCamera as Camera,
  PhGear as Gear,
  PhMicrophone as Microphone,
  PhMicrophoneSlash as MicrophoneSlash,
  PhSpeakerHigh as SpeakerHigh,
  PhSpeakerSlash as SpeakerSlash
} from '@phosphor-icons/vue'
import BloubBot from '@/bloub/components/BloubBot.vue'
import type { ExpressionId } from '@/bloub/expressions'
import type { StateId } from '@/bloub/states'
import CameraOverlay from '@/components/CameraOverlay.vue'
import HaloRing from '@/components/HaloRing.vue'
import HatOverlay from '@/components/HatOverlay.vue'
import { HATS } from '@/components/hats'
import SettingsDrawer from '@/components/SettingsDrawer.vue'
import { useMicrophoneMeter } from '@/composables/useMicrophoneMeter'
import { BrowserCameraProvider } from '@/providers/camera'
import { LocalGatewayProvider } from '@/providers/gateway'
import { LocalHardwareApi } from '@/providers/hardware'
import { BrowserSpeechToText, BrowserTextToSpeech } from '@/providers/browserSpeech'
import { FishAudioTextToSpeech } from '@/providers/fishAudio'
import { LocalEspeakTextToSpeech } from '@/providers/localEspeak'
import { LocalSpeechToText } from '@/providers/whisperSpeech'
import { LocalWakeWordProvider, UnavailableWakeWordProvider } from '@/providers/wakeWord'
import type { SpeechToTextProvider, TextToSpeechProvider, WakeWordProvider } from '@/providers/contracts'
import { initialAgentContext, transition } from '@/state/machine'
import type { AgentEvent, AgentState, GatewayEvent, TerminalSettings, ToolActivity } from '@/types'

const state = reactive({ ...initialAgentContext })
const defaults: TerminalSettings = {
  masterVolume: 1,
  brightness: 1,
  microphoneDeviceId: '',
  speakerDeviceId: '',
  wakeWordEnabled: false,
  wakeWordSensitivity: 0.5,
  activationSound: true,
  silenceTimeoutMs: 2500,
  maximumRecordingMs: 45000,
  cameraEnabled: false,
  reducedMotion: false,
  gatewayUrl: ''
}
const settings = reactive<TerminalSettings>({ ...defaults })
const settingsOpen = ref(false)
const cameraOpen = ref(false)
const cameraFrame = ref('')
const clock = ref('')
const cpuTemperature = ref<number | null>(null)
const cpuTooHot = ref(false)
const microphones = ref<MediaDeviceInfo[]>([])
const speakers = ref<MediaDeviceInfo[]>([])
const brightnessSupported = ref(false)
const testingConnection = ref(false)
const connectionResult = ref('')
const recognitionSession = ref<{ stop(): void; cancel(): void } | null>(null)
const maximumTimer = ref(0)
const finishTimer = ref(0)
const cursorTimer = ref(0)
const cursorHidden = ref(false)
const responseComplete = ref('')
const microphoneTesting = ref(false)
const speechLevel = ref(0)
const speechProgress = ref(0)
const caption = ref<HTMLElement | null>(null)
const exitConfirmation = ref(false)
let clockTimer = 0
let temperatureTimer = 0
let silenceTimer = 0
let listeningStartedAt = 0
let lastVoiceAt = 0
let microphoneHoldTimer = 0
let suppressMicrophoneTap = false

const gateway = new LocalGatewayProvider()
const hardware = new LocalHardwareApi()
let stt: SpeechToTextProvider = new BrowserSpeechToText()
let tts: TextToSpeechProvider = new LocalEspeakTextToSpeech()
let wakeWord: WakeWordProvider = new UnavailableWakeWordProvider()
const wakeProviderStatus = ref<WakeWordProvider['status']>('needs-model')
const camera = new BrowserCameraProvider()
const meter = useMicrophoneMeter()

/* ----------------------------- hat wardrobe ----------------------------- */

const HAT_STORAGE_KEY = 'lappy-hat'
function storedHatIndex(): number {
  // `window.localStorage` rather than the bare global: Node 26 shadows the
  // bare `localStorage` name with an experimental getter that is undefined
  // unless `--localstorage-file` is passed, which breaks headless tests.
  const stored = Number(window.localStorage?.getItem(HAT_STORAGE_KEY))
  return Number.isInteger(stored) && stored >= 0 && stored < HATS.length ? stored : 0
}
const hatIndex = ref(storedHatIndex())
function cycleHat() {
  hatIndex.value = (hatIndex.value + 1) % HATS.length
  try { window.localStorage?.setItem(HAT_STORAGE_KEY, String(hatIndex.value)) } catch { /* storage unavailable */ }
}
if (import.meta.env.DEV) {
  // Dev/testing override: ?hat=N pins the hat without clicks (headless shots).
  const hatParam = Number(new URLSearchParams(location.search).get('hat'))
  if (Number.isInteger(hatParam) && hatParam >= 0 && hatParam < HATS.length) hatIndex.value = hatParam
}

function dispatch(event: AgentEvent) { Object.assign(state, transition({ ...state }, event)) }

const view = computed(() => {
  const toolLine = state.tool ? `${state.tool.label}  ·  ${state.tool.action}` : ''
  const table: Record<AgentState, { title: string; caption: string; detail: string }> = {
    idle: {
      title: 'Ready when you are',
      caption: wakeProviderStatus.value === 'ready' ? 'Say “Hey Lappy” or tap the microphone' : 'Tap the microphone to talk',
      detail: state.wakeWordEnabled ? 'Wake word active' : wakeProviderStatus.value === 'needs-model' ? 'Wake word needs a compatible model' : 'Tap to talk'
    },
    'wake-detected': { title: 'I’m here', caption: 'Go ahead', detail: 'Wake phrase detected' },
    listening: { title: 'I’m listening', caption: state.transcript ? `“${state.transcript}”` : 'Go ahead…', detail: 'Listening' },
    transcribing: { title: 'One moment', caption: state.transcript || 'Turning your voice into words…', detail: 'Transcribing' },
    submitting: { title: 'Got it', caption: state.transcript ? `“${state.transcript}”` : 'Sending your request…', detail: 'Submitting' },
    thinking: { title: 'Thinking', caption: state.responseCaption || 'Working on that…', detail: 'Lappy  ·  thinking' },
    'tool-use': { title: 'Working on it', caption: state.responseCaption || 'Getting what you need…', detail: toolLine },
    browsing: { title: 'Looking that up', caption: state.responseCaption || 'Searching for the answer…', detail: toolLine || 'Browser  ·  searching' },
    speaking: { title: 'Here’s what I found', caption: state.responseCaption, detail: 'Speaking' },
    finished: { title: 'Anything else?', caption: state.responseCaption, detail: 'Finished' },
    'camera-active': { title: 'Camera ready', caption: 'Frame only what you want Lappy to see', detail: 'Camera on' },
    muted: { title: 'Microphone muted', caption: 'Tap the microphone when you’re ready', detail: 'Wake word paused' },
    disconnected: { title: 'Reconnecting', caption: 'I’ll be ready when the connection returns', detail: 'Connection unavailable' },
    error: { title: 'Something went wrong', caption: state.errorMessage || 'Please try again', detail: 'Tap the microphone to retry' },
    'microphone-unavailable': { title: 'Microphone unavailable', caption: state.errorMessage || 'Check the input connection', detail: 'Open settings to choose an input' }
  }
  return table[state.state]
})

const bloubState = ref<StateId>('idle')
const bloubExpression = ref<ExpressionId>('neutre')
watch([() => state.state, () => state.cameraActive], ([next, cameraActive]) => {
  const mapping: Record<AgentState, [StateId, ExpressionId]> = {
    idle: ['idle', 'neutre'],
    'wake-detected': ['wide', 'attentif'],
    listening: ['idle', 'curieux'],
    transcribing: ['idle', 'attentif'],
    submitting: ['thinking', 'attentif'],
    thinking: ['orbit', 'attentif'],
    'tool-use': ['orbit', 'curieux'],
    browsing: ['orbit', 'curieux'],
    speaking: ['idle', 'heureux'],
    finished: ['wink', 'fier'],
    'camera-active': ['idle', 'curieux'],
    muted: ['idle', 'somnolent'],
    disconnected: ['idle', 'confus'],
    error: ['idle', 'confus'],
    'microphone-unavailable': ['idle', 'triste']
  }
  ;[bloubState.value, bloubExpression.value] = mapping[next]
  if (cameraActive && next === 'idle') bloubExpression.value = 'curieux'
}, { immediate: true })

const reducedMotion = computed(() => settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
const privacyText = computed(() => {
  if (state.cameraActive) return 'Camera on'
  if (state.microphoneMuted) return 'Microphone muted'
  if (state.wakeWordEnabled && wakeProviderStatus.value === 'ready') return 'Wake word active'
  if (cameraFrame.value) return 'Camera frame ready'
  return 'Camera off  ·  Tap to talk'
})
const temperatureLabel = computed(() => {
  if (cpuTemperature.value === null) return ''
  return `CPU ${Math.round(cpuTemperature.value)}°C${cpuTooHot.value ? ' · TOO HOT' : ''}`
})
const showDevSwitcher = new URLSearchParams(location.search).has('dev')
  && (import.meta.env.DEV || location.protocol === 'file:')
const previewStates: Array<{ label: string; state: AgentState; tool?: ToolActivity }> = [
  { label: 'Idle', state: 'idle' },
  { label: 'Listening', state: 'listening' },
  { label: 'Thinking', state: 'thinking' },
  { label: 'Browser', state: 'browsing', tool: { kind: 'browser', label: 'Browser', action: 'searching' } },
  { label: 'Speaking', state: 'speaking' },
  { label: 'Muted', state: 'muted' },
  { label: 'Camera', state: 'camera-active' },
  { label: 'Error', state: 'error' }
]

function onGatewayEvent(event: GatewayEvent) {
  if (event.type === 'connection') return dispatch({ type: event.connected ? 'RECONNECTED' : 'DISCONNECTED' })
  if (event.type === 'response-start') {
    speechProgress.value = 0
    void nextTick(() => { if (caption.value) caption.value.scrollTop = 0 })
    return dispatch({ type: 'RESPONSE_STARTED' })
  }
  if (event.type === 'response-delta') return dispatch({ type: 'RESPONSE_DELTA', text: event.text })
  if (event.type === 'tool-start' || event.type === 'tool-progress') return dispatch({ type: 'TOOL_STARTED', tool: event.tool })
  if (event.type === 'tool-finish') return dispatch({ type: 'TOOL_FINISHED' })
  if (event.type === 'approval-required') return dispatch({ type: 'ERROR', message: `Approval needed: ${event.summary}` })
  if (event.type === 'error') return dispatch({ type: 'ERROR', message: event.message })
  if (event.type === 'response-complete') {
    responseComplete.value = event.text || state.responseCaption
    if (state.speakerMuted || !tts.isAvailable()) {
      dispatch({ type: 'FINISH' })
      scheduleIdle()
      return
    }
    tts.speak(responseComplete.value, {
      volume: settings.masterVolume,
      outputDeviceId: settings.speakerDeviceId || undefined,
      onStart: () => dispatch({ type: 'SPEAKING_STARTED' }),
      onAmplitude: (level) => { speechLevel.value = level },
      onProgress: (progress) => {
        speechProgress.value = progress
        const element = caption.value
        if (element) element.scrollTop = Math.round((element.scrollHeight - element.clientHeight) * progress)
      },
      onEnd: () => { dispatch({ type: 'SPEAKING_FINISHED' }); scheduleIdle() },
      onError: () => { speechLevel.value = 0; dispatch({ type: 'FINISH' }); scheduleIdle() }
    })
  }
}

function scheduleIdle() {
  window.clearTimeout(finishTimer.value)
  void startWakeProviderIfReady()
  finishTimer.value = window.setTimeout(() => {
    dispatch({ type: 'RESET' })
  }, 3200)
}

async function submitTranscript(text: string) {
  const cleaned = text.trim()
  if (!cleaned) {
    dispatch({ type: 'ERROR', message: 'I didn’t catch that. Please try again.' })
    scheduleIdle()
    return
  }
  if (state.state !== 'listening' && state.state !== 'transcribing') return
  const prepared = transition({ ...state }, { type: 'TRANSCRIPTION_READY', text: cleaned })
  if (prepared.state !== 'submitting') return
  Object.assign(state, prepared)
  dispatch({ type: 'SUBMIT' })
  try {
    await gateway.send({ text: cleaned, imageDataUrl: cameraFrame.value || undefined })
    cameraFrame.value = ''
    dispatch({ type: 'SET_CAMERA_FRAME', attached: false })
  } catch (reason) {
    dispatch({ type: 'ERROR', message: reason instanceof Error ? reason.message : 'The request could not be sent.' })
  }
}

async function startListening() {
  if (state.state === 'speaking' || state.requestInFlight) {
    tts.cancel()
    speechLevel.value = 0
    await gateway.cancel()
    dispatch({ type: 'CANCEL' })
  }
  if (state.microphoneMuted) dispatch({ type: 'UNMUTE_MIC' })
  if (!stt.isAvailable()) {
    dispatch({ type: 'MICROPHONE_UNAVAILABLE', message: 'Speech recognition is not available in this Chromium build. Configure a local STT provider.' })
    return
  }
  wakeWord.stop()
  dispatch({ type: 'START_LISTENING' })
  try {
    await meter.start(settings.microphoneDeviceId, () => {
      recognitionSession.value?.cancel()
      stopListeningResources()
      dispatch({ type: 'MICROPHONE_UNAVAILABLE', message: 'The selected microphone was disconnected.' })
    })
    recognitionSession.value = await stt.listen({
      deviceId: settings.microphoneDeviceId || undefined,
      onPartial: (text) => dispatch({ type: 'TRANSCRIPT_PARTIAL', text }),
      onFinal: (text) => { stopListeningResources(); void submitTranscript(text) },
      onError: (message) => { stopListeningResources(); dispatch({ type: 'MICROPHONE_UNAVAILABLE', message }) }
    })
    startSilenceDetection()
    // Always make progress hands-free, even when constant room noise fools VAD.
    maximumTimer.value = window.setTimeout(() => stopListening(), Math.min(settings.maximumRecordingMs, 12000))
  } catch (reason) {
    stopListeningResources()
    dispatch({ type: 'MICROPHONE_UNAVAILABLE', message: reason instanceof Error ? reason.message : 'Microphone unavailable.' })
  }
}

function stopListeningResources() {
  window.clearTimeout(maximumTimer.value)
  window.clearInterval(silenceTimer)
  recognitionSession.value = null
  meter.stop()
}

function startSilenceDetection() {
  listeningStartedAt = Date.now()
  lastVoiceAt = listeningStartedAt
  let heardVoice = false
  let noiseFloor = 0.02
  window.clearInterval(silenceTimer)
  silenceTimer = window.setInterval(() => {
    if (state.state !== 'listening') return
    const now = Date.now()
    const elapsed = now - listeningStartedAt
    const level = meter.level.value
    const voiceThreshold = Math.max(0.055, noiseFloor * 2.2)
    if (level > voiceThreshold) {
      heardVoice = true
      lastVoiceAt = now
    } else {
      // Follow steady room/microphone noise without letting speech raise the baseline.
      noiseFloor = noiseFloor * 0.94 + Math.min(level, noiseFloor * 1.35) * 0.06
    }
    const noSpeechTimeout = Math.max(4000, settings.silenceTimeoutMs + 1000)
    if ((!heardVoice && elapsed >= noSpeechTimeout)
      || (heardVoice && now - lastVoiceAt >= settings.silenceTimeoutMs)) stopListening()
  }, 100)
}

function stopListening() {
  if (state.state !== 'listening') return
  dispatch({ type: 'STOP_LISTENING' })
  recognitionSession.value?.stop()
  const text = state.transcript
  // The browser provider delivers its final synchronously; async providers
  // (whisper) deliver later via onFinal. This fallback only rescues a provider
  // that never delivers, so use a long window instead of racing transcription.
  window.setTimeout(() => {
    stopListeningResources()
    if (state.state === 'transcribing') void submitTranscript(text)
  }, 15000)
}

async function onMicrophoneTap() {
  if (suppressMicrophoneTap) {
    suppressMicrophoneTap = false
    return
  }
  if (state.state === 'listening') stopListening()
  else if (state.state === 'muted') dispatch({ type: 'UNMUTE_MIC' })
  else await startListening()
}

function beginMicrophoneHold(event: PointerEvent) {
  if (!event.isPrimary) return
  window.clearTimeout(microphoneHoldTimer)
  microphoneHoldTimer = window.setTimeout(() => {
    suppressMicrophoneTap = true
    toggleMicrophoneMute()
  }, 650)
}

function endMicrophoneHold() {
  window.clearTimeout(microphoneHoldTimer)
  if (suppressMicrophoneTap) window.setTimeout(() => { suppressMicrophoneTap = false }, 0)
}

function toggleMicrophoneMute() {
  if (state.microphoneMuted) dispatch({ type: 'UNMUTE_MIC' })
  else {
    recognitionSession.value?.cancel()
    stopListeningResources()
    tts.cancel()
    speechLevel.value = 0
    void gateway.cancel()
    dispatch({ type: 'MUTE_MIC' })
  }
}

function toggleSpeaker() {
  if (!state.speakerMuted) {
    tts.cancel()
    speechLevel.value = 0
  }
  dispatch({ type: 'SET_SPEAKER_MUTED', muted: !state.speakerMuted })
}

function openCamera(forcePreview = false) {
  if (!settings.cameraEnabled && !forcePreview) {
    settingsOpen.value = true
    connectionResult.value = 'Enable the camera in settings first.'
    return
  }
  cameraOpen.value = true
  dispatch({ type: 'SET_CAMERA', active: true })
}

function closeCamera() {
  cameraOpen.value = false
  camera.stop()
  dispatch({ type: 'SET_CAMERA', active: false })
}

function captureCamera(dataUrl: string) {
  cameraFrame.value = dataUrl
  dispatch({ type: 'SET_CAMERA_FRAME', attached: true })
  closeCamera()
}

async function saveSettings(next: TerminalSettings) {
  try {
    const saved = await hardware.saveSettings(next)
    Object.assign(settings, saved)
    state.wakeWordEnabled = saved.wakeWordEnabled && wakeProviderStatus.value === 'ready'
    wakeWord.stop()
    await startWakeProviderIfReady()
    await hardware.setVolume(saved.masterVolume)
    if (brightnessSupported.value) await hardware.setBrightness(saved.brightness)
    settingsOpen.value = false
  } catch (reason) {
    connectionResult.value = reason instanceof Error ? reason.message : 'Settings could not be saved.'
  }
}

async function testConnection() {
  testingConnection.value = true
  try { connectionResult.value = (await gateway.testConnection()).message }
  catch (reason) { connectionResult.value = reason instanceof Error ? reason.message : 'Connection test failed.' }
  finally { testingConnection.value = false }
}

async function reconnect() {
  gateway.disconnect()
  try { await gateway.connect(onGatewayEvent); connectionResult.value = 'Lappy is connected.' }
  catch (reason) { connectionResult.value = reason instanceof Error ? reason.message : 'Reconnect failed.' }
}

async function restartApplication() {
  try {
    const response = await fetch('/api/application/restart', { method: 'POST' })
    if (!response.ok) throw new Error('Restart is available after kiosk services are installed.')
  } catch (reason) { connectionResult.value = reason instanceof Error ? reason.message : 'Restart unavailable.' }
}

async function exitKiosk() {
  try {
    const response = await fetch('/api/application/exit-kiosk', { method: 'POST' })
    if (!response.ok) throw new Error('Kiosk exit is available after kiosk services are installed.')
  } catch (reason) {
    exitConfirmation.value = false
    connectionResult.value = reason instanceof Error ? reason.message : 'Kiosk exit failed.'
    settingsOpen.value = true
  }
}

async function microphoneTest() {
  microphoneTesting.value = true
  connectionResult.value = ''
  try {
    await meter.start(settings.microphoneDeviceId, () => {
      microphoneTesting.value = false
      connectionResult.value = 'The selected microphone was disconnected.'
    })
    window.setTimeout(() => { meter.stop(); microphoneTesting.value = false }, 5000)
  } catch (reason) {
    meter.stop()
    microphoneTesting.value = false
    connectionResult.value = reason instanceof Error ? reason.message : 'Microphone test failed.'
  }
}

async function speakerTest() {
  try { await hardware.testSpeaker(settings.speakerDeviceId || undefined) }
  catch (reason) { connectionResult.value = reason instanceof Error ? reason.message : 'Speaker test failed.' }
}

function settingsCameraPreview() {
  settingsOpen.value = false
  openCamera(true)
}

function preview(item: typeof previewStates[number]) {
  state.state = item.state
  state.previousState = 'idle'
  state.tool = item.tool ?? null
  state.transcript = item.state === 'listening' ? "what’s on my schedule today?" : ''
  state.responseCaption = item.state === 'speaking' ? 'You have two events today. Your first is at ten thirty.' : ''
  state.errorMessage = item.state === 'error' ? 'I lost the connection. Trying again now.' : ''
  state.microphoneMuted = item.state === 'muted'
  state.cameraActive = item.state === 'camera-active'
}

function showCursor() {
  cursorHidden.value = false
  window.clearTimeout(cursorTimer.value)
  window.clearTimeout(microphoneHoldTimer)
  cursorTimer.value = window.setTimeout(() => { cursorHidden.value = true }, 3000)
}

function playActivationSound() {
  if (!settings.activationSound) return
  const context = new AudioContext({ latencyHint: 'interactive' })
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = 520
  gain.gain.setValueAtTime(0.035, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.17)
  oscillator.onended = () => { void context.close() }
}

async function startWakeProviderIfReady() {
  wakeWord.setSensitivity(settings.wakeWordSensitivity)
  if (!settings.wakeWordEnabled || wakeProviderStatus.value !== 'ready') return
  await wakeWord.start(() => {
    if (state.microphoneMuted || !['idle', 'finished', 'error', 'speaking'].includes(state.state)) return
    if (state.state === 'speaking') {
      tts.cancel()
      speechLevel.value = 0
      void gateway.cancel()
    }
    dispatch({ type: 'WAKE_DETECTED' })
    playActivationSound()
    window.setTimeout(() => { void startListening() }, 180)
  })
}

async function refreshDevices() {
  try {
    const devices = await hardware.listDevices()
    microphones.value = devices.microphones
    speakers.value = devices.speakers
  } catch { /* device enumeration can briefly fail during a hot-plug */ }
}

async function refreshTemperature() {
  try {
    const reading = await hardware.getTemperature()
    cpuTemperature.value = reading.supported ? reading.celsius : null
    cpuTooHot.value = reading.tooHot
  } catch {
    cpuTemperature.value = null
    cpuTooHot.value = false
  }
}

onMounted(async () => {
  const updateClock = () => { clock.value = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date()) }
  updateClock()
  clockTimer = window.setInterval(updateClock, 15000)
  void refreshTemperature()
  temperatureTimer = window.setInterval(() => { void refreshTemperature() }, 10000)
  window.addEventListener('pointermove', showCursor, { passive: true })
  showCursor()
  try {
    const runtime = await hardware.getRuntimeConfig()
    stt = runtime.sttProvider === 'browser' ? new BrowserSpeechToText() : new LocalSpeechToText(runtime.sttProvider)
    tts = runtime.ttsProvider === 'browser'
      ? new BrowserTextToSpeech()
      : runtime.ttsProvider === 'fish-audio'
        ? new FishAudioTextToSpeech()
        : new LocalEspeakTextToSpeech()
    wakeWord = runtime.wakeWordProvider === 'local' ? new LocalWakeWordProvider() : new UnavailableWakeWordProvider()
    wakeProviderStatus.value = wakeWord.status
  } catch { /* the local offline provider remains the safe default */ }
  try {
    Object.assign(settings, await hardware.getSettings())
    state.wakeWordEnabled = settings.wakeWordEnabled && wakeProviderStatus.value === 'ready'
    await hardware.setVolume(1)
    await hardware.setMicrophoneGain(0.55)
    await startWakeProviderIfReady()
  } catch { /* local defaults remain valid */ }
  await refreshDevices()
  navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
  try {
    const capabilities = await hardware.getCapabilities()
    brightnessSupported.value = capabilities.brightness.supported
  } catch { brightnessSupported.value = false }
  if (location.protocol !== 'file:') {
    try { await gateway.connect(onGatewayEvent) }
    catch { dispatch({ type: 'DISCONNECTED' }) }
  }
  if (import.meta.env.DEV) {
    ;(window as typeof window & { __lappyTestSubmit?: (text: string) => Promise<void> }).__lappyTestSubmit = async (text) => {
      dispatch({ type: 'START_LISTENING' })
      await submitTranscript(text)
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', showCursor)
  navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  window.clearTimeout(maximumTimer.value)
  window.clearTimeout(finishTimer.value)
  window.clearTimeout(cursorTimer.value)
  window.clearInterval(clockTimer)
  window.clearInterval(temperatureTimer)
  window.clearInterval(silenceTimer)
  recognitionSession.value?.cancel()
  meter.stop()
  camera.stop()
  tts.cancel()
  wakeWord.stop()
  gateway.disconnect()
  if (import.meta.env.DEV) {
    delete (window as typeof window & { __lappyTestSubmit?: (text: string) => Promise<void> }).__lappyTestSubmit
  }
})
</script>

<template>
  <main class="terminal" :class="[{ 'terminal--cursor-hidden': cursorHidden, 'terminal--reduced': reducedMotion }, `state-${state.state}`]">
    <p v-if="temperatureLabel" class="temperature" :class="{ 'temperature--hot': cpuTooHot }" aria-live="polite">{{ temperatureLabel }}</p>
    <time class="clock">{{ clock }}</time>

    <section class="presence" aria-label="Lappy presence">
      <div class="avatar-stage">
        <HaloRing :level="meter.level.value" :active="state.state === 'listening'" :reduced-motion="reducedMotion" />
        <div
          class="avatar"
          :class="{ 'avatar--speaking': state.state === 'speaking' }"
          :style="{ '--speech-level': speechLevel }"
          role="button"
          tabindex="0"
          :aria-label="`Change Lappy's hat; currently ${HATS[hatIndex].label}`"
          @click="cycleHat"
          @keydown.enter.prevent="cycleHat"
          @keydown.space.prevent="cycleHat"
        >
          <BloubBot
            :key="reducedMotion ? 'reduced' : 'animated'"
            v-model:state="bloubState"
            :size="420"
            shape="cercle"
            :expression="bloubExpression"
            color-hex="#0A5CFF"
            paper="#050505"
            eye-color="#F2F1ED"
            :follow="state.state === 'idle' && !reducedMotion"
            :frozen-at="reducedMotion ? 1.1 : undefined"
          >
            <template #hat="{ bodyPath, bodyAlpha }">
              <HatOverlay :hat="HATS[hatIndex].id" :body-path="bodyPath" :body-alpha="bodyAlpha" />
            </template>
          </BloubBot>
        </div>
      </div>
    </section>

    <section class="activity" aria-live="polite">
      <div class="activity__copy">
        <p class="wordmark">L A P P Y</p>
        <h1>{{ view.title }}</h1>
        <p ref="caption" class="caption" :class="{ 'caption--following': state.state === 'speaking' }">{{ view.caption }}</p>
        <p class="detail"><span v-if="state.state === 'listening' || state.state === 'speaking'" class="pulse-dot" />{{ view.detail }}</p>
      </div>

      <div class="controls-wrap">
        <div class="controls">
          <button
            class="control control--microphone"
            :class="{ 'control--active': state.state === 'listening' }"
            :aria-label="state.state === 'listening' ? 'Stop listening; hold to mute' : 'Tap to talk; hold to mute microphone'"
            @pointerdown="beginMicrophoneHold"
            @pointerup="endMicrophoneHold"
            @pointercancel="endMicrophoneHold"
            @pointerleave="endMicrophoneHold"
            @click="onMicrophoneTap"
            @contextmenu.prevent
          >
            <MicrophoneSlash v-if="state.microphoneMuted" :size="26" />
            <Microphone v-else :size="26" :weight="state.state === 'listening' ? 'fill' : 'regular'" />
          </button>
          <button class="control" :aria-label="state.speakerMuted ? 'Unmute speaker' : 'Mute speaker'" @click="toggleSpeaker">
            <SpeakerSlash v-if="state.speakerMuted" :size="25" />
            <SpeakerHigh v-else :size="25" />
          </button>
          <button class="control" aria-label="Open settings" @click="settingsOpen = true"><Gear :size="25" /></button>
          <button class="control" :class="{ 'control--camera-active': state.cameraActive }" aria-label="Open camera" @click="openCamera()"><Camera :size="25" /></button>
        </div>
        <p class="privacy"><span v-if="state.cameraActive" class="privacy-dot" />{{ privacyText }}</p>
      </div>
    </section>

    <nav v-if="showDevSwitcher" class="dev-switcher" aria-label="Development state previews">
      <button v-for="item in previewStates" :key="item.label" @click="preview(item)">{{ item.label }}</button>
    </nav>

    <CameraOverlay v-if="cameraOpen" :provider="camera" @close="closeCamera" @captured="captureCamera" />
    <SettingsDrawer
      v-if="settingsOpen"
      :settings="settings"
      :microphones="microphones"
      :speakers="speakers"
      :brightness-supported="brightnessSupported"
      :wake-provider-status="wakeProviderStatus"
      :testing-connection="testingConnection"
      :connection-result="connectionResult"
      :microphone-level="meter.level.value"
      :microphone-testing="microphoneTesting"
      @close="settingsOpen = false"
      @save="saveSettings"
      @test-connection="testConnection"
      @reconnect="reconnect"
      @speaker-test="speakerTest"
      @microphone-test="microphoneTest"
      @camera-preview="settingsCameraPreview"
      @restart="restartApplication"
      @exit-kiosk="exitConfirmation = true"
    />
    <div v-if="exitConfirmation" class="confirm-scrim" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <div class="confirm-panel">
        <p class="wordmark">L A P P Y</p>
        <h2 id="exit-title">Exit kiosk mode?</h2>
        <p>The normal Raspberry Pi desktop will return. Lappy’s local service will keep running.</p>
        <div>
          <button @click="exitConfirmation = false">Cancel</button>
          <button class="confirm-exit" @click="exitKiosk">Exit kiosk</button>
        </div>
      </div>
    </div>
  </main>
</template>
