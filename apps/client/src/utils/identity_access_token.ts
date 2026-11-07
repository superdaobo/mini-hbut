/**
 * src/utils/identity_access_token.ts —— #629 / #1171 T13：first-party Identity access token 获取抽象。
 *
 * 职责：
 *   - Forum / Cloud Sync 客户端统一从这里拿 Mini-HBUT Identity access token；
 *   - token 只驻留内存（安全 runtime/session 层），绝不写入 localStorage 明文 / debug log；
 *   - **单飞（single-flight）**：并发 get 共享同一惰性任务；并发 401/过期请求（forceRefresh）
 *     共享同一刷新任务 —— N 个并发刷新只触发一次 provider 刷新，防刷新风暴；
 *   - **原子替换**：令牌状态是单字段（V1 无 refresh token，不存在「新 AT + 旧 RT」这类
 *     组合），唯一写路径 `swapIdentityToken` 以单次赋值完成替换（JS 单线程 ⇒ 无中间态）；
 *     刷新失败**不写状态**（旧令牌原样保留，无半更新），刷新成功才替换；
 *   - 刷新在途时，普通 get 也等待刷新结果（不再返回刷新中的旧令牌）；
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

/**
 * 令牌状态：单字段原子载体。
 * - 唯一写路径是 `swapIdentityToken`（单次赋值，JS 单线程 ⇒ 不可观察到中间态）；
 * - 无 refresh_token 字段 ⇒ 不存在「新 AT + 旧 RT」或反之的半更新组合。
 */
const tokenState = { token: '' }

/** 惰性 get 的在途任务（单飞：并发 get 共享） */
let getInFlight: Promise<string | null> | null = null
/** 刷新（forceRefresh）的在途任务（单飞：并发 401 共享同一轮刷新） */
let refreshInFlight: Promise<string | null> | null = null

const normalizeToken = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : ''

/** 令牌状态唯一写路径：原子替换（刷新失败时绝不调用，保持原状态） */
export const swapIdentityToken = (token: string): void => {
  tokenState.token = token
}

/** 读取当前内存令牌（诊断/测试用；不触发 provider） */
export const peekIdentityAccessToken = (): string => tokenState.token

/** 注入 provider（切换时清空内存 token 与在途任务，避免跨 provider 复用） */
export const setIdentityAccessTokenProvider = (provider: IdentityAccessTokenProvider | null): void => {
  activeProvider = provider
  clearIdentityAccessToken()
}

/** 清空内存 token（原子置空）与在途刷新任务 */
export const clearIdentityAccessToken = (): void => {
  swapIdentityToken('')
  getInFlight = null
  refreshInFlight = null
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
 * - DEV 打桩优先（见 `readDevAccessTokenStub`，生产构建不生效）；
 * - 有刷新在途 → 所有调用方（含普通 get）共享该刷新结果（刷新中的旧令牌不得再被使用）；
 * - 无 provider → null（调用方回退 legacy）；
 * - forceRefresh=true → 调 provider.refreshAccessToken()，并发共享同一任务（只刷新一次）；
 * - 普通调用 → 内存缓存命中直接返回，未命中走惰性 get（并发共享）。
 *
 * 状态语义：
 * - 刷新成功 → `swapIdentityToken` 原子替换为新令牌；
 * - 刷新失败 → 不写状态（原令牌原样保留，无半更新），本次返回 null（调用方回退 legacy）。
 */
export const getIdentityAccessToken = async (forceRefresh = false): Promise<string | null> => {
  // DEV 专用打桩缝优先（生产构建 `import.meta.env.DEV` 为 false → 永远读不到打桩值）
  const stubbed = readDevAccessTokenStub()
  if (stubbed) return stubbed
  if (!activeProvider) return null
  // 刷新在途：共享同一轮刷新（普通 get 也等待其结果，避免复用刷新中的旧令牌）
  if (refreshInFlight) return refreshInFlight
  if (!forceRefresh && tokenState.token) return tokenState.token
  if (forceRefresh) {
    // task 先以 null 初始化：闭包内以 refreshInFlight === task 判断“仍是当前在途任务”
    let task: Promise<string | null> | null = null
    task = (async () => {
      try {
        const raw = await activeProvider?.refreshAccessToken()
        const value = normalizeToken(raw)
        // 仅当刷新成功且仍是当前在途任务时才原子写回（clear 之后迟到的结果不污染 session）
        if (value && refreshInFlight === task) {
          swapIdentityToken(value)
        }
        // 刷新失败（空值）：不写状态 → 令牌状态保持原样（无半更新），返回 null 让调用方回退 legacy
        return value || null
      } finally {
        if (refreshInFlight === task) {
          refreshInFlight = null
        }
      }
    })()
    refreshInFlight = task
    return task
  }
  // 惰性 get：并发调用共享同一任务
  if (getInFlight) return getInFlight
  let task: Promise<string | null> | null = null
  task = (async () => {
    try {
      const raw = await activeProvider?.getAccessToken()
      const value = normalizeToken(raw)
      if (value && getInFlight === task) {
        swapIdentityToken(value)
      }
      return value || null
    } finally {
      if (getInFlight === task) {
        getInFlight = null
      }
    }
  })()
  getInFlight = task
  return task
}

/** 是否配置了 provider（用于调用方判断能否走新协议） */
export const hasIdentityAccessTokenProvider = (): boolean => activeProvider !== null
