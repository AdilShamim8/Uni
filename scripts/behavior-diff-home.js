/**
 * Behavioral parity check: run the same interaction script against the
 * original ReWoo page and the Uni port, and compare observable results
 * (tab panel text, calculator output, FAQ open state, mobile nav).
 *
 * original: http://localhost:4321/index.html
 * port:     http://localhost:4173/
 */
const { execSync } = require('child_process')

const NL = 'String.fromCharCode(10)'

const INTERACT = [
  `JSON.stringify((() => {`,
  `  const out = {};`,
  `  const tabs = [...document.querySelectorAll('.use-case-tabs button')];`,
  `  const titles = [];`,
  `  for (const tab of tabs) {`,
  `    tab.click();`,
  `    titles.push(document.querySelector('.case-copy h3')?.innerText.split(${NL}).join(' '));`,
  `  }`,
  `  out.tabTitles = titles;`,
  `  out.tabCount = tabs.length;`,
  `  const ranges = document.querySelectorAll('.time-calculator input[type=range]');`,
  `  const count = document.querySelector('#task-count') || ranges[0];`,
  `  const mins = document.querySelector('#task-minutes') || ranges[1];`,
  `  if (count && mins) {`,
  `    const set = (el, v) => {`,
  `      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;`,
  `      setter.call(el, v);`,
  `      el.dispatchEvent(new Event('input', { bubbles: true }));`,
  `      el.dispatchEvent(new Event('change', { bubbles: true }));`,
  `    };`,
  `    set(count, '12');`,
  `    set(mins, '30');`,
  `    out.calculator = document.querySelector('.time-result strong')?.innerText;`,
  `  }`,
  `  const details = document.querySelectorAll('.faq-list details')[2];`,
  `  if (details) {`,
  `    details.open = true;`,
  `    details.dispatchEvent(new Event('toggle'));`,
  `    out.faqOpen = details.open;`,
  `    out.faqAnswerStart = details.querySelector('p')?.innerText.slice(0, 40);`,
  `  }`,
  `  out.helperCards = document.querySelectorAll('.helper-card').length;`,
  `  out.helperNames = [...document.querySelectorAll('.helper-card h3')].map((h) => h.innerText);`,
  `  out.guideCards = document.querySelectorAll('.guide-card').length;`,
  `  out.faqCount = document.querySelectorAll('.faq-list details').length;`,
  `  out.footerColumns = document.querySelectorAll('.footer-top > div').length;`,
  `  out.h1 = document.querySelector('h1')?.innerText.split(${NL}).join(' ');`,
  `  return out;`,
  `})())`,
].join('')

function interact(url) {
  execSync('agent-browser set viewport 1440 900', { stdio: 'pipe' })
  execSync(`agent-browser open ${url}`, { stdio: 'pipe' })
  execSync('agent-browser wait --load networkidle', { stdio: 'pipe' })
  const raw = execSync(`agent-browser eval ${JSON.stringify(INTERACT)}`, { encoding: 'utf8' })
  return JSON.parse(JSON.parse(raw.trim()))
}

const original = interact('http://localhost:4321/index.html')
const ported = interact('http://localhost:4173/')

for (const key of Object.keys(original)) {
  const a = JSON.stringify(original[key])
  const b = JSON.stringify(ported[key])
  console.log(`${a === b ? 'MATCH ' : 'DIFFER'} ${key}: ${a === b ? a : `${a}  vs  ${b}`}`)
}

// Mobile check on the port.
const MOBILE_PROBE = [
  `JSON.stringify((() => {`,
  `  const out = {};`,
  `  const toggle = document.querySelector('.mobile-toggle');`,
  `  out.hamburgerVisible = toggle && getComputedStyle(toggle).display !== 'none';`,
  `  out.desktopNavHidden = getComputedStyle(document.querySelector('.desktop-nav')).display === 'none';`,
  `  out.h1FontSize = getComputedStyle(document.querySelector('.home-hero h1')).fontSize;`,
  `  out.noHorizontalOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;`,
  `  if (toggle) toggle.click();`,
  `  out.mobileNavOpened = [...document.querySelectorAll('.mobile-nav')].some((n) => !n.hidden && getComputedStyle(n).display !== 'none');`,
  `  out.mobileLinks = document.querySelectorAll('.mobile-nav a').length;`,
  `  return out;`,
  `})())`,
].join('')

execSync('agent-browser set viewport 390 844', { stdio: 'pipe' })
execSync('agent-browser open http://localhost:4173/', { stdio: 'pipe' })
execSync('agent-browser wait --load networkidle', { stdio: 'pipe' })
const mobileRaw = execSync(`agent-browser eval ${JSON.stringify(MOBILE_PROBE)}`, { encoding: 'utf8' })
const mobile = JSON.parse(JSON.parse(mobileRaw.trim()))
console.log('\n--- mobile 390px (port) ---')
console.log(JSON.stringify(mobile, null, 2))
