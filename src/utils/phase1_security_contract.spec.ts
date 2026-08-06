import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')
const readJson = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T

describe('phase one security boundaries', () => {
  it('protects Bridge routes with a central policy and trusted-origin CORS', () => {
    const bridge =
      read('src-tauri/src/http_server/auth.rs') +
      '\n' +
      read('src-tauri/src/http_server/mod.rs')

    expect(bridge).toContain('enum BridgeRoutePolicy')
    expect(bridge).toContain('async fn bridge_access_middleware')
    expect(bridge).toContain('middleware::from_fn_with_state')
    expect(bridge).toContain('AllowOrigin::predicate')
    expect(bridge).toContain('AllowHeaders::mirror_request()')
    expect(bridge).not.toContain('.allow_origin(Any)')
    expect(bridge).not.toContain('.allow_methods(Any)')
    expect(bridge).not.toContain('.allow_headers(Any)')
  })

  it('keeps the Bridge on loopback and excludes debug routes from the Release router', () => {
    const bridge = read('src-tauri/src/http_server/mod.rs')

    expect(bridge).toContain('SocketAddr::from(([127, 0, 0, 1], port))')
    expect(bridge).not.toContain('std::env::var("HBUT_HTTP_BRIDGE_HOST")')
    expect(bridge).toMatch(/#\[cfg\(debug_assertions\)\]\s+let app = app[\s\S]*?\.merge\(routes::debug::debug_router\(\)\)/)
    expect(bridge).toContain('.merge(routes::schedule::debug_router())')
    expect(bridge).toContain('.merge(routes::proxy::debug_router())')
  })

  it('does not restore capture files in Release builds', () => {
    const lib = read('src-tauri/src/lib.rs')
    const ai = read('src-tauri/src/http_client/ai.rs')

    expect(lib).toMatch(/#\[cfg\(debug_assertions\)\]\s+if !restored_any/)
    expect(lib).toMatch(/#\[cfg\(debug_assertions\)\]\s+if !token_loaded/)
    expect(lib).toContain('find_file_in_parents("rust_backend_session.json", 6)')
    expect(lib).toContain('find_file_in_parents("captured_requests.json", 6)')
    expect(ai).toMatch(/#\[cfg\(debug_assertions\)\]\s+fn find_entry_url_in_text/)
    expect(ai).toMatch(/#\[cfg\(debug_assertions\)\]\s+\{\s+let candidate = dir\.join\("captured_requests\.json"\)/)
  })

  it('requires external automation and public docs to use Bridge tokens', () => {
    const script = read('scripts/test_more_module_bridge.mjs')
    const nonebotDocs = read('website/src/views/docs/Nonebot.tsx')
    const moreDocs = read('website/src/views/docs/More.tsx')
    const apiDocs = read('website/src/views/docs/TauriApi.tsx')

    expect(script).toContain('process.env.HBUT_BRIDGE_TOKEN')
    expect(script).toContain('Authorization: `Bearer ${bridgeToken}`')
    expect(nonebotDocs).toContain('Authorization: Bearer $HBUT_BRIDGE_TOKEN')
    expect(moreDocs).toContain('Authorization: Bearer $HBUT_BRIDGE_TOKEN')
    expect(apiDocs).toContain('Authorization: Bearer $HBUT_BRIDGE_TOKEN')
    expect(nonebotDocs).not.toContain('/fetch_grades')
    expect(moreDocs).not.toContain('/fetch_schedule')
  })

  it('keeps aggregated debug logs in memory and clears legacy persisted logs', () => {
    const logger = read('src/utils/debug_logger.ts')

    expect(logger).not.toContain('localStorage.setItem(STORAGE_KEY')
    expect(logger).toContain('localStorage.removeItem(STORAGE_KEY)')
    expect(logger).toContain('const persistLogs = () => {}')
  })

  it('enables CSP and uses an explicit notification capability set', () => {
    const tauri = readJson<{ app: { security: { csp: string | null } } }>('src-tauri/tauri.conf.json')
    const capability = readJson<{ permissions: string[] }>('src-tauri/capabilities/main.json')

    expect(tauri.app.security.csp).toBeTypeOf('string')
    expect(tauri.app.security.csp).toContain("object-src 'none'")
    expect(tauri.app.security.csp).toContain("style-src-attr 'unsafe-inline'")
    expect(tauri.app.security.csp).not.toContain("script-src 'self' 'unsafe-eval'")
    expect(tauri.app.security.csp).toContain('http://127.0.0.1:4399')
    expect(capability.permissions).not.toContain('notification:default')
    expect(capability.permissions).toContain('notification:allow-notify')
    expect(capability.permissions).toContain('notification:allow-register-listener')
    expect(capability.permissions).toContain('shell:default')
  })
})
