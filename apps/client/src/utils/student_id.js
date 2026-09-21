/**
 * 湖工大学号基础契约。
 *
 * 当前已知账号体系：
 * - 研究生：9 位纯数字
 * - 本科生：10 位纯数字
 *
 * 这里只负责“学号身份是否合法/规范化”，不把字符串转换成 Number，
 * 避免前导 0、未来长度扩展或整数精度导致身份被改写。
 */
export const STUDENT_ID_RE = /^\d{9,10}$/

export const normalizeStudentId = (value) => {
  const sid = String(value ?? '').trim()
  return STUDENT_ID_RE.test(sid) ? sid : ''
}

export const isValidStudentId = (value) => normalizeStudentId(value) !== ''

// 兼容旧调用语义。
export const isLikelyStudentId = isValidStudentId
