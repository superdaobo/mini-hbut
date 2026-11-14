import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1298 暗色对比度契约：
 * ExportCenterView 的模块名 / 学期标签在 scoped 样式里写死了浅色主题的深色字，
 * 暗色主题必须逐类覆盖（父级 `color` 继承不到子元素自带的 color）。
 */
const readSource = (path: string) => {
  const resolved = resolve(process.cwd(), path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

const ruleBody = (css: string, selector: string) => {
  const at = css.indexOf(selector)
  if (at < 0) return ''
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return open < 0 || close < 0 ? '' : css.slice(open + 1, close)
}

describe('export center dark theme contrast contract (#1298)', () => {
  const scoped = readSource('src/styles/views/ExportCenterView.scoped.css')
  const dark = readSource('src/styles/dark-mode.css')

  it('模块名在暗色下有显式浅色覆盖', () => {
    // 浅色主题的深色字仍在（不破坏亮色）
    expect(ruleBody(scoped, '.export-module-name')).toContain('color: #1f2937')

    const body = ruleBody(dark, 'html.dark .export-module-name')
    expect(body).toContain('color: #e2e8f0 !important')
  })

  it('选中态的模块名与未选中态可区分', () => {
    const body = ruleBody(dark, 'html.dark .export-module-item.active .export-module-name')
    expect(body).toContain('color: #bfdbfe !important')
  })

  it('学期标签在暗色下有对比度更高的前景/背景', () => {
    expect(ruleBody(scoped, '.export-semester-tag')).toContain('color: #4f46e5')

    const body = ruleBody(dark, 'html.dark .export-semester-tag')
    expect(body).toContain('background: rgba(99, 102, 241, 0.3) !important')
    expect(body).toContain('color: #c7d2fe !important')
  })

  it('所有覆盖都挂在 html.dark 之下且带 !important（对抗 scoped 特异性）', () => {
    for (const selector of [
      'html.dark .export-module-name',
      'html.dark .export-module-item.active .export-module-name',
      'html.dark .export-semester-tag'
    ]) {
      const body = ruleBody(dark, selector)
      expect(body).toContain('!important')
    }
  })
})
