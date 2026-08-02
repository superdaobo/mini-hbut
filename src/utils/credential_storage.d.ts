export const HBUT_CREDENTIAL_PREFIX: string
export const CHAOXING_CREDENTIAL_PREFIX: string
export const CAMPUS_CREDENTIAL_PREFIX: string

export function buildHbutAccountKey(username: string): string
export function buildChaoxingAccountKey(account: string): string
export function buildCampusAccountKey(username: string): string
export function rememberPortalPasswordInMemory(studentId: string, password: string): void
export function peekPortalPasswordInMemory(studentId: string): string | null
export function saveRememberedCredential(accountKey: string, password: string): Promise<void>
export function loadRememberedCredential(accountKey: string): Promise<string | null>
export function deleteRememberedCredential(accountKey: string): Promise<void>
export function migrateLegacyCredential(options: Record<string, unknown>): Promise<unknown>
export function loadPortalRememberedPassword(username: string): Promise<string | null>
export function preservePortalRememberedPasswordOnLogout(): Promise<void>
export function loadChaoxingRememberedPassword(account: string): Promise<string | null>
export function syncPortalRememberCredential(options: Record<string, unknown>): Promise<unknown>
export function ensureRememberedPasswordCached(username: string): Promise<unknown>
