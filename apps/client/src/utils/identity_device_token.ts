/**
 * src/utils/identity_device_token.ts —— #902 设备换票 → Identity Access Token provider。
 *
 * 链路（用户拍板方案 ii）：**Device Key → Identity Access Token → Game Launch Ticket → Game Session**
 *
 * 职责边界（与 #629 的 `identity_access_token.ts` 严格分工）：
 * - 本模块只负责「如何拿到 AT」：Rust 命令 `identity_device_token` 完成
 *   challenge → 设备私钥签名 → 换取 resource-scoped JWT AT（#902 Core 端点）；
 * - 缓存 / 401 单次 refresh / 并发去重由 `identity_access_token.ts` 负责（本模块只当 provider）；
 * - `setIdentityAccessTokenProvider` 的接口签名保持不变（#902b 硬约束）；
 * - #1171 T13：换回的 AT 还须通过 **issuer 校验**（多 issuer 兼容，
 *   `identityIssuers.verifyIdentityTokenIssuer`）—— 未知/缺失 issuer 一律显式拒绝（可读错误），
 *   绝不降级为不校验。
 *
 * 安全约束（逐条可验证）：
 * 1. **不得新建第二套密钥**：Rust 命令复用 device_key 的 keyring 条目（service=mini-hbut-identity）；
 * 2. **AT 仅内存**：只在返回值与 `identity_access_token.ts` 的模块级变量里存在，
 *    绝不写 localStorage / sessionStorage / IndexedDB / cookie / 明文文件，也绝不进日志；
 * 3. **V1 无 Refresh Token**：`refreshAccessToken()` 就是重新走一次设备签名换票；
 * 4. **失败一律 null**：任何失败（未注册设备 / 非 Tauri / 能力未开启 / 网络 / 服务端 4xx-5xx）
 *    都返回 null，调用方（Forum / Cloud Sync）继续走既有 legacy 双轨，不被破坏；
 * 5. **主体一致性护栏**（防跨账号数据错配）：换回的 AT 必须含学号（claim 名可配置，
 *    默认 `hbut_student_id` + 回退链，见 `resolveStudentIdClaimPolicy`，P2-6 #1210），
 *    且等于当前本地会话学号；否则丢弃 —— 设备绑定的是 A 学号而本地会话已切换为 B 时，
 *    绝不能把 B 的数据带上 A 的令牌（否则服务端会把 B 的数据记到 A 名下）。
 *    该护栏只做**本地一致性检查**，不做验签（验签是资源服务器的职责，本地自解 payload
 *    不构成任何信任提升，也不用于授权决策）。
 * 6. **HTML 游戏拿不到 AT**：本 provider 只把 AT 交给 App 内部调用方，
 *    不通过 postMessage / iframe URL / 任何宿主桥暴露（游戏侧只允许拿 Launch Ticket，#902c）。
 *
 * 生命周期（挂点在既有事件上，不新增耦合）：
 * - `hbu-identity-login-resumed`（AuthCoordinator 登录成功派发）→ 重新绑定会话主体
 *   （清空两个凭据域：Identity AT + legacy bridge 令牌，#1171 T13）；
 * - `hbu-session-logout`（AuthCoordinator 登出派发）→ 清空两个凭据域（登出后绝不复用）。
 */
import {
  setIdentityAccessTokenProvider,
  type IdentityAccessTokenProvider
} from './identity_access_token'
// #1171 T13：登出/切号时两个凭据域（Identity AT + legacy bridge 令牌）统一清理
import { clearAllSessionCredentials } from './session_credentials'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'
import { getIdentityCoreBaseUrl } from '../features/identity/identityService'
// #1171 T13：多 issuer 校验（已接受 issuer 列表 + 显式拒绝未知 issuer）
import {
  decodeJwtPayload,
  verifyIdentityTokenIssuer
} from '../features/identity/identityIssuers'
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

// ── P2-6（#1210）：学号 claim 名可配置 ─────────────────────────────────────────
// 背景：旧平台 AT 用 `hbut_student_id`；Casdoor 令牌可能只带 `oauth_OIDC_id`
//（或 `student_id`）。claim 名经构建期 env 配置（默认保持现行为，见下方常量），
// 解析一律「主名优先、回退链按序」，全部缺失返回 ''。
// 安全约束（与文件头一致）：只做本地解码，**不验签**；claim 名是配置而非秘密，
// 可出现在代码/类型中，但解码结果（学号）绝不出现在日志或错误文案里。

/** 默认学号主 claim 名（与既有行为一致；不设 env 时命中结果不变） */
export const DEFAULT_STUDENT_ID_CLAIM = 'hbut_student_id'

/** 默认回退 claim 名（主名缺失时按此顺序尝试；P2-6 新增 `oauth_OIDC_id` 回退） */
export const DEFAULT_STUDENT_ID_CLAIM_FALLBACKS = ['oauth_OIDC_id', 'student_id'] as const

/**
 * claim 名形状校验：标识符形态（防误配成 JSON 路径 / 注入点）。
 * 与 ocr-service P2-6 单 issuer 路径的校验规则同源（`^[A-Za-z_][A-Za-z0-9_.]{0,63}$`）。
 */
const STUDENT_ID_CLAIM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]{0,63}$/

/**
 * claim 名是否合法（**与 ocr-service 同口径**）：标识符形态 **且不含 `..`**。
 * 复核 O-2：客户端原先只做正则，`x..y`/`__proto__` 会被当合法名（ocr 会拒），
 * 现已对齐（`__proto__` 仍匹配正则，但只可能由故意误配产生，且下方会告警）。
 */
