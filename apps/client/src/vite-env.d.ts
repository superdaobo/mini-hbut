/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
  readonly VITE_BUILD_PROFILE?: string
  /** `'1'` only for iOS TestFlight App Store compliance builds */
  readonly VITE_APP_STORE_BUILD?: string
  /** iOS TestFlight 工作流构建时注入，与原生 Bundle 一同取自 ASC resolver */
  readonly VITE_IOS_MARKETING_VERSION?: string
  readonly VITE_IOS_BUILD_NUMBER?: string
  /** App Store numeric id (optional), e.g. 1234567890 */
  readonly VITE_APPLE_APP_ID?: string
  readonly VITE_API_BASE?: string
  /** 官网 Hero 嵌入离线演示构建标记 */
  readonly VITE_WEBSITE_DEMO?: string
  /**
   * P2-5（#1209）过渡开关：`'1'` 时 token provider 走设备换票（identity_device_token），
   * 否则默认走 Casdoor OIDC refresh token 路径（identity_oidc_token / identity_token_provider）。
   */
  readonly VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED?: string
  /**
   * P2-6（#1210）学号主 claim 名（默认 `hbut_student_id`）；
   * 非法名（不匹配 `^[A-Za-z_][A-Za-z0-9_.]{0,63}$`）被忽略并回落默认，不抛错。
   */
  readonly VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM?: string
  /**
   * P2-6（#1210）学号回退 claim 名，逗号分隔（默认 `oauth_OIDC_id,student_id`）；
   * 非法项逐条忽略，整条全非法时回落默认列表。
   */
  readonly VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
