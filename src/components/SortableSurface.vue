<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const DRAG_START_DISTANCE_PX = 8
const CLICK_SUPPRESS_MS = 220

const props = defineProps({
  id: {
    type: [String, Number],
    required: true
  },
  group: {
    type: String,
    required: true
  },
  section: {
    type: String,
    default: ''
  },
  tag: {
    type: String,
    default: 'div'
  },
  editing: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  surfaceClass: {
    type: [String, Array, Object],
    default: ''
  },
  surfaceStyle: {
    type: [String, Array, Object],
    default: ''
  }
})

const emit = defineEmits([
  'drag-start',
  'drag-move',
  'drag-end',
  'click',
  'pointerdown',
  'pointermove',
  'pointerleave'
])

const elementRef = ref(null)
const isDragging = ref(false)

let activePointerId = null
let dragPressing = false
let startPoint = { x: 0, y: 0 }
let lastPoint = { x: 0, y: 0 }
let suppressClickUntil = 0

const dragDisabled = computed(() => !props.editing || props.disabled)

const dragOffset = computed(() => ({
  x: lastPoint.x - startPoint.x,
  y: lastPoint.y - startPoint.y
}))

const mergedClass = computed(() => [
  props.surfaceClass,
  {
    editing: props.editing,
    dragging: isDragging.value
  }
])

const mergedStyle = computed(() => [
  props.surfaceStyle,
  {
    '--drag-translate-x': isDragging.value ? `${dragOffset.value.x}px` : '0px',
    '--drag-translate-y': isDragging.value ? `${dragOffset.value.y}px` : '0px'
  }
])

const setElementRef = (node) => {
  elementRef.value = node
}

const releaseDragTracking = () => {
  window.removeEventListener('pointermove', handleWindowPointerMove, true)
  window.removeEventListener('pointerup', handleWindowPointerUp, true)
  window.removeEventListener('pointercancel', handleWindowPointerUp, true)
  const node = elementRef.value
  if (node && activePointerId !== null && typeof node.releasePointerCapture === 'function') {
    try {
      node.releasePointerCapture(activePointerId)
    } catch {
      // ignore release failures from synthetic or already-cancelled pointers
    }
  }
  activePointerId = null
  dragPressing = false
  isDragging.value = false
  startPoint = { x: 0, y: 0 }
  lastPoint = { x: 0, y: 0 }
}

const beginDragTracking = (event) => {
  dragPressing = true
  activePointerId = event.pointerId
  startPoint = {
    x: Number(event.clientX || 0),
    y: Number(event.clientY || 0)
  }
  lastPoint = { ...startPoint }
  const node = elementRef.value
  if (node && typeof node.setPointerCapture === 'function') {
    try {
      node.setPointerCapture(event.pointerId)
    } catch {
      // ignore pointer capture failures from unsupported environments
    }
  }
  window.addEventListener('pointermove', handleWindowPointerMove, true)
  window.addEventListener('pointerup', handleWindowPointerUp, true)
  window.addEventListener('pointercancel', handleWindowPointerUp, true)
}

const handleWindowPointerMove = (event) => {
  if (!dragPressing || event.pointerId !== activePointerId) return
  emit('pointermove', event)
  const point = {
    x: Number(event.clientX || 0),
    y: Number(event.clientY || 0)
  }
  lastPoint = point
  const deltaX = point.x - startPoint.x
  const deltaY = point.y - startPoint.y
  if (!isDragging.value) {
    const distance = Math.hypot(deltaX, deltaY)
    if (distance < DRAG_START_DISTANCE_PX) {
      return
    }
    isDragging.value = true
    emit('drag-start', {
      id: props.id,
      section: props.section,
      point: { ...startPoint }
    })
  }
  event.preventDefault()
  emit('drag-move', {
    id: props.id,
    section: props.section,
    point,
    delta: {
      x: deltaX,
      y: deltaY
    }
  })
}

const handleWindowPointerUp = (event) => {
  if (!dragPressing || event.pointerId !== activePointerId) return
  const point = {
    x: Number(event.clientX || 0),
    y: Number(event.clientY || 0)
  }
  if (isDragging.value) {
    suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS
    emit('drag-end', {
      id: props.id,
      section: props.section,
      point,
      delta: {
        x: point.x - startPoint.x,
        y: point.y - startPoint.y
      }
    })
  }
  releaseDragTracking()
}

const handlePointerDownInternal = (event) => {
  emit('pointerdown', event)
  if (dragDisabled.value) return
  if (event.button !== undefined && event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  beginDragTracking(event)
}

const handleClickInternal = (event) => {
  if (Date.now() < suppressClickUntil) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}

onBeforeUnmount(() => {
  releaseDragTracking()
})
</script>

<template>
  <component
    :is="tag"
    :ref="setElementRef"
    :data-layout-id="String(id)"
    :data-layout-section="section"
    :class="mergedClass"
    :style="mergedStyle"
    @click="handleClickInternal"
    @pointerdown="handlePointerDownInternal"
    @pointermove="emit('pointermove', $event)"
    @pointerleave="emit('pointerleave', $event)"
  >
    <slot
      :is-dragging="isDragging"
      :is-overed="false"
    />
  </component>
</template>
