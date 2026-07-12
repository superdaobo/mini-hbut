import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

describe('chaoxing SSO session layer contract (#324-#326)', () => {
  it('exposes unified SSO module with cache, silent relogin and diagnostics', () => {
    const sso = read('src-tauri/src/modules/chaoxing_sso.rs')
    const session = read('src-tauri/src/http_client/session.rs')
    const classMod = read('src-tauri/src/modules/chaoxing_class.rs')

    expect(sso).toContain('ensure_chaoxing_sso')
    expect(sso).toContain('preheat_after_portal_login')
    expect(sso).toContain('SSO_TTL')
    expect(sso).toContain('try_silent_portal_relogin')
    expect(sso).toContain('persist_diag')
    expect(sso).toContain('invalidate_sso_cache')
    expect(sso).not.toContain('password:')

    // TGT 失效不在 bridge 内立刻清登录，留给统一层静默续期
    expect(session).toContain('交由 chaoxing_sso 统一层尝试静默重登')

    // 班级模块走统一层，不再 force 全量课程
    expect(classMod).toContain('ensure_chaoxing_sso')
    expect(classMod).not.toContain('chaoxing_fetch_courses(client')
  })
})
