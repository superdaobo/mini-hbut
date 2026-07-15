import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('school website back / embed bounds contract (#373)', () => {
  it('closes native embed before navigating back and avoids full-window resize', () => {
    const view = read('src/components/SchoolWebsiteView.vue')
    const embed = read('src/utils/school_website_embed.ts')

    expect(view).toContain('handleBack')
    expect(view).toContain('forceCloseSchoolWebsiteEmbed')
    expect(view).toContain('@click="handleBack"')
    expect(view).not.toContain("@click=\"emit('back')\"")
    expect(embed).toContain('forceCloseSchoolWebsiteEmbed')
    expect(embed).toContain('container.isConnected')
    // 禁止旧的「小于 45% 窗口就撑满」逻辑
    expect(embed).not.toContain('minExpected')
    expect(embed).not.toContain('height >= minExpected ? height : heightFromWindow')
  })
})
