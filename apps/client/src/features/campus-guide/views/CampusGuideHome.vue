<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TPageHeader } from '../../../components/templates'
import { showToast } from '../../../utils/toast'
import EntranceMenu from '../components/EntranceMenu.vue'
import NoticeBar from '../components/NoticeBar.vue'
import PoiCard from '../components/PoiCard.vue'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import { CampusMapCore } from '../map/campus-map-core'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { playCampusSpeech } from '../services/audio-service'
import { getLastLocationMeta } from '../services/location-service'
import { resolveNavEndPoint } from '../services/navigation-service'
import { useCampusGuideStore } from '../store/campus-guide-store'
import type { CampusSpot } from '../types'

const emit = defineEmits(['back'])

const mapContainerRef = ref<HTMLElement | null>(null)
const mapCore = ref<CampusMapCore | null>(null)
const locating = ref(false)
const showEntrance = ref(false)
const activePoi = ref<CampusSpot | null>(null)
const store = useCampusGuideStore()

const topNotice = computed(() => store.notices[0] || null)
const guideTags = computed(() => store.tags)

const setActivePoi = (spot: CampusSpot | null) => {
  activePoi.value = spot
  store.selectedSpot = spot
}

const handleMarkerClick = (spot: CampusSpot) => {
  setActivePoi(spot)
  mapCore.value?.renderSpots(store.spots, spot.spot_id)
  mapCore.value?.setCenter(
    spot.point || { latitude: Number(spot.latitude), longitude: Number(spot.longitude) },
    CAMPUS_GUIDE_CONFIG.defaultZoom
  )
  void store.selectSpot(spot).then((detail) => {
    if (detail) activePoi.value = detail
  })
}

const fitSpotsOnMap = () => {
  if (!mapCore.value || !store.spots.length) return
  const points = store.spots
    .map((spot) => spot.point || { latitude: Number(spot.latitude), longitude: Number(spot.longitude) })
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  if (points.length) mapCore.value.fitPoints(points)
}

const refreshMapMarkers = async (selectedId?: string | number) => {
  await nextTick()
  if (!mapCore.value) return
  const activeId = selectedId ?? activePoi.value?.spot_id ?? store.selectedSpot?.spot_id
  mapCore.value.renderSpots([...store.spots], activeId)
  mapCore.value.renderLocation(store.userLocation)
}

const syncMapData = () => {
  void refreshMapMarkers()
}

const initMap = async () => {
  await nextTick()
  const container = mapContainerRef.value
  if (!container || mapCore.value) return
  const core = new CampusMapCore(container, {
    center: store.mapCenter,
    aoiRings: store.scenic?.aoi || [],
    selectedSpotId: activePoi.value?.spot_id,
    onMarkerClick: handleMarkerClick,
    onZoomChange: () => syncMapData()
  })
  await core.init()
  mapCore.value = core
  await refreshMapMarkers()
  store.mapReady = true
  fitSpotsOnMap()
  requestAnimationFrame(() => mapCore.value?.resize())
}

const handleLocate = async () => {
  if (locating.value) return
  locating.value = true
  try {
    const point = await store.refreshLocation()
    mapCore.value?.setCenter(point, CAMPUS_GUIDE_CONFIG.defaultZoom)
    mapCore.value?.renderLocation(point)
    const meta = getLastLocationMeta()
    if (meta.source === 'policy') {
      showToast('当前版本使用默认校区位置', 'warning', 2200)
    } else if (meta.source === 'fallback') {
      showToast(meta.error || '定位失败，已使用校区中心', 'warning', 2400)
    } else if (meta.source === 'mock') {
      showToast('已使用模拟定位', 'success', 1600)
    } else {
      showToast(store.insideScenic ? '已定位到校园内' : '已定位，当前在校外', 'success', 1800)
    }
  } catch (err) {
    showToast((err as Error)?.message || '定位失败', 'error', 2200)
  } finally {
    locating.value = false
  }
}

const handleTagClick = async (tag: string) => {
  if (tag === store.activeTag || store.spotsLoading) return
  try {
    setActivePoi(null)
    const spots = await store.selectTag(tag)
    await refreshMapMarkers()
    // 分类切换后强制重建 marker 层，避免 setStyles 残留导致有数无点
    mapCore.value?.refreshMarkers(true)
    fitSpotsOnMap()
    window.setTimeout(() => {
      mapCore.value?.resize()
      mapCore.value?.refreshMarkers(true)
    }, 280)
    if (!spots.length) {
      showToast('该分类下暂时没有点位', 'warning', 1800)
    } else if ((mapCore.value?.getLastPaintedMarkerCount() ?? 0) === 0) {
      showToast('点位数据缺少有效坐标，地图无法标注', 'warning', 2200)
    }
  } catch (err) {
    showToast((err as Error)?.message || '加载分类失败', 'error', 2200)
  }
}

const closePoiCard = () => {
  setActivePoi(null)
  void store.selectSpot(null)
  mapCore.value?.renderSpots(store.spots)
}

const startNavigation = () => {
  const spot = activePoi.value
  const endPoint = resolveNavEndPoint(spot)
  if (!spot || !endPoint) {
    showToast('该点位缺少坐标，无法导航', 'warning', 1800)
    return
  }
  store.navigateTo(CAMPUS_GUIDE_VIEWS.walkline, {
    spot,
    endPoint
  })
}

const handleFavorite = async () => {
  if (!activePoi.value) return
  await store.toggleFavorite(activePoi.value)
  activePoi.value = store.selectedSpot
  showToast(activePoi.value?.is_saved ? '已收藏' : '已取消收藏', 'success', 1500)
}

