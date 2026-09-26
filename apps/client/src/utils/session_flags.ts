/**
 * 会话标记判定（#898）。
 *
 * 「临时登录会话」（扫码临时入口）失效时应退回登录页；正式会话失效则保留本地身份，
 * 交由后台恢复链路静默重登（#355：禁止强制踢回登录页）。
 *
 * 判定语义与 SessionCoordinator 内部的 isTemporaryLoginSession 一致，
 * 供无法访问 App runtime 的视图组件复用。
 */

/** 登录方式键（临时会话写入 portal_qr_temp / chaoxing_qr_temp） */
const LOGIN_METHOD_KEY = 'hbu_login_method'
/** 临时会话标记键（'1' 表示临时会话） */
const LOGIN_TEMP_FLAG_KEY = 'hbu_login_temporary'

export const isTemporaryLoginSession = (): boolean => {
  try {
    const method = String(localStorage.getItem(LOGIN_METHOD_KEY) || '').trim()
    const marked = localStorage.getItem(LOGIN_TEMP_FLAG_KEY) === '1'
    return marked || method.endsWith('_temp')
  } catch {
    // localStorage 不可用时按正式会话处理：宁可保留身份等后台恢复，也不误退回登录页
    return false
  }
}
