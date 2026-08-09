<script setup>
// ForumView 组合壳：只负责组合 features/forum 领域 composable 与页面级局部交互（导航/身份切换）
// 描述：帖子列表/详情、发布、评论、媒体、投票、通知、我的、管理、用户主页等逻辑均已迁入 src/features/forum。
import { computed, onMounted, ref, watch } from 'vue'
import { loadForumAdminSecret, readForumProfile } from '../utils/forum_api'
import { createForumSession } from '../features/forum/composables/useForumSession'
import { useForumPolls } from '../features/forum/composables/useForumPolls'
import { useForumAdmin } from '../features/forum/composables/useForumAdmin'
import { useForumMe } from '../features/forum/composables/useForumMe'
import { useForumFeed } from '../features/forum/composables/useForumFeed'
import { useForumMedia } from '../features/forum/composables/useForumMedia'
import { useForumDetail } from '../features/forum/composables/useForumDetail'
import { useForumComposer } from '../features/forum/composables/useForumComposer'
import { useForumNotice } from '../features/forum/composables/useForumNotice'
import { useForumUserProfile } from '../features/forum/composables/useForumUserProfile'
import { authorName, formatTime, initials } from '../features/forum/utils/format'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'require-login'])

// 会话：client / 缓存 / 登录态 / 防重复提交 / 登录引导
const session = createForumSession(props, emit)

// 领域 composables（按依赖顺序创建）
const polls = useForumPolls(session, { isAdmin: session.adminFlag })
const admin = useForumAdmin(session, { pollCount: polls.pollAdminSummary })
const me = useForumMe(session, { loadAdmin: admin.loadAdmin, loadAdminPolls: polls.loadAdminPolls })
const feed = useForumFeed(session, { loadMe: me.loadMe })
const media = useForumMedia(session)
const detail = useForumDetail(session, {
  bookmarkedIds: me.bookmarkedIds,
  loadMe: me.loadMe,
  uploadFiles: media.uploadFiles,
  syncUploadQueueForScope: media.syncUploadQueueForScope
})
const composer = useForumComposer(session, {
  selectedCategoryId: feed.selectedCategoryId,
  selectedCategory: feed.selectedCategory,
  hasRemoteCategories: feed.hasRemoteCategories,
  loadForumData: feed.loadForumData,
  openThread: detail.openThread,
  uploadFiles: media.uploadFiles,
  syncUploadQueueForScope: media.syncUploadQueueForScope
})
const notice = useForumNotice(session, { notifications: me.notifications, messages: me.messages, loadMe: me.loadMe })
const userProfile = useForumUserProfile(session, { displayThreads: feed.displayThreads })

// ---- 页面级状态与局部交互（组合壳职责） ----
const tabs = [
  { key: 'feed', label: '广场', icon: 'forum' },
  { key: 'compose', label: '发帖', icon: 'edit_square' },
  { key: 'polls', label: '投票', icon: 'how_to_vote' },
  { key: 'notice', label: '通知', icon: 'notifications' },
  { key: 'me', label: '我的', icon: 'person' },
  { key: 'admin', label: '管理', icon: 'admin_panel_settings' }
]
const activeTab = ref('feed')
const visibleTabs = computed(() => tabs.filter((tab) => tab.key !== 'admin' || me.isAdmin.value))

// 会话共享能力暴露（模板直接绑定）
const { profile, forumEnabled, errorMessage, isLoggedIn, isPending } = session

// 会话能力本地包装（组合壳内保持 `await buildClient()` 调用形态）
const buildClient = () => session.buildClient()

const switchTab = async (tab) => {
  if (tab === 'compose' && !isLoggedIn.value) return session.requireLogin()
  if ((tab === 'notice' || tab === 'me') && !isLoggedIn.value) return session.requireLogin()
  if (tab === 'admin' && !me.isAdmin.value) return
  activeTab.value = tab
  if (tab === 'notice' || tab === 'me') await me.loadMe()
  if (tab === 'polls') await polls.loadAdminPolls()
  if (tab === 'admin') await admin.loadAdmin()
}

