/**
 * #1167 T06：宿主侧受控请求协议的形状契约测试。
 *
 * 关注点：模块只能发「参数值」，形状不合法一律静默丢弃；错误串必须归一成
 * `{code, message}`（不透传原始异常文本）；三种语言的错误文案齐全。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MODULE_FETCH_REQUEST_TYPE,
  MODULE_FETCH_RESPONSE_TYPE,
  buildModuleFetchResponse,
  normalizeModuleFetchMessage,
  parseModuleFetchError
} from './module_controlled_request'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const baseMessage = {
  type: MODULE_FETCH_REQUEST_TYPE,
  request_id: 'req_123456',
  capability: 'school.portal_client_ip',
  query: { t: '1700000000' }
}

describe('#1167 T06 受控请求协议', () => {
  it('正常请求被规范化（只保留参数值）', () => {
    const normalized = normalizeModuleFetchMessage(baseMessage)
    expect(normalized).not.toBeNull()
    expect(normalized!.capability).toBe('school.portal_client_ip')
    expect(normalized!.query).toEqual({ t: '1700000000' })
    expect(normalized!.form).toEqual({})
  })

  it('形状不合法的消息一律返回 null（静默丢弃）', () => {
    const cases = [
      null,
      {},
      { ...baseMessage, type: 'hbu-other' },
      { ...baseMessage, request_id: 'x' },
      { ...baseMessage, request_id: 'req with space!!' },
      { ...baseMessage, capability: 'School' },
      { ...baseMessage, capability: 'a' },
      { ...baseMessage, query: { t: 1 } },
      { ...baseMessage, query: { t: 'x'.repeat(600) } },
      { ...baseMessage, query: [['t', '1']] },
      { ...baseMessage, form: { k: 'v', nested: { a: 1 } } }
    ]
    for (const item of cases) {
      expect(normalizeModuleFetchMessage(item)).toBeNull()
    }
  })

  it('参数键数量与超时都有上限', () => {
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'v']))
    expect(normalizeModuleFetchMessage({ ...baseMessage, query: many })).toBeNull()

    const slow = normalizeModuleFetchMessage({ ...baseMessage, timeout_ms: 999_999 })
    expect(slow!.timeout_ms).toBe(15_000)
    const fast = normalizeModuleFetchMessage({ ...baseMessage, timeout_ms: 0 })
    expect(fast!.timeout_ms).toBe(1)
  })

  it('错误串归一成 {code, message}，不透传未知异常', () => {
    expect(parseModuleFetchError('MODULE_NOT_TRUSTED: 模块未通过发布者验签')).toEqual({
      code: 'MODULE_NOT_TRUSTED',
      message: '模块未通过发布者验签'
    })
    expect(parseModuleFetchError('TypeError: fetch failed').code).toBe('MODULE_UPSTREAM_ERROR')
    expect(parseModuleFetchError('').code).toBe('MODULE_UPSTREAM_ERROR')
    // 码必须是大写 MODULE_*，其它前缀不被采信
    expect(parseModuleFetchError('module_not_trusted: x').code).toBe('MODULE_UPSTREAM_ERROR')
  })

  it('响应消息带 request_id，成功与失败形状不同', () => {
    const ok = buildModuleFetchResponse('req_123456', {
      ok: true,
      status: 200,
      content_type: 'application/json',
      body: '{}'
    })
    expect(ok.type).toBe(MODULE_FETCH_RESPONSE_TYPE)
    expect(ok.request_id).toBe('req_123456')
    expect(ok.ok).toBe(true)
    expect(ok.error).toBeUndefined()

    const failed = buildModuleFetchResponse('req_123456', {
      ok: false,
      error: { code: 'MODULE_NOT_TRUSTED', message: 'x' }
    })
    expect(failed.ok).toBe(false)
    expect(failed.error!.code).toBe('MODULE_NOT_TRUSTED')
    expect(failed.body).toBeUndefined()
  })

  it('三语错误文案齐全且非空', () => {
    const locales = {
      'zh-CN': 'src/utils/i18n/messages/zh-CN.ts',
      en: 'src/utils/i18n/messages/en.ts',
      ja: 'src/utils/i18n/messages/ja.ts'
    }
    const codes = [
      'MODULE_NOT_TRUSTED',
      'MODULE_CAPABILITY_UNKNOWN',
      'MODULE_ACCOUNT_SWITCHED',
      'MODULE_REQUEST_TIMEOUT',
      'MODULE_RESPONSE_TOO_LARGE',
      'MODULE_TOO_MANY_REQUESTS',
      'MODULE_PARAM_REJECTED',
      'MODULE_UPSTREAM_ERROR',
      'MODULE_FORBIDDEN_WINDOW',
      'MODULE_INSTANCE_REQUIRED'
    ]
    for (const [locale, file] of Object.entries(locales)) {
      const source = read(file)
      for (const code of codes) {
        const key = `more.moduleFetch.${code}`
        const pattern = new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']+)'`)
        const matched = pattern.exec(source)
        expect(matched, `${locale} 缺少 ${key}`).not.toBeNull()
        expect(matched![1].trim().length, `${locale} 的 ${key} 为空`).toBeGreaterThan(4)
      }
    }
  })
})
