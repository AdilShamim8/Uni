import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ServerTranscript } from '@/features/chat/server/ServerTranscript'
import { activePathIds } from '@/features/chat/server/serverThreadModel'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConversationDetail } from '@/state/serverSessionStore'

/**
 * Phase B unified server chat surface — the transcript: active-branch
 * highlighting with siblings preserved, live-run streaming states, and
 * honest error display. The tree contract matches the Account server
 * thread (B03): nodes with parent links, one activeLeafId.
 */

const DETAIL: ServerConversationDetail = {
  id: 'c-1',
  title: 'Server chat one',
  agentId: null,
  pinned: false,
  archived: false,
  activeLeafId: 'n-2',
  createdAt: 1,
  updatedAt: 2,
  messageCount: 3,
  nodes: [
    { id: 'n-1', parentId: null, role: 'user', status: 'complete', content: 'Hello server', createdAt: 1, feedback: null },
    { id: 'n-2', parentId: 'n-1', role: 'assistant', status: 'complete', content: 'Hi from the server', createdAt: 2, feedback: null },
    { id: 'n-3', parentId: 'n-1', role: 'assistant', status: 'stopped', content: 'Older branch', createdAt: 3, feedback: null },
  ],
}

describe('activePathIds', () => {
  it('walks from the leaf to the root through parent links', () => {
    const ids = activePathIds(DETAIL)
    expect(ids.has('n-1')).toBe(true)
    expect(ids.has('n-2')).toBe(true)
    expect(ids.has('n-3')).toBe(false)
  })

  it('handles a missing leaf defensively', () => {
    const ids = activePathIds({ ...DETAIL, activeLeafId: 'n-404' })
    expect(ids.size).toBe(0)
  })
})

describe('ServerTranscript', () => {
  beforeEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useServerSessionStore.setState({ activeRun: null, runError: null })
  })

  it('renders nodes with the active branch highlighted and siblings dimmed', () => {
    render(<ServerTranscript detail={DETAIL} />)
    expect(screen.getByText('Hello server')).toBeInTheDocument()
    expect(screen.getByText('Hi from the server')).toBeInTheDocument()
    expect(screen.getByText('Older branch')).toBeInTheDocument()
    expect(screen.getByText(/other branch/)).toBeInTheDocument()
    // A stopped node on the active path keeps its honest suffix.
    // (n-3 is off-path here, so no active-path suffix is rendered.)
  })

  it('renders a stopped status suffix for stopped nodes on the active path', () => {
    render(<ServerTranscript detail={{ ...DETAIL, activeLeafId: 'n-3' }} />)
    expect(screen.getByText(/Older branch/)).toBeInTheDocument()
    expect(screen.getByText(/· stopped/)).toBeInTheDocument()
  })

  it('streams the live run under the transcript with a streaming label', () => {
    useServerSessionStore.setState({
      activeRun: {
        runId: 'r-1',
        conversationId: 'c-1',
        text: 'Partial answer',
        status: 'running',
        errorMessage: null,
      },
    })
    render(<ServerTranscript detail={DETAIL} />)
    expect(screen.getByText('Partial answer')).toBeInTheDocument()
    expect(screen.getByText('streaming…')).toBeInTheDocument()
  })

  it('shows the run error message honestly', () => {
    useServerSessionStore.setState({
      activeRun: {
        runId: 'r-2',
        conversationId: 'c-1',
        text: 'Partial',
        status: 'error',
        errorMessage: 'Provider rejected the request (401)',
      },
    })
    render(<ServerTranscript detail={DETAIL} />)
    expect(screen.getByText('error')).toBeInTheDocument()
    expect(screen.getByText('Provider rejected the request (401)')).toBeInTheDocument()
  })

  it('ignores a live run that belongs to a different conversation', () => {
    useServerSessionStore.setState({
      activeRun: {
        runId: 'r-3',
        conversationId: 'c-other',
        text: 'Other thread',
        status: 'running',
        errorMessage: null,
      },
    })
    render(<ServerTranscript detail={DETAIL} />)
    expect(screen.queryByText('Other thread')).not.toBeInTheDocument()
    expect(screen.queryByText('streaming…')).not.toBeInTheDocument()
  })
})
