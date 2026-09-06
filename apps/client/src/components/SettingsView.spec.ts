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

describe('SettingsView 语言选择（#773）', () => {
  it('外置模板提供语言 section，含两枚语言选项并绑定 handleLocaleChange', () => {
    const template = readFileSync(
      new URL('../templates/views/SettingsView.html', import.meta.url),
      'utf8'
    )

    // 语言 section 独立存在，渲染自 localeOptions，激活态绑定响应式 locale
    expect(template).toContain('v-for="item in localeOptions"')
    expect(template).toContain(':class="{ active: locale === item.key }"')
    expect(template).toContain('@click="handleLocaleChange(item.key)"')
    // 两枚选项标签（语言名按惯例不翻译）
    expect(template).toContain("item.label")
    // 说明文案接入 t()
    expect(template).toContain("t('settings.language.hint')")
    expect(template).toContain("t('settings.language.label')")
  })

  it('设置页 header 标题与四个 tab 文案接入 t()', () => {
    const template = readFileSync(
      new URL('../templates/views/SettingsView.html', import.meta.url),
      'utf8'
    )

    expect(template).toContain("{{ t('settings.title') }}")
    expect(template).toContain("{{ t('settings.tab.appearance') }}")
    expect(template).toContain("{{ t('settings.tab.backend') }}")
    expect(template).toContain("{{ t('settings.tab.security') }}")
    expect(template).toContain("{{ t('settings.tab.debug') }}")
  })

  it('脚本接入 useLocale 并提供 handleLocaleChange（点击即切 + toast 反馈）', () => {
    const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8')

    expect(source).toContain("from '../utils/app_i18n'")
    expect(source).toContain('useLocale()')
    expect(source).toContain('localeOptions')
    expect(source).toContain('const handleLocaleChange = (next) => {')
    expect(source).toContain('setLocale(next)')
    expect(source).toContain("t('settings.language.toast')")
  })
})

describe('App.vue 底部导航语言接入（#773）', () => {
  it('四个主 tab 标签通过 tLocale() 取词', () => {
    const source = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')

    expect(source).toContain("tLocale('tab.home')")
    expect(source).toContain("tLocale('tab.schedule')")
    expect(source).toContain("tLocale('tab.notifications')")
    expect(source).toContain("tLocale('tab.me')")
  })
})
