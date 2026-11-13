// src/utils/more_modules/frame_sandbox.spec.ts
//
// Epic #1243（G2-02 / mini-hbut#1251）契约测试：远端 iframe 的默认拒绝沙箱策略。
//
// 守的契约：
//   1. **默认零变化**：强制开关关时，远端帧仍返回 `undefined`（= 不加 sandbox），
//      11 个游戏的行为与 #1165 T04 完全一致；
//   2. 本机模块内容 origin 的能力集**逐字等于**改动前的字面量（不得悄悄放宽）；
//   3. 开关打开后：白名单远端 → 受控能力集；
//   4. 开关打开后：**非白名单远端拿不到脚本能力**（`''`，不是 `undefined`）；
//   5. 危险能力一律不在任何能力集里：`allow-top-navigation*` / `allow-modals` /
//      `allow-popups-to-escape-sandbox`；
//   6. 无 src → `undefined`（不渲染）；
//   7. DEV 回环豁免只在调用方显式标记时生效；
//   8. 本机内容不受开关影响（开关只该影响远端）。
//
// 说明：源的**分类**（是否本机内容 / 是否白名单远端 / 是否 DEV 回环）由调用方用既有
// `isLocalModuleContentOrigin` / `isTrustedRemoteModuleUrl` / `isDevLoopbackModuleUrl`
// 计算（那些函数有自己的测试）。本 spec 只锁「分类 → 能力集」的映射。

import { describe, expect, it } from 'vitest'

import {
  SANDBOX_LOCAL,
  SANDBOX_REMOTE_APPROVED,
  SANDBOX_REMOTE_DENIED,
  decideFrameSandbox
} from './frame_sandbox'

const SRC = 'https://hbut.6661111.xyz/games/hbut_2048/index.html'

const base = {
  src: SRC,
  isLocalModuleOrigin: false,
  isTrustedRemote: false,
  enforceRemoteSandbox: true
}

describe('decideFrameSandbox', () => {
  it('无 src → undefined（不渲染，也不给能力）', () => {
    const d = decideFrameSandbox({ ...base, src: '   ' })
    expect(d).toEqual({ sandbox: undefined, reason: 'no_src' })
  })

  it('本机模块内容 origin → 现状能力集（逐字不变）', () => {
    const d = decideFrameSandbox({ ...base, isLocalModuleOrigin: true })
    expect(d.reason).toBe('local_module_content')
    expect(d.sandbox).toBe(
      'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads'
    )
    expect(d.sandbox).toBe(SANDBOX_LOCAL)
  })

  it('本机内容不受开关影响（开关只该影响远端）', () => {
    const on = decideFrameSandbox({ ...base, isLocalModuleOrigin: true, enforceRemoteSandbox: true })
    const off = decideFrameSandbox({ ...base, isLocalModuleOrigin: true, enforceRemoteSandbox: false })
    expect(on).toEqual(off)
  })

  it('开关关闭（默认）→ 远端仍 undefined，行为零变化', () => {
    const trusted = decideFrameSandbox({
      ...base,
      isTrustedRemote: true,
      enforceRemoteSandbox: false
    })
    const untrusted = decideFrameSandbox({ ...base, enforceRemoteSandbox: false })
    expect(trusted).toEqual({ sandbox: undefined, reason: 'remote_flag_off' })
    expect(untrusted).toEqual({ sandbox: undefined, reason: 'remote_flag_off' })
  })

  it('开关开启 + 白名单远端 → 受控能力集', () => {
    const d = decideFrameSandbox({ ...base, isTrustedRemote: true })
    expect(d.reason).toBe('remote_approved')
    expect(d.sandbox).toBe(SANDBOX_REMOTE_APPROVED)
  })

  it('开关开启 + 非白名单远端 → 最严格沙箱（连脚本都不给）', () => {
    const d = decideFrameSandbox({ ...base, isTrustedRemote: false })
    expect(d.reason).toBe('remote_untrusted')
    expect(d.sandbox).toBe(SANDBOX_REMOTE_DENIED)
    expect(d.sandbox).toBe('')
  })

  it('DEV 回环豁免只在显式标记时生效', () => {
    const without = decideFrameSandbox({ ...base, isDevLoopback: false })
    expect(without.reason).toBe('remote_untrusted')

    const withFlag = decideFrameSandbox({ ...base, isDevLoopback: true })
    expect(withFlag.reason).toBe('remote_approved')
    expect(withFlag.sandbox).toBe(SANDBOX_REMOTE_APPROVED)
  })

  it('开关关闭时 DEV 回环也不加沙箱（保持现状）', () => {
    const d = decideFrameSandbox({ ...base, isDevLoopback: true, enforceRemoteSandbox: false })
    expect(d.sandbox).toBeUndefined()
    expect(d.reason).toBe('remote_flag_off')
  })

  it('任何能力集都不得含危险能力（top-navigation / modals / popups-escape）', () => {
    const forbidden = [
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-modals',
      'allow-popups-to-escape-sandbox'
    ]
    for (const value of [SANDBOX_LOCAL, SANDBOX_REMOTE_APPROVED, SANDBOX_REMOTE_DENIED]) {
      for (const bad of forbidden) {
        expect(value.includes(bad)).toBe(false)
      }
    }
  })

  it('能力集只包含预期 token（防止悄悄加能力）', () => {
    expect(SANDBOX_LOCAL.split(' ').sort()).toEqual(
      [
        'allow-scripts',
        'allow-same-origin',
        'allow-forms',
        'allow-popups',
        'allow-pointer-lock',
        'allow-downloads'
      ].sort()
    )
    expect(SANDBOX_REMOTE_APPROVED).toBe(SANDBOX_LOCAL)
    expect(SANDBOX_REMOTE_DENIED).toBe('')
  })
})
