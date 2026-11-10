import type { useServerSessionStore } from '@/state/serverSessionStore'

/** The store's activeRun shape, re-exported for the server thread view. */
export type ServerActiveRun = ReturnType<
  typeof useServerSessionStore.getState
>['activeRun']
export type ServerConversationDetail = ReturnType<
  typeof useServerSessionStore.getState
>['openConversation']
