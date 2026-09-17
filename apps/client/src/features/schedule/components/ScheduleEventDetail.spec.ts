/**
 * #838 日程详情组件源码契约测试（ScheduleEventDetail.vue）。
 *
 * 仓库测试环境为 node（无 DOM、未引入 @vue/test-utils），组件无法挂载，因此沿用
 * ScheduleCourseDetail / ScheduleAddArrangementDialog 的「源码契约」路线：
 * 用源码断言锁定「不复用课程详情语义、错误可见、冲突条件渲染、按钮禁用、
 * 移动端滚动区、文案全部走 t()」等不可回退的约束。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./ScheduleEventDetail.vue', import.meta.url), 'utf8')

/** CJK 表意文字区段（与 i18n_coverage.spec.ts 同一口径） */
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/

/** 剥离注释后逐行返回（.vue 需同时剥离 <!-- --> 与 JS 注释） */
const stripComments = (text: string): string[] => {
  let body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  return body.split('\n').map((line) => {
    const idx = line.indexOf('//')
    return idx >= 0 ? line.slice(0, idx) : line
  })
}

/** 仅保留代码（注释豁免）：注释里提到课程详情 / conflictsOf 属说明性引用，不算违规 */
const codeOnly = () => stripComments(source()).join('\n')

describe('ScheduleEventDetail 业务语义独立（不得伪装成课程详情）', () => {
  it('不复用课程详情组件', () => {
    expect(codeOnly()).not.toContain('ScheduleCourseDetail')
  })

  it('不复用课程详情的 DOM 类名 / 状态', () => {
    const text = codeOnly()
    for (const forbidden of [
      'class="modal-body"',
      'info-row',
      'conflict-hint',
      'conflict-item',
      'custom-course-actions',
      'custom-delete-btn',
      'detail-copy-actions',
      'detail-copy-btn',
      'detail-action-error',
      'selectedCourse',
      'detailActionError'
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('业务类型显式标注为「日程」（复用 schedule.arrangement.tabEvent）', () => {
    const text = source()
    expect(text).toContain("t('schedule.arrangement.tabEvent')")
    expect(text).toContain('event-detail-type')
  })

  it('props / emits 契约与主 Agent 接线一致', () => {
    const text = source()
    for (const prop of ['show', 'event', 'conflicts', 'deleting', 'error']) {
      expect(text).toContain(`${prop}:`)
    }
    expect(text).toContain('defineEmits([\'close\', \'edit\', \'delete\'])')
    expect(text).toContain("emit('close')")
    expect(text).toContain("emit('edit')")
    expect(text).toContain("emit('delete')")
  })

  it('复用共享 modal.css 与 fade 过渡', () => {
    const text = source()
    expect(text).toContain('<style src="../styles/modal.css" scoped></style>')
    expect(text).toContain('<Transition name="fade">')
    expect(text).toContain('class="modal-overlay" @click="emit(\'close\')"')
    expect(text).toContain('class="modal-content glass event-detail-modal"')
  })
})

describe('ScheduleEventDetail 展示契约', () => {
  it('日期用 t() 拼装（不硬编码中文），时间展示为区间', () => {
    const text = source()
    expect(text).toContain("tf('schedule.event.detailDate'")
    expect(text).toContain('schedule.weekday.')
    expect(text).toContain('v-if="dateText"')
    expect(text).toContain('v-if="timeText"')
  })

  it('地点 / 备注为空时不渲染对应行', () => {
    const text = source()
    expect(text).toMatch(/v-if="locationText"/)
    expect(text).toMatch(/v-if="noteText"/)
    expect(text).toContain("tf('schedule.event.detailNote'")
  })

  it('提醒为 null 时不渲染提醒行，且复用 REMINDER_OPTIONS 的 labelKey', () => {
    const text = source()
    expect(text).toContain('REMINDER_OPTIONS')
    expect(text).toContain('t(option.labelKey)')
    expect(text).toMatch(/v-if="reminderText"/)
    // null / undefined 必须显式短路，避免落到「不提醒」档
    expect(text).toMatch(/value === null \|\| value === undefined/)
  })

  it('标题为空回落未命名安排文案', () => {
    expect(source()).toContain("t('schedule.event.untitled')")
  })
})

describe('ScheduleEventDetail 冲突区契约', () => {
  it('conflicts 有值才渲染冲突区，并复用 conflictTitle / conflictItem / conflictSummary', () => {
    const text = source()
    expect(text).toContain('v-if="conflictCount > 0"')
    expect(text).toContain("t('schedule.event.conflictTitle')")
    expect(text).toContain("tf('schedule.event.conflictItem'")
    expect(text).toContain("tf('schedule.event.conflictSummary'")
  })

  it('冲突判定不在本组件内进行（只消费父组件传入的 conflicts）', () => {
    const text = codeOnly()
    expect(text).not.toContain('intervalsOverlap')
    expect(text).not.toContain('conflictsOf')
    expect(text).not.toContain('timeGeometry')
    expect(text).not.toMatch(/startMinute\s*<\s*endMinute/)
  })

  it('多项冲突可展开 / 收起', () => {
    const text = source()
    expect(text).toContain('v-if="canExpandConflicts"')
    expect(text).toContain(':aria-expanded="showAllConflicts"')
    expect(text).toContain("t('schedule.event.conflictExpand')")
    expect(text).toContain("t('schedule.event.conflictCollapse')")
  })
})

describe('ScheduleEventDetail 操作与错误契约', () => {
  it('deleting 为真时编辑与删除按钮均禁用，并显示进行中文案', () => {
    const text = source()
    expect(text.match(/:disabled="deleting"/g)?.length).toBe(2)
    expect(text).toContain("t('schedule.event.deleting')")
    expect(text).toContain("t('schedule.event.deleteEvent')")
    expect(text).toContain("t('schedule.arrangement.titleEditEvent')")
  })

  it('error 非空时详情内可见（删除失败不得制造 UI 假成功）', () => {
    const text = source()
    expect(text).toContain('v-if="error"')
    expect(text).toContain('{{ error }}')
  })

  it('错误块位于滚动区之外（失败原因无需滚动即可看到）', () => {
    const text = source()
    const bodyStart = text.indexOf('<div class="event-detail-body">')
    const errorStart = text.indexOf('<div v-if="error"')
    const actionsStart = text.indexOf('<div class="event-detail-actions">')

    expect(bodyStart).toBeGreaterThan(-1)
    expect(errorStart).toBeGreaterThan(bodyStart)
    expect(actionsStart).toBeGreaterThan(errorStart)

    // 错误块是滚动区的兄弟节点：到错误块为止，body 内开启的 <div> 必须已全部闭合
    const bodyBlock = text.slice(bodyStart, errorStart)
    const opens = (bodyBlock.match(/<div/g) || []).length
    const closes = (bodyBlock.match(/<\/div>/g) || []).length
    expect(opens).toBe(closes)
  })
})

describe('ScheduleEventDetail 移动端与滚动区契约', () => {
  it('弹窗为纵向 flex，内容区滚动、操作按钮位于滚动区之外', () => {
    const text = source()
    expect(text).toMatch(/\.event-detail-modal\s*\{[^}]*flex-direction:\s*column/)
    expect(text).toMatch(/\.event-detail-body\s*\{[^}]*overflow-y:\s*auto/)
    expect(text).toMatch(/\.event-detail-body\s*\{[^}]*flex:\s*1 1 auto/)
    expect(text).toMatch(/\.event-detail-body\s*\{[^}]*min-height:\s*0/)

    const bodyBlock = text.match(
      /<div class="event-detail-body">[\s\S]*?<div class="event-detail-actions">/
    )
    expect(bodyBlock).not.toBeNull()
    expect(bodyBlock?.[0]).not.toContain("emit('delete')")
    expect(bodyBlock?.[0]).not.toContain("emit('edit')")
  })

  it('小屏下操作按钮单列铺满，避免挤压', () => {
    expect(source()).toMatch(/@media \(max-width: 768px\)[\s\S]*\.event-detail-actions\s*\{[^}]*grid-template-columns:\s*1fr/)
  })
})

describe('ScheduleEventDetail i18n 契约', () => {
  it('源码（注释豁免后）不得含 CJK 硬编码', () => {
    const violations = stripComments(source())
      .map((line, index) => ({ line: line.trim(), index: index + 1 }))
      .filter((item) => CJK_PATTERN.test(item.line))
    expect(violations).toEqual([])
  })

  it('文案全部经 t() / tf() 取词', () => {
    const text = source()
    expect(text).toContain("import { useI18n } from '../../../utils/app_i18n'")
    expect(text).toContain('const { t } = useI18n()')
    expect(text).toContain("import { tf } from '../utils/i18n_text'")
  })
})
