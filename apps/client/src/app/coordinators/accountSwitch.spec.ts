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