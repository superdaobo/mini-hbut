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

export const SCAN_GRID_SPACING_METERS = 120
export const SCAN_CONCURRENCY = 8
export const SCAN_REQUEST_DELAY_MS = 30

const toNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : NaN
}

const firstArray = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>
  for (const key of ['list', 'records', 'rows', 'data', 'items']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  return []
}

export const normalizePoint = (point: unknown): TowerGoPoint | null => {
  if (!point) return null
  if (Array.isArray(point)) {
    const lng = toNumber(point[0])
    const lat = toNumber(point[1])
    return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null
  }
  if (typeof point !== 'object') return null
  const obj = point as Record<string, unknown>
  const lat = toNumber(obj.lat ?? obj.latitude ?? obj.centerLat ?? obj.y)
  const lng = toNumber(obj.lng ?? obj.longitude ?? obj.centerLng ?? obj.x)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { latitude: lat, longitude: lng }
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
  spacingMeters = SCAN_GRID_SPACING_METERS
}: {
  serviceData?: unknown
  origin?: TowerGoPoint
  spacingMeters?: number
}) => {
  const loc = normalizePoint(origin) || HBUT_LOCATION
  const polygon = getServiceAreaPolygon(serviceData)
  const center = normalizePoint({
    latitude: (serviceData as Record<string, unknown> | undefined)?.centerLat,
    longitude: (serviceData as Record<string, unknown> | undefined)?.centerLng
  }) || loc

  // Determine scan bounding box
  let minLat: number
  let maxLat: number
  let minLng: number
  let maxLng: number
  let effectiveSpacing: number

  if (polygon.length >= 3) {
    // ── Polygon available: use its bounds expanded by 30% ──────
    const lats = polygon.map((point) => point.latitude)
    const lngs = polygon.map((point) => point.longitude)
    minLat = Math.min(...lats)
    maxLat = Math.max(...lats)
    minLng = Math.min(...lngs)
    maxLng = Math.max(...lngs)
    const latPad = Math.max((maxLat - minLat) * 0.2, 0.003)
    const lngPad = Math.max((maxLng - minLng) * 0.2, 0.003)
    minLat -= latPad
    maxLat += latPad
    minLng -= lngPad
    maxLng += lngPad
    effectiveSpacing = Math.max(60, Number(spacingMeters) || SCAN_GRID_SPACING_METERS)
  } else {
    // ── No polygon: cover ~3 km radius around center ──────────
    const range = 0.027 // roughly 3 km in each direction
    minLat = center.latitude - range
    maxLat = center.latitude + range
    minLng = center.longitude - range
    maxLng = center.longitude + range
    // Coarser spacing for wide fallback to keep request count reasonable
    effectiveSpacing = 200
  }

  const midLat = (minLat + maxLat) / 2
  const latStep = effectiveSpacing / 111320
  const lngStep = effectiveSpacing / (111320 * Math.max(0.1, Math.cos(midLat * Math.PI / 180)))

  // Build the grid — scan EVERY point in the bounding box, never restrict to polygon interior
  const points: TowerGoPoint[] = [loc, center]
  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lng = minLng; lng <= maxLng; lng += lngStep) {
      points.push({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) })
    }
  }

  return dedupeScanPoints(points).sort((a, b) =>
    distanceMeters(loc.latitude, loc.longitude, a.latitude, a.longitude) -
    distanceMeters(loc.latitude, loc.longitude, b.latitude, b.longitude)
  )
}

export const normalizeVehicles = (data: unknown, origin: TowerGoPoint = HBUT_LOCATION): TowerGoVehicle[] => {
  const loc = normalizePoint(origin) || HBUT_LOCATION
  return firstArray(data)
    .map((item) => {
      const obj = (item || {}) as Record<string, unknown>
      const lat = toNumber(obj.lat ?? obj.latitude)
      const lng = toNumber(obj.lng ?? obj.longitude)
      const rawDistance = toNumber(obj.distance)
      return {
        id: String(obj.carId || obj.id || obj.imei || ''),
        imei: String(obj.imei || ''),
        latitude: lat,
        longitude: lng,
        battery: obj.restBattery as number | string ?? obj.battery as number | string ?? obj.power as number | string ?? 0,
        distance: Number.isFinite(rawDistance) ? rawDistance : distanceMeters(loc.latitude, loc.longitude, lat, lng),
        mileage: obj.restMileage as string | number ?? obj.mileage as string | number ?? '',
        lastUsedTime: String(obj.lastUsedTime || ''),
        hasReward: obj.hasReward,
        raw: item
      }
    })
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0))
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
  timeoutMs = 5000,
  maxDriftMeters = 2000
}: {
  geolocation?: Geolocation
  fallback?: TowerGoPoint
  timeoutMs?: number
  maxDriftMeters?: number
} = {}): Promise<TowerGoPoint> => {
  if (!geolocation?.getCurrentPosition) {
    return { ...fallback, source: 'fallback' }
  }
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          // 系统定位可能偏移到校外几公里（桌面端/室内/VPN），超阈值则回退到校区坐标，
          // 避免用偏移坐标查服务区识别成别的校区
          const drift = distanceMeters(fallback.latitude, fallback.longitude, lat, lng)
          if (Number.isFinite(drift) && drift > maxDriftMeters) {
            resolve({ ...fallback, source: 'fallback' })
            return
          }
          resolve({
            name: '当前位置',
            latitude: lat,
            longitude: lng,
            accuracy: position.coords.accuracy || 0,
            source: 'system'
          })
        },
        () => {
          resolve({ ...fallback, source: 'fallback' })
        },
        { timeout: timeoutMs, enableHighAccuracy: true, maximumAge: 5000 }
      )
    } catch {
      resolve({ ...fallback, source: 'fallback' })
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
