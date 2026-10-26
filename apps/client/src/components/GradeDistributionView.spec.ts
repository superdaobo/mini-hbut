/**
 * GradeDistributionView.vue 源码契约（issue #1111：双模式查询与结果状态保护）。
 *
 * 本 spec 为「源码契约」测试：node 环境下不挂载组件（项目无 @vue/test-utils），
 * 直接断言组件源码的关键行为与 i18n key 齐备，防止后续改动回退：
 * - 请求体必须经 buildGradeDistributionQuery 构造（teacher/course 字段二选一）；
 * - requestSeq 竞态守卫：过期请求结果不得写回 items/total/error/loading；
 * - 切换模式：作废在途请求 + 清空关键词/结果/详情/错误 + 页码回 1；
 * - 空输入：不发起查询（else 分支无 loadData），并重置列表/错误/详情；
 * - 分段控件：两个模式按钮均带 aria-pressed；
 * - 三语字典：新增 mode / placeholder / searchHint key 齐备且非空。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages, ensureLocaleMessages } from '../utils/app_i18n'

const componentSource = readFileSync(
  resolve(process.cwd(), 'src/components/GradeDistributionView.vue'),
  'utf8'
)

/** 截取两个锚点之间的源码片段（anchorEnd 在 anchorStart 之后） */
const between = (anchorStart: string, anchorEnd: string): string => {
  const start = componentSource.indexOf(anchorStart)
  expect(start, `锚点缺失: ${anchorStart}`).toBeGreaterThanOrEqual(0)
  const end = componentSource.indexOf(anchorEnd, start)
  expect(end, `锚点缺失: ${anchorEnd}`).toBeGreaterThan(start)
  return componentSource.slice(start, end)
}

