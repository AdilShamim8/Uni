import { describe, expect, it } from 'vitest'
import {
  FREE_ROUTES,
  RETIRED_FREE_ROUTES,
  freeRouteFor,
  retiredRouteFor,
} from '@/features/settings/freeModels'

/**
 * The free-route catalog is refreshed and GitHub Models is retired
 * (U018): the retired route no longer appears as an active free choice,
 * existing profiles pointing at it get an honest explanation, and the
 * catalog contains only real documented models with honest local-route
 * steps (no fake "type any word" keys since keyless is real, U012).
 */

describe('free-route catalog (U018)', () => {
  it('GitHub Models no longer appears as an active free choice', () => {
    expect(FREE_ROUTES.some((route) => route.id === 'github-models')).toBe(false)
    // And nothing still points at its endpoint.
    expect(FREE_ROUTES.some((route) => route.endpointUrl.includes('models.github.ai'))).toBe(false)
    // Onboarding via route lookup cannot target it either.
    expect(freeRouteFor('openai-compatible', 'https://models.github.ai/inference')).toBeNull()
  })

  it('the retirement is explained for existing profiles on every known host', () => {
    const retired = RETIRED_FREE_ROUTES.find((route) => route.id === 'github-models')
    expect(retired).toBeDefined()
    for (const host of retired!.hosts) {
      expect(retiredRouteFor(`https://${host}/inference`)).toBe(retired)
    }
    // Non-matching endpoints get no retirement banner.
    expect(retiredRouteFor('https://api.groq.com/openai/v1')).toBeNull()
    expect(retiredRouteFor('not a url')).toBeNull()
    // The explanation is honest: no automatic credential moves.
    expect(retired!.explanation).toContain('nothing was moved to another host')
  })

  it('catalog model ids are real documented models — no invented ids', () => {
    const ids = FREE_ROUTES.flatMap((route) => route.models.map((model) => model.id))
    const suspicious = [/gemma-4/, /nemotron-3\.5/, /inkling/i, /gemini-3\.8/]
    for (const id of ids) {
      expect(suspicious.some((pattern) => pattern.test(id)), `id ${id} looks invented`).toBe(false)
    }
    // And the refreshed entries are present.
    expect(ids).toContain('gemini-2.5-flash')
    expect(ids).toContain('google/gemma-3-27b-it:free')
    expect(ids).toContain('deepseek/deepseek-chat-v3-0324:free')
  })

  it('local routes tell the truth: no key is needed (keyless is real)', () => {
    const localRoutes = FREE_ROUTES.filter((route) => route.local)
    expect(localRoutes.length).toBeGreaterThanOrEqual(2)
    for (const route of localRoutes) {
      expect(route.signupUrl).toBe('')
      expect(route.steps.some((step) => /no key is needed/i.test(step))).toBe(true)
      // The old fake-key instruction is gone.
      expect(route.steps.some((step) => /type any word/i.test(step))).toBe(false)
    }
  })

  it('active routes keep honest limits and provider-owned signup links', () => {
    for (const route of FREE_ROUTES) {
      if (route.local) continue
      expect(route.limits.length).toBeGreaterThan(10)
      expect(route.signupUrl.startsWith('https://')).toBe(true)
      expect(route.signupUrl).not.toContain('uni.')
    }
  })
})
