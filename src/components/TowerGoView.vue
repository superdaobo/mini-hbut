<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchWalkingRoute } from '../features/campus-map/services/walking_route_service'
import { towerGoApi, towerGoStorage, TOWERGO_CONFIG } from '../utils/towergo_api'
import {
  BATTERY_ICON_TIERS,
  CENTER_FETCH_DEBOUNCE_MS,
  HBUT_LOCATION,
  SCAN_REFRESH_INTERVAL_MS,
  batteryLevelTier,
  formatDistance,
  normalizePoint,
  normalizeVehicles,
  resolveTowerGoLocation,
  type TowerGoPoint,
  type TowerGoVehicle
} from '../utils/towergo_map'
import { pushDebugLog } from '../utils/debug_logger'
import { loadTencentMap, toTencentLatLng } from '../utils/tencent_map_loader'

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

// ── refs ──────────────────────────────────────────────────────────
const mapContainerRef = ref<HTMLElement | null>(null)
const currentLocation = ref<TowerGoPoint>({ ...HBUT_LOCATION })
const selectedVehicle = ref<TowerGoVehicle | null>(null)
const vehicles = ref<TowerGoVehicle[]>([])
const serviceId = ref(String(towerGoStorage.get('serviceId') || ''))
const serviceInfo = ref<Record<string, unknown> | null>(null)
const parkingInfo = ref<Record<string, unknown> | null>(null)
const fences = ref<unknown>(null)
const mapErrors = ref<string[]>([])
const loadingMap = ref(false)
const locating = ref(false)
const lastScanAt = ref(0)
const lastFetchCenter = ref<TowerGoPoint | null>(null)
const mapScriptState = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle')
const mapInstance = ref<any>(null)
const centerMarkerLayer = ref<any>(null)
const vehicleMarkerLayer = ref<any>(null)
const fencePolygonLayer = ref<any>(null)
const mapDataReady = ref(false)
const routeIsStraight = ref(false)

// UI 状态：分区 / 排序 / 电量筛选
const activeTab = ref<'map' | 'list' | 'area'>('map')
const sortBy = ref<'distance' | 'battery'>('distance')
const filterMinBattery = ref(0)

let refreshTimer: number | null = null
let mapErrorHandler: ((e: ErrorEvent) => void) | null = null
let activeScanToken = 0
/** region 拖动/缩放结束后的中心拉车防抖 */
let regionFetchTimer: number | null = null
const centerFetchInFlight = ref(false)

// ── computed ──────────────────────────────────────────────────────
const nearestVehicle = computed(() => vehicles.value[0] || null)

const parkingCount = computed(() => {
  const data = parkingInfo.value || {}
  const fromParking = Number(data.parkingNum || data.num || data.count || 0)
  if (fromParking) return fromParking
  // nearParkingNum 免登可能未授权，降级从 nearFence 的 parkings 列表推算停车点数量
  const fenceData = fences.value as { parkings?: unknown[] } | null
  return fenceData?.parkings?.length || 0
})

const scanTimeText = computed(() =>
  lastScanAt.value ? new Date(lastScanAt.value).toLocaleTimeString('zh-CN', { hour12: false }) : '--'
)

const serviceName = computed(() => String(serviceInfo.value?.name || '湖工大校区'))

const sortedVehicles = computed(() => {
  const list = [...vehicles.value]
  const filtered = filterMinBattery.value > 0
    ? list.filter((v) => Number(v.battery) >= filterMinBattery.value)
    : list
  return filtered.sort((a, b) =>
    sortBy.value === 'battery'
      ? Number(b.battery) - Number(a.battery)
      : Number(a.distance) - Number(b.distance)
  )
})

const parkingList = computed(() => {
  const fenceData = fences.value as { parkings?: Array<Record<string, unknown>> } | null
  return fenceData?.parkings || []
})

const locationSourceText = computed(() => {
  if (currentLocation.value.source === 'system') return '系统定位'
  if (currentLocation.value.source === 'fallback') return '校区兜底'
  return '地图中心'
})

const mapSubtitle = computed(() => {
  if (locating.value) return '正在定位…'
  if (loadingMap.value || centerFetchInFlight.value) return '正在加载附近车辆…'
  if (nearestVehicle.value) {
    return `附近 ${vehicles.value.length} 辆 · 最近 ${formatDistance(nearestVehicle.value.distance)} · ${locationSourceText.value}`
  }
  if (currentLocation.value.source === 'fallback' && mapErrors.value[0]) {
    return `${mapErrors.value[0]}（查车中心：校区兜底）`
  }
  return mapErrors.value[0] || `附近暂无车辆 · ${locationSourceText.value}`
})

const handleBack = (event?: Event) => {
  event?.preventDefault?.()
  event?.stopPropagation?.()
  emit('back')
}

/** 读取当前地图中心（对齐小程序 getCenterLocation） */
const readMapCenter = (): TowerGoPoint | null => {
  const map = mapInstance.value
  if (!map?.getCenter) return null
  try {
    const center = map.getCenter()
    const latitude = Number(center?.getLat?.() ?? center?.lat)
    const longitude = Number(center?.getLng?.() ?? center?.lng)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { name: '地图中心', latitude, longitude }
  } catch {
    return null
  }
}

/**
 * 对齐小程序 regionChange(end)：仅在拖动/缩放结束后按新中心单次拉车。
 * 不监听拖动过程中的连续视野事件，避免连发请求。
 */
const bindMapRegionChange = () => {
  const map = mapInstance.value
  if (!map?.on) return
  const schedule = () => {
    if (regionFetchTimer) window.clearTimeout(regionFetchTimer)
    regionFetchTimer = window.setTimeout(() => {
      regionFetchTimer = null
      void refreshVehiclesAtMapCenter()
    }, CENTER_FETCH_DEBOUNCE_MS)
  }
  for (const eventName of ['dragend', 'zoomend', 'idle']) {
    try {
      map.on(eventName, schedule)
    } catch {
      // 事件名因 SDK 版本可能不可用
    }
  }
}

