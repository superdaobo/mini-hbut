import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1305 暗色二度轮调（第一批）契约：
 * 「我的」页操作区与课表/课程详情弹窗里凡写死浅底的类，必须在 dark-mode.css 有 html.dark 覆盖。
 * 类名从各自的样式源动态提取 —— 以后新增浅底块没写暗色规则会直接失败。
 */
const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const LIGHT_BG =
  /background(?:-color)?:\s*(#fff(?:fff)?|#f8fafc|#f3f4f6|#f1f5f9|#f0f4f8|#f6f8fb|#e8eaf6|#fce8e6|#fff7ed|#fff1f2|#fff7f7|#fee2e2|#dbeafe|#eef6ff|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i

const parseRules = (css: string) => {
  const rules: { selector: string; body: string }[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const selector = m[1].trim().replace(/\s+/g, ' ')
    if (!selector || selector.startsWith('@')) continue
    rules.push({ selector, body: m[2] })
  }
  return rules
}

const lightBackgroundClasses = (css: string) => {
  const classes = new Set<string>()
  for (const rule of parseRules(css)) {
    if (rule.selector.startsWith('html.dark')) continue
    if (!LIGHT_BG.test(rule.body)) continue
    for (const match of rule.selector.matchAll(/\.([a-zA-Z][\w-]{2,})/g)) classes.add(match[1])
  }
  return [...classes]
}

const darkCovers = (darkCss: string, cls: string) =>
  new RegExp(`html\\.dark[^{}]*\\.${cls}(?![\\w-])`).test(darkCss)

/** 递归收集 src 下的 .vue/.css（排除测试与 node_modules） */
const collectStyleSources = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      collectStyleSources(full, out)
    } else if (/\.(vue|css)$/.test(entry.name) && !/\.spec\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('dark mode round 2 · stage 1 (#1305)', () => {
  const dark = readSource('src/styles/dark-mode.css')
  const meCss = readSource('src/components/MeView.scoped.css')
  const detailVue = readSource('src/features/schedule/components/ScheduleCourseDetail.vue')
  const gridVue = readSource('src/features/schedule/components/ScheduleGrid.vue')
  const modalCss = readSource('src/features/schedule/styles/modal.css')

  // 组件可以在自己的 <style> 里写 `html.dark` 块（如 #869 的移除按钮），也算已覆盖
  const detailCss = detailVue.slice(detailVue.indexOf('<style'))
  const gridCss = gridVue.slice(gridVue.indexOf('<style'))

  it('「我的」页所有浅底类都有暗色覆盖', () => {
    const combined = dark + meCss
    const missing = lightBackgroundClasses(meCss).filter((cls) => !darkCovers(combined, cls))
    expect(missing).toEqual([])
  })

  it('课表课程详情弹窗所有浅底类都有暗色覆盖', () => {
    const combined = dark + detailCss + modalCss
    const missing = [
      ...lightBackgroundClasses(detailCss),
      ...lightBackgroundClasses(modalCss)
    ].filter((cls) => !darkCovers(combined, cls))
    expect(missing).toEqual([])
  })

  it('禁止再用 :global(html.dark)：scoped 编译器会丢掉后续选择器', () => {
    const root = resolve(process.cwd(), 'src')
    const offenders = collectStyleSources(root)
      // 全局样式文件的注释里会提到这个写法，本身不参与 scoped 编译
      .filter((file) => !file.includes('dark-mode.css'))
      .filter((file) => readFileSync(file, 'utf8').includes(':global(html.dark)'))
      .map((file) => file.replace(root, 'src'))
    expect(offenders).toEqual([])
  })

  it('第二批页面里「严重不可读」的类都有暗色覆盖（防止回退）', () => {
    const critical = [
      'html.dark .campus-network-view .status-value',
      'html.dark .campus-network-view .field > span',
      'html.dark .classroom-page .classroom-result-meta strong',
      'html.dark .library-view .search-panel .summary',
      'html.dark .ai-view .debug-pill',
      'html.dark .electricity-page .ibar-val',
      'html.dark .cx-hub .hero-row p',
      'html.dark .cx-inbox-title.unread',
      'html.dark .grade-view .grade-card .credit',
      'html.dark .search-btn',
      'html.dark .towergo-view .tg-tabs--overlay',
      'html.dark .logo-text'
    ]
    const missing = critical.filter((selector) => !dark.includes(selector))
    expect(missing).toEqual([])
  })

  it('课表课程卡/今日列/节次有暗色覆盖', () => {
    const combined = dark + gridCss
    const missing = lightBackgroundClasses(gridCss).filter((cls) => !darkCovers(combined, cls))
    expect(missing).toEqual([])
  })
})
