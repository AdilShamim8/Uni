/**
 * Path resolution and containment for session file tools — adapted from
 * abacusai-bot packages/agent/src/workspace-path.ts.
 *
 * `path.resolve` does not follow links, so a workspace link to /etc/hosts
 * would pass as a workspace file; only the real path says where the bytes
 * come from. Both sides are resolved because the workspace itself is often
 * reached through a link. Unresolvable means not known to be inside
 * anything: fail closed.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

/** Absolute, session-root-relative, or `~/…`: all resolved the same way. */
export function resolveInSession(rawPath: string, root: string): string {
  return path.resolve(root, rawPath.trim())
}

/** Whether a path really lands inside a directory, symlinks included. */
export function isInsideDirectory(candidate: string, directory: string): boolean {
  const root = realPathOf(path.resolve(directory))
  const real = realPathOf(candidate)
  // Unresolvable means not known to be inside anything: fail closed.
  if (root === null || real === null) return false

  const relative = path.relative(root, real)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * The real path of something that may not exist yet: the nearest existing
 * ancestor is resolved and the remainder re-attached. A DANGLING link is
 * followed by hand first, since writing it creates its TARGET, possibly
 * outside the root. Returns null on a link loop; callers must fail closed,
 * because the only other answer is the lexical path that following exists
 * to distrust.
 */
export function realPathOf(target: string): string | null {
  return followPath(path.resolve(target), LINK_BUDGET)
}

/** Enough for any sane chain; past it, the path is a loop. */
const LINK_BUDGET = 40

function followPath(target: string, linkBudget: number): string | null {
  const missing: string[] = []
  let head = target

  for (;;) {
    try {
      return path.join(fs.realpathSync.native(head), ...missing)
    } catch {
      let link: string | undefined
      try {
        if (fs.lstatSync(head).isSymbolicLink()) {
          link = fs.readlinkSync(head)
        }
      } catch {
        // Truly absent, not a dangling link: keep walking up.
      }
      if (link != null) {
        if (linkBudget <= 0) return null
        // A relative link aims from the directory it really sits in.
        const parent = followPath(path.dirname(head), linkBudget)
        if (parent === null) return null
        return followPath(path.resolve(parent, link), linkBudget - 1)
      }
      // Walk up one component and remember it for the re-join.
      const next = path.dirname(head)
      if (next === head) return null
      missing.unshift(path.basename(head))
      head = next
    }
  }
}