const validId = (value: unknown) => String(value ?? '').trim()

// ── 腾讯地图 ──────────────────────────────────────────────────────
const toTMapLatLng = (point: TowerGoPoint) => {
  const TMap = (window as any).TMap
  return toTencentLatLng(TMap, { latitude: point.latitude, longitude: point.longitude })
}

/** 用户蓝点 / 车辆 pin：iOS WKWebView 对 charset=UTF-8 的 SVG data URL 常不渲染，改用 base64 */
const svgToDataUrl = (svg: string) => {
  try {
    const encoded =
      typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(svg)))
        : ''
    if (encoded) return `data:image/svg+xml;base64,${encoded}`
  } catch {
    // fall through
  }
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const appleUserDotSvg = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="10" fill="#007AFF" stroke="#ffffff" stroke-width="3"/>
    <circle cx="22" cy="22" r="18" fill="none" stroke="#007AFF" stroke-opacity="0.28" stroke-width="4"/>
  </svg>`
  return svgToDataUrl(svg)
}

/**
 * 官方小程序风格电量档车辆图标：icon_ebike_*_battery{0|10|…|100}
 * 无静态资源时用清晰 SVG 等价实现（电量色条 + 百分比）。
 */
const officialVehiclePinSvg = (tier: number, active = false, hasReward = false) => {
  const body = hasReward ? '#FF9F0A' : active ? '#0A84FF' : '#12B76A'
  const batt =
    tier <= 0 ? '#98A2B3' : tier < 30 ? '#F04438' : tier < 60 ? '#F79009' : '#12B76A'
  const label = String(Math.max(0, Math.min(100, tier)))
  const w = active ? 51 : 36
  const h = active ? 71 : 51
  const pinTop = active ? 46 : 34
  const cx = w / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="M${cx} 2C${cx - 12.5} 2 ${cx - 20} 9.8 ${cx - 20} 19.5c0 12.8 20 31 20 31s20-18.2 20-31C${cx + 20} 9.8 ${cx + 12.5} 2 ${cx} 2z" fill="${body}" stroke="#fff" stroke-width="1.6"/>
    <circle cx="${cx}" cy="18" r="10.5" fill="#fff"/>
    <path d="M${cx - 7} 20h14l-1.4-4.8a3.2 3.2 0 0 0-3.1-2.4h-4.4a3.2 3.2 0 0 0-3.1 2.4L${cx - 7} 20zm1.7 1.6h10.6v2.4a1.3 1.3 0 0 1-1.3 1.3h-8a1.3 1.3 0 0 1-1.3-1.3v-2.4z" fill="${body}"/>
    <rect x="${cx - 9}" y="${pinTop - 12}" width="18" height="9" rx="2" fill="#fff" stroke="${batt}" stroke-width="1.2"/>
    <rect x="${cx + 9}" y="${pinTop - 9.5}" width="2.2" height="4" rx="0.8" fill="${batt}"/>
    <rect x="${cx - 7.5}" y="${pinTop - 10.2}" width="${Math.max(1.5, (16 * tier) / 100)}" height="5.4" rx="1" fill="${batt}"/>
    <text x="${cx}" y="${pinTop + 2}" text-anchor="middle" font-size="7" font-family="system-ui,sans-serif" font-weight="700" fill="#fff">${label}</text>
  </svg>`
  return svgToDataUrl(svg)
}

const buildTowerGoMarkerStyles = (TMap: any) => {
  const styles: Record<string, unknown> = {}
  const makeStyle =
    typeof TMap?.MarkerStyle === 'function'
      ? (opts: Record<string, unknown>) => new TMap.MarkerStyle(opts)
      : (opts: Record<string, unknown>) => ({ ...opts })
  styles.user = makeStyle({
    width: 40,
    height: 40,
    anchor: { x: 20, y: 20 },
    src: appleUserDotSvg()
  })
  // 电量档 × 选中态，对齐小程序多档 marker
  for (const tier of BATTERY_ICON_TIERS) {
    styles[`vehicle-${tier}`] = makeStyle({
      width: 36,
      height: 51,
      anchor: { x: 18, y: 51 },
      src: officialVehiclePinSvg(tier, false, false)
    })
    styles[`vehicleActive-${tier}`] = makeStyle({
      width: 51,
      height: 71,
      anchor: { x: 25.5, y: 71 },
      src: officialVehiclePinSvg(tier, true, false)
    })
    styles[`vehicleReward-${tier}`] = makeStyle({
      width: 36,
      height: 51,
      anchor: { x: 18, y: 51 },
      src: officialVehiclePinSvg(tier, false, true)
    })
  }
  return styles
}

const vehicleStyleId = (vehicle: TowerGoVehicle, active: boolean) => {
  const tier = batteryLevelTier(vehicle.battery)
  if (active) return `vehicleActive-${tier}`
  if (vehicle.hasReward) return `vehicleReward-${tier}`
  return `vehicle-${tier}`
}

const ensureUserLocationMarker = (point: TowerGoPoint) => {
  if (!mapInstance.value || !(window as any).TMap) return
  const TMap = (window as any).TMap
  const styles = buildTowerGoMarkerStyles(TMap)
  const center = toTMapLatLng(point)
  const geometry = {
    id: 'center',
    styleId: 'user',
    position: center,
    properties: { title: point.name || '当前位置' }
  }
  if (!centerMarkerLayer.value) {
    centerMarkerLayer.value = new TMap.MultiMarker({
      map: mapInstance.value,
      styles,
      geometries: [geometry],
      zIndex: 200
    })
    return
  }
  centerMarkerLayer.value.setStyles?.(styles)
  centerMarkerLayer.value.setGeometries?.([geometry])
}

