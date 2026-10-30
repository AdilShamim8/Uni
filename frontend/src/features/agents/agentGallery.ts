import type { AgentProfile } from '@/domain/workspaceTypes'
import type { ToolId } from '@/domain/types'
import type { PortableAgent } from './agentPortability'
import { VALID_TOOLS, importAgentJson, type AgentImportResult } from './agentPortability'

/**
 * The community agent gallery — a curated, offline catalog of agent
 * profiles that ships inside the app itself.
 *
 * Each entry is a normal `uni.agent/v1` file (the same format the
 * export/import buttons use), contributed via pull request and reviewed
 * into `src/features/agents/gallery/`. Because the files are plain
 * portable profiles, installing one goes through the exact same
 * defensive import path as a file someone sent you — same validation,
 * same clamping, same fresh local id — there is no second code path.
 *
 * Honesty rules (mirrored by tests):
 * - Entries never claim powers — tools list only real ToolIds, and the
 *   persona text carries the app's no-simulation stance.
 * - `credit` states where the persona came from.
 * - Installing is local and reversible: it creates a normal, editable,
 *   archivable agent owned by the user.
 */

import researchLibrarian from './gallery/research-librarian.agent.json'
import resumePolisher from './gallery/resume-polisher.agent.json'
import sqlSidekick from './gallery/sql-sidekick.agent.json'
import meetingScribe from './gallery/meeting-scribe.agent.json'
import tripPlanner from './gallery/trip-planner.agent.json'
import homeworkExplainer from './gallery/homework-explainer.agent.json'

/** One curated gallery entry — a portable persona plus display metadata. */
export interface GalleryEntry {
  /** Stable slug id (matches the file name). */
  id: string
  /** Display emoji from the file (🤖 fallback). */
  emoji: string
  /** One-line provenance shown in the UI. */
  credit: string
  /** The portable persona exactly as it travels in .agent.json files. */
  agent: PortableAgent
}

/** What a raw gallery JSON file looks like after TypeScript widens literals. */
interface GalleryFileAgent {
  name: string
  description: string
  emoji?: string
  instructions: string
  category: string
  tools: string[]
  starters: string[]
}

/**
 * Normalize a raw file persona defensively at load time — same rules as
 * the import path: clamp the category, keep only real tools, cap starters.
 * Tests prove every shipped file survives the full import round-trip.
 */
function normalizeAgent(raw: GalleryFileAgent): PortableAgent {
  return {
    name: raw.name,
    description: raw.description,
    instructions: raw.instructions,
    category: raw.category === 'personal' ? 'personal' : 'specialist',
    tools: raw.tools.filter((tool): tool is ToolId =>
      (VALID_TOOLS as readonly string[]).includes(tool),
    ),
    starters: raw.starters.slice(0, 6),
  }
}

const FILES: ReadonlyArray<{ id: string; credit: string; agent: GalleryFileAgent }> = [
  { id: 'research-librarian', credit: 'Uni curated collection', agent: researchLibrarian.agent },
  { id: 'resume-polisher', credit: 'Uni curated collection', agent: resumePolisher.agent },
  { id: 'sql-sidekick', credit: 'Uni curated collection', agent: sqlSidekick.agent },
  { id: 'meeting-scribe', credit: 'Uni curated collection', agent: meetingScribe.agent },
  { id: 'trip-planner', credit: 'Uni curated collection', agent: tripPlanner.agent },
  { id: 'homework-explainer', credit: 'Uni curated collection', agent: homeworkExplainer.agent },
]

export const AGENT_GALLERY: readonly GalleryEntry[] = FILES.map((file) => ({
  id: file.id,
  emoji: typeof file.agent.emoji === 'string' && file.agent.emoji ? file.agent.emoji : '🤖',
  credit: file.credit,
  agent: normalizeAgent(file.agent),
}))

/** Serialize a gallery entry as a normal portable .agent.json payload. */
export function galleryEntryToJson(entry: GalleryEntry): string {
  return JSON.stringify(
    {
      format: 'uni.agent/v1',
      exportedAt: new Date().toISOString(),
      agent: entry.agent,
    },
    null,
    2,
  )
}

/**
 * Install a gallery entry through the standard import path — the same
 * validation, clamping, and fresh-id guarantees as any .agent.json.
 */
export function installGalleryAgent(entry: GalleryEntry): AgentImportResult {
  return importAgentJson(galleryEntryToJson(entry))
}

/**
 * True when one of the user's agents matches this entry's persona
 * (name + instructions). A re-install is allowed but the UI prefers to
 * show an honest "already added" state instead of silent duplicates.
 */
export function isGalleryAgentInstalled(
  entry: GalleryEntry,
  agents: Record<string, AgentProfile>,
): boolean {
  return Object.values(agents).some(
    (agent) => agent.name === entry.agent.name && agent.instructions === entry.agent.instructions,
  )
}
