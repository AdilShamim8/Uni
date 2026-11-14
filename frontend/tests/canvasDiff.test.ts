import { describe, expect, it } from 'vitest'
import { diffLines } from '@/features/canvas/diff'

/** The bounded LCS line diff behind version comparison. */
describe('diffLines', () => {
  it('identical texts are all same', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
      { type: 'same', text: 'c' },
    ])
  })

  it('a pure addition marks every new line added', () => {
    expect(diffLines('a', 'a\nb\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'added', text: 'b' },
      { type: 'added', text: 'c' },
    ])
  })

  it('a pure removal marks every gone line removed', () => {
    expect(diffLines('a\nb\nc', 'a')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'removed', text: 'c' },
    ])
  })

  it('a middle edit becomes one removed plus one added line', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'x' },
      { type: 'same', text: 'c' },
    ])
  })

  it('an empty "from" diffs as its one empty line removed, then all added', () => {
    expect(diffLines('', 'first\nsecond')).toEqual([
      { type: 'removed', text: '' },
      { type: 'added', text: 'first' },
      { type: 'added', text: 'second' },
    ])
  })

  it('reconstruction: applying the diff to "from" reproduces "to"', () => {
    const from = ['intro', 'keep', 'drop me', 'tail'].join('\n')
    const to = ['intro', 'keep', 'added', 'tail', 'extra']
    const diff = diffLines(from, to.join('\n'))
    const rebuilt: string[] = []
    for (const line of diff) {
      if (line.type === 'removed') continue
      rebuilt.push(line.text)
    }
    expect(rebuilt).toEqual(to)
  })
})
