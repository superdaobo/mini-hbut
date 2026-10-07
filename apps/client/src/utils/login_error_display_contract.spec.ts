/**
 * #984 契约：登录界面展示的错误文案必须全部经过 `friendlyLoginError` 可读化。
 *
 * 背景：`LoginV3.vue` 是唯一登录界面（「我的」页嵌入的也是它）。此前门户扫码登录的
 * 两处 catch 直接插值 `e.message || e`，会把 Rust / reqwest 英文原文（例如
 * `error sending request for url (...)`）直接显示给用户 —— 属于「登录失败文案
 * 不能正确显示在前台」。这里用源码契约把它钉住。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOGIN_VIEW_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/LoginV3.vue'),
  'utf8',
)

describe('登录界面错误文案契约（#984）', () => {
  it('不存在把原始错误对象直接插值到界面的写法', () => {
    // 禁止 `{ err: e.message || e }` / `{ err: e }` 这类未可读化的插值
    expect(LOGIN_VIEW_SOURCE).not.toMatch(/\{\s*err:\s*e\.message\s*\|\|\s*e\s*\}/)
    expect(LOGIN_VIEW_SOURCE).not.toMatch(/\{\s*err:\s*e\s*\}/)
  })

  it('所有 `err:` 插值都走 friendlyLoginError', () => {
    const errInterpolations = [...LOGIN_VIEW_SOURCE.matchAll(/\{\s*err:\s*([^}]+)\}/g)].map(
      (m) => m[1].trim(),
    )
    expect(errInterpolations.length).toBeGreaterThan(0)
    for (const expr of errInterpolations) {
      expect(expr, `err 插值必须可读化：{ err: ${expr} }`).toContain('friendlyLoginError')
    }
  })

  it('所有直接赋值给状态文案的错误都走 friendlyLoginError', () => {
    // statusMsg.value / qrStateMessage.value 里出现变量插值时，必须经过 friendlyLoginError
    const assignments = [...LOGIN_VIEW_SOURCE.matchAll(/(statusMsg|qrStateMessage)\.value\s*=\s*([^\n]+)/g)]
      .map((m) => m[2].trim())
      // 纯 i18n 常量（无变量插值）不需要映射
      .filter((expr) => /\$\{|errMsg|e\.message|String\(/.test(expr))
    for (const expr of assignments) {
      expect(expr, `错误文案赋值必须可读化：${expr}`).toContain('friendlyLoginError')
    }
  })
})
