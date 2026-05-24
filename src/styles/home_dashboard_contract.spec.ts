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

  it('keeps the HBUT header and search as normal top-of-home content', () => {
    const source = dashboardVue()
    const rootRule = getRuleBody(source, '.dashboard-root')

    expect(source).not.toContain('class="home-fixed-header')
    expect(source).not.toContain('class="home-scroll-content')
    expect(rootRule).not.toContain('--home-header-height')
    expect(source).not.toContain('position: fixed')
    expect(source).not.toContain('position: sticky')
    expect(source).not.toContain('sticky top-0')
  })

  it('renders the empty schedule icon at a stable aspect ratio', () => {
    const source = dashboardVue()
    const emptyIconRule = getRuleBody(source, '.today-empty-icon')

    expect(source).toContain('class="today-empty-icon"')
    expect(emptyIconRule).toContain('aspect-ratio: 1 / 1')
    expect(emptyIconRule).toContain('object-fit: contain')
    expect(emptyIconRule).toContain('flex: 0 0 auto')
  })

  it('scales forecast temperature bars from displayed daily forecast bounds', () => {
    const source = dashboardVue()

    expect(source).toContain('getForecastTemperatureBounds')
    expect(source).toContain('forecastTemperatureBounds')
    expect(source).toContain('getTemperatureRangeStyle(f.temp_low, f.temp_high, forecastTemperatureBounds.value)')
    expect(source).not.toContain('const minRange = -5')
    expect(source).not.toContain('const maxRange = 42')
    expect(source).not.toContain('100 - ((high - minRange) / totalRange) * 100')
  })

  it('derives forecast low and high temperature text colors from actual temperatures', () => {
    const source = dashboardVue()

    expect(source).not.toContain('text-xs text-blue-500 font-medium w-8 text-right')
    expect(source).not.toContain('text-xs text-red-500 font-medium w-8')
    expect(source).toContain("getTemperatureColor(f.temp_low, 'text')")
    expect(source).toContain("getTemperatureColor(f.temp_high, 'text')")
  })

  it('uses unified soft weather icon tones instead of high-contrast hardcoded colors', () => {
    const source = dashboardVue()

    expect(source).not.toContain("if (c === '阴') return '#4b5563'")
    expect(source).not.toContain("if (c === '小雨' || c === '中雨') return '#3b82f6'")
    expect(source).not.toContain("if (c === '大雨' || c === '雷阵雨') return '#1e40af'")
    expect(source).not.toContain("if (condition === '阴') return '#4b5563'")
    expect(source).not.toContain("if (condition === '小雨' || condition === '中雨') return '#3b82f6'")
    expect(source).not.toContain("if (condition === '大雨' || condition === '雷阵雨') return '#1e40af'")
    expect(source).toContain('getWeatherIconTone')
    expect(source).toContain('getWeatherIconTone(condition).color')
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
