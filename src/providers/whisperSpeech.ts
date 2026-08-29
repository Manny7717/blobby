import type { SpeechRecognitionSession, SpeechToTextProvider } from './contracts'

const RECORDING_MIME = typeof MediaRecorder !== 'undefined'
  ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
  : ''

/**
 * Recorded-audio STT for server-backed Whisper or Gemini. The selected backend
 * and all cloud credentials remain in the localhost service.
 * Batch-only: no partials; the UI's "transcribing" state covers the wait.
 */
export class LocalSpeechToText implements SpeechToTextProvider {
  readonly id: string
  readonly supportsPartials = false

  constructor(provider: 'whisper' | 'gemini' = 'whisper') { this.id = provider }

  isAvailable() {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia
      && typeof MediaRecorder !== 'undefined'
  }

  async listen(options: {
    deviceId?: string
    onPartial(text: string): void
    onFinal(text: string): void
    onError(message: string): void
  }): Promise<SpeechRecognitionSession> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    const recorder = new MediaRecorder(stream, RECORDING_MIME ? { mimeType: RECORDING_MIME } : undefined)
    const chunks: Blob[] = []
    let cancelled = false
    recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data) }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      if (cancelled) return
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      void this.transcribe(blob, options)
    }
    recorder.start()
    return {
      stop: () => { if (recorder.state === 'recording') recorder.stop() },
      cancel: () => {
        cancelled = true
        if (recorder.state === 'recording') recorder.stop()
        else stream.getTracks().forEach((track) => track.stop())
      }
    }
  }

  private async transcribe(blob: Blob, options: {
    onPartial(text: string): void
    onFinal(text: string): void
    onError(message: string): void
  }) {
    try {
      const response = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'content-type': blob.type },
        body: blob
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Speech recognition failed (${response.status}).`)
      }
      const result = await response.json() as { text?: string }
      options.onFinal((result.text ?? '').trim())
    } catch (reason) {
      options.onError(reason instanceof Error ? reason.message : 'Speech recognition failed.')
    }
  }
}
