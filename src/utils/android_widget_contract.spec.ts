import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readAppContractSources } from './contract_source_test'

const readText = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

describe('android widget contract', () => {
  it('requests refresh after widget snapshot writes in web bridge', () => {
    const bridge = readText('src/utils/widget_bridge.ts')
    const widget = readText('src/platform/capacitor/widget.ts')

    expect(bridge).toContain('requestWidgetRefresh')
    expect(bridge).toMatch(/afterScheduleRefresh[\s\S]*requestWidgetRefresh/)
    expect(bridge).toMatch(/tryWriteSnapshotFromCache[\s\S]*requestWidgetRefresh/)
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
})
