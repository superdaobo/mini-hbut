import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readContractSource, readVueContractSource } from '../utils/contract_source_test'

/**
 * 首页模块表 / 分类表 / 快捷入口元数据已在 #1021 抽到 `config/dashboard_modules.ts`
 * （god-file 减行），契约断言因此覆盖「Dashboard.vue + 该配置模块」两处源码；
 * 断言内容本身不变。
 */
const source = () =>
  [readVueContractSource('src/components/Dashboard.vue'), readContractSource('src/config/dashboard_modules.ts')].join('\n')

describe('Dashboard quick entry defaults', () => {
  it('uses exams instead of schedule in the default quick entries', () => {
    const vue = source()

    expect(vue).toContain("const defaultQuickEntries = ['grades', 'exams', 'classroom', 'electricity', 'ranking']")
    expect(vue).not.toContain("const defaultQuickEntries = ['grades', 'schedule', 'classroom', 'electricity', 'ranking']")
    // i18n 迁移（#786）：quickEntryMeta 的 name 存 i18n key，渲染时经 t() 取词
    expect(vue).toContain("exams: { name: 'home.module.exams'")
    expect(vue).toContain("schedule: { name: 'home.module.schedule'")
  })

  it('keeps per-module tinted quick-entry icon surfaces in dark mode', () => {
    const vue = source()
    const darkCss = readFileSync(new URL('../styles/dark-mode.css', import.meta.url), 'utf8')

    expect(vue).toContain('class="quick-entry-icon w-12 h-12')
    expect(vue).toContain(':data-module="item.id"')
    expect(vue).toContain('class="quick-entry-icon w-10 h-10')
    expect(vue).toContain(':data-module="id"')
    expect(vue).toContain('quick-entry-editor-item')
    expect(darkCss).not.toContain('html.dark .quick-entry-icon {\n  background: #000')
    expect(darkCss).toContain('html.dark .bg-blue-50')
    expect(darkCss).toContain('html.dark .quick-entry-editor-item--selected')
  })

  it('App Store guest/demo: drops empty feature categories and filters quick entries', () => {
    const vue = source()
    // 空分组（学习通/一码通被滤空后）不得残留 tab 标题
    expect(vue).toContain('return cats.filter((c) => Array.isArray(c.modules) && c.modules.length > 0)')
    // 快捷入口与编辑器均走 isModuleAllowed
    expect(vue).toContain('isModuleAllowed(item.id, homeModuleDisplaySessionOpts())')
    expect(vue).toContain('filterAllowedModules(scoped, homeModuleDisplaySessionOpts())')
    expect(vue).toContain('isModuleAllowed(moduleId, appStoreSessionOpts())')
    expect(vue).toContain('editableQuickEntryMeta')
    expect(vue).toContain('v-for="(meta, id) in editableQuickEntryMeta"')
  })
})

describe('Dashboard 今日安排个人日程契约 (#850)', () => {
  it('按今天的绝对日期读取个人日程并与课程合并排序', () => {
    const vue = source()

    expect(vue).toContain('/v2/schedule/event/list-range')
    expect(vue).toContain('start_date: date')
    expect(vue).toContain('end_date: date')
    expect(vue).toContain('buildTodayPersonalEvents')
    expect(vue).toContain('mergeTodayTimelineItems')
    expect(vue).toContain("kind: 'event'")
    expect(vue).toContain('a.startMinutes - b.startMinutes')
  })

  it('日程接口失败独立降级，且 CRUD/云恢复信号会刷新当前账号的今日安排', () => {
    const vue = source()

    expect(vue).toContain('fetchPersonalEventsForToday')
    expect(vue).toContain('catch (_error) {')
    expect(vue).toContain('return []')
    expect(vue).toContain('SCHEDULE_EVENT_CHANGED_EVENT')
    expect("String(detail?.studentId || '').trim() !== String(props.studentId || '').trim()")
    expect(vue).toContain('void fetchTodayCourses()')
  })
})

