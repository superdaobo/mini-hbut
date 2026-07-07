import { CAMPUS_GUIDE_CONFIG } from '../config'
import type { WisdomApiResponse } from '../types'
import { CAMPUS_GUIDE_ENDPOINTS } from './endpoints'

export interface WisdomRequestOptions {
  signal?: AbortSignal
}

const isSuccessCode = (code: unknown) => code === 0 || code === '0'

export class WisdomApiError extends Error {
  code: string | number | undefined
  constructor(message: string, code?: string | number) {
    super(message)
    this.name = 'WisdomApiError'
    this.code = code
  }
}

const joinUrl = (path: string) => {
  const base = CAMPUS_GUIDE_CONFIG.apiBase.replace(/\/$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}`
}

export const wisdomPost = async <T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
  options: WisdomRequestOptions = {}
): Promise<T> => {
  const response = await fetch(joinUrl(path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/plain, */*'
    },
    body: JSON.stringify(body),
    signal: options.signal
  })

  const text = await response.text()
  let payload: WisdomApiResponse<T> | null = null
  try {
    payload = text ? (JSON.parse(text) as WisdomApiResponse<T>) : null
  } catch {
    throw new WisdomApiError(`校园导览接口返回非 JSON（HTTP ${response.status}）`)
  }

  if (!response.ok) {
    throw new WisdomApiError(
      payload?.msg || payload?.message || `校园导览接口 HTTP ${response.status}`,
      payload?.code
    )
  }

  if (!payload || !isSuccessCode(payload.code)) {
    throw new WisdomApiError(
      payload?.msg || payload?.message || '校园导览接口返回失败',
      payload?.code
    )
  }

  return (payload.data ?? null) as T
}

export const campusGuideApi = {
  getScenicInfo: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.scenicInfo, params),
  searchSpots: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotSearch, params),
  getSpotInfo: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotInfo, params),
  getSpotList: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotList, params),
  getWalkRoute: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotWalk, params),
  getHotSearch: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.hotSearch, params),
  reportSearch: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.reportSearch, params),
  getActivities: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.scenicActivity, params),
  saveSpot: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.saveSpot, params),
  getSaveSpotList: (params: Record<string, unknown> = {}) =>
    wisdomPost(CAMPUS_GUIDE_ENDPOINTS.saveSpotList, params),
  getOpenId: (params: Record<string, unknown> = {}) =>
    wisdomPost<{ open_id?: string }>(CAMPUS_GUIDE_ENDPOINTS.openId, params)
}