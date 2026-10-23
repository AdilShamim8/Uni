/**
 * Race a promise against a deadline. Loser rejections are consumed by
 * Promise.race, so no unhandled rejection can escape a settled race.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}
