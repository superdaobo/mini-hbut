<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { openExternal, openExternalRaw, openWeChatMiniProgram } from '../utils/external_link'
import { resolveCachedImage } from '../utils/image_cache'
import { showToast } from '../utils/toast'

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

type CampusMapItem = {
  id: string
  title: string
  subtitle: string
  url: string
}

const maps: CampusMapItem[] = [
  {
    id: 'map1',
    title: '校园地图 A',
    subtitle: '主校区总览',
    url: 'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/map/map1.jpg'
  },
  {
    id: 'map2',
    title: '校园地图 B',
    subtitle: '建筑分布',
    url: 'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/map/map2.jpg'
  }
]

const cachedSrcMap = ref<Record<string, string>>({})
const loadStateMap = ref<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({})
const activeMap = ref<CampusMapItem | null>(null)
const openingMiniProgram = ref(false)

const WECHAT_CAMPUS_GUIDE_CODE = '#小程序://校园导览/AWm9BvLlALOD9xG'
const WECHAT_CAMPUS_GUIDE_APP_ID = 'wx22aea6eb3fe08ad7'
const WECHAT_CAMPUS_GUIDE_ORIGIN_ID = 'gh_403c3ddb4411'
const WECHAT_CAMPUS_GUIDE_PATHS = ['pages/index/index', 'pages/home/index', 'pages/map/index', '']
const WECHAT_CAMPUS_GUIDE_APPID_SCHEMES = [
  `weixin://dl/business/?appid=${WECHAT_CAMPUS_GUIDE_APP_ID}&env_version=release`,
  `weixin://dl/business/?appid=${WECHAT_CAMPUS_GUIDE_APP_ID}&path=pages%2Findex%2Findex&env_version=release`,
  `weixin://dl/business/?appid=${WECHAT_CAMPUS_GUIDE_APP_ID}&path=pages%2Fhome%2Findex&env_version=release`,
  `weixin://dl/businessTempSession/?username=${encodeURIComponent(WECHAT_CAMPUS_GUIDE_ORIGIN_ID)}&appid=${WECHAT_CAMPUS_GUIDE_APP_ID}`,
  `weixin://dl/businessTempSession/?username=${encodeURIComponent(WECHAT_CAMPUS_GUIDE_ORIGIN_ID)}`
]

const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const viewportRef = ref<HTMLElement | null>(null)

const pointers = new Map<number, { x: number; y: number }>()
const lastPanPoint = ref<{ x: number; y: number } | null>(null)
const lastPinchDistance = ref(0)

const zoomText = computed(() => `${Math.round(scale.value * 100)}%`)
const imageTransform = computed(
  () =>
    `translate(-50%, -50%) translate3d(${offset.value.x}px, ${offset.value.y}px, 0) scale(${scale.value})`
)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const getMapSrc = (item: CampusMapItem) => cachedSrcMap.value[item.id] || item.url

const fallbackToRemote = (item: CampusMapItem) => {
  const current = cachedSrcMap.value[item.id]
  if (current === item.url) {
    loadStateMap.value[item.id] = 'error'
    return
  }
  cachedSrcMap.value[item.id] = item.url
  loadStateMap.value[item.id] = 'error'
}

const handleCoverImageError = (item: CampusMapItem) => fallbackToRemote(item)
const handleViewerImageError = () => {
  if (activeMap.value) fallbackToRemote(activeMap.value)
}

const maxPan = () => {
  const el = viewportRef.value
  if (!el) return { x: 240, y: 320 }
  const k = Math.max(0, scale.value - 1)
  return {
    x: el.clientWidth * (0.5 + k * 0.9),
    y: el.clientHeight * (0.5 + k * 0.9)
  }
}

const clampOffset = (next: { x: number; y: number }) => {
  const lim = maxPan()
  return {
    x: clamp(next.x, -lim.x, lim.x),
    y: clamp(next.y, -lim.y, lim.y)
  }
}

const resetView = () => {
  scale.value = 1
  offset.value = { x: 0, y: 0 }
  lastPanPoint.value = null
  lastPinchDistance.value = 0
}

