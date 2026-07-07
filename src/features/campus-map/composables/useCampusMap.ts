import { onBeforeUnmount, ref } from 'vue'
import { HBUT_LOCATION, resolveTowerGoLocation } from '../../../utils/towergo_map'
import { CAMPUS_LOCATION_DRIFT_THRESHOLD_METERS } from '../constants'
import { fetchCampusMapDataset } from '../data/campus_map_repository'
import { searchCampusBuildings } from '../data/search'
import { CampusMapController } from '../map/campus_map_controller'
import {
  fetchWalkingRoute,
  formatWalkingDistance,
  formatWalkingDuration
} from '../services/walking_route_service'
import type { CampusBuilding, CampusMapBundle, MapLatLng, WalkingRouteResult } from '../types'

export const useCampusMap = () => {
  const loading = ref(true)
  const mapReady = ref(false)
  const errorText = ref('')
  const degradedText = ref('')
  const bundle = ref<CampusMapBundle | null>(null)
  const searchQuery = ref('')
  const searchResults = ref<CampusBuilding[]>([])
  const selectedBuilding = ref<CampusBuilding | null>(null)
  const userLocation = ref<MapLatLng>({ lat: HBUT_LOCATION.latitude, lng: HBUT_LOCATION.longitude })
  const routeLoading = ref(false)
  const routeError = ref('')
  const routeResult = ref<WalkingRouteResult | null>(null)

  const controller = new CampusMapController()
  let routeAbort: AbortController | null = null

  const applySearch = () => {
    const buildings = bundle.value?.buildings || []
    searchResults.value = searchCampusBuildings(buildings, searchQuery.value)
  }

  const loadDataset = async (forceRefresh = false) => {
    loading.value = true
    errorText.value = ''
    try {
      const data = await fetchCampusMapDataset({ forceRefresh })
      bundle.value = data
      degradedText.value = data.degradedReason || (data.offline ? '当前使用离线/缓存数据' : '')
      controller.setBuildings(data.buildings)
      applySearch()
    } catch (error) {
      errorText.value = (error as Error)?.message || '校园地图加载失败'
    } finally {
      loading.value = false
    }
  }

  const initMap = async (container: HTMLElement | null) => {
    if (!container || !bundle.value) return
    try {
      await controller.init(container, bundle.value.config)
      controller.setBuildings(bundle.value.buildings)
      controller.setMarkerClickHandler((building) => selectBuilding(building))
      controller.setUserLocation(userLocation.value)
      mapReady.value = true
    } catch (error) {
      errorText.value = (error as Error)?.message || '地图初始化失败'
      mapReady.value = false
    }
  }

  const destroyMap = () => {
    controller.destroy()
    mapReady.value = false
  }

  const refreshLocation = async () => {
    const resolved = await resolveTowerGoLocation({
      fallback: HBUT_LOCATION,
      maxDriftMeters: CAMPUS_LOCATION_DRIFT_THRESHOLD_METERS
    })
    userLocation.value = { lat: resolved.latitude, lng: resolved.longitude }
    controller.setUserLocation(userLocation.value)
  }

  const selectBuilding = (building: CampusBuilding) => {
    selectedBuilding.value = building
    controller.focusBuilding(building)
    routeResult.value = null
    routeError.value = ''
    controller.clearRoute()
  }

  const clearSelection = () => {
    selectedBuilding.value = null
    routeResult.value = null
    routeError.value = ''
    controller.clearRoute()
  }

  const planWalkingRoute = async () => {
    if (!selectedBuilding.value) return
    routeAbort?.abort()
    routeAbort = new AbortController()
    routeLoading.value = true
    routeError.value = ''
    try {
      const result = await fetchWalkingRoute(userLocation.value, {
        lat: selectedBuilding.value.lat,
        lng: selectedBuilding.value.lng
      }, { signal: routeAbort.signal })
      routeResult.value = result
      controller.setRoutePolyline(result.polyline)
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
      routeError.value = (error as Error)?.message || '步行路线规划失败'
      controller.clearRoute()
    } finally {
      routeLoading.value = false
    }
  }

  onBeforeUnmount(() => {
    routeAbort?.abort()
    destroyMap()
  })

  return {
    loading,
    mapReady,
    errorText,
    degradedText,
    bundle,
    searchQuery,
    searchResults,
    selectedBuilding,
    userLocation,
    routeLoading,
    routeError,
    routeResult,
    loadDataset,
    initMap,
    destroyMap,
    refreshLocation,
    applySearch,
    selectBuilding,
    clearSelection,
    planWalkingRoute,
    formatWalkingDistance,
    formatWalkingDuration
  }
}
