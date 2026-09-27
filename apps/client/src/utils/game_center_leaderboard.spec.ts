/**
 * #905 排行榜 PII 过滤契约测试（协议 §9.3 硬约束）。
 *
 * 关键断言：**任何情况下**归一化结果里都不得出现 student_id / player_id / user_id / sub，
 * 昵称缺失时必须使用脱敏占位而不是回退成学号。
 */
import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_LEADERBOARD_KEYS,
  UNKNOWN_PLAYER_NAME,
  containsForbiddenLeaderboardKey,
  normalizeGamePlatformLeaderboard,
  normalizeLegacyLeaderboard,
  sanitizeLeaderboardEntries
} from './game_center/leaderboard'

/** 模拟 Legacy `/api/game-rank/leaderboard` 真实响应（含 student_id，冻结行为） */
const legacyPayload = {
  success: true,
  scope: 'class',
  game_id: 'hbut_stack',
  leaderboard: [
    {
      game_id: 'hbut_stack',
      student_id: '2023001234',
      player_name: '张三',
      class_name: '机械2401',
      school_name: '湖北工业大学',
      major: '机械工程',
      score: 1240,
      max_level: 26,
      duration_ms: 151400,
      move_count: 88,
      run_id: 'run_1',
      updated_at: '2026-09-27T08:02:31',
      rank: 1,
      is_self: true
    },
    {
      game_id: 'hbut_stack',
      student_id: '2023009999',
      player_name: '',
      class_name: '机械2401',
      score: 900,
      rank: 2,
      is_self: false
    }
  ],
  player: {
    student_id: '2023001234',
    player_name: '张三',
    class_name: '机械2401',
    school_name: '湖北工业大学',
    score: 1240,
    max_level: 26,
    class_rank: 1,
    school_rank: 3,
    updated_at: '2026-09-27T08:02:31'
  },
  filters: { student_id: '2023001234', class_name: '机械2401', limit: 20 },
  refreshed_at: '2026-09-27T09:00:00'
}

describe('leaderboard PII 过滤（#905）', () => {
  it('Legacy 榜单归一化后不含任何敏感字段（含 student_id）', () => {
    const board = normalizeLegacyLeaderboard(legacyPayload, {
      gameId: 'hbut_stack',
      selfStudentId: '2023001234',
      selfPlayerName: '张三'
    })
    expect(board.entries.length).toBe(2)
    expect(containsForbiddenLeaderboardKey(board)).toBe(false)
    expect(JSON.stringify(board)).not.toContain('2023001234')
    expect(JSON.stringify(board)).not.toContain('2023009999')
    expect(JSON.stringify(board)).not.toContain('机械工程')
  })

  it('昵称缺失时使用脱敏占位，绝不回退成学号', () => {
    const board = normalizeLegacyLeaderboard(legacyPayload, { selfStudentId: '2023001234' })
    const second = board.entries[1]
    expect(second.playerName).toBe(UNKNOWN_PLAYER_NAME)
    expect(second.playerName).not.toContain('2023')
  })

  it('is_self 由本地身份比对推导，且本人最好成绩用于「我的」Tab', () => {
    const board = normalizeLegacyLeaderboard(legacyPayload, {
      selfStudentId: '2023001234',
      selfPlayerName: '张三'
    })
    expect(board.entries[0].isSelf).toBe(true)
    expect(board.entries[1].isSelf).toBe(false)
    expect(board.self?.score).toBe(1240)
    expect(board.self?.classRank).toBe(1)
    expect(board.self?.schoolRank).toBe(3)
  })

  it('V2 榜单归一化同样过滤 PII，并保留 metric / cursor', () => {
    const board = normalizeGamePlatformLeaderboard(
      {
        success: true,
        board: 'verified',
        scope_applied: 'school',
        game_id: 'hbut_stack',
        metric: { name: 'layers', label: '层数' },
        entries: [
          {
            rank: 1,
            player_ref: 'a1b2c3d4e5f6',
            player_name: '张三',
            class_name: '机械2401',
            score: 1240,
            is_self: false
          }
        ],
        next_cursor: 'cursor-1',
        generated_at: '2026-09-27T09:00:00Z'
      },
      { gameId: 'hbut_stack', board: 'verified' }
    )
    expect(board.entries[0].key).toBe('a1b2c3d4e5f6')
    expect(board.metricLabel).toBe('层数')
    expect(board.nextCursor).toBe('cursor-1')
    expect(containsForbiddenLeaderboardKey(board)).toBe(false)
  })

  it('白名单映射丢弃非法项，非法输入不抛错', () => {
    expect(sanitizeLeaderboardEntries(null)).toEqual([])
    expect(sanitizeLeaderboardEntries([null, 'x', 3])).toEqual([])
    const entries = sanitizeLeaderboardEntries([
      { player_name: 'A', score: '12', student_id: '2023' },
      { player_name: 'B', score: null }
    ])
    expect(entries.map((item) => item.score)).toEqual([12, 0])
    expect(containsForbiddenLeaderboardKey(entries)).toBe(false)
  })

  it('敏感字段清单覆盖协议 §9.3 明令禁止的身份字段', () => {
    for (const key of ['student_id', 'hbut_student_id', 'player_id', 'user_id', 'sub']) {
      expect(FORBIDDEN_LEADERBOARD_KEYS).toContain(key)
    }
  })
})
