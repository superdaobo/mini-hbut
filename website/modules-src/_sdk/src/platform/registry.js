/**
 * 服务端 registry 快照消费（game-registry.md §2/§3）。
 *
 * 设计约束：**SDK 不维护 game_id 清单**，只消费宿主握手透传的 registry 片段或 `/meta` 的
 * registry 快照；服务端值权威，游戏自报 adapter 与之冲突时以服务端为准并记诊断。
 */

import { ERROR_CODES } from '../errors.js'
import { isPlainObject, safeText, toIntegerOrNull } from '../utils.js'

/**
 * registry 条目归一（字段清单见 game-registry.md §2）。
 *
 * **幂等**：同时接受「服务端原始形状」（snake_case + 嵌套 `metric`）与「已归一形状」
 * （camelCase + 扁平 `metricName/metricMax/metricSemantics`）。原因：宿主握手 / `/meta`
 * 透传的是原始形状，而 `resolveRegistryEntry()` 会先归一一次；两条路径最终都汇入
 * `applyRegistryEntry()`，若只认一种形状，另一条路径的覆盖会静默失效（服务端权威值丢失）。
 */
export const normalizeRegistryEntry = (raw) => {
  if (!isPlainObject(raw)) return null
  const gameId = safeText(raw.game_id || raw.gameId)
  if (!gameId) return null
  const metric = isPlainObject(raw.metric) ? raw.metric : {}
  return {
    gameId,
    displayName: safeText(raw.display_name || raw.displayName),
    status: safeText(raw.status) || 'active',
    ranked: raw.ranked === true,
    classicMirror: raw.classic_mirror === true || raw.classicMirror === true,
    legacyCompatible: raw.legacy_compatible !== false && raw.legacyCompatible !== false,
    seasonEligible: raw.season_eligible === true || raw.seasonEligible === true,
    resultSchemaVersion: toIntegerOrNull(raw.result_schema_version ?? raw.resultSchemaVersion),
    metricName: safeText(metric.name || raw.metricName),
    metricMax: toIntegerOrNull(metric.max ?? raw.metricMax),
    metricSemantics: safeText(metric.semantics || raw.metricSemantics),
    scoreMax: toIntegerOrNull(raw.score_max ?? raw.scoreMax),
    minClientVersion: safeText(raw.min_client_version || raw.minClientVersion),
    economyEnabled: raw.economy_enabled === true || raw.economyEnabled === true
  }
}

const pickFromContainer = (container, gameId) => {
  if (!container) return null
  if (Array.isArray(container)) {
    return normalizeRegistryEntry(container.find((item) => safeText(item?.game_id || item?.gameId) === gameId))
  }
  if (isPlainObject(container)) {
    const direct = container[gameId]
    if (direct) return normalizeRegistryEntry(isPlainObject(direct) ? { game_id: gameId, ...direct } : direct)
    if (Array.isArray(container.games)) return pickFromContainer(container.games, gameId)
    if (isPlainObject(container.games)) return pickFromContainer(container.games, gameId)
    if (Array.isArray(container.entries)) return pickFromContainer(container.entries, gameId)
    // 宿主直接把「本游戏的 registry 条目」透传过来（推荐形态）
    const ownId = safeText(container.game_id || container.gameId)
    if (ownId ? ownId === gameId : isPlainObject(container.metric) || 'status' in container) {
      return normalizeRegistryEntry(ownId ? container : { game_id: gameId, ...container })
    }
  }
  return null
}

/**
 * 从握手响应与 /meta 中解析本游戏的 registry 条目。
 * @returns {{ entry: object|null, source: string }}
 */
export const resolveRegistryEntry = ({ welcome, meta, gameId } = {}) => {
  const candidates = [
    ['welcome.registry_entry', welcome?.registry_entry],
    ['welcome.registry', welcome?.registry],
    ['meta.registry_entry', meta?.registry_entry],
    ['meta.registry', meta?.registry],
    ['meta.games', meta?.games]
  ]
  for (const [source, container] of candidates) {
    const entry = pickFromContainer(container, safeText(gameId))
    if (entry) return { entry, source }
  }
  return { entry: null, source: '' }
}