const openMap = (map: CampusMapItem) => {
  activeMap.value = map
  resetView()
}

const closeMap = () => {
  activeMap.value = null
  resetView()
  pointers.clear()
}

const zoomBy = (delta: number) => {
  const nextScale = clamp(scale.value + delta, 1, 6)
  scale.value = nextScale
  if (nextScale <= 1) {
    offset.value = { x: 0, y: 0 }
  } else {
    offset.value = clampOffset(offset.value)
  }
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  zoomBy(event.deltaY < 0 ? 0.2 : -0.2)
}

const pointDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

const onPointerDown = (event: PointerEvent) => {
  if (!activeMap.value) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 1) {
    lastPanPoint.value = { x: event.clientX, y: event.clientY }
  } else if (pointers.size === 2) {
    const values = [...pointers.values()]
    lastPinchDistance.value = pointDistance(values[0], values[1])
    lastPanPoint.value = null
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (!activeMap.value || !pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pointers.size === 2) {
    const values = [...pointers.values()]
    const distance = pointDistance(values[0], values[1])
    if (lastPinchDistance.value > 0) {
      const ratio = distance / lastPinchDistance.value
      const nextScale = clamp(scale.value * ratio, 1, 6)
      scale.value = nextScale
      offset.value = nextScale <= 1 ? { x: 0, y: 0 } : clampOffset(offset.value)
    }
    lastPinchDistance.value = distance
    return
  }

  if (pointers.size === 1 && scale.value > 1 && lastPanPoint.value) {
    const dx = event.clientX - lastPanPoint.value.x
    const dy = event.clientY - lastPanPoint.value.y
    offset.value = clampOffset({
      x: offset.value.x + dx,
      y: offset.value.y + dy
    })
    lastPanPoint.value = { x: event.clientX, y: event.clientY }
  }
}

const onPointerUp = (event: PointerEvent) => {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) lastPinchDistance.value = 0
  if (pointers.size === 1) {
    const only = [...pointers.values()][0]
    lastPanPoint.value = { x: only.x, y: only.y }
  }
  if (pointers.size === 0) lastPanPoint.value = null
}

const openRaw = async () => {
  if (!activeMap.value) return
  await openExternal(activeMap.value.url)
}

const copyGuideCode = async () => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(WECHAT_CAMPUS_GUIDE_CODE)
      return true
    }
  } catch {
    // ignore
  }
  return false
}

const openCampusGuideMiniProgram = async () => {
  if (openingMiniProgram.value) return
  openingMiniProgram.value = true
  try {
    const copied = await copyGuideCode()
    let opened = false

    // 优先走 AppID 直链，避免 token 链接失效时直接落到“无法访问”页面。
    for (const scheme of WECHAT_CAMPUS_GUIDE_APPID_SCHEMES) {
      opened = await openExternalRaw(scheme)
      if (opened) break
    }

    if (!opened) {
      opened = await openWeChatMiniProgram({
        code: WECHAT_CAMPUS_GUIDE_CODE,
        appId: WECHAT_CAMPUS_GUIDE_APP_ID,
        ghId: WECHAT_CAMPUS_GUIDE_ORIGIN_ID,
        envVersion: 'release'
      })
    }

    for (const path of WECHAT_CAMPUS_GUIDE_PATHS) {
      if (opened) break
      opened = await openWeChatMiniProgram({
        code: WECHAT_CAMPUS_GUIDE_CODE,
        appId: WECHAT_CAMPUS_GUIDE_APP_ID,
        ghId: WECHAT_CAMPUS_GUIDE_ORIGIN_ID,
        path,
        envVersion: 'release'
      })
      if (opened) break
    }

    if (opened) {
      showToast(
        copied
          ? '已尝试唤起微信；若仍提示不可访问，请在微信粘贴口令打开。'
          : '已尝试唤起微信小程序，请在微信内确认打开。',
        'success',
        3200
      )
      return
    }

    if (copied) {
      showToast('未能直接唤起微信，口令已复制，请粘贴到微信打开。', 'warning', 3200)
    } else {
      showToast('唤起失败，请手动复制口令到微信打开。', 'error', 3200)
    }
  } finally {
    openingMiniProgram.value = false
  }
}

