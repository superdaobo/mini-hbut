<script setup lang="ts">
import { computed } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()

const activity = computed(() => {
  const targetId = String(store.navParams.activityId ?? '')
  return store.activities.find((item) => String(item.activity_id || item.id) === targetId) ?? null
})
</script>

<template>
  <GuidePageLayout title="活动详情" icon="event" @back="emit('back')">
    <template v-if="activity">
      <h2 class="campus-guide-title">{{ activity.title }}</h2>
      <p v-if="activity.start_time" class="campus-guide-muted">{{ activity.start_time }} - {{ activity.end_time }}</p>
      <article class="campus-guide-article">{{ activity.content || activity.introduction || '暂无活动详情' }}</article>
    </template>
    <p v-else class="campus-guide-muted">未找到活动</p>
  </GuidePageLayout>
</template>