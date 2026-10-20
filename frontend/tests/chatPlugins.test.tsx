import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderApp, setupAppTest } from './helpers'
import { usePluginsStore } from '@/state/pluginsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useAppStore } from '@/state/store'

/**
 * Milestone 07 regression suite (F09): plugins are usable from ordinary
 * Chat — discover, enable, grant, execute, inspect, revoke — and
 * temporary chats keep grants/receipts session-only.
 */

setupAppTest()

describe('plugins in ordinary chat (F09)', () => {
  it('round-trips a built-in from a normal chat: grant → create → receipt → revoke', async () => {
    renderApp('/')

    // Send a message so a real conversation exists.
    const composer = screen.getByLabelText('Message Uni')
    fireEvent.change(composer, { target: { value: 'hello plugins' } })
    fireEvent.keyDown(composer, { key: 'Enter' })
    await waitFor(() => {
      expect(useAppStoreActiveId()).toBeTruthy()
    })

    // The composer plugin bar exists in ordinary chat.
    const picker = await screen.findByRole('button', { name: 'Plugin picker' })
    fireEvent.click(picker)

    // Empty state offers a direct Manage Plugins action (F09). Assert it
    // without navigating away, then close and grant instead.
    expect(screen.getByRole('menuitem', { name: /Manage Plugins/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    usePluginsStore.getState().enablePlugin('documents')
    fireEvent.click(picker)
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Documents/ }))

    // The granted chip appears; its action creates a real artifact.
    const chip = await screen.findByRole('button', { name: 'Documents actions' })
    fireEvent.click(chip)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Canvas document' }))

    await waitFor(() => {
      expect(
        Object.values(useLibraryStore.getState().artifacts).filter(
          (artifact) => artifact.kind === 'document',
        ).length,
      ).toBe(1)
    })

    // The receipt strip shows the run inside this chat.
    await waitFor(() => {
      expect(screen.getByLabelText('Plugin activity in this chat')).toBeInTheDocument()
    })
    expect(screen.getAllByText(/Created “New document”/).length).toBeGreaterThanOrEqual(1)

    // Revoke from the chip; the plugin disappears from this thread.
    fireEvent.click(chip)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Revoke from this thread' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Documents actions' })).not.toBeInTheDocument()
    })
  })

  it('temporary chats keep grants and receipts out of persistence', async () => {
    renderApp('/')

    // Start a temporary chat and say something.
    fireEvent.click(screen.getByRole('button', { name: /Toggle temporary chat/i }))
    const composer = screen.getByLabelText('Message Uni')
    fireEvent.change(composer, { target: { value: 'ephemeral plugins' } })
    fireEvent.keyDown(composer, { key: 'Enter' })
    await waitFor(() => expect(useAppStoreActiveId()).toBeTruthy())

    const conversationId = useAppStoreActiveId() as string
    const conversation = useAppStoreConversations()[conversationId]
    expect(conversation.temporary).toBe(true)

    // Enable + grant + run in the temporary thread.
    usePluginsStore.getState().enablePlugin('documents')
    const picker = await screen.findByRole('button', { name: 'Plugin picker' })
    fireEvent.click(picker)
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Documents/ }))

    const chip = await screen.findByRole('button', { name: 'Documents actions' })
    fireEvent.click(chip)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Canvas document' }))

    await waitFor(() => {
      const receipts = usePluginsStore.getState().receipts
      expect(receipts.length).toBeGreaterThan(0)
      expect(receipts[0].thread?.kind).toBe('chat')
    })

    // Flush persistence: temporary receipts and chat grants never persist.
    const { flushPluginsPersistence } = await import('@/state/pluginsStore')
    flushPluginsPersistence()
    const persisted = JSON.parse(
      localStorage.getItem('universe:plugins:v1') ?? '{}',
    ) as { payload: { receipts: Array<{ thread: { conversationId?: string } | null }>; threadGrants: Record<string, string[]> } }
    expect(
      persisted.payload.receipts.some((r) => r.thread?.conversationId === conversationId),
    ).toBe(false)
    expect(
      Object.keys(persisted.payload.threadGrants).some((key) =>
        key.includes(conversationId),
      ),
    ).toBe(false)
  })
})

function useAppStoreActiveId(): string | null {
  return useAppStore.getState().activeConversationId
}

function useAppStoreConversations() {
  return useAppStore.getState().conversations
}
