<script setup lang="ts">
import { computed } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()

const notice = computed(() => {
  const targetId = String(store.navParams.noticeId ?? '')
  return store.notices.find((item) => String(item.id) === targetId) ?? null
})
</script>

<template>
  <GuidePageLayout title="公告详情" icon="campaign" @back="emit('back')">
    <template v-if="notice">
      <h2 class="campus-guide-title">{{ notice.title }}</h2>
      <article class="campus-guide-article pre">{{ notice.content }}</article>
    </template>
  </GuidePageLayout>
</template>