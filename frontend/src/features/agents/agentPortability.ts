import type { AgentProfile } from '@/domain/workspaceTypes'
import type { ToolId } from '@/domain/types'
import { downloadText } from '@/features/chat/exportUtils'
import { useAgentsStore } from '@/state/agentsStore'

/**
 * Portable agent profiles — export any agent as one shareable JSON
 * file, import it on any other Uni install in one tap.
 *
 * This is the marketplace pattern without a marketplace: files travel
 * anywhere (chat, email, a git repo, a gallery folder) and require no
 * account, no server, and no network. The format is deliberately
 * minimal and forward-compatible:
 *
 * - Persona only: name, description, instructions, category, tools,
 *   starters. Everything device-specific (ids, provider/model
 *   preferences, archive state) is intentionally excluded — provider
 *   ids are local uuids and would dangle on another install.
 * - A `format` marker lets future readers migrate old files.
 * - Import is defensive: unknown fields are ignored, required ones are
 *   validated and clamped, and the result always gets a fresh local id
 *   so an import can never collide with or overwrite an existing agent.
 */

const FORMAT = 'uni.agent/v1'

/** The subset of an AgentProfile that travels between installs. */
export interface PortableAgent {
  name: string
  description: string
  instructions: string
  category: 'personal' | 'specialist'
  tools: ToolId[]
  starters: string[]
}

export interface AgentExportFile {
  format: typeof FORMAT
  exportedAt: string
  agent: PortableAgent
}

const VALID_TOOLS: readonly ToolId[] = ['search', 'research', 'images', 'voice', 'canvas']

function toPortable(agent: AgentProfile): PortableAgent {
  return {
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    category: agent.category,
    tools: agent.tools.filter((tool) => (VALID_TOOLS as readonly string[]).includes(tool)),
    starters: agent.starters.slice(0, 6),
  }
}

/** Serialize an agent to the portable JSON representation. */
export function agentToExportJson(agent: AgentProfile): string {
  const file: AgentExportFile = {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    agent: toPortable(agent),
  }
  return JSON.stringify(file, null, 2)
}

/** Trigger a .agent.json download for one agent. */
export function exportAgentFile(agent: AgentProfile): void {
  const slug =
    agent.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'agent'
  downloadText(`${slug}.agent.json`, agentToExportJson(agent), 'application/json')
}

export type AgentImportResult =
  | { ok: true; agentId: string }
  | { ok: false; error: string }

/**
 * Parse and import a portable agent file. Returns the new agent id, or
 * a human-readable error that never leaks exception text.
 */
export function importAgentJson(text: string): AgentImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'This file is not an agent profile.' }
  }
  const record = parsed as Record<string, unknown>

  if (record.format !== FORMAT) {
    return { ok: false, error: 'This file was not exported by Uni (unknown format).' }
  }

  const agent = record.agent
  if (typeof agent !== 'object' || agent === null) {
    return { ok: false, error: 'This file has no agent inside.' }
  }
  const source = agent as Record<string, unknown>

  const name = typeof source.name === 'string' ? source.name.trim() : ''
  const instructions =
    typeof source.instructions === 'string' ? source.instructions.trim() : ''
  if (!name || !instructions) {
    return { ok: false, error: 'The agent needs at least a name and instructions.' }
  }

  const category =
    source.category === 'personal' ? 'personal' : 'specialist'
  const tools = Array.isArray(source.tools)
    ? source.tools.filter(
        (tool): tool is ToolId =>
          typeof tool === 'string' && (VALID_TOOLS as readonly string[]).includes(tool),
      )
    : []
  const starters = Array.isArray(source.starters)
    ? source.starters
        .filter((starter): starter is string => typeof starter === 'string')
        .map((starter) => starter.trim())
        .filter(Boolean)
        .slice(0, 6)
    : []
  const description =
    typeof source.description === 'string' ? source.description.trim() : ''

  const now = Date.now()
  const profile: AgentProfile = {
    id: `agent-${crypto.randomUUID()}`,
    name,
    description,
    instructions,
    category,
    providerId: null,
    modelId: null,
    tools,
    projectIds: [],
    starters,
    archived: false,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }

  useAgentsStore.getState().saveAgent(profile)
  return { ok: true, agentId: profile.id }
}
