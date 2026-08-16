/**
 * #626 日志脱敏测试：
 * - Authorization / handoff / client_secret / code / refresh_token / 学号等
 *   敏感模式被替换为 [redacted]；
 * - 敏感键名整体脱敏（含嵌套）；
 * - 普通内容不受影响（不误伤正常日志）；
 * - logger 集成：createLogger 输出前统一脱敏（拦截 console 断言）。
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  REDACTED,
  redactLogFields,
  redactSensitiveText,
  isSensitiveFieldKey,
} from '../../src/security/redact.js'
import { createLogger } from '../../src/observability/logger.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('redactSensitiveText', () => {
  it('Authorization Bearer 脱敏（保留前缀便于排查）', () => {
    const out = redactSensitiveText('Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.abc.def') // secretguard: allow-test-fixture
    expect(out).toContain('Authorization:')
    expect(out).not.toContain('eyJhbGciOiJSUzI1NiJ9')
    expect(out).toContain(REDACTED)
  })

  it('x-identity-handoff 头值脱敏', () => {
    const secret = 'ho_7hF2kPq9wXyZ4vB6nM1cJ8dL3sA5tR0uE'
    const out = redactSensitiveText(`x-identity-handoff: ${secret}`)
    expect(out).not.toContain(secret)
    expect(out).toContain(REDACTED)
  })

  it('client_secret / code / refresh_token 参数脱敏', () => {
    const out = redactSensitiveText('client_secret=supersecretvalue123&code=abcdEFGH0123456789&refresh_token=rt.xyz.0123456789')
    expect(out).not.toContain('supersecretvalue123')
    expect(out).not.toContain('abcdEFGH0123456789')
    expect(out).not.toContain('rt.xyz.0123456789')
    expect(out).toContain(REDACTED)
  })

  it('student_id 上下文中的完整学号脱敏', () => {
    const out = redactSensitiveText('student_id: 2023123456')
    expect(out).not.toContain('2023123456')
  })

  it('handoff fragment（URL hash 长串）脱敏', () => {
    const out = redactSensitiveText('https://auth.example.test/r/req_abc#9jK2mX4pQ7wZ1vB8nC3sD6fG')
    expect(out).not.toContain('9jK2mX4pQ7wZ1vB8nC3sD6fG')
  })

  it('普通日志内容不受影响', () => {
    const out = redactSensitiveText('http 200 GET /api/v1/requests/req_abc 12ms')
    expect(out).toBe('http 200 GET /api/v1/requests/req_abc 12ms')
  })
})

describe('isSensitiveFieldKey / redactLogFields', () => {
  it('敏感键名整体脱敏', () => {
    expect(isSensitiveFieldKey('Authorization')).toBe(true)
    expect(isSensitiveFieldKey('x-identity-handoff')).toBe(true)
    expect(isSensitiveFieldKey('client_secret')).toBe(true)
    expect(isSensitiveFieldKey('student_id')).toBe(true)
    expect(isSensitiveFieldKey('requestId')).toBe(false)
    expect(isSensitiveFieldKey('status')).toBe(false)
    const out = redactLogFields({
      authorization: 'Bearer abc.def.ghi',
      requestId: 'rq_1',
      nested: { handoff: 'secret-value-123', path: '/ok' },
      ms: 12,
    })
    expect(out?.authorization).toBe(REDACTED)
    expect(out?.requestId).toBe('rq_1')
    expect(out?.ms).toBe(12)
    const nested = out?.nested as Record<string, unknown>
    expect(nested.handoff).toBe(REDACTED)
    expect(nested.path).toBe('/ok')
  })
})

describe('createLogger 集成（落盘前统一脱敏）', () => {
  it('误传敏感字段也会被脱敏后再输出', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const logger = createLogger('core')
    logger.error('http', {
      authorization: 'Bearer leaked.token.value',
      client_secret: 'leaked-secret-12345',
      requestId: 'rq_ok',
    })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const line = errorSpy.mock.calls[0]![0] as string
    expect(line).not.toContain('leaked.token.value')
    expect(line).not.toContain('leaked-secret-12345')
    expect(line).toContain('rq_ok')
    expect(line).toContain(REDACTED)
  })
})
