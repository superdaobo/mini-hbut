// src/features/identity/qr/parseIdentityQr.spec.ts
//
// #627 QR payload 测试（issue 清单前 5 项 + https fallback 专项）：
//   1. valid identity（source=qr）；
//   2. existing deep link parser compatibility（无 source 的同设备深链同样可扫，
//      结果与 #621 parseMiniHbutDeepLink 完全一致 —— 共用同一 AuthRequest）；
//   3. wrong scheme/host；
//   4. missing/oversized handoff；
//   5. payload 不含 PII/token/code；
//   6. Web QR 由客户端生成（见 identity-platform/web/tests/auth-qr.test.ts）。
// 附：https fallback（secret 只在 fragment，query 出现凭据一律拒绝）。

import { describe, expect, it } from 'vitest'
import { parseMiniHbutDeepLink } from '../../../platform/deep_link'
import {
  buildIdentityQrPayload,
  IDENTITY_QR_INVALID_MESSAGE,
  parseIdentityQr
} from './parseIdentityQr'

const HANDOFF = 'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9' // 32 位 URL-safe
const REQUEST_ID = 'ar_0123456789abcdef'

const expectInvalid = (raw: string): void => {
  const result = parseIdentityQr(raw)
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.code).toBe('invalid_code')
  // 通用安全文案：绝不回显原始输入（URL/request_id/handoff）
  expect(result.error.message).toBe(IDENTITY_QR_INVALID_MESSAGE)
  expect(result.error.message).not.toContain('minihbut')
  expect(result.error.message).not.toContain('https')
}

// ─── 1. valid identity ───────────────────────────────────────────────────────

describe('parseIdentityQr: valid payload', () => {
  it('标准 QR payload（含 source=qr）解析成功', () => {
    const raw = buildIdentityQrPayload(REQUEST_ID, HANDOFF)
    expect(raw).toBe(
      `minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}&source=qr`
    )
    const result = parseIdentityQr(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'identity', requestId: REQUEST_ID, handoff: HANDOFF })
  })

  it('参数顺序无关（URLSearchParams 语义）', () => {
    const result = parseIdentityQr(
      `minihbut://identity?handoff=${HANDOFF}&source=qr&request_id=${REQUEST_ID}`
    )
    expect(result.ok).toBe(true)
  })
})

// ─── 2. existing deep link parser compatibility ──────────────────────────────

describe('parseIdentityQr: 与 #621 深链 parser 兼容（共用同一 AuthRequest）', () => {
  it('无 source 的「打开 App」深链同样可扫，解析结果与 parseMiniHbutDeepLink 一致', () => {
    const deepLink = `minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}`
    const viaDeepLink = parseMiniHbutDeepLink(deepLink)
    const viaQr = parseIdentityQr(deepLink)
    expect(viaDeepLink.ok).toBe(true)
    expect(viaQr.ok).toBe(true)
    if (!viaDeepLink.ok || !viaQr.ok) return
    expect(viaQr.link).toEqual(viaDeepLink.link)
    // 同一 request_id/handoff：扫码与「打开 App」进入 App 后是同一个 AuthRequest
    if (viaDeepLink.link.kind !== 'identity') return
    expect(viaQr.link.requestId).toBe(viaDeepLink.link.requestId)
    expect(viaQr.link.handoff).toBe(viaDeepLink.link.handoff)
  })

  it('source 出现但非 qr：拒绝（防伪装/混淆）', () => {
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}&source=evil`)
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}&handoff=${HANDOFF}&source=widget`)
  })

  it('identity 以外的 minihbut 链接（schedule/exam）不是登录二维码', () => {
    expectInvalid('minihbut://schedule?date=2026-08-13&source=widget')
    expectInvalid('minihbut://electricity')
  })
})

// ─── 3. wrong scheme/host ────────────────────────────────────────────────────

