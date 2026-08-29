import { GoogleGenAI } from '@google/genai'

const model = process.env.GEMINI_TRANSCRIBE_MODEL?.trim() || 'gemini-3.5-transcribe'

export function geminiTranscriptionAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

export async function transcribeWithGemini(
  audio: Buffer,
  mimeType: string,
  options: { signal?: AbortSignal } = {}
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('Gemini transcription is selected but GEMINI_API_KEY is not configured.')

  const client = new GoogleGenAI({ apiKey })
  const uploaded = await client.files.upload({
    file: new Blob([new Uint8Array(audio)], { type: mimeType }),
    config: { mimeType, displayName: 'lappy-utterance', abortSignal: options.signal }
  })

  try {
    if (!uploaded.uri) throw new Error('Gemini did not return an audio file URI.')
    const interaction = await client.interactions.create({
      model,
      input: [{ type: 'audio', uri: uploaded.uri, mime_type: uploaded.mimeType || mimeType }],
      generation_config: {
        transcription_config: {
          language_codes: ['en-US'],
          custom_vocabulary: ['Lappy', 'Hey Lappy'],
          mode: { type: 'smart' }
        }
      }
    }, { signal: options.signal, timeout_ms: 45_000 })
    return ('output_text' in interaction ? interaction.output_text : '')?.trim() || ''
  } finally {
    if (uploaded.name) await client.files.delete({ name: uploaded.name }).catch(() => undefined)
  }
}
