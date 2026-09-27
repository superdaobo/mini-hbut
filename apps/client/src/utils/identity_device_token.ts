/**
 * src/utils/identity_device_token.ts —— #902 设备换票 → Identity Access Token provider。
 *
 * 链路（用户拍板方案 ii）：**Device Key → Identity Access Token → Game Launch Ticket → Game Session**
 *
 * 职责边界（与 #629 的 `identity_access_token.ts` 严格分工）：
 * - 本模块只负责「如何拿到 AT」：Rust 命令 `identity_device_token` 完成
 *   challenge → 设备私钥签名 → 换取 resource-scoped JWT AT（#902 Core 端点）；
 * - 缓存 / 401 单次 refresh / 并发去重由 `identity_access_token.ts` 负责（本模块只当 provider）；
 * - `setIdentityAccessTokenProvider` 的接口签名保持不变（#902b 硬约束）。
 *
 * 安全约束（逐条可验证）：
 * 1. **不得新建第二套密钥**：Rust 命令复用 device_key 的 keyring 条目（service=mini-hbut-identity）；
 * 2. **AT 仅内存**：只在返回值与 `identity_access_token.ts` 的模块级变量里存在，
 *    绝不写 localStorage / sessionStorage / IndexedDB / cookie / 明文文件，也绝不进日志；
 * 3. **V1 无 Refresh Token**：`refreshAccessToken()` 就是重新走一次设备签名换票；
 * 4. **失败一律 null**：任何失败（未注册设备 / 非 Tauri / 能力未开启 / 网络 / 服务端 4xx-5xx）
 *    都返回 null，调用方（Forum / Cloud Sync）继续走既有 legacy 双轨，不被破坏；
 * 5. **主体一致性护栏**（防跨账号数据错配）：换回的 AT 必须含 `hbut_student_id`，
 *    且等于当前本地会话学号；否则丢弃 —— 设备绑定的是 A 学号而本地会话已切换为 B 时，
 *    绝不能把 B 的数据带上 A 的令牌（否则服务端会把 B 的数据记到 A 名下）。
 *    该护栏只做**本地一致性检查**，不做验签（验签是资源服务器的职责，本地自解 payload
 *    不构成任何信任提升，也不用于授权决策）。
 * 6. **HTML 游戏拿不到 AT**：本 provider 只把 AT 交给 App 内部调用方，
 *    不通过 postMessage / iframe URL / 任何宿主桥暴露（游戏侧只允许拿 Launch Ticket，#902c）。
 *
 * 生命周期（挂点在既有事件上，不新增耦合）：
 * - `hbu-identity-login-resumed`（AuthCoordinator 登录成功派发）→ 重新绑定会话主体（清旧 token）；
 * - `hbu-session-logout`（AuthCoordinator 登出派发）→ 清空内存 token（登出后绝不复用）。
 */
import {
  clearIdentityAccessToken,
  setIdentityAccessTokenProvider,
  type IdentityAccessTokenProvider
} from './identity_access_token'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'
import { getIdentityCoreBaseUrl } from '../features/identity/identityService'
import { getRememberedUsername } from './remembered_username.js'
import { invokeNative, isTauriRuntime } from '../platform/native'

/** 登录成功事件（AuthCoordinator.handleLoginSuccess 派发；与 IdentityCoordinator 共用同一常量值） */
export const IDENTITY_DEVICE_TOKEN_LOGIN_EVENT = 'hbu-identity-login-resumed'
/** 登出事件（AuthCoordinator.handleLogout 派发） */
export const IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT = 'hbu-session-logout'

/** Rust `identity_device_token` 返回值（字段与命令层契约逐字对应；无 refresh_token） */
export interface DeviceTokenNativePayload {
  access_token: string
  token_type: string
  expires_in: number
  expires_at: string
}

/** Tauri invoke 形状（返回 unknown，由本模块按契约收窄；便于单测注入假实现） */
export type DeviceTokenInvoke = (
  command: string,
  args?: Record<string, unknown>
) => Promise<unknown>

/** provider 依赖（可注入，便于单测；生产缺省用真实实现） */
export interface DeviceTokenProviderDeps {
  /** Tauri invoke（缺省 `invokeNative`） */
  invoke?: DeviceTokenInvoke
  /** 是否 Tauri 运行时（缺省 `isTauriRuntime`） */
  isTauri?: () => boolean
  /** 读取本机 device_id（缺省读 localStorage 的非敏感元数据） */
  readDeviceId?: () => string
  /** 读取本地会话学号（缺省经 remembered_username 单一入口读 `hbu_username`） */
  readLocalStudentId?: () => string
  /** 读取 Core origin（缺省 `getIdentityCoreBaseUrl`） */
  readCoreBaseUrl?: () => string
  /** 诊断上报（缺省 console.warn，只输出已脱敏文案；绝不输出 token） */
  report?: (message: string) => void
}

const readStorage = (key: string): string => {
  try {
    return String(globalThis.localStorage?.getItem(key) || '').trim()
  } catch {
    return ''
  }
}

/**
 * 只做 base64url JSON 解码读 `hbut_student_id`（**不验签**）。
 * 用途仅限本地一致性护栏（见文件头第 5 条）；任何失败都返回 ''（调用方按不一致处理）。
 */
