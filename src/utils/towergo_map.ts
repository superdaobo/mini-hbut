import { pushDebugLog } from './debug_logger'

export interface TowerGoPoint {
  name?: string
  latitude: number
  longitude: number
  accuracy?: number
  source?: 'system' | 'fallback'
}

export interface TowerGoVehicle {
  id: string
  imei: string
  latitude: number
  longitude: number
  battery: number | string
  distance: number
  mileage?: string | number
  lastUsedTime?: string
  hasReward?: unknown
  raw?: unknown
}

export const HBUT_LOCATION: TowerGoPoint = {
  name: '湖北工业大学',
  latitude: 30.4819,
  longitude: 114.313
}

/**
 * #490 对齐小程序：默认只对「地图中心」发起单次 eBikeLocation，不再整区网格打爆。
 * 下列 SCAN_* 网格常量仅保留给 createServiceAreaScanPoints 遗留工具/测试，主路径勿用。
 */
export const SCAN_GRID_SPACING_METERS = 150
export const SCAN_CONCURRENCY = 1
export const SCAN_REQUEST_DELAY_MS = 0
export const SCAN_MAX_POINTS = 1
/** 定时按当前地图中心刷新附近车（ms） */
export const SCAN_REFRESH_INTERVAL_MS = 180_000
/** region 拖动/缩放结束后的中心拉车防抖（ms） */
export const SCAN_VIEWPORT_DEBOUNCE_MS = 280
/** @deprecated #490 主路径改为中心单次；保留兼容 */
export const SCAN_NEARBY_RADIUS_METERS = 1200
/** 中心拉车防抖别名，语义更清晰 */
export const CENTER_FETCH_DEBOUNCE_MS = SCAN_VIEWPORT_DEBOUNCE_MS

/** 官方小程序电量档：0/10/…/100 */
export const BATTERY_ICON_TIERS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const
export type BatteryIconTier = (typeof BATTERY_ICON_TIERS)[number]

/** 将电量归一到小程序 icon_ebike_*_battery{N} 档位 */
export const batteryLevelTier = (battery: unknown): BatteryIconTier => {
  const n = Number(battery)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n >= 100) return 100
  return (Math.round(n / 10) * 10) as BatteryIconTier
}

/**
 * WGS-84 → GCJ-02（火星坐标）。
 * 浏览器/系统定位多为 WGS-84，腾讯图与铁塔接口为 GCJ-02；不转换会导致人/车错位。
 */
export const wgs84ToGcj02 = (lat: number, lng: number): { latitude: number; longitude: number } => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { latitude: lat, longitude: lng }
  // 境外不纠偏
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) {
    return { latitude: lat, longitude: lng }
  }
  const PI = Math.PI
  const A = 6378245.0
  const EE = 0.00669342162296594323
  const transformLat = (x: number, y: number) => {
    let ret =
      -100.0 +
      2.0 * x +
      3.0 * y +
      0.2 * y * y +
      0.1 * x * y +
      0.2 * Math.sqrt(Math.abs(x))
    ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
    ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
    ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
    return ret
  }
  const transformLng = (x: number, y: number) => {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
    ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
    ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
    ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
    return ret
  }
  const dLat = transformLat(lng - 105.0, lat - 35.0)
  const dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const mgLat = lat + (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  const mgLng = lng + (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { latitude: mgLat, longitude: mgLng }
}

export type ScanBounds = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/** 将扫描点量化为格子 key，用于增量扫描去重 */
export const scanCellKey = (
  point: { latitude: number; longitude: number },
  spacingMeters = SCAN_GRID_SPACING_METERS
) => {
  const step = Math.max(50, Number(spacingMeters) || SCAN_GRID_SPACING_METERS)
  const latStep = step / 111320
  const lngStep = step / (111320 * Math.max(0.1, Math.cos((point.latitude * Math.PI) / 180)))
  const latCell = Math.round(point.latitude / latStep)
  const lngCell = Math.round(point.longitude / lngStep)
  return `${latCell},${lngCell}`
}

const toNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : NaN
}

/**
 * 纠偏：部分接口把 lat/lng 写反（lat≈114、lng≈30）。
 * 中国大陆大致 lat 18–54、lng 73–135。
 */
