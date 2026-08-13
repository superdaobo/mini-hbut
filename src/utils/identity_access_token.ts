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
 * 获取 access token：
 * - 内存已有且非 forceRefresh → 直接返回；
 * - 无 provider → null（调用方回退 legacy）；
 * - forceRefresh=true → 调 provider.refreshAccessToken() 单次；
 * - 并发调用共享同一 promise。
 */
export const getIdentityAccessToken = async (forceRefresh = false): Promise<string | null> => {
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
