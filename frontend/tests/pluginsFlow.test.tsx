import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  flushPluginsPersistence,
  resetPluginsStoreForTests,
  usePluginsStore,
} from '@/state/pluginsStore'
import {
  abortAllPluginRunsForTests,
  dispatch,
  registerAdapter,
  resetAdaptersForTests,
} from '@/services/plugins/dispatcher'
import { registerBuiltInAdapters } from '@/services/plugins/adapters'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkStore } from '@/state/workStore'
import { useAppStore } from '@/state/store'
import { renderApp, setupAppTest } from './helpers'

const WORK_THREAD = { kind: 'work' as const, taskId: 'task-1' }

function fullyGrant(pluginId: string, options: { agentId?: string | null } = {}) {
  const store = usePluginsStore.getState()
  store.enablePlugin(pluginId)
  if (options.agentId) store.setAgentAllowed(options.agentId, [pluginId])
  store.grantThread('work:task-1', pluginId)
}

describe('plugins — store and catalogue', () => {
  it('enables and disables built-ins; integration-required entries stay inert', () => {
    usePluginsStore.getState().initialize()
    const store = usePluginsStore.getState()
    store.enablePlugin('documents')
    expect(usePluginsStore.getState().enabled['documents']).toBe(true)

    // External entries can never be enabled.
    store.enablePlugin('github')
    expect(usePluginsStore.getState().enabled['github']).toBeUndefined()

    store.disablePlugin('documents')
    expect(usePluginsStore.getState().enabled['documents']).toBeUndefined()
  })

  it('drops unknown plugin ids when loading persisted state', () => {
    localStorage.setItem(
      'universe:plugins:v1',
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        payload: {
          enabled: ['documents', 'ghost-plugin'],
          agentAllowed: {},
          threadGrants: {},
          receipts: [],
        },
      }),
    )
    resetPluginsStoreForTests({ keepStorage: true })
    usePluginsStore.getState().initialize()
    expect(usePluginsStore.getState().enabled['documents']).toBe(true)
    expect(usePluginsStore.getState().enabled['ghost-plugin']).toBeUndefined()
  })

  it('keeps receipts bounded and never stores credentials', () => {
    usePluginsStore.getState().initialize()
    const store = usePluginsStore.getState()
    for (let index = 0; index < 130; index += 1) {
      store.recordReceipt({
        id: `run-${index}`,
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: `Run ${index}`,
        status: 'success',
        at: Date.now() + index,
        finishedAt: Date.now() + index,
        thread: WORK_THREAD,
      })
    }
    expect(usePluginsStore.getState().receipts.length).toBeLessThanOrEqual(100)
    flushPluginsPersistence()
    const raw = localStorage.getItem('universe:plugins:v1') ?? ''
    expect(raw).not.toContain('sk-test1234')
    expect(raw).not.toContain('"apiKey"')
  })
})

