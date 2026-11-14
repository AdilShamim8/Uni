import { describe, expect, it } from 'vitest'
import {
  createWorkTaskRequestSchema,
  patchWorkTaskRequestSchema,
  workTaskActionRequestSchema,
  workTaskDeliverableSchema,
  workTaskStatusSchema,
  workToolReceiptSchema,
  workRunReceiptsSchema,
} from '../src/index.js'

/** Durable Work tasks: state machine, deliverables, actions, receipts. */
describe('work task vocabulary', () => {
  it('statuses mirror the task machine honestly', () => {
    for (const status of ['draft', 'running', 'blocked', 'complete', 'cancelled', 'error']) {
      expect(workTaskStatusSchema.safeParse(status).success).toBe(true)
    }
    expect(workTaskStatusSchema.safeParse('paused').success).toBe(false)
  })

  it('deliverables name what the task should produce', () => {
    for (const deliverable of [
      'research-report',
      'data-report',
      'email-draft',
      'document-draft',
      'generic',
    ]) {
      expect(workTaskDeliverableSchema.safeParse(deliverable).success).toBe(true)
    }
    expect(workTaskDeliverableSchema.safeParse('slide-deck').success).toBe(false)
  })
})

describe('work task requests', () => {
  it('creation defaults the goal to empty and the deliverable to generic', () => {
    expect(createWorkTaskRequestSchema.parse({ title: 'Research competitors' })).toEqual({
      title: 'Research competitors',
      goal: '',
      deliverable: 'generic',
    })
  })

  it('a patch with no fields is rejected', () => {
    expect(patchWorkTaskRequestSchema.safeParse({}).success).toBe(false)
  })
})

describe('work task actions', () => {
  it('start and cancel carry no payload; answer carries the answer', () => {
    expect(workTaskActionRequestSchema.safeParse({ action: 'start' }).success).toBe(true)
    expect(workTaskActionRequestSchema.safeParse({ action: 'cancel' }).success).toBe(true)
    expect(
      workTaskActionRequestSchema.safeParse({ action: 'answer', answer: 'Use source A.' }).success,
    ).toBe(true)
  })

  it('an answer without text, or an unknown action, is rejected', () => {
    expect(workTaskActionRequestSchema.safeParse({ action: 'answer' }).success).toBe(false)
    expect(workTaskActionRequestSchema.safeParse({ action: 'answer', answer: '   ' }).success).toBe(
      false,
    )
    expect(workTaskActionRequestSchema.safeParse({ action: 'pause' }).success).toBe(false)
  })
})

describe('work receipts', () => {
  it('a tool receipt records the same status the event stream shows', () => {
    const receipt = { tool: 'read', outcome: 'ok', detail: 'read 12 lines', at: 1 }
    expect(workToolReceiptSchema.parse(receipt)).toEqual(receipt)
    expect(workToolReceiptSchema.safeParse({ ...receipt, outcome: 'skipped' }).success).toBe(false)
  })

  it('run receipts cite only sources that exist and name the provenance', () => {
    const receipts = {
      sources: [
        { kind: 'conversation', id: 'cv_1' },
        { kind: 'file', id: 'doc_1' },
      ],
      tools: [{ tool: 'read', outcome: 'ok', detail: 'read', at: 1 }],
      provenance: 'provider-generated',
    }
    expect(workRunReceiptsSchema.parse(receipts)).toEqual(receipts)
    expect(
      workRunReceiptsSchema.safeParse({ ...receipts, provenance: 'hand-written' }).success,
    ).toBe(false)
    expect(
      workRunReceiptsSchema.safeParse({ ...receipts, sources: [{ kind: 'email', id: 'x' }] })
        .success,
    ).toBe(false)
  })
})
