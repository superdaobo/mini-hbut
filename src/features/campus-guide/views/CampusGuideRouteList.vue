<script setup lang="ts">
import { onMounted } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()

onMounted(() => {
  void store.loadTourRoutesDetailed()
})
</script>

<template>
  <GuidePageLayout title="游览路线" icon="route" @back="emit('back')">
    <ul class="campus-guide-list">
      <li v-for="(route, index) in store.tourRoutes" :key="route.road_id || index">
        <button
          type="button"
          @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.roadmap, { routeId: route.road_id, routeIndex: index })"
        >
          <strong>{{ route.name }}</strong>
          <span>{{ route.distancer || '' }}</span>
        </button>
      </li>
    </ul>
  </GuidePageLayout>
</template>