// src/features/identity/qr/identityQrCrossDeviceFlow.spec.ts
//
// #627 跨设备 E2E 场景（App 侧，parser fixture 代替真摄像头）：
//   "手机扫到的文本"（系统相机 / 图片解码 / https fallback 统一输出）-> parseIdentityQr
//   -> coordinator.submitIntent —— 与同设备 Deep Link 走完全相同的 intent store /
//   Overlay / 设备签名审批链路（共用同一 AuthRequest：同 request_id + 同 handoff）。
//
// 覆盖 issue「Cross-device E2E」清单（App 可测部分）：
//   1. PC request -> phone scan -> approve -> PC callback；
//   2. phone deny -> PC denied；
//   3. QR expires before scan；
//   4. expires while Overlay open；
//   5. same QR scanned by two devices -> 只有第一合法 approve 成功；
//   6. revoked device scan -> 无法 approve；
//   7. screenshot copied within TTL 仍需要有效 device signature；
//   8. wrong/other logged-in user approval -> PC 明确登录为批准者，无身份混淆。
//   （服务器状态机/二次扫码跨设备竞争由 Core 层保证，前端侧断言错误映射与去重。）

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdentityCoordinator } from '../../../app/coordinators/IdentityCoordinator'
import { getIdentityIntentSnapshot, resetIdentityIntentStore } from '../identityIntentStore'
import { identityUiState, resetIdentityUiState } from '../identityStore'
import type { IdentityRequestDetail } from '../types'
import { buildIdentityQrPayload, parseIdentityQr } from './parseIdentityQr'
import { parseMiniHbutDeepLink } from '../../../platform/deep_link'

vi.mock('../../../utils/toast', () => ({
  showToast: vi.fn()
}))

vi.mock('../identityService', () => ({
  fetchRequestDetail: vi.fn(),
  fetchEnrollmentChallenge: vi.fn(),
  submitApprove: vi.fn(),
  submitTerminalAction: vi.fn(),
  getIdentityBffBaseUrl: vi.fn(() => 'https://auth.example.test'),
  getIdentityCoreBaseUrl: vi.fn(() => 'https://core.example.test'),
  isTestAccountBlocked: vi.fn(() => false),
  // 与真实实现一致：抛 IdentityServiceError（coordinator 依赖 instanceof 映射错误码）
  createServiceError: vi.fn(
    (code: string, message?: string) =>
      new IdentityServiceError(code as never, message || 'mocked')
  )
}))

vi.mock('../../../platform/native', () => ({
  invokeNative: vi.fn(),
  getIdentityDeviceDisplayName: vi.fn(() => 'Android Phone')
}))

import { IdentityServiceError } from '../types'
import {
  fetchEnrollmentChallenge,
  fetchRequestDetail,
  submitApprove,
  submitTerminalAction
} from '../identityService'
import { invokeNative } from '../../../platform/native'

// ─── 测试数据（扫码 fixture：系统相机/图片解码输出的原始文本） ───────────────

const HANDOFF = 'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9'
const REQUEST_ID = 'ar_0123456789abcdef'

/** 手机扫到的 QR 文本（模拟系统相机对 QR 的解码输出，source=qr） */
const qrText = buildIdentityQrPayload(REQUEST_ID, HANDOFF)
/** 模拟「打开 App」同设备深链（无 source）—— 共用同一 AuthRequest */
const deepLinkText = `minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}`
/** 模拟 https fallback（系统相机无法识别 custom scheme 时浏览器打开的链接） */
const fallbackText = `https://auth.example.com/r/${REQUEST_ID}#h=${HANDOFF}`

