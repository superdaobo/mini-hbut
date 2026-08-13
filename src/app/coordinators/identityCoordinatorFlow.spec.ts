// src/app/coordinators/identityCoordinatorFlow.spec.ts
//
// #623 授权确认流程（Store/Coordinator 侧）：
//   - valid intent -> loading -> ready
//   - 未登录 -> 复用现有登录 -> 登录成功 resume 闭环
//   - 登录失败/取消（不悬空）
//   - 敏感 scope（student.identity）允许前在线刷新本地学校 session
//   - 请求在登录等待期间过期
//   - 并发排队请求：结果确认后自动推进下一个
//   - approve 防双击 / deny / cancel
//   - 私钥永远不进入 JS（sign 参数与提交 body 均无私钥材料）
//   - handoff 不进 localStorage（内存终态清理）
//   - 无 student.identity 时不触发学校 session 刷新（Contract 测试 5）
//
// 结果页（finishIdentityRequest）展示期间队列不自动推进，用户确认
// （confirmResult）后才推进下一个请求 —— 保证「已允许登录」反馈可见。
//
// 注意：identityIntentStore 的订阅者集合是模块级共享的，旧 coordinator 实例
// 仍会响应新测试的 submitIntent（用各自的 runtime 执行并写模块级 UI 状态），
// 因此每个测试创建的 coordinator 必须在 afterEach 中 dispose。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdentityCoordinator } from './IdentityCoordinator'
import {
  getIdentityIntentSnapshot,
  resetIdentityIntentStore
} from '../../features/identity/identityIntentStore'
import {
  identityUiState,
  overlayVisible,
  resetIdentityUiState
} from '../../features/identity/identityStore'
import type { IdentityRequestDetail } from '../../features/identity/types'

vi.mock('../../utils/toast', () => ({
  showToast: vi.fn()
}))

vi.mock('../../features/identity/identityService', () => ({
  fetchRequestDetail: vi.fn(),
  fetchEnrollmentChallenge: vi.fn(),
  submitApprove: vi.fn(),
  submitTerminalAction: vi.fn(),
  getIdentityCoreBaseUrl: vi.fn(() => 'https://core.example.test'),
  isTestAccountBlocked: vi.fn(() => false),
  createServiceError: vi.fn((_code: string, message?: string) => new Error(message || 'mocked'))
}))

vi.mock('../../platform/native', () => ({
  invokeNative: vi.fn(),
  getIdentityDeviceDisplayName: vi.fn(() => 'Windows PC')
}))

import {
  fetchEnrollmentChallenge,
  fetchRequestDetail,
  submitApprove,
  submitTerminalAction
} from '../../features/identity/identityService'
import { invokeNative } from '../../platform/native'

// ─── 测试数据 ───────────────────────────────────────────────────────────────

const HANDOFF = 'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9'

const makeIntent = (requestId: string) => ({
  requestId,
  handoff: HANDOFF,
  arrivedAt: Date.now()
})

const makeDetail = (overrides: Partial<IdentityRequestDetail> = {}): IdentityRequestDetail => ({
  request_id: 'ar_1111111111111111',
  expires_at: new Date(Date.now() + 120_000).toISOString(),
  client: {
    name: '课程助手',
    homepage_host: 'course.example.com',
    developer_display_name: '示例开发者',
    review_status: 'verified'
  },
  scopes: [{ id: 'openid', label: '确认你的 Mini-HBUT 身份', risk: 'basic' }],
  challenge: 'challenge-abc-123',
  client_id: 'mh_client_1',
  ...overrides
})

const sensitiveDetail = (overrides: Partial<IdentityRequestDetail> = {}) =>
  makeDetail({
    scopes: [
      { id: 'openid', label: '确认你的 Mini-HBUT 身份', risk: 'basic' },
      { id: 'student.identity', label: '获取你的学校身份（如学号、姓名）', risk: 'sensitive' }
    ],
    ...overrides
  })

/** 按 requestId 驱动的 fetchRequestDetail 实现（避免 Once 队列跨测试错位） */
const detailByRequest = new Map<string, IdentityRequestDetail>()

const makeRuntime = (overrides: Record<string, unknown> = {}) =>
  ({
    state: {
      mutable: { appBootstrapped: true },
      studentId: { value: '2023000001' },
      isLoggedIn: { value: true }
    },
    session: {
      refreshSessionVerified: vi.fn(async () => true),
      attemptOnlineRecovery: vi.fn(async () => true)
    },
    navigation: { goToView: vi.fn() },
    ...overrides
  }) as unknown as Parameters<typeof createIdentityCoordinator>[0]