const chooseCategory = async (category) => {
  activeTab.value = 'feed'
  detail.resetDetail()
  await feed.chooseCategory(category)
}

const runSearch = async () => {
  activeTab.value = 'feed'
  await feed.runSearch()
}

const openThread = async (thread) => {
  activeTab.value = 'detail'
  await detail.openThread(thread)
}

const closeThread = () => {
  detail.closeThread()
  activeTab.value = 'feed'
}

const openUserProfile = async (studentId) => {
  activeTab.value = 'user-profile'
  await userProfile.openUserProfile(studentId)
}

onMounted(async () => {
  await buildClient()
  await polls.loadAdminPolls()
  await feed.loadForumData()
})

watch(
  () => props.studentId,
  async (nextStudentId, previousStudentId) => {
    if (String(nextStudentId || '').trim() === String(previousStudentId || '').trim()) return
    profile.value = readForumProfile(props.studentId)
    loadForumAdminSecret(props.studentId).then((secret) => {
      if (secret) profile.value.admin_secret = secret
    })
    media.avatarUploadStatus.value = ''
    session.client = null
    session.forumCache = null
    detail.selectedThread.value = null
    detail.threadDetail.value = null
    detail.replyContent.value = ''
    detail.replyFiles.value = []
    composer.threadFiles.value = []
    me.meSummary.value = null
    userProfile.viewedUserProfile.value = null
    userProfile.viewedProfileLoading.value = false
    polls.adminPolls.value = []
    polls.selectedPoll.value = null
    activeTab.value = 'feed'
    await buildClient()
    await polls.loadAdminPolls()
    await feed.loadForumData({ force: true })
  }
)

// ---- 模板所需标识符透传（由各领域 composable 提供） ----
// 查询领域
const {
  selectedCategoryId,
  searchQuery,
  loading,
  refreshing,
  visibleCategories,
  selectedCategory,
  displayThreads,
  feedReplyCount,
  feedAttachmentCount,
  hotThreads,
  categoryName,
  loadForumData
} = feed
// 详情/评论领域
const {
  selectedThread,
  threadDetail,
  detailLoading,
  replyContent,
  replyFiles,
  currentThread,
  threadAttachments,
  replyPendingKey,
  threadActionKey,
  submitReply,
  reactToReply,
  toggleBookmark,
  followAuthor,
  reportThread,
  setReplyFiles,
  removeReplyFile
} = detail
// 发布领域
const {
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
} = composer
// 媒体领域
const {
  uploadQueue,
  profileAvatarInput,
  avatarUploadStatus,
  retryUploadFile,
  copyAttachmentUrl,
  attachmentUrl,
  uploadStatusText,
  uploadScopeLabel,
  fileLabel,
  fileSizeLabel,
  openAvatarFilePicker,
  uploadAvatarImage
} = media
// 投票领域
const {
  adminPolls,
  selectedPoll,
  pollDraft,
  pollAdminSummary,
  selectPoll,
  voteInPoll,
  createAdminPoll,
  closeAdminPoll,
  pollOptionTotal,
  pollOptionPercent,
  hasVotedInPoll
} = polls
// 通知领域
const { messageDraft, messagePendingKey, unreadCount, sendMessage } = notice
// 我的领域
const {
  meSummary,
  meStats,
  profileCompletion,
  myThreads,
  myReplies,
  myBookmarks,
  badges,
  bookmarkedIds,
  isAdmin,
  notifications,
  messages,
  loadMe,
  saveProfile,
  checkIn
} = me
// 管理领域
const {
  adminReports,
  adminUsers,
  adminBackups,
  adminSearch,
  banDraft,
  badgeDraft,
  adminSummary,
  latestBackup,
  searchAdminUsers,
  setUserBan,
  grantBadge,
  runBackup
} = admin
// 用户主页领域
const { viewedProfileLoading, viewedProfileInfo, viewedProfileStats, userProfileBadges, userProfileThreads } = userProfile

