import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const getRuleBody = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 's'))?.groups?.body || ''
}

describe('home dashboard interaction contract', () => {
  const dashboardVue = () => readSource('src/components/Dashboard.vue')
  const appVue = () => readSource('src/App.vue')

  it('keeps the HBUT header and search fixed while the home content scrolls', () => {
    const source = dashboardVue()
    const rootRule = getRuleBody(source, '.dashboard-root')
    const headerRule = getRuleBody(source, '.home-fixed-header')
    const contentRule = getRuleBody(source, '.home-scroll-content')

    expect(source).toContain('class="home-fixed-header')
    expect(rootRule).toContain('--home-header-height')
    expect(headerRule).toContain('position: fixed')
    expect(headerRule).toContain('top: env(safe-area-inset-top, 0px)')
    expect(headerRule).toContain('left: 50%')
    expect(headerRule).toContain('transform: translateX(-50%)')
    expect(headerRule).toContain('z-index: 55')
    expect(contentRule).toContain('padding-top: var(--home-header-height)')
  })

  it('renders the empty schedule icon at a stable aspect ratio', () => {
    const source = dashboardVue()
    const emptyIconRule = getRuleBody(source, '.today-empty-icon')

    expect(source).toContain('class="today-empty-icon"')
    expect(emptyIconRule).toContain('aspect-ratio: 1 / 1')
    expect(emptyIconRule).toContain('object-fit: contain')
    expect(emptyIconRule).toContain('flex: 0 0 auto')
  })

  it('persists the selected home category before navigating away', () => {
    const source = dashboardVue()

    expect(source).toContain("const HOME_FEATURE_TAB_KEY = 'hbu_home_feature_tab'")
    expect(source).toContain('const navigateFromHome = (moduleId)')
    expect(source).toContain('persistHomeFeatureTab()')
    expect(source).toContain('navigateTo(moduleId)')
    expect(source).toContain('@click="setActiveFeatureTab(cat.title)"')
  })

  it('restores the home scroll position when returning from a module', () => {
    const source = appVue()

    expect(source).toContain('const homeScrollSnapshot = ref(0)')
    expect(source).toContain('const rememberHomeScrollPosition = ()')
    expect(source).toContain('const restoreHomeScrollPosition = ()')
    expect(source).toContain('rememberHomeScrollPosition()')
    expect(source).toContain("goToView('home', { restoreScroll: true })")
    expect(source).toContain('recoverViewportAfterTransition({ scrollToTop: false')
  })
})
