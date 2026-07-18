/**
 * 官网 Hero 嵌入用离线演示启动：
 * 在 Vue 挂载前写入 TestFlight 演示会话 + fixtures 缓存，避免登录页与联网请求。
 * 仅当构建时 VITE_WEBSITE_DEMO=1 生效。
 */
import { markTestAccountSession, TEST_ACCOUNT } from './test_account.js'
import { seedTestAccountCaches } from './test_account_fixtures.js'
import { setCachedData } from './api.js'

const LOGIN_SESSION_TOKEN_KEY = 'hbu_login_session_token'

export const isWebsiteDemoBuild = () =>
  String(import.meta.env.VITE_WEBSITE_DEMO || '') === '1'

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
    } catch {
      // ignore storage errors
    }
    seedTestAccountCaches(setCachedData, TEST_ACCOUNT.studentId)
    console.info('[website-demo] seeded test account session + fixtures')
  } catch (error) {
    console.warn('[website-demo] bootstrap failed:', error)
  }

  // 文档标题便于验收与调试
  try {
    if (typeof document !== 'undefined') {
      document.title = 'Mini-HBUT 演示（离线预设数据）'
      document.documentElement.dataset.websiteDemo = '1'
    }
  } catch {
    // ignore
  }

  return true
}
