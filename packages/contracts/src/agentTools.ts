import { z } from 'zod'

/**
 * The tool roster contract — the single table of tools a server agent
 * session can register, adapted from abacusai-bot packages/agent/src/
 * roster.ts. The registry IS the allowlist: a tool not in this table
 * does not exist as far as the session is concerned, which is what
 * makes forgetting one loud rather than silent.
 */

/** Roster names — the wire vocabulary the model sees. */
export const agentToolNameSchema = z.enum([
  'read',
  'list',
  'grep',
  'write',
  'edit',
  'bash',
  'web_fetch',
  'exit_plan_mode',
  'current_time',
  'todo',
])
export type AgentToolName = z.infer<typeof agentToolNameSchema>

/** Tools that change something on disk or run code (upstream MUTATING_TOOLS). */
export const AGENT_MUTATING_TOOLS = [
  'write',
  'edit',
  'bash',
  'web_fetch',
] as const
export type AgentMutatingTool = (typeof AGENT_MUTATING_TOOLS)[number]

/** Read-only roster tools that take a path (still confined to the root). */
export const AGENT_READ_TOOLS = ['read', 'list', 'grep'] as const
export type AgentReadTool = (typeof AGENT_READ_TOOLS)[number]

/** Tools whose result text is untrusted and must be fenced (upstream). */
export const AGENT_UNTRUSTED_OUTPUT_TOOLS = ['bash', 'web_fetch'] as const

export interface AgentToolDescriptor {
  name: AgentToolName
  description: string
  mutating: boolean
  /** Which modes ask before this tool runs (all but yolo/unattended paths). */
  gated: boolean
}

/**
 * The static descriptors the API returns. Descriptions are the ones the
 * model reads; they state the confinement honestly (paths resolve inside
 * the session root; bash output is capped; web_fetch is guarded).
 */
export const AGENT_TOOL_DESCRIPTORS: readonly AgentToolDescriptor[] = [
  {
    name: 'read',
    description: 'Read a text file inside the session root. Output is capped.',
    mutating: false,
    gated: false,
  },
  {
    name: 'list',
    description: 'List a directory inside the session root.',
    mutating: false,
    gated: false,
  },
  {
    name: 'grep',
    description: 'Search file contents inside the session root.',
    mutating: false,
    gated: false,
  },
  {
    name: 'write',
    description: 'Create or overwrite a file inside the session root.',
    mutating: true,
    gated: true,
  },
  {
    name: 'edit',
    description: 'Replace text in a file inside the session root.',
    mutating: true,
    gated: true,
  },
  {
    name: 'bash',
    description:
      'Run a shell command with the session root as cwd. Output is capped; the command runs with the server process user.',
    mutating: true,
    gated: true,
  },
  {
    name: 'web_fetch',
    description:
      'Fetch a URL through the SSRF-guarded transport and return text content, fenced.',
    mutating: true,
    gated: true,
  },
  {
    name: 'exit_plan_mode',
    description: 'Ask the user to approve leaving plan mode with the plan shown.',
    mutating: false,
    gated: false,
  },
  {
    name: 'current_time',
    description: 'The server clock, in UTC.',
    mutating: false,
    gated: false,
  },
  {
    name: 'todo',
    description: 'Maintain a task list the user can see.',
    mutating: false,
    gated: false,
  },
]

export const agentToolDescriptorDtoSchema = z.object({
  name: agentToolNameSchema,
  description: z.string(),
  mutating: z.boolean(),
  gated: z.boolean(),
})
export type AgentToolDescriptorDto = z.infer<typeof agentToolDescriptorDtoSchema>

/** Input shapes per tool, validated server-side before execution. */
export const toolInputSchemas = {
  read: z.object({ path: z.string().min(1).max(1_000) }),
  list: z.object({ path: z.string().min(1).max(1_000) }),
  grep: z.object({
    pattern: z.string().min(1).max(500),
    path: z.string().min(1).max(1_000).optional(),
    glob: z.string().min(1).max(200).optional(),
  }),
  write: z.object({
    path: z.string().min(1).max(1_000),
    content: z.string().max(200_000),
  }),
  edit: z.object({
    path: z.string().min(1).max(1_000),
    oldText: z.string().min(1).max(50_000),
    newText: z.string().max(50_000),
    replaceAll: z.boolean().optional(),
  }),
  bash: z.object({
    command: z.string().min(1).max(10_000),
    timeoutMs: z.number().int().positive().max(60_000).optional(),
  }),
  web_fetch: z.object({
    url: z.string().url().max(2_000),
  }),
  exit_plan_mode: z.object({ plan: z.string().max(20_000).optional() }),
  current_time: z.object({}).strict(),
  todo: z.object({
    todos: z
      .array(
        z.object({
          content: z.string().min(1).max(500),
          status: z.enum(['pending', 'in_progress', 'completed']),
        }),
      )
      .max(50),
  }),
} as const

export type ToolInputOf<T extends AgentToolName> = z.infer<(typeof toolInputSchemas)[T]>
