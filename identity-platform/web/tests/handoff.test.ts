/**
 * handoff / 深链 / 回调安全测试（#630 Security 验收项）：
 *  - handoff 解析只认 #h=<token> 且要求高熵格式；
 *  - 深链只含 request_id 与 handoff，不含 student id / scope / token / client 展示数据；
 *  - resume 回调只允许 http/https（值必须来自 Core 响应，绝不来自 URL 参数）。
 */
import { describe, expect, it } from 'vitest'
import {
  buildIdentityDeepLink,
  isValidRequestId,
  parseHandoffFromHash,
  resolveSafeRedirect,
} from '../lib/auth/handoff'
import { VALID_HANDOFF } from './fixtures'

describe('parseHandoffFromHash', () => {
  it('合法 hash 解析成功', () => {
    expect(parseHandoffFromHash(`#h=${VALID_HANDOFF}`)).toBe(VALID_HANDOFF)
    expect(parseHandoffFromHash(`#h=${VALID_HANDOFF}&extra=1`)).toBe(VALID_HANDOFF)
  })

  it('缺失/空值一律返回 null（只有 request id 不给凭据）', () => {
    expect(parseHandoffFromHash('')).toBeNull()
    expect(parseHandoffFromHash('#')).toBeNull()
    expect(parseHandoffFromHash('#h=')).toBeNull()
    expect(parseHandoffFromHash('#x=whatever')).toBeNull()
    expect(parseHandoffFromHash('no-hash-prefix')).toBeNull()
  })

  it('格式非法（长度/字符集）返回 null（fail closed）', () => {
    // 过短（<20）
    expect(parseHandoffFromHash(`#h=${'a'.repeat(19)}`)).toBeNull()
    // 恰好 20 位合法
    expect(parseHandoffFromHash(`#h=${'a'.repeat(20)}`)).toBe('a'.repeat(20))
    // 超过 128 位
    expect(parseHandoffFromHash(`#h=${'a'.repeat(129)}`)).toBeNull()
    // 非 URL-safe 字符（+ 号，URLSearchParams 解码后）
    expect(parseHandoffFromHash(`#h=${'a'.repeat(20)}+${'b'.repeat(10)}`)).toBeNull()
    // 空白字符
    expect(parseHandoffFromHash(`#h=${'a'.repeat(20)} `)).toBeNull()
  })
})

describe('buildIdentityDeepLink', () => {
  it('深链只携带 request_id 与 handoff', () => {
    const link = buildIdentityDeepLink('ar_test_0001', VALID_HANDOFF)
    expect(link.startsWith('minihbut://identity?')).toBe(true)
    const url = new URL(link)
    expect(url.searchParams.get('request_id')).toBe('ar_test_0001')
    expect(url.searchParams.get('handoff')).toBe(VALID_HANDOFF)
    // 不允许出现学生身份/scope/授权码/token/客户端展示数据
    for (const forbidden of ['student', 'scope', 'code', 'token', 'course.example.com', '课程助手']) {
      expect(link.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })
})

describe('resolveSafeRedirect', () => {
  it('http/https 通过（值来自 Core 响应）', () => {
    expect(resolveSafeRedirect('https://course.example.com/cb?code=1')).toBe('https://course.example.com/cb?code=1')
    expect(resolveSafeRedirect('http://localhost:3000/cb')).toBe('http://localhost:3000/cb')
  })

  it('非 http(s) 一律拒绝（javascript: / 空 / 非法）', () => {
    expect(resolveSafeRedirect('javascript:alert(1)')).toBeNull()
    expect(resolveSafeRedirect('data:text/html,<script>1</script>')).toBeNull()
    expect(resolveSafeRedirect('')).toBeNull()
    expect(resolveSafeRedirect(null)).toBeNull()
    expect(resolveSafeRedirect(undefined)).toBeNull()
    expect(resolveSafeRedirect('not a url')).toBeNull()
  })
})

describe('isValidRequestId', () => {
  it('ar_ 前缀 + URL-safe 标识通过', () => {
    expect(isValidRequestId('ar_test_0001')).toBe(true)
    expect(isValidRequestId('ar_abc')).toBe(true)
  })

  it('畸形 id 一律拒绝', () => {
    expect(isValidRequestId('')).toBe(false)
    expect(isValidRequestId('ar_ab')).toBe(false) // 过短
    expect(isValidRequestId('client_abc')).toBe(false) // 非 ar_ 前缀
    expect(isValidRequestId('ar_../etc/passwd')).toBe(false)
    expect(isValidRequestId('ar_a b c')).toBe(false)
  })
})
