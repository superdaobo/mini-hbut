<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { getCampusGuideOpenId } from '../services/device-id'
import { loadPunchCards, loadStudentCard } from '../services/punch-service'
import { readYunyouUser } from '../services/phase2-storage'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const checkedTotal = ref(0)
const total = ref(0)
const studentName = ref('')
const yunyouName = ref(readYunyouUser()?.nickName || '')
const loading = ref(true)

onMounted(async () => {
  try {
    const [cards, student] = await Promise.all([loadPunchCards(), loadStudentCard()])
    checkedTotal.value = cards.checkedTotal
    total.value = cards.total
    studentName.value = student.name || ''
  } catch (err) {
    showToast((err as Error)?.message || '加载失败', 'error', 2200)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <GuidePageLayout title="我的校庆" icon="person" @back="emit('back')">
    <p v-if="loading" class="campus-guide-muted">加载中…</p>
    <template v-else>
      <div class="campus-phase2-profile">
        <p><strong>打卡进度</strong> {{ checkedTotal }} / {{ total }}</p>
        <p v-if="studentName"><strong>校友姓名</strong> {{ studentName }}</p>
        <p v-if="yunyouName"><strong>云游昵称</strong> {{ yunyouName }}</p>
        <p class="campus-guide-muted">OpenID：{{ getCampusGuideOpenId() }}</p>
      </div>
      <div class="campus-guide-action-row">
        <button type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.punchMap)">继续打卡</button>
        <button type="button" class="primary" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.punchAlumniCard)">
          编辑校友卡
        </button>
      </div>
    </template>
  </GuidePageLayout>
</template>