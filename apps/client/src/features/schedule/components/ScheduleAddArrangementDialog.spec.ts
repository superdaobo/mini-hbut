/**
 * #836 统一「添加安排」弹窗契约测试。
 *
 * 仓库测试环境为 node（无 DOM、未引入 @vue/test-utils），组件无法挂载，因此沿用
 * ScheduleAddCourseDialog.spec.ts 的「源码契约 + 响应式复刻」路线：
 * - 源码契约：创建态 segmented control、编辑态类型锁定、双 draft 独立解引用、
 *   日程 Tab 提交链路、动作按钮在滚动区之外、#760 解引用规则；
 * - 响应式复刻：用 Vue 响应式系统复刻「切 Tab 不改动两份草稿」的真实数据流。
 */
import { computed, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { useScheduleEvents } from '../composables/useScheduleEvents'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const dialogSource = () => read('./ScheduleAddArrangementDialog.vue')
const eventFormSource = () => read('./ScheduleEventForm.vue')
const drawerSource = () => read('./ScheduleDrawer.vue')
const eventsComposableSource = () => read('../composables/useScheduleEvents.ts')

const TEST_DATE = '2026-09-18'

describe('ScheduleAddArrangementDialog 创建态 / 编辑态契约', () => {
  it('仅创建态渲染 segmented control，且必须是真实可点击按钮（不能只依赖手势）', () => {
    const source = dialogSource()
    expect(source).toContain('v-if="isCreateMode"')
    expect(source).toContain('role="tablist"')
    expect(source).toContain(':aria-label="t(\'schedule.arrangement.tabAria\')"')
    // 两个 Tab 都是真实 button，且带 type="button" 与点击处理
    expect(source).toContain('class="arrangement-tab"')
    expect(source).toContain('type="button"')
    expect(source).toContain('@click="activeTab = \'course\'"')
    expect(source).toContain('@click="activeTab = \'event\'"')
    expect(source).toContain("t('schedule.arrangement.tabCourse')")
    expect(source).toContain("t('schedule.arrangement.tabEvent')")
  })

  it('编辑态类型锁定：Tab 由 mode 推导，不提供课程↔日程互转入口', () => {
    const source = dialogSource()
    expect(source).toContain("props.mode === 'editEvent'")
    expect(source).toContain("props.mode === 'editCourse'")
    expect(source).toContain('const isCreateMode = computed(() => props.mode === \'add\')')
    // 三种标题：创建 / 编辑课程 / 编辑日程
    expect(source).toContain("t('schedule.arrangement.titleAdd')")
    expect(source).toContain("t('schedule.arrangement.titleEditCourse')")
    expect(source).toContain("t('schedule.arrangement.titleEditEvent')")
  })

  it('编辑日程态提供删除入口，删除按钮仅在 editEvent 模式出现', () => {
    const source = dialogSource()
    expect(source).toContain('v-if="isEditEventMode"')
    expect(source).toContain("emit('delete-event')")
    expect(source).toContain("t('schedule.event.deleteEvent')")
  })

  it('课程 Tab 复用 ScheduleCourseForm 与 CourseColorPicker（字段/行为不另起一套）', () => {
    const source = dialogSource()
    expect(source).toContain("import ScheduleCourseForm from './ScheduleCourseForm.vue'")
    expect(source).toContain('<ScheduleCourseForm')
    expect(source).toContain("import CourseColorPicker from '../../../components/CourseColorPicker.vue'")
    expect(source).toContain('<CourseColorPicker v-model="courseForm.color" />')
  })

  it('日程 Tab 渲染 ScheduleEventForm', () => {
    const source = dialogSource()
    expect(source).toContain("import ScheduleEventForm from './ScheduleEventForm.vue'")
    expect(source).toContain('<ScheduleEventForm :draft="eventDraft" :conflicts="eventConflicts" />')
  })
})

describe('ScheduleAddArrangementDialog 双 Draft 独立契约（#760 解引用规则）', () => {
  it('courseDraft / eventDraft 都通过 computed 解引用最新对象，不固化 setup 引用', () => {
    const source = dialogSource()
    expect(source).toContain('const courseForm = computed(() => props.courseDraft)')
    expect(source).not.toMatch(/const\s+courseForm\s*=\s*props\.courseDraft/)
    expect(source).toContain("courseDraft: { type: Object, default: () => ({}) }")
    expect(source).toContain("eventDraft: { type: Object, default: () => ({}) }")
  })

  it('弹窗只读草稿，不得回写 props（否则会破坏两份草稿的独立归属）', () => {
    const source = dialogSource()
    expect(source).not.toMatch(/props\.courseDraft\s*=/)
    expect(source).not.toMatch(/props\.eventDraft\s*=/)
  })

  it('复刻数据流：切 Tab 不会改动课程草稿与日程草稿内容', () => {
    const courseDraft = ref({ name: '高等数学', weekday: 2, color: '' })
    const eventDraft = ref({
      title: '小组会议',
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '15:00',
      location: '',
      note: '',
      color: '#72b9ff',
      reminderMinutes: null
    })
    // 复刻弹窗：只读解引用
    const courseForm = computed(() => courseDraft.value)
    const form = computed(() => eventDraft.value)

    const activeTab = ref('course')
    activeTab.value = 'event'
    expect(courseDraft.value.name).toBe('高等数学')
    expect(form.value.title).toBe('小组会议')

    activeTab.value = 'course'
    expect(eventDraft.value.startTime).toBe('14:00')
    expect(courseForm.value.weekday).toBe(2)
    expect(activeTab.value).toBe('course')
  })
})

describe('日程 Tab 提交链路契约（走 /v2/schedule/event/）', () => {
  it('弹窗按当前 Tab 分发 submit-course / submit-event', () => {
    const source = dialogSource()
    expect(source).toContain("if (activeTab.value === 'event') {")
    expect(source).toContain("emit('submit-event')")
    expect(source).toContain("emit('submit-course')")
  })

  it('submit-event 最终落到 /v2/schedule/event/ 的 add / update 分支', () => {
    const composable = eventsComposableSource()
    expect(composable).toContain('/v2/schedule/event/')
    expect(composable).toContain("${isEditing ? 'update' : 'add'}")
    // 适配层已由 #835 提供，前端不得再新增适配分支
    expect(composable).not.toContain('/v2/schedule/custom/')
  })

  it('提交按钮文案随 Tab 与模式切换（创建 / 编辑 / 提交中）', () => {
    const source = dialogSource()
    expect(source).toContain("t('schedule.event.submitAdd')")
    expect(source).toContain("t('schedule.event.submitEdit')")
    expect(source).toContain("t('schedule.event.submittingAdd')")
    expect(source).toContain("t('schedule.event.submittingEdit')")
    expect(source).toContain("t('schedule.addCourse.submitAdd')")
  })
})

describe('移动端与滚动区契约（软键盘不得遮挡确认按钮）', () => {
  it('弹窗为纵向 flex，内容区滚动、动作按钮位于滚动区之外', () => {
    const source = dialogSource()
    expect(source).toMatch(/\.arrangement-modal\s*\{[^}]*flex-direction:\s*column/)
    expect(source).toMatch(/\.arrangement-body\s*\{[^}]*overflow-y:\s*auto/)
    expect(source).toMatch(/\.arrangement-body\s*\{[^}]*flex:\s*1 1 auto/)
    expect(source).toMatch(/\.arrangement-body\s*\{[^}]*min-height:\s*0/)

    // 滚动区块内不得出现动作按钮
    const bodyBlock = source.match(
      /<div class="arrangement-body">[\s\S]*?<div class="arrangement-actions">/
    )
    expect(bodyBlock).not.toBeNull()
    expect(bodyBlock?.[0]).not.toContain("emit('submit-event')")
    expect(bodyBlock?.[0]).not.toContain("emit('delete-event')")
    expect(bodyBlock?.[0]).toContain('</template>')
  })

  it('日程表单使用原生 date / time / select 控件（移动端唤起系统选择器）', () => {
    const source = eventFormSource()
    expect(source).toContain('type="date"')
    expect(source).toContain('type="time"')
    expect(source).toContain('<select class="event-reminder-select"')
    expect(source).toContain('REMINDER_OPTIONS')
    // 提醒不使用 .number 修饰（会把「不提醒」的 null 错转成 0）
    expect(source).not.toContain('v-model.number="form.reminderMinutes"')
  })

  it('日程表单折叠低频字段，并展示冲突 warning', () => {
    const source = eventFormSource()
    expect(source).toContain("t('schedule.event.moreSettings')")
    expect(source).toContain('v-if="showMore"')
    expect(source).toContain("tf('schedule.event.conflictItem'")
    expect(source).toContain("tf('schedule.event.conflictSummary'")
  })
})

describe('ScheduleDrawer #836 入口升级契约', () => {
  it('第三区第一项文案为「添加安排」，emit 改为 open-add-arrangement', () => {
    const source = drawerSource()
    expect(source).toContain("t('schedule.drawer.addArrangement')")
    expect(source).toContain("emit('open-add-arrangement')")
    expect(source).toContain("'open-add-arrangement',")
    expect(source).not.toContain("emit('open-add-course')")
  })

  it('AI 课表导入入口保持完全独立', () => {
    const source = drawerSource()
    expect(source).toContain("emit('open-ai-import')")
    expect(source).toContain("t('schedule.import.entry')")
    expect(source).toContain('class="drawer-action ai-import-course"')
  })

  it('旧 i18n key schedule.drawer.addCourse 仍保留（防其他引用断裂）', () => {
    const zh = read('../../../utils/i18n/messages/zh-CN.ts')
    const en = read('../../../utils/i18n/messages/en.ts')
    expect(zh).toContain("'schedule.drawer.addCourse':")
    expect(en).toContain("'schedule.drawer.addCourse':")
  })
})

describe('ScheduleEventForm 草稿解引用与提醒档位复刻', () => {
  it('form 必须通过 computed 解引用最新草稿对象（与 #760 同规则）', () => {
    const source = eventFormSource()
    expect(source).toContain('const form = computed(() => props.draft)')
    expect(source).not.toMatch(/const\s+form\s*=\s*props\.draft/)
  })

  it('提醒下拉空串 ↔ null 双向映射（不提醒档不得被转成 0）', () => {
    // 复刻 ScheduleEventForm 的 reminderValue / onReminderChange 逻辑
    const draft = ref({ reminderMinutes: null as number | null })
    const reminderValue = () => {
      const value = draft.value?.reminderMinutes
      return value === null || value === undefined ? '' : String(value)
    }
    const onReminderChange = (raw: string) => {
      draft.value.reminderMinutes = raw === '' ? null : Number(raw)
    }

    expect(reminderValue()).toBe('')
    onReminderChange('30')
    expect(draft.value.reminderMinutes).toBe(30)
    expect(reminderValue()).toBe('30')
    onReminderChange('0')
    expect(draft.value.reminderMinutes).toBe(0)
    onReminderChange('')
    expect(draft.value.reminderMinutes).toBeNull()
    expect(reminderValue()).toBe('')
  })

  it('提交链路与 composable 的校验/提交方法名一致（父组件接线契约）', () => {
    const composable = useScheduleEvents({
      props: { studentId: '2510231106' },
      semester: { weekDates: computed(() => []) },
      data: { scheduleData: ref([]) }
    } as never)
    for (const key of [
      'eventDraft',
      'eventError',
      'savingEvent',
      'deletingEvent',
      'editingEventId',
      'resetEventDraft',
      'populateEventDraft',
      'validateEventDraft',
      'conflictsOf',
      'submitEvent',
      'deleteEvent'
    ]) {
      expect(Object.keys(composable)).toContain(key)
    }
  })
})
