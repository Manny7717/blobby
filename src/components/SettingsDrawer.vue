<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  PhArrowClockwise as ArrowClockwise,
  PhCheckCircle as CheckCircle,
  PhSpeakerHigh as SpeakerHigh,
  PhX as X
} from '@phosphor-icons/vue'
import type { TerminalSettings } from '@/types'

const props = defineProps<{
  settings: TerminalSettings
  microphones: MediaDeviceInfo[]
  speakers: MediaDeviceInfo[]
  brightnessSupported: boolean
  wakeProviderStatus: 'ready' | 'unavailable' | 'needs-model'
  testingConnection: boolean
  connectionResult: string
  microphoneLevel: number
  microphoneTesting: boolean
}>()
const emit = defineEmits<{
  close: []
  save: [settings: TerminalSettings]
  testConnection: []
  reconnect: []
  speakerTest: []
  microphoneTest: []
  cameraPreview: []
  restart: []
  exitKiosk: []
}>()

const draft = ref<TerminalSettings>({ ...props.settings })
watch(() => props.settings, (settings) => { draft.value = { ...settings } }, { deep: true })
const wakeHelp = computed(() => props.wakeProviderStatus === 'needs-model'
  ? 'No compatible “Hey Blobby” model is installed. Tap-to-talk remains available.'
  : '')

function save() { emit('save', { ...draft.value }) }
</script>

<template>
  <div class="drawer-scrim" @click.self="emit('close')">
    <aside class="drawer" aria-label="Blobby settings">
      <header>
        <div><p>B L O B B Y</p><h2>Settings</h2></div>
        <button class="round" aria-label="Close settings" @click="emit('close')"><X :size="24" /></button>
      </header>

      <div class="drawer__body">
        <section>
          <h3>Sound</h3>
          <label>Master volume <output>{{ Math.round(draft.masterVolume * 100) }}%</output>
            <input v-model.number="draft.masterVolume" type="range" min="0" max="1" step="0.01" />
          </label>
          <label>Microphone input
            <select v-model="draft.microphoneDeviceId">
              <option value="">System default</option>
              <option v-for="(device, index) in microphones" :key="device.deviceId" :value="device.deviceId">{{ device.label || `Microphone ${index + 1}` }}</option>
            </select>
          </label>
          <label>Speaker output
            <select v-model="draft.speakerDeviceId">
              <option value="">System default</option>
              <option v-for="(device, index) in speakers" :key="device.deviceId" :value="device.deviceId">{{ device.label || `Speaker ${index + 1}` }}</option>
            </select>
          </label>
          <div class="action-row">
            <button class="action" @click="emit('speakerTest')"><SpeakerHigh :size="20" /> Speaker test</button>
            <button class="action" :disabled="microphoneTesting" @click="emit('microphoneTest')">{{ microphoneTesting ? 'Listening…' : 'Microphone test' }}</button>
          </div>
          <meter v-if="microphoneTesting" min="0" max="1" :value="microphoneLevel" aria-label="Microphone level" />
        </section>

        <section>
          <h3>Wake & recording</h3>
          <label class="toggle-row">Wake word enabled <input v-model="draft.wakeWordEnabled" type="checkbox" :disabled="wakeProviderStatus !== 'ready'" /></label>
          <p v-if="wakeHelp" class="help">{{ wakeHelp }}</p>
          <label>Wake-word sensitivity <output>{{ draft.wakeWordSensitivity.toFixed(2) }}</output>
            <input v-model.number="draft.wakeWordSensitivity" type="range" min="0" max="1" step="0.05" :disabled="wakeProviderStatus !== 'ready'" />
          </label>
          <label class="toggle-row">Activation sound <input v-model="draft.activationSound" type="checkbox" /></label>
          <label>Silence timeout <output>{{ draft.silenceTimeoutMs / 1000 }}s</output>
            <input v-model.number="draft.silenceTimeoutMs" type="range" min="1000" max="8000" step="500" />
          </label>
          <label>Maximum recording <output>{{ draft.maximumRecordingMs / 1000 }}s</output>
            <input v-model.number="draft.maximumRecordingMs" type="range" min="10000" max="120000" step="5000" />
          </label>
        </section>

        <section>
          <h3>Display & privacy</h3>
          <label>Screen brightness <output>{{ Math.round(draft.brightness * 100) }}%</output>
            <input v-model.number="draft.brightness" type="range" min="0.1" max="1" step="0.01" :disabled="!brightnessSupported" />
          </label>
          <p v-if="!brightnessSupported" class="help">This display exposes no system backlight control.</p>
          <label class="toggle-row">Camera enabled <input v-model="draft.cameraEnabled" type="checkbox" /></label>
          <button class="action" :disabled="!draft.cameraEnabled" @click="emit('cameraPreview')">Preview camera</button>
          <label class="toggle-row">Reduced motion <input v-model="draft.reducedMotion" type="checkbox" /></label>
        </section>

        <section>
          <h3>Connection</h3>
          <label>Blobby gateway URL · local config <input v-model.trim="draft.gatewayUrl" inputmode="url" placeholder="Configured in .env" readonly /></label>
          <div class="action-row">
            <button class="action" :disabled="testingConnection" @click="emit('testConnection')"><CheckCircle :size="20" /> Test connection</button>
            <button class="action" @click="emit('reconnect')"><ArrowClockwise :size="20" /> Reconnect</button>
          </div>
          <p v-if="connectionResult" class="result" aria-live="polite">{{ connectionResult }}</p>
        </section>

        <section>
          <h3>Application</h3>
          <button class="action" @click="emit('restart')"><ArrowClockwise :size="20" /> Restart application</button>
          <button class="action action--danger" @click="emit('exitKiosk')">Exit kiosk…</button>
          <p class="help">Exiting requires a second confirmation. SSH and console recovery remain available.</p>
        </section>
      </div>

      <footer><button class="save" @click="save">Save settings</button></footer>
    </aside>
  </div>
