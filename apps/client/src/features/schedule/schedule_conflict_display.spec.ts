/**
 * #1115 冲突显示接线契约。
 *
 * 数据切片/边界由 layout.spec.ts 覆盖；本文件锁住组件与适配器的接线，
 * 防止后续重构把「合并/并排」回退成 CSS 假隐藏或漏掉显示区间。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('layout.ts #1115 数据契约', () => {
  const source = read('./utils/layout.ts')

  it('导出冲突模式类型与切片入口', () => {
    expect(source).toContain("export type ScheduleConflictDisplayMode = 'merged' | 'side-by-side'")
    expect(source).toContain('export const collectPeriodConflicts')
    expect(source).toContain('export const buildVisibleMergedCourses')
    expect(source).toContain('export const buildOverflowConflictCourse')
  })

  it('merged 才生成汇总卡，side-by-side 只保留真实课程', () => {
    expect(source).toContain("mode === 'merged'")
    expect(source).toContain('? buildConflictBlocks(day, merged')
    expect(source).toContain('? buildVisibleMergedCourses(merged, periodConflicts)')
    expect(source).toContain("conflictDisplay === 'side-by-side' ? 'side-by-side' : 'merged'")
  })

  it('切片只写 _displayStart/_displaySpan，不改原始 period/djs', () => {
    expect(source).toContain('_displayStart: run.start')
    expect(source).toContain('_displaySpan: run.span')
    expect(source).toContain('...course,')
  })

  it('getCourseStyle 使用显示区间', () => {
    expect(source).toContain('course._displayStart ?? course.period')
    expect(source).toContain('course._displaySpan ?? course.djs')
  })
})

describe('ScheduleGrid.vue #1115 接线', () => {
  const source = read('./components/ScheduleGrid.vue')

  it('溢出入口含课程时走合成冲突详情，纯日程沿用 #837', () => {
    expect(source).toContain("import { buildOverflowConflictCourse } from '../utils/layout'")
    expect(source).toContain('const openOverflowGroup')
    expect(source).toContain('buildOverflowConflictCourse(')
    expect(source).toContain('openCourseDetail(synthetic)')
    expect(source).toContain('openFirstEvent(items)')
    expect(source).toContain('@click.stop="openOverflowGroup(group)"')
  })

  it('单节判断使用显示区间，lane/日程层未回退', () => {
    expect(source).toContain('course?._displayStart ?? course?.period')
    expect(source).toContain('course?._displaySpan ?? course?.djs')
    expect(source).toContain('collectTimelineItems')
    expect(source).toContain('courseLaneStyle')
    expect(source).toContain('class="event-layer"')
    expect(source).toContain('class="line-row"')
  })
})

describe('useScheduleGrid/timelineAdapters #1115 接线', () => {
  it('useScheduleGrid 接受 conflictDisplay getter 并传给数据层', () => {
    const source = read('./composables/useScheduleGrid.ts')
    expect(source).toContain('conflictDisplay?: () => ScheduleConflictDisplayMode | string')
    expect(source).toContain("options.conflictDisplay?.() === 'side-by-side'")
    expect(source).toContain('conflictDisplay')
  })

  it('courseToTimelineItem 使用显示区间', () => {
    const source = read('./utils/timelineAdapters.ts')
    expect(source).toContain('course._displayStart ?? course.period')
    expect(source).toContain('course._displaySpan ?? course.djs')
  })
})

describe('#1115 三语溢出标题', () => {
  for (const locale of ['zh-CN', 'en', 'ja']) {
    it(`${locale} 存在 schedule.grid.conflictOverflowTitle`, () => {
      const messages = read(`../../utils/i18n/messages/${locale}.ts`)
      expect(messages).toContain("'schedule.grid.conflictOverflowTitle'")
    })
  }
})
