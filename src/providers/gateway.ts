import type { ChatRequest, GatewayEvent } from '@/types'
import type { GatewayProvider } from './contracts'

export class LocalGatewayProvider implements GatewayProvider {
  private socket: WebSocket | null = null
  private onEvent: ((event: GatewayEvent) => void) | null = null
  private retryTimer = 0
  private retryAttempt = 0
  private manualClose = false

  private socketUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}/events`
  }

  private openSocket(onEvent: (event: GatewayEvent) => void, initial: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.socketUrl())
      this.socket = socket
      const timeout = window.setTimeout(() => {
        socket.close()
        if (initial) reject(new Error('Local service connection timed out.'))
        else resolve()
      }, 5000)
      socket.onopen = () => {
        window.clearTimeout(timeout)
        this.retryAttempt = 0
        resolve()
      }
      socket.onmessage = (message) => {
        try { onEvent(JSON.parse(String(message.data)) as GatewayEvent) }
        catch { onEvent({ type: 'error', message: 'The local service sent an invalid event.' }) }
      }
      socket.onclose = () => {
        window.clearTimeout(timeout)
        onEvent({ type: 'connection', connected: false })
        if (!this.manualClose) this.scheduleReconnect()
        if (!initial) resolve()
      }
      socket.onerror = () => {
        window.clearTimeout(timeout)
        if (initial) reject(new Error('Cannot reach the local Lappy service.'))
      }
    })
  }

  private scheduleReconnect() {
    window.clearTimeout(this.retryTimer)
    const base = Math.min(30_000, 1000 * 2 ** Math.min(this.retryAttempt, 5))
    const delay = Math.round(base * (0.85 + Math.random() * 0.3))
    this.retryAttempt += 1
    this.retryTimer = window.setTimeout(() => {
      if (!this.onEvent || this.manualClose) return
      void this.openSocket(this.onEvent, false).catch(() => { /* close schedules the next bounded retry */ })
    }, delay)
  }

  async connect(onEvent: (event: GatewayEvent) => void) {
    this.onEvent = onEvent
    this.manualClose = false
    window.clearTimeout(this.retryTimer)
    await this.openSocket(onEvent, true)
  }

  async send(request: ChatRequest) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Lappy is reconnecting.')
    this.socket.send(JSON.stringify({ type: 'chat', request }))
  }

  async cancel() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'cancel' }))
  }

  async testConnection() {
    const response = await fetch('/api/connection/test', { method: 'POST' })
    return response.json() as Promise<{ ok: boolean; message: string }>
  }

  disconnect() {
    this.manualClose = true
    window.clearTimeout(this.retryTimer)
    if (this.socket) {
      this.socket.onclose = null
      this.socket.close()
    }
    this.socket = null
  }
}
