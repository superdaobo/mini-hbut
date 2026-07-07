import { campusGuideApi } from '../api/wisdom_client'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import { getCampusGuideOpenId } from './device-id'

const LOCAL_FAVORITES_KEY = 'campus_guide_favorites'

const readLocalFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LOCAL_FAVORITES_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(list.map(String))
  } catch {
    return new Set()
  }
}

const writeLocalFavorites = (ids: Set<string>) => {
  try {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export const loadFavoriteSpotIds = async () => {
  const local = readLocalFavorites()
  try {
    const raw = await campusGuideApi.getSaveSpotList({
      scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
      open_id: getCampusGuideOpenId(),
      pn: 1,
      rn: 200
    })
    const list = Array.isArray((raw as { list?: unknown[] })?.list)
      ? ((raw as { list: unknown[] }).list)
      : Array.isArray(raw)
        ? raw
        : []
    for (const item of list) {
      const id = String((item as Record<string, unknown>)?.spot_id ?? item ?? '')
      if (id) local.add(id)
    }
    writeLocalFavorites(local)
  } catch {
    // 离线时仅使用本地收藏
  }
  return local
}

export const toggleFavoriteSpot = async (spotId: string | number, saved: boolean) => {
  const id = String(spotId)
  const local = readLocalFavorites()
  if (saved) local.delete(id)
  else local.add(id)
  writeLocalFavorites(local)

  try {
    await campusGuideApi.saveSpot({
      scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
      spot_id: spotId,
      open_id: getCampusGuideOpenId(),
      type: saved ? 0 : 1
    })
  } catch {
    // API 失败时保留本地状态
  }
  return !saved
}