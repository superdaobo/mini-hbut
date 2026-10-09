// src/features/teacher/utils/normalizeTeacherData.ts
//
// Teacher Portal V2（#1019）：教师教务只读数据的归一化工具。
//
// 职责：
//   1. **HTML 清洗**：教务通知/标题字段含 HTML（recon 06 §2.1），必须先清洗。
//      复用现有 `utils/school_inbox_content`（白名单标签重建，禁止 innerHTML 直出）。
//   2. **字段标准化**：学期 / 日期 / 周次 / 节次 / 文本。
//   3. **稳定去重键**：跨周、跨刷新、跨账号都稳定，**严禁 Date.now() 参与**
//      （否则每次拉取都会生成新键，导致提醒重复、缓存穿透）。
//   4. 过滤教务框架注入的身份字段（recon 02 §6）。

import {
  looksLikeHtml,
  sanitizeSchoolInboxHtml
} from '../../../utils/school_inbox_content.js'
import type {
  Invigilation,
  TeacherExam,
  TeacherExamData,
  TeacherNotice,
  TeacherProfile,
  TeacherTeachingData,
  TeachingClass,
  TeachingTask,
  WorkflowItem
} from '../types'

// ────────────────────────────────────────────────────────────────
// 原始值读取
// ────────────────────────────────────────────────────────────────

/** 安全取对象（非对象/数组返回空对象）。 */
export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/** 安全取数组。 */
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** 取字符串（null/undefined → ''，其余 String 后 trim）。 */
export const asString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** 取数字（无法解析 → undefined；注意 recon 中 `bjrs` 为数字而 `xf` 为字符串）。 */
export const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/**
 * 教务框架注入的身份/权限字段（recon 02 §6 / 04 §0.2）。
 * **不属于业务数据**，解析时必须整体丢弃。
 */
export const INJECTED_IDENTITY_FIELDS: ReadonlySet<string> = Object.freeze(
  new Set([
    'currentUserId',
    'userRoleId',
    'dataAuth',
    'dataXnxq',
    'currentRoleId',
    'currentJsId',
    'currentUserName',
    'currentDepartmentId',
    'new'
  ])
)

/** 返回剔除注入字段后的浅拷贝（用于日志/fixture 时不泄露工号、角色上下文）。 */
export const stripInjectedIdentityFields = (
  record: Record<string, unknown>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (INJECTED_IDENTITY_FIELDS.has(key)) continue
    out[key] = value
  }
  return out
}

// ────────────────────────────────────────────────────────────────
// HTML / 文本
// ────────────────────────────────────────────────────────────────

/**
 * 单次扫描的实体解码表。
 *
 * 刻意用「一次扫描 + 映射」而不是链式 `.replace`：链式替换会把 `&amp;lt;` 解成
 * `&lt;` 再解成 `<`，即**双重反转义**，等于凭空造出标签（CodeQL `js/double-escaping`）。
 */
const HTML_ENTITY_MAP: Readonly<Record<string, string>> = Object.freeze({
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
})

/** 一次性解码实体：`&amp;lt;` 只解成 `&lt;`，不会继续解成 `<`。 */
const decodeEntitiesOnce = (input: string): string =>
  input.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, (entity) => {
    const mapped = HTML_ENTITY_MAP[entity.toLowerCase()]
    return mapped === undefined ? entity : mapped
  })

/**
 * 反复剥标签直到结果稳定。
 *
 * 单次 `replace` 可被嵌套构造绕过（如 `<<script>script>` 只删掉前半段，反而
 * 留下可解析的片段，CodeQL `js/incomplete-multi-character-sanitization`）；
 * 因此循环到不再变化为止，并设置上限防止构造出的病态输入导致死循环。
 */
const stripTagsUntilStable = (input: string): string => {
  let current = input
  for (let pass = 0; pass < 32; pass += 1) {
    const next = current.replace(/<[^>]*>?/g, '')
    if (next === current) return next
    current = next
  }
  // 达到上限仍不稳定：说明输入异常，按「宁可多删」原则丢弃剩余尖括号内容。
  return current.replace(/[<>]/g, '')
}

/** 将含 HTML 的字段清洗为**纯文本**（用于标题、列表行）。 */
export const stripTeacherHtml = (raw: unknown): string => {
  const text = asString(raw)
  if (!text) return ''
  if (!looksLikeHtml(text)) return text
  // 先白名单清洗 → 实体只解一次 → 剥标签直到稳定。
  // 顺序很关键：先解实体再剥标签，解码可能还原出的标签会在下一步被剥掉，
  // 因此输出中不可能残留可解析标记。
  const sanitized = sanitizeSchoolInboxHtml(text)
  return stripTagsUntilStable(decodeEntitiesOnce(sanitized))
    .replace(/\s+/g, ' ')
    .trim()
}

