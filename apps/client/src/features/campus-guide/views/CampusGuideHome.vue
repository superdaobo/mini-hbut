<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TPageHeader } from '../../../components/templates'
import { BottomSheet, type BottomSheetSnap } from '../../../components/ui/bottom-sheet'
import { pushDebugLog } from '../../../utils/debug_logger'
import { showToast } from '../../../utils/toast'
import EntranceMenu from '../components/EntranceMenu.vue'
import NoticeBar from '../components/NoticeBar.vue'
import PoiCard from '../components/PoiCard.vue'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import { CampusMapCore } from '../map/campus-map-core'
import { resetCampusGuideMapLoader } from '../map/tencent-map-loader'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { playCampusSpeech } from '../services/audio-service'
import { getLastLocationMeta } from '../services/location-service'
import { resolveNavEndPoint } from '../services/navigation-service'
import { useCampusGuideStore } from '../store/campus-guide-store'
import type { CampusSpot } from '../types'

const emit = defineEmits(['back'])

const mapContainerRef = ref<HTMLElement | null>(null)
const mapCore = ref<CampusMapCore | null>(null)
/** 地图初始化失败原因（与 store.error 分开，便于单独重试，不影响 POI 列表） #1299 */
const mapInitError = ref('')
const locating = ref(false)
const showEntrance = ref(false)
const activePoi = ref<CampusSpot | null>(null)
/** 底部抽屉三档：peek（只露手柄+公告）/ half（半屏列表）/ full（近全屏） #1375 */
const sheetSnap = ref<BottomSheetSnap>('half')
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
  let core: CampusMapCore | null = null
  try {
    core = new CampusMapCore(container, {
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
    mapInitError.value = ''
    fitSpotsOnMap()
    requestAnimationFrame(() => mapCore.value?.resize())
  } catch (error) {
    // 地图失败不能阻塞 POI 列表（列表走 store.error 之外的状态），给可重试的错误条
    try {
      core?.destroy()
    } catch {
      /* ignore destroy errors */
    }
    mapInitError.value = (error as Error)?.message || '地图加载失败，请重试'
    store.mapReady = false
    pushDebugLog(
      'CampusGuide',
      `地图初始化失败: ${(error as Error)?.message || error}`,
      'error'
    )
  }
}

/** 地图脚本/初始化失败后的重试（#1299） */
const retryMap = async () => {
  mapInitError.value = ''
  try {
    mapCore.value?.destroy()
  } catch {
    /* ignore destroy errors */
  }
  mapCore.value = null
  store.mapReady = false
  resetCampusGuideMapLoader()
  await initMap()
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

// #1375：一般错误/离线不再顶部横幅排队，统一走 toast 即时反馈
watch(
  () => store.error,
  (message) => {
    if (message) showToast(message, 'error', 2600)
  }
)

watch(
  () => store.offline,
  (offline) => {
    if (offline) showToast(`离线模式 · 缓存更新于 ${store.cacheUpdatedAt || '未知'}`, 'warning', 2400)
  }
)

// 选中 POI 后把抽屉抬到半屏，让详情卡进入视野
watch(activePoi, (spot) => {
  if (spot) sheetSnap.value = 'half'
})

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
  <div class="campus-guide-root campus-guide-home">
    <TPageHeader title="校园导览" icon="map" @back="emit('back')" />

    <div class="campus-guide-layout">
      <div class="campus-guide-map-stage">
        <div class="campus-guide-map-shell campus-guide-map-shell--immersive">
          <div ref="mapContainerRef" class="campus-guide-map-canvas" />
        </div>

        <div class="campus-guide-map-controls">
          <!-- 顶部单行浮层：搜索胶囊 + 更多入口，不遮挡地图主体 -->
          <div class="campus-guide-topbar">
            <button
              class="campus-guide-search-pill"
              type="button"
              aria-label="搜索地点"
              @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.search)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">search</span>
              <span class="campus-guide-search-text">搜索教学楼、食堂、场馆…</span>
            </button>
            <div class="campus-guide-more-wrap">
              <button
                class="campus-guide-icon-btn"
                type="button"
                aria-label="更多入口"
                :aria-expanded="showEntrance"
                @click="showEntrance = !showEntrance"
              >
                <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
              </button>
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
            </div>
          </div>

          <!-- 地图初始化失败：中央错误卡片 + 重试主操作，不再顶部横幅（#1299 重试入口保留） -->
          <div v-if="mapInitError" class="campus-guide-map-error" role="alert">
            <div class="campus-guide-map-error-card">
              <span class="material-symbols-outlined" aria-hidden="true">error</span>
              <p>{{ mapInitError }}</p>
              <button type="button" class="campus-guide-error-cta" @click="retryMap">
                重试加载地图
              </button>
            </div>
          </div>

          <!-- 右下角定位 FAB -->
          <button
            class="campus-guide-fab campus-guide-locate-fab"
            :disabled="locating"
            type="button"
            aria-label="定位到我的位置"
            @click="handleLocate"
          >
            <span
              class="material-symbols-outlined"
              :class="{ 'campus-guide-spin': locating }"
              aria-hidden="true"
            >{{ locating ? 'progress_activity' : 'my_location' }}</span>
          </button>
        </div>
      </div>

      <!-- 底部抽屉（移动端三档）/ 右侧栏（桌面 ≥1024px）：公告 + 分类 + POI 列表/详情 -->
      <BottomSheet
        v-model="sheetSnap"
        class="campus-guide-sheet"
        :peek-height="96"
      >
        <div class="campus-guide-sheet-content">
          <NoticeBar
            v-if="topNotice"
            :notice="topNotice"
            @open="store.navigateTo(CAMPUS_GUIDE_VIEWS.noticeDetail, { noticeId: topNotice.id })"
          />

          <div v-if="guideTags.length" class="campus-guide-tabs campus-guide-chips">
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

          <p
            v-if="!store.error && !mapInitError && store.loading && !store.mapReady"
            class="campus-guide-muted campus-guide-tab-status"
          >
            正在加载校园地图与 POI 数据…
          </p>
          <p v-if="store.spotsLoading" class="campus-guide-muted campus-guide-tab-status">正在切换分类…</p>
          <p v-else-if="store.activeTag && !store.spots.length" class="campus-guide-muted campus-guide-tab-status">
            当前分类暂无点位
          </p>
          <p v-else-if="store.activeTag" class="campus-guide-muted campus-guide-tab-status">
            共 {{ store.spots.length }} 个点位
          </p>

          <!-- 选中 POI：详情卡替换列表 -->
          <div v-if="activePoi" class="campus-guide-sheet-poi">
            <button
              type="button"
              class="campus-guide-back-list"
              aria-label="返回点位列表"
              @click="closePoiCard"
            >
              <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
              返回列表
            </button>
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

          <!-- 未选中：当前分类 POI 列表 -->
          <ul v-else-if="store.spots.length" class="campus-guide-list campus-guide-sheet-list">
            <li v-for="spot in store.spots" :key="spot.spot_id">
              <button type="button" @click="handleMarkerClick(spot)">
                <strong>{{ spot.name }}</strong>
                <span>{{ spot.distancer || spot.introduction || '' }}</span>
              </button>
            </li>
          </ul>
        </div>
      </BottomSheet>
    </div>
  </div>
</template>

<style scoped>
/* #1375：校园导览重做 —— 全屏地图 + 底部抽屉（移动端）/ 右侧栏（桌面） */

.campus-guide-home {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  isolation: isolate;
}

/* 地图 + 抽屉布局容器：默认纵向，抽屉 absolute 贴底叠在地图上 */
.campus-guide-layout {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.campus-guide-map-stage {
  height: 100%;
  min-height: 0;
}

/* —— 顶部单行浮层 —— */
.campus-guide-topbar {
  position: absolute;
  top: var(--ui-space-md);
  left: var(--ui-space-md);
  right: var(--ui-space-md);
  z-index: 35;
  display: flex;
  align-items: center;
  gap: var(--ui-space-sm);
}

.campus-guide-search-pill {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-sm);
  padding: 10px var(--ui-space-md);
  border: 1px solid var(--ui-surface-border);
  border-radius: 999px;
  background: var(--ui-surface);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--ui-shadow-soft);
  color: var(--ui-muted);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: box-shadow calc(var(--ui-duration-fast) * var(--ui-motion-scale)) var(--ui-ease-out);
}

