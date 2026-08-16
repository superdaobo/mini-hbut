/**
 * Developer Store（桩）测试：生命周期全流程、IDOR 负向全套、secret 只显示一次/rotate、
 * suspended 开发者、修改后自动重新审核（issue #624 测试验收项）。
 *
 * 用 createStubDeveloperStore 独立实例（BFF 的模块级单例不参与本测试）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateAppInput } from '../lib/developer/contract'
import { createStubDeveloperStore, type AdminReviewDecision } from '../lib/developer-api/stub-store'

/** 固定时间轴（now 注入，测试可断言时间顺序） */
let nowMs = 1_700_000_000_000
const now = () => new Date(nowMs)

function makeStore() {
  return createStubDeveloperStore({ now, allowLocalhostDev: true })
}

function webAppInput(overrides: Partial<CreateAppInput> = {}): CreateAppInput {
  return {
    name: '课程表助手',
    description: '展示课程与考试安排的第三方工具',
    homepage_url: 'https://course.example.com',
    client_type: 'web_confidential',
    privacy_policy_url: null,
    contact: null,
    redirect_uris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' }],
    scopes: [{ scope: 'openid', justification: null }],
    ...overrides,
  }
}

function nativeAppInput(): CreateAppInput {
  return {
    name: '本地小工具',
    description: '纯本地应用',
    homepage_url: null,
    client_type: 'native_public',
    privacy_policy_url: null,
    contact: null,
    redirect_uris: [{ uri: 'my-app:/oauth/callback', kind: 'native_custom' }],
    scopes: [{ scope: 'openid', justification: null }],
  }
}

/** 完整走一遍草稿→提交→批准→启用（管理员动作由 simulateAdminReview 承担，BFF 不暴露） */
async function approveAndActivate(
  store: ReturnType<typeof makeStore>,
  sub: string,
  appId: string,
  decision: AdminReviewDecision = { to: 'approved' },
) {
  store.simulateAdminReview(appId, decision)
  store.simulateAdminReview(appId, { to: 'active' })
  return store.getApp(sub, appId)
}

function expectIdorNotLeak(fn: () => Promise<unknown>) {
  // IDOR 负向：一律 404 not_found，且错误信息不区分「不存在」与「非本人所有」
  return expect(fn()).rejects.toMatchObject({ status: 404, code: 'not_found' })
}

beforeEach(() => {
  nowMs = 1_700_000_000_000
})

