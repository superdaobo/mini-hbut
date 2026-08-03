export function getTestAccountGrades(): unknown[]

export function seedTestAccountCaches(
  setCachedData: (key: string, data: unknown) => void,
  studentId?: string
): unknown[]

export function resolveTestAccountCachePayload(key: string): unknown

export function resolveTestAccountHttpResponse(
  method: string,
  url: string,
  data?: Record<string, unknown>
): unknown

export function resolveTestAccountNativeResponse(
  command: string,
  args?: Record<string, unknown>
): unknown

export function resolveTestAccountForumResponse(
  path: string,
  options?: Record<string, unknown>
): unknown
