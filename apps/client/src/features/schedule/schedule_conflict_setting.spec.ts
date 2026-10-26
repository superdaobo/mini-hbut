/**
 * #1116 冲突显示设置（抽屉 / 持久化 / 接线）契约。
 *
 * 归一化行为由 ui_settings.spec.ts 覆盖；本文件锁住 UI 与数据层接线，
 * 防止「设置选项存在但没传给网格」或与课程卡片样式互相覆盖。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getConflictDisplayOptions } from './constants'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('#1116 设置类型与默认值', () => {
  const config = read('../../config/ui_settings.ts')
  const utils = read('../../utils/ui_settings.ts')

  it('config 定义独立类型与默认 merged', () => {
    expect(config).toContain("export type ScheduleConflictDisplayMode = 'merged' | 'side-by-side'")
    expect(config).toContain(
      "scheduleConflictDisplayMode: 'merged' as ScheduleConflictDisplayMode"
    )
  })

  it('归一化只接受两个稳定值，非法/缺失回退 merged', () => {
    expect(utils).toContain("const SCHEDULE_CONFLICT_DISPLAY_MODES = ['merged', 'side-by-side']")
    expect(utils).toContain(
      'merged.scheduleConflictDisplayMode = SCHEDULE_CONFLICT_DISPLAY_MODES.includes('
    )
  })
})

describe('#1116 选项与菜单 setter', () => {
  it('getConflictDisplayOptions 返回 merged / side-by-side 且有文案', () => {
    const options = getConflictDisplayOptions()
    expect(options.map((item) => item.key)).toEqual(['merged', 'side-by-side'])
    for (const item of options) {
      expect(item.label.trim().length).toBeGreaterThan(0)
      expect(item.desc.trim().length).toBeGreaterThan(0)
    }
  })

  const menu = read('./composables/useScheduleMenu.ts')
  it('菜单暴露 ref / options / setter，切换后 flushUiSettings', () => {
    expect(menu).toContain('scheduleConflictDisplayMode')
    expect(menu).toContain('conflictDisplayOptions')
    expect(menu).toContain('setScheduleConflictDisplayMode')
    expect(menu).toContain('uiSettings.scheduleConflictDisplayMode = nextMode')
    expect(menu).toContain('flushUiSettings()')
  })
})

describe('#1116 抽屉与 ScheduleView 接线', () => {
  const drawer = read('./components/ScheduleDrawer.vue')
  it('抽屉有独立分组、aria-pressed、说明与事件', () => {
    expect(drawer).toContain('scheduleConflictDisplayMode')
    expect(drawer).toContain('conflictDisplayOptions')
    expect(drawer).toContain("'set-conflict-display'")
    expect(drawer).toContain("t('schedule.conflictDisplay.title')")
    expect(drawer).toContain(':aria-pressed="scheduleConflictDisplayMode === item.key"')
    expect(drawer).toContain('drawer-conflict-chip')
  })

  const view = read('../../components/ScheduleView.vue')
  it('ScheduleView 把偏好 getter 传给网格，并接通抽屉 props/events', () => {
    expect(view).toContain('conflictDisplay: () => menu.scheduleConflictDisplayMode.value')
    expect(view).toContain(':schedule-conflict-display-mode="scheduleConflictDisplayMode"')
    expect(view).toContain(':conflict-display-options="conflictDisplayOptions"')
    expect(view).toContain('@set-conflict-display="setScheduleConflictDisplayMode"')
  })
})

describe('#1116 三语设置文案', () => {
  for (const locale of ['zh-CN', 'en', 'ja']) {
    it(`${locale} 七个 key 齐备`, () => {
      const messages = read(`../../utils/i18n/messages/${locale}.ts`)
      for (const key of [
        'schedule.conflictDisplay.title',
        'schedule.conflictDisplay.aria',
        'schedule.conflictDisplay.merged',
        'schedule.conflictDisplay.mergedDesc',
        'schedule.conflictDisplay.sideBySide',
        'schedule.conflictDisplay.sideBySideDesc',
        'schedule.conflictDisplay.toast'
      ]) {
        expect(messages, `${locale} 缺少 ${key}`).toContain(`'${key}'`)
      }
    })
  }
})
