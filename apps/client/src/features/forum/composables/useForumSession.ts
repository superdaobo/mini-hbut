// 论坛会话：组合壳创建一次，各领域 composable 共享同一份 client / 缓存 / 登录态
// 描述：承担 API 客户端构建、缓存读写、防重复提交与登录引导等横切能力。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { fetchRemoteConfig } from '../../../utils/remote_config'
import {
  buildForumApiBase,
  createForumApiClient,
  loadForumAdminSecret,
  readForumProfile
} from '../../../utils/forum_api'
import { clearForumCache, createForumCache, createForumPendingActions, withForumCache } from '../../../utils/forum_cache'
import { showToast, type ToastType } from '../../../utils/toast'
import type { ForumProfile } from '../types'
import { toText } from '../utils/format'
import type { ForumApiClient } from '../api/facade'
import type { ForumCacheEntry } from '../../../utils/forum_cache'

/** 论坛缓存实例（forum_cache.js 的 createForumCache 返回类型） */
export type ForumCache = ReturnType<typeof createForumCache>

/** 会话中暴露给领域 composable 的共享能力 */
export interface ForumSession {
  studentId: string
  emit: (event: string, ...args: unknown[]) => void
  profile: Ref<ForumProfile>
  forumEnabled: Ref<boolean>
  apiBase: Ref<string>
  errorMessage: Ref<string>
  pendingActions: Ref<Set<string>>
  isLoggedIn: ComputedRef<boolean>
  adminFlag: Ref<boolean>
  client: ForumApiClient | null
  forumCache: ForumCache | null
  buildClient: () => Promise<void>
  cached: <T>(scope: string, fetcher: (ctx: { etag?: string }) => Promise<T>, ttlMs?: number) => Promise<T>
  invalidateForumCache: (scopes?: string[]) => void
  isPending: (key: string) => boolean
  runPending: (key: string, task: () => Promise<void>, duplicateMessage?: string) => Promise<void>
  requireLogin: () => boolean
  toast: (message: string, type?: 'success' | 'warning' | 'info' | 'error') => void
}

/** 创建论坛会话（在组合壳内调用一次） */
export const createForumSession = (props: { studentId: string }, emit: (event: string, ...args: unknown[]) => void): ForumSession => {
  const studentId = String(props.studentId || '')
  const profile = ref<ForumProfile>(readForumProfile(studentId))
  // 管理员口令加密存储在 localStorage（不明文，设备密钥与密文同存：仅降低静态泄露风险，非 XSS 安全边界），进入页面时异步恢复以便回填
  loadForumAdminSecret(studentId).then((secret) => {
    if (secret) profile.value.admin_secret = secret
  })

  const forumEnabled = ref(true)
  const apiBase = ref('')
  const errorMessage = ref('')
  const pendingActions = ref(new Set<string>())
  const adminFlag = ref(false)

  const isLoggedIn = computed(() => !!String(studentId || '').trim())

  let client: ForumApiClient | null = null
  let forumCache: ForumCache | null = null
  let pendingGuard: ReturnType<typeof createForumPendingActions> | null = null

  const syncPendingActions = (next: Set<string>) => {
    pendingActions.value = next
  }

  const ensurePendingGuard = () => {
    if (!pendingGuard) {
      pendingGuard = createForumPendingActions({
        // showToast 的 type 为受限 ToastType，notify 接受 string：适配并归一化非法值
        notify: (message: string, type?: string) => {
          showToast(message, (type || undefined) as ToastType | undefined)
        },
        onChange: syncPendingActions
      })
    }
    return pendingGuard
  }

  const isPending = (key: string): boolean => {
    ensurePendingGuard()
    return pendingActions.value.has(toText(key))
  }

  const runPending = async (key: string, task: () => Promise<void>, duplicateMessage = '正在处理，请勿重复点击'): Promise<void> => {
    await ensurePendingGuard().run(key, task, { duplicateMessage })
  }

  const requireLogin = (): boolean => {
    showToast('请先登录后再使用社区功能', 'warning')
    emit('require-login')
    return false
  }

  const cached = <T>(scope: string, fetcher: (ctx: { etag?: string }) => Promise<T>, ttlMs = 60_000): Promise<T> => {
    if (!forumCache) return fetcher({})
    // withForumCache 以 unknown 实例化，再收窄为调用方期望的 T（本地 ForumCache 为非泛型别名，避免直接参数化）
    return withForumCache<unknown>(
      forumCache,
      scope,
      fetcher as (ctx: { etag: string; cached?: ForumCacheEntry<unknown> | null }) => Promise<unknown | { value: unknown; etag?: string; notModified?: boolean }>,
      { ttlMs }
    ) as Promise<T>
  }

  const invalidateForumCache = (scopes = ['feed', 'hot', 'thread', 'me', 'notice', 'message', 'admin', 'poll']) => {
    if (forumCache) clearForumCache(forumCache, scopes)
  }

  const buildClient = async (): Promise<void> => {
    const config = await fetchRemoteConfig()
    forumEnabled.value = config?.forum?.enabled !== false
    apiBase.value = buildForumApiBase(config?.forum)
    client = createForumApiClient({
      apiBase: apiBase.value,
      studentId,
      nickname: profile.value.nickname,
      avatarUrl: profile.value.avatar_url,
      bio: profile.value.bio,
      adminSecret: await loadForumAdminSecret(studentId)
    })
    forumCache = createForumCache({
      studentId: studentId || 'guest',
      apiBase: apiBase.value
    })
  }

  const session: ForumSession = {
    studentId,
    emit,
    profile,
    forumEnabled,
    apiBase,
    errorMessage,
    pendingActions,
    isLoggedIn,
    adminFlag,
    get client() {
      return client
    },
    set client(value: ForumApiClient | null) {
      client = value
    },
    get forumCache() {
      return forumCache
    },
    set forumCache(value: ForumCache | null) {
      forumCache = value
    },
    buildClient,
    cached,
    invalidateForumCache,
    isPending,
    runPending,
    requireLogin,
    toast: showToast
  }
  return session
}
