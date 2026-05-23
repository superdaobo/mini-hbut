import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const readSource = (relativePath: string) => readFileSync(join(root, relativePath), 'utf-8')

describe('forum view identity contract', () => {
  it('receives the current Tauri student id from App.vue', () => {
    const appSource = readSource('src/App.vue')

    expect(appSource).toContain('<ForumView')
    expect(appSource).toContain(':student-id="studentId"')
  })

  it('rebuilds forum identity when the current student id changes', () => {
    const forumSource = readSource('src/components/ForumView.vue')

    expect(forumSource).toContain("import { computed, onMounted, ref, watch } from 'vue'")
    expect(forumSource).toContain('watch(')
    expect(forumSource).toContain('() => props.studentId')
    expect(forumSource).toContain('readForumProfile(props.studentId)')
    expect(forumSource).toContain('client = null')
    expect(forumSource).toContain('await buildClient()')
  })

  it('uses the Stitch Campus Vitality forum pages as the visual contract', () => {
    const forumSource = readSource('src/components/ForumView.vue')

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
    const forumSource = readSource('src/components/ForumView.vue')

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
    const forumSource = readSource('src/components/ForumView.vue')

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

    for (const stateText of ['加载中', '暂无', '还没有帖子', '论坛暂未开放', '登录后可以发帖', '帖子列表加载失败', '用户主页加载失败']) {
      expect(forumSource).toContain(stateText)
    }

    for (const actionText of ['发布成功', '回复已发送', '已评分', '已收藏', '已关注作者', '举报已提交', '签到成功', '私信已发送', '备份任务已触发', '已封禁用户', '发放徽章']) {
      expect(forumSource).toContain(actionText)
    }
  })

  it('locks the Stitch mobile foundation for stable forum components', () => {
    const forumSource = readSource('src/components/ForumView.vue')

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
    expect(forumSource).toMatch(/<div v-if="loading" class="forum-skeleton-list" aria-label="论坛内容加载中">[\s\S]*class="skeleton-card"[\s\S]*class="skeleton-line wide"/)
    expect(forumSource).toContain('.post-card p {\n  display: -webkit-box;')
  })

  it('keeps feed, detail, and compose pages feature-complete for Task 9', () => {
    const forumSource = readSource('src/components/ForumView.vue')

    for (const scriptMarker of [
      'const currentThread = computed',
      'const threadAttachments = computed',
      'const threadPendingKey = computed',
      'const replyPendingKey = computed',
      'const threadActionKey = (thread, action)',
      'const removeThreadFile = (index)',
      'const removeReplyFile = (index)',
      'const fileLabel = (file)',
      'const fileSizeLabel = (file)',
      'const setThreadScore = (score)'
    ]) {
      expect(forumSource).toContain(scriptMarker)
    }

    for (const feedMarker of [
      'class="feed-meta-strip"',
      'class="thread-stat-grid"',
      'class="hot-thread-strip"',
      'class="thread-action-button"',
      'isPending(threadActionKey(thread, \'score\'))',
      'isPending(threadActionKey(thread, \'bookmark\'))',
      '评分中',
      '收藏中'
    ]) {
      expect(forumSource).toContain(feedMarker)
    }

    for (const detailMarker of [
      'class="detail-action-bar"',
      'class="score-stepper"',
      'class="reply-attachment-list"',
      'class="attachment-preview-list"',
      'isPending(threadActionKey(currentThread, \'report\'))',
      'isPending(threadActionKey(currentThread, \'follow\'))',
      'isPending(replyPendingKey)',
      '举报中',
      '关注作者',
      '回复中'
    ]) {
      expect(forumSource).toContain(detailMarker)
    }

    for (const composeMarker of [
      'class="compose-score-options"',
      'class="compose-guidance"',
      'class="attachment-preview-item"',
      '@click="removeThreadFile(index)"',
      '@click="removeReplyFile(index)"',
      'isPending(threadPendingKey)',
      '发布中',
      '上传附件会先进入后端图床'
    ]) {
      expect(forumSource).toContain(composeMarker)
    }
  })

  it('allows profile avatars to be uploaded through the forum image host', () => {
    const forumSource = readSource('src/components/ForumView.vue')

    expect(forumSource).toContain('const uploadAvatarImage = async')
    expect(forumSource).toContain('const resolveAvatarAttachmentUrl = (payload) =>')
    expect(forumSource).toContain('if (/^https?:\\/\\//i.test(directUrl)) return directUrl')
    expect(forumSource).toContain('const avatarUrl = resolveAvatarAttachmentUrl(payload)')
    expect(forumSource).toContain("runPending('profile:avatar-upload'")
    expect(forumSource).toContain('client.uploadAttachment(file)')
    expect(forumSource).toContain('profile.value.avatar_url = avatarUrl')
    expect(forumSource).toContain('avatarUploadStatus.value =')
    expect(forumSource).toContain('class="profile-avatar uploadable-avatar"')
    expect(forumSource).toContain('class="avatar-setting-card"')
    expect(forumSource).toContain('class="avatar-setting-preview"')
    expect(forumSource).toContain('class="avatar-setting-actions"')
    expect(forumSource).toContain('设置头像')
    expect(forumSource).toContain('从本地选择图片上传到论坛图床')
    expect(forumSource).toContain('自动回填到头像地址')
    expect(forumSource).toContain('@click="openAvatarFilePicker"')
    expect(forumSource).toContain('@keydown.enter.prevent="openAvatarFilePicker"')
    expect(forumSource).toContain('更换头像')
    expect(forumSource).toContain('已回填图床地址')
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
    expect(forumSource).toContain('头像图床上传中')
    expect(forumSource).toContain('头像上传（推荐）')
    expect(forumSource).toContain('手动 URL（备用）')
    expect(forumSource.indexOf('头像上传（推荐）')).toBeLessThan(forumSource.indexOf('手动 URL（备用）'))
    expect(forumSource.indexOf('上传头像到图床')).toBeLessThan(forumSource.indexOf('手动 URL（备用）'))
  })
})
