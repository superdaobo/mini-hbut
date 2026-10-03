/**
 * 服务端 / 宿主**能力声明**（capabilities）读取与保守降级（P1-1 收口）。
 *
 * 为什么需要它（与 feature flag 的本质区别）：
 * - `features.*`（flag）只表达「产品是否想要这个能力」；
 * - `capabilities.*` 表达「**端点是否真的实现**」。
 *   flag 打开但端点未实现时（P1-1：`game_verified_session_enabled` 打开后请求未实现的
 *   `/leaderboards`），UI 必须靠 capability 前置隐藏 —— 而不是点击后 404。
 *
 * 契约（Integration 对齐的**最终形状**，详见 docs/game-platform/sdk-migration-guide.md §2.3）：
 *   GET /meta        → { capabilities: { leaderboards, daily_tasks, gomoku_competitive, verified_reward } }
 *   宿主 welcome 消息 → { capabilities: { ...同名 key... } }（宿主可转发服务端能力）
 *
 * 三处能力 key 的对应关系（#965 收口，详细表格见 docs/game-platform/sdk-migration-guide.md §2.3）：
 *   - SDK canonical（本表 SERVICE_CAPABILITY_KEYS，4 键）：
 *       leaderboards / daily_tasks / gomoku_competitive / verified_reward；
 *   - 宿主 UI（apps/client `GAME_PLATFORM_CAPABILITY_KEYS`，6 键）：在 SDK 4 键基础上
 *       把 `gomoku_competitive` 细分为 `gomoku_match`（联机对局），并新增 `wallet`（钱包）
 *       与 `drift_bottle`（漂流瓶 UGC）；
 *   - 服务端（`PROTOCOL_CAPABILITIES`，9 键）：宿主 6 键 + SDK 的 `gomoku_competitive`
 *       + 宿主握手能力 `launch_ticket` / `session_recovery`。
 *   三处是**超集关系**而非别名：SDK 只消费自己的 4 个 canonical key，未识别的键一律忽略；
 *   `gomoku_competitive`（SDK/服务端）与 `gomoku_match`（宿主 UI）语义对齐，靠各自层判定。
 *
 * 降级语义（fail closed，不可违反）：
 * - **拿不到 /meta 或字段缺失 → 一律 false**（不得乐观假设可用）；
 * - 只接受布尔或可识别字面量（`'true'/'1'/'on'` → true；`'false'/'0'/'off'` → false），
 *   其它类型（对象 / 数组 / 2 / 乱码）一律视为**未声明**，仍按 false 处理；
 * - 别名容错：`capabilities.leaderboards`（主形状）、`capabilities.leaderboard`
 *   等**命名差异**别名接受 —— 集成期字段名可能有差异，SDK 不因命名差异而乐观放行，
 *   **缺失即未知、未知即 false**；
 * - **flag 形态名一律拒绝（#965 收口）**：`*_enabled` / `*Enabled` / `*_available`
 *   这类「flag 命名形态」在**任何作用域**（capabilities / features，meta / welcome）
 *   都不得作为「端点已实现」的来源 —— flag 表达「想不想要」，capability 表达「真的实现」，
 *   两者在键名形态上也不允许交叉（P1-1 复发路径）；
 * - `features.<纯能力名>` 过渡形态：仅作**集成期兼容读取**（capabilities 是唯一权威，
 *   features 只在 capabilities 缺失时兜底读取，且同样拒绝 flag 形态名）；该过渡形态
 *   计划在服务端全面下发 `capabilities` 后移除（见 M5 待确认项）；
 * - 宿主自身的握手能力（`capabilities.launch_ticket` / `session_recovery`）不属于本表，
 *   键名不匹配即忽略（不会互相污染）。
 *
 * 约束：本文件是纯函数模块（不访问 window / localStorage，不打日志）。
 */

import { isPlainObject, safeText } from './utils.js'

/** 本 SDK 认识的服务端能力（canonical key；对外形状以这里的键名为准） */
export const SERVICE_CAPABILITY_KEYS = Object.freeze([
  /** V2 榜读取端点 `GET /leaderboards` */
  'leaderboards',
  /** 每日任务（对应客户端 flag `game_daily_tasks_enabled`） */
  'daily_tasks',
  /** 五子棋竞技（对应 `gomoku_competitive_enabled`） */
  'gomoku_competitive',
  /** 可信结算发奖（对应 `verified_reward_enabled`） */
  'verified_reward'
])

/**
 * 别名表：集成期服务端/宿主字段名可能与 canonical key 略有差异，
 * 这里**只做只读兼容**，不改变优先级与保守默认。
 *
 * #965 收口：别名只保留「命名差异」条目（拼写变体 / camelCase / 历史简称），
 * **不再收录任何 flag 形态名**（`*_enabled` 等）。能力来源必须是纯能力名 ——
 * `capabilities.leaderboards_enabled=true` 是 flag 语义（「想不想要」），
 * 把它读成「端点已实现」正是 P1-1 的复发路径。
 */
