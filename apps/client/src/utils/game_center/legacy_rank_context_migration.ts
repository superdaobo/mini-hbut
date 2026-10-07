/**
 * 旧版游戏排行榜上下文里的「跨环境 API base」清理（#911 P1-⑤ 残留）
 *
 * 背景：#907 迁移之前，10 个游戏的 `project/src/utils/game_rank.js` 把**测试空间**的
 * 排行榜地址（`/api/game-rank`，主机为 testocr1 测试空间）硬编码为默认 base，
 * 并在首次游玩时连同身份字段一起写进 localStorage（键 `<gameId>_rank_context_v1`）。
 *
 * 收口改动（#946 删模块字面量、#943 删 SDK 默认回落）**管不到已落盘的值**：
 * SDK 的 base 决策链（`_sdk/src/legacy/legacy-rank.js`）仍把 `stored` 当作合法来源
 * （契约允许，见 `docs/game-platform/sdk-migration-guide.md` 的 `sources.*` 取值）。
 * 于是老用户在**网页直开模块**（没有 Host 注入 `rank_api`）时仍会向测试库提交成绩 ——
 * 违反「standalone 默认不提交远程成绩」。
 *
 * 本模块只做一件事：**幂等清理被污染的落盘 base**。
 *
 * 规则：
 * 1. 只删 base 字段，**保留**身份字段（学号 / 昵称 / 班级 / 学校 / 专业）：
 *    身份字段仍供本地展示；base 缺失后 SDK 判定不可提交（fail closed → standalone，
 *    成绩仅本地保留）；
 * 2. 环境判定**复用客户端唯一权威** `isStatisticsServiceUrlCompatible`
 *    （release 构建拒测试域、测试构建拒生产域，自定义域与 loopback 两边都放行），
 *    不新增第二份域名清单；
 * 3. 幂等：清理后该条不再含 base，重复执行无副作用。**刻意不设全局标记** ——
 *    环境判定取决于构建档位，留出自愈余地（换了档位的构建会重新判定一次）。
 */

import { pushDebugLog } from '../debug_logger'
import { isStatisticsServiceUrlCompatible } from '../statistics_environment'

/** 只用到读取/写回/枚举能力的最小存储面（便于注入假存储做单测） */
export interface LegacyRankContextStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 游戏模块私有上下文的键后缀（10 个游戏共用的模板约定） */
export const LEGACY_RANK_CONTEXT_KEY_SUFFIX = '_rank_context_v1'

/** base 字段的两种写法（camelCase 为现行，snake_case 为历史遗留） */
const BASE_FIELD_KEYS = ['rankApiBase', 'rank_api'] as const

/** 判定 localStorage 键是否为游戏排行榜上下文（`<gameId>_rank_context_v1`） */
export const isLegacyRankContextKey = (key: unknown): boolean => {
  const text = String(key ?? '')
  return text.length > LEGACY_RANK_CONTEXT_KEY_SUFFIX.length && text.endsWith(LEGACY_RANK_CONTEXT_KEY_SUFFIX)
}

// ---------------------------------------------------------------------------
// 文本级字段手术（#968a：不做 JSON.parse → stringify 整记录往返）
//
// 旧实现「解析整条记录 → delete → stringify 写回」会**变形未触碰字段**：
// 超 2^53 的大整数被改写精度、`Infinity` 之外的数字形态被规范化、键序可能重排。
// 落盘记录是用户数据，清理器只应触碰它要修的 base 字段 —— 其余字段必须逐字节等价。
// 因此：JSON.parse 只用于**判定**（字段是否存在、值是否需要删），写回在**原始文本**上
// 手术式移除目标键值对（扫描器按 JSON 文法逐 token 前进，格式/空白/转义原样保留）。
// ---------------------------------------------------------------------------

/** 顶层对象的一个条目（键 + 从键名首引号到值末字符/其后逗号的原文区间） */
interface RawEntry {
  key: string
  entryStart: number
  entryEnd: number
}

/** 扫描字符串字面量；start 指向开引号，返回结束引号的下一位（失败 null） */
const skipStringLiteral = (text: string, start: number): number | null => {
  let i = start + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '"') return i + 1
    i += 1
  }
  return null
}

/** 扫描一个 JSON 值（字符串/对象/数组/数字/字面量），返回结束位置（失败 null） */
const skipJsonValue = (text: string, start: number): number | null => {
  const ch = text[start]
  if (ch === '"') return skipStringLiteral(text, start)
  if (ch === '{' || ch === '[') {
    let depth = 0
    let i = start
    while (i < text.length) {
      const c = text[i]
      if (c === '"') {
        const after = skipStringLiteral(text, i)
        if (after === null) return null
        i = after
        continue
      }
      if (c === '{' || c === '[') depth += 1
      else if (c === '}' || c === ']') {
        depth -= 1
        if (depth === 0) return i + 1
      }
      i += 1
    }
    return null
  }
  // 数字 / true / false / null：读到 ',' 或 '}'（外层定界符）为止
  let i = start
  while (i < text.length && text[i] !== ',' && text[i] !== '}') i += 1
  return i
}

/**
 * 扫描顶层 JSON 对象的条目列表（文本必须已是合法 JSON 对象 —— JSON.parse 先行保证）。
 * 结构非法时返回 null（此时整体不动，绝不写回半解析结果）。
 */
