import { describe, expect, it } from 'vitest'
import {
  createEmployeeRequestSchema,
  employeeCategorySchema,
  employeeDtoSchema,
  patchEmployeeRequestSchema,
} from '../src/index.js'

/** Server-side employees (agent profiles): identity is server-derived. */
describe('employee category vocabulary', () => {
  it('accepts personal and specialist only', () => {
    expect(employeeCategorySchema.safeParse('personal').success).toBe(true)
    expect(employeeCategorySchema.safeParse('specialist').success).toBe(true)
    expect(employeeCategorySchema.safeParse('team').success).toBe(false)
  })
})

describe('employee DTO', () => {
  it('accepts a full profile with soft provider pin and archive flag', () => {
    const dto = {
      id: 'emp_1',
      name: 'Researcher',
      description: 'Finds sources.',
      instructions: 'Be terse.',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: ['read'],
      starters: ['Draft a brief'],
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    }
    expect(employeeDtoSchema.parse(dto)).toEqual(dto)
  })
})

describe('employee create/patch requests', () => {
  it('creation requires a non-empty bounded name after trimming', () => {
    expect(createEmployeeRequestSchema.safeParse({ name: 'Writer' }).success).toBe(true)
    expect(createEmployeeRequestSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createEmployeeRequestSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false)
  })

  it('creation bounds the roster arrays (tools 50, starters 12)', () => {
    expect(
      createEmployeeRequestSchema.safeParse({ name: 'W', tools: Array.from({ length: 51 }, () => 'read') })
        .success,
    ).toBe(false)
    expect(
      createEmployeeRequestSchema.safeParse({
        name: 'W',
        starters: Array.from({ length: 13 }, () => 'Hi'),
      }).success,
    ).toBe(false)
  })

  it('a patch with no fields is rejected', () => {
    expect(patchEmployeeRequestSchema.safeParse({}).success).toBe(false)
    expect(patchEmployeeRequestSchema.safeParse({ archived: true }).success).toBe(true)
  })
})

describe('employee field bounds', () => {
  it('descriptions cap at 2,000 and instructions at 20,000 characters', () => {
    expect(createEmployeeRequestSchema.safeParse({ name: 'W', description: 'x'.repeat(2_001) }).success).toBe(false)
    expect(createEmployeeRequestSchema.safeParse({ name: 'W', description: 'x'.repeat(2_000) }).success).toBe(true)
    expect(
      createEmployeeRequestSchema.safeParse({ name: 'W', instructions: 'x'.repeat(20_001) }).success,
    ).toBe(false)
    expect(
      createEmployeeRequestSchema.safeParse({ name: 'W', instructions: 'x'.repeat(20_000) }).success,
    ).toBe(true)
  })

  it('each tool name is bounded at 100 characters', () => {
    expect(
      createEmployeeRequestSchema.safeParse({ name: 'W', tools: ['x'.repeat(101)] }).success,
    ).toBe(false)
    expect(
      createEmployeeRequestSchema.safeParse({ name: 'W', tools: ['x'.repeat(100)] }).success,
    ).toBe(true)
  })
})
