/** 腾讯地图 GL JS 脚本加载器（TowerGo / 校园地图共用） */

export const TENCENT_MAP_SCRIPT_ATTR = 'data-tencent-map'

export type TencentMapNamespace = typeof window extends { TMap: infer T } ? T : unknown

const getGlobalTMap = (): TencentMapNamespace | null => {
  if (typeof window === 'undefined') return null
  return (window as Window & { TMap?: TencentMapNamespace }).TMap || null
}

export async function loadTencentMap(apiKey: string): Promise<TencentMapNamespace> {
  if (typeof window === 'undefined') throw new Error('当前环境无法加载地图')
  const existing = getGlobalTMap()
  if (existing) return existing

  const scriptSelector = `script[${TENCENT_MAP_SCRIPT_ATTR}="1"]`
  const scriptEl = document.querySelector<HTMLScriptElement>(scriptSelector)
  if (scriptEl) {
    await new Promise<void>((resolve, reject) => {
      scriptEl.addEventListener('load', () => resolve(), { once: true })
      scriptEl.addEventListener('error', () => reject(new Error('腾讯地图脚本加载失败')), { once: true })
    })
    const loaded = getGlobalTMap()
    if (!loaded) throw new Error('腾讯地图脚本已加载但未暴露 TMap')
    return loaded
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.setAttribute(TENCENT_MAP_SCRIPT_ATTR, '1')
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(apiKey)}`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('腾讯地图脚本加载失败'))
    document.head.appendChild(script)
  })

  const loaded = getGlobalTMap()
  if (!loaded) throw new Error('腾讯地图脚本已加载但未暴露 TMap')
  return loaded
}

export const toTencentLatLng = (
  TMap: TencentMapNamespace,
  point: { lat: number; lng: number } | { latitude: number; longitude: number }
) => {
  const lat = 'lat' in point ? point.lat : point.latitude
  const lng = 'lng' in point ? point.lng : point.longitude
  return new (TMap as { LatLng: new (lat: number, lng: number) => unknown }).LatLng(Number(lat), Number(lng))
}
