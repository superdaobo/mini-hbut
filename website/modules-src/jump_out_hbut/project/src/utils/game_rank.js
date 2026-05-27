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

const _safeText = (value) => String(value ?? '').trim()

const isAbortError = (error) => {
  const text = `${_safeText(error?.name)} ${_safeText(error?.message || error)}`.toLowerCase()
  return text.includes('abort') || text.includes('timeout') || text.includes('signal is aborted')
}

const _rankErrorMessage = (error) => {
  if (isAbortError(error)) return LEADERBOARD_TIMEOUT_MESSAGE
  return _safeText(error?.message || error) || '排行榜请求失败'
}

/**
 * 读取游戏模块上下文
 * 优先从 URL 参数读取，回退到 localStorage
 * @returns {{ student_id: string, player_name: string, class_name: string, rank_api: string }}
 */
export function readGameModuleContext() {
  const params = new URLSearchParams(window.location.search)
  return {
    student_id: params.get('student_id') || _getStorage('student_id') || '',
    player_name: params.get('player_name') || _getStorage('player_name') || '匿名玩家',
    class_name: params.get('class_name') || _getStorage('class_name') || '',
    rank_api: params.get('rank_api') || _getStorage('rank_api') || ''
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
export async function submitGameRank(payload) {
  const ctx = readGameModuleContext()
  if (!ctx.rank_api) {
    return { success: false, error: 'no_api' }
  }

  try {
    const response = await fetch(`${ctx.rank_api}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        game_id: GAME_ID,
        student_id: ctx.student_id,
        player_name: ctx.player_name,
        class_name: ctx.class_name
      })
    })
    return await response.json()
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