const initMap = async (retry = 0): Promise<void> => {
  const container = mapContainerRef.value
  if (!container || mapInstance.value) return
  if (!container.offsetWidth || !container.offsetHeight) {
    // iOS 首帧容器常为 0：重试而非直接 fallback
    if (retry < 8) {
      mapScriptState.value = 'loading'
      await new Promise((r) => window.setTimeout(r, 120 + retry * 80))
      return initMap(retry + 1)
    }
    mapScriptState.value = 'fallback'
    mapErrors.value = ['地图容器尺寸为 0，请返回后重试']
    pushDebugLog('TowerGo', '地图初始化失败：容器尺寸为 0', 'error')
    return
  }
  try {
    mapScriptState.value = 'loading'
    const TMap = await loadTencentMap(TOWERGO_CONFIG.qqMapKey)
    const center = toTMapLatLng(currentLocation.value)
    mapInstance.value = new TMap.Map(container, { center, zoom: 16, viewMode: '2D', showControl: false })
    ensureUserLocationMarker(currentLocation.value)
    bindMapRegionChange()
    mapScriptState.value = 'ready'
    pushDebugLog(
      'TowerGo',
      `地图就绪 size=${container.offsetWidth}x${container.offsetHeight}`,
      'info',
      {
        lat: currentLocation.value.latitude,
        lng: currentLocation.value.longitude
      }
    )
    // 地图就绪后按中心单次拉车（不依赖 idle）
    window.setTimeout(() => {
      void refreshVehiclesAtMapCenter()
    }, 600)
  } catch (error) {
    mapScriptState.value = 'fallback'
    mapErrors.value = [(error as Error)?.message || '地图加载失败']
    pushDebugLog('TowerGo', `地图加载失败: ${(error as Error)?.message || error}`, 'error')
  }
}

const updateMapCenter = (point: TowerGoPoint) => {
  currentLocation.value = point
  if (!mapInstance.value || !(window as any).TMap) return
  const center = toTMapLatLng(point)
  mapInstance.value.setCenter(center)
  ensureUserLocationMarker(point)
  pushDebugLog(
    'TowerGo',
    `地图已更新自身位置 lat=${point.latitude.toFixed(6)} lng=${point.longitude.toFixed(6)} source=${point.source || 'unknown'}`,
    'info',
    point
  )
}

const renderVehicleMarkers = () => {
  if (!mapInstance.value || !(window as any).TMap) return
  const TMap = (window as any).TMap
  const styles = buildTowerGoMarkerStyles(TMap)
  const selectedId = selectedVehicle.value?.id || selectedVehicle.value?.imei || ''
  // 接口 lat/lng 直接落点（与小程序一致），最多 200 个
  const geometries = vehicles.value.slice(0, 200).map((vehicle, index) => {
    const id = vehicle.id || vehicle.imei || `vehicle-${index}`
    const active = !!selectedId && (id === selectedId)
    return {
      id,
      styleId: vehicleStyleId(vehicle, active),
      position: new TMap.LatLng(vehicle.latitude, vehicle.longitude),
      properties: {
        title: vehicle.id || vehicle.imei || '车辆',
        battery: vehicle.battery
      }
    }
  })
  if (!vehicleMarkerLayer.value) {
    vehicleMarkerLayer.value = new TMap.MultiMarker({
      map: mapInstance.value,
      styles,
      geometries,
      zIndex: 120
    })
    vehicleMarkerLayer.value.on?.('click', (event: any) => {
      const id = event?.geometry?.id
      const item = vehicles.value.find((vehicle) => vehicle.id === id || vehicle.imei === id)
      if (item) selectVehicle(item)
    })
    // 保证用户蓝点在车辆之上
    ensureUserLocationMarker(currentLocation.value)
    return
  }
  vehicleMarkerLayer.value.setStyles?.(styles)
  vehicleMarkerLayer.value.setGeometries?.(geometries)
}

const renderFenceLayers = () => {
  if (!mapInstance.value || !(window as any).TMap) return
  const TMap = (window as any).TMap
  // nearFence 返回 { serviceAreas, parkings }，停车点含 pointList 多边形
  const fenceData = fences.value
  const list: unknown[] = Array.isArray(fenceData)
    ? fenceData
    : (fenceData && Array.isArray((fenceData as Record<string, unknown>).parkings))
      ? ((fenceData as Record<string, unknown>).parkings as unknown[])
      : []
  if (!list.length) return
  const geometries = (list as Array<Record<string, unknown>>)
    .slice(0, 30)
    .map((item, index) => {
      const polygon = Array.isArray(item) ? item : item.pointList || item.points
      const paths = (Array.isArray(polygon) ? polygon : [])
        .map(normalizePoint)
        .filter(Boolean)
        .map((point) => new TMap.LatLng(point!.latitude, point!.longitude))
      return paths.length >= 3 ? { id: `fence-${index}`, paths } : null
    })
    .filter(Boolean)
  if (!geometries.length) return
  if (!fencePolygonLayer.value) {
    fencePolygonLayer.value = new TMap.MultiPolygon({ map: mapInstance.value, geometries })
    return
  }
  fencePolygonLayer.value.setGeometries?.(geometries)
}

const selectVehicle = (vehicle: TowerGoVehicle) => {
  selectedVehicle.value = vehicle
  if (mapInstance.value && (window as any).TMap) {
    mapInstance.value.setCenter(toTMapLatLng(vehicle))
  }
  void drawRouteToVehicle(vehicle)
}

let locationWatchId: number | null = null
let routeLineLayer: any = null

const clearRouteLine = () => {
  try {
    routeLineLayer?.setMap?.(null)
  } catch {
    // ignore
  }
  routeLineLayer = null
  routeIsStraight.value = false
}

