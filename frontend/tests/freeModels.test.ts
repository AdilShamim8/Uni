import { describe, expect, it } from 'vitest'
import { FREE_ROUTES, freeRouteFor } from '@/features/settings/freeModels'
import type { ProviderKind } from '@/domain/types'

describe('free-models catalog integrity', () => {
  it('has a curated set of routes covering cloud and local', () => {
    expect(FREE_ROUTES.length).toBeGreaterThanOrEqual(10)
    expect(FREE_ROUTES.some((route) => route.local)).toBe(true)
    expect(FREE_ROUTES.some((route) => !route.local)).toBe(true)
  })

  it('has unique ids and labels', () => {
    const ids = FREE_ROUTES.map((route) => route.id)
    const labels = FREE_ROUTES.map((route) => route.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('every route has honest, non-empty copy', () => {
    for (const route of FREE_ROUTES) {
      expect(route.label.trim().length).toBeGreaterThan(0)
      expect(route.headline.trim().length).toBeGreaterThan(0)
      // The honest catch must be stated — no fake "unlimited" claims.
      expect(route.limits.trim().length).toBeGreaterThan(0)
      // Beginner steps: enough to actually follow (open, get key, paste).
      expect(route.steps.length).toBeGreaterThanOrEqual(3)
      for (const step of route.steps) {
        expect(step.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('cloud routes point at the provider console; local routes need no key', () => {
    for (const route of FREE_ROUTES) {
      if (route.local) {
        expect(route.signupUrl).toBe('')
        expect(route.endpointUrl).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/)
      } else {
        expect(route.signupUrl).toMatch(/^https:\/\//)
        expect(route.endpointUrl).toMatch(/^https:\/\//)
      }
    }
  })

  it('every route suggests at least one starter model with a valid id', () => {
    for (const route of FREE_ROUTES) {
      expect(route.models.length).toBeGreaterThanOrEqual(1)
      for (const model of route.models) {
        expect(model.id.trim().length).toBeGreaterThan(0)
        expect(model.label.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('OpenRouter free route only suggests :free model ids', () => {
    const openrouter = FREE_ROUTES.find((route) => route.id === 'openrouter-free')
    expect(openrouter).not.toBeNull()
    for (const model of openrouter!.models) {
      expect(model.id.endsWith(':free')).toBe(true)
    }
  })
})

describe('freeRouteFor matching', () => {
  it('matches a draft by trimmed endpoint and kind', () => {
    const route = freeRouteFor('openai-compatible', '  https://api.groq.com/openai/v1  ')
    expect(route?.id).toBe('groq')
  })

  it('does not match across kinds', () => {
    // The same endpoint with the wrong kind is a different setup.
    expect(freeRouteFor('local', 'https://api.groq.com/openai/v1')).toBeNull()
  })

  it('returns null for unknown or empty endpoints', () => {
    expect(freeRouteFor('openai-compatible', '')).toBeNull()
    expect(freeRouteFor('openai-compatible', 'https://example.invalid/v1')).toBeNull()
  })

  it('finds every catalog route through its own endpoint', () => {
    for (const route of FREE_ROUTES) {
      const found = freeRouteFor(route.kind as ProviderKind, route.endpointUrl)
      expect(found?.id).toBe(route.id)
    }
  })
})
