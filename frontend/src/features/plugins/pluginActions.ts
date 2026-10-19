import type { PluginCapability } from '@/domain/pluginTypes'

/** The actions each built-in plugin offers from a thread's plugin chip. */
export interface PluginActionSpec {
  capability: PluginCapability
  actionLabel: string
}

export const PLUGIN_ACTIONS: Record<string, PluginActionSpec[]> = {
  documents: [
    { capability: 'documents.create', actionLabel: 'Create Canvas document' },
    { capability: 'documents.save', actionLabel: 'Save output to Library' },
  ],
  'data-analysis': [{ capability: 'data.analyze', actionLabel: 'Analyze a CSV file…' }],
  'library-context': [
    { capability: 'library.search', actionLabel: 'Find and attach context…' },
  ],
}
