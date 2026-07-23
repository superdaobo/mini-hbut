<script setup>
/**
 * 自定义课程「设定颜色」多级选色：
 * 入口行 → 预设色板 → 拖拽自定义取色；输出稳定 hex 到 v-model。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  COURSE_COLOR_PRESETS,
  DEFAULT_COURSE_COLOR,
  findPresetByHex,
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  normalizeOptionalCourseColor,
} from '../utils/course_color'

const props = defineProps({
  /** 当前颜色 hex，空字符串表示未设定 */
  modelValue: { type: String, default: DEFAULT_COURSE_COLOR },
})

const emit = defineEmits(['update:modelValue'])

/** panel: closed | preset | custom */
const panel = ref('closed')
const draftHex = ref('')
const hue = ref(210)
const sat = ref(0.55)
const val = ref(0.95)

const displayHex = computed(() => {
  const n = normalizeOptionalCourseColor(props.modelValue)
  return n === null ? '' : n
})

const displaySwatch = computed(() => displayHex.value || '#cbd5e1')
const isPresetSelected = (hex) => {
  const a = normalizeHexColor(hex)
  const b = normalizeHexColor(draftHex.value)
  return !!a && !!b && a === b
}

const syncDraftFromModel = () => {
  const n = normalizeOptionalCourseColor(props.modelValue)
  draftHex.value = n || ''
  const hsv = hexToHsv(draftHex.value || '#72b9ff')
  if (hsv) {
    hue.value = hsv.h
    sat.value = hsv.s
    val.value = hsv.v
  }
}

watch(
  () => props.modelValue,
  () => {
    if (panel.value === 'closed') syncDraftFromModel()
  },
  { immediate: true }
)

const openPreset = () => {
  syncDraftFromModel()
  panel.value = 'preset'
}

const closePanel = () => {
  panel.value = 'closed'
}

const goCustom = () => {
  const hsv = hexToHsv(draftHex.value || '#72b9ff')
  if (hsv) {
    hue.value = hsv.h
    sat.value = hsv.s
    val.value = hsv.v
  }
  panel.value = 'custom'
}

const backToPreset = () => {
  panel.value = 'preset'
}

const selectPreset = (hex) => {
  const n = normalizeHexColor(hex)
  if (!n) return
  draftHex.value = n
}

const clearColor = () => {
  draftHex.value = ''
}

const confirmColor = () => {
  const n = normalizeOptionalCourseColor(draftHex.value)
  if (n === null) return
  emit('update:modelValue', n)
  panel.value = 'closed'
}

const customPreview = computed(() => hsvToHex(hue.value, sat.value, val.value))

watch([hue, sat, val], () => {
  if (panel.value !== 'custom') return
  draftHex.value = customPreview.value
})

const svPanelRef = ref(null)
const hueBarRef = ref(null)
let draggingSv = false
let draggingHue = false

const applySvFromEvent = (event) => {
  const el = svPanelRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const clientX = event.touches?.[0]?.clientX ?? event.clientX
  const clientY = event.touches?.[0]?.clientY ?? event.clientY
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
  sat.value = x
  val.value = 1 - y
}

const applyHueFromEvent = (event) => {
  const el = hueBarRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const clientX = event.touches?.[0]?.clientX ?? event.clientX
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  hue.value = x * 360
}

const onSvPointerDown = (event) => {
  draggingSv = true
  applySvFromEvent(event)
  event.preventDefault?.()
}

const onHuePointerDown = (event) => {
  draggingHue = true
  applyHueFromEvent(event)
  event.preventDefault?.()
}

const onPointerMove = (event) => {
  if (draggingSv) applySvFromEvent(event)
  if (draggingHue) applyHueFromEvent(event)
}

const onPointerUp = () => {
  draggingSv = false
  draggingHue = false
}

onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('touchmove', onPointerMove, { passive: false })
  window.addEventListener('touchend', onPointerUp)
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('touchmove', onPointerMove)
  window.removeEventListener('touchend', onPointerUp)
})

const svKnobStyle = computed(() => ({
  left: `${sat.value * 100}%`,
  top: `${(1 - val.value) * 100}%`,
}))

const hueKnobStyle = computed(() => ({
  left: `${(hue.value / 360) * 100}%`,
}))

const hueGradient = 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'

const svBackground = computed(() => {
  const pure = hsvToHex(hue.value, 1, 1)
  return {
    background: `
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, ${pure})
    `,
  }
})

const presetMatchLabel = computed(() => {
  const p = findPresetByHex(displayHex.value)
  return p?.label || (displayHex.value ? displayHex.value.toUpperCase() : '未设定')
})
</script>

<template>
  <div class="course-color-picker">
    <button type="button" class="ccp-entry" @click="openPreset">
      <span class="ccp-entry-label">设定颜色</span>
      <span class="ccp-entry-right">
        <span class="ccp-swatch" :style="{ background: displaySwatch }" />
        <span class="ccp-entry-meta">{{ presetMatchLabel }}</span>
        <span class="ccp-chevron" aria-hidden="true">›</span>
      </span>
    </button>

    <Teleport to="body">
      <Transition name="ccp-fade">
        <div
          v-if="panel !== 'closed'"
          class="ccp-mask"
          @click.self="closePanel"
        >
          <Transition name="ccp-sheet" mode="out-in">
            <div
              v-if="panel === 'preset'"
              key="preset"
              class="ccp-sheet"
              @click.stop
            >
              <div class="ccp-sheet-header">
                <div class="ccp-sheet-title">预设</div>
                <button type="button" class="ccp-text-btn" @click="closePanel">关闭</button>
              </div>
              <div class="ccp-preset-grid">
                <button
                  v-for="item in COURSE_COLOR_PRESETS"
                  :key="item.id"
                  type="button"
                  class="ccp-preset-cell"
                  :class="{ active: isPresetSelected(item.hex) }"
                  :title="item.label"
                  :aria-label="item.label"
                  :style="{ background: item.hex }"
                  @click="selectPreset(item.hex)"
                />
              </div>
              <div class="ccp-sheet-actions ccp-actions-3">
                <button type="button" class="ccp-secondary" @click="clearColor">清除</button>
                <button type="button" class="ccp-secondary" @click="goCustom">自定义</button>
                <button type="button" class="ccp-primary" @click="confirmColor">完成</button>
              </div>
            </div>

            <div
              v-else-if="panel === 'custom'"
              key="custom"
              class="ccp-sheet"
              @click.stop
            >
              <div class="ccp-sheet-header ccp-header-3">
                <button type="button" class="ccp-text-btn" @click="backToPreset">返回</button>
                <div class="ccp-sheet-title">自定义</div>
                <button type="button" class="ccp-text-btn" @click="closePanel">关闭</button>
              </div>
              <div class="ccp-custom-body">
                <div
                  ref="svPanelRef"
                  class="ccp-sv"
                  :style="svBackground"
                  @pointerdown="onSvPointerDown"
                  @touchstart.prevent="onSvPointerDown"
                >
                  <span class="ccp-sv-knob" :style="svKnobStyle" />
                </div>
                <div
                  ref="hueBarRef"
                  class="ccp-hue"
                  :style="{ background: hueGradient }"
                  @pointerdown="onHuePointerDown"
                  @touchstart.prevent="onHuePointerDown"
                >
                  <span class="ccp-hue-knob" :style="hueKnobStyle" />
                </div>
                <div class="ccp-preview-row">
                  <span class="ccp-swatch large" :style="{ background: customPreview }" />
                  <span class="ccp-hex">{{ customPreview.toUpperCase() }}</span>
                </div>
              </div>
              <div class="ccp-sheet-actions ccp-actions-2">
                <button type="button" class="ccp-secondary" @click="backToPreset">预设</button>
                <button type="button" class="ccp-primary" @click="confirmColor">完成</button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.course-color-picker {
  width: 100%;
}

