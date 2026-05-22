<script setup>
import { computed, onMounted, ref, watch } from 'vue'
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
const viewedUserProfile = ref(null)
const viewedProfileLoading = ref(false)
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
const meStats = computed(() => meSummary.value?.stats || {})
const viewedProfileInfo = computed(() => viewedUserProfile.value?.profile || {})
const viewedProfileStats = computed(() => viewedUserProfile.value?.stats || {})

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

const uploadAvatarImage = async (event) => {
  const input = event?.target
  const file = Array.from(input?.files || [])[0]
  if (!file) return
  if (!isLoggedIn.value) {
    if (input) input.value = ''
    return requireLogin()
  }
  if (!client) await buildClient()
  try {
    await runPending('profile:avatar-upload', async () => {
      const payload = await client.uploadAttachment(file)
      const attachmentAddress = payload?.url || payload?.attachment_id
      if (!attachmentAddress) throw new Error('图床未返回头像地址')
      profile.value.avatar_url = client.getAttachmentUrl(attachmentAddress)
      showToast('头像已上传到图床，请保存资料', 'success')
    }, '头像图床上传中，请勿重复选择')
  } catch (error) {
    showToast(error?.message || '头像上传失败', 'error')
  } finally {
    if (input) input.value = ''
  }
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

const openUserProfile = async (studentId) => {
  const target = toText(studentId).trim()
  if (!target) return
  if (!client) await buildClient()
  activeTab.value = 'user-profile'
  viewedProfileLoading.value = true
  viewedUserProfile.value = null
  try {
    viewedUserProfile.value = await cached(`user-profile:${target}`, () => client.getUserProfile(target), 30_000)
  } catch (error) {
    errorMessage.value = error?.message || '用户主页加载失败'
  } finally {
    viewedProfileLoading.value = false
  }
}

const reportThread = async (thread) => {
  if (!isLoggedIn.value) return requireLogin()
  if (!thread?.id) return
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
    viewedUserProfile.value = null
    viewedProfileLoading.value = false
    activeTab.value = 'feed'
    await buildClient()
    await loadForumData({ force: true })
  }
)
</script>

