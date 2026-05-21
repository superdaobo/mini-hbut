import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('bottom tab bar safe area contract', () => {
  const appVue = () => readSource('src/App.vue')
  const uxCss = () => readSource('src/styles/ui_ux_pro_max.css')

  it('marks the bottom tab bar with an iOS-specific class', () => {
    expect(appVue()).toContain("'bottom-tab-bar--ios': isIOSLike")
  })

  it('keeps forum as the center primary tab', () => {
    expect(appVue()).toContain("const MAIN_TABS = ['home', 'schedule', 'forum', 'notifications', 'me']")
    expect(appVue()).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/)
  })

  it('keeps the iOS bottom tab bar attached to the viewport bottom', () => {
    expect(uxCss()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*0px;/s
    )
  })

  it('reserves iOS home indicator space inside the global bottom tab bar', () => {
    expect(uxCss()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*padding-bottom:\s*calc\(10px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)\s*!important;/s
    )
  })

  it('keeps the component-scoped iOS fallback aligned with the global rule', () => {
    expect(appVue()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*0px;[^}]*padding-bottom:\s*calc\(10px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\);/s
    )
  })

  it('does not add safe-area-inset-bottom to compact tab bar bottom positioning', () => {
    const compactRule = uxCss().match(/html\[data-ui-nav='compact'\]\s+\.bottom-tab-bar\s*\{(?<body>[^}]*)\}/s)

    expect(compactRule?.groups?.body).toBeTruthy()
    expect(compactRule?.groups?.body).not.toContain('env(safe-area-inset-bottom')
  })

  it('restores iOS safe-area padding after compact nav padding overrides', () => {
    expect(uxCss()).toMatch(
      /html\[data-ui-nav='compact'\]\s+\.bottom-tab-bar--ios\s*\{[^}]*padding-bottom:\s*calc\(8px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)\s*!important;/s
    )
  })

  it('does not keep the old negative iOS safe-area offset', () => {
    expect(appVue()).not.toContain('calc(0px - env(safe-area-inset-bottom')
    expect(uxCss()).not.toContain('calc(0px - env(safe-area-inset-bottom')
  })
})
