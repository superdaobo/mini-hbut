<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CampusMapCore } from '../map/campus-map-core'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const mapContainerRef = ref<HTMLElement | null>(null)
const mapCore = ref<CampusMapCore | null>(null)

const route = computed(() => {
  const index = store.navParams.routeIndex ?? 0
  return store.tourRoutes[index] || null
})

onMounted(async () => {
  await nextTick()
  const container = mapContainerRef.value
  if (!container || !route.value) return
  const core = new CampusMapCore(container, { center: store.mapCenter })
  await core.init()
  if (route.value.road_point?.length) core.renderPolylines(route.value.road_point)
  if (route.value.spot_list?.length) core.renderSpots(route.value.spot_list)
  const points = (route.value.road_point || []).flat()
  if (points.length) core.fitPoints(points)
  mapCore.value = core
})

onBeforeUnmount(() => {
  mapCore.value?.destroy()
  mapCore.value = null
})
</script>

<template>
  <GuidePageLayout :title="route?.name || '路线地图'" icon="map" @back="emit('back')">
    <div class="campus-guide-map-shell campus-guide-map-shell--compact">
      <div ref="mapContainerRef" class="campus-guide-map-canvas" />
    </div>
    <ul v-if="route?.spot_list?.length" class="campus-guide-list compact">
      <li v-for="spot in route.spot_list" :key="spot.spot_id">{{ spot.name }}</li>
    </ul>
  </GuidePageLayout>
</template>