import { normalizeSpotList } from '../api/normalize'
import type { CampusSpot, ScenicInfo } from '../types'

/** bump 后缀使旧 spots 缓存整体失效 */
const SPOTS_CACHE_PREFIX = 'campus_guide_spots_v2_'
const META_KEY = 'campus_guide_offline_meta_v2'

export type OfflineMeta = {
  scenicUpdatedAt?: string
  lastCategory?: string
}

export const readSpotsCache = (category: string): CampusSpot[] | null => {
  try {
    const raw = localStorage.getItem(`${SPOTS_CACHE_PREFIX}${category}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { spots?: unknown; updatedAt?: string }
    return normalizeSpotList({ list: parsed.spots })
  } catch {
    return null
  }
}

export const writeSpotsCache = (category: string, spots: CampusSpot[]) => {
  try {
    localStorage.setItem(
      `${SPOTS_CACHE_PREFIX}${category}`,
      JSON.stringify({ spots, updatedAt: new Date().toISOString() })
    )
    const meta = readOfflineMeta()
    meta.lastCategory = category
    writeOfflineMeta(meta)
  } catch {
    // ignore
  }
}

export const readOfflineMeta = (): OfflineMeta => {
  try {
    const raw = localStorage.getItem(META_KEY)
    return raw ? (JSON.parse(raw) as OfflineMeta) : {}
  } catch {
    return {}
  }
}

export const writeOfflineMeta = (meta: OfflineMeta) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // ignore
  }
}

export const touchScenicCacheMeta = (_scenic: ScenicInfo) => {
  const meta = readOfflineMeta()
  meta.scenicUpdatedAt = new Date().toISOString()
  writeOfflineMeta(meta)
}

export const getSpotsCacheUpdatedAt = (category: string) => {
  try {
    const raw = localStorage.getItem(`${SPOTS_CACHE_PREFIX}${category}`)
    if (!raw) return ''
    return String((JSON.parse(raw) as { updatedAt?: string })?.updatedAt || '')
  } catch {
    return ''
  }
}

export const clearCampusGuideOfflineCaches = () => {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(SPOTS_CACHE_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
    localStorage.removeItem(META_KEY)
    localStorage.removeItem('campus_guide_scenic_cache_v1')
  } catch {
    // ignore
  }
}