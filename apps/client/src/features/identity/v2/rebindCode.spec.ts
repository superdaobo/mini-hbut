/**
 * rebindCode.spec.ts —— §2 换机码编解码（规格冻结格式；互操作向量为自算固定值）。
 * 覆盖：编解码往返一致；固定向量（逐字符断言）；非法输入 6 类（前缀错/空/超长/base32 乱码/
 * 字段缺失/已过期）→ code_invalid；base32 大小写与去填充自洽；字段形状（r/d/k/e）。
 *
 * 独立 cross-check：本 spec 内置一份独立的 RFC4648 base32 实现，用于构造
 * 畸形载荷向量（与本模块实现互相验证，不共享代码）。
 */
import { describe, expect, it } from 'vitest'
import {
  REBIND_CODE_MAX_LEN,
  REBIND_CODE_MIN_LEN,
  REBIND_CODE_PREFIX,
  encodeRebindCode,
  parseRebindCode
} from './rebindCode'

// ── 独立 base32（RFC4648，无填充）：仅供本 spec 构造测试向量 ─────────────────
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const b32EncodeBytes = (bytes: number[]): string => {
  let value = 0
  let bits = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += A[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31]
  return out
}
const b32Encode = (text: string): string => b32EncodeBytes(Array.from(new TextEncoder().encode(text)))
const codeOf = (jsonText: string): string => `HBRB1:${b32Encode(jsonText)}`

// ── 测试材料 ─────────────────────────────────────────────────────────────────
const R = '0123456789abcdef0123456789abcdef' // 32 位小写 hex
const K = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' // 64 位小写 hex
const D = 'device-2026-11-10' // 合法设备 id 形状
const NOW = 1794076800 // 注入的 now（unix 秒）
const FUTURE = 1794163200 // 过期时间（> NOW）
const FIXED_VECTOR_CODE =
  'HBRB1:PMRHEIR2EIYDCMRTGQ2TMNZYHFQWEY3EMVTDAMJSGM2DKNRXHA4WCYTDMRSWMIRMEJSCEORCMRSXM2LDMUWTEMBSGYWTCMJNGEYCELBCNMRDUIRQGEZDGNBVGY3TQOLBMJRWIZLGGAYTEMZUGU3DOOBZMFRGGZDFMYYDCMRTGQ2TMNZYHFQWEY3EMVTDAMJSGM2DKNRXHA4WCYTDMRSWMIRMEJSSEORRG44TIMJWGMZDAMD5'

const expectInvalid = (value: { ok: boolean; kind?: string }): void => {
  expect(value.ok).toBe(false)
  if (!value.ok) expect(value.kind).toBe('code_invalid')
}

describe('编解码往返一致', () => {
  it('合法载荷 → 编码 → 解码，字段逐一相等', () => {
    const encoded = encodeRebindCode({ r: R, d: D, k: K, e: FUTURE }, NOW)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    expect(encoded.code.startsWith(REBIND_CODE_PREFIX)).toBe(true)
    // 编码输出恒为大写 base32、无填充
    expect(encoded.code.slice(REBIND_CODE_PREFIX.length)).toMatch(/^[A-Z2-7]+$/)
    const parsed = parseRebindCode(encoded.code, NOW)
    expect(parsed).toEqual({
      ok: true,
      requestId: R,
      newDeviceId: D,
      pubkeySha256: K,
      expiresAt: FUTURE
    })
  })

  it('另一个合法载荷（不同长度 d）往返一致', () => {
    const d2 = 'abc.def:1234567890'
    const encoded = encodeRebindCode({ r: 'f'.repeat(32), d: d2, k: 'ab'.repeat(32), e: FUTURE }, NOW)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const parsed = parseRebindCode(encoded.code, NOW)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.requestId).toBe('f'.repeat(32))
      expect(parsed.newDeviceId).toBe(d2)
      expect(parsed.pubkeySha256).toBe('ab'.repeat(32))
      expect(parsed.expiresAt).toBe(FUTURE)
    }
  })
})

describe('固定格式向量（自算，断言逐字符稳定）', () => {
  it('固定载荷 → 固定码（与独立 base32 实现交叉验证）', () => {
    const payload = { r: R, d: D, k: K, e: FUTURE }
    const expectedBody = b32Encode(JSON.stringify({ r: R, d: D, k: K, e: FUTURE }))
    expect(`${REBIND_CODE_PREFIX}${expectedBody}`).toBe(FIXED_VECTOR_CODE)
    const encoded = encodeRebindCode(payload, NOW)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    expect(encoded.code).toBe(FIXED_VECTOR_CODE)
    // 载荷 <256 字节
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(256)
    // 码长落在 [24,512]
    expect(encoded.code.length).toBeGreaterThanOrEqual(REBIND_CODE_MIN_LEN)
    expect(encoded.code.length).toBeLessThanOrEqual(REBIND_CODE_MAX_LEN)
    // 固定向量可被本模块解析
    expect(parseRebindCode(FIXED_VECTOR_CODE, NOW)).toMatchObject({ ok: true, requestId: R, expiresAt: FUTURE })
  })
})