describe('应用生命周期（create → submit → approved → active）', () => {
  it('创建落 draft；web 应用返回 client_secret 一次', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const result = await store.createApp('sub_a', webAppInput())
    expect(result.id).toMatch(/^app_/)
    expect(result.client_id).toMatch(/^cli_/)
    expect(result.client_secret).toBeTruthy() // 仅此一次

    const detail = await store.getApp('sub_a', result.id)
    expect(detail!.status).toBe('draft')
    expect(detail!.client_id).toBe(result.client_id)
    // GET 绝不回明文 secret
    expect(JSON.stringify(detail)).not.toContain(result.client_secret!)
  })

  it('draft → pending_review（提交）；pending 后基本信息锁定', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())

    const submitted = await store.submitForReview('sub_a', id)
    expect(submitted!.status).toBe('pending_review')
    expect(submitted!.submitted_at).toBeTruthy()

    await expect(
      store.updateApp('sub_a', id, { name: '改名' }),
    ).rejects.toMatchObject({ status: 409, code: 'invalid_state' })
  })

  it('approved → active：审批完成与正式启用分离（issue #624 默认保留两者）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    await store.submitForReview('sub_a', id)

    store.simulateAdminReview(id, { to: 'approved' })
    const approved = await store.getApp('sub_a', id)
    expect(approved!.status).toBe('approved')
    expect(approved!.review.decision).toBe('approved')
    expect(approved!.review.reviewed_at).toBeTruthy()
    expect(approved!.activated_at).toBeNull() // 尚未启用

    store.simulateAdminReview(id, { to: 'active' })
    const active = await store.getApp('sub_a', id)
    expect(active!.status).toBe('active')
    expect(active!.activated_at).toBeTruthy()
  })

  it('rejected → 修改 → 重新提交（rejected 可编辑，重新提交回 pending_review）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    await store.submitForReview('sub_a', id)

    store.simulateAdminReview(id, {
      to: 'rejected',
      rejectionReason: '主页无法访问，请补充隐私政策',
      reviewNotes: '请补充 https 主页',
      needsChanges: ['主页 URL 需可访问', '补充隐私政策'],
    })
    const rejected = await store.getApp('sub_a', id)
    expect(rejected!.status).toBe('rejected')
    expect(rejected!.review.rejection_reason).toContain('主页')
    expect(rejected!.review.needs_changes).toHaveLength(2)
    // scope 级 review_note 同步（Review 页可行动反馈）
    expect(rejected!.scopes[0]!.review_note).toBe('请补充 https 主页')

    // rejected 可编辑 + 重新提交
    const updated = await store.updateApp('sub_a', id, { homepage_url: 'https://course.example.com' })
    expect(updated!.status).toBe('rejected')
    const resubmitted = await store.submitForReview('sub_a', id)
    expect(resubmitted!.status).toBe('pending_review')
  })

  it('提交时完整性校验：非法 redirect URI 拒绝提交（兜底，防绕过 create 校验）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    // 直接篡改内部状态模拟「绕过逐条校验」的历史数据：submit 必须兜底拒绝
    const app = store._allApps().find((a) => a.id === id)!
    app.redirect_uris[0]!.uri = 'http://evil.example.com/cb'
    await expect(store.submitForReview('sub_a', id)).rejects.toMatchObject({ status: 400 })
  })

  it('生产模式（allowLocalhostDev=false）拒绝 http://localhost 的 web_https', async () => {
    const prodStore = createStubDeveloperStore({ now, allowLocalhostDev: false })
    await prodStore.ensureDeveloper('sub_a', '开发者 A')
    await expect(
      prodStore.createApp(
        'sub_a',
        webAppInput({ redirect_uris: [{ uri: 'http://localhost:3000/cb', kind: 'web_https' }] }),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('revoke：非终态可撤销，终态后一切变更拒绝', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    const revoked = await store.revokeApp('sub_a', id)
    expect(revoked!.status).toBe('revoked')

    await expect(store.updateApp('sub_a', id, { name: 'x' })).rejects.toMatchObject({ status: 409 })
    await expect(store.addRedirectUri('sub_a', id, { uri: 'https://a.com/cb', kind: 'web_https' })).rejects.toMatchObject({ status: 409 })
    await expect(store.putScopes('sub_a', id, [{ scope: 'openid', justification: null }])).rejects.toMatchObject({ status: 409 })
    await expect(store.rotateSecret('sub_a', id)).rejects.toMatchObject({ status: 409 })
    await expect(store.submitForReview('sub_a', id)).rejects.toMatchObject({ status: 409 })
  })

  it('delete 仅 draft；非 draft 走 revoke', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    await store.submitForReview('sub_a', id)
    await expect(store.deleteApp('sub_a', id)).rejects.toMatchObject({ status: 409 })
    expect(await store.deleteApp('sub_a', id).catch(() => null)).toBeNull() // 上面已拒绝

    const { id: draftId } = await store.createApp('sub_a', webAppInput())
    expect((await store.deleteApp('sub_a', draftId))!.deleted).toBe(true)
  })
})

