import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 源码契约测试：防止「暗色翻周动画期间日期数字整体变蓝」与「滑动选中日期文字」回归（#1323）

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

// 先剥掉 CSS 注释再参与契约判定：注释里允许引用被禁止的选择器（用于说明历史根因），
// 但注释不是有效选择器，不应触发契约
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const readDarkModeCss = () => stripCssComments(readSource('src/styles/dark-mode.css'))

// 取出每个规则/预处理的「选择器段」（花括号前的文本），用于逐条扫描
const selectorSegments = (css: string) =>
  css
    .split('}')
    .map((segment) => segment.slice(0, segment.indexOf('{')))
    .filter((segment) => segment.trim().length > 0)

describe('schedule week visual contract (#1323)', () => {
  it('dark-mode.css 中不存在同时包含 [class*="active"] 与 day-num 的选择器', () => {
    const css = readDarkModeCss()
    // 直接断言子串选择器整体消失（该选择器曾命中 Vue 过渡类名 *-enter-active / *-leave-active，
    // 导致翻周动画期间 .day-num 被强制染成 #60a5fa）
    expect(css).not.toContain('[class*="active"]')
    // 双保险：即使未来以其它写法出现，也不允许与 day-num 组合
    expect(css).not.toMatch(/\[class\*="[^"]*active[^"]*"\][\s\S]{0,120}?day-num/)
  })

  it('dark-mode.css 保留「今天」高亮的日期规则', () => {
    const css = readDarkModeCss()
    expect(css).toContain('[class*="today"]')
    expect(css).toMatch(
      /html\.dark \.schedule-view \[class\*="today"\] \[class\*="day-num"\] \{[^}]*color: #60a5fa !important;/
    )
  })

  it('ScheduleView 的 .schedule-view 规则含 user-select: none 加固', () => {
    const source = readSource('src/components/ScheduleView.vue')
    const ruleStart = source.indexOf('.schedule-view {')
    expect(ruleStart).toBeGreaterThanOrEqual(0)
    const ruleEnd = source.indexOf('}', ruleStart)
    const scheduleViewRule = source.slice(ruleStart, ruleEnd)
    expect(scheduleViewRule).toContain('-webkit-user-select: none')
    expect(scheduleViewRule).toContain('user-select: none')
  })

  it('ScheduleView 含 :deep() 的输入类元素可选中恢复规则', () => {
    const source = readSource('src/components/ScheduleView.vue')
    const styleBlock = source.slice(source.indexOf('<style scoped>'))
    // 输入框位于子组件（子 scoped 属性），普通后代选择器匹配不到，必须用 :deep()
    expect(styleBlock).toContain('.schedule-view :deep(input)')
    expect(styleBlock).toContain('.schedule-view :deep(textarea)')
    expect(styleBlock).toContain(".schedule-view :deep([contenteditable='true'])")
    expect(styleBlock).toContain('user-select: text')
  })

  it('dark-mode.css 禁止过渡类名子串选择器与 day-num/day-label 组合（通用防回归）', () => {
    const css = readDarkModeCss()
    // Vue 过渡类名模式：*-enter-active / *-leave-active / *-slide-* 等
    const transitionLike = /\[class\*="[^"]*(enter|leave|active|slide|fade)[^"]*"\]/
    const dayText = /day-(num|label)/

    for (const segment of selectorSegments(css)) {
      if (transitionLike.test(segment)) {
        expect(segment, `过渡类名子串选择器不得与 day-num/day-label 组合：${segment.trim()}`).not.toMatch(dayText)
      }
    }
  })
})
