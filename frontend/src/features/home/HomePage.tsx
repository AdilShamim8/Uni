import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './home.css'

/* ------------------------------------------------------------------ */
/* Faithful port of the ReWoo marketing home (rewoo.tech, MIT)         */
/* github.com/AdilShamim8/ReWoo — index.html + styles.css + script.js  */
/*                                                                     */
/* Kept same-to-same: DOM structure, class names, copy, palette,       */
/* type scale, the five helper mascots (Woo, Scout, Quill, Tally,      */
/* Hush), the use-case tabs, the busywork calculator, the FAQ, the     */
/* hero reviewable-workflow scene, all responsive breakpoints.         */
/*                                                                     */
/* Rewired for Uni: brand name/mark, internal links point at Uni's     */
/* real destinations (/chat /work /agents /plugins /library) instead   */
/* of ReWoo's separate static pages.                                   */
/* ------------------------------------------------------------------ */

const HELPER = (name: string) => `/helpers-orig/${name}.svg`
const BRAND_MARK = '/helpers-orig/uni-mark.svg'

/* --- the inline icon set, identical strokes to the original ------- */

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ArrowIcon = () => (
  <Icon>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Icon>
)

const MenuIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

const CheckIcon = () => (
  <Icon>
    <path d="m5 12 4 4 10-10" />
  </Icon>
)

const SparkIcon = () => (
  <Icon>
    <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" />
  </Icon>
)

const BookIcon = () => (
  <Icon>
    <path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z" />
  </Icon>
)

const PenIcon = () => (
  <Icon>
    <path d="m4 20 4-1 12-12-3-3L5 16l-1 4Zm10-13 3 3" />
  </Icon>
)

const SearchIcon = () => (
  <Icon>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 5 5" />
  </Icon>
)

const FolderIcon = () => (
  <Icon>
    <path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Icon>
)

const LockIcon = () => (
  <Icon>
    <rect x="5" y="10" width="14" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
  </Icon>
)

const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
)

const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

const CloseIcon = () => (
  <Icon>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
)

/* --- shared voice pieces ------------------------------------------ */

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>
}

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-link">
      {children}
      <ArrowIcon />
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* Site header — same structure: brand, two mega-menu groups, links   */
/* ------------------------------------------------------------------ */