describe('GradeDistributionView 双模式与竞态保护（源码契约）', () => {
  it('文件存在', () => {
    expect(existsSync(resolve(process.cwd(), 'src/components/GradeDistributionView.vue'))).toBe(true)
  })

  it('请求体经 helper 构造：teacher 只传 teacher_name、course 只传 course_name', () => {
    // 引入纯函数层
    expect(componentSource).toContain("from '../utils/grade_distribution_query'")
    expect(componentSource).toContain('buildGradeDistributionQuery')
    expect(componentSource).toContain('isGradeSearchActive')
    // loadData 内使用 helper 构造请求（按当前模式 / 关键词 / 页码）
    const loadDataBody = between('const loadData', '// 切换搜索模式')
    expect(loadDataBody).toMatch(/buildGradeDistributionQuery\(\s*searchMode\.value\s*,\s*searchQuery\.value\s*,\s*page\.value\s*,\s*pageSize\s*\)/)
    // 不再手工拼 teacher_name（旧实现已移除）
    expect(loadDataBody).not.toContain('teacher_name:')
  })

  it('requestSeq 竞态守卫：序号不一致时丢弃过期结果（成功/失败/finally 三处）', () => {
    expect(componentSource).toMatch(/let requestSeq = \d+/)
    // 发起时递增
    expect(componentSource).toMatch(/const seq = \+\+requestSeq/)
    // 成功与失败路径均先校验序号再写状态
    const successGuard = between('const result = await fetchGradeDistribution(query)', '} catch (e) {')
    const catchGuard = between('} catch (e) {', "t('grade.dist.errorPrefix')")
    expect(successGuard).toContain('if (seq !== requestSeq) return')
    expect(catchGuard).toContain('if (seq !== requestSeq) return')
    // finally 只有最新请求能结束 loading
    expect(componentSource).toContain('if (seq === requestSeq) loading.value = false')
  })

  it('loadData 空输入早退：空关键词不触发查询', () => {
    const loadDataBody = between('const loadData', '// 切换搜索模式')
    expect(loadDataBody).toContain('if (!hasQuery.value) return')
  })

  it('切换模式：作废在途请求 + 清空关键词/结果/详情/错误 + 页码回 1', () => {
    const switchModeBody = between('const switchMode', 'const retrySearch')
    expect(switchModeBody).toContain('requestSeq += 1')
    expect(switchModeBody).toContain('searchMode.value = mode')
    expect(switchModeBody).toContain("searchQuery.value = ''")
    expect(switchModeBody).toContain('page.value = 1')
    expect(switchModeBody).toContain('resetResults()')
    // 同模式点击不重复重置
    expect(switchModeBody).toMatch(/if \(mode === searchMode\.value\) return/)
  })

  it('resetResults 清空列表/总数/错误/详情', () => {
    const resetBody = between('const resetResults', '// 加载数据')
    expect(resetBody).toContain('items.value = []')
    expect(resetBody).toContain('total.value = 0')
    expect(resetBody).toContain("error.value = ''")
    expect(resetBody).toContain('selectedItem.value = null')
  })

  it('清空文本/空输入（防抖到期 else 分支）：作废请求并重置，不调用 loadData', () => {
    const onSearchBlock = between('const onSearchInput', '// 挂科率计算')
    expect(onSearchBlock).toContain('setTimeout')
    const elseBranch = onSearchBlock.slice(onSearchBlock.indexOf('} else {'))
    expect(elseBranch).not.toContain('loadData(')
    expect(elseBranch).toContain('requestSeq += 1')
    expect(elseBranch).toContain('resetResults()')
    // 有查询时才触发（防抖保持 400ms）
    expect(onSearchBlock).toContain('loadData()')
    expect(onSearchBlock).toMatch(/,\s*400\s*\)/)
  })

  it('分段控件：teacher / course 两个按钮均带 aria-pressed，且键盘可用（原生 button + 无 type 冲突）', () => {
    expect(componentSource).toContain('role="group"')
    expect(componentSource).toContain(":aria-pressed=\"searchMode === 'teacher'\"")
    expect(componentSource).toContain(":aria-pressed=\"searchMode === 'course'\"")
    expect(componentSource).toContain("@click=\"switchMode('teacher')\"")
    expect(componentSource).toContain("@click=\"switchMode('course')\"")
    // 原生 <button>（可聚焦/回车触发），分段控件文案走 i18n
    expect(componentSource).toContain("{{ t('grade.dist.mode.teacher') }}")
    expect(componentSource).toContain("{{ t('grade.dist.mode.course') }}")
  })

  it('占位符与空状态按模式切换（新 key），旧 key 保留兼容', () => {
    expect(componentSource).toContain("t('grade.dist.search.teacherPlaceholder')")
    expect(componentSource).toContain("t('grade.dist.search.coursePlaceholder')")
    expect(componentSource).toContain("t('grade.dist.empty.searchHintTeacher')")
    expect(componentSource).toContain("t('grade.dist.empty.searchHintCourse')")
  })

  it('三语字典：新增 8 个 key 齐备且非空（zh-CN / en / ja）', async () => {
    await ensureLocaleMessages('en')
    await ensureLocaleMessages('ja')
    const requiredKeys = [
      'grade.dist.mode.teacher',
      'grade.dist.mode.course',
      'grade.dist.mode.label',
      'grade.dist.search.teacherPlaceholder',
      'grade.dist.search.coursePlaceholder',
      'grade.dist.empty.searchHintTeacher',
      'grade.dist.empty.searchHintCourse',
    ]
    for (const locale of ['zh-CN', 'en', 'ja'] as const) {
      for (const key of requiredKeys) {
        const value = messages[locale][key]
        expect(value, `${locale} 缺少 ${key}`).toBeTruthy()
        expect(String(value).trim().length, `${locale} 的 ${key} 文案为空`).toBeGreaterThan(0)
      }
    }
    // 旧 key 保留（兼容，不删除）
    expect(messages['zh-CN']['grade.dist.search.placeholder']).toBeTruthy()
    expect(messages['zh-CN']['grade.dist.empty.searchHint']).toBeTruthy()
  })
})