export const coerceChinaLatLng = (lat: number, lng: number): { latitude: number; longitude: number } | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let a = lat
  let b = lng
  const latLooksLikeLng = a > 70 && a < 140 && b > 15 && b < 55
  if (latLooksLikeLng) {
    const tmp = a
    a = b
    b = tmp
  }
  // 明显不在中国附近的坐标丢弃（避免标到海里/赤道）
  if (a < 15 || a > 55 || b < 70 || b > 140) return null
  return { latitude: a, longitude: b }
}

const firstArray = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>
  for (const key of [
    'list',
    'records',
    'rows',
    'data',
    'items',
    'deviceList',
    'device_list',
    'carList',
    'car_list',
    'ebikeList',
    'eBikeList',
    'nearList',
    'bikeList',
    'vehicles'
  ]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  // 再下钻一层常见包装
  for (const key of ['data', 'result', 'payload']) {
    const nested = obj[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = firstArray(nested)
      if (inner.length) return inner
    }
  }
  return []
}

const readLatLngFromObject = (obj: Record<string, unknown>): { latitude: number; longitude: number } | null => {
  // #490 对齐小程序：优先顶层 lat/lng（eBikeLocation 直接字段），避免嵌套写反污染
  const topLat = toNumber(
    obj.lat ??
      obj.latitude ??
      obj.carLat ??
      obj.car_lat ??
      obj.posLat ??
      obj.pos_lat ??
      obj.centerLat ??
      obj.latY ??
      obj.y
  )
  const topLng = toNumber(
    obj.lng ??
      obj.lon ??
      obj.longitude ??
      obj.carLng ??
      obj.car_lng ??
      obj.posLng ??
      obj.pos_lng ??
      obj.centerLng ??
      obj.lngX ??
      obj.x
  )
  const top = coerceChinaLatLng(topLat, topLng)
  if (top) return top

  // 嵌套 location / pos / coordinate
  for (const nestKey of ['location', 'pos', 'position', 'coordinate', 'coord', 'gps', 'point']) {
    const nested = obj[nestKey]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const fromNested = readLatLngFromObject(nested as Record<string, unknown>)
      if (fromNested) return fromNested
    }
    if (Array.isArray(nested) && nested.length >= 2) {
      const coerced = coerceChinaLatLng(toNumber(nested[1]), toNumber(nested[0]))
      // 数组默认 [lng, lat]
      if (coerced) return coerced
      const swapped = coerceChinaLatLng(toNumber(nested[0]), toNumber(nested[1]))
      if (swapped) return swapped
    }
  }

  return null
}

export const normalizePoint = (point: unknown): TowerGoPoint | null => {
  if (!point) return null
  if (Array.isArray(point)) {
    // GeoJSON / 业务侧常见 [lng, lat]
    const asLngLat = coerceChinaLatLng(toNumber(point[1]), toNumber(point[0]))
    if (asLngLat) return asLngLat
    return coerceChinaLatLng(toNumber(point[0]), toNumber(point[1]))
  }
  if (typeof point !== 'object') return null
  return readLatLngFromObject(point as Record<string, unknown>)
}

const parsePolygonText = (raw: string): TowerGoPoint[] => {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    const parsedPoints = extractPointArray(parsed)
    if (parsedPoints.length) return parsedPoints
  } catch {
    // 一些接口会返回 "lng,lat;lng,lat" 文本，继续走宽松解析。
  }
  return text
    .split(/[;|]/)
    .map((item) => {
      const [lng, lat] = item.split(',').map((part) => Number(part.trim()))
      return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null
    })
    .filter(Boolean) as TowerGoPoint[]
}

const extractPointArray = (value: unknown): TowerGoPoint[] => {
  if (!value) return []
  if (typeof value === 'string') return parsePolygonText(value)
  if (Array.isArray(value)) return value.map(normalizePoint).filter(Boolean) as TowerGoPoint[]
  if (typeof value !== 'object') return []
  const obj = value as Record<string, unknown>
  for (const key of [
    'points',
    'polygon',
    'polygons',
    'fencePoints',
    'fencePoint',
    'fence_point',
    'scope',
    'area',
    'coordinates'
  ]) {
    const points = extractPointArray(obj[key])
    if (points.length) return points
  }
  return []
}

