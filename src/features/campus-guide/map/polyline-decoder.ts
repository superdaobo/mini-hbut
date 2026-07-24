import type { GeoPoint } from '../types'

const MICRO_DEGREE_THRESHOLD = 1000

/** 判断 polyline 首对坐标是否为腾讯微度格式（* 1e6） */
const isMicroDegreePolyline = (lat: number, lng: number) =>
  Math.abs(lat) > MICRO_DEGREE_THRESHOLD || Math.abs(lng) > MICRO_DEGREE_THRESHOLD

/** 解压腾讯步行路线坐标：兼容微度绝对坐标 + 增量，以及度坐标 + 增量（小程序 translateCoors） */
export const decodeDeltaPolyline = (raw: Array<number | string>) => {
  if (!Array.isArray(raw) || raw.length < 2) return [] as number[]
  // 防御稀疏数组 / 空洞导致 undefined[n] 类崩溃
  const coors = raw.map((item) => {
    const n = Number(item)
    return Number.isFinite(n) ? n : NaN
  })
  if (coors.length < 2) return [] as number[]

  const firstLat = coors[0]
  const firstLng = coors[1]
  if (!Number.isFinite(firstLat) || !Number.isFinite(firstLng)) return [] as number[]

  if (isMicroDegreePolyline(firstLat, firstLng)) {
    const values: number[] = []
    let lat = firstLat / 1_000_000
    let lng = firstLng / 1_000_000
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
    values.push(lat, lng)
    for (let index = 2; index + 1 < coors.length; index += 2) {
      const deltaLat = coors[index]
      const deltaLng = coors[index + 1]
      if (!Number.isFinite(deltaLat) || !Number.isFinite(deltaLng)) continue
      lat += deltaLat / 1_000_000
      lng += deltaLng / 1_000_000
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      values.push(lat, lng)
    }
    return values
  }

  const values = coors.slice()
  for (let index = 2; index < values.length; index += 1) {
    const base = values[index - 2]
    const delta = values[index]
    if (!Number.isFinite(base) || !Number.isFinite(delta)) {
      values[index] = NaN
      continue
    }
    values[index] = base + delta / 1_000_000
  }
  return values
}

export const polylineToPoints = (raw: Array<number | string>): GeoPoint[] => {
  const values = decodeDeltaPolyline(raw)
  const points: GeoPoint[] = []
  for (let index = 0; index + 1 < values.length; index += 2) {
    const latitude = values[index]
    const longitude = values[index + 1]
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    points.push({ latitude, longitude })
  }
  return points
}
