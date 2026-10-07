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

/**
 * 后端技术性原文 → 用户可读文案。
 *
 * 这些文案本身是中文，`hasCJK` 兜底会把它们原样展示；但对用户来说
 * 「无法获取加密盐值」「获取个人信息失败: 500」这类内部术语没有可操作性，
 * 而「无法解析用户信息，可能会话已过期」还会**误导**用户以为会话过期。
 * 因此在这里显式映射（#984：登录失败在任何环节都要能正确显示）。
 *
 * 顺序敏感：先长后短，避免「无法获取加密盐值」被更短的规则抢先命中。
 */
const TECHNICAL_MESSAGE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/无法获取登录参数（加密盐值或 execution）/, '暂时无法获取登录信息，请稍后重试'],
  [/无法获取加密盐值/, '暂时无法获取登录信息，请稍后重试'],
  [/无法解析用户信息/, '登录已通过，但教务返回的数据无法解析，请稍后重试'],
  [/^获取个人信息失败/, '登录已通过，但获取个人信息失败，请稍后重试'],
  [/^获取登录页失败/, '暂无法获取登录信息，请检查网络后重试'],
  // 后端原文里带 `service=<url>` 内部参数，不能直接展示给用户
  [/CAS 服务未注册/, '该入口暂未开通统一身份认证，请稍后重试或联系管理员'],
  [/认证服务返回 5xx/, '认证服务暂时不可用（服务器异常），请稍后重试'],
  [/Captcha image is too small/i, '验证码获取失败，请点击验证码图片刷新后重试'],
  [/验证码图片为空或过小/, '验证码获取失败，请点击验证码图片刷新后重试'],
  [/登录未生效/, '登录未生效，请重试或稍后再试']
]

/**
 * 后端登录链路**全部**已知错误文案（Rust 侧 `http_client/auth.rs` + `session.rs`
 * + `transport/tauri/auth.rs` 的出口）。
 *
 * 契约：每一条都必须映射成**非空、含中文**的文案，且不得泄漏英文技术原文。
 * 由 `login_errors.spec.ts` 的契约测试逐条断言 —— 后端新增错误文案时，
 * 若忘记在前面的规则或本映射表里覆盖，测试会失败。
 */
export const BACKEND_LOGIN_ERROR_SAMPLES: readonly string[] = [
  // 冷却 / backoff 门
  '登录频率过高，请59秒后再试',
  '网络异常，请4秒后再试',
  // 获取登录页
  '获取登录页失败: error sending request for url (https://auth.hbut.edu.cn/authserver/login): connection closed; 重试仍失败: timed out',
  '服务器 IP 被学校冻结，请稍后再试或联系管理员',
  'CAS 服务未注册（service=https://x），请改用融合门户默认登录链路',
  '无法获取加密盐值',
  '无法获取登录参数（加密盐值或 execution）',
  // 验证码
  '验证码错误',
  'OCR all endpoints failed: OCR status 503',
  'OCR image base64 is empty',
  '验证码图片为空或过小',
  'Captcha image is too small: 42 bytes',
  // 提交账号密码
  'username或密码错误',
  '登录失败，请检查账号或密码',
  '登录失败，请检查账号密码或验证码',
  '账号已被锁定',
  '登录过于频繁，请稍后再试',
  '登录未生效，请重试或稍后再试',
  '登录失败: 内部错误',
  '登录失败，认证服务返回 5xx',
  // 教务会话落地
  '统一身份认证已通过，但教务会话建立失败，请稍后重试',
  '登录状态已失效，请重新登录',
  '无法连接教务系统，请检查网络后重试',
  '会话已过期，请重新登录',
  '无法解析用户信息，可能会话已过期',
  '获取个人信息失败: 500',
  // 兜底
  '登录失败，请稍后重试'
]

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

  // 技术性中文原文：显式映射，避免把内部术语（甚至误导性文案）直接抛给用户
  for (const [pattern, message] of TECHNICAL_MESSAGE_MAP) {
    if (pattern.test(text)) {
      return message
    }
  }

  // 后端已产出的简洁中文文案（账号锁定/验证码错误/频率限制/IP 冻结等）原样展示
  if (hasCJK(text)) {
    return text
  }

  // 其它无法识别的技术原文
  return `登录失败：${text}`
}
