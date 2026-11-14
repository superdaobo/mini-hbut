import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1296：资料页「跳转登录」的自愈链路契约。
 * 前端带门户密码 → 后端在判定登录跳转时强制重登一次并重试；
 * 同时绿条（会话正常）与红条（加载失败）不得同屏。
 */
const readSource = (path: string) => {
  const resolved = resolve(process.cwd(), path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

describe('chaoxing class login-redirect self-heal contract (#1296)', () => {
  const view = readSource('src/components/ChaoxingClassView.vue')
  const tpl = readSource('src/templates/views/ChaoxingClassView.html')
  const resource = readSource('src-tauri/src/modules/chaoxing_class/resource.rs')
  const sso = readSource('src-tauri/src/modules/chaoxing_sso.rs')
  const transport = readSource('src-tauri/src/transport/tauri/chaoxing.rs')

  it('前端把门户密码随资料请求带给后端', () => {
    expect(view).toContain("chaoxing_class_list_resources")
    expect(view).toContain('portal_password: ssoReq.portal_password ?? null')
  })

  it('绿条与红条互斥', () => {
    expect(tpl).toContain('!ssoReady || ssoHint')
    expect(tpl).toContain('!(ssoReady && error)')
  })

  it('后端在登录跳转时强制重登一次再重试', () => {
    expect(resource).toContain('const LOGIN_REDIRECT_HINT')
    expect(resource).toContain('LOGIN_REDIRECT_HINT')
    expect(resource).toContain('force_chaoxing_relogin')
    expect(resource).toContain('fetch_datalist_student_or_teacher')
  })

  it('强制重登会清缓存并跳过冷却，且重新桥接/探针', () => {
    const fnStart = sso.indexOf('pub async fn force_chaoxing_relogin')
    expect(fnStart).toBeGreaterThan(0)
    const body = sso.slice(fnStart, fnStart + 2000)
    expect(body).toContain('invalidate_sso_cache()')
    expect(body).toContain('last_silent_relogin_at = None')
    expect(body).toContain('try_silent_portal_relogin')
    expect(body).toContain('try_bridge_cas_to_chaoxing')
    expect(body).toContain('probe_chaoxing_ready')
  })

  it('资料请求命令透传 portal_password', () => {
    expect(transport).toMatch(/struct ChaoxingClassResourcesRequest[\s\S]*?portal_password: Option<String>/)
    expect(transport).toContain('portal_password: req.portal_password')
  })

  it('登录页判定不再误伤资料列表页', () => {
    const parse = readSource('src-tauri/src/modules/chaoxing_class/parse.rs')
    expect(parse).toContain('looks_like_datalist')
    expect(parse).toContain('!looks_like_datalist')
  })
})
