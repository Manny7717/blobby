import type { TextToSpeechProvider } from './contracts'

type SpeakOptions = Parameters<TextToSpeechProvider['speak']>[1]

/** Fish Audio playback. Synthesis is proxied locally so the API key never reaches Chromium. */
export class FishAudioTextToSpeech implements TextToSpeechProvider {
  readonly id = 'fish-audio'
  private generation = 0
  private controller: AbortController | null = null
  private audio: HTMLAudioElement | null = null
  private objectUrl = ''

  isAvailable() { return typeof fetch !== 'undefined' && typeof Audio !== 'undefined' }

  speak(text: string, options: SpeakOptions) {
    this.cancel()
    const generation = this.generation
    this.controller = new AbortController()
    void this.synthesize(text, options, generation, this.controller.signal)
  }

  private async synthesize(text: string, options: SpeakOptions, generation: number, signal: AbortSignal) {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Fish Audio request failed (${response.status}).`)
      }
      const body = await response.json() as { url?: string }
      if (!body.url) throw new Error('Fish Audio did not return a speech stream.')
      if (generation !== this.generation) return
      const audio = new Audio(body.url)
      this.audio = audio
      audio.volume = Math.max(0, Math.min(1, options.volume))
      const routedAudio = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
      if (options.outputDeviceId && routedAudio.setSinkId) await routedAudio.setSinkId(options.outputDeviceId)
      if (generation !== this.generation) return
      audio.onplay = options.onStart
      audio.ontimeupdate = () => {
        const estimatedDuration = Math.max(1, text.trim().split(/\s+/).length / 2.45)
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : estimatedDuration
        options.onProgress?.(Math.min(1, audio.currentTime / duration))
      }
      audio.onended = () => { options.onProgress?.(1); this.releaseAudio(); options.onAmplitude?.(0); options.onEnd() }
      audio.onerror = () => { this.releaseAudio(); options.onAmplitude?.(0); options.onError('Fish Audio playback failed.') }
      await audio.play()
    } catch (reason) {
      if (generation !== this.generation || signal.aborted) return
      this.releaseAudio()
      options.onError(reason instanceof Error ? reason.message : 'Fish Audio synthesis failed.')
    } finally {
      if (generation === this.generation) this.controller = null
    }
  }

  cancel() {
    this.generation += 1
    this.controller?.abort()
    this.controller = null
    this.audio?.pause()
    this.releaseAudio()
  }

  private releaseAudio() {
    this.audio = null
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = ''
  }
}
