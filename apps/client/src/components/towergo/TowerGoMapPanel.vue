<script setup lang="ts">
/**
 * 小塔出行地图面板（#1375）：全屏地图 + 右下角定位 FAB + 中央 fallback 卡片。
 * 地图实例与数据状态都在父组件（TowerGoView / useTowerGoMap），这里只渲染
 * 容器与覆盖层：fallback 卡片经 default slot 由父组件注入（CSP 契约要求
 * map-fallback* 标记留在 TowerGoView.vue）。
 */
import { onMounted, ref } from 'vue'
import type { TowerGoVehicle } from '../../utils/towergo_map'

withDefaults(
  defineProps<{
    /** FAB 与选中浮卡离底部的预留（移动端的抽屉高度，桌面为 0） */
    sheetClearance?: number
    locating?: boolean
    /** 是否显示定位 FAB（fallback 失败态下隐藏，避免误导） */
    showFab?: boolean
    selectedVehicle?: TowerGoVehicle | null
    routeIsStraight?: boolean
    formatDistance?: (meters: unknown) => string
  }>(),
  {
    sheetClearance: 0,
    locating: false,
    showFab: true,
    selectedVehicle: null,
    routeIsStraight: false,
    formatDistance: (meters: unknown) => `${Math.round(Number(meters) || 0)}m`
  }
)

const emit = defineEmits<{
  mapReady: [el: HTMLElement | null]
  locate: []
  navigate: []
  close: []
}>()

/** 地图容器节点：挂到 mapEl 后在 mounted 时回传父组件（父组件持有 ref） */
const mapEl = ref<HTMLElement | null>(null)
onMounted(() => emit('mapReady', mapEl.value))

const onLocate = () => emit('locate')
const onNavigate = () => emit('navigate')
const onClose = () => emit('close')
</script>

<template>
  <section class="tg-map-panel tg-map-panel--fs">
    <!-- 地图容器必须独占 DOM，fallback 不可塞进 map 节点内（#370） -->
    <div ref="mapEl" class="tg-map tg-map--fs" />

    <!-- fallback / loading 覆盖层（父组件注入，含重试入口） -->
    <slot />

    <!-- 定位 FAB：原 map-toolbar 精简为单按钮，跟随抽屉高度悬浮 -->
    <button
      v-if="showFab"
      type="button"
      class="tg-icon-btn tg-fab"
      :style="{ bottom: `calc(${sheetClearance + 20}px + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))` }"
      :disabled="locating"
      :aria-label="locating ? '定位中' : '定位'"
      :title="locating ? '定位中' : '定位'"
      @click="onLocate"
    >
      <span class="material-symbols-outlined">my_location</span>
    </button>

    <!-- 选中车辆浮卡 + 到车 -->
    <div
      v-if="selectedVehicle"
      class="tg-vehicle-pop tg-vehicle-pop--apple"
      :style="{ bottom: `calc(${sheetClearance + 16}px + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))` }"
    >
      <span class="vehicle-icon material-symbols-outlined">electric_bike</span>
      <div class="pop-main">
        <strong>NO.{{ selectedVehicle.id || selectedVehicle.imei || '--' }}</strong>
        <small>
          {{ formatDistance(selectedVehicle.distance) }} · 电量 {{ selectedVehicle.battery || '--' }}%
          <template v-if="routeIsStraight"> · 直线示意</template>
        </small>
      </div>
      <button class="pop-nav" type="button" @click="onNavigate">到这</button>
      <button class="pop-close" type="button" aria-label="取消选中" @click="onClose">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* 定位 FAB：圆形，压在抽屉上方（bottom 由父组件按抽屉高度计算） */
.tg-fab {
  position: absolute;
  right: 16px;
  z-index: 12;
  width: 48px;
  height: 48px;
  min-height: 48px;
  padding: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-soft);
  cursor: pointer;
  transition: bottom var(--ui-duration-normal) var(--ui-ease-out);
}

.tg-fab:hover:not(:disabled) {
  border-color: var(--ui-primary);
  color: var(--ui-primary);
}

.tg-fab .material-symbols-outlined {
  font-size: 22px;
}
</style>
