import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { readAppContractSources, readVueContractSource } from './contract_source_test'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const readTree = (relativePath: string, extensionPattern: RegExp) => {
  const root = path.join(repoRoot, relativePath)
  if (!fs.existsSync(root)) return ''
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile() && extensionPattern.test(entry.name)) files.push(absolute)
    }
  }
  walk(root)
  return files.sort().map((file) => fs.readFileSync(file, 'utf8')).join('\n')
}

const notificationSources = () =>
  readVueContractSource('src/components/NotificationView.vue') +
  '\n' +
  readTree('src/features/notification', /\.(?:ts|vue)$/)

const appSources = () => readAppContractSources() + '\n' + readTree('src/app', /\.(?:ts|vue)$/)

const tauriTransportSources = () =>
  readText('src-tauri/src/lib.rs') + '\n' + readTree('src-tauri/src/transport/tauri', /\.rs$/)

describe('notification delivery contract', () => {
  it('does not request system notification permission during manual checks', () => {
    const source = notificationSources()
    const manualCheckBlock = source.match(
      /const runManualCheck = async \(\) => \{[\s\S]*?\n\}/
    )?.[0] || ''

    expect(manualCheckBlock).toContain('allowPermissionPrompt: false')
    expect(manualCheckBlock).not.toContain('allowPermissionPrompt: true')
    expect(manualCheckBlock).not.toContain('requestNotificationPermission')
  })

  it('only requests Android notification permission from the explicit permission action', () => {
    const source = notificationSources()
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

  it('keeps widget refresh on WorkManager instead of legacy headless/keepalive paths (#616)', () => {
    const mainSource = readText('android/app/src/main/java/com/hbut/mini/MainActivity.java')
    const manifest = readText('android/app/src/main/AndroidManifest.xml')
    const root = path.join(repoRoot, 'android/app/src/main/java/com/hbut/mini')

    expect(fs.existsSync(path.join(root, 'BackgroundFetchHeadlessTask.java'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'KeepAliveForegroundService.java'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'BootCompletedReceiver.java'))).toBe(false)
    expect(mainSource).not.toContain('registerHeadlessTask')
    expect(manifest).not.toContain('KeepAliveForegroundService')
    expect(manifest).not.toContain('BootCompletedReceiver')
    expect(manifest).not.toContain('RECEIVE_BOOT_COMPLETED')
    expect(manifest).not.toContain('FOREGROUND_SERVICE')
  })

  it('keeps widget providers and WorkManager refresh registered in the Android manifest', () => {
    const manifest = readText('android/app/src/main/AndroidManifest.xml')

    expect(manifest).toContain('com.hbut.mini.widget.TodayCoursesProvider')
    expect(manifest).toContain('com.hbut.mini.widget.ElectricityWidgetProvider')
    expect(manifest).toContain('com.hbut.mini.widget.ExamWidgetProvider')
    expect(manifest).toContain('com.hbut.mini.widget.TodayCoursesRemoteViewsService')
  })

  it('exposes Android notification settings without using the runtime permission prompt path', () => {
    const nativeSource = readText('android/app/src/main/java/com/hbut/mini/HBUTNativePlugin.java')
    const capacitorSource = readText('src/platform/adapters/capacitor.ts')

    expect(nativeSource).toContain('openNotificationSettings')
    expect(nativeSource).toContain('Settings.ACTION_APP_NOTIFICATION_SETTINGS')
    expect(nativeSource).not.toContain('KeepAliveForegroundService')
    expect(capacitorSource).toContain('plugin.openNotificationSettings')
  })

  it('patches generated Tauri Android projects with WorkManager widget support', () => {
    const source = readText('scripts/patch_android_widget.py')
    const widgetRegisteredCheck = source.indexOf('if "TodayCoursesProvider" not in text:')

    expect(source).toContain('androidx.work:work-runtime-ktx:2.9.0')
    expect(source).toContain('copy_native_sources')
    // #616：KeepAlive/BootCompleted 进入 stale 清单，从生成工程移除而非复制
    expect(source).toContain('stale_capacitor_sources')
    expect(source).toContain('stale.unlink()')
    expect(source).toContain('java/com/hbut/mini/KeepAliveForegroundService.java')
    expect(source).toContain('java/com/hbut/mini/BootCompletedReceiver.java')
    expect(source).toContain('res/drawable/ic_stat_mini_hbut.xml')
    expect(source).not.toContain('if "KeepAliveForegroundService" not in text:')
    expect(source).not.toContain('if "BootCompletedReceiver" not in text:')
    // 注入的权限清单不再包含旧保活/BOOT 权限
    const requiredBlock = source.match(/required_permissions = \[[\s\S]*?\]/)?.[0] || ''
    expect(requiredBlock).not.toContain('FOREGROUND_SERVICE')
    expect(requiredBlock).not.toContain('RECEIVE_BOOT_COMPLETED')
    expect(requiredBlock).not.toContain('WAKE_LOCK')
    expect(widgetRegisteredCheck).toBeGreaterThan(0)
    expect(source.slice(Math.max(0, widgetRegisteredCheck - 160), widgetRegisteredCheck)).not.toContain('return True')
    expect(source).toContain('android:exported="true"')
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
      // #616：全部 Capacitor-only/保活类都不再进入生成的 Tauri 工程
      expect(fs.existsSync(path.join(generatedNativeDir, 'KeepAliveForegroundService.java'))).toBe(false)
      expect(fs.existsSync(path.join(generatedNativeDir, 'BootCompletedReceiver.java'))).toBe(false)
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

  it('uses a monochrome/system status-bar small icon in native notification builders (#616)', () => {
    // 旧 HeadlessTask / KeepAliveForegroundService 已退役；新 Tauri 后台插件
    // 的本地通知一律使用系统单色小图标（stat_notify_*），不得用彩色启动图标。
    const root = path.join(repoRoot, 'android/app/src/main/java/com/hbut/mini')
    expect(fs.existsSync(path.join(root, 'BackgroundFetchHeadlessTask.java'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'KeepAliveForegroundService.java'))).toBe(false)

    const pluginSources = readTree(
      'src-tauri/plugins/tauri-plugin-hbut-background/android/src/main/kotlin/com/hbut/mini/background',
      /\.kt$/
    )
    expect(pluginSources).toContain('setSmallIcon')
    expect(pluginSources).not.toContain('setSmallIcon(R.mipmap.ic_launcher)')
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

  it('retires the Capacitor BackgroundFetch dependency graph (#616)', () => {
    const packageJson = readText('package.json')

    expect(packageJson).not.toContain('@transistorsoft/capacitor-background-fetch')
    expect(packageJson).not.toContain('@capacitor/preferences')
  })

  it('wires school inbox checks through notify_center and Tauri command', () => {
    const notifySource =
      readText('src/utils/notify_center.ts') +
      '\n' +
      readText('src/utils/notify_center_checks.ts') +
      '\n' +
      readText('src/utils/notify_center_util.ts')
    const libSource = tauriTransportSources()

    expect(notifySource).toContain("schoolInbox: 'hbu_notify_school_inbox'")
    expect(notifySource).toContain('checkSchoolInbox')
    expect(notifySource).toContain("invokeNative('school_inbox_fetch'")
    expect(notifySource).toContain('schoolInboxStateKeyFor')
    expect(libSource).toContain('school_inbox_fetch')
  })

  it('no longer syncs legacy hbu_bg_* prefs or headless school inbox state (#616)', () => {
    const notifySource =
      readText('src/utils/notify_center.ts') +
      '\n' +
      readText('src/utils/notify_center_checks.ts') +
      '\n' +
      readText('src/utils/notify_center_util.ts')
    const root = path.join(repoRoot, 'android/app/src/main/java/com/hbut/mini')

    // 前台去重快照键保留；旧 Headless 专用键与类全部退出
    expect(notifySource).toContain("schoolInbox: 'hbu_notify_school_inbox'")
    expect(notifySource).toContain('schoolInboxStateKeyFor')
    expect(notifySource).not.toContain('syncSchoolInboxBackgroundPrefs')
    expect(notifySource).not.toContain('hbu_bg_enable_school_inbox')
    expect(notifySource).not.toContain('hbu_bg_login_method')
    expect(notifySource).not.toContain("'hbu_bg_api_base'")
    expect(fs.existsSync(path.join(root, 'BackgroundFetchHeadlessTask.java'))).toBe(false)
  })

  it('exposes school inbox toggle in notification settings UI', () => {
    const source = notificationSources()
    const uiSettings = readText('src/config/ui_settings.ts')

    expect(source).toContain('enableSchoolInboxNotices')
    expect(source).toContain("card.key === 'school_inbox'")
    expect(source).toContain('schoolInboxSummary')
    expect(uiSettings).toContain("'school_inbox'")
  })

  it('registers school inbox browse module on home dashboard and app routing', () => {
    const dashboard = readVueContractSource('src/components/Dashboard.vue')
    const appSource = appSources()
    const uiSettings = readText('src/config/ui_settings.ts')
    const inboxView = readText('src/components/SchoolInboxView.vue')
    const homeSearch = readText('src/utils/home_search.js')
    const libSource = tauriTransportSources()

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
    const notifySource =
      readText('src/utils/notify_center.ts') +
      '\n' +
      readText('src/utils/notify_center_checks.ts')

    expect(notifySource).toContain('isSchoolInboxItemRead')
    expect(notifySource).toContain('is_read')
    expect(notifySource).toContain('isRead')
    expect(notifySource).toContain('markSchoolInboxNotified')
    expect(notifySource).toMatch(/!isSchoolInboxItemRead\(item\)/)
  })

  it('syncs school inbox read state into notify dedup snapshot', () => {
    const inboxView = readText('src/components/SchoolInboxView.vue')
    const notifySource =
      readText('src/utils/notify_center.ts') + '\n' + readText('src/utils/notify_center_checks.ts')

    // 前台已读去重（markSchoolInboxNotified -> hbu_notify_school_inbox_state:*）继续生效
    expect(inboxView).toContain('markSchoolInboxNotified')
    expect(notifySource).toContain('markSchoolInboxNotified')
    expect(notifySource).toContain('schoolInboxStateKeyFor')
    expect(notifySource).toContain('is_read')
  })

  it('uses Mini-HBUT branding on main tab headers', () => {
    const dashboard = readVueContractSource('src/components/Dashboard.vue')
    const notificationView = notificationSources()
    const meView = readText('src/components/MeView.vue')

    expect(dashboard).toContain('Mini-HBUT')
    expect(notificationView).toContain('Mini-HBUT')
    expect(meView).toContain('Mini-HBUT')
    expect(dashboard).not.toContain('HBUT 校园助手')
    expect(notificationView).not.toContain('HBUT 校园助手')
    expect(meView).not.toContain('HBUT 校园助手')
  })
})
