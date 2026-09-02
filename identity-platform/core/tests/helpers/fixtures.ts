/**
 * 测试 fixture：创建 user + developer + active Client（含 redirect_uri/scopes）。
 */
import type { SqlExecutor } from '../../src/db/types.js'
import { createUserWithHbutIdentity } from '../../src/domain/users.js'
import { createClient, setClientStatus } from '../../src/domain/clients.js'
import { upsertApplicationScope } from '../../src/db/repos/clients.repo.js'
import { TEST_KEK } from './keys.js'
import { newUuidV7 } from '../../src/domain/ids.js'
import { insertDeveloper } from './developers.js'

export interface ClientFixture {
  clientId: string
  clientSecret: string | null
  applicationId: string
  userId: string
  developerId: string
}

export async function createClientFixture(
  sql: SqlExecutor,
  opts: {
    scopes?: string[]
    clientType?: 'web_confidential' | 'native_public'
    status?: 'active' | 'suspended' | 'revoked' | 'draft' | 'pending_review' | 'rejected'
    /** 自定义 redirect_uri（默认 https://app.example.com/cb，kind=web_https） */
    redirectUris?: Array<{ uri: string; kind: 'web_https' | 'native_loopback' }>
    /** 自定义 homepage_url（默认 https://app.example.com） */
    homepageUrl?: string
  } = {},
): Promise<ClientFixture> {
  const { userId } = await createUserWithHbutIdentity(sql, {
    studentId: `2023${Math.floor(Math.random() * 9000) + 1000}000${Math.floor(Math.random() * 90) + 10}`,
    studentName: '测试学生',
  })
  const developerId = newUuidV7()
  await insertDeveloper(sql, { id: developerId, userId, displayName: '测试开发者' })

  const result = await createClient(
    sql,
    {
      developerId,
      name: '测试应用',
      clientType: opts.clientType ?? 'web_confidential',
      redirectUris: opts.redirectUris ?? [{ uri: 'https://app.example.com/cb', kind: 'web_https' }],
      homepageUrl: opts.homepageUrl ?? 'https://app.example.com',
      requestedScopes: opts.scopes ?? ['openid', 'profile'],
    },
    { clientSecretKek: TEST_KEK },
  )

  // 模拟管理员已审核通过 scope（V1 测试 fixture 直接给 approved）
  for (const scope of (opts.scopes ?? ['openid', 'profile'])) {
    await upsertApplicationScope(sql, result.applicationId, scope, 'approved')
  }

  const status = opts.status ?? 'active'
  if (status !== 'draft') {
    // 审核流：draft → pending_review → approved → active（简化：逐级推进）
    const path: Array<'pending_review' | 'approved' | 'active' | 'suspended' | 'revoked' | 'rejected'> =
      status === 'active' ? ['pending_review', 'approved', 'active']
        : status === 'suspended' ? ['pending_review', 'approved', 'active', 'suspended']
          : status === 'revoked' ? ['pending_review', 'approved', 'active', 'revoked']
            : status === 'pending_review' ? ['pending_review']
              : status === 'rejected' ? ['pending_review', 'rejected']
                : ['pending_review', 'approved']
    for (const s of path) {
      await setClientStatus(sql, result.clientId, s)
    }
  }

  return {
    clientId: result.clientId,
    clientSecret: result.clientSecret,
    applicationId: result.applicationId,
    userId,
    developerId,
  }
}
