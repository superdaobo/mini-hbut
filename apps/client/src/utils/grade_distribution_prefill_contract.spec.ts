import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// #1321 源码契约：课表课程详情 → 给分记录 的一次性教师预填链路
// （ScheduleCourseDetail emit → ScheduleView 转发 → App 接线 →
//   NavigationCoordinator 写预填 → GradeDistributionView 挂载消费）
const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const extractBlock = (source: string, marker: string, nextMarker: string) => {
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(nextMarker, start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('grade distribution teacher prefill contract (#1321)', () => {
  it('GradeDistributionView 在 onMounted 中消费预填并立即查询（不走防抖）', () => {
    const source = readSource('src/components/GradeDistributionView.vue')
    expect(source).toContain('consumePendingGradeTeacher')
    const block = extractBlock(source, 'onMounted(() => {', '</script>')
    expect(block).toContain('consumePendingGradeTeacher()')
    expect(block).toContain('loadData()')
    // 必须先赋值 searchQuery 再调用 loadData（后者在关键词为空时 early-return）
    const assignIndex = block.indexOf('searchQuery.value = teacher')
    const loadIndex = block.indexOf('loadData()')
    expect(assignIndex).toBeGreaterThanOrEqual(0)
    expect(loadIndex).toBeGreaterThan(assignIndex)
  })

  it('NavigationCoordinator 的 handleNavigate 在 goToView 之前写入预填', () => {
    const source = readSource('src/app/coordinators/NavigationCoordinator.ts')
    const block = extractBlock(
      source,
      'const handleNavigate = async (target: unknown) => {',
      'const handleBackToDashboard = () => {'
    )
    const navigationIndex = block.indexOf('const navigated = goToView(normalized.view)')
    const writeIndex = block.indexOf('writePendingGradeTeacher')
    expect(navigationIndex).toBeGreaterThanOrEqual(0)
    expect(writeIndex).toBeGreaterThanOrEqual(0)
    expect(writeIndex).toBeLessThan(navigationIndex)
    expect(block).toContain("normalized.view === 'grade_distribution'")
  })

  it('App.vue 在 ScheduleView 上内联接线 open-grade-distribution', () => {
    const source = readSource('src/App.vue')
    const line = source
      .split('\n')
      .find((l) => l.includes('@open-grade-distribution'))
    expect(line).toBeTruthy()
    expect(line).toContain("handleNavigate({ view: 'grade_distribution'")
  })

  it('ScheduleView 声明并转发 open-grade-distribution（defineEmits + 子组件绑定）', () => {
    const source = readSource('src/components/ScheduleView.vue')
    expect(source).toContain("'open-grade-distribution'")
    expect(source).toContain('@open-grade-distribution="handleOpenGradeDistribution"')
  })

  it('ScheduleCourseDetail 发射 open-grade-distribution 事件', () => {
    const source = readSource('src/features/schedule/components/ScheduleCourseDetail.vue')
    expect(source).toContain('open-grade-distribution')
    expect(source).toContain("emit('open-grade-distribution'")
  })

  it('入口图标走首页同一套 Material Symbols，不用 emoji', () => {
    const source = readSource('src/features/schedule/components/ScheduleCourseDetail.vue')
    // 与首页模块图标同源（ThemeModuleIcon 的 grade_distribution → bar_chart）
    expect(source).toContain('class="material-symbols-outlined teacher-grade-pill__icon"')
    expect(source).toContain('>bar_chart</span>')
    // 回归保护：入口文案里不允许再出现 emoji 图标
    expect(source).not.toContain('📊')
  })
})
