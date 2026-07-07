import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

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
    expect(source).toContain('KeepAliveForegroundService.java')
    expect(source).toContain('BootCompletedReceiver.java')
    expect(source).toContain('stale_capacitor_sources')
    expect(source).toContain('stale.unlink()')
    expect(source).toContain('res/drawable/ic_stat_mini_hbut.xml')
    expect(source).toContain('if "KeepAliveForegroundService" not in text:')
    expect(source).toContain('if "BootCompletedReceiver" not in text:')
    expect(widgetRegisteredCheck).toBeGreaterThan(0)
    expect(source.slice(Math.max(0, widgetRegisteredCheck - 160), widgetRegisteredCheck)).not.toContain('return True')
    expect(source).toContain('android:exported="true"')
    expect(source).toContain('FOREGROUND_SERVICE_DATA_SYNC')
  })

  it('does not inject Capacitor-only Java sources into generated Tauri Android projects', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-tauri-native-'))
    const projectRoot = path.join(tempRoot, 'project')
    const capacitorMain = path.join(projectRoot, 'android', 'app', 'src', 'main')
    const tauriMain = path.join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main')
    const nativeDir = path.join(capacitorMain, 'java', 'com', 'hbut', 'mini')
    const generatedNativeDir = path.join(tauriMain, 'java', 'com', 'hbut', 'mini')

    const nativeFiles = [
      'HBUTNativePlugin.java',
      'MiniHbutWidgetPlugin.java',
      'KeepAliveForegroundService.java',
      'BootCompletedReceiver.java',
      'BackgroundFetchHeadlessTask.java'
    ]

    fs.mkdirSync(nativeDir, { recursive: true })
    fs.mkdirSync(generatedNativeDir, { recursive: true })
    for (const file of nativeFiles) {
      fs.writeFileSync(path.join(nativeDir, file), `// source ${file}\n`, 'utf8')
      fs.writeFileSync(path.join(generatedNativeDir, file), `// stale ${file}\n`, 'utf8')
    }

    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3'
    const python = [
      'from pathlib import Path',
      'import importlib.util',
      `spec = importlib.util.spec_from_file_location("patch_android_widget", ${JSON.stringify(
        path.resolve(process.cwd(), 'scripts/patch_android_widget.py')
      )})`,
      'mod = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(mod)',
      `mod.PROJECT_DIR = Path(${JSON.stringify(projectRoot)})`,
      `mod.TAURI_ANDROID = Path(${JSON.stringify(tauriMain)})`,
      `mod.CAPACITOR_ANDROID = Path(${JSON.stringify(capacitorMain)})`,
      'print(mod.copy_native_sources())'
    ].join('\n')

    try {
      const output = execFileSync(pythonExecutable, ['-c', python], {
        encoding: 'utf8'
      })

      expect(output).toContain('True')
      expect(fs.existsSync(path.join(generatedNativeDir, 'KeepAliveForegroundService.java'))).toBe(true)
      expect(fs.existsSync(path.join(generatedNativeDir, 'BootCompletedReceiver.java'))).toBe(true)
      expect(fs.existsSync(path.join(generatedNativeDir, 'HBUTNativePlugin.java'))).toBe(false)
      expect(fs.existsSync(path.join(generatedNativeDir, 'MiniHbutWidgetPlugin.java'))).toBe(false)
      expect(fs.existsSync(path.join(generatedNativeDir, 'BackgroundFetchHeadlessTask.java'))).toBe(false)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
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

  it('wires school inbox checks through notify_center and Tauri command', () => {
    const notifySource = readText('src/utils/notify_center.js')
    const libSource = readText('src-tauri/src/lib.rs')

    expect(notifySource).toContain("schoolInbox: 'hbu_notify_school_inbox'")
    expect(notifySource).toContain('checkSchoolInbox')
    expect(notifySource).toContain("invokeNative('school_inbox_fetch'")
    expect(notifySource).toContain('schoolInboxStateKeyFor')
    expect(libSource).toContain('school_inbox_fetch')
  })

  it('syncs school inbox background prefs for Android headless', () => {
    const bgSource = readText('src/utils/background_fetch.js')
    const headlessSource = readText(
      'android/app/src/main/java/com/hbut/mini/BackgroundFetchHeadlessTask.java'
    )

    expect(bgSource).toContain('hbu_bg_enable_school_inbox')
    expect(bgSource).toContain('hbu_bg_login_method')
    expect(bgSource).toContain('hbu_bg_school_inbox_state:')
    expect(headlessSource).toContain('checkSchoolInbox')
    expect(headlessSource).toContain('notice.chaoxing.com/apis/other/getNoticeList')
  })

  it('exposes school inbox toggle in notification settings UI', () => {
    const source = readText('src/components/NotificationView.vue')
    const uiSettings = readText('src/config/ui_settings.ts')

    expect(source).toContain('enableSchoolInboxNotices')
    expect(source).toContain("card.key === 'school_inbox'")
    expect(source).toContain('schoolInboxSummary')
    expect(uiSettings).toContain("'school_inbox'")
  })

  it('registers school inbox browse module on home dashboard and app routing', () => {
    const dashboard = readText('src/components/Dashboard.vue')
    const appSource = readText('src/App.vue')
    const uiSettings = readText('src/config/ui_settings.ts')
    const inboxView = readText('src/components/SchoolInboxView.vue')
    const homeSearch = readText('src/utils/home_search.js')
    const libSource = readText('src-tauri/src/lib.rs')

    expect(dashboard).toContain("id: 'school_inbox'")
    expect(dashboard).toContain("'school_inbox'")
    expect(appSource).toContain("currentView === 'school_inbox'")
    expect(appSource).toContain('loadSchoolInboxView')
    expect(uiSettings).toContain('HomeModuleKey')
    expect(inboxView).toContain("invokeNative('school_inbox_fetch'")
    expect(inboxView).toContain("invokeNative('school_inbox_detail_fetch'")
    expect(inboxView).toContain("invokeNative('school_inbox_mark_read'")
    expect(inboxView).toContain('openExternal')
    expect(inboxView).toContain('scrollSchoolInboxToTop')
    expect(inboxView).toContain('restoreListScroll')
    expect(libSource).toContain('school_inbox_detail_fetch')
    expect(libSource).toContain('school_inbox_mark_read')
    expect(homeSearch).toContain('school_inbox:')
    expect(readText('src/styles/dark-mode.css')).toContain('.school-inbox-page')
  })

  it('filters read school inbox items before enqueueing notifications', () => {
    const notifySource = readText('src/utils/notify_center.js')

    expect(notifySource).toContain('isSchoolInboxItemRead')
    expect(notifySource).toContain('is_read')
    expect(notifySource).toContain('isRead')
    expect(notifySource).toContain('markSchoolInboxNotified')
    expect(notifySource).toMatch(/!isSchoolInboxItemRead\(item\)/)
  })

  it('syncs school inbox read state into notify dedup snapshot', () => {
    const inboxView = readText('src/components/SchoolInboxView.vue')
    const headlessSource = readText(
      'android/app/src/main/java/com/hbut/mini/BackgroundFetchHeadlessTask.java'
    )

    expect(inboxView).toContain('markSchoolInboxNotified')
    expect(headlessSource).toContain('optString("isread"')
    expect(headlessSource).toContain('!isRead')
  })

  it('uses Mini-HBUT branding on main tab headers', () => {
    const dashboard = readText('src/components/Dashboard.vue')
    const notificationView = readText('src/components/NotificationView.vue')
    const meView = readText('src/components/MeView.vue')

    expect(dashboard).toContain('Mini-HBUT')
    expect(notificationView).toContain('Mini-HBUT')
    expect(meView).toContain('Mini-HBUT')
    expect(dashboard).not.toContain('HBUT 校园助手')
    expect(notificationView).not.toContain('HBUT 校园助手')
    expect(meView).not.toContain('HBUT 校园助手')
  })
})
