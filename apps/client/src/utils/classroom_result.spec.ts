/**
 * 空教室结果语义单测（#1062 / #1063 前端契约）。
 *
 * 仓库 vitest 主配置为 node 环境且未引入 `@vue/test-utils`，因此沿用仓库既有的
 * 「纯函数 + 源码契约」测试范式（参见 `game-center/__tests__/points_tab.spec.ts`
 * 文件头说明）：把「结果可信度判定 / 展示文案 / 空态区分 / 请求载荷」抽成
 * `utils/classroom_result.js` 后在此完整覆盖。
 *
 * fixtures 全部来自真实探测（已脱敏，无姓名/工号/学号/Cookie）：
 * `data/teacher-api-recon/09-classroom-teacher-probe-2026-10-16.md`
 */

import { describe, expect, it } from 'vitest'
import {
  CLASSROOM_AVAILABILITY,
  buildClassroomCacheKey,
  buildClassroomQueryPayload,
  classroomAvailabilityOf,
  classroomBadgeKey,
  classroomCountKey,
  classroomEmptyMode,
  classroomNoticeKey,
  classroomResultCount,
  classroomRoleFromMeta,
  formatClassroomCalendarLabel,
  isAvailabilityUnknown,
  isClassroomResultTruncated,
  isResourceCatalog,
  isVerifiedFree,
  normalizeClassroomMeta,
  normalizeRemoteWeeks,
  resolveBuildingQueryValue,
  resolveWeekOptions,
  shouldShowAvailabilityNotice
} from './classroom_result.js'

/** 实测：第 7 周 / 周一 / 9-11 节 / 3 号 → 25 间（教师链路，服务端已按时间筛选）。 */
const META_PERIOD_FREE = {
  semester: '2026-2027-1',
  date_str: '2026年10月12日',
  date_iso: '2026-10-12',
  date_source: 'server_week_dates',
  week: 7,
  weekday: 1,
  weekday_name: '周一',
  periods: [9, 10, 11],
  periods_str: '第9,10,11节',
  total: 25,
  loaded: 25,
  truncated: false,
  resource_total: 191,
  query_time: '2026-10-16 09:00:00',
  filter_mode: 'teacher_period_query',
  filters_applied: true,
  availability: 'period_free'
}

/** 实测：无筛选资源目录 191 条，`jyzt`/`sfqy` 恒为 "1"（无可用性信息）。 */
const META_RESOURCE_CATALOG = {
  semester: '2026-2027-1',
  resource_total: 191,
  total: 191,
  loaded: 191,
  filter_mode: 'teacher_resource_domain',
  filters_applied: false,
  availability: 'resource_catalog'
}

/** 实测：非法/越界 zcStr 静默返回全量 191 → 与「全时空闲」无法区分。 */
const META_UNKNOWN = {
  ...META_PERIOD_FREE,
  total: 191,
  loaded: 191,
  availability: 'unknown'
}

/**
 * 学生链路 meta（`POST /admin/pkgl/jyjs/mobile/jsxx`）。
 *
 * 回归护栏（#1060 集成审查 P0）：学生分支曾**不输出** `availability` / `filter_mode`，
 * 导致前端把「字段缺失」保守判为 `unknown`，学生每次查询成功都会看到
 * 「状态未知 / 请勿据此判定空闲」告警与未知徽标，并让 `classroomRoleFromMeta`
 * 取不到角色。学生接口本身即按 `zcStr/xqStr/jcStr/xnxq` 时间维度查询，
 * 必须显式声明 `period_free` 与 `student_*` 角色。
 */
const META_STUDENT_PERIOD_FREE = {
  semester: '2026-2027-1',
  date_str: '2026年10月12日',
  date_iso: '2026-10-12',
  week: 7,
  weekday: 1,
  weekday_name: '周一',
  periods: [9, 10, 11],
  periods_str: '第9,10,11节',
  total: 12,
  filter_mode: 'student_period_query',
  availability: 'period_free',
  query_time: '2026-10-16 09:00:00',
  auto_strategy: 'fallback',
  is_vacation: false,
  vacation_notice: ''
}

