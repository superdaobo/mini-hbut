/**
 * 统一门户（CAS）账号规范化。学号、工号采用不同约束，身份必须由后端 UserInfo.role 确认。
 * 本模块不改变 student_id.js：学生成绩、统计和云同步仍按原学号规则处理。
 */
import { normalizeStudentId } from './student_id.js'
import { normalizeLoginRole } from './login_role.js'

const TEACHER_ACCOUNT_RE = /^\d{8,10}$/

/** 后端确认身份后使用；不接受自由文本、密码或非数字标识。 */
export const normalizePortalAccountId = (value, role = 'student') => {
  const id = String(value ?? '').trim()
  if (normalizeLoginRole(role) === 'teacher') {
    return TEACHER_ACCOUNT_RE.test(id) ? id : ''
  }
  return normalizeStudentId(id)
}
