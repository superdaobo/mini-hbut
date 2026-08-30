import { describe, expect, it } from 'vitest'
import { readVueContractSource } from '../../utils/contract_source_test'

/**
 * #749 课表横向划分线与课程卡片逐节错位 —— 源码契约门闩。
 *
 * 根因回顾：.courses-grid 丢失 v1.4.6 的 min-height 保护后，视口不足 11×slot 时
 * .grid-lines（inset:0 + flex column）高度跟随容器被压缩，11 个 .line-row 被 flex
 * 均匀压缩（约 84px/行），而 time-slot / day-column 行距仍为 var(--slot-height)
 * （约 86px/行），三套行距分叉且逐节累积（第 9 节偏 19px），虚线穿入课程方块。
 *
 * 失败条件（回归即挂）：
 * 1. .courses-grid 丢失 min-height: calc(var(--slot-height) * 11 + var(--schedule-bottom-gap))
 * 2. 划分线回退为 .line-row DOM 循环（可被 flex 压缩的实现）
 * 3. 划分线尺寸不再绑定 var(--slot-height)（线位漂移）
 * 4. .time-slot 丢失 flex: 0 0 固定（时间轴行被压缩/拉伸）
 */
const source = readVueContractSource('src/features/schedule/components/ScheduleGrid.vue')

/** 按「选择器 {」定位 CSS 规则块并截取配对花括号内的声明，避免跨块/媒体查询误匹配 */
const cssBlock = (selector: string): string => {
  const start = source.indexOf(`${selector} {`)
  expect(start, `ScheduleGrid.vue 缺少选择器 ${selector}`).toBeGreaterThan(-1)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return ''
}

describe('schedule grid lines contract (#749)', () => {
  it('courses-grid keeps v1.4.6 min-height guard (11×slot + bottom-gap)', () => {
    const block = cssBlock('.courses-grid')
    // A1：容器高度保护，视口不足时不再被压缩
    expect(block).toContain('min-height: calc(var(--slot-height) * 11 + var(--schedule-bottom-gap))')
    expect(block).toContain('height: 100%')
  })

  it('grid lines are painted as slot-height-bound background (no compressible line-row DOM)', () => {
    // B：划分线为单元素背景绘制，线距 = var(--slot-height) 整数倍
    const block = cssBlock('.grid-lines')
    expect(block).toContain('repeating-linear-gradient')
    expect(block).toContain('calc(var(--slot-height) - 1px)')
    // background-size 限定 11 个完整周期 = 11 条线，底部留白不着色
    expect(block).toContain('calc(var(--slot-height) * 11)')
    // 禁止回归可被 flex 压缩的 line-row 行循环
    expect(source).not.toContain('.line-row')
    expect(source).not.toContain('class="line-row"')
  })

  it('time-slot rows are flex-fixed to slot-height', () => {
    // A2：时间轴行禁止 flex 压缩/拉伸
    const block = cssBlock('.time-slot')
    expect(block).toContain('flex: 0 0 var(--slot-height)')
    expect(block).toContain('height: var(--slot-height)')
  })

  it('day-column rows stay pinned to 11×slot-height', () => {
    // 课程卡片网格行：固定 11 行 × slot 高，与划分线/时间轴同源
    const block = cssBlock('.day-column')
    expect(block).toContain('grid-template-rows: repeat(11, var(--slot-height))')
    expect(block).toContain('min-height: calc(var(--slot-height) * 11)')
  })

  it('time-axis keeps min-height guard aligned with courses-grid', () => {
    // 时间轴容器与课程网格容器共用同一 min-height 公式，保证两列等高对齐
    const block = cssBlock('.time-axis')
    expect(block).toContain('min-height: calc(var(--slot-height) * 11 + var(--schedule-bottom-gap))')
  })
})