/** 通用文本标准化：去首尾空白 + 折叠内部连续空白。 */
export const normalizeTeacherText = (value: unknown): string =>
  asString(value).replace(/\s+/g, ' ').trim()

// ────────────────────────────────────────────────────────────────
// 学期 / 日期 / 周次 / 节次
// ────────────────────────────────────────────────────────────────

/** 标准化学期：`2026-2027-1`（容忍 `2026-2027-01` / 空格）。 */
export const normalizeSemester = (value: unknown): string => {
  const text = asString(value)
  const match = text.match(/(\d{4})\s*-\s*(\d{4})\s*-\s*(\d{1,2})/)
  if (!match) return text
  const term = Number(match[3])
  return `${match[1]}-${match[2]}-${Number.isFinite(term) ? term : match[3]}`
}

/** 标准化日期为 `YYYY-MM-DD`（容忍 `YYYY/MM/DD`、`YYYY.MM.DD`、带时间）。 */
export const normalizeDate = (value: unknown): string => {
  const text = asString(value)
  const match = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!match) return ''
  const pad = (n: string) => n.padStart(2, '0')
  return `${match[1]}-${pad(match[2])}-${pad(match[3])}`
}

/**
 * 标准化考试时间文本（recon 05 §1.2 实测形态 `2026-08-30 14:30~18:00`）。
 * 仅做空白/分隔符归一，不改变语义。
 */
export const normalizeExamTime = (value: unknown): string =>
  asString(value)
    .replace(/\s*[~～至]\s*/g, '~')
    .replace(/\s+/g, ' ')
    .trim()

/** 标准化周次标签（`1-16周` / `1,3,5` 原样保留，仅折叠空白）。 */
export const normalizeWeekLabel = (value: unknown): string => normalizeTeacherText(value)

/** 标准化节次标签（`1-2` / `3,4`，仅折叠空白）。 */
export const normalizePeriodLabel = (value: unknown): string => normalizeTeacherText(value)

// ────────────────────────────────────────────────────────────────
// 稳定去重键
// ────────────────────────────────────────────────────────────────

/**
 * 由给定片段生成**稳定**去重键。
 *
 * 关键约束：**不得包含时间戳/随机数**。相同业务实体在任何时刻、任何刷新下
 * 都必须得到同一键，否则提醒会重复、缓存会穿透。
 */
export const buildStableKey = (parts: ReadonlyArray<unknown>): string =>
  parts
    .map((part) => {
      if (part === null || part === undefined) return ''
      if (typeof part === 'number' && Number.isFinite(part)) return String(part)
      return normalizeTeacherText(part).replace(/\s+/g, '_')
    })
    .join('|')

/** 按稳定键去重（保留首次出现顺序，后者覆盖不了前者的键即丢弃）。 */
export const dedupeByStableKey = <T>(
  items: readonly T[],
  keyOf: (item: T, index: number) => string
): T[] => {
  const seen = new Set<string>()
  const out: T[] = []
  items.forEach((item, index) => {
    const key = keyOf(item, index)
    if (seen.has(key)) return
    seen.add(key)
    out.push(item)
  })
  return out
}

// ────────────────────────────────────────────────────────────────
// 响应包裹形态（recon 04 §0.1）
// ────────────────────────────────────────────────────────────────

/**
 * 从 jqGrid 响应中提取 `results[]`；裸数组则原样返回。
 *
 * jqGrid 形态：`{msg, ret, page, rows, total, totalPages, results[]}`。
 */
export const extractGridResults = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  const results = record.results
  return Array.isArray(results) ? results : []
}

/** 集合是否为空（null/undefined/空数组/空对象/空字符串均视为空）。 */
export const isEmptyTeacherCollection = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

// ────────────────────────────────────────────────────────────────
// 领域归一化
// ────────────────────────────────────────────────────────────────

/** 归一化教师资料（仅取有实测来源的字段）。 */
export const normalizeTeacherProfile = (raw: unknown): TeacherProfile => {
  const record = asRecord(raw)
  const profile: TeacherProfile = {
    accountId: asString(record.accountId ?? record.currentUserName),
    name: asString(record.name),
    roleId: asString(record.roleId ?? record.currentRoleId),
    departmentId: asString(record.departmentId ?? record.currentDepartmentId)
  }
  // 仅在真实返回时才携带 optional 字段（未验证字段不主动补占位值）。
  const departmentName = asString(record.departmentName)
  if (departmentName) profile.departmentName = departmentName
  const title = asString(record.title)
  if (title) profile.title = title
  const email = asString(record.email)
  if (email) profile.email = email
  return profile
}

