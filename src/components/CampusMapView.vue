<script setup>
import { computed, ref } from 'vue'
import { openExternal } from '../utils/external_link'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const maps = [
  {
    id: 'map1',
    title: '校园地图 A',
    subtitle: '主校区总览',
    url: 'https://raw.gitcode.com/superdaobo/mini-hbut-config/blobs/bc015faeb54a8d1aa82f10d055106356446f9123/map/map1.jpg'
  },
  {
    id: 'map2',
    title: '校园地图 B',
    subtitle: '楼宇分布',
    url: 'https://raw.gitcode.com/superdaobo/mini-hbut-config/blobs/2fec75dfea5fd35025500008956a9aa8602c49cf/map/map2.jpg'
  }
]

const activeMap = ref(null)
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const viewportRef = ref(null)

const pointers = new Map()
const lastPanPoint = ref(null)
const lastPinchDistance = ref(0)

const zoomText = computed(() => `${Math.round(scale.value * 100)}%`)
const imageTransform = computed(
  () => `translate(-50%, -50%) translate3d(${offset.value.x}px, ${offset.value.y}px, 0) scale(${scale.value})`
)

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const maxPan = () => {
  const el = viewportRef.value
  if (!el) return { x: 240, y: 320 }
  const k = Math.max(0, scale.value - 1)
  return {
    x: el.clientWidth * (0.5 + k * 0.9),
    y: el.clientHeight * (0.5 + k * 0.9)
  }
}

const clampOffset = (next) => {
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

const openMap = (map) => {
  activeMap.value = map
  resetView()
}

const closeMap = () => {
  activeMap.value = null
  resetView()
  pointers.clear()
}

const zoomBy = (delta) => {
  const nextScale = clamp(scale.value + delta, 1, 6)
  scale.value = nextScale
  if (nextScale <= 1) {
    offset.value = { x: 0, y: 0 }
  } else {
    offset.value = clampOffset(offset.value)
  }
}

const onWheel = (event) => {
  event.preventDefault()
  zoomBy(event.deltaY < 0 ? 0.2 : -0.2)
}

const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const onPointerDown = (event) => {
  if (!activeMap.value) return
  event.currentTarget.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pointers.size === 1) {
    lastPanPoint.value = { x: event.clientX, y: event.clientY }
  } else if (pointers.size === 2) {
    const values = [...pointers.values()]
    lastPinchDistance.value = pointDistance(values[0], values[1])
    lastPanPoint.value = null
  }
}

const onPointerMove = (event) => {
  if (!activeMap.value || !pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pointers.size === 2) {
    const values = [...pointers.values()]
    const distance = pointDistance(values[0], values[1])
    if (lastPinchDistance.value > 0) {
      const ratio = distance / lastPinchDistance.value
      const nextScale = clamp(scale.value * ratio, 1, 6)
      scale.value = nextScale
      if (nextScale <= 1) {
        offset.value = { x: 0, y: 0 }
      } else {
        offset.value = clampOffset(offset.value)
      }
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

const onPointerUp = (event) => {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) {
    lastPinchDistance.value = 0
  }
  if (pointers.size === 1) {
    const only = [...pointers.values()][0]
    lastPanPoint.value = { x: only.x, y: only.y }
  }
  if (pointers.size === 0) {
    lastPanPoint.value = null
  }
}

const openRaw = async () => {
  if (!activeMap.value) return
  await openExternal(activeMap.value.url)
}
</script>

<template>
  <div class="campus-map-view">
    <header class="view-header">
      <button class="header-btn" @click="emit('back')">← 返回</button>
      <h1>🗺️ 校园地图</h1>
      <button class="header-btn danger" @click="emit('logout')">退出</button>
    </header>

    <section class="intro-card">
      <p>当前账号：{{ props.studentId || '未登录' }}</p>
      <p>支持双指缩放、拖拽移动、滚轮缩放和一键打开原图。</p>
    </section>

    <section class="maps-grid">
      <article v-for="item in maps" :key="item.id" class="map-card">
        <div class="map-cover">
          <img :src="item.url" :alt="item.title" loading="lazy" />
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
            :src="activeMap.url"
            :alt="activeMap.title"
            :style="{ transform: imageTransform }"
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 16px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.view-header h1 {
  margin: 0;
  font-size: 24px;
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
}

.header-btn.danger {
  color: var(--ui-danger);
}

.intro-card {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  color: var(--ui-muted);
  line-height: 1.5;
}

.intro-card p {
  margin: 4px 0;
}

.maps-grid {
  margin-top: 16px;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.map-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--ui-shadow-soft);
  display: grid;
  grid-template-rows: 180px auto auto;
}

.map-cover {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #dbeafe, #cffafe);
}

.map-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}

.map-card:hover .map-cover img {
  transform: scale(1.03);
}

.map-meta {
  padding: 12px 12px 6px;
}

.map-meta h3 {
  margin: 0;
  color: var(--ui-text);
  font-size: 16px;
}

.map-meta p {
  margin: 6px 0 0;
  color: var(--ui-muted);
  font-size: 13px;
}

.open-btn {
  margin: 0 12px 12px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  color: #fff;
  padding: 10px 12px;
  font-weight: 700;
  cursor: pointer;
}

.viewer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 10, 24, 0.78);
  backdrop-filter: blur(6px);
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.viewer-shell {
  width: min(1080px, 100%);
  height: min(88vh, 900px);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 24px 42px rgba(0, 0, 0, 0.35);
  background: rgba(15, 23, 42, 0.88);
  display: grid;
  grid-template-rows: auto 1fr;
}

.viewer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.viewer-title h3 {
  margin: 0;
  font-size: 16px;
}

.viewer-title span {
  font-size: 13px;
  color: #94a3b8;
}

.viewer-actions {
  display: flex;
  gap: 8px;
}

.viewer-actions button {
  border: none;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.9);
  color: #e2e8f0;
  padding: 7px 11px;
  font-size: 13px;
  cursor: pointer;
}

.viewer-actions .close-btn {
  background: rgba(190, 24, 93, 0.9);
}

.viewer-viewport {
  position: relative;
  overflow: hidden;
  touch-action: none;
  background:
    linear-gradient(45deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.85)),
    repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.02) 0 25%, rgba(255, 255, 255, 0.05) 0 50%) 50% / 24px 24px;
}

.viewer-image {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  width: auto;
  max-width: 100%;
  max-height: 100%;
  user-select: none;
  -webkit-user-drag: none;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.4));
}

@media (max-width: 900px) {
  .maps-grid {
    grid-template-columns: 1fr;
  }

  .viewer-shell {
    height: min(90vh, 100%);
  }

  .viewer-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .viewer-actions {
    flex-wrap: wrap;
  }
}
</style>
