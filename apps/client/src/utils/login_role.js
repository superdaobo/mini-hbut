/**
 * 登录身份（学生端 / 教师端）的唯一本地事实源。
 *
 * 教师与学生**共用同一套 CAS 门户登录**（门户登录框本身即「请输入学号/工号」），
 * 因此「入口选择」只决定 UI 形态（教师端不提供学习通入口），真正的身份以
 * 教务系统返回为准（后端 `UserInfo.role`）。登录成功后本模块会被**权威值覆盖**，
 * 避免用户选错入口导致功能可见性错误。
 *
 * 与 `remembered_username.js` 同款：localStorage 单一读写入口，异常一律吞掉
 * （隐私模式 / 存储被禁用时按学生端兜底，不影响登录）。
 */

export const LOGIN_ROLE_KEY = 'hbu_login_role'

/** 规范化角色取值：只有 `teacher` 视为教师，其余一律学生。 */
export const normalizeLoginRole = (value) =>
  String(value ?? '').trim().toLowerCase() === 'teacher' ? 'teacher' : 'student'

/** 读取本地角色；缺失/异常按学生端。 */
export const readLoginRole = () => {
  try {
    return normalizeLoginRole(localStorage.getItem(LOGIN_ROLE_KEY))
  } catch {
    return 'student'
  }
}

/** 写入本地角色，返回规范化后的值。 */
export const writeLoginRole = (value) => {
  const role = normalizeLoginRole(value)
  try {
    localStorage.setItem(LOGIN_ROLE_KEY, role)
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
  return role
}

/** 清除本地角色（登出：回到学生端默认形态）。 */
export const clearLoginRole = () => {
  try {
    localStorage.removeItem(LOGIN_ROLE_KEY)
  } catch {
    /* 忽略 */
  }
}

/** 是否教师角色。 */
export const isTeacherRoleValue = (value) => normalizeLoginRole(value) === 'teacher'

// ── 登录表单「上次使用的账号」按身份分开记忆 ────────────────────────────────
//
// 学生与教师共用同一个门户登录接口，但**账号体系不同**（学号 / 工号）。
// 若共用一个键，学生保存的账号密码会出现在教师端输入框里（反之亦然）。
// 注意：凭据本身（`hbut:<账号>`）按账号存储、天然隔离，这里只管**表单预填**。

export const LOGIN_FORM_ACCOUNT_KEY = 'hbu_login_form_account'

/** 该身份对应的表单账号存储键。学生沿用无后缀键，教师用带后缀键。 */
export const loginFormAccountKey = (role) =>
  normalizeLoginRole(role) === 'teacher' ? `${LOGIN_FORM_ACCOUNT_KEY}_teacher` : LOGIN_FORM_ACCOUNT_KEY

/**
 * 读取该身份上次登录用的账号。
 *
 * 学生端首次回落旧键 `hbu_username`：老用户升级后表单不会突然变空。
 * 教师端**不回落到 `hbu_username`** —— 那正是把学生账号串到教师端的原因。
 */
export const readLoginFormAccount = (role) => {
  const normalized = normalizeLoginRole(role)
  try {
    const scoped = localStorage.getItem(loginFormAccountKey(normalized))
    if (scoped && scoped.trim()) return scoped.trim()
    return normalized === 'teacher' ? '' : String(localStorage.getItem('hbu_username') || '').trim()
  } catch {
    return ''
  }
}

/** 记住该身份本次登录用的账号（空值不写入，避免把有效记忆清成空串）。 */
export const writeLoginFormAccount = (role, accountId) => {
  const id = String(accountId ?? '').trim()
  if (!id) return
  try {
    localStorage.setItem(loginFormAccountKey(role), id)
  } catch {
    /* 存储不可用时仅影响下次预填 */
  }
}
