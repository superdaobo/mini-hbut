import type { GeoPoint } from '../types'

const EARTH_RADIUS = 6378137

export const distanceMeters = (from: GeoPoint, to: GeoPoint) => {
  const lat1 = (from.latitude * Math.PI) / 180
  const lat2 = (to.latitude * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const distanceUnit = (meters: number, prefix = '距你') => {
  if (!Number.isFinite(meters) || meters <= 0) return `${prefix}0米`
  if (meters < 1000) return `${prefix}${Math.round(meters)}米`
  return `${prefix}${(Math.round(meters / 100) / 10).toFixed(1)}公里`
}

/** 射线法判断点是否在多边形内（移植小程序 isInside） */
export const isPointInPolygon = (point: GeoPoint, polygon: GeoPoint[]) => {
  if (!point || !polygon?.length) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].latitude
    const xi = polygon[i].longitude
    const yj = polygon[j].latitude
    const xj = polygon[j].longitude
    const intersects =
      xi > point.longitude !== xj > point.longitude &&
      point.latitude < ((yj - yi) * (point.longitude - xi)) / (xj - xi) + yi
    if (intersects) inside = !inside
  }
  return inside
}

export const isPointInAoi = (point: GeoPoint, rings: GeoPoint[][]) => {
  if (!rings?.length) return false
  return rings.some((ring) => isPointInPolygon(point, ring))
}