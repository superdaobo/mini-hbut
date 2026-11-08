// #1171 T13：identityIssuers 单元测试（多 issuer 兼容 / 归一化 / 未知 issuer 显式拒绝）
//
// 覆盖：
//   - normalizeIssuerValue：canonical 保持不变 / Unicode→Punycode / 尾斜杠去除 / 端口保留 /
//     http 非 loopback 拒绝 / DEV loopback 放行 / userinfo/query/hash 拒绝 / 非法输入 null；
//   - 已接受 issuer 列表：默认 = Production canonical / 编程式覆盖 / 显式空集 fail closed /
//     DEV localStorage 覆盖（Production 不读，见 identitySecurityContract 源码断言）；
//   - verifyIdentityTokenIssuer：合法 issuer 通过 / 未知 issuer 显式拒绝（可读错误）/
//     缺 iss 拒绝 / 无法解码拒绝（绝不降级为不校验）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IDENTITY_ACCEPTED_ISSUERS_KEY,
  PRODUCTION_CANONICAL_ISSUER,
  decodeJwtPayload,
  getAcceptedIdentityIssuers,
  isAcceptedIdentityIssuer,
  normalizeIssuerValue,
  setAcceptedIdentityIssuers,
  verifyIdentityTokenIssuer
} from './identityIssuers'

