import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('session credential detection contract (#520)', () => {
  it('backend registers has_restorable_credentials and auto_relogin_from_stored commands', () => {
    const lib = readText('src-tauri/src/lib.rs')
    const handlerBlock = lib.match(/invoke_handler\(tauri::generate_handler!\[[\s\S]*?\]\)/)?.[0] || ''

    // 命令必须注册给前端调用
    expect(handlerBlock).toContain('has_restorable_credentials')
    expect(handlerBlock).toContain('auto_relogin_from_stored')
  })

  it('has_restorable_credentials resolves from db user_sessions and keyring', () => {
    const lib = readText('src-tauri/src/lib.rs')
    const fnBlock = lib.match(/fn resolve_stored_portal_password\(student_id: &str\) -> Option<String> \{[\s\S]*?\n\}/)?.[0] || ''

    // DB 会话密码（login 时无条件保存）优先
    expect(fnBlock).toContain('db::get_user_session(DB_FILENAME, sid)')
    expect(fnBlock).toContain('!session.password.is_empty()')
    // 密钥环双键兜底：学号键 + hbut: 记住密码键
    expect(fnBlock).toContain('credential_store::load_session_password(sid)')
    expect(fnBlock).toContain('load_remembered_credential(&format!("hbut:{}", sid))')
  })

  it('auto_relogin_from_stored performs full CAS login and persists credentials', () => {
    const lib = readText('src-tauri/src/lib.rs')
    const cmdBlock = lib.match(/async fn auto_relogin_from_stored\([\s\S]*?\n\}/)?.[0] || ''

    expect(cmdBlock).toContain('resolve_stored_portal_password(&sid)')
    expect(cmdBlock).toContain('client.set_credentials(sid.clone(), password.clone())')
    expect(cmdBlock).toContain('.login(&sid, &password, "", "", "")')
    expect(cmdBlock).toContain('client.set_chaoxing_login_mode(false)')
    expect(cmdBlock).toContain('client.persist_session_cookies(&session_key)')
    expect(cmdBlock).toContain('db::save_user_session(')
    expect(cmdBlock).toContain('credential_store::save_password(&session_key, &password)')
  })

  it('frontend probes backend credentials when remember flag is false', () => {
    const source = readText('src/composables/useSessionCredentials.js')

    // 未勾记住密码时仍会向后端查询可恢复凭据（#520：login 时后端无条件落库）
    expect(source).toContain('isTauriRuntime()')
    expect(source).toContain("invokeNative('has_restorable_credentials',")
    expect(source).toContain('backendRestorable: true')
  })

  it('attemptAutoRelogin calls auto_relogin_from_stored for backend-restorable credentials', () => {
    const app = readText('src/App.vue')
    const autoReloginBlock = app.match(/const attemptAutoRelogin = async \(\) => \{[\s\S]*?\n\}/)?.[0] || ''

    expect(autoReloginBlock).toContain('creds.backendRestorable')
    expect(autoReloginBlock).toContain("invokeNative('auto_relogin_from_stored', {")
  })

  it('login success triggers proactive session probe to avoid stale expired banner', () => {
    const app = readText('src/App.vue')
    const loginBlock = app.match(/const handleLoginSuccess = \(data\) => \{[\s\S]*?\n\}/)?.[0] || ''

    expect(loginBlock).toContain('refreshSessionSilently()')
    expect(loginBlock).toContain('#520')
  })
})
