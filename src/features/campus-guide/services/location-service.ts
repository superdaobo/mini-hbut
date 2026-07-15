import { useGeolocation } from '../../../composables/useGeolocation'
import { pushDebugLog } from '../../../utils/debug_logger'
import { HBUT_LOCATION, normalizePoint } from '../../../utils/towergo_map'
import type { GeoPoint } from '../types'
import { isPointInAoi } from '../utils/geo'

const MOCK_LOC_KEY = 'campus_guide_mock_loc'

export const readMockLocation = (): GeoPoint | null => {
  try {
    const raw = localStorage.getItem(MOCK_LOC_KEY)
    if (!raw) return null
    return normalizePoint(JSON.parse(raw))
  } catch {
    return null
  }
}

export const writeMockLocation = (point: GeoPoint | null) => {
  if (!point) {
    localStorage.removeItem(MOCK_LOC_KEY)
    return
  }
  localStorage.setItem(MOCK_LOC_KEY, JSON.stringify(point))
}

export const resolveCampusLocation = async (): Promise<GeoPoint> => {
  const mock = readMockLocation()
  if (mock) {
    const point = { ...mock, name: mock.name || '模拟定位' }
    pushDebugLog(
      'CampusGuide',
      `定位结果 source=mock lat=${point.latitude} lng=${point.longitude}`,
      'info',
      point
    )
    return point
  }

  const geo = useGeolocation()
  try {
    // 缩短 maximumAge：避免 iOS 把缓存的旧坐标（校外）当成当前
    const position = await geo.getCurrentPosition(12000, 0)
    const point = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      name: '当前位置'
    }
    pushDebugLog(
      'CampusGuide',
      `定位结果 source=system lat=${point.latitude.toFixed(6)} lng=${point.longitude.toFixed(6)} ±${Math.round(point.accuracy || 0)}m`,
      'info',
      { ...point, source: 'system' }
    )
    return point
  } catch (err) {
    const fallback = { ...HBUT_LOCATION, name: HBUT_LOCATION.name || '湖北工业大学' }
    pushDebugLog(
      'CampusGuide',
      `定位回退校区中心: ${(err as Error)?.message || err}`,
      'warn',
      { ...fallback, source: 'fallback' }
    )
    return fallback
  }
}

/**
 * 是否在景区内。
 * - 无 AOI 数据：默认 true（避免误报校外）
 * - 精度很差（>150m）且点在 AOI 外：仍给 true 并依赖 UI 提示精度差（避免 GPS 抖出校区）
 * - 正常：严格点内判定
 */
export const resolveInsideScenic = (point: GeoPoint, aoiRings: GeoPoint[][]) => {
  if (!aoiRings.length) return true
  const inside = isPointInAoi(point, aoiRings)
  if (inside) return true
  const accuracy = Number(point.accuracy)
  if (Number.isFinite(accuracy) && accuracy > 150) {
    // 精度不足时不武断判校外（iOS 冷启动常见）
    return true
  }
  // 与校区中心距离 < 2.5km 时，AOI 边界抖动也倾向判在校内
  const d = Math.hypot(
    (point.latitude - HBUT_LOCATION.latitude) * 111320,
    (point.longitude - HBUT_LOCATION.longitude) * 111320 * Math.cos(point.latitude * Math.PI / 180)
  )
  if (d < 2500) return true
  return false
}