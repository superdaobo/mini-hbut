import { CAMPUS_MAP_DIRECTION_PROXY } from '../constants'
import type { MapLatLng, WalkingRouteResult } from '../types'

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

const formatCoord = (point: MapLatLng) => `${point.lat},${point.lng}`

export const fetchWalkingRoute = async (
  from: MapLatLng,
  to: MapLatLng,
  { signal }: { signal?: AbortSignal } = {}
): Promise<WalkingRouteResult> => {
  const params = new URLSearchParams({
    from: formatCoord(from),
    to: formatCoord(to),
    output: 'json'
  })
  const response = await fetch(`${CAMPUS_MAP_DIRECTION_PROXY}?${params.toString()}`, {
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
  return {
    distanceMeters: Number(route.distance) || 0,
    durationSeconds: Number(route.duration) || 0,
    polyline: decodeTencentPolyline(route.polyline)
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
