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

const bootstrap = async () => {
  initUiSettings()
  initAppSettings()
  initFontSettings()

  await initMarkdownRuntime(6000)

  await initBackgroundFetchScheduler(async ({ studentId, reason, taskId }) => {
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
  })

  createApp(App).mount('#app')
}

bootstrap().catch((error) => {
  console.error('[Bootstrap] failed:', error)
  createApp(App).mount('#app')
})
