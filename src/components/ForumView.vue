<script setup>
import { computed, onMounted, ref } from 'vue'
import { TPageHeader } from './templates'
import { fetchRemoteConfig } from '../utils/remote_config'
import {
  buildForumApiBase,
  createForumApiClient,
  readForumProfile,
  writeForumProfile
} from '../utils/forum_api'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'require-login'])

const fallbackCategories = [
  { id: 1, slug: 'campus', name: '校园广场', description: '日常交流与校园新鲜事' },
  { id: 2, slug: 'study', name: '学习互助', description: '课程、考试、绩点与资料互助' },
  { id: 3, slug: 'life', name: '生活服务', description: '宿舍、电费、饭卡、出行' }
]

const forumEnabled = ref(true)
const apiBase = ref('')
const categories = ref([])
const threads = ref([])
const hotThreads = ref([])
const selectedCategoryId = ref(0)
const selectedThread = ref(null)
const threadDetail = ref(null)
const loading = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const composerOpen = ref(false)
const replyContent = ref('')
const newThread = ref({
  title: '',
  content_md: '',
  score: 8
})
const profile = ref(readForumProfile(props.studentId))

let client = null

const isLoggedIn = computed(() => !!String(props.studentId || '').trim())
const hasRemoteCategories = computed(() => categories.value.length > 0)
const visibleCategories = computed(() => categories.value.length ? categories.value : fallbackCategories)
const selectedCategory = computed(() =>
  visibleCategories.value.find((item) => Number(item.id) === Number(selectedCategoryId.value)) || visibleCategories.value[0]
)
const displayThreads = computed(() => threads.value.length ? threads.value : hotThreads.value)
const canPublishThread = computed(() => forumEnabled.value && isLoggedIn.value && hasRemoteCategories.value)
const composerHint = computed(() => {
  if (!forumEnabled.value) return '论坛暂未开放'
  if (!hasRemoteCategories.value) return '版块初始化中，请管理员进入论坛后同步默认版块'
  if (!isLoggedIn.value) return '登录后可以发帖和评分'
  return ''
})
const emptyText = computed(() => {
  if (!forumEnabled.value) return '论坛暂未开放'
  if (errorMessage.value) return errorMessage.value
  return '还没有帖子，发第一条吧'
})

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
}

const requireLogin = () => {
  emit('require-login')
  return false
}

