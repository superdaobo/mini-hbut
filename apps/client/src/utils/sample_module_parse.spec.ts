/**
 * 「账号安全概览」样例模块的解析层测试（#1169 T08）。
 *
 * 这层的意义：**改解析不用发安装包**。所以它必须能独立测：
 * 正常结构、常见包装、失败状态、非 JSON、空数据、未知结构。
 */
import { describe, expect, it } from 'vitest'
import {
  extractRows,
  flattenUnknown,
  isFailurePayload,
  parseModulePayload
} from '../../samples/account_security/parse'

describe('#1169 T08 样例模块解析层', () => {
  it('识别标准列表结构并映射成统一列', () => {
    const body = JSON.stringify({
      code: 0,
      data: {
        list: [
          { deviceName: 'Windows 11 · Edge', loginIp: '202.114.191.20', loginAddress: '武汉市', loginTime: '2026-11-05 22:10' },
          { device: 'iPhone', ip: '10.0.0.8', place: '校内', time: '2026-11-04 09:01' }
        ]
      }
    })
    const parsed = parseModulePayload(body, 'online')
    expect(parsed.ok).toBe(true)
    expect(parsed.unknownShape).toBe(false)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].device).toBe('Windows 11 · Edge')
    expect(parsed.rows[0].ip).toBe('202.114.191.20')
    expect(parsed.rows[0].loginTime).toBe('2026-11-05 22:10')
    expect(parsed.rows[1].device).toBe('iPhone')
  })

  it('空列表 → 成功但无记录（不是错误）', () => {
    const parsed = parseModulePayload(JSON.stringify({ code: 0, list: [] }), 'logs')
    expect(parsed.ok).toBe(true)
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.message).toBe('')
  })

  it('失败状态码 → 不可用', () => {
    const parsed = parseModulePayload(JSON.stringify({ code: 500, msg: '内部错误' }), 'online')
    expect(parsed.ok).toBe(false)
    expect(parsed.message).toContain('失败')
  })

  it('非 JSON → 不崩溃，返回原始片段', () => {
    const parsed = parseModulePayload('<html>登录已失效</html>', 'online')
    expect(parsed.ok).toBe(false)
    expect(parsed.unknownShape).toBe(true)
    expect(parsed.message).toContain('JSON')
  })

  it('未知结构 → 拍平成键值行并标记 unknownShape', () => {
    const parsed = parseModulePayload(
      JSON.stringify({ foo: { bar: 1, baz: 'x' }, qux: [1, 2, 3] }),
      'online'
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.unknownShape).toBe(true)
    expect(parsed.flat.some((item: { label: string; value: string }) => item.label === 'foo.bar' && item.value === '1')).toBe(true)
    expect(parsed.flat.some((item: { label: string; value: string }) => item.label === 'qux')).toBe(true)
  })

  it('extractRows / isFailurePayload / flattenUnknown 的边界', () => {
    expect(extractRows([{ a: 1 }])).toEqual([{ a: 1 }])
    expect(extractRows({ data: { rows: [{ a: 1 }] } })).toEqual([{ a: 1 }])
    expect(extractRows(null)).toEqual([])
    expect(extractRows('x')).toEqual([])

    expect(isFailurePayload({ code: 0 })).toBe(false)
    expect(isFailurePayload({ code: '200' })).toBe(false)
    expect(isFailurePayload({ status: 'success' })).toBe(false)
    expect(isFailurePayload({ code: 1 })).toBe(true)
    expect(isFailurePayload({ errcode: -1 })).toBe(true)
    expect(isFailurePayload(null)).toBe(false)

    const flat = flattenUnknown({ a: { b: { c: 'deep' } }, list: [] })
    expect(flat).toContainEqual({ label: 'a.b.c', value: 'deep' })
    // 上限生效
    const many = flattenUnknown({ k: Array.from({ length: 50 }, (_, i) => `v${i}`) }, 3)
    expect(many.length).toBeLessThanOrEqual(3)
  })
})
