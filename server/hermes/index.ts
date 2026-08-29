import type { HermesAdapter } from '../types.js'
import { MockHermesAdapter } from './mockAdapter.js'
import { OpenAIHermesAdapter } from './openAIAdapter.js'

export function createHermesAdapter(): HermesAdapter {
  const mode = process.env.HERMES_ADAPTER ?? (process.env.HERMES_GATEWAY_URL ? 'openai' : 'mock')
  if (mode !== 'openai') return new MockHermesAdapter()
  const configuredTimeout = Number.parseInt(process.env.HERMES_RESPONSE_TIMEOUT_MS ?? '', 10)
  const responseTimeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(5000, Math.min(600_000, configuredTimeout))
    : 90_000
  return new OpenAIHermesAdapter({
    baseUrl: process.env.HERMES_GATEWAY_URL ?? '',
    path: process.env.HERMES_CHAT_COMPLETIONS_PATH ?? '',
    healthPath: process.env.HERMES_HEALTH_PATH,
    apiKey: process.env.HERMES_API_KEY,
    agentName: process.env.HERMES_AGENT_NAME ?? 'Blobby',
    sessionId: process.env.HERMES_SESSION_ID,
    responseTimeoutMs
  })
}
