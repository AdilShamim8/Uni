import { createServer } from 'node:net'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Scratch space for test-run artifacts (per-run temp dirs live inside it).
 *
 * Resolution order:
 *   1. `UNI_TEST_SCRATCH_ROOT` (absolute path) when set;
 *   2. `<os.tmpdir()>/uni-backend-tests` otherwise.
 *
 * The root must resolve to a writable directory wherever the suite runs —
 * dev laptops and CI runners alike. Never hardcode a machine-specific
 * absolute path here: an earlier revision did exactly that and every CI
 * run failed in beforeAll with `EACCES: permission denied, mkdir '/home/z'`.
 */
const scratchRootOverride = process.env.UNI_TEST_SCRATCH_ROOT?.trim()
export const TEST_SCRATCH_ROOT =
  scratchRootOverride && scratchRootOverride.length > 0
    ? scratchRootOverride
    : join(tmpdir(), 'uni-backend-tests')

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
