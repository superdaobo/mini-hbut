/**
 * Developer Portal 会话层测试（issue #624：HttpOnly + 加密 session、过期、篡改失败、
 * CSRF 双提交、Origin 校验；dogfood 会话与 logout cookie 语义）。
 */
import { describe, expect, it } from 'vitest'
import {
  buildCsrfCookie,
  buildSessionCookie,
  clearSessionCookies,
  CSRF_COOKIE_NAME,
  decryptSession,
  encryptSession,
  isSessionValid,
  parseSessionFromCookies,
  readCookie,
  SESSION_COOKIE_NAME,
  serializeCookie,
  sessionTtlSeconds,
} from '../lib/auth-session/index'
import { CSRF_HEADER, newCsrfToken, originAllowed, verifyCsrf } from '../lib/developer/csrf'
import type { DeveloperSessionPayload } from '../lib/developer/contract'

const TEST_SECRET = 'test-session-secret-0123456789abcdef' // ≥32 字节

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { WEB_SESSION_SECRET: TEST_SECRET, NODE_ENV: 'development', ...overrides }
}

function payload(overrides: Partial<DeveloperSessionPayload> = {}): DeveloperSessionPayload {
  const now = Math.floor(Date.now() / 1000)
  return { sub: 'sub_a', display_name: '开发者 A', csrf: 'csrf-value', iat: now, exp: now + 3600, ...overrides }
}

describe('会话加密/解密', () => {
  it('加密后不含明文载荷；解密还原', () => {
    const token = encryptSession(payload(), env())
    expect(token).not.toContain('sub_a')
    expect(token).not.toContain('csrf-value')
    const { payload: p, expired } = decryptSession(token, env())
    expect(expired).toBe(false)
    expect(p!.sub).toBe('sub_a')
    expect(p!.csrf).toBe('csrf-value')
  })

  it('密钥缺失/过短：fail closed（抛错，绝不静默降级）', () => {
    expect(() => encryptSession(payload(), {})).toThrow()
    expect(() => encryptSession(payload(), { WEB_SESSION_SECRET: 'short' })).toThrow()
  })

  it('篡改/错误密钥/垃圾输入：解密为 null', () => {
    const token = encryptSession(payload(), env())
    // base64url 追加字符可能被解码器丢弃（尾部 padding），必须翻转中间字节保证密文变化
    const raw = Buffer.from(token, 'base64url')
    raw[raw.length - 6] = (raw[raw.length - 6]! ^ 0xff) & 0xff
    const tampered = raw.toString('base64url')
    expect(decryptSession(tampered, env()).payload).toBeNull()
    expect(decryptSession(token, env({ WEB_SESSION_SECRET: 'another-secret-key-9876543210abcdef' })).payload).toBeNull() // secretguard: allow-test-fixture
    expect(decryptSession('garbage', env()).payload).toBeNull()
    expect(decryptSession('', env()).payload).toBeNull()
  })

  it('过期：payload 存在但 expired=true；parseSessionFromCookies 返回 null', () => {
    const expiredPayload = payload({ iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 100 })
    const token = encryptSession(expiredPayload, env())
    const { payload: p, expired } = decryptSession(token, env())
    expect(p!.sub).toBe('sub_a')
    expect(expired).toBe(true)
    expect(parseSessionFromCookies(`mh_dev_session=${token}`, env())).toBeNull()
  })

  it('未来时间戳（时钟异常/伪造）视为无效', () => {
    const future = payload({ iat: Math.floor(Date.now() / 1000) + 600 })
    const token = encryptSession(future, env())
    const { payload: p } = decryptSession(token, env())
    expect(isSessionValid(p, env())).toBe(false)
  })

  it('SESSION_TTL_SECONDS 可配置', () => {
    expect(sessionTtlSeconds(env({ SESSION_TTL_SECONDS: '600' }))).toBe(600)
    expect(sessionTtlSeconds(env({ SESSION_TTL_SECONDS: 'abc' }))).toBe(86400)
  })
})

describe('Cookie 序列化', () => {
  it('会话 cookie：HttpOnly + SameSite=Lax + Path=/；开发环境不带 Secure', () => {
    const cookie = buildSessionCookie('tok', env())
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Secure')
    expect(buildSessionCookie('tok', env({ NODE_ENV: 'production' }))).toContain('Secure')
  })

  it('CSRF cookie 非 HttpOnly（前端可读回传），登出清除两个 cookie', () => {
    expect(buildCsrfCookie('csrf', env())).not.toContain('HttpOnly')
    const cleared = clearSessionCookies(env())
    expect(cleared.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true)
    expect(cleared.some((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))).toBe(true)
    expect(cleared.every((c) => c.includes('Max-Age=0'))).toBe(true)
  })

  it('readCookie 精确匹配，忽略大小写与空白', () => {
    const header = 'a=1; mh_dev_session=abc; mh_dev_csrf=xyz'
    expect(readCookie(header, 'mh_dev_session')).toBe('abc')
    expect(readCookie(header, 'mh_dev_csrf')).toBe('xyz')
    expect(readCookie(header, 'missing')).toBeNull()
    expect(readCookie('', 'mh_dev_session')).toBeNull()
  })
})

describe('CSRF 双提交校验', () => {
  it('header/cookie/会话三者一致才通过', () => {
    const csrf = newCsrfToken()
    expect(verifyCsrf(csrf, csrf, csrf)).toBe(true)
    expect(verifyCsrf(csrf, 'other', csrf)).toBe(false)
    expect(verifyCsrf(csrf, csrf, 'other')).toBe(false)
    expect(verifyCsrf(null, csrf, csrf)).toBe(false)
    expect(verifyCsrf(csrf, null, csrf)).toBe(false)
  })

  it('CSRF_HEADER 名称为 x-csrf-token（前端约定）', () => {
    expect(CSRF_HEADER).toBe('x-csrf-token')
  })
})

describe('Origin 校验', () => {
  const allowed = ['https://developer.xn--vhq74jc2fzpchter27a.com']

  it('无 Origin（curl/同源导航）放行；命中白名单放行', () => {
    expect(originAllowed(null, allowed, false)).toBe(true)
    expect(originAllowed('https://developer.xn--vhq74jc2fzpchter27a.com', allowed, false)).toBe(true)
  })

  it('跨源拒绝（生产不因 localhost 放行）', () => {
    expect(originAllowed('https://evil.example.com', allowed, false)).toBe(false)
    expect(originAllowed('http://localhost:3000', allowed, false)).toBe(false)
  })

  it('开发环境放行 localhost origin', () => {
    expect(originAllowed('http://localhost:3000', allowed, true)).toBe(true)
    expect(originAllowed('http://127.0.0.1:3000', allowed, true)).toBe(true)
    expect(originAllowed('http://evil.example.com', allowed, true)).toBe(false)
  })
})

describe('会话 cookie 传输安全（dogfood 登录态）', () => {
  it('序列化包含 HttpOnly/SameSite/Lax/Secure（生产）', () => {
    const c = serializeCookie('mh_oidc_state', 'v', {
      secure: true,
      maxAgeSeconds: 600,
      httpOnly: true,
      sameSite: 'Lax',
    })
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Secure')
    expect(c).toContain('Max-Age=600')
  })
})
