/**
 * 成绩领域模型（grade domain）
 *
 * 成绩数据的单一归一化实现：GradeView 不再自行兼容 kcmc/xf/zhcj 等历史字段，
 * 统一通过 normalizeGradeRecord 消费 view-model，同时兼容当前 Rust 响应
 * （term/course_name/course_credit/final_score/earned_credit/xfjd/sfbk/sfsq/cjbj/teacher 等）。
 */

/** 成绩结果类型：数字成绩 + 教务系统常见定性成绩 */
export const GradeOutcome = {
  /** 数字成绩（含百分制，60 分线判定合格） */
  NUMERIC: 'numeric',
  /** 优秀 */
  EXCELLENT: 'excellent',
  /** 良好 */
  GOOD: 'good',
  /** 中等 */
  MEDIUM: 'medium',
  /** 合格（含“及格”兼容映射） */
  QUALIFIED: 'qualified',
  /** 通过 */
  PASS: 'pass',
  /** 不合格 */
  UNQUALIFIED: 'unqualified',
  /** 未通过（含“不及格”“挂科”） */
  FAILED: 'failed',
  /** 缺考 */
  ABSENT: 'absent',
  /** 缓考（含 cjbj=2 / sfsq=1） */
  DEFERRED: 'deferred',
  /** 免修（含 cjbj=3） */
  EXEMPT: 'exempt',
  /** 免考 */
  EXEMPTED_EXAM: 'exempted_exam',
  /** 待录入 */
  PENDING: 'pending',
  /** 未知（空值或无法识别的文本） */
  UNKNOWN: 'unknown'
} as const

export type GradeOutcomeValue = (typeof GradeOutcome)[keyof typeof GradeOutcome]

/** 状态标签 */
export interface GradeStatusTag {
  key: string
  label: string
}

/** 归一化后的成绩视图模型（GradeView 唯一消费形态） */
export interface GradeViewModel {
  /** 原始数组下标，用于“成绩公布先后”排序与列表 key */
  originIndex: number
  /** 学年学期（term ← term/xnxq） */
  term: string
  /** 课程名称（course_name ← course_name/kcmc，已去除 [xxx] 前缀） */
  course_name: string
  /** 学分（course_credit ← course_credit/xf） */
  course_credit: string
  /** 获得学分（earned_credit ← earned_credit/hdxf/jd） */
  earned_credit: string
  /** 最终成绩原文（final_score ← final_score/zhcj/yscj/cj） */
  final_score: string
  /** 数字成绩解析值，非数字为 null */
  scoreNumber: number | null
  /** 成绩结果类型 */
  outcome: GradeOutcomeValue
  /** 课程性质（代码映射为中文标签） */
  course_nature: string
  /** 卡片教师：录入教师优先，无则课程教师 */
  teacher: string
  /** 录入教师（teacher ← teacher/cjlrjsxm/jsxm） */
  entryTeacher: string
  /** 课程教师（course_teacher/courseTeacher） */
  courseTeacher: string
  /** 绩点：官方绩点字段优先，无官方值时数字成绩估算 */
  gradePoint: number | null
  /** 绩点是否为估算值（无官方绩点字段时由数字成绩推导） */
  gradePointEstimated: boolean
  /** 绩点展示文本 */
  gradePointText: string
  /** 官方学分绩点（xfjd）原文，无则为 '-' */
  creditGradePoint: string
  /** 状态标签（由 outcome / 补考标记派生） */
  statusTags: GradeStatusTag[]
  /** 是否合格（数字 >=60 或 优秀/良好/中等/合格/通过） */
  isPass: boolean
  /** 是否失败（数字 <60 或 不合格/未通过/缺考） */
  isFailed: boolean
  /** 是否补考（sfbk=1 / cjbj=1 / 文本含“补考”） */
  isMakeup: boolean
  /** 是否缓考 */
  isDeferred: boolean
  /** 是否免修/免考 */
  isExempt: boolean
  /** 排序分数（数字原值，定性按档位映射） */
  sortScore: number
  /** 原始记录引用 */
  raw: Record<string, unknown>
}

