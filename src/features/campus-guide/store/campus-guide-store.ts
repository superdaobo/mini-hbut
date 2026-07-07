import { computed, reactive } from 'vue'
import { HBUT_LOCATION } from '../../../utils/towergo_map'
import {
  buildScenicTags,
  normalizeActivities,
  normalizeBusRoads,
  normalizeNotices,
  normalizeScenicInfo,
  normalizeSpot,
  normalizeSpotList,
  normalizeTourRoutes,
  scenicCenter
} from '../api/normalize'
import { campusGuideApi } from '../api/wisdom_client'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import type { CampusGuideNavParams, CampusGuideViewId } from '../navigation'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { loadFavoriteSpotIds, toggleFavoriteSpot } from '../services/favorite-service'
import { getCampusGuideOpenId, setCampusGuideOpenId } from '../services/device-id'
import {
  getSpotsCacheUpdatedAt,
  readSpotsCache,
  touchScenicCacheMeta,
  writeSpotsCache
} from '../services/offline-cache'
import { resolveCampusLocation, resolveInsideScenic } from '../services/location-service'
import type {
  BusRoad,
  CampusActivity,
  CampusSpot,
  GeoPoint,
  ScenicInfo,
  ScenicNotice,
  ScenicTag,
  TourRoute
} from '../types'

const SCENIC_CACHE_KEY = 'campus_guide_scenic_cache_v1'

export type CampusGuideStore = {
  scenic: ScenicInfo | null
  tags: ScenicTag[]
  activeTag: string
  spots: CampusSpot[]
  selectedSpot: CampusSpot | null
  userLocation: GeoPoint
  insideScenic: boolean
  loading: boolean
  spotsLoading: boolean
  mapReady: boolean
  error: string
  offline: boolean
  cacheUpdatedAt: string
  favoriteIds: Set<string>
  tourRoutes: TourRoute[]
  busRoads: BusRoad[]
  activities: CampusActivity[]
  notices: ScenicNotice[]
  hotSearch: string[]
  currentView: CampusGuideViewId
  navParams: CampusGuideNavParams
  mapCenter: GeoPoint
  bootstrap: () => Promise<void>
  refreshLocation: () => Promise<GeoPoint>
  loadSpotsByCategory: (category?: string) => Promise<CampusSpot[]>
  selectTag: (tag: string) => Promise<CampusSpot[]>
  selectSpot: (spot: CampusSpot | null) => Promise<CampusSpot | null>
  navigateTo: (view: CampusGuideViewId, params?: CampusGuideNavParams) => void
  goBack: () => void
  loadHotSearch: () => Promise<string[]>
  searchSpotsByName: (keyword: string) => Promise<CampusSpot[]>
  loadSpotDetail: (spotId: string | number) => Promise<CampusSpot>
  loadActivities: () => Promise<CampusActivity[]>
  loadNotices: () => Promise<ScenicNotice[]>
  loadTourRoutesDetailed: () => Promise<TourRoute[]>
  loadFavorites: () => Promise<Set<string>>
  toggleFavorite: (spot: CampusSpot) => Promise<boolean>
  focusSpotOnHome: (spot: CampusSpot) => Promise<void>
}

let singleton: CampusGuideStore | null = null