</template>

<style scoped>
.drawer-scrim { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.52); }
.drawer { position: absolute; inset: 0 0 0 auto; width: min(460px, 92vw); display: grid; grid-template-rows: auto 1fr auto; background: #080808; border-left: 1px solid #242424; box-shadow: -20px 0 60px rgba(0,0,0,.42); }
header { display: flex; align-items: center; justify-content: space-between; padding: 22px 24px 15px; border-bottom: 1px solid #242424; }
header p { margin: 0 0 6px; color: #0a5cff; font-size: 10px; font-weight: 650; letter-spacing: .32em; }
header h2 { margin: 0; color: #f2f1ed; font-size: 26px; font-weight: 420; }
.drawer__body { overflow: auto; padding: 6px 24px 28px; overscroll-behavior: contain; }
section { padding: 20px 0; border-bottom: 1px solid #242424; }
section:last-child { border: 0; }
h3 { margin: 0 0 16px; color: #8e8e93; font-size: 11px; font-weight: 620; letter-spacing: .14em; text-transform: uppercase; }
label { display: block; margin: 14px 0; color: #f2f1ed; font-size: 14px; }
output { float: right; color: #8e8e93; font-variant-numeric: tabular-nums; }
input[type='range'] { width: 100%; height: 36px; margin-top: 7px; appearance: none; background: transparent; }
input[type='range']::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: #242424; }
input[type='range']::-webkit-slider-thumb { width: 19px; height: 19px; margin-top: -8px; appearance: none; border: 0; border-radius: 50%; background: #0a5cff; }
input[type='range']::-moz-range-track { height: 3px; border-radius: 2px; background: #242424; }
input[type='range']::-moz-range-thumb { width: 19px; height: 19px; border: 0; border-radius: 50%; background: #0a5cff; }
input:not([type='range']):not([type='checkbox']), select { width: 100%; min-height: 56px; margin-top: 9px; padding: 0 13px; border: 1px solid #242424; border-radius: 8px; color: #f2f1ed; background: #111; font: inherit; }
.toggle-row { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
input[type='checkbox'] { width: 26px; height: 26px; accent-color: #0a5cff; }
.help, .result { margin: 8px 0; color: #8e8e93; font-size: 12px; line-height: 1.45; }
meter { width: 100%; height: 8px; margin-top: 14px; accent-color: #0a5cff; }
.action-row { display: flex; flex-wrap: wrap; gap: 10px; }
.action, .round { min-height: 56px; display: inline-flex; align-items: center; justify-content: center; gap: 9px; border: 1px solid #242424; border-radius: 28px; color: #f2f1ed; background: transparent; font: inherit; }
.action { padding: 0 17px; }
.action--danger { margin-left: 8px; color: #d6a3a3; }
.round { width: 56px; }
footer { padding: 16px 24px 22px; border-top: 1px solid #242424; }
.save { width: 100%; min-height: 56px; border: 0; border-radius: 28px; color: #fff; background: #0a5cff; font: inherit; font-weight: 600; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #0a5cff; outline-offset: 3px; }
@media (prefers-reduced-motion: no-preference) { .drawer { animation: enter .24s ease-out; } @keyframes enter { from { transform: translateX(24px); opacity: .7; } } }
</style>
