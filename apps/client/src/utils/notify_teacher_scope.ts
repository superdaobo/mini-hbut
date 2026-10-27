// E3 #1023：教师身份隔离（学生通知检测的教师安全分支）。
//
// 教师工号绝不能被当作学号走学生域检测（成绩 / 考试 / 电费 / 课表），
// 也不得写学生域去重键；学生身份原样透传既有实现（零回归）。
import { isTeacherRoleValue, readLoginRole } from './login_role.js'
import { checkElectricity as checkElectricityRaw } from './notify_center_electricity.js'

/** 教师身份判定：登录身份本地事实源（缺失 / 异常按学生端）。 */
export const isTeacherNotificationContext = (): boolean => isTeacherRoleValue(readLoginRole())

/** 教师跳过学生域检测的稳定标记（非用户可见文案）。 */
export const TEACHER_SCOPE_SKIPPED = 'teacher-scope-skipped'

/** 宿舍电费检测的教师安全包装：教师身份直接短路，学生原样透传。 */
export const checkElectricityTeacherSafe = async (
  ...args: Parameters<typeof checkElectricityRaw>
): Promise<Awaited<ReturnType<typeof checkElectricityRaw>>> => {
  if (isTeacherNotificationContext()) {
    return { success: false, configured: false, selectedPath: [], error: TEACHER_SCOPE_SKIPPED }
  }
  return checkElectricityRaw(...args)
}
