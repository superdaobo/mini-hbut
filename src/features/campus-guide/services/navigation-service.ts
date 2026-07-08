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

export const fetchCampusWalkRoute = async (start: GeoPoint, end: GeoPoint) => {
  const raw = await campusGuideApi.getWalkRoute({
    startLng: Number(start.longitude),
    startLat: Number(start.latitude),
    endLng: Number(end.longitude),
    endLat: Number(end.latitude)
  })
  const data = (Array.isArray(raw) ? raw[0] : raw) as WalkRouteResult
  const polyline = data?.polyline
  let points: GeoPoint[] = []
  if (Array.isArray(polyline)) {
    try {
      points = polylineToPoints(polyline)
    } catch {
      points = []
    }
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
