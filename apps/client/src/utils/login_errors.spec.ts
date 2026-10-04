import { describe, expect, it } from 'vitest'
import {
  BACKEND_LOGIN_ERROR_SAMPLES,
  friendlyLoginError,
  readableErrorText
} from './login_errors'

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

describe('后端登录错误文案契约（#984）', () => {
  it('每一条已知后端错误都映射为非空、含中文、且不泄漏英文技术原文', () => {
    for (const raw of BACKEND_LOGIN_ERROR_SAMPLES) {
      const message = friendlyLoginError(raw)
      expect(message.trim(), `raw=${raw}`).not.toBe('')
      // 必须含中文：保证前台不会把英文技术原文直接抛给用户
      expect(/[\u4e00-\u9fff]/.test(message), `raw=${raw} → ${message}`).toBe(true)
      // 不得出现后端内部字段名 / 英文技术词
      expect(message, `raw=${raw} → ${message}`).not.toMatch(
        /[A-Za-z]{4,}(?: [A-Za-z]{3,})*/,
      )
      expect(message, `raw=${raw} → ${message}`).not.toContain('[object Object]')
      // 文案里不得残留内部术语
      for (const term of ['加密盐值', 'execution', 'base64', 'service=']) {
        expect(message, `raw=${raw} → ${message}`).not.toContain(term)
      }
    }
  })

  it('关键失败场景给出一致且可操作的文案', () => {
    // 凭据错误
    expect(friendlyLoginError('username或密码错误')).toBe('用户名或密码错误，请重新输入')
    // 教务会话落地失败（#984 情况 C）
    expect(friendlyLoginError('统一身份认证已通过，但教务会话建立失败，请稍后重试')).toBe(
      '统一身份认证已通过，但教务会话建立失败，请稍后重试',
    )
    // 网络错误不得被压成会话过期
    expect(friendlyLoginError('无法连接教务系统，请检查网络后重试')).toBe(
      '无法连接教务系统，请检查网络后重试',
    )
    // 误导性文案被纠正：解析失败 ≠ 会话过期
    expect(friendlyLoginError('无法解析用户信息，可能会话已过期')).not.toContain('会话已过期')
    // 技术术语被翻译
    expect(friendlyLoginError('无法获取加密盐值')).toBe('暂时无法获取登录信息，请稍后重试')
    expect(friendlyLoginError('获取个人信息失败: 500')).toBe(
      '登录已通过，但获取个人信息失败，请稍后重试',
    )
  })
})
