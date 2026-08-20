import { describe, expect, it } from 'vitest'
import { friendlyLoginError, readableErrorText } from './login_errors'

describe('readableErrorText', () => {
  it('Error 实例取 message', () => {
    expect(readableErrorText(new Error('boom'))).toBe('boom')
  })

  it('对象优先取 message / error / kind 可读字段', () => {
    expect(readableErrorText({ kind: '业务错误', message: '账号已被锁定' })).toBe('账号已被锁定')
    expect(readableErrorText({ error: '服务器 IP 被学校冻结，请稍后再试或联系管理员' })).toBe(
      '服务器 IP 被学校冻结，请稍后再试或联系管理员'
    )
    expect(readableErrorText({ code: 500, error: { msg: 'x' } })).not.toBe('')
  })

  it('纯对象不序列化成 [object Object]', () => {
    expect(friendlyLoginError({ message: 'server error' })).not.toBe('[object Object]')
  })

  it('null/undefined/空串返回空', () => {
    expect(readableErrorText(null)).toBe('')
    expect(readableErrorText(undefined)).toBe('')
    expect(readableErrorText('')).toBe('')
  })
})

describe('friendlyLoginError', () => {
  it('[object Object] 与空错误给兜底文案', () => {
    expect(friendlyLoginError('[object Object]')).toBe('登录失败，请稍后重试')
    expect(friendlyLoginError('')).toBe('登录失败，请稍后重试')
    expect(friendlyLoginError(null)).toBe('登录失败，请稍后重试')
  })

  it('reqwest 网络原文映射为可读中文', () => {
    const raw =
      'error sending request for url (https://auth.hbut.edu.cn/authserver/login?service=...): connection closed before message completed'
    expect(friendlyLoginError(raw)).toBe('无法连接教务系统，请检查网络后重试')
  })

  it('连接超时原文映射为可读中文', () => {
    expect(friendlyLoginError('request timed out')).toBe('无法连接教务系统，请检查网络后重试')
  })

  it('获取登录页失败（内嵌英文）映射为可读中文', () => {
    const raw = '获取登录页失败: error sending request for url (...); 重试仍失败: ...'
    expect(friendlyLoginError(raw)).toBe('无法连接教务系统，请检查网络后重试')
  })

  it('OCR 相关原文映射为识别服务提示', () => {
    expect(friendlyLoginError('OCR all endpoints failed: xxx')).toBe('验证码识别服务暂不可用，请稍后重试')
    expect(friendlyLoginError('OCR request failed: timeout')).toBe('验证码识别服务暂不可用，请稍后重试')
  })

  it('凭据错误（含缺字变体）统一文案', () => {
    expect(friendlyLoginError('username或密码错误')).toBe('用户名或密码错误，请重新输入')
    expect(friendlyLoginError('用户名或密码错误')).toBe('用户名或密码错误，请重新输入')
    expect(friendlyLoginError('密码错误')).toBe('用户名或密码错误，请重新输入')
  })

  it('认证兜底文案给增强提示，避免误导', () => {
    expect(friendlyLoginError('登录失败，请检查账号或密码')).toContain('验证码识别服务异常')
  })

  it('后端已有简洁中文原样展示', () => {
    expect(friendlyLoginError('账号已被锁定')).toBe('账号已被锁定')
    expect(friendlyLoginError('验证码错误')).toBe('验证码错误')
    expect(friendlyLoginError('登录过于频繁，请稍后再试')).toBe('登录过于频繁，请稍后再试')
    expect(friendlyLoginError('服务器 IP 被学校冻结，请稍后再试或联系管理员')).toBe(
      '服务器 IP 被学校冻结，请稍后再试或联系管理员'
    )
  })

  it('其它技术英文给兜底前缀', () => {
    expect(friendlyLoginError('weird internal error')).toBe('登录失败：weird internal error')
  })
})
