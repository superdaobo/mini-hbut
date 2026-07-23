import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decideHomeNavigate, canOpenModule } from './moduleAccess'

/**
 * 入口接线 + 生产路径字符串门闩。
 * 失败条件：删除 decideHomeNavigate/canOpenModule 调用、旁路 emit、猜 cmd 名、去掉 setbindroom。
 * 策略行为见 moduleAccess.spec.ts；Rust 纯函数见 cargo tests。
 */
const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

describe('campus entry wiring uses decideHomeNavigate / canOpenModule', () => {
  it('Dashboard.navigateTo calls decideHomeNavigate before emit navigate', () => {
    const dash = read('src/components/Dashboard.vue')
    expect(dash).toContain("from '../utils/moduleAccess'")
    expect(dash).toContain('decideHomeNavigate')
    const nav = dash.indexOf('const navigateTo = (moduleId)')
    const access = dash.indexOf('decideHomeNavigate(', nav)
    const emit = dash.indexOf("emit('navigate'", nav)
    expect(nav).toBeGreaterThan(-1)
    expect(access).toBeGreaterThan(nav)
    expect(emit).toBeGreaterThan(access)
    // sports_venue 数据行必须 available: false（与 gate 双保险）
    expect(dash).toMatch(/id:\s*'sports_venue'[\s\S]{0,200}available:\s*false/)
  })

  it('App.goToView calls canOpenModule before goToViewInternal', () => {
    const app = read('src/App.vue')
    expect(app).toContain("from './utils/moduleAccess'")
    const go = app.indexOf('const goToView = (view')
    const access = app.indexOf('canOpenModule(', go)
    const internal = app.indexOf('goToViewInternal(normalized', go)
    expect(go).toBeGreaterThan(-1)
    expect(access).toBeGreaterThan(go)
    expect(internal).toBeGreaterThan(access)
  })

  it('runtime decideHomeNavigate blocks sports_venue (not only static available flag)', () => {
    // 即使 available:true 也硬拦 —— 证明不是「只改数据不拦 navigate」
    const r = decideHomeNavigate(
      'sports_venue',
      [{ id: 'sports_venue', available: true, requiresLogin: true }],
      { isLoggedIn: true }
    )
    expect(r.ok).toBe(false)
    const r2 = canOpenModule(
      { id: 'sports_venue', available: true, requiresLogin: true },
      { isLoggedIn: true }
    )
    expect(r2.ok).toBe(false)
  })
})

describe('SWAE setbindroom production path (not guessed multi-cmd)', () => {
  it('one_code bind helper only uses setbindroom + apply_room_selection on usage path', () => {
    const rs = read('src-tauri/src/modules/one_code.rs')
    // 写接口名唯一：setbindroom（fixture 已证明）
    expect(rs).toContain('let method = "setbindroom"')
    expect(rs).toContain('try_swae_bind_room_with_response')
    expect(rs).toContain('apply_room_selection')
    // 生产 fetch_smart_electricity_stats 在拉趋势前调用 bind + plan
    const bindFn = rs.indexOf('async fn try_swae_bind_room_with_response')
    const fetchFn = rs.indexOf('async fn fetch_smart_electricity_stats')
    const planCall = rs.indexOf('apply_room_selection(pref, label, &prior_bound')
    expect(bindFn).toBeGreaterThan(-1)
    expect(fetchFn).toBeGreaterThan(-1)
    expect(planCall).toBeGreaterThan(fetchFn)
    // 禁止已删除的多 cmd 猜测循环
    expect(rs).not.toMatch(/const METHODS:\s*&\[[^\]]*bindroom/)
    expect(rs).not.toContain('try_swae_bind_room(')
  })

  it('setbindroom ok fixture is committed and structurally success', () => {
    const raw = read('src-tauri/tests/fixtures/swae_setbindroom_ok.json')
    const fixture = JSON.parse(raw) as {
      ret?: number
      msg?: string
      body?: { roomverify?: string; ret?: number }
    }
    expect(fixture.ret === 0 || fixture.body?.ret === 0).toBe(true)
    expect(String(fixture.msg || '') + String((fixture as { body?: { msg?: string } }).body?.msg || '')).toMatch(
      /成功|绑定/
    )
    expect(fixture.body?.roomverify || '').toMatch(/\d/)
  })
})
