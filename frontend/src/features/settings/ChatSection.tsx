import { useAppStore } from '@/state/store'
import { Segmented } from '@/components/ui/Segmented'
import { TextArea, TextField } from '@/components/ui/TextField'
import { SettingsGroup, SettingsRow } from '@/components/ui/SettingsGroup'

export function ChatSection() {
  const preferences = useAppStore((state) => state.preferences)
  const updatePreferences = useAppStore((state) => state.updatePreferences)

  return (
    <div className="flex flex-col gap-5">
      <SettingsGroup
        title="Sending"
        footer="Shift+Enter always inserts a newline. IME composition (pressing Enter to confirm a candidate) never sends."
      >
        <SettingsRow label="Send key" layout="block">
          <div className="w-full sm:max-w-[22rem]">
            <Segmented
              className="w-full"
              ariaLabel="Send key behavior"
              value={preferences.sendKey}
              onChange={(value) => updatePreferences({ sendKey: value })}
              options={[
                { value: 'enter', label: 'Enter sends' },
                { value: 'ctrl-enter', label: 'Ctrl/Cmd+Enter sends' },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Personalization"
        footer="Stored only in this browser and passed to the chat adapter — never uploaded anywhere."
      >
        <div className="flex flex-col gap-3 px-3.5 py-3">
          <TextField
            label="What should Universe call you?"
            value={preferences.nickname}
            placeholder="A name or nothing at all"
            onChange={(event) => updatePreferences({ nickname: event.target.value })}
          />
          <TextArea
            label="What traits should Universe have?"
            rows={3}
            value={preferences.traits}
            placeholder="e.g. concise, encouraging, allergic to jargon"
            onChange={(event) => updatePreferences({ traits: event.target.value })}
          />
        </div>
      </SettingsGroup>
    </div>
  )
}