const paintRoutePaths = (paths: unknown[]) => {
  if (!mapInstance.value || !(window as any).TMap || paths.length < 2) return
  const TMap = (window as any).TMap
  clearRouteLine()
  try {
    const style =
      typeof TMap.PolylineStyle === 'function'
        ? new TMap.PolylineStyle({
            color: '#007AFF',
            width: 6,
            borderWidth: 2,
            borderColor: '#ffffff',
            lineCap: 'round'
          })
        : {
            color: '#007AFF',
            width: 6,
            borderWidth: 2,
            borderColor: '#ffffff',
            lineCap: 'round'
          }
    routeLineLayer = new TMap.MultiPolyline({
      map: mapInstance.value,
      styles: { route: style },
      geometries: [{ id: 'to-vehicle', styleId: 'route', paths }]
    })
  } catch {
    // MultiPolyline 不可用时忽略
  }
}

const drawRouteToVehicle = async (vehicle: TowerGoVehicle | null) => {
  if (!vehicle || !mapInstance.value || !(window as any).TMap) {
    clearRouteLine()
    return
  }
  const TMap = (window as any).TMap
  // 路径规划前尽量用最新定位，避免旧起点导致路线偏移
  try {
    const fresh = await resolveTowerGoLocation({ maximumAge: 0, timeoutMs: 8000 })
    if (fresh.source === 'system') {
      currentLocation.value = fresh
      updateMapCenter(fresh)
    }
  } catch {
    // 保留 currentLocation
  }
  const from = toTMapLatLng(currentLocation.value)
  const to = toTMapLatLng(vehicle)
  // 优先步行路网（Tauri 下走 loopback direction 代理），失败再直线示意
  try {
    const walk = await fetchWalkingRoute(
      { lat: currentLocation.value.latitude, lng: currentLocation.value.longitude },
      { lat: vehicle.latitude, lng: vehicle.longitude }
    )
    if (walk.polyline?.length >= 2) {
      const paths = walk.polyline.map((p) => new TMap.LatLng(p.lat, p.lng))
      paintRoutePaths(paths)
      routeIsStraight.value = false
      return
    }
  } catch {
    // fall through to straight line
  }
  paintRoutePaths([from, to])
  routeIsStraight.value = true
}

const startNavigateToSelected = () => {
  if (!selectedVehicle.value) return
  void drawRouteToVehicle(selectedVehicle.value)
  stopLocationWatch()
  if (typeof navigator === 'undefined' || !navigator.geolocation) return
  locationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      currentLocation.value = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        name: '当前位置',
        source: 'system'
      }
      updateMapCenter(currentLocation.value)
      if (selectedVehicle.value) void drawRouteToVehicle(selectedVehicle.value)
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
  )
}

const stopLocationWatch = () => {
  if (locationWatchId != null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId)
  }
  locationWatchId = null
}

const stopNavigateToSelected = () => {
  selectedVehicle.value = null
  stopLocationWatch()
  clearRouteLine()
}

// ── 中心单次拉车（对齐小程序 getNearBike） ─────────────────────────
/** 单次 POST eBikeLocation，参数为地图中心 lat/lng + serviceId */
const fetchNearBikesAtCenter = async (point: TowerGoPoint, sid: string) => {
  const result = await towerGoApi.rent.getNearBike(point.latitude, point.longitude, {
    serviceId: sid
  })
  const list = result.ok
    ? normalizeVehicles(result.data, currentLocation.value)
    : ([] as TowerGoVehicle[])
  pushDebugLog(
    'TowerGo',
    `中心拉车 center=${point.latitude.toFixed(6)},${point.longitude.toFixed(6)} ok=${result.ok} count=${list.length}`,
    result.ok ? 'info' : 'warn',
    {
      center: point,
      serviceId: sid,
      count: list.length,
      sample: list.slice(0, 3).map((v) => ({
        id: v.id || v.imei,
        lat: v.latitude,
        lng: v.longitude,
        battery: v.battery
      })),
      msg: result.msg
    }
  )
  return {
    ok: result.ok,
    msg: result.msg,
    vehicles: list
  }
}

/** region 结束 / 定时刷新：仅按当前地图中心替换车辆列表（不网格合并） */
const refreshVehiclesAtMapCenter = async () => {
  if (loadingMap.value || centerFetchInFlight.value) return
  const sid = validId(serviceId.value)
  if (!sid) return
  const center = readMapCenter() || currentLocation.value
  if (!Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)) return

  centerFetchInFlight.value = true
  activeScanToken += 1
  const token = activeScanToken
  try {
    const result = await fetchNearBikesAtCenter(center, sid)
    if (token !== activeScanToken) return
    lastFetchCenter.value = center
    if (result.ok) {
      vehicles.value = result.vehicles
      lastScanAt.value = Date.now()
      // 选中车若已离开列表则清除
      if (selectedVehicle.value) {
        const key = selectedVehicle.value.id || selectedVehicle.value.imei
        const still = vehicles.value.some((v) => v.id === key || v.imei === key)
        if (!still) {
          selectedVehicle.value = null
          clearRouteLine()
        }
      }
      mapErrors.value = mapErrors.value.filter((m) => !m.includes('车辆'))
      renderVehicleMarkers()
    } else if (result.msg) {
      mapErrors.value = [result.msg]
    }
  } catch (error) {
    if (token !== activeScanToken) return
    mapErrors.value = [(error as Error)?.message || '附近车辆加载失败']
  } finally {
    if (token === activeScanToken) centerFetchInFlight.value = false
  }
}

