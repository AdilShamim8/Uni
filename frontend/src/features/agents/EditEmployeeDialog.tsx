import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/TextField'
import type { ServerEmployee } from '@/services/api/serverEmployees'

/**
 * RF-074 — the server employee edit dialog: the identity fields a
 * Work assignment actually consumes (name, description, instructions,
 * category). The submit is a CHANGED-ONLY patch; Save stays disabled
 * until something differs, so the server never receives an empty
 * update. Provider/model pins stay where they already live.
 */
export function EditEmployeeDialog({
  employee,
  onClose,
  onSave,
}: {
  /** The employee to edit; null renders nothing. */
  employee: ServerEmployee | null
  onClose: () => void
  onSave: (
    employeeId: string,
    patch: {
      name?: string
      description?: string
      instructions?: string
      category?: 'personal' | 'specialist'
    },
  ) => Promise<boolean>
}) {
  const [name, setName] = useState(employee?.name ?? '')
  const [description, setDescription] = useState(employee?.description ?? '')
  const [instructions, setInstructions] = useState(employee?.instructions ?? '')
  const [category, setCategory] = useState<'personal' | 'specialist'>(
    employee?.category ?? 'personal',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!employee) return null

  const patch: {
    name?: string
    description?: string
    instructions?: string
    category?: 'personal' | 'specialist'
  } = {}
  if (name.trim() !== employee.name) patch.name = name.trim()
  if (description.trim() !== employee.description) patch.description = description.trim()
  if (instructions.trim() !== employee.instructions) patch.instructions = instructions.trim()
  if (category !== employee.category) patch.category = category
  const changed = Object.keys(patch).length > 0

  async function submit() {
    if (!employee || !changed || submitting) return
    setSubmitting(true)
    setError(null)
    const ok = await onSave(employee.id, patch)
    setSubmitting(false)
    if (!ok) {
      setError('The server rejected the change — try again in a moment.')
    }
    // On success the parent closes the dialog (it owns the target).
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit “${employee.name}”`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!changed || submitting} onClick={() => void submit()}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Researcher"
        />
        <TextField
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this employee is for"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">
            Instructions (sent with every assignment)
          </span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={5}
            placeholder="How this employee should work — tone, rules, defaults."
            className="block w-full resize-none rounded-control border border-line bg-panel px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">Category</span>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value === 'specialist' ? 'specialist' : 'personal')
            }
            className="rounded-control border border-line bg-panel px-2.5 py-2 text-[14px] text-ink"
          >
            <option value="personal">Personal — everyday help</option>
            <option value="specialist">Specialist — a defined craft</option>
          </select>
        </label>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
