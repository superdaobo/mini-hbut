// 论坛详情与评论领域：帖子详情、回复、点赞、收藏、关注、举报
// 描述：openThread/submitReply/reactToReply/toggleBookmark/followAuthor/reportThread 保持原 ForumView 行为。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ForumReply, ForumThread, ForumThreadDetail } from '../types'
import { toText } from '../utils/format'
import type { ForumSession } from './useForumSession'

/** 详情领域依赖 */
export interface ForumDetailDeps {
  /** 已收藏帖子 id 集合（由 useForumMe 提供） */
  bookmarkedIds: ComputedRef<Set<number>>
  /** 我的资料加载（由 useForumMe 提供） */
  loadMe: (options?: { force?: boolean }) => Promise<void>
  /** 附件上传（由 useForumMedia 提供） */
  uploadFiles: (files: File[], scope?: string) => Promise<Array<number | string>>
  /** 同步某作用域的附件队列（由 useForumMedia 提供） */
  syncUploadQueueForScope: (files: File[], scope: string) => void
}

/** 详情领域状态与动作 */
export interface ForumDetail {
  selectedThread: Ref<ForumThread | null>
  threadDetail: Ref<ForumThreadDetail | null>
  detailLoading: Ref<boolean>
  replyContent: Ref<string>
  replyFiles: Ref<File[]>
  currentThread: ComputedRef<ForumThread | null>
  threadAttachments: ComputedRef<Array<number | string>>
  replyPendingKey: ComputedRef<string>
  threadActionKey: (thread: ForumThread | null, action: string) => string
  openThread: (thread: ForumThread) => Promise<void>
  closeThread: () => void
  resetDetail: () => void
  submitReply: () => Promise<void>
  reactToReply: (reply: ForumReply, reaction: 'up' | 'down') => Promise<void>
  toggleBookmark: (thread: ForumThread) => Promise<void>
  followAuthor: (studentId: unknown) => Promise<void>
  reportThread: (thread: ForumThread | null) => Promise<void>
  setReplyFiles: (event: Event) => void
  removeReplyFile: (index: number) => void
}

/** 创建详情领域 composable */
export const useForumDetail = (session: ForumSession, deps: ForumDetailDeps): ForumDetail => {
  const selectedThread = ref<ForumThread | null>(null)
  const threadDetail = ref<ForumThreadDetail | null>(null)
  const detailLoading = ref(false)
  const replyContent = ref('')
  const replyFiles = ref<File[]>([])

  const currentThread = computed(() => threadDetail.value?.thread || selectedThread.value || null)
  const threadAttachments = computed(() => currentThread.value?.attachment_ids || [])
  const replyPendingKey = computed(() =>
    selectedThread.value?.id ? `reply:${selectedThread.value.id}:${replyContent.value.trim().slice(0, 80)}` : 'reply:none'
  )

  const threadActionKey = (thread: ForumThread | null, action: string): string => {
    const normalizedAction = toText(action).trim()
    if (normalizedAction === 'follow') {
      return `follow:${toText(thread?.author_student_id).trim() || 'unknown'}`
    }
    return `${normalizedAction}:${thread?.id || 'unknown'}`
  }

  const openThread = async (thread: ForumThread): Promise<void> => {
    if (!session.client || !thread?.id) return
    selectedThread.value = thread
    threadDetail.value = null
    detailLoading.value = true
    try {
      const detail = await session.cached(`thread:${thread.id}`, ({ etag }) => session.client!.getThread(thread.id!, { includeMeta: true, etag }), 20_000)
      threadDetail.value = detail
      selectedThread.value = detail?.thread || thread
    } catch (error) {
      session.errorMessage.value = (error as Error)?.message || '帖子详情加载失败'
    } finally {
      detailLoading.value = false
    }
  }

  const resetDetail = (): void => {
    selectedThread.value = null
    threadDetail.value = null
  }

  const closeThread = (): void => {
    resetDetail()
    replyContent.value = ''
    replyFiles.value = []
  }

  const submitReply = async (): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    if (!selectedThread.value?.id) return
    const content = replyContent.value.trim()
    if (!content) {
      session.toast('回复内容不能为空', 'warning')
      return
    }
    await session.runPending(replyPendingKey.value, async () => {
      const attachmentIds = await deps.uploadFiles(replyFiles.value, 'reply')
      await session.client!.createReply(selectedThread.value!.id!, {
        content_md: content,
        attachment_ids: attachmentIds
      })
      replyContent.value = ''
      replyFiles.value = []
      session.invalidateForumCache(['thread', 'feed', 'hot', 'me'])
      session.toast('回复已发送', 'success')
      await openThread(selectedThread.value!)
    })
  }

  const reactToReply = async (reply: ForumReply, reaction: 'up' | 'down'): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    await session.runPending(`react:${reply.id}:${reaction}`, async () => {
      await session.client!.reactToPost(reply.id!, reaction)
      session.invalidateForumCache(['thread'])
      session.toast('操作成功', 'success')
      if (selectedThread.value) await openThread(selectedThread.value)
    })
  }

  const toggleBookmark = async (thread: ForumThread): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    const active = !deps.bookmarkedIds.value.has(Number(thread.id))
    await session.runPending(`bookmark:${thread.id}`, async () => {
      await session.client!.bookmarkThread(thread.id!, active)
      session.invalidateForumCache(['me'])
      session.toast(active ? '已收藏' : '已取消收藏', 'success')
      await deps.loadMe({ force: true })
    })
  }

  const followAuthor = async (studentId: unknown): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    const target = toText(studentId).trim()
    if (!target || target === String(session.studentId || '').trim()) return
    await session.runPending(`follow:${target}`, async () => {
      await session.client!.followUser(target, true)
      session.invalidateForumCache(['me'])
      session.toast('已关注作者', 'success')
      await deps.loadMe({ force: true })
    })
  }

  const reportThread = async (thread: ForumThread | null): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    if (!thread?.id) return
    await session.runPending(`report:${thread.id}`, async () => {
      await session.client!.reportContent({
        target_type: 'thread',
        target_id: thread.id,
        reason: '用户从客户端举报'
      })
      session.invalidateForumCache(['admin'])
      session.toast('举报已提交', 'success')
    })
  }

  const setReplyFiles = (event: Event): void => {
    const files = Array.from((event?.target as HTMLInputElement)?.files || []).slice(0, 4)
    replyFiles.value = files
    deps.syncUploadQueueForScope(files, 'reply')
  }

  const removeReplyFile = (index: number): void => {
    const files = replyFiles.value.filter((_, fileIndex) => fileIndex !== index)
    replyFiles.value = files
    deps.syncUploadQueueForScope(files, 'reply')
  }

  return {
    selectedThread,
    threadDetail,
    detailLoading,
    replyContent,
    replyFiles,
    currentThread,
    threadAttachments,
    replyPendingKey,
    threadActionKey,
    openThread,
    closeThread,
    resetDetail,
    submitReply,
    reactToReply,
    toggleBookmark,
    followAuthor,
    reportThread,
    setReplyFiles,
    removeReplyFile
  }
}
