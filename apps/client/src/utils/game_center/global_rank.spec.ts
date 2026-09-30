/**
 * #909 总排行榜（`board=global_xp`）单测（Worker C）。
 *
 * 与 points.spec.ts 的分工：本文件专注**总榜**的两条硬要求：
 * 1. 默认直接请求 `board=global_xp`，**不要求用户先选游戏**（URL 不得出现 game_id）；
 * 2. 「我」的语义：`me` 未进 top-N 也要有正确 rank；列表内我的行必须高亮（isSelf 由
 *    `player_ref` 比对推导）；未登录时 `me=null` 是正常形态而不是错误。
 *
 * 以及 PII 白名单：只允许 rank / player_ref / display_name / xp_total / level
 * 进入展示模型（student_id / sub / user_id 一律不得出现）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../identity_access_token', () => ({
  getIdentityAccessToken: vi.fn()
}))

import { getIdentityAccessToken } from '../identity_access_token'
import { UNKNOWN_PLAYER_NAME, containsForbiddenLeaderboardKey } from './leaderboard'
import {
  GLOBAL_RANK_DEFAULT_LIMIT,
  GLOBAL_XP_BOARD,
  fetchGlobalXpLeaderboard,
  mergeGlobalRankRows,
  normalizeGlobalXpBoard
} from './points'

const tokenMock = vi.mocked(getIdentityAccessToken)
const fetchMock = vi.fn()

const jsonResponse = (payload: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  }) as unknown as Response

const HTTPS_BASE = 'https://game-platform.spec.invalid/api/game-platform/v1'

/** 模拟契约 §2.3 响应（含服务端多返回的 PII，用于白名单负向断言） */
const boardPayload = {
  ok: true,
  board: 'global_xp',
  season_id: null,
  items: [
    {
      rank: 1,
      player_ref: 'ref-top-1',
      display_name: '第一名',
      xp_total: 900,
      level: 9,
      student_id: '2023000001',
      sub: 'identity-sub-top'
    },
    {
      rank: 2,
      player_ref: 'ref-me',
      display_name: '我',
      xp_total: 320,
      level: 4,
      student_id: '2023001234'
    }
  ],
  me: {
    rank: 2,
    player_ref: 'ref-me',
    display_name: '我',
    xp_total: 320,
    level: 4
  },
  next_cursor: 'cursor-next',
  rule_version: 'xp-v1',
  generated_at: '2026-09-30T08:00:00Z'
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  tokenMock.mockReset()
  tokenMock.mockResolvedValue('test-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('总榜请求形状（不要求先选游戏）', () => {
  it('默认直接请求 board=global_xp，URL 不含 game_id / 不带用户输入', async () => {
    fetchMock.mockResolvedValue(jsonResponse(boardPayload))
    await fetchGlobalXpLeaderboard({ apiBase: HTTPS_BASE })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe(`${HTTPS_BASE}/leaderboards?board=${GLOBAL_XP_BOARD}&limit=${GLOBAL_RANK_DEFAULT_LIMIT}`)
    expect(url).not.toContain('game_id')
  })

  it('未登录也能看榜：不带 Authorization 头，不抛 authMissing', async () => {
    tokenMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue(jsonResponse({ ...boardPayload, me: null }))
    const board = await fetchGlobalXpLeaderboard({ apiBase: HTTPS_BASE })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(board.items).toHaveLength(2)
    expect(board.me).toBeNull()
  })

  it('带凭据时为「我」取排名（Authorization 只在请求头）', async () => {
    fetchMock.mockResolvedValue(jsonResponse(boardPayload))
    await fetchGlobalXpLeaderboard({ apiBase: HTTPS_BASE })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-token')
    expect(url).not.toContain('test-token')
  })

  it('cursor 透传（服务端不透明游标原样回传）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...boardPayload, next_cursor: null }))
    await fetchGlobalXpLeaderboard({ apiBase: HTTPS_BASE, cursor: 'cursor-next', limit: 20 })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('limit=20')
    expect(url).toContain('cursor=cursor-next')
  })
})

