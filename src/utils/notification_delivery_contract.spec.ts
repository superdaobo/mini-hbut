import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('notification delivery contract', () => {
  it('does not request system notification permission during manual checks', () => {
    const source = readText('src/components/NotificationView.vue')
    const manualCheckBlock = source.match(
      /const runManualCheck = async \(\) => \{[\s\S]*?\n\}/
    )?.[0] || ''

    expect(manualCheckBlock).toContain('allowPermissionPrompt: false')
    expect(manualCheckBlock).not.toContain('allowPermissionPrompt: true')
    expect(manualCheckBlock).not.toContain('requestNotificationPermission')
  })

  it('only requests Android notification permission from the explicit permission action', () => {
    const source = readText('src/components/NotificationView.vue')
    const permissionStart = source.indexOf('const handleRequestPermission = async () => {')
    const permissionBlock = permissionStart >= 0 ? source.slice(permissionStart, permissionStart + 700) : ''
    const testNotificationBlock = source.match(
      /const handleTestNotification = async \(\) => \{[\s\S]*?\n\}/
    )?.[0] || ''

    expect(permissionBlock).toContain('updatePermissionState(true)')
    expect(permissionBlock).toContain('openNotificationSettings')
    expect(testNotificationBlock).toContain('updatePermissionState(false)')
    expect(testNotificationBlock).not.toContain('updatePermissionState(true)')
    expect(testNotificationBlock).not.toContain('requestNotificationPermission')
  })

  it('uses WorkManager for Android widget periodic refresh instead of a placeholder worker', () => {
    const schedulerSource = readText(
      'android/app/src/main/java/com/hbut/mini/widget/WidgetRefreshScheduler.kt'
    )
    const workerSource = readText(
      'android/app/src/main/java/com/hbut/mini/widget/WidgetRefreshWorker.kt'
    )

    expect(schedulerSource).toContain('PeriodicWorkRequestBuilder<WidgetRefreshWorker>')
    expect(schedulerSource).toContain('ExistingPeriodicWorkPolicy.UPDATE')
    expect(schedulerSource).toContain('enqueueUniquePeriodicWork')
    expect(workerSource).toContain('CoroutineWorker')
    expect(workerSource).toContain('WidgetRefreshScheduler.triggerAllImmediate(applicationContext)')
    expect(workerSource).not.toContain('占位文件')
  })

  it('keeps Android headless background fetch writing fresh widget snapshots', () => {
    const source = readText(
      'android/app/src/main/java/com/hbut/mini/BackgroundFetchHeadlessTask.java'
    )

    expect(source).toContain('Headless fetch event received')
    expect(source).toContain('WidgetDataStore')
    expect(source).toContain('updateTodayCoursesWidget(context, prefs, studentId, courses, currentWeek)')
    expect(source).toContain('updateExamWidget(context, prefs, exams)')
    expect(source).toContain('updateElectricityWidget(context, prefs, quantity, rawSelection)')
    expect(source).toContain('WidgetRefreshScheduler.INSTANCE.triggerAllImmediate(context)')
  })

  it('exposes Android notification settings without using the runtime permission prompt path', () => {
    const nativeSource = readText('android/app/src/main/java/com/hbut/mini/HBUTNativePlugin.java')
    const capacitorSource = readText('src/platform/adapters/capacitor.ts')

    expect(nativeSource).toContain('openNotificationSettings')
    expect(nativeSource).toContain('Settings.ACTION_APP_NOTIFICATION_SETTINGS')
    expect(capacitorSource).toContain('plugin.openNotificationSettings')
  })

  it('patches generated Tauri Android projects with WorkManager widget support', () => {
    const source = readText('scripts/patch_android_widget.py')
    const widgetRegisteredCheck = source.indexOf('if "TodayCoursesProvider" not in text:')

    expect(source).toContain('androidx.work:work-runtime-ktx:2.9.0')
    expect(source).toContain('copy_native_sources')
    expect(source).toContain('BackgroundFetchHeadlessTask.java')
    expect(source).toContain('if "KeepAliveForegroundService" not in text:')
    expect(source).toContain('if "BootCompletedReceiver" not in text:')
    expect(widgetRegisteredCheck).toBeGreaterThan(0)
    expect(source.slice(Math.max(0, widgetRegisteredCheck - 160), widgetRegisteredCheck)).not.toContain('return True')
    expect(source).toContain('android:exported="true"')
    expect(source).toContain('FOREGROUND_SERVICE_DATA_SYNC')
  })

  it('configures Capacitor local notifications to show while iOS is foregrounded', () => {
    const source = readText('capacitor.config.ts')

    expect(source).toContain('LocalNotifications')
    expect(source).toContain('presentationOptions')
    expect(source).toContain("'badge'")
    expect(source).toContain("'sound'")
    expect(source).toContain("'alert'")
  })

  it('uses a monochrome Android status-bar icon for native notification builders', () => {
    const backgroundFetchSource = readText(
      'android/app/src/main/java/com/hbut/mini/BackgroundFetchHeadlessTask.java'
    )
    const keepAliveSource = readText(
      'android/app/src/main/java/com/hbut/mini/KeepAliveForegroundService.java'
    )

    expect(backgroundFetchSource).toContain('setSmallIcon(R.drawable.ic_stat_mini_hbut)')
    expect(keepAliveSource).toContain('setSmallIcon(R.drawable.ic_stat_mini_hbut)')
    expect(backgroundFetchSource).not.toContain('setSmallIcon(R.mipmap.ic_launcher)')
    expect(keepAliveSource).not.toContain('setSmallIcon(R.mipmap.ic_launcher)')
  })

  it('keeps local debug Android installs separate from the signed production package', () => {
    const source = readText('android/app/build.gradle')
    const debugBlock = source.match(/debug \{[\s\S]*?\n        \}/)?.[0] || ''
    const releaseBlock = source.match(/release \{[\s\S]*?\n        \}/)?.[0] || ''

    expect(source).toContain('applicationId "com.hbut.mini"')
    expect(debugBlock).toContain('applicationIdSuffix ".debug"')
    expect(debugBlock).toContain('versionNameSuffix "-debug"')
    expect(releaseBlock).not.toContain('applicationIdSuffix')
  })

  it('keeps Android BackgroundFetch headless class names aligned with each application id', () => {
    const pluginSource = readText(
      'node_modules/@transistorsoft/capacitor-background-fetch/android/src/main/java/com/transistorsoft/bgfetch/capacitor/BackgroundFetchPlugin.java'
    )
    const mainActivitySource = readText('android/app/src/main/java/com/hbut/mini/MainActivity.java')
    const releaseHeadlessSource = readText(
      'android/app/src/main/java/com/hbut/mini/BackgroundFetchHeadlessTask.java'
    )
    const debugHeadlessSource = readText(
      'android/app/src/debug/java/com/hbut/mini/debug/BackgroundFetchHeadlessTask.java'
    )

    expect(pluginSource).toContain('getContext().getPackageName() + "." + HEADLESS_CLASSNAME')
    expect(mainActivitySource).not.toContain('registerHeadlessTask')
    expect(releaseHeadlessSource).toContain('package com.hbut.mini;')
    expect(debugHeadlessSource).toContain('package com.hbut.mini.debug;')
    expect(debugHeadlessSource).toContain('new com.hbut.mini.BackgroundFetchHeadlessTask()')
    expect(debugHeadlessSource).toContain('onFetch(Context context, BGTask task)')
  })
})
