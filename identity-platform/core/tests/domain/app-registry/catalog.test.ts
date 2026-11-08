/**
 * T12 目录条目生成与装载规则测试（契约 §7）：
 * - external 形态不进目录；
 * - 只有 active 可见；其余状态给出 pending/disabled；
 * - remote 缺签名 → 不可用且给出可理解原因（不得静默隐藏，不得降级运行）；
 * - min_host/platform/store_policy 判定；
 * - review_version 与审核记录绑定；
 * - 按 app_id upsert 覆盖不追加。
 */

import { describe, expect, it } from 'vitest'

import {
  buildCatalogEntry,
  catalogReviewVersion,
  compareVersions,
  evaluateEntryUsability,
  upsertCatalogEntries,
} from '../../../src/domain/app-registry/catalog.js'
import { PRESENTATION, makeReview } from './fixtures.js'

const CONTEXT = { hostVersion: '1.4.13', platform: 'windows' }

describe('T12 目录条目生成', () => {
  it('契约 §7 必填字段齐全，且绑定 review_version', () => {
    const review = makeReview({ status: 'active', version: 3 })
    const entry = buildCatalogEntry(review, PRESENTATION)
    expect(entry).not.toBeNull()
    expect(entry).toMatchObject({
      app_id: 'demo-app',
      name: '示例应用',
      icon: 'demo.png',
      summary: '用于测试',
      kind: 'internal',
      form: 'embedded',
      entry: 'demo',
      status: 'active',
      review_version: catalogReviewVersion(review),
      order: 10,
    })
    expect(entry?.compat.min_host).toBe('1.4.0')
    expect(entry?.data_domains[0]?.domain).toBe('cloud_sync')
  })

  it('external（网页）形态不进目录', () => {
    const review = makeReview({ form: 'external', entry: '', status: 'active' })
    expect(buildCatalogEntry(review, PRESENTATION)).toBeNull()
  })

  it('状态推导：只有 active 是 active，其余 pending/disabled', () => {
    expect(buildCatalogEntry(makeReview({ status: 'submitted' }), PRESENTATION)?.status).toBe('pending')
    expect(buildCatalogEntry(makeReview({ status: 'approved' }), PRESENTATION)?.status).toBe('pending')
    expect(buildCatalogEntry(makeReview({ status: 'provisioned' }), PRESENTATION)?.status).toBe('pending')
    expect(buildCatalogEntry(makeReview({ status: 'suspended' }), PRESENTATION)?.status).toBe('disabled')
    expect(buildCatalogEntry(makeReview({ status: 'revoked' }), PRESENTATION)?.status).toBe('disabled')
  })

  it('可按需覆盖状态（provisioner 先置 disabled 再上架）', () => {
    const entry = buildCatalogEntry(makeReview({ status: 'provisioned' }), PRESENTATION, { status: 'disabled' })
    expect(entry?.status).toBe('disabled')
  })

  it('remote 条目携带模块引用', () => {
    const review = makeReview({
      status: 'active',
      module: {
        manifest_url: 'https://cdn.example/m.json',
        artifact_url: 'https://cdn.example/a.zip',
        publisher_key_id: 'key-2026',
        release_seq: 7,
      },
    })
    const entry = buildCatalogEntry(review, { ...PRESENTATION, kind: 'remote' })
    expect(entry?.module).toEqual({
      manifest_url: 'https://cdn.example/m.json',
      artifact_url: 'https://cdn.example/a.zip',
      publisher_key_id: 'key-2026',
      release_seq: 7,
    })
  })
})

describe('T12 装载规则（契约 §7：不得静默隐藏）', () => {
  const active = () => buildCatalogEntry(makeReview({ status: 'active' }), PRESENTATION)!

  it('active + 平台/版本/store 满足 → 可用', () => {
    expect(evaluateEntryUsability(active(), CONTEXT)).toEqual({ usable: true })
  })

  it('未上架/已停用给出明确原因', () => {
    const pending = buildCatalogEntry(makeReview({ status: 'approved' }), PRESENTATION)!
    expect(evaluateEntryUsability(pending, CONTEXT).reason).toBe('应用尚未上架')
    const disabled = buildCatalogEntry(makeReview({ status: 'suspended' }), PRESENTATION)!
    expect(evaluateEntryUsability(disabled, CONTEXT).reason).toBe('应用已停用')
  })

  it('平台不支持 / 宿主版本不足 / 渠道禁用 → 各有可读原因', () => {
    const entry = active()
    expect(evaluateEntryUsability(entry, { hostVersion: '1.4.13', platform: 'ios' }).reason).toContain('ios')
    expect(evaluateEntryUsability(entry, { hostVersion: '1.3.9', platform: 'windows' }).reason).toContain('1.4.0')
    const storeDisabled = buildCatalogEntry(
      makeReview({ status: 'active', compat: { min_host: '1.4.0', platforms: ['windows'], store_policy: 'disabled' } }),
      PRESENTATION,
    )!
    expect(evaluateEntryUsability(storeDisabled, CONTEXT).reason).toContain('渠道')
  })

  it('remote 缺发布公钥/序号 → 一律不可用（模块未签名）', () => {
    const entry = active()
    entry.kind = 'remote'
    expect(evaluateEntryUsability(entry, CONTEXT).reason).toContain('模块未签名')
    entry.module = {
      manifest_url: '',
      artifact_url: '',
      publisher_key_id: '',
      release_seq: 0,
    }
    expect(evaluateEntryUsability(entry, CONTEXT).usable).toBe(false)
  })

  it('embedded 缺入口 → 不可用', () => {
    const entry = active()
    delete entry.entry
    expect(evaluateEntryUsability(entry, CONTEXT).reason).toContain('entry')
  })
})

describe('T12 目录合并与版本比较', () => {
  it('按 app_id upsert：覆盖同 id，不追加', () => {
    const first = buildCatalogEntry(makeReview({ status: 'active' }), PRESENTATION)!
    const updated = buildCatalogEntry(
      makeReview({ status: 'active', version: 2 }),
      { ...PRESENTATION, summary: '改过的说明' },
    )!
    const merged = upsertCatalogEntries([first, { ...first, app_id: 'other-app' }], [updated])
    expect(merged).toHaveLength(2)
    expect(merged.find((e) => e.app_id === 'demo-app')?.summary).toBe('改过的说明')
    expect(merged.find((e) => e.app_id === 'demo-app')?.review_version).toContain('@v2')
  })

  it('版本比较：数字段逐位比较，缺位按 0', () => {
    expect(compareVersions('1.4.13', '1.4.0')).toBe(1)
    expect(compareVersions('1.4', '1.4.0')).toBe(0)
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
  })
})