const CAPABILITY_ALIASES = Object.freeze({
  leaderboards: Object.freeze(['leaderboards', 'leaderboard']),
  daily_tasks: Object.freeze(['daily_tasks', 'dailyTasks', 'game_daily_tasks']),
  gomoku_competitive: Object.freeze(['gomoku_competitive', 'gomokuCompetitive', 'competitive_gomoku']),
  verified_reward: Object.freeze(['verified_reward', 'verifiedReward', 'verified_rewards'])
})

/**
 * 形如 flag 的命名形态（`*_enabled` / `*Enabled` / `*_available` / `*Available`）：
 * **任何作用域都拒绝**（#965 从「仅 features 作用域」扩展到 capabilities 读取路径）。
 * 该正则是对别名表的纵深防御：未来若有人把 flag 形态名加回别名表，
 * 这里仍会把它拦截，保证「flag ≠ 能力」的键名边界不回退。
 */
const FLAG_SHAPED_ALIAS_RE = /(_enabled|Enabled|_available|Available)$/

/** 全部能力 = false 的保守空表（未拿到 /meta 时的唯一合法初值） */
export const emptyServiceCapabilities = () => ({
  leaderboards: false,
  daily_tasks: false,
  gomoku_competitive: false,
  verified_reward: false
})

/** 能力值解析：无法识别的类型返回 null（= 未声明，不得当作 true） */
const toCapabilityBoolean = (value) => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    const text = safeText(value).toLowerCase()
    if (['true', 'on', 'enabled', 'yes', 'available', 'implemented'].includes(text)) return true
    if (['false', 'off', 'disabled', 'no', 'unavailable', 'not_implemented', 'missing'].includes(text)) return false
  }
  return null
}

/** 在单个作用域（capabilities / features 对象）里按别名取值；未声明返回 null */
const pickDeclaredValue = (scope, key, options = {}) => {
  if (!isPlainObject(scope)) return null
  // #965：默认拒绝 flag 形态名（所有作用域一致）；options.rejectFlagShaped === false 仅留给
  // 未来「确需放开某作用域」的场景，当前无任何调用方使用该豁免
  const rejectFlagShaped = options.rejectFlagShaped !== false
  for (const alias of CAPABILITY_ALIASES[key]) {
    if (rejectFlagShaped && FLAG_SHAPED_ALIAS_RE.test(alias)) continue
    if (!Object.prototype.hasOwnProperty.call(scope, alias)) continue
    const parsed = toCapabilityBoolean(scope[alias])
    if (parsed !== null) return parsed
  }
  return null
}

/**
 * 读取能力声明（服务端权威优先，宿主代为转发次之）。
 *
 * 优先级（逐 key 判定，高优先级一旦**显式声明**即胜出）：
 *   meta.capabilities > meta.features > welcome.capabilities > welcome.features
 *
 * #965：四个作用域统一拒绝 flag 形态名；`features.<纯能力名>` 仅作集成期过渡兼容
 * （capabilities 是唯一权威，优先级更高时其声明直接胜出）。
 *
 * @param {{ meta?: object, welcome?: object }} sources
 * @returns {{ values: Record<string, boolean>, declared: string[], source: 'meta'|'welcome'|'none' }}
 *   - `values`：保守能力表（未知即 false）——UI 可直接用它做前置隐藏；
 *   - `declared`：被**显式声明**过的 key（诊断用；可区分「服务端说没有」与「还没说」）；
 *   - `source`：最高优先级声明来源。
 */
export const readServiceCapabilities = (sources = {}) => {
  const meta = isPlainObject(sources.meta) ? sources.meta : {}
  const welcome = isPlainObject(sources.welcome) ? sources.welcome : {}
  const scopes = [
    { scope: meta.capabilities, source: 'meta' },
    { scope: meta.features, source: 'meta' },
    { scope: welcome.capabilities, source: 'welcome' },
    { scope: welcome.features, source: 'welcome' }
  ]
  const values = emptyServiceCapabilities()
  const declared = []
  let sawMeta = false
  let sawWelcome = false
  for (const key of SERVICE_CAPABILITY_KEYS) {
    for (const entry of scopes) {
      const parsed = pickDeclaredValue(entry.scope, key)
      if (parsed === null) continue
      values[key] = parsed
      declared.push(key)
      if (entry.source === 'meta') sawMeta = true
      else sawWelcome = true
      break
    }
  }
  return { values, declared, source: sawMeta ? 'meta' : sawWelcome ? 'welcome' : 'none' }
}

/**
 * 是否被**显式**声明为不可用。
 *
 * 用途（P1-1 的运行时闸门）：只有在服务端/宿主明确说「没有」时才短路请求；
 * 「字段缺失」保持既有探测 + 降级行为（避免服务端尚未上线 capabilities 字段时误伤
 * 已上线的 10 个游戏；UI 侧仍以 `values` 的保守 false 做前置隐藏）。
 */
export const isCapabilityDisabled = (capabilities, key) => {
  if (!capabilities || !Array.isArray(capabilities.declared)) return false
  if (!capabilities.declared.includes(key)) return false
  return capabilities.values?.[key] === false
}
