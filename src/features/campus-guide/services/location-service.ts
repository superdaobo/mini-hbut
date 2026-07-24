import { useGeolocation } from '../../../composables/useGeolocation'
import { isLiveLocationAllowed } from '../../../config/app_store_policy'
import { pushDebugLog } from '../../../utils/debug_logger'
import { HBUT_LOCATION, normalizePoint } from '../../../utils/towergo_map'
import type { GeoPoint } from '../types'
import { isPointInAoi } from '../utils/geo'

const MOCK_LOC_KEY = 'campus_guide_mock_loc'

export type LocationSource = 'mock' | 'system' | 'fallback' | 'policy'

export type LocationResolveResult = {
  point: GeoPoint
  source: LocationSource
  error?: string
}

/** 最近一次定位元信息，供 UI 区分「真定位 / 回退 / 合规禁用」 */
let lastLocationMeta: LocationResolveResult = {
  point: { ...HBUT_LOCATION, name: HBUT_LOCATION.name || '湖北工业大学' },
  source: 'fallback'
}

export const getLastLocationMeta = (): LocationResolveResult => lastLocationMeta

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

const campusFallback = (): GeoPoint => ({
  ...HBUT_LOCATION,
  name: HBUT_LOCATION.name || '湖北工业大学'
})

/**
 * 尝试系统定位：先高精度，失败再低精度（部分手机室内高精度会直接失败）。
 */
const trySystemLocation = async (): Promise<GeoPositionLike> => {
  const geo = useGeolocation()
  try {
    return await geo.getCurrentPosition(12000, 0, true)
  } catch (highAccErr) {
    // 二次尝试：关闭高精度，拉长超时，允许短缓存
    pushDebugLog(
      'CampusGuide',
      `高精度定位失败，尝试低精度: ${(highAccErr as Error)?.message || highAccErr}`,
      'warn'
    )
    return geo.getCurrentPosition(16000, 3000, false)
  }
}

type GeoPositionLike = {
  latitude: number
  longitude: number
  accuracy: number
}

/** 详细解析定位来源；bootstrap / 显式定位共用 */
export const resolveCampusLocationDetailed = async (): Promise<LocationResolveResult> => {
  const mock = readMockLocation()
  if (mock) {
    const point = { ...mock, name: mock.name || '模拟定位' }
    const result: LocationResolveResult = { point, source: 'mock' }
    lastLocationMeta = result
    pushDebugLog(
      'CampusGuide',
      `定位结果 source=mock lat=${point.latitude} lng=${point.longitude}`,
      'info',
      point
    )
    return result
  }

  // App Store 合规构建：不请求实时定位，回落校区默认点（POI 浏览仍可用）
  if (!isLiveLocationAllowed()) {
    const point = { ...campusFallback(), name: '校园中心' }
    const result: LocationResolveResult = {
      point,
      source: 'policy',
      error: '当前版本使用默认校区位置'
    }
    lastLocationMeta = result
    pushDebugLog('CampusGuide', 'App Store 构建跳过实时定位，使用默认点', 'info', point)
    return result
  }

  try {
    const position = await trySystemLocation()
    const point: GeoPoint = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      name: '当前位置'
    }
    const result: LocationResolveResult = { point, source: 'system' }
    lastLocationMeta = result
    pushDebugLog(
      'CampusGuide',
      `定位结果 source=system lat=${point.latitude.toFixed(6)} lng=${point.longitude.toFixed(6)} ±${Math.round(point.accuracy || 0)}m`,
      'info',
      { ...point, source: 'system' }
    )
    return result
  } catch (err) {
    const message = (err as Error)?.message || '定位失败'
    const point = campusFallback()
    const result: LocationResolveResult = { point, source: 'fallback', error: message }
    lastLocationMeta = result
    pushDebugLog(
      'CampusGuide',
      `定位回退校区中心: ${message}`,
      'warn',
      { ...point, source: 'fallback' }
    )
    return result
  }
}

export const resolveCampusLocation = async (): Promise<GeoPoint> => {
  const result = await resolveCampusLocationDetailed()
  return result.point
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
    (point.longitude - HBUT_LOCATION.longitude) * 111320 * Math.cos((point.latitude * Math.PI) / 180)
  )
  if (d < 2500) return true
  return false
}
