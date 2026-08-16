/**
 * #627 Web 侧 QR 测试：
 *  - payload 构造：与 App 侧 parseIdentityQr 对齐（source=qr、不含 PII/OAuth 材料）；
 *  - https fallback：secret 只在 fragment，绝不放 query；
 *  - QR 生命周期：终态立即隐藏、无详情不显示、本地倒计时结束判定过期；
 *  - 客户端生成：QR 由本地 qrcode 库渲染，源码不含外部 QR 服务/日志输出
 *    （issue「QR payload」第 6 项：Web QR 由客户端生成，不走外部 service）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import {
  buildIdentityQrPayload,
  buildQrFallbackUrl,
  IDENTITY_QR_HASH_KEY,
  IDENTITY_QR_SOURCE,
  isIdentityQrExpired,
  shouldRenderIdentityQr,
} from '../lib/auth/qr'

const REQUEST_ID = 'ar_test_0001'
const HANDOFF = 'handoff-abcdefghijklmnopqrstuvwxyz-0123456789'

describe('buildIdentityQrPayload：QR 内容规则', () => {
  it('payload 与 App 侧解析器对齐（minihbut://identity + source=qr）', () => {
    const payload = buildIdentityQrPayload(REQUEST_ID, HANDOFF)
    expect(payload.startsWith('minihbut://identity?')).toBe(true)
    const url = new URL(payload)
    expect(url.searchParams.get('request_id')).toBe(REQUEST_ID)
    expect(url.searchParams.get('handoff')).toBe(HANDOFF)
    expect(url.searchParams.get('source')).toBe(IDENTITY_QR_SOURCE)
  })

  it('payload 不含 PII / 应用展示数据 / OAuth token/code', () => {
    const payload = buildIdentityQrPayload(REQUEST_ID, HANDOFF)
    for (const forbidden of [
      'student',
      'scope',
      'code',
      'token',
      'course.example.com',
      '课程助手',
      '2023000001',
    ]) {
      expect(payload.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    // 与「打开 App」按钮共用同一 AuthRequest：request_id 与 handoff 完全一致
    expect(payload).toContain(`request_id=${REQUEST_ID}`)
    expect(payload).toContain(`handoff=${HANDOFF}`)
  })
})

describe('buildQrFallbackUrl：secret 只在 fragment', () => {
  it('生成 https fallback 链接：secret 只在 #h=，query 无任何凭据', () => {
    const url = buildQrFallbackUrl('https://auth.example.com/', REQUEST_ID, HANDOFF)
    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://auth.example.com')
    expect(parsed.pathname).toBe(`/r/${REQUEST_ID}`)
    expect(parsed.search).toBe('')
    expect(parsed.searchParams.get('h')).toBeNull()
    expect(parsed.searchParams.get('handoff')).toBeNull()
    // fragment 中的 secret（fragment 不进入服务器日志/HTTP 请求）
    const fragmentParams = new URLSearchParams(parsed.hash.slice(1))
    expect(fragmentParams.get(IDENTITY_QR_HASH_KEY)).toBe(HANDOFF)
  })

  it('origin 尾部斜杠归一化', () => {
    expect(buildQrFallbackUrl('https://auth.example.com', REQUEST_ID, HANDOFF)).toBe(
      `https://auth.example.com/r/${REQUEST_ID}#h=${HANDOFF}`,
    )
  })
})

describe('shouldRenderIdentityQr：QR 生命周期', () => {
  it('等待阶段（WAITING_APP/APP_OPENED）且详情已加载：显示 QR', () => {
    expect(shouldRenderIdentityQr('WAITING_APP', true)).toBe(true)
    expect(shouldRenderIdentityQr('APP_OPENED', true)).toBe(true)
  })

  it('详情未加载不显示（无 handoff/详情前没有可渲染内容）', () => {
    expect(shouldRenderIdentityQr('LOADING', false)).toBe(false)
    expect(shouldRenderIdentityQr('WAITING_APP', false)).toBe(false)
  })

  it('终态立即隐藏 QR（APPROVED/DENIED/EXPIRED/INVALID/CLIENT_UNAVAILABLE/REDIRECTING）', () => {
    for (const phase of [
      'APPROVED',
      'DENIED',
      'EXPIRED',
      'INVALID',
      'CLIENT_UNAVAILABLE',
      'REDIRECTING',
    ]) {
      expect(shouldRenderIdentityQr(phase as never, true)).toBe(false)
    }
  })

  it('网络错误但详情已加载：保留 QR（恢复后继续等待）', () => {
    expect(shouldRenderIdentityQr('NETWORK_ERROR', true)).toBe(true)
  })
})

describe('isIdentityQrExpired：本地倒计时', () => {
  it('countdown <= 0 视为过期（真正过期以 Core 为准）', () => {
    expect(isIdentityQrExpired(0)).toBe(true)
    expect(isIdentityQrExpired(-5)).toBe(true)
    expect(isIdentityQrExpired(1000)).toBe(false)
    expect(isIdentityQrExpired(Number.NaN)).toBe(true)
  })
})

describe('QR 客户端生成：不走外部服务、不输出日志', () => {
  const sourcePath = join(__dirname, '..', 'app', 'auth-site', '_components', 'identity-qr.tsx')
  const source = readFileSync(sourcePath, 'utf8')

  it('使用本地 qrcode 库（已锁定版本），无外部 QR 服务/图片 URL', () => {
    // 只允许从本地 qrcode 包导入；无任何 http(s) URL / 外部 API 调用
    expect(source).toContain("from 'qrcode'")
    expect(source).not.toMatch(/https?:\/\/[^"']+/)
    expect(source).not.toMatch(/fetch\s*\(/)
    expect(source).not.toMatch(/XMLHttpRequest/)
    expect(source).not.toMatch(/<img\s/)
    expect(source).not.toMatch(/dangerouslySetInnerHTML/)
  })

  it('QR 内容/canvas 数据不写入日志', () => {
    expect(source).not.toMatch(/console\.(log|debug|info)/)
    // payload 不作为日志/URL/query 参数输出（只在内存中传给本地渲染器）
    expect(source).not.toMatch(/JSON\.stringify\(payload/)
    expect(source).not.toMatch(/console\.\w+\([^)]*payload/)
    expect(source).not.toMatch(/location\.(href|search)[^;]*payload/)
  })

  it('本地 qrcode 库可在客户端生成（node 环境 SVG 渲染验证库可用）', async () => {
    const svg = await QRCode.toString(buildIdentityQrPayload(REQUEST_ID, HANDOFF), {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    })
    expect(svg.startsWith('<svg')).toBe(true)
    // 渲染产物不包含明文 payload（QR 编码后不可直接读出 secret）
    expect(svg).not.toContain(HANDOFF)
  })
})
