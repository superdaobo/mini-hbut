export const TEST_ACCOUNT_SESSION_KEY: string
export const TEST_ACCOUNT_LOGIN_METHOD: string

export interface TestAccountProfile {
  username: string
  password: string
  studentId: string
  displayName: string
}

export const TEST_ACCOUNT: Readonly<TestAccountProfile>

export function isTestAccountCredentials(username: unknown, password: unknown): boolean
export function isTestAccountStudentId(studentId: unknown): boolean
export function markTestAccountSession(): void
export function clearTestAccountSession(): void
export function isTestAccountSession(): boolean