const isStudentIdClaimName = (value: unknown): value is string =>
  typeof value === 'string' &&
  STUDENT_ID_CLAIM_NAME_PATTERN.test(value) &&
  !value.includes('..')

/** claim 名策略（主名 + 回退链；回退链已去重且不含主名） */
export interface StudentIdClaimPolicy {
  /** 主 claim 名（第一个候选） */
  primary: string
  /** 回退 claim 名（主名缺失时按顺序尝试） */
  fallbacks: string[]
}

/**
 * 从构建期 env 解析 claim 名策略：
 * - `VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM`：主 claim 名（默认 `hbut_student_id`）；
 * - `VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS`：逗号分隔的回退 claim 名
 *   （默认 `oauth_OIDC_id,student_id`）。
 *
 * 容错语义（**不抛错**，fail-soft）：
 * - 主名缺失/空/非法（不匹配 `STUDENT_ID_CLAIM_NAME_PATTERN`）→ 回落默认主名；
 * - 回退列表缺省/空串 → 回落默认回退列表；
 * - 回退列表中非法项逐条忽略；整条列表全非法 → 回落默认回退列表；
 * - 去重：主名出现在回退链中时移除（保持顺序）。
 * 默认行为零变化：不设任何 env 时等价于 `{primary: hbut_student_id, fallbacks: [oauth_OIDC_id, student_id]}`。
 */
let claimPolicyWarned = false

export const resolveStudentIdClaimPolicy = (): StudentIdClaimPolicy => {
  const env = import.meta.env
  const primaryRaw =
    typeof env.VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM === 'string'
      ? env.VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM.trim()
      : ''
  const primary =
    primaryRaw !== '' && isStudentIdClaimName(primaryRaw)
      ? primaryRaw
      : DEFAULT_STUDENT_ID_CLAIM

  const fallbacksRaw =
    typeof env.VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS === 'string'
      ? env.VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS
      : ''
  let candidates: string[]
  if (fallbacksRaw.trim() === '') {
    // 缺省 / 空串：回落默认回退列表（与 ocr 侧「空串=不回退」不同：客户端 fail-soft 恒保默认链）
    candidates = [...DEFAULT_STUDENT_ID_CLAIM_FALLBACKS]
  } else {
    candidates = fallbacksRaw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '' && isStudentIdClaimName(entry))
    if (candidates.length === 0) {
      // 整条列表全非法（误配）：忽略并回落默认，绝不因配置错误抛出
      candidates = [...DEFAULT_STUDENT_ID_CLAIM_FALLBACKS]
    }
  }

  // 去重 + 剔除主名（保持配置顺序）
  const seen = new Set<string>([primary])
  const fallbacks: string[] = []
  for (const name of candidates) {
    if (!seen.has(name)) {
      seen.add(name)
      fallbacks.push(name)
    }
  }
  // 复核 O-3：主名被 env 改成**非默认**值时告警一次——fail-soft 回落虽不抛错，
  // 但「静默按错名字取号」比直接失败更难排查；只告警一次，避免每次取票刷日志。
  if (!claimPolicyWarned && primary !== DEFAULT_STUDENT_ID_CLAIM) {
    claimPolicyWarned = true
    console.warn(
      '[IdentityToken] 学号 claim 名已由 VITE_HBUT_IDENTITY_STUDENT_ID_CLAIM 覆盖为',
      primary,
      '；若与后端不一致将取不到学号'
    )
  }
  return { primary, fallbacks }
}

/**
 * 按策略从**已解码** payload 取学号（首个非空字符串；全部缺失/非对象/非字符串 → ''）。
 * 策略缺省 = 当前 env 解析结果。任何失败返回 ''（绝不抛错）。
 */
export const decodeStudentIdFromPayload = (
  payload: unknown,
  policy?: StudentIdClaimPolicy | null
): string => {
  if (!payload || typeof payload !== 'object') return ''
  const effective = policy ?? resolveStudentIdClaimPolicy()
  const record = payload as Record<string, unknown>
  for (const claimName of [effective.primary, ...effective.fallbacks]) {
    const value = record[claimName]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/**
 * 只做 payload 解码取学号（**不验签**；解码逻辑收敛到 identityIssuers.decodeJwtPayload，
 * 与 issuer 校验共用同一解码路径）。P2-6 起内部走 `decodeStudentIdFromPayload`
 *（claim 名可配置，默认 `hbut_student_id` + 回退链；不设 env 时命中结果与原先一致）。
 * 用途仅限本地一致性护栏（见文件头第 5 条）；任何失败都返回 ''（调用方按不一致处理）。
 */
export const decodeAccessTokenStudentId = (token: string): string => {
  const payload = decodeJwtPayload(token)
  if (!payload) return ''
  return decodeStudentIdFromPayload(payload)
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
    // #1171 T13：issuer 校验（多 issuer 兼容）—— 已接受 issuer 列表之外的签发者一律
    // 显式拒绝（可读错误经 report 上报），绝不降级为不校验（与主体护栏同为本地护栏，
    // 验签仍由资源服务器负责）
    const issuerCheck = verifyIdentityTokenIssuer(token)
    if (!issuerCheck.ok) {
      deps.report(issuerCheck.message)
      return null
    }
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
    // 登出即丢两个凭据域的内存令牌（#1171 T13）：Identity AT 与 legacy bridge 令牌
    // 都必须清理（登出后任何调用方都拿不到旧凭据；重新登录后按需重换/重取）
    clearAllSessionCredentials()
  }
  const onLoginResumed = (): void => {
    // 登录/切换账号：旧 AT 可能属于上一个会话主体 → 清空两个凭据域，交由下一次
    // getAccessToken 重新换取 / bridge 令牌惰性重取
    clearAllSessionCredentials()
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
