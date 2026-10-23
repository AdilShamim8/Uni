import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tooltip } from '@/components/ui/Tooltip'
import { setupAppTest } from './helpers'

/* ------------------------------------------------------------------ */
/* Regression — centered tooltips clipped off-screen on narrow viewports */
/* ------------------------------------------------------------------ */

describe('Tooltip viewport clamping', () => {
  setupAppTest()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function stubViewport(width: number, restore: () => void) {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    })
    return () => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalWidth,
      })
      restore()
    }
  }

  it('shifts a right-overflowing tooltip back inside the viewport', () => {
    // Mobile composer trigger near the right edge: the centered bubble ran
    // 65px past the 390px viewport edge, slicing the hint mid-word.
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    spy.mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'tooltip') {
        return {
          x: 300, y: 100, top: 100, bottom: 130, left: 300, right: 450,
          width: 150, height: 30, toJSON: () => ({}),
        }
      }
      return { x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }
    })
    const restore = stubViewport(390, () => undefined)
    try {
      render(
        <Tooltip label="Make this conversation temporary (not saved)">
          <button type="button">trigger</button>
        </Tooltip>,
      )
      const tip = screen.getByRole('tooltip')
      // Right edge 450 → clamp target 390 - 8 = 382 → shift = -68px.
      expect(tip.style.getPropertyValue('--tip-shift')).toBe('-68.0px')
    } finally {
      restore()
    }
  })

  it('shifts a left-overflowing tooltip back inside the viewport', () => {
    // The composer's attach hint started 60px left of the screen edge.
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    spy.mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'tooltip') {
        return {
          x: -60, y: 100, top: 100, bottom: 130, left: -60, right: 158,
          width: 218, height: 30, toJSON: () => ({}),
        }
      }
      return { x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }
    })
    const restore = stubViewport(390, () => undefined)
    try {
      render(
        <Tooltip label="Attach images or files (kept local)">
          <button type="button">trigger</button>
        </Tooltip>,
      )
      const tip = screen.getByRole('tooltip')
      // Left edge -60 → clamp target 8 → shift = +68px.
      expect(tip.style.getPropertyValue('--tip-shift')).toBe('68.0px')
    } finally {
      restore()
    }
  })

  it('leaves a tooltip that already fits unshifted', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    spy.mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'tooltip') {
        return {
          x: 120, y: 100, top: 100, bottom: 130, left: 120, right: 270,
          width: 150, height: 30, toJSON: () => ({}),
        }
      }
      return { x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }
    })
    const restore = stubViewport(390, () => undefined)
    try {
      render(
        <Tooltip label="Focus mode">
          <button type="button">trigger</button>
        </Tooltip>,
      )
      const tip = screen.getByRole('tooltip')
      expect(tip.style.getPropertyValue('--tip-shift')).toBe('0px')
    } finally {
      restore()
    }
  })
})