const loadMapData = async (point: TowerGoPoint = currentLocation.value) => {
  if (loadingMap.value) return
  activeScanToken += 1
  const token = activeScanToken
  loadingMap.value = true
  selectedVehicle.value = null
  clearRouteLine()
  mapErrors.value = []
  try {
    // 第一步：按位置查服务区（免登可用），必须拿到 serviceId 才能继续
    const service = await towerGoApi.fence.serviceByLocation(point.latitude, point.longitude)
    if (!service.ok || !service.data) {
      throw new Error(service.msg || '无法识别当前服务区，请确认定位在湖工大校区内')
    }
    const data = service.data as Record<string, unknown>
    const sid = validId(data.id || data.serviceId || data.service_id)
    if (!sid) throw new Error('服务区数据异常：缺少 serviceId')
    serviceId.value = sid
    serviceInfo.value = data
    towerGoStorage.set('serviceId', sid)

    // 第二步：中心单次拉车 + 围栏/停车点（与小程序一致，禁止网格多点）
    const fetchPoint = readMapCenter() || point
    const [bikeResult, fenceResult, parkingResult] = await Promise.all([
      fetchNearBikesAtCenter(fetchPoint, sid),
      towerGoApi.fence.nearFence(point.latitude, point.longitude, { serviceId: sid }),
      towerGoApi.fence.nearParkingNum(point.latitude, point.longitude, { serviceId: sid })
    ])
    if (token !== activeScanToken) return

    vehicles.value = bikeResult.ok ? bikeResult.vehicles : []
    fences.value = fenceResult.ok ? fenceResult.data : null
    parkingInfo.value = parkingResult.ok ? (parkingResult.data as Record<string, unknown>) : null
    mapErrors.value = [bikeResult, fenceResult]
      .filter((item) => !item.ok)
      .map((item) => item.msg)
    lastScanAt.value = Date.now()
    lastFetchCenter.value = fetchPoint
    mapDataReady.value = true
    pushDebugLog(
      'TowerGo',
      `中心拉车完成 count=${vehicles.value.length} serviceId=${sid}`,
      'info',
      {
        count: vehicles.value.length,
        serviceId: sid,
        center: fetchPoint,
        user: point,
        locationSource: point.source || 'unknown'
      }
    )
    renderVehicleMarkers()
    ensureUserLocationMarker(point)
    renderFenceLayers()
  } catch (error) {
    if (token !== activeScanToken) return
    vehicles.value = []
    mapErrors.value = [(error as Error)?.message || '地图数据加载失败']
    pushDebugLog('TowerGo', `地图数据加载失败: ${(error as Error)?.message || error}`, 'error')
  } finally {
    if (token === activeScanToken) loadingMap.value = false
  }
}

const refreshBySystemLocation = async () => {
  locating.value = true
  try {
    const point = await resolveTowerGoLocation({ maximumAge: 0 })
    updateMapCenter(point)
    if (point.source === 'fallback') {
      mapErrors.value = ['定位不可用或偏移过大，已用校区中心查车']
    }
    await loadMapData(point)
  } finally {
    locating.value = false
  }
}

const refreshCurrentArea = async () => {
  // 手动刷新：当前地图中心单次拉车；若尚无 serviceId 则走完整加载
  if (!validId(serviceId.value)) {
    await loadMapData(readMapCenter() || currentLocation.value)
    return
  }
  await refreshVehiclesAtMapCenter()
}

// ── 定时刷新 ──────────────────────────────────────────────────────
const startRefreshTimer = () => {
  stopRefreshTimer()
  refreshTimer = window.setInterval(() => {
    if (!loadingMap.value && mapContainerRef.value) void refreshCurrentArea()
  }, SCAN_REFRESH_INTERVAL_MS)
}

const stopRefreshTimer = () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
}

/** 离开模块时必须调用：取消拉车、停 timer、销毁地图，避免返回主页仍卡顿。 */
const teardownTowerGoRuntime = () => {
  activeScanToken += 1
  stopRefreshTimer()
  stopLocationWatch()
  clearRouteLine()
  if (regionFetchTimer) {
    window.clearTimeout(regionFetchTimer)
    regionFetchTimer = null
  }
  centerFetchInFlight.value = false
  loadingMap.value = false
  if (mapErrorHandler) {
    window.removeEventListener('error', mapErrorHandler, true)
    mapErrorHandler = null
  }
  try {
    vehicleMarkerLayer.value?.setMap?.(null)
    centerMarkerLayer.value?.setMap?.(null)
    fencePolygonLayer.value?.setMap?.(null)
    vehicleMarkerLayer.value = null
    centerMarkerLayer.value = null
    fencePolygonLayer.value = null
    mapInstance.value?.destroy?.()
  } catch {
    // ignore destroy errors
  }
  mapInstance.value = null
  mapDataReady.value = false
  mapContainerRef.value = null
}

// 抑制腾讯地图 gljs 在 WebView 下瓦片 Worker 的 DataCloneError 控制台噪声（非阻塞功能）
const suppressMapWorkerError = () => {
  mapErrorHandler = (e: ErrorEvent) => {
    // DataCloneError 来自腾讯地图瓦片 Worker 的 postMessage，不影响地图功能
    if (e.message?.includes('could not be cloned')) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }
  window.addEventListener('error', mapErrorHandler, true)
  // Worker 内部的 postMessage 抛出的 DataCloneError 会冒泡为 unhandled，包裹 Worker 原生 postMessage 静默吞掉
  const nativeWorker = window.Worker
  if (nativeWorker) {
    const wrapped: typeof Worker = function (scriptURL: string | URL, options?: WorkerOptions) {
      const worker = new nativeWorker(scriptURL, options)
      const nativePost = worker.postMessage.bind(worker)
      worker.postMessage = ((message: unknown, transfer?: Transferable[]) => {
        try {
          nativePost(message, transfer)
        } catch {
          /* 腾讯地图瓦片 Worker 序列化失败，忽略以避免控制台噪声 */
        }
      }) as typeof worker.postMessage
      return worker
    } as unknown as typeof Worker
    wrapped.prototype = nativeWorker.prototype
    try {
      Object.defineProperty(window, 'Worker', { value: wrapped, configurable: true, writable: true })
    } catch {
      /* 某些环境不可覆盖，忽略 */
    }
  }
}