/** 语义化版本比较（只比较数字段；无法解析的段按 0 处理） */
export const compareVersions = (left, right) => {
  const toParts = (value) =>
    safeText(value)
      .split(/[.+-]/)
      .map((item) => Number.parseInt(item, 10))
      .map((item) => (Number.isFinite(item) ? item : 0))
  const a = toParts(left)
  const b = toParts(right)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/**
 * 把 registry 条目应用到 adapter 上（服务端权威）。
 *
 * 入参 `entry` 允许是服务端原始形状或已归一形状（见 `normalizeRegistryEntry` 的幂等说明）；
 * 缺少 `game_id` 时用 `adapter.gameId` 补齐（宿主可能只透传本游戏那一条）。
 * @returns {{ adapter: object, conflicts: string[], blocked: {code: string, message: string}|null }}
 */
export const applyRegistryEntry = (adapter, rawEntry, options = {}) => {
  if (!rawEntry) return { adapter, conflicts: [], blocked: null }
  const entry = normalizeRegistryEntry({
    ...rawEntry,
    game_id: safeText(rawEntry.game_id || rawEntry.gameId) || safeText(adapter?.gameId)
  })
  if (!entry) return { adapter, conflicts: [], blocked: null }
  const conflicts = []
  if (entry.status && entry.status !== 'active') {
    return {
      adapter,
      conflicts: [`status=${entry.status}`],
      blocked:
        entry.status === 'legacy_only'
          ? { code: ERROR_CODES.LEGACY_ONLY, message: '该游戏尚未接入新版排行' }
          : { code: ERROR_CODES.GAME_DISABLED, message: '该游戏暂未开放排行' }
    }
  }
  const overrides = {}
  if (entry.metricName && entry.metricName !== adapter.metric.name) {
    conflicts.push(`metric.name:${adapter.metric.name}→${entry.metricName}`)
    overrides.metric = { ...overrides.metric, name: entry.metricName }
  }
  if (entry.metricMax !== null && entry.metricMax !== undefined && entry.metricMax !== adapter.metric.max) {
    conflicts.push(`metric.max:${adapter.metric.max}→${entry.metricMax}`)
    overrides.metric = { ...overrides.metric, max: entry.metricMax }
  }
  if (entry.metricSemantics && entry.metricSemantics !== adapter.metric.semantics) {
    conflicts.push(`metric.semantics:${adapter.metric.semantics}→${entry.metricSemantics}`)
    overrides.metric = { ...overrides.metric, semantics: entry.metricSemantics }
  }
  const capabilities = {}
  if (typeof entry.ranked === 'boolean' && entry.ranked !== adapter.capabilities.ranked) {
    conflicts.push(`ranked:${adapter.capabilities.ranked}→${entry.ranked}`)
    capabilities.ranked = entry.ranked
  }
  if (typeof entry.classicMirror === 'boolean' && entry.classicMirror !== adapter.capabilities.classicMirror) {
    capabilities.classicMirror = entry.classicMirror
  }
  if (typeof entry.seasonEligible === 'boolean' && entry.seasonEligible !== adapter.capabilities.seasonEligible) {
    capabilities.seasonEligible = entry.seasonEligible
  }
  if (typeof entry.legacyCompatible === 'boolean' && entry.legacyCompatible !== adapter.capabilities.legacyCompatible) {
    conflicts.push(`legacy_compatible:${adapter.capabilities.legacyCompatible}→${entry.legacyCompatible}`)
    capabilities.legacyCompatible = entry.legacyCompatible
  }
  if (Object.keys(capabilities).length) overrides.capabilities = capabilities
  if (entry.resultSchemaVersion !== null && entry.resultSchemaVersion !== undefined) {
    overrides.resultSchemaVersion = entry.resultSchemaVersion
  }
  if (entry.scoreMax !== null && entry.scoreMax !== undefined) {
    overrides.result = { scoreMax: entry.scoreMax }
  }

  const next = Object.keys(overrides).length ? adapter.withOverrides(overrides) : adapter

  // 软门禁：client_version 低于 registry 下限 → CLIENT_VERSION_TOO_OLD（可伪造，只用于引导升级）
  if (entry.minClientVersion && options.clientVersion) {
    const current = safeText(options.clientVersion)
    if (current && current !== 'unknown' && compareVersions(current, entry.minClientVersion) < 0) {
      return {
        adapter: next,
        conflicts,
        blocked: { code: ERROR_CODES.CLIENT_VERSION_TOO_OLD, message: '当前版本过低，请升级 App 后再试' }
      }
    }
  }
  return { adapter: next, conflicts, blocked: null }
}
