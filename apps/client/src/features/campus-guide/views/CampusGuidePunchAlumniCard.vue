<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { loadStudentCard, saveStudentCard } from '../services/punch-service'
import type { StudentCardInfo } from '../types/phase2'

const emit = defineEmits(['back'])
const form = ref<StudentCardInfo>({})
const loading = ref(true)
const saving = ref(false)

const refresh = async () => {
  form.value = await loadStudentCard()
}

const handleSave = async () => {
  saving.value = true
  try {
    await saveStudentCard({
      name: form.value.name,
      college: form.value.college,
      major: form.value.major,
      grade: form.value.grade,
      student_no: form.value.student_no
    })
    await refresh()
    showToast('校友卡已保存', 'success', 1500)
  } catch (err) {
    showToast((err as Error)?.message || '保存失败', 'error', 2200)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await refresh()
  } catch (err) {
    showToast((err as Error)?.message || '校友卡加载失败', 'error', 2200)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <GuidePageLayout title="校友卡" icon="badge" @back="emit('back')">
    <p v-if="loading" class="campus-guide-muted">加载中…</p>
    <template v-else>
      <img v-if="form.card_url" :src="form.card_url" alt="校友卡" class="campus-phase2-postcard" />
      <label class="campus-guide-field">
        <span>姓名</span>
        <input v-model="form.name" class="campus-guide-input" />
      </label>
      <label class="campus-guide-field">
        <span>学院</span>
        <input v-model="form.college" class="campus-guide-input" />
      </label>
      <label class="campus-guide-field">
        <span>专业</span>
        <input v-model="form.major" class="campus-guide-input" />
      </label>
      <label class="campus-guide-field">
        <span>年级</span>
        <input v-model="form.grade" class="campus-guide-input" />
      </label>
      <label class="campus-guide-field">
        <span>学号</span>
        <input v-model="form.student_no" class="campus-guide-input" />
      </label>
      <button type="button" class="campus-guide-primary-btn" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中…' : '保存校友卡' }}
      </button>
    </template>
  </GuidePageLayout>
</template>