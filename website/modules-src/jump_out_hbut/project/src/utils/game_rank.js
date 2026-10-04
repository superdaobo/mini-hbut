/**
 * game_rank.js - 排名服务工具
 * 适配自宿主应用通用排名模块
 * game_id: "jump_out_hbut"
 *
 * 提供：
 * - readGameModuleContext(): 读取游戏上下文（URL 参数 + localStorage）
 * - createRunId(): 生成唯一运行 ID
 * - submitGameRank(payload): 提交游戏分数
 * - fetchGameLeaderboard(options): 获取排行榜数据
 */

const GAME_ID = 'jump_out_hbut'
const LEADERBOARD_TIMEOUT_MESSAGE = '排行榜请求超时，请稍后重试'
const DEFAULT_RETRY_DELAYS_MS = [1200, 2600, 5200]

/**
 * 游戏模块私有上下文键（与其余 10 个游戏的模板约定一致：
 * camelCase 字段，宿主启动清理器 `migrateLegacyGameRankContexts` 按
 * `<gameId>_rank_context_v1` 后缀识别并做跨环境 base 校验）。
 */
const RANK_CONTEXT_KEY = `${GAME_ID}_rank_context_v1`

/**
 * #968c：历史「裸键」读取兼容（`student_id` / `rank_api` 等直接写在 localStorage 顶层）。
 *
 * 「生产无写入方」核对结论（#968）：全仓 `setItem('student_id' / 'rank_api' / ...)`
 * 只出现在测试夹具（`apps/client/src/utils/game_center_p0_identity.spec.ts` 与本文件的
 * `game_rank.test.js`）；生产链路（宿主 MoreView / 模块环境注入）统一通过 URL 参数或
 * `<gameId>_rank_context_v1` 私有上下文传值。保留裸键读取只为极老版本残留数据兜底。
 *
 * 兜底值读到即**一次性迁移**：写入私有上下文（camelCase）后清除裸键 ——
 * 一是裸键不再游离在清理边界之外（迁移后宿主清理器可校验 `rankApiBase` 环境），
 * 二是脏数据不会永久残留。迁移失败不阻塞读取（照常返回兜底值，下次启动重试）。
 */

const _safeText = (value) => String(value ?? '').trim()

const isAbortError = (error) => {
  const text = `${_safeText(error?.name)} ${_safeText(error?.message || error)}`.toLowerCase()
  return text.includes('abort') || text.includes('timeout') || text.includes('signal is aborted')
}

const _rankErrorMessage = (error) => {
  if (isAbortError(error)) return LEADERBOARD_TIMEOUT_MESSAGE
  return _safeText(error?.message || error) || '排行榜请求失败'
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))))

const shouldRetrySubmitError = (error) => {
  const status = Number(error?.status || 0)
  if (status === 429) return true
  if (status >= 500 && status <= 599) return true
  return isAbortError(error) || /network|fetch|failed|timeout/i.test(_safeText(error?.message || error))
}

