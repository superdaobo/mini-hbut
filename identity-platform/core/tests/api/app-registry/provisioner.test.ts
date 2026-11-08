/**
 * T12 provisioner 写入器（provisioner.ts）编排与回执测试。
 *
 * 全部使用假适配器 / 假仓库 / 假快照读取器——不连数据库、不访问网络。
 * 覆盖：
 * - 全 create 路径：四个适配器按 ①Casdoor → ②策略 → ③目录 → ④模块 各调用一次；
 * - 幂等重跑：现状与记录一致 → 四个适配器零调用，回执不新增失败；
 * - 安全阀（plan.stop / exitCode 2）：四个适配器零调用 + 退出码语义；
 * - 中间失败（目录写入失败）：前序产物保留成功回执、后续仍按序尝试、结论"未全部成功"；
 * - 适配器抛异常：包成失败回执，不冒泡、不打断后续产物；
 * - 前置失败：记录不存在 / 状态不可 provision / 快照读取失败。
 */

import { describe, expect, it } from 'vitest'

import {
  ProvisionerError,
  runProvisioning,
  type ActualStateReader,
  type ProvisionAdapters,
  type ReviewStore,
  type WriteOutcome,
} from '../../../src/api/app-registry/provisioner.js'
import { AppRegistryError, buildCatalogEntry } from '../../../src/domain/app-registry/index.js'
import type { ActualState } from '../../../src/domain/app-registry/provisioning.js'
import type { ArtifactReceipts, ReviewRecord } from '../../../src/domain/app-registry/types.js'
import { baseReviewInput, emptyActual, makeReview, PRESENTATION } from '../../domain/app-registry/fixtures.js'

const REVIEW_ID = '01920000-0000-7000-8000-000000000001'
const NOW = '2026-11-08T12:00:00Z'
const DOMAINS = ['cloud_sync', 'forum', 'grades', 'schedule', 'game']

const MODULE = {
  manifest_url: 'https://cdn.example/manifest.json',
  artifact_url: 'https://cdn.example/artifact.zip',
  publisher_key_id: 'pub-key-1',
  release_seq: 4,
}

/** remote 条目的展示元数据（module 产物登记需要 kind=remote 才语义一致）。 */
const REMOTE_PRESENTATION = { ...PRESENTATION, kind: 'remote' as const }

/** 已批准的 remote 审核记录（module 齐全 → 四步全部是写操作）。 */
function approvedRemote(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return makeReview({ status: 'approved', module: { ...MODULE }, ...overrides })
}

/** 已 provisioned 且回执全部 ok 的 remote 记录（幂等重跑场景）。 */
function provisionedRemote(): ReviewRecord {
  return approvedRemote({
    status: 'provisioned',
    artifact_receipts: {
      casdoor: { at: NOW, result: 'ok' },
      policy: { at: NOW, result: 'ok' },
      catalog: { at: NOW, result: 'ok' },
      module: { at: NOW, result: 'ok' },
    },
  })
}

/** 与记录完全一致的全量现状（四份产物逐一匹配）。 */
function inSyncActual(review: ReviewRecord): ActualState {
  const desiredCatalog = buildCatalogEntry(review, REMOTE_PRESENTATION)
  return {
    casdoor: { ...review.casdoor, token_fields: [...review.casdoor.token_fields] },
    policy: review.data_domains.flatMap((d) => d.operations.map((operation) => ({ domain: d.domain, operation }))),
    catalog: desiredCatalog ? { ...desiredCatalog } : null,
    module: review.module
      ? { publisher_key_id: review.module.publisher_key_id, release_seq: review.module.release_seq }
      : null,
  }
}

interface FakeStore extends ReviewStore {
  receiptsWrites: number
  statusWrites: number
  lastReceipts: ArtifactReceipts | null
}

/** 假仓库层（find / saveReceipts / updateStatus 全内存实现）。 */
function makeStore(seed: ReviewRecord | null): FakeStore {
  const store: FakeStore = {
    receiptsWrites: 0,
    statusWrites: 0,
    lastReceipts: null,
    find: async (id) => (seed && seed.review_id === id ? seed : null),
    saveReceipts: async (id, receipts) => {
      store.receiptsWrites += 1
      store.lastReceipts = receipts
      return Boolean(seed && seed.review_id === id)
    },
    updateStatus: async () => {
      store.statusWrites += 1
      return true
    },
  }
  return store
}

type AdapterName = 'casdoor' | 'policy' | 'catalog' | 'module'

interface FakeAdapters {
  adapters: ProvisionAdapters
  /** 按调用顺序记录的适配器名（断言 ①→②→③→④ 用）。 */
  calls: AdapterName[]
}