const loadSingleMap = async (item: CampusMapItem) => {
  loadStateMap.value[item.id] = 'loading'
  try {
    // 缓存策略：
    // 1. 首次进入下载并缓存到本地
    // 2. 7 天内优先读缓存，减少重复下载
    // 3. 缓存失败时回退到远程 URL，不阻断展示
    const localSrc = await resolveCachedImage({
      cacheKey: `campus-map-${item.id}`,
      url: item.url,
      ttlHours: 24 * 7
    })
    cachedSrcMap.value[item.id] = localSrc
    loadStateMap.value[item.id] = 'ready'
  } catch {
    cachedSrcMap.value[item.id] = item.url
    loadStateMap.value[item.id] = 'error'
  }
}

const warmupMaps = async () => {
  await Promise.allSettled(maps.map((item) => loadSingleMap(item)))
}

onMounted(() => {
  warmupMaps()
})
</script>

<template>
  <div class="campus-map-view">
    <header class="view-header">
      <button class="header-btn" @click="emit('back')">← 返回</button>
      <h1>校园地图</h1>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <section class="intro-card">
      <p>支持缩放、拖拽和手势查看，地图会自动缓存到本地。</p>
      <p>缓存有效期 7 天，到期后会自动后台刷新。</p>
    </section>

    <section class="maps-grid">
      <article v-for="item in maps" :key="item.id" class="map-card">
        <div class="map-cover">
          <img :src="getMapSrc(item)" :alt="item.title" loading="lazy" @error="handleCoverImageError(item)" />
          <div v-if="loadStateMap[item.id] === 'loading'" class="cover-badge">缓存中</div>
        </div>
        <div class="map-meta">
          <h3>{{ item.title }}</h3>
          <p>{{ item.subtitle }}</p>
        </div>
        <button class="open-btn" @click="openMap(item)">查看地图</button>
      </article>
    </section>

    <section class="mini-program-card">
      <div class="mini-program-head">
        <h2>微信校园导览</h2>
        <span>iOS / Android</span>
      </div>
      <p class="mini-program-desc">
        点击按钮直接跳转微信小程序。若系统拦截，会自动复制口令，粘贴到微信即可打开。
      </p>
      <button class="mini-program-btn" :disabled="openingMiniProgram" @click="openCampusGuideMiniProgram">
        {{ openingMiniProgram ? '正在唤起微信...' : '打开微信校园导览' }}
      </button>
      <div class="mini-program-code">
        <div>口令：{{ WECHAT_CAMPUS_GUIDE_CODE }}</div>
        <div>AppID：{{ WECHAT_CAMPUS_GUIDE_APP_ID }}</div>
      </div>
    </section>

    <div v-if="activeMap" class="viewer-overlay" @click.self="closeMap">
      <div class="viewer-shell">
        <div class="viewer-toolbar">
          <div class="viewer-title">
            <h3>{{ activeMap.title }}</h3>
            <span>{{ zoomText }}</span>
          </div>
          <div class="viewer-actions">
            <button @click="zoomBy(-0.2)">-</button>
            <button @click="zoomBy(0.2)">+</button>
            <button @click="resetView">重置</button>
            <button @click="openRaw">原图</button>
            <button class="close-btn" @click="closeMap">关闭</button>
          </div>
        </div>

        <div
          ref="viewportRef"
          class="viewer-viewport"
          @wheel="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="onPointerUp"
        >
          <img
            class="viewer-image"
            :src="getMapSrc(activeMap)"
            :alt="activeMap.title"
            :style="{ transform: imageTransform }"
            @error="handleViewerImageError"
            draggable="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.campus-map-view {
  min-height: 100vh;
  padding: 20px 20px 110px;
  background: var(--ui-bg-gradient);
}

