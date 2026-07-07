<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CampusMapCore } from '../map/campus-map-core'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const mapContainerRef = ref<HTMLElement | null>(null)
const mapCore = ref<CampusMapCore | null>(null)
const activeIndex = ref(0)

const renderRoute = async (index: number) => {
  activeIndex.value = index
  const route = store.busRoads[index]
  if (!mapCore.value || !route?.road_point?.length) return
  mapCore.value.renderPolylines(route.road_point, '#16a34a')
  mapCore.value.fitPoints(route.road_point.flat())
}

onMounted(async () => {
  await nextTick()
  const container = mapContainerRef.value
  if (!container) return
  const core = new CampusMapCore(container, { center: store.mapCenter })
  await core.init()
  mapCore.value = core
  if (store.busRoads.length) await renderRoute(0)
})

onBeforeUnmount(() => {
  mapCore.value?.destroy()
  mapCore.value = null
})
</script>

<template>
  <GuidePageLayout title="班车路线" icon="directions_bus" @back="emit('back')">
    <div class="campus-guide-chip-list">
      <button
        v-for="(route, index) in store.busRoads"
        :key="route.road_id || index"
        type="button"
        class="campus-guide-chip"
        :class="{ active: index === activeIndex }"
        @click="renderRoute(index)"
      >
        {{ route.name }}
      </button>
    </div>
    <div class="campus-guide-map-shell campus-guide-map-shell--compact">
      <div ref="mapContainerRef" class="campus-guide-map-canvas" />
    </div>
  </GuidePageLayout>
</template>