.campus-guide-search-pill:hover {
  box-shadow: var(--ui-shadow-strong);
}

.campus-guide-search-pill .material-symbols-outlined {
  font-size: 20px;
  flex: none;
}

.campus-guide-search-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.campus-guide-more-wrap {
  position: relative;
  flex: none;
}

.campus-guide-icon-btn {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-surface-border);
  border-radius: 999px;
  background: var(--ui-surface);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--ui-shadow-soft);
  color: var(--ui-text);
  cursor: pointer;
}

.campus-guide-icon-btn .material-symbols-outlined {
  font-size: 22px;
}

/* 入口菜单下拉：改为浮在更多按钮正下方（原全局样式定位在右下） */
.campus-guide-entrance-floating.campus-guide-entrance-floating {
  top: calc(100% + var(--ui-space-sm));
  right: 0;
  bottom: auto;
  width: 216px;
  padding: var(--ui-space-sm);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--ui-shadow-strong);
}

/* —— 地图初始化失败：中央错误卡片 —— */
.campus-guide-map-error {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ui-space-md);
}

.campus-guide-map-error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-sm);
  max-width: 320px;
  padding: var(--ui-space-lg) var(--ui-space-md);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--ui-shadow-strong);
  text-align: center;
}

.campus-guide-map-error-card .material-symbols-outlined {
  font-size: 40px;
  color: var(--ui-danger);
}

