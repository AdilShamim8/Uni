import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Briefcase,
  Compass,
  Cpu,
  Feather,
  Lock,
  Sparkles,
} from 'lucide-react'
import './home.css'

/* ------------------------------------------------------------------ */
/* Small shared primitives                                             */
/* ------------------------------------------------------------------ */

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={`uh-icon${className ? ` ${className}` : ''}`}
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

const Arrow = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Icon>
)

function PrimaryButton({
  to,
  children,
  small,
  onClick,
}: {
  to?: string
  children: ReactNode
  small?: boolean
  onClick?: () => void
}) {
  const classes = `uh-button uh-primary${small ? ' uh-small' : ''}`
  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
        <Arrow />
      </Link>
    )
  }
  return (
    <button type="button" className={classes} onClick={onClick}>
      {children}
      <Arrow />
    </button>
  )
}

function SecondaryButton({
  to,
  children,
  href,
}: {
  to?: string
  children: ReactNode
  href?: string
}) {
  if (to) {
    return (
      <Link to={to} className="uh-button uh-secondary">
        {children}
        <Arrow />
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className="uh-button uh-secondary" target="_blank" rel="noopener noreferrer">
        {children}
        <Arrow />
      </a>
    )
  }
  return null
}

function TextLink({ to, children, href }: { to?: string; children: ReactNode; href?: string }) {
  if (to) {
    return (
      <Link to={to} className="uh-text-link">
        {children}
        <Arrow />
      </Link>
    )
  }
  return (
    <a href={href} className="uh-text-link" target="_blank" rel="noopener noreferrer">
      {children}
      <Arrow />
    </a>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="uh-eyebrow">{children}</span>
}

/* ------------------------------------------------------------------ */
/* Header + mobile nav                                                 */
/* ------------------------------------------------------------------ */

const NAV_GROUPS: {
  label: string
  items: { title: string; blurb: string; href: string; external?: boolean }[]
}[] = [
  {
    label: 'Explore',
    items: [
      { title: 'Meet your companions', blurb: 'Five destinations. Real everyday jobs.', href: '#companions' },
      { title: 'Everyday workflows', blurb: 'Give repetitive work a clear path.', href: '#use-cases' },
      { title: 'Your context, your rules', blurb: 'Choose what your chats can use.', href: '#context' },
      { title: 'Tools & connections', blurb: 'Start with the tools you know.', href: '#journey' },
    ],
  },
  {
    label: 'Learn',
    items: [
      { title: 'Start learning AI', blurb: 'Small lessons for useful work.', href: '#guides' },
      { title: 'Your first AI task', blurb: 'Begin with one simple win.', href: '#guides' },
      { title: 'Privacy basics', blurb: 'Share less. Understand more.', href: '#context' },
    ],
  },
]

function SiteHeader() {
  const [openGroup, setOpenGroup] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="uh-site-header">
      <div className="uh-nav-wrap">
        <Link to="/" className="uh-brand" aria-label="Uni home">
          <img src="/universe-mark.svg" alt="" width="32" height="32" />
          <span>
            Uni<span className="uh-brand-dot">.</span>
          </span>
        </Link>

        <nav className="uh-desktop-nav" aria-label="Main navigation">
          {NAV_GROUPS.map((group, index) => (
            <div
              key={group.label}
              className={`uh-nav-group${openGroup === index ? ' uh-open' : ''}`}
              onMouseLeave={() => setOpenGroup(null)}
            >
              <button
                type="button"
                className="uh-nav-trigger"
                aria-expanded={openGroup === index}
                aria-haspopup="true"
                onClick={() => setOpenGroup(openGroup === index ? null : index)}
                onMouseEnter={() => setOpenGroup(index)}
              >
                {group.label}
                <span className="uh-chevron" />
              </button>
              <div className="uh-mega-menu">
                {group.items.map((item) => (
                  <a key={item.title} href={item.href}>
                    <strong>{item.title}</strong>
                    <span>{item.blurb}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
          <a href="#faq" className="uh-quiet-link">
            FAQ
          </a>
          <TextLink href="https://github.com/AdilShamim8/Uni">Open source</TextLink>
        </nav>

        <div className="uh-nav-actions">
          <Link to="/chat" className="uh-quiet-link">
            Open the app
          </Link>
          <Link to="/chat" className="uh-button uh-primary uh-small">
            Try Uni
            <Arrow />
          </Link>
          <button
            type="button"
            className="uh-mobile-toggle"
            aria-expanded={mobileOpen}
            aria-controls="uh-mobile-nav"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <Icon className="uh-icon">
                <path d="m6 6 12 12M18 6 6 18" />
              </Icon>
            ) : (
              <Icon className="uh-icon">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </Icon>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="uh-mobile-nav" className="uh-mobile-nav" aria-label="Mobile navigation">
          <a href="#companions" onClick={() => setMobileOpen(false)}>
            Meet your companions
          </a>
          <a href="#use-cases" onClick={() => setMobileOpen(false)}>
            Workflows
          </a>
          <a href="#journey" onClick={() => setMobileOpen(false)}>
            Learn AI
          </a>
          <a href="#context" onClick={() => setMobileOpen(false)}>
            Memory &amp; privacy
          </a>
          <a href="#control" onClick={() => setMobileOpen(false)}>
            Review &amp; control
          </a>
          <a href="#faq" onClick={() => setMobileOpen(false)}>
            FAQ
          </a>
          <Link to="/chat" onClick={() => setMobileOpen(false)}>
            Open the app
          </Link>
        </nav>
      )}
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="uh-home-hero">
      <div className="uh-container">
        <a className="uh-announcement" href="#free">
          <span className="uh-status-dot" />
          The $0 premium AI workspace starts here
          <Arrow />
        </a>
        <h1>
          You and AI.
          <br />
          A lot more <span className="uh-accent-word">done<svg viewBox="0 0 210 16" aria-hidden="true"><path d="M3 12Q90-3 205 8" /></svg></span>.
        </h1>
        <p className="uh-hero-intro">
          Less &ldquo;where do I start?&rdquo; More &ldquo;I&rsquo;ve got this.&rdquo;
          <br />
          Bring your own key, keep your own data, and turn everyday tasks into useful workflows.
        </p>
        <div className="uh-button-row">
          <PrimaryButton to="/chat">Open your workspace</PrimaryButton>
          <a className="uh-button uh-secondary" href="#use-cases">
            Show me how it works
            <Arrow />
          </a>
        </div>
        <p className="uh-hero-note">No account. No coding. Your keys stay on your device.</p>

        <div className="uh-hero-scene" aria-label="Illustration of a reviewable Uni workflow">
          <div className="uh-scene-grid" />
          <div className="uh-orbit-card uh-orbit-left">
            <span className="uh-mini-label">A CLEARER START</span>
            <p>
              &ldquo;Make my week
              <br />a little lighter.&rdquo;
            </p>            <span className="uh-tiny-avatars">
              <img src="/helpers/nova.svg" alt="" width="40" height="40" />
              <img src="/helpers/atlas.svg" alt="" width="40" height="40" />
            </span>
          </div>

          <div className="uh-hero-workspace">
            <div className="uh-window-bar">
              <div className="uh-window-dots">
                <i />
                <i />
                <i />
              </div>
              <span>YOUR FIRST SMALL WIN</span>
              <span>↗</span>
            </div>
            <div className="uh-workspace-preview-body">
              <div className="uh-preview-greeting">
                <img src="/helpers/nova.svg" alt="Nova" width="66" height="66" />
                <div>
                  <span>WITH NOVA</span>
                  <h3>Let&rsquo;s make today lighter.</h3>
                </div>
              </div>
              <div className="uh-preview-prompt">
                Turn my meeting notes into next steps.
                <span>↵</span>
              </div>
              <div className="uh-preview-step">
                <span className="uh-step-dot">1</span>
                <div>
                  <strong>Understand the notes</strong>
                  <small>Use only the information you provide</small>
                </div>
                <span className="uh-preview-check">
                  <Icon className="uh-icon">
                    <path d="m5 12 4 4 10-10" />
                  </Icon>
                </span>
              </div>
              <div className="uh-preview-step">
                <span className="uh-step-dot">2</span>
                <div>
                  <strong>Make an action list</strong>
                  <small>Flag missing owners and dates</small>
                </div>
                <span className="uh-preview-check">
                  <Icon className="uh-icon">
                    <path d="m5 12 4 4 10-10" />
                  </Icon>
                </span>
              </div>
              <div className="uh-preview-approval">
                <span>
                  <Icon className="uh-icon">
                    <rect x="5" y="10" width="14" height="11" rx="3" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
                  </Icon>{' '}
                  You review the next step.
                </span>
                <span className="uh-approval-pill">Ready to review</span>
              </div>
            </div>
          </div>

          <div className="uh-orbit-card uh-orbit-right">
            <img src="/helpers/echo.svg" alt="Echo" width="115" height="115" />
            <span className="uh-mini-label">YOUR AI TEAMMATES</span>
            <p>
              Agents that
              <br />
              remember you.
            </p>
          </div>

          <div className="uh-float-pill uh-pill-left">
            <Icon className="uh-icon">
              <path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z" />
            </Icon>{' '}
            Learn while you work
          </div>
          <div className="uh-float-pill uh-pill-right">
            <Icon className="uh-icon">
              <path d="m5 12 4 4 10-10" />
            </Icon>{' '}
            Your judgement stays in charge
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
    <section className="uh-familiar-band">
      <div className="uh-container">
        <p>For your workday. Your side project. Your next idea.</p>
        <div className="uh-audience-row">
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
/* Use cases                                                           */
/* ------------------------------------------------------------------ */

interface UseCase {
  id: string
  tabLabel: string
  tabIcon: ReactNode
  label: string
  title: ReactNode
  description: string
  agent: string
  input: string
  flow: string[]
  resultLabel: string
  results: string[]
  startPath: string
  startPrompt: string
}

const USE_CASES: UseCase[] = [
  {
    id: 'chat',
    tabLabel: 'Organise my day',
    tabIcon: <Compass size={16} />,
    label: 'EVERYDAY ORGANISATION',
    title: (
      <>
        A plan you can
        <br />
        actually follow.
      </>
    ),
    description:
      'Turn the list in your head into a short, realistic plan. Make room for the things that matter, and keep the decisions yours.',
    agent: 'NOVA · YOUR EVERYDAY COMPANION',
    input: '&ldquo;I have five things to do and no idea where to start.&rdquo;',
    flow: ['Understand', 'Organise', 'You review'],
    resultLabel: 'A LIGHTER PLAN',
    results: [
      "Choose today's most important task",
      'Give it one focused work block',
      'Keep a little breathing room',
    ],
    startPath: '/chat',
    startPrompt: 'Help me plan my week. I want a realistic priority list and time for focused work.',
  },
  {
    id: 'work',
    tabLabel: 'Run real work',
    tabIcon: <Briefcase size={16} />,
    label: 'OUTCOMES, NOT CHORES',
    title: (
      <>
        Describe the outcome.
        <br />
        Watch it get done.
      </>
    ),
    description:
      'Write a task brief in plain language. A task thread plans, asks inline questions, produces output you refine — not a wall of guesswork.',
    agent: 'ATLAS · YOUR WORK COMPANION',
    input: '&ldquo;Draft the quarterly summary from these notes.&rdquo;',
    flow: ['Clarify', 'Run', 'Refine'],
    resultLabel: 'WORK YOU CAN REVIEW',
    results: ['Inline questions instead of guesses', 'Output cards you refine in place', 'A finish line you can see'],
    startPath: '/work',
    startPrompt: '',
  },
  {
    id: 'agents',
    tabLabel: 'Build a teammate',
    tabIcon: <Cpu size={16} />,
    label: 'AGENTS WITH MEMORY',
    title: (
      <>
        Teammates that
        <br />
        remember you.
      </>
    ),
    description:
      'Persistent AI employees with their own persona, memory notes and assigned work. They keep context across conversations — and you steer them.',
    agent: 'ECHO · YOUR AGENTS COMPANION',
    input: '&ldquo;Remember how I like my emails written.&rdquo;',
    flow: ['Persona', 'Memory', 'You steer'],
    resultLabel: 'A TEAMMATE YOU OWN',
    results: ['Memory notes it keeps between chats', 'Its own conversations and tasks', 'Export and share as one file'],
    startPath: '/agents',
    startPrompt: '',
  },
  {
    id: 'library',
    tabLabel: 'Ground it in facts',
    tabIcon: <BookOpen size={16} />,
    label: 'KNOWLEDGE WITH CITATIONS',
    title: (
      <>
        Less noise.
        <br />
        Cited answers.
      </>
    ),
    description:
      'Load your documents into a local knowledge base. Chats retrieve from it, cite what they used, and stay honest about what they did not find.',
    agent: 'VAULT · YOUR LIBRARY COMPANION',
    input: '&ldquo;Answer from our product notes only.&rdquo;',
    flow: ['Ingest', 'Retrieve', 'Cite'],
    resultLabel: 'AN ANSWER YOU CAN CHECK',
    results: ['Your documents, chunked and searchable', 'A receipt of the context used', 'Missing evidence stays visible'],
    startPath: '/library',
    startPrompt: '',
  },
]

function UseCaseSection() {
  const [active, setActive] = useState(0)
  const panelId = 'uni-home-use-case-panel'
  const activeCase = USE_CASES[active]

  return (
    <section id="use-cases" className="uh-section uh-use-case-section">
      <div className="uh-container">
        <div className="uh-section-heading">
          <div>
            <Eyebrow>START WITH SOMETHING REAL</Eyebrow>
            <h2>
              What would make
              <br />
              your day a little easier?
            </h2>
          </div>
          <p>
            You don&rsquo;t have to change everything.
            <br />
            Pick one task you already know.
          </p>
        </div>

        <div className="uh-use-case-tabs" role="tablist" aria-label="Everyday workflow examples">
          {USE_CASES.map((useCase, index) => (
            <button
              key={useCase.id}
              role="tab"
              aria-selected={index === active}
              aria-controls={panelId}
              id={`uh-case-${useCase.id}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
            >
              {useCase.tabIcon} {useCase.tabLabel}
            </button>
          ))}
        </div>

        <div
          id={panelId}
          className="uh-case-panel"
          role="tabpanel"
          aria-labelledby={`uh-case-${activeCase.id}`}
        >
          <div className="uh-case-copy">
            <span className="uh-mini-label">{activeCase.label}</span>
            <h3>{activeCase.title}</h3>
            <p>{activeCase.description}</p>
            <PrimaryButton to={activeCase.startPath}>Go there now</PrimaryButton>
            <p className="uh-small-note">Works instantly in demo mode — no account, no key.</p>
          </div>

          <div className="uh-case-demo">
            <div className="uh-demo-topline">
              <span className="uh-live-dot" />
              <span>{activeCase.agent}</span>
              <span className="uh-demo-label">DEMO</span>
            </div>
            <div className="uh-demo-message">{activeCase.input}</div>
            <div className="uh-flow-line">
              {activeCase.flow.map((step, index) => (
                <span key={step} style={{ display: 'contents' }}>
                  <span>{step}</span>
                  {index < activeCase.flow.length - 1 && <i />}
                </span>
              ))}
            </div>
            <div className="uh-example-result">
              <span className="uh-result-label">{activeCase.resultLabel}</span>
              {activeCase.results.map((result) => (
                <div key={result} className="uh-result-item">
                  <span className="uh-check-square" />
                  {result}
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
/* Companions                                                          */
/* ------------------------------------------------------------------ */

const COMPANIONS = [
  {
    name: 'Nova',
    job: 'Your everyday chat',
    blurb: 'Every conversation, clearer.',
    art: '/helpers/nova.svg',
    alt: 'Nova, the Uni Chat companion',
    tone: 'uh-purple',
    to: '/chat',
  },
  {
    name: 'Atlas',
    job: 'Your work runner',
    blurb: 'Outcomes, not chores.',
    art: '/helpers/atlas.svg',
    alt: 'Atlas, the Uni Work companion',
    tone: 'uh-blue',
    to: '/work',
  },
  {
    name: 'Echo',
    job: 'Your AI teammates',
    blurb: 'Agents that remember you.',
    art: '/helpers/echo.svg',
    alt: 'Echo, the Uni Agents companion',
    tone: 'uh-coral',
    to: '/agents',
  },
  {
    name: 'Prism',
    job: 'Your local tools',
    blurb: 'Plugins with receipts.',
    art: '/helpers/prism.svg',
    alt: 'Prism, the Uni Plugins companion',
    tone: 'uh-green',
    to: '/plugins',
  },
  {
    name: 'Vault',
    job: 'Your knowledge',
    blurb: 'Answers you can check.',
    art: '/helpers/vault.svg',
    alt: 'Vault, the Uni Library companion',
    tone: 'uh-yellow',
    to: '/library',
  },
]

function CompanionsSection() {
  return (
    <section id="companions" className="uh-section uh-companions-section">
      <div className="uh-container">
        <div className="uh-section-heading">
          <div>
            <Eyebrow>A TEAM THAT MAKES SENSE</Eyebrow>
            <h2>
              Meet your new
              <br />
              &ldquo;I can do this&rdquo; team.
            </h2>
          </div>
          <div>
            <p>
              Different jobs. One familiar place to start.
              <br />
              Every destination below is already in the app.
            </p>
            <TextLink to="/chat">Open the workspace</TextLink>
          </div>
        </div>

        <div className="uh-helper-grid">
          {COMPANIONS.map((companion) => (
            <Link key={companion.name} to={companion.to} className={`uh-helper-card ${companion.tone}`}>
              <span className="uh-helper-job">{companion.job}</span>
              <div className="uh-helper-art">
                <img src={companion.art} width="240" height="240" alt={companion.alt} loading="lazy" />
              </div>
              <div className="uh-helper-card-bottom">
                <h3>{companion.name}</h3>
                <span className="uh-circle-arrow">
                  <Arrow />
                </span>
              </div>
              <p>{companion.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Journey                                                             */
/* ------------------------------------------------------------------ */

function JourneySection() {
  return (
    <section id="journey" className="uh-section uh-journey-section">
      <div className="uh-container">
        <div className="uh-center-heading">
          <Eyebrow>FROM CURIOUS TO CAPABLE</Eyebrow>
          <h2>
            Learn it. Try it.
            <br />
            Make it part of your day.
          </h2>
          <p>You shouldn&rsquo;t have to become an engineer to benefit from AI.</p>
        </div>

        <div className="uh-journey-grid">
          <article>
            <span className="uh-journey-number">01</span>
            <div className="uh-journey-art">
              <div className="uh-lesson-paper">
                <Icon className="uh-icon">
                  <path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z" />
                </Icon>
                <strong>A useful first prompt</strong>
                <div className="uh-paper-line" />
                <div className="uh-paper-line uh-short" />
                <span className="uh-paper-tag">Small lesson. Real skill.</span>
              </div>
            </div>
            <h3>Learn the useful bits.</h3>
            <p>
              Plain-language guides on prompts, providers and checking an answer. Start wherever
              you are — the app works in demo mode from the first second.
            </p>
            <a className="uh-text-link" href="#guides">
              Explore the guides
              <Arrow />
            </a>
          </article>

          <article>
            <span className="uh-journey-number">02</span>
            <div className="uh-journey-art">
              <div className="uh-prompt-paper">
                <span className="uh-bubble">&ldquo;Help me turn this into a plan.&rdquo;</span>
                <span className="uh-response-bubble">Let&rsquo;s take it one step at a time.</span>
              </div>
            </div>
            <h3>Try it on your own work.</h3>
            <p>
              Connect a provider — or don&rsquo;t — and see the inputs, the steps and the review
              that a real workflow needs. Everything stays on your device.
            </p>
            <TextLink to="/chat">Try a conversation</TextLink>
          </article>

          <article>
            <span className="uh-journey-number">03</span>
            <div className="uh-journey-art">
              <div className="uh-routine-paper">
                <span>MY WEEKLY RESET</span>
                <div>
                  <Icon className="uh-icon">
                    <path d="m5 12 4 4 10-10" />
                  </Icon>{' '}
                  Inputs understood
                </div>
                <div>
                  <Icon className="uh-icon">
                    <path d="m5 12 4 4 10-10" />
                  </Icon>{' '}
                  Review checklist saved
                </div>
                <div>
                  <Icon className="uh-icon">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </Icon>{' '}
                  Ready to repeat
                </div>
              </div>
            </div>
            <h3>Keep what works.</h3>
            <p>
              Save a useful agent or template. Export a conversation when it helped. Build a small
              toolbox that fits the way you actually work.
            </p>
            <TextLink to="/agents">Meet your agents</TextLink>
          </article>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Context (dark)                                                      */
/* ------------------------------------------------------------------ */

function ContextSection() {
  return (
    <section id="context" className="uh-section uh-context-section">
      <div className="uh-container uh-split">
        <div>
          <Eyebrow>ONE WORKSPACE. YOUR BOUNDARIES.</Eyebrow>
          <h2>
            A little understanding
            <br />
            goes a long way.
          </h2>
          <p>
            Give your chats the background that matters. Choose what they can use. Keep the rest
            to yourself.
          </p>
          <ul className="uh-feature-list">
            <li>
              <Icon className="uh-icon">
                <path d="m5 12 4 4 10-10" />
              </Icon>{' '}
              Keys stored on your device, never exported
            </li>
            <li>
              <Icon className="uh-icon">
                <path d="m5 12 4 4 10-10" />
              </Icon>{' '}
              A local knowledge base your chats cite
            </li>
            <li>
              <Icon className="uh-icon">
                <path d="m5 12 4 4 10-10" />
              </Icon>{' '}
              Plugin receipts and per-thread grants
            </li>
          </ul>
          <a className="uh-button uh-light" href="#control">
            See how review works
            <Arrow />
          </a>
        </div>

        <div className="uh-context-visual">
          <div className="uh-context-board">
            <div className="uh-context-board-header">
              YOUR CONTEXT
              <span>
                <Icon className="uh-icon">
                  <rect x="5" y="10" width="14" height="11" rx="3" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
                </Icon>{' '}
                You choose
              </span>
            </div>
            <div className="uh-context-chip">
              <span className="uh-color-dot uh-coral-dot" />
              <div>
                <strong>How I write</strong>
                <small>Friendly. Clear. No jargon.</small>
              </div>
              <span className="uh-chip-check">✓</span>
            </div>
            <div className="uh-context-chip">
              <span className="uh-color-dot uh-blue-dot" />
              <div>
                <strong>What I&rsquo;m working on</strong>
                <small>Notes relevant to this task.</small>
              </div>
              <span className="uh-chip-check">✓</span>
            </div>
            <div className="uh-context-chip uh-muted-chip">
              <span className="uh-color-dot uh-yellow-dot" />
              <div>
                <strong>Private information</strong>
                <small>Not included in this example.</small>
              </div>
              <Icon className="uh-icon">
                <rect x="5" y="10" width="14" height="11" rx="3" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
              </Icon>
            </div>
            <div className="uh-context-sharing">
              <img src="/helpers/nova.svg" alt="Nova" width="52" height="52" />
              <img src="/helpers/atlas.svg" alt="Atlas" width="52" height="52" />
              <img src="/helpers/echo.svg" alt="Echo" width="52" height="52" />
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
/* Control / trace                                                     */
/* ------------------------------------------------------------------ */

function ControlSection() {
  return (
    <section id="control" className="uh-section uh-control-section">
      <div className="uh-container uh-split">
        <div className="uh-trace-visual">
          <div className="uh-trace-heading">
            <span>
              <Icon className="uh-icon">
                <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" />
              </Icon>{' '}
              A WORKFLOW YOU CAN FOLLOW
            </span>
            <span className="uh-demo-label">EXAMPLE</span>
          </div>
          <ol className="uh-trace-list">
            <li>
              <span className="uh-trace-dot">1</span>
              <div>
                <strong>Read the notes you selected</strong>
                <small>Source: your knowledge base entry</small>
              </div>
              <span className="uh-trace-state">Cited</span>
            </li>
            <li>
              <span className="uh-trace-dot">2</span>
              <div>
                <strong>Draft the next steps</strong>
                <small>Missing dates stay visible</small>
              </div>
              <span className="uh-trace-state">Drafted</span>
            </li>
            <li className="uh-trace-review">
              <span className="uh-trace-dot">3</span>
              <div>
                <strong>Leave the decision with you</strong>
                <small>Review before anything is shared</small>
              </div>
              <Icon className="uh-icon">
                <rect x="5" y="10" width="14" height="11" rx="3" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
              </Icon>
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
            AI is easier to trust when you can see its inputs, understand the process and check
            the result. Uni makes those steps visible — context receipts in chat, task threads
            with inline questions, plugin grants you approve per thread.
          </p>
          <p>
            Anything simulated is labelled as simulated. If a connection test cannot prove your
            key works, it says so. Honest by design.
          </p>
          <SecondaryButton to="/chat">See it in the app</SecondaryButton>
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
  const hours = ((taskCount * taskMinutes * 4) / 60).toFixed(1)
  const countId = useId()
  const minutesId = useId()

  return (
    <section id="free" className="uh-section uh-time-section">
      <div className="uh-container">
        <div className="uh-time-card">
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
          <div className="uh-time-calculator">
            <label htmlFor={countId}>
              Tasks you repeat each week <output>{taskCount}</output>
            </label>
            <input
              id={countId}
              type="range"
              min={1}
              max={30}
              value={taskCount}
              onChange={(event) => setTaskCount(Number(event.target.value))}
            />
            <label htmlFor={minutesId}>
              Minutes per task <output>{taskMinutes}</output>
            </label>
            <input
              id={minutesId}
              type="range"
              min={5}
              max={90}
              step={5}
              value={taskMinutes}
              onChange={(event) => setTaskMinutes(Number(event.target.value))}
            />
            <div className="uh-time-result">
              <strong>{hours}</strong>
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
    number: '01',
    tag: 'START HERE',
    minutes: '5 min read',
    kind: 'Practical guide',
    title: 'Your first useful AI task',
    blurb: 'Choose one small job, write a clear request and check the result.',
    coverClass: '',
    icon: <Sparkles strokeWidth={1} />,
    to: '/chat',
  },
  {
    number: '02',
    tag: 'PRACTICAL SKILL',
    minutes: '8 min read',
    kind: 'Practical guide',
    title: 'A clearer prompt, a better answer',
    blurb: 'A simple four-part method for asking AI for useful help.',
    coverClass: 'uh-cover-1',
    icon: <Feather strokeWidth={1} />,
    to: '/chat',
  },
  {
    number: '03',
    tag: 'GOOD HABITS',
    minutes: '7 min read',
    kind: 'Practical guide',
    title: 'Know what you share with AI',
    blurb: 'Understand local storage, your own keys and what a task really needs.',
    coverClass: 'uh-cover-2',
    icon: <Lock strokeWidth={1} />,
    to: '/chat',
  },
]

function GuidesSection() {
  return (
    <section id="guides" className="uh-section uh-learn-section">
      <div className="uh-container">
        <div className="uh-section-heading">
          <div>
            <Eyebrow>NO JARGON REQUIRED</Eyebrow>
            <h2>
              Your AI confidence
              <br />
              starts with one small skill.
            </h2>
          </div>
          <TextLink href="https://github.com/AdilShamim8/Uni/blob/main/README.md">
            The full guide in the README
          </TextLink>
        </div>

        <div className="uh-guide-grid">
          {GUIDES.map((guide) => (
            <Link key={guide.number} to={guide.to} className="uh-guide-card">
              <div className={`uh-guide-cover ${guide.coverClass}`}>
                <span>{guide.number}</span>
                <span className="uh-icon" aria-hidden="true">
                  {guide.icon}
                </span>
                <small>{guide.tag}</small>
              </div>
              <div className="uh-guide-body">
                <div className="uh-meta">
                  {guide.minutes} · {guide.kind}
                </div>
                <h3>{guide.title}</h3>
                <p>{guide.blurb}</p>
                <span className="uh-text-link">
                  Read the guide
                  <Arrow />
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
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: 'Is Uni really free?',
    a: 'Yes — MIT-licensed, no accounts required, no paywalled features. Model usage is billed by whoever issues your API key; with a free-tier provider (or local models) that is $0 too.',
  },
  {
    q: 'Where are my API keys stored?',
    a: 'In your browser, in a dedicated slice that is never included in exports. They are sent only to the endpoint you configured. In optional server mode, keys are stored AES-256-GCM-encrypted and never leave the backend unencrypted.',
  },
  {
    q: 'Can I use multiple providers at once?',
    a: 'Yes — add as many profiles as you like and switch models from the top bar. The compare dialog even runs one prompt through two models side by side.',
  },
  {
    q: 'Does Uni need an account?',
    a: 'No. Local mode works instantly with no account and no key — a built-in demo adapter lets you explore everything first. Connect a provider when you are ready.',
  },
  {
    q: 'Can I share an agent I built?',
    a: 'Yes — every agent exports as a small .agent.json file. The file carries the persona only (never your keys or local ids); whoever receives it imports it from the Agents page in one tap.',
  },
  {
    q: 'What is the knowledge base?',
    a: 'A local document collection chats can retrieve from. Paste text or load .md / .txt files in Library → Knowledge base, then attach it from the composer. Chats cite what they used.',
  },
]

function FaqSection() {
  return (
    <section id="faq" className="uh-section uh-faq-section">
      <div className="uh-container uh-faq-layout">
        <div>
          <Eyebrow>A FEW GOOD QUESTIONS</Eyebrow>
          <h2>
            Curious?
            <br />
            You&rsquo;re in good company.
          </h2>
          <p>Start with the basics. Ask the next question.</p>
          <TextLink href="https://github.com/AdilShamim8/Uni">Read the full FAQ</TextLink>
        </div>
        <div className="uh-faq-list">
          {FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>
                {faq.q}
                <span>
                  <Icon className="uh-icon">
                    <path d="M12 5v14M5 12h14" />
                  </Icon>
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
    <section className="uh-section uh-closing">
      <div className="uh-container">
        <div className="uh-closing-orb" aria-hidden="true">
          <Icon className="uh-icon">
            <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" />
          </Icon>
        </div>
        <Eyebrow>YOUR NEXT SMALL WIN</Eyebrow>
        <h2>
          You do not need to be technical.
          <br />
          You just need a place to start.
        </h2>
        <p>Bring a task. Leave with a clearer way to do it.</p>
        <div className="uh-button-row">
          <PrimaryButton to="/chat">Open your workspace</PrimaryButton>
          <a className="uh-button uh-secondary" href="#use-cases">
            Show me how it works
            <Arrow />
          </a>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="uh-site-footer">
      <div className="uh-container uh-footer-top">
        <div className="uh-footer-brand">
          <Link to="/" className="uh-brand">
            <img src="/universe-mark.svg" alt="" width="34" height="34" />
            <span>Uni.</span>
          </Link>
          <p>
            You and AI. A lot more done.
            <br />
            Free, open-source, your own data.
          </p>
          <TextLink href="https://github.com/AdilShamim8/Uni">Explore the open-source app ↗</TextLink>
        </div>
        <div>
          <h3>Explore</h3>
          <Link to="/chat">Chat</Link>
          <Link to="/work">Work</Link>
          <Link to="/agents">Agents</Link>
          <Link to="/library">Library</Link>
          <Link to="/plugins">Plugins</Link>
        </div>
        <div>
          <h3>Get started</h3>
          <a href="#use-cases">Workflows</a>
          <a href="#journey">Learn AI</a>
          <a href="#guides">Guides</a>
          <TextLink href="https://universe-mu-two.vercel.app/">Live demo</TextLink>
        </div>
        <div>
          <h3>Uni</h3>
          <a href="#faq">FAQ</a>
          <a href="https://github.com/AdilShamim8/Uni" target="_blank" rel="noopener noreferrer">
            Open source
          </a>
          <a href="https://github.com/AdilShamim8/Uni/blob/main/README.md" target="_blank" rel="noopener noreferrer">
            Documentation
          </a>
        </div>
      </div>
      <div className="uh-container uh-footer-bottom">
        <span>© 2026 Uni. Built for people.</span>
        <div>
          <a href="https://github.com/AdilShamim8/Uni/blob/main/README.md">Privacy</a>
          <a href="https://github.com/AdilShamim8/Uni/blob/main/README.md">Terms</a>
        </div>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * The marketing home page for Uni — the ReWoo visual language with
 * Uni copy and links into the real app. It deliberately renders
 * OUTSIDE the AppShell: no sidebar, no destination bar, no theme
 * materials — just an honest, self-contained landing page.
 */
export function HomePage() {
  return (
    <div className="uni-home">
      <a className="uh-skip-link" href="#uh-main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="uh-main">
        <Hero />
        <AudienceBand />
        <UseCaseSection />
        <CompanionsSection />
        <JourneySection />
        <ContextSection />
        <ControlSection />
        <TimeSection />
        <GuidesSection />
        <FaqSection />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