const readScenicCache = () => {
  try {
    const raw = localStorage.getItem(SCENIC_CACHE_KEY)
    return raw ? normalizeScenicInfo(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

const writeScenicCache = (scenic: ScenicInfo) => {
  try {
    localStorage.setItem(SCENIC_CACHE_KEY, JSON.stringify(scenic))
  } catch {
    // ignore
  }
}

const createCampusGuideStore = (): CampusGuideStore => {
  const cached = readScenicCache()
  const state = reactive({
    scenic: cached as ScenicInfo | null,
    tags: (Array.isArray(cached?.tags) ? cached!.tags! : []) as ScenicTag[],
    activeTag: Array.isArray(cached?.tags) ? cached!.tags![0]?.tag || '' : '',
    spots: [] as CampusSpot[],
    selectedSpot: null as CampusSpot | null,
    userLocation: { ...HBUT_LOCATION, name: '湖北工业大学' } as GeoPoint,
    insideScenic: true,
    loading: false,
    spotsLoading: false,
    mapReady: false,
    error: '',
    offline: false,
    cacheUpdatedAt: '',
    favoriteIds: new Set<string>(),
    tourRoutes: [] as TourRoute[],
    busRoads: [] as BusRoad[],
    activities: [] as CampusActivity[],
    notices: [] as ScenicNotice[],
    hotSearch: [] as string[],
    currentView: CAMPUS_GUIDE_VIEWS.hub as CampusGuideViewId,
    navParams: {} as CampusGuideNavParams,
    viewStack: [] as CampusGuideViewId[]
  })

  const mapCenter = computed(() => scenicCenter(state.scenic, state.userLocation))

  const applyFavoriteFlags = (list: CampusSpot[]) =>
    list.map((spot) => ({
      ...spot,
      is_saved: state.favoriteIds.has(String(spot.spot_id))
    }))

  const store: CampusGuideStore = {
    get scenic() {
      return state.scenic
    },
    set scenic(value) {
      state.scenic = value
    },
    get tags() {
      return state.tags
    },
    set tags(value) {
      state.tags = value
    },
    get activeTag() {
      return state.activeTag
    },
    set activeTag(value) {
      state.activeTag = value
    },
    get spots() {
      return state.spots
    },
    set spots(value) {
      state.spots = value
    },
    get selectedSpot() {
      return state.selectedSpot
    },
    set selectedSpot(value) {
      state.selectedSpot = value
    },
    get userLocation() {
      return state.userLocation
    },
    set userLocation(value) {
      state.userLocation = value
    },
    get insideScenic() {
      return state.insideScenic
    },
    set insideScenic(value) {
      state.insideScenic = value
    },
    get loading() {
      return state.loading
    },
    set loading(value) {
      state.loading = value
    },
    get spotsLoading() {
      return state.spotsLoading
    },
    set spotsLoading(value) {
      state.spotsLoading = value
    },
    get mapReady() {
      return state.mapReady
    },
    set mapReady(value) {
      state.mapReady = value
    },
    get error() {
      return state.error
    },
    set error(value) {
      state.error = value
    },
    get offline() {
      return state.offline
    },
    set offline(value) {
      state.offline = value
    },
    get cacheUpdatedAt() {
      return state.cacheUpdatedAt
    },
    set cacheUpdatedAt(value) {
      state.cacheUpdatedAt = value
    },
    get favoriteIds() {
      return state.favoriteIds
    },
    set favoriteIds(value) {
      state.favoriteIds = value
    },
    get tourRoutes() {
      return state.tourRoutes
    },
    set tourRoutes(value) {
      state.tourRoutes = value
    },
    get busRoads() {
      return state.busRoads
    },
    set busRoads(value) {
      state.busRoads = value
    },
    get activities() {
      return state.activities
    },
    set activities(value) {
      state.activities = value
    },
    get notices() {
      return state.notices
    },
    set notices(value) {
      state.notices = value
    },
    get hotSearch() {
      return state.hotSearch
    },
    set hotSearch(value) {
      state.hotSearch = value
    },
    get currentView() {
      return state.currentView
    },
    set currentView(value) {
      state.currentView = value
    },
    get navParams() {
      return state.navParams
    },
    set navParams(value) {
      state.navParams = value
    },
    get mapCenter() {
      return mapCenter.value
    },

    navigateTo(view, params = {}) {
      if (state.currentView !== view) state.viewStack.push(state.currentView)
      state.navParams = params
      state.currentView = view
    },

    goBack() {
      const previous = state.viewStack.pop()
      state.currentView = previous || CAMPUS_GUIDE_VIEWS.home
      state.navParams = {}
    },

    async loadScenic() {
      const raw = await campusGuideApi.getScenicInfo({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        field: ['basic', 'ticket_info', 'aoi', 'bus_road_list']
      })
      state.scenic = normalizeScenicInfo(raw)
      const tags = buildScenicTags(raw)
      state.scenic.tags = tags
      state.tags = tags
      writeScenicCache(state.scenic)
      touchScenicCacheMeta(state.scenic)
      state.offline = false
      state.busRoads = normalizeBusRoads(state.scenic.bus_road_list)
      if (!state.activeTag && state.tags[0]?.tag) state.activeTag = state.tags[0].tag
      return state.scenic
    },

    async loadNotices() {
      try {
        const raw = await campusGuideApi.getScenicInfo({
          scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
          field: ['notice']
        })
        state.notices = normalizeNotices((raw as Record<string, unknown>)?.notice)
      } catch {
        state.notices = []
      }
      return state.notices
    },

    async refreshLocation() {
      state.userLocation = await resolveCampusLocation()
      state.insideScenic = resolveInsideScenic(state.userLocation, state.scenic?.aoi || [])
      return state.userLocation
    },

    async loadSpotsByCategory(category = state.activeTag) {
      if (!category) return []
      try {
        const raw = await campusGuideApi.searchSpots({
          scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
          category,
          field: ['basic', 'pic', 'speech', 'park_area'],
          latitude: state.userLocation.latitude,
          longitude: state.userLocation.longitude,
          pn: 1,
          rn: 100
        })
        // 新数组引用，确保地图层能感知分类切换
        state.spots = applyFavoriteFlags(normalizeSpotList(raw)).map((spot) => ({ ...spot }))
        writeSpotsCache(category, state.spots)
        state.cacheUpdatedAt = getSpotsCacheUpdatedAt(category)
        state.offline = false
      } catch (err) {
        const cached = readSpotsCache(category)
        if (cached?.length) {
          state.spots = applyFavoriteFlags(cached)
          state.cacheUpdatedAt = getSpotsCacheUpdatedAt(category)
          state.offline = true
          state.error = 'POI 数据加载失败，已使用离线缓存'
          return state.spots
        }
        throw err
      }
      return state.spots
    },

    async loadHotSearch() {
      try {
        const raw = await campusGuideApi.getHotSearch({ scenic_id: CAMPUS_GUIDE_CONFIG.scenicId })
        const list = Array.isArray((raw as { list?: unknown[] })?.list)
          ? ((raw as { list: unknown[] }).list)
          : Array.isArray(raw)
            ? raw
            : []
        state.hotSearch = list
          .map((item) => String((item as Record<string, unknown>)?.name || item || ''))
          .filter(Boolean)
      } catch {
        state.hotSearch = []
      }
      return state.hotSearch
    },

    async searchSpotsByName(keyword) {
      const raw = await campusGuideApi.searchSpots({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        name: keyword,
        field: ['basic', 'pic', 'speech', 'park_area'],
        latitude: state.userLocation.latitude,
        longitude: state.userLocation.longitude,
        pn: 1,
        rn: 50
      })
      return applyFavoriteFlags(normalizeSpotList(raw))
    },

    async loadSpotDetail(spotId) {
      const raw = await campusGuideApi.getSpotInfo({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        spot_id: spotId,
        open_id: getCampusGuideOpenId(),
        field: ['basic', 'pic', 'speech', 'introduction', 'info']
      })
      const spot = normalizeSpot(raw)
      if (!spot) throw new Error('地点详情加载失败')
      spot.is_saved = state.favoriteIds.has(String(spot.spot_id))
      return spot
    },

    async loadActivities() {
      try {
        const raw = await campusGuideApi.getActivities({ scenic_id: CAMPUS_GUIDE_CONFIG.scenicId })
        state.activities = normalizeActivities(raw)
      } catch {
        state.activities = []
      }
      return state.activities
    },

    async loadTourRoutesDetailed() {
      if (state.tourRoutes.length) return state.tourRoutes
      const raw = await campusGuideApi.getScenicInfo({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        field: ['tour_road_list']
      })
      const info = normalizeScenicInfo(raw)
      const routes = normalizeTourRoutes(info.tour_road_list)
      for (const route of routes) {
        if (!route.spots?.length) continue
        try {
          const spotRaw = await campusGuideApi.getSpotList({
            scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
            spot_id: route.spots,
            field: ['basic', 'speech']
          })
          route.spot_list = normalizeSpotList(spotRaw)
        } catch {
          route.spot_list = []
        }
      }
      state.tourRoutes = routes
      return routes
    },

    async loadFavorites() {
      state.favoriteIds = await loadFavoriteSpotIds()
      state.spots = applyFavoriteFlags(state.spots)
      if (state.selectedSpot) {
        state.selectedSpot = {
          ...state.selectedSpot,
          is_saved: state.favoriteIds.has(String(state.selectedSpot.spot_id))
        }
      }
      return state.favoriteIds
    },

    async bootstrap() {
      state.loading = true
      state.error = ''
      try {
        await store.refreshLocation()
        try {
          const openIdResult = await campusGuideApi.getOpenId({ scenic_id: CAMPUS_GUIDE_CONFIG.scenicId })
          if (openIdResult?.open_id) setCampusGuideOpenId(openIdResult.open_id)
        } catch {
          // deviceId 兜底
        }
        await store.loadFavorites()
        try {
          await store.loadScenic()
        } catch (err) {
          if (!state.scenic) throw err
          state.offline = true
          state.error = '景区数据加载失败，已使用缓存'
        }
        await store.loadNotices()
        if (state.activeTag) {
          state.cacheUpdatedAt = getSpotsCacheUpdatedAt(state.activeTag)
        }
        await store.loadSpotsByCategory()
        await store.loadHotSearch()
      } catch (err) {
        state.error = (err as Error)?.message || '校园导览加载失败'
        throw err
      } finally {
        state.loading = false
      }
    },

    async selectTag(tag) {
      if (!tag || tag === state.activeTag) return state.spots
      state.activeTag = tag
      state.selectedSpot = null
      state.spotsLoading = true
      state.error = ''
      try {
        const spots = await store.loadSpotsByCategory(tag)
        return spots
      } finally {
        state.spotsLoading = false
      }
    },

    async selectSpot(spot) {
      state.selectedSpot = spot
      if (!spot) return null
      try {
        const detail = await store.loadSpotDetail(spot.spot_id)
        state.selectedSpot = detail
        return detail
      } catch {
        return spot
      }
    },

    async toggleFavorite(spot) {
      const next = await toggleFavoriteSpot(spot.spot_id, Boolean(spot.is_saved))
      const id = String(spot.spot_id)
      if (next) state.favoriteIds.add(id)
      else state.favoriteIds.delete(id)
      state.favoriteIds = new Set(state.favoriteIds)
      spot.is_saved = next
      if (state.selectedSpot?.spot_id === spot.spot_id) state.selectedSpot = { ...spot }
      state.spots = applyFavoriteFlags(state.spots)
      return next
    },

    async focusSpotOnHome(spot) {
      state.viewStack = []
      state.currentView = CAMPUS_GUIDE_VIEWS.home
      state.navParams = {}
      await store.selectSpot(spot)
    }
  }

  return store
}

export const useCampusGuideStore = () => {
  if (!singleton) singleton = createCampusGuideStore()
  return singleton
}

export const resetCampusGuideStore = () => {
  singleton = null
}