<script setup lang="ts">
import { onMounted } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()

onMounted(() => {
  void store.loadActivities()
})
</script>

<template>
  <GuidePageLayout title="校园活动" icon="event" @back="emit('back')">
    <ul class="campus-guide-list">
      <li v-for="item in store.activities" :key="item.activity_id || item.id">
        <button
          type="button"
          @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.activityDetail, { activityId: item.activity_id || item.id })"
        >
          <strong>{{ item.title }}</strong>
          <span>{{ item.start_time || '' }}</span>
        </button>
      </li>
    </ul>
  </GuidePageLayout>
</template>