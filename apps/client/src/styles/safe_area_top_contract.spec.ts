import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { readAppContractSources } from '../utils/contract_source_test'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

/**
 * #810 顶部安全区契约测试：
 * 「安全区永远空白」三件套 —— 全局变量三层取值 + 外层固定留白 + Android 原生注入。
 * 防回归点：
 * 1. index.css 必须定义 --app-safe-top 且取值链含 android/env/fallback 三层 max；
 * 2. .app-shell 不得再把 padding-top: env(safe-area-inset-top) 放进滚动容器（滚动即穿透）；
 * 3. .app-shell 高度必须扣除 --app-safe-top（外层 spacer 占位）；
 * 4. .app-viewport + .safe-area-spacer wrapper 结构必须存在；
 * 5. Android 原生注入 patch 脚本存在、幂等，且已注册进 dev/release 工作流。
 */
describe('safe area top contract (#810)', () => {
  const appVue = () => readAppContractSources()
  const indexCss = () => readSource('src/index.css')
  const shellCss = () => readSource('src/styles/views/App.scoped.css')
  const devWorkflow = () => readSource('../../.github/workflows/dev-build.yml')
  const releaseWorkflow = () => readSource('../../.github/workflows/release.yml')

  const tauriBridgeLikeKotlin = `package com.hbut.mini

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
`

  const runSafeAreaPatcherInTempRoot = (tempRoot: string) => {
    execFileSync('python', [resolve(process.cwd(), 'scripts/patch_android_safe_area.py')], {
      cwd: tempRoot,
      stdio: 'pipe',
    })
  }

  it('defines the three-layer --app-safe-top variable chain in the global css', () => {
    const css = indexCss()
    expect(css).toMatch(/--app-safe-top:\s*max\(/)
    expect(css).toContain('var(--android-safe-top, 0px)')
    expect(css).toMatch(/env\(safe-area-inset-top,\s*0px\)/)
    expect(css).toContain('var(--app-safe-top-fallback, 0px)')
    // 与底部方案同构：fallback 变量必须先声明缺省值
    expect(css).toMatch(/--app-safe-top-fallback:\s*0px/)
  })

  it('never puts the top safe-area padding inside the scroll container again', () => {
    const shellRule = shellCss().match(/\.app-shell\s*\{[^}]*\}/)?.[0] || ''
    // 根因 1 回归哨兵：padding-top 属于滚动内容，上滑即被滚出视口
    expect(shellRule).not.toMatch(/padding-top:\s*env\(safe-area-inset-top/)
    expect(shellRule).not.toMatch(/padding-top:\s*var\(--app-safe-top/)
  })

  it('keeps the app-shell height subtracting the top safe-area spacer', () => {
    const css = normalizeCssText(shellCss())
    const shellRule = css.match(/\.app-shell\{[^}]*\}/)?.[0] || ''
    expect(shellRule).toContain('height:calc(var(--app-vh,1vh)*100-var(--app-safe-top,0px))')
    expect(shellRule).toContain('min-height:calc(var(--app-vh,1vh)*100-var(--app-safe-top,0px))')
    // 滚动容器身份保持不变（全应用唯一滚动容器契约）
    expect(shellRule).toContain('overflow-y:auto')
    // no-scroll / 统一子页高度策略同步扣除，避免高度不自洽
    const noScrollRule = css.match(/\.app-shell\.no-scroll\{[^}]*\}/)?.[0] || ''
    expect(noScrollRule).toContain('height:calc(var(--app-vh,1vh)*100-var(--app-safe-top,0px))')
    expect(css).toContain(
      'min-height:calc(var(--app-vh,1vh)*100-var(--app-safe-top,0px))!important'
    )
  })

  it('wraps the app-shell with an outer viewport + top spacer structure', () => {
    const css = normalizeCssText(shellCss())
    expect(css).toMatch(/\.app-viewport\{[^}]*display:flex[^}]*flex-direction:column/)
    const spacerRule = css.match(/\.safe-area-spacer\{[^}]*\}/)?.[0] || ''
    expect(spacerRule).toContain('height:var(--app-safe-top,0px)')
    expect(spacerRule).toContain('flex:0 0 auto'.replace(/\s+/g, ''))
    expect(spacerRule).toContain('background:transparent')
    // spacer 在滚动容器之外：模板结构必须是 spacer 与 main 平级
    const app = appVue()
    expect(app).toContain('class="app-viewport"')
    expect(app).toMatch(
      /<div class="safe-area-spacer" aria-hidden="true"><\/div>\s*<main[^>]*class="app-shell"/s
    )
  })

  it('keeps the ios-like 44px fallback wired through the global ios-safe class', () => {
    // scoped 样式无法匹配 html，兜底必须留在全局 index.css
    expect(indexCss()).toMatch(/html\.ios-safe\s*\{[^}]*--app-safe-top-fallback:\s*44px/s)
    // App.vue 继续挂 ios-safe 类（isIOSLike 判定）
    expect(appVue()).toContain("'ios-safe': isIOSLike")
  })

  it('patches the generated Android MainActivity with an idempotent safe-area injection', () => {
    const patcher = readSource('scripts/patch_android_safe_area.py')

    expect(patcher).toContain('Mini-HBUT safe-area-top inset patch (#810)')
    expect(patcher).toContain('setOnApplyWindowInsetsListener')
    expect(patcher).toContain('WindowInsetsCompat.Type.statusBars()')
    expect(patcher).toContain('--android-safe-top')
    expect(patcher).toContain('evaluateJavascript')

    // 幂等：临时目录里对样例 MainActivity 连跑两次，标记只出现固定次数（4 个 BEGIN 块 + 尾部 0）
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'mini-hbut-safe-area-generated-'))
    try {
      const ktPath = resolve(tempRoot, 'src-tauri/gen/android/app/src/main/java/com/hbut/mini/MainActivity.kt')
      mkdirSync(dirname(ktPath), { recursive: true })
      writeFileSync(ktPath, tauriBridgeLikeKotlin)

      runSafeAreaPatcherInTempRoot(tempRoot)
      runSafeAreaPatcherInTempRoot(tempRoot)

      const patched = readFileSync(ktPath, 'utf8')
      expect(patched.match(/#810\) BEGIN/g)).toHaveLength(3)
      expect(patched).toContain('injectSafeAreaTop')
      expect(patched.match(/private var webView/g)).toHaveLength(1)
      expect(patched).toContain("setProperty('--android-safe-top'")
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('registers the android safe-area patch in the dev and release workflows', () => {
    const devStep = 'python scripts/patch_android_safe_area.py'
    expect(devWorkflow()).toContain('Patch Android safe-area-top injection (#810)')
    expect(devWorkflow()).toContain(devStep)
    expect(releaseWorkflow()).toContain('Patch Android safe-area-top injection (#810)')
    expect(releaseWorkflow()).toContain(devStep)
    // 必须在 android init 之后执行（生成的工程存在后才能 patch）
    for (const workflow of [devWorkflow(), releaseWorkflow()]) {
      const initIndex = workflow.indexOf('npm run tauri android init')
      const patchIndex = workflow.indexOf('python scripts/patch_android_safe_area.py')
      expect(initIndex).toBeGreaterThanOrEqual(0)
      expect(patchIndex).toBeGreaterThan(initIndex)
    }
  })
})

const normalizeCssText = (source: string) => source.replace(/\s+/g, '')
