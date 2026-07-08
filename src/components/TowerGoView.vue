<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { towerGoApi, towerGoStorage, TOWERGO_CONFIG } from '../utils/towergo_api'
import {
  HBUT_LOCATION,
  SCAN_CONCURRENCY,
  SCAN_GRID_SPACING_METERS,
  SCAN_REQUEST_DELAY_MS,
  createServiceAreaScanPoints,
  dedupeVehicles,
  formatDistance,
  normalizePoint,
  normalizeVehicles,
  resolveTowerGoLocation,
  type TowerGoPoint,
  type TowerGoVehicle
} from '../utils/towergo_map'
import { loadTencentMap, toTencentLatLng } from '../utils/tencent_map_loader'
import TPageHeader from './templates/TPageHeader.vue'

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
const scanProgress = ref<{ done: number; total: number; unique: number } | null>(null)
const loadingMap = ref(false)
const locating = ref(false)
const lastScanAt = ref(0)
const mapScriptState = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle')
const mapInstance = ref<any>(null)
const centerMarkerLayer = ref<any>(null)
const vehicleMarkerLayer = ref<any>(null)
const fencePolygonLayer = ref<any>(null)
const mapDataReady = ref(false)

// UI 状态：分区 / 排序 / 电量筛选
const activeTab = ref<'map' | 'list' | 'area'>('map')
const sortBy = ref<'distance' | 'battery'>('distance')
const filterMinBattery = ref(0)

let refreshTimer: number | null = null
let mapErrorHandler: ((e: ErrorEvent) => void) | null = null
let activeScanToken = 0

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

const mapSubtitle = computed(() => {
  if (loadingMap.value && scanProgress.value) {
    return `全区扫描 ${scanProgress.value.done}/${scanProgress.value.total}，已发现 ${scanProgress.value.unique} 辆`
  }
  if (nearestVehicle.value)
    return `最近车辆 ${nearestVehicle.value.id || nearestVehicle.value.imei}，${formatDistance(nearestVehicle.value.distance)}`
  return mapErrors.value[0] || '正在连接小塔出行真实接口'
})

const validId = (value: unknown) => String(value ?? '').trim()

// ── 腾讯地图 ──────────────────────────────────────────────────────
const toTMapLatLng = (point: TowerGoPoint) => {
  const TMap = (window as any).TMap
  return toTencentLatLng(TMap, { latitude: point.latitude, longitude: point.longitude })
}

const initMap = async () => {
  const container = mapContainerRef.value
  if (!container || mapInstance.value) return
  if (!container.offsetWidth || !container.offsetHeight) {
    mapScriptState.value = 'fallback'
    return
  }
  try {
    mapScriptState.value = 'loading'
    const TMap = await loadTencentMap(TOWERGO_CONFIG.qqMapKey)
    const center = toTMapLatLng(currentLocation.value)
    mapInstance.value = new TMap.Map(container, { center, zoom: 16, viewMode: '2D' })
    centerMarkerLayer.value = new TMap.MultiMarker({
      map: mapInstance.value,
      geometries: [{ id: 'center', position: center, properties: { title: currentLocation.value.name || '当前位置' } }]
    })
    mapScriptState.value = 'ready'
  } catch (error) {
    mapScriptState.value = 'fallback'
    mapErrors.value = [(error as Error)?.message || '地图加载失败']
  }
}

const updateMapCenter = (point: TowerGoPoint) => {
  currentLocation.value = point
  if (!mapInstance.value || !(window as any).TMap) return
  const center = toTMapLatLng(point)
  mapInstance.value.setCenter(center)
  centerMarkerLayer.value?.setGeometries?.([{ id: 'center', position: center, properties: { title: point.name || '当前位置' } }])
}

const renderVehicleMarkers = () => {
  if (!mapInstance.value || !(window as any).TMap) return
  const TMap = (window as any).TMap
  // 地图上最多展示 200 个车辆标记
  const geometries = vehicles.value.slice(0, 200).map((vehicle, index) => ({
    id: vehicle.id || vehicle.imei || `vehicle-${index}`,
    position: new TMap.LatLng(vehicle.latitude, vehicle.longitude),
    properties: { title: vehicle.id || vehicle.imei || '车辆' }
  }))
  if (!vehicleMarkerLayer.value) {
    vehicleMarkerLayer.value = new TMap.MultiMarker({ map: mapInstance.value, geometries })
    vehicleMarkerLayer.value.on?.('click', (event: any) => {
      const id = event?.geometry?.id
      const item = vehicles.value.find((vehicle) => vehicle.id === id || vehicle.imei === id)
      if (item) selectVehicle(item)
    })
    return
  }
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
}

