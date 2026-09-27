/**
 * #911 P1-⑤ 残留：旧版游戏落盘的「跨环境排行榜 API base」清理契约测试。
 *
 * 要守住的语义：
 * 1. 只删 base，**不删身份**（学号/昵称/班级等仍供本地展示）；
 * 2. 环境判定复用 `statistics_environment` 唯一权威（不新增第二份域名清单）：
 *    本环境域 → 保留；另一端环境的域 → 清理（正向与反向都要成立）；
 *    自定义域 / loopback → 两边都放行（不得误删）；
 * 3. 幂等：清理后再跑一遍零写入；
 * 4. 失败不阻塞启动：单条写回异常必须被吞掉且不影响其它条目。
 */
import { describe, expect, it } from 'vitest'
import {
  isLegacyRankContextKey,
  migrateLegacyGameRankContexts,
  sanitizeLegacyRankContextRaw,
  type LegacyRankContextStorage
} from './game_center/legacy_rank_context_migration'
import { STATISTICS_SERVICE_BASE_URL, isStatisticsServiceUrlCompatible } from './statistics_environment'

/** node 环境没有 localStorage → 造一个可观测写入的假存储 */
const createFakeStorage = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries))
  const writes: string[] = []
  let failKey: string | null = null
  return {
    get writeCount() {
      return writes.length
    },
    get writes() {
      return [...writes]
    },
    get dump() {
      return Object.fromEntries(map)
    },
    failNextWriteTo(key: string) {
      failKey = key
    },
    storage: {
      get length() {
        return map.size
      },
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        if (failKey === key) {
          failKey = null
          throw new Error('quota exceeded')
        }
        map.set(key, value)
        writes.push(key)
      }
    } as LegacyRankContextStorage
  }
}

/** 另一端环境的服务域（当前构建下应被判为**不兼容**） */
const foreignBase = () => {
  const candidates = [
    'https://mini-hbut-testocr1.hf.space/api/game-rank',
    'https://mini-hbut-ocr-service.hf.space/api/game-rank'
  ]
  const found = candidates.find((candidate) => !isStatisticsServiceUrlCompatible(candidate))
  if (!found) throw new Error('两个候选域都被判为环境兼容，测试前提不成立')
  return found
}

/** 本环境的服务域（当前构建下应被判为**兼容**） */
const ownBase = () => `${STATISTICS_SERVICE_BASE_URL}/api/game-rank`

const contextOf = (raw: string): Record<string, unknown> => JSON.parse(raw) as Record<string, unknown>

describe('键识别', () => {
  it('只认 <gameId>_rank_context_v1', () => {
    expect(isLegacyRankContextKey('hbut_2048_rank_context_v1')).toBe(true)
    expect(isLegacyRankContextKey('jump_out_hbut_rank_context_v1')).toBe(true)
    // 只有后缀（缺 gameId）不算
    expect(isLegacyRankContextKey('_rank_context_v1')).toBe(false)
    expect(isLegacyRankContextKey('hbu_notify_class')).toBe(false)
    expect(isLegacyRankContextKey(null)).toBe(false)
  })
})

