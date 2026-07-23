import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canOpenModule } from './moduleAccess'

/**
 * 只做「入口接线」断言：失败条件是「删除 canOpenModule 调用 / 改回硬编码 navigate」。
 * 策略行为见 moduleAccess.spec.ts；Rust 生产纯函数见 cargo tests。
 */
const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

describe('campus entry wiring uses canOpenModule', () => {
  it('Dashboard.navigateTo calls canOpenModule before emit navigate', () => {
    const dash = read('src/components/Dashboard.vue')
    expect(dash).toContain("from '../utils/moduleAccess'")
    const nav = dash.indexOf('const navigateTo = (moduleId)')
    const access = dash.indexOf('canOpenModule(', nav)
    const emit = dash.indexOf("emit('navigate'", nav)
    expect(nav).toBeGreaterThan(-1)
    expect(access).toBeGreaterThan(nav)
    expect(emit).toBeGreaterThan(access)
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

  it('runtime policy blocks sports_venue (not only static available flag)', () => {
    // 与 Dashboard 数据无关：硬表禁用，available:true 也拦
    const r = canOpenModule(
      { id: 'sports_venue', available: true, requiresLogin: true },
      { isLoggedIn: true }
    )
    expect(r.ok).toBe(false)
  })
})
