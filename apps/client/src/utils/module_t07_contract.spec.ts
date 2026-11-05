/**
 * #1168 T07：远端嵌入白名单 + 协议版本 fail-closed 的契约测试。
 *
 * 这两条都来自 ⛳ G-E 的对抗性复核结论：
 * - 目录条目的 `open_url` 可指向任意 http(s) 地址 → 绕过 `module_bundle` 与验签执行远端代码；
 * - 宿主桥的协议版本缺失时**放行**（fail open）→ 老 SDK/伪造 SDK 可跳过版本协商。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODULE_REMOTE_OPEN_HOSTS, isTrustedRemoteModuleUrl } from '../utils/more_modules.js'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('#1168 T07 远端嵌入白名单', () => {
  it('只信任白名单 host 的 https 地址', () => {
    expect(isTrustedRemoteModuleUrl('https://hbut.6661111.xyz/modules/main/demo/1/index.html')).toBe(true)
    expect(isTrustedRemoteModuleUrl('https://hbut.6661111.xyz/')).toBe(true)
    // 非白名单 host
    expect(isTrustedRemoteModuleUrl('https://evil.example/demo/index.html')).toBe(false)
    // 白名单 host 但 http（明文）
    expect(isTrustedRemoteModuleUrl('http://hbut.6661111.xyz/demo/index.html')).toBe(false)
    // 子域伪装 / 结尾点 / 用户名密码
    expect(isTrustedRemoteModuleUrl('https://hbut.6661111.xyz.evil.example/x')).toBe(false)
    expect(isTrustedRemoteModuleUrl('https://evil.example@hbut.6661111.xyz/x')).toBe(false)
    expect(isTrustedRemoteModuleUrl('https://hbut.6661111.xyz./x')).toBe(false)
    // 非 http 协议与非绝对地址
    expect(isTrustedRemoteModuleUrl('javascript:alert(1)')).toBe(false)
    expect(isTrustedRemoteModuleUrl('/module_bundle/content/a/b/c')).toBe(false)
    expect(isTrustedRemoteModuleUrl('')).toBe(false)
  })

  it('白名单常量不可被就地修改（防运行期被篡改）', () => {
    expect(Object.isFrozen(MODULE_REMOTE_OPEN_HOSTS)).toBe(true)
    expect(() => {
      // @ts-expect-error 故意写只读数组
      MODULE_REMOTE_OPEN_HOSTS.push('evil.example')
    }).toThrow()
  })

  it('Tauri 分支的远端嵌入必须先过白名单判定', () => {
    const source = read('src/utils/more_modules.js')
    const start = source.indexOf('// #1168 T07：Tauri 下远端嵌入必须来自白名单 host')
    expect(start).toBeGreaterThan(0)
    const body = source.slice(start, start + 400)
    expect(body).toContain('isTauriRuntime()')
    expect(body).toContain('isTrustedRemoteModuleUrl(rawPreviewUrl)')
    expect(body).toContain("sourceKind = 'invalid'")
  })

  it('宿主桥协议版本缺失时拒绝（fail closed）', () => {
    const source = read('src/utils/game_center/host_bridge.ts')
    const start = source.indexOf('#1168 T07：协议版本必须显式声明且匹配')
    expect(start).toBeGreaterThan(0)
    const body = source.slice(start, start + 300)
    expect(body).toContain('!Number.isInteger(protocolVersion)')
    expect(body).toContain('protocol_version_unsupported')
    // 不得再出现「只在整数时才比较」的旧写法
    expect(body).not.toContain('Number.isInteger(protocolVersion) && protocolVersion !==')
  })
})
