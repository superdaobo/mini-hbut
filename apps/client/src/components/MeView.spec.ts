import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./MeView.vue', import.meta.url), 'utf8')

describe('MeView account switch contract (#755)', () => {
  it('renders a 切换账号 entry in profile actions (hidden for demo sessions)', () => {
    const vue = source()

    expect(vue).toContain('@click="openAccountSwitch"')
    expect(vue).toContain('v-if="!isDemoSession"')
    expect(vue).toContain('class="btn-switch"')
  })

  it('loads the saved account list via list_saved_accounts invoke', () => {
    const vue = source()

    expect(vue).toContain("invokeNative('list_saved_accounts')")
    expect(vue).toContain('savedAccounts.value = Array.isArray(list) ? list : []')
  })

  it('switches accounts locally (no network login) and emits account-switched', () => {
    const vue = source()

    expect(vue).toContain("invokeNative('switch_active_account', {")
    expect(vue).toContain("emit('account-switched', sid)")
    // 会话失效的账号禁止秒切，给出可读提示
    expect(vue).toContain('该账号会话已失效，请先登录该账号后再切换')
  })

  it('offers per-account delete but never for the current account', () => {
    const vue = source()

    expect(vue).toContain("invokeNative('delete_saved_account', {")
    expect(vue).toContain('v-if="!acc.is_current"')
    expect(vue).toContain('@click="removeAccount(acc)"')
    expect(vue).toContain('当前账号不可从弹层删除')
  })

  it('declares the account-switched emit in defineEmits', () => {
    const vue = source()

    expect(vue).toContain("'account-switched'")
  })
})