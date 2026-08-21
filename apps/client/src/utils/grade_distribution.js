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

// 查询/接口请求超时：给分查询整体偏慢（后端无索引秒级），
// 超时后给明确中文提示，而不是让界面无限停留在 loading。
const REQUEST_TIMEOUT_MS = 10000

const isTimeoutError = (e) => e && e.name === 'AbortError'

const isNetworkError = (e) =>
  e instanceof TypeError || /failed to fetch|network error/i.test(String((e && e.message) || e))

/**
 * 带超时的 JSON 请求：超时 / 网络失败都转成可读中文错误，
 * 业务失败（success=false）原样上抛。
 * 导出仅便于单测注入短超时；业务代码统一使用默认 REQUEST_TIMEOUT_MS。
 */
export async function requestJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const resp = await fetch(url, controller ? { ...options, signal: controller.signal } : options)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    if (!data.success) throw new Error(data.error || '查询失败')
    return data
  } catch (e) {
    if (controller?.signal.aborted || isTimeoutError(e)) {
      throw new Error('查询超时，请检查网络后重试')
    }
    if (isNetworkError(e)) {
      throw new Error('无法连接给分查询服务，请检查网络后重试')
    }
    throw e
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/**
 * 获取所有学期列表
 * @returns {Promise<string[]>}
 */
export async function fetchGradeDistributionSemesters() {
  const base = getServiceBaseUrl()
  const data = await requestJson(`${base}${GRADE_API_PREFIX}/semesters`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  })
  return data.semesters || []
}

/**
 * 查询给分记录
 * @param {{ semester?: string, course_name?: string, page?: number, page_size?: number }} params
 * @returns {Promise<{ total: number, page: number, page_size: number, items: Array }>}
 */
export async function fetchGradeDistribution(params = {}) {
  const base = getServiceBaseUrl()
  const data = await requestJson(`${base}${GRADE_API_PREFIX}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      semester: params.semester || null,
      course_name: params.course_name || null,
      teacher_name: params.teacher_name || null,
      page: params.page || 1,
      page_size: params.page_size || 50,
    }),
  })
  return {
    total: data.total || 0,
    page: data.page || 1,
    page_size: data.page_size || 50,
    items: data.items || [],
  }
}
