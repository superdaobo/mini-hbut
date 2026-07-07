import { CAMPUS_GUIDE_CONFIG } from '../config'

export type TencentMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => TencentMapInstance
  LatLng: new (lat: number, lng: number) => unknown
  MultiMarker: new (options: Record<string, unknown>) => TencentLayer
  MultiPolyline: new (options: Record<string, unknown>) => TencentLayer
  MarkerStyle: new (options: Record<string, unknown>) => unknown
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
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  destroy?: () => void
}

const SCRIPT_ATTR = 'data-campus-guide-map'

let loadPromise: Promise<TencentMapNamespace> | null = null

export const loadTencentMap = async (key = CAMPUS_GUIDE_CONFIG.qqMapKey) => {
  if (typeof window === 'undefined') {
    throw new Error('当前环境无法加载地图')
  }

  const globalWindow = window as Window & { TMap?: TencentMapNamespace }
  if (globalWindow.TMap) return globalWindow.TMap
  if (loadPromise) return loadPromise

  loadPromise = new Promise<TencentMapNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}="1"]`)
    const handleReady = () => {
      if (globalWindow.TMap) {
        resolve(globalWindow.TMap)
        return
      }
      reject(new Error('腾讯地图脚本已加载但未暴露 TMap'))
    }

    if (existing) {
      existing.addEventListener('load', handleReady, { once: true })
      existing.addEventListener('error', () => reject(new Error('腾讯地图脚本加载失败')), { once: true })
      if (globalWindow.TMap) handleReady()
      return
    }

    const script = document.createElement('script')
    script.setAttribute(SCRIPT_ATTR, '1')
    script.async = true
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
    script.onload = handleReady
    script.onerror = () => reject(new Error('腾讯地图脚本加载失败'))
    document.head.appendChild(script)
  })

  try {
    return await loadPromise
  } catch (error) {
    loadPromise = null
    throw error
  }
}

export const toLatLng = (TMap: TencentMapNamespace, point: { latitude: number; longitude: number }) =>
  new TMap.LatLng(Number(point.latitude), Number(point.longitude))