/**
 * 合成湖工大 排行榜失败原因透出（#998）。
 *
 * 为什么单独抽一个纯函数模块：
 * 这里是「真实错误被兜底文案吞掉」的唯一收口点 —— 修复前所有非超时 / 非班级的失败
 * （服务端 400 如「学校排行榜缺少 school_name」、5xx、响应非 JSON、SDK 的
 * 「未连接排行榜服务（本地游玩）」）在界面上都渲染成同一句「排行榜加载失败，请稍后重试」，
 * 用户和排障都拿不到任何线索。抽成纯函数后可以被单测直接覆盖，避免再次静默退化。
 *
 * 约束：
 * - 不引入凭据 / 学号（服务端榜单错误本身不含这些字段，且 SDK 已保证错误对象不带身份）；
 * - 原因过长时截断，避免撑破榜单面板。
 */

/** 兜底抬头（信息量为零时的最终文案） */
export const LEADERBOARD_FALLBACK_TEXT = '排行榜加载失败，请稍后重试'

/** 追加原因的最大长度，超出截断（面板宽度有限） */
export const LEADERBOARD_ERROR_DETAIL_MAX_LENGTH = 60

/**
 * 把真实失败原因追加到兜底文案之后。
 *
 * - `error.message` 为空、或与抬头重复 → 只返回抬头，避免出现「…失败（…失败）」的噪音；
 * - 有 HTTP 状态码（`error.status` / `error.httpStatus`）时以 `HTTP <code>：` 前缀呈现，
 *   让「服务端拒绝（4xx/5xx）」与「网络不可达」在界面上可区分；
 * - 其余情况直接把原因放进括号。
 *
 * @param {string} fallbackText 友好抬头
 * @param {{ message?: unknown, status?: unknown, httpStatus?: unknown } | null | undefined} error
 * @returns {string}
 */
export const appendLeaderboardErrorDetail = (fallbackText, error) => {
  const head = String(fallbackText || LEADERBOARD_FALLBACK_TEXT)
  const raw = String(error?.message || '').trim()
  if (!raw || raw === head || raw === '排行榜加载失败') {
    return head
  }
  const status = Number(error?.status || error?.httpStatus || 0)
  const compact =
    raw.length > LEADERBOARD_ERROR_DETAIL_MAX_LENGTH
      ? `${raw.slice(0, LEADERBOARD_ERROR_DETAIL_MAX_LENGTH)}…`
      : raw
  return status >= 100 ? `${head}（HTTP ${status}：${compact}）` : `${head}（${compact}）`
}