describe('normalizeClassroomMeta（日期/周次唯一来源）', () => {
  it('保留后端日期与周次，不做任何本机推算', () => {
    const meta = normalizeClassroomMeta(META_PERIOD_FREE)
    expect(meta.date_str).toBe('2026年10月12日')
    expect(meta.week).toBe('7')
    expect(meta.weekday_name).toBe('周一')
    expect(meta.query_time).toBe('2026-10-16 09:00:00')
    expect(meta.availability).toBe('period_free')
  })

  it('空/缺失 meta 不产生伪造日期与周次', () => {
    const meta = normalizeClassroomMeta()
    expect(meta.date_str).toBe('')
    expect(meta.week).toBe('')
    expect(meta.weekday_name).toBe('')
    expect(meta.total).toBeNull()
  })

  it('类型差异（字符串数字）也能归一，非法值不回落 0', () => {
    const meta = normalizeClassroomMeta({ total: '53', loaded: '20', week: '7', resource_total: '191' })
    expect(meta.total).toBe(53)
    expect(meta.loaded).toBe(20)
    expect(meta.week).toBe('7')
    expect(meta.resource_total).toBe(191)

    const broken = normalizeClassroomMeta({ total: 'abc', loaded: null, week: '' })
    expect(broken.total).toBeNull()
    expect(broken.loaded).toBeNull()
    expect(broken.week).toBe('')
  })

  it('周次 0（预备周）不显示为「第 0 周」', () => {
    expect(normalizeClassroomMeta({ week: 0 }).week).toBe('')
    expect(normalizeClassroomMeta({ week: '0' }).week).toBe('')
  })
})

describe('五态判定（availability）', () => {
  it('只有 period_free 被认定为「已验证空闲」', () => {
    expect(classroomAvailabilityOf(META_PERIOD_FREE)).toBe(CLASSROOM_AVAILABILITY.PERIOD_FREE)
    expect(isVerifiedFree(META_PERIOD_FREE)).toBe(true)
    for (const meta of [META_RESOURCE_CATALOG, META_UNKNOWN, { availability: 'unauthorized' }, { availability: 'bad_response' }]) {
      expect(isVerifiedFree(meta)).toBe(false)
    }
  })

  it('未知/缺失 availability 一律保守归为 unknown', () => {
    expect(classroomAvailabilityOf({})).toBe(CLASSROOM_AVAILABILITY.UNKNOWN)
    expect(classroomAvailabilityOf({ availability: 'weird-value' })).toBe(CLASSROOM_AVAILABILITY.UNKNOWN)
    expect(isAvailabilityUnknown({})).toBe(true)
    expect(isVerifiedFree({})).toBe(false)
  })

  it('资源目录与状态未知可区分', () => {
    expect(isResourceCatalog(META_RESOURCE_CATALOG)).toBe(true)
    expect(isAvailabilityUnknown(META_RESOURCE_CATALOG)).toBe(false)
    expect(isAvailabilityUnknown(META_UNKNOWN)).toBe(true)
    expect(isResourceCatalog(META_UNKNOWN)).toBe(false)
  })
})

