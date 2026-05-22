import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const getRuleBody = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 's'))?.groups?.body || ''
}

describe('bottom tab bar safe area contract', () => {
  const appVue = () => readSource('src/App.vue')
  const capacitorConfig = () => readSource('capacitor.config.ts')
  const indexCss = () => readSource('src/index.css')
  const uxCss = () => readSource('src/styles/ui_ux_pro_max.css')
  const appDelegate = () => readSource('ios/App/App/AppDelegate.swift')

  it('marks the bottom tab bar with an iOS-specific class', () => {
    expect(appVue()).toContain("'bottom-tab-bar--ios': isIOSLike")
  })

  it('keeps forum as the center primary tab', () => {
    expect(appVue()).toContain("const MAIN_TABS = ['home', 'schedule', 'forum', 'notifications', 'me']")
    expect(appVue()).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/)
  })

  it('keeps the rounded iOS bottom tab bar sitting above the safe area', () => {
    expect(uxCss()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*calc\(var\(--app-safe-bottom\)\s*\+\s*8px\);/s
    )
  })

  it('keeps iOS safe-area clearance outside the global bottom tab bar shape', () => {
    const iosRule = getRuleBody(uxCss(), '.bottom-tab-bar--ios')

    expect(iosRule).toContain('min-height: var(--bottom-tab-bar-content-height) !important')
    expect(iosRule).toContain('padding-bottom: 10px !important')
    expect(iosRule).toContain('border-radius: 20px !important')
    expect(iosRule).not.toContain('min-height: calc(var(--bottom-tab-bar-content-height) + var(--bottom-tab-bar-safe-bottom))')
    expect(iosRule).not.toContain('padding-bottom: calc(10px + var(--bottom-tab-bar-safe-bottom))')
    expect(iosRule).not.toContain('border-bottom-left-radius: 0')
    expect(iosRule).not.toContain('border-bottom-right-radius: 0')
  })

  it('keeps page scroll clearance independent from the iOS home indicator inset', () => {
    expect(appVue()).not.toMatch(/padding-bottom:\s*calc\(128px\s*\+\s*var\(--app-safe-bottom\)\)/)
    expect(uxCss()).not.toMatch(/--ux-bottom-safe:\s*calc\(128px\s*\+\s*var\(--app-safe-bottom\)\)/)
  })

  it('forces the iOS WKWebView to render edge-to-edge instead of inside adjusted safe-area insets', () => {
    expect(capacitorConfig()).toContain("contentInset: 'never'")
    expect(appDelegate()).toContain('webView.scrollView.contentInsetAdjustmentBehavior = .never')
    expect(appDelegate()).toContain('webView.scrollView.contentInset = .zero')
    expect(appDelegate()).toContain('webView.scrollView.scrollIndicatorInsets = .zero')
  })

  it('keeps the component-scoped iOS fallback aligned with the global rule', () => {
    expect(appVue()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*calc\(var\(--app-safe-bottom\)\s*\+\s*8px\);[^}]*min-height:\s*var\(--bottom-tab-bar-content-height\);[^}]*padding-bottom:\s*10px;[^}]*border-radius:\s*20px;/s
    )
    const iosRule = getRuleBody(appVue(), '.bottom-tab-bar--ios')
    expect(iosRule).not.toContain('border-bottom-left-radius: 0')
    expect(iosRule).not.toContain('border-bottom-right-radius: 0')
  })

  it('provides a native safe-area fallback when iOS WebView reports zero env inset', () => {
    expect(indexCss()).toMatch(
      /--app-safe-bottom:\s*max\(env\(safe-area-inset-bottom,\s*0px\),\s*var\(--app-safe-bottom-fallback,\s*0px\)\);/
    )
    expect(appVue()).toContain("document.documentElement.style.setProperty('--app-safe-bottom-fallback'")
  })

  it('keeps compact nav safe-area offset on the iOS bar instead of stretching the bar', () => {
    const compactRule = getRuleBody(uxCss(), "html[data-ui-nav='compact'] .bottom-tab-bar")
    const compactIosRule = getRuleBody(uxCss(), "html[data-ui-nav='compact'] .bottom-tab-bar--ios")

    expect(compactRule).toBeTruthy()
    expect(compactRule).not.toContain('env(safe-area-inset-bottom')
    expect(compactIosRule).toContain('--bottom-tab-bar-bottom: calc(var(--app-safe-bottom) + 10px)')
    expect(compactIosRule).toContain('min-height: 64px !important')
    expect(compactIosRule).toContain('padding-bottom: 8px !important')
    expect(compactIosRule).not.toContain('+ var(--bottom-tab-bar-safe-bottom)')
  })

  it('preserves rounded iOS bottom corners after themed navigation style overrides', () => {
    expect(uxCss()).not.toMatch(/\.bottom-tab-bar--ios\s*\{[^}]*border-bottom-left-radius:\s*0/s)
    expect(uxCss()).not.toMatch(/\.bottom-tab-bar--ios\s*\{[^}]*border-bottom-right-radius:\s*0/s)
    expect(uxCss()).not.toMatch(/\.bottom-tab-bar--ios\s*\{[^}]*bottom:\s*0\s*!important/s)

    expect(uxCss()).toMatch(
      /html\[data-ui-nav='floating'\]\s+\.bottom-tab-bar--ios,\s*html\[data-ui-nav='compact'\]\s+\.bottom-tab-bar--ios\s*\{[^}]*border-radius:\s*20px\s*!important;/s
    )
    expect(uxCss()).toMatch(/html\[data-ui-nav='pill'\]\s+\.bottom-tab-bar--ios\s*\{[^}]*border-radius:\s*999px\s*!important;/s)
  })

  it('does not keep the old negative iOS safe-area offset', () => {
    expect(appVue()).not.toContain('calc(0px - env(safe-area-inset-bottom')
    expect(uxCss()).not.toContain('calc(0px - env(safe-area-inset-bottom')
  })
})
