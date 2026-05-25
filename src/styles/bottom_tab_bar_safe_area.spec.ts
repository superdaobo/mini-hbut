import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

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
  const storyboard = () => readSource('ios/App/App/Base.lproj/Main.storyboard')
  const xcodeProject = () => readSource('ios/App/App.xcodeproj/project.pbxproj')
  const tauriIosPatcher = () => readSource('scripts/patch_tauri_ios_edge_to_edge.mjs')
  const devWorkflow = () => readSource('.github/workflows/dev-build.yml')
  const releaseWorkflow = () => readSource('.github/workflows/release.yml')

  const expectTauriIosWorkflowOrder = (workflow: string) => {
    const initIndex = workflow.indexOf('npm run tauri ios init')
    const fetchIndex = workflow.indexOf('cargo fetch --manifest-path src-tauri/Cargo.toml')
    const patchIndex = workflow.indexOf('node scripts/patch_tauri_ios_edge_to_edge.mjs')
    const iconIndex = workflow.indexOf('node scripts/sync_tauri_platform_icons.mjs ios')
    const buildIndex = workflow.indexOf('xcodebuild')

    expect(initIndex).toBeGreaterThanOrEqual(0)
    expect(fetchIndex).toBeGreaterThan(initIndex)
    expect(patchIndex).toBeGreaterThan(fetchIndex)
    expect(patchIndex).toBeGreaterThan(initIndex)
    expect(iconIndex).toBeGreaterThan(patchIndex)
    expect(buildIndex).toBeGreaterThan(patchIndex)
  }

  const tauriBridgeSwift = `import Foundation
import UIKit
import WebKit

@_cdecl("on_webview_created")
func onWebviewCreated(webview: WKWebView, viewController: UIViewController) {
  PluginManager.shared.viewController = viewController
  PluginManager.shared.onWebviewCreated(webview)
}
`

  const runIosPatcherInTempRoot = (tempRoot: string) => {
    execFileSync(process.execPath, [resolve(process.cwd(), 'scripts/patch_tauri_ios_edge_to_edge.mjs')], {
      cwd: tempRoot,
      env: { ...process.env, CARGO_HOME: resolve(tempRoot, '.cargo') },
      stdio: 'pipe',
    })
  }

  it('does not load legacy global visual styles from the app entry css', () => {
    expect(indexCss()).not.toMatch(/@import\s+['"]\.\/style\.css['"]/)
    expect(indexCss()).not.toMatch(/@import\s+['"]\.\/styles\/ui_ux_pro_max\.css['"]/)
    expect(indexCss()).not.toContain('.glass-card')
    expect(indexCss()).not.toContain('.bottom-tab-bar')
  })

  it('keeps forum as the center primary tab', () => {
    expect(appVue()).toContain("const MAIN_TABS = ['home', 'schedule', 'forum', 'notifications', 'me']")
    expect(appVue()).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*!important;/)
  })

  it('keeps the rounded iOS bottom tab bar anchored to the viewport bottom', () => {
    const baseRule = getRuleBody(appVue(), '.bottom-tab-bar')

    expect(baseRule).toContain('bottom: 0')
    expect(baseRule).toContain('padding: 8px 14px calc(8px + var(--app-safe-bottom))')
    expect(baseRule).toContain('min-height: calc(62px + var(--app-safe-bottom))')
    expect(baseRule).toContain('max-height: calc(92px + var(--app-safe-bottom))')
    expect(baseRule).toContain('border-radius: 20px')
    expect(baseRule).not.toContain('bottom: calc(env(safe-area-inset-bottom) + 8px)')
    expect(appVue()).not.toContain('bottom-tab-bar--ios')
    expect(appVue()).not.toContain('--bottom-tab-bar-bottom: 0px')
    expect(appVue()).not.toContain('bottom: var(--bottom-tab-bar-bottom) !important')
  })

  it('keeps safe-area padding inside the tab bar without theme overrides stretching it', () => {
    const baseRule = getRuleBody(appVue(), '.bottom-tab-bar')

    expect(baseRule).toContain('min-height: calc(62px + var(--app-safe-bottom))')
    expect(baseRule).toContain('max-height: calc(92px + var(--app-safe-bottom))')
    expect(baseRule).not.toContain('--bottom-tab-bar-content-height')
    expect(baseRule).not.toContain('--bottom-tab-bar-safe-bottom')
    expect(baseRule).not.toContain('10px + var(--bottom-tab-bar-safe-bottom)')
    expect(appVue()).not.toMatch(/\.bottom-tab-bar--ios\s*\{/)
    expect(appVue()).not.toContain('border-bottom-left-radius: 0')
    expect(appVue()).not.toContain('border-bottom-right-radius: 0')
  })

  it('keeps page scroll clearance aware of the iOS home indicator without resizing the tab bar', () => {
    expect(appVue()).toMatch(/padding-bottom:\s*calc\(128px\s*\+\s*var\(--app-safe-bottom\)\)/)
    expect(indexCss()).not.toMatch(/--ux-bottom-safe:\s*calc\(128px\s*\+\s*var\(--app-safe-bottom\)\)/)
  })

  it('keeps edge-to-edge behavior in the iOS bridge controller instead of the app delegate', () => {
    expect(capacitorConfig()).not.toContain("contentInset: 'never'")
    expect(appDelegate()).not.toContain('contentInsetAdjustmentBehavior = .never')
    expect(appDelegate()).not.toContain('contentInset = .zero')
    expect(appDelegate()).not.toContain('scrollIndicatorInsets = .zero')
  })

  it('uses the edge-to-edge bridge controller so the WebView can draw into the bottom safe area', () => {
    const bridgeController = readSource('ios/App/App/EdgeToEdgeBridgeViewController.swift')

    expect(storyboard()).toContain('customClass="EdgeToEdgeBridgeViewController"')
    expect(storyboard()).toContain('customModule="App"')
    expect(xcodeProject()).toContain('EdgeToEdgeBridgeViewController.swift')
    expect(xcodeProject()).toContain('EdgeToEdgeBridgeViewController.swift in Sources')
    expect(bridgeController).toContain('override func capacitorDidLoad()')
    expect(bridgeController).toContain('edgesForExtendedLayout = [.top, .bottom]')
    expect(bridgeController).toContain('contentInsetAdjustmentBehavior = .never')
    expect(bridgeController).toContain('webView.frame = view.bounds')
  })

  it('patches the generated Tauri iOS WebView instead of relying on the Capacitor shell only', () => {
    const patcher = tauriIosPatcher()

    expect(patcher).toContain('src-tauri/gen/apple')
    expect(patcher).toContain('WKWebView')
    expect(patcher).toContain('edgesForExtendedLayout = [.top, .bottom]')
    expect(patcher).toContain('extendedLayoutIncludesOpaqueBars = true')
    expect(patcher).toContain('additionalSafeAreaInsets = .zero')
    expect(patcher).toContain('contentInsetAdjustmentBehavior = .never')
    expect(patcher).toContain('webview.frame = viewController.view.bounds')
    expect(patcher).toContain('DispatchQueue.main.asyncAfter')
  })

  it('runs the Tauri iOS edge-to-edge patch after ios init and before xcodebuild', () => {
    expectTauriIosWorkflowOrder(devWorkflow())
    expectTauriIosWorkflowOrder(releaseWorkflow())
  })

  it('patches a generated Tauri iOS Swift bridge file idempotently', () => {
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'mini-hbut-ios-edge-generated-'))
    try {
      const bridgePath = resolve(tempRoot, 'src-tauri/gen/apple/Sources/Tauri/Tauri.swift')
      mkdirSync(dirname(bridgePath), { recursive: true })
      writeFileSync(bridgePath, tauriBridgeSwift)

      runIosPatcherInTempRoot(tempRoot)
      runIosPatcherInTempRoot(tempRoot)

      const patched = readFileSync(bridgePath, 'utf8')
      expect(patched.match(/Mini-HBUT iOS edge-to-edge WebView patch/g)).toHaveLength(1)
      expect(patched).toContain('configureMiniHbutEdgeToEdgeWebView(webview, viewController)')
      expect(patched).toContain('webview.frame = viewController.view.bounds')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('patches the locked Tauri crate iOS Swift API when the generated project does not copy it', () => {
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'mini-hbut-ios-edge-cargo-'))
    try {
      const appleDir = resolve(tempRoot, 'src-tauri/gen/apple')
      const cargoSwiftPath = resolve(
        tempRoot,
        '.cargo/registry/src/local-index/tauri-2.9.5/mobile/ios-api/Sources/Tauri/Tauri.swift'
      )
      mkdirSync(appleDir, { recursive: true })
      mkdirSync(dirname(cargoSwiftPath), { recursive: true })
      writeFileSync(resolve(tempRoot, 'src-tauri/Cargo.lock'), '[[package]]\nname = "tauri"\nversion = "2.9.5"\n')
      writeFileSync(cargoSwiftPath, tauriBridgeSwift)

      runIosPatcherInTempRoot(tempRoot)

      const patched = readFileSync(cargoSwiftPath, 'utf8')
      expect(patched).toContain('Mini-HBUT iOS edge-to-edge WebView patch')
      expect(patched).toContain('edgesForExtendedLayout = [.top, .bottom]')
      expect(patched).toContain('contentInsetAdjustmentBehavior = .never')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('provides a native safe-area fallback when iOS WebView reports zero env inset', () => {
    expect(indexCss()).toMatch(
      /--app-safe-bottom:\s*max\(env\(safe-area-inset-bottom,\s*0px\),\s*var\(--app-safe-bottom-fallback,\s*0px\)\);/
    )
    expect(appVue()).toContain("document.documentElement.style.setProperty('--app-safe-bottom-fallback'")
  })

  it('keeps themed navigation settings from overriding the iOS safe-area position', () => {
    expect(appVue()).not.toMatch(/html\[data-ui-nav=.*\.bottom-tab-bar/)
    expect(appVue()).not.toMatch(/\.bottom-tab-bar\s*\{[^}]*border-bottom-left-radius:\s*0/s)
    expect(appVue()).not.toMatch(/\.bottom-tab-bar\s*\{[^}]*border-bottom-right-radius:\s*0/s)
  })

  it('does not keep the old negative iOS safe-area offset', () => {
    expect(appVue()).not.toContain('calc(0px - env(safe-area-inset-bottom')
    expect(indexCss()).not.toContain('calc(0px - env(safe-area-inset-bottom')
  })

  it('ships the fixed bottom tab bar contract in the bundled iOS web assets', () => {
    const bundledCss = normalizeCss(readIosBundledStyles())

    expect(bundledCss).not.toContain('@import')
    expect(bundledCss).toContain('bottom:0')
    expect(bundledCss).toContain('grid-template-columns:repeat(5,minmax(0,1fr))!important')
    expect(bundledCss).toContain('padding:8px14pxcalc(8px+var(--app-safe-bottom))')
    expect(bundledCss).toContain('min-height:calc(62px+var(--app-safe-bottom))')
    expect(bundledCss).toContain('border-radius:20px')
    expect(bundledCss).toContain('max-height:calc(92px+var(--app-safe-bottom))')
    expect(bundledCss).not.toContain('bottom:calc(env(safe-area-inset-bottom)+8px)')
    expect(bundledCss).not.toContain('--bottom-tab-bar-safe-bottom')
    expect(bundledCss).not.toContain('--bottom-tab-bar-bottom:0px')
    expect(bundledCss).not.toContain('bottom:var(--bottom-tab-bar-bottom)!important')
    expect(bundledCss).not.toContain('min-height:calc(var(--bottom-tab-bar-content-height)+')
    expect(bundledCss).not.toContain('padding-bottom:calc(10px+')
    expect(bundledCss).not.toContain('--ux-bottom-safe:calc(128px+env(safe-area-inset-bottom))')
    expect(bundledCss).not.toContain('grid-template-columns:repeat(4,1fr)')
    expect(bundledCss).not.toContain('body{width:100%;height:100%;overflow:hidden;overscroll-behavior:none}')
  })
})
