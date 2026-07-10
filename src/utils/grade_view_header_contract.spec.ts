import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('grade view header contract', () => {
  it('keeps a visible gap between the page title and grade tabs', () => {
    const source = readText('src/components/GradeView.vue')

    const tabBarStyle = source.match(/\.grade-tab-bar\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(tabBarStyle).toMatch(/margin:\s*0/)
  })

  it('shows a top-right refresh action that asks App.vue to reload grades', () => {
    const gradeSource = readText('src/components/GradeView.vue')
    const appSource = readText('src/App.vue')

    expect(gradeSource).toContain("defineEmits(['back', 'logout', 'refresh'])")
    expect(gradeSource).toContain('class="grade-stitch-refresh grade-refresh-btn"')
    expect(gradeSource).toContain(':class="{ spinning: refreshing || offline }"')
    expect(gradeSource).toContain("@click=\"handleRefresh\"")
    expect(gradeSource).toContain("const handleRefresh = () => emit('refresh')")
    expect(gradeSource).toContain('props.syncTime ? formatRelativeTime(props.syncTime)')
    expect(gradeSource).not.toContain('syncTime.value')
    expect(gradeSource).toContain('class="grade-updated-at"')
    expect(gradeSource).toContain('最新更新时间')
    expect(appSource).toContain('const resolveGradeSyncTime = (data) =>')
    expect(appSource).toContain('getStaleCachedData')
    expect(appSource).toContain('const applyStaleGradesSnapshot = (sid) =>')
    expect(appSource).toContain('GRADE_CACHE_REFRESH_RETRY_MS')
    expect(appSource).toContain('scheduleGradeRealtimeRetry')
    expect(appSource).toContain('@refresh="handleRefreshGrades"')
    expect(appSource).toContain('const handleRefreshGrades = async () =>')
    expect(appSource).toContain('fetchGradesFromAPI(studentId.value, { force: true, teacherCurrentOnly: true })')
    expect(appSource).toContain('const fetchGradesFromAPI = async (sid, { force = false, teacherCurrentOnly = false, silent = false } = {})')
    expect(appSource).toContain('const showedStaleSnapshot = !force ? applyStaleGradesSnapshot(sid) : false')
    expect(appSource).toContain('setCachedData(`grades:${sid}`, data)')
    expect(appSource).not.toContain('const { data } = await fetchWithCache(`grades:${sid}`, () => fetchGradesRemote(sid))')

    // 成绩必须以教务完整列表为权威源：始终 forceRemote，禁止 SWR 三元分支复活已删除成绩。
    const fetchGradesBlock =
      appSource.match(
        /const fetchGradesFromAPI = async \(sid, \{ force = false, teacherCurrentOnly = false, silent = false \} = \{\}\) => \{[\s\S]*?^const handleRequireLogin/m
      )?.[0] || ''
    expect(fetchGradesBlock).toContain("{ forceRemote: true, priority: 'foreground' }")
    expect(fetchGradesBlock).not.toContain('DEFAULT_SWR_OPTIONS')
    expect(fetchGradesBlock).not.toMatch(/force\s*\?\s*\{\s*forceRemote:\s*true/)
    expect(appSource).not.toMatch(
      /import\s*\{[^}]*DEFAULT_SWR_OPTIONS[^}]*\}\s*from\s*['"]\.\/utils\/api\.js['"]/
    )
  })

  it('refreshes grades every time the grades view is opened, even when old data exists', () => {
    const appSource = readText('src/App.vue')
    const navigateBlock = appSource.match(/const handleNavigate = async \(target\) => \{[\s\S]*?const handleBackToDashboard/s)?.[0] || ''

    expect(navigateBlock).toContain("if (normalized.view === 'grades') {")
    expect(navigateBlock).toContain('void loadGradesForCurrentView()')
    expect(navigateBlock).not.toContain("normalized.view === 'grades' && gradeData.value.length === 0")
  })

  it('uses the Stitch grade page structure without adding bottom navigation', () => {
    const source = readText('src/components/GradeView.vue')

    expect(source).toContain('class="grade-stitch-header"')
    expect(source).toContain('class="grade-stitch-main"')
    expect(source).toContain('class="grade-filter-card"')
    expect(source).toContain('class="grade-stats-grid"')
    expect(source).toContain('class="grade-card"')
    expect(source).toContain('class="term-icon"')
    expect(source).toContain('rounded-2xl')
    expect(source).not.toContain('<nav')
    expect(source).not.toContain('BottomNavigation')
  })

  it('does not report offline grade fallback as a successful manual refresh', () => {
    const appSource = readText('src/App.vue')

    expect(appSource).toContain('const lastGradeRefreshUsedOffline = ref(false)')
    expect(appSource).toContain('lastGradeRefreshUsedOffline.value = !!data?.offline')
    expect(appSource).toContain("showToast('教务系统暂不可用，已显示缓存'")
    expect(appSource).not.toContain("showToast(ok ? '成绩已刷新' : '成绩刷新失败'")
  })

  it('formats total credits with two decimal places', () => {
    const source = readText('src/components/GradeView.vue')

    expect(source).toContain('credits: credits.toFixed(2)')
    expect(source).not.toContain('credits: credits.toFixed(1)')
  })

  it('uses five semantic score color bands from green to red', () => {
    const source = readText('src/components/GradeView.vue')

    const scoreClassBlock = source.match(/const getScoreClass = \(score\) => \{[\s\S]*?\n\}/)?.[0] || ''
    expect(scoreClassBlock).toContain("if (num >= 90) return 'excellent'")
    expect(scoreClassBlock).toContain("if (num >= 80) return 'good'")
    expect(scoreClassBlock).toContain("if (num >= 70) return 'average'")
    expect(scoreClassBlock).toContain("if (num >= 60) return 'pass'")
    expect(scoreClassBlock).toContain("return 'fail'")

    expect(source).toContain('.grade-card.excellent .card-score')
    expect(source).toContain('.grade-card.good .card-score')
    expect(source).toContain('.grade-card.average .card-score')
    expect(source).toContain('.grade-card.pass .card-score')
    expect(source).toContain('.grade-card.fail .card-score')
    expect(source).toContain('.detail-score.average')
  })

  it('renders the grade page header and semester labels with dark-mode-safe colors', () => {
    const source = readText('src/components/GradeView.vue')
    const darkModeSource = readText('src/styles/dark-mode.css')

    expect(source).toContain('class="grade-stitch-header"')
    expect(source).toContain('class="term-header"')
    expect(source).toContain('.term-header h2')
    expect(darkModeSource).toContain('html.dark .grade-view .grade-stitch-header')
    expect(darkModeSource).toContain('html.dark .grade-view .grade-stitch-header h1')
    expect(darkModeSource).toContain('html.dark .grade-view .term-header h2')
    expect(darkModeSource).toContain('html.dark .grade-view .term-icon')
    expect(darkModeSource).toContain('html.dark .grade-view .grade-filter-card')
    expect(darkModeSource).toContain('html.dark .grade-view .search-input')
    expect(darkModeSource).toContain('html.dark .grade-view .filter-select .ios26-select-trigger')
    expect(darkModeSource).toContain('html.dark .grade-view .detail-score.excellent')
    expect(darkModeSource).toContain('html.dark .grade-view .detail-score.fail')
  })
})