describe('展示文案不得夸大（#1063：无证据不宣称空闲）', () => {
  it('只有 period_free 才用「找到 N 个空教室」', () => {
    expect(classroomCountKey(META_PERIOD_FREE)).toBe('classroom.result.freeCount')
    expect(classroomCountKey(META_RESOURCE_CATALOG)).toBe('classroom.result.catalogCount')
    expect(classroomCountKey(META_UNKNOWN)).toBe('classroom.result.unknownCount')
    expect(classroomCountKey({})).toBe('classroom.result.unknownCount')
  })

  it('徽标同理：只有 period_free 才显示「空闲」', () => {
    expect(classroomBadgeKey(META_PERIOD_FREE)).toBe('classroom.badge.free')
    expect(classroomBadgeKey(META_RESOURCE_CATALOG)).toBe('classroom.badge.catalog')
    expect(classroomBadgeKey(META_UNKNOWN)).toBe('classroom.badge.unknown')
  })

  it('可信度提示按状态给出对应说明', () => {
    expect(classroomNoticeKey(META_RESOURCE_CATALOG)).toBe('classroom.availability.catalog')
    expect(classroomNoticeKey(META_UNKNOWN)).toBe('classroom.availability.unknown')
    expect(classroomNoticeKey({ availability: 'unauthorized' })).toBe('classroom.availability.other')
    expect(shouldShowAvailabilityNotice(META_PERIOD_FREE, true)).toBe(false)
    expect(shouldShowAvailabilityNotice(META_UNKNOWN, true)).toBe(true)
    // 尚未成功查询过时不提示
    expect(shouldShowAvailabilityNotice(META_UNKNOWN, false)).toBe(false)
  })

  it('条数优先后端 total，缺失时退回已加载条数', () => {
    expect(classroomResultCount(META_PERIOD_FREE, 3)).toBe(25)
    expect(classroomResultCount({}, 7)).toBe(7)
    expect(classroomResultCount({ total: null }, 0)).toBe(0)
  })
})

describe('错误 vs 真正的空（空态区分）', () => {
  it('已验证的空闲查询 0 条 → verified-empty（可说「没有找到空教室」）', () => {
    expect(
      classroomEmptyMode({
        meta: { ...META_PERIOD_FREE, total: 0, loaded: 0 },
        roomCount: 0,
        loading: false,
        hasError: false
      })
    ).toBe('verified-empty')
  })

  it('资源目录/状态未知导致 0 条 → unverified-empty（不得说「没有找到空教室」）', () => {
    for (const meta of [META_RESOURCE_CATALOG, META_UNKNOWN, {}]) {
      expect(classroomEmptyMode({ meta, roomCount: 0, loading: false, hasError: false })).toBe(
        'unverified-empty'
      )
    }
  })

  it('错误、加载中、有条目时都不展示空态', () => {
    expect(
      classroomEmptyMode({ meta: META_PERIOD_FREE, roomCount: 0, loading: false, hasError: true })
    ).toBe('none')
    expect(
      classroomEmptyMode({ meta: META_PERIOD_FREE, roomCount: 0, loading: true, hasError: false })
    ).toBe('none')
    expect(
      classroomEmptyMode({
        meta: { ...META_PERIOD_FREE, total: 0 },
        roomCount: 3,
        loading: false,
        hasError: false
      })
    ).toBe('none')
  })

  it('results 少于 total（分页/越界）必须提示截断，不能当 0 条', () => {
    // 实测 page.pn=99 → {total:53, results:[]}
    expect(isClassroomResultTruncated({ total: 53, loaded: 0 }, 0)).toBe(true)
    expect(isClassroomResultTruncated({ total: 53, loaded: 53 }, 53)).toBe(false)
    expect(isClassroomResultTruncated({ total: 0, loaded: 0 }, 0)).toBe(false)
    // 后端显式标记
    expect(isClassroomResultTruncated({ total: 53, loaded: 50, truncated: true }, 50)).toBe(true)
  })
})

describe('日期/周次标签（唯一来源一致性）', () => {
  it('日期只取后端 date_str；周次与星期拼接一致', () => {
    const meta = normalizeClassroomMeta(META_PERIOD_FREE)
    expect(formatClassroomCalendarLabel(meta, (n) => `第${n}周`)).toBe('第7周 · 周一')
  })

  it('后端已给「第N周」原文时原样保留', () => {
    expect(formatClassroomCalendarLabel({ week: '第7周', weekday_name: '周一' })).toBe('第7周 · 周一')
  })

  it('周次为空时只显示星期，不伪造周次', () => {
    expect(formatClassroomCalendarLabel({ week: '', weekday_name: '周一' })).toBe('周一')
    expect(formatClassroomCalendarLabel({})).toBe('')
  })
})