<template>
  <section class="forum-view" data-stitch-design="Campus Vitality">
    <div class="forum-phone-shell">
      <header class="forum-topbar">
        <button class="avatar-button" type="button" @click="switchTab('me')">
          <span>{{ initials(profile.nickname || studentId) }}</span>
        </button>
        <h1>HBUT Forum</h1>
        <button class="icon-button" type="button" :disabled="refreshing" title="刷新" @click="loadForumData({ force: true })">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </header>

      <nav class="category-nav" aria-label="论坛版块">
        <button
          v-for="category in visibleCategories"
          :key="category.slug || category.id"
          type="button"
          :class="{ active: Number(selectedCategoryId) === Number(category.id) }"
          @click="chooseCategory(category)"
        >
          {{ category.name }}
        </button>
      </nav>

      <main class="forum-canvas">
        <section v-if="errorMessage" class="system-banner">
          <span class="material-symbols-outlined">info</span>
          <span>{{ errorMessage }}</span>
        </section>

        <section class="quick-tabs" aria-label="论坛页面">
          <button
            v-for="tab in visibleTabs"
            :key="tab.key"
            type="button"
            :class="{ active: activeTab === tab.key }"
            @click="switchTab(tab.key)"
          >
            <span class="material-symbols-outlined">{{ tab.icon }}</span>
            <span>{{ tab.label }}</span>
            <em v-if="tab.key === 'notice' && unreadCount">{{ unreadCount }}</em>
          </button>
        </section>

        <section v-show="activeTab === 'feed'" class="page-stack" data-forum-page="feed">
          <div class="forum-hero-card">
            <div>
              <span class="eyebrow">Mini-HBUT Community</span>
              <h2>湖工大校园广场</h2>
              <p>{{ isLoggedIn ? `${profile.nickname || studentId}，欢迎回来` : '登录后可发帖、评分、收藏、关注和私信' }}</p>
            </div>
            <button class="primary-pill" type="button" :disabled="!isLoggedIn" @click="switchTab('compose')">
              <span class="material-symbols-outlined">edit_square</span>
              发布
            </button>
          </div>

          <div class="search-card">
            <label>
              <span class="material-symbols-outlined">search</span>
              <input id="forum-search" v-model="searchQuery" name="forum-search" placeholder="搜索帖子、评分、课程、反馈" @keyup.enter="runSearch" />
            </label>
            <button class="icon-button tinted" type="button" @click="runSearch">
              <span class="material-symbols-outlined">travel_explore</span>
            </button>
          </div>

          <div class="section-heading">
            <div>
              <span class="eyebrow">{{ searchQuery.trim() ? 'Search Results' : selectedCategory?.name || 'Hot' }}</span>
              <h3>{{ searchQuery.trim() || selectedCategory?.description || '校园实时讨论' }}</h3>
            </div>
            <span>{{ displayThreads.length }} 条</span>
          </div>

          <div v-if="loading" class="empty-card">加载中...</div>
          <div v-else-if="!displayThreads.length" class="empty-card">
            <span class="material-symbols-outlined">forum</span>
            <strong>还没有帖子</strong>
            <p>发第一条校园讨论，或者刷新看看热帖。</p>
          </div>
          <article
            v-for="thread in displayThreads"
            v-else
            :key="thread.id"
            class="post-card"
            :class="{ active: selectedThread?.id === thread.id }"
            @click="openThread(thread)"
          >
            <div class="post-author">
              <button class="mini-avatar" type="button" @click.stop="openUserProfile(thread.author_student_id)">
                {{ initials(authorName(thread.author_student_id)) }}
              </button>
              <div>
                <strong>{{ authorName(thread.author_student_id) }}</strong>
                <small>{{ formatTime(thread.updated_at || thread.created_at) }}</small>
              </div>
              <span class="category-badge">{{ categoryName(thread.category_id) }}</span>
            </div>
            <h3>{{ thread.title }}</h3>
            <p>{{ thread.content_md }}</p>
            <div v-if="thread.attachment_ids?.length" class="media-preview">
              <span class="material-symbols-outlined">image</span>
              {{ thread.attachment_ids.length }} 个附件
            </div>
            <div class="post-actions" @click.stop>
              <button type="button" @click="scoreThread(thread, 8)">
                <span class="material-symbols-outlined">favorite</span>
                {{ thread.score_avg || 0 }} 分
              </button>
              <button type="button" @click="openThread(thread)">
                <span class="material-symbols-outlined">comment</span>
                {{ thread.reply_count || 0 }}
              </button>
              <button type="button" @click="toggleBookmark(thread)">
                <span class="material-symbols-outlined">{{ bookmarkedIds.has(Number(thread.id)) ? 'bookmark' : 'bookmark_add' }}</span>
                {{ bookmarkedIds.has(Number(thread.id)) ? '已收藏' : '收藏' }}
              </button>
            </div>
          </article>
        </section>

        <section v-if="activeTab === 'detail'" class="page-stack" data-forum-page="detail">
          <div class="detail-topbar">
            <button class="icon-button" type="button" title="返回列表" @click="closeThread">
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h2>{{ selectedThread?.title || '帖子详情' }}</h2>
            <button class="icon-button" type="button" title="举报" @click="reportThread(threadDetail?.thread || selectedThread)">
              <span class="material-symbols-outlined">flag</span>
            </button>
          </div>

          <div v-if="detailLoading" class="empty-card">加载中...</div>
          <article v-else-if="selectedThread" class="detail-card">
            <div class="post-author large">
              <button class="mini-avatar large" type="button" @click="openUserProfile(selectedThread.author_student_id)">
                {{ initials(authorName(selectedThread.author_student_id)) }}
              </button>
              <div>
                <strong>{{ authorName(selectedThread.author_student_id) }}</strong>
                <small>{{ formatTime(selectedThread.created_at) }} · {{ categoryName(selectedThread.category_id) }}</small>
              </div>
              <span class="score-badge">{{ selectedThread.score_avg || 0 }} 分</span>
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
            <div class="score-row">
              <button v-for="score in [1, 3, 5, 8, 10]" :key="score" type="button" @click="scoreThread(threadDetail?.thread || selectedThread, score)">
                {{ score }} 分
              </button>
              <button type="button" @click="toggleBookmark(threadDetail?.thread || selectedThread)">
                <span class="material-symbols-outlined">bookmark</span>
                收藏
              </button>
            </div>
          </article>

          <section class="comment-panel">
            <div class="section-heading compact">
              <h3>Comments ({{ threadDetail?.replies?.length || 0 }})</h3>
            </div>
            <div class="reply-composer">
              <textarea id="forum-reply-content" v-model="replyContent" name="forum-reply-content" rows="2" placeholder="Add a comment..." />
              <label class="icon-button tinted file-trigger">
                <span class="material-symbols-outlined">image</span>
                <input type="file" multiple accept="image/*,.pdf,.txt,.zip" @change="setReplyFiles" />
              </label>
              <button class="primary-icon" type="button" :disabled="!selectedThread || isPending(`reply:${selectedThread.id}:${replyContent.trim().slice(0, 80)}`)" @click="submitReply">
                <span class="material-symbols-outlined">send</span>
              </button>
            </div>
            <p v-if="replyFiles.length" class="form-hint">{{ replyFiles.length }} 个附件待上传</p>
            <article v-for="reply in threadDetail?.replies || []" :key="reply.id" class="comment-card">
              <button class="mini-avatar" type="button" @click="openUserProfile(reply.author_student_id)">
                {{ initials(authorName(reply.author_student_id)) }}
              </button>
              <div>
                <div class="comment-bubble">
                  <strong>{{ authorName(reply.author_student_id) }}</strong>
                  <small>{{ formatTime(reply.created_at) }}</small>
                  <p>{{ reply.content_md }}</p>
                  <div v-if="reply.attachment_ids?.length" class="inline-links">
                    <a v-for="attachment in reply.attachment_ids" :key="attachment" :href="attachmentUrl(attachment)" target="_blank" rel="noreferrer">附件</a>
                  </div>
                </div>
                <div class="comment-actions">
                  <button type="button" @click="reactToReply(reply, 'up')">
                    <span class="material-symbols-outlined">thumb_up</span>
                    {{ reply.up_count || 0 }}
                  </button>
                  <button type="button" @click="reactToReply(reply, 'down')">
                    <span class="material-symbols-outlined">thumb_down</span>
                    {{ reply.down_count || 0 }}
                  </button>
                </div>
              </div>
            </article>
            <div v-if="threadDetail && !threadDetail.replies?.length" class="empty-card compact">暂无回复</div>
          </section>
        </section>

        <section v-if="activeTab === 'compose'" class="compose-page" data-forum-page="compose">
          <div class="compose-topbar">
            <button class="ghost-pill" type="button" @click="switchTab('feed')">Cancel</button>
            <h2>Create Post</h2>
            <button class="primary-pill" type="button" :disabled="!canPublishThread || isPending(`thread:${selectedCategoryId}:${newThread.title.trim()}:${newThread.content_md.trim()}`.slice(0, 180))" @click="submitThread">
              Publish
            </button>
          </div>
          <div class="editor-card">
            <select v-model.number="selectedCategoryId" class="category-select">
              <option v-for="category in visibleCategories" :key="category.id" :value="Number(category.id)">{{ category.name }}</option>
            </select>
            <input id="forum-thread-title" v-model="newThread.title" name="forum-thread-title" maxlength="160" class="title-input" placeholder="An engaging title..." />
            <textarea id="forum-thread-content" v-model="newThread.content_md" name="forum-thread-content" maxlength="20000" placeholder="What do you want to share with the campus?"></textarea>
          </div>
          <div class="attachment-bar">
            <label class="tool-button">
              <span class="material-symbols-outlined">image</span>
              <input type="file" multiple accept="image/*,.pdf,.txt,.zip" @change="setThreadFiles" />
            </label>
            <label class="score-input">
              <span>初始评分</span>
              <input id="forum-thread-score" v-model.number="newThread.score" name="forum-thread-score" type="number" min="1" max="10" />
            </label>
            <span class="char-count">{{ newThread.content_md.length }}/20000</span>
          </div>
          <p v-if="threadFiles.length" class="form-hint">{{ threadFiles.length }} 个附件会通过后端图床接口上传</p>
          <p v-if="composerHint" class="form-hint warning">{{ composerHint }}</p>
        </section>

        <section v-if="activeTab === 'notice'" class="page-stack" data-forum-page="notice">
          <div class="section-heading tall">
            <div>
              <span class="eyebrow">Forum Activity</span>
              <h2>Notifications</h2>
            </div>
            <span>{{ unreadCount }} 未读</span>
          </div>
          <div class="filter-pills">
            <button type="button" class="active">All Activity</button>
            <button type="button">Comments</button>
            <button type="button">Likes</button>
            <button type="button">System</button>
          </div>
          <article v-for="notice in notifications" :key="notice.id" class="notification-card" :class="{ unread: !Number(notice.is_read || 0) }">
            <span class="material-symbols-outlined">notifications</span>
            <div>
              <strong>{{ notice.title }}</strong>
              <p>{{ notice.content }}</p>
              <small>{{ formatTime(notice.created_at) }}</small>
            </div>
          </article>
          <div v-if="!notifications.length" class="empty-card">暂无通知</div>

          <div class="section-heading compact">
            <h3>私信</h3>
            <span>{{ messages.length }}</span>
          </div>
          <div class="message-form">
            <input v-model="messageDraft.receiver_student_id" placeholder="收件人学号" />
            <textarea v-model="messageDraft.content" rows="3" placeholder="私信内容" />
            <button class="primary-pill wide" type="button" @click="sendMessage">发送私信</button>
          </div>
          <article v-for="message in messages" :key="message.id" class="notification-card">
            <span class="material-symbols-outlined">mail</span>
            <div>
              <strong>{{ message.sender_student_id }} -> {{ message.receiver_student_id }}</strong>
              <p>{{ message.content }}</p>
              <small>{{ formatTime(message.created_at) }}</small>
            </div>
          </article>
        </section>

        <section v-if="activeTab === 'me'" class="page-stack" data-forum-page="me">
          <div class="profile-card">
            <div class="cover-gradient"></div>
            <div class="profile-body">
              <div class="profile-avatar">
                <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="社区头像" />
                <span v-else>{{ initials(profile.nickname || studentId) }}</span>
              </div>
              <button class="primary-pill" type="button" @click="checkIn">签到</button>
              <h2>{{ profile.nickname || studentId || '游客' }}</h2>
              <p>{{ meSummary?.profile?.bio || profile.bio || '还没有填写社区简介' }}</p>
              <div class="tag-row">
                <span>HBUT Student</span>
                <span>Lv. {{ meStats.checkin_count || 0 }}</span>
              </div>
              <div class="stats-grid">
                <div><strong>{{ meStats.thread_count || 0 }}</strong><span>Posts</span></div>
                <div><strong>{{ meStats.reply_count || 0 }}</strong><span>Replies</span></div>
                <div><strong>{{ meStats.bookmark_count || 0 }}</strong><span>Collections</span></div>
              </div>
            </div>
          </div>
          <div class="edit-card">
            <label>
              <span>昵称</span>
              <input id="forum-profile-nickname" v-model="profile.nickname" name="forum-profile-nickname" maxlength="80" />
            </label>
            <label>
              <span>头像 URL</span>
              <input id="forum-profile-avatar" v-model="profile.avatar_url" name="forum-profile-avatar" maxlength="500" placeholder="可填后端图床或外部图片 URL" />
            </label>
            <div class="avatar-upload-field">
              <input id="forum-profile-avatar-file" type="file" accept="image/*" :disabled="isPending('profile:avatar-upload')" @change="uploadAvatarImage" />
              <label class="ghost-pill avatar-upload-button" for="forum-profile-avatar-file">
                <span class="material-symbols-outlined">upload</span>
                <span>{{ isPending('profile:avatar-upload') ? '头像图床上传中' : '上传头像到图床' }}</span>
              </label>
              <p class="form-hint">选择本地图片后会上传到后端图床，并自动回填头像 URL。</p>
            </div>
            <label>
              <span>简介</span>
              <input v-model="profile.bio" maxlength="300" placeholder="社区简介" />
            </label>
            <button class="primary-pill wide" type="button" @click="saveProfile">保存资料</button>
          </div>
          <div class="filter-pills">
            <button type="button" class="active">Posts</button>
            <button type="button">Replies</button>
            <button type="button">Collections</button>
          </div>
          <div class="mini-list-card">
            <h3>我的帖子</h3>
            <button v-for="thread in myThreads" :key="thread.id" type="button" @click="openThread(thread)">{{ thread.title }}</button>
            <div v-if="!myThreads.length" class="empty-card compact">暂无帖子</div>
          </div>
          <div class="mini-list-card">
            <h3>我的收藏</h3>
            <button v-for="thread in myBookmarks" :key="thread.id" type="button" @click="openThread(thread)">{{ thread.title }}</button>
            <div v-if="!myBookmarks.length" class="empty-card compact">暂无收藏</div>
          </div>
          <div class="tag-row">
            <span v-for="badge in badges" :key="badge.badge_key">{{ badge.display_name }}</span>
            <span v-if="!badges.length">暂无徽章</span>
          </div>
        </section>

        <section v-if="activeTab === 'user-profile'" class="page-stack" data-forum-page="user-profile">
          <div class="detail-topbar">
            <button class="icon-button" type="button" @click="switchTab('feed')">
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h2>用户主页</h2>
          </div>
          <div v-if="viewedProfileLoading" class="empty-card">加载中...</div>
          <div v-else class="profile-card">
            <div class="cover-gradient"></div>
            <div class="profile-body">
              <div class="profile-avatar">{{ initials(viewedProfileInfo.nickname || viewedProfileInfo.student_id) }}</div>
              <button class="primary-pill" type="button" :disabled="!viewedProfileInfo.student_id" @click="followAuthor(viewedProfileInfo.student_id)">关注</button>
              <h2>{{ viewedProfileInfo.nickname || viewedProfileInfo.student_id || '同学' }}</h2>
              <p>{{ viewedProfileInfo.bio || '这个同学还没有填写社区简介' }}</p>
              <div class="stats-grid">
                <div><strong>{{ viewedProfileStats.thread_count || 0 }}</strong><span>Posts</span></div>
                <div><strong>{{ viewedProfileStats.reply_count || 0 }}</strong><span>Replies</span></div>
                <div><strong>{{ viewedProfileStats.follower_count || 0 }}</strong><span>Followers</span></div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="activeTab === 'admin' && isAdmin" class="page-stack" data-forum-page="admin">
          <div class="section-heading tall">
            <div>
              <span class="eyebrow">Admin Center</span>
              <h2>社区管理中心</h2>
            </div>
            <button class="primary-pill" type="button" @click="runBackup">
              <span class="material-symbols-outlined">backup</span>
              备份
            </button>
          </div>
          <div class="admin-grid">
            <div class="admin-card">
              <h3>举报</h3>
              <article v-for="report in adminReports" :key="report.id" class="admin-row">
                <span class="material-symbols-outlined">flag</span>
                <div>
                  <strong>{{ report.target_type }} #{{ report.target_id }}</strong>
                  <p>{{ report.reason }}</p>
                  <small>{{ report.reporter_student_id }} · {{ formatTime(report.created_at) }}</small>
                </div>
              </article>
              <div v-if="!adminReports.length" class="empty-card compact">暂无举报</div>
            </div>
            <div class="admin-card">
              <h3>用户</h3>
              <div class="inline-form">
                <input v-model="adminSearch" placeholder="搜索学号/昵称" @keyup.enter="searchAdminUsers" />
                <button class="ghost-pill" type="button" @click="searchAdminUsers">搜索</button>
              </div>
              <article v-for="user in adminUsers" :key="user.student_id" class="admin-row">
                <span class="material-symbols-outlined">person</span>
                <div>
                  <strong>{{ user.nickname || user.student_id }}</strong>
                  <p>{{ user.student_id }} · {{ Number(user.is_banned || 0) ? '已封禁' : '正常' }}</p>
                </div>
              </article>
            </div>
            <div class="admin-card">
              <h3>封禁</h3>
              <input v-model="banDraft.student_id" placeholder="目标学号" />
              <input v-model="banDraft.reason" placeholder="原因，可选" />
              <div class="button-row">
                <button class="danger-pill" type="button" @click="setUserBan(true)">封禁</button>
                <button class="ghost-pill" type="button" @click="setUserBan(false)">解封</button>
              </div>
            </div>
            <div class="admin-card">
              <h3>徽章</h3>
              <input v-model="badgeDraft.student_id" placeholder="目标学号" />
              <input v-model="badgeDraft.badge_key" placeholder="badge_key" />
              <input v-model="badgeDraft.display_name" placeholder="展示名" />
              <button class="primary-pill wide" type="button" @click="grantBadge">发放徽章</button>
            </div>
            <div class="admin-card span-2">
              <h3>备份记录</h3>
              <article v-for="backup in adminBackups" :key="backup.id" class="admin-row">
                <span class="material-symbols-outlined">database</span>
                <div>
                  <strong>{{ backup.kind }} · {{ formatTime(backup.created_at) }}</strong>
                  <p>{{ backup.hf_path || backup.sqlite_path }}</p>
                </div>
              </article>
              <div v-if="!adminBackups.length" class="empty-card compact">暂无备份</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </section>
