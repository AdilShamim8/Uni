import { createServer } from 'node:net'
import { mkdir } from 'node:fs/promises'

/** Scratch space for test-run artifacts (gitignored). */
export const TEST_SCRATCH_ROOT = '/home/z/my-project/.tmp'

export async function ensureScratchRoot(): Promise<string> {
  await mkdir(TEST_SCRATCH_ROOT, { recursive: true })
  return TEST_SCRATCH_ROOT
}

/** Reserve a free TCP port on the loopback interface. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('Could not reserve a port'))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}
