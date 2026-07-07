<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { composePunchPostcard, loadPunchCards } from '../services/punch-service'

const emit = defineEmits(['back'])
const checkedTotal = ref(0)
const total = ref(0)
const composeUrl = ref('')
const loading = ref(true)
const composing = ref(false)

const canCompose = computed(() => total.value > 0 && checkedTotal.value >= total.value)

const refresh = async () => {
  const result = await loadPunchCards()
  checkedTotal.value = result.checkedTotal
  total.value = result.total
  composeUrl.value = result.compose_url || ''
}

const handleCompose = async () => {
  composing.value = true
  try {
    composeUrl.value = await composePunchPostcard()
    showToast('明信片已生成', 'success', 1500)
  } catch (err) {
    showToast((err as Error)?.message || '明信片生成失败', 'error', 2200)
  } finally {
    composing.value = false
  }
}

onMounted(async () => {
  try {
    await refresh()
  } catch (err) {
    showToast((err as Error)?.message || '加载失败', 'error', 2200)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <GuidePageLayout title="校庆明信片" icon="mail" @back="emit('back')">
    <p v-if="loading" class="campus-guide-muted">加载中…</p>
    <template v-else>
      <p class="campus-guide-muted">完成全部打卡点后可合成校庆明信片。</p>
      <div class="campus-phase2-progress">
        <strong>打卡进度</strong>
        <span>{{ checkedTotal }} / {{ total }}</span>
      </div>
      <button
        type="button"
        class="campus-guide-primary-btn"
        :disabled="!canCompose || composing"
        @click="handleCompose"
      >
        {{ composing ? '生成中…' : '生成明信片' }}
      </button>
      <img v-if="composeUrl" :src="composeUrl" alt="校庆明信片" class="campus-phase2-postcard" />
    </template>
  </GuidePageLayout>
</template>