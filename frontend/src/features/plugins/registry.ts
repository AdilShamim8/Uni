import type { PluginManifest } from '@/domain/pluginTypes'

/**
 * The plugin catalogue — static metadata only. Enabled state, grants, and
 * connection state live in the plugins store and are never faked here.
 *
 * Built-in entries run local adapters against existing engines (Canvas,
 * the CSV analyzer, the Library). External entries are honest
 * descriptions: Uni has no OAuth, no browser login, and no scheduler, so
 * they render as "Integration required" and can never show Connected.
 */
export const PLUGIN_CATALOG: PluginManifest[] = [
  {
    id: 'documents',
    name: 'Documents',
    version: '1.0.0',
    author: 'Uni (built-in)',
    description: 'Create Canvas documents and save thread output to your Library.',
    category: 'documents',
    capabilities: ['documents.create', 'documents.save'],
    scopes: [
      'Create documents in your local Library',
      'Save output from a thread as a Library artifact',
    ],
    execution: 'local-built-in',
    builtin: true,
  },
  {
    id: 'data-analysis',
    name: 'Data analysis',
    version: '1.0.0',
    author: 'Uni (built-in)',
    description: 'Run the local CSV analysis on a file you pick — nothing is uploaded.',
    category: 'data',
    capabilities: ['data.analyze'],
    scopes: [
      'Read one CSV file you explicitly select',
      'Compute summaries, groupings, and charts on this device',
    ],
    execution: 'local-built-in',
    builtin: true,
  },
  {
    id: 'library-context',
    name: 'Library context',
    version: '1.0.0',
    author: 'Uni (built-in)',
    description: 'Find local documents and attach selected content to the current thread.',
    category: 'productivity',
    capabilities: ['library.search', 'library.attach'],
    scopes: [
      'Search artifacts stored in this app',
      'Attach content you explicitly select to the current thread',
    ],
    execution: 'local-built-in',
    builtin: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    version: '—',
    author: 'Not available',
    description: 'Read issues and pull requests from repositories you choose.',
    category: 'development',
    capabilities: [],
    scopes: [],
    execution: 'integration-required',
    builtin: false,
    requirements:
      'A real GitHub integration needs an OAuth app, token storage, and API calls. Uni has none of these yet — this entry describes what a future integration would require and never shows a connected state.',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    version: '—',
    author: 'Not available',
    description: 'Search your inbox and draft replies from a thread.',
    category: 'productivity',
    capabilities: [],
    scopes: [],
    execution: 'integration-required',
    builtin: false,
    requirements:
      'A real Gmail integration needs Google OAuth with scoped consent and server-side API access. Uni has none of these yet — nothing connects and no mail is read.',
  },
  {
    id: 'drive',
    name: 'Google Drive',
    version: '—',
    author: 'Not available',
    description: 'Open and save files stored in your Drive.',
    category: 'documents',
    capabilities: [],
    scopes: [],
    execution: 'integration-required',
    builtin: false,
    requirements:
      'A real Drive integration needs Google OAuth and file-scope consent. Uni has none of these yet — this entry stays an honest description.',
  },
]

export function findPlugin(id: string): PluginManifest | undefined {
  return PLUGIN_CATALOG.find((plugin) => plugin.id === id)
}