/** 课程性质代码 → 中文标签 */
export const COURSE_NATURE_LABEL_MAP: Record<string, string> = {
  '11': '通识必修',
  '12': '通识选修',
  '16': '限定选修',
  '31': '学科基础',
  '32': '工程基础',
  '40': '专业核心',
  '41': '专业方向组',
  '42': '专业任选',
  '43': '专业基础',
  '44': '专业必修',
  '45': '专业选修',
  '50': '基础实践',
  '51': '专业实践',
  '52': '综合实践',
  '53': '其他实践',
  '54': '短学期实践',
  '70': '辅修理论',
  '71': '辅修实践',
  '90': '必修',
  '98': '重修',
  '99': '公共选修'
}

/** 判定为“合格”的 outcome 集合 */
const PASS_OUTCOMES = new Set<GradeOutcomeValue>([
  GradeOutcome.EXCELLENT,
  GradeOutcome.GOOD,
  GradeOutcome.MEDIUM,
  GradeOutcome.QUALIFIED,
  GradeOutcome.PASS
])

/** 判定为“失败”的 outcome 集合 */
const FAIL_OUTCOMES = new Set<GradeOutcomeValue>([
  GradeOutcome.UNQUALIFIED,
  GradeOutcome.FAILED,
  GradeOutcome.ABSENT
])

/** 定性成绩排序档位（数字成绩直接用分数） */
const QUALITATIVE_SORT_SCORES: Partial<Record<GradeOutcomeValue, number>> = {
  [GradeOutcome.EXCELLENT]: 95,
  [GradeOutcome.GOOD]: 85,
  [GradeOutcome.MEDIUM]: 75,
  [GradeOutcome.QUALIFIED]: 60,
  [GradeOutcome.PASS]: 60,
  [GradeOutcome.UNQUALIFIED]: 0,
  [GradeOutcome.FAILED]: 0,
  [GradeOutcome.ABSENT]: 0
}

/** 官方绩点字段优先级：Rust 响应 xfjd，兼容旧字段 */
const OFFICIAL_GRADE_POINT_KEYS = ['xfjd', 'fxcj', 'creditPoint', 'credit_grade_point', 'gpa', 'gradePoint']

const toSafeText = (value: unknown): string => String(value ?? '').trim()

/** 解析数字成绩；非有限数字返回 null */
export const parseScoreNumber = (score: unknown): number | null => {
  const n = Number.parseFloat(toSafeText(score))
  return Number.isFinite(n) ? n : null
}

/** 从成绩文本提取数字（兼容“补考 88”等混合文本，直接解析失败时取首个数字） */
const extractScoreFromText = (text: string): number | null => {
  const direct = parseScoreNumber(text)
  if (direct !== null) return direct
  const matched = text.match(/(\d+(?:\.\d+)?)/)
  if (!matched) return null
  const n = Number.parseFloat(matched[1])
  return Number.isFinite(n) ? n : null
}

/** 从原始记录按优先级取第一个非空字段值 */
const firstDefined = (record: Record<string, unknown>, keys: string[], fallback = ''): unknown => {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return fallback
}

/** 清理课程名称中的潜在 ID 前缀，如 “[TZ2024]高等数学” → “高等数学” */
export const normalizeCourseName = (value: unknown): string => {
  const text = toSafeText(value)
  if (!text) return ''
  const matched = text.match(/^\[[^\]]+\](.+)$/)
  return matched ? toSafeText(matched[1]) : text
}

/** 绩点/数值展示文本：保留至多两位小数并去除多余尾零 */
export const formatPointNumber = (value: number | null): string => {
  if (!Number.isFinite(value as number)) return '-'
  const safeValue = Math.max(0, value as number)
  return safeValue
    .toFixed(2)
    .replace(/\.0+$|(\.\d*?)0+$/g, '$1')
    .replace(/\.$/, '')
}

/** 解析课程性质：代码优先映射为中文标签，否则返回原始文本 */
export const normalizeCourseNature = (raw: Record<string, unknown>): string => {
  const codes = [
    toSafeText(raw.kcxz),
    toSafeText(raw.course_nature_code),
    toSafeText(raw.course_nature)
  ].filter(Boolean)
  for (const code of codes) {
    if (COURSE_NATURE_LABEL_MAP[code]) return COURSE_NATURE_LABEL_MAP[code]
  }
  return toSafeText(raw.course_nature || raw.kcxzmc || codes[0] || '')
}