describe('base32 大小写与去填充自洽', () => {
  const code = FIXED_VECTOR_CODE
  it('全小写码（手工输入小写）可解析且结果一致', () => {
    expect(parseRebindCode(code.toLowerCase(), NOW)).toEqual(parseRebindCode(code, NOW))
  })
  it('容忍尾部 = 填充（去填充后自洽）', () => {
    const parsed = parseRebindCode(`${code}====`, NOW)
    expect(parsed.ok).toBe(true)
  })
  it('追加值 0 的字符（规范零填充位）仍解析成功', () => {
    // 固定向量 body 长度 240：240*5 = 1200 位，恰为整字节；追加 'A'(0) 后剩余 5 位全 0 → 规范
    const parsed = parseRebindCode(`${code}A`, NOW)
    expect(parsed.ok).toBe(true)
  })
  it('追加非零剩余位（非规范编码）→ code_invalid', () => {
    expectInvalid(parseRebindCode(`${code}2`, NOW))
  })
})

describe('非法输入 6 类 → 一律 code_invalid（固定文案，不透传原文）', () => {
  it('① 前缀错', () => {
    expectInvalid(parseRebindCode(`HBRA1:${FIXED_VECTOR_CODE.slice(REBIND_CODE_PREFIX.length)}`, NOW))
    expectInvalid(parseRebindCode(`XBRB1:${FIXED_VECTOR_CODE.slice(REBIND_CODE_PREFIX.length)}`, NOW))
  })
  it('② 空 / 非字符串', () => {
    expectInvalid(parseRebindCode('', NOW))
    expectInvalid(parseRebindCode('   ', NOW))
    expectInvalid(parseRebindCode(undefined, NOW))
    expectInvalid(parseRebindCode(12345, NOW))
    expectInvalid(parseRebindCode(null, NOW))
  })
  it('③ 超长（>512）', () => {
    expectInvalid(parseRebindCode(`HBRB1:${'A'.repeat(520)}`, NOW))
  })
  it('③ 过短（<24）', () => {
    expectInvalid(parseRebindCode('HBRB1:AAAA', NOW))
  })
  it('④ base32 乱码（非法字符）', () => {
    // 长度合法但含字母表外字符
    expectInvalid(parseRebindCode(`HBRB1:!!!${'A'.repeat(40)}`, NOW))
    expectInvalid(parseRebindCode(`HBRB1:${'0'.repeat(10)}${'A'.repeat(30)}`, NOW))
  })
  it('⑤ 字段缺失 / 多余 / JSON 损坏 / 非 UTF-8', () => {
    // 缺 e
    expectInvalid(parseRebindCode(codeOf(JSON.stringify({ r: R, d: D, k: K })), NOW))
    // 缺 r
    expectInvalid(parseRebindCode(codeOf(JSON.stringify({ d: D, k: K, e: FUTURE })), NOW))
    // 多余字段
    expectInvalid(parseRebindCode(codeOf(JSON.stringify({ r: R, d: D, k: K, e: FUTURE, x: 1 })), NOW))
    // JSON 损坏
    expectInvalid(parseRebindCode(codeOf('{"r":'), NOW))
    // 非对象
    expectInvalid(parseRebindCode(codeOf('123'), NOW))
    // 非 UTF-8（致命解码失败）
    expectInvalid(parseRebindCode(`HBRB1:${b32EncodeBytes([0xff, 0xfe, 0xff])}`, NOW))
  })
  it('⑥ 已过期（e 相对注入 now 为过去）', () => {
    const expiredCode = FIXED_VECTOR_CODE
    expectInvalid(parseRebindCode(expiredCode, FUTURE + 1))
    // 编码侧同样拒绝已过期载荷
    expectInvalid(encodeRebindCode({ r: R, d: D, k: K, e: NOW - 10 }, NOW))
  })
})

describe('字段形状（r / d / k / e）', () => {
  const shapeOf = (r: string, d: string, k: string, e: number): string => codeOf(JSON.stringify({ r, d, k, e }))
  it('r 必须 32 位小写 hex', () => {
    expectInvalid(parseRebindCode(shapeOf(R.toUpperCase(), D, K, FUTURE), NOW))
    expectInvalid(parseRebindCode(shapeOf(R.slice(0, 31), D, K, FUTURE), NOW))
  })
  it('d 必须设备 id 形状（8–128，[A-Za-z0-9._:-]）', () => {
    expectInvalid(parseRebindCode(shapeOf(R, 'short7!', K, FUTURE), NOW)) // 7 位 + 非法字符
    expectInvalid(parseRebindCode(shapeOf(R, 'has space', K, FUTURE), NOW))
  })
  it('k 必须 64 位小写 hex', () => {
    expectInvalid(parseRebindCode(shapeOf(R, D, K.toUpperCase(), FUTURE), NOW))
    expectInvalid(parseRebindCode(shapeOf(R, D, K.slice(0, 63), FUTURE), NOW))
  })
  it('e 必须为数字（unix 秒）', () => {
    expectInvalid(parseRebindCode(codeOf(JSON.stringify({ r: R, d: D, k: K, e: '1794163200' })), NOW))
  })
})

describe('encodeRebindCode 的防御', () => {
  it('载荷缺字段 → code_invalid（绝不产出损坏码）', () => {
    expectInvalid(encodeRebindCode({ r: R, d: D, k: K } as never, NOW))
  })
  it('e 非未来时间 → code_invalid', () => {
    expectInvalid(encodeRebindCode({ r: R, d: D, k: K, e: NOW }, NOW))
  })
  it('成功时返回 HBRB1: 开头的大写无填充码', () => {
    const encoded = encodeRebindCode({ r: R, d: D, k: K, e: FUTURE }, NOW)
    expect(encoded.ok).toBe(true)
    if (encoded.ok) expect(encoded.code).toMatch(/^HBRB1:[A-Z2-7]+$/)
  })
})