const makeNotLoggedInRuntime = () =>
  makeRuntime({
    state: {
      mutable: { appBootstrapped: true },
      studentId: { value: '' },
      isLoggedIn: { value: false }
    }
  })

const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear()
}

/** flush 微任务（runActiveFlow 的 await 链） */
const flushAsync = async (times = 8): Promise<void> => {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

/** 创建的 coordinator 实例（afterEach 统一 dispose，防止订阅者跨测试泄漏） */
let createdCoordinators: Array<{ dispose: () => void }> = []

const createCoordinator = (
  runtime: Parameters<typeof createIdentityCoordinator>[0]
): ReturnType<typeof createIdentityCoordinator> => {
  const coordinator = createIdentityCoordinator(runtime)
  createdCoordinators.push(coordinator)
  return coordinator
}

/** 默认原生命令 mock：无密钥设备 -> 自动 enrollment -> 可签名 */
const installNativeMock = (): void => {
  vi.mocked(invokeNative).mockImplementation(async (command: string) => {
    if (command === 'identity_device_status') {
      return { available: true, has_key: false, fingerprint: null, error: null }
    }
    if (command === 'identity_enroll_device') {
      return { user_id: 'u_test_1', device_id: 'dev_test_1', status: 'active', fingerprint: 'fp_test' }
    }
    if (command === 'identity_sign_auth_request') {
      return {
        device_id: 'dev_test_1',
        issued_at: 1700000000,
        nonce: 'nonce-1',
        signature: 'sig-abc',
        canonical_version: 'v1'
      }
    }
    throw new Error(`unexpected native command: ${command}`)
  })
}

beforeEach(() => {
  resetIdentityIntentStore()
  resetIdentityUiState()
  storageMap.clear()
  detailByRequest.clear()
  createdCoordinators = []
  vi.stubGlobal('localStorage', stubStorage)
  vi.useFakeTimers()
  vi.clearAllMocks()
  installNativeMock()
  vi.mocked(fetchRequestDetail).mockImplementation(async ({ requestId }) => {
    const detail = detailByRequest.get(requestId)
    if (!detail) throw new Error(`no fixture detail for ${requestId}`)
    return detail
  })
  vi.mocked(fetchEnrollmentChallenge).mockResolvedValue({
    challenge: 'enroll-challenge-1',
    expires_at: new Date(Date.now() + 60_000).toISOString()
  })
  vi.mocked(submitApprove).mockResolvedValue({
    request_id: 'ar_1111111111111111',
    status: 'approved',
    approved_at: '2026-08-13T00:00:00Z',
    already_approved: false
  })
  vi.mocked(submitTerminalAction).mockResolvedValue(true)
})

afterEach(() => {
  // 卸载所有 coordinator（移除 intent store 订阅者），否则旧实例会用各自的
  // runtime 响应下一个测试的 submitIntent，污染模块级 UI 状态
  for (const coordinator of createdCoordinators) {
    coordinator.dispose()
  }
  // 清空泄漏的 fake timers（coordinator 的 expiry timer 闭包）
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ─── 1. valid intent -> loading -> ready ───────────────────────────────────

describe('#623 授权流程：请求加载与就绪', () => {
  it('valid intent：received -> loading -> ready（已登录 + 基础 scope）', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const runtime = makeRuntime()
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    const snap = getIdentityIntentSnapshot()
    expect(snap.active?.requestId).toBe('ar_1111111111111111')
    expect(snap.active?.phase).toBe('ready')
    expect(identityUiState.approvalPhase).toBe('ready')
    expect(identityUiState.requestDetail?.client.name).toBe('课程助手')
    // 基础 scope：不做学校 session 在线刷新（Contract 测试 5）
    const sessionSpy = runtime.session.refreshSessionVerified as ReturnType<typeof vi.fn>
    expect(sessionSpy).not.toHaveBeenCalled()
  })

  it('detail 必须来自服务器 sanitized 数据：coordinator 不信任深链附加资料', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    // 深链里夹带伪造的应用名/学号：submitIntent 只保留 requestId/handoff/arrivedAt
    coordinator.submitIntent({
      ...makeIntent('ar_1111111111111111'),
      client_name: '钓鱼应用',
      student_id: '2099999999'
    } as never)
    await flushAsync()
    // 展示资料来自 fetchRequestDetail（服务器），不是深链附加字段
    expect(identityUiState.requestDetail?.client.name).toBe('课程助手')
    expect(identityUiState.requestDetail?.client.homepage_host).toBe('course.example.com')
    // intent 对象只含合同字段（requestId/handoff/arrivedAt/phase/detail），
    // 深链附加的展示资料（client_name/student_id）被丢弃
    const snap = getIdentityIntentSnapshot()
    expect(snap.active).not.toHaveProperty('client_name')
    expect(snap.active).not.toHaveProperty('student_id')
    expect(snap.active).toHaveProperty('requestId')
    expect(snap.active).toHaveProperty('handoff')
  })

  it('expired：本地倒计时到期 -> expired 结果页（结果确认前不推进队列）', async () => {
    detailByRequest.set(
      'ar_1111111111111111',
      makeDetail({ expires_at: new Date(Date.now() + 2000).toISOString() })
    )
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('ready')
    await vi.advanceTimersByTimeAsync(4000)
    expect(identityUiState.approvalPhase).toBe('expired')
    expect(identityUiState.lastResult?.outcome).toBe('expired')
    // 结果页可见（lastResult 非空）
    expect(overlayVisible.value).toBe(true)
    // 未确认前：intent store 仍挂住，队列不推进
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
    // 确认后终态清理
    coordinator.confirmResult()
    expect(getIdentityIntentSnapshot().active).toBeNull()
    expect(getIdentityIntentSnapshot().phase).toBe('idle')
  })
})

// ─── 2/3. 未登录 -> 登录恢复 / 登录失败取消 ────────────────────────────────

describe('#623 授权流程：未登录复用现有登录', () => {
  it('未登录 -> needs_login（awaiting_local_login），detail 保留在内存', async () => {
    detailByRequest.set('ar_1111111111111111', sensitiveDetail())
    const runtime = makeNotLoggedInRuntime()
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('needs_login')
    expect(identityUiState.needsLogin).toBe(true)
    const snap = getIdentityIntentSnapshot()
    expect(snap.active?.phase).toBe('awaiting_local_login')
    // detail 留在内存（登录成功 resume 后审批签名需要）
    expect((snap.active?.detail as IdentityRequestDetail)?.scopes).toHaveLength(2)
    // 没有复制登录表单：只隐藏 Overlay + 导航到 Me 视图
    coordinator.goLogin()
    expect(identityUiState.suppressedForLogin).toBe(true)
    expect(runtime.navigation.goToView).toHaveBeenCalledWith('me', { push: true })
    expect(overlayVisible.value).toBe(false)
  })

  it('登录成功 -> resume 闭环 -> ready（无需重新点网页按钮）', async () => {
    detailByRequest.set('ar_1111111111111111', sensitiveDetail())
    const runtime = makeNotLoggedInRuntime()
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('needs_login')
    // 模拟 AuthCoordinator.handleLoginSuccess 完成学校登录后：
    // node 测试环境无 window，直接调用 resume hook（真实环境由
    // 'hbu-identity-login-resumed' 事件派发，见 AuthCoordinator 契约断言）
    runtime.state.studentId.value = '2023000001'
    runtime.state.isLoggedIn.value = true
    await coordinator.resumeAfterLogin()
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('ready')
    expect(identityUiState.suppressedForLogin).toBe(false)
    expect(overlayVisible.value).toBe(true)
  })

  it('登录等待期间敏感 scope：resume 后先在线刷新 session 再 ready', async () => {
    detailByRequest.set('ar_1111111111111111', sensitiveDetail())
    const runtime = makeNotLoggedInRuntime()
    const refreshSpy = runtime.session.refreshSessionVerified as ReturnType<typeof vi.fn>
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    runtime.state.studentId.value = '2023000001'
    runtime.state.isLoggedIn.value = true
    await coordinator.resumeAfterLogin()
    await flushAsync()
    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(identityUiState.approvalPhase).toBe('ready')
    // 刷新成功后更新 linked identity verified_at（本地展示，非认证依据）
    expect(identityUiState.verifiedAt).not.toBeNull()
  })

  it('登录失败/用户取消：deny 走终端动作，本地终态不悬空', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const runtime = makeNotLoggedInRuntime()
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('needs_login')
    await coordinator.denyActive()
    expect(submitTerminalAction).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'ar_1111111111111111', action: 'deny' })
    )
    expect(identityUiState.approvalPhase).toBe('denied')
    expect(identityUiState.lastResult?.outcome).toBe('denied')
    expect(overlayVisible.value).toBe(true)
    coordinator.confirmResult()
    expect(getIdentityIntentSnapshot().active).toBeNull()
  })
})