describe('单条清理（sanitizeLegacyRankContextRaw）', () => {
  it('跨环境 base → 删 base、保身份', () => {
    const raw = JSON.stringify({
      gameId: 'hbut_2048',
      studentId: '20240111',
      playerName: '叠塔',
      className: '机械2401',
      schoolName: '湖北工业大学',
      rankApiBase: foreignBase()
    })
    const next = sanitizeLegacyRankContextRaw(raw)
    expect(next).not.toBeNull()
    const parsed = contextOf(next as string)
    expect(parsed).not.toHaveProperty('rankApiBase')
    expect(parsed.studentId).toBe('20240111')
    expect(parsed.playerName).toBe('叠塔')
    expect(parsed.className).toBe('机械2401')
    expect(parsed.schoolName).toBe('湖北工业大学')
    expect(parsed.gameId).toBe('hbut_2048')
  })

  it('历史 snake_case 写法同样清理', () => {
    const next = sanitizeLegacyRankContextRaw(
      JSON.stringify({ student_id: '20240111', rank_api: foreignBase() })
    )
    expect(next).not.toBeNull()
    const parsed = contextOf(next as string)
    expect(parsed).not.toHaveProperty('rank_api')
    expect(parsed.student_id).toBe('20240111')
  })

  it('两个 base 字段各自独立判定：跨环境值被删、合法值保留（无论哪个在前）', () => {
    // camel 合法 + snake 跨环境 → 只删 snake（不得因为"取到合法值"而全留）
    const nextA = sanitizeLegacyRankContextRaw(
      JSON.stringify({ studentId: 's1', rankApiBase: ownBase(), rank_api: foreignBase() })
    )
    expect(nextA).not.toBeNull()
    const parsedA = contextOf(nextA as string)
    expect(parsedA.rankApiBase).toBe(ownBase())
    expect(parsedA).not.toHaveProperty('rank_api')

    // camel 跨环境 + snake 合法 → 只删 camel（不得连带删除合法的 snake 值）
    const nextB = sanitizeLegacyRankContextRaw(
      JSON.stringify({ studentId: 's1', rankApiBase: foreignBase(), rank_api: ownBase() })
    )
    expect(nextB).not.toBeNull()
    const parsedB = contextOf(nextB as string)
    expect(parsedB).not.toHaveProperty('rankApiBase')
    expect(parsedB.rank_api).toBe(ownBase())
  })

  it('两个字段都合法 → 无需改动', () => {
    expect(
      sanitizeLegacyRankContextRaw(JSON.stringify({ rankApiBase: ownBase(), rank_api: ownBase() }))
    ).toBeNull()
  })

  it('本环境 base → 无需改动', () => {
    expect(sanitizeLegacyRankContextRaw(JSON.stringify({ rankApiBase: ownBase() }))).toBeNull()
  })

  it('自定义域 / loopback → 两边都放行，不得误删', () => {
    for (const base of ['https://games.example.com/api/game-rank', 'http://127.0.0.1:8000/api/game-rank']) {
      expect(sanitizeLegacyRankContextRaw(JSON.stringify({ rankApiBase: base })), base).toBeNull()
    }
  })

  it('空 base 视为无效字段并清理（SDK 已 fail closed，落盘值属死重量）', () => {
    const next = sanitizeLegacyRankContextRaw(JSON.stringify({ studentId: '20240111', rankApiBase: '   ' }))
    expect(next).not.toBeNull()
    expect(contextOf(next as string)).not.toHaveProperty('rankApiBase')
  })

  it('无 base 字段 / 非对象 / 坏 JSON → 一律不动', () => {
    expect(sanitizeLegacyRankContextRaw(JSON.stringify({ studentId: '20240111' }))).toBeNull()
    expect(sanitizeLegacyRankContextRaw('[1,2]')).toBeNull()
    expect(sanitizeLegacyRankContextRaw('not json')).toBeNull()
    expect(sanitizeLegacyRankContextRaw('')).toBeNull()
    expect(sanitizeLegacyRankContextRaw(null)).toBeNull()
  })
})

describe('批量清理（migrateLegacyGameRankContexts）', () => {
  it('只改被污染的那条；身份保留、无关键零触碰', () => {
    const fake = createFakeStorage({
      hbut_2048_rank_context_v1: JSON.stringify({ studentId: '20240111', rankApiBase: foreignBase() }),
      hbut_miner_rank_context_v1: JSON.stringify({ studentId: '20240111', rankApiBase: ownBase() }),
      hbu_notify_class: 'true',
      hbu_2048_other_key: 'keep-me'
    })
    migrateLegacyGameRankContexts(fake.storage)
    expect(fake.writes).toEqual(['hbut_2048_rank_context_v1'])
    expect(fake.dump.hbut_2048_rank_context_v1).not.toContain(foreignBase())
    expect(JSON.parse(fake.dump.hbut_2048_rank_context_v1).studentId).toBe('20240111')
    // 本环境 base 与无关键必须逐字未动
    expect(JSON.parse(fake.dump.hbut_miner_rank_context_v1).rankApiBase).toBe(ownBase())
    expect(fake.dump.hbu_notify_class).toBe('true')
    expect(fake.dump.hbu_2048_other_key).toBe('keep-me')
  })

  it('幂等：第二次执行零写入', () => {
    const fake = createFakeStorage({
      hbut_2048_rank_context_v1: JSON.stringify({ studentId: '20240111', rankApiBase: foreignBase() })
    })
    migrateLegacyGameRankContexts(fake.storage)
    const afterFirst = fake.dump.hbut_2048_rank_context_v1
    expect(fake.writeCount).toBe(1)
    migrateLegacyGameRankContexts(fake.storage)
    expect(fake.writeCount).toBe(1)
    expect(fake.dump.hbut_2048_rank_context_v1).toBe(afterFirst)
  })

  it('单条写回失败被吞掉，不影响其它条目，且不抛出', () => {
    const fake = createFakeStorage({
      hbut_2048_rank_context_v1: JSON.stringify({ rankApiBase: foreignBase() }),
      hbut_miner_rank_context_v1: JSON.stringify({ rankApiBase: foreignBase() })
    })
    fake.failNextWriteTo('hbut_2048_rank_context_v1')
    expect(() => migrateLegacyGameRankContexts(fake.storage)).not.toThrow()
    // 失败那条保持原样（下次启动重试），另一条已被清理
    expect(fake.dump.hbut_2048_rank_context_v1).toContain(foreignBase())
    expect(fake.dump.hbut_miner_rank_context_v1).not.toContain(foreignBase())
  })

  it('无可用存储时不抛出（node / 隐私模式）', () => {
    expect(() => migrateLegacyGameRankContexts(null)).not.toThrow()
    expect(() => migrateLegacyGameRankContexts(undefined)).not.toThrow()
  })
})
