import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./ClassroomView.vue', import.meta.url), 'utf8')

/**
 * ClassroomView 展示契约（#1062 / #1063）。
 *
 * 本文件只做**源码契约**（模板/脚本接线是否正确），行为级判定由
 * `src/utils/classroom_result.spec.ts` 覆盖（仓库无 DOM 测试环境）。
 */
describe('ClassroomView display contract', () => {
  it('renders period buttons as single class periods instead of ranges', () => {
    const vue = source()

    expect(vue).toContain('{{ p.value }}')
    // i18n(#793)：节次 aria 标签经 tr() 取词（classroom.period.aria）
    expect(vue).toContain(":aria-label=\"tr('classroom.period.aria', { n: p.value })\"")
    expect(vue).not.toContain('{{ p.value }}-{{ p.value + 1')
  })

  it('shows the concrete query date near classroom results', () => {
    const vue = source()

    expect(vue).toContain('queryDateLabel')
    // i18n(#793)：日期前缀走 t('classroom.meta.datePrefix') 字典
    expect(vue).toContain("t('classroom.meta.datePrefix')")
    expect(vue).toContain('classroom-result-meta')
  })

  it('uses an explicit readable filter label color in light mode', () => {
    const vue = source()

    expect(vue).toContain('classroom-filter-label')
    expect(vue).toMatch(/\.classroom-filter-label\s*\{[^}]*color:\s*#334155;/s)
  })

  it('keeps selectable weeks complete and prefers the server week dictionary', () => {
    const vue = source()

    // 教师链路用后端真实周次字典（避免选中越界周次被服务端静默忽略）
    expect(vue).toContain('resolveWeekOptions(remoteWeekOptions.value)')
    expect(vue).toContain('v-for="w in weekOptions"')
    expect(vue).not.toContain('weekOptions.slice(0, 8)')
  })

  it('groups period selectors into fixed morning afternoon and evening rows', () => {
    const vue = source()

    expect(vue).toContain('const periodGroups = [')
    // i18n(#793)：时段分组标题走 t() 字典（key：classroom.time.*）
    expect(vue).toContain("t('classroom.time.morning')")
    expect(vue).toContain("t('classroom.time.afternoon')")
    expect(vue).toContain("t('classroom.time.evening')")
    expect(vue).toContain('v-for="group in periodGroups"')
    expect(vue).toContain('classroom-period-row')
    expect(vue).not.toContain('v-for="p in periodOptions"')
  })

  it('uses wider fixed period buttons so selected check icons do not overflow', () => {
    const vue = source()

    expect(vue).toMatch(/\.classroom-period-button\s*\{[^}]*width:\s*42px;/s)
    expect(vue).toMatch(/\.classroom-period-button\s*\{[^}]*min-width:\s*42px;/s)
    expect(vue).toMatch(/\.classroom-period-row-buttons\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*42px\);/s)
  })

  it('displays buildings as 一教/二教… while submitting the role-correct value (#753/#1063)', () => {
    const vue = source()

    // 显示：按钮文案经 displayBuildingName 映射（教务原文「N号教学楼」→「N教」）
    expect(vue).toContain('{{ displayBuildingName(b.name) }}')
    // 查询：按角色选择提交值（教师链路提交 jxldm id，学生链路提交 jxlmc 名称）
    expect(vue).toContain('filters.building = buildingQueryValue(b)')
    expect(vue).toContain('resolveBuildingQueryValue(building, buildingsFromTeacherDomain.value)')
    expect(vue).not.toContain('filters.building = b.name')
    // 映射规则：数字转汉字 + 「教」后缀，兼容「N号教学楼/N号楼/N教」形态
    expect(vue).toContain('CN_DIGITS')
    expect(vue).toMatch(/\(\?:号教学\(\?:楼\)\?\|号楼\|教\)/)
  })
})