const loadForumData = async ({ force = false } = {}) => {
  if (!forumEnabled.value) return
  loading.value = !force
  refreshing.value = force
  errorMessage.value = ''
  try {
    if (!client) await buildClient()
    const [categoryPayload, hotPayload] = await Promise.all([
      client.listCategories(),
      client.listHotThreads(20)
    ])
    categories.value = Array.isArray(categoryPayload?.items) ? categoryPayload.items : []
    if (!categories.value.length && isLoggedIn.value) {
      await seedDefaultCategories()
      const seededPayload = await client.listCategories()
      categories.value = Array.isArray(seededPayload?.items) ? seededPayload.items : []
    }
    hotThreads.value = Array.isArray(hotPayload?.items) ? hotPayload.items : []
    if (!selectedCategoryId.value && visibleCategories.value[0]) {
      selectedCategoryId.value = Number(visibleCategories.value[0].id)
    }
    await loadThreads()
  } catch (error) {
    errorMessage.value = error?.message || '论坛加载失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const seedDefaultCategories = async () => {
  if (!client) return
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

const loadThreads = async () => {
  if (!client || !forumEnabled.value) return
  const categoryId = hasRemoteCategories.value ? selectedCategoryId.value || selectedCategory.value?.id : 0
  try {
    const payload = await client.listThreads({ categoryId, limit: 40 })
    threads.value = Array.isArray(payload?.items) ? payload.items : []
  } catch (error) {
    errorMessage.value = error?.message || '帖子列表加载失败'
  }
}

const chooseCategory = async (category) => {
  selectedCategoryId.value = Number(category?.id || 0)
  selectedThread.value = null
  threadDetail.value = null
  await loadThreads()
}

const openThread = async (thread) => {
  if (!client || !thread?.id) return
  selectedThread.value = thread
  threadDetail.value = null
  try {
    threadDetail.value = await client.getThread(thread.id)
  } catch (error) {
    errorMessage.value = error?.message || '帖子详情加载失败'
  }
}

const closeThread = () => {
  selectedThread.value = null
  threadDetail.value = null
  replyContent.value = ''
}

const submitThread = async () => {
  if (!isLoggedIn.value) return requireLogin()
  if (!client) await buildClient()
  if (!hasRemoteCategories.value) {
    errorMessage.value = '版块初始化中，请管理员先进入论坛同步默认版块'
    return
  }
  const title = newThread.value.title.trim()
  const content = newThread.value.content_md.trim()
  if (!title || !content) {
    errorMessage.value = '标题和内容不能为空'
    return
  }
  try {
    const categoryId = selectedCategoryId.value || selectedCategory.value?.id
    const created = await client.createThread({
      category_id: categoryId,
      title,
      content_md: content,
      attachment_ids: []
    })
    if (newThread.value.score) {
      await client.scoreThread(created.id, Number(newThread.value.score))
    }
    newThread.value = { title: '', content_md: '', score: 8 }
    composerOpen.value = false
    await loadForumData({ force: true })
    await openThread(created)
  } catch (error) {
    errorMessage.value = error?.message || '发帖失败'
  }
}

const submitReply = async () => {
  if (!isLoggedIn.value) return requireLogin()
  if (!selectedThread.value?.id) return
  const content = replyContent.value.trim()
  if (!content) return
  try {
    await client.createReply(selectedThread.value.id, {
      content_md: content,
      attachment_ids: []
    })
    replyContent.value = ''
    await openThread(selectedThread.value)
  } catch (error) {
    errorMessage.value = error?.message || '回复失败'
  }
}

const reactToReply = async (reply, reaction) => {
  if (!isLoggedIn.value) return requireLogin()
  try {
    await client.reactToPost(reply.id, reaction)
    await openThread(selectedThread.value)
  } catch (error) {
    errorMessage.value = error?.message || '操作失败'
  }
}

const scoreThread = async (thread, score) => {
  if (!isLoggedIn.value) return requireLogin()
  try {
    await client.scoreThread(thread.id, score)
    await loadForumData({ force: true })
    if (selectedThread.value?.id === thread.id) {
      await openThread(thread)
    }
  } catch (error) {
    errorMessage.value = error?.message || '评分失败'
  }
}

const reportThread = async (thread) => {
  if (!isLoggedIn.value) return requireLogin()
  try {
    await client.reportContent({
      target_type: 'thread',
      target_id: thread.id,
      reason: '用户从客户端举报'
    })
    errorMessage.value = '已提交举报'
  } catch (error) {
    errorMessage.value = error?.message || '举报失败'
  }
}

const saveProfile = () => {
  profile.value = writeForumProfile(props.studentId, profile.value)
  client = createForumApiClient({
    apiBase: apiBase.value,
    studentId: props.studentId,
    nickname: profile.value.nickname,
    avatarUrl: profile.value.avatar_url,
    bio: profile.value.bio
  })
  errorMessage.value = '社区资料已保存'
}

const formatTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  await buildClient()
  await loadForumData()
})
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

    <section class="forum-profile-strip">
      <div class="profile-copy">
        <span class="profile-kicker">社区身份</span>
        <strong>{{ profile.nickname || studentId || '游客' }}</strong>
        <span>{{ isLoggedIn ? '已绑定当前登录学号' : '登录后可发帖、评分和回复' }}</span>
      </div>
      <button class="profile-edit-btn" :disabled="!isLoggedIn" @click="composerOpen = !composerOpen">
        <span class="material-symbols-outlined">edit_square</span>
        发帖
      </button>
    </section>

    <section v-if="isLoggedIn" class="forum-profile-card">
      <label>
        <span>昵称</span>
        <input id="forum-profile-nickname" v-model="profile.nickname" name="forum-profile-nickname" maxlength="80" placeholder="社区昵称" />
      </label>
      <label>
        <span>头像 URL</span>
        <input id="forum-profile-avatar" v-model="profile.avatar_url" name="forum-profile-avatar" maxlength="500" placeholder="可填 HF Bucket 或图床链接" />
      </label>
      <button class="save-profile-btn" @click="saveProfile">保存资料</button>
    </section>

    <section class="category-strip">
      <button
        v-for="category in visibleCategories"
        :key="category.slug || category.id"
        class="category-chip"
        :class="{ active: Number(selectedCategoryId) === Number(category.id) }"
        @click="chooseCategory(category)"
      >
        <strong>{{ category.name }}</strong>
        <span>{{ category.description }}</span>
      </button>
    </section>

    <section v-if="composerOpen" class="composer-card">
      <input id="forum-thread-title" v-model="newThread.title" name="forum-thread-title" maxlength="160" placeholder="标题" />
      <textarea id="forum-thread-content" v-model="newThread.content_md" name="forum-thread-content" maxlength="20000" rows="4" placeholder="说点什么..." />
      <div class="composer-footer">
        <label class="score-field">
          <span>评分</span>
          <input id="forum-thread-score" v-model.number="newThread.score" name="forum-thread-score" type="number" min="1" max="10" />
        </label>
        <button class="primary-btn" :disabled="!canPublishThread" @click="submitThread">发布</button>
      </div>
      <p v-if="composerHint" class="composer-hint">{{ composerHint }}</p>
    </section>

    <section v-if="errorMessage" class="message-line">{{ errorMessage }}</section>

    <div class="forum-layout">
      <section class="thread-list-panel" :class="{ 'mobile-hidden': selectedThread }">
        <div class="panel-head">
          <h2>{{ selectedCategory?.name || '热榜' }}</h2>
          <span>{{ displayThreads.length }} 条</span>
        </div>

        <div v-if="loading" class="loading-block">加载中...</div>
        <div v-else-if="!displayThreads.length" class="empty-block">{{ emptyText }}</div>

        <template v-else>
          <button
            v-for="thread in displayThreads"
            :key="thread.id"
            class="thread-card"
            :class="{ active: selectedThread?.id === thread.id }"
            @click="openThread(thread)"
          >
            <div class="thread-title-row">
              <h3>{{ thread.title }}</h3>
              <span class="score-pill">{{ thread.score_avg || 0 }} 分</span>
            </div>
            <p>{{ thread.content_md }}</p>
            <div class="thread-meta">
              <span>{{ formatTime(thread.updated_at || thread.created_at) }}</span>
              <span>{{ thread.score_count || 0 }} 人评分</span>
            </div>
          </button>
        </template>
      </section>

      <section class="thread-detail-panel" :class="{ 'mobile-hidden': !selectedThread }">
        <div v-if="!selectedThread" class="detail-placeholder">
          <span class="material-symbols-outlined">forum</span>
          <strong>选择帖子查看详情</strong>
          <p>可以刷新热榜、切换版块、发帖和评分。</p>
        </div>

        <article v-else class="detail-card">
          <div class="detail-head">
            <button class="forum-icon-btn mobile-only" title="返回列表" @click="closeThread">
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h2>{{ threadDetail?.thread?.title || selectedThread.title }}</h2>
            <button class="forum-icon-btn" title="举报" @click="reportThread(threadDetail?.thread || selectedThread)">
              <span class="material-symbols-outlined">flag</span>
            </button>
          </div>
          <p class="detail-content">{{ threadDetail?.thread?.content_md || selectedThread.content_md }}</p>
          <div class="score-actions">
            <button v-for="score in [1, 3, 5, 8, 10]" :key="score" @click="scoreThread(threadDetail?.thread || selectedThread, score)">
              {{ score }} 分
            </button>
          </div>

          <div class="reply-box">
            <textarea id="forum-reply-content" v-model="replyContent" name="forum-reply-content" rows="3" placeholder="写回复..." />
            <button class="primary-btn" @click="submitReply">回复</button>
          </div>

          <div class="reply-list">
            <div v-for="reply in threadDetail?.replies || []" :key="reply.id" class="reply-card">
              <p>{{ reply.content_md }}</p>
              <div class="reply-actions">
                <span>{{ formatTime(reply.created_at) }}</span>
                <button @click="reactToReply(reply, 'up')">
                  <span class="material-symbols-outlined">thumb_up</span>
                  {{ reply.up_count || 0 }}
                </button>
                <button @click="reactToReply(reply, 'down')">
                  <span class="material-symbols-outlined">thumb_down</span>
                  {{ reply.down_count || 0 }}
                </button>
              </div>
            </div>
            <div v-if="threadDetail && !threadDetail.replies?.length" class="empty-block">暂无回复</div>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.forum-view {
  min-height: 100%;
  padding: 0 14px 124px;
  color: var(--ui-text, #0f172a);
  background: #f8fafc;
}

.forum-icon-btn {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 12px;
  background: #ffffff;
  color: var(--ui-primary, #2563eb);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.forum-icon-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.forum-profile-strip,
.forum-profile-card,
.composer-card,
.thread-list-panel,
.thread-detail-panel,
.message-line {
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.94);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.forum-profile-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.profile-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.profile-kicker,
.profile-copy span:last-child,
.thread-meta,
.reply-actions {
  color: var(--ui-muted, #64748b);
  font-size: 0.82rem;
}

.profile-copy strong {
  font-size: 1.06rem;
  color: #0f172a;
}

.profile-edit-btn,
.primary-btn,
.save-profile-btn {
  min-height: 38px;
  border: none;
  border-radius: 12px;
  background: var(--ui-primary, #2563eb);
  color: #ffffff;
  font-weight: 700;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}

.profile-edit-btn:disabled,
.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.forum-profile-card {
  margin-top: 10px;
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  align-items: end;
}

.forum-profile-card label,
.score-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--ui-muted, #64748b);
  font-size: 0.78rem;
  font-weight: 700;
}

.forum-profile-card input,
.composer-card input,
.composer-card textarea,
.reply-box textarea,
.score-field input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
  font: inherit;
  padding: 10px 12px;
  outline: none;
}

.category-strip {
  margin-top: 12px;
  display: flex;
  gap: 9px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.category-chip {
  flex: 0 0 150px;
  min-height: 70px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 14px;
  background: #ffffff;
  text-align: left;
  padding: 10px;
  cursor: pointer;
}

.category-chip.active {
  border-color: color-mix(in oklab, var(--ui-primary, #2563eb) 50%, transparent);
  background: color-mix(in oklab, var(--ui-primary, #2563eb) 10%, #ffffff);
}

.category-chip strong,
.category-chip span {
  display: block;
}

.category-chip span {
  margin-top: 5px;
  color: var(--ui-muted, #64748b);
  font-size: 0.78rem;
  line-height: 1.35;
}

.composer-card {
  margin-top: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.composer-footer {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 10px;
}

.score-field {
  max-width: 90px;
}

.composer-hint {
  margin: 0;
  color: var(--ui-muted, #64748b);
  font-size: 0.82rem;
  line-height: 1.45;
}

.message-line {
  margin-top: 10px;
  padding: 10px 12px;
  color: #1d4ed8;
  font-weight: 700;
}

.forum-layout {
  margin-top: 12px;
  display: grid;
  grid-template-columns: minmax(280px, 0.82fr) minmax(0, 1.18fr);
  gap: 12px;
  align-items: start;
}

.thread-list-panel,
.thread-detail-panel {
  padding: 12px;
}

.panel-head,
.thread-title-row,
.detail-head,
.reply-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-head h2,
.detail-head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.panel-head span,
.score-pill {
  border-radius: 999px;
  padding: 5px 9px;
  background: color-mix(in oklab, var(--ui-primary, #2563eb) 12%, #ffffff);
  color: var(--ui-primary, #2563eb);
  font-size: 0.78rem;
  font-weight: 800;
}

.thread-card {
  width: 100%;
  margin-top: 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  background: #ffffff;
  padding: 11px;
  text-align: left;
  cursor: pointer;
}

.thread-card.active {
  border-color: var(--ui-primary, #2563eb);
}

.thread-card h3 {
  min-width: 0;
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.35;
}

.thread-card p,
.detail-content,
.reply-card p {
  color: #334155;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.thread-card p {
  display: -webkit-box;
  margin: 7px 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.9rem;
}

.detail-placeholder,
.loading-block,
.empty-block {
  min-height: 160px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--ui-muted, #64748b);
  padding: 18px;
}

.detail-placeholder .material-symbols-outlined {
  font-size: 42px;
  color: var(--ui-primary, #2563eb);
}

.detail-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-content {
  margin: 0;
  padding: 12px;
  border-radius: 13px;
  background: #f8fafc;
}

.score-actions,
.reply-actions {
  flex-wrap: wrap;
}

.score-actions {
  display: flex;
  gap: 8px;
}

.score-actions button,
.reply-actions button {
  min-height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font-weight: 700;
  cursor: pointer;
}

.score-actions button {
  padding: 0 10px;
}

.reply-box {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 9px;
  align-items: end;
}

.reply-card {
  margin-top: 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 13px;
  background: #ffffff;
  padding: 10px;
}

.reply-card p {
  margin: 0 0 8px;
}

.reply-actions button {
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.reply-actions .material-symbols-outlined {
  font-size: 17px;
}

.mobile-only {
  display: none;
}

@media (max-width: 760px) {
  .forum-view {
    padding-left: 10px;
    padding-right: 10px;
  }

  .forum-profile-card {
    grid-template-columns: 1fr;
  }

  .forum-layout {
    grid-template-columns: 1fr;
  }

  .mobile-hidden {
    display: none;
  }

  .reply-box {
    grid-template-columns: 1fr;
  }

  .mobile-only {
    display: inline-flex;
  }
}
</style>
