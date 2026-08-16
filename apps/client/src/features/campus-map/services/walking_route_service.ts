import { isLikelyAndroidUserAgent, isTauriRuntime } from '../../../platform/native'
import { CAMPUS_MAP_DIRECTION_PROXY } from '../constants'
import type { MapLatLng, WalkingRouteResult } from '../types'

const LOCAL_BRIDGE_ORIGIN = 'http://127.0.0.1:4399'

/** 解码腾讯步行路线 polyline（整数序列，前两项为起点 * 1e6，后续为增量） */
export const decodeTencentPolyline = (coors: number[]): MapLatLng[] => {
  if (!Array.isArray(coors) || coors.length < 2) return []
  const points: MapLatLng[] = []
  let lat = coors[0] / 1e6
  let lng = coors[1] / 1e6
  points.push({ lat, lng })
  for (let i = 2; i < coors.length; i += 2) {
    lat += coors[i] / 1e6
    lng += coors[i + 1] / 1e6
    points.push({ lat, lng })
  }
  return points
}

/**
 * 解析步行路线代理 base。
 * - Web / Vite：相对路径 `/campus-map/direction`（dev server 反代）
 * - Tauri iOS / 桌面：loopback bridge（与 campus-guide / towergo 一致）
 * - Tauri Android：相对路径（Release 通常不启 4399）
 */
export const resolveCampusMapDirectionUrl = (proxyPath = CAMPUS_MAP_DIRECTION_PROXY) => {
  const path = String(proxyPath || CAMPUS_MAP_DIRECTION_PROXY).trim() || CAMPUS_MAP_DIRECTION_PROXY
  if (/^https?:\/\//i.test(path)) return path
  if (!isTauriRuntime()) return path
  if (isLikelyAndroidUserAgent()) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${LOCAL_BRIDGE_ORIGIN}${normalized}`
}

const formatCoord = (point: MapLatLng) => `${point.lat},${point.lng}`

export const fetchWalkingRoute = async (
  from: MapLatLng,
  to: MapLatLng,
  { signal }: { signal?: AbortSignal } = {}
): Promise<WalkingRouteResult> => {
  const fromLat = Number(from?.lat)
  const fromLng = Number(from?.lng)
  const toLat = Number(to?.lat)
  const toLng = Number(to?.lng)
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    throw new Error('路线起终点坐标无效')
  }
  const params = new URLSearchParams({
    from: formatCoord({ lat: fromLat, lng: fromLng }),
    to: formatCoord({ lat: toLat, lng: toLng }),
    output: 'json'
  })
  const endpoint = resolveCampusMapDirectionUrl()
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    signal
  })
  if (!response.ok) {
    throw new Error(`路线服务 HTTP ${response.status}`)
  }
  const payload = (await response.json()) as {
    status?: number
    message?: string
    result?: {
      routes?: Array<{
        distance?: number
        duration?: number
        polyline?: number[]
      }>
    }
  }
  if (payload.status !== 0) {
    throw new Error(payload.message || '路线规划失败')
  }
  const route = payload.result?.routes?.[0]
  if (!route?.polyline?.length) {
    throw new Error('路线结果为空')
  }
  const polyline = decodeTencentPolyline(route.polyline)
  if (polyline.length < 2) {
    throw new Error('路线折线无效')
  }
  return {
    distanceMeters: Number(route.distance) || 0,
    durationSeconds: Number(route.duration) || 0,
    polyline
  }
}

export const formatWalkingDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export const formatWalkingDistance = (meters: number) => {
  if (!Number.isFinite(meters)) return '--'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