// ─── 4. 敏感 scope 在线刷新 ────────────────────────────────────────────────

describe('#623 授权流程：student.identity 敏感 scope', () => {
  it('敏感 scope：允许前必须在线刷新本地学校 session，成功 -> ready', async () => {
    detailByRequest.set('ar_1111111111111111', sensitiveDetail())
    const runtime = makeRuntime()
    const refreshSpy = runtime.session.refreshSessionVerified as ReturnType<typeof vi.fn>
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('ready')
    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(identityUiState.sessionValidation).toBe('ok')
    expect(identityUiState.verifiedAt).not.toBeNull()
  })

  it('敏感 scope：刷新失败但静默恢复成功 -> ready（不会不给权限就走缓存学号）', async () => {
    detailByRequest.set('ar_1111111111111111', sensitiveDetail())
    const runtime = makeRuntime()
    const refreshSpy = runtime.session.refreshSessionVerified as ReturnType<typeof vi.fn>
    const recoverySpy = runtime.session.attemptOnlineRecovery as ReturnType<typeof vi.fn>
    refreshSpy.mockResolvedValueOnce(false)
    recoverySpy.mockResolvedValueOnce(true)
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('ready')
    expect(recoverySpy).toHaveBeenCalledTimes(1)
  })

  it('敏感 scope：刷新与恢复都失败 -> 明确不给 student.identity（session_revalidation_required）', async () => {
    detailByRequest.set('ar_1111111111111111', sensitiveDetail())
    const runtime = makeRuntime()
    const refreshSpy = runtime.session.refreshSessionVerified as ReturnType<typeof vi.fn>
    const recoverySpy = runtime.session.attemptOnlineRecovery as ReturnType<typeof vi.fn>
    refreshSpy.mockResolvedValueOnce(false)
    recoverySpy.mockResolvedValueOnce(false)
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('error')
    expect(identityUiState.lastResult?.errorCode).toBe('session_revalidation_required')
    expect(overlayVisible.value).toBe(true)
  })
})

