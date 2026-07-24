import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')

const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')

/**
 * #485：班导师/辅导员/宿舍并入个人信息，移除首页智慧迎新独立入口与独立页。
 * 后端 `smart_orientation_profile_blocks` 仍保留。
 */
describe('orientation blocks in student info (#485)', () => {
  it('Dashboard 资源区不再挂 smart_orientation 入口', () => {
    const dash = read('components/Dashboard.vue')
    expect(dash).not.toContain("id: 'smart_orientation'")
    expect(dash).not.toMatch(/title:\s*'资源'[\s\S]{0,220}smart_orientation/)
  })

  it('App.vue 不再懒加载 SmartOrientationView', () => {
    const app = read('App.vue')
    expect(app).not.toContain("import('./components/SmartOrientationView.vue')")
    expect(app).not.toContain('loadSmartOrientationView')
    expect(app).not.toContain("currentView === 'smart_orientation'")
    expect(app).not.toContain('<SmartOrientationView')
  })

  it('navigation 无 smart_orientation 映射', () => {
    const nav = read('navigation/app_navigation.ts')
    expect(nav).not.toContain('smart_orientation')
  })

  it('ui_settings 默认模块序无 smart_orientation', () => {
    const ui = read('config/ui_settings.ts')
    expect(ui).not.toContain("'smart_orientation'")
  })

  it('StudentInfoView 拉取 profile_blocks 并展示三项', () => {
    const view = read('components/StudentInfoView.vue')
    expect(view).toContain("invokeNative('smart_orientation_profile_blocks'")
    expect(view).toContain('班导师')
    expect(view).toContain('辅导员')
    expect(view).toContain('宿舍信息')
    expect(view).not.toMatch(/smart_orientation_.*(submit|save|upload)/)
  })

  it('后端仍注册 profile_blocks 只读命令', () => {
    const lib = read('../src-tauri/src/lib.rs')
    expect(lib).toContain('smart_orientation_profile_blocks')
    expect(lib).not.toContain('smart_orientation_submit')
  })
})
