// 论坛格式化纯函数单元测试
import { describe, expect, it } from 'vitest'
import { authorName, formatTime, initials, toText } from './format'

describe('forum format utils', () => {
  it('toText 将 null/undefined 转为空串，其余转字符串', () => {
    expect(toText(null)).toBe('')
    expect(toText(undefined)).toBe('')
    expect(toText('')).toBe('')
    expect(toText(0)).toBe('0')
    expect(toText('abc')).toBe('abc')
  })

  it('initials 取前两个字符大写，空值回退 HB', () => {
    expect(initials('张三')).toBe('张三')
    expect(initials('abc')).toBe('AB')
    expect(initials('')).toBe('HB')
    expect(initials(null)).toBe('HB')
  })

  it('authorName 本人显示昵称，他人显示学号，空值匿名', () => {
    expect(authorName('20230001', '20230001', '小明')).toBe('小明')
    expect(authorName('20230002', '20230001', '小明')).toBe('20230002')
    expect(authorName('', '20230001', '小明')).toBe('匿名同学')
    expect(authorName(null, '20230001', '小明')).toBe('匿名同学')
    expect(authorName('  20230001  ', '20230001', '')).toBe('20230001')
  })

  it('formatTime 无效输入原样返回，有效时间格式化为 zh-CN 短格式', () => {
    expect(formatTime('')).toBe('')
    expect(formatTime(null)).toBe('')
    expect(formatTime('not-a-date')).toBe('not-a-date')
    // 固定输入 + 显式 Asia/Shanghai：任何运行环境（Windows/Linux/macOS）输出一致（#596 P0-2）
    const formatted = formatTime('2026-01-02T03:04:05Z')
    expect(formatted).toContain('01/02')
    expect(formatted).toContain('11:04') // Asia/Shanghai（UTC+8）
    expect(formatTime('2026-01-02T03:04:05+00:00')).toBe(formatted)
  })
})
