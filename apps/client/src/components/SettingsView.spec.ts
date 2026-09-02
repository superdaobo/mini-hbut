import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('SettingsView emits declaration', () => {
  it('declares the workspace layout event passed by App.vue', () => {
    const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8')

    expect(source).toContain("defineEmits(['back', 'openWorkspaceLayout'])")
  })
})

describe('SettingsView 深浅色三态（#757）', () => {
  it('外置模板提供 跟随系统/白天/夜间 三态选择并绑定三态状态', () => {
    const template = readFileSync(
      new URL('../templates/views/SettingsView.html', import.meta.url),
      'utf8'
    )

    // 三态选项渲染自 nightModeOptions，激活态绑定 nightModePreference
    expect(template).toContain('v-for="item in nightModeOptions"')
    expect(template).toContain(':class="{ active: nightModePreference === item.key }"')
    expect(template).toContain('@click="setNightMode(item.key)"')
    // 旧版二态 toggle 已移除
    expect(template).not.toContain('toggleDarkMode')
    expect(template).not.toContain('theme-toggle-track')
  })

  it('脚本使用三态 night_mode API（含 system 迁移语义），不再仅二态切换', () => {
    const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8')

    expect(source).toContain('getNightModePreference()')
    expect(source).toContain('setNightModePreference(mode)')
    expect(source).toContain('resolveNightModeDark(mode)')
    // 旧版二态切换入口已移除
    expect(source).not.toContain('toggleDarkMode')
    expect(source).not.toContain('applyNightModePreference(')
  })
})