describe('总榜归一化（白名单 / PII / 我）', () => {
  it('保留契约字段并丢弃 PII', () => {
    const board = normalizeGlobalXpBoard(boardPayload)
    expect(board.board).toBe(GLOBAL_XP_BOARD)
    expect(board.items[0]).toEqual({
      rank: 1,
      playerRef: 'ref-top-1',
      displayName: '第一名',
      xpTotal: 900,
      level: 9,
      isSelf: false
    })
    expect(containsForbiddenLeaderboardKey(board)).toBe(false)
    const serialized = JSON.stringify(board)
    expect(serialized).not.toContain('2023000001')
    expect(serialized).not.toContain('identity-sub-top')
    expect(serialized).not.toContain('student_id')
    expect(serialized).not.toContain('sub')
    expect(board.nextCursor).toBe('cursor-next')
    expect(board.ruleVersion).toBe('xp-v1')
    expect(board.generatedAt).toBe('2026-09-30T08:00:00Z')
  })

  it('「我」的列表行由 player_ref 比对高亮；me 与 items 是同一引用语义', () => {
    const board = normalizeGlobalXpBoard(boardPayload)
    const mine = board.items.find((row) => row.isSelf)
    expect(mine?.playerRef).toBe('ref-me')
    expect(mine?.rank).toBe(2)
    expect(board.me?.playerRef).toBe('ref-me')
    expect(board.me?.isSelf).toBe(true)
    expect(board.items.filter((row) => row.isSelf)).toHaveLength(1)
  })

  it('未进 top-N：me 仍有真实 rank，且列表内无人被标记为我', () => {
    const board = normalizeGlobalXpBoard({
      ...boardPayload,
      me: { rank: 128, player_ref: 'ref-not-in-top', display_name: '我', xp_total: 120, level: 2 }
    })
    expect(board.me?.rank).toBe(128)
    expect(board.me?.isSelf).toBe(true)
    expect(board.items.every((row) => !row.isSelf)).toBe(true)
  })

  it('未上榜（rank=0）与 me=null 都不抛错', () => {
    const notRanked = normalizeGlobalXpBoard({
      ...boardPayload,
      me: { rank: 0, player_ref: '', display_name: '', xp_total: 0, level: 1 }
    })
    expect(notRanked.me?.rank).toBe(0)
    expect(notRanked.me?.displayName).toBe(UNKNOWN_PLAYER_NAME)
    expect(normalizeGlobalXpBoard({ ...boardPayload, me: null }).me).toBeNull()
  })

  it('昵称缺失回落脱敏占位（绝不用学号兜底）', () => {
    const board = normalizeGlobalXpBoard({
      ...boardPayload,
      items: [{ rank: 1, player_ref: 'ref-x', display_name: '', xp_total: 10, level: 1 }],
      me: null
    })
    expect(board.items[0].displayName).toBe(UNKNOWN_PLAYER_NAME)
    expect(board.items[0].displayName).not.toContain('2023')
  })

  it('非法 / 非数组输入不抛错，返回空榜', () => {
    const empty = normalizeGlobalXpBoard(null)
    expect(empty.items).toEqual([])
    expect(empty.me).toBeNull()
    expect(empty.board).toBe(GLOBAL_XP_BOARD)
    expect(normalizeGlobalXpBoard({ items: [null, 'x', 3] }).items).toEqual([])
  })

  it('负数 / 非法数值一律钳制：列表行用行号兜底，XP / level 不为负', () => {
    const board = normalizeGlobalXpBoard({
      ...boardPayload,
      items: [{ rank: -1, player_ref: 'r', display_name: 'x', xp_total: -5, level: -2 }],
      me: { rank: -3, player_ref: 'r', display_name: 'x', xp_total: -1, level: -1 }
    })
    // 服务端 rank 非法时，列表行回落稳定行号（契约：唯一 rank = 行号）
    expect(board.items[0]).toMatchObject({ rank: 1, xpTotal: 0, level: 0 })
    // 我的 rank 非法时回落 0（UI 显示「暂未上榜」而不是假名次）
    expect(board.me?.rank).toBe(0)
    expect(board.me?.xpTotal).toBe(0)
  })
})

describe('总榜追加页合并（翻页不重）', () => {
  const row = (rank: number, ref: string) => ({
    rank,
    playerRef: ref,
    displayName: ref,
    xpTotal: 100 - rank,
    level: 1,
    isSelf: false
  })

  it('以 player_ref 去重（重复游标不产生重复行）', () => {
    const first = [row(1, 'a'), row(2, 'b')]
    const second = [row(2, 'b'), row(3, 'c')]
    expect(mergeGlobalRankRows(first, second).map((item) => item.playerRef)).toEqual(['a', 'b', 'c'])
  })

  it('缺 player_ref 的行以 rank 兜底去重（不因空 ref 丢行）', () => {
    const merged = mergeGlobalRankRows([row(1, '')], [row(1, ''), row(2, 'x')])
    expect(merged).toHaveLength(2)
  })

  it('保持服务端顺序（rank 升序），不重排', () => {
    const merged = mergeGlobalRankRows([row(1, 'a'), row(2, 'b')], [row(3, 'c')])
    expect(merged.map((item) => item.rank)).toEqual([1, 2, 3])
  })
})
