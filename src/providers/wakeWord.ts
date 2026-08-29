import type { WakeWordProvider } from './contracts'

/**
 * Honest fallback until a compatible on-device "Hey Lappy" model is installed.
 * It never opens the microphone and never claims detection succeeded.
 */
export class UnavailableWakeWordProvider implements WakeWordProvider {
  readonly id = 'unavailable'
  readonly status = 'needs-model' as const
  async start() { /* tap-to-talk remains available */ }
  stop() { /* no resources */ }
  setSensitivity(_value: number) { /* no model to configure */ }
}

export function downsampleTo16Khz(input: Float32Array, sourceRate: number): Int16Array {
  if (!Number.isFinite(sourceRate) || sourceRate < 16000) throw new Error('Unsupported microphone sample rate.')
  const ratio = sourceRate / 16000
  const output = new Int16Array(Math.floor(input.length / ratio))
  for (let index = 0; index < output.length; index++) {
    const start = Math.floor(index * ratio)
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)))
    let sum = 0
    for (let source = start; source < end; source++) sum += input[source] ?? 0
    const sample = Math.max(-1, Math.min(1, sum / (end - start)))
    output[index] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767)
  }
  return output
}

/** Local streaming wake listener. Audio frames stay on the Pi. */
export class LocalWakeWordProvider implements WakeWordProvider {
  readonly id = 'local'
  readonly status = 'ready' as const
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private generation = 0
  private sensitivity = 0.5
  private onDetected: (() => void) | null = null
  private controller: AbortController | null = null
  private pcm: Int16Array[] = []
  private pcmLength = 0
  private sendQueue: Promise<void> = Promise.resolve()

  async start(onDetected: () => void) {
    this.stop()
    const generation = this.generation
    this.onDetected = onDetected
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
    await fetch('/api/wake/reset', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sensitivity: this.sensitivity })
    }).catch(() => undefined)
    if (generation !== this.generation || !this.stream) return
    const context = new AudioContext({ latencyHint: 'interactive' })
    const source = context.createMediaStreamSource(this.stream)
    const processor = context.createScriptProcessor(4096, 1, 1)
    const sink = context.createGain()
    sink.gain.value = 0
    processor.onaudioprocess = (event) => {
      if (generation !== this.generation) return
      this.queuePcm(downsampleTo16Khz(event.inputBuffer.getChannelData(0), context.sampleRate), generation)
    }
    source.connect(processor)
    processor.connect(sink).connect(context.destination)
    this.context = context
    this.source = source
    this.processor = processor
    this.sink = sink
    if (context.state === 'suspended') await context.resume()
  }

  stop() {
    this.generation += 1
    this.controller?.abort()
    this.controller = null
    if (this.processor) this.processor.onaudioprocess = null
    this.source?.disconnect()
    this.processor?.disconnect()
    this.sink?.disconnect()
    this.source = null
    this.processor = null
    this.sink = null
    void this.context?.close()
    this.context = null
    this.pcm = []
    this.pcmLength = 0
    this.sendQueue = Promise.resolve()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.onDetected = null
  }

  setSensitivity(value: number) { this.sensitivity = Math.max(0, Math.min(1, value)) }

  private queuePcm(frame: Int16Array, generation: number) {
    this.pcm.push(frame)
    this.pcmLength += frame.length
    if (this.pcmLength < 6400) return
    const combined = new Int16Array(this.pcmLength)
    let offset = 0
    for (const part of this.pcm) { combined.set(part, offset); offset += part.length }
    this.pcm = []
    this.pcmLength = 0
    this.sendQueue = this.sendQueue.then(() => this.sendFrame(combined, generation))
  }

  private async sendFrame(frame: Int16Array, generation: number) {
    if (generation !== this.generation) return
    const controller = new AbortController()
    this.controller = controller
    const timeout = window.setTimeout(() => controller.abort(), 2000)
    try {
      const bytes = new Uint8Array(frame.byteLength)
      bytes.set(new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength))
      const response = await fetch('/api/wake/frame', {
        method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes, signal: controller.signal
      })
      if (!response.ok || generation !== this.generation) return
      const result = await response.json() as { detected?: boolean }
      if (result.detected) {
        const detected = this.onDetected
        this.stop()
        detected?.()
      }
    } catch { /* transient local startup failures are retried by the next frame */ }
    finally {
      window.clearTimeout(timeout)
      if (this.controller === controller) this.controller = null
    }
  }
}
