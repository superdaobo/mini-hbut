import { describe, expect, it } from 'vitest'
import { readVueContractSource } from '../../utils/contract_source_test'

/**
 * #837 事件层 / lane 布局接线 —— 源码契约门闩。
 *
 * 单测（utils/timelineLayout.spec.ts）覆盖纯函数的算法正确性；本文件看守
 * 「Grid 如何接线」这类只能在源码层验证的硬约束，避免后续集成时回退：
 * 1. 事件层绝对定位且不拦截课程卡点击（层 pointer-events: none + 卡片 auto）；
 * 2. 课程卡样式必须**合并** lane 结果（禁止改动 utils/layout.ts 的既有定位）；
 * 3. 重叠判定复用 timelineLayout（不自建第二套算法）；
 * 4. 空白点击必须保留 tap / swipe 位移守卫，并走 #857 两段式选择；
 * 5. #856 视图筛选必须在 lane 输入层发生，不能 CSS 假隐藏；
 * 6. 新增 props 必须带安全默认值（AI 导入预览等既有调用点零改动）。
 */
const source = readVueContractSource('src/features/schedule/components/ScheduleGrid.vue')
const cardSource = readVueContractSource('src/features/schedule/components/ScheduleEventCard.vue')

/** 按「选择器 {」定位 CSS 规则块并截取配对花括号内的声明 */
const cssBlock = (text: string, selector: string): string => {
  const start = text.indexOf(`${selector} {`)
  expect(start, `缺少选择器 ${selector}`).toBeGreaterThan(-1)
  const open = text.indexOf('{', start)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return ''
}

describe('schedule grid event layer contract (#837)', () => {
  it('事件层绝对定位在 11 行高度内，且不拦截课程卡点击', () => {
    expect(source).toContain('<div class="event-layer">')
    const block = cssBlock(source, '.event-layer')
    // 显式绑定 11×slot：列被拉伸得更高时百分比定位仍与 grid-template-rows 同源
    expect(block).toContain('height: calc(var(--slot-height) * 11)')
    expect(block).toContain('pointer-events: none')
    // 卡片单独恢复点击，避免事件层挡住课程卡
    expect(cardSource).toContain('pointer-events: auto')
  })

  it('课程卡样式合并 lane 结果（收窄课程但不改 grid-row 定位）', () => {
    expect(source).toContain(':style="[getCourseStyle(course), courseLaneStyle(course, day)]"')
  })

  it('重叠判定复用 timelineLayout，不自建第二套算法', () => {
    expect(source).toContain("from '../utils/timelineLayout'")
    expect(source).not.toContain('function intervalsOverlap')
  })

  it('空白点击保留 tap / swipe 位移守卫，并且两次点击同一选择才确认', () => {
    expect(source).toContain('TAP_MOVE_THRESHOLD_PX = 8')
    expect(source).toContain("closest?.('.course-card, .event-card")
    expect(source).toContain('buildBlankTimeSelection(')
    expect(source).toContain('isSameBlankTimeSelection(blankSelection.value, nextSelection)')
    expect(source).toContain("emit('confirm-blank-selection', nextSelection)")
    expect(source).toContain('class="blank-time-selection"')
    expect(source).not.toContain("emit('create-event-at'")
  })

  it('#860 空白待选框与事件层共用固定 11 节高度，避免 day-column 拉伸导致纵向漂移', () => {
    expect(source).toContain('class="blank-selection-layer"')
    const selectionLayer = cssBlock(source, '.blank-selection-layer')
    expect(selectionLayer).toContain('height: calc(var(--slot-height) * 11)')
    expect(selectionLayer).toContain('pointer-events: none')
    expect(source).toMatch(/class="blank-selection-layer"[\s\S]*?class="blank-time-selection"/)
  })

  it('#856 三态筛选在 lane 输入层生效，不保留隐藏内容的空 lane', () => {
    expect(source).toContain("const showCourses = computed(() => props.viewMode !== 'events')")
    expect(source).toContain("const showEvents = computed(() => props.viewMode !== 'courses')")
    expect(source).toContain('const courses = visibleCoursesForDay(day)')
    expect(source).toContain('const events = visibleEventsForDay(day)')
    expect(source).toContain('v-for="course in visibleCoursesForDay(day)"')
  })

  it('#837/#856/#857 新增 props 全部带安全默认值', () => {
    expect(source).toContain('getEventsForDay: { type: Function, default: () => () => [] }')
    expect(source).toContain('enableBlankCreate: { type: Boolean, default: true }')
    expect(source).toContain("viewMode: { type: String, default: 'all' }")
    expect(source).toContain('selectionResetNonce: { type: Number, default: 0 }')
  })
})
