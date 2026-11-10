import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createPluginGrantRequestSchema,
  pluginDescriptorSchema,
  pluginGrantDtoSchema,
  pluginGrantKindSchema,
  pluginRunReceiptDtoSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  PLUGIN_REGISTRY,
  grantPluginForThread,
  listEnabledPlugins,
  listGrantsForThread,
  listReceiptsForThread,
  pluginAccess,
  recordPluginReceipt,
  revokePluginForThread,
  setPluginEnabled,
} from './plugins.service.js'
import { listArtifacts } from '../library/library.service.js'

const threadRefSchema = z.object({
  kind: pluginGrantKindSchema,
  threadId: z.string().trim().min(1).max(200),
})

/**
 * Plugin routes (T021/T022). The registry, workspace enablement,
 * per-thread grants, receipts, and the dispatch endpoint every run
 * uses — the single place plugin tools execute server-side.
 */
export async function pluginRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get('/plugins', async () => {
    for (const descriptor of PLUGIN_REGISTRY) void pluginDescriptorSchema.parse(descriptor)
    return { plugins: PLUGIN_REGISTRY }
  })

  app.get('/plugins/enabled', async (request) => {
    const enabled = await listEnabledPlugins(db, request.workspace!.id)
    return { enabled }
  })

  app.put<{ Params: { pluginId: string } }>(
    '/plugins/:pluginId/enabled',
    async (request, reply) => {
      const body = z.object({ enabled: z.boolean() }).parse(request.body ?? {})
      const enabled = await setPluginEnabled(
        db,
        request.workspace!.id,
        request.params.pluginId,
        body.enabled,
      )
      return reply.send({ enabled })
    },
  )

  app.get('/plugins/grants', async (request) => {
    const query = threadRefSchema.parse(request.query)
    const grants = await listGrantsForThread(db, request.workspace!.id, query.threadId)
    for (const grant of grants) void pluginGrantDtoSchema.parse(grant)
    return { items: grants }
  })

  app.post('/plugins/grants', async (request, reply) => {
    const body = createPluginGrantRequestSchema.parse(request.body ?? {})
    const grant = await grantPluginForThread(
      db,
      request.workspace!.id,
      body.pluginId,
      body.kind,
      body.threadId,
    )
    void pluginGrantDtoSchema.parse(grant)
    return reply.status(201).send(grant)
  })

  app.delete('/plugins/grants', async (request, reply) => {
    const query = threadRefSchema.parse(request.query)
    const body = z.object({ pluginId: z.string().trim().min(1).max(100) }).parse(request.body ?? {})
    const revoked = await revokePluginForThread(
      db,
      request.workspace!.id,
      body.pluginId,
      query.kind,
      query.threadId,
    )
    if (!revoked) throw notFound('Grant not found.')
    return reply.status(204).send()
  })

  app.get('/plugins/receipts', async (request) => {
    const query = threadRefSchema.parse(request.query)
    const receipts = await listReceiptsForThread(db, request.workspace!.id, query.threadId)
    for (const receipt of receipts) void pluginRunReceiptDtoSchema.parse(receipt)
    return { items: receipts }
  })

  /**
   * Dispatch (T022): the single execution path. The two-gate check
   * runs first; a refusal is recorded as a 'denied' receipt with the
   * precise reason. Capabilities execute as pure server functions —
   * library.search over the Library service here; more join this
   * registry as they land.
   */
  app.post('/plugins/dispatch', async (request, reply) => {
    const body = z
      .object({
        pluginId: z.string().trim().min(1).max(100),
        capability: z.string().trim().min(1).max(100),
        thread: threadRefSchema,
        runId: z.string().trim().min(1).max(200).nullable().optional(),
        input: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body ?? {})

    const workspaceId = request.workspace!.id
    const access = await pluginAccess(
      db,
      workspaceId,
      body.pluginId,
      body.thread.kind,
      body.thread.threadId,
    )
    if (!access.allowed) {
      const receipt = await recordPluginReceipt(db, {
        workspaceId,
        pluginId: body.pluginId,
        capability: body.capability,
        kind: body.thread.kind,
        threadId: body.thread.threadId,
        runId: body.runId ?? null,
        status: 'denied',
        detail: access.reason ?? 'Access refused.',
      })
      void pluginRunReceiptDtoSchema.parse(receipt)
      return reply.status(403).send({ error: access.reason, receipt })
    }

    try {
      const output = await executeCapability(db, workspaceId, body.pluginId, body.capability, body.input ?? {})
      const receipt = await recordPluginReceipt(db, {
        workspaceId,
        pluginId: body.pluginId,
        capability: body.capability,
        kind: body.thread.kind,
        threadId: body.thread.threadId,
        runId: body.runId ?? null,
        status: 'ok',
        detail: typeof output === 'string' ? output : JSON.stringify(output).slice(0, 2_000),
      })
      void pluginRunReceiptDtoSchema.parse(receipt)
      return reply.send({ output, receipt })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Execution failed.'
      const receipt = await recordPluginReceipt(db, {
        workspaceId,
        pluginId: body.pluginId,
        capability: body.capability,
        kind: body.thread.kind,
        threadId: body.thread.threadId,
        runId: body.runId ?? null,
        status: 'error',
        detail,
      })
      void pluginRunReceiptDtoSchema.parse(receipt)
      return reply.status(422).send({ error: detail, receipt })
    }
  })
}

