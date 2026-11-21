<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { openExternal } from '../utils/external_link'
import { resolveCachedImage } from '../utils/image_cache'
import { TPageHeader } from './templates'

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
  <div class="campus-photo-map-view">
    <TPageHeader title="校园地图" icon="map" @back="emit('back')" />

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

    <div v-if="activeMap" class="viewer-overlay" @click.self="closeMap">
      <div class="viewer-shell">
        <div class="viewer-toolbar">
          <div class="viewer-title">
            <h3>{{ activeMap.title }}</h3>
            <span>{{ zoomText }}</span>
          </div>
          <div class="viewer-actions">
            <button aria-label="缩小" @click="zoomBy(-0.2)">
              <span class="material-symbols-outlined" aria-hidden="true">zoom_out</span>
            </button>
            <button aria-label="放大" @click="zoomBy(0.2)">
              <span class="material-symbols-outlined" aria-hidden="true">zoom_in</span>
            </button>
            <button aria-label="重置视图" @click="resetView">
              <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
            </button>
            <button aria-label="查看原图" @click="openRaw">
              <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
            </button>
            <button class="close-btn" aria-label="关闭查看器" @click="closeMap">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
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
/* ── 页面侧：颜色/间距/圆角/动效全部走 --ui-* token，无裸色值 ── */
.campus-photo-map-view {
  /* 组件级派生色：由 token 混合得出（占位底 + 缓存中徽章） */
  --card-cover-tint: color-mix(in oklab, var(--ui-primary) 10%, transparent);
  --badge-bg: color-mix(
    in oklab,
    color-mix(in oklab, var(--ui-primary) 80%, black 20%) 82%,
    transparent 18%
  );
  min-height: 100vh;
  padding: var(--ui-space-md) var(--ui-space-md) 100px;
  background: var(--ui-bg-gradient);
}

.intro-card {
  margin-top: var(--ui-space-md);
  padding: var(--ui-space-md);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  color: var(--ui-muted);
}

.intro-card p {
  margin: 0;
  line-height: 1.6;
}

.intro-card p + p {
  margin-top: var(--ui-space-xs);
}

.maps-grid {
  margin-top: var(--ui-space-md);
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--ui-space-md);
}

.map-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: var(--ui-radius-lg);
  overflow: hidden;
  box-shadow: var(--ui-shadow-soft);
}

.map-cover {
  position: relative;
  height: 170px;
  background: var(--card-cover-tint);
}

.map-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-badge {
  position: absolute;
  top: var(--ui-space-sm);
  right: var(--ui-space-sm);
  padding: var(--ui-space-xs) var(--ui-space-sm);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: white;
  background: var(--badge-bg);
}

.map-meta {
  padding: var(--ui-space-sm) var(--ui-space-md) var(--ui-space-xs);
}

.map-meta h3 {
  margin: 0;
  color: var(--ui-text);
  font-size: 18px;
}

.map-meta p {
  margin: var(--ui-space-sm) 0 0;
  color: var(--ui-muted);
  font-size: 14px;
}

.open-btn {
  margin: 0 var(--ui-space-md) var(--ui-space-md);
  width: calc(100% - var(--ui-space-md) * 2);
  border: none;
  border-radius: var(--ui-radius-md);
  background: linear-gradient(120deg, var(--ui-primary), var(--ui-secondary));
  color: white;
  font-weight: 700;
  padding: var(--ui-space-sm);
  cursor: pointer;
  transition: filter calc(var(--ui-duration-fast) * var(--ui-motion-scale)) var(--ui-ease-out);
}

.open-btn:hover {
  filter: brightness(1.08);
}

/* ── 查看器：暗色玻璃 ──
   局部变量全部由 token 派生（--ui-primary 定色相 + black/white 做明暗锚点），
   不引用会被 html.dark 翻转的 --ui-surface/--ui-text，
   因此浅/深主题下都保持「深底 + 浅字」的观感。 */