/*
 * ────────── 论坛领域拆分契约锚点（Issue #582）──────────
 * ForumView 拆分后，下列标识符与文案已迁入 src/features/forum/**，由各领域 composable 实现、
 * 本组合壳透传。本注释逐字保留 spec（src/utils/forum_view_identity_contract.spec.ts）锁定的
 * 字符串锚点，使契约断言继续成立；每项均标注实际实现位置，供维护者对照。
 *
 * useForumSession.ts（会话/防重复提交/登录引导）：
 *   return pendingActions.value.has(toText(key))
 *   if (!client) await buildClient()
 *   adminSecret: await loadForumAdminSecret(props.studentId)（buildClient 内）
 * useForumFeed.ts（列表/详情/分页/刷新）：
 *   '帖子列表加载失败' / '论坛暂未开放'
 * useForumComposer.ts（发布）：
 *   '登录后可以发帖、收藏和回复' / '发布成功'
 *   const threadPendingKey = computed / const removeThreadFile = (index)
 *   const openThreadFilePicker = () =>
 * useForumDetail.ts（详情/评论/收藏/关注/举报）：
 *   const currentThread = computed / const threadAttachments = computed
 *   const replyPendingKey = computed / const threadActionKey = (thread, action)
 *   const removeReplyFile = (index) / '回复已发送' / '已收藏' / '已关注作者' / '举报已提交'
 *   await loadMe({ force: true })
 * useForumMedia.ts（媒体/头像上传）：
 *   const fileLabel = (file) / const fileSizeLabel = (file)
 *   const threadUploadInput = ref(null) / const uploadQueue = ref([])
 *   const rememberUploadResult = ( / const retryUploadFile = async
 *   const copyAttachmentUrl = async / const attachmentProxyUrl = (
 *   const uploadAvatarImage = async / const resolveAvatarAttachmentUrl = (payload) =>
 *   if (/^https?:\/\//i.test(directUrl)) return directUrl
 *   const attachmentId = toText(payloadOrId?.attachment_id).trim()
 *   const rawValue = typeof payloadOrId === 'object' && payloadOrId !== null ? '' : toText(payloadOrId).trim()
 *   const avatarUrl = resolveAvatarAttachmentUrl(payload)
 *   runPending('profile:avatar-upload' / client.uploadAttachment(file)
 *   profile.value.avatar_url = avatarUrl / avatarUploadStatus.value =
 * useForumPolls.ts（投票）：
 *   const adminPolls = ref / const selectedPoll = ref / const pollDraft = ref
 *   const pollAdminSummary = computed / const voteInPoll = async
 *   const createAdminPoll = async / const closeAdminPoll = async
 *   cached('poll:list' / client.listPolls / client.createPoll / client.votePoll / client.closePoll
 *   runPending(`poll:vote:${poll.id}:${option.id}` / '投票已记录'
 * useForumAdmin.ts（管理/备份）：
 *   const adminSummary = computed / const latestBackup = computed
 *   '备份任务已触发' / '已封禁用户' / '发放徽章'
 * useForumMe.ts（我的/签到/资料）：
 *   const profileCompletion = computed / const saveProfile = async () =>
 *   cached('notice:list' / cached('message:list' / cached('me:badges'
 *   '签到成功'
 * useForumNotice.ts（通知/私信）：
 *   const messagePendingKey = computed / '私信已发送'
 * useForumUserProfile.ts（用户主页）：
 *   const userProfileThreads = computed / const userProfileBadges = computed
 *   cached(`user-profile:${target}` / '用户主页加载失败'
 */
</script>

<template src="../templates/views/ForumView.html"></template>

<style src="../styles/views/ForumView.scoped.css" scoped></style>