</template>

<style scoped>
.forum-view {
  --stitch-primary: #0058be;
  --stitch-primary-container: #2170e4;
  --stitch-primary-fixed: #d8e2ff;
  --stitch-on-primary-fixed: #001a42;
  --stitch-surface: #f6fafe;
  --stitch-surface-dim: #d6dade;
  --stitch-surface-low: #f0f4f8;
  --stitch-surface-card: #ffffff;
  --stitch-surface-container: #eaeef2;
  --stitch-border: #c2c6d6;
  --stitch-outline: #727785;
  --stitch-text: #171c1f;
  --stitch-muted: #424754;
  --stitch-secondary: #585f6c;
  --stitch-accent-start: #5b86e5;
  --stitch-accent-end: #36d1dc;
  --stitch-info: #38bdf8;
  --stitch-success: #14b8a6;
  --stitch-warning: #f97316;
  --stitch-danger: #ba1a1a;
  --stitch-bottom-nav-clearance: 96px;
  --stitch-card-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  min-height: 100%;
  padding: 0 0 var(--stitch-bottom-nav-clearance);
  background: var(--stitch-surface);
  color: var(--stitch-text);
  font-family: "Plus Jakarta Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.forum-view *,
.forum-view *::before,
.forum-view *::after {
  box-sizing: border-box;
}

.forum-phone-shell {
  width: 100%;
  max-width: 448px;
  min-height: calc(100dvh - 96px);
  margin: 0 auto;
  background: var(--stitch-surface-low);
  box-shadow: 0 20px 44px rgba(21, 28, 39, 0.08);
  overflow: hidden;
}

.forum-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(194, 198, 214, 0.35);
  background: rgba(246, 250, 254, 0.92);
  backdrop-filter: blur(16px);
}

