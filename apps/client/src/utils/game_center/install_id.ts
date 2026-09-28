/**
 * 游乐场灰度安装 id（契约 A）—— 分桶键的生成与持久化。
 *
 * 语义（不可放宽）：
 * - 键 `hbu_game_install_id`，值 = 128bit 随机数的 32 位小写 hex；
 * - **首次需要分桶时**生成并持久化；此后每次读取同一值（稳定分桶的前提）；
 * - 优先 `crypto.getRandomValues`；无 Web Crypto 时退化为 `Math.random` 组合
 *   （仍为 32 hex，仅用于熵不足的旧环境）；
 * - 存储不可用 / 读取抛错 / 已有值非法 / 写入未生效 → 返回 `''`。
 *   调用方（canary 判定）据此**一律排除**（fail closed）；本模块**不抛错、不伪造常量 id**。
 */
import { normalizeGameInstallId } from './canary'

/** 安装 id 的 localStorage 键（灰度分桶唯一键，任何地方不得另起一个） */
export const GAME_PLATFORM_INSTALL_ID_KEY = 'hbu_game_install_id'

const readStoredInstallId = (): { available: boolean; value: string } => {
  try {
    const storage = globalThis.localStorage
    if (!storage) return { available: false, value: '' }
    const raw = storage.getItem(GAME_PLATFORM_INSTALL_ID_KEY)
    if (raw === null) return { available: true, value: '' } // 键不存在 → 允许首次生成
    const normalized = normalizeGameInstallId(raw)
    // 键存在但内容非法（被污染 / 非本客户端写入）→ 视为不可得，不覆盖、不伪造
    return normalized ? { available: true, value: normalized } : { available: false, value: '' }
  } catch {
    return { available: false, value: '' }
  }
}

const persistInstallId = (id: string): boolean => {
  try {
    const storage = globalThis.localStorage
    if (!storage) return false
    storage.setItem(GAME_PLATFORM_INSTALL_ID_KEY, id)
    // 回读校验：部分环境 setItem 会静默失败（隐私模式 / 配额 0）
    return normalizeGameInstallId(storage.getItem(GAME_PLATFORM_INSTALL_ID_KEY)) === id
  } catch {
    return false
  }
}

/** 生成 32 位小写 hex（128bit）；优先 Web Crypto，退化到 Math.random 组合 */
const generateInstallId = (): string => {
  try {
    const cryptoObj = globalThis.crypto
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      cryptoObj.getRandomValues(bytes)
      return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // 退化到 Math.random（例如受限 WebView 禁用 crypto）
  }
  let hex = ''
  while (hex.length < 32) {
    hex += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0')
  }
  return hex.slice(0, 32)
}

/**
 * 读取（必要时生成并持久化）灰度安装 id。
 *
 * @returns 合法且已持久化的 32 位 hex；任一环节不可用 → `''`
 */
export const getOrCreateGameInstallId = (): string => {
  const stored = readStoredInstallId()
  if (!stored.available) return ''
  if (stored.value) return stored.value
  const generated = generateInstallId()
  if (!normalizeGameInstallId(generated)) return ''
  if (!persistInstallId(generated)) return ''
  return generated
}
