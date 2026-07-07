export const TEST_ACCOUNT_SESSION_KEY = 'hbu_test_account_session'
export const TEST_ACCOUNT_LOGIN_METHOD = 'test_account'

export const TEST_ACCOUNT = Object.freeze({
  username: 'reviewer',
  password: 'Test2026',
  studentId: '2026000001',
  displayName: 'TestFlight 测试账号'
})

const safeStorage = () => {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

const normalizeText = (value) => String(value ?? '').trim()

export const isTestAccountCredentials = (username, password) =>
  normalizeText(username).toLowerCase() === TEST_ACCOUNT.username &&
  normalizeText(password) === TEST_ACCOUNT.password

export const isTestAccountStudentId = (studentId) =>
  normalizeText(studentId) === TEST_ACCOUNT.studentId

export const markTestAccountSession = () => {
  const storage = safeStorage()
  if (!storage) return
  storage.setItem(TEST_ACCOUNT_SESSION_KEY, '1')
  storage.setItem('hbu_login_method', TEST_ACCOUNT_LOGIN_METHOD)
  storage.setItem('hbu_username', TEST_ACCOUNT.studentId)
  storage.setItem('hbu_remember', 'false')
  storage.setItem('hbu_login_entry_mode', 'portal')
  storage.removeItem('hbu_manual_logout')
  storage.removeItem('hbu_logout_reason')
  storage.removeItem('hbu_login_temporary')
}

export const clearTestAccountSession = () => {
  const storage = safeStorage()
  if (!storage) return
  storage.removeItem(TEST_ACCOUNT_SESSION_KEY)
  if (storage.getItem('hbu_login_method') === TEST_ACCOUNT_LOGIN_METHOD) {
    storage.removeItem('hbu_login_method')
  }
  if (isTestAccountStudentId(storage.getItem('hbu_username'))) {
    storage.removeItem('hbu_username')
  }
}

export const isTestAccountSession = () => {
  const storage = safeStorage()
  if (!storage) return false
  return (
    storage.getItem(TEST_ACCOUNT_SESSION_KEY) === '1' ||
    storage.getItem('hbu_login_method') === TEST_ACCOUNT_LOGIN_METHOD ||
    isTestAccountStudentId(storage.getItem('hbu_username'))
  )
}
