import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './index.css'
import './styles/dark-mode.css'
import App from './App.vue'
import IOSSelect from './components/IOSSelect.vue'
import { initUiSettings } from './utils/ui_settings'
import { initAppSettings } from './utils/app_settings'
import { initFontSettings } from './utils/font_settings'
import { initThemeBridge } from './utils/theme-bridge'
import { migrateLegacyBackgroundState } from './utils/legacy_background_migration'
import { migrateLegacyGameRankContexts } from './utils/game_center/legacy_rank_context_migration'
import { initDebugLogger, pushDebugLog } from './utils/debug_logger'
import { installGlobalErrorCapture, attachVueErrorCapture } from './utils/crash_reporter'
import { invokeNative, isTauriRuntime } from './platform/native'
import { bootstrapWebsiteDemoIfNeeded } from './utils/website_demo_boot.js'
import { ensureMaterialSymbolsFont, loadLocalIconFonts } from './utils/icon_fonts'
import { markBootMetric } from './utils/boot_metrics.js'
import {
  recordBootStage,
  markBootFinished,
  replayBootDiagnostics
} from './utils/boot_diagnostics'

// 官网 Hero iframe 演示：挂载前写入演示会话 + fixtures（仅 VITE_WEBSITE_DEMO=1）
const isWebsiteDemo = bootstrapWebsiteDemoIfNeeded()
// 演示 / 详情页依赖 Material Symbols ligature；尽早 FontFace 加载，避免图标名英文显示
void ensureMaterialSymbolsFont()

// #991：入口模块求值本身即冷启动最重的一段，必须最早打点（此时 debug_logger 尚未初始化，
// 走 boot_diagnostics 的持久化时间线，随后由 replayBootDiagnostics 回放）。
recordBootStage('module-eval', { website_demo: isWebsiteDemo })

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
  app.use(createPinia())
  // 组件渲染 / 生命周期错误归因（写入调试日志，附组件名）
  attachVueErrorCapture(app)
  app.component('IOSSelect', IOSSelect)
  app.mount('#app')
  // Vue 挂载后立刻清掉 index.html 原生启动页（若 mount 替换未生效也能兜底）
  removeNativeSplash()
  // 再兜底一次：部分 WebView 时序下 #app 内节点会短暂残留
  window.setTimeout(removeNativeSplash, 0)
  window.setTimeout(removeNativeSplash, 500)
  // #991：以「Vue 挂载 + 启动页移除」为本次启动走完的判定点，
  // 用于区分「正常启动」与「进程在启动期被系统终止」。
  markBootMetric('app_mounted')
  markBootFinished('app-mounted')
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

    // #616：旧 Capacitor BackgroundFetch 已退役；升级用户旧后台开关
    // 幂等迁移到新 config（hbu_notify_*），旧键同步清理。
    void migrateLegacyBackgroundState()

    // #911 P1-⑤ 残留：清理旧版游戏落盘的「跨环境排行榜 API base」
    // （老用户的测试域 base 会让「网页直开模块」继续向测试库提交成绩）。
    migrateLegacyGameRankContexts()

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

/**
 * #991：记录 Rust 侧「进程启动至今」的毫秒数（`runtime_log.uptime_ms`）。
 *
 * 这是唯一能测出 **JS 之前那段原生启动** 的办法：`index.html` 的内联脚本把自身时刻当作
 * 时间原点，报告里所有 `+Nms` 都相对它 —— 于是「进程启动 → 页面开始加载」在报告里原本
 * 完全不可见。真机上出现过「白屏 10 秒但 JS 启动只要 33ms」，正是被这段盲区吃掉的。
 *
 * 拿不到（非 Tauri / 命令失败 / 字段缺失）时静默跳过，报告侧显示「证据不足」而不是猜。
 */
const recordNativeUptime = () => {
  if (!isTauriRuntime()) return
  void invokeNative<{ runtime_log?: { uptime_ms?: number } } | null>('get_runtime_diag')
    .then((diag) => {
      const uptime = Number(diag?.runtime_log?.uptime_ms)
      if (!Number.isFinite(uptime)) return
      recordBootStage('native-uptime', { rust_uptime_ms: Math.round(uptime) })
    })
    .catch(() => {
      // 忽略：报告里会显示「证据不足」
    })
}

const bootstrap = () => {
  // 在 Vue 挂载前注入 CSS 变量，避免 FOUC（无样式内容闪烁）
  initThemeBridge()
  recordBootStage('theme-bridge-ready')

  initDebugLogger()
  // #991：initDebugLogger 会重置内存日志缓冲，启动页阶段的记录必须在此之后回放，
  // 否则「设置-调试信息」里看不到卡死前的任何证据。
  const replayed = replayBootDiagnostics()
  markBootMetric('debug_logger_ready', { replayed_entries: replayed })
  // #991：尽早取进程启动时间（越早越准 —— 推算原生前置要用到这条记录的时刻）
  recordNativeUptime()
  // 尽早安装全局错误捕获（error / unhandledrejection），用于闪退前 JS 错误事后归因
  installGlobalErrorCapture()
  pushDebugLog('Bootstrap', '开始初始化应用')
  markBootMetric('error_capture_ready')
  initUiSettings()
  initAppSettings()
  initFontSettings()
  markBootMetric('settings_ready')
  mountApp()
  runDeferredInitializers()
  markBootMetric('deferred_init_scheduled')
  pushDebugLog('Bootstrap', '应用初始化完成')
}

try {
  bootstrap()
} catch (error) {
  console.error('[Bootstrap] failed:', error)
  recordBootStage('bootstrap-failed', { message: String(error) })
  try {
    mountApp()
  } catch (e2) {
    console.error('[Bootstrap] mountApp failed:', e2)
    recordBootStage('mount-failed', { message: String(e2) })
    removeNativeSplash()
  }
}

// 全局兜底：无论 Vue 是否挂载成功，最多 4s 必须去掉原生启动页
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    // #991：仅当启动页仍在 DOM 中才留痕 —— 否则正常快速启动（启动页早已移除）
    // 也会记一条，在诊断报告里变成误导性的「兜底被触发」。
    if (document.getElementById('native-splash')) {
      recordBootStage('fallback-4s-splash-removal')
    }
    removeNativeSplash()
  }, 4000)
}
