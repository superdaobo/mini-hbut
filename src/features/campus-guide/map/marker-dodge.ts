import type { CampusSpot, GeoPoint } from '../types'

export type DodgeableSpot = CampusSpot & {
  priority?: number
  marker_type?: string
  point: GeoPoint & { isDodged?: boolean }
}

type PixelBox = {
  x: number
  y: number
  width: number
  height: number
}

type PixelPoint = {
  x: number
  y: number
  name: string
  dodgeType: 1 | 2
  bigType?: boolean
  spot: DodgeableSpot
}

const MARKER_WIDTH = 62
const MARKER_HEIGHT = 35
const LABEL_CHAR_WIDTH = 10
const LABEL_PADDING = 20
const LABEL_HEIGHT = 30

/** Web Mercator 像素坐标（对齐小程序 projection 思路） */
export const latLngToPixel = (point: GeoPoint, zoom: number) => {
  const scale = 256 * 2 ** zoom
  const x = ((point.longitude + 180) / 360) * scale
  const sinLat = Math.sin((point.latitude * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  return { x, y }
}

const markerBox = (pixel: PixelPoint): PixelBox => {
  const width = MARKER_WIDTH
  const height = MARKER_HEIGHT
  return {
    x: pixel.x - width / 2,
    y: pixel.y,
    width,
    height
  }
}

const labelBox = (pixel: PixelPoint): PixelBox => {
  const width = Math.max(pixel.name.length * LABEL_CHAR_WIDTH + LABEL_PADDING, MARKER_WIDTH)
  const height = LABEL_HEIGHT
  return {
    x: pixel.x - width / 2,
    y: pixel.y - height,
    width,
    height
  }
}

const boxesOverlap = (a: PixelBox, b: PixelBox) => {
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  const left = Math.min(a.x, b.x)
  const top = Math.min(a.y, b.y)
  return right - left <= a.width + b.width && bottom - top <= a.height + b.height
}

const resetDodgeFlags = (spots: DodgeableSpot[], selected?: CampusSpot | null) => {
  for (const spot of spots) {
    if (!spot.point) continue
    spot.point.isDodged = false
    spot.priority = String(selected?.spot_id ?? '') === String(spot.spot_id) ? 9999 : spot.priority ?? 0
  }
}

const collideAtZoom = (
  spots: DodgeableSpot[],
  zoom: number,
  dodgeType: 1 | 2,
  selected?: CampusSpot | null
) => {
  resetDodgeFlags(spots, selected)
  const pixels: PixelPoint[] = spots
    .filter((spot) => spot.point && !spot.point.isDodged)
    .map((spot) => {
      const base = latLngToPixel(spot.point!, zoom)
      return {
        ...base,
        name: spot.name,
        dodgeType,
        bigType: Boolean(spot.marker_type),
        spot
      }
    })

  for (let i = 0; i < pixels.length - 1; i++) {
    if (pixels[i].spot.point?.isDodged) continue
    for (let j = i + 1; j < pixels.length; j++) {
      if (pixels[j].spot.point?.isDodged) continue
      const boxA = dodgeType === 1 ? markerBox(pixels[i]) : labelBox(pixels[i])
      const boxB = dodgeType === 1 ? markerBox(pixels[j]) : labelBox(pixels[j])
      if (!boxesOverlap(boxA, boxB)) continue
      const priorityA = pixels[i].spot.priority ?? 0
      const priorityB = pixels[j].spot.priority ?? 0
      if (priorityA >= priorityB) {
        if (pixels[j].spot.point) pixels[j].spot.point.isDodged = true
      } else if (pixels[i].spot.point) {
        pixels[i].spot.point.isDodged = true
      }
    }
  }

  const gate = spots.find((spot) => String(spot.spot_id) === '109180')
  if (gate?.point) gate.point.isDodged = false
}

/** 移植 handleAllPartsDodge：先图标避让，再文字避让 */
export const applyMarkerDodge = (
  spots: CampusSpot[],
  zoom: number,
  selected?: CampusSpot | null
): DodgeableSpot[] => {
  const dodgeable: DodgeableSpot[] = spots.map((spot) => ({
    ...spot,
    point: {
      ...(spot.point || {
        latitude: Number(spot.latitude),
        longitude: Number(spot.longitude)
      }),
      isDodged: false
    },
    priority: String(selected?.spot_id ?? '') === String(spot.spot_id) ? 9999 : 0,
    marker_type: (spot as DodgeableSpot).marker_type
  }))
  collideAtZoom(dodgeable, zoom, 1, selected)
  collideAtZoom(dodgeable, zoom, 2, selected)
  return dodgeable
}

export const visibleDodgedSpots = (spots: DodgeableSpot[]) =>
  spots.filter((spot) => spot.point && !spot.point.isDodged)