const restoreMapWorker = () => {
  // Worker 覆盖仅在会话内有效，组件卸载无需还原；保留占位以便未来扩展
}

// ── lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  suppressMapWorkerError()
  await nextTick()
  await initMap()
  await refreshBySystemLocation()
  startRefreshTimer()
})

onBeforeUnmount(() => {
  teardownTowerGoRuntime()
  restoreMapWorker()
})
</script>

<template>
  <div class="towergo-view towergo-view--fullscreen module-page">
    <header class="tg-fs-header" @pointerdown.stop @touchstart.stop>
      <button
        class="tg-icon-btn tg-back-btn"
        type="button"
        aria-label="返回"
        @pointerdown.stop.prevent="handleBack"
        @click.stop.prevent="handleBack"
        @touchend.stop.prevent="handleBack"
      >
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="tg-fs-title">
        <strong>小塔出行</strong>
        <small>{{ mapSubtitle }}</small>
      </div>
      <button class="tg-icon-btn" :disabled="loadingMap" title="刷新当前视野" @click="refreshCurrentArea">
        <span class="material-symbols-outlined">refresh</span>
      </button>
    </header>

    <!-- 分段切换（悬浮） -->
    <nav class="tg-tabs tg-tabs--overlay">
      <button :class="{ active: activeTab === 'map' }" @click="activeTab = 'map'">
        <span class="material-symbols-outlined">map</span>地图
      </button>
      <button :class="{ active: activeTab === 'list' }" @click="activeTab = 'list'">
        <span class="material-symbols-outlined">two_wheeler</span>车辆
        <em v-if="vehicles.length">{{ vehicles.length }}</em>
      </button>
      <button :class="{ active: activeTab === 'area' }" @click="activeTab = 'area'">
        <span class="material-symbols-outlined">place</span>服务区
      </button>
    </nav>

    <!-- 地图全屏 -->
    <section v-show="activeTab === 'map'" class="tg-map-panel tg-map-panel--fs">
      <!-- 地图容器必须独占 DOM，fallback 不可塞进 map 节点内（#370） -->
      <div ref="mapContainerRef" class="tg-map tg-map--fs" />
      <div
        v-if="mapScriptState === 'fallback' || (mapScriptState !== 'ready' && !mapDataReady)"
        class="map-fallback map-fallback--overlay"
      >
        <span class="material-symbols-outlined">electric_bike</span>
        <strong>{{ currentLocation.name || '湖北工业大学' }}</strong>
        <p>{{ mapErrors[0] || '地图加载中，车辆数据会继续刷新。' }}</p>
        <small v-if="currentLocation.latitude">
          定位 {{ currentLocation.latitude.toFixed(5) }}, {{ currentLocation.longitude.toFixed(5) }}
          <template v-if="currentLocation.source"> · {{ currentLocation.source }}</template>
        </small>
      </div>
      <div class="map-toolbar map-toolbar--fs">
        <button :disabled="locating || loadingMap" @click="refreshBySystemLocation">
          <span class="material-symbols-outlined">my_location</span>
          {{ locating ? '定位中' : '定位' }}
        </button>
        <button :disabled="loadingMap" @click="refreshCurrentArea">
          <span class="material-symbols-outlined">radar</span>
          刷新视野
        </button>
      </div>
      <!-- 选中车辆浮卡 + 到车 -->
      <div v-if="selectedVehicle" class="tg-vehicle-pop tg-vehicle-pop--apple">
        <span class="vehicle-icon material-symbols-outlined">electric_bike</span>
        <div class="pop-main">
          <strong>NO.{{ selectedVehicle.id || selectedVehicle.imei || '--' }}</strong>
          <small>
            {{ formatDistance(selectedVehicle.distance) }} · 电量 {{ selectedVehicle.battery || '--' }}%
            <template v-if="routeIsStraight"> · 直线示意</template>
          </small>
        </div>
        <button class="pop-nav" type="button" @click="startNavigateToSelected">到这</button>
        <button class="pop-close" @click="stopNavigateToSelected"><span class="material-symbols-outlined">close</span></button>
      </div>
    </section>

    <!-- 车辆列表 -->
    <section v-show="activeTab === 'list'" class="tg-list-panel">
      <div class="tg-filter-bar">
        <div class="seg">
          <button :class="{ active: sortBy === 'distance' }" @click="sortBy = 'distance'">按距离</button>
          <button :class="{ active: sortBy === 'battery' }" @click="sortBy = 'battery'">按电量</button>
        </div>
        <div class="seg">
          <button :class="{ active: filterMinBattery === 0 }" @click="filterMinBattery = 0">全部</button>
          <button :class="{ active: filterMinBattery === 30 }" @click="filterMinBattery = 30">≥30%</button>
          <button :class="{ active: filterMinBattery === 60 }" @click="filterMinBattery = 60">≥60%</button>
        </div>
      </div>
      <div v-if="(loadingMap || centerFetchInFlight) && !vehicles.length" class="empty-row">正在加载附近车辆…</div>
      <div v-else-if="!loadingMap && !centerFetchInFlight && !sortedVehicles.length" class="empty-row">{{ mapErrors[0] || '暂无可展示车辆。' }}</div>
      <div v-else class="vehicle-scroll-list">
        <button
          v-for="vehicle in sortedVehicles.slice(0, 50)"
          :key="vehicle.id || vehicle.imei"
          class="vehicle-row"
          :class="{ active: selectedVehicle?.id === vehicle.id }"
          @click="selectVehicle(vehicle)"
        >
          <span
            class="vehicle-icon vehicle-icon--batt"
            :data-tier="batteryLevelTier(vehicle.battery)"
            :data-low="Number(vehicle.battery) < 30 ? '1' : '0'"
          >
            <span class="material-symbols-outlined">electric_bike</span>
            <em>{{ batteryLevelTier(vehicle.battery) }}</em>
          </span>
          <span class="vehicle-main">
            <strong>NO.{{ vehicle.id || vehicle.imei || '--' }}</strong>
            <small>{{ formatDistance(vehicle.distance) }} · 电量 {{ vehicle.battery || '--' }}%</small>
          </span>
          <span class="vehicle-batt" :data-low="Number(vehicle.battery) < 30 ? '1' : '0'">{{ vehicle.battery || '--' }}%</span>
        </button>
        <p v-if="sortedVehicles.length > 50" class="truncation-hint">（仅显示前 50 辆，地图上可见全部 {{ vehicles.length }} 辆）</p>
      </div>
    </section>

    <!-- 服务区 -->
    <section v-show="activeTab === 'area'" class="tg-area-panel">
      <article class="tg-area-card">
        <span>当前服务区</span>
        <strong>{{ serviceName }}</strong>
        <p>serviceId：{{ serviceId || '--' }} · 最近刷新 {{ scanTimeText }}</p>
        <p>自身定位：{{ Number(currentLocation.latitude).toFixed(5) }}, {{ Number(currentLocation.longitude).toFixed(5) }}（{{ locationSourceText }}）</p>
        <p v-if="lastFetchCenter">
          最近查车中心：{{ Number(lastFetchCenter.latitude).toFixed(5) }}, {{ Number(lastFetchCenter.longitude).toFixed(5) }}
        </p>
      </article>
      <article class="tg-area-card">
        <div class="card-head">
          <h3>停车点（{{ parkingList.length }}）</h3>
          <span v-if="loadingMap || centerFetchInFlight" class="progress-chip">刷新中</span>
        </div>
        <div v-if="!parkingList.length" class="empty-row">暂无停车点数据</div>
        <ul v-else class="parking-list">
          <li v-for="(p, i) in parkingList" :key="String(p.id || i)">
            <span class="material-symbols-outlined">place</span>
            <div>
              <strong>{{ p.name || '未命名停车点' }}</strong>
              <small>当前 {{ p.carCount ?? '--' }} 辆 · 限停 {{ p.maxParkingNumber ?? '--' }}</small>
            </div>
          </li>
        </ul>
      </article>
    </section>
  </div>