/** 归一化教学任务。 */
export const normalizeTeachingTask = (raw: unknown): TeachingTask => {
  const record = stripInjectedIdentityFields(asRecord(raw))
  return {
    id: asString(record.id),
    xnxq: normalizeSemester(record.xnxq),
    kcmc: normalizeTeacherText(record.kcmc),
    name: normalizeTeacherText(record.name),
    jxbid: asString(record.jxbid),
    jxbzc: asString(record.jxbzc) || undefined,
    bjrs: asNumber(record.bjrs),
    xf: asString(record.xf) || undefined,
    zongxs: asString(record.zongxs) || undefined,
    zxs: asString(record.zxs) || undefined,
    skzc: asString(record.skzc) || undefined,
    jxzc: asString(record.jxzc) || undefined,
    ksxs: asString(record.ksxs) || undefined,
    ksxsname: normalizeTeacherText(record.ksxsname) || undefined,
    kcdm: asString(record.kcdm) || undefined,
    encodeId: asString(record.encodeId) || undefined
  }
}

/** 归一化我的教学班。 */
export const normalizeTeachingClass = (raw: unknown): TeachingClass => {
  const record = stripInjectedIdentityFields(asRecord(raw))
  return {
    id: asString(record.id),
    kcmc: normalizeTeacherText(record.kcmc),
    kcbh: asString(record.kcbh),
    xnxq: normalizeSemester(record.xnxq),
    name: normalizeTeacherText(record.name),
    jxbid: asString(record.jxbid),
    jxbzc: asString(record.jxbzc) || undefined,
    bjrs: asNumber(record.bjrs),
    xf: asString(record.xf) || undefined,
    xs: asString(record.xs) || undefined,
    kkyxmc: normalizeTeacherText(record.kkyxmc) || undefined,
    cjfbzt: asString(record.cjfbzt) || undefined,
    bkbj: asString(record.bkbj) || undefined,
    ksxs: asString(record.ksxs) || undefined
  }
}

/** 归一化监考安排。 */
export const normalizeInvigilation = (raw: unknown): Invigilation => {
  const record = stripInjectedIdentityFields(asRecord(raw))
  return {
    id: asString(record.id),
    xnxq: normalizeSemester(record.xnxq) || undefined,
    pcid: asString(record.pcid) || undefined,
    xqmc: normalizeTeacherText(record.xqmc) || undefined,
    zjk: normalizeTeacherText(record.zjk) || undefined,
    ksrq: normalizeDate(record.ksrq) || undefined,
    kscc: normalizeTeacherText(record.kscc) || undefined,
    kcmc: normalizeTeacherText(record.kcmc),
    jsmc: normalizeTeacherText(record.jsmc) || undefined,
    ksrs: asNumber(record.ksrs),
    kspcmc: normalizeTeacherText(record.kspcmc) || undefined,
    ksfs: normalizeTeacherText(record.ksfs) || undefined,
    jkjsxm: normalizeTeacherText(record.jkjsxm) || undefined,
    kkyx: normalizeTeacherText(record.kkyx) || undefined,
    ksbj: normalizeTeacherText(record.ksbj) || undefined,
    ypjks: asString(record.ypjks) || undefined,
    txbz: asString(record.txbz) || undefined,
    gld: asString(record.gld) || undefined
  }
}

/** 归一化任课班级考试。 */
export const normalizeTeacherExam = (raw: unknown): TeacherExam => {
  const record = stripInjectedIdentityFields(asRecord(raw))
  return {
    id: asString(record.id),
    kcmc: normalizeTeacherText(record.kcmc),
    jsmc: normalizeTeacherText(record.jsmc) || undefined,
    jkjs: normalizeTeacherText(record.jkjs) || undefined,
    kssj: normalizeExamTime(record.kssj) || undefined,
    ksrs: asNumber(record.ksrs),
    kkyx: normalizeTeacherText(record.kkyx) || undefined,
    kspcmc: normalizeTeacherText(record.kspcmc) || undefined,
    ksrq: normalizeDate(record.ksrq) || undefined,
    bjmc: normalizeTeacherText(record.bjmc) || undefined,
    jxbmc: normalizeTeacherText(record.jxbmc) || undefined,
    jsname: normalizeTeacherText(record.jsname) || undefined,
    kcbh: asString(record.kcbh) || undefined,
    jkjsid: asString(record.jkjsid) || undefined,
    qssj: normalizeExamTime(record.qssj) || undefined,
    jssj: normalizeExamTime(record.jssj) || undefined,
    encodeId: asString(record.encodeId) || undefined,
    syrl: asString(record.syrl) || undefined,
    skyx: normalizeTeacherText(record.skyx) || undefined,
    sjbh: asString(record.sjbh) || undefined
  }
}