describe('plugins — dispatcher authorization (enforced, not hidden)', () => {
  beforeEach(() => {
    resetPluginsStoreForTests()
    usePluginsStore.getState().initialize()
    resetAdaptersForTests()
    // Re-register one controllable adapter for these tests.
    registerAdapter('documents.create', async () => ({ summary: 'made it' }))
  })
  afterEach(() => {
    abortAllPluginRunsForTests()
    resetAdaptersForTests()
  })

  const request = {
    pluginId: 'documents',
    capability: 'documents.create' as const,
    actionLabel: 'Create document',
    thread: WORK_THREAD,
    agentId: null as string | null,
  }

  it('rejects before execution when the plugin is not enabled', async () => {
    usePluginsStore.getState().grantThread('work:task-1', 'documents')
    const result = await dispatch(request, {})
    expect(result).toMatchObject({ ok: false, code: 'not-enabled' })
    // Nothing ran, so nothing was even recorded as running.
    expect(usePluginsStore.getState().receipts).toHaveLength(0)
  })

  it('rejects when the employee is not allowed', async () => {
    fullyGrant('documents', { agentId: 'agent-1' })
    const result = await dispatch({ ...request, agentId: 'agent-2' }, {})
    expect(result).toMatchObject({ ok: false, code: 'not-allowed-for-agent' })
    expect(usePluginsStore.getState().receipts).toHaveLength(0)
  })

  it('rejects when the thread has no grant', async () => {
    usePluginsStore.getState().enablePlugin('documents')
    const result = await dispatch(request, {})
    expect(result).toMatchObject({ ok: false, code: 'not-granted-for-thread' })
  })

  it('rejects integration-required entries without any execution', async () => {
    const result = await dispatch(
      {
        pluginId: 'github',
        capability: 'documents.create',
        actionLabel: 'Read issues',
        thread: null,
        agentId: null,
      },
      {},
    )
    expect(result).toMatchObject({ ok: false, code: 'integration-required' })
    expect(result.ok === false && result.message).toMatch(/does not have yet/i)
  })

  it('rejects unknown plugins and unoffered capabilities', async () => {
    expect(await dispatch({ ...request, pluginId: 'nope' }, {})).toMatchObject({
      ok: false,
      code: 'unknown-plugin',
    })
    fullyGrant('data-analysis')
    expect(
      await dispatch(
        {
          pluginId: 'data-analysis',
          capability: 'documents.create',
          actionLabel: 'Wrong pairing',
          thread: null,
          agentId: null,
        },
        {},
      ),
    ).toMatchObject({ ok: false, code: 'capability-not-offered' })
  })

  it('runs and records a success receipt when access checks pass', async () => {
    fullyGrant('documents', { agentId: 'agent-1' })
    const result = await dispatch({ ...request, agentId: 'agent-1' }, {})
    expect(result).toMatchObject({ ok: true })
    const receipt = usePluginsStore.getState().receipts[0]
    expect(receipt.status).toBe('success')
    expect(receipt.thread).toEqual(WORK_THREAD)
  })
})

describe('plugins — revocation, cancellation, late-result rejection', () => {
  beforeEach(() => {
    resetPluginsStoreForTests()
    usePluginsStore.getState().initialize()
    resetAdaptersForTests()
  })
  afterEach(() => {
    abortAllPluginRunsForTests()
    resetAdaptersForTests()
  })

  it('disabling mid-run cancels and a late result never upgrades the receipt', async () => {
    const gate: { release: () => void } = { release: () => {} }
    registerAdapter('documents.create', () => {
      return new Promise((resolve) => {
        gate.release = () => resolve({ summary: 'late result' })
      })
    })
    fullyGrant('documents')
    const outcome = dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create document',
        thread: WORK_THREAD,
        agentId: null,
      },
      {},
    )
    await waitFor(() => {
      expect(usePluginsStore.getState().receipts[0]?.status).toBe('running')
    })
    usePluginsStore.getState().disablePlugin('documents')
    gate.release()
    const result = await outcome
    expect(result).toMatchObject({ ok: false })
    const receipt = usePluginsStore.getState().receipts[0]
    expect(['cancelled', 'revoked']).toContain(receipt.status)
    expect(receipt.status).not.toBe('success')
  })

  it('revoking a thread grant marks in-flight receipts revoked and blocks new calls', async () => {
    const gate: { release: () => void } = { release: () => {} }
    registerAdapter('documents.create', () => {
      return new Promise((resolve) => {
        gate.release = () => resolve({ summary: 'late' })
      })
    })
    fullyGrant('documents')
    const { revokeAndCancelThreadRuns } = await import('@/services/plugins/dispatcher')
    const outcome = dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create document',
        thread: WORK_THREAD,
        agentId: null,
      },
      {},
    )
    await waitFor(() => {
      expect(usePluginsStore.getState().receipts[0]?.status).toBe('running')
    })
    revokeAndCancelThreadRuns(WORK_THREAD, 'documents')
    gate.release()
    await outcome
    expect(usePluginsStore.getState().receipts[0].status).toBe('revoked')
    // A new call now fails the access check — truthfully unavailable.
    const retry = await dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create document',
        thread: WORK_THREAD,
        agentId: null,
      },
      {},
    )
    expect(retry).toMatchObject({ ok: false, code: 'not-granted-for-thread' })
  })
})

