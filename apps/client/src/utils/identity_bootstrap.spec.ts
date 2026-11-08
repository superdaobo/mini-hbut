// T10 身份引导（identity bootstrap）单元测试：
// 开关（默认关 → 零请求）/ payload 构造（app_attestation 形状）/ 严格解析 /
// 401/503/400 可读错误且不落令牌 / 网络异常 / 缺学号不发请求 / 成功落地到既有身份域
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IDENTITY_BOOTSTRAP_CONFIG_KEY,
  buildBootstrapPayload,
  exchangeIdentityBootstrap,
  isIdentityBootstrapEnabled,
  maybeBootstrapIdentity,
  readStoredStudentName,
  resolveIdentityBootstrapBaseUrl
} from './identity_bootstrap'
import {
  clearIdentityAccessToken,
  peekIdentityAccessToken,
  swapIdentityToken
} from './identity_access_token'
import { PRODUCTION_CANONICAL_ISSUER } from '../features/identity/identityIssuers'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'
import { PRIMARY_BACKEND_ORIGIN } from './backend_endpoints'

const STUDENT_ID = '2510231106'
const DEVICE_ID = 'dev-abc123'

/** 构造一个能通过本地 issuer 校验的假 JWT（payload 为给定 claims；不验签，签名段占位） */
const makeJwt = (claims: Record<string, unknown>): string => {
  const enc = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc(claims)}.${enc({ sig: 'x' })}`
}

const okJwt = (studentId: string): string =>
  makeJwt({ iss: PRODUCTION_CANONICAL_ISSUER, hbut_student_id: studentId })

const jsonResponse = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response

const enabledConfig = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  [IDENTITY_BOOTSTRAP_CONFIG_KEY]: { enabled: true, ...extra }
})

let storageValues: Map<string, string>

beforeEach(() => {
  storageValues = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => void storageValues.set(key, value),
    removeItem: (key: string) => void storageValues.delete(key)
  })
})

afterEach(() => {
  clearIdentityAccessToken()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isIdentityBootstrapEnabled（开关默认 false）', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['空对象', {}],
    ['块缺失', { ocr: {} }],
    ['块非对象', { identity_bootstrap: 'true' }],
    ['块非对象(数组)', { identity_bootstrap: [1] }],
    ['enabled 为字符串 true', { identity_bootstrap: { enabled: 'true' } }],
    ['enabled 为 1', { identity_bootstrap: { enabled: 1 } }]
  ])('config=%s → 关闭', (_label, config) => {
    expect(isIdentityBootstrapEnabled(config)).toBe(false)
  })

  it('identity_bootstrap.enabled === true 时开启', () => {
    expect(isIdentityBootstrapEnabled(enabledConfig())).toBe(true)
  })
})

describe('buildBootstrapPayload（app_attestation 形状）', () => {
  it('学号/姓名进入 proof.app_identity，无设备信息时不带 device 字段', () => {
    const payload = buildBootstrapPayload({ studentId: ` ${STUDENT_ID} `, studentName: ' 张三 ' })
    expect(payload).toEqual({
      student_id: STUDENT_ID,
      student_name: '张三',
      proof: { app_identity: { student_id: STUDENT_ID, student_name: '张三' } }
    })
    expect('device_id' in payload.proof).toBe(false)
    expect('device_signature' in payload.proof).toBe(false)
  })

  it('deviceId 有则带 proof.device_id', () => {
    const payload = buildBootstrapPayload({ studentId: STUDENT_ID, deviceId: DEVICE_ID })
    expect(payload.proof.device_id).toBe(DEVICE_ID)
  })

  it('device_signature 与 timestamp 成对出现（缺省时间戳取当前秒）', () => {
    const before = Math.floor(Date.now() / 1000)
    const payload = buildBootstrapPayload({ studentId: STUDENT_ID, deviceSignature: 'sig-1' })
    const after = Math.floor(Date.now() / 1000)
    expect(payload.proof.device_signature).toBe('sig-1')
    expect(typeof payload.proof.timestamp).toBe('number')
    expect(payload.proof.timestamp).toBeGreaterThanOrEqual(before)
    expect(payload.proof.timestamp).toBeLessThanOrEqual(after)
  })
})

describe('resolveIdentityBootstrapBaseUrl', () => {
  it('默认落到内置主域', () => {
    expect(resolveIdentityBootstrapBaseUrl(undefined)).toBe(PRIMARY_BACKEND_ORIGIN)
    expect(resolveIdentityBootstrapBaseUrl({})).toBe(PRIMARY_BACKEND_ORIGIN)
  })

  it('显式 base_url 优先（HTTPS 归一化去尾斜杠）', () => {
    const config = enabledConfig({ base_url: 'https://example.org/' })
    expect(resolveIdentityBootstrapBaseUrl(config)).toBe('https://example.org')
  })

  it('非法 base_url（非 https 非 loopback）回落后端组默认主域', () => {
    const config = enabledConfig({ base_url: 'http://evil.example.com' })
    expect(resolveIdentityBootstrapBaseUrl(config)).toBe(PRIMARY_BACKEND_ORIGIN)
  })

  it('backend 组：取第一个启用组', () => {
    const config = enabledConfig()
    ;(config as Record<string, unknown>).backend = {
      groups: [
        { id: 'off', base: 'https://off.example.com', enabled: false },
        { id: 'on', base: 'https://on.example.com', enabled: true }
      ]
    }
    expect(resolveIdentityBootstrapBaseUrl(config)).toBe('https://on.example.com')
  })
})

describe('exchangeIdentityBootstrap（POST + 严格解析）', () => {
  it('200 成功：解析全部字段并回 access_token', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, {
        access_token: 'at-1',
        refresh_token: 'rt-1',
        id_token: 'idt-1',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid'
      })
    )
    const result = await exchangeIdentityBootstrap({
      baseUrl: 'https://api.example.com',
      payload: buildBootstrapPayload({ studentId: STUDENT_ID }),
      fetchImpl
    })
    expect(result).toEqual({
      ok: true,
      tokens: {
        access_token: 'at-1',
        refresh_token: 'rt-1',
        id_token: 'idt-1',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid'
      }
    })
    // 请求打到 {base}/identity/bootstrap，body 为 JSON 化的构造体
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/identity/bootstrap')
    expect(JSON.parse(String(init.body))).toEqual(buildBootstrapPayload({ studentId: STUDENT_ID }))
  })

  it.each([
    ['401', 401, 'session_not_verified', '教务会话身份校验未通过'],
    ['503 disabled', 503, 'disabled', '身份平台引导功能未开启'],
    ['503 assertion', 503, 'assertion_not_configured', '断言未配置'],
    ['503 verifier', 503, 'verifier_not_configured', '校验器未配置'],
    ['400 invalid_student_id', 400, 'invalid_student_id', '学号无效']
  ])('%s → 可读错误且标记为 rejected', async (_label, status, kind, expectText) => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(status, { error: kind }))
    const result = await exchangeIdentityBootstrap({
      baseUrl: 'https://api.example.com',
      payload: buildBootstrapPayload({ studentId: STUDENT_ID }),
      fetchImpl
    })
    expect(result.ok).toBe(false)
    if (!result.ok && result.kind === 'rejected') {
      expect(result.error).toBe(kind)
      expect(result.status).toBe(status)
      expect(result.message).toContain(expectText)
    } else {
      throw new Error('expected rejected result')
    }
  })

  it('非 2xx 且 body 无 error 字段 → unknown_status（不吞成成功）', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(502, { detail: 'upstream' }))
    const result = await exchangeIdentityBootstrap({
      baseUrl: 'https://api.example.com',
      payload: buildBootstrapPayload({ studentId: STUDENT_ID }),
      fetchImpl
    })
    expect(result).toMatchObject({ ok: false, kind: 'rejected', error: 'unknown_status', status: 502 })
  })

  it('200 但缺 access_token → malformed_response（不落成功）', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, { access_token: '', refresh_token: 'rt' }))
    const result = await exchangeIdentityBootstrap({
      baseUrl: 'https://api.example.com',
      payload: buildBootstrapPayload({ studentId: STUDENT_ID }),
      fetchImpl
    })
    expect(result).toMatchObject({ ok: false, kind: 'rejected', error: 'malformed_response', status: 200 })
  })

  it('fetch 抛错 → network，cause 原样保留', async () => {
    const boom = new Error('ECONNREFUSED')
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      throw boom
    })
    const result = await exchangeIdentityBootstrap({
      baseUrl: 'https://api.example.com',
      payload: buildBootstrapPayload({ studentId: STUDENT_ID }),
      fetchImpl
    })
    expect(result).toMatchObject({ ok: false, kind: 'network', error: 'network' })
    if (!result.ok && result.kind === 'network') {
      expect(result.cause).toBe(boom)
      expect(result.message).toContain('ECONNREFUSED')
    } else {
      throw new Error('expected network result')
    }
  })
})

describe('maybeBootstrapIdentity（登录成功后的总入口）', () => {
  it('开关关（默认）→ disabled，且**不发起任何请求**', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}))
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: {}, // 无 identity_bootstrap 块
      fetchImpl
    })
    expect(outcome).toEqual({ status: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('开关开但缺学号 → invalid_student_id，不发请求', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}))
    const outcome = await maybeBootstrapIdentity({
      studentId: '',
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toEqual({ status: 'invalid_student_id' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('开关开 + 成功 → 令牌解析并通过护栏后落进既有身份域（swapIdentityToken）', async () => {
    const token = okJwt(STUDENT_ID)
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, {
        access_token: token,
        refresh_token: 'rt',
        id_token: 'idt',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid'
      })
    )
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toEqual({ status: 'ok' })
    expect(peekIdentityAccessToken()).toBe(token)
  })

  it('401 → rejected 且**不落令牌**（身份域保持空）', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(401, { error: 'session_not_verified' }))
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toMatchObject({ status: 'rejected', error: 'session_not_verified' })
    expect(peekIdentityAccessToken()).toBe('')
  })

  it('503/400 → rejected 且已有令牌不受影响（不清空也不覆盖）', async () => {
    swapIdentityToken('previous-at')
    for (const [status, kind] of [
      [503, 'disabled'],
      [400, 'invalid_student_id']
    ] as Array<[number, string]>) {
      const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(status, { error: kind }))
      const outcome = await maybeBootstrapIdentity({
        studentId: STUDENT_ID,
        config: enabledConfig(),
        baseUrl: 'https://api.example.com',
        fetchImpl
      })
      expect(outcome).toMatchObject({ status: 'rejected', error: kind })
    }
    expect(peekIdentityAccessToken()).toBe('previous-at')
  })

  it('网络异常 → failed 且不落令牌', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      throw new Error('timeout')
    })
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toMatchObject({ status: 'failed', error: 'network' })
    expect(peekIdentityAccessToken()).toBe('')
  })

  it('issuer 不在已接受列表 → rejected（issuer_check_failed）且不落令牌', async () => {
    const badIssuerToken = makeJwt({ iss: 'https://evil.example.com', hbut_student_id: STUDENT_ID })
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { access_token: badIssuerToken, token_type: 'Bearer', expires_in: 60 })
    )
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toMatchObject({ status: 'rejected', error: 'issuer_check_failed' })
    expect(peekIdentityAccessToken()).toBe('')
  })

  it('令牌**缺少** hbut_student_id claim → 也拒绝（与设备换票护栏对齐，fail closed）', async () => {
    // 红队 M2：原先 `tokenStudentId &&` 会让"合法签发但缺该 claim"的令牌跳过主体检查而落地
    const noSubject = makeJwt({ iss: PRODUCTION_CANONICAL_ISSUER })
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { access_token: noSubject, token_type: 'Bearer', expires_in: 60 })
    )
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toMatchObject({ status: 'rejected', error: 'subject_mismatch' })
    expect(peekIdentityAccessToken()).toBe('')
  })

  it('令牌主体与本地学号不一致 → rejected（subject_mismatch）且不落令牌', async () => {
    const other = okJwt('2510231107')
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { access_token: other, token_type: 'Bearer', expires_in: 60 })
    )
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toMatchObject({ status: 'rejected', error: 'subject_mismatch' })
    expect(peekIdentityAccessToken()).toBe('')
  })

  it('设备标识取自既有键（IDENTITY_DEVICE_ID_KEY）并随 proof.device_id 发出', async () => {
    storageValues.set(IDENTITY_DEVICE_ID_KEY, DEVICE_ID)
    const token = okJwt(STUDENT_ID)
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { access_token: token, token_type: 'Bearer', expires_in: 60 })
    )
    const outcome = await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    expect(outcome).toEqual({ status: 'ok' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(String(init.body)) as { proof?: { device_id?: string } }
    expect(url).toBe('https://api.example.com/identity/bootstrap')
    expect(sent.proof?.device_id).toBe(DEVICE_ID)
  })

  it('姓名取自既有学生画像存储（hbu_more_module_student_profile:<sid>）', async () => {
    storageValues.set(`hbu_more_module_student_profile:${STUDENT_ID}`, JSON.stringify({
      student_id: STUDENT_ID,
      name: '李四'
    }))
    const token = okJwt(STUDENT_ID)
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { access_token: token, token_type: 'Bearer', expires_in: 60 })
    )
    await maybeBootstrapIdentity({
      studentId: STUDENT_ID,
      config: enabledConfig(),
      baseUrl: 'https://api.example.com',
      fetchImpl
    })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(String(init.body)) as { student_name: string }
    expect(sent.student_name).toBe('李四')
  })
})

describe('readStoredStudentName（复用既有存储，不新建）', () => {
  it('从学生画像键读取 .name', () => {
    storageValues.set(`hbu_more_module_student_profile:${STUDENT_ID}`, JSON.stringify({ name: '王五' }))
    expect(readStoredStudentName(STUDENT_ID)).toBe('王五')
  })

  it('从学生信息缓存（setCachedData 包装）读取候选键', () => {
    storageValues.set(`cache:studentinfo:${STUDENT_ID}`, JSON.stringify({
      data: { xh: STUDENT_ID, xm: '赵六' },
      timestamp: 1
    }))
    expect(readStoredStudentName(STUDENT_ID)).toBe('赵六')
  })

  it('学号非法或无任何来源 → 空串（不发请求的前置判定交给调用方）', () => {
    expect(readStoredStudentName('')).toBe('')
    expect(readStoredStudentName('abc')).toBe('')
    expect(readStoredStudentName(STUDENT_ID)).toBe('')
  })
})
