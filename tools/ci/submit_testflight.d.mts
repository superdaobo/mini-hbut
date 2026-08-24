// 测试 fixture：tools/ci/submit_testflight.mjs 类型声明（与导出对齐）
export interface JwtOptions {
  keyId: string
  issuerId: string
  privateKeyPem: string | Buffer
  now?: number
}

export interface TestAccount {
  studentId?: string
  playerName?: string
  [key: string]: unknown
}

export interface WhatsNewOptions {
  manual?: string
  versionName?: string
  buildNumber?: string
  commits?: unknown[]
  account?: TestAccount | null
}

export function createJwt(options: JwtOptions): string
export function parseTestAccount(source: string): TestAccount
export function buildWhatsNew(options?: WhatsNewOptions): string
export function createPrereleaseLookupPath(options: { appId: string; versionName: string }): string
export function createPrereleaseBuildsPath(preReleaseVersionId: string): string
export function createBetaBuildLocalizationBody(options: {
  buildId: string
  locale: string
  whatsNew: string
}): unknown

export function createAppEncryptionDeclarationLookupPath(options: {
  appId: string
  limit?: number
}): string

export function createAppEncryptionDeclarationBody(options: {
  appId: string
}): unknown

export function createBetaGroupsLookupPath(options: {
  appId: string
  limit?: number
}): string

export function selectBetaGroups(groups: unknown[], groupNameInput: string | undefined): unknown[]

export function createBuildEncryptionDeclarationLinkageBody(
  declarationId: string,
): {
  data: { type: string; id: string }
}

export function apiRequest(
  token: string,
  pathname: string,
  options?: { method?: string; body?: unknown },
  retries?: number,
): Promise<any>