.campus-guide-map-error-card p {
  margin: 0;
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.6;
}

.campus-guide-error-cta {
  margin-top: var(--ui-space-xs);
  border: none;
  border-radius: 999px;
  padding: 10px var(--ui-space-lg);
  background: var(--ui-cta);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  box-shadow: var(--ui-shadow-soft);
}

/* —— 定位 FAB：贴着抽屉 peek 档上方 —— */
.campus-guide-fab.campus-guide-locate-fab {
  bottom: calc(112px + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)));
  right: var(--ui-space-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.campus-guide-locate-fab .material-symbols-outlined {
  font-size: 22px;
}

.campus-guide-spin {
  animation: campus-guide-rotate 1s linear infinite;
}

@keyframes campus-guide-rotate {
  to {
    transform: rotate(360deg);
  }
}

/* —— 抽屉内容 —— */
.campus-guide-sheet {
  padding-bottom: var(--app-safe-bottom, env(safe-area-inset-bottom, 0px));
}

.campus-guide-sheet-content {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
}

.campus-guide-chips {
  padding: var(--ui-space-xs) 0;
  scrollbar-width: thin;
}

.campus-guide-sheet-list {
  margin-top: 0;
}

.campus-guide-sheet-poi {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
}

.campus-guide-back-list {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-xs);
  border: none;
  border-radius: 999px;
  padding: 6px var(--ui-space-sm);
  background: transparent;
  color: var(--ui-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.campus-guide-back-list .material-symbols-outlined {
  font-size: 18px;
}

/* 抽屉内的 POI 卡片去浮层感（原卡片带强阴影/边框，用于地图叠加层） */
.campus-guide-sheet-poi :deep(.campus-poi-card) {
  box-shadow: none;
  border: none;
  padding: 0;
  max-height: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

/* —— 可交互元素焦点态 —— */
.campus-guide-search-pill:focus-visible,
.campus-guide-icon-btn:focus-visible,
.campus-guide-fab:focus-visible,
.campus-guide-error-cta:focus-visible,
.campus-guide-back-list:focus-visible,
.campus-guide-sheet-list button:focus-visible,
.campus-guide-tabs button:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

/* —— 桌面 ≥1024px：地图与抽屉左右分栏，抽屉变右侧栏 —— */
@media (min-width: 1024px) {
  .campus-guide-layout {
    display: flex;
    flex-direction: row;
  }

  .campus-guide-map-stage {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* BottomSheet 的 absolute 贴底 + 内联 height 全部覆盖为侧栏 */
  .campus-guide-sheet {
    position: relative;
    left: auto;
    right: auto;
    bottom: auto;
    flex: 0 0 380px;
    width: 380px;
    height: auto !important;
    border-top: none;
    border-left: 1px solid var(--ui-surface-border);
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    will-change: auto;
    padding-bottom: 0;
  }

  .campus-guide-sheet :deep(.bottom-sheet__header) {
    display: none;
  }

  .campus-guide-sheet :deep(.bottom-sheet__body) {
    padding-top: var(--ui-space-md);
  }

  .campus-guide-fab.campus-guide-locate-fab {
    bottom: var(--ui-space-lg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .campus-guide-spin {
    animation: none;
  }
}
</style>