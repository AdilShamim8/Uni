import { describe, expect, it } from 'vitest'
import { readFileText } from '@/services/readFileText'

/**
 * Reading a text file works in browsers (Blob.text) and under jsdom
 * (FileReader fallback) — both paths must return the file's text.
 */
describe('readFileText', () => {
  it('reads a real File through whichever path the environment offers', async () => {
    const file = new File(['plain text content'], 'notes.txt', { type: 'text/plain' })
    await expect(readFileText(file)).resolves.toBe('plain text content')
  })

  it('uses Blob.text when the environment provides it', async () => {
    const fileLike = {
      text: () => Promise.resolve('via blob.text'),
    } as unknown as File
    await expect(readFileText(fileLike)).resolves.toBe('via blob.text')
  })

  it('reads an empty file as an empty string, not an error', async () => {
    const file = new File([''], 'empty.txt', { type: 'text/plain' })
    await expect(readFileText(file)).resolves.toBe('')
  })
})
