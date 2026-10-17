let counter = 0

/** Generate a collision-resistant id with a readable prefix. */
export function makeId(prefix: string): string {
  counter += 1
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${counter}`
}