/** 构造三段式假 JWT（payload 可指定 claims）；签名段只是占位（本地校验不验签） */
const makeJwt = (claims: Record<string, unknown>): string => {
  const b64url = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64url({ alg: 'RS256', typ: 'at+jwt', kid: 'test' })}.${b64url(claims)}.${'s'.repeat(64)}`
}

afterEach(() => {
  setAcceptedIdentityIssuers(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('normalizeIssuerValue', () => {
  it('canonical ASCII issuer 原样保留（去尾斜杠）', () => {
    expect(normalizeIssuerValue(PRODUCTION_CANONICAL_ISSUER)).toBe(PRODUCTION_CANONICAL_ISSUER)
    expect(normalizeIssuerValue(`${PRODUCTION_CANONICAL_ISSUER}/`)).toBe(PRODUCTION_CANONICAL_ISSUER)
  })

  it('Unicode issuer 归一化为 Punycode（与 canonical 等价，防混用）', () => {
    expect(normalizeIssuerValue('https://id.湖北工业大学.com')).toBe(PRODUCTION_CANONICAL_ISSUER)
  })

  it('保留端口与路径成分', () => {
    expect(normalizeIssuerValue('https://id.xn--vhq74jc2fzpchter27a.com:8443')).toBe(
      'https://id.xn--vhq74jc2fzpchter27a.com:8443'
    )
    expect(normalizeIssuerValue('https://id.xn--vhq74jc2fzpchter27a.com/identity')).toBe(
      'https://id.xn--vhq74jc2fzpchter27a.com/identity'
    )
  })

  it('http 仅 DEV + loopback 允许（本地联调）；公网 http 拒绝', () => {
    // vitest 环境 import.meta.env.DEV === true
    expect(normalizeIssuerValue('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(normalizeIssuerValue('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(normalizeIssuerValue('http://public.example.com')).toBeNull()
  })

  it('userinfo / query / fragment / 非法输入一律拒绝（fail closed）', () => {
    for (const bad of [
      'https://user:pass@id.xn--vhq74jc2fzpchter27a.com',
      'https://id.xn--vhq74jc2fzpchter27a.com?x=1',
      'https://id.xn--vhq74jc2fzpchter27a.com#frag',
      'not a url',
      '',
      '   ',
      null,
      42
    ]) {
      expect(normalizeIssuerValue(bad)).toBeNull()
    }
  })
})

describe('已接受 issuer 列表', () => {
  it('默认为 Production canonical（不再写死单一值，列表可扩展）', () => {
    expect(getAcceptedIdentityIssuers()).toEqual([PRODUCTION_CANONICAL_ISSUER])
  })

  it('编程式覆盖：替换默认、归一化 + 去重、null 恢复默认', () => {
    const legacy = 'https://legacy-id.example.org'
    setAcceptedIdentityIssuers([legacy, `${legacy}/`, 'garbage-not-a-url', legacy])
    expect(getAcceptedIdentityIssuers()).toEqual([legacy])
    setAcceptedIdentityIssuers(null)
    expect(getAcceptedIdentityIssuers()).toEqual([PRODUCTION_CANONICAL_ISSUER])
  })

  it('显式空覆盖 = 接受集合为空：所有 issuer 都被拒绝（fail closed，而非恢复默认）', () => {
    setAcceptedIdentityIssuers([])
    expect(getAcceptedIdentityIssuers()).toEqual([])
    expect(verifyIdentityTokenIssuer(makeJwt({ iss: PRODUCTION_CANONICAL_ISSUER }))).toEqual({
      ok: false,
      reason: 'unknown_issuer',
      message: `未知的身份签发者：${PRODUCTION_CANONICAL_ISSUER}（不在已接受 issuer 列表，已拒绝）`
    })
  })

  it('DEV 本地覆盖（localStorage JSON 数组）并入默认；非法 JSON 忽略', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key)
    })
    const devIssuer = 'http://127.0.0.1:8080'
    storage.set(IDENTITY_ACCEPTED_ISSUERS_KEY, JSON.stringify([devIssuer]))
    expect(getAcceptedIdentityIssuers()).toContain(PRODUCTION_CANONICAL_ISSUER)
    expect(getAcceptedIdentityIssuers()).toContain(devIssuer)
    // 非法 JSON：忽略覆盖，不抛错
    storage.set(IDENTITY_ACCEPTED_ISSUERS_KEY, '{not-json')
    expect(getAcceptedIdentityIssuers()).toEqual([PRODUCTION_CANONICAL_ISSUER])
  })
})

describe('isAcceptedIdentityIssuer', () => {
  it('canonical 接受；Unicode 形式归一化后接受；未知/垃圾拒绝', () => {
    expect(isAcceptedIdentityIssuer(PRODUCTION_CANONICAL_ISSUER)).toBe(true)
    expect(isAcceptedIdentityIssuer('https://id.湖北工业大学.com')).toBe(true)
    expect(isAcceptedIdentityIssuer('https://evil.example.com')).toBe(false)
    expect(isAcceptedIdentityIssuer('garbage')).toBe(false)
    expect(isAcceptedIdentityIssuer(null)).toBe(false)
  })
})

describe('verifyIdentityTokenIssuer', () => {
  it('已接受 issuer（含 Unicode 形式）→ ok + 归一化 issuer', () => {
    const result = verifyIdentityTokenIssuer(makeJwt({ iss: PRODUCTION_CANONICAL_ISSUER }))
    expect(result).toEqual({ ok: true, issuer: PRODUCTION_CANONICAL_ISSUER })
    const unicode = verifyIdentityTokenIssuer(makeJwt({ iss: 'https://id.湖北工业大学.com' }))
    expect(unicode).toEqual({ ok: true, issuer: PRODUCTION_CANONICAL_ISSUER })
  })

  it('未知 issuer → 显式拒绝：可读错误 + 含实际 issuer 值 + 不含完整令牌', () => {
    const evil = 'https://evil.example.com'
    const token = makeJwt({ iss: evil })
    const result = verifyIdentityTokenIssuer(token)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unknown_issuer')
      expect(result.message).toContain(evil)
      expect(result.message).toContain('拒绝')
      // 诊断文案不得包含完整令牌
      expect(result.message).not.toContain(token)
    }
  })

  it('缺少 iss claim → 拒绝（不得当作无 issuer 放行）', () => {
    const result = verifyIdentityTokenIssuer(makeJwt({ sub: 'x' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('missing_iss')
      expect(result.message).toContain('拒绝')
    }
  })

  it('无法解码的令牌 → 拒绝（fail closed，绝不降级为不校验）', () => {
    for (const bad of ['', 'not-a-jwt', 'a.b', 'a.b.c.d', 'x.y.z']) {
      const result = verifyIdentityTokenIssuer(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('undecodable')
    }
  })

  it('decodeJwtPayload：非法输入返回 null，绝不抛错', () => {
    expect(decodeJwtPayload(makeJwt({ hbut_student_id: '2023010101' }))).toMatchObject({
      hbut_student_id: '2023010101'
    })
    for (const bad of ['', 'a.b.c', '!!!.@@@.###']) {
      expect(decodeJwtPayload(bad)).toBeNull()
    }
  })
})
