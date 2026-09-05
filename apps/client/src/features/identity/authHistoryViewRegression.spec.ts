// src/features/identity/authHistoryViewRegression.spec.ts
//
// #775：授权记录视图（IdentityAuthHistoryView.vue）回归测试。
//
// 仓库未引入 @vue/test-utils、vitest 主配置为 node 环境（无 DOM），本文件沿用
// ScheduleAddCourseDialog.spec.ts（#760）确立的「无 DOM 组件测试」先例：
//   A. 源码契约断言（readFileSync）：锁定视图的状态机分支、空态/引导/错误/重试、
//      loading 期间的刷新防并发入口（:disabled="loading"）；
//   B. 行为级测试：用 vue/compiler-sfc 把 <script setup> 编译为 setup 函数，
//      注入真实 Vue（reactive/computed/ref）与 mock 依赖后复刻
//      「挂载 → 自动 load → 状态切换」数据流，覆盖初始 loading、成功渲染、
//      空态、no_device 引导、error + 重试、刷新提示。
//
// mock 方式：vi.mock('./identityService') + vi.mock('../../utils/toast')。
// 测试数据一律使用假 request_id / 假应用名，绝不包含真实凭据。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from 'vue/compiler-sfc'
import { nextTick, reactive } from 'vue'
import { IdentityServiceError, type IdentityAuthHistoryItem } from './types'

vi.mock('./identityService', () => ({
  fetchAuthHistory: vi.fn(),
  IDENTITY_DEVICE_ID_KEY: 'hbu_identity_device_id'
}))

vi.mock('../../utils/toast', () => ({
  showToast: vi.fn()
}))

import { fetchAuthHistory } from './identityService'
import { showToast } from '../../utils/toast'

// ─── SFC 编译基建：把 <script setup> 编译为可执行的 setup 函数体 ─────────────

const SFC_PATH = new URL('./views/IdentityAuthHistoryView.vue', import.meta.url)
const viewSource = () => readFileSync(SFC_PATH, 'utf8')

interface ViewCtx {
  items: IdentityAuthHistoryItem[]
  loadState: string
  errorMessage: string
  loading: boolean
  totalCount: number
  appCount: number
  lastTime: string
  load: () => Promise<void>
  handleRefresh: () => Promise<void>
}

/**
 * 编译视图 SFC 并执行 setup，返回 setup 暴露的响应式上下文。
 *
 * 实现要点（剥壳方案已在纯 node 下逐段验证）：
 * 1) 去类型语法：compileScript 保留 TS 类型（type 别名 / 泛型 ref / 标注参数），
 *    new Function 只能执行纯 JS，逐一替换为本视图实际出现的形态；
 * 2) 清除 import 行后统一注入依赖（固定注入头，不用捕获组回引）；
 * 3) 用 indexOf 切片剥掉 defineComponent 包裹壳：头部截到 `__expose();` 之后，
 *    尾部截到 `return __returned__` 之后的 setup 闭合 `}` 之前；
 * 4) `const emit = __emit` 指向注入的空函数（视图仅声明 emits，测试不触发回传）。
 */
const setupView = (): ViewCtx => {
  const source = viewSource()
  const { descriptor, errors } = parse(source, { filename: 'IdentityAuthHistoryView.vue' })
  if (errors.length > 0 || !descriptor.scriptSetup) {
    throw new Error(`视图 SFC 解析失败：${errors.map(String).join('; ')}`)
  }
  const compiled = compileScript(descriptor, { id: 'auth-history-view-test' })
  const onMountedHooks: Array<() => void> = []
  let body = compiled.content
    // 1) 去类型语法（type 别名行无分号，按行删除；ref 泛型 / 参数标注逐一替换）
    .replace(/^type\s+LoadState[^\n]*/gm, '')
    .replace(/ref<IdentityAuthHistoryItem\[\]>\(\[\]\)/, 'ref([])')
    .replace(/ref<LoadState>\('loading'\)/, "ref('loading')")
    .replace(/\(iso: string\): string =>/g, '(iso) =>')
    .replace(/\(n: number\) =>/g, '(n) =>')
    // #776：errorHintFor 的签名标注（视图新增的错误指引映射函数）
    .replace(/\(code: string\): string =>/g, '(code) =>')
    // 2) 清除所有 import 行（后续统一注入）
    .replace(/^import[^\n]*/gm, '')
  // 3) 剥壳头：`export default ...defineComponent({...setup(__props, {...) { __expose();`
  const headStart = body.indexOf('export default')
  const exposeEnd = body.indexOf('__expose();')
  if (headStart < 0 || exposeEnd < 0) {
    throw new Error('视图编译产物结构变化：未找到 defineComponent setup 壳头')
  }
  body = body.slice(0, headStart) + body.slice(exposeEnd + '__expose();'.length)
  // 4) 剥壳尾：截到 `return __returned__` 之后的 setup 闭合 `}` 之前
  const retIdx = body.indexOf('return __returned__')
  const setupClose = retIdx >= 0 ? body.indexOf('}', retIdx) : -1
  if (retIdx < 0 || setupClose < 0) {
    throw new Error('视图编译产物结构变化：未找到 __returned__ 返回段')
  }
  body = body.slice(0, setupClose)
  body = body.replace(/const emit = __emit/, 'const emit = __emit__')
  const factory = new Function(
    '__vue__',
    '__onMountedHooks__',
    '__identityService__',
    '__types__',
    '__toast__',
    '__emit__',
    'const { computed, ref } = __vue__;\n' +
      'const onMounted = (hook) => { __onMountedHooks__.push(hook) };\n' +
      'const TPageHeader = null; const TEmptyState = null;\n' +
      'const { fetchAuthHistory } = __identityService__;\n' +
      'const { IdentityServiceError } = __types__;\n' +
      'const { showToast } = __toast__;\n' +
      `${body}\nreturn __returned__;`
  )
  const result = factory(
    // 真实 Vue 响应式 API（ref/computed 语义与运行时一致）
    { computed: computedVue, ref: refVue },
    onMountedHooks,
    { fetchAuthHistory },
    { IdentityServiceError },
    { showToast },
    () => {}
  )
  // reactive 包裹让测试读取 .value 解包后的最新状态（模拟模板读取行为）
  const ctx = reactive(result as unknown as ViewCtx) as ViewCtx
  // 复刻挂载：显式执行 onMounted 注册的 load
  for (const hook of onMountedHooks) {
    hook()
  }
  return ctx
}

