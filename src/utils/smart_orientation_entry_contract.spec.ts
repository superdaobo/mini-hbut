import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')

const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')

describe('smart_orientation entry wiring (#461)', () => {
  it('Dashboard resource group includes smart_orientation with requiresLogin', () => {
    const dash = read('components/Dashboard.vue')
    expect(dash).toContain("id: 'smart_orientation'")
    expect(dash).toMatch(/smart_orientation[\s\S]*?requiresLogin:\s*true/)
    expect(dash).toContain("'smart_orientation'")
    expect(dash).toMatch(/资源[\s\S]*smart_orientation/)
  })

  it('App.vue lazy-loads SmartOrientationView', () => {
    const app = read('App.vue')
    expect(app).toContain("import('./components/SmartOrientationView.vue')")
    expect(app).toContain('smart_orientation: loadSmartOrientationView')
    expect(app).toContain('currentView === \'smart_orientation\'')
    expect(app).toContain('<SmartOrientationView')
  })

  it('navigation parent map points home', () => {
    const nav = read('navigation/app_navigation.ts')
    expect(nav).toContain('smart_orientation: \'home\'')
  })

  it('policy and ui settings register module id', () => {
    const policy = read('config/app_store_policy.ts')
    const ui = read('config/ui_settings.ts')
    expect(policy).toContain("'smart_orientation'")
    expect(policy).toContain('smartOrientation')
    expect(ui).toContain("'smart_orientation'")
  })
})
