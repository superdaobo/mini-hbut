<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits(['select', 'cancel'])

const overlayRef = ref(null)
const dragging = ref(false)
const startX = ref(0)
const startY = ref(0)
const currentX = ref(0)
const currentY = ref(0)

const rectStyle = () => {
  if (!dragging.value) return { display: 'none' }
  const x = Math.min(startX.value, currentX.value)
  const y = Math.min(startY.value, currentY.value)
  const w = Math.abs(currentX.value - startX.value)
  const h = Math.abs(currentY.value - startY.value)
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`
  }
}

const handleMouseDown = (e) => {
  dragging.value = true
  startX.value = e.clientX
  startY.value = e.clientY
  currentX.value = e.clientX
  currentY.value = e.clientY
}

const handleMouseMove = (e) => {
  if (!dragging.value) return
  currentX.value = e.clientX
  currentY.value = e.clientY
}

const handleMouseUp = () => {
  if (!dragging.value) return
  dragging.value = false

  const x = Math.min(startX.value, currentX.value)
  const y = Math.min(startY.value, currentY.value)
  const w = Math.abs(currentX.value - startX.value)
  const h = Math.abs(currentY.value - startY.value)

  // 最小选区 20x20
  if (w < 20 || h < 20) {
    emit('cancel')
    return
  }

  // 考虑 DPR 换算
  const dpr = window.devicePixelRatio || 1
  emit('select', {
    x: Math.round(x * dpr),
    y: Math.round(y * dpr),
    w: Math.round(w * dpr),
    h: Math.round(h * dpr)
  })
}

const handleKeyDown = (e) => {
  if (e.key === 'Escape') {
    emit('cancel')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="overlayRef"
      class="screen-select-overlay"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
    >
      <div class="screen-select-overlay__hint">
        拖拽选择包含二维码的区域，按 Esc 取消
      </div>
      <div class="screen-select-overlay__rect" :style="rectStyle()"></div>
    </div>
  </Teleport>
</template>

<style scoped>
.screen-select-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0, 0, 0, 0.3);
  cursor: crosshair;
  user-select: none;
}

.screen-select-overlay__hint {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.screen-select-overlay__rect {
  position: absolute;
  border: 2px solid var(--ui-primary, #6366f1);
  background: rgba(99, 102, 241, 0.1);
  border-radius: 4px;
  pointer-events: none;
}
</style>
