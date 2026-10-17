import { describe, expect, it } from 'vitest'
import {
  humanSize,
  kindFor,
  MAX_FILES,
  toAttachmentMeta,
  toPendingAttachment,
  validateFile,
} from '@/features/chat/attachments'

describe('attachment validation', () => {
  it('accepts allowed image types', () => {
    expect(validateFile(new File(['x'], 'pic.png', { type: 'image/png' }))).toBeNull()
    expect(validateFile(new File(['x'], 'pic.jpg', { type: 'image/jpeg' }))).toBeNull()
  })

  it('accepts allowed text-like types and extensions', () => {
    expect(validateFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBeNull()
    expect(validateFile(new File(['{}'], 'data.json', { type: 'application/json' }))).toBeNull()
    expect(validateFile(new File(['x'], 'doc.pdf', { type: 'application/pdf' }))).toBeNull()
  })

  it('rejects unsupported types with a reason', () => {
    expect(validateFile(new File(['x'], 'app.exe', { type: 'application/octet-stream' }))).toContain(
      'unsupported type',
    )
  })

  it('rejects files larger than 5 MB', () => {
    const big = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
    expect(validateFile(big)).toContain('larger than 5 MB')
  })

  it('rejects empty files', () => {
    const empty = new File([], 'empty.txt', { type: 'text/plain' })
    Object.defineProperty(empty, 'size', { value: 0 })
    expect(validateFile(empty)).toContain('empty file')
  })

  it('classifies kind by media type', () => {
    expect(kindFor(new File(['x'], 'p.png', { type: 'image/png' }))).toBe('image')
    expect(kindFor(new File(['x'], 'n.txt', { type: 'text/plain' }))).toBe('file')
  })

  it('strips preview URLs before attachments enter the store', () => {
    const pending = toPendingAttachment(new File(['x'], 'p.png', { type: 'image/png' }))
    const meta = toAttachmentMeta(pending)
    expect(meta).not.toHaveProperty('previewUrl')
    expect(meta.name).toBe('p.png')
    expect(meta.kind).toBe('image')
  })

  it('formats human sizes', () => {
    expect(humanSize(512)).toBe('512 B')
    expect(humanSize(2048)).toBe('2 KB')
    expect(humanSize(3.2 * 1024 * 1024)).toBe('3.2 MB')
  })

  it('caps the number of attachments per message', () => {
    expect(MAX_FILES).toBe(4)
  })
})
