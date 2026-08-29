import type { SpeechRecognitionSession, SpeechToTextProvider, TextToSpeechProvider } from './contracts'

interface RecognitionAlternative { transcript: string }
interface RecognitionResult { isFinal: boolean; 0: RecognitionAlternative; length: number }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface RecognitionErrorEvent { error: string }
interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => RecognitionLike

function recognitionConstructor(): RecognitionConstructor | undefined {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition
}

export class BrowserSpeechToText implements SpeechToTextProvider {
  readonly id = 'browser'
  readonly supportsPartials = true

  isAvailable() { return Boolean(recognitionConstructor()) }

  async listen(options: {
    deviceId?: string
    onPartial(text: string): void
    onFinal(text: string): void
    onError(message: string): void
  }): Promise<SpeechRecognitionSession> {
    const Recognition = recognitionConstructor()
    if (!Recognition) throw new Error('Speech recognition is not available in this Chromium build.')
    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    let finalText = ''
    let completed = false
    // The Web Speech API has no input-device selector. The separately opened
    // meter stream verifies and monitors the user's selected device.
    void options.deviceId
    recognition.onresult = (event) => {
      if (completed) return
      let partial = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        const text = result?.[0]?.transcript ?? ''
        if (result?.isFinal) finalText += text
        else partial += text
      }
      if (partial) options.onPartial(`${finalText}${partial}`.trim())
      if (finalText) {
        completed = true
        options.onFinal(finalText.trim())
      }
    }
    recognition.onerror = (event) => {
      if (completed) return
      completed = true
      options.onError(`Speech recognition: ${event.error}`)
    }
    recognition.onend = () => {
      if (completed) return
      completed = true
      options.onError('Speech recognition ended before a transcription was available.')
    }
    recognition.start()
    return {
      stop: () => { completed = true; recognition.stop() },
      cancel: () => { completed = true; recognition.abort() }
    }
  }
}

export class BrowserTextToSpeech implements TextToSpeechProvider {
  readonly id = 'browser'
  isAvailable() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window }
  speak(text: string, options: { volume: number; outputDeviceId?: string; onStart(): void; onEnd(): void; onError(message: string): void; onAmplitude?(level: number): void }) {
    this.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.volume = Math.max(0, Math.min(1, options.volume))
    utterance.rate = 0.98
    utterance.onstart = options.onStart
    utterance.onend = () => { options.onAmplitude?.(0); options.onEnd() }
    utterance.onerror = (event) => { options.onAmplitude?.(0); options.onError(`Speech playback: ${event.error}`) }
    window.speechSynthesis.speak(utterance)
  }
  cancel() { window.speechSynthesis?.cancel() }
}