describe('周次选项（教师链路用后端真实字典）', () => {
  it('过滤掉预备周 0 与非法值，并排序去重', () => {
    expect(normalizeRemoteWeeks([0, 1, '2', 2, 21, null, 'abc', -1])).toEqual([1, 2, 21])
    expect(normalizeRemoteWeeks(undefined)).toEqual([])
  })

  it('有后端字典时使用字典，否则回退本地范围', () => {
    expect(resolveWeekOptions([0, 1, 7, 21])).toEqual([1, 7, 21])
    expect(resolveWeekOptions([])).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
  })
})

describe('教学楼筛选值语义（师生同域要求）', () => {
  const building = { code: '24', name: '3号' }

  it('教师链路提交 jxldm id；学生链路提交 jxlmc 名称', () => {
    expect(resolveBuildingQueryValue(building, true)).toBe('24')
    expect(resolveBuildingQueryValue(building, false)).toBe('3号')
  })

  it('缺字段时退回另一个非空值，不产生空筛选值', () => {
    expect(resolveBuildingQueryValue({ code: '', name: '3号' }, true)).toBe('3号')
    expect(resolveBuildingQueryValue({ code: '24', name: '' }, false)).toBe('24')
    expect(resolveBuildingQueryValue({}, true)).toBe('')
  })
})

describe('请求载荷（#1062：绝不把本机周次当默认值）', () => {
  it('未选择周次/星期/节次/楼栋时不发送对应字段', () => {
    const payload = buildClassroomQueryPayload({ filters: {}, studentId: 'S1' })
    expect(payload).toEqual({ student_id: 'S1' })
    expect('week' in payload).toBe(false)
    expect('weekday' in payload).toBe(false)
    expect('periods' in payload).toBe(false)
    expect('building' in payload).toBe(false)
  })

  it('显式筛选时按数字类型发送，节次保留顺序', () => {
    const payload = buildClassroomQueryPayload({
      filters: { week: '7', weekday: '1', periods: [9, 10, 11], building: '24' },
      studentId: 'S1'
    })
    expect(payload).toEqual({
      student_id: 'S1',
      week: 7,
      weekday: 1,
      periods: [9, 10, 11],
      building: '24'
    })
  })

  it('非法筛选值被丢弃（避免服务端静默忽略后返回全量资源目录）', () => {
    const payload = buildClassroomQueryPayload({
      filters: { week: 'abc', weekday: '9', periods: ['x', 0, 12], building: '   ' },
      studentId: 'S1'
    })
    expect(payload.week).toBeUndefined()
    expect(payload.weekday).toBeUndefined()
    // 0 / 12 越界，'x' 非数字 → 全部丢弃；保留 0 会让服务端改变语义
    expect(payload.periods).toBeUndefined()
    expect(payload.building).toBeUndefined()
  })

  it('座位数区间为 0 时仍然发送（0 是合法值）', () => {
    const payload = buildClassroomQueryPayload({
      filters: { minSeats: '0', maxSeats: '120' },
      studentId: 'S1'
    })
    expect(payload.min_seats).toBe(0)
    expect(payload.max_seats).toBe(120)
  })
})

