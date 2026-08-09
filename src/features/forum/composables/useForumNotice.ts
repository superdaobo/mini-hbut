// 论坛通知领域：通知/私信数据透传、私信发送
// 描述：通知与私信列表由 useForumMe 的 loadMe 统一加载，本 composable 负责私信草稿与发送。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ForumMessage, ForumNotification } from '../types'
import type { ForumSession } from './useForumSession'

/** 通知领域依赖 */
export interface ForumNoticeDeps {
  /** 通知列表（由 useForumMe 提供） */
  notifications: Ref<ForumNotification[]>
  /** 私信列表（由 useForumMe 提供） */
  messages: Ref<ForumMessage[]>
  /** 我的资料加载（由 useForumMe 提供） */
  loadMe: (options?: { force?: boolean }) => Promise<void>
}

/** 通知领域状态与动作 */
export interface ForumNotice {
  messageDraft: Ref<{ receiver_student_id: string; content: string }>
  messagePendingKey: ComputedRef<string>
  unreadCount: ComputedRef<number>
  sendMessage: () => Promise<void>
}

/** 创建通知领域 composable */
export const useForumNotice = (session: ForumSession, deps: ForumNoticeDeps): ForumNotice => {
  const messageDraft = ref({ receiver_student_id: '', content: '' })

  const messagePendingKey = computed(() => {
    const receiver = messageDraft.value.receiver_student_id.trim()
    const content = messageDraft.value.content.trim()
    return `message:${receiver}:${content.slice(0, 40)}`
  })
  const unreadCount = computed(() => deps.notifications.value.filter((item) => !Number(item.is_read || 0)).length)

  const sendMessage = async (): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    const receiver = messageDraft.value.receiver_student_id.trim()
    const content = messageDraft.value.content.trim()
    if (!receiver || !content) {
      session.toast('请填写收件人和内容', 'warning')
      return
    }
    await session.runPending(messagePendingKey.value, async () => {
      await session.client!.sendMessage({ receiver_student_id: receiver, content })
      messageDraft.value = { receiver_student_id: '', content: '' }
      session.invalidateForumCache(['message'])
      session.toast('私信已发送', 'success')
      await deps.loadMe({ force: true })
    })
  }

  return {
    messageDraft,
    messagePendingKey,
    unreadCount,
    sendMessage
  }
}
