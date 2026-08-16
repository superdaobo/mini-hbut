/**
 * 给分记录 API 封装
 * 统一以 OCR 服务公开接口为准，不在前端做本地教师富化，
 * 这样返回字段能与 SQLPub / ocr-service 保持一致。
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
  return 'https://mini-hbut-ocr-service.hf.space'
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
