/**
 * DEV 回环豁免契约（#1169 真机验证 / 游戏中心本地 CDN 回归）。
 *
 * 为什么需要它：`isTrustedRemoteModuleUrl` 要求 https + 固定白名单 host，于是用本地静态 CDN
 * （`http://127.0.0.1:<port>/main/...`）跑游戏中心时远端嵌入会被判 `invalid`，真实面板与游戏包
 * 永远加载不了 → 游戏链路无法验证。
 *
 * 本 spec 锁住三条边界：
 *   1. 回环地址在 DEV 下被豁免（仅允许嵌入，不涉及能力/验签）；
 *   2. 非回环的 http（含内网/公网主机）**仍然**被拒绝；
 *   3. 生产白名单函数 `isTrustedRemoteModuleUrl` 的语义**没有被放宽**（https + 固定 host）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isDevLoopbackModuleUrl, isTrustedRemoteModuleUrl } from './more_modules.js'

const readSource = (relative: string) =>
  readFileSync(path.join(__dirname, relative), 'utf8')

describe('DEV 回环豁免', () => {
  it('回环地址被识别（http/https、127.0.0.1/localhost/[::1]）', () => {
    expect(isDevLoopbackModuleUrl('http://127.0.0.1:8899/main/more_panel/1/site/index.html')).toBe(true)
    expect(isDevLoopbackModuleUrl('http://localhost:8899/main/catalog.json')).toBe(true)
    expect(isDevLoopbackModuleUrl('https://127.0.0.1/x.html')).toBe(true)
    expect(isDevLoopbackModuleUrl('http://[::1]:8899/x.html')).toBe(true)
  })

  it('非回环地址一律不豁免（http 内网/公网、evil、带 userinfo）', () => {
    expect(isDevLoopbackModuleUrl('http://192.168.3.94:8899/x.html')).toBe(false)
    expect(isDevLoopbackModuleUrl('http://evil.example/x.html')).toBe(false)
    expect(isDevLoopbackModuleUrl('https://hbut.6661111.xyz/x.html')).toBe(false)
    expect(isDevLoopbackModuleUrl('http://user:pass@127.0.0.1:8899/x.html')).toBe(false)
    expect(isDevLoopbackModuleUrl('file:///D:/x.html')).toBe(false)
    expect(isDevLoopbackModuleUrl('')).toBe(false)
  })

  it('生产白名单语义未被放宽：https + 固定 host 才通过', () => {
    expect(isTrustedRemoteModuleUrl('https://hbut.6661111.xyz/modules/main/demo/1/index.html')).toBe(true)
    // 回环即便用 https 也不在固定 host 白名单里 → 仍然拒绝（豁免只走 DEV 分支）
    expect(isTrustedRemoteModuleUrl('https://127.0.0.1/x.html')).toBe(false)
    expect(isTrustedRemoteModuleUrl('http://127.0.0.1:8899/x.html')).toBe(false)
  })

  it('豁免在调用点受 DEV 门控（源码契约）', () => {
    const source = readSource('./more_modules.js')
    expect(source).toContain('import.meta.env.DEV && isDevLoopbackModuleUrl(rawPreviewUrl)')
    // 不得出现「无条件放行」的写法
    expect(source).not.toContain('isDevLoopbackModuleUrl(rawPreviewUrl)) {')
  })
})
