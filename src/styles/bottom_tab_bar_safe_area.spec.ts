import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const getRuleBody = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 's'))?.groups?.body || ''
}

const normalizeCss = (source: string) => source.replace(/\s+/g, '')

const readIosBundledStyles = () => {
  const publicIndexPath = resolve(process.cwd(), 'ios/App/App/public/index.html')
  const publicRoot = dirname(publicIndexPath)
  const indexHtml = readFileSync(publicIndexPath, 'utf8')
  const stylesheetHrefs = Array.from(indexHtml.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["'](?<href>[^"']+\.css)["']/gi))
    .map((match) => match.groups?.href)
    .filter((href): href is string => Boolean(href))

  const cssPaths = stylesheetHrefs
    .map((href) => resolve(publicRoot, href.replace(/^\//, '')))
    .filter((path) => existsSync(path))

  if (cssPaths.length === 0) {
    const assetsDir = resolve(publicRoot, 'assets')
    cssPaths.push(
      ...readdirSync(assetsDir)
        .filter((file) => file.endsWith('.css'))
        .map((file) => resolve(assetsDir, file))
    )
  }

  return cssPaths.map((path) => readFileSync(path, 'utf8')).join('\n')
}

describe('bottom tab bar safe area contract', () => {
  const appVue = () => readSource('src/App.vue')
  const capacitorConfig = () => readSource('capacitor.config.ts')
  const indexCss = () => readSource('src/index.css')
  const appDelegate = () => readSource('ios/App/App/AppDelegate.swift')
  const edgeToEdgeController = () => readSource('ios/App/App/EdgeToEdgeBridgeViewController.swift')
  const storyboard = () => readSource('ios/App/App/Base.lproj/Main.storyboard')
  const xcodeProject = () => readSource('ios/App/App.xcodeproj/project.pbxproj')

  it('does not load legacy global visual styles from the app entry css', () => {
    expect(indexCss()).not.toMatch(/@import\s+['"]\.\/style\.css['"]/)
    expect(indexCss()).not.toMatch(/@import\s+['"]\.\/styles\/ui_ux_pro_max\.css['"]/)
    expect(indexCss()).not.toContain('.glass-card')
    expect(indexCss()).not.toContain('.bottom-tab-bar')
  })

  it('marks the bottom tab bar with an iOS-specific class', () => {
    expect(appVue()).toContain("'bottom-tab-bar--ios': isIOSLike")
  })

  it('keeps forum as the center primary tab', () => {
    expect(appVue()).toContain("const MAIN_TABS = ['home', 'schedule', 'forum', 'notifications', 'me']")
    expect(appVue()).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*!important;/)
  })

  it('keeps the rounded iOS bottom tab bar attached to the viewport bottom', () => {
    const baseRule = getRuleBody(appVue(), '.bottom-tab-bar')
    const iosRule = getRuleBody(appVue(), '.bottom-tab-bar--ios')

    expect(baseRule).toContain('bottom: var(--bottom-tab-bar-bottom) !important')
    expect(iosRule).toContain('--bottom-tab-bar-bottom: 0px')
  })

  it('keeps iOS safe-area clearance inside the component bottom tab bar shape', () => {
    const iosRule = getRuleBody(appVue(), '.bottom-tab-bar--ios')

    expect(iosRule).toContain('--bottom-tab-bar-safe-bottom: var(--app-safe-bottom)')
    expect(iosRule).toContain('min-height: calc(var(--bottom-tab-bar-content-height) + var(--bottom-tab-bar-safe-bottom)) !important')
    expect(iosRule).toContain('padding-bottom: calc(10px + var(--bottom-tab-bar-safe-bottom)) !important')
    expect(iosRule).toContain('border-radius: 20px !important')
    expect(iosRule).toContain('max-height: none !important')
    expect(iosRule).not.toContain('border-bottom-left-radius: 0')
    expect(iosRule).not.toContain('border-bottom-right-radius: 0')
  })

  it('keeps page scroll clearance independent from the iOS home indicator inset', () => {
    expect(appVue()).not.toMatch(/padding-bottom:\s*calc\(128px\s*\+\s*var\(--app-safe-bottom\)\)/)
    expect(indexCss()).not.toMatch(/--ux-bottom-safe:\s*calc\(128px\s*\+\s*var\(--app-safe-bottom\)\)/)
  })

  it('forces the iOS WKWebView to render edge-to-edge instead of inside adjusted safe-area insets', () => {
    expect(capacitorConfig()).toContain("contentInset: 'never'")
    expect(appDelegate()).toContain('webView.scrollView.contentInsetAdjustmentBehavior = .never')
    expect(appDelegate()).toContain('webView.scrollView.contentInset = .zero')
    expect(appDelegate()).toContain('webView.scrollView.scrollIndicatorInsets = .zero')
  })

  it('uses an edge-to-edge bridge controller before the first web view layout pass', () => {
    expect(storyboard()).toContain('customClass="EdgeToEdgeBridgeViewController"')
    expect(storyboard()).toContain('customModule="App"')
    expect(xcodeProject()).toContain('EdgeToEdgeBridgeViewController.swift')
    expect(edgeToEdgeController()).toContain('class EdgeToEdgeBridgeViewController: CAPBridgeViewController')
    expect(edgeToEdgeController()).toContain('edgesForExtendedLayout = [.top, .bottom]')
    expect(edgeToEdgeController()).toContain('extendedLayoutIncludesOpaqueBars = true')
    expect(edgeToEdgeController()).toContain('additionalSafeAreaInsets = .zero')
    expect(edgeToEdgeController()).toContain('webView.scrollView.contentInsetAdjustmentBehavior = .never')
    expect(edgeToEdgeController()).toContain('webView.scrollView.contentInset = .zero')
    expect(edgeToEdgeController()).toContain('webView.scrollView.scrollIndicatorInsets = .zero')
    expect(edgeToEdgeController()).toContain('webView.frame = view.bounds')
  })

  it('keeps the component-scoped iOS fallback aligned with the global rule', () => {
    expect(appVue()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*0px;[^}]*--bottom-tab-bar-safe-bottom:\s*var\(--app-safe-bottom\);[^}]*min-height:\s*calc\(var\(--bottom-tab-bar-content-height\)\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\)\s*!important;[^}]*padding-bottom:\s*calc\(10px\s*\+\s*var\(--bottom-tab-bar-safe-bottom\)\)\s*!important;[^}]*border-radius:\s*20px\s*!important;/s
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

  it('keeps themed navigation settings from overriding the iOS safe-area position', () => {
    expect(appVue()).not.toMatch(/html\[data-ui-nav=.*\.bottom-tab-bar/)
    expect(appVue()).not.toMatch(/\.bottom-tab-bar--ios\s*\{[^}]*border-bottom-left-radius:\s*0/s)
    expect(appVue()).not.toMatch(/\.bottom-tab-bar--ios\s*\{[^}]*border-bottom-right-radius:\s*0/s)
  })

  it('does not keep the old negative iOS safe-area offset', () => {
    expect(appVue()).not.toContain('calc(0px - env(safe-area-inset-bottom')
    expect(indexCss()).not.toContain('calc(0px - env(safe-area-inset-bottom')
  })

  it('ships the fixed bottom tab bar contract in the bundled iOS web assets', () => {
    const bundledCss = normalizeCss(readIosBundledStyles())

    expect(bundledCss).not.toContain('@import')
    expect(bundledCss).toContain('--bottom-tab-bar-bottom:0px')
    expect(bundledCss).toContain('--bottom-tab-bar-safe-bottom:var(--app-safe-bottom)')
    expect(bundledCss).toContain('bottom:var(--bottom-tab-bar-bottom)!important')
    expect(bundledCss).toContain('grid-template-columns:repeat(5,minmax(0,1fr))!important')
    expect(bundledCss).toContain('min-height:calc(var(--bottom-tab-bar-content-height)+var(--bottom-tab-bar-safe-bottom))!important')
    expect(bundledCss).toContain('padding-bottom:calc(10px+var(--bottom-tab-bar-safe-bottom))!important')
    expect(bundledCss).toContain('border-radius:20px!important')
    expect(bundledCss).not.toContain('bottom:calc(env(safe-area-inset-bottom)+8px)')
    expect(bundledCss).not.toContain('--ux-bottom-safe:calc(128px+env(safe-area-inset-bottom))')
    expect(bundledCss).not.toContain('grid-template-columns:repeat(4,1fr)')
    expect(bundledCss).not.toContain('body{width:100%;height:100%;overflow:hidden;overscroll-behavior:none}')
  })
})
