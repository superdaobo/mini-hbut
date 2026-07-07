import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourcePath = (path: string) => resolve(process.cwd(), path)
const readSource = (path: string) => {
  const resolved = sourcePath(path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

describe('me quick links frontend contract', () => {
  it('adds Me page entries that navigate to school_website and quick_links', () => {
    const source = readSource('src/components/MeView.vue')

    expect(source).toContain("const handleOpenSchoolWebsite = () => emit('navigate', 'school_website')")
    expect(source).toContain("const handleOpenQuickLinks = () => emit('navigate', 'quick_links')")
    expect(source).toContain('v-if="isLoggedIn" class="grid-item" @click="handleOpenSchoolWebsite"')
    expect(source).toContain('v-if="isLoggedIn" class="grid-item" @click="handleOpenQuickLinks"')
    expect(source).toContain('学校官网')
    expect(source).toContain('快捷链接')
  })

  it('requires login before entering school_website or quick_links', () => {
    const appSource = readSource('src/App.vue')
    const navSource = readSource('src/navigation/app_navigation.ts')

    expect(navSource).toContain('LOGIN_REQUIRED_ME_VIEWS')
    expect(navSource).toContain('isLoginRequiredView')
    expect(appSource).toContain('ensureLoginRequiredViewAccess')
    expect(appSource).toContain("currentView === 'school_website' && isLoggedIn")
    expect(appSource).toContain("currentView === 'quick_links' && isLoggedIn")
  })

  it('registers school_website and quick_links as Me sub views in App.vue', () => {
    const appSource = readSource('src/App.vue')
    const navSource = readSource('src/navigation/app_navigation.ts')

    expect(appSource).toContain("const loadSchoolWebsiteView = () => import('./components/SchoolWebsiteView.vue')")
    expect(appSource).toContain("const loadQuickLinksView = () => import('./components/QuickLinksView.vue')")
    expect(appSource).toContain('const SchoolWebsiteView = createAsyncPage(loadSchoolWebsiteView)')
    expect(appSource).toContain('const QuickLinksView = createAsyncPage(loadQuickLinksView)')
    expect(navSource).toMatch(/ME_SUB_VIEWS\s*=\s*\[[\s\S]*'school_website'/)
    expect(navSource).toMatch(/ME_SUB_VIEWS\s*=\s*\[[\s\S]*'quick_links'/)
    expect(navSource).toMatch(/HIERARCHICAL_PARENT_VIEW_MAP[\s\S]*school_website:\s*'me'/)
    expect(navSource).toMatch(/HIERARCHICAL_PARENT_VIEW_MAP[\s\S]*quick_links:\s*'me'/)
    expect(appSource).toMatch(/VIEW_PREFETCHERS[\s\S]*school_website:\s*loadSchoolWebsiteView/)
    expect(appSource).toMatch(/VIEW_PREFETCHERS[\s\S]*quick_links:\s*loadQuickLinksView/)
    expect(appSource).toContain("v-else-if=\"currentView === 'school_website' && isLoggedIn\"")
    expect(appSource).toContain("v-else-if=\"currentView === 'quick_links' && isLoggedIn\"")
    expect(appSource).toContain('<SchoolWebsiteView')
    expect(appSource).toContain('<QuickLinksView')
    expect(appSource).toContain('@back="handleBackToMe"')
  })

  it('provides a school website page with iframe embed and external fallback', () => {
    const viewPath = 'src/components/SchoolWebsiteView.vue'
    const source = readSource(viewPath)
    const embedUtil = readSource('src/utils/school_website_embed.ts')

    expect(existsSync(sourcePath(viewPath))).toBe(true)
    expect(existsSync(sourcePath('src/utils/school_website_embed.ts'))).toBe(true)
    expect(embedUtil).toContain("export const SCHOOL_WEBSITE_URL = 'https://www.hbut.edu.cn/'")
    expect(embedUtil).toContain('mountSchoolWebsiteEmbed')
    expect(embedUtil).toContain('measureSchoolWebsiteEmbedBounds')
    expect(embedUtil).toContain('school_website_embed_open')
    expect(embedUtil).toContain('school_website_embed_resize')
    expect(embedUtil).toContain('school_website_embed_close')
    expect(embedUtil).toContain('isTauriDesktopRuntime')
    expect(embedUtil).toContain('external-open')
    expect(embedUtil).toContain('probeSchoolWebsiteProxyReachable')
    expect(source).toContain('resolveSchoolWebsiteEmbedMode')
    expect(source).toContain('mountSchoolWebsiteEmbed')
    expect(source).toContain('<iframe')
    expect(source).toContain('在浏览器中打开')
    expect(source).toContain('openExternal')
  })

  it('provides a quick links page that opens campus portals externally', () => {
    const viewPath = 'src/components/QuickLinksView.vue'
    const source = readSource(viewPath)

    expect(existsSync(sourcePath(viewPath))).toBe(true)
    expect(source).toContain('https://e.hbut.edu.cn/')
    expect(source).toContain('https://i.chaoxing.com/')
    expect(source).toContain('新融合门户')
    expect(source).toContain('学习通')
    expect(source).toContain('openExternal')
    expect(source).toContain('showToast')
  })

  it('registers school website embed commands in Rust', () => {
    const source = readSource('src-tauri/src/lib.rs')
    const moduleSource = readSource('src-tauri/src/modules/school_website_embed.rs')

    expect(source).toContain('modules::school_website_embed::school_website_embed_open')
    expect(source).toContain('modules::school_website_embed::school_website_embed_resize')
    expect(source).toContain('modules::school_website_embed::school_website_embed_close')
    expect(moduleSource).toContain('on_navigation')
    expect(moduleSource).toContain('on_new_window')
    expect(moduleSource).toContain('.hbut.edu.cn')
  })

  it('adds dark mode overrides for the new Me sub pages', () => {
    const source = readSource('src/styles/dark-mode.css')

    expect(source).toContain('html.dark .school-website-view')
    expect(source).toContain('html.dark .quick-links-view')
  })
})