/** 数字成绩估算绩点：分数 / 10 - 5（仅数字成绩允许估算），保留两位小数消除浮点误差 */
export const estimateGradePoint = (scoreNumber: number | null): number | null => {
  if (scoreNumber === null) return null
  return Math.round(Math.max(0, scoreNumber / 10 - 5) * 100) / 100
}

/**
 * 判定成绩结果类型。
 *
 * 优先级：数字 > 特殊状态文本（缺考/缓考/免修/免考/待录入）> 字段标记
 * （cjbj=2 或 sfsq=1 → 缓考；cjbj=3 → 免修）> 等级文本（优秀/良好/中等），
 * 其中“不合格/未通过/不及格/挂科”必须先于“合格/通过”匹配，避免子串误判。
 */
export const resolveOutcome = (
  scoreText: unknown,
  flags: { cjbj?: unknown; sfsq?: unknown } = {}
): GradeOutcomeValue => {
  const text = toSafeText(scoreText)
  if (extractScoreFromText(text) !== null) return GradeOutcome.NUMERIC

  // 特殊状态文本优先于等级文本
  if (/缺考/.test(text)) return GradeOutcome.ABSENT
  if (/缓考/.test(text)) return GradeOutcome.DEFERRED
  if (/免修|免听/.test(text)) return GradeOutcome.EXEMPT
  if (/免考/.test(text)) return GradeOutcome.EXEMPTED_EXAM
  if (/待录入|未录入/.test(text)) return GradeOutcome.PENDING

  const cjbj = toSafeText(flags.cjbj)
  const sfsq = toSafeText(flags.sfsq)
  if (cjbj === '2' || sfsq === '1') return GradeOutcome.DEFERRED
  if (cjbj === '3') return GradeOutcome.EXEMPT

  // 等级文本（失败类先匹配，防止“不合格”命中“合格”、“未通过”命中“通过”）
  if (/优秀/.test(text)) return GradeOutcome.EXCELLENT
  if (/良好/.test(text)) return GradeOutcome.GOOD
  if (/中等/.test(text)) return GradeOutcome.MEDIUM
  if (/不合格/.test(text)) return GradeOutcome.UNQUALIFIED
  if (/未通过|不及格|挂科/.test(text)) return GradeOutcome.FAILED
  if (/合格|及格/.test(text)) return GradeOutcome.QUALIFIED
  if (/通过/.test(text)) return GradeOutcome.PASS

  return GradeOutcome.UNKNOWN
}

/** 由 outcome 推导排序分数；数字成绩直接返回分数，未知/特殊状态为 -1（排最后） */
export const resolveSortScore = (outcome: GradeOutcomeValue, scoreNumber: number | null): number => {
  if (outcome === GradeOutcome.NUMERIC) return scoreNumber ?? -1
  return QUALITATIVE_SORT_SCORES[outcome] ?? -1
}

/** 是否合格 */
const isPassOutcome = (outcome: GradeOutcomeValue, scoreNumber: number | null): boolean => {
  if (outcome === GradeOutcome.NUMERIC) return scoreNumber !== null && scoreNumber >= 60
  return PASS_OUTCOMES.has(outcome)
}

/** 是否失败 */
const isFailedOutcome = (outcome: GradeOutcomeValue, scoreNumber: number | null): boolean => {
  if (outcome === GradeOutcome.NUMERIC) return scoreNumber !== null && scoreNumber < 60
  return FAIL_OUTCOMES.has(outcome)
}

/** 解析官方绩点：官方字段有效数字（>0，规避 Rust 无值兜底的 '0'）优先 */
const parseOfficialGradePoint = (raw: Record<string, unknown>): number | null => {
  for (const key of OFFICIAL_GRADE_POINT_KEYS) {
    const n = parseScoreNumber(raw[key])
    if (n !== null && n > 0) return n
  }
  return null
}