const scanTopLevelEntries = (text: string): RawEntry[] | null => {
  const start = text.length - text.trimStart().length
  if (text[start] !== '{') return null
  const entries: RawEntry[] = []
  let i = start + 1
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i += 1
    if (text[i] === '}') break
    if (text[i] !== '"') return null
    const keyEnd = skipStringLiteral(text, i)
    if (keyEnd === null) return null
    let key: string
    try {
      key = JSON.parse(text.slice(i, keyEnd)) as string
    } catch {
      return null
    }
    let j = keyEnd
    while (j < text.length && /\s/.test(text[j])) j += 1
    if (text[j] !== ':') return null
    j += 1
    while (j < text.length && /\s/.test(text[j])) j += 1
    const valueEnd = skipJsonValue(text, j)
    if (valueEnd === null || valueEnd > text.length) return null
    // 条目终点：值后跳过空白，若紧跟逗号则一并划入条目（逗号随条目删除）
    let entryEnd = valueEnd
    while (entryEnd < text.length && /\s/.test(text[entryEnd])) entryEnd += 1
    if (text[entryEnd] === ',') entryEnd += 1
    entries.push({ key, entryStart: i, entryEnd })
    i = entryEnd
  }
  return entries
}

/**
 * 清理单条落盘上下文。
 *
 * **两个 base 字段各自独立判定**（不得"取一个值后全删/全留"）：
 * 同一条记录里 `rankApiBase` 与历史 `rank_api` 可能同时存在且值不同 ——
 * 取一个值判定会漏删另一侧的跨环境值，或把另一侧的合法值连带删除。
 * 只保留「非空且环境兼容」的字段，其余逐个删除。
 *
 * **写回不做整记录往返（#968a）**：JSON.parse 只用于判定，写回在原始文本上
 * 手术式移除目标键值对 —— 除目标 base 外的字段**逐字节等价**（大整数精度、
 * 空白格式、键序、转义全部原样保留）。若同一键名出现多次（JSON 允许重复键，
 * parse 只认最后一个），判定为需删时会移除**全部**同名条目，避免复活被覆盖的旧值。
 *
 * @param raw localStorage 原始字符串
 * @returns 需要写回的文本（其余字节与原文逐一致）；`null` = 无需改动（非对象 / 无 base 字段 / 全部字段都合法）
 */
export const sanitizeLegacyRankContextRaw = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>

  // 判定阶段（与既有语义一致）：确定哪些 base 字段需要删除
  const keysToRemove = new Set<string>()
  for (const key of BASE_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const base = String(record[key] ?? '').trim()
    // 非空且环境兼容 → 合法来源，保留；空值与非环境中值一律删除
    if (base && isStatisticsServiceUrlCompatible(base)) continue
    keysToRemove.add(key)
  }
  if (keysToRemove.size === 0) return null

  // 手术阶段：在原始文本上定位并移除目标条目（其余字节原样保留）
  const entries = scanTopLevelEntries(raw)
  if (!entries) return null
  const ranges: Array<[number, number]> = []
  for (const entry of entries) {
    if (!keysToRemove.has(entry.key)) continue
    let [from, to] = [entry.entryStart, entry.entryEnd]
    if (raw[to - 1] === ',') {
      // 条目已含其后的逗号
    } else {
      // 最后一个条目（其后直接是 '}'）：把**前方**紧邻的逗号一并删除，保持 JSON 合法
      let probe = to
      while (probe < raw.length && /\s/.test(raw[probe])) probe += 1
      if (raw[probe] === '}') {
        let back = from
        while (back > 0 && /\s/.test(raw[back - 1])) back -= 1
        if (raw[back - 1] === ',') from = back - 1
      }
    }
    ranges.push([from, to])
  }
  if (ranges.length === 0) return null
  let output = raw
  for (const [from, to] of ranges.reverse()) {
    output = output.slice(0, from) + output.slice(to)
  }
  return output
}

/** 取默认存储（不可用时返回 null，不抛出） */
const resolveStorage = (storage?: LegacyRankContextStorage | null): LegacyRankContextStorage | null => {
  if (storage) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 扫描并清理所有游戏排行榜上下文里的跨环境 / 空 base（幂等，可在启动时安全调用）。
 *
 * @param storage 可注入的存储面（默认全局 localStorage；单测用假存储）
 *
 * 失败不抛出：写回异常只跳过该条，下次启动重试。
 */
export const migrateLegacyGameRankContexts = (storage?: LegacyRankContextStorage | null): void => {
  try {
    const store = resolveStorage(storage)
    if (!store) return
    // 先收集键名再改动：避免边遍历边写导致索引漂移
    const keys: string[] = []
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      if (key && isLegacyRankContextKey(key)) keys.push(key)
    }
    let cleaned = 0
    for (const key of keys) {
      const next = sanitizeLegacyRankContextRaw(store.getItem(key))
      if (next === null) continue
      try {
        store.setItem(key, next)
        cleaned += 1
      } catch {
        // 单条写回失败（配额/隐私模式）：跳过，下次启动重试
      }
    }
    if (cleaned > 0) {
      pushDebugLog(
        'LegacyMigration',
        `已清理 ${cleaned} 个游戏排行榜上下文的跨环境 API base（清理后转 standalone，不再远程提交）`,
        'info'
      )
    }
  } catch (error) {
    pushDebugLog('LegacyMigration', '游戏排行榜上下文清理失败，将在下次启动重试', 'warn', error)
  }
}
