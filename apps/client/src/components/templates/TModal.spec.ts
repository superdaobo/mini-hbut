/**
 * #1064 样式契约测试：教师二级详情弹窗必须是**不透明实体底**。
 *
 * 背景：共享 TModal 容器使用 `.glass-card`，其背景取 `--ui-surface`；而 `--ui-surface`
 * 由用户「透明度」设置注入（默认 0.88/0.76，恒 < 1），深色模式与卡片皮肤还会用
 * `!important` 覆盖，导致二级详情透出底层列表。修复方式：为 TModal 引入独立的不透明
 * token `--ui-modal-surface`，并用更高优先级的选择器 + `!important` 覆盖。
 *
 * 说明：本仓库 vitest 运行在 `environment: 'node'`，且未安装 jsdom / happy-dom，
 * 因此无法在真实 DOM 上调用 `getComputedStyle`。这里改为**解析组件真实 CSS 源码**，
 * 等价地验证：① 解析后的背景色 alpha == 1（浅/深两套）；② 声明带 `!important`
 * 且编译后特异性高于 `html.dark .glass-card`，保证级联后仍为实底；
 * ③ 安全区 / 最大高度 / 滚动等关键声明存在。真实浏览器计算样式证据见 PR 说明。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MODAL_PATH = fileURLToPath(new URL('./TModal.vue', import.meta.url))
const SOURCE = readFileSync(MODAL_PATH, 'utf8')

/** 提取所有 <style> 块，区分 scoped（组件内）与 global（:root token） */
function extractStyleBlocks(src: string) {
  const scoped: string[] = []
  const global: string[] = []
  const re = /<style([^>]*)>([\s\S]*?)<\/style>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(src)) !== null) {
    const attrs = match[1] || ''
    const body = match[2] || ''
    if (/\bscoped\b/.test(attrs)) scoped.push(body)
    else global.push(body)
  }
  return { scoped: scoped.join('\n'), global: global.join('\n') }
}

const { scoped: SCOPED_CSS, global: GLOBAL_CSS } = extractStyleBlocks(SOURCE)

/** 取某条规则体：selector 用正则片段传入，返回第一个匹配的声明块 */
function ruleBody(css: string, selectorPattern: string): string | null {
  const re = new RegExp(`(?:^|[\\s,])${selectorPattern}\\s*\\{([^}]*)\\}`, 'm')
  const m = css.match(re)
  return m ? m[1] : null
}

/** 取规则体里某条声明的值 */
function declValue(body: string | null, prop: string): string | null {
  if (!body) return null
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'm')
  const m = body.match(re)
  return m ? m[1].trim() : null
}

/** 解析颜色 alpha（支持 #rgb/#rrggbb/#rrggbbaa/rgb()/rgba()） */
function colorAlpha(value: string): number {
  const v = value.trim().toLowerCase()
  const hex = v.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    const h = hex[1]
    if (h.length === 3 || h.length === 6) return 1
    if (h.length === 4) return parseInt(h[3] + h[3], 16) / 255
    if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255
  }
  const fn = v.match(/^rgba?\(([^)]+)\)$/)
  if (fn) {
    const parts = fn[1].split(',').map((p) => p.trim())
    return parts.length === 4 ? parseFloat(parts[3]) : 1
  }
  throw new Error(`无法解析颜色值: ${value}`)
}

/** 简易特异性计算 [id, class/attr/pseudo, type]（本文件选择器足够简单） */
function specificity(selector: string): [number, number, number] {
  const s = selector.replace(/::[\w-]+/g, '')
  const ids = (s.match(/#[\w-]+/g) || []).length
  const classLike =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]+\]/g) || []).length +
    (s.match(/:(?!:)[\w-]+/g) || []).length
  const typeLike = (s.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) || []).length
  return [ids, classLike, typeLike]
}

function compareSpecificity(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** 从 var(--name, fallback) 中解析出背景色：优先 token 值，回退 fallback */
function resolveVarBackground(decl: string, tokenValue: string | null): string {
  const m = decl.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/)
  if (!m) return decl.replace(/!important/i, '').trim()
  return (tokenValue ?? (m[2] || '').trim()).trim()
}

const CONTAINER_SELECTOR = '.t-modal__overlay .t-modal__container'
const CONTAINER_BODY = ruleBody(SCOPED_CSS, '\\.t-modal__overlay\\s+\\.t-modal__container')
const CONTAINER_BG_DECL = declValue(CONTAINER_BODY, 'background')
// 基础布局规则（max-height / 滚动）在无前缀的 .t-modal__container 上
const BASE_CONTAINER_BODY = ruleBody(SCOPED_CSS, '\\.t-modal__container')

const LIGHT_TOKENS = ruleBody(GLOBAL_CSS, ':root')
const DARK_TOKENS = ruleBody(
  GLOBAL_CSS,
  "html\\.dark\\s*,\\s*html\\[data-theme='graphite_night'\\]"
)

