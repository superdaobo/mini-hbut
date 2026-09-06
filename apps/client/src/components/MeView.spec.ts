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

describe('MeView account switch modal title icon contract (#770)', () => {
  it('uses switch_account (in subset font) and never the non-existent swap_account', () => {
    const vue = source()

    // 回归：swap_account 不是 Material Symbols 官方图标，不在子集字体中，
    // ligature 无法解析会被浏览器渲染为普通文本（issue #770）
    // 只断言模板用法（带 class 前缀），避免误伤注释中的图标名说明
    expect(vue).not.toContain('account-switch-title-icon">swap_account<')
    // 标题图标必须是子集字体中已收录且语义匹配的 switch_account
    expect(vue).toContain('material-symbols-outlined account-switch-title-icon">switch_account</span> 切换账号')
  })
})