const readJsonResponse = async (response) => {
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text || '{}')
  } catch {
    parsed = null
  }
  if (!response.ok) {
    const error = new Error(_safeText(parsed?.error || parsed?.message || text) || `HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('排行榜服务返回了无效响应')
  }
  if (parsed.success === false) {
    const error = new Error(_safeText(parsed.error || parsed.message) || '排行榜服务返回失败')
    error.status = Number(parsed.status || 0)
    throw error
  }
  return parsed
}

const requestJsonWithRetry = async (url, init, options = {}) => {
  const retryDelays = Array.isArray(options.retryDelaysMs) ? options.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS
  let lastError = null
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (attempt > 0) await wait(retryDelays[attempt - 1])
    try {
      const response = await fetch(url, init)
      return await readJsonResponse(response)
    } catch (error) {
      lastError = error
      if (attempt >= retryDelays.length || !shouldRetrySubmitError(error)) {
        throw error
      }
    }
  }
  throw lastError || new Error('排行榜请求失败')
}

/**
 * 读取游戏模块上下文
 * 优先从 URL 参数读取，再读私有上下文（迁移后的规范落点），最后兜底历史裸键（读到即迁移）
 * @returns {{ student_id: string, player_name: string, class_name: string, rank_api: string }}
 */
export function readGameModuleContext() {
  const params = new URLSearchParams(window.location.search)
  return {
    student_id: params.get('student_id') || _readContextField('student_id', 'studentId') || '',
    player_name: params.get('player_name') || _readContextField('player_name', 'playerName') || '匿名玩家',
    class_name: params.get('class_name') || _readContextField('class_name', 'className') || '',
    rank_api: params.get('rank_api') || _readContextField('rank_api', 'rankApiBase') || ''
  }
}

/**
 * 生成唯一运行 ID
 * 格式：时间戳_随机字符串
 * @returns {string}
 */
export function createRunId() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

/**
 * 提交游戏分数到排名服务
 * @param {object} payload - 提交数据
 * @param {number} payload.score - 本局分数
 * @param {number} payload.max_level - 最大关卡/跳跃次数
 * @param {number} payload.duration_ms - 游戏时长（毫秒）
 * @param {number} payload.move_count - 操作次数/跳跃次数
 * @param {string} payload.run_id - 本局唯一 ID
 * @param {string} [payload.ended_reason] - 结束原因
 * @returns {Promise<{ success: boolean, error?: string, [key: string]: any }>}
 */
export async function submitGameRank(payload, options = {}) {
  const ctx = readGameModuleContext()
  if (!ctx.rank_api) {
    return { success: false, error: 'no_api' }
  }

  try {
    return await requestJsonWithRetry(`${ctx.rank_api}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        game_id: GAME_ID,
        student_id: ctx.student_id,
        player_name: ctx.player_name,
        class_name: ctx.class_name
      })
    }, options)
  } catch (e) {
    return { success: false, error: _rankErrorMessage(e) }
  }
}

/**
 * 获取排行榜数据
 * @param {object} [options]
 * @param {'class'|'school'|'class_total'} [options.scope='class'] - 排行榜范围
 * @param {number} [options.limit=20] - 返回条数
 * @returns {Promise<{ success: boolean, leaderboard?: Array, player?: object, data?: Array, error?: string }>}
 */
export async function fetchGameLeaderboard({ scope = 'class', limit = 20 } = {}) {
  const ctx = readGameModuleContext()
  if (!ctx.rank_api) {
    return { success: false, error: 'no_api', data: [] }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const params = new URLSearchParams({
      game_id: GAME_ID,
      scope,
      limit: String(limit)
    })
    if (ctx.student_id) params.set('student_id', ctx.student_id)
    if (ctx.class_name) params.set('class_name', ctx.class_name)
    params.set('school_name', '湖北工业大学')

    const url = `${ctx.rank_api}/leaderboard?${params.toString()}`
    const response = await fetch(url, {
      signal: controller.signal
    })
    clearTimeout(timeout)
    return await response.json()
  } catch (e) {
    clearTimeout(timeout)
    return { success: false, error: _rankErrorMessage(e), data: [] }
  }
}

/**
 * 安全读取 localStorage
 * @param {string} key
 * @returns {string|null}
 */
function _getStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch (e) {
    return null
  }
}

/**
 * 从私有上下文取字段；缺失时回落历史裸键并触发一次性迁移（#968c，见文件头说明）。
 * @param {string} bareKey 历史裸键（snake_case）
 * @param {string} camelKey 私有上下文字段名（camelCase，与 10 游戏模板约定一致）
 * @returns {string}
 */
function _readContextField(bareKey, camelKey) {
  const raw = _getStorage(RANK_CONTEXT_KEY)
  if (raw) {
    try {
      const stored = JSON.parse(raw)
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        const value = String(stored[camelKey] ?? '').trim()
        if (value) return value
      }
    } catch (e) {
      // 坏 JSON 视为未迁移，走裸键兜底
    }
  }
  // 历史裸键兜底：读到即迁入私有上下文并清除裸键
  const bareValue = String(_getStorage(bareKey) ?? '').trim()
  if (!bareValue) return ''
  try {
    let stored = {}
    const existing = _getStorage(RANK_CONTEXT_KEY)
    if (existing) {
      const parsed = JSON.parse(existing)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed
    }
    stored[camelKey] = bareValue
    localStorage.setItem(RANK_CONTEXT_KEY, JSON.stringify(stored))
    localStorage.removeItem(bareKey)
  } catch (e) {
    // 迁移失败不阻塞读取：裸键值照常返回，下次启动重试
  }
  return bareValue
}
