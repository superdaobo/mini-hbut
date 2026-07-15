/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
  readonly VITE_BUILD_PROFILE?: string
  /** `'1'` only for iOS TestFlight App Store compliance builds */
  readonly VITE_APP_STORE_BUILD?: string
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
