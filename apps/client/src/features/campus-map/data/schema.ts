import type {
  CampusBuilding,
  CampusBuildingCategory,
  CampusMapConfig,
  CampusMapManifest
} from '../types'
import { CAMPUS_MAP_SCHEMA_VERSION } from '../constants'

const BUILDING_CATEGORIES = new Set<CampusBuildingCategory>([
  'teaching',
  'dormitory',
  'library',
  'canteen',
  'sports',
  'admin',
  'gate',
  'other'
])

const toNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : NaN
}

const safeText = (value: unknown) => String(value ?? '').trim()

const readSchemaVersion = (payload: Record<string, unknown>) =>
  safeText(payload.schema_version || payload.schemaVersion)

export class CampusMapSchemaError extends Error {
  readonly code = 'campus_map_schema_error'

  constructor(message: string) {
    super(message)
    this.name = 'CampusMapSchemaError'
  }
}

const assertSchemaVersion = (payload: Record<string, unknown>, label: string) => {
  const version = readSchemaVersion(payload)
  if (version && version !== CAMPUS_MAP_SCHEMA_VERSION) {
    throw new CampusMapSchemaError(`${label} schema_version 不匹配（期望 ${CAMPUS_MAP_SCHEMA_VERSION}，实际 ${version}）`)
  }
}

const parseBuilding = (raw: unknown, index: number): CampusBuilding => {
  if (!raw || typeof raw !== 'object') {
    throw new CampusMapSchemaError(`buildings[${index}] 不是有效对象`)
  }
  const item = raw as Record<string, unknown>
  const id = safeText(item.id)
  const name = safeText(item.name)
  const category = safeText(item.category) as CampusBuildingCategory
  const lat = toNumber(item.lat)
  const lng = toNumber(item.lng)

  if (!id) throw new CampusMapSchemaError(`buildings[${index}].id 不能为空`)
  if (!name) throw new CampusMapSchemaError(`buildings[${index}].name 不能为空`)
  if (!BUILDING_CATEGORIES.has(category)) {
    throw new CampusMapSchemaError(`buildings[${index}].category 非法：${category || '(empty)'}`)
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new CampusMapSchemaError(`buildings[${index}] 坐标无效`)
  }

  const aliases = Array.isArray(item.aliases)
    ? item.aliases.map((entry) => safeText(entry)).filter(Boolean)
    : undefined
  const tags = Array.isArray(item.tags)
    ? item.tags.map((entry) => safeText(entry)).filter(Boolean)
    : undefined
  const meta =
    item.meta && typeof item.meta === 'object'
      ? Object.fromEntries(
          Object.entries(item.meta as Record<string, unknown>).map(([key, value]) => [key, safeText(value)])
        )
      : undefined

  return {
    id,
    name,
    aliases: aliases?.length ? aliases : undefined,
    category,
    lat,
    lng,
    campus_id: safeText(item.campus_id || item.campusId) || undefined,
    tags: tags?.length ? tags : undefined,
    meta: meta && Object.keys(meta).length ? meta : undefined
  }
}

export const parseCampusBuildingsPayload = (payload: unknown): CampusBuilding[] => {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => parseBuilding(item, index))
  }
  if (!payload || typeof payload !== 'object') {
    throw new CampusMapSchemaError('buildings 数据格式无效')
  }
  const obj = payload as Record<string, unknown>
  assertSchemaVersion(obj, 'buildings')
  const list = obj.buildings
  if (!Array.isArray(list) || !list.length) {
    throw new CampusMapSchemaError('buildings 列表为空')
  }
  return list.map((item, index) => parseBuilding(item, index))
}

export const parseCampusMapConfig = (payload: unknown): CampusMapConfig => {
  if (!payload || typeof payload !== 'object') {
    throw new CampusMapSchemaError('config 数据格式无效')
  }
  const obj = payload as Record<string, unknown>
  assertSchemaVersion(obj, 'config')
  const centerRaw = obj.center as Record<string, unknown> | undefined
  const lat = toNumber(centerRaw?.lat)
  const lng = toNumber(centerRaw?.lng)
  const defaultZoom = toNumber(obj.default_zoom ?? obj.defaultZoom)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new CampusMapSchemaError('config.center 坐标无效')
  }
  if (!Number.isFinite(defaultZoom)) {
    throw new CampusMapSchemaError('config.default_zoom 无效')
  }

  let bounds: CampusMapConfig['bounds']
  const boundsRaw = obj.bounds as Record<string, unknown> | undefined
  if (boundsRaw && typeof boundsRaw === 'object') {
    const sw = boundsRaw.sw as Record<string, unknown> | undefined
    const ne = boundsRaw.ne as Record<string, unknown> | undefined
    const swLat = toNumber(sw?.lat)
    const swLng = toNumber(sw?.lng)
    const neLat = toNumber(ne?.lat)
    const neLng = toNumber(ne?.lng)
    if ([swLat, swLng, neLat, neLng].every(Number.isFinite)) {
      bounds = { sw: { lat: swLat, lng: swLng }, ne: { lat: neLat, lng: neLng } }
    }
  }

  return {
    version: safeText(obj.version) || 'unknown',
    center: { lat, lng },
    default_zoom: defaultZoom,
    bounds,
    map_style_id: safeText(obj.map_style_id || obj.mapStyleId) || undefined
  }
}

export const parseCampusMapManifest = (payload: unknown): CampusMapManifest => {
  if (!payload || typeof payload !== 'object') {
    throw new CampusMapSchemaError('manifest 数据格式无效')
  }
  const obj = payload as Record<string, unknown>
  assertSchemaVersion(obj, 'manifest')
  const version = safeText(obj.version)
  const buildingsUrl = safeText(obj.buildings_url || obj.buildingsUrl)
  const configUrl = safeText(obj.config_url || obj.configUrl)
  if (!version) throw new CampusMapSchemaError('manifest.version 不能为空')
  if (!buildingsUrl) throw new CampusMapSchemaError('manifest.buildings_url 不能为空')
  if (!configUrl) throw new CampusMapSchemaError('manifest.config_url 不能为空')
  return {
    version,
    buildings_url: buildingsUrl,
    config_url: configUrl,
    updated_at: safeText(obj.updated_at || obj.updatedAt) || undefined
  }
}
