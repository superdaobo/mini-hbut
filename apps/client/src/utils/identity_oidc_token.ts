/**
 * src/utils/identity_oidc_token.ts —— P2-5（#1209）：默认路径 Identity Access Token provider（OIDC refresh token）。
 *
 * 链路：Casdoor OIDC 会话（Rust keyring，含 refresh_token）→ `identity_oidc_access_token`
 *       → `identity_access_token.ts` 的内存缓存（单飞 / 原子替换 / 401 单飞刷新由该模块负责）。
 *
 * 命令契约（goal-10 `p2-5-refresh-token-spec.md` §2.2 冻结）：
 *   - 命令 `identity_oidc_access_token`，入参 `{ input: { force: boolean } }`（单 input + snake_case，
 *     与 `oidcFlow.ts` 的 invoke 封装范式一致）；
 *   - 返回 `{ ok, kind, message, access_token, expires_at, student_id_masked }`；
 *     `force=false` → 有有效会话时返回当前 AT（仍新鲜时后端零网络）；
 *     `force=true`  → 先强制刷新（401 场景）再返回；
 *   - 该命令是**唯一允许把 AT 交给前端**的出口；前端拿到后**只**放
 *     `identity_access_token.ts` 的内存缓存（`swapIdentityToken`），**绝不**落任何持久化；
 *   - `session_status` 保持不返回令牌（不变）。
 *
 * 安全约束（与 identity_device_token.ts 同款纪律）：
 *   1. **AT 仅内存**：不写 localStorage / sessionStorage / IndexedDB / cookie / 明文文件，
 *      不进日志（本模块无任何 console 调用，错误一律折叠为 null，不输出原文）；
 *   2. **失败一律 null**（fail closed）：无会话 / 非 Tauri / invoke 抛错 / 形状畸形
 *      → null，调用方（Forum / Cloud Sync）走既有 legacy 双轨，不被破坏；
 *   3. **不建第二套存储**：会话（AT/RT/ID）全部由 Rust keyring 层持有，本模块只取值。
 *
 * 生命周期（登出 / 切号）：`clearAllSessionCredentials`（session_credentials.ts）已扩展
 * 第三域（OIDC 会话 `identity_oidc_logout`，best-effort）；事件挂点保持既有
 * `hbu-session-logout` / `hbu-identity-login-resumed`，本文件不新增事件。
 */
import {
  setIdentityAccessTokenProvider,
  type IdentityAccessTokenProvider
} from './identity_access_token'
import { invokeNative, isTauriRuntime } from '../platform/native'

/** Rust `identity_oidc_access_token` 返回值（冻结契约 §2.2；snake_case 逐字对应） */
export interface OidcAccessTokenPayload {
  ok: boolean
  kind: string
  message: string
  /** 仅在有有效会话时返回（唯一 AT 出口） */
  access_token?: string
  /** 过期时间戳（Rust 权威；本模块不解析、不展示） */
  expires_at?: number
  /** 学号掩码（展示用；本模块不展示，只透传形状） */
  student_id_masked?: string
}

/** Tauri invoke 形状（返回 unknown，由本模块按契约收窄；便于单测注入假实现） */
export type OidcTokenInvoke = (
  command: string,
  args?: Record<string, unknown>
) => Promise<unknown>

/** provider 依赖（可注入，便于单测；生产缺省用真实实现） */
export interface OidcTokenProviderDeps {
  /** Tauri invoke（缺省 `invokeNative`） */
  invoke?: OidcTokenInvoke
  /** 是否 Tauri 运行时（缺省 `isTauriRuntime`） */
  isTauri?: () => boolean
}

/**
 * 单次取 AT（普通读取 / 强制刷新）：
 * - 非 Tauri（Web/Capacitor 无 keyring 会话）→ null（回到 legacy 双轨，不报错）；
 * - 无会话 / 刷新失败 / invoke 抛错 / 形状畸形 → null（fail closed，**绝不抛**）；
 * - 只返回非空字符串 AT；令牌绝不进日志（本函数无 console / 上报副作用）。
 */
export const fetchOidcAccessToken = async (
  force: boolean,
  deps: OidcTokenProviderDeps = {}
): Promise<string | null> => {
  const isTauri = deps.isTauri ?? isTauriRuntime
  if (!isTauri()) return null
  const invoke = deps.invoke ?? (invokeNative as unknown as OidcTokenInvoke)
  try {
    // 单 input 参数 + snake_case（Rust 侧 `input: OidcAccessTokenInput { force }`）
    const raw = await invoke('identity_oidc_access_token', { input: { force } })
    const result = (raw ?? null) as Partial<OidcAccessTokenPayload> | null
    // 只有 ok:true 且 access_token 为非空字符串才可用；其余（ok:false / 缺字段 / 空串）→ null
    if (result?.ok !== true) return null
    const token = typeof result.access_token === 'string' ? result.access_token.trim() : ''
    return token ? token : null
  } catch {
    // invoke 抛错（Rust 内部故障）→ 折叠为 null；不输出、不透传任何原文（零泄露）
    return null
  }
}

/**
 * 构造 IdentityAccessTokenProvider（OIDC 会话路径，**默认路径**）：
 * - `getAccessToken`：惰性读取当前会话 AT（仍新鲜时后端零网络）；
 * - `refreshAccessToken`：401 场景的强制刷新（后端先刷新再返回；失败 → null）；
 * - 缓存 / 单飞 / 原子替换全部由 `identity_access_token.ts` 负责（本模块只当 provider）。
 */
export const createIdentityOidcTokenProvider = (
  deps: OidcTokenProviderDeps = {}
): IdentityAccessTokenProvider => ({
  getAccessToken: () => fetchOidcAccessToken(false, deps),
  refreshAccessToken: () => fetchOidcAccessToken(true, deps)
})

/**
 * 注册 OIDC provider（生产默认路径的注入点）：
 * - **非 Tauri 运行时 → 不安装**（provider 保持 null，调用方走 legacy 双轨）；
 * - 幂等：`setIdentityAccessTokenProvider` 切换时自动清空旧令牌与在途任务。
 */
export const installIdentityOidcTokenProvider = (): void => {
  if (!isTauriRuntime()) return
  setIdentityAccessTokenProvider(createIdentityOidcTokenProvider())
}
