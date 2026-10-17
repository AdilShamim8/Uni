import type { AttachmentMeta } from '@/domain/types'
import { makeId } from '@/domain/ids'

export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
export const MAX_FILES = 4

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const ALLOWED_TEXT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]
const ALLOWED_EXTENSION = /\.(txt|md|csv|json|pdf)$/i

/** Attachment plus a local preview URL (component state only, never stored). */
export interface PendingAttachment extends AttachmentMeta {
  previewUrl?: string
}

export function isAllowedType(file: File): boolean {
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) return true
  if (ALLOWED_TEXT_TYPES.includes(file.type)) return true
  return ALLOWED_EXTENSION.test(file.name)
}

export function kindFor(file: File): 'image' | 'file' {
  return ALLOWED_IMAGE_TYPES.includes(file.type) ? 'image' : 'file'
}

/** Returns a human-readable rejection reason, or null when accepted. */
export function validateFile(file: File): string | null {
  if (!isAllowedType(file)) {
    return 'unsupported type (images, txt, md, csv, json, and pdf are allowed)'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'larger than 5 MB'
  }
  if (file.size === 0) {
    return 'empty file'
  }
  return null
}

export function toPendingAttachment(file: File): PendingAttachment {
  return {
    id: makeId('att'),
    name: file.name,
    size: file.size,
    kind: kindFor(file),
    mediaType: file.type || 'application/octet-stream',
    previewUrl:
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : undefined,
  }
}

/** Strip preview URLs before attachments enter the store. */
export function toAttachmentMeta(pending: PendingAttachment): AttachmentMeta {
  return {
    id: pending.id,
    name: pending.name,
    size: pending.size,
    kind: pending.kind,
    mediaType: pending.mediaType,
  }
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
