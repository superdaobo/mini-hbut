// Teacher Portal V2（#1019）：教师数据归一化契约测试。
//
// 覆盖：HTML 清洗（防 XSS）、注入字段过滤、稳定去重键（禁 Date.now）、
// 学期/日期标准化、jqGrid 包裹解析。fixture 全部脱敏（无真实工号/姓名/名单）。

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildStableKey,
  dedupeByStableKey,
  extractGridResults,
  invigilationKey,
  isEmptyTeacherCollection,
  normalizeDate,
  normalizeExamData,
  normalizeNoticeList,
  normalizeSemester,
  normalizeTeacherNotice,
  normalizeTeachingData,
  sanitizeTeacherHtml,
  stripInjectedIdentityFields,
  stripTeacherHtml,
  teacherExamKey,
  teacherNoticeKey
} from '../utils/normalizeTeacherData'

afterEach(() => {
  vi.useRealTimers()
})

describe('normalizeTeacherData（HTML 清洗）', () => {
  it('stripTeacherHtml 去掉标签并还原实体（教务通知标题含 HTML）', () => {
    const raw = `<span class='label label-primary'>置顶</span> 关于教学检查的通知 &amp; 安排`
    expect(stripTeacherHtml(raw)).toBe('置顶 关于教学检查的通知 & 安排')
  })

  it('stripTeacherHtml 丢弃 script 内容，不产生可执行片段', () => {
    const raw = `标题<script>alert('x')</script>正文`
    const out = stripTeacherHtml(raw)
    expect(out).not.toContain('<')
    expect(out).not.toContain('script')
  })

  it('sanitizeTeacherHtml 仅保留白名单标签，移除事件属性与 javascript: 链接', () => {
    const raw = `<p onclick="steal()">正文</p><a href="javascript:alert(1)">点我</a><img src=x onerror=alert(1)>`
    const safe = sanitizeTeacherHtml(raw)
    expect(safe).toContain('<p>')
    expect(safe).not.toContain('onclick')
    expect(safe).not.toContain('javascript:')
    expect(safe).not.toContain('<img')
    expect(safe).not.toContain('onerror')
  })

  it('纯文本输入经 sanitizeTeacherHtml 返回空串（调用方走纯文本渲染）', () => {
    expect(sanitizeTeacherHtml('普通文本')).toBe('')
  })
})

describe('normalizeTeacherData（注入字段过滤）', () => {
  it('stripInjectedIdentityFields 移除教务框架注入的会话字段', () => {
    const record = {
      kcmc: '示例课程',
      jxbid: 'jxbid-0001',
      currentUserId: 'uuid',
      userRoleId: 'role',
      dataAuth: 'true',
      dataXnxq: '2026-2027-1',
      currentRoleId: 'js',
      currentJsId: 'js-id',
      currentUserName: 'T0001',
      currentDepartmentId: '205',
      new: false
    }
    const stripped = stripInjectedIdentityFields(record)
    expect(stripped).toEqual({ kcmc: '示例课程', jxbid: 'jxbid-0001' })
    expect(stripped.currentUserName).toBeUndefined()
    expect(stripped.new).toBeUndefined()
  })

  it('normalizeNoticeList 后通知对象不含注入字段', () => {
    const rows = [
      {
        id: 'n1',
        title: "<span class='label'>置顶</span>通知",
        releaseDate: '2026/08/30',
        currentUserName: 'T0001',
        new: false
      }
    ]
    const [notice] = normalizeNoticeList(rows)
    expect(notice.title).toBe('置顶通知')
    expect(notice.releaseDate).toBe('2026-08-30')
    expect(Object.keys(notice)).not.toContain('currentUserName')
  })
})

