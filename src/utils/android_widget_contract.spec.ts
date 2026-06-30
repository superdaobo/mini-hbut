import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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

  it('handles widget navigation for electricity and exams in App.vue', () => {
    const app = readText('src/App.vue')
    expect(app).toContain('handleWidgetNavigatePayload')
    expect(app).toContain("hostname === 'electricity'")
    expect(app).toContain("hostname === 'exam'")
    expect(app).toContain("addEventListener('widgetNavigate'")
  })

  it('supports responsive today-courses widget layouts', () => {
    const helper = readText('android/app/src/main/java/com/hbut/mini/widget/WidgetLayoutHelper.kt')
    const provider = readText('android/app/src/main/java/com/hbut/mini/widget/TodayCoursesProvider.kt')
    expect(helper).toContain('widget_today_courses_2x2')
    expect(helper).toContain('widget_today_courses_4x1')
    expect(provider).toContain('onAppWidgetOptionsChanged')
  })
})
