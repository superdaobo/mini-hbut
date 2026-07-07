import { useGeolocation } from '../../../composables/useGeolocation'
import { HBUT_LOCATION, normalizePoint } from '../../../utils/towergo_map'
import type { GeoPoint } from '../types'
import { isPointInAoi } from '../utils/geo'

const MOCK_LOC_KEY = 'campus_guide_mock_loc'

export const readMockLocation = (): GeoPoint | null => {
  try {
    const raw = localStorage.getItem(MOCK_LOC_KEY)
    if (!raw) return null
    return normalizePoint(JSON.parse(raw))
  } catch {
    return null
  }
}

export const writeMockLocation = (point: GeoPoint | null) => {
  if (!point) {
    localStorage.removeItem(MOCK_LOC_KEY)
    return
  }
  localStorage.setItem(MOCK_LOC_KEY, JSON.stringify(point))
}

export const resolveCampusLocation = async (): Promise<GeoPoint> => {
  const mock = readMockLocation()
  if (mock) return { ...mock, name: mock.name || '模拟定位' }

  const geo = useGeolocation()
  try {
    const position = await geo.getCurrentPosition()
    return {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      name: '当前位置'
    }
  } catch {
    return { ...HBUT_LOCATION, name: HBUT_LOCATION.name || '湖北工业大学' }
  }
}

export const resolveInsideScenic = (point: GeoPoint, aoiRings: GeoPoint[][]) => {
  if (!aoiRings.length) return true
  return isPointInAoi(point, aoiRings)
}