describe('ClassroomView 日期/周次唯一来源（#1062 回归防线）', () => {
  it('不再读取本机 hbu_schedule_meta 覆盖周次', () => {
    const vue = source()

    // 历史缺陷：本机课表周次覆盖后端 meta → 「未知日期 + 第 7 周」自相矛盾
    expect(vue).not.toContain("localStorage.getItem('hbu_schedule_meta')")
    expect(vue).not.toContain('getPreferredCurrentWeek')
    expect(vue).not.toContain('calculateWeekFromStartDate')
  })

  it('日期/周次只经 normalizeClassroomMeta 从后端 meta 归一', () => {
    const vue = source()

    expect(vue).toContain('normalizeClassroomMeta')
    expect(vue).toContain('const currentMeta = ref(normalizeClassroomMeta({}))')
    // 查询成功/失败都必须刷新 meta（失败时清空，避免旧日期继续显示）
    expect(vue.match(/normalizeClassroomMeta\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('显示实际查询时间', () => {
    const vue = source()

    expect(vue).toContain('queryTimeLabel')
    expect(vue).toContain("t('classroom.meta.queryTimePrefix')")
    expect(vue).toContain('classroom-result-meta-time')
  })

  it('周次不由前端回填，留空即「本周」交由后端解析', () => {
    const vue = source()

    expect(vue).toContain("filters.value.week = ''")
    expect(vue).not.toContain('filters.value.week = currentMeta.value.week')
  })
})

describe('ClassroomView 结果语义（#1063 防误报）', () => {
  it('「空闲」徽标只在 period_free 时渲染', () => {
    const vue = source()

    expect(vue).toContain('v-if="isPeriodVerified"')
    expect(vue).toContain("t('classroom.badge.free')")
    expect(vue).toContain('t(roomBadgeKey)')
    // 不得无条件渲染绿色「空闲」徽标（历史缺陷）
    expect(vue).not.toContain("class=\"px-2 py-0.5 rounded-md bg-success-teal/10 text-success-teal text-[10px] font-semibold\">{{ t('classroom.badge.free') }}")
  })

  it('错误与真正的空状态区分显示', () => {
    const vue = source()

    expect(vue).toContain('data-testid="classroom-error"')
    expect(vue).toContain("v-if=\"emptyMode === 'verified-empty'\"")
    expect(vue).toContain("v-else-if=\"emptyMode === 'unverified-empty'\"")
    expect(vue).toContain("t('classroom.emptyUnverified')")
    // 空态不得只看 classrooms.length（历史缺陷：把 success+[] 当 0 个空教室）
    expect(vue).not.toContain('v-if="!loading && classrooms.length === 0 && !errorMsg"')
  })

  it('条数文案按可信度取词，不用「找到 N 个空教室」硬编码', () => {
    const vue = source()

    expect(vue).toContain('resultCountLabel')
    expect(vue).toContain('classroomCountKey(currentMeta.value)')
    expect(vue).not.toContain("t('classroom.result.foundSuffix')")
  })

  it('非 period_free 时展示可信度提示，并提示结果被截断', () => {
    const vue = source()

    expect(vue).toContain('showAvailabilityNotice')
    expect(vue).toContain('t(availabilityNoticeKey)')
    expect(vue).toContain('data-testid="classroom-availability-notice"')
    expect(vue).toContain('data-testid="classroom-truncated"')
  })

  it('楼栋候选失败不回退静态列表（教师链路同域要求）', () => {
    const vue = source()

    // 后端已返回错误时如实展示，不再静默使用本地兜底列表
    expect(vue).toContain('buildingsFromTeacherDomain')
    expect(vue).toContain('errorMsg.value = String(data.error)')
  })
})

describe('ClassroomView 节次时间表（学校实测值）', () => {
  it('使用 getJcinfo 实测的真实节次时间', () => {
    const vue = source()

    expect(vue).toContain('[8, 20, 9, 5]') // 第1节 8:20-9:05
    expect(vue).toContain('[18, 30, 19, 15]') // 第9节 18:30-19:15
    expect(vue).toContain("label: '18:30-19:15'")
    // 旧硬编码（与学校实际不符）必须消失
    expect(vue).not.toContain('[8, 0, 8, 45]')
    expect(vue).not.toContain("label: '19:00-19:45'")
  })
})

describe('ClassroomView 缓存与快照隔离（#1062/#1063）', () => {
  it('缓存 key 与快照都带角色', () => {
    const vue = source()

    expect(vue).toContain('buildClassroomCacheKey(sid, payload, classroomRole.value)')
    expect(vue).toContain('classroomRoleFromMeta(data.meta)')
    expect(vue).toContain('role: String(classroomRole.value')
  })
})
