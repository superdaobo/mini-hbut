/** 校园地图（legacy）建筑/用户点 MarkerStyle 构建 — 腾讯 GL 无 style 时 pin 不可见 */

import type { CampusBuilding } from '../types'

type MarkerStyleFactory = {
  MarkerStyle?: new (opts: Record<string, unknown>) => unknown
}

const CATEGORY_COLORS: Record<string, string> = {
  library: '#2563eb',
  teaching: '#0d9488',
  canteen: '#ea580c',
  dorm: '#7c3aed',
  sports: '#16a34a',
  gate: '#b45309',
  service: '#64748b'
}

const pinSvg = (label: string, fill: string) => {
  const text = String(label || '').slice(0, 2)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
    <path d="M20 2C11.7 2 5 8.7 5 17c0 11.2 15 29 15 29s15-17.8 15-29C35 8.7 28.3 2 20 2z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="20" cy="17" r="7" fill="#fff"/>
    <text x="20" y="20" text-anchor="middle" font-size="9" font-weight="700" fill="${fill}" font-family="sans-serif">${text}</text>
  </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const userDotSvg = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="9" fill="#007AFF" stroke="#ffffff" stroke-width="3"/>
    <circle cx="20" cy="20" r="16" fill="none" stroke="#007AFF" stroke-opacity="0.28" stroke-width="4"/>
  </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const campusBuildingStyleId = (building: Pick<CampusBuilding, 'id' | 'category' | 'name'>) =>
  `bldg-${building.category || 'default'}-${building.id}`

export const campusUserLocationStyleId = () => 'user-location'

export const buildCampusBuildingMarkerStyles = (
  TMap: MarkerStyleFactory,
  buildings: Array<Pick<CampusBuilding, 'id' | 'category' | 'name'>>
) => {
  const styles: Record<string, unknown> = {}
  if (typeof TMap.MarkerStyle !== 'function') return styles

  styles[campusUserLocationStyleId()] = new TMap.MarkerStyle({
    width: 32,
    height: 32,
    anchor: { x: 16, y: 16 },
    src: userDotSvg()
  })

  for (const building of buildings || []) {
    const fill = CATEGORY_COLORS[String(building.category || '')] || '#0074CF'
    const styleId = campusBuildingStyleId(building)
    styles[styleId] = new TMap.MarkerStyle({
      width: 34,
      height: 40,
      anchor: { x: 17, y: 40 },
      src: pinSvg(building.name, fill)
    })
  }
  return styles
}
