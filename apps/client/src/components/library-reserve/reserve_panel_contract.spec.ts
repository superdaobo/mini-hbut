/**
 * 图书馆预约 · 静音仓 / 研讨室面板接线契约（P1 修复回归防护）。
 *
 * 仓库未引入 @vue/test-utils、vitest 主配置为 node 环境（无 DOM），组件无法挂载，
 * 因此沿用仓库既有的「源码契约」测试风格：读取 .vue 源码断言关键接线；
 * 纯逻辑（错误文案 / 已选时段解析 / 日期边界）的断言见同目录 catalog.spec.ts。
 *
 * 覆盖：
 * - P1-1 未登录引导按钮的 @require-login 必须由宿主 App.vue 绑定（否则是死按钮）；
 * - P1-2 表单错误文案按错误 key 取限值（不得回退 `field.min ?? field.max`）；
 * - P1-3 切换日期必须重置已选时段与表单，且已选时段只在当前可见时段中解析；
 * - P1-4 所选日期必须作为 start_time / end_time 下发给后端。
 */
import { describe, expect, it } from 'vitest'
import { readVueContractSource } from '../../utils/contract_source_test'

const app = readVueContractSource('src/App.vue')
const view = readVueContractSource('src/components/LibraryReserveView.vue')
const panel = readVueContractSource('src/components/library-reserve/ReserveRoomPanel.vue')
const formFields = readVueContractSource('src/components/library-reserve/ReserveFormFields.vue')

/** 截取某个顶层 `const name = ...` 到下一个顶格 `}` 的代码块（用于断言函数体接线） */
const blockOf = (source: string, signature: string): string =>
  source.match(new RegExp(`${signature}[\\s\\S]*?\\n\\}`))?.[0] ?? ''

describe('P1-1 library_reserve 登录引导接线（死按钮修复）', () => {
  it('LibraryReserveView 未登录引导按钮派发 require-login', () => {
    expect(view).toContain("const goLogin = () => emit('require-login')")
    expect(view).toContain('@click="goLogin"')
  })

  it('App.vue 的 library_reserve 分支必须绑定 @require-login（与其它需登录视图一致）', () => {
    const line = app
      .split('\n')
      .find((row) => row.includes("currentView === 'library_reserve'"))
    expect(line, '未找到 library_reserve 渲染分支').toBeTruthy()
    expect(line).toContain('@require-login="handleRequireLogin"')
  })
})

describe('P1-2 表单错误文案按错误 key 取限值', () => {
  it('ReserveFormFields 不得回退 field.min ?? field.max，须改用 formatFieldErrorText', () => {
    expect(formFields).not.toContain('field.min ?? field.max')
    expect(formFields).toContain('formatFieldErrorText')
  })
})

describe('P1-3 切换日期重置已选时段（确认弹窗与实际提交脱钩修复）', () => {
  it('日期按钮走 selectDate（而非直接赋值 selectedDate）', () => {
    expect(panel).toContain('@click="selectDate(option.value)"')
    expect(panel).not.toContain('@click="selectedDate = option.value"')
  })

  it('selectDate 重置已选时段与表单后再拉取新日期时段', () => {
    const block = blockOf(panel, 'const selectDate = async')
    expect(block).toContain('resetSlotSelection()')
    expect(block).toContain('await loadSlots()')
  })

  it('selectedSlot 从 visibleSlots 解析（不在当前可见列表即隐藏表单 / 提交条）', () => {
    expect(panel).toContain(
      'const selectedSlot = computed(() => pickSelectedSlot(visibleSlots.value, selectedSlotId.value))'
    )
  })
})

describe('P1-4 所选日期下发给后端（日期选择器生效）', () => {
  it('loadSlots 通过 buildSlotTimeRange 下发 start_time / end_time（snake_case）', () => {
    const block = blockOf(panel, 'const loadSlots = async')
    expect(block).toContain('buildSlotTimeRange(selectedDate.value)')
    expect(block).toContain('req.start_time')
    expect(block).toContain('req.end_time')
  })
})
