import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { IconButton } from './IconButton'

/**
 * Global toast host (aria-live). Renders the current store toast with an
 * optional action (e.g. Undo for conversation deletion).
 */
export function ToastHost() {
  const toast = useAppStore((state) => state.toast)
  const dismiss = useAppStore((state) => state.dismissToast)
  if (!toast) return null

  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-overlay px-4 py-2.5 shadow-raised">
        <p className="text-sm text-ink">{toast.message}</p>
        {toast.actionLabel && (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.()
              dismiss()
            }}
            className="shrink-0 text-sm font-medium text-accent hover:text-accent-strong"
          >
            {toast.actionLabel}
          </button>
        )}
        <IconButton label="Dismiss notification" size="sm" onClick={dismiss}>
          <X size={14} />
        </IconButton>
      </div>
    </div>,
    document.body,
  )
}
