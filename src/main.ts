import { createApp } from 'vue'
import './style.css'
import './styles/ui_ux_pro_max.css'
import App from './App.vue'
import { initUiSettings } from './utils/ui_settings'
import { initAppSettings } from './utils/app_settings'
import { initFontSettings } from './utils/font_settings'
import { initMarkdownRuntime } from './utils/markdown'
import { initBackgroundFetchScheduler } from './utils/background_fetch'
import { runNotificationCheck } from './utils/notify_center'
import { initDebugLogger, pushDebugLog } from './utils/debug_logger'

const mountApp = () => {
  createApp(App).mount('#app')
}

const runDeferredInitializers = () => {
  const run = () => {
    // 先完成首屏挂载，再异步初始化重任务，避免安卓首次安装时白屏等待。
    void initMarkdownRuntime(6000).catch((error) => {
      console.warn('[Bootstrap] markdown runtime init failed:', error)
    })

    void initBackgroundFetchScheduler(async ({ studentId, reason, taskId }) => {
      try {
        await runNotificationCheck({
          studentId,
          reason: reason || 'background-fetch',
          launchCheck: false,
          allowPermissionPrompt: false
        })
      } catch (error) {
        console.warn('[BackgroundFetch] check failed:', taskId, error)
      }
    }).catch((error) => {
      console.warn('[Bootstrap] background fetch init failed:', error)
    })
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    // 在浏览器空闲时再初始化后台能力，减小首屏阻塞。
    window.requestIdleCallback(() => run(), { timeout: 1200 })
    return
  }

  setTimeout(run, 0)
}

const bootstrap = () => {
  initDebugLogger()
  pushDebugLog('Bootstrap', '开始初始化应用')
  initUiSettings()
  initAppSettings()
  initFontSettings()
  mountApp()
  runDeferredInitializers()
  pushDebugLog('Bootstrap', '应用初始化完成')
}

try {
  bootstrap()
} catch (error) {
  console.error('[Bootstrap] failed:', error)
  mountApp()
}
