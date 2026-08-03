// 测试 fixture：home_search 模块类型声明（与 home_search.js 导出对齐）
export interface HomeSearchEntry {
  id: string
  label: string
  keywords?: string
  [key: string]: unknown
}

export interface HomeSearchSection {
  id: string
  title: string
  entries: HomeSearchEntry[]
  items: HomeSearchItem[]
  [key: string]: unknown
}

export interface HomeSearchItem {
  type: string
  id?: string
  title?: string
  target?: string
  subtitle?: string
  [key: string]: unknown
}

export function buildWeeklyCourseSearchEntries(options?: {
  courses?: unknown[]
  currentWeek?: number
  periodTimeMap?: Record<string, unknown>
}): HomeSearchEntry[]

export function buildHomeSearchSections(options?: {
  query?: string
  modules?: unknown[]
  courses?: unknown[]
  notices?: unknown[]
}): HomeSearchSection[]