describe('Dashboard 全局离线状态指示（E2 #1147，epic #1145）', () => {
  const readLocale = (name: string) =>
    readFileSync(new URL(`../utils/i18n/messages/${name}.ts`, import.meta.url), 'utf8')

  it('deviceOnline=false 且已登录：横幅 title/phase 优先 deviceOffline 相位（先于所有会话恢复分支）', () => {
    const vue = readVueContractSource('src/components/Dashboard.vue')
    const titleBlock = vue.slice(vue.indexOf('const maintenanceTitle'), vue.indexOf('const maintenancePhaseLabel'))
    const phaseBlock = vue.slice(vue.indexOf('const maintenancePhaseLabel'), vue.indexOf('const maintenanceNotices'))

    // 离线相位分支必须存在且先于现有 cached_offline 分支（优先级保证）
    expect(titleBlock.indexOf("t('home.maint.title.deviceOffline')")).toBeGreaterThan(-1)
    expect(titleBlock.indexOf("t('home.maint.title.deviceOffline')")).toBeLessThan(titleBlock.indexOf("t('home.maint.title.cachedOffline')"))
    expect(phaseBlock.indexOf("t('home.maint.phase.deviceOffline')")).toBeGreaterThan(-1)
    expect(phaseBlock.indexOf("t('home.maint.phase.deviceOffline')")).toBeLessThan(phaseBlock.indexOf("t('home.maint.phase.cachedOffline')"))
    // 离线相位仅在「已登录 && deviceOnline === false」时生效；未登录时维持现有行为
    expect(vue).toContain('const isDeviceOffline = computed(() => props.isLoggedIn && authStore.deviceOnline === false)')
  })

  it('状态点：离线+已登录 → red（与失败态一致，不新增颜色）；在线时不进入新分支（原行为不变）', () => {
    const vue = readVueContractSource('src/components/Dashboard.vue')
    const dotBlock = vue.slice(vue.indexOf('const sessionStatusVisual'))
    const guardIdx = dotBlock.indexOf("if (!props.isLoggedIn) return 'red'")
    const offlineIdx = dotBlock.indexOf("if (authStore.deviceOnline === false) return 'red'")
    expect(guardIdx).toBeGreaterThan(-1)
    // 离线红点紧跟未登录守卫之后，先于在线会话状态分支
    expect(offlineIdx).toBeGreaterThan(guardIdx)
    expect(offlineIdx).toBeLessThan(dotBlock.indexOf("const online = String(onlineSessionState.value || '')"))
  })

  it('详情提示：deviceOffline 提示优先（含优先于父级 hint prop），在线时回落到原分支链', () => {
    const vue = readVueContractSource('src/components/Dashboard.vue').replace(/\r\n/g, '\n')
    expect(vue).toContain("{{ isDeviceOffline\n            ? t('home.maint.hint.deviceOffline')")
    // 原分支链完整保留
    expect(vue).toContain("t('home.maint.hint.cachedOffline')")
    expect(vue).toContain("t('home.maint.hint.recovering')")
    expect(vue).toContain("t('home.maint.hint.generic')")
  })

  it('三语新增 key 齐备且 zh 文案符合约定', () => {
    const zh = readLocale('zh-CN')
    const en = readLocale('en')
    const ja = readLocale('ja')
    for (const key of ['home.maint.title.deviceOffline', 'home.maint.phase.deviceOffline', 'home.maint.hint.deviceOffline']) {
      expect(zh).toContain(`'${key}':`)
      expect(en).toContain(`'${key}':`)
      expect(ja).toContain(`'${key}':`)
    }
    expect(zh).toContain("'home.maint.title.deviceOffline': '当前离线',")
    expect(zh).toContain("'home.maint.hint.deviceOffline': '当前离线 · 展示本地缓存数据 · 恢复网络后自动刷新',")
  })
})
