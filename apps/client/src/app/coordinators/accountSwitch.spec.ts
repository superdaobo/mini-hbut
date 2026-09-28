import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const coordinator = () => readFileSync(new URL('./AuthCoordinator.ts', import.meta.url), 'utf8')

describe('AuthCoordinator account switch contract (#755)', () => {
  it('exposes handleAccountSwitch on the coordinator', () => {
    const src = coordinator()

    expect(src).toContain('const handleAccountSwitch = (studentId: string) => {')
    expect(src).toContain('handleAccountSwitch')
  })

  it('updates the local account marker via saveRememberedUsername', () => {
    const src = coordinator()

    expect(src).toContain('const sid = saveRememberedUsername(studentId)')
    expect(src).toContain('state.studentId.value = sid')
  })

  it('dispatches the session-online refresh event through notifySessionOnline', () => {
    const src = coordinator()

    expect(src).toContain("runtime.session.notifySessionOnline('account-switch')")
  })

  it('refreshes grades and persists cookies for the new account', () => {
    const src = coordinator()

    expect(src).toContain('runtime.grade.handleRefreshGrades()')
    expect(src).toContain('runtime.session.persistSessionCookies()')
    expect(src).toContain('runtime.session.startSessionKeepAlive()')
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