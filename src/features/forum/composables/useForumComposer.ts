// 论坛发布领域：新帖草稿、附件选择、发布动作与提示
// 描述：submitThread/setThreadFiles/removeThreadFile/openThreadFilePicker 保持原 ForumView 行为。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ForumCategory, ForumThread } from '../types'
import type { ForumSession } from './useForumSession'

/** 发布领域依赖 */
export interface ForumComposerDeps {
  /** 当前选中的分类 id（由 useForumFeed 提供） */
  selectedCategoryId: Ref<number>
  /** 当前选中的分类（由 useForumFeed 提供） */
  selectedCategory: ComputedRef<ForumCategory | undefined>
  /** 是否有远端分类（由 useForumFeed 提供） */
  hasRemoteCategories: ComputedRef<boolean>
  /** 刷新广场数据（由 useForumFeed 提供） */
  loadForumData: (options?: { force?: boolean }) => Promise<void>
  /** 打开帖子详情（由 useForumDetail 提供） */
  openThread: (thread: ForumThread) => Promise<void>
  /** 附件上传（由 useForumMedia 提供） */
  uploadFiles: (files: File[], scope?: string) => Promise<Array<number | string>>
  /** 同步发帖附件队列（由 useForumMedia 提供） */
  syncUploadQueueForScope: (files: File[], scope: string) => void
}

/** 发布领域状态与动作 */
export interface ForumComposer {
  newThread: Ref<{ title: string; content_md: string }>
  threadFiles: Ref<File[]>
  threadUploadInput: Ref<HTMLInputElement | null>
  threadPendingKey: ComputedRef<string>
  canPublishThread: ComputedRef<boolean>
  composerHint: ComputedRef<string>
  submitThread: () => Promise<void>
  setThreadFiles: (event: Event) => void
  removeThreadFile: (index: number) => void
  openThreadFilePicker: () => void
}

/** 创建发布领域 composable */
export const useForumComposer = (session: ForumSession, deps: ForumComposerDeps): ForumComposer => {
  const newThread = ref({ title: '', content_md: '' })
  const threadFiles = ref<File[]>([])
  const threadUploadInput = ref<HTMLInputElement | null>(null)

  const threadPendingKey = computed(() =>
    `thread:${deps.selectedCategoryId.value}:${newThread.value.title.trim()}:${newThread.value.content_md.trim()}`.slice(0, 180)
  )
  const canPublishThread = computed(() => session.forumEnabled.value && session.isLoggedIn.value && deps.hasRemoteCategories.value)
  const composerHint = computed(() => {
    if (!session.forumEnabled.value) return '论坛暂未开放'
    if (!session.isLoggedIn.value) return '登录后可以发帖、收藏和回复'
    if (!deps.hasRemoteCategories.value) return '版块初始化中，请稍后刷新'
    return ''
  })

  const submitThread = async (): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    if (!session.client) await session.buildClient()
    const title = newThread.value.title.trim()
    const content = newThread.value.content_md.trim()
    if (!title || !content) {
      session.toast('标题和内容不能为空', 'warning')
      return
    }
    if (!canPublishThread.value) {
      session.toast(composerHint.value || '暂时无法发布', 'warning')
      return
    }
    await session.runPending(threadPendingKey.value, async () => {
      const attachmentIds = await deps.uploadFiles(threadFiles.value, 'thread')
      const created = await session.client!.createThread({
        category_id: deps.selectedCategoryId.value || deps.selectedCategory.value?.id,
        title,
        content_md: content,
        attachment_ids: attachmentIds
      })
      newThread.value = { title: '', content_md: '' }
      threadFiles.value = []
      session.invalidateForumCache(['feed', 'hot', 'me'])
      session.toast('发布成功', 'success')
      await deps.loadForumData({ force: true })
      await deps.openThread(created)
    })
  }

  const setThreadFiles = (event: Event): void => {
    const files = Array.from((event?.target as HTMLInputElement)?.files || []).slice(0, 6)
    threadFiles.value = files
    deps.syncUploadQueueForScope(files, 'thread')
  }

  const removeThreadFile = (index: number): void => {
    const files = threadFiles.value.filter((_, fileIndex) => fileIndex !== index)
    threadFiles.value = files
    deps.syncUploadQueueForScope(files, 'thread')
  }

  const openThreadFilePicker = (): void => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    threadUploadInput.value?.click?.()
  }

  return {
    newThread,
    threadFiles,
    threadUploadInput,
    threadPendingKey,
    canPublishThread,
    composerHint,
    submitThread,
    setThreadFiles,
    removeThreadFile,
    openThreadFilePicker
  }
}
