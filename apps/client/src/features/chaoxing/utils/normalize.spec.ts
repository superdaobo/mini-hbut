// 学习通课程中心纯函数单元测试（Issue #583 拆分后行为回归保障）
import { describe, expect, it } from 'vitest'
import {
  collectDocUrls,
  collectPlayUrls,
  formatDuration,
  mediaErrorMessage,
  normalizeCourse,
  normalizeCourseCover,
  normalizeSection,
  normalizeTaskItem,
  pieGradientOf,
  preferHttps,
  safeNumber,
  safeText,
  scoreSlicesOf,
  toVideoProxyUrl,
  typeMetaOf
} from './normalize'

describe('chaoxing normalize 基础工具', () => {
  it('safeText：空值转空串，其余 trim', () => {
    expect(safeText(null)).toBe('')
    expect(safeText(undefined)).toBe('')
    expect(safeText('  abc ')).toBe('abc')
    expect(safeText(0)).toBe('0')
  })

  it('safeNumber：非法输入回退默认值', () => {
    expect(safeNumber('42')).toBe(42)
    expect(safeNumber('x', 7)).toBe(7)
    expect(safeNumber(undefined, -1)).toBe(-1)
  })

  it('preferHttps：http 强制 https，其余原样', () => {
    expect(preferHttps('http://a.com/v.mp4')).toBe('https://a.com/v.mp4')
    expect(preferHttps('https://a.com/v.mp4')).toBe('https://a.com/v.mp4')
    expect(preferHttps('')).toBe('')
  })

  it('normalizeCourseCover：origin 原图转 150x150c 缩略图', () => {
    expect(normalizeCourseCover('https://p.ananas.chaoxing.com/star3/origin/abc')).toBe(
      'https://p.ananas.chaoxing.com/star3/150_150c/abc'
    )
    expect(normalizeCourseCover('')).toBe('')
    expect(normalizeCourseCover('https://p.ananas.chaoxing.com/star3/150_150c/abc')).toBe(
      'https://p.ananas.chaoxing.com/star3/150_150c/abc'
    )
  })

  it('formatDuration：秒 → m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3600)).toBe('60:00')
    expect(formatDuration('abc')).toBe('0:00')
  })

  it('mediaErrorMessage：错误码映射，无码返回空串', () => {
    expect(mediaErrorMessage({ target: { error: { code: 2 } } })).toContain('网络错误')
    expect(mediaErrorMessage({ target: { error: { code: 4 } } })).toContain('格式不支持')
    expect(mediaErrorMessage({ target: {} })).toBe('')
    expect(mediaErrorMessage(null)).toBe('')
  })
})

describe('chaoxing 任务类型推断', () => {
  it('typeMetaOf：按类型原文推断视频/文档/作业/小节/未知', () => {
    expect(typeMetaOf('video')).toMatchObject({ text: '视频', kind: 'video' })
    expect(typeMetaOf('ppt')).toMatchObject({ text: '文档', kind: 'document' })
    expect(typeMetaOf('作业')).toMatchObject({ text: '作业', kind: 'work' })
    expect(typeMetaOf('章节')).toMatchObject({ text: '小节', kind: 'knowledge' })
    expect(typeMetaOf('unknown')).toMatchObject({ text: '未知类型', kind: 'unknown' })
    expect(typeMetaOf('')).toMatchObject({ text: '任务', kind: 'task' })
  })

  it('normalizeTaskItem：类型以后端为准，扩展名二次推断仅兜底', () => {
    const video = normalizeTaskItem({ type: 'video', title: '第一讲', objectId: 'o1' })
    expect(video.kind).toBe('video')
    expect(video.objectId).toBe('o1')
    // 后端 unknown + 标题带 .pdf → 文档
    const doc = normalizeTaskItem({ type: 'unknown', title: '课件.pdf', property: { objectid: 'o2' } })
    expect(doc.kind).toBe('document')
    expect(doc.objectId).toBe('o2')
    // 无类型 + 无扩展名 → task，不因 objectId 强判视频
    const task = normalizeTaskItem({ title: '签到', objectId: 'o3' })
    expect(task.kind).toBe('task')
    expect(task.empty_hint).toBe(false)
  })
})

