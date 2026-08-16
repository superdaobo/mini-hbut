import { describe, expect, it } from 'vitest'
import { applyMarkerDodge, latLngToPixel, visibleDodgedSpots } from './marker-dodge'
import type { CampusSpot } from '../types'

const spot = (id: number, lat: number, lng: number, name: string): CampusSpot => ({
  spot_id: id,
  name,
  latitude: lat,
  longitude: lng,
  point: { latitude: lat, longitude: lng }
})

describe('marker dodge', () => {
  it('converts lat/lng to increasing pixel coordinates', () => {
    const a = latLngToPixel({ latitude: 30.48, longitude: 114.4 }, 16)
    const b = latLngToPixel({ latitude: 30.49, longitude: 114.41 }, 16)
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).not.toBe(a.y)
  })

  it('hides lower-priority overlapping markers but keeps selected visible', () => {
    const baseLat = 30.4788
    const baseLng = 114.3992
    const list = [
      spot(1, baseLat, baseLng, '地点A'),
      spot(2, baseLat + 0.00001, baseLng + 0.00001, '地点B'),
      spot(3, baseLat + 0.00002, baseLng + 0.00002, '地点C')
    ]
    const selected = list[1]
    const dodged = applyMarkerDodge(list, 16, selected)
    const visible = visibleDodgedSpots(dodged)
    expect(visible.some((item) => String(item.spot_id) === String(selected.spot_id))).toBe(true)
    expect(visible.length).toBeLessThan(list.length)
  })

  it('never dodges gate spot 109180', () => {
    const list = [
      spot(109180, 30.4788, 114.3992, '南门'),
      spot(2, 30.47881, 114.39921, '地点B')
    ]
    const dodged = applyMarkerDodge(list, 16, list[1])
    const gate = dodged.find((item) => String(item.spot_id) === '109180')
    expect(gate?.point?.isDodged).toBe(false)
  })
})