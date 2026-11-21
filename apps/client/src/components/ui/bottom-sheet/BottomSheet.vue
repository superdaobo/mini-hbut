<script setup lang="ts">
/**
 * 底部抽屉（非模态、三档吸附）—— #1375 T10 共享基础件。
 *
 * 为什么不用 `ui/sheet`：那套基于 reka-ui Dialog，是**模态**的（带全屏遮罩、
 * 点外部关闭），会把地图整个盖住。地图类页面需要「地图常驻可见 + 抽屉从底部
 * 升起」，所以单独实现一个轻量、无遮罩、可拖拽吸附的抽屉。
 *
 * 档位：
 * - `peek`：只露头部（默认 96px），地图占满视野
 * - `half`：半屏，列表与地图各一半
 * - `full`：接近全屏（88vh），专注列表/详情
 *
 * 交互：
 * - 拖拽头部手柄上下移动，实时跟手；释放后吸附到最近的档位
 * - 拖到 `peek` 以下继续下拉则保持在 `peek`（不自动关闭，避免误触丢失上下文）
 * - 桌面端同样支持鼠标拖拽
 *
 * 尺寸全部走 `--ui-space-*` / `--ui-radius-*` / `--ui-surface*` 设计变量，
 * 暗色由 `html.dark` 的变量覆盖自动适配，无需另写补丁。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export type BottomSheetSnap = 'peek' | 'half' | 'full'

const props = withDefaults(
  defineProps<{
    /** 当前档位 */
    modelValue?: BottomSheetSnap
    /** peek 档高度（px） */
    peekHeight?: number
    /** half 档占视口高度的比例 */
    halfRatio?: number
    /** full 档占视口高度的比例 */
    fullRatio?: number
    /** 头部是否显示拖拽手柄 */
    handle?: boolean
  }>(),
  {
    modelValue: 'half',
    peekHeight: 96,
    halfRatio: 0.5,
    fullRatio: 0.88,
    handle: true
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: BottomSheetSnap]
}>()

const dragging = ref(false)
/** 拖拽产生的额外高度（px，向上为正） */
const dragDelta = ref(0)

const viewportHeight = () => (typeof window === 'undefined' ? 800 : window.innerHeight)

const snapHeights = computed(() => {
  const vh = viewportHeight()
  return {
    peek: props.peekHeight,
    half: Math.round(vh * props.halfRatio),
    full: Math.round(vh * props.fullRatio)
  } as Record<BottomSheetSnap, number>
})

const maxHeight = computed(() => snapHeights.value.full)

/** 当前实际高度：基础档位 + 拖拽增量，钳制在 [peek, full] */
const currentHeight = computed(() => {
  const base = snapHeights.value[props.modelValue] ?? snapHeights.value.half
  const next = base + dragDelta.value
  return Math.max(props.peekHeight, Math.min(maxHeight.value, next))
})

/** 拖拽期间禁用 transition，松手后恢复（否则跟手有延迟） */
const sheetStyle = computed(() => ({
  height: `${currentHeight.value}px`,
  transition: dragging.value
    ? 'none'
    : `height calc(var(--ui-duration-normal) * var(--ui-motion-scale)) var(--ui-ease-out)`
}))

let startY = 0

const onPointerDown = (event: PointerEvent) => {
  // 只响应主键/单指
  if (event.button !== 0 && event.pointerType === 'mouse') return
  dragging.value = true
  startY = event.clientY
  dragDelta.value = 0
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value) return
  // 向上拖 → clientY 变小 → 高度增加
  dragDelta.value = startY - event.clientY
}

const onPointerUp = (event: PointerEvent) => {
  if (!dragging.value) return
  dragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)

  const height = currentHeight.value
  // 吸附到最近的档位
  const candidates: BottomSheetSnap[] = ['peek', 'half', 'full']
  let best: BottomSheetSnap = props.modelValue
  let bestDistance = Number.POSITIVE_INFINITY
  for (const snap of candidates) {
    const distance = Math.abs(snapHeights.value[snap] - height)
    if (distance < bestDistance) {
      bestDistance = distance
      best = snap
    }
  }
  dragDelta.value = 0
  if (best !== props.modelValue) emit('update:modelValue', best)
}

/** 键盘可达：手柄上 ↑/↓ 切换档位 */
const cycleSnap = (direction: 1 | -1) => {
  const order: BottomSheetSnap[] = ['peek', 'half', 'full']
  const index = order.indexOf(props.modelValue)
  const nextIndex = Math.max(0, Math.min(order.length - 1, index + direction))
  if (nextIndex !== index) emit('update:modelValue', order[nextIndex])
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    cycleSnap(1)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    cycleSnap(-1)
  }
}

/** 视口尺寸变化时重算（横竖屏切换） */
const onResize = () => {
  dragDelta.value = 0
}

watch(
  () => props.modelValue,
  () => {
    dragDelta.value = 0
  }
)

if (typeof window !== 'undefined') {
  window.addEventListener('resize', onResize)
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))
}

defineExpose({ currentHeight, snapHeights })
</script>

<template>
  <section
    class="bottom-sheet"
    :class="{ 'is-dragging': dragging }"
    :style="sheetStyle"
    data-testid="bottom-sheet"
    :data-snap="modelValue"
  >
    <header
      v-if="handle || $slots.header"
      class="bottom-sheet__header"
      role="button"
      tabindex="0"
      aria-label="拖动调整面板高度（上下方向键切换档位）"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <span v-if="handle" class="bottom-sheet__grabber" aria-hidden="true" />
      <slot name="header" />
    </header>

    <div class="bottom-sheet__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.bottom-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ui-surface);
  border-top: 1px solid var(--ui-surface-border);
  border-radius: var(--ui-radius-xl) var(--ui-radius-xl) 0 0;
  box-shadow: var(--ui-shadow-strong);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  will-change: height;
}

.bottom-sheet__header {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
  padding: var(--ui-space-sm) var(--ui-space-md) 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.bottom-sheet.is-dragging .bottom-sheet__header {
  cursor: grabbing;
}

.bottom-sheet__grabber {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: var(--ui-surface-border);
  margin-bottom: var(--ui-space-xs);
}

.bottom-sheet__header:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: -2px;
  border-radius: var(--ui-radius-lg);
}

.bottom-sheet__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* 底部留出 iPhone Home 指示条安全区，末项内容不被遮挡 */
  padding: 0 var(--ui-space-md) calc(var(--ui-space-lg) + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)));
}

@media (prefers-reduced-motion: reduce) {
  .bottom-sheet {
    transition: none !important;
  }
}
</style>
