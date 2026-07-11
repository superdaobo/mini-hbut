import { distanceUnit } from '../utils/geo'
import type {
  BusRoad,
  CampusActivity,
  CampusSpot,
  GeoPoint,
  ScenicInfo,
  ScenicNotice,
  ScenicTag,
  TourRoute
} from '../types'

const toNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : NaN
}

const parseAoiRing = (ring: string): GeoPoint[] =>
  String(ring || '')
    .split(';')
    .map((segment) => {
      const [lng, lat] = segment.split(',').map((part) => Number(part.trim()))
      return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null
    })
    .filter(Boolean) as GeoPoint[]

/** 与小程序 getScenicInfo 一致：由 tag_set + tag_set_map 组装分类标签 */
export const buildScenicTags = (raw: unknown): ScenicTag[] => {
  if (!raw || typeof raw !== 'object') return []
  const data = raw as Record<string, unknown>
  if (Array.isArray(data.tags) && data.tags.length) {
    return data.tags as ScenicTag[]
  }
  const tagSetMap = Array.isArray(data.tag_set_map) ? (data.tag_set_map as ScenicTag[]) : []
  const tagSet = Array.isArray(data.tag_set) ? data.tag_set.map(String) : []
  if (!tagSetMap.length || !tagSet.length) return []
  const tags: ScenicTag[] = []
  for (const tagKey of tagSet) {
    for (const item of tagSetMap) {
      if (item?.tag === tagKey) tags.push(item)
    }
  }
  return tags
}

export const normalizeScenicInfo = (raw: unknown): ScenicInfo => {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const aoiRaw = data.aoi
  let aoi: GeoPoint[][] | undefined
  if (Array.isArray(aoiRaw)) {
    aoi = aoiRaw.map((item) => {
      if (typeof item === 'string') return parseAoiRing(item)
      if (Array.isArray(item)) {
        return item
          .map((point) => {
            if (!point || typeof point !== 'object') return null
            const obj = point as Record<string, unknown>
            const lat = toNumber(obj.latitude ?? obj.lat)
            const lng = toNumber(obj.longitude ?? obj.lng ?? obj.lon)
            return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null
          })
          .filter(Boolean) as GeoPoint[]
      }
      return []
    })
  }

  return {
    ...(data as ScenicInfo),
    scenic_id: data.scenic_id ?? data.id,
    latitude: toNumber(data.latitude),
    longitude: toNumber(data.longitude),
    introduction: data.introduction ? String(data.introduction) : undefined,
    screen_url: data.screen_url ? String(data.screen_url) : undefined,
    aoi
  }
}

/** 解析经纬度：兼容字符串、微度（绝对值 > 1000 时 /1e6） */
const toCoord = (value: unknown) => {
  const num = toNumber(value)
  if (!Number.isFinite(num)) return NaN
  if (Math.abs(num) > 1000) return num / 1_000_000
  return num
}

export const normalizeSpot = (raw: unknown): CampusSpot | null => {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const location = (data.location && typeof data.location === 'object'
    ? data.location
    : data.point && typeof data.point === 'object'
      ? data.point
      : data.latlng && typeof data.latlng === 'object'
        ? data.latlng
        : undefined) as Record<string, unknown> | undefined
  let lat = toCoord(location?.lat ?? location?.latitude ?? data.latitude ?? data.lat)
  let lng = toCoord(
    location?.lon ?? location?.lng ?? location?.longitude ?? data.longitude ?? data.lng ?? data.lon
  )
  // 兼容 "lat,lng" / "lng,lat" 字符串
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && typeof data.location === 'string') {
    const parts = data.location.split(/[,，\s]+/).map((p) => toCoord(p.trim()))
    if (parts.length >= 2 && parts.every(Number.isFinite)) {
      // 智慧景区常见 lat,lng 或 lng,lat：纬度应在 ±90
      if (Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180) {
        lat = parts[0]
        lng = parts[1]
      } else if (Math.abs(parts[1]) <= 90 && Math.abs(parts[0]) <= 180) {
        lat = parts[1]
        lng = parts[0]
      }
    }
  }
  const spotId = data.spot_id ?? data.id
  const name = String(data.name ?? data.title ?? '').trim()
  if (!spotId || !name) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null

  return {
    spot_id: spotId as string | number,
    name,
    category: data.category ? String(data.category) : undefined,
    marker_type: data.marker_type ? String(data.marker_type) : data.map_type ? String(data.map_type) : undefined,
    latitude: lat,
    longitude: lng,
    point: { latitude: lat, longitude: lng },
    distance: toNumber(data.distance),
    distancer: data.distancer ? String(data.distancer) : undefined,
    introduction: data.introduction ? String(data.introduction) : undefined,
    info: data.info ? String(data.info) : undefined,
    pic: data.pic,
    speech: data.speech,
    is_saved: Boolean(data.is_saved),
    raw
  }
}