export const decodeAccessTokenStudentId = (token: string): string => {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return ''
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const decoded = globalThis.atob(padded)
    // UTF-8 安全解码（学号是 ASCII，但整体 payload 含中文姓名快照）
    const json = decodeURIComponent(
      Array.from(decoded, (ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    )
    const parsed = JSON.parse(json) as { hbut_student_id?: unknown }
    return typeof parsed.hbut_student_id === 'string' ? parsed.hbut_student_id.trim() : ''
  } catch {
    return ''
  }
}

/** 单次设备换票（challenge → 设备签名 → JWT AT）；任何失败返回 null，绝不抛错 */
const mintDeviceAccessToken = async (deps: Required<Pick<DeviceTokenProviderDeps, 'invoke' | 'isTauri' | 'readDeviceId' | 'readLocalStudentId' | 'readCoreBaseUrl' | 'report'>>): Promise<string | null> => {
  // Web / Capacitor 无设备私钥（keyring 不可用）→ 明确回到 legacy 双轨，而不是报错打断业务流程
  if (!deps.isTauri()) return null
  const deviceId = deps.readDeviceId()
  if (!deviceId) return null
  // 本地无会话（已登出/未登录）→ 不换票（登出后不得再持有身份令牌）
  const localStudentId = deps.readLocalStudentId()
  if (!localStudentId) return null
  try {
    const raw = await deps.invoke('identity_device_token', {
      baseUrl: deps.readCoreBaseUrl(),
      deviceId
    })
    const result = (raw ?? null) as DeviceTokenNativePayload | null
    const token = typeof result?.access_token === 'string' ? result.access_token.trim() : ''
    if (!token) return null
    // 主体一致性护栏：AT 主体学号必须与本地会话学号一致（防跨账号数据错配）
    const tokenStudentId = decodeAccessTokenStudentId(token)
    if (!tokenStudentId || tokenStudentId !== localStudentId) {
      deps.report('设备身份令牌与本地会话不一致，已丢弃（回退 legacy）')
      return null
    }
    return token
  } catch (err) {
    // 只输出已脱敏文案（Rust IdentityError Display / Core error.message 均不含 token/签名材料）
    const message = String((err as Error)?.message || err || '').slice(0, 200)
    deps.report(message || '设备换票失败（回退 legacy）')
    return null
  }
}

/**
 * 构造 IdentityAccessTokenProvider：
 * - `getAccessToken`：缓存未命中时惰性换票（缓存/去重在 identity_access_token.ts）；
 * - `refreshAccessToken`：401 后的一次性重换（V1 无 refresh token，等价于再换一次）。
 */
export const createIdentityDeviceTokenProvider = (
  deps: DeviceTokenProviderDeps = {}
): IdentityAccessTokenProvider => {
  const resolved = {
    invoke: deps.invoke ?? (invokeNative as DeviceTokenInvoke),
    isTauri: deps.isTauri ?? isTauriRuntime,
    readDeviceId: deps.readDeviceId ?? (() => readStorage(IDENTITY_DEVICE_ID_KEY)),
    readLocalStudentId: deps.readLocalStudentId ?? (() => String(getRememberedUsername() || '').trim()),
    readCoreBaseUrl: deps.readCoreBaseUrl ?? getIdentityCoreBaseUrl,
    report: deps.report ?? ((message: string) => console.warn('[IdentityToken]', message))
  }
  return {
    getAccessToken: () => mintDeviceAccessToken(resolved),
    refreshAccessToken: () => mintDeviceAccessToken(resolved)
  }
}

/** 安装结果：卸载函数（测试与热更新场景必须能解绑） */
export interface InstallIdentityDeviceTokenResult {
  uninstall: () => void
}

/** 当前生效的安装（模块级单一实例，保证重复安装不叠加监听） */
let activeUninstall: (() => void) | null = null

/**
 * 注册 provider 并挂载生命周期监听（生产唯一注入点，#629 的 provider 从此不再恒为 null）。
 * - 幂等：重复调用先卸载上一次安装（provider + 事件监听），不会叠加监听或互相干扰；
 * - 非浏览器环境（node 测试）不挂监听，只注册 provider。
 */
export const installIdentityDeviceTokenProvider = (
  deps: DeviceTokenProviderDeps = {}
): InstallIdentityDeviceTokenResult => {
  // 重复安装（HMR / 组合式函数被调用两次）：先解绑上一次，避免监听泄漏
  activeUninstall?.()
  setIdentityAccessTokenProvider(createIdentityDeviceTokenProvider(deps))

  const onLogout = (): void => {
    // 登出即丢内存令牌：登出后任何调用方都拿不到旧 AT（重新登录后按需重换）
    clearIdentityAccessToken()
  }
  const onLoginResumed = (): void => {
    // 登录/切换账号：旧 AT 可能属于上一个会话主体 → 清空，交由下一次 getAccessToken 重新换取
    clearIdentityAccessToken()
  }

  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
  if (hasWindow) {
    window.addEventListener(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT, onLogout)
    window.addEventListener(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT, onLoginResumed)
  }

  let uninstalled = false
  const uninstall = (): void => {
    if (uninstalled) return
    uninstalled = true
    if (hasWindow) {
      window.removeEventListener(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT, onLogout)
      window.removeEventListener(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT, onLoginResumed)
    }
    // 只清理「仍是本次安装」的 provider：避免旧实例的卸载动作把新安装打掉
    if (activeUninstall === uninstall) {
      activeUninstall = null
      setIdentityAccessTokenProvider(null)
    }
  }
  activeUninstall = uninstall
  return { uninstall }
}
