<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BottomSheet } from './ui/bottom-sheet'
import type { BottomSheetSnap } from './ui/bottom-sheet'
import TowerGoMapPanel from './towergo/TowerGoMapPanel.vue'
import TowerGoVehicleList from './towergo/TowerGoVehicleList.vue'
import TowerGoServiceArea from './towergo/TowerGoServiceArea.vue'
import { useTowerGoMap } from './towergo/useTowerGoMap'
import { formatDistance } from '../utils/towergo_map'

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

// 地图实例与数据状态仍在这里编排；容器 DOM 由 TowerGoMapPanel 回传（#1375）
const mapContainerRef = ref<HTMLElement | null>(null)
const {
  currentLocation, selectedVehicle, vehicles, serviceId, serviceInfo, fences,
  mapErrors, mapScriptError, loadingMap, locating, lastScanAt, lastFetchCenter,
  mapScriptState, mapDataReady, routeIsStraight, centerFetchInFlight,
  initMap, retryMap, selectVehicle, startNavigateToSelected, stopNavigateToSelected,
  refreshBySystemLocation, refreshCurrentArea, startRefreshTimer,
  teardownTowerGoRuntime, suppressMapWorkerError, restoreMapWorker
} = useTowerGoMap(mapContainerRef)

// ── UI 状态：抽屉 tab + 三档吸附 + 桌面分栏 ────────────────────────
const activeTab = ref<'map' | 'list' | 'area'>('map')
const sheetSnap = ref<BottomSheetSnap>('peek')
const sheetRef = ref<InstanceType<typeof BottomSheet> | null>(null)
const isDesktopLayout = ref(false)

let layoutMedia: MediaQueryList | null = null
const syncLayoutMedia = () => {
  isDesktopLayout.value = !!layoutMedia?.matches
}

/** 抽屉当前占位高度：移动端用于把 FAB/浮卡抬到抽屉上方；桌面分栏为 0 */
const sheetClearance = computed(() => {
  if (isDesktopLayout.value) return 0
  const exposed = sheetRef.value as { currentHeight?: number } | null
  const height = Number(exposed?.currentHeight)
  return Number.isFinite(height) && height > 0 ? height : 96
})

/** tab 切换联动抽屉档位：地图 tab 收到 peek，其它 tab 抬到 half */
const onTabChange = (tab: typeof activeTab.value) => {
  activeTab.value = tab
  sheetSnap.value = tab === 'map' ? 'peek' : 'half'
}

watch(activeTab, (tab) => {
  if (tab === 'map' && sheetSnap.value === 'full') sheetSnap.value = 'peek'
})

// ── computed ──────────────────────────────────────────────────────
const nearestVehicle = computed(() => vehicles.value[0] || null)

const scanTimeText = computed(() =>
  lastScanAt.value ? new Date(lastScanAt.value).toLocaleTimeString('zh-CN', { hour12: false }) : '--'
)

const serviceName = computed(() => String(serviceInfo.value?.name || '湖工大校区'))

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

const onMapReady = (el: HTMLElement | null) => {
  mapContainerRef.value = el
}

/** 从列表选车后把抽屉收回 peek，露出地图上的路线 */
const onSelectVehicle = (vehicle: Parameters<typeof selectVehicle>[0]) => {
  selectVehicle(vehicle)
  onTabChange('map')
}

// ── lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  layoutMedia = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null
  syncLayoutMedia()
  layoutMedia?.addEventListener?.('change', syncLayoutMedia)
  suppressMapWorkerError()
  await nextTick()
  await initMap()
  await refreshBySystemLocation()
  startRefreshTimer()
})

