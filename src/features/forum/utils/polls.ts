// 论坛投票纯工具（无副作用，便于单元测试）
// 描述：投票数据归一化、选项统计、参与判定、草稿解析等纯函数。
import type { ForumPoll, ForumPollOption } from '../types'
import { toText } from './format'

/** 归一化投票列表：过滤非法项，标准化字段 */
export const normalizePolls = (items: unknown[] | null | undefined = []): ForumPoll[] =>
  (Array.isArray(items) ? items : [])
    .filter((poll) => poll && typeof poll === 'object')
    .map((poll) => {
      const record = poll as Record<string, unknown>
      return {
        id: Number(record.id || 0),
        title: toText(record.title).trim() || '未命名投票',
        description: toText(record.description).trim(),
        // status 归一化到受控字面量，与 ForumPoll.status 类型对齐
        status: (record.status === 'closed' ? 'closed' : 'active') as 'closed' | 'active',
        created_at: toText(record.created_at).trim() || new Date().toISOString(),
        my_vote_option_id: record.my_vote_option_id == null ? null : Number(record.my_vote_option_id),
        options: Array.isArray(record.options)
          ? (record.options as unknown[]).map((option, index) => {
              const optionRecord = (option || {}) as Record<string, unknown>
              return {
                id: Number(optionRecord.id || 0) || index + 1,
                label: toText(optionRecord.label).trim() || `选项 ${index + 1}`,
                score: Number(optionRecord.score || 0),
                votes: Number(optionRecord.votes || 0)
              }
            })
          : []
      }
    })
    .filter((poll) => poll.id > 0 && poll.options.length >= 2)

/** 单个投票的累计票数 */
export const pollOptionTotal = (poll: ForumPoll | null | undefined): number =>
  (poll?.options || []).reduce((total, option) => total + Number(option.votes || 0), 0)

/** 选项票数百分比（四舍五入，无票为 0） */
export const pollOptionPercent = (poll: ForumPoll | null | undefined, option: ForumPollOption | null | undefined): number => {
  const total = pollOptionTotal(poll)
  return total ? Math.round((Number(option?.votes || 0) / total) * 100) : 0
}

/** 当前用户是否已参与该投票 */
export const hasVotedInPoll = (poll: ForumPoll | null | undefined): boolean => poll?.my_vote_option_id != null

/** 解析管理员投票草稿：每行一个选项，`标签|分数`，分数钳制在 0-10 */
export const parsePollOptions = (draft: string): Array<{ label: string; score: number }> => {
  const text = String(draft || '').trim()
  if (!text) return []
  return text
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const [label, score] = line.split('|').map((part) => toText(part).trim())
      return {
        label: label || `选项 ${index + 1}`,
        score: Math.min(10, Math.max(0, Number(score || 0)))
      }
    })
    .filter((option) => option.label)
}

/** 投票管理概览统计 */
export const pollAdminSummary = (polls: ForumPoll[]): { total: number; active: number; closed: number; votes: number } => {
  const activeCount = polls.filter((poll) => poll.status === 'active').length
  const voteCount = polls.reduce(
    (total, poll) => total + poll.options.reduce((sum, option) => sum + Number(option.votes || 0), 0),
    0
  )
  return {
    total: polls.length,
    active: activeCount,
    closed: Math.max(0, polls.length - activeCount),
    votes: voteCount
  }
}
