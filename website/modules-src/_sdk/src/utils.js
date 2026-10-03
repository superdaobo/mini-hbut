/**
 * 纯工具函数集合（无副作用、无全局依赖的模块顶层访问）。
 *
 * 约束：
 * - 本文件不得访问 window / document / localStorage（模块顶层访问会在 Node 测试环境炸掉）；
 * - 所有 crypto / storage 访问都必须经过运行时守卫 + try/catch。
 */

/** 统一文本归一：null/undefined → ''，其余 trim */
export const safeText = (value) => String(value ?? '').trim()

/** 仅在「确实是非空字符串」时返回，否则返回兜底值 */
export const textOr = (value, fallback = '') => {
  const text = safeText(value)
  return text || fallback
}

/** 严格普通对象判断（排除数组 / null） */
export const isPlainObject = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * 整数转换：非整数输入一律视为非法（返回 null）。
 * 协议 §3.3.1 明确禁止浮点（含 1.0 / 1e3），因此这里用 Number.isInteger 严格判定。
 */
export const toIntegerOrNull = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

/** 整数边界收敛（越界返回 null，由调用方决定报错还是截断） */
export const clampInteger = (value, min, max) => {
  const parsed = toIntegerOrNull(value)
  if (parsed === null) return null
  if (parsed < min || parsed > max) return null
  return parsed
}

/** 与运行时无关的 setTimeout（测试可用 vi.stubGlobal 注入 window.setTimeout） */
export const delay = (ms) =>
  new Promise((resolve) => {
    const timer = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout : null
    if (!timer) return resolve()
    timer(resolve, Math.max(0, Number(ms) || 0))
  })

/** UTF-8 字节长度（协议 §4.2 的字节上限口径） */
export const utf8ByteLength = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null) ?? ''
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length
  // 无 TextEncoder 时的保守估算：ASCII 1 字节，其余 3 字节
  let bytes = 0
  for (const char of text) bytes += char.codePointAt(0) > 0x7f ? 3 : 1
  return bytes
}

/** NFC 归一化（协议 §3.3.1 第 3 条 / §4.1 extra 字符串） */
export const normalizeNfc = (value) => {
  const text = String(value ?? '')
  return typeof text.normalize === 'function' ? text.normalize('NFC') : text
}

/**
 * canonical_json（protocol-v1.md §3.3.1 逐条实现）：
 * 1) 只允许 object / array / string / integer / boolean / null，出现浮点即抛错；
 * 2) object 键按 Unicode 码点升序，禁止重复键；
 * 3) 无空白分隔；
 * 4) 整数最短十进制；boolean/null 小写字面量。
 *
 * SDK 不提交 content_hash（协议 §3.3.1 末行「客户端不提交」），但需要用它生成
 * **本地幂等签名**：同一 run 的重复 finish 必须字节级同 payload。
 */
export const canonicalJson = (value) => {
  if (value === null) return 'null'
  const type = typeof value
  if (type === 'boolean') return value ? 'true' : 'false'
  if (type === 'string') return JSON.stringify(normalizeNfc(value))
  if (type === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError('canonical_json 禁止浮点数值（protocol-v1.md §3.3.1）')
    }
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
  }
  if (type === 'object') {
    const keys = Object.keys(value).sort()
    const seen = new Set()
    const parts = []
    for (const key of keys) {
      if (seen.has(key)) throw new TypeError(`canonical_json 存在重复键: ${key}`)
      seen.add(key)
      const item = value[key]
      if (item === undefined) continue
      parts.push(`${JSON.stringify(normalizeNfc(key))}:${canonicalJson(item)}`)
    }
    return `{${parts.join(',')}}`
  }
  throw new TypeError(`canonical_json 不支持的类型: ${type}`)
}

/** 随机字节（CSPRNG 优先，缺失时退化为 Math.random；仅用于非机密标识） */export const randomToken = (bytes = 16) => {
  const size = Math.max(8, Math.min(64, Math.floor(bytes) || 16))
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const buffer = new Uint8Array(size)
    cryptoRef.getRandomValues(buffer)
    return Array.from(buffer, (item) => item.toString(16).padStart(2, '0')).join('')
  }
  let text = ''
  while (text.length < size * 2) text += Math.random().toString(16).slice(2)
  return text.slice(0, size * 2)
}