onBeforeUnmount(() => {
  teardownTowerGoRuntime()
  layoutMedia?.removeEventListener?.('change', syncLayoutMedia)
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
      <button class="tg-icon-btn" :disabled="loadingMap" title="刷新视野" @click="refreshCurrentArea">
        <span class="material-symbols-outlined">refresh</span>
      </button>
    </header>

    <!-- 全屏地图：容器/FAB/浮卡在子组件，fallback 卡片保留在这里（契约要求） -->
    <TowerGoMapPanel
      :locating="locating"
      :show-fab="mapScriptState === 'ready'"
      :selected-vehicle="selectedVehicle"
      :route-is-straight="routeIsStraight"
      :format-distance="formatDistance"
      :sheet-clearance="sheetClearance"
      @map-ready="onMapReady"
      @locate="refreshBySystemLocation"
      @navigate="startNavigateToSelected"
      @close="stopNavigateToSelected"
    >
      <div
        v-if="mapScriptState === 'fallback' || (mapScriptState !== 'ready' && !mapDataReady)"
        class="map-fallback map-fallback--overlay"
      >
        <div class="map-fallback__card">
          <span class="material-symbols-outlined">electric_bike</span>
          <strong>{{ currentLocation.name || '湖北工业大学' }}</strong>
          <p>{{ mapScriptError || mapErrors[0] || '地图加载中，车辆数据会继续刷新。' }}</p>
          <small v-if="currentLocation.latitude">
            定位 {{ currentLocation.latitude.toFixed(5) }}, {{ currentLocation.longitude.toFixed(5) }}
            <template v-if="currentLocation.source"> · {{ currentLocation.source }}</template>
          </small>
          <button
            v-if="mapScriptState === 'fallback'"
            type="button"
            class="map-fallback__retry"
            @click="retryMap"
          >
            重试加载地图
          </button>
        </div>
      </div>
    </TowerGoMapPanel>

    <!-- 底部抽屉：三档吸附，tab 从悬浮分段导航移入抽屉头部 -->
    <BottomSheet ref="sheetRef" v-model="sheetSnap" class="tg-sheet">
      <template #header>
        <nav class="tg-tabs tg-tabs--overlay" @pointerdown.stop>
          <button :class="{ active: activeTab === 'map' }" @click="onTabChange('map')">
            <span class="material-symbols-outlined">map</span>地图
          </button>
          <button :class="{ active: activeTab === 'list' }" @click="onTabChange('list')">
            <span class="material-symbols-outlined">two_wheeler</span>车辆
            <em v-if="vehicles.length">{{ vehicles.length }}</em>
          </button>
          <button :class="{ active: activeTab === 'area' }" @click="onTabChange('area')">
            <span class="material-symbols-outlined">place</span>服务区
          </button>
        </nav>
      </template>

      <!-- 地图 tab：状态摘要，列表内容进抽屉正文 -->
      <section v-show="activeTab === 'map'" class="tg-map-status">
        <article class="tg-area-card">
          <span>地图状态</span>
          <strong>{{ mapSubtitle }}</strong>
          <p>最近刷新 {{ scanTimeText }} · {{ locationSourceText }}</p>
          <p v-if="lastFetchCenter">
            查车中心：{{ Number(lastFetchCenter.latitude).toFixed(5) }},
            {{ Number(lastFetchCenter.longitude).toFixed(5) }}
          </p>
          <div class="tg-status-actions">
            <button type="button" :disabled="locating" @click="refreshBySystemLocation">
              <span class="material-symbols-outlined">my_location</span>
              {{ locating ? '定位中' : '重新定位' }}
            </button>
            <button type="button" :disabled="loadingMap" @click="refreshCurrentArea">
              <span class="material-symbols-outlined">radar</span>
              刷新视野
            </button>
          </div>
        </article>
      </section>

      <TowerGoVehicleList
        v-show="activeTab === 'list'"
        :vehicles="vehicles"
        :selected-id="selectedVehicle?.id || selectedVehicle?.imei || ''"
        :loading="loadingMap || centerFetchInFlight"
        :error-message="mapErrors[0] || ''"
        :total="vehicles.length"
        @select="onSelectVehicle"
      />

      <TowerGoServiceArea
        v-show="activeTab === 'area'"
        :service-name="serviceName"
        :service-id="serviceId"
        :scan-time-text="scanTimeText"
        :current-location="currentLocation"
        :location-source-text="locationSourceText"
        :last-fetch-center="lastFetchCenter"
        :parking-list="parkingList"
        :refreshing="loadingMap || centerFetchInFlight"
      />
    </BottomSheet>
  </div>
</template>

<style src="../styles/views/TowerGoView.scoped.css" scoped></style>