// ── 车辆扫描 ──────────────────────────────────────────────────────
const scanNearbyVehicles = async (point: TowerGoPoint, sid: string) => {
  const result = await towerGoApi.rent.getNearBike(point.latitude, point.longitude, { serviceId: sid })
  return {
    ok: result.ok,
    msg: result.msg,
    vehicles: result.ok ? normalizeVehicles(result.data, currentLocation.value) : []
  }
}

const scanServiceAreaVehicles = async (point: TowerGoPoint, sid: string, serviceData: unknown) => {
  const scanPoints = createServiceAreaScanPoints({
    serviceData,
    origin: point,
    spacingMeters: SCAN_GRID_SPACING_METERS
  })
  const allVehicles: TowerGoVehicle[] = []
  const errors: string[] = []
  let done = 0
  let cursor = 0
  scanProgress.value = { done: 0, total: scanPoints.length, unique: 0 }

  let lastProgressUpdate = 0
  const token = activeScanToken
  const concurrency = Math.min(SCAN_CONCURRENCY, scanPoints.length)
  const worker = async () => {
    while (cursor < scanPoints.length) {
      if (!mapContainerRef.value || token !== activeScanToken) return
      const scanPoint = scanPoints[cursor++]
      try {
        const scanned = await scanNearbyVehicles(scanPoint, sid)
        if (scanned.ok) {
          allVehicles.splice(0, allVehicles.length, ...dedupeVehicles([...allVehicles, ...scanned.vehicles], point))
        } else if (scanned.msg) {
          errors.push(scanned.msg)
        }
      } catch (error) {
        errors.push((error as Error)?.message || '扫描失败')
      }
      done += 1
      const now = Date.now()
      if (now - lastProgressUpdate >= 100 || done === scanPoints.length) {
        scanProgress.value = { done, total: scanPoints.length, unique: allVehicles.length }
        lastProgressUpdate = now
      }
      if (SCAN_REQUEST_DELAY_MS) await new Promise((resolve) => window.setTimeout(resolve, SCAN_REQUEST_DELAY_MS))
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return {
    ok: errors.length < scanPoints.length,
    msg: errors[0] || '成功',
    scanPoints,
    errors,
    vehicles: allVehicles
  }
}

const loadMapData = async (point: TowerGoPoint = currentLocation.value) => {
  if (loadingMap.value) return
  activeScanToken += 1
  loadingMap.value = true
  selectedVehicle.value = null
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

    // 第二步：并行扫描车辆 / 取围栏 / 取停车点数（nearParkingNum 免登可能未授权，降级不阻塞）
    const [scanResult, fenceResult, parkingResult] = await Promise.all([
      scanServiceAreaVehicles(point, sid, data),
      towerGoApi.fence.nearFence(point.latitude, point.longitude, { serviceId: sid }),
      towerGoApi.fence.nearParkingNum(point.latitude, point.longitude, { serviceId: sid })
    ])

    vehicles.value = scanResult.ok ? scanResult.vehicles : []
    fences.value = fenceResult.ok ? fenceResult.data : null
    parkingInfo.value = parkingResult.ok ? (parkingResult.data as Record<string, unknown>) : null
    mapErrors.value = [scanResult, fenceResult]
      .filter((item) => !item.ok)
      .map((item) => item.msg)
    lastScanAt.value = Date.now()
    mapDataReady.value = true
    renderVehicleMarkers()
    renderFenceLayers()
  } catch (error) {
    vehicles.value = []
    mapErrors.value = [(error as Error)?.message || '地图数据加载失败']
  } finally {
    scanProgress.value = null
    loadingMap.value = false
  }
}

const refreshBySystemLocation = async () => {
  locating.value = true
  try {
    const point = await resolveTowerGoLocation()
    updateMapCenter(point)
    await loadMapData(point)
  } finally {
    locating.value = false
  }
}

const refreshCurrentArea = async () => {
  await loadMapData(currentLocation.value)
}

// ── 定时刷新 ──────────────────────────────────────────────────────
const startRefreshTimer = () => {
  stopRefreshTimer()
  refreshTimer = window.setInterval(() => {
    if (!loadingMap.value) void refreshCurrentArea()
  }, 120000)
}

const stopRefreshTimer = () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
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
  stopRefreshTimer()
  if (mapErrorHandler) window.removeEventListener('error', mapErrorHandler, true)
  restoreMapWorker()
  vehicleMarkerLayer.value?.setMap?.(null)
  centerMarkerLayer.value?.setMap?.(null)
  fencePolygonLayer.value?.setMap?.(null)
  mapInstance.value?.destroy?.()
})
</script>

