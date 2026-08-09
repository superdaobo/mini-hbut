// 论坛投票纯函数单元测试
import { describe, expect, it } from 'vitest'
import {
  hasVotedInPoll,
  normalizePolls,
  parsePollOptions,
  pollAdminSummary,
  pollOptionPercent,
  pollOptionTotal
} from './polls'

describe('forum polls utils', () => {
  it('normalizePolls 过滤非法项并标准化字段', () => {
    expect(normalizePolls(null)).toEqual([])
    expect(normalizePolls([null, 42])).toEqual([])
    const polls = normalizePolls([
      {
        id: '7',
        title: ' 本周投票 ',
        status: 'closed',
        my_vote_option_id: 2,
        options: [
          { id: 1, label: ' 很棒 ', score: 10, votes: 3 },
          { id: 2, label: '一般', score: 5 }
        ]
      }
    ])
    expect(polls).toHaveLength(1)
    expect(polls[0].id).toBe(7)
    expect(polls[0].title).toBe('本周投票')
    expect(polls[0].status).toBe('closed')
    expect(polls[0].my_vote_option_id).toBe(2)
    expect(polls[0].options[0].label).toBe('很棒')
    expect(polls[0].options[0].votes).toBe(3)
  })

  it('normalizePolls 丢弃选项不足两个的投票', () => {
    expect(normalizePolls([{ id: 1, options: [{ id: 1, label: 'x' }] }])).toEqual([])
    expect(normalizePolls([{ id: 0, options: [{ id: 1 }, { id: 2 }] }])).toEqual([])
  })

  it('pollOptionTotal 累计选项票数', () => {
    expect(pollOptionTotal(null)).toBe(0)
    const poll = { options: [{ votes: 3 }, { votes: 4 }, { votes: 0 }] } as never
    expect(pollOptionTotal(poll)).toBe(7)
  })

  it('pollOptionPercent 四舍五入百分比，无票为 0', () => {
    const poll = { options: [{ votes: 1 }, { votes: 2 }] } as never
    expect(pollOptionPercent(poll, { votes: 1 } as never)).toBe(33)
    expect(pollOptionPercent(poll, { votes: 2 } as never)).toBe(67)
    expect(pollOptionPercent(null, null)).toBe(0)
  })

  it('hasVotedInPoll 依据 my_vote_option_id 判定', () => {
    expect(hasVotedInPoll(null)).toBe(false)
    expect(hasVotedInPoll({ my_vote_option_id: null } as never)).toBe(false)
    expect(hasVotedInPoll({ my_vote_option_id: 2 } as never)).toBe(true)
  })

  it('parsePollOptions 解析“标签|分数”行并钳制分数', () => {
    expect(parsePollOptions('')).toEqual([])
    expect(parsePollOptions('赞成|10\n中立|5\n反对|1')).toEqual([
      { label: '赞成', score: 10 },
      { label: '中立', score: 5 },
      { label: '反对', score: 1 }
    ])
    expect(parsePollOptions('超高|99\n负分|-5')).toEqual([
      { label: '超高', score: 10 },
      { label: '负分', score: 0 }
    ])
  })

  it('pollAdminSummary 汇总总数/进行中/已关闭/票数', () => {
    const polls = [
      { status: 'active', options: [{ votes: 5 }, { votes: 2 }] },
      { status: 'active', options: [{ votes: 1 }] },
      { status: 'closed', options: [{ votes: 9 }] }
    ] as never
    expect(pollAdminSummary(polls)).toEqual({ total: 3, active: 2, closed: 1, votes: 17 })
    expect(pollAdminSummary([])).toEqual({ total: 0, active: 0, closed: 0, votes: 0 })
  })
})