.forum-topbar h1,
.compose-topbar h2,
.detail-topbar h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--stitch-primary);
  font-size: 20px;
  font-weight: 700;
  line-height: 28px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar-button,
.mini-avatar,
.icon-button,
.primary-icon,
.tool-button {
  border: 0;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease, opacity 180ms ease;
}

.avatar-button,
.mini-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--stitch-primary-fixed);
  color: var(--stitch-on-primary-fixed);
  font-size: 12px;
  font-weight: 800;
}

.mini-avatar.large {
  width: 48px;
  height: 48px;
}

.icon-button,
.primary-icon,
.tool-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: transparent;
  color: var(--stitch-muted);
}

.icon-button:hover,
.tool-button:hover {
  background: var(--stitch-surface-container);
  color: var(--stitch-primary);
}

.icon-button.tinted,
.tool-button,
.primary-icon {
  background: rgba(216, 226, 255, 0.72);
  color: var(--stitch-primary);
}

.primary-icon {
  background: var(--stitch-primary);
  color: #ffffff;
}

.icon-button:disabled,
.primary-pill:disabled,
.primary-icon:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.category-nav,
.filter-pills {
  display: flex;
  gap: 24px;
  overflow-x: auto;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(194, 198, 214, 0.2);
  background: var(--stitch-surface);
  scrollbar-width: none;
}

