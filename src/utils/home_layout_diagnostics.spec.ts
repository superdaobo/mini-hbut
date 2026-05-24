import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('temporary home layout diagnostics contract', () => {
  const diagnosticsPath = 'src/utils/home_layout_diagnostics.ts'

  it('ships a one-time home layout diagnostics collector for iOS safe-area evidence', () => {
    const exists = existsSync(resolve(process.cwd(), diagnosticsPath))
    expect(exists, 'diagnostics helper should exist until the iOS layout evidence is collected').toBe(true)
    if (!exists) return

    const source = readSource(diagnosticsPath)

    expect(source).toContain('collectHomeLayoutDiagnostics')
    expect(source).toContain('installHomeLayoutDiagnosticsErrorCapture')
    expect(source).toContain('__MINI_HBUT_LAYOUT_DEBUG_ERRORS__')
    expect(source).toContain('safe-area-inset-bottom')
    expect(source).toContain('visualViewport')
    expect(source).toContain('getBoundingClientRect')
    expect(source).toContain('.bottom-tab-bar')
    expect(source).toContain('.app-shell')
    expect(source).toContain('.view-transition-root')
    expect(source).toContain('.dashboard-root')
  })

  it('exposes a temporary home-page copy panel without changing bottom tab positioning', () => {
    const source = readSource('src/App.vue')

    expect(source).toContain('collectHomeLayoutDiagnostics')
    expect(source).toContain('showHomeLayoutDebug')
    expect(source).toContain('copyHomeLayoutDebugReport')
    expect(source).toContain('navigator.clipboard.writeText')
    expect(source).toContain('home-layout-debug-panel')
    expect(source).toContain('hbu_home_layout_debug_hidden')
    expect(source).toContain('当前首页布局调试')
    expect(source).not.toContain('bottom-tab-bar--ios')
  })
})
