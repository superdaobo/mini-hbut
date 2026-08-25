import { describe, expect, it } from 'vitest'
import { useViewportBreakpoint, VIEWPORT_QUERY } from './useViewportBreakpoint'

describe('useViewportBreakpoint', () => {
  it('keeps breakpoint queries as the single source of truth', () => {
    expect(VIEWPORT_QUERY.tablet).toBe('(min-width: 768px)')
    expect(VIEWPORT_QUERY.desktop).toBe('(min-width: 1024px)')
  })

  it('degrades to a constant false without window.matchMedia (vitest node env)', () => {
    expect(typeof window).toBe('undefined')
    const wide = useViewportBreakpoint()
    expect(wide.value).toBe(false)
  })
})
