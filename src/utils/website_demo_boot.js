/**
 * 官网 Hero 嵌入用离线演示启动：
 * 在 Vue 挂载前写入 TestFlight 演示会话 + fixtures 缓存，避免登录页与联网请求。
 * 仅当构建时 VITE_WEBSITE_DEMO=1 生效。
 */
import { markTestAccountSession, TEST_ACCOUNT } from './test_account.js'
import { seedTestAccountCaches } from './test_account_fixtures.js'
import { setCachedData } from './api.js'
import { ensureMaterialSymbolsFont } from './icon_fonts'

const LOGIN_SESSION_TOKEN_KEY = 'hbu_login_session_token'

export const isWebsiteDemoBuild = () =>
  String(import.meta.env.VITE_WEBSITE_DEMO || '') === '1'

/** 官网 iframe 内：收紧演示横幅与边距，贴近真机可用区 */
const injectWebsiteDemoLayoutStyles = () => {
  if (typeof document === 'undefined') return
  if (document.getElementById('website-demo-layout-style')) return
  const style = document.createElement('style')
  style.id = 'website-demo-layout-style'
  style.textContent = `
    html[data-website-demo='1'] .demo-mode-banner {
      margin: 4px 8px 0;
      padding: 6px 8px;
      font-size: 11px;
      line-height: 1.3;
      gap: 6px;
    }
    html[data-website-demo='1'] .demo-mode-banner__en {
      display: none;
    }
    html[data-website-demo='1'] .bottom-tab-bar {
      max-width: min(100%, 420px);
    }
  `
  document.head.appendChild(style)
}

/**
 * @returns {boolean} 是否已进入官网演示模式
 */
export function bootstrapWebsiteDemoIfNeeded() {
  if (!isWebsiteDemoBuild()) return false

  try {
    // 固定演示身份，刷新后仍可直接进入主界面
    markTestAccountSession()
    try {
      localStorage.setItem(LOGIN_SESSION_TOKEN_KEY, `website-demo-${Date.now()}`)
      localStorage.setItem('hbu_login_temporary', '0')
      localStorage.removeItem('hbu_manual_logout')
      localStorage.removeItem('hbu_logout_reason')
      // Hero 小屏内嵌：默认收起双语大横幅，避免挤占首屏（与真机 App 可用区更接近）
      localStorage.setItem('hbu_demo_banner_dismissed', '1')
    } catch {
      // ignore storage errors
    }
    seedTestAccountCaches(setCachedData, TEST_ACCOUNT.studentId)
    console.info('[website-demo] seeded test account session + fixtures')
  } catch (error) {
    console.warn('[website-demo] bootstrap failed:', error)
  }

  // 文档标题便于验收与调试；注入机内布局样式
  try {
    if (typeof document !== 'undefined') {
      document.title = 'Mini-HBUT 演示（离线预设数据）'
      document.documentElement.dataset.websiteDemo = '1'
      injectWebsiteDemoLayoutStyles()
    }
  } catch {
    // ignore
  }

  // 详情页大量 material-symbols；挂载前启动 FontFace，避免图标名当英文显示
  void ensureMaterialSymbolsFont()

  return true
}