</template>

<style scoped>
.towergo-view {
  min-height: 100%;
  padding: 12px 12px calc(24px + var(--app-safe-bottom, 0px));
  color: var(--ui-text, #0f172a);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.towergo-view--fullscreen {
  position: relative;
  padding: 0;
  gap: 0;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0b1220;
}

.tg-fs-header {
  /* fixed 跳出地图子树 stacking context，避免 GL canvas 吞点击 */
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2147483000;
  isolation: isolate;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(10px + var(--app-safe-top, env(safe-area-inset-top, 0px))) 12px 10px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.72), transparent);
  color: #fff;
  /* 建立独立层，减少与 WebGL 合成层争抢 */
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}

.tg-fs-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.tg-fs-title strong {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.tg-fs-title small {
  font-size: 12px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tg-tabs--overlay {
  position: fixed;
  top: calc(58px + var(--app-safe-top, env(safe-area-inset-top, 0px)));
  left: 50%;
  transform: translateX(-50%) translateZ(0);
  z-index: 2147482900;
  pointer-events: auto;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.18);
}

.tg-map-panel--fs {
  flex: 1;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  border: none;
  border-radius: 0;
  position: relative;
  z-index: 1;
}

.tg-map--fs {
  min-height: 100vh;
  min-height: 100dvh;
  max-height: none;
  border-radius: 0;
  position: relative;
  z-index: 1;
}

.map-toolbar--fs {
  bottom: calc(24px + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)));
  right: 14px;
}

.tg-vehicle-pop--apple {
  left: 12px;
  right: 12px;
  bottom: calc(88px + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)));
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.22);
}

.tg-vehicle-pop .pop-nav {
  border: none;
  border-radius: 12px;
  padding: 8px 12px;
  background: #007aff;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.tg-icon-btn,
.map-toolbar button,
.tg-tabs button,
.seg button {
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  background: var(--ui-surface, rgba(255, 255, 255, 0.88));
  color: var(--ui-text, #0f172a);
  border-radius: 10px;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
}

.tg-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  min-width: 38px;
  padding: 0;
  position: relative;
  z-index: 2147483001;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.tg-back-btn {
  /* 加大命中区域，避免被地图层吞掉点击 */
  width: 48px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92) !important;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.2);
}

.tg-icon-btn:hover,
.map-toolbar button:hover,
.seg button:hover {
  border-color: var(--ui-primary, #2563eb);
}

/* 概览条 */
.tg-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 14px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-primary, #2563eb) 16%, transparent), transparent 52%),
    var(--ui-surface, rgba(255, 255, 255, 0.88));
  box-shadow: var(--ui-shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.1));
}

.tg-overview-main strong {
  font-size: 18px;
  line-height: 1.2;
}

.tg-overview-main p {
  margin: 6px 0 0;
  color: var(--ui-muted, #475569);
  font-size: 13px;
  line-height: 1.5;
}

.tg-overview-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(56px, 1fr));
  gap: 8px;
}

