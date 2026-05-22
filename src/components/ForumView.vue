<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { TPageHeader } from './templates'
import { fetchRemoteConfig } from '../utils/remote_config'
import {
  buildForumApiBase,
  createForumApiClient,
  readForumProfile,
  writeForumProfile
} from '../utils/forum_api'
import { clearForumCache, createForumCache, withForumCache } from '../utils/forum_cache'
import { showToast } from '../utils/toast'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'require-login'])

const fallbackCategories = [
  { id: 1, slug: 'campus', name: '校园广场', description: '校园日常、资讯和闲聊' },
  { id: 2, slug: 'study', name: '学习互助', description: '课程、考试、资料和选课交流' },
  { id: 3, slug: 'life', name: '生活服务', description: '宿舍、食堂、二手和校园生活' },
  { id: 4, slug: 'help', name: '软件反馈', description: 'Mini-HBUT 使用反馈和建议' }
]

const tabs = [
  { key: 'feed', label: '广场', icon: 'forum' },
  { key: 'compose', label: '发帖', icon: 'edit_square' },
  { key: 'notice', label: '通知', icon: 'notifications' },
  { key: 'me', label: '我的', icon: 'person' },
  { key: 'admin', label: '管理', icon: 'admin_panel_settings' }
]

const forumEnabled = ref(true)
const apiBase = ref('')
const activeTab = ref('feed')
const categories = ref([])
const threads = ref([])
const hotThreads = ref([])
const selectedCategoryId = ref(0)
const selectedThread = ref(null)
const threadDetail = ref(null)
const loading = ref(false)
const refreshing = ref(false)
const detailLoading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const replyContent = ref('')
const replyFiles = ref([])
const threadFiles = ref([])
const profile = ref(readForumProfile(props.studentId))
const meSummary = ref(null)
const myThreads = ref([])
const myReplies = ref([])
const myBookmarks = ref([])
const notifications = ref([])
const messages = ref([])
const badges = ref([])
const adminReports = ref([])
const adminUsers = ref([])
const adminBackups = ref([])
const adminSearch = ref('')
const messageDraft = ref({ receiver_student_id: '', content: '' })
const banDraft = ref({ student_id: '', reason: '' })
const badgeDraft = ref({ student_id: '', badge_key: 'helper', display_name: '热心同学' })
const pendingActions = ref(new Set())
const newThread = ref({
  title: '',
  content_md: '',
  score: 8
})

let client = null
let forumCache = null

const isLoggedIn = computed(() => !!String(props.studentId || '').trim())
const hasRemoteCategories = computed(() => categories.value.length > 0)
const visibleCategories = computed(() => categories.value.length ? categories.value : fallbackCategories)
const selectedCategory = computed(() =>
  visibleCategories.value.find((item) => Number(item.id) === Number(selectedCategoryId.value)) || visibleCategories.value[0]
)
const isAdmin = computed(() => {
  const profileValue = meSummary.value?.profile || {}
  return profileValue.is_admin === true || Number(profileValue.is_admin || 0) === 1
})
const visibleTabs = computed(() => tabs.filter((tab) => tab.key !== 'admin' || isAdmin.value))
const bookmarkedIds = computed(() => new Set(myBookmarks.value.map((thread) => Number(thread.id))))
const displayThreads = computed(() => threads.value.length ? threads.value : hotThreads.value)
const unreadCount = computed(() => notifications.value.filter((item) => !Number(item.is_read || 0)).length)
const canPublishThread = computed(() => forumEnabled.value && isLoggedIn.value && hasRemoteCategories.value)
const composerHint = computed(() => {
  if (!forumEnabled.value) return '论坛暂未开放'
  if (!isLoggedIn.value) return '登录后可以发帖、评分、收藏和回复'
  if (!hasRemoteCategories.value) return '版块初始化中，请稍后刷新'
  return ''
})

const toText = (value) => (value == null ? '' : String(value))

const initials = (value) => {
  const text = toText(value).trim()
  return text ? text.slice(0, 2).toUpperCase() : 'HB'
}

const authorName = (studentId) => {
  const text = toText(studentId).trim()
  if (!text) return '匿名同学'
  if (text === String(props.studentId || '').trim()) return profile.value.nickname || text
  return text
}

const formatTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const categoryName = (categoryId) =>
  visibleCategories.value.find((item) => Number(item.id) === Number(categoryId))?.name || '社区'

const attachmentUrl = (attachmentId) => client?.getAttachmentUrl?.(attachmentId) || ''

const setPending = (key, active) => {
  const next = new Set(pendingActions.value)
  if (active) next.add(key)
  else next.delete(key)
  pendingActions.value = next
}

const isPending = (key) => pendingActions.value.has(key)

const runPending = async (key, task, duplicateMessage = '正在处理，请勿重复点击') => {
  if (isPending(key)) {
    showToast(duplicateMessage, 'info')
    return null
  }
  setPending(key, true)
  try {
    return await task()
  } finally {
    setPending(key, false)
  }
}

const requireLogin = () => {
  showToast('请先登录后再使用社区功能', 'warning')
  emit('require-login')
  return false
}

const cached = (scope, fetcher, ttlMs = 60_000) => {
  if (!forumCache) return fetcher()
  return withForumCache(forumCache, scope, fetcher, { ttlMs })
}

const invalidateForumCache = (scopes = ['feed', 'hot', 'thread', 'me', 'notice', 'message', 'admin']) => {
  if (forumCache) clearForumCache(forumCache, scopes)
}

const buildClient = async () => {
  const config = await fetchRemoteConfig()
  forumEnabled.value = config?.forum?.enabled !== false
  apiBase.value = buildForumApiBase(config?.forum)
  client = createForumApiClient({
    apiBase: apiBase.value,
    studentId: props.studentId,
    nickname: profile.value.nickname,
    avatarUrl: profile.value.avatar_url,
    bio: profile.value.bio
  })
  forumCache = createForumCache({
    studentId: props.studentId || 'guest',
    apiBase: apiBase.value
  })
}

