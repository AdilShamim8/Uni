import { useAppStore } from '@/state/store'
import { Segmented } from '@/components/ui/Segmented'
import { TextArea, TextField } from '@/components/ui/TextField'

export function ChatSection() {
  const preferences = useAppStore((state) => state.preferences)
  const updatePreferences = useAppStore((state) => state.updatePreferences)

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Send key">
        <h3 className="text-sm font-medium text-ink">Send key</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Shift+Enter always inserts a newline. IME composition (pressing Enter
          to confirm a candidate) never sends.
        </p>
        <Segmented
          className="mt-2"
          ariaLabel="Send key behavior"
          value={preferences.sendKey}
          onChange={(value) => updatePreferences({ sendKey: value })}
          options={[
            { value: 'enter', label: 'Enter sends' },
            { value: 'ctrl-enter', label: 'Ctrl/Cmd+Enter sends' },
          ]}
        />
      </section>

      <section aria-label="Personalization">
        <h3 className="text-sm font-medium text-ink">Personalization</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Stored only in this browser and passed to the local demo adapter —
          never uploaded anywhere.
        </p>
        <TextField
          className="mt-3"
          label="What should Universe call you?"
          value={preferences.nickname}
          placeholder="A name or nothing at all"
          onChange={(event) => updatePreferences({ nickname: event.target.value })}
        />
        <TextArea
          className="mt-3"
          label="What traits should Universe have?"
          rows={3}
          value={preferences.traits}
          placeholder="e.g. concise, encouraging, allergic to jargon"
          onChange={(event) => updatePreferences({ traits: event.target.value })}
        />
      </section>
    </div>
  )
}
