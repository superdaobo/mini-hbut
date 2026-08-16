/**
 * Notification Event Ledger（#614）单测
 *
 * 覆盖：schema 版本降级、容量上限、TTL 清理、同 key 幂等、账号隔离、
 * 跨端 GradeSignatureV1 复刻（contract-fixtures 7 case 逐位一致）、字段映射。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEDGER_ENTRY_TTL_MS,
  LEDGER_MAX_ENTRIES,
  LEDGER_SCHEMA_VERSION,
  buildCrossEndGradeSignature,
  buildLedgerEventKey,
  clearLedgerState,
  hasLedgerEntry,
  ledgerStorageKeyFor,
  pruneLedgerState,
  readLedgerState,
  recordLedgerEntry
} from './notification_event_ledger'

const installStorage = () => {
  const storage = new Map<string, string>()
  const api = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size
    }
  }
  vi.stubGlobal('localStorage', api)
  return storage
}

beforeEach(() => {
  installStorage()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ISO_2026 = '2026-08-13T08:00:00.000Z'

describe('Ledger 存取与去重', () => {
  it('record 后可查询，同 eventKey 幂等不重复入账', () => {
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(false)
    const added = recordLedgerEntry('s1', 'grades:S2', 'grades', ISO_2026)
    expect(added).toBe(true)
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(true)
    // 幂等：再次记录只刷新时间，不新增条目
    const again = recordLedgerEntry('s1', 'grades:S2', 'grades', '2026-08-14T08:00:00.000Z')
    expect(again).toBe(false)
    const state = readLedgerState('s1')
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0].notifiedAt).toBe('2026-08-14T08:00:00.000Z')
    expect(state.scope).toBe('s1')
    expect(state.schema).toBe(LEDGER_SCHEMA_VERSION)
  })

  it('空 eventKey / 空 studentId 不写入', () => {
    expect(recordLedgerEntry('', 'grades:S2', 'grades')).toBe(false)
    expect(recordLedgerEntry('s1', '', 'grades')).toBe(false)
    expect(recordLedgerEntry('s1', '  ', 'grades')).toBe(false)
  })

  it('账号隔离：不同 studentId 账本互不串数据', () => {
    recordLedgerEntry('account-a', 'grades:S2', 'grades', ISO_2026)
    recordLedgerEntry('account-b', 'grades:S3', 'grades', ISO_2026)
    expect(hasLedgerEntry('account-a', 'grades:S2')).toBe(true)
    expect(hasLedgerEntry('account-a', 'grades:S3')).toBe(false)
    expect(hasLedgerEntry('account-b', 'grades:S3')).toBe(true)
    expect(hasLedgerEntry('account-b', 'grades:S2')).toBe(false)
    // 存储 key 按账号分 scope
    expect(ledgerStorageKeyFor('account-a')).not.toBe(ledgerStorageKeyFor('account-b'))
  })

  it('clearLedgerState 清空该账号账本', () => {
    recordLedgerEntry('s1', 'grades:S2', 'grades', ISO_2026)
    clearLedgerState('s1')
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(false)
  })

  it('schema 不兼容时安全降级为空账本（不 crash、不误读旧结构）', () => {
    // 模拟旧版本结构（schema=0）
    localStorage.setItem(ledgerStorageKeyFor('s1'), JSON.stringify({
      schema: 0,
      scope: 's1',
      entries: [{ eventKey: 'grades:S2', domain: 'grades', notifiedAt: ISO_2026 }]
    }))
    const state = readLedgerState('s1')
    expect(state.entries).toHaveLength(0)
    expect(state.schema).toBe(LEDGER_SCHEMA_VERSION)
    // 损坏 JSON 同样安全降级
    localStorage.setItem(ledgerStorageKeyFor('s2'), '{broken json')
    expect(readLedgerState('s2').entries).toHaveLength(0)
  })

  it('容量上限：超出 LEDGER_MAX_ENTRIES 丢弃最旧', () => {
    const now = new Date('2026-08-13T00:00:00.000Z')
    const entries = Array.from({ length: LEDGER_MAX_ENTRIES + 20 }, (_, i) => ({
      eventKey: `grades:S-${i}`,
      domain: 'grades',
      notifiedAt: new Date(now.getTime() + i * 1000).toISOString()
    }))
    const pruned = pruneLedgerState({ schema: LEDGER_SCHEMA_VERSION, scope: 's1', updatedAt: '', entries }, now)
    expect(pruned.entries).toHaveLength(LEDGER_MAX_ENTRIES)
    // 最旧的 20 条被丢弃，最新的保留
    expect(pruned.entries[0].eventKey).toBe('grades:S-20')
    expect(pruned.entries[pruned.entries.length - 1].eventKey).toBe(`grades:S-${LEDGER_MAX_ENTRIES + 19}`)
  })

  it('TTL 清理：超过 LEDGER_ENTRY_TTL_MS 的旧条目被剔除', () => {
    const now = new Date('2026-08-13T00:00:00.000Z')
    const stale = new Date(now.getTime() - LEDGER_ENTRY_TTL_MS - 1000).toISOString()
    const fresh = new Date(now.getTime() - 60000).toISOString()
    const pruned = pruneLedgerState({
      schema: LEDGER_SCHEMA_VERSION,
      scope: 's1',
      updatedAt: '',
      entries: [
        { eventKey: 'grades:stale', domain: 'grades', notifiedAt: stale },
        { eventKey: 'grades:fresh', domain: 'grades', notifiedAt: fresh }
      ]
    }, now)
    expect(pruned.entries.map((entry) => entry.eventKey)).toEqual(['grades:fresh'])
  })

  it('清理兜底：重复 eventKey 只保留最新一条', () => {
    const pruned = pruneLedgerState({
      schema: LEDGER_SCHEMA_VERSION,
      scope: 's1',
      updatedAt: '',
      entries: [
        { eventKey: 'grades:S2', domain: 'grades', notifiedAt: '2026-08-10T00:00:00.000Z' },
        { eventKey: 'grades:S2', domain: 'grades', notifiedAt: '2026-08-12T00:00:00.000Z' }
      ]
    }, new Date('2026-08-13T00:00:00.000Z'))
    expect(pruned.entries).toHaveLength(1)
    expect(pruned.entries[0].notifiedAt).toBe('2026-08-12T00:00:00.000Z')
  })

  it('buildLedgerEventKey 组合 domain 与 signature；空 signature 返回空串', () => {
    expect(buildLedgerEventKey('grades', 'S2')).toBe('grades:S2')
    expect(buildLedgerEventKey('grades', '  ')).toBe('')
    expect(buildLedgerEventKey('exams', 'X1')).toBe('exams:X1')
  })
})

describe('跨端 GradeSignatureV1 复刻（contract-fixtures 单一事实源）', () => {
  const fixturePath = fileURLToPath(
    new URL(
      '../../src-tauri/plugins/tauri-plugin-hbut-background/contract-fixtures/grades-signature-v1.json',
      import.meta.url
    )
  )
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    cases: Array<{ name: string; records: unknown[]; expectedSignature: string }>
  }

  it('fixture 全部 case 逐位一致（算法与 #612/#613 冻结基线对齐）', async () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(7)
    for (const item of fixture.cases) {
      const actual = await buildCrossEndGradeSignature(item.records)
      expect(actual, `case ${item.name} 的 signature 必须与冻结 fixture 逐位一致`).toBe(
        item.expectedSignature
      )
    }
  })

  it('数组顺序变化不改变 signature（不误报）', async () => {
    const records = [
      { courseName: '高等数学A', courseType: '必修', credit: 5, score: 92 },
      { courseName: '大学英语', courseType: '必修', credit: 3, score: 85 }
    ]
    const a = await buildCrossEndGradeSignature(records)
    const b = await buildCrossEndGradeSignature([...records].reverse())
    expect(a).toBe(b)
  })

  it('无关字段（updatedAt 等）不参与签名', async () => {
    const base = [{ courseName: '高数', courseType: '必修', credit: 5, score: 92 }]
    const withExtra = [{ ...base[0], updatedAt: '2026-08-13T00:00:00Z', rawId: 'r1' }]
    expect(await buildCrossEndGradeSignature(withExtra)).toBe(await buildCrossEndGradeSignature(base))
  })

  it('前端 API 字段映射（course_name/final_score/course_credit/course_type）与契约字段同值', async () => {
    const contract = [{ courseName: '高等数学A', courseType: '必修', credit: 5, score: 92 }]
    const apiStyle = [{ course_name: '高等数学A', course_type: '必修', course_credit: 5, final_score: 92 }]
    expect(await buildCrossEndGradeSignature(apiStyle)).toBe(await buildCrossEndGradeSignature(contract))
  })

  it('空列表 / 全空课程名返回空串（无数据语义，与 native 一致）', async () => {
    expect(await buildCrossEndGradeSignature([])).toBe('')
    expect(await buildCrossEndGradeSignature([{ courseName: '  ', score: 92 }])).toBe('')
    expect(await buildCrossEndGradeSignature(null)).toBe('')
  })

  it('数字型成绩：整数 -> 整数字符串，小数 -> 十进制字符串（跨端一致）', async () => {
    const intScore = await buildCrossEndGradeSignature([{ courseName: 'C1', credit: 2, score: 92 }])
    const floatScore = await buildCrossEndGradeSignature([{ courseName: 'C1', credit: 2, score: 92.5 }])
    const stringScore = await buildCrossEndGradeSignature([{ courseName: 'C1', credit: 2, score: '92.5' }])
    expect(floatScore).toBe(stringScore)
    expect(intScore).not.toBe(floatScore)
  })
})
