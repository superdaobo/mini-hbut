import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

/** 提取 Vue SFC 中 scoped style 块，便于约束页级背景写法 */
const extractStyleBlock = (source: string) => {
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  return match?.[1] || ''
}

const extractRootRule = (style: string, selector: string) => {
  const re = new RegExp(
    `\\.${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`,
  )
  return style.match(re)?.[1] || ''
}

const VIEW_FILES = [
  {
    path: 'src/components/CalendarView.vue',
    rootClass: 'calendar-view',
    label: '校历',
  },
  {
    path: 'src/components/AcademicProgressView.vue',
    rootClass: 'progress-view',
    label: '学业情况',
  },
  {
    path: 'src/components/TrainingPlanView.vue',
    rootClass: 'training-plan-view',
    label: '培养方案',
  },
] as const

describe('academic views surface polish contract (#465)', () => {
  it('does not paint full-page blue/cyan --ui-bg-gradient on the three academic views', () => {
    for (const view of VIEW_FILES) {
      const source = readText(view.path)
      const style = extractStyleBlock(source)
      const rootRule = extractRootRule(style, view.rootClass)

      expect(rootRule, `${view.label} root rule missing`).toBeTruthy()
      // 禁止页级整页使用蓝青渐变 token
      expect(rootRule).not.toMatch(/--ui-bg-gradient/)
      expect(rootRule).not.toMatch(/radial-gradient\s*\(/i)
      // 对齐成绩查询中性浅底（或 surface 级中性 token）
      expect(rootRule).toMatch(/background:\s*(#f6fafe|var\(--ui-surface)/)
    }
  })

  it('keeps modest enter motion and reduced-motion fallbacks on academic views', () => {
    for (const view of VIEW_FILES) {
      const style = extractStyleBlock(readText(view.path))
      expect(style, `${view.label} should define keyframes`).toMatch(/@keyframes/)
      expect(style, `${view.label} should respect reduced motion`).toContain(
        'prefers-reduced-motion: reduce',
      )
    }
  })

  it('dark mode uses neutral slate page backgrounds for the three views (no blue radial wash)', () => {
    const dark = readText('src/styles/dark-mode.css')

    // 页级应有独立中性深底，且不应再把 calendar/progress/training 塞进带蓝径向的 :is 组
    expect(dark).toMatch(
      /html\.dark body \.calendar-view\s*\{[\s\S]*?background(?:-color)?:\s*#0f172a/,
    )
    expect(dark).toMatch(
      /html\.dark body :is\(\.progress-view, \.training-plan-view\)\s*\{[\s\S]*?background(?:-color)?:\s*#0f172a/,
    )

    // 仍在同一 :is 组里带蓝径向 = 回归
    const blueWashGroup =
      dark.match(
        /html\.dark body :is\(([^)]*)\)\s*\{[\s\S]*?radial-gradient\([^)]*rgba\(37,\s*99,\s*235/g,
      ) || []
    for (const block of blueWashGroup) {
      expect(block).not.toMatch(/\.calendar-view/)
      expect(block).not.toMatch(/\.progress-view/)
      expect(block).not.toMatch(/\.training-plan-view/)
    }

    // 表头暗色可读，非死白
    expect(dark).toContain('html.dark body .calendar-view .calendar-table thead th')
    expect(dark).toMatch(
      /html\.dark body \.calendar-view \.calendar-table thead th\s*\{[\s\S]*?background:\s*#334155/,
    )
  })
})