/** 生成带前缀的关联 id（telemetry correlation id 与 run_id 共用同一生成器） */
export const createPrefixedId = (prefix, timestamp = Date.now(), entropy = randomToken(8)) =>
  `${prefix}_${timestamp}_${entropy}`

/** 当前时间毫秒（可注入以便测试） */
export const nowMs = (clock) => (typeof clock === 'function' ? clock() : Date.now())

/** 生成 run_id：满足 ^[A-Za-z0-9_-]{8,128}$ 且全局唯一（协议 §2.2） */
export const createRunId = (clock) => createPrefixedId('run', nowMs(clock), randomToken(6))

/** 生成 sid 形状的公开会话标识（仅测试/本地使用；真实 session_id 由服务端签发） */
export const createSessionId = () => `sid_${randomToken(16)}`

/** ISO 时间字符串（毫秒精度，UTC） */
export const toIsoString = (value) => {
  const parsed = value instanceof Date ? value.getTime() : Number(value)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toISOString()
}

/**
 * 宽容版稳定序列化：用于**本地**比较调用方输入是否变化（不进入网络请求、不要求整数）。
 * - 键排序、去 undefined、字符串 NFC，保证同一逻辑输入得到同一字符串。
 */
export const stableStringify = (value) => {
  const walk = (input) => {
    if (input === null || input === undefined) return null
    const type = typeof input
    if (type === 'string') return normalizeNfc(input)
    if (type === 'number' || type === 'boolean') return input
    if (Array.isArray(input)) return input.map((item) => walk(item))
    if (type === 'object') {
      const out = {}
      for (const key of Object.keys(input).sort()) {
        if (input[key] === undefined) continue
        out[key] = walk(input[key])
      }
      return out
    }
    return String(input)
  }
  try {
    return JSON.stringify(walk(value))
  } catch {
    return ''
  }
}

/** 安全 JSON 解析 */
export const safeParseJson = (raw, fallback = null) => {
  try {
    return JSON.parse(raw || '')
  } catch {
    return fallback
  }
}

/** 不可变冻结（浅层）：用于对外暴露的配置对象，避免调用方误改 SDK 内部状态 */
export const freezeShallow = (value) => (value && typeof value === 'object' ? Object.freeze({ ...value }) : value)

/** 从 URLSearchParams 兼容对象里取值（同时兼容 URLSearchParams 与普通对象） */
export const readParam = (params, key) => {
  if (!params) return ''
  if (typeof params.get === 'function') return safeText(params.get(key))
  return safeText(params[key])
}

/**
 * 剥离尾部斜杠（#967）。
 *
 * 用循环替代 `s.replace(/\/+$/, '')`：CodeQL `js/polynomial-redos` 对「可控 URL 输入 +
 * 正则替换」给出保守告警，非正则实现在行为完全等价（NFC/原始串、空串、全斜杠）的前提下
 * 消除全部正则回溯面。SDK 的 API base 均来自宿主注入/页面 URL，属输入可控场景。
 */
export const stripTrailingSlashes = (value) => {
  const s = String(value ?? '')
  let end = s.length
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end -= 1
  return end === s.length ? s : s.slice(0, end)
}

/** 大小写不敏感的固定后缀判断（非正则；等价于 `/suffix$/i.test(s)`，suffix 须为字面量） */
export const endsWithCi = (value, suffix) => {
  const s = String(value ?? '')
  const fixed = String(suffix ?? '')
  if (!fixed || s.length < fixed.length) return false
  return s.slice(s.length - fixed.length).toLowerCase() === fixed.toLowerCase()
}

/**
 * 剥离第一个固定后缀及其后所有内容（非正则；#967）。
 * 等价于 `s.replace(new RegExp(escaped(suffix) + '.*$', 'i'), '')`：
 * 替换「第一个出现位置」到串尾的整段。用于 `rank_api` → V2 base 的同源推导。
 */
export const stripFirstSuffixAndRestCi = (value, suffix) => {
  const s = String(value ?? '')
  const fixed = String(suffix ?? '').toLowerCase()
  if (!fixed) return s
  const idx = s.toLowerCase().indexOf(fixed)
  return idx >= 0 ? s.slice(0, idx) : s
}
