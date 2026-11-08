/**
 * T12 provisioner 幂等与失败语义测试（§4.1 / §5）：
 * - 全一致 → 全 skip（幂等重跑无副作用）；
 * - 缺什么补什么，顺序固定 ①Casdoor → ②策略 → ③目录 → ④模块；
 * - 安全阀：缺 client_id / TTL 未设 / 数据域未登记 / 未取到数据域全集 → 整轮停止（退出码 2）；
 * - 部分失败不回滚已成功产物，状态留在 approved（未上架，无泄漏面）；
 * - 业务策略按 (domain, operation) 补缺（幂等键语义）。
 */

import { describe, expect, it } from 'vitest'

import {
  AppRegistryError,
  applyPlan,
  planHasWrites,
  planProvisioning,
  type ActualState,
  type ProvisionStep,
} from '../../../src/domain/app-registry/index.js'
import { PRESENTATION, emptyActual, makeReview } from './fixtures.js'

const DOMAINS = ['cloud_sync', 'forum', 'grades', 'schedule', 'game']

function approved(overrides = {}) {
  return makeReview({ status: 'approved', ...overrides })
}

describe('T12 provisioner plan', () => {
  it('现状全空 → 四步全 create，且顺序固定', () => {
    const plan = planProvisioning(approved(), emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    expect(plan.stop).toBe(false)
    expect(plan.exitCode).toBe(0)
    expect(plan.steps.map((s) => s.artifact)).toEqual(['casdoor', 'policy', 'catalog', 'module'])
    expect(plan.steps.filter((s) => s.action === 'create')).toHaveLength(3) // module 非 remote → skip
    expect(planHasWrites(plan)).toBe(true)
  })

  it('现状已一致 → 全 skip（幂等重跑零副作用）', () => {
    const review = approved()
    const actual: ActualState = {
      casdoor: {
        application_name: review.casdoor.application_name,
        client_id: review.casdoor.client_id,
        expire_in_hours: review.casdoor.expire_in_hours,
        refresh_expire_in_hours: review.casdoor.refresh_expire_in_hours,
        token_format: review.casdoor.token_format,
        token_fields: [...review.casdoor.token_fields],
      },
      policy: [
        { domain: 'cloud_sync', operation: 'read' },
        { domain: 'cloud_sync', operation: 'write' },
      ],
      catalog: {
        app_id: review.app_id,
        name: PRESENTATION.name,
        icon: PRESENTATION.icon,
        summary: PRESENTATION.summary,
        kind: 'internal',
        form: 'embedded',
        entry: 'demo',
        compat: review.compat,
        data_domains: review.data_domains,
        status: 'pending',
        review_version: `${review.review_id}@v${review.version}`,
      },
      module: null,
    }
    const plan = planProvisioning(review, actual, { presentation: PRESENTATION, allowedDomains: DOMAINS })
    expect(plan.steps.every((s) => s.action === 'skip')).toBe(true)
    expect(planHasWrites(plan)).toBe(false)
  })

  it('策略只补缺的 (domain, operation)，已有一半时是 update', () => {
    const review = approved()
    const actual: ActualState = {
      ...emptyActual(),
      policy: [{ domain: 'cloud_sync', operation: 'read' }],
    }
    const plan = planProvisioning(review, actual, { presentation: PRESENTATION, allowedDomains: DOMAINS })
    const policyStep = plan.steps.find((s) => s.artifact === 'policy')!
    expect(policyStep.action).toBe('update')
    expect(policyStep.reason).toContain('cloud_sync:write')
  })

  it('目录条目存在但 review_version 过期 → update', () => {
    const review = approved()
    const stale = {
      app_id: review.app_id,
      name: 'x',
      icon: 'i',
      summary: 's',
      kind: 'internal' as const,
      form: 'embedded' as const,
      entry: 'demo',
      compat: review.compat,
      data_domains: review.data_domains,
      status: 'pending' as const,
      review_version: 'old-review@v0',
    }
    const plan = planProvisioning(review, { ...emptyActual(), catalog: stale }, {
      presentation: PRESENTATION,
      allowedDomains: DOMAINS,
    })
    expect(plan.steps.find((s) => s.artifact === 'catalog')!.action).toBe('update')
  })

  it('remote 条目：模块产物缺失/序号落后 → create/update', () => {
    const module = {
      manifest_url: 'https://cdn/m.json',
      artifact_url: 'https://cdn/a.zip',
      publisher_key_id: 'key-1',
      release_seq: 4,
    }
    const review = approved({ module })
    const plan = planProvisioning(review, emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    expect(plan.steps.find((s) => s.artifact === 'module')!.action).toBe('create')

    const stale = planProvisioning(
      review,
      { ...emptyActual(), module: { publisher_key_id: 'key-1', release_seq: 3 } },
      { presentation: PRESENTATION, allowedDomains: DOMAINS },
    )
    expect(stale.steps.find((s) => s.artifact === 'module')!.action).toBe('update')

    const inSync = planProvisioning(
      review,
      { ...emptyActual(), module: { publisher_key_id: 'key-1', release_seq: 4 } },
      { presentation: PRESENTATION, allowedDomains: DOMAINS },
    )
    expect(inSync.steps.find((s) => s.artifact === 'module')!.action).toBe('skip')
  })
})

describe('T12 provisioner 安全阀（映射缺失整轮停止）', () => {
  it('缺 client_id → 停止（退出码 2）', () => {
    const review = approved({ casdoor: { ...approved().casdoor, client_id: '' } })
    const plan = planProvisioning(review, emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    expect(plan.stop).toBe(true)
    expect(plan.exitCode).toBe(2)
    expect(plan.stopReason).toContain('client_id')
    expect(plan.steps).toHaveLength(0)
  })

  it('TTL 未显式设置（Casdoor 默认 0 会签发即过期）→ 停止', () => {
    const review = approved({ casdoor: { ...approved().casdoor, expire_in_hours: 0 } })
    const plan = planProvisioning(review, emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    expect(plan.exitCode).toBe(2)
    expect(plan.stopReason).toContain('TTL')
  })

  it('未取得数据域全集 → 停止（不猜默认值）', () => {
    const plan = planProvisioning(approved(), emptyActual(), { presentation: PRESENTATION })
    expect(plan.exitCode).toBe(2)
    expect(plan.stopReason).toContain('数据域全集')
  })

  it('申请了未登记的数据域 → 停止', () => {
    const review = approved({
      data_domains: [{ domain: 'secret_domain', operations: ['read'], purpose: '随便' }],
    })
    const plan = planProvisioning(review, emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    expect(plan.exitCode).toBe(2)
    expect(plan.stopReason).toContain('secret_domain')
  })

  it('状态不对（未批准）直接拒绝', () => {
    expect(() =>
      planProvisioning(makeReview({ status: 'submitted' }), emptyActual(), {
        presentation: PRESENTATION,
        allowedDomains: DOMAINS,
      }),
    ).toThrow(AppRegistryError)
  })
})

describe('T12 apply：回执与部分失败', () => {
  const NOW = '2026-11-08T00:00:00Z'

  it('全部成功 → provisioned', () => {
    const review = approved()
    const plan = planProvisioning(review, emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    const result = applyPlan(review, plan, () => ({ ok: true }), NOW)
    expect(result.failures).toHaveLength(0)
    expect(result.keepStatus).toBe('provisioned')
    expect(result.receipts.casdoor?.result).toBe('ok')
    expect(result.receipts.policy?.result).toBe('ok')
    expect(result.receipts.catalog?.result).toBe('ok')
    expect(result.receipts.module?.result).toBe('ok') // skip 也记 ok（该产物无需存在）
  })

  it('中间失败：已成功产物保留回执，状态留在 approved（不上架）', () => {
    const review = approved()
    const plan = planProvisioning(review, emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    const result = applyPlan(
      review,
      plan,
      (step: ProvisionStep) => (step.artifact === 'catalog' ? { ok: false, error: '目录写入失败' } : { ok: true }),
      NOW,
    )
    expect(result.failures).toEqual([{ artifact: 'catalog', error: '目录写入失败' }])
    expect(result.keepStatus).toBe('approved')
    expect(result.receipts.casdoor?.result).toBe('ok') // 不回滚已成功产物
    expect(result.receipts.policy?.result).toBe('ok')
    expect(result.receipts.catalog).toMatchObject({ result: 'failed', detail: '目录写入失败' })
    // 非 remote 的模块产物「不适用」（而非"已一致"）—— 审计上必须能区分
    expect(result.receipts.module).toMatchObject({ result: 'ok', detail: 'not applicable' })
  })

  it('安全阀触发时不执行任何写操作', () => {
    const review = approved({ casdoor: { ...approved().casdoor, client_id: '' } })
    const plan = planProvisioning(review, emptyActual(), { presentation: PRESENTATION, allowedDomains: DOMAINS })
    let calls = 0
    const result = applyPlan(review, plan, () => {
      calls += 1
      return { ok: true }
    }, NOW)
    expect(calls).toBe(0)
    expect(result.keepStatus).toBe('approved')
  })
})
