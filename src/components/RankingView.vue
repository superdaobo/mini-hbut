<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'
import { TPageHeader, TEmptyState } from './templates'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const error = ref('')
const ranking = ref(null)
const semesters = ref([])
const selectedSemester = ref('')
const currentSemester = ref('')
const offline = ref(false)
const syncTime = ref('')
const retryCount = ref(0)

const MAX_RETRIES = 2

// 获取学期列表
const fetchSemesters = async () => {
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    }, undefined, { staleWhileRevalidate: true, priority: 'foreground' })
    if (data?.success) {
      const sorted = normalizeSemesterList(data.semesters || [])
      semesters.value = sorted
      currentSemester.value = resolveCurrentSemester(sorted, data.current || '')
      if (!selectedSemester.value) {
        selectedSemester.value = ''
      }
    }
  } catch (e) {
    console.error('获取学期列表失败:', e)
  }
}

// 获取排名（带自动重试）
const fetchRanking = async (forceRetry = false) => {
  if (!forceRetry) retryCount.value = 0
  loading.value = true
  error.value = ''

  const doFetch = async (attempt) => {
    try {
      const cacheKey = `ranking:${props.studentId}:${selectedSemester.value || 'all'}`
      const { data } = await fetchWithCache(cacheKey, async () => {
        const res = await axios.post(`${API_BASE}/v2/ranking`, {
          student_id: props.studentId,
          semester: selectedSemester.value
        })
        return res.data
      }, undefined, { staleWhileRevalidate: true, priority: 'foreground' })

      if (data?.success) {
        ranking.value = data.data || {}
        offline.value = !!data.offline
        syncTime.value = data.sync_time || ''
        return
      }

      // 若返回"会话已过期"尝试重试
      const errMsg = data?.error || ''
      if (attempt < MAX_RETRIES && (errMsg.includes('会话已过期') || errMsg.includes('登录'))) {
        console.warn(`[Ranking] 会话过期，第${attempt + 1}次重试...`)
        await new Promise(r => setTimeout(r, 800))
        return doFetch(attempt + 1)
      }
      error.value = errMsg || '获取排名失败'
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Ranking] 网络错误，第${attempt + 1}次重试:`, e)
        await new Promise(r => setTimeout(r, 1000))
        return doFetch(attempt + 1)
      }
      error.value = e.response?.data?.error || e.message || '网络错误，请稍后重试'
    }
  }

  await doFetch(0)
  loading.value = false
}

// 切换学期（清空重试计数）
const handleSemesterChange = () => {
  retryCount.value = 0
  fetchRanking()
}

onMounted(async () => {
  fetchRanking()
  fetchSemesters()
})
</script>

<template>
  <div class="ranking-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-20">
    <!-- Header -->
    <TPageHeader title="绩点排名" icon="emoji_events" @back="emit('back')" />

    <!-- Offline Banner -->
    <div v-if="offline" class="mx-4 mt-2 px-3 py-2 rounded-xl bg-error-container/60 text-on-error-container text-xs font-medium">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <main class="flex-1 w-full px-4 pt-5 flex flex-col gap-5">
      <!-- Semester Select -->
      <section class="flex flex-col gap-3">
        <div class="relative">
          <IOSSelect
            v-model="selectedSemester"
            @change="handleSemesterChange"
            class="w-full appearance-none bg-surface-container-lowest border-none shadow-[0_4px_15px_rgba(0,0,0,0.03)] rounded-xl py-3 px-4 text-base font-medium text-on-surface pr-10 focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="">全部(从入学至今)</option>
            <option v-for="sem in semesters" :key="sem" :value="sem">{{ sem }}</option>
          </IOSSelect>
          <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
        </div>
      </section>

      <!-- Loading / Error / Empty -->
      <TEmptyState v-if="loading" type="loading" message="正在获取排名数据..." />
      <TEmptyState v-else-if="error" type="error" :message="error">
        <button class="mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold text-sm" @click="fetchRanking">重试</button>
      </TEmptyState>
      <TEmptyState v-else-if="!ranking || !ranking.gpa" type="empty" message="暂无排名数据">
        <p class="text-on-surface-variant text-xs mt-1">该学期可能尚未公布排名</p>
      </TEmptyState>

      <!-- Ranking Content -->
      <template v-else>
        <!-- Student Info Hero Card -->
        <section class="bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end rounded-[24px] p-5 text-on-primary shadow-[0_10px_20px_rgba(54,209,220,0.3)] relative overflow-hidden">
          <div class="absolute inset-0 opacity-30 mix-blend-overlay" style="background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTU0LjYyNyAwTDYwIDUuMzczLjM3MyA2MEwwIDU0LjYyN1oiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==')"></div>
          <div class="relative z-10 flex justify-between items-start mb-6">
            <div>
              <h2 class="text-3xl font-bold leading-tight mb-1">{{ ranking.name || '-' }}</h2>
              <p class="text-sm text-on-primary/80">学号: {{ ranking.student_id || studentId }}</p>
            </div>
            <div class="bg-on-primary/20 backdrop-blur-sm rounded-lg px-3 py-1 text-xs font-medium border border-on-primary/30">
              {{ ranking.major || '-' }}
            </div>
          </div>
          <div class="relative z-10 grid grid-cols-2 gap-4">
            <div class="flex flex-col">
              <span class="text-[10px] font-semibold text-on-primary/70 mb-1">平均学分绩点 (GPA)</span>
              <div class="flex items-baseline gap-2">
                <span class="text-3xl font-bold leading-tight">{{ ranking.gpa || '-' }}</span>
                <span class="text-sm text-on-primary/80">/ 5.0</span>
              </div>
            </div>
            <div class="flex flex-col pl-4 border-l border-on-primary/20">
              <span class="text-[10px] font-semibold text-on-primary/70 mb-1">算术平均分</span>
              <span class="text-xl font-bold mt-1">{{ ranking.avg_score || '-' }}</span>
            </div>
          </div>
        </section>

        <!-- Ranking Tables -->
        <section class="grid grid-cols-1 gap-5">
          <h3 class="text-lg font-bold text-on-surface">综合排名概览</h3>

          <!-- GPA Ranking Card -->
          <div class="bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col gap-4 border border-outline-variant/20">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span class="material-symbols-outlined text-[18px]">trending_up</span>
              </div>
              <h4 class="text-base font-semibold text-on-surface">绩点排名</h4>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-semibold text-on-surface-variant mb-1">班级</span>
                <span class="text-xl font-bold text-primary">
                  <template v-if="ranking.gpa_class_rank">{{ ranking.gpa_class_rank }}<span class="text-[12px] text-on-surface-variant ml-1 font-normal">/{{ ranking.gpa_class_total }}</span></template>
                  <template v-else>-</template>
                </span>
              </div>
              <div class="bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-semibold text-on-surface-variant mb-1">专业</span>
                <span class="text-xl font-bold text-primary">
                  <template v-if="ranking.gpa_major_rank">{{ ranking.gpa_major_rank }}<span class="text-[12px] text-on-surface-variant ml-1 font-normal">/{{ ranking.gpa_major_total }}</span></template>
                  <template v-else>-</template>
                </span>
              </div>
              <div class="bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-semibold text-on-surface-variant mb-1">学院</span>
                <span class="text-xl font-bold text-primary">
                  <template v-if="ranking.gpa_college_rank">{{ ranking.gpa_college_rank }}<span class="text-[12px] text-on-surface-variant ml-1 font-normal">/{{ ranking.gpa_college_total }}</span></template>
                  <template v-else>-</template>
                </span>
              </div>
            </div>
          </div>

          <!-- Average Score Ranking Card -->
          <div class="bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col gap-4 border border-outline-variant/20">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-full bg-success-teal/10 flex items-center justify-center text-success-teal">
                <span class="material-symbols-outlined text-[18px]">bar_chart</span>
              </div>
              <h4 class="text-base font-semibold text-on-surface">平均分排名</h4>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-semibold text-on-surface-variant mb-1">班级</span>
                <span class="text-xl font-bold text-success-teal">
                  <template v-if="ranking.avg_class_rank">{{ ranking.avg_class_rank }}<span class="text-[12px] text-on-surface-variant ml-1 font-normal">/{{ ranking.avg_class_total }}</span></template>
                  <template v-else>-</template>
                </span>
              </div>
              <div class="bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-semibold text-on-surface-variant mb-1">专业</span>
                <span class="text-xl font-bold text-success-teal">
                  <template v-if="ranking.avg_major_rank">{{ ranking.avg_major_rank }}<span class="text-[12px] text-on-surface-variant ml-1 font-normal">/{{ ranking.avg_major_total }}</span></template>
                  <template v-else>-</template>
                </span>
              </div>
              <div class="bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-semibold text-on-surface-variant mb-1">学院</span>
                <span class="text-xl font-bold text-success-teal">
                  <template v-if="ranking.avg_college_rank">{{ ranking.avg_college_rank }}<span class="text-[12px] text-on-surface-variant ml-1 font-normal">/{{ ranking.avg_college_total }}</span></template>
                  <template v-else>-</template>
                </span>
              </div>
            </div>
          </div>

          <!-- Update Time -->
          <div v-if="syncTime" class="mt-4 text-center">
            <p class="text-xs font-medium text-on-surface-variant">数据更新时间: {{ syncTime }}</p>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* Minimal scoped styles - layout handled by Tailwind */
</style>
