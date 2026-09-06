<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useCampusMap } from '../features/campus-map/composables/useCampusMap'
import { getBuildingCategoryLabel } from '../features/campus-map/data/search'
import { showToast } from '../utils/toast'
import { TPageHeader } from './templates'
import { useLocale } from '../utils/app_i18n'

const { t } = useLocale()

/**
 * i18n 占位符插值：将 key 字典中的 {name} 占位替换为实际值。
 */
const tr = (key: string, params: Record<string, unknown> = {}) => {
  let text = t(key)
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value))
  }
  return text
}

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const mapContainerRef = ref<HTMLElement | null>(null)

const {
  loading,
  mapReady,
  errorText,
  degradedText,
  bundle,
  searchQuery,
  searchResults,
  selectedBuilding,
  routeLoading,
  routeError,
  routeResult,
  loadDataset,
  initMap,
  refreshLocation,
  applySearch,
  selectBuilding,
  clearSelection,
  planWalkingRoute,
  formatWalkingDistance,
  formatWalkingDuration
} = useCampusMap()

const handleRefresh = async () => {
  await loadDataset(true)
  if (mapContainerRef.value && bundle.value) {
    await initMap(mapContainerRef.value)
  }
  showToast(t('map.toast.refreshed'))
}

watch(searchQuery, () => applySearch())

onMounted(async () => {
  await refreshLocation()
  await loadDataset(false)
  await nextTick()
  await initMap(mapContainerRef.value)
})
</script>

<template>
  <div class="campus-map-view">
    <TPageHeader :title="t('map.title')" icon="map" @back="emit('back')">
      <template #actions>
        <button class="header-action" type="button" :disabled="loading" @click="handleRefresh">
          {{ loading ? t('map.btn.loading') : t('map.btn.refresh') }}
        </button>
      </template>
    </TPageHeader>

    <section v-if="degradedText" class="status-banner warn">{{ degradedText }}</section>
    <section v-if="errorText" class="status-banner error">{{ errorText }}</section>
    <section
      v-else-if="mapReady && bundle && !bundle.buildings?.length"
      class="status-banner warn"
    >
      {{ t('map.empty.buildings') }}
    </section>

    <section class="search-panel">
      <input
        v-model="searchQuery"
        class="search-input"
        type="search"
        :placeholder="t('map.search.placeholder')"
        autocomplete="off"
      />
      <button class="locate-btn" type="button" @click="refreshLocation">{{ t('map.btn.locate') }}</button>
    </section>

    <section class="map-shell">
      <div ref="mapContainerRef" class="map-host" :class="{ ready: mapReady }" />
      <div v-if="!mapReady && !errorText" class="map-placeholder">{{ t('map.loading') }}</div>
    </section>

    <section v-if="selectedBuilding" class="detail-card">
      <div class="detail-head">
        <div>
          <h3>{{ selectedBuilding.name }}</h3>
          <p>{{ getBuildingCategoryLabel(selectedBuilding.category) }}</p>
        </div>
        <button class="ghost-btn" type="button" @click="clearSelection">{{ t('map.detail.close') }}</button>
      </div>
      <p v-if="selectedBuilding.aliases?.length" class="detail-meta">
        {{ t('map.detail.aliasesPrefix') }}{{ selectedBuilding.aliases.join('、') }}
      </p>
      <div class="detail-actions">
        <button class="primary-btn" type="button" :disabled="routeLoading" @click="planWalkingRoute">
          {{ routeLoading ? t('map.btn.routing') : t('map.btn.walkNav') }}
        </button>
      </div>
      <p v-if="routeError" class="route-error">{{ routeError }}</p>
      <p v-else-if="routeResult" class="route-meta">
        {{ t('map.route.approxPrefix') }}{{ formatWalkingDistance(routeResult.distanceMeters) }} ·
        {{ formatWalkingDuration(routeResult.durationSeconds) }}
      </p>
    </section>

    <section class="results-panel">
      <div class="results-head">
        <h2>{{ t('map.results.title') }}</h2>
        <span>{{ tr('map.results.count', { n: searchResults.length }) }}</span>
      </div>
      <ul class="results-list">
        <li v-for="item in searchResults" :key="item.id">
          <button type="button" class="result-item" @click="selectBuilding(item)">
            <strong>{{ item.name }}</strong>
            <span>{{ getBuildingCategoryLabel(item.category) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.campus-map-view {
  min-height: 100vh;
  padding: 20px 20px 110px;
  background: var(--ui-bg-gradient, #f5f7fa);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.header-action {
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-primary-soft);
  color: var(--ui-text);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
}

.status-banner {
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
}

.status-banner.warn {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.status-banner.error {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.search-panel {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.search-input,
.locate-btn,
.result-item,
.primary-btn,
.ghost-btn {
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  color: var(--ui-text);
}

.search-input {
  padding: 12px 14px;
  font-size: 15px;
}

.locate-btn {
  padding: 0 16px;
  background: var(--ui-primary-soft);
}

.map-shell {
  position: relative;
  height: min(52vh, 420px);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-soft);
}

.map-host {
  width: 100%;
  height: 100%;
}

.map-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted, #64748b);
  font-size: 14px;
  pointer-events: none;
}

.detail-card,
.results-panel {
  border-radius: 16px;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-soft);
  padding: 14px;
}

.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.detail-head h3 {
  margin: 0;
  font-size: 18px;
}

.detail-head p,
.detail-meta,
.route-meta,
.route-error {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ui-text-muted, #64748b);
}

.route-error {
  color: #b91c1c;
}

.detail-actions {
  margin-top: 12px;
}

.primary-btn {
  width: 100%;
  padding: 12px;
  background: #6366f1;
  color: #fff;
  border-color: transparent;
}

.ghost-btn {
  padding: 8px 12px;
  background: var(--ui-primary-soft);
}

.results-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.results-head h2 {
  margin: 0;
  font-size: 16px;
}

.results-head span {
  font-size: 12px;
  color: var(--ui-text-muted, #64748b);
}

.results-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 240px;
  overflow: auto;
}

.result-item {
  width: 100%;
  text-align: left;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.result-item strong {
  font-size: 14px;
}

.result-item span {
  font-size: 12px;
  color: var(--ui-text-muted, #64748b);
  white-space: nowrap;
}
</style>
