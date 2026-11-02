/**
 * #1165 T04 隔离契约（源码契约测试）
 *
 * 这些断言锁住「模块内容与业务 API 不同 origin」的四条不变式：
 * 1. 前端默认内容端口 == Rust 默认内容端口（两边都改才允许，防止漂移）；
 * 2. 内容路由只在 `module_content_router()`，业务 `router()` 里必须没有它；
 * 3. 模块 iframe 必须带 sandbox，且不得授予 top-level 导航；
 * 4. 端口不得在组件里写死，CSP 必须同时允许模块内容 origin 与 Bridge origin。
 *
 * 契约原文：`apps/client/src-tauri/docs/module_runtime_isolation.md`
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const CORE_JS = 'src/utils/more_modules/core.js'
const RUST_BUNDLE = 'src-tauri/src/modules/module_bundle.rs'
const RUST_SYSTEM_ROUTES = 'src-tauri/src/http_server/routes/system.rs'
const HOST_VIEW = 'src/components/MoreModuleHostView.vue'
const TAURI_CONF = 'src-tauri/tauri.conf.json'
const SECURITY_DOC = 'src-tauri/docs/http_bridge_security.md'

const jsContentPort = (): number => {
  const match = /export const MODULE_CONTENT_PORT = (\d+)/.exec(read(CORE_JS))
  expect(match, 'core.js 必须导出 MODULE_CONTENT_PORT').not.toBeNull()
  return Number(match![1])
}

const rustContentPort = (): number => {
  const match = /DEFAULT_MODULE_CONTENT_PORT: u16 = (\d+)/.exec(read(RUST_BUNDLE))
  expect(match, 'module_bundle.rs 必须定义 DEFAULT_MODULE_CONTENT_PORT').not.toBeNull()
  return Number(match![1])
}

const rustBridgePort = (): number => {
  const match = /DEFAULT_BRIDGE_PORT: u16 = (\d+)/.exec(read(RUST_BUNDLE))
  expect(match).not.toBeNull()
  return Number(match![1])
}

/** 截取 `pub(crate) fn router()` 到下一个顶层 `fn`/`pub` 之间的源码。 */
const businessRouterSource = (): string => {
  const source = read(RUST_SYSTEM_ROUTES)
  const start = source.indexOf('pub(crate) fn router()')
  expect(start, 'system.rs 必须有业务 router()').toBeGreaterThan(0)
  const rest = source.slice(start)
  const end = rest.indexOf('\n}\n', rest.indexOf('Router::new()'))
  return end > 0 ? rest.slice(0, end) : rest
}

describe('#1165 T04 模块内容隔离契约', () => {
  it('前端默认内容端口与 Rust 默认内容端口一致，且都不等于 Bridge 端口', () => {
    expect(jsContentPort()).toBe(rustContentPort())
    expect(rustContentPort()).not.toBe(rustBridgePort())
  })

  it('业务 router 不再注册模块内容路由（只由 module_content_router 提供）', () => {
    const business = businessRouterSource()
    expect(business).not.toContain('/module_bundle/content')
    expect(business).toContain('/module_bundle/prepare')

    const all = read(RUST_SYSTEM_ROUTES)
    const contentRouterStart = all.indexOf('pub(crate) fn module_content_router()')
    expect(contentRouterStart, '必须存在 module_content_router').toBeGreaterThan(0)
    const contentRouter = all.slice(contentRouterStart)
    expect(contentRouter).toContain('/module_bundle/content/:channel/:module_id/:version')
  })

  it('模块 iframe 带 sandbox，且不授予 top-level 导航', () => {
    const view = read(HOST_VIEW)
    expect(view).toContain(':sandbox="frameSandbox"')
    const sandboxLine = /const frameSandbox = computed\(\(\) => \{[\s\S]*?\n\}\)/.exec(view)
    expect(sandboxLine, '必须存在 frameSandbox 计算属性').not.toBeNull()
    // 去掉行注释与块注释后再断言，避免注释里提到被禁 token 造成误判
    const body = sandboxLine![0]
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body).toContain('allow-same-origin')
    expect(body).not.toContain('allow-top-navigation')
  })

  it('组件里不再写死 Bridge 端口，来源判定走 isLocalModuleContentOrigin', () => {
    const view = read(HOST_VIEW)
    expect(view).not.toContain("'http://127.0.0.1:4399'")
    expect(view).toContain('isLocalModuleContentOrigin')
  })

  it('CSP 同时允许模块内容 origin 与 Bridge origin，且 object-src 仍为 none', () => {
    const csp = (JSON.parse(read(TAURI_CONF)) as { app: { security: { csp: string } } }).app
      .security.csp
    const contentOrigin = `http://127.0.0.1:${rustContentPort()}`
    const bridgeOrigin = `http://127.0.0.1:${rustBridgePort()}`
    const frameSrc = /frame-src ([^;]+)/.exec(csp)?.[1] ?? ''
    expect(frameSrc).toContain(contentOrigin)
    expect(frameSrc).toContain(bridgeOrigin)
    expect(csp).toContain("object-src 'none'")
  })

  it('桥安全文档记录了内容已迁出 Bridge', () => {
    const doc = read(SECURITY_DOC)
    expect(doc).toContain('模块静态内容已迁出 Bridge')
    expect(doc).toContain(`http://127.0.0.1:${rustContentPort()}`)
  })
})
