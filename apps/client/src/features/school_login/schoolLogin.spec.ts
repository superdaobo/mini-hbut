// goal-20 T06：「用 Mini-HBUT 登录」前端——深链 / 二维码解析、确认弹窗状态机、原因文案、旧授权零影响。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: vi.fn(() => true)
}))

import { invokeNative, isTauriRuntime } from '../../platform/native'
import { parseMiniHbutDeepLink } from '../../platform/deep_link'
import { parseIdentityQr } from '../identity/qr/parseIdentityQr'
import {
  SHARED_FIELD_LABELS,
  __hasPendingCodeForTest,
  closeSchoolLogin,
  confirmSchoolLogin,
  denySchoolLogin,
  openSchoolLogin,
  parseSchoolLoginText,
  schoolLoginReasonText,
  schoolLoginState
} from './schoolLoginStore'

const REQUEST_ID = 'slr_' + 'A'.repeat(22)
const CODE = 'B'.repeat(22)
const LINK = `minihbut://school-login?request_id=${REQUEST_ID}&code=${CODE}`
const mockInvoke = vi.mocked(invokeNative)

const detailOk = {
  ok: true,
  status: 'pending',
  client_name: 'Mini-HBUT 新认证测试应用',
  shared_fields: ['student_id', 'verified_at', 'approved_at', 'device_id', 'student_name'],
  expires_in: 280
}

beforeEach(() => {
  mockInvoke.mockReset()
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  closeSchoolLogin()
})

afterEach(() => {
  closeSchoolLogin()
})

describe('深链 / 二维码解析', () => {
  it('解析合法的 school-login 链接', () => {
    const result = parseMiniHbutDeepLink(LINK)
    expect(result).toEqual({ ok: true, link: { kind: 'school-login', requestId: REQUEST_ID, code: CODE } })
    expect(parseMiniHbutDeepLink(LINK.replace('?', '/?')).ok).toBe(true) // path 为 /
    expect(parseSchoolLoginText(`  ${LINK}\n`)).toEqual({ requestId: REQUEST_ID, code: CODE })
  })

  it.each([
    ['请求号太短', LINK.replace(REQUEST_ID, 'slr_short')],
    ['请求号前缀不对', LINK.replace('slr_', 'ar__')],
    ['code 太长', LINK.replace(CODE, CODE + 'B')],
    ['code 含非法字符', LINK.replace(CODE, 'B'.repeat(21) + '!')],
    ['缺 code', `minihbut://school-login?request_id=${REQUEST_ID}`],
    ['多余路径', LINK.replace('school-login?', 'school-login/x?')]
  ])('非法链接一律通用错误：%s', (_name, raw) => {
    const result = parseMiniHbutDeepLink(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-identity')
      expect(result.error.message).not.toContain(CODE)
    }
    expect(parseSchoolLoginText(raw)).toBeNull()
  })

  it('旧的 identity 授权链接解析不受影响，且两种链接互不串台', () => {
    const identity = parseMiniHbutDeepLink(`minihbut://identity?request_id=ar_0123456789abcdef&handoff=${'A'.repeat(32)}`)
    expect(identity.ok && identity.link.kind).toBe('identity')
    expect(parseSchoolLoginText(`minihbut://identity?request_id=ar_0123456789abcdef&handoff=${'A'.repeat(32)}`)).toBeNull()
    // 旧的「扫一扫登录」扫描器只认 identity：扫到 school-login 码不会当成旧授权提交
    expect(parseIdentityQr(LINK).ok).toBe(false)
    expect(parseSchoolLoginText('https://mini.hbut.site/school/demo/')).toBeNull()
  })
})

