import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('原生调用调试日志隐私契约', () => {
  it('Native invoke 日志不再携带 args 和原始错误对象', () => {
    const source = readFileSync(new URL('./native.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/pushDebugLog\([^\n]*['"]Native['"][^\n]*,\s*args\)/)
    expect(source).not.toMatch(/pushDebugLog\([^\n]*['"]Native['"][^\n]*,\s*error\)/)
    expect(source).toContain("pushDebugLog('Native', `invoke 开始：${command}`, 'debug')")
  })
})
