import type { ConnectorDto } from '@uni/contracts'

/**
 * P08 / T026 — the static connector catalog (contract of record:
 * packages/contracts/src/connectors.ts, adapted from the abacusai-bot
 * registry design). Every entry is HONESTLY not-connected: the catalog
 * is documentation-shaped data — what the connector would need to
 * exist in Uni — never a claim of a live gateway.
 *
 * The GitHub entry (T027) is the first fixture target: its future
 * adapter will talk to the public REST API with a stored PAT, and the
 * status stays 'unavailable' until a real credential handshake exists.
 */

export const CONNECTOR_CATALOG: readonly ConnectorDto[] = [
  {
    id: 'github',
    name: 'GitHub',
    description:
      'Read repositories, issues, and pull requests; answer questions about your code and review history.',
    kind: 'platform',
    category: 'development',
    docsUrl: 'https://docs.github.com/rest',
    routes: [
      'List my open pull requests',
      'Summarize recent commits on a branch',
      'Find issues mentioning a topic',
    ],
    setup: [
      'Create a fine-grained personal access token with read-only repository access',
      'Store the token as a server credential (encrypted at rest)',
      'Run a connection test against api.github.com',
    ],
    status: 'unavailable',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description:
      'Read and draft email on your own account; search threads and summarize discussions.',
    kind: 'platform',
    category: 'productivity',
    docsUrl: 'https://developers.google.com/gmail/api',
    routes: [
      'Search my inbox for a thread',
      'Draft a reply to a message',
      'Summarize unread mail from today',
    ],
    setup: [
      'Create a Google Cloud OAuth client with Gmail scopes',
      'Complete the OAuth consent flow for your account',
      'Store the refresh token server-side (encrypted at rest)',
    ],
    status: 'unavailable',
  },
  {
    id: 'slack',
    name: 'Slack',
    description:
      'Read channels you can access and post messages as you through a workspace app.',
    kind: 'messaging',
    category: 'messaging',
    docsUrl: 'https://api.slack.com/docs',
    routes: [
      'Search a channel for a decision',
      'Post a summary to a channel',
      'List today\u2019s threads in a channel',
    ],
    setup: [
      'Create a Slack app with the chat:read and chat:write scopes',
      'Install it into your workspace',
      'Store the bot token server-side (encrypted at rest)',
    ],
    status: 'unavailable',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and update pages and databases you share with the integration.',
    kind: 'platform',
    category: 'productivity',
    docsUrl: 'https://developers.notion.com/docs',
    routes: [
      'Search my workspace for a page',
      'Summarize a database as a table',
      'Append a section to a page',
    ],
    setup: [
      'Create a Notion integration and share the target pages with it',
      'Store the integration token server-side (encrypted at rest)',
    ],
    status: 'unavailable',
  },
]

export function listConnectors(): readonly ConnectorDto[] {
  return CONNECTOR_CATALOG
}

export function findConnector(id: string): ConnectorDto | null {
  return CONNECTOR_CATALOG.find((connector) => connector.id === id) ?? null
}