describe('修改 redirect URI / scope 自动重新进入审核', () => {
  it('Active 应用新增 redirect URI → 回 pending_review（不能无审核即时增加回调）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    await store.submitForReview('sub_a', id)
    await approveAndActivate(store, 'sub_a', id)

    const changed = await store.addRedirectUri('sub_a', id, { uri: 'https://course.example.com/cb2', kind: 'web_https' })
    // 变更即自动重新进入审核（applyReviewReset：pending_review + submitted_at 刷新）
    expect(changed!.status).toBe('pending_review')
    // 重新审核后新 URI 随审核生效
    await approveAndActivate(store, 'sub_a', id)
    const active = await store.getApp('sub_a', id)
    expect(active!.status).toBe('active')
    expect(active!.redirect_uris.map((r) => r.uri)).toContain('https://course.example.com/cb2')
  })

  it('Active 应用改 scope → 回 pending_review；敏感 scope 校验仍生效', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    // 预置隐私政策与联系方式（敏感 scope 审核所需，draft 阶段即可设置）
    const { id } = await store.createApp(
      'sub_a',
      webAppInput({
        privacy_policy_url: 'https://course.example.com/privacy',
        contact: 'dev@example.com',
      }),
    )
    await store.submitForReview('sub_a', id)
    await approveAndActivate(store, 'sub_a', id)

    // 敏感 scope 无理由 → 400（openid 必选同时校验）
    await expect(
      store.putScopes('sub_a', id, [
        { scope: 'openid', justification: null },
        { scope: 'student.identity', justification: '短' },
      ]),
    ).rejects.toMatchObject({ status: 400 })

    const changed = await store.putScopes('sub_a', id, [
      { scope: 'openid', justification: null },
      { scope: 'student.identity', justification: '用于课程社区实名展示，需学校身份声明' },
    ])
    expect(changed!.status).toBe('pending_review')
  })

  it('draft 状态修改 redirect/scope 不触发重新审核（仍在 draft）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    const detail = (await store.getApp('sub_a', id))!
    const changed = await store.addRedirectUri('sub_a', id, { uri: 'https://course.example.com/cb2', kind: 'web_https' })
    expect(changed!.status).toBe('draft')
    expect(detail.redirect_uris).toHaveLength(1)
  })
})

describe('Secret 生命周期', () => {
  it('web：创建返回一次，GET 只有元数据（fingerprint/last4/时间）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id, client_secret } = await store.createApp('sub_a', webAppInput())
    const detail = await store.getApp('sub_a', id)
    expect(detail!.secret.fingerprint).toMatch(/^sha256:[0-9a-f]{16}$/)
    expect(detail!.secret.last4).toBe(client_secret!.slice(-4))
    expect(JSON.stringify(detail)).not.toContain(client_secret)
  })

  it('native 恒无 secret（PKCE S256，禁止生成「方便开发者」的 secret）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id, client_secret } = await store.createApp('sub_a', nativeAppInput())
    expect(client_secret).toBeNull()
    const detail = await store.getApp('sub_a', id)
    expect(detail!.secret.created_at).toBeNull()
    expect(detail!.secret.fingerprint).toBeNull()
    await expect(store.rotateSecret('sub_a', id)).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
  })

  it('rotate：新 secret 只返回一次，旧值立即失效；audit 记录动作但不记 secret', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id, client_secret: oldSecret } = await store.createApp('sub_a', webAppInput())

    nowMs += 60_000
    const rotated = await store.rotateSecret('sub_a', id)
    expect(rotated!.client_secret).not.toBe(oldSecret)
    // rotate 后 GET 不再含新旧明文
    const after = await store.getApp('sub_a', id)
    expect(JSON.stringify(after)).not.toContain(oldSecret)
    expect(JSON.stringify(after)).not.toContain(rotated!.client_secret)
    expect(after!.secret.last_rotated_at).toBeTruthy()
    // audit 记录 rotate，且不含任何 secret 值
    const audit = await store.listAudit('sub_a', id)
    const rotateEntry = audit!.find((e) => e.action === 'secret.rotated')
    expect(rotateEntry).toBeTruthy()
    expect(JSON.stringify(audit)).not.toContain(oldSecret)
    expect(JSON.stringify(audit)).not.toContain(rotated!.client_secret)
  })

  it('suspended 开发者不能 rotate（403）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    store.setDeveloperStatus('sub_a', 'suspended')
    await expect(store.rotateSecret('sub_a', id)).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    // 只读仍允许
    expect(await store.getApp('sub_a', id)).not.toBeNull()
  })
})

