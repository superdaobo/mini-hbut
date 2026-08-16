/**
 * 测试共享夹具（不匹配 *.test.* 模式，不会被 vitest 当作用例收集）。
 */
import type { RequestDetailDTO } from '../lib/core-client/contract'
import type { StubRequestRecord } from '../lib/core-client/index'

/** 合法 handoff 值（20~128 位 URL-safe 字符） */
export const VALID_HANDOFF = 'handoff-abcdefghijklmnopqrstuvwxyz-0123456789'

/** 覆盖 issue 示例字段的详情 DTO */
export const BASE_DETAIL: RequestDetailDTO = {
  request_id: 'ar_test_0001',
  expires_at: '2099-01-01T00:00:00.000Z',
  client: {
    name: '课程助手',
    homepage_host: 'course.example.com',
    developer_display_name: '课程助手开发者',
    review_status: 'verified',
  },
  scopes: [
    { id: 'openid', label: '确认你的 Mini-HBUT 身份', risk: 'basic' },
    { id: 'student.identity', label: '获取你的学校身份', risk: 'sensitive' },
  ],
}

/** 构造桩请求记录（用于 seedStubRequest / createCoreStubClient） */
export function makeStubRecord(
  overrides: Partial<Omit<StubRequestRecord, 'detail' | 'resumeCalls'>> & {
    detail?: Partial<RequestDetailDTO>
  } = {},
): StubRequestRecord {
  const record: StubRequestRecord = {
    detail: BASE_DETAIL,
    status: 'waiting_app',
    handoff: VALID_HANDOFF,
    resumeCalls: 0,
  }
  if (overrides.detail) {
    record.detail = { ...BASE_DETAIL, ...overrides.detail } as RequestDetailDTO
  }
  if (overrides.status !== undefined) {
    record.status = overrides.status
  }
  if (overrides.handoff !== undefined) {
    record.handoff = overrides.handoff
  }
  if (overrides.resumeRedirectTo !== undefined) {
    record.resumeRedirectTo = overrides.resumeRedirectTo
  }
  return record
}
