/**
 * #1166 T05 签名类错误码的 i18n 契约测试。
 *
 * 目的：
 * 1. Rust 返回的 `MODULE_*` 错误码必须都能映射到一个 i18n key；
 * 2. 三个语言文件都必须有对应文案且非空（漏一种语言 = 用户看到原始错误码）;
 * 3. 非签名类错误必须**不**被误判为签名错误（避免把普通失败说成「签名失败」）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MODULE_SIGNING_ERROR_CODES,
  extractModuleSigningErrorCode,
  moduleSigningErrorKey
} from '../utils/more_modules.js'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const LOCALES = {
  'zh-CN': 'src/utils/i18n/messages/zh-CN.ts',
  en: 'src/utils/i18n/messages/en.ts',
  ja: 'src/utils/i18n/messages/ja.ts'
}

describe('#1166 T05 模块签名错误码 → i18n', () => {
  it('每个签名错误码都能解出并映射到 i18n key', () => {
    for (const code of MODULE_SIGNING_ERROR_CODES) {
      // Rust 侧格式：`CODE: 细节`
      expect(extractModuleSigningErrorCode(`${code}: 一些细节`)).toBe(code)
      expect(extractModuleSigningErrorCode(code)).toBe(code)
      expect(moduleSigningErrorKey(`${code}: 一些细节`)).toBe(`more.moduleSigning.${code}`)
    }
  })

  it('三个语言都提供非空文案', () => {
    for (const [locale, file] of Object.entries(LOCALES)) {
      const source = read(file)
      for (const code of MODULE_SIGNING_ERROR_CODES) {
        const key = `more.moduleSigning.${code}`
        const pattern = new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']+)'`)
        const matched = pattern.exec(source)
        expect(matched, `${locale} 缺少 ${key}`).not.toBeNull()
        expect(matched![1].trim().length, `${locale} 的 ${key} 文案为空`).toBeGreaterThan(4)
      }
    }
  })

  it('非签名类错误不会被误判', () => {
    for (const message of [
      '模块压缩包下载失败：Timeout',
      '模块 package_url 为空，无法准备本地包',
      'INVALID_HANDOFF: 接力凭据无效',
      ''
    ]) {
      expect(extractModuleSigningErrorCode(message)).toBe('')
      expect(moduleSigningErrorKey(message)).toBe('')
    }
  })

  it('错误码判定不区分前缀之外的相似命名（防误伤）', () => {
    // 以某个码为前缀但不是「CODE: / CODE 空格」形式 ⇒ 不算
    expect(extractModuleSigningErrorCode('MODULE_SIGNATURE_MISSING_EXTRA')).toBe('')
    expect(extractModuleSigningErrorCode('PREFIX MODULE_SIGNATURE_INVALID')).toBe('')
  })
})