describe('#1064 TModal 不透明实体底样式契约', () => {
  it('存在 TModal 容器样式与全局 token 块', () => {
    expect(CONTAINER_BODY, '未找到 .t-modal__overlay .t-modal__container 规则').toBeTruthy()
    expect(LIGHT_TOKENS, '未找到 :root token 块').toBeTruthy()
    expect(DARK_TOKENS, '未找到深色 token 块').toBeTruthy()
  })

  it('浅色主题：--ui-modal-surface 为不透明纯白（alpha == 1）', () => {
    const lightSurface = declValue(LIGHT_TOKENS, '--ui-modal-surface')
    expect(lightSurface, '缺少 --ui-modal-surface 浅色 token').toBeTruthy()
    expect(lightSurface!.toLowerCase()).toBe('#ffffff')
    expect(colorAlpha(lightSurface!)).toBe(1)
  })

  it('深色主题：--ui-modal-surface 为不透明实底（alpha == 1）', () => {
    const darkSurface = declValue(DARK_TOKENS, '--ui-modal-surface')
    expect(darkSurface, '缺少 --ui-modal-surface 深色 token').toBeTruthy()
    expect(colorAlpha(darkSurface!)).toBe(1)
    // 深色实底必须明显区别于纯白，保证夜间为深色实体
    expect(darkSurface!.toLowerCase()).not.toBe('#ffffff')
  })

  it('容器背景引用 --ui-modal-surface 且带 !important（浅/深解析后 alpha 均 == 1）', () => {
    expect(CONTAINER_BG_DECL, '未找到容器 background 声明').toBeTruthy()
    expect(CONTAINER_BG_DECL).toContain('var(--ui-modal-surface')
    expect(CONTAINER_BG_DECL).toMatch(/!important/i)

    const lightResolved = resolveVarBackground(
      CONTAINER_BG_DECL!,
      declValue(LIGHT_TOKENS, '--ui-modal-surface')
    )
    const darkResolved = resolveVarBackground(
      CONTAINER_BG_DECL!,
      declValue(DARK_TOKENS, '--ui-modal-surface')
    )
    expect(colorAlpha(lightResolved), `浅色解析背景 ${lightResolved} 非不透明`).toBe(1)
    expect(colorAlpha(darkResolved), `深色解析背景 ${darkResolved} 非不透明`).toBe(1)
  })

  it('回归防护：容器背景不得再引用半透明 --ui-surface', () => {
    expect(CONTAINER_BG_DECL).not.toContain('--ui-surface)')
    expect(CONTAINER_BG_DECL).not.toContain('--ui-surface,')
  })

  it('级联防护：编译后（含 scoped data-v 属性）特异性高于 html.dark .glass-card', () => {
    // Vue scoped 会给最后一个复合选择器追加 [data-v-xxx]
    const compiled = `${CONTAINER_SELECTOR}[data-v-hash]`
    const modalSpec = specificity(compiled)
    const darkGlassCard = specificity('html.dark .glass-card')
    expect(compareSpecificity(modalSpec, darkGlassCard)).toBeGreaterThan(0)
  })

  it('iOS 安全区：遮罩内边距同时使用 env(safe-area-inset-*) 与 --app-safe-*', () => {
    const overlayBody = ruleBody(SCOPED_CSS, '\\.t-modal__overlay')
    const padding = declValue(overlayBody, 'padding')
    expect(padding, '遮罩缺少 padding 声明').toBeTruthy()
    // 上/下用 --app-safe-*（已在 index.css 聚合 Android inset + iOS env + 兜底）
    expect(padding).toContain('var(--app-safe-top')
    expect(padding).toContain('var(--app-safe-bottom')
    // 左/右用 iOS env 安全区
    expect(padding).toContain('env(safe-area-inset-left')
    expect(padding).toContain('env(safe-area-inset-right')
  })

  it('长内容滚动：容器 max-height:80vh + overscroll-behavior:contain', () => {
    expect(BASE_CONTAINER_BODY, '未找到基础 .t-modal__container 规则').toBeTruthy()
    expect(BASE_CONTAINER_BODY).toContain('80vh')
    expect(declValue(BASE_CONTAINER_BODY, 'overscroll-behavior')).toBe('contain')
    expect(declValue(BASE_CONTAINER_BODY, 'overflow-y')).toBe('auto')
  })

  it('可访问性与关闭方式：role=dialog / aria-modal / 点击遮罩关闭', () => {
    // 说明：ESC 关闭由调用方各自实现（教师详情/通知页已有自己的 Esc 监听），
    // 共享 TModal 刻意不接管 ESC，避免 WorkspaceLayoutEditor（close-on-overlay=false）等被误关。
    expect(SOURCE).toContain('role="dialog"')
    expect(SOURCE).toContain('aria-modal="true"')
    expect(SOURCE).toContain('closeOnOverlay')
    expect(SOURCE).toContain('@click.self="onOverlayClick"')
  })
})