// ─── 5/6. 过期与并发队列 ───────────────────────────────────────────────────

describe('#623 授权流程：过期与并发排队', () => {
  it('登录等待期间请求过期：pending 请求 TTL 内过期 -> expired 结果页', async () => {
    detailByRequest.set(
      'ar_1111111111111111',
      makeDetail({ expires_at: new Date(Date.now() + 1500).toISOString() })
    )
    const runtime = makeNotLoggedInRuntime()
    const coordinator = createCoordinator(runtime)
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('needs_login')
    await vi.advanceTimersByTimeAsync(3000)
    expect(identityUiState.approvalPhase).toBe('expired')
    expect(identityUiState.lastResult?.outcome).toBe('expired')
  })

  it('并发排队：结果确认后自动推进下一个请求（不替换未确认的结果页）', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    detailByRequest.set('ar_2222222222222222', makeDetail({ request_id: 'ar_2222222222222222' }))
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    coordinator.submitIntent(makeIntent('ar_2222222222222222'))
    await flushAsync()
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
    expect(identityUiState.approvalPhase).toBe('ready')
    // approve 第一个
    await coordinator.approveActive()
    expect(identityUiState.approvalPhase).toBe('approved')
    expect(identityUiState.lastResult?.outcome).toBe('approved')
    // 结果页展示期间：第二个请求不抢占（active 仍是第一个，队列不动）
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_1111111111111111')
    expect(getIdentityIntentSnapshot().queue).toHaveLength(1)
    // 确认结果 -> 自动推进第二个 -> ready
    coordinator.confirmResult()
    await flushAsync()
    expect(getIdentityIntentSnapshot().active?.requestId).toBe('ar_2222222222222222')
    expect(identityUiState.approvalPhase).toBe('ready')
    expect(identityUiState.lastResult).toBeNull()
  })
})

// ─── 7/8. approve 防双击 / deny / cancel ───────────────────────────────────