describe('缓存 key（账号 + 角色 + 筛选隔离）', () => {
  it('角色不同则 key 不同（教师/学生数据源不同，不得互相命中）', () => {
    const payload = buildClassroomQueryPayload({
      filters: { week: '7', weekday: '1', periods: [9, 10, 11], building: '24' },
      studentId: 'A1'
    })
    const teacherKey = buildClassroomCacheKey('A1', payload, 'teacher')
    const studentKey = buildClassroomCacheKey('A1', payload, 'student')
    expect(teacherKey).not.toBe(studentKey)
    // 段序固定为 `classroom:{sid}:{role}:…`：登出清理走 `${prefix}${sid}` + startsWith，
    // sid 必须紧跟前缀，否则该账号的缓存清不掉
    expect(teacherKey).toContain('classroom:A1:teacher')
  })

  it('未指定筛选时用 auto 占位，且账号隔离', () => {
    const key = buildClassroomCacheKey('A1', {}, 'student')
    expect(key).toBe('classroom:A1:student:wauto:dauto:pauto:ball:s-')
    expect(buildClassroomCacheKey('A2', {}, 'student')).not.toBe(key)
  })

  it('角色可从后端 filter_mode 推导（快照隔离用）', () => {
    expect(classroomRoleFromMeta({ filter_mode: 'teacher_period_query' })).toBe('teacher')
    expect(classroomRoleFromMeta({ filter_mode: 'teacher_all' })).toBe('teacher')
    expect(classroomRoleFromMeta({ filter_mode: 'student_mobile' })).toBe('student')
    expect(classroomRoleFromMeta({})).toBe('')
  })
})

/**
 * 学生链路回归护栏（#1060 集成审查 P0）。
 *
 * 学生分支曾不输出 `availability` / `filter_mode`，前端保守判 unknown，
 * 于是**学生每次查询成功都会看到「状态未知 / 请勿据此判定空闲」**，
 * 徽标也从「空闲」变「状态未知」——这是学生端用户可见回归。
 * 这里以学生真实 meta 形状锁定契约：学生结果必须被认定为「已验证空闲」。
 */
describe('学生链路 meta 契约（不得被误判为状态未知）', () => {
  it('学生 meta 必须被判为 period_free，而不是保守 unknown', () => {
    const meta = normalizeClassroomMeta(META_STUDENT_PERIOD_FREE)
    expect(classroomAvailabilityOf(meta)).toBe(CLASSROOM_AVAILABILITY.PERIOD_FREE)
    expect(isVerifiedFree(meta)).toBe(true)
    expect(isAvailabilityUnknown(meta)).toBe(false)
    expect(isResourceCatalog(meta)).toBe(false)
  })

  it('学生结果沿用既有「空闲」语义：徽标与条数文案不得降级为未知/目录', () => {
    const meta = normalizeClassroomMeta(META_STUDENT_PERIOD_FREE)
    expect(classroomBadgeKey(meta)).toBe('classroom.badge.free')
    expect(classroomCountKey(meta)).toBe('classroom.result.freeCount')
    // 顶部提示绝不能是「请勿据此判定空闲」
    expect(classroomNoticeKey(meta)).not.toBe('classroom.availability.unknown')
    expect(shouldShowAvailabilityNotice(meta, true)).toBe(false)
  })

  it('学生 0 条 → verified-empty（可说「没有找到空教室」），而非 unverified-empty', () => {
    const meta = normalizeClassroomMeta({ ...META_STUDENT_PERIOD_FREE, total: 0 })
    expect(
      classroomEmptyMode({ meta, roomCount: 0, loading: false, hasError: false })
    ).toBe('verified-empty')
  })

  it('学生 meta 必须能推导出 student 角色（缓存键隔离维度）', () => {
    expect(classroomRoleFromMeta(META_STUDENT_PERIOD_FREE)).toBe('student')
    const payload = buildClassroomQueryPayload({ studentId: 'A1', filters: { week: 7, weekday: 1 } })
    expect(buildClassroomCacheKey('A1', payload, 'student')).toContain('classroom:A1:student')
  })

  it('（反例）缺失 availability 的旧后端响应仍必须保守判 unknown，不得假设空闲', () => {
    const legacy = normalizeClassroomMeta({
      semester: '2026-2027-1',
      total: 12,
      date_str: '2026年10月12日'
    })
    expect(classroomAvailabilityOf(legacy)).toBe(CLASSROOM_AVAILABILITY.UNKNOWN)
    expect(isVerifiedFree(legacy)).toBe(false)
  })
})
