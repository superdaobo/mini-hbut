/**
 * #760 添加课程表单填写完整仍报「课程名称不能为空」——回归防护。
 *
 * 根因回顾：
 * - 弹窗被父组件 ScheduleView.vue 常驻挂载（无 v-if），setup 仅执行一次；
 * - 旧实现 `const form = props.addCourseForm` 在 setup 时固化了 prop 对象引用；
 * - 编辑器 useScheduleEditor.resetAddCourseForm / populateCourseForm 每次打开弹窗
 *   都整体替换 addCourseForm.value 为新对象（编辑回填依赖该整体替换语义）；
 * - 结果用户输入写进被替换掉的旧对象，validateAddCourse 读取的新对象恒为空。
 *
 * 修复：弹窗组件改用 `computed(() => props.addCourseForm)` 始终解引用最新表单对象。
 *
 * 测试策略：
 * 1. 源码契约门闩（参照 schedule_grid_lines.spec.ts 的 contract 风格）——防止回退为
 *    固化引用写法；
 * 2. 绑定语义联动测试——由于仓库未引入 @vue/test-utils（node 环境无 DOM，弹窗组件
 *    难以直接挂载），用 Vue 响应式系统复刻「父组件常驻挂载 + computed 解引用 prop +
 *    编辑器整体替换表单对象」的真实数据流，验证输入落入新对象且校验通过；同时用
 *    旧固化写法作反面用例复现 bug，证明修复有效。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { useScheduleEditor } from '../composables/useScheduleEditor'
import { LOGIN_SESSION_TOKEN_KEY } from '../constants'

const readDialogSource = () =>
  readFileSync(new URL('./ScheduleAddCourseDialog.vue', import.meta.url), 'utf8')

describe('ScheduleAddCourseDialog #760 源码契约', () => {
  it('禁止在 setup 时固化 props.addCourseForm 引用', () => {
    const source = readDialogSource()
    expect(source).not.toMatch(/const\s+form\s*=\s*props\.addCourseForm/)
  })

  it('form 必须通过 computed 始终解引用最新表单对象', () => {
    const source = readDialogSource()
    expect(source).toContain('const form = computed(() => props.addCourseForm)')
  })
})

describe('ScheduleAddCourseDialog #772 源码契约（颜色选择器与动作按钮样式）', () => {
  it('必须 import 并注册 CourseColorPicker（组件拆分时曾丢失声明）', () => {
    const source = readDialogSource()
    expect(source).toContain(
      "import CourseColorPicker from '../../../components/CourseColorPicker.vue'"
    )
  })

  it('模板必须保留 CourseColorPicker 且双向绑定 form.color', () => {
    const source = readDialogSource()
    expect(source).toContain('<CourseColorPicker v-model="form.color" />')
  })

  it('取消/确认按钮必须保留 drawer-action class（ghost 变体 + 主按钮）', () => {
    const source = readDialogSource()
    expect(source).toContain('class="drawer-action ghost"')
    expect(source).toMatch(/class="drawer-action"(?! ghost)/)
  })

  it('scoped 样式必须自带 drawer-action 规则（原定义在 ScheduleDrawer.vue，跨组件 scoped 不生效）', () => {
    const source = readDialogSource()
    // 基础规则
    expect(source).toMatch(/\.drawer-action\s*\{[^}]*linear-gradient\(135deg,\s*#3b82f6,\s*#06b6d4\)/)
    // ghost 变体（浅色模式深色底）
    expect(source).toMatch(/\.drawer-action\.ghost\s*\{[^}]*background:\s*#111827/)
    // 按压反馈与 disabled 态
    expect(source).toContain('.drawer-action:active')
    expect(source).toContain('.drawer-action:disabled')
  })
})

// ─── useScheduleEditor 测试基建 ────────────────────────────────────────────

const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear(),
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  length: 0
}

const makeEditorOptions = () => ({
  props: { studentId: '2510231106' },
  data: {
    errorMsg: ref(''),
    semesterError: ref(''),
    loadingManageCourses: ref(false),
    manageCoursesError: ref(''),
    manageExpandedSemesters: ref<Record<string, boolean>>({}),
    loadCustomCourses: vi.fn(async () => {}),
    loadAllCustomCourses: vi.fn(async () => {}),
    mergeScheduleSources: vi.fn()
  },
  semester: {
    semester: ref('2024-2025-1'),
    semesterDraft: ref(''),
    semesterWeekOptions: ref(Array.from({ length: 20 }, (_, i) => i + 1)),
    selectedWeek: ref(1)
  },
  detail: {
    showDetail: ref(false),
    selectedCourse: ref(null),
    detailActionError: ref(''),
    syncSelectedCustomCourse: vi.fn()
  },
  menu: { showMenu: ref(false) },
  confirmDialog: { askConfirm: vi.fn(async () => true) }
})

const makeEditor = () => {
  const options = makeEditorOptions()
  return { editor: useScheduleEditor(options as never), options }
}

describe('useScheduleEditor 表单替换与弹窗绑定联动（#760）', () => {
  beforeEach(() => {
    storageMap.clear()
    storageMap.set(LOGIN_SESSION_TOKEN_KEY, 'token-1')
    // node 测试环境无 localStorage，注入 stub（hasValidLoginSession 依赖）
    ;(globalThis as { localStorage?: Storage }).localStorage = stubStorage as unknown as Storage
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('打开弹窗整体替换表单对象后，computed 绑定写入的 name 能被校验读到并通过', () => {
    const { editor } = makeEditor()

    // 复刻弹窗组件的数据流：父组件常驻挂载，setup 只执行一次
    const dialogProps = reactive({ addCourseForm: editor.addCourseForm.value })
    const form = computed(() => dialogProps.addCourseForm)

    // 打开弹窗：编辑器 resetAddCourseForm 整体替换表单对象，模板把新对象传给弹窗
    editor.openAddCourseDialog()
    dialogProps.addCourseForm = editor.addCourseForm.value

    // 用户在弹窗中输入（v-model 写入 computed 解引用出的最新对象）
    form.value.name = '高等数学'
    form.value.weeks = [1, 2, 3]
    form.value.weekday = 2
    form.value.period = 3
    form.value.djs = 2

    // 校验读取的是同一（新）对象：不再误报「课程名称不能为空」
    expect(editor.validateAddCourse()).toBe('')
    expect(editor.addCourseForm.value.name).toBe('高等数学')
  })

  it('编辑回填整体替换（populateCourseForm）后，computed 绑定同样跟随新对象', () => {
    const { editor } = makeEditor()

    const dialogProps = reactive({ addCourseForm: editor.addCourseForm.value })
    const form = computed(() => dialogProps.addCourseForm)

    editor.openAddCourseDialog()
    dialogProps.addCourseForm = editor.addCourseForm.value

    editor.openEditCourseDialog(
      {
        id: 'course-1',
        semester: '2024-2025-1',
        name: '大学英语',
        weekday: 1,
        period: 2,
        djs: 1,
        weeks: [4, 5],
        is_custom: true
      },
      { reopenManage: false }
    )
    dialogProps.addCourseForm = editor.addCourseForm.value

    expect(editor.courseDialogMode.value).toBe('edit')
    form.value.name = '大学英语（下）'
    expect(editor.addCourseForm.value.name).toBe('大学英语（下）')
    expect(editor.validateAddCourse()).toBe('')
  })

  it('反面复现：固化 setup 时刻的旧引用会导致校验误报「课程名称不能为空」（bug 根因）', () => {
    const { editor } = makeEditor()

    // 旧实现语义：setup 时固化引用（组件只创建一次，此后不再跟随 props）
    const dialogProps = reactive({ addCourseForm: editor.addCourseForm.value })
    const staleForm = dialogProps.addCourseForm

    // 打开弹窗 → 表单对象被整体替换
    editor.openAddCourseDialog()

    // 用户输入写进旧对象（旧 bug 行为）
    staleForm.name = '高等数学'
    staleForm.weeks = [1, 2, 3]

    // 校验读新对象 → 必然误报
    expect(editor.addCourseForm.value.name).toBe('')
    expect(editor.validateAddCourse()).toBe('课程名称不能为空')
  })
})
