// 论坛用户主页领域：查看他人资料、统计、动态与徽章
// 描述：openUserProfile 保持原 ForumView 行为（缓存键 user-profile:${target}）。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ForumBadge, ForumThread, ViewedUserProfile } from '../types'
import { toText } from '../utils/format'
import type { ForumSession } from './useForumSession'

/** 用户主页领域依赖 */
export interface ForumUserProfileDeps {
  /** 广场帖子列表（由 useForumFeed 提供），用于过滤该用户动态 */
  displayThreads: ComputedRef<ForumThread[]>
}

/** 用户主页领域状态与动作 */
export interface ForumUserProfile {
  viewedUserProfile: Ref<ViewedUserProfile | null>
  viewedProfileLoading: Ref<boolean>
  viewedProfileInfo: ComputedRef<Record<string, unknown>>
  viewedProfileStats: ComputedRef<Record<string, unknown>>
  userProfileThreads: ComputedRef<ForumThread[]>
  userProfileBadges: ComputedRef<ForumBadge[]>
  openUserProfile: (studentId: unknown) => Promise<void>
}

/** 创建用户主页领域 composable */
export const useForumUserProfile = (session: ForumSession, deps: ForumUserProfileDeps): ForumUserProfile => {
  const viewedUserProfile = ref<ViewedUserProfile | null>(null)
  const viewedProfileLoading = ref(false)

  const viewedProfileInfo = computed(() => (viewedUserProfile.value?.profile as Record<string, unknown>) || {})
  const viewedProfileStats = computed(() => (viewedUserProfile.value?.stats as Record<string, unknown>) || {})
  const userProfileThreads = computed(() => {
    const target = toText(viewedProfileInfo.value.student_id).trim()
    if (!target) return []
    return deps.displayThreads.value
      .filter((thread) => toText(thread.author_student_id).trim() === target)
      .slice(0, 3)
  })
  const userProfileBadges = computed(() => {
    const items = viewedUserProfile.value?.badges || (viewedUserProfile.value?.profile?.badges as ForumBadge[]) || []
    return Array.isArray(items) ? items : []
  })

  const openUserProfile = async (studentId: unknown): Promise<void> => {
    const target = toText(studentId).trim()
    if (!target) return
    if (!session.client) await session.buildClient()
    viewedProfileLoading.value = true
    viewedUserProfile.value = null
    try {
      viewedUserProfile.value = await session.cached(`user-profile:${target}`, ({ etag }) =>
        session.client!.getUserProfile(target, { includeMeta: true, etag }), 30_000)
    } catch (error) {
      session.errorMessage.value = (error as Error)?.message || '用户主页加载失败'
    } finally {
      viewedProfileLoading.value = false
    }
  }

  return {
    viewedUserProfile,
    viewedProfileLoading,
    viewedProfileInfo,
    viewedProfileStats,
    userProfileThreads,
    userProfileBadges,
    openUserProfile
  }
}
