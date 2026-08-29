import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAIHermesAdapter } from './openAIAdapter.js'
import type { GatewayEvent } from '../types.js'

const originalFetch = globalThis.fetch

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function adapter() {
  return new OpenAIHermesAdapter({
    baseUrl: 'http://gateway.invalid',
    path: '/v1/chat/completions',
    agentName: 'Blobby'
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('OpenAI Hermes streaming adapter', () => {
  it('streams text and accepts a fragmented terminal marker', async () => {
    globalThis.fetch = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"there"},"finish_reason":"stop"}]}\n\n',
      'data: [DO', 'NE]'
    ])) as typeof fetch
    const events: GatewayEvent[] = []
    await adapter().chat({ text: 'hello' }, (event) => events.push(event))
    expect(events).toContainEqual({ type: 'response-complete', text: 'Hello there' })
  })

  it('maps tool start, progress, and finish without exposing arguments', async () => {
    globalThis.fetch = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"browser_search"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"secret payload"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'
    ])) as typeof fetch
    const events: GatewayEvent[] = []
    await adapter().chat({ text: 'search' }, (event) => events.push(event))
    expect(events.filter((event) => event.type.startsWith('tool-')).map((event) => event.type)).toEqual([
      'tool-start', 'tool-progress', 'tool-finish'
    ])
    expect(JSON.stringify(events)).not.toContain('secret payload')
  })

  it('rejects a stream that closes without a terminal event', async () => {
    globalThis.fetch = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
    ])) as typeof fetch
    await expect(adapter().chat({ text: 'hello' }, () => undefined))
      .rejects.toThrow('Gateway response ended unexpectedly.')
  })

  it('aborts a response that stops producing data', async () => {
    globalThis.fetch = vi.fn(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true })
      }
    }), { status: 200 })) as typeof fetch
    const timed = new OpenAIHermesAdapter({
      baseUrl: 'http://gateway.invalid', path: '/v1/chat/completions', agentName: 'Blobby', responseTimeoutMs: 20
    })
    await expect(timed.chat({ text: 'hello' }, () => undefined)).rejects.toThrow('Gateway response timed out.')
  })
})
