/**
 * Admin 桩存储语义测试（issue #625，与 Core 合同一致）：
 * - RBAC：无角色 403、reviewer 可查看/审核、admin 才可 suspend/revoke/audit；
 * - self-review 禁止；review 不属于 app → 404；
 * - 快照 + TOCTOU：应用内容变化 → 旧 review superseded + approve 409 revision_mismatch；
 * - 部分 scope 审批；reject 必须 reason；幂等；
 * - step-up：敏感 scope 审核 / suspend / revoke 要求近期认证；
 * - 审计事件存在且 metadata 无敏感键。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createStubDeveloperStore } from '../lib/developer-api/stub-store'
import { createStubAdminStore } from '../lib/admin/stub-store'
import { AdminApiError } from '../lib/admin/contract'

const NOW = new Date('2026-08-13T10:00:00.000Z')

describe('#625 admin 桩存储', () => {
  let dev: ReturnType<typeof createStubDeveloperStore>
  let admin: ReturnType<typeof createStubAdminStore>

  beforeEach(() => {
    dev = createStubDeveloperStore({ now: () => NOW })
    admin = createStubAdminStore({
      now: () => NOW,
      devStore: dev as never,
      roles: {
        admin_sub: ['identity_admin'],
        reviewer_sub: ['identity_reviewer'],
      },
    })
  })
  afterEach(() => {
    admin.clear()
  })

  /** 造一个提交审核的应用（owner = dev_sub） */
  async function createSubmittedApp(ownerSub: string, opts: { scopes?: string[] } = {}): Promise<{ id: string }> {
    await dev.ensureDeveloper(ownerSub, '测试开发者')
    const created = await dev.createApp(ownerSub, {
      name: '课程助手',
      description: '课程查询',
      homepage_url: 'https://course.example.com',
      client_type: 'web_confidential',
      privacy_policy_url: 'https://course.example.com/privacy',
      contact: 'dev@example.com',
      redirect_uris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
      scopes: (opts.scopes ?? ['openid']).map((s) => ({ scope: s, justification: s === 'student.identity' || s === 'offline_access' ? '需要验证学生的学校身份信息用于教务查询' : null })),
    })
    await dev.submitForReview(ownerSub, created.id)
    return { id: created.id }
  }

  it('RBAC：无角色 → 403；reviewer 可查看；admin 可 suspend', async () => {
    const { id } = await createSubmittedApp('dev_sub')
    await expect(admin.overview('nobody')).rejects.toThrow(AdminApiError)
    await expect(admin.overview('nobody')).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    // reviewer 可查看 + 审核
    const overview = await admin.overview('reviewer_sub')
    expect(overview.pending_reviews).toBe(1)
    const list = await admin.listApps('reviewer_sub')
    expect(list.apps[0]?.id).toBe(id)
    // reviewer 不能 suspend
    await expect(admin.suspendClient('reviewer_sub', id, 'x', Math.floor(NOW.getTime() / 1000)))
      .rejects.toMatchObject({ status: 403, code: 'forbidden' })
    // reviewer 不能查 audit
    await expect(admin.listAudit('reviewer_sub')).rejects.toMatchObject({ status: 403 })
    // admin：先批准（激活）再 suspend
    const reviewId = (await admin.listReviews('admin_sub', id))[0]?.id as string
    await admin.approveReview('admin_sub', id, reviewId, { scope_decisions: [{ scope: 'openid', decision: 'approved' }] }, Math.floor(NOW.getTime() / 1000))
    const r = await admin.suspendClient('admin_sub', id, '安全响应', Math.floor(NOW.getTime() / 1000))
    expect(r.status).toBe('suspended')
  })

  it('self-review 禁止：owner 本人审核 → 403', async () => {
    const { id } = await createSubmittedApp('reviewer_sub')
    const reviews = await admin.listReviews('admin_sub', id)
    const reviewId = reviews[0]?.id
    await expect(admin.approveReview('reviewer_sub', id, reviewId as string, { scope_decisions: [{ scope: 'openid', decision: 'approved' }] }, Math.floor(NOW.getTime() / 1000)))
      .rejects.toMatchObject({ status: 403, code: 'forbidden' })
  })

  it('快照 + TOCTOU：变更后 approve → 409 revision_mismatch，旧 review 自动 superseded', async () => {
    const { id } = await createSubmittedApp('dev_sub')
    const before = await admin.listReviews('reviewer_sub', id) // 物化 pending review
    expect(before[0]?.status).toBe('pending')
    // 模拟开发者绕过 pending 锁定直接改内容（未来 Core developer API 的
    // mutation 会走「变更 → 重新审核」语义；此处直改对象验证快照防护本身）
    const liveApp = dev._allApps().find((a) => a.id === id)
    if (liveApp) {
      liveApp.name = '改名后的应用'
    }
    // 直接 approve 旧 review（不先读队列，复现 Core 的 approve 时 revision 比对）→ 409
    await expect(admin.approveReview('admin_sub', id, before[0]?.id as string, { scope_decisions: [{ scope: 'openid', decision: 'approved' }] }, Math.floor(NOW.getTime() / 1000)))
      .rejects.toMatchObject({ status: 409, code: 'revision_mismatch' })
    // 旧快照已被自动作废；新快照生成（不同 id）；应用保持 pending_review
    const after = await admin.getApp('reviewer_sub', id)
    const oldReview = after?.reviews.find((r) => r.id === before[0]?.id)
    expect(oldReview?.status).toBe('superseded')
    const fresh = after?.reviews.find((r) => r.status === 'pending')
    expect(fresh?.id).not.toBe(before[0]?.id)
    expect(after?.application.status).toBe('pending_review')
  })

  it('部分 scope 审批：敏感 scope 单独拒绝；幂等重放返回既有结果', async () => {
    const { id } = await createSubmittedApp('dev_sub', { scopes: ['openid', 'student.identity'] })
    const reviews = await admin.listReviews('admin_sub', id)
    const reviewId = reviews[0]?.id as string
    const authTime = Math.floor(NOW.getTime() / 1000)
    const result = await admin.approveReview('admin_sub', id, reviewId, {
      scope_decisions: [
        { scope: 'openid', decision: 'approved' },
        { scope: 'student.identity', decision: 'rejected', note: '用途不足' },
      ],
      note: '整体通过',
    }, authTime)
    expect(result.status).toBe('approved')
    // 应用激活；scope 决策落地
    const detail = await admin.getApp('reviewer_sub', id)
    expect(detail?.application.status).toBe('active')
    expect(detail?.scopes.find((s) => s.scope === 'student.identity')?.status).toBe('rejected')
    expect(detail?.scopes.find((s) => s.scope === 'openid')?.status).toBe('approved')
    // 幂等重放（即使请求体被篡改为全拒绝）
    const replay = await admin.approveReview('admin_sub', id, reviewId, {
      scope_decisions: [{ scope: 'openid', decision: 'rejected' }, { scope: 'student.identity', decision: 'rejected' }],
    }, authTime)
    expect(replay.status).toBe('approved')
  })

  it('reject 必须 reason；重复 reject 幂等', async () => {
    const { id } = await createSubmittedApp('dev_sub')
    const reviews = await admin.listReviews('admin_sub', id)
    const reviewId = reviews[0]?.id as string
    await expect(admin.rejectReview('admin_sub', id, reviewId, { reason: '' }, Math.floor(NOW.getTime() / 1000)))
      .rejects.toMatchObject({ status: 400 })
    const rejected = await admin.rejectReview('admin_sub', id, reviewId, { reason: 'callback 必须 https' }, Math.floor(NOW.getTime() / 1000))
    expect(rejected.status).toBe('rejected')
    const detail = await admin.getApp('reviewer_sub', id)
    expect(detail?.application.status).toBe('rejected')
    const replay = await admin.rejectReview('admin_sub', id, reviewId, { reason: '别的理由' }, Math.floor(NOW.getTime() / 1000))
    expect(replay.status).toBe('rejected')
  })

  it('step-up：敏感 scope approve / suspend 无近期认证 → step_up_required；基础 scope 不需要', async () => {
    const { id } = await createSubmittedApp('dev_sub', { scopes: ['openid', 'offline_access'] })
    const reviews = await admin.listReviews('admin_sub', id)
    const reviewId = reviews[0]?.id as string
    // 敏感 scope + 无 authTime → step_up_required
    await expect(admin.approveReview('admin_sub', id, reviewId, { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'offline_access', decision: 'approved' }] }, undefined as never))
      .rejects.toMatchObject({ status: 403, code: 'step_up_required' })
    // 过期 authTime → step_up_required
    await expect(admin.approveReview('admin_sub', id, reviewId, { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'offline_access', decision: 'approved' }] }, Math.floor(NOW.getTime() / 1000) - 3600))
      .rejects.toMatchObject({ status: 403, code: 'step_up_required' })
    // suspend 无近期认证 → step_up_required
    const active = await createSubmittedApp('dev2_sub')
    await admin.approveReview('admin_sub', active.id, (await admin.listReviews('admin_sub', active.id))[0]?.id as string, { scope_decisions: [{ scope: 'openid', decision: 'approved' }] }, Math.floor(NOW.getTime() / 1000))
    await expect(admin.suspendClient('admin_sub', active.id, 'x', undefined as never))
      .rejects.toMatchObject({ status: 403, code: 'step_up_required' })
  })

  it('基础 scope approve 不需要 step-up；缺决策 → 400', async () => {
    const { id } = await createSubmittedApp('dev_sub', { scopes: ['openid', 'profile'] })
    const reviewId = (await admin.listReviews('admin_sub', id))[0]?.id as string
    const ok = await admin.approveReview('admin_sub', id, reviewId, { scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'profile', decision: 'approved' }] }, undefined as never)
    expect(ok.status).toBe('approved')
    // 缺失决策 → 400（新应用）
    const { id: id2 } = await createSubmittedApp('dev3_sub', { scopes: ['openid', 'profile'] })
    const reviewId2 = (await admin.listReviews('admin_sub', id2))[0]?.id as string
    await expect(admin.approveReview('admin_sub', id2, reviewId2, { scope_decisions: [{ scope: 'openid', decision: 'approved' }] }, undefined as never))
      .rejects.toMatchObject({ status: 400 })
  })

  it('suspend/unsuspend/revoke 状态约束 + 幂等', async () => {
    const { id } = await createSubmittedApp('dev_sub')
    const reviewId = (await admin.listReviews('admin_sub', id))[0]?.id as string
    const authTime = Math.floor(NOW.getTime() / 1000)
    await admin.approveReview('admin_sub', id, reviewId, { scope_decisions: [{ scope: 'openid', decision: 'approved' }] }, authTime)
    // suspend 非 active（draft）→ 409
    const draft = await dev.createApp('dev_sub', {
      name: '草稿应用', description: 'd', homepage_url: null, client_type: 'native_public',
      privacy_policy_url: null, contact: null,
      redirect_uris: [{ uri: 'http://127.0.0.1:3000/cb', kind: 'native_loopback' }],
      scopes: [{ scope: 'openid', justification: null }],
    })
    await expect(admin.suspendClient('admin_sub', draft.id, 'x', authTime))
      .rejects.toMatchObject({ status: 409, code: 'invalid_state' })
    // suspend → 幂等
    await admin.suspendClient('admin_sub', id, 'r1', authTime)
    const again = await admin.suspendClient('admin_sub', id, 'r2', authTime)
    expect(again.status).toBe('suspended')
    // unsuspend → active；revoked 后 unsuspend → 409
    await admin.unsuspendClient('admin_sub', id, 'ok', authTime)
    await admin.revokeClient('admin_sub', id, '永久', authTime)
    await expect(admin.unsuspendClient('admin_sub', id, 'x', authTime))
      .rejects.toMatchObject({ status: 409 })
    const replay = await admin.revokeClient('admin_sub', id, 'x', authTime)
    expect(replay.status).toBe('revoked')
  })

  it('审计：mutation 产生事件，metadata 无敏感键，reviewer 不可查', async () => {
    const { id } = await createSubmittedApp('dev_sub', { scopes: ['openid', 'student.identity'] })
    const reviewId = (await admin.listReviews('admin_sub', id))[0]?.id as string
    const authTime = Math.floor(NOW.getTime() / 1000)
    await admin.approveReview('admin_sub', id, reviewId, {
      scope_decisions: [{ scope: 'openid', decision: 'approved' }, { scope: 'student.identity', decision: 'rejected' }],
    }, authTime)
    await admin.suspendClient('admin_sub', id, '安全响应', authTime)
    await admin.unsuspendClient('admin_sub', id, '恢复', authTime)
    await admin.revokeClient('admin_sub', id, '撤销', authTime)

    const events = admin._audit()
    const types = events.map((e) => e.event_type)
    expect(types).toEqual(expect.arrayContaining([
      'ADMIN_APP_APPROVED',
      'ADMIN_SCOPE_APPROVED',
      'ADMIN_SCOPE_REJECTED',
      'ADMIN_CLIENT_SUSPENDED',
      'ADMIN_CLIENT_UNSUSPENDED',
      'ADMIN_CLIENT_REVOKED',
    ]))
    for (const e of events) {
      expect(JSON.stringify(e.metadata)).not.toMatch(/secret|token|handoff|password/i)
      expect(e.actor_id).toBe('admin_sub')
      expect(e.target_id).toBe(id)
    }
    // 查询接口：admin 可查，reviewer 403
    expect((await admin.listAudit('admin_sub')).length).toBeGreaterThan(0)
    await expect(admin.listAudit('reviewer_sub')).rejects.toMatchObject({ status: 403 })
  })
})
