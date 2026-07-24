import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')

const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')

/**
 * #481：智慧迎新只读完整能力
 * - 首页资源分组入口（需登录）
 * - SmartOrientationView 成绩风格只读页
 * - 个人信息仍可读取 profile_blocks（#485 并入保留）
 * - 后端仅只读命令
 */
describe('smart_orientation entry + readonly wiring (#481)', () => {
  it('Dashboard 资源区挂 smart_orientation 入口且 requiresLogin', () => {
    const dash = read('components/Dashboard.vue')
    expect(dash).toContain("id: 'smart_orientation'")
    expect(dash).toMatch(/id:\s*'smart_orientation'[\s\S]{0,260}requiresLogin:\s*true/)
    expect(dash).toMatch(/title:\s*'资源'[\s\S]{0,220}smart_orientation/)
    expect(dash).toContain(
      "['library', 'campus_map', 'resource_share', 'towergo', 'smart_orientation', 'ai']"
    )
  })

  it('App.vue 懒加载 SmartOrientationView', () => {
    const app = read('App.vue')
    expect(app).toContain("import('./components/SmartOrientationView.vue')")
    expect(app).toContain('loadSmartOrientationView')
    expect(app).toContain('smart_orientation: loadSmartOrientationView')
    expect(app).toContain("currentView === 'smart_orientation'")
    expect(app).toContain('<SmartOrientationView')
  })

  it('navigation 映射到 home', () => {
    const nav = read('navigation/app_navigation.ts')
    expect(nav).toContain("smart_orientation: 'home'")
  })

  it('ui_settings / policy 注册模块 id', () => {
    const ui = read('config/ui_settings.ts')
    const policy = read('config/app_store_policy.ts')
    expect(ui).toContain("'smart_orientation'")
    expect(policy).toContain("'smart_orientation'")
    expect(policy).toContain('smartOrientation')
  })

  it('ThemeModuleIcon 含 smart_orientation 图标', () => {
    const icon = read('components/icons/ThemeModuleIcon.vue')
    expect(icon).toContain('smart_orientation:')
  })

  it('SmartOrientationView 只读三命令 + 成绩风格 token', () => {
    const view = read('components/SmartOrientationView.vue')
    expect(view).toContain("invokeNative('smart_orientation_list_panels'")
    expect(view).toContain("invokeNative('smart_orientation_list_messages'")
    expect(view).toContain("invokeNative('smart_orientation_profile_blocks'")
    expect(view).not.toMatch(/smart_orientation_.*(submit|save|upload|confirm)/i)
    expect(view).toContain('TPageHeader')
    expect(view).toContain('TEmptyState')
    expect(view).toContain('var(--ui-')
    expect(view).toContain('只读展示')
    expect(view).toContain('填报请前往官方门户')
  })

  it('StudentInfoView 仍可读 profile_blocks（#485 并入保留）', () => {
    const view = read('components/StudentInfoView.vue')
    expect(view).toContain("invokeNative('smart_orientation_profile_blocks'")
    expect(view).toContain('班导师')
    expect(view).toContain('辅导员')
    expect(view).not.toMatch(/smart_orientation_.*(submit|save|upload)/)
  })

  it('后端注册只读命令且无 submit', () => {
    const lib = read('../src-tauri/src/lib.rs')
    const modrs = read('../src-tauri/src/modules/mod.rs')
    const rs = read('../src-tauri/src/modules/smart_orientation.rs')
    expect(modrs).toContain('smart_orientation')
    expect(lib).toContain('smart_orientation_list_panels')
    expect(lib).toContain('smart_orientation_list_messages')
    expect(lib).toContain('smart_orientation_profile_blocks')
    expect(lib).not.toContain('smart_orientation_submit')
    expect(rs).toContain('list_panels')
    expect(rs).toContain('list_messages')
    expect(rs).toContain('profile_blocks')
    const prod = rs.split('mod tests')[0] || rs
    expect(prod).not.toContain('smart_orientation_submit')
    expect(rs).toContain('orientation_demo_allowed')
    expect(rs).toContain('MINI_HBUT_ORIENTATION_DEMO')
  })

  it('协议文档与脱敏 fixtures 存在', () => {
    const doc = read('../docs/protocol/smart-orientation.md')
    expect(doc).toContain('智慧迎新')
    expect(doc).toContain('只读')
    expect(doc.length).toBeGreaterThan(200)
    const overview = read('../src-tauri/tests/fixtures/smart-orientation/overview.json')
    expect(overview).toContain('panels')
    const messages = read('../src-tauri/tests/fixtures/smart-orientation/messages.json')
    expect(messages).toContain('title')
    const blocks = read('../src-tauri/tests/fixtures/smart-orientation/profile_blocks.json')
    expect(blocks).toMatch(/mentor|counselor|dorm|profile/)
  })
})
