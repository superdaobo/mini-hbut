// 论坛查询领域：分类、帖子列表、热帖、搜索、刷新与分页语义
// 描述：loadForumData/loadThreads/chooseCategory/runSearch 保持原 ForumView 行为与缓存键。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ForumCategory, ForumThread } from '../types'
import type { ForumSession } from './useForumSession'

/** 未连接后端时的兜底分类 */
export const fallbackCategories: ForumCategory[] = [
  { id: 1, slug: 'campus', name: '校园广场', description: '校园日常、资讯和闲聊' },
  { id: 2, slug: 'study', name: '学习互助', description: '课程、考试、资料和选课交流' },
  { id: 3, slug: 'life', name: '生活服务', description: '宿舍、食堂、二手和校园生活' },
  { id: 4, slug: 'help', name: '软件反馈', description: 'Mini-HBUT 使用反馈和建议' }
]

/** 查询领域依赖 */
export interface ForumFeedDeps {
  /** 我的资料加载（由 useForumMe 提供） */
  loadMe: (options?: { force?: boolean }) => Promise<void>
}

/** 查询领域状态与动作 */
export interface ForumFeed {
  categories: Ref<ForumCategory[]>
  threads: Ref<ForumThread[]>
  hotThreads: Ref<ForumThread[]>
  selectedCategoryId: Ref<number>
  searchQuery: Ref<string>
  loading: Ref<boolean>
  refreshing: Ref<boolean>
  hasRemoteCategories: ComputedRef<boolean>
  visibleCategories: ComputedRef<ForumCategory[]>
  selectedCategory: ComputedRef<ForumCategory | undefined>
  displayThreads: ComputedRef<ForumThread[]>
  feedReplyCount: ComputedRef<number>
  feedAttachmentCount: ComputedRef<number>
  categoryName: (categoryId: unknown) => string
  loadForumData: (options?: { force?: boolean }) => Promise<void>
  loadThreads: (options?: { force?: boolean }) => Promise<void>
  chooseCategory: (category: ForumCategory) => Promise<void>
  runSearch: () => Promise<void>
}

/** 创建查询领域 composable */
export const useForumFeed = (session: ForumSession, deps: ForumFeedDeps): ForumFeed => {
  const categories = ref<ForumCategory[]>([])
  const threads = ref<ForumThread[]>([])
  const hotThreads = ref<ForumThread[]>([])
  const selectedCategoryId = ref(0)
  const searchQuery = ref('')
  const loading = ref(false)
  const refreshing = ref(false)

  const hasRemoteCategories = computed(() => categories.value.length > 0)
  const visibleCategories = computed(() => (categories.value.length ? categories.value : fallbackCategories))
  const selectedCategory = computed(() =>
    visibleCategories.value.find((item) => Number(item.id) === Number(selectedCategoryId.value)) || visibleCategories.value[0]
  )
  const displayThreads = computed(() => (threads.value.length ? threads.value : hotThreads.value))
  const feedReplyCount = computed(() => displayThreads.value.reduce((total, thread) => total + Number(thread.reply_count || 0), 0))
  const feedAttachmentCount = computed(() =>
    displayThreads.value.reduce((total, thread) => total + Number(thread.attachment_ids?.length || 0), 0)
  )

  const categoryName = (categoryId: unknown): string =>
    visibleCategories.value.find((item) => Number(item.id) === Number(categoryId))?.name || '社区'

  const seedDefaultCategories = async (): Promise<void> => {
    if (!session.client || !session.isLoggedIn.value) return
    for (const category of fallbackCategories) {
      try {
        await session.client.createCategory({
          slug: category.slug,
          name: category.name,
          description: category.description
        })
      } catch {
        return
      }
    }
  }

  const loadThreads = async ({ force = false } = {}): Promise<void> => {
    if (!session.client || !session.forumEnabled.value) return
    if (force) session.invalidateForumCache(['feed', 'hot'])
    const categoryId = hasRemoteCategories.value ? selectedCategoryId.value || selectedCategory.value?.id : 0
    const query = searchQuery.value.trim()
    const scope = query ? `feed:search:${categoryId}:${query}` : `feed:${categoryId || 'all'}`
    try {
      const payload = await session.cached(scope, ({ etag }) => {
        if (query) return session.client!.searchThreads({ q: query, categoryId, limit: 40 }, { includeMeta: true, etag })
        return session.client!.listThreads({ categoryId, limit: 40 }, { includeMeta: true, etag })
      }, 45_000)
      threads.value = Array.isArray(payload?.items) ? payload.items : []
    } catch (error) {
      session.errorMessage.value = (error as Error)?.message || '帖子列表加载失败'
    }
  }

  const loadForumData = async ({ force = false } = {}): Promise<void> => {
    if (!session.forumEnabled.value && session.client) return
    loading.value = !force
    refreshing.value = force
    session.errorMessage.value = ''
    try {
      if (!session.client) await session.buildClient()
      if (force) session.invalidateForumCache()
      const [categoryPayload, hotPayload] = await Promise.all([
        session.cached('categories', ({ etag }) => session.client!.listCategories({}, { includeMeta: true, etag }), 120_000),
        session.cached('hot:threads', ({ etag }) => session.client!.listHotThreads(20, { includeMeta: true, etag }), 30_000)
      ])
      categories.value = Array.isArray(categoryPayload?.items) ? categoryPayload.items : []
      if (!categories.value.length) {
        await seedDefaultCategories()
        const seededPayload = await session.client!.listCategories()
        categories.value = Array.isArray(seededPayload?.items) ? seededPayload.items : []
      }
      hotThreads.value = Array.isArray(hotPayload?.items) ? hotPayload.items : []
      if (!selectedCategoryId.value && visibleCategories.value[0]) {
        selectedCategoryId.value = Number(visibleCategories.value[0].id)
      }
      await Promise.all([loadThreads({ force }), deps.loadMe({ force })])
    } catch (error) {
      session.errorMessage.value = (error as Error)?.message || '论坛加载失败'
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  const chooseCategory = async (category: ForumCategory): Promise<void> => {
    selectedCategoryId.value = Number(category?.id || 0)
    await loadThreads()
  }

  const runSearch = async (): Promise<void> => {
    await loadThreads({ force: true })
  }

  return {
    categories,
    threads,
    hotThreads,
    selectedCategoryId,
    searchQuery,
    loading,
    refreshing,
    hasRemoteCategories,
    visibleCategories,
    selectedCategory,
    displayThreads,
    feedReplyCount,
    feedAttachmentCount,
    categoryName,
    loadForumData,
    loadThreads,
    chooseCategory,
    runSearch
  }
}
