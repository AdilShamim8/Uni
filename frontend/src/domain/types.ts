/** Core domain types for the Universe chat frontend. */

export type ToolId = 'search' | 'research' | 'images' | 'voice' | 'canvas'

export type Capability =
  | 'chat'
  | 'search'
  | 'research'
  | 'images'
  | 'voice'
  | 'canvas'
  | 'data-analysis'
  | 'code'

export interface AttachmentMeta {
  id: string
  name: string
  size: number
  kind: 'image' | 'file'
  mediaType: string
}

export interface SourceRef {
  id: string
  title: string
  url: string
  snippet: string
  /** Fixture sources are example records, clearly labeled in the UI. */
  example: boolean
}

export type MessageRole = 'user' | 'assistant'

export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error'

export interface MessageNode {
  id: string
  parentId: string | null
  role: MessageRole
  content: string
  createdAt: number
  status: MessageStatus
  error?: string
  /** Concise task-status line, e.g. "Searched the web (simulated)". */
  statusPrefix?: string
  tools?: ToolId[]
  attachments?: AttachmentMeta[]
  sources?: SourceRef[]
  feedback?: 'up' | 'down' | null
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  archived: boolean
  /** In-memory only; never persisted. */
  temporary: boolean
  /** Saved agent whose instructions scope this conversation. */
  agentId?: string | null
  nodes: Record<string, MessageNode>
  activeLeafId: string | null
}

export type ProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai-compatible'
  | 'local'

export interface ModelInfo {
  id: string
  label: string
  /** Demo models are explicitly labeled as configuration examples. */
  demo: boolean
  capabilities: Capability[]
}

export interface ProviderProfile {
  id: string
  label: string
  kind: ProviderKind
  endpointUrl: string
  models: ModelInfo[]
  demo: boolean
}

export type Density = 'comfortable' | 'compact'
export type TextSize = 's' | 'm' | 'l'
export type SendKeyMode = 'enter' | 'ctrl-enter'

export interface Preferences {
  density: Density
  textSize: TextSize
  sendKey: SendKeyMode
  nickname: string
  traits: string
  assistantPresetId: string | null
  sidebarCollapsed: boolean
  /** Opaque fallback for translucent materials (also respects the OS setting). */
  reducedTransparency: boolean
}

export interface PersistedState {
  version: 1
  savedAt: number
  conversations: Conversation[]
  preferences: Preferences
  providers: ProviderProfile[]
  activeProviderId: string | null
  activeModelId: string | null
}

/* ------------------------------------------------------------------ */
/* Provider credentials (stored separately from exported app data)     */
/* ------------------------------------------------------------------ */

export type ConnectionStatus = 'untested' | 'connected' | 'error'

export interface ProviderCredential {
  providerId: string
  apiKey: string
  status: ConnectionStatus
  lastCheckedAt: number | null
  lastError: string | null
  /** Model ids discovered from the endpoint's model list, if any. */
  discoveredModels: string[]
}

export type PreviewKind =
  | 'research'
  | 'images'
  | 'voice'
  | 'canvas'
  | 'data'
  | 'presets'
  | 'tasks'
  | 'connections'
  | 'coding'
  | 'projects'
  | 'work'
  | 'email'

export interface PreviewState {
  kind: PreviewKind
  /** Optional prompt/brief carried from the composer. */
  brief?: string
}

export interface ToastState {
  id: string
  message: string
  actionLabel?: string
  onAction?: () => void
}
