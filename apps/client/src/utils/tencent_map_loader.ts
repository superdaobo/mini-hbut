/** 腾讯地图 GL 脚本加载器（TowerGo / 校园地图共用） */

export const TENCENT_MAP_SCRIPT_ATTR = 'data-tencent-map'

/**
 * 腾讯地图 GL JS 全局命名空间（按实际使用面精确声明，避免推断为 unknown）。
 * 其他成员可经索引签名访问，业务侧按需收窄。
 */
export interface TencentMapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => unknown
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown
  MultiMarker: new (options: Record<string, unknown>) => unknown
  MultiPolyline: new (options: Record<string, unknown>) => unknown
  MultiPolygon: new (options: Record<string, unknown>) => unknown
  MarkerStyle: new (options: Record<string, unknown>) => unknown
  PolylineStyle: new (options: Record<string, unknown>) => unknown
  [key: string]: unknown
}

const getGlobalTMap = (): TencentMapNamespace | null => {
  if (typeof window === 'undefined') return null
  return (window as Window & { TMap?: TencentMapNamespace }).TMap || null
}

/** GL JS 地址：生产 CSP 的 script-src 必须放行 map.qq.com（#1300） */
const TENCENT_MAP_SCRIPT_SRC = (apiKey: string) =>
  `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(apiKey)}`

/**
 * 脚本加载总超时：CSP 拦截 / 网络挂起时 `load`/`error` 都可能不来，
 * 没有兜底会让调用方永久停在 loading（#1300）。
 */
const TENCENT_MAP_LOAD_TIMEOUT_MS = 15000

let inflightLoad: Promise<TencentMapNamespace> | null = null

/**
 * 清除加载状态与已注入的脚本（失败后的「重试」入口用）。
 * 失败的 script 元素留在 DOM 里不会再触发 load/error，必须移除。
 */
export const resetTencentMapLoader = (): void => {
  inflightLoad = null
  if (typeof document === 'undefined') return
  document
    .querySelectorAll<HTMLScriptElement>(`script[${TENCENT_MAP_SCRIPT_ATTR}]`)
    .forEach((el) => el.remove())
}

const waitForScript = (script: HTMLScriptElement): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
      error ? reject(error) : resolve()
    }
    const onLoad = () => finish()
    const onError = () => finish(new Error('腾讯地图脚本加载失败'))
    const timer = window.setTimeout(
      () => finish(new Error('腾讯地图脚本加载超时')),
      TENCENT_MAP_LOAD_TIMEOUT_MS
    )
    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
  })

export async function loadTencentMap(apiKey: string): Promise<TencentMapNamespace> {
  if (typeof window === 'undefined') throw new Error('当前环境无法加载地图')
  const existing = getGlobalTMap()
  if (existing) return existing
  if (inflightLoad) return inflightLoad

  inflightLoad = (async () => {
    // 上一次失败的脚本残留不会再触发事件，先清掉再注入
    document
      .querySelectorAll<HTMLScriptElement>(`script[${TENCENT_MAP_SCRIPT_ATTR}]`)
      .forEach((el) => el.remove())

    const script = document.createElement('script')
    script.setAttribute(TENCENT_MAP_SCRIPT_ATTR, '1')
    script.src = TENCENT_MAP_SCRIPT_SRC(apiKey)
    script.async = true

    const ready = waitForScript(script)
    document.head.appendChild(script)
    try {
      await ready
    } catch (error) {
      script.remove()
      throw error
    }

    const loaded = getGlobalTMap()
    if (!loaded) {
      script.remove()
      throw new Error('腾讯地图脚本已加载但未暴露 TMap')
    }
    return loaded
  })()

  try {
    return await inflightLoad
  } finally {
    inflightLoad = null
  }
}

export const toTencentLatLng = (
  TMap: TencentMapNamespace,
  point: { lat: number; lng: number } | { latitude: number; longitude: number }
) => {
  const lat = 'lat' in point ? point.lat : point.latitude
  const lng = 'lng' in point ? point.lng : point.longitude
  return new (TMap as { LatLng: new (lat: number, lng: number) => unknown }).LatLng(Number(lat), Number(lng))
}
