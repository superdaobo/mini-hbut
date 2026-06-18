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

let refreshTimer: number | null = null

// ── computed ──────────────────────────────────────────────────────
const nearestVehicle = computed(() => vehicles.value[0] || null)

const parkingCount = computed(() => {
  const data = parkingInfo.value || {}
  return Number(data.parkingNum || data.num || data.count || 0)
})

const scanTimeText = computed(() =>
  lastScanAt.value ? new Date(lastScanAt.value).toLocaleTimeString('zh-CN', { hour12: false }) : '--'
)

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
const loadTencentMap = async () => {
  if (typeof window === 'undefined') throw new Error('当前环境无法加载地图')
  if ((window as any).TMap) return (window as any).TMap

  const existing = document.querySelector<HTMLScriptElement>('script[data-towergo-map="1"]')
  if (existing) {
    await new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
    })
    return (window as any).TMap
  }

  mapScriptState.value = 'loading'
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.dataset.towergoMap = '1'
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(TOWERGO_CONFIG.qqMapKey)}`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('腾讯地图脚本加载失败'))
    document.head.appendChild(script)
  })
  return (window as any).TMap
}

const toTMapLatLng = (point: TowerGoPoint) => {
  const TMap = (window as any).TMap
  return new TMap.LatLng(Number(point.latitude), Number(point.longitude))
}

const initMap = async () => {
  const container = mapContainerRef.value
  if (!container || mapInstance.value) return
  if (!container.offsetWidth || !container.offsetHeight) {
    mapScriptState.value = 'fallback'
    return
  }
  try {
    const TMap = await loadTencentMap()
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
  // Show up to 200 vehicles on the map (was 80)
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
  if (!mapInstance.value || !(window as any).TMap || !Array.isArray(fences.value)) return
  const TMap = (window as any).TMap
  const geometries = (fences.value as unknown[])
    .slice(0, 12)
    .map((item, index) => {
      const polygon = Array.isArray(item) ? item : (item as Record<string, unknown>)?.points
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
  const concurrency = Math.min(SCAN_CONCURRENCY, scanPoints.length)
  const worker = async () => {
    while (cursor < scanPoints.length) {
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
      // Throttle progress to every 100ms — wide grids can have hundreds of scan points
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
  loadingMap.value = true
  selectedVehicle.value = null
  mapErrors.value = []
  try {
    const service = await towerGoApi.fence.serviceByLocation(point.latitude, point.longitude)
    const data = (service.data || {}) as Record<string, unknown>
    const sid = validId(data.id || data.serviceId || data.service_id || serviceId.value || towerGoStorage.get('serviceId'))
    if (sid) {
      serviceId.value = sid
      towerGoStorage.set('serviceId', sid)
    }

    const [scanResult, fenceResult, parkingResult] = await Promise.all([
      scanServiceAreaVehicles(point, sid, data),
      towerGoApi.fence.nearFence(point.latitude, point.longitude, { serviceId: sid }),
      towerGoApi.fence.nearParkingNum(point.latitude, point.longitude, { serviceId: sid })
    ])

    vehicles.value = scanResult.ok ? scanResult.vehicles : []
    fences.value = fenceResult.ok ? fenceResult.data : null
    parkingInfo.value = parkingResult.ok ? (parkingResult.data as Record<string, unknown>) : null
    mapErrors.value = [scanResult, fenceResult, parkingResult]
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

// ── lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  await nextTick()
  await initMap()
  await refreshBySystemLocation()
  startRefreshTimer()
})

onBeforeUnmount(() => {
  stopRefreshTimer()
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
        <button class="towergo-header-btn" :disabled="loadingMap" @click="refreshCurrentArea">刷新</button>
      </template>
    </TPageHeader>

    <section class="towergo-hero">
      <div class="hero-copy">
        <span class="hero-kicker">TowerGo · HBUT</span>
        <h2>校园电单车实时位置</h2>
        <p>{{ mapSubtitle }}</p>
      </div>
      <div class="hero-stats">
        <div><strong>{{ vehicles.length }}</strong><span>车辆</span></div>
        <div><strong>{{ parkingCount }}</strong><span>停车点</span></div>
        <div><strong>{{ scanProgress?.total || '--' }}</strong><span>扫描点</span></div>
      </div>
    </section>

    <section class="towergo-map-panel">
      <div ref="mapContainerRef" class="towergo-map">
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
    </section>

    <section class="dashboard-grid">
      <article class="metric-card">
        <span>当前位置</span>
        <strong>{{ currentLocation.name || '当前位置' }}</strong>
        <p>{{ Number(currentLocation.latitude).toFixed(5) }}, {{ Number(currentLocation.longitude).toFixed(5) }}</p>
      </article>
      <article class="metric-card">
        <span>服务区</span>
        <strong>{{ serviceId || '--' }}</strong>
        <p>最近刷新 {{ scanTimeText }}</p>
      </article>
    </section>

    <section class="towergo-card vehicle-card">
      <div class="card-head">
        <div>
          <h3>附近车辆</h3>
          <p>{{ loadingMap ? '正在扫描服务区车辆' : `共 ${vehicles.length} 辆，按距离排序` }}</p>
        </div>
        <span v-if="scanProgress" class="progress-chip">{{ scanProgress.done }}/{{ scanProgress.total }}</span>
      </div>
      <div v-if="loadingMap && !vehicles.length" class="empty-row">正在获取车辆、服务区和停车点数据...</div>
      <div v-else-if="!loadingMap && !vehicles.length" class="empty-row">{{ mapErrors[0] || '暂无可展示车辆，当前服务区暂无车辆。' }}</div>
      <div v-else class="vehicle-scroll-list">
        <button
          v-for="vehicle in vehicles.slice(0, 50)"
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
        </button>
        <p v-if="vehicles.length > 50" class="truncation-hint">（仅显示最近的 50 辆，地图上可见全部 {{ vehicles.length }} 辆）</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.towergo-view {
  min-height: 100%;
  padding: 14px 14px calc(24px + var(--app-safe-bottom, 0px));
  color: var(--ui-text, #0f172a);
}

.towergo-header-btn,
.map-toolbar button {
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  background: var(--ui-surface, rgba(255, 255, 255, 0.88));
  color: var(--ui-text, #0f172a);
  border-radius: 8px;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
}

.towergo-header-btn:hover,
.map-toolbar button:hover {
  border-color: var(--ui-primary, #2563eb);
}

.towergo-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: stretch;
  margin: 14px 0;
  padding: 18px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-primary, #2563eb) 18%, transparent), transparent 52%),
    var(--ui-surface, rgba(255, 255, 255, 0.88));
  box-shadow: var(--ui-shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.12));
}

.hero-kicker {
  display: inline-flex;
  color: var(--ui-primary, #2563eb);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
}

.hero-copy h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
}

.hero-copy p {
  margin: 8px 0 0;
  color: var(--ui-muted, #475569);
  line-height: 1.5;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(72px, 1fr));
  gap: 8px;
}

.hero-stats div,
.metric-card,
.towergo-card {
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface, #fff) 86%, transparent);
}

.hero-stats div {
  display: grid;
  place-items: center;
  padding: 10px;
}

.hero-stats strong,
.metric-card strong {
  font-size: 22px;
  line-height: 1.1;
}

.hero-stats span,
.metric-card span,
.metric-card p,
.card-head p,
.vehicle-main small {
  color: var(--ui-muted, #475569);
}

.towergo-map-panel {
  overflow: hidden;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 8px;
  background: var(--ui-surface, rgba(255, 255, 255, 0.88));
  box-shadow: var(--ui-shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.12));
}

.towergo-map {
  position: relative;
  width: 100%;
  height: clamp(320px, 48vh, 560px);
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
  min-width: 0;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.metric-card,
.towergo-card {
  padding: 14px;
}

.vehicle-card {
  margin-top: 12px;
}

.metric-card {
  display: grid;
  gap: 5px;
}

.metric-card p {
  margin: 0;
  font-size: 13px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-head h3 {
  margin: 0;
  font-size: 17px;
}

.card-head p {
  margin: 4px 0 0;
  font-size: 13px;
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

.vehicle-scroll-list {
  max-height: 480px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.vehicle-row {
  width: 100%;
  min-width: 0;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--ui-surface, #fff) 74%, transparent);
  color: var(--ui-text, #0f172a);
  border-radius: 8px;
  padding: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
  margin-top: 8px;
}

.vehicle-row.active,
.vehicle-row:hover {
  border-color: var(--ui-primary, #2563eb);
  background: var(--ui-primary-soft, rgba(37, 99, 235, 0.12));
}

.vehicle-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
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

.empty-row {
  border: 1px dashed var(--ui-surface-border, rgba(148, 163, 184, 0.26));
  border-radius: 8px;
  padding: 16px;
  color: var(--ui-muted, #475569);
  line-height: 1.5;
}

.truncation-hint {
  margin: 10px 0 4px;
  color: var(--ui-muted, #475569);
  font-size: 12px;
  text-align: center;
}

button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .towergo-hero,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .hero-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .towergo-map {
    height: 420px;
  }
}

@media (max-width: 560px) {
  .towergo-view {
    padding: 10px 10px calc(18px + var(--app-safe-bottom, 0px));
  }

  .towergo-hero {
    padding: 14px;
  }

  .hero-copy h2 {
    font-size: 21px;
  }

  .map-toolbar {
    grid-template-columns: 1fr;
  }

  .towergo-map {
    height: 360px;
  }

  .vehicle-row {
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>