.tg-overview-stats div {
  display: grid;
  place-items: center;
  gap: 2px;
  padding: 8px 6px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 10px;
  background: color-mix(in srgb, var(--ui-surface, #fff) 86%, transparent);
}

.tg-overview-stats strong {
  font-size: 20px;
  line-height: 1.1;
}

.tg-overview-stats span {
  color: var(--ui-muted, #475569);
  font-size: 11px;
}

/* 分段切换 */
.tg-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.tg-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 12px;
}

.tg-tabs button .material-symbols-outlined {
  font-size: 20px;
}

.tg-tabs button em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--ui-primary-soft, rgba(37, 99, 235, 0.14));
  color: var(--ui-primary, #2563eb);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tg-tabs button.active {
  border-color: var(--ui-primary, #2563eb);
  background: var(--ui-primary, #2563eb);
  color: #fff;
}

.tg-tabs button.active em {
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
}

/* 地图 */
.tg-map-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 14px;
  background: var(--ui-surface, rgba(255, 255, 255, 0.88));
  box-shadow: var(--ui-shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.1));
}

.tg-map {
  position: relative;
  width: 100%;
  height: clamp(300px, 46vh, 540px);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--ui-primary, #2563eb) 12%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--ui-primary, #2563eb) 12%, transparent) 1px, transparent 1px),
    color-mix(in srgb, var(--ui-surface, #fff) 72%, var(--ui-primary, #2563eb) 8%);
  background-size: 42px 42px;
}

.map-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 8px;
  text-align: center;
  padding: 24px;
}

.map-fallback--overlay {
  z-index: 8;
  pointer-events: none;
  background: color-mix(in srgb, var(--ui-surface, #f8fafc) 72%, transparent);
  backdrop-filter: blur(2px);
}

.map-fallback .material-symbols-outlined {
  font-size: 52px;
  color: var(--ui-primary, #2563eb);
}

.map-fallback p,
.map-fallback small {
  margin: 0;
  color: var(--ui-muted, #475569);
}

.map-fallback small {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.map-toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
}

.map-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.map-toolbar button .material-symbols-outlined {
  font-size: 20px;
}

/* 选中车辆浮卡 */
.tg-vehicle-pop {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 70px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 12px;
  background: var(--ui-surface, #fff);
  box-shadow: var(--ui-shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.16));
}

.tg-vehicle-pop .pop-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.tg-vehicle-pop .pop-main strong,
.tg-vehicle-pop .pop-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tg-vehicle-pop .pop-main small {
  color: var(--ui-muted, #475569);
  font-size: 12px;
}

.pop-close {
  border: none;
  background: transparent;
  color: var(--ui-muted, #475569);
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}

.pop-close:hover {
  background: var(--ui-surface-container-highest, rgba(148, 163, 184, 0.18));
}

/* 车辆列表 */
.tg-list-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tg-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
}

.seg {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-surface, #fff) 86%, transparent);
}

.seg button {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
}

.seg button.active {
  background: var(--ui-primary, #2563eb);
  color: #fff;
}

.vehicle-scroll-list {
  max-height: 480px;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vehicle-row {
  width: 100%;
  min-width: 0;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--ui-surface, #fff) 86%, transparent);
  color: var(--ui-text, #0f172a);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}

.vehicle-row.active,
.vehicle-row:hover {
  border-color: var(--ui-primary, #2563eb);
  background: var(--ui-primary-soft, rgba(37, 99, 235, 0.12));
}

.vehicle-icon--batt {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #ecfdf3;
  color: #12b76a;
  display: grid;
  place-items: center;
}

.vehicle-icon--batt[data-low='1'] {
  background: #fef3f2;
  color: #f04438;
}

.vehicle-icon--batt em {
  position: absolute;
  right: -2px;
  bottom: -2px;
  min-width: 18px;
  padding: 0 3px;
  border-radius: 999px;
  background: #12b76a;
  color: #fff;
  font-size: 9px;
  font-style: normal;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

.vehicle-icon--batt[data-low='1'] em {
  background: #f04438;
}

.vehicle-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-primary, #2563eb);
  color: #fff;
}

.vehicle-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.vehicle-main strong,
.vehicle-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vehicle-main small {
  color: var(--ui-muted, #475569);
  font-size: 12px;
}

.vehicle-batt {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-primary, #2563eb);
}

.vehicle-batt[data-low='1'] {
  color: #ef4444;
}

.empty-row {
  border: 1px dashed var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 12px;
  padding: 16px;
  color: var(--ui-muted, #475569);
  line-height: 1.5;
  text-align: center;
}

.truncation-hint {
  margin: 4px 0;
  color: var(--ui-muted, #475569);
  font-size: 12px;
  text-align: center;
}

/* 服务区 */
.tg-area-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tg-area-card {
  padding: 14px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 14px;
  background: color-mix(in srgb, var(--ui-surface, #fff) 86%, transparent);
  box-shadow: var(--ui-shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.08));
  display: grid;
  gap: 6px;
}

.tg-area-card span {
  color: var(--ui-muted, #475569);
  font-size: 12px;
}

.tg-area-card strong {
  font-size: 18px;
}

.tg-area-card p {
  margin: 0;
  color: var(--ui-muted, #475569);
  font-size: 12px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-head h3 {
  margin: 0;
  font-size: 16px;
}

.progress-chip {
  flex: none;
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--ui-primary-soft, rgba(37, 99, 235, 0.12));
  color: var(--ui-primary, #2563eb);
  font-size: 12px;
  font-weight: 700;
}

.parking-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.parking-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.22));
  border-radius: 10px;
}

.parking-list .material-symbols-outlined {
  color: var(--ui-primary, #2563eb);
}

.parking-list strong {
  display: block;
  font-size: 14px;
}

.parking-list small {
  color: var(--ui-muted, #475569);
  font-size: 12px;
}

button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .tg-overview {
    grid-template-columns: 1fr;
  }

  .tg-overview-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .towergo-view {
    padding: 10px 10px calc(18px + var(--app-safe-bottom, 0px));
  }

  .tg-overview-main strong {
    font-size: 16px;
  }

  .tg-map {
    height: 360px;
  }

  .tg-filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