describe('#623 授权流程：审批动作', () => {
  it('approve：Rust 签名（私钥不进 JS）-> TS 提交 Core approve -> approved 结果页', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    await coordinator.approveActive()
    // Rust 侧签名参数：只有签名上下文，没有私钥字段
    const signArgs = vi.mocked(invokeNative).mock.calls.find(
      ([command]) => command === 'identity_sign_auth_request'
    )?.[1]
    expect(signArgs).toEqual({
      request_id: 'ar_1111111111111111',
      challenge: 'challenge-abc-123',
      client_id: 'mh_client_1',
      scopes: ['openid'],
      device_id: 'dev_test_1'
    })
    expect(signArgs).not.toHaveProperty('private_key')
    expect(signArgs).not.toHaveProperty('privateKey')
    expect(signArgs).not.toHaveProperty('seed')
    // TS 提交给 Core 的审批 body：只含 device_id/issued_at/nonce/signature/canonical_version
    const approveCall = vi.mocked(submitApprove).mock.calls[0][0]
    expect(approveCall.approval).toEqual({
      device_id: 'dev_test_1',
      issued_at: 1700000000,
      nonce: 'nonce-1',
      signature: 'sig-abc',
      canonical_version: 'v1'
    })
    expect(approveCall.approval).not.toHaveProperty('private_key')
    expect(identityUiState.approvalPhase).toBe('approved')
    expect(identityUiState.lastResult?.outcome).toBe('approved')
    // 成功后不常连：无轮询/WebSocket（coordinator 无定时器残留）
    expect(vi.getTimerCount()).toBe(0)
    // 确认后内存 handoff 清理
    coordinator.confirmResult()
    expect(getIdentityIntentSnapshot().active).toBeNull()
    expect(getIdentityIntentSnapshot().lastCompleted?.requestId).toBe('ar_1111111111111111')
  })

  it('approve 双击：第二次调用被 actionInFlight 拦截，Rust 只签名一次', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    const first = coordinator.approveActive()
    const second = coordinator.approveActive() // 进行中被拦截
    await Promise.all([first, second])
    const signCalls = vi.mocked(invokeNative).mock.calls.filter(
      ([command]) => command === 'identity_sign_auth_request'
    )
    expect(signCalls).toHaveLength(1)
    expect(vi.mocked(submitApprove)).toHaveBeenCalledTimes(1)
    expect(identityUiState.approvalPhase).toBe('approved')
  })

  it('deny：拒绝按钮语义确定（best-effort 通知 Core），结果页不悬空', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    await coordinator.denyActive()
    expect(submitTerminalAction).toHaveBeenCalledTimes(1)
    expect(identityUiState.approvalPhase).toBe('denied')
    expect(identityUiState.lastResult?.message).toContain('已拒绝授权')
    coordinator.confirmResult()
    expect(getIdentityIntentSnapshot().active).toBeNull()
  })

  it('cancel（关闭按钮/Escape）：等同取消此次授权，不留悬空 WAITING 感知', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    await coordinator.cancelActive()
    expect(submitTerminalAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'cancel' }))
    expect(identityUiState.approvalPhase).toBe('denied') // cancelled 映射为 denied 相位
    expect(identityUiState.lastResult?.outcome).toBe('cancelled')
    coordinator.confirmResult()
    expect(getIdentityIntentSnapshot().active).toBeNull()
  })
})

// ─── 10. handoff 不进 localStorage ─────────────────────────────────────────

describe('#623 安全边界：handoff 仅内存', () => {
  it('handoff 不进 localStorage：完整审批流程后 storage 只含非敏感设备元数据', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    await coordinator.approveActive()
    coordinator.confirmResult()
    // storage 中没有任何键包含 handoff / secret / 签名材料
    for (const key of storageMap.keys()) {
      expect(key.toLowerCase()).not.toMatch(/handoff|secret|private|key|signature|challenge|nonce/)
    }
    for (const value of storageMap.values()) {
      expect(value).not.toContain(HANDOFF)
      expect(value).not.toContain('sig-abc')
      expect(value).not.toContain('nonce-1')
    }
    // identityStore 持久化键只有设备元数据（非敏感展示信息）
    expect(storageMap.has('hbu_identity_device_id')).toBe(true)
    expect(storageMap.has('hbu_identity_user_id')).toBe(true)
    // 内存 intent 终态记录（含 handoff）只存在于内存
    const snap = getIdentityIntentSnapshot()
    expect(snap.lastCompleted?.requestId).toBe('ar_1111111111111111')
    expect(snap.lastCompleted?.handoff).toBe(HANDOFF)
    expect(snap.active).toBeNull()
  })

  it('请求终态后（approve/deny/expired）内存 handoff 不可再复用：不可重复 approve', async () => {
    detailByRequest.set('ar_1111111111111111', makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    coordinator.submitIntent(makeIntent('ar_1111111111111111'))
    await flushAsync()
    await coordinator.approveActive()
    coordinator.confirmResult()
    // 终态后：没有活跃请求，approve 无操作
    await coordinator.approveActive()
    expect(vi.mocked(submitApprove)).toHaveBeenCalledTimes(1)
    expect(getIdentityIntentSnapshot().active).toBeNull()
  })
})
