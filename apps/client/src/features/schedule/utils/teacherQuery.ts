/**
 * #1321 教师姓名归一化（纯函数，无副作用）。
 *
 * 课表课程详情里的「教师」字段实际形态多样：单教师、多教师以
 * 、 ， ; / 空格等分隔、姓名后带括号职称（如「张三(副教授)」）。
 * 本模块统一承担切分 / 清洗 / 去重 / 上限逻辑，供课程详情弹窗的
 * 给分记录快捷入口与多教师选择列表使用。
 */

/** 无效占位值：视为「未填写教师」，归一化时丢弃。 */
const INVALID_TEACHERS = new Set(['未填写', '—', '-', '未知', '未知教师'])

/** 单个姓名长度上限（超过视为脏数据，整段丢弃）。 */
const MAX_NAME_LENGTH = 20

/** 单次最多返回的教师数量（保护选择列表与查询条件）。 */
const MAX_TEACHERS = 5

/**
 * 把教师字段归一化为有效姓名列表。
 *
 * 规则：
 * - 非字符串 / 空串 → `[]`
 * - 按 `、 , ， ; ； / ／` 与空白切分
 * - 每段去掉中英文括号内容（「张三(副教授)」→「张三」）、去掉尾部「等」、trim
 * - 无效占位值（未填写 / — / - / 未知 / 未知教师）丢弃
 * - 去重（保持原顺序）；超过 20 字符的段丢弃；总条数上限 5
 */
export const normalizeTeacherNames = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return []
  const source = raw.trim()
  if (!source) return []

  const result: string[] = []
  const seen = new Set<string>()

  for (const segment of source.split(/[\s、,，;；/／]+/)) {
    if (result.length >= MAX_TEACHERS) break

    // 先剥括号职称，再去尾部「等」，最后 trim
    const cleaned = segment
      .replace(/[（(][^（）()]*[)）]/g, '')
      .replace(/等$/, '')
      .trim()

    if (!cleaned || INVALID_TEACHERS.has(cleaned)) continue
    if (cleaned.length > MAX_NAME_LENGTH) continue
    if (seen.has(cleaned)) continue

    seen.add(cleaned)
    result.push(cleaned)
  }

  return result
}

/**
 * 取教师字段里第一个有效姓名（供单教师直跳给分记录）；
 * 没有有效姓名时返回空字符串。
 */
export const resolveTeacherQuery = (raw: unknown): string => {
  return normalizeTeacherNames(raw)[0] ?? ''
}
