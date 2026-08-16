/**
 * 用户与学校身份领域服务（#619）。
 *
 * 首次绑定安全语义（#617 最大信任限制，代码模型体现）：
 * - Core 无法向 HBUT 服务器验证身份，verification_method 强制 mini_hbut_app；
 * - verification_level 不得自动标成官方/高保证（V1 固定 low）；
 * - (provider, subject) 已存在时返回显式 IDENTITY_ALREADY_BOUND，
 *   绝不静默并入当前设备/新账户。
 */
import type { SqlExecutor } from '../db/types.js'
import {
  insertUser,
  insertLinkedIdentity,
  findIdentityByProviderSubject,
  type VerificationMethod,
} from '../db/repos/users.repo.js'
import { IdentityAlreadyBoundError } from './errors.js'
import { newUuidV7 } from './ids.js'

export interface HbutIdentitySnapshot {
  studentId: string
  studentName?: string
  college?: string
  major?: string
  className?: string
  grade?: string
}

export interface CreateUserWithHbutIdentityResult {
  userId: string
  identityId: string
  /** true = 新建；false = 未发生（理论不可达，UNIQUE 兜底路径） */
  created: boolean
}

/** 学号作为 provider 内 subject 的基本格式约束（1-32 位可见字符，禁控制符） */
export function assertValidHbutSubject(subject: string): void {
  if (!subject || subject.length > 32 || /[\u0000-\u001f]/.test(subject)) {
    throw new Error('[users] subject 长度或格式非法')
  }
}

/**
 * 创建 Mini-HBUT user + linked identity（provider=hbut，mini_hbut_app）。
 * 事务内先查后插，并发下由 UNIQUE(provider, subject) 兜底报 IDENTITY_ALREADY_BOUND。
 */
export async function createUserWithHbutIdentity(
  sql: SqlExecutor,
  snapshot: HbutIdentitySnapshot,
  opts: { verificationMethod?: VerificationMethod } = {},
): Promise<CreateUserWithHbutIdentityResult> {
  assertValidHbutSubject(snapshot.studentId)
  const verificationMethod: VerificationMethod = opts.verificationMethod ?? 'mini_hbut_app'

  const existing = await findIdentityByProviderSubject(sql, 'hbut', snapshot.studentId)
  if (existing) {
    throw new IdentityAlreadyBoundError()
  }

  const userId = newUuidV7()
  const identityId = newUuidV7()
  try {
    await sql.withTransaction(async (tx) => {
      await insertUser(tx, { id: userId })
      await insertLinkedIdentity(tx, {
        id: identityId,
        user_id: userId,
        provider: 'hbut',
        subject: snapshot.studentId,
        student_name_snapshot: snapshot.studentName ?? null,
        college_snapshot: snapshot.college ?? null,
        major_snapshot: snapshot.major ?? null,
        class_name_snapshot: snapshot.className ?? null,
        grade_snapshot: snapshot.grade ?? null,
        verification_method: verificationMethod,
        verification_level: 'low',
        verified_at: new Date(),
      })
    })
  } catch (err) {
    // UNIQUE(provider, subject) 冲突（并发注册兜底）：23505
    if ((err as { code?: string }).code === '23505') {
      throw new IdentityAlreadyBoundError()
    }
    throw err
  }
  return { userId, identityId, created: true }
}
