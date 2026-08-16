// 论坛“我的”领域：个人资料、我的帖子/回复/收藏、徽章、签到与资料保存
// 描述：loadMe 保持原 7 路并发加载（含通知/私信），并同步管理员标记。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { saveForumAdminSecret, writeForumProfile } from '../../../utils/forum_api'
import type { ForumBadge, ForumProfile, ForumThread, ForumReply, ForumNotification, ForumMessage } from '../types'
import type { ForumSession } from './useForumSession'

/** 我的领域依赖 */
export interface ForumMeDeps {
  /** 管理后台加载（由 useForumAdmin 提供） */
  loadAdmin: (options?: { force?: boolean }) => Promise<void>
  /** 投票列表加载（由 useForumPolls 提供） */
  loadAdminPolls: (options?: { force?: boolean }) => Promise<void>
}

/** 我的领域状态与动作 */
export interface ForumMe {
  meSummary: Ref<Record<string, unknown> | null>
  myThreads: Ref<ForumThread[]>
  myReplies: Ref<ForumReply[]>
  myBookmarks: Ref<ForumThread[]>
  badges: Ref<ForumBadge[]>
  notifications: Ref<ForumNotification[]>
  messages: Ref<ForumMessage[]>
  meStats: ComputedRef<Record<string, unknown>>
  profileCompletion: ComputedRef<number>
  bookmarkedIds: ComputedRef<Set<number>>
  isAdmin: ComputedRef<boolean>
  loadMe: (options?: { force?: boolean }) => Promise<void>
  saveProfile: () => Promise<void>
  checkIn: () => Promise<void>
}

/** 创建我的领域 composable */
export const useForumMe = (session: ForumSession, deps: ForumMeDeps): ForumMe => {
  const meSummary = ref<Record<string, unknown> | null>(null)
  const myThreads = ref<ForumThread[]>([])
  const myReplies = ref<ForumReply[]>([])
  const myBookmarks = ref<ForumThread[]>([])
  const badges = ref<ForumBadge[]>([])
  const notifications = ref<ForumNotification[]>([])
  const messages = ref<ForumMessage[]>([])

  const meStats = computed(() => (meSummary.value?.stats as Record<string, unknown>) || {})
  const profileCompletion = computed(() => {
    const checks = [
      session.profile.value.nickname?.trim(),
      session.profile.value.avatar_url?.trim(),
      session.profile.value.bio?.trim(),
      Number(meStats.value.checkin_count || 0) > 0
    ]
    const completed = checks.filter(Boolean).length
    return Math.round((completed / checks.length) * 100)
  })
  const bookmarkedIds = computed(() => new Set(myBookmarks.value.map((thread) => Number(thread.id))))
  const isAdmin = computed(() => session.adminFlag.value)

  const loadMe = async ({ force = false } = {}): Promise<void> => {
    if (!session.client || !session.isLoggedIn.value) return
    if (force) session.invalidateForumCache(['me', 'notice', 'message', 'admin'])
    const settled = await Promise.allSettled([
      session.cached('me:summary', ({ etag }) => session.client!.getMeSummary({ includeMeta: true, etag }), 30_000),
      session.cached('me:threads', ({ etag }) => session.client!.listMyThreads({ limit: 30 }, { includeMeta: true, etag }), 30_000),
      session.cached('me:replies', ({ etag }) => session.client!.listMyReplies({ limit: 30 }, { includeMeta: true, etag }), 30_000),
      session.cached('me:bookmarks', ({ etag }) => session.client!.listMyBookmarks({ limit: 50 }, { includeMeta: true, etag }), 30_000),
      session.cached('notice:list', ({ etag }) => session.client!.listNotifications({}, { includeMeta: true, etag }), 20_000),
      session.cached('message:list', ({ etag }) => session.client!.listMessages({}, { includeMeta: true, etag }), 15_000),
      session.cached('me:badges', ({ etag }) => session.client!.listBadges({ includeMeta: true, etag }), 60_000)
    ])
    // allSettled 元组元素的 value 为 unknown：统一用 itemsOf 收窄为领域数组（行为不变）
    const itemsOf = <T>(value: unknown, fallback: T[] = []): T[] => (Array.isArray(value) ? (value as T[]) : fallback)
    if (settled[0].status === 'fulfilled') meSummary.value = settled[0].value as Record<string, unknown> | null
    if (settled[1].status === 'fulfilled') myThreads.value = itemsOf((settled[1].value as { items?: unknown } | undefined)?.items)
    if (settled[2].status === 'fulfilled') myReplies.value = itemsOf((settled[2].value as { items?: unknown } | undefined)?.items)
    if (settled[3].status === 'fulfilled') myBookmarks.value = itemsOf((settled[3].value as { items?: unknown } | undefined)?.items)
    if (settled[4].status === 'fulfilled') notifications.value = itemsOf((settled[4].value as { items?: unknown } | undefined)?.items)
    if (settled[5].status === 'fulfilled') messages.value = itemsOf((settled[5].value as { items?: unknown } | undefined)?.items)
    if (settled[6].status === 'fulfilled') badges.value = itemsOf((settled[6].value as { items?: unknown } | undefined)?.items)
    const profileValue = ((meSummary.value?.profile as Record<string, unknown>) || {})
    session.adminFlag.value = profileValue.is_admin === true || Number(profileValue.is_admin || 0) === 1
    if (session.adminFlag.value) await deps.loadAdmin({ force })
  }

  const saveProfile = async (): Promise<void> => {
    // 管理员口令单独加密存储，profile 缓存不再包含明文（CodeQL js/clear-text-storage-of-sensitive-data）；
    // 该加密仅降低静态备份/扫描泄露风险（设备密钥与密文同存于 localStorage），不是 XSS 安全边界
    await saveForumAdminSecret(session.studentId, session.profile.value.admin_secret || '')
    session.profile.value = writeForumProfile(session.studentId, session.profile.value) as ForumProfile
    session.client = null
    session.forumCache = null
    session.toast('社区资料已保存', 'success')
    await session.buildClient()
    await loadMe({ force: true })
    await deps.loadAdminPolls({ force: true })
  }

  const checkIn = async (): Promise<void> => {
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    if (!session.client) await session.buildClient()
    await session.runPending('checkin', async () => {
      await session.client!.checkIn()
      session.invalidateForumCache(['me'])
      session.toast('签到成功', 'success')
      await loadMe({ force: true })
    })
  }

  return {
    meSummary,
    myThreads,
    myReplies,
    myBookmarks,
    badges,
    notifications,
    messages,
    meStats,
    profileCompletion,
    bookmarkedIds,
    isAdmin,
    loadMe,
    saveProfile,
    checkIn
  }
}