export const getServiceAreaPolygon = (serviceData: unknown): TowerGoPoint[] => {
  // Try extracting directly from the raw data
  const direct = extractPointArray(serviceData)
  if (direct.length >= 3) return direct

  if (serviceData && typeof serviceData === 'object') {
    const obj = serviceData as Record<string, unknown>
    // Try .data first (most common wrapper)
    const data = obj.data
    const fromData = extractPointArray(data)
    if (fromData.length >= 3) return fromData

    // Try .data.data (doubly nested)
    if (data && typeof data === 'object') {
      const inner = (data as Record<string, unknown>).data
      const fromInner = extractPointArray(inner)
      if (fromInner.length >= 3) return fromInner
    }

    // Try every top-level key that might contain polygon data
    for (const key of [
      'fenceList', 'fence_list', 'fenceData', 'fence_data',
      'serviceAreaList', 'service_area_list', 'serviceAreas', 'service_areas',
      'polygonList', 'polygon_list', 'result', 'rows', 'records', 'list'
    ]) {
      const val = obj[key]
      if (val && typeof val === 'object') {
        // Try direct extraction first
        const pts = extractPointArray(val)
        if (pts.length >= 3) return pts
        // If it's an array, try each element
        if (Array.isArray(val)) {
          for (const item of val) {
            const itemPts = extractPointArray(item)
            if (itemPts.length >= 3) return itemPts
          }
        }
      }
    }
  }
  return []
}

export const isPointInPolygon = (point: TowerGoPoint, polygon: TowerGoPoint[]) => {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false
  const x = Number(point.longitude)
  const y = Number(point.latitude)
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].longitude)
    const yi = Number(polygon[i].latitude)
    const xj = Number(polygon[j].longitude)
    const yj = Number(polygon[j].latitude)
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

