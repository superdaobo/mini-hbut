<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  }
})

const normalizedItems = computed(() =>
  (Array.isArray(props.items) ? props.items : []).map((item) => ({
    ...item,
    className: `layout-collision-fx__node layout-collision-fx__node--${item?.kind || 'spark'}`,
    style: {
      '--fx-x': `${Number(item?.x || 0).toFixed(2)}px`,
      '--fx-y': `${Number(item?.y || 0).toFixed(2)}px`,
      '--fx-size': `${Number(item?.size || 0).toFixed(2)}px`,
      '--fx-radius': `${Number(item?.radius || 0).toFixed(2)}px`,
      '--fx-opacity': Number(item?.life || 0).toFixed(3),
      '--fx-color': String(item?.color || '#5b8cff')
    }
  }))
)
</script>

<template>
  <div v-if="normalizedItems.length" class="layout-collision-fx" aria-hidden="true">
    <div
      v-for="item in normalizedItems"
      :key="item.id"
      :class="item.className"
      :style="item.style"
    />
  </div>
</template>

<style scoped>
.layout-collision-fx {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 18;
}

.layout-collision-fx__node {
  position: absolute;
  left: 0;
  top: 0;
  opacity: var(--fx-opacity);
  will-change: transform, opacity;
}

.layout-collision-fx__node--spark,
.layout-collision-fx__node--core {
  width: var(--fx-size);
  height: var(--fx-size);
  border-radius: 999px;
  background: var(--fx-color);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.16),
    0 0 20px color-mix(in oklab, var(--fx-color) 72%, transparent);
  transform: translate3d(var(--fx-x), var(--fx-y), 0) translate(-50%, -50%);
}

.layout-collision-fx__node--core {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.22),
    0 0 28px color-mix(in oklab, var(--fx-color) 82%, transparent);
}

.layout-collision-fx__node--ring {
  width: calc(var(--fx-radius) * 2);
  height: calc(var(--fx-radius) * 2);
  border-radius: 999px;
  border: 2px solid color-mix(in oklab, var(--fx-color) 80%, rgba(255, 255, 255, 0.2));
  background:
    radial-gradient(circle, color-mix(in oklab, var(--fx-color) 18%, rgba(255, 255, 255, 0.08)) 0%, transparent 68%);
  box-shadow: 0 0 26px color-mix(in oklab, var(--fx-color) 32%, transparent);
  transform: translate3d(calc(var(--fx-x) - var(--fx-radius)), calc(var(--fx-y) - var(--fx-radius)), 0);
}
</style>
