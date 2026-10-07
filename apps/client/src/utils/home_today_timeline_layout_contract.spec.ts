import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 首页「今日安排」时间轴布局契约（#1011）。
 *
 * 背景：长课名曾导致两类布局破裂——
 *   1) 已结束 / 未开始行：中间层 flex 包装器缺 `min-w-0`，`min-width: auto` 使其无法收缩到
 *      长课名的固有宽度以下，整行被撑宽，把右侧状态徽标挤出卡片；
 *   2) 进行中卡片：文本区用固定 `pr-20` 为「绝对定位的固定宽导轨」让位，两者宽度不一致，
 *      且课名没有任何截断，长课名直接钻到「去上课」按钮下面。
 *
 * 本 spec 只断言「不变量」——课名截断链是否完整、导轨是否由内容自适应——不断言具体 class 顺序，
 * 以免正常重构时误报。真实布局验证走最小复现页（见 data/plan-home-today-course-name-overflow.md）。
 */
const repoRoot = process.cwd()
const template = fs.readFileSync(
  path.join(repoRoot, 'src/templates/views/Dashboard.html'),
  'utf8',
)

// 今日安排时间轴区块：从 Timeline 注释到状态页脚之前
const timelineStart = template.indexOf('<!-- Timeline -->')
const timelineEnd = template.indexOf('<!-- Status Footer -->')
const timeline = template.slice(timelineStart, timelineEnd)

// 进行中（高亮）卡片区块
const activeCard = timeline.slice(
  timeline.indexOf('<!-- Active / Next course'),
  timeline.indexOf('<!-- Upcoming course'),
)

const classesOf = (classAttr: string) => classAttr.split(/\s+/).filter(Boolean)

/** 取 `source` 中位于 `marker` 之前的第 n 个（从后往前）<div class="..."> */
const divClassesBefore = (source: string, marker: string, nthFromLast = 1) => {
  const before = source.slice(0, source.indexOf(marker))
  const matches = [...before.matchAll(/<div class="([^"]*)"/g)]
  return matches.length >= nthFromLast ? matches[matches.length - nthFromLast][1] : ''
}

const COUNTDOWN_MARKER = '{{ getCourseCountdown(course) }}'
/** 倒计时自身也是 div，故导轨是它之前的第 2 个 div */
const railClasses = () => classesOf(divClassesBefore(activeCard, COUNTDOWN_MARKER, 2))

describe('首页今日安排时间轴布局契约 (#1011)', () => {
  it('已完成 / 未开始行的课名包装器都带 min-w-0，长课名才会截断而不是撑破卡片', () => {
    const wrappers = [...timeline.matchAll(/<div class="([^"]*\bflex-1\b[^"]*\bjustify-between\b[^"]*)"/g)]
    // 至少「已完成」与「未开始」两行同构存在
    expect(wrappers.length).toBeGreaterThanOrEqual(2)
    for (const [, classAttr] of wrappers) {
      // 截断链上每一层 flex 子项都需要 min-w-0，只在内层加不足以救
      expect(classesOf(classAttr)).toContain('min-w-0')
    }
  })

  it('进行中卡片的课名单行截断，且其文本区可收缩', () => {
    const nameTag = activeCard.match(/<h4 class="([^"]*)">\{\{\s*course\.name\s*\}\}<\/h4>/)
    expect(nameTag, '进行中卡片应存在课名节点').toBeTruthy()
    expect(classesOf(nameTag![1])).toContain('truncate')

    const textAreaClass = divClassesBefore(activeCard, nameTag![0])
    expect(classesOf(textAreaClass)).toContain('min-w-0')
    // 不得再用固定右内边距为导轨让位：宽度应由导轨真实占位决定
    expect(classesOf(textAreaClass).some((c) => /^pr-(?!0$)\d/.test(c))).toBe(false)
  })

  it('进行中卡片的右侧导轨由内容自适应，不再是绝对定位的固定宽覆盖层', () => {
    const rail = railClasses()
    expect(rail, '导轨应是 flex 项而非覆盖层').toContain('shrink-0')
    expect(rail).not.toContain('absolute')
    expect(rail.some((c) => /^w-\d/.test(c)), '导轨不得使用固定宽度，否则又会与文本区宽度脱钩').toBe(false)
  })

  it('导轨用负外边距抵消卡片纵向内边距，垂直居中基准与修复前一致（防 2px 静默偏移）', () => {
    const rail = railClasses()
    // 卡片为 pt-3 pb-4；导轨作为 flex 项默认只撑到内容盒高，不抵消就会比卡片矮 28px，
    // 使 justify-center 的基准从卡片盒变成内容盒，倒计时与按钮整体上移 2px
    expect(rail).toContain('-mt-3')
    expect(rail).toContain('-mb-4')
  })

  it('装饰插画是卡片自身子节点（挂进导轨会跟随其内容盒高度缩水）', () => {
    const illustration = activeCard.match(/<img[^>]*class="([^"]*today-course-illustration[^"]*)"[^>]*\/>/)
    expect(illustration, '进行中卡片应存在装饰插画').toBeTruthy()
    // 必须直接位于卡片 flex 容器下，而不是导轨内部
    const railStart = activeCard.indexOf(COUNTDOWN_MARKER)
    expect(activeCard.indexOf(illustration![0])).toBeLessThan(railStart)
  })
})
