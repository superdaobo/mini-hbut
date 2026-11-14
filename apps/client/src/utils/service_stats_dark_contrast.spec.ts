import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1297 暗色对比度契约：
 * ServiceStatsView 的卡片容器全部写死在 scoped 样式里（浅色），暗色主题必须通过
 * `styles/dark-mode.css` 的 `html.dark .service-stats-view .<card>` 规则逐一覆盖。
 * 本测试锁住「模板里出现的卡片类名 → 暗色样式必须覆盖」这条链路，
 * 避免以后新增卡片（或改名）时再次出现「白底 + 浅字」。
 */
const readSource = (path: string) => {
  const resolved = resolve(process.cwd(), path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

/** 取某个选择器片段之后第一个声明块的内容（用于断言 key/value 而非全文） */
const ruleBody = (css: string, selector: string) => {
  const at = css.indexOf(selector)
  if (at < 0) return ''
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return open < 0 || close < 0 ? '' : css.slice(open + 1, close)
}

const CARD_CLASSES = ['status-card', 'usage-card', 'version-card', 'trend-card', 'metric-card']

describe('service stats dark theme contrast contract (#1297)', () => {
  const vue = readSource('src/components/ServiceStatsView.vue')
  const dark = readSource('src/styles/dark-mode.css')

  it('模板里用到的每个卡片容器都在暗色样式里被覆盖', () => {
    const missing = CARD_CLASSES.filter((cls) => {
      const usedInTemplate = new RegExp(`class="[^"]*\\b${cls}\\b`).test(vue)
      if (!usedInTemplate) return false
      return !dark.includes(`html.dark .service-stats-view .${cls}`)
    })

    expect(vue).toContain('class="service-stats-view"')
    expect(missing).toEqual([])
  })

  it('usage/version 卡片使用统一深色面，不再残留白色背景', () => {
    for (const cls of ['usage-card', 'version-card']) {
      const body = ruleBody(dark, `html.dark .service-stats-view .${cls}`)
      expect(body).toContain('background: #1e293b !important')
    }
  })

  it('所有 usage/version 覆盖都挂在 html.dark 之下（不污染亮色）', () => {
    for (const cls of ['usage-card', 'version-card']) {
      const total = (dark.match(new RegExp(`\\.service-stats-view \\.${cls}\\b`, 'g')) || []).length
      const scoped = (dark.match(new RegExp(`html\\.dark \\.service-stats-view \\.${cls}\\b`, 'g')) || [])
        .length
      expect(scoped).toBeGreaterThan(0)
      expect(scoped).toBe(total)
    }
    // 亮色定义仍在组件内，暗色只做覆盖
    expect(vue).toContain('background: #ffffff')
  })

  it('卡片内部浅底行与次要文字也有暗色覆盖', () => {
    for (const cls of ['version-row', 'trend-item', 'empty-state']) {
      expect(dark).toContain(`html.dark .service-stats-view .${cls}`)
    }
    for (const cls of ['version-name', 'empty-hint']) {
      const body = ruleBody(dark, `html.dark .service-stats-view .${cls}`)
      expect(body).toContain('color: #94a3b8 !important')
    }
    expect(ruleBody(dark, 'html.dark .service-stats-view .error-banner')).toContain(
      'background: rgba(127, 29, 29, 0.32) !important'
    )
  })
})