describe('parseIdentityQr: wrong scheme / host', () => {
  it('其他 scheme 一律拒绝', () => {
    expectInvalid('https://evil.example.com/scan?request_id=ar_abc&handoff=xyz')
    expectInvalid('javascript:alert(1)')
    expectInvalid('data:text/plain,hello')
    expectInvalid('file:///tmp/qr.png')
  })

  it('minihbut 其他 host（非 identity）拒绝', () => {
    expectInvalid(`minihbut://evil?request_id=${REQUEST_ID}&handoff=${HANDOFF}`)
    expectInvalid('minihbut://')
  })

  it('userinfo 注入拒绝（#621 合同）', () => {
    expectInvalid(`minihbut://identity@evil/?request_id=${REQUEST_ID}&handoff=${HANDOFF}`)
  })

  it('空/非字符串拒绝', () => {
    expectInvalid('')
    expectInvalid('   ')
  })

  it('超长输入拒绝（防解析放大）', () => {
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}&handoff=${'a'.repeat(3000)}`)
  })
})

// ─── 4. missing / oversized handoff ──────────────────────────────────────────

describe('parseIdentityQr: missing / oversized handoff 与 request_id', () => {
  it('缺少 handoff / 缺少 request_id 拒绝', () => {
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}`)
    expectInvalid(`minihbut://identity?handoff=${HANDOFF}`)
    expectInvalid('minihbut://identity')
  })

  it('handoff 过短（<32）拒绝', () => {
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}&handoff=${'a'.repeat(31)}`)
  })

  it('handoff 超长（>128）拒绝', () => {
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}&handoff=${'a'.repeat(129)}`)
  })

  it('handoff 非法字符（+ 号/空白）拒绝', () => {
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}&handoff=${'a'.repeat(20)}+${'b'.repeat(15)}`)
    expectInvalid(`minihbut://identity?request_id=${REQUEST_ID}&handoff=${'a'.repeat(16)} ${'a'.repeat(16)}`)
  })

  it('request_id 格式非法（非 ar_ 前缀）拒绝', () => {
    expectInvalid(`minihbut://identity?request_id=req_not_ar&handoff=${HANDOFF}`)
    expectInvalid(`minihbut://identity?request_id=ar_&handoff=${HANDOFF}`)
  })
})

// ─── 5. payload 不含 PII / token / code ─────────────────────────────────────

describe('parseIdentityQr: payload 不含 PII / OAuth 材料', () => {
  it('生成的 payload 只含 request_id / handoff / source', () => {
    const payload = buildIdentityQrPayload(REQUEST_ID, HANDOFF)
    expect(payload.startsWith('minihbut://identity?')).toBe(true)
    const url = new URL(payload)
    expect(url.searchParams.get('request_id')).toBe(REQUEST_ID)
    expect(url.searchParams.get('handoff')).toBe(HANDOFF)
    expect(url.searchParams.get('source')).toBe('qr')
    for (const forbidden of ['student', 'scope', 'code', 'token', 'course.example.com', '课程助手', 'name=']) {
      expect(payload.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('解析结果只暴露 requestId/handoff，不携带任何展示资料字段', () => {
    const result = parseIdentityQr(buildIdentityQrPayload(REQUEST_ID, HANDOFF))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.link).sort()).toEqual(['handoff', 'kind', 'requestId'])
  })
})

// ─── https fallback（secret 只在 fragment） ──────────────────────────────────

describe('parseIdentityQr: https fallback（系统相机对 custom scheme 兼容差时）', () => {
  it('接力页形态 https://<host>/r/<request_id>#h=<secret> 解析成功', () => {
    const raw = `https://auth.example.com/r/${REQUEST_ID}#h=${HANDOFF}`
    const result = parseIdentityQr(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'identity', requestId: REQUEST_ID, handoff: HANDOFF })
  })

  it('/handoff/ 预留路径同样支持', () => {
    const raw = `https://auth.example.com/handoff/${REQUEST_ID}#h=${HANDOFF}`
    const result = parseIdentityQr(raw)
    expect(result.ok).toBe(true)
  })

  it('secret 出现在 query 一律拒绝（fail closed，防降级攻击）', () => {
    expectInvalid(`https://auth.example.com/r/${REQUEST_ID}?h=${HANDOFF}`)
    expectInvalid(`https://auth.example.com/r/${REQUEST_ID}?handoff=${HANDOFF}`)
    expectInvalid(`https://auth.example.com/r/${REQUEST_ID}?request_id=${REQUEST_ID}&h=${HANDOFF}`)
  })

  it('fragment 缺失 / secret 格式非法拒绝', () => {
    expectInvalid(`https://auth.example.com/r/${REQUEST_ID}`)
    expectInvalid(`https://auth.example.com/r/${REQUEST_ID}#h=short`)
    expectInvalid(`https://auth.example.com/r/${REQUEST_ID}#x=${HANDOFF}`)
  })

  it('path 中 request_id 非法 / 路径不存在拒绝', () => {
    expectInvalid(`https://auth.example.com/evil/${REQUEST_ID}#h=${HANDOFF}`)
    expectInvalid(`https://auth.example.com/r/not_ar_id#h=${HANDOFF}`)
    expectInvalid(`https://auth.example.com/r/${REQUEST_ID}/extra#h=${HANDOFF}`)
  })
})
