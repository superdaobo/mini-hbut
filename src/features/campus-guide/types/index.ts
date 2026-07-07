export interface GeoPoint {
  latitude: number
  longitude: number
  name?: string
  accuracy?: number
}

export interface ScenicTag {
  tag: string
  icon_name?: string
  name?: string
}

export interface ScenicNotice {
  title?: string
  content?: string
  id?: string | number
}

export interface ScenicInfo {
  scenic_id?: string | number
  id?: string | number
  name?: string
  latitude?: number
  longitude?: number
  introduction?: string
  aoi?: GeoPoint[][]
  tags?: ScenicTag[]
  notice?: ScenicNotice | ScenicNotice[]
  bus_road_list?: unknown[]
  tour_road_list?: unknown[]
  distancer?: string
  screen_url?: string
}

export interface SpotPoint {
  latitude: number
  longitude: number
}

export interface CampusSpot {
  spot_id: string | number
  name: string
  category?: string
  marker_type?: string
  latitude?: number
  longitude?: number
  point?: SpotPoint
  distance?: number
  distancer?: string
  introduction?: string
  info?: string
  pic?: unknown
  speech?: unknown
  is_saved?: boolean
  raw?: unknown
}

export interface WisdomApiResponse<T = unknown> {
  code?: number | string
  msg?: string
  message?: string
  data?: T
}

export interface WalkRouteResult {
  polyline?: Array<number | string>
  distance?: number | string
  duration?: number | string
}

export interface TourRoute {
  road_id?: string | number
  id?: string | number
  name?: string
  title?: string
  distance?: number | string
  distancer?: string
  img_road?: string
  road_tag?: string[]
  road_point?: GeoPoint[][]
  spot_list?: CampusSpot[]
  spots?: Array<string | number>
  raw?: unknown
}

export interface BusRoad {
  road_id?: string | number
  id?: string | number
  name?: string
  title?: string
  road_point?: GeoPoint[][]
  raw?: unknown
}

export interface CampusActivity {
  activity_id?: string | number
  id?: string | number
  title?: string
  name?: string
  content?: string
  introduction?: string
  pic?: unknown
  start_time?: string
  end_time?: string
  raw?: unknown
}