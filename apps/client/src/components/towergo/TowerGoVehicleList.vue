<script setup lang="ts">
/**
 * 小塔出行车辆列表（#1375）：排序 / 电量筛选 / 空态与错误态 / 选中态。
 * 纯展示组件——排序与筛选是本地 UI 状态；车辆数据与选中逻辑由父组件下发。
 */
import { computed, ref } from 'vue'
import { batteryLevelTier, formatDistance, type TowerGoVehicle } from '../../utils/towergo_map'

const props = withDefaults(
  defineProps<{
    vehicles: TowerGoVehicle[]
    selectedId?: string
    loading?: boolean
    /** 错误态文案（mapErrors[0]） */
    errorMessage?: string
    total?: number
  }>(),
  {
    selectedId: '',
    loading: false,
    errorMessage: '',
    total: 0
  }
)

const emit = defineEmits<{
  select: [vehicle: TowerGoVehicle]
}>()

// 排序 / 电量筛选：本地 UI 状态，不回传
const sortBy = ref<'distance' | 'battery'>('distance')
const filterMinBattery = ref(0)

const sortedVehicles = computed(() => {
  const list = [...props.vehicles]
  const filtered = filterMinBattery.value > 0
    ? list.filter((v) => Number(v.battery) >= filterMinBattery.value)
    : list
  return filtered.sort((a, b) =>
    sortBy.value === 'battery'
      ? Number(b.battery) - Number(a.battery)
      : Number(a.distance) - Number(b.distance)
  )
})

const onSelect = (vehicle: TowerGoVehicle) => emit('select', vehicle)
</script>

<template>
  <section class="tg-list-panel">
    <div class="tg-filter-bar">
      <div class="seg" role="group" aria-label="排序方式">
        <button :class="{ active: sortBy === 'distance' }" @click="sortBy = 'distance'">按距离</button>
        <button :class="{ active: sortBy === 'battery' }" @click="sortBy = 'battery'">按电量</button>
      </div>
      <div class="seg" role="group" aria-label="电量筛选">
        <button :class="{ active: filterMinBattery === 0 }" @click="filterMinBattery = 0">全部</button>
        <button :class="{ active: filterMinBattery === 30 }" @click="filterMinBattery = 30">≥30%</button>
        <button :class="{ active: filterMinBattery === 60 }" @click="filterMinBattery = 60">≥60%</button>
      </div>
    </div>

    <div v-if="loading && !vehicles.length" class="empty-row">正在加载附近车辆…</div>
    <div v-else-if="!loading && !sortedVehicles.length" class="empty-row">
      {{ errorMessage || '暂无可展示车辆。' }}
    </div>
    <div v-else class="vehicle-scroll-list">
      <button
        v-for="vehicle in sortedVehicles.slice(0, 50)"
        :key="vehicle.id || vehicle.imei"
        class="vehicle-row"
        :class="{ active: selectedId && (vehicle.id === selectedId || vehicle.imei === selectedId) }"
        type="button"
        @click="onSelect(vehicle)"
      >
        <span
          class="vehicle-icon vehicle-icon--batt"
          :data-tier="batteryLevelTier(vehicle.battery)"
          :data-low="Number(vehicle.battery) < 30 ? '1' : '0'"
        >
          <span class="material-symbols-outlined">electric_bike</span>
          <em>{{ batteryLevelTier(vehicle.battery) }}</em>
        </span>
        <span class="vehicle-main">
          <strong>NO.{{ vehicle.id || vehicle.imei || '--' }}</strong>
          <small>{{ formatDistance(vehicle.distance) }} · 电量 {{ vehicle.battery || '--' }}%</small>
        </span>
        <span class="vehicle-batt" :data-low="Number(vehicle.battery) < 30 ? '1' : '0'">
          {{ vehicle.battery || '--' }}%
        </span>
      </button>
      <p v-if="sortedVehicles.length > 50" class="truncation-hint">
        （仅显示前 50 辆，地图上可见全部 {{ total }} 辆）
      </p>
    </div>
  </section>
</template>

<style scoped>
.tg-list-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
}

.tg-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-sm);
  justify-content: space-between;
}

.seg {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--ui-surface-border);
  border-radius: var(--ui-radius-md);
  background: color-mix(in srgb, var(--ui-surface) 86%, transparent);
}

.seg button {
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.seg button.active {
  background: var(--ui-primary);
  color: #fff;
}

.vehicle-scroll-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
}

.vehicle-row {
  width: 100%;
  min-width: 0;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--ui-surface) 86%, transparent);
  color: var(--ui-text);
  border-radius: var(--ui-radius-md);
  padding: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}

.vehicle-row.active,
.vehicle-row:hover {
  border-color: var(--ui-primary);
  background: var(--ui-primary-soft);
}

.vehicle-icon--batt {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: var(--ui-radius-md);
  background: #ecfdf3;
  color: var(--ui-success);
  display: grid;
  place-items: center;
}

.vehicle-icon--batt[data-low='1'] {
  background: #fef3f2;
  color: var(--ui-danger);
}

.vehicle-icon--batt em {
  position: absolute;
  right: -2px;
  bottom: -2px;
  min-width: 18px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--ui-success);
  color: #fff;
  font-size: 9px;
  font-style: normal;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

.vehicle-icon--batt[data-low='1'] em {
  background: var(--ui-danger);
}

.vehicle-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.vehicle-main strong,
.vehicle-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vehicle-main small {
  color: var(--ui-muted);
  font-size: 12px;
}

.vehicle-batt {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-primary);
}

.vehicle-batt[data-low='1'] {
  color: var(--ui-danger);
}

.empty-row {
  border: 1px dashed var(--ui-surface-border);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-md);
  color: var(--ui-muted);
  line-height: 1.5;
  text-align: center;
}

.truncation-hint {
  margin: 4px 0;
  color: var(--ui-muted);
  font-size: 12px;
  text-align: center;
}

button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

@media (max-width: 560px) {
  .tg-filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
