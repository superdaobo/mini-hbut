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

/** 会话失效处置方式 */
export type SessionExpiryAction = 'logout' | 'degrade' | 'error'

/**
 * 会话失效时该做什么。
 *
 * - 临时扫码会话：退回登录页（会话本身即临时语义，没有后台恢复的意义）
 * - 正式会话 + 已有数据：降级展示并挂失效横幅
 * - 正式会话 + 无数据：错误态提示重新登录
 *
 * 后两者都必须保留本地身份 —— 清身份会让 #355 的后台静默重登彻底停摆。
 */
export const resolveSessionExpiryAction = (hasCachedData: boolean): SessionExpiryAction => {
  if (isTemporaryLoginSession()) return 'logout'
  return hasCachedData ? 'degrade' : 'error'
}
