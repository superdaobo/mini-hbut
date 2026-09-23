import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readAppContractSources } from './contract_source_test'

const readText = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

describe('android widget contract', () => {
  it('disables the Tauri Android native widget bridge for #894 crash diagnosis', () => {
    const widget = readText('src/platform/capacitor/widget.ts')
    expect(widget).toContain('TAURI_ANDROID_WIDGET_NATIVE_BRIDGE_DISABLED = true')
    expect(widget).toMatch(
      /TAURI_ANDROID_WIDGET_NATIVE_BRIDGE_DISABLED[\s\S]*\?[\s\S]*createNoOpProxy\(\)[\s\S]*:[\s\S]*createTauriAndroidBridge\(\)/
    )
  })

  it('requests refresh exactly once inside platform snapshot writes', () => {
    const bridge = readText('src/utils/widget_bridge.ts')
    const widget = readText('src/platform/capacitor/widget.ts')

    expect(bridge).toContain('requestWidgetRefresh')
    const refreshCallsInBridge = bridge.match(/await requestWidgetRefresh\(\)/g) ?? []
    expect(refreshCallsInBridge).toHaveLength(1)
    expect(widget).toMatch(/writeSnapshotWithRetry[\s\S]*await requestRefresh\(\)/)
    expect(widget).toMatch(/writeElectricitySnapshot[\s\S]*await requestRefresh\(\)/)
    expect(widget).toMatch(/writeExamSnapshot[\s\S]*await requestRefresh\(\)/)
  })

  it('uses minihbut deep links instead of launcher intents in renderers', () => {
    const schedule = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetRenderer.kt')
    const electricity = readText('android/app/src/main/java/com/hbut/mini/widget/ElectricityWidgetRenderer.kt')
    const exam = readText('android/app/src/main/java/com/hbut/mini/widget/ExamWidgetRenderer.kt')
    const deepLink = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetDeepLink.kt')

    expect(deepLink).toContain('minihbut')
    expect(schedule).toContain('WidgetDeepLink.scheduleUri')
    expect(electricity).toContain('WidgetDeepLink.electricityUri')
    expect(exam).toContain('WidgetDeepLink.examUri')
    expect(schedule).not.toContain('CATEGORY_LAUNCHER')
    expect(electricity).not.toContain('CATEGORY_LAUNCHER')
    expect(exam).not.toContain('CATEGORY_LAUNCHER')
  })

  it('registers electricity and exam deep link hosts in manifest', () => {
    const manifest = readText('android/app/src/main/AndroidManifest.xml')
    expect(manifest).toContain('android:host="electricity"')
    expect(manifest).toContain('android:host="exam"')
  })

  it('handles widget navigation for electricity and exams (unified deep-link parser)', () => {
    const app = readAppContractSources()
    const deepLink = readText('src/platform/deep_link.ts')
    expect(app).toContain('const handleNavigatePayload = (payload')
    expect(app).toContain("addEventListener('widgetNavigate'")
    // #621：深链解析统一迁移到 src/platform/deep_link.ts（单一 minihbut:// 入口），
    // electricity/exam host 映射与 widgetNavigate 事件消费仍保持原契约。
    expect(deepLink).toContain("host === 'electricity'")
    expect(deepLink).toContain("host === 'exam'")
    expect(deepLink).toContain('parseMiniHbutDeepLink')
  })

  it('supports responsive today-courses widget layouts', () => {
    const helper = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetLayoutHelper.kt')
    const provider = readText('android/app/src/main/java/com/hbut/mini/widget/TodayCoursesProvider.kt')
    expect(helper).toContain('widget_today_courses_2x2')
    expect(helper).toContain('widget_today_courses_4x1')
    expect(provider).toContain('onAppWidgetOptionsChanged')
  })

  it('wires three-state widget theme mode through Tauri and Android resources', () => {
    const lib = readText('src-tauri/src/lib.rs')
    const tauriWidget = readText('src-tauri/src/transport/tauri/widget.rs')
    const store = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetDataStore.kt')
    const themeMode = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetThemeMode.kt')
    const patchScript = readText('scripts/patch_android_widget.py')

    expect(lib).toContain('transport::tauri::widget::write_widget_theme_mode')
    expect(lib).toContain('transport::tauri::widget::request_widget_refresh')
    expect(tauriWidget).toContain('pub(crate) async fn write_widget_theme_mode')
    expect(tauriWidget).toContain('pub(crate) async fn request_widget_refresh')
    expect(tauriWidget).toContain('name="theme_mode"')
    expect(store).toContain('fun writeThemeMode(mode: String)')
    expect(themeMode).toContain('widget_background_light')
    expect(themeMode).toContain('widget_background_dark')

    for (const resource of [
      'res/values-night/colors_widget.xml',
      'res/values-v31/colors_widget.xml',
      'res/values-night-v31/colors_widget.xml',
      'res/drawable/widget_background_light.xml',
      'res/drawable/widget_background_dark.xml',
      'res/drawable-v31/widget_background.xml'
    ]) {
      expect(patchScript).toContain(resource)
    }
  })

  it('keeps native semester-index support but disables schedule_index on the app boot path', () => {
    const resolver = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetScheduleResolver.kt')
    const renderer = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetRenderer.kt')
    const service = readText('android/app/src/main/java/com/hbut/mini/widget/TodayCoursesRemoteViewsService.kt')
    const provider = readText('android/app/src/main/java/com/hbut/mini/widget/TodayCoursesProvider.kt')
    const manifest = readText('android/app/src/main/AndroidManifest.xml')
    const patchScript = readText('scripts/patch_android_widget.py')
    const bridge = readText('src/utils/widget_bridge.ts')

    expect(resolver).toContain('schedule_index')
    expect(resolver).toContain('Asia/Shanghai')
    expect(resolver).toContain('base_week_index')
    expect(resolver).toContain('start_date')
    expect(renderer).toContain('WidgetScheduleResolver.resolveToday')
    expect(service).toContain('WidgetScheduleResolver.resolveToday')
    expect(bridge).not.toContain('buildWidgetScheduleIndex')
    expect(bridge).not.toContain('snapshot.schedule_index')
    expect(provider).toContain('Intent.ACTION_DATE_CHANGED')
    expect(provider).toContain('Intent.ACTION_TIME_CHANGED')
    expect(provider).toContain('Intent.ACTION_TIMEZONE_CHANGED')
    for (const action of [
      'android.intent.action.DATE_CHANGED',
      'android.intent.action.TIME_SET',
      'android.intent.action.TIMEZONE_CHANGED'
    ]) {
      expect(manifest).toContain(action)
      expect(patchScript).toContain(action)
    }
  })

  it('serializes Tauri widget preference writes and uses unique temp files', () => {
    const tauriWidget = readText('src-tauri/src/transport/tauri/widget.rs')
    expect(tauriWidget).toContain('WIDGET_PREFS_WRITE_LOCK')
    expect(tauriWidget).toContain('WIDGET_PREFS_WRITE_LOCK.lock().await')
    expect(tauriWidget).toContain('WIDGET_TMP_COUNTER.fetch_add')
    expect(tauriWidget).toContain('"{}.{}.{}.tmp"')
    expect(tauriWidget).not.toContain('"{}.{}.tmp"')
  })
})
