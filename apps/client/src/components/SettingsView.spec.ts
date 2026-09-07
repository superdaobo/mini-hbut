import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('SettingsView emits declaration', () => {
  it('declares the workspace layout event passed by App.vue', () => {
    const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8')

    expect(source).toContain("defineEmits(['back', 'openWorkspaceLayout'])")
  })
})

describe('SettingsView 深浅色三态（#757）', () => {
  it('外置模板提供三态选择（labelKey/descKey 经 t() 取词）并绑定三态状态', () => {
    const template = readFileSync(
      new URL('../templates/views/SettingsView.html', import.meta.url),
      'utf8'
    )

    // 三态选项渲染自 nightModeOptions（#787 起 label/desc 经 t(item.labelKey)/t(item.descKey) 取词）
    expect(template).toContain('v-for="item in nightModeOptions"')
    expect(template).toContain(':class="{ active: nightModePreference === item.key }"')
    expect(template).toContain('@click="setNightMode(item.key)"')
    expect(template).toContain('{{ t(item.labelKey) }}')
    expect(template).toContain('{{ t(item.descKey) }}')
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

describe('SettingsView 全量文案接入 t()（#787）', () => {
  it('模板：sections 标题、后端字段、probe/debug/fontModal 全部经 t() 取词（抽样断言）', () => {
    const template = readFileSync(
      new URL('../templates/views/SettingsView.html', import.meta.url),
      'utf8'
    )

    // sections 标题
    expect(template).toContain("t('settings.theme.title')")
    expect(template).toContain("t('settings.personalize.title')")
    expect(template).toContain("t('settings.profile.title')")
    expect(template).toContain("t('settings.font.title')")
    expect(template).toContain("t('settings.backend.title')")
    expect(template).toContain("t('settings.security.title')")
    expect(template).toContain("t('settings.debug.title')")
    // 后端字段标签（抽样）
    expect(template).toContain("t('settings.backend.field.ocr')")
    expect(template).toContain("t('settings.backend.field.uploadCooldown')")
    // 云同步 / probe / 调试 / 字体弹窗（抽样）
    expect(template).toContain("t('settings.backend.cloudSync.title')")
    expect(template).toContain("t(item.labelKey)")
    expect(template).toContain("t(option.labelKey)")
    expect(template).toContain("t('settings.font.modal.retryDownload')")
    // 全屏主题过渡文案
    expect(template).toContain("t('settings.theme.overlay.dark')")
  })

  it('脚本：数据驱动数组改为 labelKey/descKey，toast/debugLog 经 t()/tr() 取词', () => {
    const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8')

    // 数据驱动选项 key 化（渲染时 t() 取词保证 locale 切换即时重渲染）
    expect(source).toContain("labelKey: 'settings.theme.system.label'")
    expect(source).toContain("labelKey: 'settings.probe.ocr.label'")
    expect(source).toContain("descKey: 'settings.profile.classic.desc'")
    // 插值工具与 toast 文案
    expect(source).toContain('const tr = (key, params = {}) => {')
    expect(source).toContain("t('settings.toast.probeDone')")
    expect(source).toContain("t('settings.toast.backendApplied')")
    // 不得再出现硬编码中文 toast/拼接文案
    expect(source).not.toContain('showToast(`')
    expect(source).not.toContain("showToast('")
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
