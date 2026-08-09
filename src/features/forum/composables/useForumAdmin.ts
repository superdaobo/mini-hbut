// 论坛管理后台领域：举报队列、用户治理、封禁、徽章、备份
// 描述：loadAdmin/runBackup/setUserBan/grantBadge 保持原 ForumView 行为与缓存键。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { AdminBackup, AdminReport, AdminUser } from '../types'
import type { ForumSession } from './useForumSession'

/** 管理领域依赖 */
export interface ForumAdminDeps {
  /** 当前投票统计（由 useForumPolls 提供） */
  pollCount: ComputedRef<{ total: number; active: number; closed: number; votes: number }>
}

/** 管理领域状态与动作 */
export interface ForumAdmin {
  adminReports: Ref<AdminReport[]>
  adminUsers: Ref<AdminUser[]>
  adminBackups: Ref<AdminBackup[]>
  adminSearch: Ref<string>
  banDraft: Ref<{ student_id: string; reason: string }>
  badgeDraft: Ref<{ student_id: string; badge_key: string; display_name: string }>
  adminSummary: ComputedRef<{ reportCount: number; userCount: number; bannedCount: number; backupCount: number; pollCount: number }>
  latestBackup: ComputedRef<AdminBackup | null>
  loadAdmin: (options?: { force?: boolean }) => Promise<void>
  searchAdminUsers: () => Promise<void>
  setUserBan: (banned: boolean) => Promise<void>
  grantBadge: () => Promise<void>
  runBackup: () => Promise<void>
}

/** 创建管理领域 composable */
export const useForumAdmin = (session: ForumSession, deps: ForumAdminDeps): ForumAdmin => {
  const adminReports = ref<AdminReport[]>([])
  const adminUsers = ref<AdminUser[]>([])
  const adminBackups = ref<AdminBackup[]>([])
  const adminSearch = ref('')
  const banDraft = ref({ student_id: '', reason: '' })
  const badgeDraft = ref({ student_id: '', badge_key: 'helper', display_name: '热心同学' })

  const adminSummary = computed(() => ({
    reportCount: adminReports.value.length,
    userCount: adminUsers.value.length,
    bannedCount: adminUsers.value.filter((user) => Number(user.is_banned || 0)).length,
    backupCount: adminBackups.value.length,
    pollCount: deps.pollCount.value.total
  }))
  const latestBackup = computed(() => adminBackups.value[0] || null)

  const loadAdmin = async ({ force = false } = {}): Promise<void> => {
    if (!session.client || !session.isLoggedIn.value || !session.adminFlag.value) return
    if (force) session.invalidateForumCache(['admin'])
    const settled = await Promise.allSettled([
      session.cached('admin:reports', ({ etag }) => session.client!.listAdminReports({ limit: 50 }, { includeMeta: true, etag }), 20_000),
      session.cached(`admin:users:${adminSearch.value}`, ({ etag }) => session.client!.listAdminUsers({ query: adminSearch.value }, { includeMeta: true, etag }), 20_000),
      session.cached('admin:backups', ({ etag }) => session.client!.listAdminBackups({ limit: 20 }, { includeMeta: true, etag }), 30_000)
    ])
    const itemsOf = <T>(value: unknown, fallback: T[] = []): T[] => (Array.isArray(value) ? (value as T[]) : fallback)
    if (settled[0].status === 'fulfilled') adminReports.value = itemsOf((settled[0].value as { items?: unknown } | undefined)?.items)
    if (settled[1].status === 'fulfilled') adminUsers.value = itemsOf((settled[1].value as { items?: unknown } | undefined)?.items)
    if (settled[2].status === 'fulfilled') adminBackups.value = itemsOf((settled[2].value as { items?: unknown } | undefined)?.items)
  }

  const searchAdminUsers = async (): Promise<void> => {
    await loadAdmin({ force: true })
  }

  const setUserBan = async (banned: boolean): Promise<void> => {
    const studentId = banDraft.value.student_id.trim()
    if (!studentId) {
      session.toast('请填写学号', 'warning')
      return
    }
    if (session.isPending(`admin:ban:${studentId}:${banned}`)) return
    await session.runPending(`admin:ban:${studentId}:${banned}`, async () => {
      await session.client!.setUserBan({ student_id: studentId, banned, reason: banDraft.value.reason.trim() })
      session.invalidateForumCache(['admin'])
      session.toast(banned ? '已封禁用户' : '已解除封禁', 'success')
      await loadAdmin({ force: true })
    })
  }

  const grantBadge = async (): Promise<void> => {
    const payload = {
      student_id: badgeDraft.value.student_id.trim(),
      badge_key: badgeDraft.value.badge_key.trim(),
      display_name: badgeDraft.value.display_name.trim()
    }
    if (!payload.student_id || !payload.badge_key || !payload.display_name) {
      session.toast('请填写完整徽章信息', 'warning')
      return
    }
    if (session.isPending(`admin:badge:${payload.student_id}:${payload.badge_key}`)) return
    await session.runPending(`admin:badge:${payload.student_id}:${payload.badge_key}`, async () => {
      await session.client!.grantBadge(payload)
      session.invalidateForumCache(['admin'])
      session.toast('徽章已发放', 'success')
    })
  }

  const runBackup = async (): Promise<void> => {
    if (!session.adminFlag.value) return
    await session.runPending('admin:backup', async () => {
      await session.client!.runBackup()
      session.invalidateForumCache(['admin'])
      session.toast('备份任务已触发', 'success')
      await loadAdmin({ force: true })
    })
  }

  return {
    adminReports,
    adminUsers,
    adminBackups,
    adminSearch,
    banDraft,
    badgeDraft,
    adminSummary,
    latestBackup,
    loadAdmin,
    searchAdminUsers,
    setUserBan,
    grantBadge,
    runBackup
  }
}
