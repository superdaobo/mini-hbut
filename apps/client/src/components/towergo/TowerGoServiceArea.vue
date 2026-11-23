<script setup lang="ts">
/**
 * 小塔出行服务区面板（#1375）：当前服务区信息 + 停车点列表。纯展示组件。
 */
import type { TowerGoPoint } from '../../utils/towergo_map'

withDefaults(
  defineProps<{
    serviceName: string
    serviceId: string
    scanTimeText: string
    currentLocation: TowerGoPoint
    locationSourceText: string
    lastFetchCenter: TowerGoPoint | null
    parkingList: Array<Record<string, unknown>>
    refreshing?: boolean
  }>(),
  {
    refreshing: false
  }
)
</script>

<template>
  <section class="tg-area-panel">
    <article class="tg-area-card">
      <span>当前服务区</span>
      <strong>{{ serviceName }}</strong>
      <p>serviceId：{{ serviceId || '--' }} · 最近刷新 {{ scanTimeText }}</p>
      <p>
        自身定位：{{ Number(currentLocation.latitude).toFixed(5) }},
        {{ Number(currentLocation.longitude).toFixed(5) }}（{{ locationSourceText }}）
      </p>
      <p v-if="lastFetchCenter">
        最近查车中心：{{ Number(lastFetchCenter.latitude).toFixed(5) }},
        {{ Number(lastFetchCenter.longitude).toFixed(5) }}
      </p>
    </article>

    <article class="tg-area-card">
      <div class="card-head">
        <h3>停车点（{{ parkingList.length }}）</h3>
        <span v-if="refreshing" class="progress-chip">刷新中</span>
      </div>
      <div v-if="!parkingList.length" class="empty-row">暂无停车点数据</div>
      <ul v-else class="parking-list">
        <li v-for="(p, i) in parkingList" :key="String(p.id || i)">
          <span class="material-symbols-outlined">place</span>
          <div>
            <strong>{{ p.name || '未命名停车点' }}</strong>
            <small>当前 {{ p.carCount ?? '--' }} 辆 · 限停 {{ p.maxParkingNumber ?? '--' }}</small>
          </div>
        </li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
.tg-area-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
}

.tg-area-card {
  padding: var(--ui-space-md);
  border: 1px solid var(--ui-surface-border);
  border-radius: var(--ui-radius-lg);
  background: color-mix(in srgb, var(--ui-surface) 86%, transparent);
  box-shadow: var(--ui-shadow-soft);
  display: grid;
  gap: 6px;
}

.tg-area-card > span {
  color: var(--ui-muted);
  font-size: 12px;
}

.tg-area-card > strong {
  font-size: 18px;
}

.tg-area-card p {
  margin: 0;
  color: var(--ui-muted);
  font-size: 12px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-head h3 {
  margin: 0;
  font-size: 16px;
}

.progress-chip {
  flex: none;
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 12px;
  font-weight: 700;
}

.parking-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
}

.parking-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--ui-surface-border);
  border-radius: var(--ui-radius-md);
}

.parking-list .material-symbols-outlined {
  color: var(--ui-primary);
}

.parking-list strong {
  display: block;
  font-size: 14px;
}

.parking-list small {
  color: var(--ui-muted);
  font-size: 12px;
}

.empty-row {
  border: 1px dashed var(--ui-surface-border);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-md);
  color: var(--ui-muted);
  line-height: 1.5;
  text-align: center;
}
</style>
