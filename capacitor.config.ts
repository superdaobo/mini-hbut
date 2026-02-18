import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 移动端壳配置
 *
 * 设计说明：
 * 1. appId 与 Tauri identifier 对齐，方便后续统一账号体系与通知配置。
 * 2. webDir 直接复用现有 Vite 构建产物 dist，保证桌面与移动端前端逻辑一致。
 * 3. 显式使用 https scheme，降低 iOS 上混合内容与安全策略问题。
 */
const config: CapacitorConfig = {
  appId: 'com.hbut.mini',
  appName: 'Mini-HBUT',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  }
}

export default config
