/**
 * audit 写入服务（#619）。
 * 统一入口：写入前强制过 serializer（拒绝敏感字段），防止调用方绕过。
 */
import type { SqlExecutor } from '../../db/types.js'
import {
  insertAuditEvent,
  type InsertAuditEventInput,
} from '../../db/repos/audit.repo.js'
import { sanitizeAuditMetadata } from './serializer.js'

export type { ActorType, AuditResult, AuditEventRow } from '../../db/repos/audit.repo.js'
export { sanitizeAuditMetadata, AuditSensitiveFieldError } from './serializer.js'

/**
 * 写入审计事件。metadata 必须通过敏感字段校验（strict），
 * 含 client_secret/token/code/handoff/密码等字段时整体拒绝落库。
 */
export async function writeAuditEvent(
  sql: SqlExecutor,
  input: Omit<InsertAuditEventInput, 'metadata'> & { metadata?: Record<string, unknown> },
): Promise<void> {
  // strict 模式：任何敏感字段都抛 AuditSensitiveFieldError
  const { metadata } = sanitizeAuditMetadata(input.metadata ?? {}, { strict: true })
  await insertAuditEvent(sql, { ...input, metadata })
}