export const normalizeSpotList = (raw: unknown): CampusSpot[] => {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  const list = Array.isArray(obj.list) ? obj.list : Array.isArray(raw) ? raw : []
  return list.map(normalizeSpot).filter(Boolean) as CampusSpot[]
}

export const scenicCenter = (scenic: ScenicInfo | null, fallback: GeoPoint) => {
  const lat = toNumber(scenic?.latitude)
  const lng = toNumber(scenic?.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { latitude: lat, longitude: lng, name: scenic?.name || fallback.name }
  }
  return fallback
}

export const parseRoadPointText = (raw: unknown): GeoPoint[][] => {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    if (Array.isArray(raw)) {
      return raw
        .map((segment) => {
          if (Array.isArray(segment)) {
            return segment
              .map((point) => {
                if (!point || typeof point !== 'object') return null
                const obj = point as Record<string, unknown>
                const lat = toNumber(obj.latitude ?? obj.lat)
                const lng = toNumber(obj.longitude ?? obj.lng ?? obj.lon)
                return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null
              })
              .filter(Boolean) as GeoPoint[]
          }
          return []
        })
        .filter((segment) => segment.length >= 2)
    }
  } catch {
    // fall through
  }
  return text.split('&').map((segment) =>
    segment
      .split(';')
      .map((pair) => {
        const [lat, lng] = pair.split(',').map((part) => Number(part.trim()))
        return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null
      })
      .filter(Boolean) as GeoPoint[]
  ).filter((segment) => segment.length >= 2)
}

export const normalizeTourRoutes = (raw: unknown): TourRoute[] => {
  const list = Array.isArray(raw) ? raw : []
  return list.map((item) => {
    const data = (item || {}) as Record<string, unknown>
    const distance = toNumber(data.distance)
    return {
      road_id: data.road_id ?? data.id,
      id: data.id ?? data.road_id,
      name: String(data.name || data.title || '游览路线'),
      title: data.title ? String(data.title) : undefined,
      distance: data.distance,
      distancer: data.distancer
        ? String(data.distancer)
        : Number.isFinite(distance)
          ? distanceUnit(distance, '距离')
          : undefined,
      img_road: data.img_road ? String(data.img_road) : undefined,
      road_tag: Array.isArray(data.road_tag)
        ? data.road_tag.map(String)
        : String(data.road_tag || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
      road_point: parseRoadPointText(data.road_point),
      spot_list: normalizeSpotList({ list: data.spot_list }),
      spots: Array.isArray(data.spots) ? data.spots : undefined,
      raw: item
    }
  })
}

export const normalizeBusRoads = (raw: unknown): BusRoad[] => {
  const list = Array.isArray(raw) ? raw : []
  return list.map((item) => {
    const data = (item || {}) as Record<string, unknown>
    return {
      road_id: data.road_id ?? data.id,
      id: data.id ?? data.road_id,
      name: String(data.name || data.title || '班车路线'),
      title: data.title ? String(data.title) : undefined,
      road_point: parseRoadPointText(data.road_point),
      raw: item
    }
  })
}

export const normalizeNotices = (raw: unknown): ScenicNotice[] => {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  return list.map((item, index) => {
    const data = (item || {}) as Record<string, unknown>
    const content = String(data.content || '')
      .split('[[enter]]')
      .join('\n')
    return {
      id: data.id ?? index,
      title: String(data.title || data.name || `公告 ${index + 1}`),
      content
    }
  })
}

export const normalizeActivities = (raw: unknown): CampusActivity[] => {
  const list = Array.isArray((raw as { list?: unknown[] })?.list)
    ? ((raw as { list: unknown[] }).list)
    : Array.isArray(raw)
      ? raw
      : []
  return list.map((item) => {
    const data = (item || {}) as Record<string, unknown>
    return {
      activity_id: data.activity_id ?? data.id,
      id: data.id ?? data.activity_id,
      title: String(data.title || data.name || '校园活动'),
      name: data.name ? String(data.name) : undefined,
      content: data.content ? String(data.content) : undefined,
      introduction: data.introduction ? String(data.introduction) : undefined,
      pic: data.pic,
      start_time: data.start_time ? String(data.start_time) : undefined,
      end_time: data.end_time ? String(data.end_time) : undefined,
      raw: item
    }
  })
}