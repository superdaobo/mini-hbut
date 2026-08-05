<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { fetchRemoteConfig } from '../utils/remote_config'
import {
  buildForumApiBase,
  createForumApiClient,
  loadForumAdminSecret,
  readForumProfile,
  saveForumAdminSecret,
  writeForumProfile
} from '../utils/forum_api'
import { clearForumCache, createForumCache, createForumPendingActions, withForumCache } from '../utils/forum_cache'
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
  { key: 'polls', label: '投票', icon: 'how_to_vote' },
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
// 管理员口令加密存储在 localStorage（不明文，设备密钥与密文同存：仅降低静态泄露风险，非 XSS 安全边界），进入页面时异步恢复以便回填
loadForumAdminSecret(props.studentId).then((secret) => {
  if (secret) profile.value.admin_secret = secret
})
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
const adminPolls = ref([])
const selectedPoll = ref(null)
const adminSearch = ref('')
const uploadQueue = ref([])
const threadUploadInput = ref(null)
const messageDraft = ref({ receiver_student_id: '', content: '' })
const banDraft = ref({ student_id: '', reason: '' })
const badgeDraft = ref({ student_id: '', badge_key: 'helper', display_name: '热心同学' })
const pollDraft = ref({
  title: '本周学习体验投票',
  description: '由管理员发起，普通用户只在投票打分页参与，不再要求每个帖子评分。',
  options: '很有帮助|10\n比较有帮助|8\n一般|5\n需要改进|2'
})
const pendingActions = ref(new Set())
const profileAvatarInput = ref(null)
const avatarUploadStatus = ref('')
const newThread = ref({
  title: '',
  content_md: ''
})

