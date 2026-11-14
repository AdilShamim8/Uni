import { describe, expect, it } from 'vitest'
import { TASK_TEMPLATES, inferDeliverable } from '@/features/work/taskTemplates'

/** Work starter templates + the deterministic goal→deliverable inference. */
describe('TASK_TEMPLATES', () => {
  it('offers the three starters with distinct deliverable ids', () => {
    expect(TASK_TEMPLATES.map((template) => template.id)).toEqual([
      'research-report',
      'data-review',
      'email-draft',
    ])
    for (const template of TASK_TEMPLATES) {
      expect(template.label.length).toBeGreaterThan(0)
      expect(template.blurb.length).toBeGreaterThan(0)
      expect(template.icon).toBeDefined()
    }
  })
})

describe('inferDeliverable', () => {
  it('defaults to a research brief', () => {
    expect(inferDeliverable('Compare three note-taking apps for my team')).toBe('research-report')
    expect(inferDeliverable('')).toBe('research-report')
  })

  it('mail-shaped goals infer an email draft', () => {
    expect(inferDeliverable('Draft an email to the vendor about the invoice')).toBe('email-draft')
    expect(inferDeliverable('Write a follow-up with the recruiter')).toBe('email-draft')
    expect(inferDeliverable('A short note to my landlord')).toBe('email-draft')
  })

  it('data-shaped goals infer a data review', () => {
    expect(inferDeliverable('Profile this CSV of Q3 sales')).toBe('data-review')
    expect(inferDeliverable('Analyze the dataset and summarize caveats')).toBe('data-review')
    expect(inferDeliverable('Summarize the spreadsheet statistics')).toBe('data-review')
  })

  it('email wins over data when both appear', () => {
    expect(inferDeliverable('Email the analysis of the CSV to Dana')).toBe('email-draft')
  })
})
