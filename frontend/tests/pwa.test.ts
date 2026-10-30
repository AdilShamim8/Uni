import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from '@/app/pwa'

/**
 * The PWA bootstrap is deliberately conservative: production-only,
 * secure-context-only, and silent-failure. These tests pin that contract
 * so the worker can never interfere with dev, tests, or BYOK traffic.
 */

type NavigatorLike = {
  serviceWorker?: { register: (path: string) => Promise<void> }
}

const originalNavigator = window.navigator
const originalIsSecureContext = window.isSecureContext

function setNavigator(overrides: NavigatorLike): void {
  Object.defineProperty(window, 'navigator', {
    value: { ...originalNavigator, ...overrides },
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  Object.defineProperty(window, 'navigator', {
    value: originalNavigator,
    configurable: true,
  })
  Object.defineProperty(window, 'isSecureContext', {
    value: originalIsSecureContext,
    configurable: true,
  })
  vi.restoreAllMocks()
})

describe('registerServiceWorker', () => {
  it('registers /sw.js on window load in production over a secure context', async () => {
    vi.stubEnv('PROD', true)
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    })
    const register = vi.fn().mockResolvedValue(undefined)
    setNavigator({ serviceWorker: { register } })

    let registered = false
    const addEventListener = vi.spyOn(window, 'addEventListener').mockImplementation(
      (type, listener) => {
        if (type === 'load' && typeof listener === 'function') {
          listener(new Event('load'))
          registered = true
        }
        return undefined
      },
    )

    registerServiceWorker()

    expect(registered).toBe(true)
    expect(register).toHaveBeenCalledWith('/sw.js')
    addEventListener.mockRestore()
    vi.unstubAllEnvs()
  })

  it('does nothing when there is no serviceWorker container', () => {
    vi.stubEnv('PROD', true)
    const addEventListener = vi.spyOn(window, 'addEventListener')
    setNavigator({})

    registerServiceWorker()

    expect(addEventListener).not.toHaveBeenCalled()
    addEventListener.mockRestore()
    vi.unstubAllEnvs()
  })

  it('does nothing outside production builds', () => {
    // import.meta.env.PROD is false under `vitest` (the test preset).
    const register = vi.fn()
    setNavigator({ serviceWorker: { register } })

    registerServiceWorker()

    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing in insecure contexts', () => {
    vi.stubEnv('PROD', true)
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
    })
    const register = vi.fn()
    setNavigator({ serviceWorker: { register } })

    registerServiceWorker()

    expect(register).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('swallows registration failures instead of throwing', async () => {
    vi.stubEnv('PROD', true)
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    setNavigator({
      serviceWorker: {
        register: vi.fn().mockRejectedValue(new Error('registration failed')),
      },
    })

    const addEventListener = vi.spyOn(window, 'addEventListener').mockImplementation(
      (type, listener) => {
        if (type === 'load' && typeof listener === 'function') {
          // A rejected register must not surface as an unhandled rejection.
          void Promise.resolve()
            .then(() => listener(new Event('load')))
            .then(() => expect(warn).toHaveBeenCalled())
        }
        return undefined
      },
    )

    expect(() => registerServiceWorker()).not.toThrow()
    addEventListener.mockRestore()
    vi.unstubAllEnvs()
  })
})
