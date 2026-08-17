// 学习通课程中心纯函数工具（无副作用，便于单元测试）
// 描述：文本/数字规范化、封面缩略图、任务类型推断、成绩饼图计算等。
import type { ChaoxingCourse, ChaoxingKnowledge, ChaoxingSection, ChaoxingTask, ChaoxingTypeMeta, ScoreSlice } from '../types'

/** 任意值转文本，空值转空串 */
export const safeText = (value: unknown): string => String(value ?? '').trim()

/** 任意值转数字，非法回退默认值 */
export const safeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** http 链接强制升级为 https（超星资源不支持明文 http） */
export const preferHttps = (url: unknown): string => {
  const u = safeText(url)
  if (u.startsWith('http://')) return `https://${u.slice(7)}`
  return u
}

/**
 * 课程封面统一转缩略图：origin 原图 → 150x150c 缩略图
 * 列表场景数百张卡片同时渲染时，原图（可能数 MB）会拖垮 WebView 内存
 * （协议规则：https://p.ananas.chaoxing.com/star3/150_150c/{objectId}）
 */
export const normalizeCourseCover = (url: unknown): string => {
  const u = safeText(url)
  if (!u) return ''
  return u.replace('/star3/origin/', '/star3/150_150c/')
}

/** 任务类型元信息（typeRaw → 展示文案/徽章类型/分流 kind） */
export const typeMetaOf = (typeRaw: unknown): ChaoxingTypeMeta => {
  const t = safeText(typeRaw).toLowerCase()
  if (t.includes('video') || t === '视频') return { text: '视频', type: 'info', kind: 'video' }
  if (
    t.includes('doc') ||
    t.includes('pdf') ||
    t.includes('ppt') ||
    t.includes('book') ||
    t === 'document' ||
    t === '文档'
  )
    return { text: '文档', type: 'warning', kind: 'document' }
  if (t.includes('work') || t === '作业') return { text: '作业', type: 'danger', kind: 'work' }
  if (t === 'knowledge' || t === '章节') return { text: '小节', type: 'primary', kind: 'knowledge' }
  if (t === 'unknown' || t === '未知') return { text: '未知类型', type: 'muted', kind: 'unknown' }
  return { text: safeText(typeRaw) || '任务', type: 'muted', kind: 'task' }
}

