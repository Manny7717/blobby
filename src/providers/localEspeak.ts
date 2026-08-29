import { BrowserTextToSpeech } from './browserSpeech'
import type { TextToSpeechProvider } from './contracts'
import espeakWasmUrl from 'espeak-ng/dist/espeak-ng.wasm?url'

type SpeakOptions = Parameters<TextToSpeechProvider['speak']>[1]

function chunkName(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + 4))
}

/** Returns a normalized 16-bit PCM RMS envelope for the requested WAV time. */
export function pcmAmplitudeAt(bytes: Uint8Array, timeSeconds: number): number {
  if (bytes.byteLength < 44 || chunkName(bytes, 0) !== 'RIFF' || chunkName(bytes, 8) !== 'WAVE') return 0
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = 0
  let dataLength = 0
  while (offset + 8 <= bytes.byteLength) {
    const name = chunkName(bytes, offset)
    const length = view.getUint32(offset + 4, true)
    const content = offset + 8
    if (content + length > bytes.byteLength) break
    if (name === 'fmt ' && length >= 16) {
      channels = view.getUint16(content + 2, true)
      sampleRate = view.getUint32(content + 4, true)
      bitsPerSample = view.getUint16(content + 14, true)
    } else if (name === 'data') {
      dataOffset = content
      dataLength = length
      break
    }
    offset = content + length + (length % 2)
  }
  if (!dataOffset || channels < 1 || sampleRate < 1 || bitsPerSample !== 16) return 0
  const bytesPerFrame = channels * 2
  const firstFrame = Math.max(0, Math.floor(timeSeconds * sampleRate))
  const availableFrames = Math.floor(dataLength / bytesPerFrame)
  if (firstFrame >= availableFrames) return 0
  const frameCount = Math.min(Math.ceil(sampleRate / 30), availableFrames - firstFrame)
  let sumSquares = 0
  let count = 0
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sampleOffset = dataOffset + (firstFrame + frame) * bytesPerFrame + channel * 2
      const sample = view.getInt16(sampleOffset, true) / 32768
      sumSquares += sample * sample
      count += 1
    }
  }
  return count ? Math.min(1, Math.sqrt(sumSquares / count) * 3.2) : 0
}

/** Lazy-loaded, fully local TTS. The 18 MB WASM payload is fetched only on first speech. */
export class LocalEspeakTextToSpeech implements TextToSpeechProvider {
  readonly id = 'local-espeak'
  private generation = 0
  private audio: HTMLAudioElement | null = null
  private objectUrl = ''
  private amplitudeFrame = 0
  private resetAmplitude: (() => void) | null = null
  private readonly browserFallback = new BrowserTextToSpeech()

  isAvailable() { return typeof WebAssembly !== 'undefined' && typeof Audio !== 'undefined' }

  speak(text: string, options: SpeakOptions) {
    this.cancel()
    const generation = this.generation
    void this.synthesize(text, options, generation)
  }

  private async synthesize(text: string, options: SpeakOptions, generation: number) {
    try {
      const { default: createESpeak } = await import('espeak-ng')
      const module = await createESpeak({
        arguments: ['-v', 'en-us', '-s', '168', '-p', '42', '-a', '125', '-w', 'speech.wav', text],
        locateFile: (path) => path.endsWith('.wasm') ? espeakWasmUrl : path
      })
      if (generation !== this.generation) return
      const wav = module.FS.readFile('speech.wav')
      const bytes = new Uint8Array(wav.byteLength)
      bytes.set(wav)
      this.objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
      const audio = new Audio(this.objectUrl)
      this.audio = audio
      audio.volume = Math.max(0, Math.min(1, options.volume))
      const sinkAudio = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
      if (options.outputDeviceId && sinkAudio.setSinkId) await sinkAudio.setSinkId(options.outputDeviceId)
      if (generation !== this.generation) return
      audio.onplay = () => {
        options.onStart()
        this.startAmplitude(bytes, audio, options.onAmplitude)
      }
      audio.onended = () => { this.releaseAudio(); options.onEnd() }
      audio.onerror = () => { this.releaseAudio(); options.onError('Local speech playback failed.') }
      await audio.play()
    } catch (reason) {
      if (generation !== this.generation) return
      this.releaseAudio()
      if (this.browserFallback.isAvailable()) this.browserFallback.speak(text, options)
      else options.onError(reason instanceof Error ? reason.message : 'Local speech synthesis failed.')
    }
  }

  cancel() {
    this.generation += 1
    this.audio?.pause()
    this.audio = null
    this.stopAmplitude()
    this.releaseObjectUrl()
    this.browserFallback.cancel()
  }

  private releaseAudio() {
    this.audio = null
    this.stopAmplitude()
    this.releaseObjectUrl()
  }

  private startAmplitude(bytes: Uint8Array, audio: HTMLAudioElement, onAmplitude?: (level: number) => void) {
    this.stopAmplitude()
    if (!onAmplitude) return
    this.resetAmplitude = () => onAmplitude(0)
    let lastUpdate = 0
    const update = (time: number) => {
      if (this.audio !== audio) return
      this.amplitudeFrame = requestAnimationFrame(update)
      if (time - lastUpdate < 33) return
      lastUpdate = time
      onAmplitude(pcmAmplitudeAt(bytes, audio.currentTime))
    }
    this.amplitudeFrame = requestAnimationFrame(update)
  }

  private stopAmplitude() {
    cancelAnimationFrame(this.amplitudeFrame)
    this.amplitudeFrame = 0
    this.resetAmplitude?.()
    this.resetAmplitude = null
  }

  private releaseObjectUrl() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = ''
  }
}
