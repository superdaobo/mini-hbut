import { describe, expect, it } from 'vitest'
import { readAppContractSources, readContractTree, readVueContractSource } from './contract_source_test'

/**
 * ForumView 拆分后（Issue #582）：行为锚点迁入 src/features/forum/**，
 * 契约读取组合壳 + 领域代码的合并源码，断言语义不变（行为仍须存在于源码）。
 */
const readForumContractSources = () =>
  [readVueContractSource('src/components/ForumView.vue'), readContractTree('src/features/forum')]
    .join('\n')
    .replace(/\r\n?/g, '\n')

describe('forum view identity contract', () => {
  it('receives the current Tauri student id from App.vue', () => {
    const appSource = readAppContractSources()

    expect(appSource).toContain('<ForumView')
    expect(appSource).toContain(':student-id="studentId"')
  })

  it('rebuilds forum identity when the current student id changes', () => {
    const forumSource = readForumContractSources()

    expect(forumSource).toContain("import { computed, onMounted, ref, watch } from 'vue'")
    expect(forumSource).toContain('watch(')
    expect(forumSource).toContain('() => props.studentId')
    expect(forumSource).toContain('readForumProfile(props.studentId)')
    expect(forumSource).toContain('client = null')
    expect(forumSource).toContain('await buildClient()')
  })

  it('uses the Stitch Campus Vitality forum pages as the visual contract', () => {
    const forumSource = readForumContractSources()

    expect(forumSource).toContain('data-stitch-design="Campus Vitality"')
    expect(forumSource).toContain('data-forum-page="feed"')
    expect(forumSource).toContain('data-forum-page="detail"')
    expect(forumSource).toContain('data-forum-page="compose"')
    expect(forumSource).toContain('data-forum-page="notice"')
    expect(forumSource).toContain('data-forum-page="me"')
    expect(forumSource).toContain('data-forum-page="user-profile"')
    expect(forumSource).toContain('data-forum-page="admin"')
    expect(forumSource).toContain('--stitch-primary: #0058be')
    expect(forumSource).toContain('--stitch-card-shadow: 0 4px 15px rgba(0, 0, 0, 0.03)')
    expect(forumSource).toContain('max-width: 448px')
    expect(forumSource).not.toContain('<TPageHeader')
  })

  it('locks the extracted Stitch Campus Vitality design tokens', () => {
    const forumSource = readForumContractSources()

    expect(forumSource).toContain('--stitch-surface: #f6fafe')
    expect(forumSource).toContain('--stitch-surface-dim: #d6dade')
    expect(forumSource).toContain('--stitch-surface-low: #f0f4f8')
    expect(forumSource).toContain('--stitch-surface-card: #ffffff')
    expect(forumSource).toContain('--stitch-surface-container: #eaeef2')
    expect(forumSource).toContain('--stitch-border: #c2c6d6')
    expect(forumSource).toContain('--stitch-outline: #727785')
    expect(forumSource).toContain('--stitch-text: #171c1f')
    expect(forumSource).toContain('--stitch-muted: #424754')
    expect(forumSource).toContain('--stitch-primary-container: #2170e4')
    expect(forumSource).toContain('--stitch-primary-fixed: #d8e2ff')
    expect(forumSource).toContain('--stitch-accent-start: #5b86e5')
    expect(forumSource).toContain('--stitch-accent-end: #36d1dc')
    expect(forumSource).toContain('--stitch-info: #38bdf8')
    expect(forumSource).toContain('--stitch-success: #14b8a6')
    expect(forumSource).toContain('--stitch-warning: #f97316')
    expect(forumSource).toContain('--stitch-danger: #ba1a1a')
    expect(forumSource).toContain('--stitch-bottom-nav-clearance: 96px')
    expect(forumSource).toContain('font-family: "Plus Jakarta Sans"')
    expect(forumSource).toContain('border-radius: 24px')
    expect(forumSource).toContain('gap: 20px')
    expect(forumSource).toContain('backdrop-filter: blur(16px)')
  })

  it('keeps every Stitch forum page wired with layout components, states, and actions', () => {
    const forumSource = readForumContractSources()

    for (const marker of [
      'forum-topbar',
      'category-nav',
      'quick-tabs',
      'forum-hero-card',
      'search-card',
      'post-card',
      'detail-card',
      'comment-panel',
      'compose-page',
      'editor-card',
      'attachment-bar',
      'notification-card',
      'message-form',
      'profile-card',
      'edit-card',
      'mini-list-card',
      'admin-card',
      'admin-row',
      'empty-card',
      'system-banner'
    ]) {
      expect(forumSource).toContain(marker)
    }

    for (const stateText of ["t('forum.feed.emptyTitle')", "t('forum.feed.emptyDesc')", "t('forum.detail.loading')", "t('forum.user.loading')", '论坛暂未开放', '登录后可以发帖']) {
      expect(forumSource).toContain(stateText)
    }

    for (const actionText of ['发布成功', '回复已发送', '已收藏', '已关注作者', '举报已提交', '签到成功', '私信已发送', '备份任务已触发', '已封禁用户', '发放徽章', '投票已记录']) {
      expect(forumSource).toContain(actionText)
    }
  })

  it('locks the Stitch mobile foundation for stable forum components', () => {
    const forumSource = readForumContractSources()

    for (const marker of [
      'forum-shell-inner',
      'forum-bottom-safe-spacer',
      'forum-skeleton-list',
      'skeleton-card',
      'skeleton-line',
      'skeleton-pill'
    ]) {
      expect(forumSource).toContain(marker)
    }

    for (const styleRule of [
      '--stitch-header-height: 64px',
      '--stitch-bottom-nav-height: 80px',
      '--stitch-container-max: 448px',
      '--stitch-card-radius: 24px',
      '--stitch-control-radius: 999px',
      'max-width: var(--stitch-container-max)',
      'min-height: calc(100dvh - var(--stitch-bottom-nav-clearance))',
      'padding-bottom: calc(var(--stitch-bottom-nav-clearance) + env(safe-area-inset-bottom, 0px))',
      'height: calc(var(--stitch-bottom-nav-height) + env(safe-area-inset-bottom, 0px))',
      'overflow-x: hidden',
      'scroll-padding-bottom: var(--stitch-bottom-nav-clearance)',
      'min-width: 0',
      'overflow-wrap: anywhere',
      'text-overflow: ellipsis',
      '@media (prefers-reduced-motion: reduce)',
      ':focus-visible',
      'outline: 2px solid var(--stitch-primary)',
      '@keyframes forum-skeleton-shimmer'
    ]) {
      expect(forumSource).toContain(styleRule)
    }

    expect(forumSource).not.toContain('scale-95')
    expect(forumSource).not.toContain('letter-spacing: -')
    expect(forumSource).not.toContain('padding: 0 0 var(--stitch-bottom-nav-clearance)')
    expect(forumSource).toMatch(/<div class="forum-shell-inner">[\s\S]*<header class="forum-topbar">[\s\S]*<main class="forum-canvas">[\s\S]*<div class="forum-bottom-safe-spacer" aria-hidden="true"><\/div>/)
    expect(forumSource).toMatch(/<div v-if="loading" class="forum-skeleton-list" :aria-label="t\('forum\.feed\.loading'\)">[\s\S]*class="skeleton-card"[\s\S]*class="skeleton-line wide"/)
    expect(forumSource).toContain('.post-card p {\n  display: -webkit-box;')
  })

  it('keeps feed, detail, and compose pages feature-complete for Task 9', () => {
    const forumSource = readForumContractSources()

    for (const scriptMarker of [
      'const currentThread = computed',
      'const threadAttachments = computed',
      'const threadPendingKey = computed',
      'const replyPendingKey = computed',
      'const threadActionKey = (thread, action)',
      'return pendingActions.value.has(toText(key))',
      'const removeThreadFile = (index)',
      'const removeReplyFile = (index)',
      'const fileLabel = (file)',
      'const fileSizeLabel = (file)',
      'const threadUploadInput = ref(null)',
      'const openThreadFilePicker = () =>'
    ]) {
      expect(forumSource).toContain(scriptMarker)
    }

    for (const feedMarker of [
      'class="feed-meta-strip"',
      'class="thread-stat-grid"',
      'class="hot-thread-strip"',
      'class="thread-action-button"',
      'isPending(threadActionKey(thread, \'bookmark\'))',
      "t('forum.feed.bookmarking')"
    ]) {
      expect(forumSource).toContain(feedMarker)
    }

    for (const detailMarker of [
      'class="detail-action-bar"',
      'class="reply-attachment-list"',
      'class="attachment-preview-list"',
      'isPending(threadActionKey(currentThread, \'report\'))',
      'isPending(threadActionKey(currentThread, \'follow\'))',
      'isPending(replyPendingKey)',
      "t('forum.detail.reporting')",
      "t('forum.detail.followAuthor')",
      "t('forum.detail.replying')"
    ]) {
      expect(forumSource).toContain(detailMarker)
    }

    for (const composeMarker of [
      'class="compose-guidance"',
      'class="attachment-preview-item"',
      '@click="removeThreadFile(index)"',
      '@click="removeReplyFile(index)"',
      'isPending(threadPendingKey)',
      "t('forum.compose.publishing')",
      "t('forum.compose.attachmentHint')",
      '@click="openThreadFilePicker"',
      'ref="threadUploadInput"',
      'aria-hidden="true" tabindex="-1"'
    ]) {
      expect(forumSource).toContain(composeMarker)
    }

    for (const removedPostScoreMarker of [
      'const scoreThread = async',
      'const setThreadScore = (score)',
      'client.scoreThread',
      'newThread.value.score',
      'class="score-stepper"',
      'class="compose-score-options"',
      '初始评分'
    ]) {
      expect(forumSource).not.toContain(removedPostScoreMarker)
    }
  })

  it('keeps notice, me, and user profile pages feature-complete for Task 10', () => {
    const forumSource = readForumContractSources()

    for (const scriptMarker of [
      'const profileCompletion = computed',
      'const userProfileThreads = computed',
      'const userProfileBadges = computed',
      'const messagePendingKey = computed',
      'isPending(messagePendingKey)',
      "isPending('checkin')",
      'if (!client) await buildClient()',
      'const saveProfile = async () =>',
      'await buildClient()',
      'await loadMe({ force: true })',
      'cached(\'notice:list\'',
      'cached(\'message:list\'',
      'cached(\'me:badges\'',
      'cached(`user-profile:${target}`'
    ]) {
      expect(forumSource).toContain(scriptMarker)
    }

    for (const noticeMarker of [
      'class="notice-summary-strip"',
      'class="notification-list"',
      'class="message-composer-card"',
      'class="message-thread-list"',
      "t('forum.notice.sendMessage')",
      '私信已发送',
      "t('forum.notice.title')",
      "t('forum.notice.unread')",
      "t('forum.notice.noMessages')"
    ]) {
      expect(forumSource).toContain(noticeMarker)
    }

    for (const meMarker of [
      'class="profile-dashboard-card"',
      'class="profile-stat-strip"',
      'class="profile-content-tabs"',
      'class="profile-list-grid"',
      'class="profile-list-card"',
      'class="badge-cloud"',
      "t('forum.me.myThreads')",
      "t('forum.me.myReplies')",
      "t('forum.me.myBookmarks')",
      "tf('forum.me.profileCompletion'",
      "t('forum.me.checkingIn')",
      "t('forum.me.avatarUploadTitle')",
      "t('forum.me.adminSecret')"
    ]) {
      expect(forumSource).toContain(meMarker)
    }

    for (const profileMarker of [
      'class="user-profile-hero"',
      'class="user-profile-stat-strip"',
      'class="user-profile-actions"',
      'class="user-profile-badges"',
      'class="user-profile-content-grid"',
      "t('forum.user.loading')",
      "t('forum.user.follow')",
      "t('forum.user.noThreads')",
      "t('forum.user.noBadges')"
    ]) {
      expect(forumSource).toContain(profileMarker)
    }

    for (const styleMarker of [
      '\n.notice-summary-strip {',
      '\n.notification-list {',
      '\n.message-composer-card {',
      '\n.message-thread-list {',
      '\n.profile-dashboard-card {',
      '\n.profile-stat-strip {',
      '\n.profile-content-tabs {',
      '\n.profile-list-grid {',
      '\n.profile-list-card {',
      '\n.badge-cloud {',
      '\n.user-profile-hero {',
      '\n.user-profile-stat-strip {',
      '\n.user-profile-actions {',
      '\n.user-profile-badges {',
      '\n.user-profile-content-grid {'
    ]) {
      expect(forumSource).toContain(styleMarker)
    }
  })

  it('allows profile avatars to be uploaded through the forum image host', () => {
    const forumSource = readForumContractSources()

    expect(forumSource).toContain('const uploadAvatarImage = async')
    expect(forumSource).toContain('const resolveAvatarAttachmentUrl = (payload) =>')
    expect(forumSource).toContain('if (/^https?:\\/\\//i.test(directUrl)) return directUrl')
    expect(forumSource).toContain('const attachmentId = toText(payloadOrId?.attachment_id).trim()')
    expect(forumSource).toContain("const rawValue = typeof payloadOrId === 'object' && payloadOrId !== null ? '' : toText(payloadOrId).trim()")
    expect(forumSource).not.toContain('toText(payloadOrId?.url || payloadOrId).trim()')
    expect(forumSource).toContain('const avatarUrl = resolveAvatarAttachmentUrl(payload)')
    expect(forumSource).toContain("runPending('profile:avatar-upload'")
    expect(forumSource).toContain('client.uploadAttachment(file)')
    expect(forumSource).toContain('profile.value.avatar_url = avatarUrl')
    expect(forumSource).toContain('adminSecret: await loadForumAdminSecret(props.studentId)')
    expect(forumSource).toContain('id="forum-profile-admin-secret"')
    expect(forumSource).toContain('v-model="profile.admin_secret"')
    expect(forumSource).toContain('type="password"')
    expect(forumSource).toContain("t('forum.me.adminSecretPlaceholder')")
    expect(forumSource).toContain('avatarUploadStatus.value =')
    expect(forumSource).toContain('class="profile-avatar uploadable-avatar"')
    expect(forumSource).toContain('class="avatar-setting-card"')
    expect(forumSource).toContain('class="avatar-setting-preview"')
    expect(forumSource).toContain('class="avatar-setting-actions"')
    expect(forumSource).toContain("t('forum.me.setAvatar')")
    expect(forumSource).toContain("t('forum.me.avatarUploadHint')")
    expect(forumSource).toContain("t('forum.me.avatarUploadHint')")
    expect(forumSource).toContain('@click="openAvatarFilePicker"')
    expect(forumSource).toContain('@keydown.enter.prevent="openAvatarFilePicker"')
    expect(forumSource).toContain("t('forum.me.changeAvatar')")
    expect(forumSource).toContain("t('forum.me.avatarUpload')")
    expect(forumSource).toContain('v-if="avatarUploadStatus"')
    expect(forumSource).toContain('id="forum-profile-avatar-file"')
    expect(forumSource).toContain('@change="uploadAvatarImage"')
    expect(forumSource).toContain('tabindex="0"')
    expect(forumSource).toContain('@keydown.enter.prevent=')
    expect(forumSource).toContain('.avatar-upload-field:focus-within .avatar-upload-button')
    expect(forumSource).toContain('.uploadable-avatar')
    expect(forumSource).toContain('.avatar-upload-status')
    expect(forumSource).toContain('.avatar-setting-card')
    expect(forumSource).toContain('.avatar-setting-preview')
    expect(forumSource).toContain('.avatar-manual-fallback')
    expect(forumSource).toContain("t('forum.me.avatarUploading')")
    expect(forumSource).toContain("t('forum.me.avatarUploadTitle')")
    expect(forumSource).toContain("t('forum.me.manualUrl')")
    expect(forumSource.indexOf("t('forum.me.avatarUploadTitle')")).toBeLessThan(forumSource.indexOf("t('forum.me.manualUrl')"))
    expect(forumSource.indexOf("t('forum.me.avatarUpload')")).toBeLessThan(forumSource.indexOf("t('forum.me.manualUrl')"))
  })

  it('keeps admin, backup, and image-host experiences feature-complete for Task 11', () => {
    const forumSource = readForumContractSources()

    for (const scriptMarker of [
      'const adminSummary = computed',
      'const latestBackup = computed',
      'const uploadQueue = ref([])',
      'const rememberUploadResult = (',
      'const retryUploadFile = async',
      'const copyAttachmentUrl = async',
      'const attachmentProxyUrl = (',
      'const adminPolls = ref',
      'const selectedPoll = ref',
      'const pollDraft = ref',
      'const pollAdminSummary = computed',
      'const voteInPoll = async',
      'const createAdminPoll = async',
      'const closeAdminPoll = async',
      'cached(\'poll:list\'',
      'client.listPolls',
      'client.createPoll',
      'client.votePoll',
      'client.closePoll',
      'isPending(\'admin:backup\')',
      'isPending(`admin:ban:${studentId}:${banned}`)',
      'isPending(`admin:badge:${payload.student_id}:${payload.badge_key}`)',
      'runPending(`poll:vote:${poll.id}:${option.id}`',
      'isPending(`poll:vote:${selectedPoll?.id}:${option.id}`)',
      'isPending(\'poll:create\')'
    ]) {
      expect(forumSource).toContain(scriptMarker)
    }

    for (const adminMarker of [
      'class="admin-hero-card"',
      'class="admin-summary-strip"',
      'class="admin-card admin-section-card reports"',
      'class="admin-card admin-section-card users"',
      'class="admin-card admin-section-card moderation"',
      'class="admin-card admin-section-card badge-issuer"',
      'class="admin-card admin-section-card poll-admin',
      'class="admin-card admin-section-card backup-panel',
      'class="poll-score-page"',
      'class="poll-score-hero"',
      'class="poll-score-grid"',
      'class="poll-score-card"',
      'class="poll-score-option"',
      'class="poll-admin-form"',
      'class="backup-status-card"',
      'class="backup-record-list"',
      'class="admin-path-chip"',
      "t('forum.admin.title')",
      "t('forum.admin.reportQueue')",
      "t('forum.admin.userGovernance')",
      "t('forum.admin.banSection')",
      "t('forum.admin.badgeSection')",
      "t('forum.admin.pollSummary')",
      "t('forum.admin.createPoll')",
      "t('forum.admin.publishPoll')",
      "t('forum.admin.closePoll')",
      '投票已记录',
      "t('forum.admin.backupRecords')",
      "t('forum.admin.backuping')",
      "t('forum.admin.triggerBackup')",
      'HF Bucket',
      'OneDrive'
    ]) {
      expect(forumSource).toContain(adminMarker)
    }

    for (const uploadMarker of [
      'class="upload-experience-panel"',
      'class="upload-drop-card"',
      'class="upload-progress-list"',
      'class="upload-progress-item"',
      'class="upload-status-pill"',
      'class="attachment-url-chip"',
      'class="upload-retry-button"',
      "t('forum.upload.title')",
      "t('forum.upload.copyProxyUrl')",
      "t('forum.upload.failed')",
      '@click="retryUploadFile(item)"',
      '@click="copyAttachmentUrl(item.proxyUrl)"',
      'class="visually-hidden-file"',
      'class="attachment-copy"'
    ]) {
      expect(forumSource).toContain(uploadMarker)
    }

    for (const styleMarker of [
      '\n.admin-hero-card {',
      '\n.admin-summary-strip {',
      '\n.admin-section-card {',
      '\n.poll-score-page {',
      '\n.poll-score-hero {',
      '\n.poll-score-grid {',
      '\n.poll-score-card {',
      '\n.poll-score-option {',
      '\n.poll-admin-form {',
      '\n.backup-status-card {',
      '\n.backup-record-list {',
      '\n.admin-path-chip {',
      '\n.upload-experience-panel {',
      '\n.upload-drop-card {',
      '\n.upload-progress-list {',
      '\n.upload-progress-item {',
      '\n.upload-status-pill {',
      '\n.attachment-url-chip {',
      '\n.upload-retry-button {'
    ]) {
      expect(forumSource).toContain(styleMarker)
    }

    expect(forumSource).toContain('.tool-button {\n  position: relative;')
    expect(forumSource).toContain('inline-size: 40px')
    expect(forumSource).toContain('block-size: 40px')

    for (const removedPostScoreStyle of [
      '\n.score-input',
      '\n.score-badge',
      '\n.score-row',
      '\n.score-stepper',
      '\n.compose-score-options',
      '.tool-button input'
    ]) {
      expect(forumSource).not.toContain(removedPostScoreStyle)
    }

    for (const removedLocalPollMarker of [
      'pollStorageKey',
      'defaultAdminPolls',
      'persistAdminPolls',
      'localStorage.setItem(pollStorageKey()',
      'localStorage.getItem(pollStorageKey()',
      'votedBy:'
    ]) {
      expect(forumSource).not.toContain(removedLocalPollMarker)
    }

    expect(forumSource).toContain('\n.visually-hidden-file {')
    expect(forumSource).toContain('\n.attachment-copy {')
  })
})