let client = null
let forumCache = null
let pendingGuard = null

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
const feedReplyCount = computed(() => displayThreads.value.reduce((total, thread) => total + Number(thread.reply_count || 0), 0))
const feedAttachmentCount = computed(() => displayThreads.value.reduce((total, thread) => total + Number(thread.attachment_ids?.length || 0), 0))
const canPublishThread = computed(() => forumEnabled.value && isLoggedIn.value && hasRemoteCategories.value)
const composerHint = computed(() => {
  if (!forumEnabled.value) return '论坛暂未开放'
  if (!isLoggedIn.value) return '登录后可以发帖、收藏和回复'
  if (!hasRemoteCategories.value) return '版块初始化中，请稍后刷新'
  return ''
})
const meStats = computed(() => meSummary.value?.stats || {})
const viewedProfileInfo = computed(() => viewedUserProfile.value?.profile || {})
const viewedProfileStats = computed(() => viewedUserProfile.value?.stats || {})
const currentThread = computed(() => threadDetail.value?.thread || selectedThread.value || null)
const threadAttachments = computed(() => currentThread.value?.attachment_ids || [])
const threadPendingKey = computed(() => `thread:${selectedCategoryId.value}:${newThread.value.title.trim()}:${newThread.value.content_md.trim()}`.slice(0, 180))
const replyPendingKey = computed(() => selectedThread.value?.id ? `reply:${selectedThread.value.id}:${replyContent.value.trim().slice(0, 80)}` : 'reply:none')
const messagePendingKey = computed(() => {
  const receiver = messageDraft.value.receiver_student_id.trim()
  const content = messageDraft.value.content.trim()
  return `message:${receiver}:${content.slice(0, 40)}`
})
const profileCompletion = computed(() => {
  const checks = [
    profile.value.nickname?.trim(),
    profile.value.avatar_url?.trim(),
    profile.value.bio?.trim(),
    Number(meStats.value.checkin_count || 0) > 0
  ]
  const completed = checks.filter(Boolean).length
  return Math.round((completed / checks.length) * 100)
})
const userProfileThreads = computed(() => {
  const target = toText(viewedProfileInfo.value.student_id).trim()
  if (!target) return []
  return displayThreads.value
    .filter((thread) => toText(thread.author_student_id).trim() === target)
    .slice(0, 3)
})
const userProfileBadges = computed(() => {
  const items = viewedUserProfile.value?.badges || viewedUserProfile.value?.profile?.badges || []
  return Array.isArray(items) ? items : []
})
const adminSummary = computed(() => ({
  reportCount: adminReports.value.length,
  userCount: adminUsers.value.length,
  bannedCount: adminUsers.value.filter((user) => Number(user.is_banned || 0)).length,
  backupCount: adminBackups.value.length,
  pollCount: adminPolls.value.length
}))
const latestBackup = computed(() => adminBackups.value[0] || null)
const pollAdminSummary = computed(() => {
  const activeCount = adminPolls.value.filter((poll) => poll.status === 'active').length
  const voteCount = adminPolls.value.reduce((total, poll) => total + poll.options.reduce((sum, option) => sum + Number(option.votes || 0), 0), 0)
  return {
    total: adminPolls.value.length,
    active: activeCount,
    closed: Math.max(0, adminPolls.value.length - activeCount),
    votes: voteCount
  }
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

const normalizePolls = (items = []) => items
  .filter((poll) => poll && typeof poll === 'object')
  .map((poll) => ({
    id: Number(poll.id || 0),
    title: toText(poll.title).trim() || '未命名投票',
    description: toText(poll.description).trim(),
    status: poll.status === 'closed' ? 'closed' : 'active',
    created_at: toText(poll.created_at).trim() || new Date().toISOString(),
    my_vote_option_id: poll.my_vote_option_id == null ? null : Number(poll.my_vote_option_id),
    options: Array.isArray(poll.options)
      ? poll.options.map((option, index) => ({
        id: Number(option.id || 0) || index + 1,
        label: toText(option.label).trim() || `选项 ${index + 1}`,
        score: Number(option.score || 0),
        votes: Number(option.votes || 0)
      }))
      : []
  }))
  .filter((poll) => poll.id > 0 && poll.options.length >= 2)

const loadAdminPolls = async ({ force = false } = {}) => {
  if (!isLoggedIn.value) {
    adminPolls.value = []
    selectedPoll.value = null
    return
  }
  if (!client) await buildClient()
  if (force && forumCache) clearForumCache(forumCache, ['poll'])
  try {
    const payload = await cached('poll:list', ({ etag }) => client.listPolls({ limit: 30 }, { includeMeta: true, etag }), 15_000)
    adminPolls.value = normalizePolls(payload?.items || [])
  } catch (error) {
    adminPolls.value = []
    selectedPoll.value = null
    showToast(error?.message || '投票列表加载失败', 'warning')
    return
  }
  const previousId = Number(selectedPoll.value?.id || 0)
  selectedPoll.value =
    adminPolls.value.find((poll) => Number(poll.id) === previousId) ||
    adminPolls.value.find((poll) => poll.status === 'active') ||
    adminPolls.value[0] ||
    null
}

const selectPoll = (poll) => {
  selectedPoll.value = poll || null
}

const pollOptionTotal = (poll) =>
  (poll?.options || []).reduce((total, option) => total + Number(option.votes || 0), 0)

const pollOptionPercent = (poll, option) => {
  const total = pollOptionTotal(poll)
  return total ? Math.round((Number(option?.votes || 0) / total) * 100) : 0
}

const hasVotedInPoll = (poll) => {
  return poll?.my_vote_option_id != null
}

const parsePollOptions = () => pollDraft.value.options
  .split(/\n+/)
  .map((line, index) => {
    const [label, score] = line.split('|').map((part) => toText(part).trim())
    return {
      label: label || `选项 ${index + 1}`,
      score: Math.min(10, Math.max(0, Number(score || 0)))
    }
  })
  .filter((option) => option.label)

const voteInPoll = async (option) => {
  if (!isLoggedIn.value) return requireLogin()
  const poll = selectedPoll.value
  if (!poll || poll.status === 'closed') {
    showToast('当前投票已关闭', 'warning')
    return
  }
  if (hasVotedInPoll(poll)) {
    showToast('你已经参与过这个投票', 'info')
    return
  }
  await runPending(`poll:vote:${poll.id}:${option.id}`, async () => {
    const updated = await client.votePoll(poll.id, option.id)
    const normalized = normalizePolls([updated])[0]
    adminPolls.value = adminPolls.value.map((item) =>
      Number(item.id) === Number(poll.id) ? normalized : item
    )
    selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || null
    invalidateForumCache(['poll'])
    showToast('投票已记录', 'success')
  }, '投票正在提交，请勿重复点击')
}

const createAdminPoll = async () => {
  if (!isAdmin.value) return
  const title = pollDraft.value.title.trim()
  const options = parsePollOptions()
  if (!title || options.length < 2) {
    showToast('请填写投票标题，并至少提供两个选项', 'warning')
    return
  }
  await runPending('poll:create', async () => {
    const created = await client.createPoll({
      title,
      description: pollDraft.value.description.trim(),
      options
    })
    const poll = normalizePolls([created])[0]
    adminPolls.value = [poll, ...adminPolls.value].slice(0, 20)
    selectedPoll.value = poll
    invalidateForumCache(['poll'])
    pollDraft.value = {
      title: '',
      description: '',
      options: '赞成|10\n中立|5\n反对|1'
    }
    showToast('发布投票', 'success')
  })
}

const closeAdminPoll = async (poll) => {
  if (!isAdmin.value || !poll?.id) return
  await runPending(`poll:close:${poll.id}`, async () => {
    const closed = await client.closePoll(poll.id)
    const normalized = normalizePolls([closed])[0]
    adminPolls.value = adminPolls.value.map((item) =>
      Number(item.id) === Number(poll.id) ? normalized : item
    )
    selectedPoll.value = adminPolls.value.find((item) => Number(item.id) === Number(poll.id)) || selectedPoll.value
    invalidateForumCache(['poll'])
    showToast('关闭投票', 'success')
  })
}

const categoryName = (categoryId) =>
  visibleCategories.value.find((item) => Number(item.id) === Number(categoryId))?.name || '社区'

const attachmentUrl = (attachmentId) => client?.getAttachmentUrl?.(attachmentId) || ''

const threadActionKey = (thread, action) => {
  const normalizedAction = toText(action).trim()
  if (normalizedAction === 'follow') {
    return `follow:${toText(thread?.author_student_id).trim() || 'unknown'}`
  }
  return `${normalizedAction}:${thread?.id || 'unknown'}`
}

const fileLabel = (file) => toText(file?.name).trim() || '附件'

const fileSizeLabel = (file) => {
  const size = Number(file?.size || 0)
  if (!Number.isFinite(size) || size <= 0) return '待上传'
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const uploadStatusText = (status) => ({
  queued: '等待上传',
  uploading: '上传中',
  success: '已上传',
  failed: '上传失败'
})[status] || '等待上传'

const uploadScopeLabel = (scope) => ({
  thread: '发帖附件',
  reply: '回复附件',
  avatar: '头像图片',
  retry: '重试上传'
})[scope] || '图床文件'

const fileQueueKey = (file, scope = 'thread') =>
  `${scope}:${fileLabel(file)}:${Number(file?.size || 0)}:${Number(file?.lastModified || 0)}`

const attachmentProxyUrl = (payloadOrId) => {
  const directUrl = toText(payloadOrId?.url).trim()
  if (/^https?:\/\//i.test(directUrl)) return directUrl
  const attachmentId = toText(payloadOrId?.attachment_id).trim()
  const rawValue = typeof payloadOrId === 'object' && payloadOrId !== null ? '' : toText(payloadOrId).trim()
  const attachmentAddress = directUrl || attachmentId || rawValue
  return attachmentAddress ? client?.getAttachmentUrl?.(attachmentAddress) || '' : ''
}

const rememberUploadResult = (file, scope = 'thread', patch = {}) => {
  const key = patch.key || fileQueueKey(file, scope)
  const current = uploadQueue.value.find((item) => item.key === key)
  const nextItem = {
    key,
    scope,
    file,
    name: fileLabel(file),
    sizeLabel: fileSizeLabel(file),
    status: 'queued',
    progress: 0,
    attachmentId: '',
    proxyUrl: '',
    error: '',
    updatedAt: Date.now(),
    ...(current || {}),
    ...patch
  }
  uploadQueue.value = [
    ...uploadQueue.value.filter((item) => item.key !== key),
    nextItem
  ].slice(-12)
  return nextItem
}

const syncUploadQueueForScope = (files, scope) => {
  const keys = new Set((files || []).map((file) => fileQueueKey(file, scope)))
  uploadQueue.value = uploadQueue.value.filter((item) => item.scope !== scope || keys.has(item.key))
  for (const file of files || []) rememberUploadResult(file, scope)
}

const resolveAvatarAttachmentUrl = (payload) => {
  const directUrl = toText(payload?.url).trim()
  if (/^https?:\/\//i.test(directUrl)) return directUrl
  const attachmentAddress = directUrl || toText(payload?.attachment_id).trim()
  return attachmentAddress ? attachmentProxyUrl(attachmentAddress) : ''
}

const syncPendingActions = (next) => {
  pendingActions.value = next
}

const ensurePendingGuard = () => {
  if (!pendingGuard) {
    pendingGuard = createForumPendingActions({
      notify: showToast,
      onChange: syncPendingActions
    })
  }
  return pendingGuard
}

const isPending = (key) => {
  ensurePendingGuard()
  return pendingActions.value.has(toText(key))
}

const runPending = async (key, task, duplicateMessage = '正在处理，请勿重复点击') =>
  ensurePendingGuard().run(key, task, { duplicateMessage })

const requireLogin = () => {
  showToast('请先登录后再使用社区功能', 'warning')
  emit('require-login')
  return false
}

const cached = (scope, fetcher, ttlMs = 60_000) => {
  if (!forumCache) return fetcher()
  return withForumCache(forumCache, scope, fetcher, { ttlMs })
}

const invalidateForumCache = (scopes = ['feed', 'hot', 'thread', 'me', 'notice', 'message', 'admin', 'poll']) => {
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
    bio: profile.value.bio,
    adminSecret: await loadForumAdminSecret(props.studentId)
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
    cached('me:summary', ({ etag }) => client.getMeSummary({ includeMeta: true, etag }), 30_000),
    cached('me:threads', ({ etag }) => client.listMyThreads({ limit: 30 }, { includeMeta: true, etag }), 30_000),
    cached('me:replies', ({ etag }) => client.listMyReplies({ limit: 30 }, { includeMeta: true, etag }), 30_000),
    cached('me:bookmarks', ({ etag }) => client.listMyBookmarks({ limit: 50 }, { includeMeta: true, etag }), 30_000),
    cached('notice:list', ({ etag }) => client.listNotifications({}, { includeMeta: true, etag }), 20_000),
    cached('message:list', ({ etag }) => client.listMessages({}, { includeMeta: true, etag }), 15_000),
    cached('me:badges', ({ etag }) => client.listBadges({ includeMeta: true, etag }), 60_000)
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
    cached('admin:reports', ({ etag }) => client.listAdminReports({ limit: 50 }, { includeMeta: true, etag }), 20_000),
    cached(`admin:users:${adminSearch.value}`, ({ etag }) => client.listAdminUsers({ query: adminSearch.value }, { includeMeta: true, etag }), 20_000),
    cached('admin:backups', ({ etag }) => client.listAdminBackups({ limit: 20 }, { includeMeta: true, etag }), 30_000)
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
    const payload = await cached(scope, ({ etag }) => {
      if (query) return client.searchThreads({ q: query, categoryId, limit: 40 }, { includeMeta: true, etag })
      return client.listThreads({ categoryId, limit: 40 }, { includeMeta: true, etag })
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
      cached('categories', ({ etag }) => client.listCategories({}, { includeMeta: true, etag }), 120_000),
      cached('hot:threads', ({ etag }) => client.listHotThreads(20, { includeMeta: true, etag }), 30_000)
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
    const detail = await cached(`thread:${thread.id}`, ({ etag }) => client.getThread(thread.id, { includeMeta: true, etag }), 20_000)
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

const uploadFiles = async (files, scope = 'thread') => {
  const uploaded = []
  for (const file of files || []) {
    try {
      rememberUploadResult(file, scope, { status: 'uploading', progress: 45, error: '' })
      const payload = await client.uploadAttachment(file)
      const proxyUrl = attachmentProxyUrl(payload)
      rememberUploadResult(file, scope, {
        status: 'success',
        progress: 100,
        attachmentId: toText(payload?.attachment_id).trim(),
        proxyUrl,
        error: ''
      })
      if (payload?.attachment_id) uploaded.push(payload.attachment_id)
    } catch (error) {
      rememberUploadResult(file, scope, {
        status: 'failed',
        progress: 100,
        error: error?.message || '上传失败，点击重试'
      })
      throw error
    }
  }
  return uploaded
}

const setThreadFiles = (event) => {
  const files = Array.from(event?.target?.files || []).slice(0, 6)
  threadFiles.value = files
  syncUploadQueueForScope(files, 'thread')
}

const setReplyFiles = (event) => {
  const files = Array.from(event?.target?.files || []).slice(0, 4)
  replyFiles.value = files
  syncUploadQueueForScope(files, 'reply')
}

const openThreadFilePicker = () => {
  if (!isLoggedIn.value) return requireLogin()
  threadUploadInput.value?.click?.()
}

const removeThreadFile = (index) => {
  const files = threadFiles.value.filter((_, fileIndex) => fileIndex !== index)
  threadFiles.value = files
  syncUploadQueueForScope(files, 'thread')
}

const removeReplyFile = (index) => {
  const files = replyFiles.value.filter((_, fileIndex) => fileIndex !== index)
  replyFiles.value = files
  syncUploadQueueForScope(files, 'reply')
}

const retryUploadFile = async (item) => {
  if (!item?.file) return
  if (!isLoggedIn.value) return requireLogin()
  if (!client) await buildClient()
  await runPending(`upload:retry:${item.key}`, async () => {
    rememberUploadResult(item.file, item.scope || 'retry', { key: item.key, status: 'uploading', progress: 45, error: '' })
    try {
      const payload = await client.uploadAttachment(item.file)
      rememberUploadResult(item.file, item.scope || 'retry', {
        key: item.key,
        status: 'success',
        progress: 100,
        attachmentId: toText(payload?.attachment_id).trim(),
        proxyUrl: attachmentProxyUrl(payload),
        error: ''
      })
      showToast('附件已重新上传到图床', 'success')
    } catch (error) {
      rememberUploadResult(item.file, item.scope || 'retry', {
        key: item.key,
        status: 'failed',
        progress: 100,
        error: error?.message || '上传失败，点击重试'
      })
      throw error
    }
  }, '附件正在重试上传，请勿重复点击')
}

const copyAttachmentUrl = async (value) => {
  const url = toText(value).trim()
  if (!url) {
    showToast('暂无可复制的代理 URL', 'warning')
    return
  }
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      throw new Error('clipboard unavailable')
    }
    await navigator.clipboard.writeText(url)
    showToast('代理 URL 已复制', 'success')
  } catch {
    showToast('当前环境不支持自动复制，请手动复制代理 URL', 'warning')
  }
}

const openAvatarFilePicker = () => {
  if (isPending('profile:avatar-upload')) return
  if (!isLoggedIn.value) return requireLogin()
  profileAvatarInput.value?.click?.()
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
      avatarUploadStatus.value = '正在上传头像到图床'
      rememberUploadResult(file, 'avatar', { status: 'uploading', progress: 45, error: '' })
      const payload = await client.uploadAttachment(file)
      const avatarUrl = resolveAvatarAttachmentUrl(payload)
      if (!avatarUrl) throw new Error('图床未返回头像地址')
      profile.value.avatar_url = avatarUrl
      rememberUploadResult(file, 'avatar', {
        status: 'success',
        progress: 100,
        attachmentId: toText(payload?.attachment_id).trim(),
        proxyUrl: avatarUrl,
        error: ''
      })
      avatarUploadStatus.value = '已回填图床地址，请保存资料'
      showToast('头像已上传到图床，请保存资料', 'success')
    }, '头像图床上传中，请勿重复选择')
  } catch (error) {
    rememberUploadResult(file, 'avatar', { status: 'failed', progress: 100, error: error?.message || '头像上传失败' })
    avatarUploadStatus.value = '头像上传失败，可重试或使用手动 URL'
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
  await runPending(threadPendingKey.value, async () => {
    const attachmentIds = await uploadFiles(threadFiles.value, 'thread')
    const created = await client.createThread({
      category_id: selectedCategoryId.value || selectedCategory.value?.id,
      title,
      content_md: content,
      attachment_ids: attachmentIds
    })
    newThread.value = { title: '', content_md: '' }
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
  await runPending(replyPendingKey.value, async () => {
    const attachmentIds = await uploadFiles(replyFiles.value, 'reply')
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
    viewedUserProfile.value = await cached(`user-profile:${target}`, ({ etag }) => client.getUserProfile(target, { includeMeta: true, etag }), 30_000)
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

const saveProfile = async () => {
  // 管理员口令单独加密存储，profile 缓存不再包含明文（CodeQL js/clear-text-storage-of-sensitive-data）；
  // 该加密仅降低静态备份/扫描泄露风险（设备密钥与密文同存于 localStorage），不是 XSS 安全边界
  await saveForumAdminSecret(props.studentId, profile.value.admin_secret)
  profile.value = writeForumProfile(props.studentId, profile.value)
  client = null
  forumCache = null
  showToast('社区资料已保存', 'success')
  await buildClient()
  await loadMe({ force: true })
  await loadAdminPolls({ force: true })
}

const checkIn = async () => {
  if (!isLoggedIn.value) return requireLogin()
  if (!client) await buildClient()
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
  await runPending(messagePendingKey.value, async () => {
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
  if (isPending(`admin:ban:${studentId}:${banned}`)) return
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
  if (isPending(`admin:badge:${payload.student_id}:${payload.badge_key}`)) return
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
  if (tab === 'polls') await loadAdminPolls()
  if (tab === 'admin') await loadAdmin()
}

onMounted(async () => {
  await buildClient()
  await loadAdminPolls()
  await loadForumData()
})

watch(
  () => props.studentId,
  async (nextStudentId, previousStudentId) => {
    if (String(nextStudentId || '').trim() === String(previousStudentId || '').trim()) return
    profile.value = readForumProfile(props.studentId)
    loadForumAdminSecret(props.studentId).then((secret) => {
      if (secret) profile.value.admin_secret = secret
    })
    avatarUploadStatus.value = ''
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
    adminPolls.value = []
    selectedPoll.value = null
    activeTab.value = 'feed'
    await buildClient()
    await loadAdminPolls()
    await loadForumData({ force: true })
  }
)
</script>

<template src="../templates/views/ForumView.html"></template>

<style src="../styles/views/ForumView.scoped.css" scoped></style>