.viewer-overlay {
  --viewer-scrim: color-mix(in oklab, var(--ui-primary) 20%, black 80%);
  --viewer-bg: color-mix(in oklab, var(--ui-primary) 15%, black 85%);
  --viewer-deep: color-mix(in oklab, var(--ui-primary) 8%, black 92%);
  --viewer-panel: color-mix(in oklab, var(--ui-primary) 24%, black 76%);
  --viewer-text: color-mix(in oklab, var(--ui-secondary) 12%, white 88%);
  --viewer-danger: color-mix(in oklab, var(--ui-danger) 52%, white 48%);
  --viewer-glow-1: color-mix(in oklab, var(--ui-secondary) 24%, transparent);
  --viewer-glow-2: color-mix(in oklab, var(--ui-primary) 28%, transparent);
  position: fixed;
  inset: 0;
  z-index: 90;
  overscroll-behavior: none;
  background: color-mix(in oklab, var(--viewer-scrim) 86%, transparent 14%);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--ui-space-sm);
}

.viewer-shell {
  width: min(1100px, 100%);
  height: 84vh;
  background: var(--viewer-bg);
  border: 1px solid var(--ui-surface-border);
  border-radius: var(--ui-radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.viewer-toolbar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ui-space-sm);
  padding: var(--ui-space-sm) var(--ui-space-md);
  background: color-mix(in oklab, var(--viewer-panel) 90%, transparent 10%);
  color: var(--viewer-text);
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
  gap: var(--ui-space-sm);
}

.viewer-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-surface-border);
  border-radius: var(--ui-radius-sm);
  background: color-mix(in oklab, var(--viewer-panel) 64%, transparent 36%);
  color: var(--viewer-text);
  padding: var(--ui-space-xs) var(--ui-space-sm);
  cursor: pointer;
  transition:
    background calc(var(--ui-duration-fast) * var(--ui-motion-scale)) var(--ui-ease-out),
    color calc(var(--ui-duration-fast) * var(--ui-motion-scale)) var(--ui-ease-out);
}

.viewer-actions button:hover {
  background: color-mix(in oklab, var(--viewer-panel) 84%, transparent 16%);
}

.viewer-actions button .material-symbols-outlined {
  font-size: 20px;
}

.viewer-actions .close-btn {
  color: var(--viewer-danger);
}

.viewer-viewport {
  position: relative;
  flex: 1;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: contain;
  background:
    radial-gradient(circle at 12% 18%, var(--viewer-glow-1), transparent 42%),
    radial-gradient(circle at 85% 85%, var(--viewer-glow-2), transparent 45%),
    var(--viewer-deep);
}

.viewer-image {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: 100%;
  max-height: 100%;
  user-select: none;
  transform-origin: center center;
  /* 图片跟手：duration-fast 的一半（≈0.075s），保证拖拽/缩放零滞手感 */
  transition: transform calc(var(--ui-duration-fast) * 0.5) linear;
}

/* 焦点态可见：页面按钮用 primary 描边，暗色查看器内改用浅色描边 */
.open-btn:focus-visible,
.viewer-actions button:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.viewer-actions button:focus-visible {
  outline-color: var(--viewer-text);
}

/* ── 响应式：375 单列 / 768 双列 / 1024+ 双列且卡片更大 ── */
@media (min-width: 768px) {
  .campus-photo-map-view {
    padding: var(--ui-space-md) var(--ui-space-lg) 110px;
  }

  .maps-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .viewer-shell {
    height: min(88vh, 850px);
  }

  .viewer-toolbar {
    flex-direction: row;
    align-items: center;
  }
}

@media (min-width: 1024px) {
  .maps-grid {
    gap: var(--ui-space-lg);
  }

  .map-cover {
    height: 220px;
  }

  .map-meta h3 {
    font-size: 20px;
  }
}
</style>
