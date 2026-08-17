/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
  readonly VITE_BUILD_PROFILE?: string
  /** `'1'` only for iOS TestFlight App Store compliance builds */
  readonly VITE_APP_STORE_BUILD?: string
  /** App Store numeric id (optional), e.g. 1234567890 */
  readonly VITE_APPLE_APP_ID?: string
  readonly VITE_API_BASE?: string
  /** 官网 Hero 嵌入离线演示构建标记 */
  readonly VITE_WEBSITE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