/** 假适配器工厂：默认成功；可对指定产物注入失败原因或抛异常。 */
function makeAdapters(behavior: {
  fail?: Partial<Record<AdapterName, string>>
  throw?: Partial<Record<AdapterName, unknown>>
} = {}): FakeAdapters {
  const calls: AdapterName[] = []
  const call = (name: AdapterName): WriteOutcome => {
    calls.push(name)
    const thrown = behavior.throw?.[name]
    if (thrown !== undefined) throw thrown
    const fail = behavior.fail?.[name]
    return fail !== undefined ? { ok: false, error: fail } : { ok: true }
  }
  return {
    calls,
    adapters: {
      casdoor: { writeAppConfig: async () => call('casdoor') },
      policy: { writePolicies: async () => call('policy') },
      catalog: { publishEntry: async () => call('catalog') },
      module: { registerArtifact: async () => call('module') },
    },
  }
}

/** 假快照读取器（failWith 用于模拟读取器自身失败）。 */
function actualReader(actual: ActualState, failWith?: unknown): ActualStateReader {
  return {
    read: async () => {
      if (failWith !== undefined) throw failWith
      return actual
    },
  }
}

describe('T12 provisioner 写入器：全 create 路径', () => {
  it('四个适配器按 ①Casdoor → ②策略 → ③目录 → ④模块 各调用一次，全部成功 → 建议 provisioned', async () => {
    const review = approvedRemote()
    const { adapters, calls } = makeAdapters()
    const store = makeStore(review)

    const result = await runProvisioning(REVIEW_ID, {
      store,
      snapshot: actualReader(emptyActual()),
      adapters,
      presentation: REMOTE_PRESENTATION,
      allowedDomains: DOMAINS,
      now: () => NOW,
    })

    expect(calls).toEqual(['casdoor', 'policy', 'catalog', 'module'])
    expect(result.stopped).toBe(false)
    expect(result.exitCode).toBe(0)
    expect(result.allSucceeded).toBe(true)
    expect(result.suggestedStatus).toBe('provisioned')
    expect(result.receiptsSaved).toBe(true)
    expect(result.failures).toHaveLength(0)
    expect(result.receipts.casdoor?.result).toBe('ok')
    expect(result.receipts.policy?.result).toBe('ok')
    expect(result.receipts.catalog?.result).toBe('ok')
    expect(result.receipts.module?.result).toBe('ok')
    // 回执确实写回了仓库层
    expect(store.receiptsWrites).toBe(1)
    expect(store.lastReceipts).toEqual(result.receipts)
    // 本模块不写状态（suggestedStatus 由调用方决定是否落库）
    expect(store.statusWrites).toBe(0)
  })
})

describe('T12 provisioner 写入器：幂等重跑', () => {
  it('现状与记录一致 → 四个适配器零调用，回执不新增失败', async () => {
    const review = provisionedRemote()
    const { adapters, calls } = makeAdapters()
    const store = makeStore(review)

    const result = await runProvisioning(REVIEW_ID, {
      store,
      snapshot: actualReader(inSyncActual(review)),
      adapters,
      presentation: REMOTE_PRESENTATION,
      allowedDomains: DOMAINS,
      now: () => NOW,
    })

    expect(calls).toEqual([])
    expect(result.allSucceeded).toBe(true)
    expect(result.suggestedStatus).toBe('provisioned')
    expect(result.failures).toHaveLength(0)
    for (const kind of ['casdoor', 'policy', 'catalog', 'module'] as const) {
      expect(result.receipts[kind]?.result).toBe('ok')
    }
  })
})

describe('T12 provisioner 写入器：安全阀', () => {
  it('plan.stop（缺 client_id）→ 四个适配器零调用 + 退出码 2 语义', async () => {
    const review = approvedRemote({
      casdoor: { ...baseReviewInput().casdoor, client_id: '' },
    })
    const { adapters, calls } = makeAdapters()
    const store = makeStore(review)

    const result = await runProvisioning(REVIEW_ID, {
      store,
      snapshot: actualReader(emptyActual()),
      adapters,
      presentation: REMOTE_PRESENTATION,
      allowedDomains: DOMAINS,
      now: () => NOW,
    })

    expect(calls).toEqual([])
    expect(result.stopped).toBe(true)
    expect(result.exitCode).toBe(2)
    expect(result.stopReason).toContain('client_id')
    expect(result.allSucceeded).toBe(false)
    expect(result.suggestedStatus).toBe('approved')
    expect(result.receiptsSaved).toBe(false)
    expect(result.receipts).toEqual({})
    expect(store.receiptsWrites).toBe(0)
  })
})