.filter-pills {
  gap: 8px;
  padding: 0 0 2px;
  border: 0;
  background: transparent;
}

.category-nav::-webkit-scrollbar,
.filter-pills::-webkit-scrollbar {
  display: none;
}

.category-nav button,
.filter-pills button {
  flex: 0 0 auto;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--stitch-muted);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}

.category-nav button.active {
  border-color: var(--stitch-primary);
  color: var(--stitch-primary);
}

.filter-pills button {
  min-height: 36px;
  border: 0;
  border-radius: 999px;
  background: var(--stitch-surface-container);
  padding: 0 16px;
  font-size: 12px;
  font-weight: 600;
}

.filter-pills button.active {
  background: var(--stitch-primary);
  color: #ffffff;
}

.forum-canvas,
.page-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.forum-canvas {
  padding: 16px;
}

.quick-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 4px;
  border-radius: 999px;
  background: var(--stitch-surface-container);
}

.quick-tabs button {
  position: relative;
  display: inline-flex;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--stitch-muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.quick-tabs button.active {
  background: var(--stitch-surface-card);
  color: var(--stitch-primary);
  box-shadow: var(--stitch-card-shadow);
}

.quick-tabs .material-symbols-outlined {
  font-size: 18px;
}

.quick-tabs em {
  min-width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--stitch-warning);
  color: #ffffff;
  font-size: 10px;
  font-style: normal;
  line-height: 16px;
}

