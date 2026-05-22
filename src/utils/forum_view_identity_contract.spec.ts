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

  it('allows profile avatars to be uploaded through the forum image host', () => {
    const forumSource = readSource('src/components/ForumView.vue')

    expect(forumSource).toContain('const uploadAvatarImage = async')
    expect(forumSource).toContain("runPending('profile:avatar-upload'")
    expect(forumSource).toContain('client.uploadAttachment(file)')
    expect(forumSource).toContain('profile.value.avatar_url = client.getAttachmentUrl')
    expect(forumSource).toContain('id="forum-profile-avatar-file"')
    expect(forumSource).toContain('@change="uploadAvatarImage"')
    expect(forumSource).toContain('头像图床上传中')
  })
})