// 真实 vue 的 ref/computed（从模块图引入，避免 new Function 闭包内 import）
import { computed as computedVue, ref as refVue } from 'vue'

/** 冲刷微任务队列（load 的 await 链）并推进渲染 */
const flushAsync = async (times = 6): Promise<void> => {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
  await nextTick()
}

// ─── 测试数据（假 request_id / 假应用名） ────────────────────────────────────

const makeItem = (requestId: string, appName: string): IdentityAuthHistoryItem => ({
  request_id: requestId,
  approved_at: new Date(Date.now() - 120_000).toISOString(),
  status: 'approved',
  client: {
    name: appName,
    homepage_host: `${appName}.example.test`,
    developer_display_name: '测试开发者',
    review_status: 'verified'
  },
  scopes: [
    { id: 'profile', label: '基本资料', risk: 'basic' },
    { id: 'student.identity', label: '学籍信息', risk: 'sensitive' }
  ]
})

beforeEach(() => {
  vi.mocked(fetchAuthHistory).mockReset()
  vi.mocked(showToast).mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ─── A. 源码契约（无 DOM 门闩） ───────────────────────────────────────────────

describe('#775 授权记录视图源码契约', () => {
  it('四态状态机 + 设备未绑定引导 + 错误重试按钮 + 空态文案必须存在', () => {
    const source = viewSource()
    expect(source).toContain("type LoadState = 'loading' | 'ready' | 'error' | 'no_device'")
    expect(source).toContain("loadState === 'no_device'")
    expect(source).toContain('本机尚未注册为身份签名设备')
    expect(source).toContain("loadState === 'error'")
    expect(source).toContain('history-retry-btn')
    expect(source).toContain('>重试</button>')
    expect(source).toContain('还没有授权记录')
  })

  it('device_not_bound 精确映射 no_device，其余错误映射 error（分支契约）', () => {
    const source = viewSource()
    expect(source).toContain("err.code === 'device_not_bound'")
    expect(source).toContain("loadState.value = 'no_device'")
    expect(source).toContain("loadState.value = 'error'")
  })

  it('刷新入口在 loading 期间禁用（防并发重复请求的 UI 门闩）', () => {
    const source = viewSource()
    expect(source).toMatch(/:disabled="loading"/)
    expect(source).toContain('@click="handleRefresh"')
  })
})

// ─── B. 行为级测试（真实响应式数据流） ────────────────────────────────────────

describe('#775 授权记录视图数据流', () => {
  it('初始为 loading 态（fetch 挂起期间）', async () => {
    let resolveFetch: (v: IdentityAuthHistoryItem[]) => void = () => {}
    vi.mocked(fetchAuthHistory).mockReturnValue(
      new Promise<IdentityAuthHistoryItem[]>((resolve) => {
        resolveFetch = resolve
      })
    )
    const ctx = setupView()
    expect(ctx.loadState).toBe('loading')
    expect(ctx.loading).toBe(true)
    resolveFetch([])
    await flushAsync()
  })

  it('成功返回 2 条 → ready，应用名 / scope 标签 / 时间与统计渲染', async () => {
    const items = [makeItem('ar_test_0001', '课程助手'), makeItem('ar_test_0002', '打印助手')]
    vi.mocked(fetchAuthHistory).mockResolvedValue(items)
    const ctx = setupView()
    await flushAsync()
    expect(ctx.loadState).toBe('ready')
    expect(ctx.items).toHaveLength(2)
    expect(ctx.items[0]?.client.name).toBe('课程助手')
    expect(ctx.items[1]?.scopes.some((s) => s.risk === 'sensitive')).toBe(true)
    // 统计派生值（模板渲染数据源）：总次数 / 去重应用数
    expect(ctx.totalCount).toBe(2)
    expect(ctx.appCount).toBe(2)
    // 相对时间已格式化（2 分钟前 → "2 分钟前"）
    expect(ctx.lastTime).toBe('2 分钟前')
    // 渲染契约：应用名来自 sanitized 数据；scope 标签与 sensitive 高亮分支存在
    const source = viewSource()
    expect(source).toContain('{{ item.client.name')
    expect(source).toContain('v-for="scope in item.scopes"')
    expect(source).toContain("scope.risk === 'sensitive'")
    expect(source).toContain('formatRelativeTime(item.approved_at)')
    expect(source).toContain('授权次数')
  })

  it('空数组 → ready 空态（items 为空，模板走 TEmptyState 分支）', async () => {
    vi.mocked(fetchAuthHistory).mockResolvedValue([])
    const ctx = setupView()
    await flushAsync()
    expect(ctx.loadState).toBe('ready')
    expect(ctx.items).toEqual([])
    const source = viewSource()
    expect(source).toContain("loadState === 'ready' && items.length === 0")
  })

  it('device_not_bound → no_device 引导 + 错误文案进引导块', async () => {
    vi.mocked(fetchAuthHistory).mockRejectedValue(
      new IdentityServiceError(
        'device_not_bound',
        '本机尚未注册为身份签名设备，请先在设置中完成设备注册'
      )
    )
    const ctx = setupView()
    await flushAsync()
    expect(ctx.loadState).toBe('no_device')
    expect(ctx.errorMessage).toContain('设备注册')
  })

  it('network_unavailable → error 态；点重试重新调用 load，成功后恢复 ready', async () => {
    vi.mocked(fetchAuthHistory).mockRejectedValueOnce(
      new IdentityServiceError('network_unavailable', '无法加载授权记录，请稍后重试')
    )
    const ctx = setupView()
    await flushAsync()
    expect(ctx.loadState).toBe('error')
    expect(ctx.errorMessage).toBe('无法加载授权记录，请稍后重试')
    // 点「重试」：重试按钮绑定 load；第 2 次调用成功
    vi.mocked(fetchAuthHistory).mockResolvedValueOnce([makeItem('ar_test_0003', '重试后应用')])
    await ctx.load()
    await flushAsync()
    expect(vi.mocked(fetchAuthHistory)).toHaveBeenCalledTimes(2)
    expect(ctx.loadState).toBe('ready')
  })

  it('非 IdentityServiceError 的裸错误 → error 态兜底文案（不泄露内部细节）', async () => {
    vi.mocked(fetchAuthHistory).mockRejectedValue(new Error('TypeError: cannot read internal'))
    const ctx = setupView()
    await flushAsync()
    expect(ctx.loadState).toBe('error')
    expect(ctx.errorMessage).toBe('加载失败，请稍后重试')
  })

  it('handleRefresh 顺序 await load，不产生交叉并发请求', async () => {
    vi.mocked(fetchAuthHistory).mockResolvedValue([makeItem('ar_test_0004', '刷新应用')])
    const ctx = setupView()
    await flushAsync()
    // 刷新成功后提示「授权记录已刷新」
    await ctx.handleRefresh()
    await flushAsync()
    expect(vi.mocked(fetchAuthHistory)).toHaveBeenCalledTimes(2)
    expect(showToast).toHaveBeenCalledWith('授权记录已刷新')
  })

  it('刷新期间 loading 门闩存在：UI 禁用 + handleRefresh 不吞错误状态', async () => {
    // 第一次成功挂载
    vi.mocked(fetchAuthHistory).mockResolvedValue([makeItem('ar_test_0005', '门闩应用')])
    const ctx = setupView()
    await flushAsync()
    expect(ctx.loading).toBe(false)
    // 刷新失败 → error 态（handleRefresh 不吞错，loadState 落 error，可再点重试）
    vi.mocked(fetchAuthHistory).mockRejectedValueOnce(
      new IdentityServiceError('network_unavailable', '无法加载授权记录，请稍后重试')
    )
    await ctx.handleRefresh()
    await flushAsync()
    expect(ctx.loadState).toBe('error')
    // 源码契约：loading 期间刷新按钮 disabled（真实点击被 UI 挡住，防并发入口）
    expect(viewSource()).toMatch(/:disabled="loading"/)
  })
})