describe('确认弹窗状态机', () => {
  it('打开 → 读取详情 → 确认 → 先核验再批准 → 完成（显示复用 / 首次）', async () => {
    mockInvoke.mockResolvedValueOnce(detailOk)
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    expect(mockInvoke).toHaveBeenLastCalledWith('identity_school_login_detail', { requestId: REQUEST_ID, code: CODE })
    expect(schoolLoginState.phase).toBe('confirm')
    expect(schoolLoginState.clientName).toBe('Mini-HBUT 新认证测试应用')
    expect(schoolLoginState.sharedFields).toEqual(['student_id', 'verified_at', 'approved_at', 'device_id'])
    expect(schoolLoginState.expiresIn).toBe(280)
    expect(Object.keys(SHARED_FIELD_LABELS)).toEqual(['student_id', 'verified_at', 'approved_at', 'device_id'])

    mockInvoke.mockResolvedValueOnce({
      ok: true,
      status: 'approved',
      student_id_masked: '9900***',
      verify: { ok: true, status: 'reused', cookie_sent: false }
    })
    await confirmSchoolLogin()
    expect(mockInvoke).toHaveBeenLastCalledWith('identity_school_login_approve', { requestId: REQUEST_ID, code: CODE })
    expect(schoolLoginState.phase).toBe('done')
    expect(schoolLoginState.verifyStatus).toBe('reused')
    expect(schoolLoginState.studentMasked).toBe('9900***')
    expect(__hasPendingCodeForTest()).toBe(false) // 批准请求发出后 code 即释放
  })

  it('学号核验失败：显示细分原因，不进入完成态', async () => {
    mockInvoke.mockResolvedValueOnce(detailOk)
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    mockInvoke.mockResolvedValueOnce({
      ok: false,
      status: 'failed',
      reason: 'school_verify_failed',
      verify: { ok: false, status: 'failed', reason: 'campus_cookie_required' }
    })
    await confirmSchoolLogin()
    expect(schoolLoginState.phase).toBe('error')
    expect(schoolLoginState.errorText).toContain('学号核验没有通过')
    expect(schoolLoginState.errorText).toContain('重新登录教务系统')
  })

  it('详情读取失败 / 请求过期：直接显示原因', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: false, status: 'failed', reason: 'request_expired', http_status: 410 })
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    expect(schoolLoginState.phase).toBe('error')
    expect(schoolLoginState.errorText).toContain('二维码已过期')
    mockInvoke.mockRejectedValueOnce(new Error('ipc down'))
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    expect(schoolLoginState.errorText).toContain('网络错误')
  })

  it('安卓（Rust 返回 unsupported）与非 App 环境都给明确提示', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: false, status: 'unsupported', reason: 'unsupported_platform' })
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    expect(schoolLoginState.errorText).toContain('暂不支持')
    vi.mocked(isTauriRuntime).mockReturnValue(false)
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    expect(schoolLoginState.errorText).toContain('只能在 Mini-HBUT App 里')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('拒绝：调用 deny 并进入已拒绝；关闭即清空 code', async () => {
    mockInvoke.mockResolvedValueOnce(detailOk)
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    mockInvoke.mockRejectedValueOnce(new Error('offline')) // 拒绝是尽力而为
    await denySchoolLogin()
    expect(mockInvoke).toHaveBeenLastCalledWith('identity_school_login_deny', { requestId: REQUEST_ID, code: CODE })
    expect(schoolLoginState.phase).toBe('denied')
    closeSchoolLogin()
    expect(schoolLoginState.phase).toBe('idle')
    expect(__hasPendingCodeForTest()).toBe(false)
  })

  it('批准进行中不会被新的请求打断；关闭后迟到的详情结果被丢弃', async () => {
    mockInvoke.mockResolvedValueOnce(detailOk)
    await openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    let resolveApprove: (value: unknown) => void = () => {}
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { resolveApprove = resolve }))
    const pending = confirmSchoolLogin()
    expect(schoolLoginState.phase).toBe('approving')
    await openSchoolLogin({ requestId: 'slr_' + 'C'.repeat(22), code: CODE }) // 忽略
    closeSchoolLogin() // 批准中不能关
    expect(schoolLoginState.phase).toBe('approving')
    resolveApprove({ ok: true, status: 'approved', verify: { ok: true, status: 'verified' } })
    await pending
    expect(schoolLoginState.phase).toBe('done')
    expect(schoolLoginState.verifyStatus).toBe('verified')

    let resolveDetail: (value: unknown) => void = () => {}
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { resolveDetail = resolve }))
    const late = openSchoolLogin({ requestId: REQUEST_ID, code: CODE })
    closeSchoolLogin()
    resolveDetail(detailOk)
    await late
    expect(schoolLoginState.phase).toBe('idle')
  })
})

describe('原因文案', () => {
  it('已知原因码给固定文案，未知原因码不回显原文', () => {
    expect(schoolLoginReasonText('request_not_pending')).toBe('这次登录已经处理过了')
    expect(schoolLoginReasonText('no_local_login')).toContain('请先登录')
    expect(schoolLoginReasonText('school_verify_failed', 'landed_on_login_page')).toContain('教务登录已失效')
    expect(schoolLoginReasonText('school_verify_failed', 'weird_reason')).toBe('学号核验没有通过，请稍后再试')
    expect(schoolLoginReasonText('<script>')).toBe('登录没有完成，请稍后再试')
    expect(schoolLoginReasonText(undefined)).toBe('登录没有完成，请稍后再试')
  })
})
