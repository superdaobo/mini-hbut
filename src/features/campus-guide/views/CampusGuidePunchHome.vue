<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { loadPunchCards } from '../services/punch-service'
import { useCampusGuideStore } from '../store/campus-guide-store'
import type { PunchCardListResult } from '../types/phase2'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const cards = ref<PunchCardListResult | null>(null)
const loading = ref(true)

const progressText = computed(() => {
  if (!cards.value) return ''
  return `${cards.value.checkedTotal} / ${cards.value.total}`
})

const refresh = async () => {
  loading.value = true
  try {
    cards.value = await loadPunchCards()
  } catch (err) {
    showToast((err as Error)?.message || '打卡数据加载失败', 'error', 2200)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <GuidePageLayout title="校庆打卡" icon="celebration" @back="emit('back')">
    <p v-if="loading" class="campus-guide-muted">加载中…</p>
    <template v-else-if="cards">
      <div class="campus-phase2-progress">
        <strong>打卡进度</strong>
        <span>{{ progressText }}</span>
      </div>
      <div class="campus-entrance-menu campus-phase2-menu">
        <button type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.punchMap)">地图打卡</button>
        <button type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.punchPostcard)">明信片</button>
        <button type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.punchAlumniCard)">校友卡</button>
        <button type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.punchMy)">我的</button>
      </div>
      <ul class="campus-guide-list compact">
        <li v-for="card in cards.card_list" :key="card.card_id">
          <div>
            <strong>{{ card.name }}</strong>
            <span>{{ card.is_check ? '已打卡' : '未打卡' }}</span>
          </div>
        </li>
      </ul>
    </template>
  </GuidePageLayout>
</template>