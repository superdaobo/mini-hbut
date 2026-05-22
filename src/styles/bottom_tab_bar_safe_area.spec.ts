import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

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

  it('keeps the iOS bottom tab bar attached to the viewport bottom', () => {
    expect(uxCss()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*0px;/s
    )
  })

  it('reserves iOS home indicator space inside the global bottom tab bar', () => {
    expect(uxCss()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-safe-bottom:\s*var\(--app-safe-bottom\);[^}]*min-height:\s*calc\(var\(--bottom-tab-bar-content-height\)\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\)\s*!important;[^}]*padding-bottom:\s*calc\(10px\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\)\s*!important;/s
    )
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
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*0px;[^}]*--bottom-tab-bar-safe-bottom:\s*var\(--app-safe-bottom\);[^}]*min-height:\s*calc\(var\(--bottom-tab-bar-content-height\)\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\);[^}]*padding-bottom:\s*calc\(10px\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\);/s
    )
  })

  it('provides a native safe-area fallback when iOS WebView reports zero env inset', () => {
    expect(indexCss()).toMatch(
      /--app-safe-bottom:\s*max\(env\(safe-area-inset-bottom,\s*0px\),\s*var\(--app-safe-bottom-fallback,\s*0px\)\);/
    )
    expect(appVue()).toContain("document.documentElement.style.setProperty('--app-safe-bottom-fallback'")
  })

  it('does not add safe-area-inset-bottom to compact tab bar bottom positioning', () => {
    const compactRule = uxCss().match(/html\[data-ui-nav='compact'\]\s+\.bottom-tab-bar\s*\{(?<body>[^}]*)\}/s)

    expect(compactRule?.groups?.body).toBeTruthy()
    expect(compactRule?.groups?.body).not.toContain('env(safe-area-inset-bottom')
  })

  it('keeps iOS bottom corners flush after themed navigation style overrides', () => {
    expect(uxCss()).toMatch(
      /html\[data-ui-nav='floating'\]\s+\.bottom-tab-bar--ios,\s*html\[data-ui-nav='pill'\]\s+\.bottom-tab-bar--ios,\s*html\[data-ui-nav='compact'\]\s+\.bottom-tab-bar--ios\s*\{[^}]*border-bottom-left-radius:\s*0\s*!important;[^}]*border-bottom-right-radius:\s*0\s*!important;[^}]*bottom:\s*0\s*!important;/s
    )
  })

  it('restores iOS safe-area padding after compact nav padding overrides', () => {
    expect(uxCss()).toMatch(
      /html\[data-ui-nav='compact'\]\s+\.bottom-tab-bar--ios\s*\{[^}]*min-height:\s*calc\(64px\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\)\s*!important;[^}]*padding-bottom:\s*calc\(8px\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\)\s*!important;/s
    )
  })

  it('does not keep the old negative iOS safe-area offset', () => {
    expect(appVue()).not.toContain('calc(0px - env(safe-area-inset-bottom')
    expect(uxCss()).not.toContain('calc(0px - env(safe-area-inset-bottom')
  })
})
