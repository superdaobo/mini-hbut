/**
 * src/utils/identity_access_token.ts —— #629 Forum Phase C：first-party Identity access token 获取抽象。
 *
 * 职责：
 *   - Forum / Cloud Sync 客户端统一从这里拿 Mini-HBUT Identity access token；
 *   - token 只驻留内存（安全 runtime/session 层），绝不写入 localStorage 明文 / debug log；
 *   - 401 只触发一次 refresh/re-auth，并发请求共享同一轮 refresh（防刷新风暴，不无限循环）；
 *   - 默认 provider 未接入时返回 null → 调用方回退 legacy 双轨流程（服务端 LEGACY_GRACE 期内兼容）。
 *
 * 接入点（未来 src-tauri 提供安全存储命令后，在此 setIdentityAccessTokenProvider）：
 *   import { getIdentityAccessTokenCommand } from '.../tauri'  —— 由 Rust keyring/设备会话层产出
 *   setIdentityAccessTokenProvider({
 *     getAccessToken: () => invoke('identity_get_access_token'),
 *     refreshAccessToken: () => invoke('identity_refresh_access_token')
 *   })
 */
export interface IdentityAccessTokenProvider {
  /** 读取当前 access token（无/过期返回 null） */
  getAccessToken(): Promise<string | null>
  /** 401 触发的一次性刷新/re-auth（返回新 token 或 null） */
  refreshAccessToken(): Promise<string | null>
}

let activeProvider: IdentityAccessTokenProvider | null = null
let memoryToken = ''
let inFlight: Promise<string | null> | null = null

/** 注入 provider（切换时清空内存 token，避免跨 provider 复用） */
export const setIdentityAccessTokenProvider = (provider: IdentityAccessTokenProvider | null): void => {
  activeProvider = provider
  clearIdentityAccessToken()
}

/** 清空内存 token 与在途刷新 */
export const clearIdentityAccessToken = (): void => {
  memoryToken = ''
  inFlight = null
}

/**
 * DEV 专用 Access Token 打桩缝（**仅用于真机/本地验证游戏票据链路**）。
 *
 * 为什么需要：`Device Key → Identity AT → Launch Ticket` 的第一跳要求本机设备已在
 * Identity Core **注册**（未注册时换票端点返回 `not_found`）。要在「不碰生产身份平台」的前提下
 * 验证**我们这一侧的链路**（宿主闸门 → 取票请求 → 平台 API → 回 `:ticket`），需要能把 AT 打桩。
 *
 * 安全边界（必须保持）：
 * - **只在 DEV 构建生效**（生产构建 `import.meta.env.DEV` 为 false → 永远读不到打桩值）；
 * - 只接受非空字符串；调用方仍走原有的缓存 / 并发去重路径；
 * - 打桩值只驻留内存语义（由调试方在运行期写入 `globalThis`），**不写任何存储、不进日志**。
 */
const readDevAccessTokenStub = (): string => {
  if (!import.meta.env?.DEV) return ''
  try {
    const stub = (globalThis as unknown as { __HBUT_IDENTITY_AT_STUB__?: unknown }).__HBUT_IDENTITY_AT_STUB__
    return typeof stub === 'string' ? stub.trim() : ''
  } catch {
    return ''
  }
}

/**
 * 获取 access token：
 * - DEV 打桩优先（见 `readDevAccessTokenStub`，生产不生效）；
 * - 内存已有且非 forceRefresh → 直接返回；
 * - 无 provider → null（调用方回退 legacy）；
 * - forceRefresh=true → 调 provider.refreshAccessToken() 单次；
 * - 并发调用共享同一 promise。
 */
export const getIdentityAccessToken = async (forceRefresh = false): Promise<string | null> => {
  const stubbed = readDevAccessTokenStub()
  if (stubbed) return stubbed
  if (!forceRefresh && memoryToken) return memoryToken
  if (!activeProvider) return null
  if (forceRefresh) memoryToken = ''
  if (inFlight) return inFlight
  // task 先以 null 初始化：闭包内以 inFlight === task 判断“仍是当前在途任务”
  let task: Promise<string | null> | null = null
  task = (async () => {
    try {
      const token = forceRefresh
        ? await activeProvider?.refreshAccessToken()
        : await activeProvider?.getAccessToken()
      const value = typeof token === 'string' && token.trim() ? token.trim() : ''
      // 仅当本轮刷新仍是当前在途任务时才写回缓存（避免 clearIdentityAccessToken 后污染 session）
      if (inFlight === task) {
        memoryToken = value
      }
      return value || null
    } finally {
      if (inFlight === task) {
        inFlight = null
      }
    }
  })()
  inFlight = task
  return inFlight
}

/** 是否配置了 provider（用于调用方判断能否走新协议） */
export const hasIdentityAccessTokenProvider = (): boolean => activeProvider !== null
