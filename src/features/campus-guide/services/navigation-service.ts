import { openExternal } from '../../../utils/external_link'
import { campusGuideApi } from '../api/wisdom_client'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import { polylineToPoints } from '../map/polyline-decoder'
import type { CampusSpot, GeoPoint, WalkRouteResult } from '../types'

export type WalkNavigationResult = {
  points: GeoPoint[]
  distance?: string | number
  duration?: string | number
  raw?: WalkRouteResult
}

const toCoord = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : NaN
}

/** 校验经纬度是否在合法范围内 */
export const isValidGeoPoint = (point: GeoPoint | null | undefined): point is GeoPoint => {
  if (!point) return false
  const lat = toCoord(point.latitude)
  const lng = toCoord(point.longitude)
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/** 统一解析步行导航终点：显式 endPoint → spot.point → spot.latitude/longitude */
export const resolveNavEndPoint = (
  spot?: CampusSpot | null,
  explicitEndPoint?: GeoPoint | null
): GeoPoint | null => {
  if (isValidGeoPoint(explicitEndPoint)) return explicitEndPoint
  if (isValidGeoPoint(spot?.point)) return spot!.point!
  const lat = toCoord(spot?.latitude)
  const lng = toCoord(spot?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const point = { latitude: lat, longitude: lng }
  return isValidGeoPoint(point) ? point : null
}

/**
 * 从步行路线 API 响应中提取 polyline 数组。
 * 兼容：直接数组、{ polyline }、{ routes[0].polyline }、嵌套 list 等。
 * 禁止对 undefined 做下标访问（历史崩溃 reading '4'）。
 */
export const extractWalkPolyline = (raw: unknown): Array<number | string> | null => {
  if (raw == null) return null

  const asPolylineArray = (value: unknown): Array<number | string> | null => {
    if (!Array.isArray(value) || value.length < 2) return null
    // 已是扁平 [lat,lng,delta...] 或微度
    if (typeof value[0] === 'number' || typeof value[0] === 'string') {
      return value as Array<number | string>
    }
    // [[lat,lng], ...] 展平
    if (Array.isArray(value[0])) {
      const flat: Array<number | string> = []
      for (const pair of value) {
        if (!Array.isArray(pair) || pair.length < 2) continue
        flat.push(pair[0] as number | string, pair[1] as number | string)
      }
      return flat.length >= 2 ? flat : null
    }
    return null
  }

  const fromObject = (obj: Record<string, unknown>): Array<number | string> | null => {
    const direct = asPolylineArray(obj.polyline)
    if (direct) return direct

    // routes / route / paths 等常见嵌套
    const routes = obj.routes ?? obj.route ?? obj.list ?? obj.paths
    if (Array.isArray(routes) && routes.length > 0) {
      const first = routes[0]
      if (first && typeof first === 'object') {
        const nested = fromObject(first as Record<string, unknown>)
        if (nested) return nested
      }
      const flat = asPolylineArray(routes)
      if (flat) return flat
    }

    // 字符串 polyline："lat,lng;lat,lng" 或 "lat,lng,lat,lng"
    if (typeof obj.polyline === 'string' && obj.polyline.trim()) {
      const parts = obj.polyline
        .split(/[;,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (parts.length >= 2) return parts
    }
    return null
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null
    // [ { polyline: [...] }, ... ]
    if (raw[0] && typeof raw[0] === 'object' && !Array.isArray(raw[0])) {
      return fromObject(raw[0] as Record<string, unknown>)
    }
    return asPolylineArray(raw)
  }

  if (typeof raw === 'object') {
    return fromObject(raw as Record<string, unknown>)
  }

  return null
}

export const fetchCampusWalkRoute = async (start: GeoPoint, end: GeoPoint) => {
  if (!isValidGeoPoint(start) || !isValidGeoPoint(end)) {
    return {
      points: [],
      distance: undefined,
      duration: undefined,
      raw: undefined
    } satisfies WalkNavigationResult
  }

  const raw = await campusGuideApi.getWalkRoute({
    startLng: Number(start.longitude),
    startLat: Number(start.latitude),
    endLng: Number(end.longitude),
    endLat: Number(end.latitude)
  })

  // 兼容 data 为数组 / 单对象 / 再包一层
  const dataCandidate = Array.isArray(raw) ? raw[0] : raw
  const data = (dataCandidate && typeof dataCandidate === 'object'
    ? dataCandidate
    : {}) as WalkRouteResult & Record<string, unknown>

  let points: GeoPoint[] = []
  try {
    const polyline = extractWalkPolyline(data) ?? extractWalkPolyline(raw)
    if (polyline) {
      points = polylineToPoints(polyline).filter(isValidGeoPoint)
    }
  } catch {
    points = []
  }

  return {
    points,
    distance: data?.distance,
    duration: data?.duration,
    raw: data
  } satisfies WalkNavigationResult
}

export const buildTencentWalkRouteUrl = (
  end: GeoPoint,
  name = '目的地',
  from?: GeoPoint
) => {
  if (!isValidGeoPoint(end)) return null
  const lat = Number(end.latitude)
  const lng = Number(end.longitude)
  const label = encodeURIComponent(name)
  const referer = encodeURIComponent(CAMPUS_GUIDE_CONFIG.qqMapKey)
  const fromPart =
    from && isValidGeoPoint(from)
      ? `&fromcoord=${Number(from.latitude)},${Number(from.longitude)}`
      : ''
  return `https://apis.map.qq.com/uri/v1/routeplan?type=walk&to=${label}&tocoord=${lat},${lng}${fromPart}&referer=${referer}`
}

export const openExternalMapNavigation = async (
  end: GeoPoint,
  name = '目的地',
  from?: GeoPoint
) => {
  if (!isValidGeoPoint(end)) return false
  const lat = Number(end.latitude)
  const lng = Number(end.longitude)
  const label = encodeURIComponent(name)
  const tencentUrl = buildTencentWalkRouteUrl(end, name, from)
  const candidates = [
    tencentUrl,
    `https://uri.amap.com/navigation?to=${lng},${lat},${label}&mode=walk&coordinate=gaode`,
    `https://map.baidu.com/mobile/webapp/search/search/qt=nav&sn=0&en=1&end=${lat},${lng}`
  ].filter(Boolean) as string[]
  for (const url of candidates) {
    if (await openExternal(url)) return true
  }
  return false
}

export const formatWalkDuration = (seconds: number | string | undefined) => {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return ''
  const minutes = total < 60 ? 1 : Math.round(total / 60)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`
}
