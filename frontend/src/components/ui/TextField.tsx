import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export function TextField({ label, hint, className = '', id, ...props }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          {hint}
        </p>
      )}
      <input
        id={inputId}
        aria-describedby={hint ? hintId : undefined}
        className={`mt-1.5 w-full rounded-[10px] border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent ${
          props.disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
        {...props}
      />
    </div>
  )
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
}

export function TextArea({ label, hint, className = '', id, ...props }: TextAreaProps) {
  const generatedId = useId()
  const areaId = id ?? generatedId
  const hintId = `${areaId}-hint`
  return (
    <div className={className}>
      <label htmlFor={areaId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          {hint}
        </p>
      )}
      <textarea
        id={areaId}
        aria-describedby={hint ? hintId : undefined}
        className={`mt-1.5 w-full resize-y rounded-[10px] border border-line bg-raised px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent ${
          props.disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
        {...props}
      />
    </div>
  )
}
