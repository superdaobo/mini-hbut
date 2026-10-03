/**
 * #976 版本名单匹配串口径锁定（app_version 的来源与可区分性）。
 *
 * 背景：版本名单（canary `allow_versions` / `deny_versions` 与服务端
 * `GAME_PLATFORM_WRITE_DENY_CLIENT_VERSIONS`）按客户端自报的 `app_version` 串匹配，
 * 其唯一来源是构建期 `vite.config.ts` 注入的 `VITE_APP_VERSION`。本地 / dev worktree
 * 等**未 stamp 构建**若原样上报 package.json 冻结的正式版号，会与线上正式版**同串**
 * （名单层面无法区分、排障无法分辨来源）。修复：未 stamp（非 CI）构建注入 `+local`
 * 后缀；CI stamp 路径（`GITHUB_ACTIONS=true`）保持原值不变。
 *
 * 本文件锁定三件事：
 * 1. `+local` 后缀串是**合法版本字面量**（通过 `module_context` 的字符集校验，
 *    会被正常注入 iframe `app_version`，而不是被 fail closed 丢弃）；
 * 2. `vite.config.ts` 的注入护栏（源码扫描）：统一走 `appVersion` 常量、
 *    CI 判定与 `+local` 后缀接线存在、不再直接 `JSON.stringify(pkg.version)`；
 * 3. 口径同步：vitest 配置**不**定义 `VITE_APP_VERSION`（测试环境不携带真实构建版本，
 *    由测试用 `vi.stubEnv` 显式注入）；canary 运维文档写明 `+local` 形态。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeAppVersion, resolveBuildAppVersion } from './game_center/module_context'

describe('#976 +local 后缀串是合法版本字面量（解析逻辑在 TS 内，直接锁定）', () => {
  it('normalizeAppVersion 接受 1.4.11+local（字符集 [0-9A-Za-z._+-] 含 +）', () => {
    expect(normalizeAppVersion('1.4.11+local')).toBe('1.4.11+local')
    expect(normalizeAppVersion('1.4.12-beta.537+local')).toBe('1.4.12-beta.537+local')
  })

  it('resolveBuildAppVersion 对 +local 串原样透传（不被丢弃、不被改写）', () => {
    expect(resolveBuildAppVersion('1.4.11+local')).toBe('1.4.11+local')
  })

  it('非法版本仍 fail closed → 空串（含空白 / 超长 / 伪造前缀）', () => {
    expect(normalizeAppVersion('1.4.11 local')).toBe('')
    expect(normalizeAppVersion('1.4.11;rm -rf')).toBe('')
    expect(normalizeAppVersion('')).toBe('')
    expect(normalizeAppVersion(undefined)).toBe('')
    expect(normalizeAppVersion('1'.repeat(65))).toBe('')
  })
})

describe('#976 vite.config 注入护栏（源码扫描，防接线漂移）', () => {
  const viteConfigSource = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

  it('VITE_APP_VERSION 统一由 appVersion 常量注入（不得直接 JSON.stringify(pkg.version)）', () => {
    expect(viteConfigSource).toContain("'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)")
    expect(viteConfigSource, '直接注入 pkg.version 会让本地构建与线上正式版同串（#976）').not.toContain(
      'JSON.stringify(pkg.version)'
    )
  })

  it('CI stamp 路径不变：GITHUB_ACTIONS 判定存在，非 CI 构建注入 +local 后缀', () => {
    expect(viteConfigSource).toContain("process.env.GITHUB_ACTIONS === 'true'")
    expect(viteConfigSource).toContain('+local')
  })

  it('vitest 配置不定义 VITE_APP_VERSION（测试环境不携带真实构建版本，统一由 stubEnv 显式注入）', () => {
    const vitestConfigSource = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf8')
    expect(vitestConfigSource).not.toContain('VITE_APP_VERSION')
  })

  it('运维文档口径同步：canary 文档写明 +local 形态与 stamp 口径（§9）', () => {
    const docSource = readFileSync(
      resolve(process.cwd(), '../../docs/game-platform/canary-release-control.md'),
      'utf8'
    )
    expect(docSource).toContain('+local')
    expect(docSource).toContain('stamp_app_version')
  })
})
