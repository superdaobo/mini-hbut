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
 * 2. .line-row 丢失 flex: 0 0 / dashed 视觉（划分线被改为实线或可压缩实现）
 * 3. .time-slot 丢失 flex: 0 0 固定（时间轴行被压缩/拉伸）
 * 4. 划分线尺寸不再绑定 var(--slot-height)（线位漂移）
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

  it('grid lines keep sparse dashed line-row pinned by flex-basis (v1.4.6 rhythm, anti-compression)', () => {
    // 划分线为 line-row 稀疏虚线（用户指定疏密），线本体 = ::after 1px 高 + 水平渐变，
    // 行高由 flex: 0 0 固定 + 容器 min-height 保护，杜绝 flex 压缩
    const block = cssBlock('.line-row')
    expect(block).toContain('flex: 0 0 var(--slot-height)')
    expect(block).toContain('height: var(--slot-height)')
    const after = cssBlock('.line-row::after')
    expect(after).toContain('height: 1px')
    expect(after).toContain('repeating-linear-gradient')
    expect(after).toContain('#e5e7eb')
    // 禁止回退为实线背景绘制（用户否决过 gradient 实线视觉）
    expect(source).not.toContain('background-size: 100% calc(var(--slot-height) * 11)')
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
