/**
 * Fixture content for the advanced workflow previews. Everything here is
 * original Universe content, explicitly labeled as simulated in the UI.
 */

export const RESEARCH_STEPS = [
  'Planning the investigation',
  'Searching example sources',
  'Reading and extracting',
  'Synthesizing the report',
] as const

export function buildResearchReport(brief: string): string {
  const topic = brief.trim() || 'the requested topic'
  return `# Research report — ${topic}

_Simulated research output. The steps, findings, and sources below are fixture content; no real search or reading occurred._

## Summary

This report demonstrates the shape of a Universe research result: a short synthesis, structured findings with numbered citations, open questions, and a transparent source list. In a later milestone the same interface will be driven by a real provider adapter, with the evidence trail kept equally explicit.

## Key findings

1. **Framing matters.** The brief — “${topic}” — is best approached by separating what is known, what is assumed, and what is decidable now. [1]
2. **Small verified beats large assumed.** Evidence gathered from a few checkable sources outperforms broad but unverified claims when the goal is a decision. [2]
3. **Write the summary last.** Synthesis is a verification pass: if the summary cannot be traced back to the sources, the research is not done. [3]

## Open questions

- Which constraints are fixed, and which are merely habitual?
- What would change the conclusion if it were wrong?
- Who is the audience, and what do they need to do with this?

## Sources

1. [Example Journal — Topic Overview](https://example.org/journal/topic-overview) — example fixture
2. [Example Notes — Practical Summary](https://example.com/notes/practical-summary) — example fixture
3. [Example Archive — Background Reading](https://example.net/archive/background) — example fixture`
}

export interface TranscriptLine {
  speaker: 'you' | 'universe'
  text: string
}

export const VOICE_TRANSCRIPT: TranscriptLine[] = [
  { speaker: 'you', text: 'Can you help me think through a small balcony garden?' },
  {
    speaker: 'universe',
    text: 'Happily. Three questions first: how much direct sun does it get, what survives your winters, and how much watering will actually happen?',
  },
  { speaker: 'you', text: 'Morning sun only, and I travel sometimes.' },
  {
    speaker: 'universe',
    text: 'Then lean on hardy, drought-tolerant plants in the two largest pots you can fit, and keep a watering day anchored to your return day.',
  },
]

export const CANVAS_DOCUMENT = `# Project brief — neighborhood tool library

**Goal:** a small lending shelf for tools that neighbors use rarely but
everyone needs occasionally.

## Scope for the first month

- One shelf, twelve tools, a paper sign-out sheet
- A weekend launch event with coffee and a fix-it table
- A simple rule: borrow for a week, return working

## Open questions

- Where does the shelf live in winter?
- Who repairs what breaks, and with what budget?
- Do we need any permissions for the launch event?

_Note: this document is a bundled fixture. Edits stay in this panel for
the session and are not persisted.`

export const CANVAS_CODE = `// Fixture code for the Canvas code tab — rendered, never executed.
type Tool = { id: string; name: string; borrowedBy?: string }

export function overdueTools(shelf: Tool[], days: number): Tool[] {
  const cutoff = Date.now() - days * 86_400_000
  return shelf.filter((tool) => tool.borrowedBy && tool.id.length % 2 === 0 && cutoff > 0)
}`

export const SAMPLE_CSV = `month,checkouts,new_members
2026-01,214,18
2026-02,198,14
2026-03,246,21
2026-04,268,25
2026-05,312,31
2026-06,358,42
2026-07,401,47
2026-08,389,39
2026-09,342,28
2026-10,318,22`

export interface SampleSummary {
  rows: number
  columns: string[]
  highlights: string[]
  chart: { label: string; value: number }[]
}

/** Precomputed fixture summary — the app does not compute on uploads. */
export const SAMPLE_SUMMARY: SampleSummary = {
  rows: 10,
  columns: ['month', 'checkouts', 'new_members'],
  highlights: [
    'Checkouts peaked in July at 401 and eased through the autumn.',
    'New members track seasonality: strongest June–August.',
    'Every month in the fixture is net-positive for both columns.',
  ],
  chart: [
    { label: 'Jan', value: 214 },
    { label: 'Feb', value: 198 },
    { label: 'Mar', value: 246 },
    { label: 'Apr', value: 268 },
    { label: 'May', value: 312 },
    { label: 'Jun', value: 358 },
    { label: 'Jul', value: 401 },
    { label: 'Aug', value: 389 },
    { label: 'Sep', value: 342 },
    { label: 'Oct', value: 318 },
  ],
}

export interface AssistantPreset {
  id: string
  label: string
  description: string
  instruction: string
}

/** Local instructions only — no marketplace, no remote agents. */
export const ASSISTANT_PRESETS: AssistantPreset[] = [
  {
    id: 'general',
    label: 'General helper',
    description: 'Balanced, clear answers with a relevant follow-up',
    instruction: 'Answer clearly and offer one useful follow-up question.',
  },
  {
    id: 'concise',
    label: 'Concise explainer',
    description: 'Short answers in plain language',
    instruction: 'Answer in at most three short sentences, plain language only.',
  },
  {
    id: 'reviewer',
    label: 'Code reviewer',
    description: 'Careful, constructive feedback on code',
    instruction: 'Review code for correctness and clarity; suggest concrete improvements.',
  },
  {
    id: 'brainstormer',
    label: 'Creative brainstormer',
    description: 'Many varied ideas, judgment deferred',
    instruction: 'Offer varied ideas as short bullets; defer judgment and build on the topic.',
  },
  {
    id: 'editor',
    label: 'Careful editor',
    description: 'Tightens prose without changing meaning',
    instruction: 'Improve clarity and flow while preserving meaning and voice.',
  },
]

export const SAMPLE_ARTWORKS = [
  { file: '/samples/orbit-hills.svg', title: 'Orbit Hills' },
  { file: '/samples/geometric-bloom.svg', title: 'Geometric Bloom' },
  { file: '/samples/constellation-notes.svg', title: 'Constellation Notes' },
] as const
