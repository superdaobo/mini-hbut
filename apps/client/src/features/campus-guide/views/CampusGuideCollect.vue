<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { normalizeSpotList } from '../api/normalize'
import { campusGuideApi } from '../api/wisdom_client'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import { getCampusGuideOpenId } from '../services/device-id'
import { useCampusGuideStore } from '../store/campus-guide-store'
import type { CampusSpot } from '../types'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const favorites = ref<CampusSpot[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    await store.loadFavorites()
    const raw = await campusGuideApi.getSaveSpotList({
      scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
      open_id: getCampusGuideOpenId(),
      pn: 1,
      rn: 200
    })
    favorites.value = normalizeSpotList(raw)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <GuidePageLayout title="我的收藏" icon="favorite" @back="emit('back')">
    <p v-if="loading" class="campus-guide-muted">加载中…</p>
    <ul v-else class="campus-guide-list">
      <li v-for="spot in favorites" :key="spot.spot_id">
        <button type="button" @click="store.focusSpotOnHome(spot); emit('back')">
          <strong>{{ spot.name }}</strong>
        </button>
      </li>
    </ul>
    <p v-if="!loading && !favorites.length" class="campus-guide-muted">暂无收藏地点</p>
  </GuidePageLayout>
</template>