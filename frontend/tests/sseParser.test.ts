import { describe, expect, it } from 'vitest'
import { findEventBoundary, parseSseBlock } from '@/services/sse/sseParser'

/**
 * Standards-aware SSE frame parsing (audit F06) shared by the browser
 * BYOK adapter and the server-run event client — one wire format, one
 * parser, tested once.
 */
describe('parseSseBlock', () => {
  it('parses a single data line', () => {
    expect(parseSseBlock('data: hello')).toEqual({ event: undefined, data: 'hello' })
  })

  it('joins multi-line data with newlines per the SSE spec', () => {
    expect(parseSseBlock('data: first\ndata: second')).toEqual({
      event: undefined,
      data: 'first\nsecond',
    })
  })

  it('captures the event name and strips the single optional space', () => {
    expect(parseSseBlock('event: delta\ndata: {"t":"x"}')).toEqual({
      event: 'delta',
      data: '{"t":"x"}',
    })
  })

  it('skips comment and keep-alive lines', () => {
    expect(parseSseBlock(': ping\ndata: ok')).toEqual({ event: undefined, data: 'ok' })
  })

  it('handles CRLF framing inside the block', () => {
    expect(parseSseBlock('event: terminal\r\ndata: done\r')).toEqual({
      event: 'terminal',
      data: 'done',
    })
  })

  it('a block with no data lines is not an event', () => {
    expect(parseSseBlock(': keep-alive')).toBeNull()
    expect(parseSseBlock('event: only')).toBeNull()
  })
})

describe('findEventBoundary', () => {
  it('finds the LF blank-line boundary and reports the end offset', () => {
    expect(findEventBoundary('data: a\n\ndata: b')).toEqual({ end: 9 })
  })

  it('finds the CRLF blank-line boundary', () => {
    expect(findEventBoundary('data: a\r\n\r\ndata: b')).toEqual({ end: 11 })
  })

  it('returns null while a frame is still streaming in', () => {
    expect(findEventBoundary('data: partial')).toBeNull()
    expect(findEventBoundary('data: a\ndata: b\n')).toBeNull()
  })
})
