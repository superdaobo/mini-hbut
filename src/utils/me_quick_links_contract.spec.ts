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
    expect(source).toContain('@click="handleOpenSchoolWebsite"')
    expect(source).toContain('@click="handleOpenQuickLinks"')
    expect(source).toContain('学校官网')
    expect(source).toContain('快捷链接')
  })

  it('registers school_website and quick_links as Me sub views in App.vue', () => {
    const source = readSource('src/App.vue')

    expect(source).toContain("const loadSchoolWebsiteView = () => import('./components/SchoolWebsiteView.vue')")
    expect(source).toContain("const loadQuickLinksView = () => import('./components/QuickLinksView.vue')")
    expect(source).toContain('const SchoolWebsiteView = createAsyncPage(loadSchoolWebsiteView)')
    expect(source).toContain('const QuickLinksView = createAsyncPage(loadQuickLinksView)')
    expect(source).toMatch(/ME_SUB_VIEWS\s*=\s*\[[\s\S]*'school_website'/)
    expect(source).toMatch(/ME_SUB_VIEWS\s*=\s*\[[\s\S]*'quick_links'/)
    expect(source).toMatch(/HIERARCHICAL_PARENT_VIEW_MAP[\s\S]*school_website:\s*'me'/)
    expect(source).toMatch(/HIERARCHICAL_PARENT_VIEW_MAP[\s\S]*quick_links:\s*'me'/)
    expect(source).toMatch(/VIEW_PREFETCHERS[\s\S]*school_website:\s*loadSchoolWebsiteView/)
    expect(source).toMatch(/VIEW_PREFETCHERS[\s\S]*quick_links:\s*loadQuickLinksView/)
    expect(source).toContain("v-else-if=\"currentView === 'school_website'\"")
    expect(source).toContain("v-else-if=\"currentView === 'quick_links'\"")
    expect(source).toContain('<SchoolWebsiteView')
    expect(source).toContain('<QuickLinksView')
    expect(source).toContain('@back="handleBackToMe"')
  })

  it('provides a school website page with iframe embed and external fallback', () => {
    const viewPath = 'src/components/SchoolWebsiteView.vue'
    const source = readSource(viewPath)

    expect(existsSync(sourcePath(viewPath))).toBe(true)
    expect(source).toContain("const SCHOOL_WEBSITE_URL = 'https://www.hbut.edu.cn/'")
    expect(source).toContain('<iframe')
    expect(source).toContain('在浏览器中打开')
    expect(source).toContain('4500')
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

  it('adds dark mode overrides for the new Me sub pages', () => {
    const source = readSource('src/styles/dark-mode.css')

    expect(source).toContain('html.dark .school-website-view')
    expect(source).toContain('html.dark .quick-links-view')
  })
})