describe('IDOR 负向全套（A 操作 B 的应用一律 404，不泄露存在性）', () => {
  async function setupTwoDevelopers() {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    await store.ensureDeveloper('sub_b', '开发者 B')
    const appA = await store.createApp('sub_a', webAppInput())
    const appB = await store.createApp('sub_b', webAppInput())
    await store.submitForReview('sub_b', appB.id)
    store.simulateAdminReview(appB.id, { to: 'approved' })
    store.simulateAdminReview(appB.id, { to: 'active' })
    return { store, appA, appB }
  }

  it('A 读取 B 的应用：null（路由层映射 404，与不存在一致）', async () => {
    const { store, appB } = await setupTwoDevelopers()
    // 只读接口按 store 契约返回 null（不 throw），由 BFF 统一映射 404 not_found
    await expect(store.getApp('sub_a', appB.id)).resolves.toBeNull()
    await expect(store.listAudit('sub_a', appB.id)).resolves.toBeNull()
    await expect(store.getScopes('sub_a', appB.id)).resolves.toBeNull()
  })

  it('A 修改 B 的应用基本信息：404', async () => {
    const { store, appB } = await setupTwoDevelopers()
    await expectIdorNotLeak(() => store.updateApp('sub_a', appB.id, { name: '劫持' }))
  })

  it('A 修改 B 的 redirect URI（增/删）：404', async () => {
    const { store, appB } = await setupTwoDevelopers()
    await expectIdorNotLeak(() =>
      store.addRedirectUri('sub_a', appB.id, { uri: 'https://evil.example.com/cb', kind: 'web_https' }),
    )
    const detail = (await store.getApp('sub_b', appB.id))!
    await expectIdorNotLeak(() => store.removeRedirectUri('sub_a', appB.id, detail.redirect_uris[0]!.id))
  })

  it('A 修改 B 的 scopes：404', async () => {
    const { store, appB } = await setupTwoDevelopers()
    await expectIdorNotLeak(() => store.putScopes('sub_a', appB.id, [{ scope: 'openid', justification: null }]))
  })

  it('A rotate B 的 secret：404', async () => {
    const { store, appB } = await setupTwoDevelopers()
    await expectIdorNotLeak(() => store.rotateSecret('sub_a', appB.id))
  })

  it('A submit / revoke / delete B 的应用：404', async () => {
    const { store, appB } = await setupTwoDevelopers()
    await expectIdorNotLeak(() => store.submitForReview('sub_a', appB.id))
    await expectIdorNotLeak(() => store.revokeApp('sub_a', appB.id))
    await expectIdorNotLeak(() => store.deleteApp('sub_a', appB.id))
  })

  it('不存在 vs 非本人所有：只读接口同样返回 null（防枚举）', async () => {
    const { store, appB } = await setupTwoDevelopers()
    const missing = await store.getApp('sub_a', 'app_does_not_exist')
    const foreign = await store.getApp('sub_a', appB.id)
    expect(missing).toBeNull()
    expect(foreign).toBeNull()
  })
})

describe('敏感 scope 的创建校验', () => {
  it('创建时敏感 scope 必须有理由 + 隐私政策 + 联系方式（否则 400）', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    await expect(
      store.createApp(
        'sub_a',
        webAppInput({
          scopes: [
            { scope: 'openid', justification: null },
            { scope: 'student.identity', justification: '用途' },
          ],
        }),
      ),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_request' })

    const ok = await store.createApp(
      'sub_a',
      webAppInput({
        privacy_policy_url: 'https://course.example.com/privacy',
        contact: 'dev@example.com',
        scopes: [
          { scope: 'openid', justification: null },
          { scope: 'student.identity', justification: '用于课程社区实名展示，需学校身份声明' },
        ],
      }),
    )
    expect(ok.client_secret).toBeTruthy()
  })
})

describe('审计记录', () => {
  it('生命周期关键动作都有审计；detail 不含敏感值', async () => {
    const store = makeStore()
    await store.ensureDeveloper('sub_a', '开发者 A')
    const { id } = await store.createApp('sub_a', webAppInput())
    await store.submitForReview('sub_a', id)
    const audit = await store.listAudit('sub_a', id)
    const actions = audit!.map((a) => a.action)
    expect(actions).toContain('app.created')
    expect(actions).toContain('app.submitted')
    expect(actions).toContain('app.submitted') // 提交一次
    // 首次 create 的 secret 不进入审计
    expect(JSON.stringify(audit)).not.toMatch(/secret=.{8,}/)
  })
})
