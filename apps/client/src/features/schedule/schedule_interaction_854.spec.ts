import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const viewSource = () => read('../../components/ScheduleView.vue')
const menuSource = () => read('./composables/useScheduleMenu.ts')
const editorSource = () => read('./composables/useScheduleEditor.ts')
const drawerSource = () => read('./components/ScheduleDrawer.vue')
const importDialogSource = () => read('./components/ScheduleCourseImportDialog.vue')
const darkModeSource = () => read('../../styles/dark-mode.css')

describe('#854 schedule interaction integration contract', () => {
  it('#856 view mode 通过 UI settings 持久化，并接线到 Drawer / Grid', () => {
    const menu = menuSource()
    const view = viewSource()

    expect(menu).toContain('scheduleViewMode')
    expect(menu).toContain('uiSettings.scheduleViewMode = nextMode')
    expect(menu).toContain('flushUiSettings()')
    expect(view).toContain(':schedule-view-mode="scheduleViewMode"')
    expect(view).toContain(':view-mode-options="viewModeOptions"')
    expect(view).toContain('@set-view-mode="setScheduleViewMode"')
    expect(view).toContain(':view-mode="scheduleViewMode"')
  })

  it('#856 dark mode 对 view switch 有高优先级规则', () => {
    const drawer = drawerSource()
    const dark = darkModeSource()
    expect(drawer).toContain(':global(html.dark) .drawer-view-switch')
    expect(dark).toContain('html.dark .schedule-view .drawer-view-chip')
    expect(dark).toContain('html.dark .schedule-view .drawer-view-chip.active')
    expect(dark).toContain(':is(.drawer-view-switch, .drawer-style-switch)')
  })

  it('#857 网格确认会同时预填 Course / Event 两份草稿', () => {
    const view = viewSource()
    const editor = editorSource()

    expect(view).toContain("payload?.source === 'grid'")
    expect(view).toContain('editor.openAddCourseDialog(coursePrefill)')
    expect(view).toContain('events.resetEventDraft({')
    expect(view).toContain('weekday: selection.dayIndex')
    expect(view).toContain('period: selection.startPeriod')
    expect(view).toContain('djs: selection.span')
    expect(editor).toContain(
      'const openAddCourseDialog = (prefill: { weekday?: number; period?: number; djs?: number } = {})'
    )
    expect(editor).toContain('resetAddCourseForm(prefill)')
  })

  it('#857 all/courses 默认 Course；events 模式默认 Event', () => {
    const view = viewSource()
    expect(view).toContain(
      "const defaultType = scheduleViewMode.value === 'events' ? 'event' : 'course'"
    )
    expect(view).toContain("arrangementInitialTab.value = payload?.type === 'event' ? 'event' : 'course'")
  })

  it('#857 切周/学期/打开覆盖层会清理未确认选择', () => {
    const view = viewSource()
    expect(view).toContain('if (open) gridSelectionResetNonce.value += 1')
    expect(view).toContain('gridSelectionResetNonce.value += 1')
    expect(view).toContain(':selection-reset-nonce="gridSelectionResetNonce"')
  })

  it('AI 导入预览明确关闭空白选择，避免预览网格出现临时虚线框', () => {
    expect(importDialogSource()).toContain(':enable-blank-create="false"')
  })

  it('Event 从网格创建后提交/关闭会同步释放 Course 编辑器控制位', () => {
    const view = viewSource()
    expect(view).toContain('const closeArrangement = () => {')
    expect(view).toContain('if (editor.showAddCourse.value) editor.closeAddCourseDialog()')
    expect(view).toMatch(/const handleSubmitEvent[\s\S]*?if \(ok\) \{[\s\S]*?closeArrangement\(\)/)
  })
})
