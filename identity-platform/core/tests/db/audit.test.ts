/**
 * DB 集成测试（#619 验收标准 8）：audit serializer 拒绝敏感字段。
 */
import { describe, expect, it } from 'vitest'
import {
  sanitizeAuditMetadata,
  AuditSensitiveFieldError,
} from '../../src/observability/audit/serializer.js'
import { writeAuditEvent } from '../../src/observability/audit/index.js'
import { createTestDatabase } from '../helpers/pg.js'

describe('Audit serializer：拒绝敏感字段', () => {
  it('顶层敏感键名被拒绝', () => {
    for (const key of [
      'client_secret', 'secret', 'token', 'access_token', 'refresh_token',
      'id_token', 'authorization_code', 'password', 'cookie', 'handoff',
      'private_key', 'api_key', 'authorization',
    ]) {
      expect(() => sanitizeAuditMetadata({ [key]: 'x' }), key).toThrow(AuditSensitiveFieldError)
    }
  })

  it('嵌套对象/数组中的敏感字段被拒绝', () => {
    expect(() =>
      sanitizeAuditMetadata({ op: { inner: { access_token: 'abc' } } }),
    ).toThrow(AuditSensitiveFieldError)
    expect(() =>
      sanitizeAuditMetadata({ steps: [{ note: 'ok' }, { client_secret: 'x' }] }),
    ).toThrow(AuditSensitiveFieldError)
    expect(() =>
      sanitizeAuditMetadata({ headers: { authorization: 'Basic abc' } }),
    ).toThrow(AuditSensitiveFieldError)
  })

  it('敏感值形态（Bearer / JWT）被拒绝', () => {
    expect(() =>
      sanitizeAuditMetadata({ note: 'ok', extra: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.abc' }),
    ).toThrow(AuditSensitiveFieldError)
    expect(() =>
      sanitizeAuditMetadata({ something: 'eyJhbGciOiJub25lIn0.eyJhIjoxfQ.abc' }),
    ).toThrow(AuditSensitiveFieldError)
  })

  it('干净字段通过', () => {
    const { metadata } = sanitizeAuditMetadata({
      request_id: 'ar_abc',
      event_type: 'auth_request.approved',
      scopes: ['openid', 'profile'],
      count: 3,
      nested: { ok: true },
    })
    expect(metadata).toMatchObject({
      request_id: 'ar_abc',
      event_type: 'auth_request.approved',
    })
    expect((metadata as { scopes: string[] }).scopes).toEqual(['openid', 'profile'])
  })

  it('非 strict 模式替换为 [REDACTED] 而非抛错', () => {
    const { metadata, redacted } = sanitizeAuditMetadata(
      { client_secret: 'x', note: 'ok' },
      { strict: false },
    )
    expect(metadata).toMatchObject({ client_secret: '[REDACTED]', note: 'ok' })
    expect(redacted).toContain('client_secret')
  })

  it('writeAuditEvent 含敏感字段整体拒绝落库；干净字段正常写入', async () => {
    const db = await createTestDatabase()
    try {
      await expect(
        writeAuditEvent(db.sql, {
          eventType: 'test.bad',
          actorType: 'system',
          result: 'error',
          metadata: { client_secret: 'leak' },
        }),
      ).rejects.toBeInstanceOf(AuditSensitiveFieldError)

      await writeAuditEvent(db.sql, {
        eventType: 'test.ok',
        actorType: 'user',
        actorId: 'u-1',
        targetType: 'auth_request',
        targetId: 'ar_1',
        result: 'success',
        metadata: { scopes: ['openid'] },
      })
      const rows = await db.sql.query<{ event_type: string }>(
        'SELECT event_type FROM audit_events',
      )
      expect(rows.rows.map((r) => r.event_type)).toEqual(['test.ok'])
    } finally {
      await db.cleanup()
    }
  })
})