export const distanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const radius = 6371000
  const p1 = Number(lat1) * Math.PI / 180
  const p2 = Number(lat2) * Math.PI / 180
  const dp = (Number(lat2) - Number(lat1)) * Math.PI / 180
  const dl = (Number(lng2) - Number(lng1)) * Math.PI / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export const dedupeScanPoints = (points: unknown[]) => {
  const seen = new Set<string>()
  return (points || [])
    .map(normalizePoint)
    .filter(Boolean)
    .filter((point) => {
      const key = `${Number(point!.latitude).toFixed(5)},${Number(point!.longitude).toFixed(5)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }) as TowerGoPoint[]
}

export const createServiceAreaScanPoints = ({
  serviceData,
  origin = HBUT_LOCATION,
  spacingMeters = SCAN_GRID_SPACING_METERS,
  maxPoints = SCAN_MAX_POINTS,
  /** 仅扫描用户附近半径（米）；默认 1200m 附近优先，避免整区打爆。有 bounds 时忽略。 */
  nearbyRadiusMeters = SCAN_NEARBY_RADIUS_METERS,
  /** 地图视口外包矩形：与服务区求交后网格扫描（动态加载） */
  bounds
}: {
  serviceData?: unknown
  origin?: TowerGoPoint
  spacingMeters?: number
  maxPoints?: number
  nearbyRadiusMeters?: number
  bounds?: ScanBounds | null
}) => {
  const loc = normalizePoint(origin) || HBUT_LOCATION
  const polygon = getServiceAreaPolygon(serviceData)
  const center = normalizePoint({
    latitude: (serviceData as Record<string, unknown> | undefined)?.centerLat,
    longitude: (serviceData as Record<string, unknown> | undefined)?.centerLng
  }) || loc

  let minLat: number
  let maxLat: number
  let minLng: number
  let maxLng: number
  let effectiveSpacing = Math.max(80, Number(spacingMeters) || SCAN_GRID_SPACING_METERS)

  if (
    bounds &&
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLat) &&
    Number.isFinite(bounds.minLng) &&
    Number.isFinite(bounds.maxLng) &&
    bounds.minLat <= bounds.maxLat &&
    bounds.minLng <= bounds.maxLng
  ) {
    // 视口优先：用当前地图视野作为扫描范围
    minLat = bounds.minLat
    maxLat = bounds.maxLat
    minLng = bounds.minLng
    maxLng = bounds.maxLng
  } else {
    // 冷启动：用户附近方框
    const nearbyDeg = Math.max(200, Number(nearbyRadiusMeters) || 900) / 111320
    minLat = loc.latitude - nearbyDeg
    maxLat = loc.latitude + nearbyDeg
    minLng = loc.longitude - nearbyDeg / Math.max(0.1, Math.cos((loc.latitude * Math.PI) / 180))
    maxLng = loc.longitude + nearbyDeg / Math.max(0.1, Math.cos((loc.latitude * Math.PI) / 180))
  }

  if (polygon.length >= 3) {
    // 与服务区求交：不超过服务区外包矩形
    const lats = polygon.map((point) => point.latitude)
    const lngs = polygon.map((point) => point.longitude)
    const polyMinLat = Math.min(...lats)
    const polyMaxLat = Math.max(...lats)
    const polyMinLng = Math.min(...lngs)
    const polyMaxLng = Math.max(...lngs)
    minLat = Math.max(minLat, polyMinLat)
    maxLat = Math.min(maxLat, polyMaxLat)
    minLng = Math.max(minLng, polyMinLng)
    maxLng = Math.min(maxLng, polyMaxLng)
    if (minLat > maxLat || minLng > maxLng) {
      minLat = polyMinLat
      maxLat = polyMaxLat
      minLng = polyMinLng
      maxLng = polyMaxLng
    }
  } else {
    effectiveSpacing = Math.max(effectiveSpacing, 200)
  }

  const midLat = (minLat + maxLat) / 2
  const latStep = effectiveSpacing / 111320
  const lngStep = effectiveSpacing / (111320 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)))

  const points: TowerGoPoint[] = bounds ? [] : [loc, center]
  // 视口中心也纳入，便于视野内优先
  if (bounds) {
    points.push({
      latitude: Number(((minLat + maxLat) / 2).toFixed(6)),
      longitude: Number(((minLng + maxLng) / 2).toFixed(6))
    })
  }
  for (let lat = minLat; lat <= maxLat + 1e-12; lat += latStep) {
    for (let lng = minLng; lng <= maxLng + 1e-12; lng += lngStep) {
      points.push({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) })
    }
  }

  const sortOrigin = bounds
    ? {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2
      }
    : loc

  const sorted = dedupeScanPoints(points).sort(
    (a, b) =>
      distanceMeters(sortOrigin.latitude, sortOrigin.longitude, a.latitude, a.longitude) -
      distanceMeters(sortOrigin.latitude, sortOrigin.longitude, b.latitude, b.longitude)
  )
  const limit = Math.max(4, Number(maxPoints) || SCAN_MAX_POINTS)
  return sorted.slice(0, limit)
}

export const normalizeVehicles = (data: unknown, origin: TowerGoPoint = HBUT_LOCATION): TowerGoVehicle[] => {
  const loc = normalizePoint(origin) || HBUT_LOCATION
  return firstArray(data)
    .map((item) => {
      const obj = (item || {}) as Record<string, unknown>
      const coords = readLatLngFromObject(obj)
      if (!coords) return null
      const { latitude: lat, longitude: lng } = coords
      const rawDistance = toNumber(obj.distance ?? obj.dist ?? obj.meters)
      // 部分接口 distance 为 km
      let distance = Number.isFinite(rawDistance) ? rawDistance : distanceMeters(loc.latitude, loc.longitude, lat, lng)
      if (Number.isFinite(rawDistance) && rawDistance > 0 && rawDistance < 30 && distanceMeters(loc.latitude, loc.longitude, lat, lng) > 200) {
        // 像 km 又像 m：若原始值很小但直线距离很大，按 km→m
        if (rawDistance * 1000 > 50) distance = rawDistance * 1000
      }
      return {
        id: String(obj.carId || obj.car_id || obj.id || obj.imei || obj.deviceId || ''),
        imei: String(obj.imei || obj.deviceId || ''),
        latitude: lat,
        longitude: lng,
        battery:
          (obj.restBattery as number | string) ??
          (obj.battery as number | string) ??
          (obj.power as number | string) ??
          (obj.soc as number | string) ??
          0,
        distance,
        mileage: (obj.restMileage as string | number) ?? (obj.mileage as string | number) ?? '',
        lastUsedTime: String(obj.lastUsedTime || obj.last_used_time || ''),
        hasReward: obj.hasReward,
        raw: item
      } as TowerGoVehicle
    })
    .filter(Boolean)
    .filter((item) => Number.isFinite(item!.latitude) && Number.isFinite(item!.longitude))
    .sort((a, b) => Number(a!.distance || 0) - Number(b!.distance || 0)) as TowerGoVehicle[]
}

export const dedupeVehicles = (vehicles: TowerGoVehicle[], origin: TowerGoPoint = HBUT_LOCATION) => {
  const loc = normalizePoint(origin) || HBUT_LOCATION
  const byKey = new Map<string, TowerGoVehicle>()
  for (const vehicle of vehicles || []) {
    const key = String(vehicle.id || vehicle.imei || `${vehicle.latitude},${vehicle.longitude}`)
    if (!key || key === ',') continue
    const next = {
      ...vehicle,
      distance: distanceMeters(loc.latitude, loc.longitude, vehicle.latitude, vehicle.longitude)
    }
    const existing = byKey.get(key)
    if (!existing || Number(next.distance || 0) < Number(existing.distance || Infinity)) {
      byKey.set(key, next)
    }
  }
  return [...byKey.values()].sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0))
}

export const resolveTowerGoLocation = async ({
  geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
  fallback = HBUT_LOCATION,
  timeoutMs = 12000,
  maxDriftMeters = 2000,
  /** 0 = 强制刷新，避免 iOS/系统把陈旧校外坐标当当前 */
  maximumAge = 0
}: {
  geolocation?: Geolocation
  fallback?: TowerGoPoint
  timeoutMs?: number
  maxDriftMeters?: number
  maximumAge?: number
} = {}): Promise<TowerGoPoint> => {
  if (!geolocation?.getCurrentPosition) {
    const point = { ...fallback, source: 'fallback' as const }
    pushDebugLog(
      'TowerGo',
      `定位不可用，回退校区 lat=${point.latitude} lng=${point.longitude}`,
      'warn',
      point
    )
    return point
  }
  pushDebugLog('TowerGo', `定位请求开始 timeout=${timeoutMs}ms maximumAge=${maximumAge}`, 'debug', {
    timeoutMs,
    maximumAge
  })
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const rawLat = position.coords.latitude
          const rawLng = position.coords.longitude
          const accuracy = position.coords.accuracy || 0
          // 系统定位多为 WGS-84，转 GCJ-02 后与腾讯图/铁塔车辆坐标一致
          const gcj = wgs84ToGcj02(rawLat, rawLng)
          const lat = gcj.latitude
          const lng = gcj.longitude
          // 系统定位可能偏移到校外几公里（桌面端/室内/VPN），超阈值则回退到校区坐标，
          // 避免用偏移坐标查服务区识别成别的校区
          const drift = distanceMeters(fallback.latitude, fallback.longitude, lat, lng)
          if (Number.isFinite(drift) && drift > maxDriftMeters) {
            const point = { ...fallback, source: 'fallback' as const, accuracy }
            pushDebugLog(
              'TowerGo',
              `定位漂移 ${Math.round(drift)}m > ${maxDriftMeters}m，回退校区 lat=${point.latitude} lng=${point.longitude}`,
              'warn',
              { rawLat, rawLng, lat, lng, accuracy, drift, ...point }
            )
            resolve(point)
            return
          }
          const point = {
            name: '当前位置',
            latitude: lat,
            longitude: lng,
            accuracy,
            source: 'system' as const
          }
          pushDebugLog(
            'TowerGo',
            `定位成功(GCJ) lat=${lat.toFixed(6)} lng=${lng.toFixed(6)} ±${Math.round(accuracy)}m wgs=${rawLat.toFixed(6)},${rawLng.toFixed(6)}`,
            'info',
            { ...point, rawLat, rawLng }
          )
          resolve(point)
        },
        (err) => {
          const point = { ...fallback, source: 'fallback' as const }
          pushDebugLog('TowerGo', `定位失败，回退校区: ${err?.message || err}`, 'error', {
            ...point,
            code: err?.code
          })
          resolve(point)
        },
        {
          timeout: timeoutMs,
          enableHighAccuracy: true,
          maximumAge: Math.max(0, Number(maximumAge) || 0)
        }
      )
    } catch (err) {
      const point = { ...fallback, source: 'fallback' as const }
      pushDebugLog(
        'TowerGo',
        `定位异常，回退校区: ${(err as Error)?.message || err}`,
        'error',
        point
      )
      resolve(point)
    }
  })
}

export const formatDistance = (meters: unknown) => {
  const value = Number(meters)
  if (!Number.isFinite(value)) return '--'
  if (value < 1000) return `${Math.round(value)} m`
  return `${(value / 1000).toFixed(1)} km`
}

export const formatRideDuration = (seconds: unknown) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(value / 60)
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours <= 0) return `${restMinutes} 分钟`
  return `${hours} 小时 ${restMinutes} 分钟`
}
