/** 校园地图 POI 与远程配置类型 */

export type CampusBuildingCategory =
  | 'teaching'
  | 'dormitory'
  | 'library'
  | 'canteen'
  | 'sports'
  | 'admin'
  | 'gate'
  | 'other'

export interface CampusBuilding {
  id: string
  name: string
  aliases?: string[]
  category: CampusBuildingCategory
  lat: number
  lng: number
  campus_id?: string
  tags?: string[]
  meta?: Record<string, string>
}

export interface CampusMapBounds {
  sw: { lat: number; lng: number }
  ne: { lat: number; lng: number }
}

export interface CampusMapConfig {
  version: string
  center: { lat: number; lng: number }
  default_zoom: number
  bounds?: CampusMapBounds
  map_style_id?: string
}

export interface CampusMapManifest {
  version: string
  buildings_url: string
  config_url: string
  updated_at?: string
}

export interface CampusMapBundle {
  manifest: CampusMapManifest
  config: CampusMapConfig
  buildings: CampusBuilding[]
  fromCache: boolean
  offline: boolean
  degradedReason?: string
}

export interface MapLatLng {
  lat: number
  lng: number
}

export interface WalkingRouteResult {
  distanceMeters: number
  durationSeconds: number
  polyline: MapLatLng[]
}
