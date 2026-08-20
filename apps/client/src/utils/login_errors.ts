/**
 * 登录链路底层错误文案 → 用户可读中文。
 *
 * 背景：登录错误大多来自 Rust 侧 `e.to_string()` 原文（如 reqwest 的
 * `error sending request for url (...)`），或 bridge 对象被序列化成
 * `[object Object]`。这里在展示层统一做一次可读化映射；后端已产出的
 * 简洁中文（如"账号已被锁定"、"验证码错误"）保持不变。
 */

const hasCJK = (text: string): boolean => /[\u4e00-\u9fff]/.test(text)

/** 后端以对象返回错误时优先取可读字段（避免出现 "[object Object]"）。 */
export const readableErrorText = (raw: unknown): string => {
  if (raw === null || raw === undefined) return ''
  if (raw instanceof Error) return raw.message
  if (typeof raw === 'object') {
    const record = raw as { message?: unknown; error?: unknown; kind?: unknown }
    for (const key of ['message', 'error', 'kind'] as const) {
      if (typeof record[key] === 'string' && String(record[key]).trim()) {
        return String(record[key]).trim()
      }
    }
  }
  return String(raw).trim()
}

/** 网络/连接层失败（reqwest、fetch 原文等）。 */
const NETWORK_ERROR_RE =
  /error sending request|timed out|timeout|connection (?:failed|closed|reset|refused)|failed to fetch|network (?:error|request)|ECONN|ENOTFOUND|ETIMEDOUT|无法连接|无法访问/i

/** 验证码识别（OCR）相关原文。 */
const OCR_ERROR_RE = /\bOCR\b|识别服务|valid.*code|recognition/i

/** 用户凭据错误（含项目里已出现的缺字变体）。 */
const CREDENTIAL_ERROR_RE =
  /用户名或密码错误|username或密码错误|账号或密码错误|帐号或密码错误|密码错误|密码不正确|用户不存在|账号不存在|帐号不存在|认证失败/i

/** 认证兜底："登录失败，请检查账号或密码"。 */
const FALLBACK_CREDENTIAL_TEXT = '登录失败，请检查账号或密码'

/** 将底层错误文案映射为用户可读中文；空对象/原文不可读时给出兜底。 */
export const friendlyLoginError = (raw: unknown): string => {
  const text = readableErrorText(raw)
  if (!text || text === '[object Object]') {
    return '登录失败，请稍后重试'
  }

  // 验证码/OCR 相关（优先于通用网络，因为 OCR 原文常以 "OCR request failed: ..." 开头）
  if (OCR_ERROR_RE.test(text)) {
    return '验证码识别服务暂不可用，请稍后重试'
  }

  // 网络/连接层失败：不把 reqwest 英文原文暴露给用户
  if (NETWORK_ERROR_RE.test(text)) {
    return '无法连接教务系统，请检查网络后重试'
  }

  if (/获取登录页失败/i.test(text)) {
    return '暂无法获取登录信息，请检查网络后重试'
  }

  // 凭据错误：修正缺字变体并给出一致文案
  if (CREDENTIAL_ERROR_RE.test(text)) {
    return '用户名或密码错误，请重新输入'
  }

  // OCR 被吞后经过认证兜底单（无法从前端区分是否源于 OCR），改成更准确的提示
  if (text === FALLBACK_CREDENTIAL_TEXT) {
    return '登录失败，请确认账号密码正确；若验证码识别服务异常也会出现此提示，请稍后重试'
  }

  // 后端已产出的简洁中文文案（账号锁定/验证码错误/频率限制/IP 冻结等）原样展示
  if (hasCJK(text)) {
    return text
  }

  // 其它无法识别的技术原文
  return `登录失败：${text}`
}
