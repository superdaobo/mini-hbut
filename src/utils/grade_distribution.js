/**
 * 给分记录 API 封装
 * 复用 OCR 服务同域的 /api/grade-distribution/* 端点
 * + 本地成绩-教师富化逻辑
 */

// 从 OCR 端点推导服务基址
function getServiceBaseUrl() {
  try {
    const endpoint = localStorage.getItem('hbu_ocr_endpoint') || ''
    if (endpoint) {
      const url = new URL(endpoint)
      return `${url.protocol}//${url.host}`
    }
  } catch { /* ignore */ }
  return 'https://mini-hbut-testocr1.hf.space'
}

const GRADE_API_PREFIX = '/api/grade-distribution'

/**
 * 获取所有学期列表
 * @returns {Promise<string[]>}
 */
export async function fetchGradeDistributionSemesters() {
  const base = getServiceBaseUrl()
  const resp = await fetch(`${base}${GRADE_API_PREFIX}/semesters`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  if (!data.success) throw new Error(data.error || '查询失败')
  return data.semesters || []
}

/**
 * 查询给分记录
 * @param {{ semester?: string, course_name?: string, page?: number, page_size?: number }} params
 * @returns {Promise<{ total: number, page: number, page_size: number, items: Array }>}
 */
export async function fetchGradeDistribution(params = {}) {
  const base = getServiceBaseUrl()
  const resp = await fetch(`${base}${GRADE_API_PREFIX}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      semester: params.semester || null,
      course_name: params.course_name || null,
      teacher_name: params.teacher_name || null,
      page: params.page || 1,
      page_size: params.page_size || 50,
    }),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  if (!data.success) throw new Error(data.error || '查询失败')
  return {
    total: data.total || 0,
    page: data.page || 1,
    page_size: data.page_size || 50,
    items: data.items || [],
  }
}

/**
 * 从本地课表缓存查找教师
 * 策略：在同学期课表中找课程名一致且节次最多的教师
 * @param {string} courseName
 * @param {string} semester
 * @param {string} studentId
 * @returns {string|null}
 */
export function findTeacherFromSchedule(courseName, semester, studentId) {
  if (!courseName || !semester || !studentId) return null
  try {
    const raw = localStorage.getItem(`cache:schedule:${studentId}:${semester}`)
    if (!raw) return null
    const cached = JSON.parse(raw)
    const courses = cached?.data?.data || cached?.data || []
    if (!Array.isArray(courses)) return null

    // 按教师统计节次总和
    const teacherSessions = {}
    for (const c of courses) {
      const name = c.name || c.kcmc || ''
      if (name !== courseName) continue
      const teacher = c.teacher || c.tmc || c.xm || ''
      if (!teacher) continue
      const sessions = (c.djs || 1) * ((c.weeks && c.weeks.length) || 1)
      teacherSessions[teacher] = (teacherSessions[teacher] || 0) + sessions
    }

    // 选节次最多的教师
    let best = null, max = 0
    for (const [t, count] of Object.entries(teacherSessions)) {
      if (count > max) { best = t; max = count }
    }
    return best
  } catch { return null }
}

/**
 * 获取富化后的本地成绩数据（教师从课表补充）
 * @param {string} studentId
 * @returns {{ grades: Array, enrichedCount: number }}
 */
export function getEnrichedLocalGrades(studentId) {
  if (!studentId) return { grades: [], enrichedCount: 0 }
  try {
    const raw = localStorage.getItem(`cache:grades:${studentId}`)
    if (!raw) return { grades: [], enrichedCount: 0 }
    const cached = JSON.parse(raw)
    const grades = cached?.data || cached || []
    if (!Array.isArray(grades)) return { grades: [], enrichedCount: 0 }

    let enrichedCount = 0
    const enriched = grades.map(g => {
      const teacher = g.teacher || null
      if (teacher) return g
      const semester = g.term || g.xnxq || ''
      const courseName = g.course_name || g.kcmc || ''
      const found = findTeacherFromSchedule(courseName, semester, studentId)
      if (found) {
        enrichedCount++
        return { ...g, teacher: found, _teacherFromSchedule: true }
      }
      return g
    })
    return { grades: enriched, enrichedCount }
  } catch { return { grades: [], enrichedCount: 0 } }
}