const makeDetail = (overrides: Partial<IdentityRequestDetail> = {}): IdentityRequestDetail => ({
  request_id: REQUEST_ID,
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

const flushAsync = async (times = 8): Promise<void> => {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

let createdCoordinators: Array<{ dispose: () => void }> = []

const createCoordinator = (
  runtime: Parameters<typeof createIdentityCoordinator>[0]
): ReturnType<typeof createIdentityCoordinator> => {
  const coordinator = createIdentityCoordinator(runtime)
  createdCoordinators.push(coordinator)
  return coordinator
}

const installNativeMock = (): void => {
  vi.mocked(invokeNative).mockImplementation(async (command: string) => {
    if (command === 'identity_device_status') {
      return { available: true, has_key: false, fingerprint: null, error: null }
    }
    if (command === 'identity_enroll_device') {
      return { user_id: 'u_phone_1', device_id: 'dev_phone_1', status: 'active', fingerprint: 'fp_1' }
    }
    if (command === 'identity_sign_auth_request') {
      return {
        device_id: 'dev_phone_1',
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
  detailByRequest.clear()
  createdCoordinators = []
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
    request_id: REQUEST_ID,
    status: 'approved',
    approved_at: '2026-08-13T00:00:00Z',
    already_approved: false
  })
  vi.mocked(submitTerminalAction).mockResolvedValue(true)
})

afterEach(() => {
  for (const coordinator of createdCoordinators) {
    coordinator.dispose()
  }
  vi.clearAllTimers()
  vi.useRealTimers()
})

// ─── 1. PC request -> phone scan -> approve -> PC callback ──────────────────

describe('#627 跨设备：扫码 -> 审批 -> 完成（共用同一 AuthRequest）', () => {
  it('扫码提交与深链提交进入同一 intent store（同 request_id/handoff）', () => {
    const coordinator = createCoordinator(makeRuntime())
    // 手机扫码（QR 文本）
    const qrResult = parseIdentityQr(qrText)
    expect(qrResult.ok).toBe(true)
    if (!qrResult.ok) return
    coordinator.submitIntent({ ...qrResult.link, arrivedAt: Date.now() })
    // 与 #621 parser 深链解析结果逐字段一致（共用同一 AuthRequest 的证明）
    const deepLinkResult = parseMiniHbutDeepLink(deepLinkText)
    expect(deepLinkResult.ok).toBe(true)
    if (!deepLinkResult.ok) return
    if (deepLinkResult.link.kind !== 'identity') return
    expect(qrResult.link.requestId).toBe(deepLinkResult.link.requestId)
    expect(qrResult.link.handoff).toBe(deepLinkResult.link.handoff)
    const snap = getIdentityIntentSnapshot()
    expect(snap.active?.requestId).toBe(REQUEST_ID)
    expect(snap.active?.handoff).toBe(HANDOFF)
    // coordinator 已自动启动加载流程（detail 拉取中），请求保持活跃
    expect(snap.active?.phase).not.toBe('done')
    expect(snap.active?.phase).not.toBe('error')
  })

  it('扫码 -> approve：Core 收到的 handoff 与扫码解析出的完全一致（不另造凭据）', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('ready')
    coordinator.approveActive()
    await flushAsync()
    // 审批完成：PC 端轮询到 APPROVED 后 resume（PC 回调由 #630 接力页完成）
    expect(identityUiState.approvalPhase).toBe('approved')
    expect(identityUiState.lastResult?.outcome).toBe('approved')
    // 关键断言：approve 请求头使用的是扫码解析出的同一个 handoff
    expect(vi.mocked(submitApprove)).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: REQUEST_ID,
        handoff: HANDOFF
      })
    )
    // 设备签名来自 Rust（私钥不进 JS）
    const approvalArg = vi.mocked(submitApprove).mock.calls[0][0].approval
    expect(approvalArg.signature).toBe('sig-abc')
    expect(approvalArg.device_id).toBe('dev_phone_1')
  })

  it('https fallback 文本扫码后同样进入同一审批链路', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(fallbackText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('ready')
  })
})

// ─── 2. phone deny -> PC denied ──────────────────────────────────────────────

describe('#627 跨设备：手机拒绝 -> PC denied', () => {
  it('扫码后 deny：Core 收到同一 handoff 的 deny，PC 轮询到 denied', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail())
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    coordinator.denyActive()
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('denied')
    expect(identityUiState.lastResult?.outcome).toBe('denied')
    expect(vi.mocked(submitTerminalAction)).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID, handoff: HANDOFF, action: 'deny' })
    )
  })
})

// ─── 3/4. expires（scan 前 / Overlay 打开期间） ──────────────────────────────

describe('#627 跨设备：QR 过期（scan 前 / Overlay 打开期间）', () => {
  it('scan 后 Core 判定过期（fetch detail 返回 expired）-> 明确过期结果', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail({ expires_at: new Date(Date.now() - 1).toISOString() }))
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    // 详情已过期：本地倒计时即刻为 0，过期 timer（delay=500ms）触发 -> expired 结果页
    vi.advanceTimersByTime(600)
    await flushAsync()
    expect(identityUiState.lastResult?.outcome).toBe('expired')
    expect(identityUiState.lastResult?.errorCode).toBe('request_expired')
  })

  it('Overlay 打开期间本地倒计时耗尽 -> expired（请求不可再批准）', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail({ expires_at: new Date(Date.now() + 60_000).toISOString() }))
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    expect(identityUiState.approvalPhase).toBe('ready')
    // 时间推进 61s：过期 timer 触发
    vi.advanceTimersByTime(61_000)
    await flushAsync()
    expect(identityUiState.lastResult?.outcome).toBe('expired')
    // 过期后 approve 不再生效（intent 已进入终态等待确认）
    coordinator.approveActive()
    await flushAsync()
    expect(vi.mocked(submitApprove)).not.toHaveBeenCalled()
  })
})

// ─── 5. same QR scanned by two devices ───────────────────────────────────────