/** Pure capability execution (T022) — bounded, no network, no secrets. */
async function executeCapability(
  db: Parameters<typeof listArtifacts>[0],
  workspaceId: string,
  pluginId: string,
  capability: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (pluginId === 'library-context' && capability === 'library.search') {
    const query = typeof input.query === 'string' ? input.query.trim().slice(0, 200) : ''
    const artifacts = await listArtifacts(db, workspaceId)
    if (!query) return { results: artifacts.slice(0, 20).map(toSearchHit) }
    const needle = query.toLowerCase()
    return {
      results: artifacts
        .filter(
          (artifact) =>
            artifact.title.toLowerCase().includes(needle) ||
            artifact.markdown.toLowerCase().includes(needle),
        )
        .slice(0, 20)
        .map(toSearchHit),
    }
  }
  if (pluginId === 'library-context' && capability === 'library.attach') {
    const artifactId = typeof input.artifactId === 'string' ? input.artifactId : ''
    const artifacts = await listArtifacts(db, workspaceId)
    const artifact = artifacts.find((entry) => entry.id === artifactId)
    if (!artifact) throw new Error('Artifact not found.')
    return {
      attached: {
        id: artifact.id,
        title: artifact.title,
        // Bounded excerpt: the first 4,000 characters of the body.
        excerpt: artifact.markdown.slice(0, 4_000),
      },
    }
  }
  if (pluginId === 'documents' && capability === 'documents.create') {
    // Delegates to the Library service through canonical-save semantics;
    // the actual save happens in the run's save step — here we validate
    // the draft shape the run assembled.
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 300) : ''
    const markdown = typeof input.markdown === 'string' ? input.markdown : ''
    if (!title || !markdown.trim()) throw new Error('A document needs a title and content.')
    if (markdown.length > 500_000) throw new Error('Document exceeds the 500,000-character limit.')
    return { valid: true, title, characters: markdown.length }
  }
  if (pluginId === 'data-analysis' && capability === 'data.analyze') {
    const csv = typeof input.csv === 'string' ? input.csv : ''
    if (!csv.trim()) throw new Error('No CSV content provided.')
    if (csv.length > 2_000_000) throw new Error('CSV exceeds the 2MB limit.')
    return analyzeCsv(csv)
  }
  throw new Error(`Capability ${capability} is not available for plugin ${pluginId}.`)
}

function toSearchHit(artifact: { id: string; title: string; kind: string; updatedAt: number }): {
  id: string
  title: string
  kind: string
  updatedAt: number
} {
  return { id: artifact.id, title: artifact.title, kind: artifact.kind, updatedAt: artifact.updatedAt }
}

/** Minimal honest CSV summary — rows, columns, header, head rows. */
function analyzeCsv(csv: string): {
  rows: number
  columns: number
  header: string[]
  head: string[][]
} {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 10_000)
  if (lines.length === 0) throw new Error('The CSV has no rows.')
  const split = (line: string) => line.split(',').map((cell) => cell.trim())
  const header = split(lines[0]!)
  const dataLines = lines.slice(1)
  return {
    rows: dataLines.length,
    columns: header.length,
    header,
    head: dataLines.slice(0, 5).map(split),
  }
}
