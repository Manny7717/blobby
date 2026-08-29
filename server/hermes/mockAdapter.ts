import type { ChatRequest, GatewayEvent, HermesAdapter } from '../types.js'

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }, { once: true })
})

export class MockHermesAdapter implements HermesAdapter {
  readonly id = 'mock'
  private controller: AbortController | null = null

  async chat(request: ChatRequest, emit: (event: GatewayEvent) => void) {
    this.cancel()
    this.controller = new AbortController()
    const signal = this.controller.signal
    try {
      emit({ type: 'response-start' })
      await wait(420, signal)
      if (/schedule|calendar/i.test(request.text)) {
        const tool = { kind: 'calendar' as const, label: 'Calendar', action: 'reading' }
        emit({ type: 'tool-start', tool })
        await wait(720, signal)
        emit({ type: 'tool-finish', tool })
      } else if (/search|weather|news|look up/i.test(request.text)) {
        const tool = { kind: 'browser' as const, label: 'Browser', action: 'searching' }
        emit({ type: 'tool-start', tool })
        await wait(720, signal)
        emit({ type: 'tool-finish', tool })
      }
      const answer = request.imageDataUrl
        ? 'I received the captured frame. Connect the configured Lappy gateway to analyze it.'
        : `I heard “${request.text}”. The terminal is currently using its safe mock connection.`
      let complete = ''
      for (const token of answer.match(/\S+\s*/g) ?? []) {
        await wait(46, signal)
        complete += token
        emit({ type: 'response-delta', text: token })
      }
      emit({ type: 'response-complete', text: complete.trim() })
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) emit({ type: 'error', message: 'The mock response ended unexpectedly.' })
    } finally { this.controller = null }
  }

  cancel() { this.controller?.abort(); this.controller = null }
  async testConnection() { return { ok: true, message: 'Local mock connection is ready. Add the documented gateway URL and protocol to connect Lappy.' } }
}