const handleAudio = async () => {
  if (!activePoi.value) return
  const ok = await playCampusSpeech(
    activePoi.value.speech,
    activePoi.value.introduction || activePoi.value.info
  )
  if (!ok) showToast('暂无语音讲解', 'warning', 1800)
}

onMounted(async () => {
  try {
    if (!store.mapReady) await store.bootstrap()
    activePoi.value = store.selectedSpot
    await initMap()
    // 地图 ready 后再刷一次，避免首帧 container 尺寸为 0 导致点位丢失
    window.setTimeout(() => {
      mapCore.value?.resize()
      void refreshMapMarkers()
      if (!store.spots.length && !store.loading && !store.spotsLoading) {
        showToast('当前分类暂无点位，可切换分类或检查网络', 'warning', 2200)
      }
    }, 320)
  } catch {
    // error 已写入
  }
})

watch(
  () => [store.activeTag, store.spots.map((s) => s.spot_id).join(',')],
  () => {
    void refreshMapMarkers()
  }
)

watch(
  () => store.userLocation,
  () => mapCore.value?.renderLocation(store.userLocation),
  { deep: true }
)

watch(
  () => store.selectedSpot,
  (spot) => {
    if (spot?.spot_id !== activePoi.value?.spot_id) {
      activePoi.value = spot
    }
    if (!mapCore.value) return
    mapCore.value.renderSpots(store.spots, spot?.spot_id)
  }
)

onActivated(() => {
  activePoi.value = store.selectedSpot
  syncMapData()
  if (store.selectedSpot) {
    mapCore.value?.setCenter(
      store.selectedSpot.point || {
        latitude: Number(store.selectedSpot.latitude),
        longitude: Number(store.selectedSpot.longitude)
      },
      CAMPUS_GUIDE_CONFIG.defaultZoom
    )
  }
})

onBeforeUnmount(() => {
  mapCore.value?.destroy()
  mapCore.value = null
  store.mapReady = false
})
</script>

<template>
  <div class="campus-guide-root campus-guide-root--immersive">
    <TPageHeader title="校园导览" icon="map" @back="emit('back')" />

    <div v-if="store.offline" class="campus-guide-status">离线模式 · 缓存更新于 {{ store.cacheUpdatedAt || '未知' }}</div>
    <div v-if="store.error" class="campus-guide-status is-error">{{ store.error }}</div>
    <div v-else-if="store.loading && !store.mapReady" class="campus-guide-status">正在加载校园地图与 POI 数据…</div>

    <div class="campus-guide-map-stage">
      <div class="campus-guide-map-shell campus-guide-map-shell--immersive">
        <div ref="mapContainerRef" class="campus-guide-map-canvas" />
      </div>

      <div class="campus-guide-map-controls">
        <div class="campus-guide-top-panel">
          <button class="campus-guide-search" type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.search)">
            搜索教学楼、食堂、场馆…
          </button>
          <NoticeBar
            v-if="topNotice"
            :notice="topNotice"
            @open="store.navigateTo(CAMPUS_GUIDE_VIEWS.noticeDetail, { noticeId: topNotice.id })"
          />
          <div v-if="guideTags.length" class="campus-guide-tabs">
            <button
              v-for="item in guideTags"
              :key="item.tag"
              type="button"
              :class="{ active: item.tag === store.activeTag }"
              :disabled="store.spotsLoading"
              @click="handleTagClick(item.tag)"
            >
              {{ item.name || item.tag }}
            </button>
          </div>
          <p v-if="store.spotsLoading" class="campus-guide-muted campus-guide-tab-status">正在切换分类…</p>
          <p v-else-if="store.activeTag && !store.spots.length" class="campus-guide-muted campus-guide-tab-status">
            当前分类暂无点位
          </p>
          <p v-else-if="store.activeTag" class="campus-guide-muted campus-guide-tab-status">
            共 {{ store.spots.length }} 个点位
          </p>
        </div>

        <div class="campus-guide-fab-group">
          <button class="campus-guide-fab" type="button" title="菜单" @click="showEntrance = !showEntrance">☰</button>
          <button class="campus-guide-fab" :disabled="locating" title="定位" @click="handleLocate">
            {{ locating ? '…' : '◎' }}
          </button>
        </div>

        <EntranceMenu
          v-if="showEntrance"
          class="campus-guide-entrance-floating"
          @about="store.navigateTo(CAMPUS_GUIDE_VIEWS.about); showEntrance = false"
          @route="store.navigateTo(CAMPUS_GUIDE_VIEWS.route); showEntrance = false"
          @collect="store.navigateTo(CAMPUS_GUIDE_VIEWS.collect); showEntrance = false"
          @activity="store.navigateTo(CAMPUS_GUIDE_VIEWS.activity); showEntrance = false"
          @bus="store.navigateTo(CAMPUS_GUIDE_VIEWS.bus); showEntrance = false"
          @mock="store.navigateTo(CAMPUS_GUIDE_VIEWS.mockLocation); showEntrance = false"
          @settings="store.navigateTo(CAMPUS_GUIDE_VIEWS.settings); showEntrance = false"
        />

        <div v-if="activePoi" class="campus-guide-poi-layer">
          <PoiCard
            :spot="activePoi"
            :user-location="store.userLocation"
            @close="closePoiCard"
            @detail="store.navigateTo(CAMPUS_GUIDE_VIEWS.poi, { spot: activePoi!, spotId: activePoi!.spot_id })"
            @navigate="startNavigation"
            @favorite="handleFavorite"
            @audio="handleAudio"
          />
        </div>
      </div>
    </div>
  </div>
</template>