/** 归一化教务通知（title/content 做 HTML 清洗）。 */
export const normalizeTeacherNotice = (raw: unknown): TeacherNotice => {
  const record = stripInjectedIdentityFields(asRecord(raw))
  const notice: TeacherNotice = {
    id: asString(record.id),
    title: stripTeacherHtml(record.title),
    releaseDate: normalizeDate(record.releaseDate) || asString(record.releaseDate) || undefined,
    noticeType: asString(record.noticeType) || undefined,
    noticeTypeName: normalizeTeacherText(record.noticeTypeName) || undefined
  }
  const content = stripTeacherHtml(record.content)
  if (content) notice.content = content
  const dqstatus = asString(record.dqstatus)
  if (dqstatus) notice.dqstatus = dqstatus
  const collectstatus = asString(record.collectstatus)
  if (collectstatus) notice.collectstatus = collectstatus
  const sfzd = asString(record.sfzd)
  if (sfzd) notice.sfzd = sfzd
  const sfsq = asString(record.sfsq)
  if (sfsq) notice.sfsq = sfsq
  const sfxshd = asString(record.sfxshd)
  if (sfxshd) notice.sfxshd = sfxshd
  return notice
}

/** 归一化工作流项（E7 延期，仅类型占位）。 */
export const normalizeWorkflowItem = (raw: unknown): WorkflowItem => {
  const record = stripInjectedIdentityFields(asRecord(raw))
  return {
    id: asString(record.id),
    processInstanceId: asString(record.processInstanceId) || undefined,
    processInstanceIdEnc: asString(record.processInstanceIdEnc) || undefined,
    endTime: asString(record.endTime) || undefined,
    createTime: asString(record.createTime) || undefined,
    definitionName: normalizeTeacherText(record.definitionName) || undefined,
    status: asString(record.status) || undefined,
    busiType: normalizeTeacherText(record.busiType) || undefined,
    busiTypeCode: asString(record.busiTypeCode) || undefined,
    version: asString(record.version) || undefined,
    clyj: normalizeTeacherText(record.clyj) || undefined,
    shzt: asString(record.shzt) || undefined,
    queryprotype: asString(record.queryprotype) || undefined,
    sproleqf: asString(record.sproleqf) || undefined
  }
}

/** 归一化教学载荷：`{ tasks, classes }`（两者按 `jxbid` 关联，禁止按索引拼接）。 */
export const normalizeTeachingData = (raw: unknown): TeacherTeachingData => {
  const record = asRecord(raw)
  return {
    tasks: asArray(record.tasks).map(normalizeTeachingTask),
    classes: asArray(record.classes).map(normalizeTeachingClass)
  }
}

/** 归一化考试载荷：`{ invigilations, exams }`。 */
export const normalizeExamData = (raw: unknown): TeacherExamData => {
  const record = asRecord(raw)
  return {
    invigilations: asArray(record.invigilations).map(normalizeInvigilation),
    exams: asArray(record.exams).map(normalizeTeacherExam)
  }
}

/** 归一化通知列表（兼容 jqGrid 包裹与裸数组）。 */
export const normalizeNoticeList = (raw: unknown): TeacherNotice[] =>
  extractGridResults(raw).map(normalizeTeacherNotice)

// ────────────────────────────────────────────────────────────────
// 稳定去重键（领域便捷函数）
// ────────────────────────────────────────────────────────────────

/** 教学任务稳定键：教学班 id + 学期 + 课程名（无 id 时退化到业务字段组合）。 */
export const teachingTaskKey = (task: TeachingTask): string =>
  buildStableKey([task.jxbid || task.id, task.xnxq, task.kcmc, task.name])

/** 教学班稳定键。 */
export const teachingClassKey = (cls: TeachingClass): string =>
  buildStableKey([cls.jxbid || cls.id, cls.xnxq, cls.kcbh])

/** 监考稳定键。 */
export const invigilationKey = (item: Invigilation): string =>
  buildStableKey([item.id, item.xnxq, item.kcmc, item.ksrq, item.kscc])

/** 任课班级考试稳定键。 */
export const teacherExamKey = (exam: TeacherExam): string =>
  buildStableKey([exam.id, exam.kcmc, exam.ksrq, exam.kssj, exam.jsmc])

/** 通知稳定键。 */
export const teacherNoticeKey = (notice: TeacherNotice): string =>
  buildStableKey([notice.id, notice.releaseDate, notice.noticeType])
