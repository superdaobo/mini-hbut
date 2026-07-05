import type { CampusBuilding } from '../types'

const normalize = (value: string) => value.trim().toLowerCase()

export const searchCampusBuildings = (
  buildings: CampusBuilding[],
  query: string,
  limit = 20
): CampusBuilding[] => {
  const keyword = normalize(query)
  if (!keyword) return buildings.slice(0, limit)

  const scored = buildings
    .map((building) => {
      const haystacks = [building.name, ...(building.aliases || []), ...(building.tags || [])]
      const normalized = haystacks.map(normalize)
      const exact = normalized.some((item) => item === keyword)
      const starts = normalized.some((item) => item.startsWith(keyword))
      const includes = normalized.some((item) => item.includes(keyword))
      if (!includes) return null
      const score = exact ? 0 : starts ? 1 : 2
      return { building, score }
    })
    .filter(Boolean) as Array<{ building: CampusBuilding; score: number }>

  return scored
    .sort((a, b) => a.score - b.score || a.building.name.localeCompare(b.building.name, 'zh-CN'))
    .slice(0, limit)
    .map((item) => item.building)
}

export const getBuildingCategoryLabel = (category: CampusBuilding['category']) => {
  const labels: Record<CampusBuilding['category'], string> = {
    teaching: '教学楼',
    dormitory: '宿舍',
    library: '图书馆',
    canteen: '食堂',
    sports: '体育',
    admin: '行政',
    gate: '校门',
    other: '其他'
  }
  return labels[category] || '其他'
}
