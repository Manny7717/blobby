import { z } from 'zod'

const optionalHttpUrl = z.string().trim().refine((value) => {
  if (!value) return true
  try { const parsed = new URL(value); return parsed.protocol === 'http:' || parsed.protocol === 'https:' }
  catch { return false }
}, 'Must be an HTTP or HTTPS URL.')

export const settingsSchema = z.object({
  masterVolume: z.number().min(0).max(1),
  brightness: z.number().min(0.1).max(1),
  microphoneDeviceId: z.string().max(300),
  speakerDeviceId: z.string().max(300),
  wakeWordEnabled: z.boolean(),
  wakeWordSensitivity: z.number().min(0).max(1),
  activationSound: z.boolean(),
  silenceTimeoutMs: z.number().int().min(1000).max(15000),
  maximumRecordingMs: z.number().int().min(10000).max(120000),
  cameraEnabled: z.boolean(),
  reducedMotion: z.boolean(),
  gatewayUrl: optionalHttpUrl
})

export type TerminalSettings = z.infer<typeof settingsSchema>

export const defaultSettings: TerminalSettings = {
  masterVolume: 1,
  brightness: 1,
  microphoneDeviceId: '',
  speakerDeviceId: '',
  wakeWordEnabled: process.env.WAKE_WORD_ENABLED === 'true',
  wakeWordSensitivity: 0.5,
  activationSound: true,
  silenceTimeoutMs: 2500,
  maximumRecordingMs: 45000,
  cameraEnabled: process.env.CAMERA_ENABLED === 'true',
  reducedMotion: false,
  gatewayUrl: process.env.HERMES_GATEWAY_URL ?? ''
}

export const chatMessageSchema = z.object({
  type: z.literal('chat'),
  request: z.object({
    text: z.string().trim().min(1).max(20_000),
    sessionId: z.string().max(200).optional(),
    imageDataUrl: z.string().max(7_000_000).regex(/^data:image\/(jpeg|png|webp);base64,/).optional()
  })
})

export const cancelMessageSchema = z.object({ type: z.literal('cancel') })