const seedDefaultCategories = async () => {
  if (!client || !isLoggedIn.value) return
  for (const category of fallbackCategories) {
    try {
      await client.createCategory({
        slug: category.slug,
        name: category.name,
        description: category.description
      })
    } catch {
      return
    }
  }
}

const loadMe = async ({ force = false } = {}) => {
  if (!client || !isLoggedIn.value) return
  if (force) invalidateForumCache(['me', 'notice', 'message', 'admin'])
  const settled = await Promise.allSettled([
    cached('me:summary', () => client.getMeSummary(), 30_000),
    cached('me:threads', () => client.listMyThreads(30), 30_000),
    cached('me:replies', () => client.listMyReplies(30), 30_000),
    cached('me:bookmarks', () => client.listMyBookmarks(50), 30_000),
    cached('notice:list', () => client.listNotifications(), 20_000),
    cached('message:list', () => client.listMessages(), 15_000),
    cached('me:badges', () => client.listBadges(), 60_000)
  ])
  if (settled[0].status === 'fulfilled') meSummary.value = settled[0].value
  if (settled[1].status === 'fulfilled') myThreads.value = settled[1].value?.items || []
  if (settled[2].status === 'fulfilled') myReplies.value = settled[2].value?.items || []
  if (settled[3].status === 'fulfilled') myBookmarks.value = settled[3].value?.items || []
  if (settled[4].status === 'fulfilled') notifications.value = settled[4].value?.items || []
  if (settled[5].status === 'fulfilled') messages.value = settled[5].value?.items || []
  if (settled[6].status === 'fulfilled') badges.value = settled[6].value?.items || []
  if (isAdmin.value) await loadAdmin({ force })
}

const loadAdmin = async ({ force = false } = {}) => {
  if (!client || !isLoggedIn.value || !isAdmin.value) return
  if (force) invalidateForumCache(['admin'])
  const settled = await Promise.allSettled([
    cached('admin:reports', () => client.listAdminReports(50), 20_000),
    cached(`admin:users:${adminSearch.value}`, () => client.listAdminUsers(adminSearch.value), 20_000),
    cached('admin:backups', () => client.listAdminBackups(20), 30_000)
  ])
  if (settled[0].status === 'fulfilled') adminReports.value = settled[0].value?.items || []
  if (settled[1].status === 'fulfilled') adminUsers.value = settled[1].value?.items || []
  if (settled[2].status === 'fulfilled') adminBackups.value = settled[2].value?.items || []
}

const loadThreads = async ({ force = false } = {}) => {
  if (!client || !forumEnabled.value) return
  if (force) invalidateForumCache(['feed', 'hot'])
  const categoryId = hasRemoteCategories.value ? selectedCategoryId.value || selectedCategory.value?.id : 0
  const query = searchQuery.value.trim()
  const scope = query ? `feed:search:${categoryId}:${query}` : `feed:${categoryId || 'all'}`
  try {
    const payload = await cached(scope, () => {
      if (query) return client.searchThreads({ q: query, categoryId, limit: 40 })
      return client.listThreads({ categoryId, limit: 40 })
    }, 45_000)
    threads.value = Array.isArray(payload?.items) ? payload.items : []
  } catch (error) {
    errorMessage.value = error?.message || '帖子列表加载失败'
  }
}

