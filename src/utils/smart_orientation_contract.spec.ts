import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

describe('smart_orientation entry + read-only wiring (#457)', () => {
  it('Dashboard 资源 group includes smart_orientation with login required', () => {
    const dash = read('src/components/Dashboard.vue')
    expect(dash).toMatch(/id:\s*'smart_orientation'/)
    expect(dash).toMatch(/id:\s*'smart_orientation'[\s\S]{0,260}requiresLogin:\s*true/)
    expect(dash).toMatch(/title:\s*'资源'[\s\S]{0,220}smart_orientation/)
  })

  it('App registers view loader and template branch', () => {
    const app = read('src/App.vue')
    expect(app).toContain('loadSmartOrientationView')
    expect(app).toContain("smart_orientation: loadSmartOrientationView")
    expect(app).toContain("currentView === 'smart_orientation'")
    expect(app).toContain('SmartOrientationView')
  })

  it('frontend view is read-only and uses three fetch commands', () => {
    const view = read('src/components/SmartOrientationView.vue')
    expect(view).toContain("invokeNative('smart_orientation_list_panels'")
    expect(view).toContain("invokeNative('smart_orientation_list_messages'")
    expect(view).toContain("invokeNative('smart_orientation_profile_blocks'")
    expect(view).not.toMatch(
      /smart_orientation_submit|smart_orientation_save|smart_orientation_upload/
    )
    expect(view).toContain('var(--ui-')
    expect(view).toMatch(/班导师|辅导员/)
    expect(view).toContain('宿舍')
  })

  it('protocol doc and fixtures exist', () => {
    const doc = read('docs/protocol/smart-orientation.md')
    expect(doc).toContain('智慧迎新')
    expect(doc.length).toBeGreaterThan(200)
    const overview = read('src-tauri/tests/fixtures/smart-orientation/overview.json')
    expect(overview).toContain('panels')
    const messages = read('src-tauri/tests/fixtures/smart-orientation/messages.json')
    expect(messages).toContain('title')
    const blocks = read('src-tauri/tests/fixtures/smart-orientation/profile_blocks.json')
    expect(blocks).toMatch(/mentor|counselor|dorm|profile/)
  })

  it('rust registers readonly commands only', () => {
    const rs = read('src-tauri/src/modules/smart_orientation.rs')
    expect(rs).toContain('list_panels')
    expect(rs).toContain('list_messages')
    expect(rs).toContain('profile_blocks')
    // 生产路径不含写命令（排除 tests 模块字符串）
    const prod = rs.split('mod tests')[0] || rs
    expect(prod).not.toContain('smart_orientation_' + 'submit')
    expect(prod).toContain('idaas/login')
    expect(prod).toContain('/account/base/student/myInfo')
    const lib = read('src-tauri/src/lib.rs')
    expect(lib).toContain('smart_orientation_list_panels')
    expect(lib).toContain('smart_orientation_list_messages')
    expect(lib).toContain('smart_orientation_profile_blocks')
    const modrs = read('src-tauri/src/modules/mod.rs')
    expect(modrs).toContain('smart_orientation')
  })
})
