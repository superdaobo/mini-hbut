import { describe, expect, it } from 'vitest'
import { readVueContractSource } from '../../utils/contract_source_test'

/** #1097：固定课节/真实时间高度下，标题允许换行但不可挤压底部信息。 */
const gridSource = readVueContractSource('src/features/schedule/components/ScheduleGrid.vue')
const eventSource = readVueContractSource('src/features/schedule/components/ScheduleEventCard.vue')

/** 提取 scoped style 的单一选择器内容，防止只在注释中碰巧出现断言字符串。 */
const cssBlock = (source: string, selector: string): string => {
  // 必须匹配完整选择器，避免 .course-name 误命中 .course-card--traditional .course-name。
  const blocks = [...source.matchAll(/^([^\r\n{]+)\{/gm)]
  const match = blocks.find((candidate) => candidate[1].trim() === selector)
  expect(match, `缺少 CSS 选择器：${selector}`).toBeDefined()
  const open = source.indexOf('{', match!.index)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`CSS 规则未闭合：${selector}`)
}

describe('#1097 课表课程与个人日程卡片标题排版', () => {
  it('课程默认最多三行，超长英文/中文不横向撑出卡片', () => {
    const title = cssBlock(gridSource, '.course-name')
    expect(title).toContain('display: -webkit-box')
    expect(title).toContain('-webkit-line-clamp: 3')
    expect(title).toContain('-webkit-box-orient: vertical')
    expect(title).toContain('overflow-wrap: anywhere')
    expect(title).toContain('min-height: 0')
    expect(title).toContain('flex: 0 1 auto')
    expect(title).not.toContain('white-space: nowrap')
  })

  it('教室和教师同属不可收缩的信息区，卡片保留至少 4px 的底部内边距', () => {
    expect(gridSource).toContain('<div class="course-meta">')
    expect(gridSource).toMatch(/class="course-meta"[\s\S]*?class="course-room"/)
    expect(gridSource).toMatch(/class="course-meta"[\s\S]*?class="course-teacher"/)
    const meta = cssBlock(gridSource, '.course-meta')
    expect(meta).toContain('flex: 0 0 auto')
    expect(meta).toContain('min-width: 0')
    expect(cssBlock(gridSource, '.course-card')).toContain('padding: 4px 4px 5px')
    expect(cssBlock(gridSource, '.courses-grid .day-column > .course-card.course-card--traditional')).toContain('padding: 4px 2px 5px')
    expect(cssBlock(gridSource, '.courses-grid .day-column > .course-card.course-card--class')).toContain('padding: 4px 6px 5px')
    expect(cssBlock(gridSource, '.course-room')).toContain('width: 100%')
  })

  it('单节课允许降到一行标题并隐藏教师，但保留教室/冲突信息和原有 grid 定位', () => {
    expect(gridSource).toContain("const isSinglePeriodCourse = (course) => {")
    expect(gridSource).toContain("'course-card--single-period': isSinglePeriodCourse(course)")
    expect(cssBlock(gridSource, '.course-card--single-period .course-name')).toContain('-webkit-line-clamp: 1')
    expect(cssBlock(gridSource, '.course-card--single-period .course-teacher')).toContain('display: none')
    expect(gridSource).toContain("course.is_conflict ? t('schedule.grid.conflictHint')")
    expect(gridSource).toContain(':style="[getCourseStyle(course), courseLaneStyle(course, day)]"')
  })

  it('日程最多两行但时间不收缩，空间不足仍沿用精简逻辑', () => {
    const title = cssBlock(eventSource, '.event-card__name')
    expect(title).toContain('display: -webkit-box')
    expect(title).toContain('-webkit-line-clamp: 2')
    expect(title).toContain('overflow-wrap: anywhere')
    expect(title).toContain('white-space: normal')
    expect(title).toContain('flex: 0 1 auto')
    expect(cssBlock(eventSource, '.event-card__time')).toContain('flex: 0 0 auto')
    expect(cssBlock(eventSource, '.event-card__place')).toContain('flex: 0 0 auto')
    expect(eventSource).toContain('const isSingleLine = computed(() => isDense.value || heightPercent.value < 4)')
    expect(eventSource).toContain('heightPercent.value >= 10')
    expect(eventSource).toContain('v-if="!isSingleLine"')
    expect(eventSource).toContain('min-height: var(--event-min-height, 16px)')
  })
})
