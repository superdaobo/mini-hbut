/**
 * #1086 课表编辑器接线契约（源码门禁）。
 *
 * 背景：#844 把课表编辑器从 ScheduleAddCourseDialog 换成统一 ScheduleAddArrangementDialog 后，
 * 弹窗显隐改由 ScheduleView 的 showArrangement 决定，而 useScheduleEditor 只翻内部标志
 * showAddCourse。当时漏接了「课程详情 → 修改课程」这一路：详情被关闭、编辑弹窗永不渲染，
 * 且残留的 showAddCourse 会把周次滑动/键盘切换一起锁死（它参与 anyOverlayOpen 门控）。
 *
 * 本 spec 钉死三件事：
 * 1. 模板里的详情入口必须走编排函数，禁止裸绑 composable；
 * 2. 编排函数必须完成「登录门 → 编辑态 → open → nextTick → 同步可见性」五步且顺序正确；
 * 3. 管理课程入口复用同一编排，不得另起一套。
 *
 * 抗绕过设计（review 后加固）：
 * - 所有断言都跑在 **剥除注释后** 的源码上 —— 否则把规范实现留在 `/* *\/` 注释里、
 *   真实代码回退，门禁会误判为绿；
 * - 模板断言只扫 `<template>` 之后的部分 —— 避免注释或脚本里的同名字符串冒充绑定；
 * - 反向自检对 **真实源码** 做内存内篡改（退回裸绑 / 删掉同步行），证明判据不是空断言。
 *
 * 为什么不做组件级测试：仓库未引入 @vue/test-utils（node 环境无 DOM），
 * ScheduleView 也没有常驻挂载点，与 ScheduleAddCourseDialog.spec.ts 的既有策略一致。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const viewSource = readFileSync(
  new URL('../../components/ScheduleView.vue', import.meta.url),
  'utf8'
)

/** 回归形态：把 composable 直接当模板事件处理器（#844 漏接的那一版） */
const RAW_DETAIL_BINDING = /@open-edit-course\s*=\s*"editor\.openEditCourseDialog"/
/** 编排函数的正确绑定 */
const WIRED_DETAIL_BINDING = '@open-edit-course="openCourseEditor"'
/** 可见性同步行的唯一正确形态（父层把内部标志同步给弹窗显隐） */
const VISIBILITY_SYNC = 'showArrangement.value = editor.showAddCourse.value'

/**
 * 剥离 `//` 与 `/* *\/` 注释（保留字符串字面量内的内容，如 'https://…'）。
 * 逐字符扫描而非正则替换：模板里存在 `//` 开头的 URL 与含引号的文案。
 */
const stripComments = (source: string): string => {
  const out: string[] = []
  let quote: string | null = null
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    const next = source[i + 1]
    if (quote) {
      out.push(ch)
      if (ch === '\\') {
        out.push(next ?? '')
        i += 1
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out.push(ch)
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      out.push('\n')
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 1
      continue
    }
    out.push(ch)
  }
  return out.join('')
}

const codeSource = stripComments(viewSource)
/** 模板区：只在这里认模板绑定 */
const templateSource = codeSource.slice(codeSource.indexOf('<template>'))

/**
 * 截取 `const <name> = (...) => { ... }` 的函数体（花括号配平）。
 * 从 `=>` 之后再找 `{`，避免命中参数里的类型字面量（如 dialogOptions 的类型）。
 */
const extractArrowBody = (source: string, name: string): string => {
  const head = source.indexOf(`const ${name} = `)
  if (head < 0) return ''
  const arrow = source.indexOf('=>', head)
  if (arrow < 0) return ''
  const bodyStart = source.indexOf('{', arrow)
  if (bodyStart < 0) return ''
  let depth = 0
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') {
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(bodyStart, i + 1)
    }
  }
  return ''
}

describe('#1086 课表编辑入口接线契约', () => {
  it('模板里的课程详情不得裸绑 composable，必须走编排函数', () => {
    expect(templateSource).not.toBe('')
    expect(templateSource).not.toMatch(RAW_DETAIL_BINDING)
    expect(templateSource).toContain(WIRED_DETAIL_BINDING)
    expect(templateSource).toContain('@edit-course="handleEditManagedCourse"')
  })

  it('编排函数必须完成「登录门 → 编辑态 → open → nextTick → 同步可见性」五步', () => {
    const body = extractArrowBody(codeSource, 'openCourseEditor')
    expect(body).not.toBe('')

    // 1) 登录门：未登录时不静默无响应
    expect(body).toContain('editor.hasValidLoginSession()')
    expect(body).toContain('editor.promptLoginRequired()')

    // 2) 编辑态必须先于弹窗打开：标题/提交按钮/冲突提示都依赖 arrangementMode
    expect(body).toContain("arrangementMode.value = 'editCourse'")

    // 3) 调 composable 打开
    expect(body).toContain('editor.openEditCourseDialog(course, dialogOptions)')

    // 4) + 5) 等一拍后再同步可见性（这是 #844 漏掉的那一步）
    expect(body).toMatch(/await nextTick\(\)/)
    expect(body).toContain(VISIBILITY_SYNC)

    const modeAt = body.indexOf("arrangementMode.value = 'editCourse'")
    const openAt = body.indexOf('editor.openEditCourseDialog(')
    const tickAt = body.indexOf('await nextTick()')
    const syncAt = body.indexOf(VISIBILITY_SYNC)
    expect(modeAt).toBeGreaterThanOrEqual(0)
    expect(modeAt).toBeLessThan(openAt)
    expect(openAt).toBeLessThan(tickAt)
    expect(tickAt).toBeLessThan(syncAt)
  })

  it('管理课程入口复用同一编排，不得另起一套可见性同步', () => {
    expect(codeSource).toMatch(
      /const handleEditManagedCourse = \(course: any\) =>\s*openCourseEditor\(course, \{ reopenManage: true \}\)/
    )
  })

  it('反向自检 A：把真实源码的绑定退回 #844 形态时，门禁判据必须命中', () => {
    const regressed = viewSource.replace(WIRED_DETAIL_BINDING, '@open-edit-course="editor.openEditCourseDialog"')
    // 先确认替换真的发生了：若源码文案漂移导致替换落空，本用例必须失败而不是"假绿"
    expect(regressed).not.toBe(viewSource)
    expect(stripComments(regressed).slice(stripComments(regressed).indexOf('<template>'))).toMatch(
      RAW_DETAIL_BINDING
    )
  })

  it('反向自检 B：删掉真实源码里的可见性同步行时，五步判据必须判红', () => {
    const withoutSync = viewSource.replace(new RegExp(`\\n\\s*${VISIBILITY_SYNC.replace(/\./g, '\\.')}`, 'g'), '\n')
    expect(withoutSync).not.toBe(viewSource)
    const body = extractArrowBody(stripComments(withoutSync), 'openCourseEditor')
    expect(body).not.toBe('')
    expect(body).not.toContain(VISIBILITY_SYNC)
  })
})