.forum-hero-card,
.search-card,
.post-card,
.detail-card,
.comment-panel,
.profile-card,
.edit-card,
.mini-list-card,
.message-form,
.notification-card,
.admin-card,
.empty-card,
.system-banner {
  border: 1px solid rgba(194, 198, 214, 0.16);
  border-radius: 24px;
  background: var(--stitch-surface-card);
  box-shadow: var(--stitch-card-shadow);
}

.forum-hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 18px;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--stitch-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 14px;
  text-transform: uppercase;
}

.forum-hero-card h2,
.section-heading h2,
.section-heading h3,
.post-card h3,
.detail-card h2,
.profile-card h2,
.admin-card h3,
.mini-list-card h3 {
  margin: 0;
  color: var(--stitch-text);
  font-weight: 700;
}

.forum-hero-card h2,
.section-heading h2,
.profile-card h2 {
  font-size: 20px;
  line-height: 28px;
}

.post-card h3,
.detail-card h2,
.section-heading h3,
.admin-card h3,
.mini-list-card h3 {
  font-size: 18px;
  line-height: 24px;
}

.forum-hero-card p,
.post-card p,
.detail-content,
.notification-card p,
.profile-card p,
.admin-row p,
.comment-bubble p,
.empty-card p,
.form-hint {
  margin: 0;
  color: var(--stitch-muted);
  font-size: 14px;
  line-height: 20px;
}

.primary-pill,
.ghost-pill,
.danger-pill {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  transition: background-color 180ms ease, color 180ms ease, opacity 180ms ease;
}

.primary-pill {
  background: var(--stitch-primary);
  color: #ffffff;
}