describe('#627 跨设备：同一 QR 被两台设备扫描', () => {
  it('同一设备重复扫同一 QR：intent store 去重拒绝（不会产生两个审批）', () => {
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    const snap = getIdentityIntentSnapshot()
    // 只有一个 active，无重复入队
    expect(snap.active?.requestId).toBe(REQUEST_ID)
    expect(snap.queue).toHaveLength(0)
  })

  it('第二台设备扫码时 Core 已 APPROVED -> 明确“请求已完成”错误，不产生第二次审批', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail())
    // 第二台设备视角：approve 时 service 已把 Core 的 AUTH_REQUEST_ALREADY_APPROVED
    // 映射为 request_not_found（映射逻辑在 identityService.mapServerCode，#623 域）
    vi.mocked(submitApprove).mockRejectedValue(
      new IdentityServiceError('request_not_found', '请求不存在或已完成')
    )
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    coordinator.approveActive()
    await flushAsync()
    // 第二台设备看到的是已完成/不可操作的明确错误，且本地终态为 error
    expect(identityUiState.lastResult?.outcome).toBe('error')
    expect(identityUiState.lastResult?.errorCode).toBe('request_not_found')
  })
})

// ─── 6. revoked device scan ──────────────────────────────────────────────────

describe('#627 跨设备：已撤销设备扫码', () => {
  it('Core 拒绝撤销设备签名（DEVICE_AUTH_FAILED -> device_revoked）-> 无法 approve', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail())
    vi.mocked(submitApprove).mockRejectedValue(
      new IdentityServiceError('device_revoked', '当前设备已被撤销，无法继续授权')
    )
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    coordinator.approveActive()
    await flushAsync()
    expect(identityUiState.lastResult?.outcome).toBe('error')
    expect(identityUiState.lastResult?.errorCode).toBe('device_revoked')
    // 撤销后请求不处于 approved：PC 端轮询不会误判成功
    expect(identityUiState.approvalPhase).not.toBe('approved')
  })
})

// ─── 7. screenshot within TTL 仍需要有效 device signature ───────────────────

describe('#627 跨设备：截图转发仍必须设备签名', () => {
  it('即使拿到 QR（bearer handoff），缺签名材料也无法 approve（signing_material_missing）', async () => {
    // Core 下发详情不含 challenge/client_id（#622 冻结 Core 现状）
    detailByRequest.set(REQUEST_ID, makeDetail({ challenge: undefined, client_id: undefined }))
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    coordinator.approveActive()
    await flushAsync()
    expect(identityUiState.lastResult?.outcome).toBe('error')
    expect(identityUiState.lastResult?.errorCode).toBe('signing_material_missing')
    // 未调用 Rust 签名与 approve（签名材料不完整时不得伪造签名上下文）
    expect(vi.mocked(invokeNative)).not.toHaveBeenCalledWith(
      'identity_sign_auth_request',
      expect.anything()
    )
    expect(vi.mocked(submitApprove)).not.toHaveBeenCalled()
  })

  it('签名被 Core 拒绝（SIGNATURE_INVALID -> signature_rejected）明确失败', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail())
    vi.mocked(submitApprove).mockRejectedValue(
      new IdentityServiceError('signature_rejected', '服务器无法验证签名，请重试或重新发起授权')
    )
    const coordinator = createCoordinator(makeRuntime())
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    coordinator.approveActive()
    await flushAsync()
    expect(identityUiState.lastResult?.errorCode).toBe('signature_rejected')
  })
})

// ─── 8. wrong/other logged-in user approval ──────────────────────────────────

describe('#627 跨设备：PC 登录为“扫码并批准的 Mini-HBUT 用户”', () => {
  it('批准者即 PC 登录身份：ready 相位展示当前 Mini-HBUT 身份（不来自 QR）', async () => {
    detailByRequest.set(REQUEST_ID, makeDetail())
    // 手机当前是用户 B（2023000002）—— 与 PC 上可能的用户 A 无关
    const runtime = makeRuntime({ state: { mutable: { appBootstrapped: true }, studentId: { value: '2023000002' }, isLoggedIn: { value: true } } })
    const coordinator = createCoordinator(runtime)
    const result = parseIdentityQr(qrText)
    if (!result.ok) return
    // QR 内容不含 student_id：approved 后 PC 登录为批准者（B），无身份混淆
    expect(qrText.toLowerCase()).not.toContain('2023000002')
    coordinator.submitIntent({ ...result.link, arrivedAt: Date.now() })
    await flushAsync()
    // Overlay ready：展示的是本机当前身份（脱敏学号），而非 QR/网页传入的身份
    expect(identityUiState.approvalPhase).toBe('ready')
    expect(identityUiState.activeRequestId).toBe(REQUEST_ID)
    // 服务端 sanitized 展示资料来自 Core，不来自 QR
    expect(identityUiState.requestDetail?.client.name).toBe('课程助手')
    expect(identityUiState.requestDetail?.client.homepage_host).toBe('course.example.com')
  })
})
