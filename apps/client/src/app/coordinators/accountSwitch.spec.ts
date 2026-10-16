import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const coordinator = () => readFileSync(new URL('./AuthCoordinator.ts', import.meta.url), 'utf8')
const contracts = () => readFileSync(new URL('../contracts/runtime.ts', import.meta.url), 'utf8')
const meView = () => readFileSync(new URL('../../components/MeView.vue', import.meta.url), 'utf8')

describe('AuthCoordinator account switch contract (#755 / #1048 / #1061)', () => {
  it('exposes handleAccountSwitch on the coordinator with the four-state contract', () => {
    const src = coordinator()

    expect(src).toContain('const handleAccountSwitch = (account: AccountSwitchOutcome) => {')
    expect(src).toContain('handleAccountSwitch')
    // 身份状态契约先固定：四态字段集中在 contracts/runtime.ts
    const contract = contracts()
    expect(contract).toContain('export interface AccountSwitchOutcome {')
    expect(contract).toContain('onlineReady?: boolean')
    expect(contract).toContain('needsLogin?: boolean')
  })

  it('updates the local account marker via saveRememberedUsername', () => {
    const src = coordinator()

    expect(src).toContain('const sid = normalizePortalAccountId(account?.studentId, role)')
    expect(src).toContain('saveRememberedUsername(sid, role)')
    expect(src).toContain('state.setIdentityRole(role)')
    expect(src).toContain('state.studentId.value = sid')
  })

  it('only dispatches the session-online event after Rust confirmed online_ready', () => {
    const src = coordinator()

    expect(src).toContain('const onlineReady = account?.onlineReady === true')
    expect(src).toContain("runtime.session.notifySessionOnline('account-switch')")
    // 未在线就绪绝不虚报：needs_login 与缓存离线两条失败分支都不发在线事件
    expect(src).toContain("state.onlineSessionState.value = 'needs_login'")
    expect(src).toContain("state.onlineSessionState.value = 'cached_offline'")
    expect(src).toContain("phase: 'need_login'")
    // 旧实现「切完就 refresh_session」的虚报路径必须消失
    expect(src).not.toContain("invokeNative<{ student_id?: string; role?: string }>('refresh_session')")
  })

  it('refreshes grades and persists cookies for the new account', () => {
    const src = coordinator()

    expect(src).toContain('runtime.grade.handleRefreshGrades()')
    expect(src).toContain('runtime.session.persistSessionCookies()')
    expect(src).toContain('runtime.session.startSessionKeepAlive()')
    expect(src).toContain('runtime.session.stopElectricityKeepAlive()')
    expect(src).toContain('if (isTeacherRoleValue(role))')
  })

  it('MeView calls the online switch command and reports non-online outcomes honestly', () => {
    const vue = meView()

    expect(vue).toContain("invokeNative('switch_active_account_online', {")
    expect(vue).toContain('const onlineReady = info?.online_ready === true')
    expect(vue).toContain('const needsLogin = info?.needs_login === true')
    expect(vue).toContain("emit('account-switched', {")
  })
})

describe('P0 游戏落盘身份清理接线（登出 / 会话失效 / 换号）', () => {
  it('每次登出都清理游戏落盘身份（覆盖 manual:false 的会话失效登出），且经尽力而为包装（F2）', () => {
    const src = coordinator()

    expect(src).toContain("import { fetchWithCache, clearUserScopedCaches, clearGameIdentityCaches")
    expect(src).toContain('const runLogoutCleanupSafely = (label: string, action: () => void) => {')
    expect(src).toContain("runLogoutCleanupSafely('游戏落盘身份清理', () => clearGameIdentityCaches(logoutSid))")
  })

  it('切换账号时清理上一账号的游戏落盘身份（同样经尽力而为包装，F2）', () => {
    const src = coordinator()

    expect(src).toContain(
      "runLogoutCleanupSafely('游戏落盘身份清理', () => clearGameIdentityCaches(previousSid))"
    )
  })
})