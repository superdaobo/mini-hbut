import { CAMPUS_GUIDE_CONFIG } from '../config'
import {
  loadTencentMap as loadSharedTencentMap,
  resetTencentMapLoader,
  type TencentMapNamespace as SharedTencentMapNamespace
} from '../../../utils/tencent_map_loader'

export type TencentMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => TencentMapInstance
  LatLng: new (lat: number, lng: number) => unknown
  MultiMarker: new (options: Record<string, unknown>) => TencentLayer
  MultiPolyline: new (options: Record<string, unknown>) => TencentLayer
  MarkerStyle: new (options: Record<string, unknown>) => unknown
  PolylineStyle?: new (options: Record<string, unknown>) => unknown
  MultiPolygon: new (options: Record<string, unknown>) => TencentLayer
  ImageTileLayer: {
    createCustomLayer: (options: Record<string, unknown>) => Promise<TencentLayer | null>
  }
}

export type TencentMapInstance = {
  setCenter: (center: unknown) => void
  setZoom: (zoom: number) => void
  getCenter?: () => unknown
  destroy?: () => void
  on?: (event: string, handler: (...args: unknown[]) => void) => void
}

export type TencentLayer = {
  setMap?: (map: TencentMapInstance | null) => void
  setGeometries?: (geometries: unknown[]) => void
  setStyles?: (styles: Record<string, unknown>) => void
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  destroy?: () => void
}

/**
 * 校园导览的腾讯地图加载入口。
 *
 * 统一走 `utils/tencent_map_loader`（#1299）：那边已有 15s 超时、失败脚本清理与
 * 并发去重；此处只保留导览侧的 key 默认值与更严格的命名空间类型。
 */
export const loadTencentMap = async (
  key = CAMPUS_GUIDE_CONFIG.qqMapKey
): Promise<TencentMapNamespace> => {
  const shared = (await loadSharedTencentMap(key)) as unknown as SharedTencentMapNamespace
  return shared as unknown as TencentMapNamespace
}

/** 地图加载失败后的重试入口：清掉共享加载器里的失败脚本与 inflight 状态。 */
export const resetCampusGuideMapLoader = (): void => {
  resetTencentMapLoader()
}

export const toLatLng = (TMap: TencentMapNamespace, point: { latitude: number; longitude: number }) =>
  new TMap.LatLng(Number(point.latitude), Number(point.longitude))