/** 由 outcome/补考标记派生状态标签 */
const resolveStatusTags = (params: {
  outcome: GradeOutcomeValue
  isFailed: boolean
  isMakeup: boolean
}): GradeStatusTag[] => {
  const tags: GradeStatusTag[] = []
  if (params.isFailed) tags.push({ key: 'failed', label: '挂科' })
  if (params.isMakeup) tags.push({ key: 'makeup', label: '补考' })
  if (params.outcome === GradeOutcome.DEFERRED) tags.push({ key: 'deferred', label: '缓考' })
  if (params.outcome === GradeOutcome.EXEMPT) tags.push({ key: 'exempt', label: '免修' })
  if (params.outcome === GradeOutcome.EXEMPTED_EXAM) tags.push({ key: 'exempted_exam', label: '免考' })
  if (params.outcome === GradeOutcome.ABSENT) tags.push({ key: 'absent', label: '缺考' })
  if (params.outcome === GradeOutcome.PENDING) tags.push({ key: 'pending', label: '待录入' })
  return tags
}

/**
 * 归一化单条成绩记录 → 视图模型。
 *
 * 绩点规则：官方绩点字段（xfjd 等）优先；无官方值时仅数字成绩估算并标记
 * gradePointEstimated=true；定性成绩不估算（gradePoint=null）。
 */
export const normalizeGradeRecord = (raw: unknown, originIndex = 0): GradeViewModel => {
  const record: Record<string, unknown> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const term = toSafeText(firstDefined(record, ['term', 'xnxq']))
  const course_name = normalizeCourseName(firstDefined(record, ['course_name', 'kcmc']))
  const course_credit = toSafeText(firstDefined(record, ['course_credit', 'xf']))
  const earned_credit = toSafeText(firstDefined(record, ['earned_credit', 'hdxf', 'jd']))
  const final_score = toSafeText(firstDefined(record, ['final_score', 'zhcj', 'yscj', 'cj'], '-'))
  const scoreNumber = extractScoreFromText(final_score)

  const cjbj = toSafeText(record.cjbj)
  const sfbk = toSafeText(record.sfbk)
  const sfsq = toSafeText(record.sfsq)
  const cjfxms = toSafeText(record.cjfxms)

  const outcome = resolveOutcome(final_score, { cjbj, sfsq })
  const isMakeup = sfbk === '1' || cjbj === '1' || /补考/.test(`${final_score}${cjfxms}`)
  const isPass = isPassOutcome(outcome, scoreNumber)
  const isFailed = isFailedOutcome(outcome, scoreNumber)
  const isDeferred = outcome === GradeOutcome.DEFERRED
  const isExempt = outcome === GradeOutcome.EXEMPT || outcome === GradeOutcome.EXEMPTED_EXAM

  // 绩点：官方优先；无官方值时数字成绩估算并标记，定性成绩不估算
  const officialPoint = parseOfficialGradePoint(record)
  let gradePoint: number | null = null
  let gradePointEstimated = false
  if (officialPoint !== null) {
    gradePoint = officialPoint
  } else if (outcome === GradeOutcome.NUMERIC) {
    gradePoint = estimateGradePoint(scoreNumber)
    gradePointEstimated = true
  }

  const entryTeacher = toSafeText(firstDefined(record, ['teacher', 'cjlrjsxm', 'jsxm']))
  const courseTeacher = toSafeText(firstDefined(record, ['course_teacher', 'courseTeacher']))

  return {
    originIndex,
    term,
    course_name,
    course_credit,
    earned_credit,
    final_score,
    scoreNumber,
    outcome,
    course_nature: normalizeCourseNature(record),
    teacher: entryTeacher || courseTeacher,
    entryTeacher,
    courseTeacher,
    gradePoint,
    gradePointEstimated,
    gradePointText: formatPointNumber(gradePoint),
    creditGradePoint: officialPoint !== null ? formatPointNumber(officialPoint) : '-',
    statusTags: resolveStatusTags({ outcome, isFailed, isMakeup }),
    isPass,
    isFailed,
    isMakeup,
    isDeferred,
    isExempt,
    sortScore: resolveSortScore(outcome, scoreNumber),
    raw: record
  }
}

/** 批量归一化成绩列表（originIndex 取数组下标） */
export const normalizeGradeRecords = (grades: unknown): GradeViewModel[] => {
  if (!Array.isArray(grades)) return []
  return grades.map((grade, index) => normalizeGradeRecord(grade, index))
}
