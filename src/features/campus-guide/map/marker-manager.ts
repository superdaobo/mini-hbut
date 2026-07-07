import type { CampusSpot } from '../types'

const MARKER_THEME = '#0074CF'

const markerThemeByType = (markerType?: string, active = false) => {
  if (markerType === 'bus') return active ? '#15803d' : '#16a34a'
  if (markerType === 'activity') return active ? '#c2410c' : '#ea580c'
  return active ? '#005fa8' : MARKER_THEME
}

const markerSvg = (label: string, active = false, markerType?: string) => {
  const fill = markerThemeByType(markerType, active)
  const text = label.slice(0, 2)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
    <path d="M22 0C12.06 0 4 8.06 4 18c0 12.75 18 34 18 34s18-21.25 18-34C40 8.06 31.94 0 22 0z" fill="${fill}"/>
    <circle cx="22" cy="18" r="11" fill="#fff"/>
    <text x="22" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="${fill}" font-family="sans-serif">${text}</text>
  </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const markerSizeByName = (name: string) => {
  const len = String(name || '').length
  if (len <= 4) return 4
  if (len <= 6) return 6
  if (len <= 8) return 8
  if (len <= 10) return 10
  return 12
}

type MarkerStyleFactory = { MarkerStyle: new (opts: Record<string, unknown>) => unknown }

const styleCache = new Map<string, unknown>()

const ensureSpotStyle = (
  TMap: MarkerStyleFactory,
  name: string,
  size: number,
  active: boolean,
  markerType?: string
) => {
  const key = `spot-${size}-${active ? 'a' : 'n'}-${markerType || 'default'}-${name}`
  if (!styleCache.has(key)) {
    styleCache.set(
      key,
      new TMap.MarkerStyle({
        width: active ? 40 : 34,
        height: active ? 46 : 40,
        anchor: { x: active ? 20 : 17, y: active ? 46 : 40 },
        src: markerSvg(name, active, markerType)
      })
    )
  }
  return key
}

export const buildMarkerStyles = (TMap: MarkerStyleFactory) => {
  const styles: Record<string, unknown> = {}
  styles.location = new TMap.MarkerStyle({
    width: 28,
    height: 28,
    anchor: { x: 14, y: 14 },
    src: markerSvg('我', true)
  })
  return styles
}

export const buildSpotMarkerStyles = (
  TMap: MarkerStyleFactory,
  spots: CampusSpot[],
  selectedId?: string | number
) => {
  const styles = buildMarkerStyles(TMap)
  for (const spot of spots) {
    const size = markerSizeByName(spot.name)
    const id = String(spot.spot_id)
    const active = String(selectedId ?? '') === id
    const styleId = ensureSpotStyle(TMap, spot.name, size, active, spot.marker_type)
    styles[styleId] = styleCache.get(styleId)
  }
  return styles
}

export const spotToMarkerGeometry = (
  spot: CampusSpot,
  index: number,
  selectedId?: string | number
) => {
  const point = spot.point || {
    latitude: Number(spot.latitude),
    longitude: Number(spot.longitude)
  }
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null
  const id = String(spot.spot_id || index)
  const size = markerSizeByName(spot.name)
  const active = String(selectedId ?? '') === id
  const styleId = `spot-${size}-${active ? 'a' : 'n'}-${spot.marker_type || 'default'}-${spot.name}`
  return {
    id,
    styleId,
    position: point,
    properties: { title: spot.name }
  }
}