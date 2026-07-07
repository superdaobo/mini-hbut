<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { playCampusSpeech } from '../services/audio-service'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const detail = ref(store.navParams.spot || store.selectedSpot)
const loading = ref(false)

onMounted(async () => {
  const spotId = store.navParams.spotId || detail.value?.spot_id
  if (!spotId) return
  loading.value = true
  try {
    detail.value = await store.loadSpotDetail(spotId)
  } catch (err) {
    showToast((err as Error)?.message || '加载详情失败', 'error', 2200)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <GuidePageLayout title="地点详情" icon="place" @back="emit('back')">
    <div v-if="loading" class="campus-guide-muted">加载中…</div>
    <template v-else-if="detail">
      <h2 class="campus-guide-title">{{ detail.name }}</h2>
      <p class="campus-guide-muted">{{ detail.distancer }}</p>
      <article class="campus-guide-article">{{ detail.introduction || detail.info || '暂无详细介绍' }}</article>
      <div class="campus-guide-action-row">
        <button type="button" @click="playCampusSpeech(detail.speech, detail.introduction)">语音讲解</button>
        <button type="button" @click="store.toggleFavorite(detail)">
          {{ detail.is_saved ? '取消收藏' : '收藏' }}
        </button>
        <button
          type="button"
          class="primary"
          @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.walkline, { spot: detail, endPoint: detail.point })"
        >
          导航
        </button>
      </div>
    </template>
  </GuidePageLayout>
</template>