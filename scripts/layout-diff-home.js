/**
 * Layout-diff the ported Uni home page against the original ReWoo page.
 * For a shared set of selectors, capture bounding boxes + key computed
 * styles on both origins and report deltas beyond tolerance.
 *
 * Run with agent-browser serving both pages:
 *   original: http://localhost:4321/index.html
 *   port:     http://localhost:4173/
 */
const { execSync } = require('child_process')

const SELECTORS = [
  'header.site-header',
  'header .nav-wrap',
  'header .brand',
  'section.hero h1',
  'section.hero .hero-intro',
  'section.hero .button.primary',
  'section.hero .hero-scene',
  'section.hero .hero-workspace',
  'section.hero .orbit-left',
  'section.hero .orbit-right',
  'section.hero .pill-left',
  'section.hero .pill-right',
  'section.familiar-band .audience-row',
  '#first-workflow .section-heading h2',
  '.use-case-tabs',
  '.use-case-tabs button',
  '#use-case-panel .case-copy h3',
  '#use-case-panel .case-demo',
  '.helpers-section .helper-grid',
  '.helpers-section .helper-card',
  '.journey-section .center-heading h2',
  '.journey-section .journey-grid article',
  '.context-section h2',
  '.context-section .context-board',
  '.control-section .trace-visual',
  '.time-section .time-card',
  '.time-section .time-calculator',
  '.learn-section .guide-grid .guide-card',
  '.faq-section .faq-list details',
  'section.closing h2',
  'footer.site-footer',
]

const PROBE = `JSON.stringify((() => {
  const selectors = ${JSON.stringify(SELECTORS)};
  const pick = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width), h: Math.round(r.height),
      font: cs.fontSize, bg: cs.backgroundColor, color: cs.color,
      display: cs.display, radius: cs.borderRadius,
    };
  };
  const out = {};
  for (const s of selectors) {
    const el = document.querySelector(s);
    out[s] = { box: pick(el), count: document.querySelectorAll(s).length };
  }
  return out;
})())`.replace(/\n\s*/g, ' ')

function probe(url) {
  execSync(`agent-browser open ${url}`, { stdio: 'pipe' })
  execSync('agent-browser wait --load networkidle', { stdio: 'pipe' })
  const raw = execSync(`agent-browser eval ${JSON.stringify(PROBE)}`, { encoding: 'utf8' })
  return JSON.parse(JSON.parse(raw.trim()))
}

const original = probe('http://localhost:4321/index.html')
const ported = probe('http://localhost:4173/')

let issues = 0
for (const selector of SELECTORS) {
  const a = original[selector]
  const b = ported[selector]
  if (!a || !b) {
    console.log(`MISSING  ${selector}`)
    issues++
    continue
  }
  if (a.count !== b.count) {
    console.log(`COUNT    ${selector}: original=${a.count} port=${b.count}`)
    issues++
  }
  const boxA = a.box
  const boxB = b.box
  if (!boxA || !boxB) {
    console.log(`NO-BOX   ${selector} ${boxA ? 'port' : 'original'} missing`)
    issues++
    continue
  }
  const deltas = []
  for (const key of ['w', 'h']) {
    const d = Math.abs(boxA[key] - boxB[key])
    if (d > 2) deltas.push(`${key} ${boxA[key]}→${boxB[key]}`)
  }
  // y drift is expected ABOVE a given element once any earlier section
  // differs in height; report the first drifted section separately.
  for (const key of ['font', 'bg', 'display']) {
    if (boxA[key] !== boxB[key]) deltas.push(`${key} ${boxA[key]}→${boxB[key]}`)
  }
  if (deltas.length) {
    console.log(`DELTA    ${selector}: ${deltas.join(', ')}`)
    issues++
  }
}

// Section heights: the real fidelity signal.
const SECTION_PROBE = `JSON.stringify((() => {
  const out = {};
  for (const el of document.querySelectorAll('main > section, footer.site-footer')) {
    const r = el.getBoundingClientRect();
    const key = el.className.split(' ').filter(Boolean).slice(0, 2).join('.') || el.tagName;
    out[key] = Math.round(r.height);
  }
  return out;
})())`.replace(/\n\s*/g, ' ')

function sections(url) {
  execSync(`agent-browser open ${url}`, { stdio: 'pipe' })
  execSync('agent-browser wait --load networkidle', { stdio: 'pipe' })
  const raw = execSync(`agent-browser eval ${JSON.stringify(SECTION_PROBE)}`, { encoding: 'utf8' })
  return JSON.parse(JSON.parse(raw.trim()))
}

const sa = sections('http://localhost:4321/index.html')
const sb = sections('http://localhost:4173/')
console.log('\n--- section heights (original vs port) ---')
for (const key of Object.keys(sa)) {
  const d = Math.abs((sa[key] || 0) - (sb[key] || 0))
  const flag = d > 4 ? '  <-- DRIFT' : ''
  console.log(`${key.padEnd(30)} ${String(sa[key]).padStart(6)} ${String(sb[key] ?? '—').padStart(6)}${flag}`)
}

console.log(`\n${issues === 0 ? 'MATCH: layout is same-to-same' : issues + ' deltas found (see above)'}`)
