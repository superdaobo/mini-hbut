<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { TPageHeader } from '../../../components/templates'
import { showToast } from '../../../utils/toast'
import { CampusMapCore } from '../map/campus-map-core'
import {
  fetchCampusWalkRoute,
  formatWalkDuration,
  openExternalMapNavigation
} from '../services/navigation-service'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const mapContainerRef = ref<HTMLElement | null>(null)
const mapCore = ref<CampusMapCore | null>(null)
const routeText = ref('')
const loadingRoute = ref(true)
const routeReady = ref(false)

const endPoint = computed(() => store.navParams.endPoint || store.navParams.spot?.point)
const endName = computed(() => store.navParams.spot?.name || '目的地')

const openExternalNav = async () => {
  const end = endPoint.value
  if (!end) return
  const ok = await openExternalMapNavigation(end, endName.value)
  if (!ok) showToast('无法打开外部地图', 'error', 2200)
}

const init = async () => {
  await nextTick()
  const container = mapContainerRef.value
  const end = endPoint.value
  if (!container || !end) {
    routeText.value = '缺少目的地坐标'
    loadingRoute.value = false
    return
  }

  const core = new CampusMapCore(container, {
    center: store.userLocation,
    aoiRings: store.scenic?.aoi || []
  })
  await core.init()
  core.renderLocation(store.userLocation)
  mapCore.value = core
  requestAnimationFrame(() => mapCore.value?.resize())

  try {
    const result = await fetchCampusWalkRoute(store.userLocation, end)
    if (result.points.length) {
      core.renderPolylines([result.points])
      core.fitPoints([store.userLocation, ...result.points, end])
      const distanceText =
        typeof result.distance === 'number'
          ? `${Math.round(result.distance)}米`
          : String(result.distance || '')
      routeText.value = `${distanceText} ${formatWalkDuration(result.duration)}`.trim()
      routeReady.value = true
    } else if (store.insideScenic) {
      routeText.value = '未获取到校内步行路线，可尝试外部地图'
    } else {
      routeText.value = '当前在校外，建议使用外部地图导航'
    }
  } catch (err) {
    routeText.value = (err as Error)?.message || '路线规划失败'
    showToast(routeText.value, 'error', 2200)
  } finally {
    loadingRoute.value = false
  }
}

onMounted(() => {
  void init()
})

onBeforeUnmount(() => {
  mapCore.value?.destroy()
  mapCore.value = null
})
</script>

<template>
  <div class="campus-guide-root campus-guide-root--immersive">
    <TPageHeader title="步行导航" icon="route" @back="emit('back')" />

    <div class="campus-guide-status">目的地：{{ endName }}</div>
    <div v-if="loadingRoute" class="campus-guide-status">正在规划路线…</div>
    <div v-else class="campus-guide-status">{{ routeText }}</div>

    <div class="campus-guide-map-shell campus-guide-map-shell--immersive">
      <div ref="mapContainerRef" class="campus-guide-map-canvas" />
    </div>

    <div class="campus-guide-walk-actions">
      <button
        v-if="endPoint"
        type="button"
        class="campus-guide-primary-btn"
        @click="openExternalNav"
      >
        打开外部地图导航
      </button>
      <p v-if="routeReady" class="campus-guide-muted">蓝线为推荐步行路线，可双指放大查看细节。</p>
    </div>
  </div>
</template>