<template>
  <div class="towergo-view module-page">
    <TPageHeader icon="electric_bike" title="小塔出行" @back="emit('back')">
      <template #actions>
        <button class="tg-icon-btn" :disabled="loadingMap" title="刷新当前区域" @click="refreshCurrentArea">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <!-- 概览条 -->
    <section class="tg-overview">
      <div class="tg-overview-main">
        <strong>{{ serviceName }}</strong>
        <p>{{ mapSubtitle }}</p>
      </div>
      <div class="tg-overview-stats">
        <div><strong>{{ vehicles.length }}</strong><span>车辆</span></div>
        <div><strong>{{ parkingCount }}</strong><span>停车点</span></div>
        <div><strong>{{ scanProgress?.total || '--' }}</strong><span>扫描点</span></div>
      </div>
    </section>

    <!-- 分段切换 -->
    <nav class="tg-tabs">
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

    <!-- 地图 -->
    <section v-show="activeTab === 'map'" class="tg-map-panel">
      <div ref="mapContainerRef" class="tg-map">
        <div v-if="mapScriptState === 'fallback' || !mapDataReady" class="map-fallback">
          <span class="material-symbols-outlined">electric_bike</span>
          <strong>{{ currentLocation.name || '湖北工业大学' }}</strong>
          <p>{{ mapErrors[0] || '地图加载中，车辆数据会继续刷新。' }}</p>
        </div>
      </div>
      <div class="map-toolbar">
        <button :disabled="locating || loadingMap" @click="refreshBySystemLocation">
          <span class="material-symbols-outlined">my_location</span>
          {{ locating ? '定位中' : '系统定位' }}
        </button>
        <button :disabled="loadingMap" @click="refreshCurrentArea">
          <span class="material-symbols-outlined">radar</span>
          全区扫描
        </button>
      </div>
      <!-- 选中车辆浮卡 -->
      <div v-if="selectedVehicle" class="tg-vehicle-pop">
        <span class="vehicle-icon material-symbols-outlined">electric_bike</span>
        <div class="pop-main">
          <strong>NO.{{ selectedVehicle.id || selectedVehicle.imei || '--' }}</strong>
          <small>{{ formatDistance(selectedVehicle.distance) }} · 电量 {{ selectedVehicle.battery || '--' }}%</small>
        </div>
        <button class="pop-close" @click="selectedVehicle = null"><span class="material-symbols-outlined">close</span></button>
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
      <div v-if="loadingMap && !vehicles.length" class="empty-row">正在扫描服务区车辆...</div>
      <div v-else-if="!loadingMap && !sortedVehicles.length" class="empty-row">{{ mapErrors[0] || '暂无可展示车辆。' }}</div>
      <div v-else class="vehicle-scroll-list">
        <button
          v-for="vehicle in sortedVehicles.slice(0, 50)"
          :key="vehicle.id || vehicle.imei"
          class="vehicle-row"
          :class="{ active: selectedVehicle?.id === vehicle.id }"
          @click="selectVehicle(vehicle)"
        >
          <span class="vehicle-icon material-symbols-outlined">electric_bike</span>
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
        <p>定位：{{ Number(currentLocation.latitude).toFixed(5) }}, {{ Number(currentLocation.longitude).toFixed(5) }}（{{ currentLocation.source === 'system' ? '系统定位' : '校区兜底' }}）</p>
      </article>
      <article class="tg-area-card">
        <div class="card-head">
          <h3>停车点（{{ parkingList.length }}）</h3>
          <span v-if="scanProgress" class="progress-chip">{{ scanProgress.done }}/{{ scanProgress.total }}</span>
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

.map-fallback .material-symbols-outlined {
  font-size: 52px;
  color: var(--ui-primary, #2563eb);
}

.map-fallback p {
  margin: 0;
  color: var(--ui-muted, #475569);
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
