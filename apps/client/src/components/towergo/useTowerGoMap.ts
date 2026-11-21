import { onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import { fetchWalkingRoute } from '../../features/campus-map/services/walking_route_service'
import { towerGoApi, towerGoStorage, TOWERGO_CONFIG } from '../../utils/towergo_api'
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
} from '../../utils/towergo_map'
import { toGcj } from '../../utils/coordinate'
import { pushDebugLog } from '../../utils/debug_logger'
import { loadTencentMap, resetTencentMapLoader, toTencentLatLng } from '../../utils/tencent_map_loader'

/**
 * 把上游返回的错误字段安全转成字符串。
 *
 * 塔的接口偶尔会把 `msg` 返回成对象（嵌套 msg/message/error），直接塞进 `mapErrors`
 * 会在模板里渲染成 `[object Object]`（拆分后暴露的老问题）。这里统一收口，
 * 保证 `mapErrors` 里永远是可直接展示的字符串。
 */
const toErrorMessage = (raw: unknown, fallback: string): string => {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    for (const key of ['msg', 'message', 'error'] as const) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return fallback
}

/**
 * 小塔出行的「地图实例 + 数据编排」组合函数（#1375 拆分自 TowerGoView.vue）。
 * 状态与逻辑仍归壳组件 TowerGoView 持有，子组件只通过 props/emits 拿数据；
 * 地图 DOM 容器 ref 由 TowerGoMapPanel 提供，经 mapContainerRef 传入。
 */
export const useTowerGoMap = (mapContainerRef: Ref<HTMLElement | null>) => {
  const currentLocation = ref<TowerGoPoint>({ ...HBUT_LOCATION })
  const selectedVehicle = ref<TowerGoVehicle | null>(null)
  const vehicles = ref<TowerGoVehicle[]>([])
  const serviceId = ref(String(towerGoStorage.get('serviceId') || ''))
  const serviceInfo = ref<Record<string, unknown> | null>(null)
  const parkingInfo = ref<Record<string, unknown> | null>(null)
  const fences = ref<unknown>(null)
  const mapErrors = ref<string[]>([])
  /** 地图脚本本身的失败原因（与车辆/围栏数据错误分开，避免被后续刷新覆盖） */
  const mapScriptError = ref('')
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

  let refreshTimer: number | null = null
  let mapErrorHandler: ((e: ErrorEvent) => void) | null = null
  let activeScanToken = 0
  /** region 拖动/缩放结束后的中心拉车防抖 */
  let regionFetchTimer: number | null = null
  const centerFetchInFlight = ref(false)

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

  // ── 腾讯地图 ────────────────────────────────────────────────────
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
      mapScriptError.value = ''
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
      mapScriptError.value = (error as Error)?.message || '地图加载失败'
      mapErrors.value = [mapScriptError.value]
      pushDebugLog('TowerGo', `地图加载失败: ${(error as Error)?.message || error}`, 'error')
    }
  }

  /**
   * 地图脚本失败后的重试入口（#1300）：
   * 清掉失败脚本与模块内 inflight 状态后再走一次 initMap，避免旧 script 残留导致永久 loading。
   */
  const retryMap = async () => {
    if (mapScriptState.value === 'loading') return
    try {
      mapInstance.value?.destroy?.()
    } catch {
      /* ignore destroy errors */
    }
    mapInstance.value = null
    mapScriptState.value = 'idle'
    mapErrors.value = []
    mapScriptError.value = ''
    resetTencentMapLoader()
    await initMap()
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
        // 系统定位是 WGS-84，统一转 GCJ-02 再喂给腾讯图/铁塔接口，否则人/车错位
        const gcj = toGcj(pos.coords.latitude, pos.coords.longitude)
        currentLocation.value = {
          latitude: gcj.latitude,
          longitude: gcj.longitude,
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

  // ── 中心单次拉车（对齐小程序 getNearBike） ──────────────────────
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
        mapErrors.value = [toErrorMessage(result.msg, '车辆数据加载失败')]
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
        .map((item) => toErrorMessage(item.msg, '车辆数据加载失败'))
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
      } else if (point.outOfRange) {
        mapErrors.value = [`当前位置距校区约 ${formatDistance(point.driftMeters)}，可能不在服务区`]
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

  // ── 定时刷新 ────────────────────────────────────────────────────
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
            if (transfer && transfer.length) {
              nativePost(message, transfer)
            } else {
              nativePost(message)
            }
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

  // 兜底：若壳组件自身 onBeforeUnmount 未跑，这里也清理一次（幂等）
  onBeforeUnmount(() => {
    teardownTowerGoRuntime()
    restoreMapWorker()
  })

  return {
    // refs（供壳组件模板/编排使用）
    currentLocation,
    selectedVehicle,
    vehicles,
    serviceId,
    serviceInfo,
    parkingInfo,
    fences,
    mapErrors,
    mapScriptError,
    loadingMap,
    locating,
    lastScanAt,
    lastFetchCenter,
    mapScriptState,
    mapDataReady,
    routeIsStraight,
    centerFetchInFlight,
    // actions
    initMap,
    retryMap,
    selectVehicle,
    startNavigateToSelected,
    stopNavigateToSelected,
    refreshBySystemLocation,
    refreshCurrentArea,
    refreshVehiclesAtMapCenter,
    loadMapData,
    startRefreshTimer,
    teardownTowerGoRuntime,
    suppressMapWorkerError,
    restoreMapWorker
  }
}
