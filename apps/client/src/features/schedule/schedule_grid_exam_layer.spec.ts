import { describe, expect, it } from 'vitest'
import { readVueContractSource } from '../../utils/contract_source_test'

/**
 * 课表考试叠加层 —— 源码契约门闩。
 *
 * 纯函数（examTypes）/ 数据层（useScheduleExamData）由各自 spec 覆盖；
 * 本文件看守「考试如何接入课表」这类只能在源码层验证的硬约束：
 * 1. 考试复用统一时间轴适配器，不在 Grid 里自建时间换算；
 * 2. 新增 prop 带安全默认值，AI 导入预览等既有调用点零改动；
 * 3. 视图筛选发生在 lane 输入层，与 #856 口径一致；
 * 4. 考试卡在事件层内渲染、可点击，且空白点击不会误触创建；
 * 5. 详情只读（无编辑/删除），并给出跳转考试安排页的入口。
 */
const grid = readVueContractSource('src/features/schedule/components/ScheduleGrid.vue')
const card = readVueContractSource('src/features/schedule/components/ScheduleExamCard.vue')
const detail = readVueContractSource('src/features/schedule/components/ScheduleExamDetail.vue')
const scheduleView = readVueContractSource('src/components/ScheduleView.vue')
const app = readVueContractSource('src/App.vue')

describe('schedule grid exam overlay contract', () => {
  it('考试条目复用统一点位适配器，不在 Grid 里自建时间解析', () => {
    expect(grid).toContain('examToTimelineItem')
    expect(grid).toContain("from '../utils/timelineAdapters'")
    expect(grid).not.toContain('parseExamTimeRange')
  })

  it('getExamsForDay 带安全默认值（既有调用点零改动）', () => {
    expect(grid).toContain('getExamsForDay: { type: Function, default: () => () => [] }')
  })

  it('视图筛选发生在 lane 输入层：每天先筛考试再进时间轴', () => {
    expect(grid).toContain("const showExams = computed(() => props.viewMode !== 'events')")
    expect(grid).toContain('const exams = visibleExamsForDay(day)')
    expect(grid).toContain('examToTimelineItem(exam, weekIsoDates.value, day)')
  })

  it('考试卡在事件层内渲染并可点击，空白点击命中考试卡时不创建安排', () => {
    expect(grid).toContain('<ScheduleExamCard')
    expect(grid).toContain('@open-detail="openExamDetail($event)"')
    expect(grid).toContain("emit('open-exam-detail', raw)")
    expect(grid).toContain("'.course-card, .event-card, .exam-card")
  })

  it('日期头考试红点由当天考试数据驱动', () => {
    expect(grid).toContain('v-if="hasExamOnDay(day)"')
    expect(grid).toContain('const hasExamOnDay = (day) => visibleExamsForDay(day).length > 0')
  })

  it('「考」角标为半透明绝对定位，不占标题布局，卡片自身恢复点击', () => {
    expect(card).toContain('exam-card__badge')
    expect(card).toContain('position: absolute')
    expect(card).toContain('background: rgba(255, 255, 255, 0.72)')
    expect(card).toContain('pointer-events: auto')
  })

  it('卡片优先展示名称与地点，缺时间时标注「时间待定」而非编造时段', () => {
    expect(card).toContain('exam-card__name')
    expect(card).toContain('exam-card__place')
    expect(card).toContain("t('schedule.exam.timeTbd')")
  })

  it('详情只读：展示考场与座位号，不提供编辑/删除，只提供「查看全部考试」', () => {
    expect(detail).toContain('exam-detail-seat')
    expect(detail).toContain("t('schedule.exam.locationLabel')")
    expect(detail).toContain("t('schedule.exam.seatTitle')")
    expect(detail).not.toContain("emit('edit')")
    expect(detail).not.toContain("emit('delete')")
    expect(detail).toContain("emit('open-all-exams')")
  })

  it('课表把考试数据 / 详情接到网格，并允许跳转考试安排页', () => {
    expect(scheduleView).toContain(':get-exams-for-day="examData.getExamsForDay"')
    expect(scheduleView).toContain('@open-exam-detail="handleOpenExamDetail"')
    expect(scheduleView).toContain('<ScheduleExamDetail')
    expect(scheduleView).toContain("emit('open-exams')")
    expect(app).toContain('@open-exams="handleNavigate(\'exams\')"')
  })
})
