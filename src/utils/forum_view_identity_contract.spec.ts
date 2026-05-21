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
})
