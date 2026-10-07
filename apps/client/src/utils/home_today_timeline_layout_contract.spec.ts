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
/** 进行中卡片自身的 class（区块内第一个 div 即卡片） */
const cardClasses = () => classesOf(activeCard.match(/<div class="([^"]*)"/)![1])

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
    // 任何显式宽度（w-36 / w-[9rem] / w-1/2 …）都会让导轨宽度与内容脱钩，
    // 重新引入「文本区预留宽度必须手动跟随导轨宽度」这类耦合
    expect(
      rail.filter((c) => /^w-/.test(c)),
      '导轨宽度必须由内容决定，不得出现任何 w-* 固定宽度',
    ).toEqual([])
  })

  it('导轨的负外边距与卡片纵向内边距成对匹配（防 2px 静默偏移）', () => {
    // 导轨作为 flex 项默认只撑到卡片内容盒高；必须用负外边距抵消卡片的 pt/pb 才能与卡片同高，
    // 否则 justify-center 的基准从卡片盒变成内容盒，倒计时与按钮整体上移 2px。
    // 这里成对校验：改了卡片内边距而不改导轨，测试必须失败。
    const card = cardClasses()
    const pt = card.find((c) => /^pt-\d+$/.test(c))
    const pb = card.find((c) => /^pb-\d+$/.test(c))
    expect(pt, '卡片应有 pt-* 纵向内边距（导轨的负外边距靠它抵消）').toBeTruthy()
    expect(pb, '卡片应有 pb-* 纵向内边距（导轨的负外边距靠它抵消）').toBeTruthy()

    const rail = railClasses()
    expect(rail).toContain('-' + pt!.replace('pt-', 'mt-')) // pt-3 → -mt-3
    expect(rail).toContain('-' + pb!.replace('pb-', 'mb-')) // pb-4 → -mb-4
  })

  it('装饰插画是卡片 flex 容器的直接子节点（包含块不能变）', () => {
    const illustration = activeCard.match(/<img[^>]*class="([^"]*today-course-illustration[^"]*)"[^>]*\/>/)
    expect(illustration, '进行中卡片应存在装饰插画').toBeTruthy()
    // `.today-course-illustration` 是 position:absolute + top/right/bottom:0，包含块一变几何就变：
    // 挂进导轨会跟随其内容盒高度缩水，挂进文本区会横向错位。
    // 判据：卡片开标签与 <img> 之间的 <div> 必须全部闭合 ⇒ img 就是卡片的直接子节点。
    const cardOpenTagEnd = activeCard.indexOf('>', activeCard.indexOf('<div class="')) + 1
    const between = activeCard.slice(cardOpenTagEnd, activeCard.indexOf(illustration![0]))
    const opened = (between.match(/<div\b/g) || []).length
    const closed = (between.match(/<\/div>/g) || []).length
    expect(opened, '插画必须是卡片直接子节点（其间不得有未闭合的 div）').toBe(closed)
  })
})
