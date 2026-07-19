import { createApp } from 'vue'
import './index.css'
import './styles/dark-mode.css'
import App from './App.vue'
import IOSSelect from './components/IOSSelect.vue'
import { initUiSettings } from './utils/ui_settings'
import { initAppSettings } from './utils/app_settings'
import { initFontSettings } from './utils/font_settings'
import { initThemeBridge } from './utils/theme-bridge'
import { initBackgroundFetchScheduler } from './utils/background_fetch'
import { runNotificationCheck } from './utils/notify_center'
import { runCampusNetworkAutoLogin } from './utils/campus_network_service'
import { initDebugLogger, pushDebugLog } from './utils/debug_logger'
import { invokeNative, isTauriRuntime } from './platform/native'
import { bootstrapWebsiteDemoIfNeeded } from './utils/website_demo_boot.js'
import { ensureMaterialSymbolsFont, loadLocalIconFonts } from './utils/icon_fonts'

// 官网 Hero iframe 演示：挂载前写入演示会话 + fixtures（仅 VITE_WEBSITE_DEMO=1）
const isWebsiteDemo = bootstrapWebsiteDemoIfNeeded()
// 演示 / 详情页依赖 Material Symbols ligature；尽早 FontFace 加载，避免图标名英文显示
void ensureMaterialSymbolsFont()

const removeNativeSplash = () => {
  try {
    const w = window as Window & { __removeNativeSplash?: (reason?: string) => void }
    if (typeof w.__removeNativeSplash === 'function') {
      w.__removeNativeSplash('vue-mount')
      return
    }
  } catch {
    // ignore
  }
  try {
    document.getElementById('native-splash')?.remove()
  } catch {
    // ignore
  }
}

const mountApp = () => {
  const app = createApp(App)
  app.component('IOSSelect', IOSSelect)
  app.mount('#app')
  // Vue 挂载后立刻清掉 index.html 原生启动页（若 mount 替换未生效也能兜底）
  removeNativeSplash()
  // 再兜底一次：部分 WebView 时序下 #app 内节点会短暂残留
  window.setTimeout(removeNativeSplash, 0)
  window.setTimeout(removeNativeSplash, 500)
}

const runDeferredInitializers = () => {
  const run = () => {
    // 本地图标字体（含 Material Symbols FontFace，详情页图标依赖）
    void loadLocalIconFonts()

    // 先完成首屏挂载，再异步初始化重任务，避免安卓首次安装时白屏等待。
    void import('./utils/markdown')
      .then(({ initMarkdownRuntime }) => initMarkdownRuntime(6000))
      .catch((error) => {
        console.warn('[Bootstrap] markdown runtime init failed:', error)
      })

    if (isTauriRuntime()) {
      void invokeNative<{ enableBridgeTools?: boolean } | null>('get_debug_runtime_config')
        .then((config) => {
          if (!config?.enableBridgeTools) return null
          return import('./utils/debug_bridge').then(({ initDebugBridgeClient }) => initDebugBridgeClient())
        })
        .catch((error) => {
          console.warn('[Bootstrap] debug bridge init failed:', error)
        })
    }

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
      try {
        await runCampusNetworkAutoLogin({
          studentId,
          reason: reason || 'background-fetch'
        })
      } catch (error) {
        console.warn('[BackgroundFetch] campus network failed:', taskId, error)
      }
    }).catch((error) => {
      console.warn('[Bootstrap] background fetch init failed:', error)
    })
  }

  // 官网演示：立即加载字体（详情页一进就要图标）
  if (isWebsiteDemo) {
    run()
    return
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    // 在浏览器空闲时再初始化后台能力，减小首屏阻塞。
    window.requestIdleCallback(() => run(), { timeout: 1200 })
    return
  }

  setTimeout(run, 0)
}

const bootstrap = () => {
  // 在 Vue 挂载前注入 CSS 变量，避免 FOUC（无样式内容闪烁）
  initThemeBridge()

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
  try {
    mountApp()
  } catch (e2) {
    console.error('[Bootstrap] mountApp failed:', e2)
    removeNativeSplash()
  }
}

// 全局兜底：无论 Vue 是否挂载成功，最多 4s 必须去掉原生启动页
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    removeNativeSplash()
  }, 4000)
}
