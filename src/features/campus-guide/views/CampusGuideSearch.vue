<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { reportCampusSearchKeyword } from '../services/search-service'
import { useCampusGuideStore } from '../store/campus-guide-store'
import type { CampusSpot } from '../types'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const keyword = ref('')
const results = ref<CampusSpot[]>([])
const searching = ref(false)

let timer = 0
watch(keyword, (value) => {
  window.clearTimeout(timer)
  timer = window.setTimeout(async () => {
    const text = value.trim()
    if (!text) {
      results.value = []
      return
    }
    searching.value = true
    try {
      results.value = await store.searchSpotsByName(text)
    } finally {
      searching.value = false
    }
  }, 500)
})

const pickSpot = async (spot: CampusSpot) => {
  void reportCampusSearchKeyword(keyword.value || spot.name)
  await store.focusSpotOnHome(spot)
  emit('back')
}

onMounted(() => {
  void store.loadHotSearch()
})
</script>

<template>
  <GuidePageLayout title="搜索地点" icon="search" @back="emit('back')">
    <input v-model="keyword" class="campus-guide-input" placeholder="输入地点名称" />
    <div v-if="store.hotSearch.length" class="campus-guide-chip-list">
      <button
        v-for="item in store.hotSearch"
        :key="item"
        type="button"
        class="campus-guide-chip"
        @click="keyword = item"
      >
        {{ item }}
      </button>
    </div>
    <p v-if="searching" class="campus-guide-muted">搜索中…</p>
    <ul class="campus-guide-list">
      <li v-for="spot in results" :key="spot.spot_id">
        <button type="button" @click="pickSpot(spot)">
          <strong>{{ spot.name }}</strong>
          <span>{{ spot.distancer || '' }}</span>
        </button>
      </li>
    </ul>
  </GuidePageLayout>
</template>