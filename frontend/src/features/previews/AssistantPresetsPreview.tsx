import { Check } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Tooltip'
import { ASSISTANT_PRESETS } from '@/services/mock/previewFixtures'

/**
 * Assistant presets: selectable local instructions only — no marketplace,
 * no remote agents. The choice persists with local preferences.
 */
export function AssistantPresetsPreview() {
  const closePreview = useAppStore((state) => state.closePreview)
  const selectedId = useAppStore((state) => state.preferences.assistantPresetId)
  const updatePreferences = useAppStore((state) => state.updatePreferences)
  const showToast = useAppStore((state) => state.showToast)

  return (
    <Dialog
      open
      onClose={closePreview}
      title="Assistant presets"
      description="Local instructions stored with your preferences. No marketplace, no remote agents."
      size="md"
    >
      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Assistant presets">
        {ASSISTANT_PRESETS.map((preset) => {
          const selected = preset.id === selectedId
          return (
            <li key={preset.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  updatePreferences({ assistantPresetId: selected ? null : preset.id })
                  showToast(
                    selected
                      ? `Preset cleared: ${preset.label}`
                      : `Preset applied: ${preset.label}`,
                  )
                }}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  selected
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-raised hover:bg-subtle'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-accent bg-accent text-ink-inverse' : 'border-line-strong'
                  }`}
                  aria-hidden="true"
                >
                  {selected && <Check size={12} />}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-medium ${selected ? 'text-accent' : 'text-ink'}`}
                    >
                      {preset.label}
                    </span>
                    {selected && <Badge tone="accent">Active</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    {preset.description}
                  </span>
                  <span className="mt-1 block rounded-lg bg-subtle px-2 py-1 font-mono text-[11px] text-ink-soft">
                    {preset.instruction}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        Presets are a demonstration of locally stored instructions. Applying one
        records your choice; deeper integration with the assistant behavior
        arrives with the backend milestone.
      </p>
    </Dialog>
  )
}