.ghost-pill {
  background: rgba(216, 226, 255, 0.72);
  color: var(--stitch-primary);
}

.danger-pill {
  background: #ffdad6;
  color: #93000a;
}

.primary-pill.wide {
  width: 100%;
}

.search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
  padding: 10px;
}

.search-card label {
  display: flex;
  min-width: 0;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  background: var(--stitch-surface-low);
  padding: 0 14px;
  color: var(--stitch-muted);
}

.search-card input,
.editor-card input,
.editor-card textarea,
.category-select,
.message-form input,
.message-form textarea,
.edit-card input,
.admin-card input,
.inline-form input,
.score-input input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--stitch-text);
  font: inherit;
  outline: none;
}

.search-card input::placeholder,
.editor-card input::placeholder,
.editor-card textarea::placeholder,
.message-form input::placeholder,
.message-form textarea::placeholder,
.edit-card input::placeholder,
.admin-card input::placeholder {
  color: rgba(66, 71, 84, 0.55);
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.section-heading.tall {
  align-items: center;
}

.section-heading.compact {
  align-items: center;
}

.section-heading > span,
.score-badge,
.category-badge,
.tag-row span {
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--stitch-primary-fixed);
  color: var(--stitch-primary);
  padding: 5px 10px;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.post-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  text-align: left;
  cursor: pointer;
}

.post-card.active {
  border-color: rgba(0, 88, 190, 0.28);
}

.post-author {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.post-author.large {
  align-items: flex-start;
}

.post-author > div {
  min-width: 0;
  flex: 1 1 auto;
}

.post-author strong,
.comment-bubble strong,
.notification-card strong,
.admin-row strong {
  display: block;
  overflow: hidden;
  color: var(--stitch-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-author small,
.comment-bubble small,
.notification-card small,
.admin-row small {
  display: block;
  color: var(--stitch-muted);
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
}

.post-card p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  word-break: break-word;
}

.media-preview,
.inline-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--stitch-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
}

.post-actions,
.score-row,
.comment-actions,
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid rgba(194, 198, 214, 0.25);
}

.post-actions button,
.score-row button,
.comment-actions button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 4px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--stitch-muted);
  cursor: pointer;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 700;
}

.post-actions button:hover,
.score-row button:hover,
.comment-actions button:hover {
  color: var(--stitch-primary);
}

.detail-topbar,
.compose-topbar {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 10px;
}

.compose-topbar {
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 2px 0;
}

.detail-card,
.comment-panel,
.admin-card,
.edit-card,
.mini-list-card,
.message-form {
  padding: 16px;
}

.detail-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.image-grid a {
  position: relative;
  min-height: 128px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--stitch-surface-container);
  color: var(--stitch-primary);
  text-decoration: none;
}

.image-grid img {
  width: 100%;
  height: 128px;
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
  font-size: 10px;
  font-weight: 700;
}

.comment-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.reply-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px 40px;
  gap: 8px;
  align-items: end;
}

.reply-composer textarea {
  min-height: 44px;
  resize: vertical;
  border: 0;
  border-radius: 22px;
  background: var(--stitch-surface-container);
  color: var(--stitch-text);
  font: inherit;
  outline: none;
  padding: 12px 14px;
}

.file-trigger {
  position: relative;
  overflow: hidden;
}

.file-trigger input,
.tool-button input {
  position: absolute;
  inset: 0;
  cursor: pointer;
  opacity: 0;
}

.comment-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 10px;
}

.comment-bubble {
  border-radius: 16px;
  border-top-left-radius: 4px;
  background: var(--stitch-surface-card);
  box-shadow: var(--stitch-card-shadow);
  padding: 12px;
}

