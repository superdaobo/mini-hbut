// 论坛投票领域：管理员投票列表、创建/关闭/投票与统计
// 描述：voteInPoll/createAdminPoll/closeAdminPoll 与 loadAdminPolls 均保持原 ForumView 行为。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ForumPoll, ForumPollOption } from '../types'
import { normalizePolls, parsePollOptions, pollAdminSummary as summarizePolls, pollOptionPercent, pollOptionTotal, hasVotedInPoll } from '../utils/polls'
import type { ForumSession } from './useForumSession'

/** 投票领域依赖 */
export interface ForumPollsDeps {
  /** 当前用户是否管理员（由 useForumMe 维护） */
  isAdmin: Ref<boolean>
}

/** 投票领域状态与动作 */
export interface ForumPolls {
  adminPolls: Ref<ForumPoll[]>
  selectedPoll: Ref<ForumPoll | null>
  pollDraft: Ref<{ title: string; description: string; options: string }>
  pollAdminSummary: ComputedRef<{ total: number; active: number; closed: number; votes: number }>
  loadAdminPolls: (options?: { force?: boolean }) => Promise<void>
  selectPoll: (poll: ForumPoll | null) => void
  voteInPoll: (option: ForumPollOption) => Promise<void>
  createAdminPoll: () => Promise<void>
  closeAdminPoll: (poll: ForumPoll) => Promise<void>
  pollOptionTotal: (poll: ForumPoll | null | undefined) => number
  pollOptionPercent: (poll: ForumPoll | null | undefined, option: ForumPollOption | null | undefined) => number
  hasVotedInPoll: (poll: ForumPoll | null | undefined) => boolean
}

/** 创建投票领域 composable */
export const useForumPolls = (session: ForumSession, deps: ForumPollsDeps): ForumPolls => {
  const adminPolls = ref<ForumPoll[]>([])
  const selectedPoll = ref<ForumPoll | null>(null)
  const pollDraft = ref({
    title: '本周学习体验投票',
    description: '由管理员发起，普通用户只在投票打分页参与，不再要求每个帖子评分。',
    options: '很有帮助|10\n比较有帮助|8\n一般|5\n需要改进|2'
  })

  const pollAdminSummary = computed(() => summarizePolls(adminPolls.value))

  const loadAdminPolls = async ({ force = false } = {}): Promise<void> => {
    if (!session.isLoggedIn.value) {
      adminPolls.value = []
      selectedPoll.value = null
      return
    }
    if (!session.client) await session.buildClient()
    if (force && session.forumCache) session.invalidateForumCache(['poll'])
    try {
      const payload = await session.cached('poll:list', ({ etag }) => session.client!.listPolls({ limit: 30 }, { includeMeta: true, etag }), 15_000)
      adminPolls.value = normalizePolls(payload?.items as unknown[] | undefined)
    } catch (error) {
      adminPolls.value = []
      selectedPoll.value = null
      session.toast((error as Error)?.message || '投票列表加载失败', 'warning')
      return
    }
    const previousId = Number(selectedPoll.value?.id || 0)
    selectedPoll.value =
      adminPolls.value.find((poll) => Number(poll.id) === previousId) ||
      adminPolls.value.find((poll) => poll.status === 'active') ||
      adminPolls.value[0] ||
      null
  }

  const selectPoll = (poll: ForumPoll | null): void => {
    selectedPoll.value = poll || null
  }

  const voteInPoll = async (option: ForumPollOption): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    const poll = selectedPoll.value
    if (!poll || poll.status === 'closed') {
      session.toast('当前投票已关闭', 'warning')
      return
    }
    if (hasVotedInPoll(poll)) {
      session.toast('你已经参与过这个投票', 'info')
      return
    }
    await session.runPending(`poll:vote:${poll.id}:${option.id}`, async () => {
      const updated = await session.client!.votePoll(poll.id!, option.id!)
      const normalized = normalizePolls([updated])[0]
      adminPolls.value = adminPolls.value.map((item) =>
        Number(item.id) === Number(poll.id) ? normalized : item
      )
      selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || null
      session.invalidateForumCache(['poll'])
      session.toast('投票已记录', 'success')
    }, '投票正在提交，请勿重复点击')
  }

  const createAdminPoll = async (): Promise<void> => {
    if (!deps.isAdmin.value) return
    const title = pollDraft.value.title.trim()
    const options = parsePollOptions(pollDraft.value.options)
    if (!title || options.length < 2) {
      session.toast('请填写投票标题，并至少提供两个选项', 'warning')
      return
    }
    await session.runPending('poll:create', async () => {
      const created = await session.client!.createPoll({
        title,
        description: pollDraft.value.description.trim(),
        options
      })
      const poll = normalizePolls([created])[0]
      adminPolls.value = [poll, ...adminPolls.value].slice(0, 20)
      selectedPoll.value = poll
      session.invalidateForumCache(['poll'])
      pollDraft.value = {
        title: '',
        description: '',
        options: '赞成|10\n中立|5\n反对|1'
      }
      session.toast('发布投票', 'success')
    })
  }

  const closeAdminPoll = async (poll: ForumPoll): Promise<void> => {
    if (!deps.isAdmin.value || !poll?.id) return
    await session.runPending(`poll:close:${poll.id}`, async () => {
      const closed = await session.client!.closePoll(poll.id!)
      const normalized = normalizePolls([closed])[0]
      adminPolls.value = adminPolls.value.map((item) =>
        Number(item.id) === Number(poll.id) ? normalized : item
      )
      selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || selectedPoll.value
      session.invalidateForumCache(['poll'])
      session.toast('关闭投票', 'success')
    })
  }

  return {
    adminPolls,
    selectedPoll,
    pollDraft,
    pollAdminSummary,
    loadAdminPolls,
    selectPoll,
    voteInPoll,
    createAdminPoll,
    closeAdminPoll,
    pollOptionTotal,
    pollOptionPercent,
    hasVotedInPoll
  }
}
