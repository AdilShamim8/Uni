/** Simple line diff (LCS) for version comparison — bounded and readable. */

export interface DiffLine {
  type: 'same' | 'added' | 'removed'
  text: string
}

/**
 * Diff two texts line by line using a classic LCS table. Inputs are
 * expected to be modest (the UI caps very large documents with an honest
 * "too large to diff" note before calling this).
 */
export function diffLines(from: string, to: string): DiffLine[] {
  const a = from.split('\n')
  const b = to.split('\n')

  // LCS length table.
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ type: 'removed', text: a[i] })
      i += 1
    } else {
      result.push({ type: 'added', text: b[j] })
      j += 1
    }
  }
  while (i < a.length) {
    result.push({ type: 'removed', text: a[i] })
    i += 1
  }
  while (j < b.length) {
    result.push({ type: 'added', text: b[j] })
    j += 1
  }
  return result
}