function SiteHeader({ onClearContext }: { onClearContext: () => void }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!event.target || !(event.target as HTMLElement).closest('.nav-group')) {
        setOpenGroup(null)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenGroup(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const groups: Array<{
    id: string
    label: string
    items: Array<{ to: string; strong: string; span: string }>
  }> = [
    {
      id: 'explore',
      label: 'Explore',
      items: [
        { to: '/agents', strong: 'Meet your helpers', span: 'Five teammates. Real everyday jobs.' },
        { to: '/work', strong: 'Everyday workflows', span: 'Give repetitive work a clear path.' },
        { to: '/library', strong: 'Your context, your rules', span: 'Choose what your helpers can use.' },
        { to: '/plugins', strong: 'Tools & connections', span: 'Start with the tools you know.' },
      ],
    },
    {
      id: 'learn',
      label: 'Learn',
      items: [
        { to: '/chat', strong: 'Start using AI', span: 'One useful step at a time.' },
        { to: '/work', strong: 'Describe an outcome', span: 'Begin with one simple win.' },
        { to: '/library', strong: 'Privacy basics', span: 'Share less. Understand more.' },
      ],
    },
  ]

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link to="/" className="brand" aria-label="Uni home">
          <img src={BRAND_MARK} alt="" width="32" height="32" />
          <span>
            Uni<span className="brand-dot">.</span>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {groups.map((group) => (
            <div
              key={group.id}
              ref={(el) => {
                groupRefs.current[group.id] = el
              }}
              className={`nav-group${openGroup === group.id ? ' open' : ''}`}
            >
              <button
                type="button"
                className="nav-trigger"
                aria-expanded={openGroup === group.id}
                onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              >
                {group.label}
                <span className="chevron" />
              </button>
              <div className="mega-menu">
                {group.items.map((item) => (
                  <Link key={item.strong} to={item.to}>
                    <strong>{item.strong}</strong>
                    <span>{item.span}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <Link to="/work">For teams</Link>
          <Link to="/library">Guides</Link>
        </nav>
        <div className="nav-actions">
          <Link to="/chat" className="quiet-link">
            Open the app
          </Link>
          <Link to="/chat" className="button small primary">
            Try Uni
            <ArrowIcon />
          </Link>
          <button
            type="button"
            className="mobile-toggle"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {!mobileOpen ? null : (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">
          <Link to="/agents">Meet your helpers</Link>
          <Link to="/work">Workflows</Link>
          <Link to="/chat">Use AI</Link>
          <Link to="/work">For teams</Link>
          <Link to="/library">Memory &amp; privacy</Link>
          <Link to="/plugins">Connections</Link>
          <Link to="/library">Guides</Link>
          <Link to="/chat">Open the app</Link>
          <button type="button" className="text-button" onClick={onClearContext}>
            Clear demo data
          </button>
        </nav>
      )}
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Hero — announcement, headline, the reviewable workflow scene       */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="hero home-hero">
      <div className="container">
        <Link to="/chat" className="announcement">
          <span className="status-dot" />
          Your next chapter with AI starts here
          <ArrowIcon />
        </Link>
        <h1>
          A little AI.
          <br />
          A lot more{' '}
          <span className="accent-word">
            you
            <svg viewBox="0 0 210 16" aria-hidden="true">
              <path d="M3 12Q90-3 205 8" />
            </svg>
          </span>
          .
        </h1>
        <p className="hero-intro">
          Less “where do I start?” More “I&apos;ve got this.”
          <br />
          Learn AI, find your rhythm and turn everyday tasks into useful workflows.
        </p>
        <div className="button-row">
          <Link to="/chat" className="button primary">
            Find my first workflow
            <ArrowIcon />
          </Link>
          <a href="#first-workflow" className="button secondary">
            Show me how it works
            <ArrowIcon />
          </a>
        </div>
        <p className="hero-note">No coding. No big leap. One useful step at a time.</p>
        <div className="hero-scene" aria-label="Illustration of a reviewable Uni workflow">
          <div className="scene-grid" />
          <div className="orbit-card orbit-left">
            <span className="mini-label">A CLEARER START</span>
            <p>
              “Make my week
              <br />
              a little lighter.”
            </p>
            <span className="tiny-avatars">
              <img src={HELPER('woo')} alt="" width="40" height="40" />
              <img src={HELPER('quill')} alt="" width="40" height="40" />
            </span>
          </div>
          <div className="hero-workspace">
            <div className="window-bar">
              <div className="window-dots">
                <i />
                <i />
                <i />
              </div>
              <span>YOUR FIRST SMALL WIN</span>
              <span>↗</span>
            </div>
            <div className="workspace-preview-body">
              <div className="preview-greeting">
                <img src={HELPER('woo')} alt="Woo" width="66" height="66" />
                <div>
                  <span>WITH WOO</span>
                  <h3>Let&apos;s make today lighter.</h3>
                </div>
              </div>
              <div className="preview-prompt">
                Turn my meeting notes into next steps.
                <span>↵</span>
              </div>
              <div className="preview-step">
                <span className="step-dot">1</span>
                <div>
                  <strong>Understand the notes</strong>
                  <small>Use only the information you provide</small>
                </div>
                <span className="preview-check">
                  <CheckIcon />
                </span>
              </div>
              <div className="preview-step">
                <span className="step-dot">2</span>
                <div>
                  <strong>Make an action list</strong>
                  <small>Flag missing owners and dates</small>
                </div>
                <span className="preview-check">
                  <CheckIcon />
                </span>
              </div>
              <div className="preview-approval">
                <span>
                  <LockIcon /> You review the next step.
                </span>
                <span className="approval-pill">Ready to review</span>
              </div>
            </div>
          </div>
          <div className="orbit-card orbit-right">
            <img src={HELPER('quill')} alt="Quill" width="115" height="115" />
            <span className="mini-label">YOUR WRITING PARTNER</span>
            <p>
              A draft that
              <br />
              sounds like you.
            </p>
          </div>
          <div className="float-pill pill-left">
            <BookIcon /> Learn while you work
          </div>
          <div className="float-pill pill-right">
            <CheckIcon /> Your judgement stays in charge
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Audience band                                                       */
/* ------------------------------------------------------------------ */

function AudienceBand() {
  return (
    <section className="familiar-band">
      <div className="container">
        <p>For your workday. Your side project. Your next idea.</p>
        <div className="audience-row">
          <span>Independent professionals</span>
          <i />
          <span>Small teams</span>
          <i />
          <span>Curious beginners</span>
          <i />
          <span>Everyday people</span>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Use-case tabs — same four cases, same copy, same demo cards        */
/* ------------------------------------------------------------------ */

const CASES = {
  daily: {
    label: 'EVERYDAY ORGANISATION',
    title: 'A plan you can\nactually follow.',
    description:
      'Turn the list in your head into a short, realistic plan. Make room for the things that matter, and keep the decisions yours.',
    agent: 'WOO · YOUR EVERYDAY ORGANISER',
    input: '“I have five things to do and no idea where to start.”',
    resultLabel: 'A LIGHTER PLAN',
    result: [
      'Choose today’s most important task',
      'Give it one focused work block',
      'Keep a little breathing room',
    ],
    helper: 'woo',
    prompt: 'Help me plan my week. I want a realistic priority list and time for focused work.',
  },
  writing: {
    label: 'WRITING WITH CONFIDENCE',
    title: 'Your words. A clearer first draft.',
    description:
      'Get past the blank page. Start from your own notes, set the tone and check the details before you send anything.',
    agent: 'QUILL · YOUR WRITING PARTNER',
    input: '“Help me follow up after today’s meeting.”',
    resultLabel: 'A DRAFT TO REVIEW',
    result: [
      'Use only the meeting notes provided',
      'Leave missing details as placeholders',
      'Review the draft before sharing',
    ],
    helper: 'quill',
    prompt:
      'Help me draft a friendly follow-up email after a meeting. Leave unknown names and dates as placeholders.',
  },
  research: {
    label: 'MAKING SENSE OF INFORMATION',
    title: 'Less noise. A clearer comparison.',
    description:
      'Organise the options, record what you know and identify the evidence you still need. A confident answer needs a checkable source.',
    agent: 'SCOUT · YOUR RESEARCH COMPANION',
    input: '“Help me compare the options without guessing.”',
    resultLabel: 'A CHECKABLE COMPARISON',
    result: [
      'Choose your comparison criteria',
      'Record facts and sources together',
      'Keep missing evidence visible',
    ],
    helper: 'scout',
    prompt:
      'Help me compare three options. Make a criteria table, include a source column and flag missing evidence.',
  },
  team: {
    label: 'A CLEARER TEAM HANDOFF',
    title: 'Good notes. Useful next steps.',
    description:
      'Turn a discussion into an action list your team can understand. Confirm the owners and dates rather than filling gaps with guesses.',
    agent: 'WOO · YOUR EVERYDAY ORGANISER',
    input: '“Turn our meeting notes into an action list.”',
    resultLabel: 'A TEAM ACTION LIST',
    result: [
      'Separate decisions from actions',
      'Confirm owners and deadlines',
      'Review before handing off to the team',
    ],
    helper: 'woo',
    prompt:
      'Help me turn meeting notes into a team action list with owners and deadlines. Do not invent missing details.',
  },
} as const

type CaseKey = keyof typeof CASES

const CASE_TABS: Array<{ key: CaseKey; id: string; label: string; icon: ReactNode }> = [
  { key: 'daily', id: 'case-daily', label: 'Organise my day', icon: <SparkIcon /> },
  { key: 'writing', id: 'case-writing', label: 'Write with confidence', icon: <PenIcon /> },
  { key: 'research', id: 'case-research', label: 'Make sense of information', icon: <SearchIcon /> },
  { key: 'team', id: 'case-team', label: 'Work better together', icon: <FolderIcon /> },
]

function UseCaseSection() {
  const [active, setActive] = useState<CaseKey>('daily')
  const panelId = 'use-case-panel'
  const current = CASES[active]

  const onTabKey = (event: React.KeyboardEvent, index: number) => {
    const order = CASE_TABS.map((tab) => tab.id)
    let target: number | undefined
    if (event.key === 'ArrowRight') target = (index + 1) % order.length
    if (event.key === 'ArrowLeft') target = (index + order.length - 1) % order.length
    if (event.key === 'Home') target = 0
    if (event.key === 'End') target = order.length - 1
    if (target !== undefined) {
      event.preventDefault()
      setActive(CASE_TABS[target].key)
      document.getElementById(order[target])?.focus()
    }
  }

  return (
    <section id="first-workflow" className="section use-case-section">
      <div className="container">
        <div className="section-heading">
          <div>
            <Eyebrow>START WITH SOMETHING REAL</Eyebrow>
            <h2>
              What would make
              <br />
              your day a little easier?
            </h2>
          </div>
          <p>
            You don&apos;t have to change everything.
            <br />
            Pick one task you already know.
          </p>
        </div>
        <div className="use-case-tabs" role="tablist" aria-label="Everyday workflow examples">
          {CASE_TABS.map((tab, index) => (
            <button
              key={tab.key}
              role="tab"
              id={tab.id}
              aria-selected={active === tab.key}
              aria-controls={panelId}
              tabIndex={active === tab.key ? 0 : -1}
              onKeyDown={(event) => onTabKey(event, index)}
              onClick={() => setActive(tab.key)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <div id={panelId} className="case-panel" role="tabpanel" aria-labelledby={`case-${active}`}>
          <div className="case-copy">
            <span className="mini-label" data-case-label>
              {current.label}
            </span>
            <h3 data-case-title>{current.title}</h3>
            <p data-case-description>{current.description}</p>
            <Link to="/chat" className="button primary" data-case-link>
              Try this example <ArrowIcon />
            </Link>
            <p className="small-note">Interactive example. No live AI or connected apps.</p>
          </div>
          <div className="case-demo">
            <div className="demo-topline">
              <span className="live-dot" />
              <span data-case-agent>
                {current.agent}
              </span>
              <span className="demo-label">DEMO</span>
            </div>
            <div className="demo-message" data-case-input>
              {current.input}
            </div>
            <div className="flow-line">
              <span>Understand</span>
              <i />
              <span>Organise</span>
              <i />
              <span>You review</span>
            </div>
            <div className="example-result" data-case-result>
              <span className="result-label">{current.resultLabel}</span>
              {current.result.map((item) => (
                <div className="result-item" key={item}>
                  <span className="check-square" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers — the five mascots, original colors and copy               */
/* ------------------------------------------------------------------ */

const HELPERS = [
  {
    name: 'Woo',
    job: 'Your everyday organiser',
    file: 'woo',
    color: 'purple',
    blurb: 'A calmer day starts here.',
    to: '/chat',
  },
  {
    name: 'Scout',
    job: 'Your research companion',
    file: 'scout',
    color: 'blue',
    blurb: 'Find the signal in the noise.',
    to: '/library',
  },
  {
    name: 'Quill',
    job: 'Your writing partner',
    file: 'quill',
    color: 'coral',
    blurb: 'Sound like yourself. Just clearer.',
    to: '/chat',
  },
  {
    name: 'Tally',
    job: 'Your planning helper',
    file: 'tally',
    color: 'green',
    blurb: 'Less spreadsheet fog. More clarity.',
    to: '/work',
  },
  {
    name: 'Hush',
    job: 'Your private teammate',
    file: 'hush',
    color: 'yellow',
    blurb: 'Some things should stay close.',
    to: '/library',
  },
] as const

function HelpersSection() {
  return (
    <section className="section helpers-section">
      <div className="container">
        <div className="section-heading">
          <div>
            <Eyebrow>A TEAM THAT MAKES SENSE</Eyebrow>
            <h2>
              Meet your new
              <br />
              “I can do this” team.
            </h2>
          </div>
          <div>
            <p>
              Different jobs. One familiar place to start.
              <br />
              Built around the helpers in our open-source app.
            </p>
            <TextLink to="/agents">Get to know the team</TextLink>
          </div>
        </div>
        <div className="helper-grid">
          {HELPERS.map((helper) => (
            <Link key={helper.name} className={`helper-card ${helper.color}`} to={helper.to}>
              <span className="helper-job">{helper.job}</span>
              <div className="helper-art">
                <img
                  src={HELPER(helper.file)}
                  width="240"
                  height="240"
                  alt={`${helper.name}, Uni ${helper.job}`}
                  loading="lazy"
                />
              </div>
              <div className="helper-card-bottom">
                <h3>{helper.name}</h3>
                <span className="circle-arrow">
                  <ArrowIcon />
                </span>
              </div>
              <p>{helper.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Journey — three steps with the paper illustrations                 */
/* ------------------------------------------------------------------ */

function JourneySection() {
  return (
    <section className="section journey-section">
      <div className="container">
        <div className="center-heading">
          <Eyebrow>FROM CURIOUS TO CAPABLE</Eyebrow>
          <h2>
            Learn it. Try it.
            <br />
            Make it part of your day.
          </h2>
          <p>You shouldn&apos;t have to become an engineer to benefit from AI.</p>
        </div>
        <div className="journey-grid">
          <article>
            <span className="journey-number">01</span>
            <div className="journey-art">
              <div className="lesson-paper">
                <BookIcon />
                <strong>A useful first prompt</strong>
                <div className="paper-line" />
                <div className="paper-line short" />
                <span className="paper-tag">Small lesson. Real skill.</span>
              </div>
            </div>
            <h3>Learn the useful bits.</h3>
            <p>
              Plain-language guides on prompts, privacy and checking an answer. Start wherever you
              are.
            </p>
            <TextLink to="/library">Explore the guides</TextLink>
          </article>
          <article>
            <span className="journey-number">02</span>
            <div className="journey-art">
              <div className="prompt-paper">
                <span className="bubble">“Help me turn this into a plan.”</span>
                <span className="response-bubble">Let&apos;s take it one step at a time.</span>
              </div>
            </div>
            <h3>Try it on your own work.</h3>
            <p>
              Use a guided example to see the inputs, the steps and the review that a workflow
              needs.
            </p>
            <TextLink to="/chat">Try a workflow</TextLink>
          </article>
          <article>
            <span className="journey-number">03</span>
            <div className="journey-art">
              <div className="routine-paper">
                <span>MY WEEKLY RESET</span>
                <div>
                  <CheckIcon /> Inputs understood
                </div>
                <div>
                  <CheckIcon /> Review checklist saved
                </div>
                <div>
                  <ClockIcon /> Ready to repeat
                </div>
              </div>
            </div>
            <h3>Keep what works.</h3>
            <p>
              Save a useful template. When you&apos;re ready, explore routines in the local app or
              get setup help.
            </p>
            <TextLink to="/work">Find your next step</TextLink>
          </article>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Context — the dark board section                                   */
/* ------------------------------------------------------------------ */

function ContextSection() {
  return (
    <section className="section context-section">
      <div className="container split">
        <div>
          <Eyebrow>ONE CONTEXT. YOUR BOUNDARIES.</Eyebrow>
          <h2>
            A little understanding
            <br />
            goes a long way.
          </h2>
          <p>
            Give your helpers the background that matters. Choose what they can use. Keep the rest
            to yourself.
          </p>
          <ul className="feature-list">
            <li>
              <CheckIcon /> Your preferences, in your words
            </li>
            <li>
              <CheckIcon /> Clear source and review boundaries
            </li>
            <li>
              <CheckIcon /> A receipt of the context used in the local app
            </li>
          </ul>
          <Link to="/library" className="button light">
            Explore memory &amp; privacy
            <ArrowIcon />
          </Link>
        </div>
        <div className="context-visual">
          <div className="context-board">
            <div className="context-board-header">
              YOUR CONTEXT
              <span>
                <LockIcon /> You choose
              </span>
            </div>
            <div className="context-chip">
              <span className="color-dot coral-dot" />
              <div>
                <strong>How I write</strong>
                <small>Friendly. Clear. No jargon.</small>
              </div>
              <span className="chip-check">✓</span>
            </div>
            <div className="context-chip">
              <span className="color-dot blue-dot" />
              <div>
                <strong>What I&apos;m working on</strong>
                <small>Notes relevant to this task.</small>
              </div>
              <span className="chip-check">✓</span>
            </div>
            <div className="context-chip muted-chip">
              <span className="color-dot yellow-dot" />
              <div>
                <strong>Private information</strong>
                <small>Not included in this example.</small>
              </div>
              <LockIcon />
            </div>
            <div className="context-sharing">
              <img src={HELPER('woo')} alt="Woo" width="52" height="52" />
              <img src={HELPER('scout')} alt="Scout" width="52" height="52" />
              <img src={HELPER('quill')} alt="Quill" width="52" height="52" />
              <span>
                Useful context.
                <br />
                Shared with care.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Control — the review trace                                         */
/* ------------------------------------------------------------------ */

function ControlSection() {
  return (
    <section className="section control-section">
      <div className="container split">
        <div className="trace-visual">
          <div className="trace-heading">
            <span>
              <SparkIcon /> A WORKFLOW YOU CAN FOLLOW
            </span>
            <span className="demo-label">EXAMPLE</span>
          </div>
          <ol className="trace-list">
            <li>
              <span className="trace-dot">1</span>
              <div>
                <strong>Read the notes you selected</strong>
                <small>Source: your example meeting notes</small>
              </div>
              <span className="trace-state">Checked</span>
            </li>
            <li>
              <span className="trace-dot">2</span>
              <div>
                <strong>Draft the next steps</strong>
                <small>Missing dates stay visible</small>
              </div>
              <span className="trace-state">Drafted</span>
            </li>
            <li className="trace-review">
              <span className="trace-dot">3</span>
              <div>
                <strong>Leave the decision with you</strong>
                <small>Review before anything is shared</small>
              </div>
              <LockIcon />
            </li>
          </ol>
        </div>
        <div>
          <Eyebrow>HELPFUL SHOULD ALSO BE UNDERSTANDABLE</Eyebrow>
          <h2>
            See the steps.
            <br />
            Keep the say.
          </h2>
          <p>
            AI is easier to trust when you can see its inputs, understand the process and check the
            result. Our examples make those steps visible.
          </p>
          <p>
            The local app adds task traces and approval controls. Start with a draft, then decide
            what happens next.
          </p>
          <Link to="/chat" className="button secondary">
            See a guided workflow
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Time calculator                                                     */
/* ------------------------------------------------------------------ */

function TimeSection() {
  const [taskCount, setTaskCount] = useState(5)
  const [taskMinutes, setTaskMinutes] = useState(15)
  const estimate = ((taskCount * taskMinutes * 4) / 60).toFixed(1)

  return (
    <section className="section time-section">
      <div className="container">
        <div className="time-card">
          <div>
            <Eyebrow>MAKE THE OPPORTUNITY CONCRETE</Eyebrow>
            <h2>
              What could a little
              <br />
              less busywork mean?
            </h2>
            <p>
              Try your own estimate. A useful place to start a conversation, not a promise of
              results.
            </p>
          </div>
          <div className="time-calculator">
            <label htmlFor="task-count">
              Tasks you repeat each week <output>{taskCount}</output>
            </label>
            <input
              id="task-count"
              type="range"
              min={1}
              max={30}
              value={taskCount}
              onChange={(event) => setTaskCount(Number(event.target.value))}
            />
            <label htmlFor="task-minutes">
              Minutes per task <output>{taskMinutes}</output>
            </label>
            <input
              id="task-minutes"
              type="range"
              min={5}
              max={90}
              step={5}
              value={taskMinutes}
              onChange={(event) => setTaskMinutes(Number(event.target.value))}
            />
            <div className="time-result">
              <strong>{estimate}</strong>
              <span>
                hours of work per four-week month
                <br />
                <small>Potential to improve — actual savings need testing.</small>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Guides                                                              */
/* ------------------------------------------------------------------ */

const GUIDES = [
  {
    href: '/chat',
    number: '01',
    tag: 'START HERE',
    cover: 'cover-0',
    icon: <SparkIcon />,
    meta: '6 min read · Practical guide',
    title: 'Your first useful AI task',
    blurb: 'Choose one small job, write a clear request and check the result.',
  },
  {
    href: '/chat',
    number: '02',
    tag: 'PRACTICAL SKILL',
    cover: 'cover-1',
    icon: <PenIcon />,
    meta: '8 min read · Practical guide',
    title: 'A clearer prompt, a better starting point',
    blurb: 'A simple four-part method for asking AI for useful help.',
  },
  {
    href: '/library',
    number: '03',
    tag: 'GOOD HABITS',
    cover: 'cover-2',
    icon: <LockIcon />,
    meta: '7 min read · Practical guide',
    title: 'Know what you share with AI',
    blurb: 'Understand browser storage, local models and the information a task needs.',
  },
] as const

function GuidesSection() {
  return (
    <section className="section learn-section">
      <div className="container">
        <div className="section-heading">
          <div>
            <Eyebrow>NO JARGON REQUIRED</Eyebrow>
            <h2>
              Your AI confidence
              <br />
              starts with one small skill.
            </h2>
          </div>
          <TextLink to="/library">All practical guides</TextLink>
        </div>
        <div className="guide-grid">
          {GUIDES.map((guide) => (
            <Link key={guide.number} className="guide-card" to={guide.href}>
              <div className={`guide-cover ${guide.cover}`}>
                <span>{guide.number}</span>
                {guide.icon}
                <small>{guide.tag}</small>
              </div>
              <div className="guide-body">
                <div className="meta">{guide.meta}</div>
                <h3>{guide.title}</h3>
                <p>{guide.blurb}</p>
                <span className="text-link">
                  Read the guide <ArrowIcon />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FAQ — the same six questions                                       */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: 'Do I need to know how to code?',
    a: 'No. The learning guides and interactive examples start with ordinary tasks and plain language. If you need a custom workflow, you can ask Uni for implementation help.',
  },
  {
    q: 'Is the website demo using a live AI model?',
    a: 'No. The website demo uses guided examples and rules to show how a workflow can work. The separate open-source app supports real model connections and includes an offline demo mode.',
  },
  {
    q: 'What happens to the information I add?',
    a: 'The website stores demo context in your browser only when you choose to save it. You can clear it at any time. The open-source app has its own local data store and source controls. Hosting and model-provider choices affect where data is processed.',
  },
  {
    q: 'Will Uni send messages or make decisions for me?',
    a: 'The website demo does not send messages or act in other apps. The open-source app includes approval controls and email drafting. Start with reviewable output and agree any production automation separately.',
  },
  {
    q: 'Can you help my small team use AI?',
    a: 'Yes. Uni offers discovery, workflow implementation and ongoing support. The scope, integrations, pricing and delivery schedule are agreed for your project.',
  },
  {
    q: 'Is Order Desk Pro part of Uni?',
    a: 'Yes. Order Desk Pro is a separate specialist apparel product. It remains accessible, while this homepage focuses on learning AI and improving everyday work.',
  },
] as const

function FaqSection() {
  return (
    <section className="section faq-section">
      <div className="container faq-layout">
        <div>
          <Eyebrow>A FEW GOOD QUESTIONS</Eyebrow>
          <h2>
            Curious?
            <br />
            You&apos;re in good company.
          </h2>
          <p>Start with the basics. Ask the next question.</p>
          <TextLink to="/chat">Talk to us</TextLink>
        </div>
        <div className="faq-list">
          {FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>
                {faq.q}
                <span>
                  <PlusIcon />
                </span>
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Closing + footer                                                    */
/* ------------------------------------------------------------------ */

function Closing() {
  return (
    <section className="closing section">
      <div className="container">
        <div className="closing-orb" aria-hidden="true">
          <SparkIcon />
        </div>
        <Eyebrow>YOUR NEXT SMALL WIN</Eyebrow>
        <h2>
          You do not need to be technical.
          <br />
          You just need a place to start.
        </h2>
        <p>Bring a task. Leave with a clearer way to do it.</p>
        <div className="button-row">
          <Link to="/chat" className="button primary">
            Find your first workflow
            <ArrowIcon />
          </Link>
          <Link to="/library" className="button secondary">
            Learn the basics
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  )
}

function SiteFooter({ onClearContext }: { onClearContext: () => void }) {
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <div className="footer-brand">
          <Link to="/" className="brand">
            <img src={BRAND_MARK} alt="" width="34" height="34" />
            <span>Uni.</span>
          </Link>
          <p>
            A little AI. A lot more you.
            <br />
            Learn, organise and get useful work done.
          </p>
          <a
            className="text-link"
            href="https://github.com/AdilShamim8/Uni"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the open-source app ↗
          </a>
        </div>
        <div>
          <h3>Explore</h3>
          <Link to="/agents">AI helpers</Link>
          <Link to="/work">Workflows</Link>
          <Link to="/library">Memory &amp; privacy</Link>
          <Link to="/plugins">Connections</Link>
          <Link to="/chat">Interactive demo</Link>
        </div>
        <div>
          <h3>Get started</h3>
          <Link to="/chat">Use AI</Link>
          <Link to="/library">Guides</Link>
          <Link to="/work">For teams</Link>
          <Link to="/chat">Talk to Uni</Link>
        </div>
        <div>
          <h3>Uni</h3>
          <Link to="/chat">Our story</Link>
          <Link to="/plugins">Open source</Link>
          <a href="https://github.com/AdilShamim8/Uni" target="_blank" rel="noopener noreferrer">
            Order Desk Pro
          </a>
          <a href="mailto:adilshamim696@gmail.com">Email the founder</a>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 Uni. Built for people.</span>
        <div>
          <Link to="/library">Privacy</Link>
          <Link to="/library">Terms</Link>
          <button type="button" className="text-button" onClick={onClearContext}>
            Clear demo data
          </button>
        </div>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/* Toast + page                                                        */
/* ------------------------------------------------------------------ */

export function HomePage() {
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [toastMessage])

  const clearContext = () => {
    try {
      localStorage.removeItem('rewoo.demo.context.v1')
      localStorage.removeItem('rewoo.demo.templates.v1')
      localStorage.removeItem('rewoo.learning.v1')
      setToastMessage('Demo context, learning progress and templates cleared.')
    } catch {
      setToastMessage('Browser storage is unavailable in this session.')
    }
  }

  return (
    <div className="uni-home">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader onClearContext={clearContext} />
      <main id="main">
        <Hero />
        <AudienceBand />
        <UseCaseSection />
        <HelpersSection />
        <JourneySection />
        <ContextSection />
        <ControlSection />
        <TimeSection />
        <GuidesSection />
        <FaqSection />
        <Closing />
      </main>
      <SiteFooter onClearContext={clearContext} />
      {toastMessage ? (
        <div className="toast show" role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </div>
  )
}