describe('chaoxing 数据规范化', () => {
  it('normalizeCourse：兼容多种字段命名并归一学期', () => {
    const c = normalizeCourse({
      course_id: 'c1',
      clazzId: 'cl1',
      cpi: 'p1',
      name: '高数',
      teacher_name: '张老师',
      image_url: 'http://p.ananas.chaoxing.com/star3/origin/x',
      progress_rate: 66,
      pending_count: 3,
      url: 'https://mooc1.chaoxing.com/course/c1'
    })
    expect(c.courseId).toBe('c1')
    expect(c.clazzId).toBe('cl1')
    expect(c.title).toBe('高数')
    expect(c.imageUrl).toContain('150_150c')
    expect(c.progressRate).toBe(66)
    expect(c.pendingCount).toBe(3)
    expect(c.semester).toBe('未分学期')
  })

  it('normalizeKnowledge / normalizeSection：兼容 tasks 与 children', () => {
    const section = normalizeSection({
      id: 's1',
      title: '第一章',
      tasks: [{ id: 'k1', name: '1.1', completed: true }, { id: 'k2', name: '1.2' }]
    })
    expect(section.title).toBe('第一章')
    expect(section.knowledges).toHaveLength(2)
    expect(section.knowledges[0].completed).toBe(true)
    const childrenSection = normalizeSection({ title: '第二章', children: [{ knowledge_id: 'k3', name: '2.1' }] })
    expect(childrenSection.knowledges[0].knowledgeId).toBe('k3')
  })
})

describe('chaoxing 视频/文档地址收集', () => {
  it('collectPlayUrls：多来源去重、强制 https、过滤非 http', () => {
    const urls = collectPlayUrls(
      { https: 'http://a.com/1.mp4', url: 'not-http' },
      { play_urls: ['http://a.com/1.mp4', 'https://b.com/2.mp4'] }
    )
    expect(urls).toEqual(['https://a.com/1.mp4', 'https://b.com/2.mp4'])
  })

  it('collectDocUrls：文档候选收集', () => {
    const urls = collectDocUrls({ pdf: 'http://d.com/x.pdf' }, { play_urls: ['https://e.com/y.pdf'] })
    expect(urls).toContain('https://d.com/x.pdf')
    expect(urls).toContain('https://e.com/y.pdf')
  })

  it('toVideoProxyUrl：仅 Tauri 下转本地代理，其余退回原直链', () => {
    expect(toVideoProxyUrl('https://a.com/1.mp4', true)).toBe(
      'http://127.0.0.1:4399/proxy/video?url=https%3A%2F%2Fa.com%2F1.mp4'
    )
    expect(toVideoProxyUrl('https://a.com/1.mp4', false)).toBe('https://a.com/1.mp4')
    expect(toVideoProxyUrl('', true)).toBe('')
  })
})

describe('chaoxing 成绩饼图', () => {
  it('scoreSlicesOf：weight_list 优先，其次 weight 对象，空数据回退空数组', () => {
    const slices = scoreSlicesOf({ weight_list: [{ name: '作业', value: 40 }, { name: '考试', value: 60 }] })
    expect(slices).toHaveLength(2)
    expect(slices[0].pct).toBe(40)
    expect(slices[1].pct).toBe(60)
    expect(slices[0].color).toBeTruthy()
    expect(scoreSlicesOf(undefined)).toEqual([])
    const fromWeight = scoreSlicesOf({ weight: { work: 30, test: 70 } })
    expect(fromWeight.map((s) => s.name)).toEqual(['作业', '考试'])
  })

  it('pieGradientOf：conic-gradient 片段与空回退', () => {
    expect(pieGradientOf([])).toBe('conic-gradient(#e2e8f0 0 100%)')
    const g = pieGradientOf([{ name: 'a', value: 1, pct: 50, color: '#2563eb', start: 0, end: 50 }])
    expect(g).toContain('#2563eb 0% 50%')
  })
})
