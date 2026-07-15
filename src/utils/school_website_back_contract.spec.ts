import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('school website back / embed bounds contract (#373)', () => {
  it('closes native embed before navigating back and avoids full-window resize', () => {
    const view = read('src/components/SchoolWebsiteView.vue')
    const embed = read('src/utils/school_website_embed.ts')
    const app = read('src/App.vue')
    const rust = read('src-tauri/src/modules/school_website_embed.rs')

    expect(view).toContain('handleBack')
    expect(view).toContain('forceCloseSchoolWebsiteEmbed')
    expect(view).toContain('@click="handleBack"')
    expect(view).not.toContain("@click=\"emit('back')\"")
    // 空 detail 禁止 remount
    expect(view).toContain("if (view !== 'school_website') return")
    expect(embed).toContain('forceCloseSchoolWebsiteEmbed')
    expect(embed).toContain('suppressSchoolWebsiteEmbed')
    expect(embed).toContain('schoolWebsiteEmbedSuppressed')
    expect(embed).toContain('container.isConnected')
    // App 层离开 school_website 强制 close
    expect(app).toContain("prev === 'school_website'")
    expect(app).toContain('forceCloseSchoolWebsiteEmbed')
    // Rust 多重关闭 + 无效 bounds 拒绝
    expect(rust).toContain('close_embed_if_exists')
    expect(rust).toContain('-10_000.0')
    expect(rust).toContain('invalid embed bounds')
    // 禁止旧的「小于 45% 窗口就撑满」逻辑
    expect(embed).not.toContain('minExpected')
    expect(embed).not.toContain('height >= minExpected ? height : heightFromWindow')
  })
})