describe('plugins — end-to-end journeys through the UI', () => {
  setupAppTest()
  beforeEach(() => {
    registerBuiltInAdapters()
  })

  it('catalogue: discover, enable Documents, see the honest states', async () => {
    renderApp('/plugins')
    expect(await screen.findByLabelText('Search plugins')).toBeInTheDocument()

    // Built-in + external entries with honest availability labels.
    await waitFor(() =>
      expect(screen.getAllByText('Available built-in').length).toBeGreaterThanOrEqual(3),
    )
    expect(screen.getAllByText('Integration required').length).toBeGreaterThanOrEqual(3)

    // Search + category filter (scope to cards via their author lines —
    // the category filter chips share names with plugins).
    await userEvent.type(screen.getByLabelText('Search plugins'), 'github')
    expect(screen.queryByText('Uni (built-in)')).toBeNull()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Search plugins'))

    // Open the detail and enable (the card's title; the filter chip shares
    // the name, so disambiguate by opening the card whose author line is
    // present — click the second match, which is the card in the list).
    const documentsCard = screen
      .getAllByText('Documents')
      .find((element) => element.closest('button')?.textContent?.includes('Uni (built-in)'))
    expect(documentsCard).toBeTruthy()
    await userEvent.click(documentsCard!)
    expect(screen.getByText(/Access preview/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }))
    await waitFor(() =>
      expect(usePluginsStore.getState().enabled['documents']).toBe(true),
    )

    // The integration-required detail never offers a connect button.
    await userEvent.click(screen.getByRole('button', { name: 'Back to Plugins' }))
    await userEvent.click(screen.getByText('GitHub'))
    expect(screen.getByText(/Integration required — not connected/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Connect/i })).toBeNull()
  })

  it('work thread: grant Documents from the picker, create a real document, see the receipt', async () => {
    useWorkStore.getState().initialize()
    const taskId = useWorkStore.getState().createTask({
      title: 'Launch note',
      goal: 'Draft a launch update',
      deliverable: 'research-report',
    })
    renderApp(`/work/${taskId}`)

    // Grant Documents from the composer picker — the draft stays put.
    await userEvent.type(
      screen.getByLabelText('Send a follow-up about this task'),
      'unfinished draft',
    )
    usePluginsStore.getState().enablePlugin('documents')
    await userEvent.click(screen.getByRole('button', { name: 'Plugin picker' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Documents/ }))

    // The chip appears; its action menu offers the real capability.
    await userEvent.click(screen.getByRole('button', { name: 'Documents actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Create Canvas document' }))

    // A real artifact exists and a success receipt renders in the thread.
    await waitFor(() => {
      const artifacts = Object.values(useLibraryStore.getState().artifacts)
      expect(artifacts).toHaveLength(1)
      expect(artifacts[0].kind).toBe('document')
    })
    expect(await screen.findByText(/Created “New document”/)).toBeInTheDocument()
    // The composer draft survived the whole flow.
    expect(screen.getByLabelText('Send a follow-up about this task')).toHaveValue(
      'unfinished draft',
    )
  })

  it('data analysis: a real CSV produces computed output and an honest error without a file', async () => {
    useWorkStore.getState().initialize()
    const taskId = useWorkStore.getState().createTask({
      title: 'Numbers',
      goal: 'Review the numbers',
      deliverable: 'data-review',
    })
    usePluginsStore.getState().enablePlugin('data-analysis')
    renderApp(`/work/${taskId}`)

    await userEvent.click(screen.getByRole('button', { name: 'Plugin picker' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Data analysis/ }))

    // Dispatch with no file: honest failure, nothing analyzed.
    const noFile = await dispatch(
      {
        pluginId: 'data-analysis',
        capability: 'data.analyze',
        actionLabel: 'Analyze a CSV file',
        thread: { kind: 'work', taskId },
        agentId: null,
      },
      { file: null },
    )
    expect(noFile).toMatchObject({ ok: false })
    expect(noFile.ok === false && noFile.message).toMatch(/No file was selected/i)

    // Dispatch with a real file: the actual local engine computes.
    const file = new File(['name,score\nalpha,10\nbeta,20\n'], 'scores.csv', {
      type: 'text/csv',
    })
    const result = await dispatch(
      {
        pluginId: 'data-analysis',
        capability: 'data.analyze',
        actionLabel: `Analyze ${file.name}`,
        thread: { kind: 'work', taskId },
        agentId: null,
      },
      { file },
    )
    expect(result).toMatchObject({ ok: true })
    const artifacts = Object.values(useLibraryStore.getState().artifacts)
    expect(artifacts[0].provenance).toBe('local-computation')
    expect(artifacts[0].markdown).toContain('scores.csv')
    expect(artifacts[0].markdown).toContain('2 rows')
  })

  it('library context: attach a real document to the thread context explicitly', async () => {
    useWorkStore.getState().initialize()
    useLibraryStore.getState().initialize()
    const artifactId = useLibraryStore.getState().addArtifact({
      title: 'Launch notes',
      kind: 'notes',
      markdown: '# Launch notes\n\nShips Friday.',
    })
    const taskId = useWorkStore.getState().createTask({
      title: 'Launch update',
      goal: 'Draft a launch update',
      deliverable: 'research-report',
    })
    usePluginsStore.getState().enablePlugin('library-context')
    renderApp(`/work/${taskId}`)

    await userEvent.click(screen.getByRole('button', { name: 'Plugin picker' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Library context/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Library context actions' }))
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Find and attach context…' }),
    )

    // Pick the real document in the dialog.
    await userEvent.click(await screen.findByText('Launch notes'))

    await waitFor(() => {
      expect(
        screen.getByText(/Attached “Launch notes” to this thread’s context/),
      ).toBeInTheDocument()
    })
    // The context store now carries the explicit selection for this task.
    const { useContextStore } = await import('@/state/contextStore')
    const selection = useContextStore.getState().getSelection(taskId)
    expect(selection).toHaveLength(1)
    expect(selection[0].refId).toBe(artifactId)
  })

  it('employee plugin allow-list gates the dispatcher for that employee', async () => {
    registerBuiltInAdapters()
    usePluginsStore.getState().initialize()
    usePluginsStore.getState().enablePlugin('documents')
    usePluginsStore.getState().grantThread('agent:conv-1', 'documents')
    // Not allowed for this employee:
    const denied = await dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create document',
        thread: { kind: 'agent', agentId: 'agent-1', conversationId: 'conv-1' },
        agentId: 'agent-1',
      },
      {},
    )
    expect(denied).toMatchObject({ ok: false, code: 'not-allowed-for-agent' })

    // Allowed after the switch:
    usePluginsStore.getState().setAgentAllowed('agent-1', ['documents'])
    const allowed = await dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create document',
        thread: { kind: 'agent', agentId: 'agent-1', conversationId: 'conv-1' },
        agentId: 'agent-1',
      },
      {},
    )
    expect(allowed).toMatchObject({ ok: true })
  })
})

describe('plugins — exports stay credential-free', () => {
  setupAppTest()
  beforeEach(() => {
    registerBuiltInAdapters()
  })

  it('app export never contains plugin grants or receipts', () => {
    usePluginsStore.getState().initialize()
    usePluginsStore.getState().enablePlugin('documents')
    usePluginsStore.getState().recordReceipt({
      id: 'run-x',
      pluginId: 'documents',
      capability: 'documents.create',
      actionLabel: 'Create document',
      status: 'success',
      at: Date.now(),
      finishedAt: Date.now(),
      summary: 'Created “Secret plans”',
      thread: WORK_THREAD,
    })
    const exported = JSON.stringify(useAppStore.getState().exportAllData())
    expect(exported).not.toContain('Secret plans')
    expect(exported).not.toContain('documents')
  })
})

vi.mock('@/features/chat/exportUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/chat/exportUtils')>()
  return { ...actual, downloadText: vi.fn() }
})

// Ensure the page-level main scoping helper is available.
void within
