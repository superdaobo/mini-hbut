import { openExternal } from '../../../utils/external_link'
import { campusGuideApi } from '../api/wisdom_client'
import { polylineToPoints } from '../map/polyline-decoder'
import type { GeoPoint, WalkRouteResult } from '../types'

export type WalkNavigationResult = {
  points: GeoPoint[]
  distance?: string | number
  duration?: string | number
  raw?: WalkRouteResult
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
  const points = Array.isArray(polyline) ? polylineToPoints(polyline) : []
  return {
    points,
    distance: data?.distance,
    duration: data?.duration,
    raw: data
  } satisfies WalkNavigationResult
}

export const openExternalMapNavigation = async (end: GeoPoint, name = '目的地') => {
  const lat = Number(end.latitude)
  const lng = Number(end.longitude)
  const label = encodeURIComponent(name)
  const candidates = [
    `https://apis.map.qq.com/uri/v1/routeplan?type=walk&to=${name}&tocoord=${lat},${lng}&referer=mini-hbut`,
    `https://uri.amap.com/navigation?to=${lng},${lat},${label}&mode=walk&coordinate=gaode`,
    `https://map.baidu.com/mobile/webapp/search/search/qt=nav&sn=0&en=1&end=${lat},${lng}`
  ]
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