describe('T12 provisioner 写入器：部分失败', () => {
  it('目录写入失败 → 前序产物保留成功回执、模块仍按序尝试、结论"未全部成功"', async () => {
    const review = approvedRemote()
    const { adapters, calls } = makeAdapters({ fail: { catalog: '目录服务 504 超时' } })
    const store = makeStore(review)

    const result = await runProvisioning(REVIEW_ID, {
      store,
      snapshot: actualReader(emptyActual()),
      adapters,
      presentation: REMOTE_PRESENTATION,
      allowedDomains: DOMAINS,
      now: () => NOW,
    })

    // 失败不中断：目录失败后模块仍被调用，顺序不变
    expect(calls).toEqual(['casdoor', 'policy', 'catalog', 'module'])
    // 前序产物不回滚
    expect(result.receipts.casdoor?.result).toBe('ok')
    expect(result.receipts.policy?.result).toBe('ok')
    expect(result.receipts.catalog).toMatchObject({ result: 'failed', detail: '目录服务 504 超时' })
    expect(result.receipts.module?.result).toBe('ok')
    expect(result.failures).toEqual([{ artifact: 'catalog', error: '目录服务 504 超时' }])
    expect(result.allSucceeded).toBe(false)
    expect(result.suggestedStatus).toBe('approved')
    // 回执（含失败）已写回仓库
    expect(result.receiptsSaved).toBe(true)
    expect(store.lastReceipts).toEqual(result.receipts)
  })
})

describe('T12 provisioner 写入器：适配器异常', () => {
  it('适配器抛异常 → 包成失败回执，不冒泡、不打断后续产物', async () => {
    const review = approvedRemote()
    const { adapters, calls } = makeAdapters({
      throw: { casdoor: new Error('connection refused (ECONNREFUSED)') },
    })
    const store = makeStore(review)

    // 不得抛异常
    const result = await runProvisioning(REVIEW_ID, {
      store,
      snapshot: actualReader(emptyActual()),
      adapters,
      presentation: REMOTE_PRESENTATION,
      allowedDomains: DOMAINS,
      now: () => NOW,
    })

    expect(result.receipts.casdoor).toMatchObject({ result: 'failed' })
    expect(result.receipts.casdoor?.detail).toContain('connection refused')
    // 其余三个仍按序被调用
    expect(calls).toEqual(['casdoor', 'policy', 'catalog', 'module'])
    expect(result.receipts.policy?.result).toBe('ok')
    expect(result.receipts.catalog?.result).toBe('ok')
    expect(result.receipts.module?.result).toBe('ok')
    expect(result.allSucceeded).toBe(false)
    expect(result.suggestedStatus).toBe('approved')
  })
})

describe('T12 provisioner 写入器：前置失败', () => {
  it('记录不存在 → ProvisionerError(REVIEW_NOT_FOUND)', async () => {
    const { adapters } = makeAdapters()
    await expect(
      runProvisioning('missing-review', {
        store: makeStore(null),
        snapshot: actualReader(emptyActual()),
        adapters,
        presentation: REMOTE_PRESENTATION,
        allowedDomains: DOMAINS,
      }),
    ).rejects.toMatchObject({ name: 'ProvisionerError', code: 'REVIEW_NOT_FOUND' })
  })

  it('记录状态不可 provision（submitted）→ 领域 AppRegistryError 原样冒泡', async () => {
    const review = makeReview({ status: 'submitted' })
    const { adapters } = makeAdapters()
    await expect(
      runProvisioning(REVIEW_ID, {
        store: makeStore(review),
        snapshot: actualReader(emptyActual()),
        adapters,
        presentation: REMOTE_PRESENTATION,
        allowedDomains: DOMAINS,
      }),
    ).rejects.toThrow(AppRegistryError)
  })

  it('快照读取器失败 → ProvisionerError(SNAPSHOT_FAILED)，不写任何产物', async () => {
    const review = approvedRemote()
    const { adapters, calls } = makeAdapters()
    const store = makeStore(review)
    await expect(
      runProvisioning(REVIEW_ID, {
        store,
        snapshot: actualReader(emptyActual(), new Error('casdoor API 500')),
        adapters,
        presentation: REMOTE_PRESENTATION,
        allowedDomains: DOMAINS,
      }),
    ).rejects.toMatchObject({ name: 'ProvisionerError', code: 'SNAPSHOT_FAILED' })
    expect(calls).toEqual([])
    expect(store.receiptsWrites).toBe(0)
  })
})