/** 播放时长格式化：秒 → m:ss */
export const formatDuration = (sec: unknown): string => {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** 媒体错误码转可读文案 */
export const mediaErrorMessage = (event: unknown): string => {
  try {
    const el = (event as { target?: { error?: { code?: number; message?: string } } })?.target
    const code = el?.error?.code
    // MEDIA_ERR_*: 1=aborted 2=network 3=decode 4=src not supported
    const map: Record<number, string> = {
      1: '加载中止',
      2: '网络错误（可能被 CDN 拒绝或会话失效）',
      3: '解码失败',
      4: '格式不支持或地址无效'
    }
    if (code && map[code]) return map[code]
    if (el?.error?.message) return String(el.error.message)
  } catch {
    // ignore
  }
  return ''
}

/** 成绩饼图颜色板（按切片顺序取色） */
export const PIE_COLORS = ['#2563eb', '#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899']

/** 权重标签映射（score.weight 对象键 → 中文名） */
export const WEIGHT_LABELS: Record<string, string> = {
  work: '作业',
  test: '考试',
  video: '视频',
  attend: '签到',
  bbs: '讨论',
  live: '直播',
  read: '阅读',
  task: '任务点'
}

/** 成绩饼图切片（权重）：
 * 优先 weight_list 数组，其次 score.weight 对象；输出含 pct/color/start/end（conic-gradient 用） */
export const scoreSlicesOf = (score: Record<string, unknown> | undefined): ScoreSlice[] => {
  if (!score) return []
  const list = Array.isArray(score.weight_list) ? (score.weight_list as Array<Record<string, unknown>>) : []
  const raw: Array<{ name: string; value: number }> = []
  if (list.length) {
    for (const w of list) {
      const value = safeNumber(w.value ?? w.score ?? w.weight ?? 0)
      const name = safeText(w.name || w.key || '项目')
      if (value > 0) raw.push({ name, value })
    }
  } else if (score.weight && typeof score.weight === 'object') {
    for (const [k, v] of Object.entries(score.weight as Record<string, unknown>)) {
      const value = safeNumber(v)
      if (value > 0) raw.push({ name: WEIGHT_LABELS[k] || k, value })
    }
  }
  const total = raw.reduce((s, x) => s + x.value, 0) || 1
  let acc = 0
  return raw.map((item, i) => {
    const pct = (item.value / total) * 100
    const start = acc
    acc += pct
    return {
      ...item,
      pct,
      color: PIE_COLORS[i % PIE_COLORS.length],
      start,
      end: acc
    }
  })
}

/** conic-gradient 背景串（空数据回退灰色整圆） */
export const pieGradientOf = (slices: ScoreSlice[]): string => {
  if (!slices.length) return 'conic-gradient(#e2e8f0 0 100%)'
  const parts = slices.map((s) => `${s.color} ${s.start}% ${s.end}%`)
  return `conic-gradient(${parts.join(', ')})`
}

/** 课程原始数据 → 领域模型（字段兼容后端多种命名） */
export const normalizeCourse = (item: Record<string, unknown> = {}): ChaoxingCourse => {
  const raw = item && typeof item === 'object' ? item : {}
  const courseId = safeText(raw.course_id || raw.courseId || '')
  const clazzId = safeText(raw.clazz_id || raw.clazzId || '')
  const cpi = safeText(raw.cpi || '')
  return {
    id: safeText(raw.id || `${courseId}:${clazzId}`),
    courseId,
    clazzId,
    cpi,
    title: safeText(raw.title || raw.name || raw.course_name || '未命名课程'),
    teacher: safeText(raw.teacher || raw.teacher_name || raw.teacherfactor || ''),
    imageUrl: normalizeCourseCover(raw.image_url || raw.imageUrl || raw.cover || ''),
    progressText: safeText(raw.progress_text || raw.progressText || ''),
    progressRate: safeNumber(
      raw.progress_rate ?? raw.progressRate ?? raw.progress_percent ?? raw.percent
    ),
    pendingCount: safeNumber(raw.pending_count ?? raw.pendingCount ?? 0),
    courseUrl: safeText(raw.course_url || raw.courseUrl || raw.url || ''),
    // 缺省用「未分学期」，避免全量标成「本学期」掩盖多学期问题
    semester: safeText(raw.semester || raw.term || '未分学期') || '未分学期'
  }
}

/** 小节（知识点）原始数据 → 领域模型 */
export const normalizeKnowledge = (raw: Record<string, unknown> = {}): ChaoxingKnowledge => ({
  id: safeText(raw.id || raw.knowledge_id || raw.knowledgeId),
  knowledgeId: safeText(raw.knowledge_id || raw.knowledgeId || raw.id),
  title: safeText(raw.title || raw.name || '未命名小节'),
  completed: !!(raw.completed || raw.isPassed),
  courseId: safeText(raw.course_id || raw.courseId),
  clazzId: safeText(raw.clazz_id || raw.clazzId),
  cpi: safeText(raw.cpi || ''),
  layer: safeNumber(raw.layer ?? raw.level ?? 0)
})

/** 章原始数据 → 领域模型（兼容 tasks/children 两种结构） */
export const normalizeSection = (raw: Record<string, unknown> = {}): ChaoxingSection => {
  const tasks = Array.isArray(raw.tasks)
    ? (raw.tasks as Array<Record<string, unknown>>)
    : Array.isArray(raw.children)
      ? (raw.children as Array<Record<string, unknown>>)
      : []
  return {
    id: safeText(raw.id || raw.section_id || 'sec'),
    title: safeText(raw.title || raw.name || '章节'),
    knowledges: tasks.map(normalizeKnowledge).filter((k) => k.id || k.title)
  }
}

/** 任务点原始数据 → 领域模型（类型以后端 type/task_type 为准，禁止仅凭 objectId 强制 video） */
export const normalizeTaskItem = (raw: Record<string, unknown> = {}): ChaoxingTask => {
  // 类型以后端 type/task_type 为准，禁止仅凭 objectId 强制 video
  const typeRaw = raw.type || raw.task_type || raw.module || ''
  const title = safeText(raw.title || raw.name || '未命名任务')
  let meta = typeMetaOf(typeRaw)
  // 后端 unknown/task 时，用文件名扩展名再推断一次（仅前端展示）
  if (meta.kind === 'task' || meta.kind === 'unknown') {
    const lower = title.toLowerCase()
    if (/\.(pdf|ppt|pptx|doc|docx|xls|xlsx|txt)$/i.test(lower) || /课件|讲义|幻灯/.test(title)) {
      meta = { text: '文档', type: 'warning', kind: 'document' }
    } else if (/\.(mp4|flv|m3u8|mov|avi|mkv|webm)$/i.test(lower)) {
      meta = { text: '视频', type: 'info', kind: 'video' }
    }
  }
  const objectId = safeText(
    raw.objectId || raw.object_id || (raw.property as Record<string, unknown>)?.objectid || (raw.property as Record<string, unknown>)?.objectId
  )
  const kind = meta.kind
  return {
    id: safeText(raw.id || raw.jobid || raw.objectId || raw.object_id || Math.random()),
    title,
    objectId,
    jobid: safeText(raw.jobid || raw.jobId),
    completed: !!(raw.completed || raw.isPassed),
    status: safeText(raw.status || (raw.completed || raw.isPassed ? '已完成' : '未完成')),
    typeMeta: meta,
    kind,
    empty_hint: !!(raw.empty_hint || raw.emptyHint)
  }
}

/** 收集视频直链候选（去重、强制 https、过滤非 http） */
export const collectPlayUrls = (
  st: Record<string, unknown> = {},
  top: Record<string, unknown> = {}
): string[] => {
  const list: string[] = []
  const push = (u: unknown) => {
    const https = preferHttps(u)
    if (!https || !https.startsWith('http')) return
    if (!list.includes(https)) list.push(https)
  }
  if (Array.isArray(top.play_urls)) (top.play_urls as unknown[]).forEach(push)
  if (Array.isArray(st.play_urls)) (st.play_urls as unknown[]).forEach(push)
  ;['https', 'hd', 'http', 'play_url', 'download', 'mp3', 'url', 'sd'].forEach((k) => {
    push(st[k])
    push(top[k])
  })
  return list
}

/** 收集文档预览候选（去重、强制 https、过滤非 http） */
export const collectDocUrls = (
  st: Record<string, unknown> = {},
  top: Record<string, unknown> = {}
): string[] => {
  const list: string[] = []
  const push = (u: unknown) => {
    const https = preferHttps(u)
    if (!https || !https.startsWith('http')) return
    if (!list.includes(https)) list.push(https)
  }
  if (Array.isArray(top.play_urls)) (top.play_urls as unknown[]).forEach(push)
  if (Array.isArray(st.play_urls)) (st.play_urls as unknown[]).forEach(push)
  ;['https', 'http', 'download', 'pdf', 'url', 'preview', 'previewUrl', 'hd', 'sd'].forEach((k) => {
    push(st[k])
    push(top[k])
  })
  return list
}

/**
 * 视频直链 → 本地代理地址：
 * cldisk CDN 有 Referer 防盗链（无 chaoxing Referer 返回 403），且 WebView 与
 * Rust cookie jar 不共享；Tauri 下必须经 http_server 的 /proxy/video 流式代理播放。
 * 非 Tauri（dev 浏览器）退回原直链尽力播放。
 */
export const toVideoProxyUrl = (u: string, isTauri: boolean): string => {
  if (!u || !u.startsWith('http')) return u
  if (!isTauri) return u
  return `http://127.0.0.1:4399/proxy/video?url=${encodeURIComponent(u)}`
}