const loadForumData = async ({ force = false } = {}) => {
  if (!forumEnabled.value && client) return
  loading.value = !force
  refreshing.value = force
  errorMessage.value = ''
  try {
    if (!client) await buildClient()
    if (force) invalidateForumCache()
    const [categoryPayload, hotPayload] = await Promise.all([
      cached('categories', () => client.listCategories(), 120_000),
      cached('hot:threads', () => client.listHotThreads(20), 30_000)
    ])
    categories.value = Array.isArray(categoryPayload?.items) ? categoryPayload.items : []
    if (!categories.value.length) {
      await seedDefaultCategories()
      const seededPayload = await client.listCategories()
      categories.value = Array.isArray(seededPayload?.items) ? seededPayload.items : []
    }
    hotThreads.value = Array.isArray(hotPayload?.items) ? hotPayload.items : []
    if (!selectedCategoryId.value && visibleCategories.value[0]) {
      selectedCategoryId.value = Number(visibleCategories.value[0].id)
    }
    await Promise.all([loadThreads({ force }), loadMe({ force })])
  } catch (error) {
    errorMessage.value = error?.message || '论坛加载失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const chooseCategory = async (category) => {
  selectedCategoryId.value = Number(category?.id || 0)
  selectedThread.value = null
  threadDetail.value = null
  activeTab.value = 'feed'
  await loadThreads()
}

const runSearch = async () => {
  activeTab.value = 'feed'
  await loadThreads({ force: true })
}

const openThread = async (thread) => {
  if (!client || !thread?.id) return
  selectedThread.value = thread
  threadDetail.value = null
  detailLoading.value = true
  activeTab.value = 'detail'
  try {
    const detail = await cached(`thread:${thread.id}`, () => client.getThread(thread.id), 20_000)
    threadDetail.value = detail
    selectedThread.value = detail?.thread || thread
  } catch (error) {
    errorMessage.value = error?.message || '帖子详情加载失败'
  } finally {
    detailLoading.value = false
  }
}

const closeThread = () => {
  selectedThread.value = null
  threadDetail.value = null
  replyContent.value = ''
  replyFiles.value = []
  activeTab.value = 'feed'
}

const uploadFiles = async (files) => {
  const uploaded = []
  for (const file of files || []) {
    const payload = await client.uploadAttachment(file)
    if (payload?.attachment_id) uploaded.push(payload.attachment_id)
  }
  return uploaded
}

const setThreadFiles = (event) => {
  threadFiles.value = Array.from(event?.target?.files || []).slice(0, 6)
}

const setReplyFiles = (event) => {
  replyFiles.value = Array.from(event?.target?.files || []).slice(0, 4)
}

const submitThread = async () => {
  if (!isLoggedIn.value) return requireLogin()
  if (!client) await buildClient()
  const title = newThread.value.title.trim()
  const content = newThread.value.content_md.trim()
  if (!title || !content) {
    showToast('标题和内容不能为空', 'warning')
    return
  }
  if (!canPublishThread.value) {
    showToast(composerHint.value || '暂时无法发布', 'warning')
    return
  }
  const signature = `${selectedCategoryId.value}:${title}:${content}`.slice(0, 180)
  await runPending(`thread:${signature}`, async () => {
    const attachmentIds = await uploadFiles(threadFiles.value)
    const created = await client.createThread({
      category_id: selectedCategoryId.value || selectedCategory.value?.id,
      title,
      content_md: content,
      attachment_ids: attachmentIds
    })
    if (newThread.value.score) {
      await client.scoreThread(created.id, Number(newThread.value.score))
    }
    newThread.value = { title: '', content_md: '', score: 8 }
    threadFiles.value = []
    invalidateForumCache(['feed', 'hot', 'me'])
    showToast('发布成功', 'success')
    await loadForumData({ force: true })
    await openThread(created)
  })
}

const submitReply = async () => {
  if (!isLoggedIn.value) return requireLogin()
  if (!selectedThread.value?.id) return
  const content = replyContent.value.trim()
  if (!content) {
    showToast('回复内容不能为空', 'warning')
    return
  }
  await runPending(`reply:${selectedThread.value.id}:${content.slice(0, 80)}`, async () => {
    const attachmentIds = await uploadFiles(replyFiles.value)
    await client.createReply(selectedThread.value.id, {
      content_md: content,
      attachment_ids: attachmentIds
    })
    replyContent.value = ''
    replyFiles.value = []
    invalidateForumCache(['thread', 'feed', 'hot', 'me'])
    showToast('回复已发送', 'success')
    await openThread(selectedThread.value)
  })
}

const reactToReply = async (reply, reaction) => {
  if (!isLoggedIn.value) return requireLogin()
  await runPending(`react:${reply.id}:${reaction}`, async () => {
    await client.reactToPost(reply.id, reaction)
    invalidateForumCache(['thread'])
    showToast('操作成功', 'success')
    await openThread(selectedThread.value)
  })
}

const scoreThread = async (thread, score) => {
  if (!isLoggedIn.value) return requireLogin()
  await runPending(`score:${thread.id}`, async () => {
    await client.scoreThread(thread.id, score)
    invalidateForumCache(['thread', 'feed', 'hot'])
    showToast(`已评分 ${score} 分`, 'success')
    await loadThreads({ force: true })
    if (selectedThread.value?.id === thread.id) await openThread(thread)
  })
}

const toggleBookmark = async (thread) => {
  if (!isLoggedIn.value) return requireLogin()
  const active = !bookmarkedIds.value.has(Number(thread.id))
  await runPending(`bookmark:${thread.id}`, async () => {
    await client.bookmarkThread(thread.id, active)
    invalidateForumCache(['me'])
    showToast(active ? '已收藏' : '已取消收藏', 'success')
    await loadMe({ force: true })
  })
}

const followAuthor = async (studentId) => {
  if (!isLoggedIn.value) return requireLogin()
  const target = toText(studentId).trim()
  if (!target || target === String(props.studentId || '').trim()) return
  await runPending(`follow:${target}`, async () => {
    await client.followUser(target, true)
    invalidateForumCache(['me'])
    showToast('已关注作者', 'success')
    await loadMe({ force: true })
  })
}

const reportThread = async (thread) => {
  if (!isLoggedIn.value) return requireLogin()
  await runPending(`report:${thread.id}`, async () => {
    await client.reportContent({
      target_type: 'thread',
      target_id: thread.id,
      reason: '用户从客户端举报'
    })
    invalidateForumCache(['admin'])
    showToast('举报已提交', 'success')
  })
}

const saveProfile = () => {
  profile.value = writeForumProfile(props.studentId, profile.value)
  client = null
  forumCache = null
  showToast('社区资料已保存', 'success')
  buildClient()
}

const checkIn = async () => {
  if (!isLoggedIn.value) return requireLogin()
  await runPending('checkin', async () => {
    await client.checkIn()
    invalidateForumCache(['me'])
    showToast('签到成功', 'success')
    await loadMe({ force: true })
  })
}

const sendMessage = async () => {
  if (!isLoggedIn.value) return requireLogin()
  const receiver = messageDraft.value.receiver_student_id.trim()
  const content = messageDraft.value.content.trim()
  if (!receiver || !content) {
    showToast('请填写收件人和内容', 'warning')
    return
  }
  await runPending(`message:${receiver}:${content.slice(0, 40)}`, async () => {
    await client.sendMessage({ receiver_student_id: receiver, content })
    messageDraft.value = { receiver_student_id: '', content: '' }
    invalidateForumCache(['message'])
    showToast('私信已发送', 'success')
    await loadMe({ force: true })
  })
}

const runBackup = async () => {
  if (!isAdmin.value) return
  await runPending('admin:backup', async () => {
    await client.runBackup()
    invalidateForumCache(['admin'])
    showToast('备份任务已触发', 'success')
    await loadAdmin({ force: true })
  })
}

const searchAdminUsers = async () => {
  await loadAdmin({ force: true })
}

const setUserBan = async (banned) => {
  const studentId = banDraft.value.student_id.trim()
  if (!studentId) {
    showToast('请填写学号', 'warning')
    return
  }
  await runPending(`admin:ban:${studentId}:${banned}`, async () => {
    await client.setUserBan({ student_id: studentId, banned, reason: banDraft.value.reason.trim() })
    invalidateForumCache(['admin'])
    showToast(banned ? '已封禁用户' : '已解除封禁', 'success')
    await loadAdmin({ force: true })
  })
}

const grantBadge = async () => {
  const payload = {
    student_id: badgeDraft.value.student_id.trim(),
    badge_key: badgeDraft.value.badge_key.trim(),
    display_name: badgeDraft.value.display_name.trim()
  }
  if (!payload.student_id || !payload.badge_key || !payload.display_name) {
    showToast('请填写完整徽章信息', 'warning')
    return
  }
  await runPending(`admin:badge:${payload.student_id}:${payload.badge_key}`, async () => {
    await client.grantBadge(payload)
    invalidateForumCache(['admin'])
    showToast('徽章已发放', 'success')
  })
}

const switchTab = async (tab) => {
  if (tab === 'compose' && !isLoggedIn.value) return requireLogin()
  if ((tab === 'notice' || tab === 'me') && !isLoggedIn.value) return requireLogin()
  if (tab === 'admin' && !isAdmin.value) return
  activeTab.value = tab
  if (tab === 'notice' || tab === 'me') await loadMe()
  if (tab === 'admin') await loadAdmin()
}

onMounted(async () => {
  await buildClient()
  await loadForumData()
})

watch(
  () => props.studentId,
  async (nextStudentId, previousStudentId) => {
    if (String(nextStudentId || '').trim() === String(previousStudentId || '').trim()) return
    profile.value = readForumProfile(props.studentId)
    client = null
    forumCache = null
    selectedThread.value = null
    threadDetail.value = null
    replyContent.value = ''
    replyFiles.value = []
    threadFiles.value = []
    meSummary.value = null
    activeTab.value = 'feed'
    await buildClient()
    await loadForumData({ force: true })
  }
)
</script>

<template>
  <div class="forum-view">
    <TPageHeader icon="forum" title="校园论坛" :show-back="false">
      <template #actions>
        <button class="forum-icon-btn" :disabled="refreshing" title="刷新" @click="loadForumData({ force: true })">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <section class="forum-hero">
      <div class="hero-avatar" aria-hidden="true">{{ initials(profile.nickname || studentId) }}</div>
      <div class="hero-copy">
        <span class="eyebrow">Mini-HBUT Community</span>
        <h2>湖工大校园广场</h2>
        <p>{{ isLoggedIn ? `${profile.nickname || studentId}，欢迎回来` : '登录后可发帖、评分、收藏、关注和私信' }}</p>
      </div>
      <button class="hero-action" :disabled="!isLoggedIn" @click="switchTab('compose')">
        <span class="material-symbols-outlined">edit_square</span>
        发布
      </button>
    </section>

    <nav class="forum-tabs" aria-label="论坛导航">
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        <span class="material-symbols-outlined">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
        <em v-if="tab.key === 'notice' && unreadCount">{{ unreadCount }}</em>
      </button>
    </nav>

    <section v-if="errorMessage" class="message-line">
      <span class="material-symbols-outlined">info</span>
      {{ errorMessage }}
    </section>

    <section v-show="activeTab === 'feed'" class="forum-shell">
      <aside class="forum-sidebar">
        <div class="section-title">
          <span>版块</span>
          <strong>{{ visibleCategories.length }}</strong>
        </div>
        <button
          v-for="category in visibleCategories"
          :key="category.slug || category.id"
          class="category-row"
          :class="{ active: Number(selectedCategoryId) === Number(category.id) }"
          @click="chooseCategory(category)"
        >
          <span class="material-symbols-outlined">tag</span>
          <span>
            <strong>{{ category.name }}</strong>
            <small>{{ category.description }}</small>
          </span>
        </button>
      </aside>

      <main class="feed-panel">
        <div class="feed-toolbar">
          <label class="search-box">
            <span class="material-symbols-outlined">search</span>
            <input id="forum-search" v-model="searchQuery" name="forum-search" placeholder="搜索帖子、评分、课程、反馈" @keyup.enter="runSearch" />
          </label>
          <button class="soft-btn" @click="runSearch">
            <span class="material-symbols-outlined">travel_explore</span>
            搜索
          </button>
        </div>

        <div class="category-strip">
          <button
            v-for="category in visibleCategories"
            :key="`chip-${category.slug || category.id}`"
            class="category-chip"
            :class="{ active: Number(selectedCategoryId) === Number(category.id) }"
            @click="chooseCategory(category)"
          >
            {{ category.name }}
          </button>
        </div>

        <div class="panel-head">
          <div>
            <span class="eyebrow">{{ searchQuery.trim() ? '搜索结果' : selectedCategory?.name || '热榜' }}</span>
            <h3>{{ searchQuery.trim() || selectedCategory?.description || '校园实时讨论' }}</h3>
          </div>
          <span>{{ displayThreads.length }} 条</span>
        </div>

        <div v-if="loading" class="loading-block">加载中...</div>
        <div v-else-if="!displayThreads.length" class="empty-block">还没有帖子，发第一条吧</div>
        <button
          v-for="thread in displayThreads"
          v-else
          :key="thread.id"
          class="thread-card"
          :class="{ active: selectedThread?.id === thread.id }"
          @click="openThread(thread)"
        >
          <div class="thread-card-head">
            <div class="mini-avatar">{{ initials(authorName(thread.author_student_id)) }}</div>
            <div>
              <strong>{{ authorName(thread.author_student_id) }}</strong>
              <small>{{ categoryName(thread.category_id) }} · {{ formatTime(thread.updated_at || thread.created_at) }}</small>
            </div>
            <span class="score-pill">{{ thread.score_avg || 0 }} 分</span>
          </div>
          <h3>{{ thread.title }}</h3>
          <p>{{ thread.content_md }}</p>
          <div v-if="thread.attachment_ids?.length" class="attachment-strip">
            <span v-for="attachment in thread.attachment_ids" :key="attachment" class="attachment-pill">
              <span class="material-symbols-outlined">image</span>
              附件
            </span>
          </div>
          <div class="thread-actions" @click.stop>
            <button @click="scoreThread(thread, 8)">
              <span class="material-symbols-outlined">star</span>
              评分
            </button>
            <button @click="toggleBookmark(thread)">
              <span class="material-symbols-outlined">{{ bookmarkedIds.has(Number(thread.id)) ? 'bookmark' : 'bookmark_add' }}</span>
              {{ bookmarkedIds.has(Number(thread.id)) ? '已收藏' : '收藏' }}
            </button>
            <button @click="followAuthor(thread.author_student_id)">
              <span class="material-symbols-outlined">person_add</span>
              关注
            </button>
          </div>
        </button>
      </main>
    </section>

    <section v-if="activeTab === 'detail'" class="detail-panel">
      <div class="detail-topbar">
        <button class="forum-icon-btn" title="返回列表" @click="closeThread">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <strong>帖子详情</strong>
        <button class="forum-icon-btn" title="举报" @click="reportThread(threadDetail?.thread || selectedThread)">
          <span class="material-symbols-outlined">flag</span>
        </button>
      </div>

      <div v-if="detailLoading" class="loading-block">加载中...</div>
      <article v-else-if="selectedThread" class="detail-card">
        <div class="thread-card-head">
          <div class="mini-avatar large">{{ initials(authorName(selectedThread.author_student_id)) }}</div>
          <div>
            <strong>{{ authorName(selectedThread.author_student_id) }}</strong>
            <small>{{ categoryName(selectedThread.category_id) }} · {{ formatTime(selectedThread.created_at) }}</small>
          </div>
          <span class="score-pill">{{ selectedThread.score_avg || 0 }} 分</span>
        </div>
        <h2>{{ threadDetail?.thread?.title || selectedThread.title }}</h2>
        <p class="detail-content">{{ threadDetail?.thread?.content_md || selectedThread.content_md }}</p>
        <div v-if="(threadDetail?.thread?.attachment_ids || selectedThread.attachment_ids || []).length" class="image-grid">
          <a
            v-for="attachment in (threadDetail?.thread?.attachment_ids || selectedThread.attachment_ids || [])"
            :key="attachment"
            :href="attachmentUrl(attachment)"
            target="_blank"
            rel="noreferrer"
          >
            <img :src="attachmentUrl(attachment)" alt="帖子附件" @error="$event.target.classList.add('broken')" />
            <span>查看附件</span>
          </a>
        </div>
        <div class="score-actions">
          <button v-for="score in [1, 3, 5, 8, 10]" :key="score" @click="scoreThread(threadDetail?.thread || selectedThread, score)">
            {{ score }} 分
          </button>
          <button @click="toggleBookmark(threadDetail?.thread || selectedThread)">
            <span class="material-symbols-outlined">bookmark</span>
            收藏
          </button>
        </div>

        <div class="reply-box">
          <textarea id="forum-reply-content" v-model="replyContent" name="forum-reply-content" rows="3" placeholder="写回复..." />
          <div class="reply-tools">
            <label class="file-btn">
              <span class="material-symbols-outlined">add_photo_alternate</span>
              <input type="file" multiple accept="image/*,.pdf,.txt,.zip" @change="setReplyFiles" />
            </label>
            <button class="primary-btn" :disabled="isPending(`reply:${selectedThread.id}:${replyContent.trim().slice(0, 80)}`)" @click="submitReply">回复</button>
          </div>
        </div>
        <div v-if="replyFiles.length" class="file-list">{{ replyFiles.length }} 个附件待上传</div>

        <div class="reply-list">
          <article v-for="reply in threadDetail?.replies || []" :key="reply.id" class="reply-card">
            <div class="thread-card-head compact">
              <div class="mini-avatar">{{ initials(authorName(reply.author_student_id)) }}</div>
              <div>
                <strong>{{ authorName(reply.author_student_id) }}</strong>
                <small>{{ formatTime(reply.created_at) }}</small>
              </div>
            </div>
            <p>{{ reply.content_md }}</p>
            <div v-if="reply.attachment_ids?.length" class="attachment-strip">
              <a v-for="attachment in reply.attachment_ids" :key="attachment" :href="attachmentUrl(attachment)" target="_blank" rel="noreferrer">附件</a>
            </div>
            <div class="reply-actions">
              <button @click="reactToReply(reply, 'up')">
                <span class="material-symbols-outlined">thumb_up</span>
                {{ reply.up_count || 0 }}
              </button>
              <button @click="reactToReply(reply, 'down')">
                <span class="material-symbols-outlined">thumb_down</span>
                {{ reply.down_count || 0 }}
              </button>
            </div>
          </article>
          <div v-if="threadDetail && !threadDetail.replies?.length" class="empty-block">暂无回复</div>
        </div>
      </article>
    </section>

    <section v-if="activeTab === 'compose'" class="compose-panel">
      <div class="panel-head">
        <div>
          <span class="eyebrow">Create Post</span>
          <h3>发布校园帖子</h3>
        </div>
        <span>{{ newThread.content_md.length }}/20000</span>
      </div>
      <label class="field">
        <span>版块</span>
        <select v-model.number="selectedCategoryId">
          <option v-for="category in visibleCategories" :key="category.id" :value="Number(category.id)">{{ category.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>标题</span>
        <input id="forum-thread-title" v-model="newThread.title" name="forum-thread-title" maxlength="160" placeholder="清晰描述你的问题或观点" />
      </label>
      <label class="field">
        <span>内容</span>
        <textarea id="forum-thread-content" v-model="newThread.content_md" name="forum-thread-content" rows="8" maxlength="20000" placeholder="分享经验、提问、反馈或发起评分讨论" />
      </label>
      <div class="compose-grid">
        <label class="field score-field">
          <span>初始评分</span>
          <input id="forum-thread-score" v-model.number="newThread.score" name="forum-thread-score" type="number" min="1" max="10" />
        </label>
        <label class="upload-drop">
          <span class="material-symbols-outlined">cloud_upload</span>
          <strong>上传图片/附件</strong>
          <small>{{ threadFiles.length ? `${threadFiles.length} 个文件待上传` : '图片会走后端图床接口' }}</small>
          <input type="file" multiple accept="image/*,.pdf,.txt,.zip" @change="setThreadFiles" />
        </label>
      </div>
      <p v-if="composerHint" class="composer-hint">{{ composerHint }}</p>
      <button class="primary-btn wide" :disabled="!canPublishThread || isPending(`thread:${selectedCategoryId}:${newThread.title.trim()}:${newThread.content_md.trim()}`.slice(0, 180))" @click="submitThread">
        <span class="material-symbols-outlined">send</span>
        发布帖子
      </button>
    </section>

    <section v-if="activeTab === 'notice'" class="two-column-panel">
      <div class="surface-panel">
        <div class="panel-head">
          <h3>通知</h3>
          <span>{{ notifications.length }}</span>
        </div>
        <article v-for="notice in notifications" :key="notice.id" class="list-row">
          <span class="material-symbols-outlined">notifications</span>
          <div>
            <strong>{{ notice.title }}</strong>
            <p>{{ notice.content }}</p>
            <small>{{ formatTime(notice.created_at) }}</small>
          </div>
        </article>
        <div v-if="!notifications.length" class="empty-block">暂无通知</div>
      </div>
      <div class="surface-panel">
        <div class="panel-head">
          <h3>私信</h3>
          <span>{{ messages.length }}</span>
        </div>
        <div class="message-form">
          <input v-model="messageDraft.receiver_student_id" placeholder="收件人学号" />
          <textarea v-model="messageDraft.content" rows="3" placeholder="私信内容" />
          <button class="primary-btn" @click="sendMessage">发送私信</button>
        </div>
        <article v-for="message in messages" :key="message.id" class="list-row">
          <span class="material-symbols-outlined">mail</span>
          <div>
            <strong>{{ message.sender_student_id }} → {{ message.receiver_student_id }}</strong>
            <p>{{ message.content }}</p>
            <small>{{ formatTime(message.created_at) }}</small>
          </div>
        </article>
      </div>
    </section>

    <section v-if="activeTab === 'me'" class="profile-panel">
      <div class="profile-header">
        <div class="hero-avatar">{{ initials(profile.nickname || studentId) }}</div>
        <div>
          <span class="eyebrow">Community Profile</span>
          <h3>{{ profile.nickname || studentId || '游客' }}</h3>
          <p>{{ meSummary?.profile?.bio || profile.bio || '还没有填写社区简介' }}</p>
        </div>
        <button class="soft-btn" @click="checkIn">
          <span class="material-symbols-outlined">event_available</span>
          签到
        </button>
      </div>
      <div class="stats-grid">
        <div><strong>{{ meSummary?.stats?.thread_count || 0 }}</strong><span>发帖</span></div>
        <div><strong>{{ meSummary?.stats?.reply_count || 0 }}</strong><span>回复</span></div>
        <div><strong>{{ meSummary?.stats?.bookmark_count || 0 }}</strong><span>收藏</span></div>
        <div><strong>{{ meSummary?.stats?.checkin_count || 0 }}</strong><span>签到</span></div>
      </div>
      <div class="profile-editor">
        <label class="field">
          <span>昵称</span>
          <input id="forum-profile-nickname" v-model="profile.nickname" name="forum-profile-nickname" maxlength="80" />
        </label>
        <label class="field">
          <span>头像 URL</span>
          <input id="forum-profile-avatar" v-model="profile.avatar_url" name="forum-profile-avatar" maxlength="500" placeholder="可填后端图床或外部图片 URL" />
        </label>
        <label class="field">
          <span>简介</span>
          <input v-model="profile.bio" maxlength="300" placeholder="社区简介" />
        </label>
        <button class="primary-btn" @click="saveProfile">保存资料</button>
      </div>
      <div class="badge-row">
        <span v-for="badge in badges" :key="badge.badge_key" class="badge-pill">{{ badge.display_name }}</span>
        <span v-if="!badges.length" class="badge-pill muted">暂无徽章</span>
      </div>
      <div class="my-content-grid">
        <div class="surface-panel">
          <h3>我的帖子</h3>
          <button v-for="thread in myThreads" :key="thread.id" class="compact-thread" @click="openThread(thread)">{{ thread.title }}</button>
          <div v-if="!myThreads.length" class="empty-block small">暂无帖子</div>
        </div>
        <div class="surface-panel">
          <h3>我的收藏</h3>
          <button v-for="thread in myBookmarks" :key="thread.id" class="compact-thread" @click="openThread(thread)">{{ thread.title }}</button>
          <div v-if="!myBookmarks.length" class="empty-block small">暂无收藏</div>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'admin' && isAdmin" class="admin-panel">
      <div class="panel-head">
        <div>
          <span class="eyebrow">Admin Center</span>
          <h3>社区管理中心</h3>
        </div>
        <button class="soft-btn" @click="runBackup">
          <span class="material-symbols-outlined">backup</span>
          备份
        </button>
      </div>
      <div class="admin-grid">
        <div class="surface-panel">
          <h3>举报</h3>
          <article v-for="report in adminReports" :key="report.id" class="list-row">
            <span class="material-symbols-outlined">flag</span>
            <div>
              <strong>{{ report.target_type }} #{{ report.target_id }}</strong>
              <p>{{ report.reason }}</p>
              <small>{{ report.reporter_student_id }} · {{ formatTime(report.created_at) }}</small>
            </div>
          </article>
          <div v-if="!adminReports.length" class="empty-block small">暂无举报</div>
        </div>
        <div class="surface-panel">
          <h3>用户</h3>
          <div class="inline-form">
            <input v-model="adminSearch" placeholder="搜索学号/昵称" @keyup.enter="searchAdminUsers" />
            <button class="soft-btn" @click="searchAdminUsers">搜索</button>
          </div>
          <article v-for="user in adminUsers" :key="user.student_id" class="list-row">
            <span class="material-symbols-outlined">person</span>
            <div>
              <strong>{{ user.nickname || user.student_id }}</strong>
              <p>{{ user.student_id }} · {{ Number(user.is_banned || 0) ? '已封禁' : '正常' }}</p>
            </div>
          </article>
        </div>
        <div class="surface-panel">
          <h3>封禁</h3>
          <input v-model="banDraft.student_id" placeholder="目标学号" />
          <input v-model="banDraft.reason" placeholder="原因，可选" />
          <div class="button-row">
            <button class="danger-btn" @click="setUserBan(true)">封禁</button>
            <button class="soft-btn" @click="setUserBan(false)">解封</button>
          </div>
        </div>
        <div class="surface-panel">
          <h3>徽章</h3>
          <input v-model="badgeDraft.student_id" placeholder="目标学号" />
          <input v-model="badgeDraft.badge_key" placeholder="badge_key" />
          <input v-model="badgeDraft.display_name" placeholder="展示名" />
          <button class="primary-btn" @click="grantBadge">发放徽章</button>
        </div>
        <div class="surface-panel span-2">
          <h3>备份记录</h3>
          <article v-for="backup in adminBackups" :key="backup.id" class="list-row">
            <span class="material-symbols-outlined">database</span>
            <div>
              <strong>{{ backup.kind }} · {{ formatTime(backup.created_at) }}</strong>
              <p>{{ backup.hf_path || backup.sqlite_path }}</p>
            </div>
          </article>
          <div v-if="!adminBackups.length" class="empty-block small">暂无备份</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.forum-view {
  --forum-primary: #0058be;
  --forum-primary-strong: #004395;
  --forum-surface: #f6fafe;
  --forum-card: #ffffff;
  --forum-soft: #f0f4f8;
  --forum-border: #c2c6d6;
  --forum-text: #171c1f;
  --forum-muted: #5e6572;
  min-height: 100%;
  padding: 0 14px 124px;
  color: var(--forum-text);
  background: var(--forum-surface);
}

.forum-icon-btn,
.soft-btn,
.hero-action,
.primary-btn,
.danger-btn,
.category-row,
.category-chip,
.thread-card,
.compact-thread {
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease, opacity 180ms ease;
}

.forum-icon-btn {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(114, 119, 133, 0.28);
  border-radius: 14px;
  background: var(--forum-card);
  color: var(--forum-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.forum-icon-btn:disabled,
.primary-btn:disabled,
.hero-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.forum-hero,
.forum-tabs,
.forum-sidebar,
.feed-panel,
.detail-panel,
.compose-panel,
.surface-panel,
.profile-panel,
.admin-panel,
.message-line {
  border: 1px solid rgba(194, 198, 214, 0.76);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 32px rgba(0, 88, 190, 0.08);
}

.forum-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  padding: 16px;
  border-radius: 24px;
}

.hero-avatar,
.mini-avatar {
  flex: 0 0 auto;
  width: 54px;
  height: 54px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: #d8e2ff;
  color: #001a42;
  font-weight: 800;
}

.mini-avatar {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  font-size: 0.82rem;
}

.mini-avatar.large {
  width: 48px;
  height: 48px;
}

.hero-copy {
  min-width: 0;
}

.eyebrow {
  color: var(--forum-primary);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
}

.hero-copy h2,
.panel-head h3,
.profile-header h3,
.detail-card h2,
.surface-panel h3,
.admin-panel h3 {
  margin: 0;
  line-height: 1.22;
}

.hero-copy h2 {
  font-size: 1.34rem;
}

.hero-copy p,
.profile-header p,
.list-row p,
.thread-card p,
.detail-content,
.composer-hint {
  color: var(--forum-muted);
  line-height: 1.55;
}

.hero-copy p {
  margin: 3px 0 0;
  font-size: 0.9rem;
}

.hero-action,
.primary-btn,
.danger-btn,
.soft-btn {
  min-height: 40px;
  border-radius: 14px;
  border: 1px solid transparent;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-weight: 800;
}

.hero-action,
.primary-btn {
  background: var(--forum-primary);
  color: #ffffff;
}

.primary-btn.wide {
  width: 100%;
  min-height: 48px;
}

.soft-btn {
  background: #edf3ff;
  color: var(--forum-primary-strong);
  border-color: rgba(0, 88, 190, 0.16);
}

.danger-btn {
  background: #ffdad6;
  color: #93000a;
}

.forum-tabs {
  position: sticky;
  top: 6px;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  margin-top: 12px;
  padding: 6px;
  border-radius: 22px;
}

.forum-tabs button {
  min-width: 0;
  min-height: 46px;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--forum-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-weight: 800;
  cursor: pointer;
  position: relative;
}

.forum-tabs button.active {
  background: var(--forum-primary);
  color: #ffffff;
}

.forum-tabs em {
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #f97316;
  color: #ffffff;
  font-size: 0.68rem;
  font-style: normal;
  display: grid;
  place-items: center;
}

.message-line {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  color: var(--forum-primary-strong);
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
}

.forum-shell {
  margin-top: 12px;
  display: grid;
  grid-template-columns: minmax(220px, 0.38fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.forum-sidebar,
.feed-panel,
.detail-panel,
.compose-panel,
.profile-panel,
.admin-panel,
.surface-panel {
  border-radius: 24px;
  padding: 14px;
}

.section-title,
.panel-head,
.detail-topbar,
.thread-card-head,
.thread-actions,
.score-actions,
.reply-actions,
.button-row,
.inline-form {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-title strong,
.panel-head > span,
.score-pill,
.badge-pill {
  border-radius: 999px;
  padding: 5px 9px;
  background: #d8e2ff;
  color: var(--forum-primary-strong);
  font-size: 0.76rem;
  font-weight: 900;
}

.category-row {
  width: 100%;
  margin-top: 8px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: var(--forum-text);
  padding: 10px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  text-align: left;
}

.category-row.active,
.category-row:hover {
  border-color: rgba(0, 88, 190, 0.22);
  background: #edf3ff;
}

.category-row small,
.thread-card small,
.list-row small {
  display: block;
  margin-top: 2px;
  color: var(--forum-muted);
  line-height: 1.35;
}

.feed-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.search-box,
.field,
.upload-drop,
.message-form {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.search-box {
  min-width: 0;
  min-height: 44px;
  border: 1px solid rgba(194, 198, 214, 0.9);
  border-radius: 16px;
  background: var(--forum-soft);
  padding: 0 12px;
  flex-direction: row;
  align-items: center;
}

.search-box input,
.field input,
.field textarea,
.field select,
.reply-box textarea,
.message-form input,
.message-form textarea,
.surface-panel input,
.surface-panel textarea,
.inline-form input {
  width: 100%;
  border: 1px solid rgba(194, 198, 214, 0.9);
  border-radius: 14px;
  background: #f8fbff;
  color: var(--forum-text);
  font: inherit;
  padding: 11px 12px;
  outline: none;
}

.search-box input {
  border: none;
  background: transparent;
  padding: 0;
}

.field span {
  color: var(--forum-muted);
  font-size: 0.78rem;
  font-weight: 900;
}

.category-strip {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.category-chip {
  flex: 0 0 auto;
  min-height: 36px;
  border: 1px solid rgba(194, 198, 214, 0.9);
  border-radius: 999px;
  background: #ffffff;
  color: var(--forum-muted);
  padding: 0 13px;
  font-weight: 800;
}

.category-chip.active {
  background: var(--forum-primary);
  color: #ffffff;
  border-color: var(--forum-primary);
}

.panel-head {
  margin: 14px 0 10px;
}

.thread-card {
  width: 100%;
  margin-top: 10px;
  border: 1px solid rgba(194, 198, 214, 0.78);
  border-radius: 22px;
  background: #ffffff;
  padding: 13px;
  text-align: left;
}

.thread-card.active,
.thread-card:hover {
  border-color: rgba(0, 88, 190, 0.42);
  background: #fbfdff;
}

.thread-card-head {
  justify-content: flex-start;
}

.thread-card h3 {
  margin: 11px 0 6px;
  font-size: 1.02rem;
  line-height: 1.35;
}

.thread-card p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  word-break: break-word;
}

.thread-actions,
.score-actions,
.reply-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 12px;
}

.thread-actions button,
.score-actions button,
.reply-actions button {
  min-height: 34px;
  border: 1px solid rgba(194, 198, 214, 0.9);
  border-radius: 999px;
  background: #ffffff;
  color: var(--forum-primary-strong);
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 800;
  cursor: pointer;
}

.attachment-strip {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.attachment-pill,
.attachment-strip a {
  min-height: 28px;
  border-radius: 999px;
  background: #f0f4f8;
  color: var(--forum-primary-strong);
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.76rem;
  font-weight: 800;
  text-decoration: none;
}

.detail-panel,
.compose-panel,
.profile-panel,
.admin-panel,
.two-column-panel {
  margin-top: 12px;
}

.detail-topbar {
  margin-bottom: 12px;
}

.detail-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-content {
  margin: 0;
  padding: 13px;
  border-radius: 18px;
  background: var(--forum-soft);
  white-space: pre-wrap;
  word-break: break-word;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
}

.image-grid a {
  min-height: 118px;
  border: 1px solid rgba(194, 198, 214, 0.86);
  border-radius: 18px;
  overflow: hidden;
  background: var(--forum-soft);
  color: var(--forum-primary-strong);
  display: grid;
  place-items: center;
  text-decoration: none;
  position: relative;
}

.image-grid img {
  width: 100%;
  height: 118px;
  object-fit: cover;
}

.image-grid img.broken {
  display: none;
}

.image-grid span {
  position: absolute;
  inset: auto 8px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  text-align: center;
  font-size: 0.76rem;
  font-weight: 900;
}

.reply-box {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.reply-tools {
  display: flex;
  gap: 8px;
}

.file-btn,
.upload-drop {
  cursor: pointer;
  position: relative;
}

.file-btn input,
.upload-drop input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.file-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: #edf3ff;
  color: var(--forum-primary-strong);
  display: grid;
  place-items: center;
}

.file-list {
  color: var(--forum-muted);
  font-size: 0.82rem;
  font-weight: 800;
}

.reply-card,
.list-row,
.compact-thread {
  border: 1px solid rgba(194, 198, 214, 0.78);
  border-radius: 18px;
  background: #ffffff;
}

.reply-card {
  margin-top: 10px;
  padding: 12px;
}

.reply-card p {
  margin: 10px 0 0;
  color: var(--forum-text);
  line-height: 1.55;
  white-space: pre-wrap;
}

.thread-card-head.compact {
  justify-content: flex-start;
}

.compose-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compose-grid {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.upload-drop {
  min-height: 92px;
  border: 1px dashed rgba(0, 88, 190, 0.44);
  border-radius: 18px;
  background: #edf3ff;
  color: var(--forum-primary-strong);
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px;
}

.upload-drop small {
  color: var(--forum-muted);
}

.composer-hint {
  margin: 0;
}

.two-column-panel,
.my-content-grid,
.admin-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.list-row {
  margin-top: 9px;
  padding: 11px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.list-row > .material-symbols-outlined {
  color: var(--forum-primary);
}

.list-row p {
  margin: 4px 0;
  word-break: break-word;
}

.message-form {
  margin: 8px 0 10px;
}

.profile-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.stats-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.stats-grid div {
  border-radius: 18px;
  background: var(--forum-soft);
  padding: 12px;
  text-align: center;
}

.stats-grid strong,
.stats-grid span {
  display: block;
}

.stats-grid strong {
  color: var(--forum-primary-strong);
  font-size: 1.2rem;
}

.stats-grid span {
  color: var(--forum-muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.profile-editor {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 10px;
  align-items: end;
}

.badge-row {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.badge-pill.muted {
  background: var(--forum-soft);
  color: var(--forum-muted);
}

.compact-thread {
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  text-align: left;
  color: var(--forum-text);
  font-weight: 800;
}

.empty-block,
.loading-block {
  min-height: 140px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--forum-muted);
  font-weight: 800;
}

.empty-block.small {
  min-height: 72px;
}

.admin-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.admin-grid .surface-panel {
  min-width: 0;
}

.span-2 {
  grid-column: span 2;
}

.surface-panel > input,
.surface-panel > .primary-btn,
.surface-panel > .button-row {
  margin-top: 8px;
}

.inline-form {
  align-items: stretch;
}

@media (max-width: 900px) {
  .forum-shell,
  .two-column-panel,
  .my-content-grid,
  .admin-grid,
  .profile-editor {
    grid-template-columns: 1fr;
  }

  .forum-sidebar {
    display: none;
  }

  .span-2 {
    grid-column: auto;
  }
}

@media (max-width: 640px) {
  .forum-view {
    padding-left: 10px;
    padding-right: 10px;
  }

  .forum-hero {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .hero-action {
    grid-column: 1 / -1;
    width: 100%;
  }

  .forum-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow-x: auto;
  }

  .forum-tabs button {
    min-width: 72px;
  }

  .feed-toolbar,
  .reply-box,
  .compose-grid,
  .profile-header,
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
