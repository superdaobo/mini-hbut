/**
 * Host 隔离结构性测试（#630 Done 标准："Host 隔离…有自动测试"）。
 *
 * 运行期的强制隔离由 proxy.ts + lib/host-router.ts（fail closed）完成
 * （host-router.test.ts 已覆盖分类逻辑）。本测试守护文件结构不变量：
 *  - auth.* 站点没有 /apps、/admin 路由；
 *  - developer.* 站点没有 /r/ 路由（不暴露 auth internals）；
 *  - BFF 端点只存在于 auth-site 前缀下（developer/其他 host 无法命中）。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = join(__dirname, '..', 'app')

describe('auth.* 站点路由边界', () => {
  it('auth-site 下不存在 /apps 与 /admin 路由', () => {
    expect(existsSync(join(APP_DIR, 'auth-site', 'apps'))).toBe(false)
    expect(existsSync(join(APP_DIR, 'auth-site', 'admin'))).toBe(false)
  })

  it('auth-site 下没有嵌套路由可命中开发者/管理功能', () => {
    for (const name of ['developer', 'dashboard', 'console', 'settings', 'clients']) {
      expect(existsSync(join(APP_DIR, 'auth-site', name)), name).toBe(false)
    }
  })
})

describe('developer.* 站点路由边界', () => {
  it('developer-site 下不存在 /r/ 路由（不暴露 auth internals）', () => {
    expect(existsSync(join(APP_DIR, 'developer-site', 'r'))).toBe(false)
  })

  it('developer-site 的 BFF 只存在于 /api/v1/developer 前缀（#624 合法路由）', () => {
    // #624 落地后 developer 站点自带 BFF：api/v1/developer/*（owner 从会话推导）
    expect(existsSync(join(APP_DIR, 'developer-site', 'api', 'v1', 'developer', 'apps'))).toBe(true)
    expect(existsSync(join(APP_DIR, 'developer-site', 'api', 'v1', 'developer', 'me', 'route.ts'))).toBe(true)
  })

  it('developer-site 下不存在 auth 的 BFF 端点（/api/auth/*）', () => {
    expect(existsSync(join(APP_DIR, 'developer-site', 'api', 'auth'))).toBe(false)
    expect(existsSync(join(APP_DIR, 'developer-site', 'api', 'v1', 'requests'))).toBe(false)
  })
})

describe('BFF 路由只存在于 auth-site 下', () => {
  it('三个端点文件齐全（[id] / status / resume）', () => {
    const base = join(APP_DIR, 'auth-site', 'api', 'auth', 'requests', '[id]')
    expect(existsSync(join(base, 'route.ts'))).toBe(true)
    expect(existsSync(join(base, 'status', 'route.ts'))).toBe(true)
    expect(existsSync(join(base, 'resume', 'route.ts'))).toBe(true)
  })

  it('app/api（根级）不存在，BFF 无法绕过 host 前缀直接命中', () => {
    expect(existsSync(join(APP_DIR, 'api'))).toBe(false)
  })
})

describe('auth-site 路由清单（结构自查）', () => {
  it('只存在预期的路由/文件，无意外 page.tsx', () => {
    const pages: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
        } else if (entry === 'page.tsx' || entry === 'route.ts') {
          const rel = full
            .replace(APP_DIR + '\\', '')
            .replace(APP_DIR + '/', '')
            .replace(/\\/g, '/')
          pages.push(rel)
        }
      }
    }
    walk(join(APP_DIR, 'auth-site'))
    // 允许的 page：站点首页 + /r/[requestId] + /help
    for (const p of pages.filter((p) => p.endsWith('page.tsx'))) {
      expect(
        p === 'auth-site/page.tsx' || p === 'auth-site/r/[requestId]/page.tsx' || p === 'auth-site/help/page.tsx' || p === 'auth-site/callback/page.tsx',
        `未预期的 page: ${p}`,
      ).toBe(true)
    }
  })
})
