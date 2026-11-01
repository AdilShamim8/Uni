/**
 * Port the original ReWoo styles.css verbatim into Uni, scoped under
 * `.uni-home` so the dashboard's Tailwind/token system is untouched.
 *
 * Rules of the transform:
 *  - every selector gets `.uni-home ` in front of each compound
 *    selector (comma lists handled per-part),
 *  - `:root` variables move onto `.uni-home`,
 *  - `@font-face`, `@keyframes`, `@media` bodies pass through with the
 *    same scoping applied inside media blocks,
 *  - `body` / `html` selectors map to `.uni-home` itself,
 *  - font URLs rewritten to the app's self-hosted copies.
 *
 * The original file is preserved as the single source of truth; this
 * script is deterministic and re-runnable.
 */
const fs = require('fs')
const postcss = require('postcss')

const SRC = '/tmp/rewwo/ReWoo-main/styles.css'
const OUT = '/home/z/my-project/uni-repo/frontend/src/features/home/home.css'

const original = fs.readFileSync(SRC, 'utf8')

const scopeSelector = (raw) => {
  // Split a comma-separated selector list and scope each part.
  return raw
    .split(',')
    .map((part) => {
      const sel = part.trim()
      if (!sel) return null
      if (sel === ':root') return '.uni-home'
      if (sel === 'body' || sel === 'html') return '.uni-home'
      if (/^body\b/.test(sel)) return sel.replace(/^body/, '.uni-home')
      if (/^html\b/.test(sel)) return sel.replace(/^html/, '.uni-home')
      // `:focus-visible` etc. as bare pseudo selectors
      if (sel.startsWith(':')) return `.uni-home${sel === ':root' ? '' : ''} ${sel} `.trim().replace('  ', ' ') === '' ? null : `.uni-home ${sel}`
      // `*` universal
      if (sel === '*') return '.uni-home *'
      return `.uni-home ${sel}`
    })
    .filter(Boolean)
    .join(', ')
}

const walk = (nodes) => {
  const out = []
  for (const node of nodes) {
    if (node.type === 'atrule') {
      if (node.name === 'keyframes') {
        out.push(node.clone())
        continue
      }
      if (node.name === 'font-face') {
        const clone = node.clone()
        clone.walkDecls((decl) => {
          if (decl.value && decl.value.includes('assets/fonts')) {
            decl.value = decl.value.replace(/assets\/fonts\//g, '/fonts/')
          }
        })
        out.push(clone)
        continue
      }
      if (node.name === 'media' || node.name === 'supports') {
        const clone = node.clone()
        clone.nodes = []
        const inner = walk(node.nodes)
        for (const n of inner) clone.append(n)
        out.push(clone)
        continue
      }
      out.push(node.clone())
      continue
    }
    if (node.type === 'rule') {
      const scoped = scopeSelector(node.selector)
      if (!scoped) continue
      const clone = node.clone()
      clone.selector = scoped
      // Rewrite font URLs to the app's self-hosted copies.
      clone.walkDecls((decl) => {
        if (decl.value && decl.value.includes('assets/fonts')) {
          decl.value = decl.value.replace(/assets\/fonts\//g, '/fonts/')
        }
      })
      out.push(clone)
      continue
    }
    if (node.type === 'comment') {
      out.push(node.clone())
      continue
    }
  }
  return out
}

const parsed = postcss.parse(original)
const banner = `/*
 * Uni marketing home — a faithful port of the ReWoo project's
 * styles.css (github.com/AdilShamim8/ReWoo, MIT), scoped under
 * \`.uni-home\` so the app shell's Tailwind system is untouched.
 * The transform is deterministic: scripts/port-rewoo-css.js.
 */

/* The landing page owns the whole document flow: neutralize the app's
 * body-level canvas background while it is mounted. */
body:has(.uni-home) {
  background: #f7f7f2;
}

/* Bridges into the app's base styles: the app sets html/body/#root to
 * height:100% and body overflow-x:clip — fine for the shell, but the
 * landing page needs the natural document flow to scroll. */
html:has(.uni-home),
body:has(.uni-home) {
  height: auto;
  overflow: visible;
  background: #f7f7f2;
}
.uni-home {
  min-height: 100dvh;
  background: var(--paper);
}

`

const result = postcss.root()
for (const n of walk(parsed.nodes)) result.append(n)

// The `:has` fallback above needs the paper var on .uni-home — it is
// defined in the ported :root block, which now sits on .uni-home.
fs.writeFileSync(OUT, banner + result.toString() + '\n')
console.log('wrote', OUT, result.nodes.length, 'top-level nodes')
