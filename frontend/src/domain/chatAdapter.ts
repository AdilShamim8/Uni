import type { AttachmentMeta, SourceRef, ToolId } from './types'

/**
 * Vendor-neutral chat adapter contract.
 *
 * The UI never references a provider SDK or a vendor-specific response
 * shape — only this interface. The mock adapter implements it locally;
 * a future milestone can implement it against real endpoints without
 * touching any component.
 */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  prompt: string
  /** Prior turns on the active thread (before this prompt). */
  history: ChatTurn[]
  tools: ToolId[]
  attachments: AttachmentMeta[]
  nickname: string
  traits: string
}

/** Metadata delivered before the first streamed token. */
export interface AssistantDraft {
  sources?: SourceRef[]
  statusPrefix?: string
}

export interface ChatError {
  code: 'mock_error' | 'aborted'
  message: string
}

export interface ChatStreamHandlers {
  onStart: (draft: AssistantDraft) => void
  onDelta: (text: string) => void
  onDone: (reason: 'complete' | 'stopped') => void
  onError: (error: ChatError) => void
}

export interface ChatAdapter {
  id: string
  label: string
  stream(
    request: ChatRequest,
    handlers: ChatStreamHandlers,
    signal: AbortSignal,
  ): Promise<void>
}