.view-header {
  display: grid;
  grid-template-columns: 112px 1fr 112px;
  align-items: center;
  padding: 16px 20px;
  border-radius: 16px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.view-header h1 {
  margin: 0;
  text-align: center;
  font-size: 22px;
  color: var(--ui-text);
}

.header-btn {
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-primary-soft);
  color: var(--ui-text);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  width: 112px;
  justify-self: start;
}

.header-spacer {
  width: 112px;
  height: 1px;
  justify-self: end;
}

.intro-card {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  color: var(--ui-muted);
}

.intro-card p {
  margin: 0;
  line-height: 1.6;
}

.intro-card p + p {
  margin-top: 6px;
}

.maps-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.mini-program-card {
  margin-top: 18px;
  padding: 16px;
  border-radius: 16px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.mini-program-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mini-program-head h2 {
  margin: 0;
  color: var(--ui-text);
  font-size: 20px;
}

.mini-program-head span {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  color: #0f766e;
  background: rgba(15, 118, 110, 0.12);
}

.mini-program-desc {
  margin: 10px 0 0;
  color: var(--ui-muted);
  line-height: 1.6;
}

.mini-program-btn {
  margin-top: 12px;
  width: 100%;
  border: none;
  border-radius: 12px;
  background: linear-gradient(125deg, #059669, #16a34a);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  padding: 12px 14px;
  cursor: pointer;
}

.mini-program-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.mini-program-code {
  margin-top: 10px;
  border-radius: 10px;
  border: 1px dashed rgba(30, 41, 59, 0.18);
  background: rgba(148, 163, 184, 0.12);
  color: #334155;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-all;
  padding: 8px 10px;
}

.map-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--ui-shadow-soft);
}

.map-cover {
  position: relative;
  height: 170px;
  background: rgba(15, 23, 42, 0.07);
}

.map-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: rgba(30, 64, 175, 0.82);
}

.map-meta {
  padding: 12px 14px 8px;
}

.map-meta h3 {
  margin: 0;
  color: var(--ui-text);
  font-size: 18px;
}

.map-meta p {
  margin: 8px 0 0;
  color: var(--ui-muted);
  font-size: 14px;
}

.open-btn {
  margin: 0 14px 14px;
  width: calc(100% - 28px);
  border: none;
  border-radius: 12px;
  background: linear-gradient(120deg, #2563eb, #0891b2);
  color: #fff;
  font-weight: 700;
  padding: 10px 12px;
  cursor: pointer;
}

.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(3, 7, 18, 0.86);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
}

.viewer-shell {
  width: min(1100px, 100%);
  height: min(88vh, 850px);
  background: #0b1220;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.viewer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
}

.viewer-title h3 {
  margin: 0;
  font-size: 17px;
}

.viewer-title span {
  font-size: 12px;
  opacity: 0.88;
}

.viewer-actions {
  display: flex;
  gap: 8px;
}

.viewer-actions button {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.64);
  color: #e2e8f0;
  padding: 6px 10px;
  cursor: pointer;
}

.viewer-actions .close-btn {
  color: #fca5a5;
}

.viewer-viewport {
  position: relative;
  flex: 1;
  overflow: hidden;
  touch-action: none;
  background:
    radial-gradient(circle at 12% 18%, rgba(56, 189, 248, 0.12), transparent 42%),
    radial-gradient(circle at 85% 85%, rgba(59, 130, 246, 0.14), transparent 45%),
    #020617;
}

.viewer-image {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: 100%;
  max-height: 100%;
  user-select: none;
  transform-origin: center center;
  transition: transform 0.08s linear;
}

@media (max-width: 768px) {
  .campus-map-view {
    padding: 14px 14px 100px;
  }

  .view-header {
    grid-template-columns: 94px 1fr 94px;
    padding: 12px 14px;
  }

  .view-header h1 {
    font-size: 20px;
  }

  .header-btn,
  .header-spacer {
    width: 94px;
  }

  .maps-grid {
    grid-template-columns: 1fr;
  }

  .mini-program-head h2 {
    font-size: 18px;
  }

  .viewer-shell {
    height: 84vh;
  }

  .viewer-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
