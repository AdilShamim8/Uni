/** Tear down the live dev stack started by dev-stack-live.mjs. */
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const meta = join(process.cwd(), '.scratch', 'live-stack.json')
let dataDir
try {
  ({ dataDir } = JSON.parse(await readFile(meta, 'utf8')))
} catch {
  console.log('no live stack found')
  process.exit(0)
}
await rm(dataDir, { recursive: true, force: true })
await rm(meta, { force: true })
console.log('live stack stopped')