.ccp-entry {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  padding: 0 10px;
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.ccp-entry:active {
  transform: scale(0.99);
}

.ccp-entry-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.ccp-entry-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ccp-entry-meta {
  font-size: 12px;
  color: #64748b;
  max-width: 9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ccp-chevron {
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
}

.ccp-swatch {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

.ccp-swatch.large {
  width: 28px;
  height: 28px;
}

.ccp-mask {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 23, 42, 0.42);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.ccp-sheet {
  width: min(100%, 420px);
  max-height: min(72dvh, 520px);
  border-radius: 18px 18px 14px 14px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
  padding: 14px;
  display: grid;
  gap: 12px;
  box-sizing: border-box;
}

.ccp-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ccp-sheet-header.ccp-header-3 {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}

.ccp-sheet-header.ccp-header-3 .ccp-sheet-title {
  text-align: center;
}

.ccp-sheet-header.ccp-header-3 .ccp-text-btn:last-child {
  justify-self: end;
}

.ccp-sheet-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.ccp-text-btn {
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 2px;
}

.ccp-preset-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  padding: 4px 2px;
}

.ccp-preset-cell {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 2px solid transparent;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.ccp-preset-cell:active {
  transform: scale(0.94);
}

.ccp-preset-cell.active {
  border-color: #0f172a;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.28);
  transform: scale(1.04);
}

.ccp-custom-body {
  display: grid;
  gap: 12px;
}

.ccp-sv {
  position: relative;
  width: 100%;
  height: 168px;
  border-radius: 14px;
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
  border: 1px solid rgba(148, 163, 184, 0.4);
}

.ccp-sv-knob {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.35), 0 2px 8px rgba(15, 23, 42, 0.25);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.ccp-hue {
  position: relative;
  height: 18px;
  border-radius: 999px;
  touch-action: none;
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.35);
}

.ccp-hue-knob {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  border: 2px solid #0f172a;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
}

.ccp-preview-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ccp-hex {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}

.ccp-sheet-actions {
  display: grid;
  gap: 8px;
}

.ccp-actions-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ccp-actions-2 {
  grid-template-columns: 1fr 1.2fr;
}

.ccp-primary,
.ccp-secondary {
  min-height: 40px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.ccp-primary {
  border: none;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
}

.ccp-secondary {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
}

.ccp-fade-enter-active,
.ccp-fade-leave-active {
  transition: opacity 0.2s ease;
}

.ccp-fade-enter-from,
.ccp-fade-leave-to {
  opacity: 0;
}

.ccp-sheet-enter-active,
.ccp-sheet-leave-active {
  transition: transform 0.22s ease, opacity 0.2s ease;
}

.ccp-sheet-enter-from,
.ccp-sheet-leave-to {
  opacity: 0;
  transform: translateY(18px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .ccp-entry,
  .ccp-preset-cell,
  .ccp-fade-enter-active,
  .ccp-fade-leave-active,
  .ccp-sheet-enter-active,
  .ccp-sheet-leave-active {
    transition: none !important;
  }
}

:global(html.dark) .ccp-entry {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

:global(html.dark) .ccp-entry-label,
:global(html.dark) .ccp-entry-meta {
  color: #94a3b8;
}

:global(html.dark) .ccp-sheet {
  background: rgba(15, 23, 42, 0.98);
  border-color: #334155;
}

:global(html.dark) .ccp-sheet-title,
:global(html.dark) .ccp-hex {
  color: #e2e8f0;
}

:global(html.dark) .ccp-secondary {
  background: #1e293b;
  border-color: #475569;
  color: #e2e8f0;
}

:global(html.dark) .ccp-preset-cell.active {
  border-color: #e2e8f0;
}
</style>
