export type ToolKind = 'browser' | 'calendar' | 'files' | 'terminal' | 'camera' | 'other'
export interface ToolActivity { kind: ToolKind; label: string; action: string }
export type GatewayEvent =
  | { type: 'connection'; connected: boolean }
  | { type: 'response-start' }
  | { type: 'response-delta'; text: string }
  | { type: 'response-complete'; text: string }
  | { type: 'tool-start' | 'tool-progress' | 'tool-finish'; tool: ToolActivity }
  | { type: 'approval-required'; summary: string }
  | { type: 'error'; message: string }
export interface ChatRequest { text: string; sessionId?: string; imageDataUrl?: string }

export interface HermesAdapter {
  readonly id: string
  chat(request: ChatRequest, emit: (event: GatewayEvent) => void): Promise<void>
  cancel(): void
  testConnection(): Promise<{ ok: boolean; message: string }>
}