describe('normalizeTeacherData（稳定去重键，禁 Date.now）', () => {
  it('buildStableKey 在不同时刻产生相同键', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-30T10:00:00Z'))
    const first = buildStableKey(['jxbid-0001', '2026-2027-1', '示例课程'])
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    const second = buildStableKey(['jxbid-0001', '2026-2027-1', '示例课程'])
    expect(first).toBe(second)
  })

  it('去重键实现源码不得出现 Date.now / Math.random（机械扫描）', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/features/teacher/utils/normalizeTeacherData.ts'),
      'utf8'
    )
    // 先剥离注释，避免把「严禁 Date.now()」这类说明文字误判为真实调用。
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const idx = line.indexOf('//')
        return idx >= 0 ? line.slice(0, idx) : line
      })
      .join('\n')
    expect(code).not.toMatch(/Date\s*\.\s*now\s*\(/)
    expect(code).not.toMatch(/Math\s*\.\s*random\s*\(/)
  })

  it('dedupeByStableKey 保留首次出现顺序并稳定去重', () => {
    const rows = [
      { id: 'a', name: '甲' },
      { id: 'b', name: '乙' },
      { id: 'a', name: '甲重复' }
    ]
    const deduped = dedupeByStableKey(rows, (row) => row.id)
    expect(deduped.map((row) => row.id)).toEqual(['a', 'b'])
    expect(deduped[0].name).toBe('甲')
  })

  it('监考 / 考试 / 通知领域键稳定且区分业务实体', () => {
    const invigA = invigilationKey({ id: 'i1', kcmc: '课程甲', ksrq: '2026-08-30', kscc: '1' })
    const invigA2 = invigilationKey({ id: 'i1', kcmc: '课程甲', ksrq: '2026-08-30', kscc: '1' })
    const invigB = invigilationKey({ id: 'i2', kcmc: '课程甲', ksrq: '2026-08-30', kscc: '1' })
    expect(invigA).toBe(invigA2)
    expect(invigA).not.toBe(invigB)

    expect(teacherExamKey({ id: 'e1', kcmc: '课程乙' })).not.toBe(
      teacherExamKey({ id: 'e2', kcmc: '课程乙' })
    )
    expect(teacherNoticeKey({ id: 'n1', title: '通知' })).not.toBe(
      teacherNoticeKey({ id: 'n2', title: '通知' })
    )
  })
})

describe('normalizeTeacherData（字段标准化 / 包裹解析）', () => {
  it('normalizeSemester 统一学期格式', () => {
    expect(normalizeSemester('2026-2027-01')).toBe('2026-2027-1')
    expect(normalizeSemester(' 2026 - 2027 - 1 ')).toBe('2026-2027-1')
    expect(normalizeSemester('')).toBe('')
  })

  it('normalizeDate 统一日期格式，非法值返回空串', () => {
    expect(normalizeDate('2026/08/30')).toBe('2026-08-30')
    expect(normalizeDate('2026.8.3 14:30')).toBe('2026-08-03')
    expect(normalizeDate('无日期')).toBe('')
  })

  it('extractGridResults 兼容 jqGrid 包裹与裸数组', () => {
    expect(extractGridResults({ msg: '', ret: 0, results: [{ id: '1' }] })).toEqual([{ id: '1' }])
    expect(extractGridResults([{ id: '2' }])).toEqual([{ id: '2' }])
    expect(extractGridResults({ results: null })).toEqual([])
    expect(extractGridResults(null)).toEqual([])
  })

  it('isEmptyTeacherCollection 判定空集合', () => {
    expect(isEmptyTeacherCollection([])).toBe(true)
    expect(isEmptyTeacherCollection(null)).toBe(true)
    expect(isEmptyTeacherCollection({})).toBe(true)
    expect(isEmptyTeacherCollection([1])).toBe(false)
  })

  it('normalizeTeachingData 按 jxbid 保留任务与教学班（禁止按索引拼接）', () => {
    const raw = {
      tasks: [{ id: 't1', jxbid: 'jx-1', kcmc: '课程甲', xnxq: '2026-2027-1', name: '班甲', bjrs: 49 }],
      classes: [
        {
          id: 'c1',
          jxbid: 'jx-1',
          kcmc: '课程甲',
          kcbh: 'K001',
          xnxq: '2026-2027-1',
          name: '班甲',
          bjrs: 49
        }
      ]
    }
    const data = normalizeTeachingData(raw)
    expect(data.tasks).toHaveLength(1)
    expect(data.classes).toHaveLength(1)
    expect(data.tasks[0].jxbid).toBe(data.classes[0].jxbid)
    expect(data.tasks[0].bjrs).toBe(49)
    expect(data.classes[0].kcbh).toBe('K001')
  })

  it('normalizeExamData 拆分监考与任课班级考试', () => {
    const raw = {
      invigilations: [{ id: 'i1', kcmc: '课程甲', zjk: '主监考', xqmc: '本部' }],
      exams: [{ id: 'e1', kcmc: '课程乙', jsmc: '2-302', kssj: '2026-08-30 14:30~18:00' }]
    }
    const data = normalizeExamData(raw)
    expect(data.invigilations[0].zjk).toBe('主监考')
    expect(data.exams[0].kssj).toBe('2026-08-30 14:30~18:00')
  })

  it('normalizeTeacherNotice 清洗标题 HTML 且保留类型字段', () => {
    const notice = normalizeTeacherNotice({
      id: 'n1',
      title: '<span>置顶</span>关于期末考试的通知',
      noticeTypeName: '教务通知',
      content: '<p>正文</p>'
    })
    expect(notice.title).toBe('置顶关于期末考试的通知')
    expect(notice.noticeTypeName).toBe('教务通知')
    expect(notice.content).toBe('正文')
  })
})