.comment-bubble p {
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-actions {
  border: 0;
  padding: 4px 0 0;
}

.compose-page {
  display: flex;
  min-height: calc(100dvh - 180px);
  flex-direction: column;
  gap: 14px;
}

.editor-card {
  display: flex;
  min-height: 340px;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  border-radius: 24px;
  background: var(--stitch-surface-card);
  padding: 16px;
  box-shadow: var(--stitch-card-shadow);
}

.category-select {
  width: max-content;
  max-width: 100%;
  min-height: 34px;
  border-radius: 999px;
  background: var(--stitch-surface-container);
  color: var(--stitch-muted);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
}

.title-input {
  font-size: 20px;
  font-weight: 700;
  line-height: 28px;
}

.editor-card textarea {
  min-height: 220px;
  flex: 1 1 auto;
  resize: vertical;
  font-size: 16px;
  line-height: 24px;
}

.attachment-bar {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-radius: 24px;
  background: var(--stitch-surface-card);
  box-shadow: var(--stitch-card-shadow);
  padding: 10px;
}

.score-input {
  display: grid;
  grid-template-columns: auto minmax(0, 56px);
  gap: 8px;
  align-items: center;
  border-radius: 999px;
  background: var(--stitch-surface-container);
  padding: 8px 12px;
  color: var(--stitch-muted);
  font-size: 12px;
  font-weight: 700;
}

.score-input input {
  text-align: center;
}

.char-count,
.form-hint {
  color: var(--stitch-outline);
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.form-hint.warning {
  color: var(--stitch-warning);
}

.notification-card,
.admin-row {
  position: relative;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  padding: 16px;
}

.notification-card > .material-symbols-outlined,
.admin-row > .material-symbols-outlined {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: var(--stitch-surface-container);
  color: var(--stitch-primary);
}

.notification-card.unread::before {
  position: absolute;
  top: 22px;
  left: 10px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--stitch-primary);
  box-shadow: 0 0 8px rgba(0, 88, 190, 0.5);
  content: "";
}

.message-form,
.edit-card,
.admin-card,
.mini-list-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-form input,
.message-form textarea,
.edit-card input,
.admin-card input,
.inline-form input {
  min-height: 42px;
  border-radius: 16px;
  background: var(--stitch-surface-container);
  padding: 10px 12px;
}

.message-form textarea {
  resize: vertical;
}

.profile-card {
  overflow: hidden;
}

.cover-gradient {
  height: 136px;
  background:
    radial-gradient(circle at 12% 20%, rgba(54, 209, 220, 0.72), transparent 30%),
    radial-gradient(circle at 88% 14%, rgba(91, 134, 229, 0.78), transparent 34%),
    linear-gradient(135deg, #d8e2ff, #f6fafe 70%);
}

.profile-body {
  position: relative;
  padding: 0 16px 18px;
}

.profile-avatar {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  margin-top: -46px;
  border: 4px solid var(--stitch-surface-card);
  border-radius: 999px;
  background: var(--stitch-primary-fixed);
  color: var(--stitch-on-primary-fixed);
  font-size: 22px;
  font-weight: 800;
  box-shadow: var(--stitch-card-shadow);
  overflow: hidden;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-body > .primary-pill {
  position: absolute;
  top: 14px;
  right: 16px;
}

.profile-body h2 {
  margin: 14px 0 4px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.stats-grid div {
  border: 1px solid rgba(194, 198, 214, 0.22);
  border-radius: 16px;
  background: var(--stitch-surface-low);
  padding: 12px 8px;
  text-align: center;
}

.stats-grid strong,
.stats-grid span {
  display: block;
}

.stats-grid strong {
  color: var(--stitch-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 24px;
}

.stats-grid span {
  color: var(--stitch-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

.edit-card label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--stitch-muted);
  font-size: 12px;
  font-weight: 700;
}

.avatar-upload-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.avatar-upload-field input[type="file"] {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.avatar-upload-button {
  width: fit-content;
  max-width: 100%;
}

.avatar-upload-button .material-symbols-outlined {
  font-size: 18px;
}

.mini-list-card button {
  min-height: 42px;
  border: 0;
  border-radius: 14px;
  background: var(--stitch-surface-low);
  color: var(--stitch-text);
  cursor: pointer;
  padding: 0 12px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.admin-card {
  min-width: 0;
}

.admin-row {
  border: 1px solid rgba(194, 198, 214, 0.18);
  border-radius: 16px;
  background: var(--stitch-surface-low);
  box-shadow: none;
}

.inline-form,
.button-row {
  display: flex;
  gap: 8px;
}

.inline-form input {
  flex: 1 1 auto;
}

.span-2 {
  grid-column: auto;
}

.empty-card {
  display: grid;
  min-height: 132px;
  place-items: center;
  gap: 6px;
  padding: 18px;
  text-align: center;
}

.empty-card.compact {
  min-height: 72px;
}

.empty-card .material-symbols-outlined {
  color: var(--stitch-primary);
}

.system-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  color: var(--stitch-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
}

.inline-links a {
  color: var(--stitch-primary);
  text-decoration: none;
}

@media (min-width: 760px) {
  .forum-phone-shell {
    border-radius: 0 0 24px 24px;
  }

  .admin-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .span-2 {
    grid-column: span 2;
  }
}

@media (max-width: 390px) {
  .forum-canvas {
    padding: 12px;
  }

  .quick-tabs {
    grid-template-columns: repeat(3, minmax(76px, 1fr));
    overflow-x: auto;
  }

  .forum-hero-card,
  .attachment-bar,
  .reply-composer,
  .inline-form {
    grid-template-columns: 1fr;
  }

  .primary-pill,
  .ghost-pill,
  .danger-pill {
    width: 100%;
  }
}
</style>
