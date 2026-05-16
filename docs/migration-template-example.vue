<!--
  ============================================================================
  迁移参考模板 — ExamView (考试安排页面)
  ============================================================================

  本文件是一个完整迁移后的 Vue SFC 参考模板，展示如何将遗留 CSS 组件
  迁移到 Tailwind CSS + shadcn-vue 的 Apple 设计规范。

  ✅ 迁移要点：
  1. 零遗留 CSS class 引用 — 无 .glass-card, .btn, .back-btn, .view-header 等
  2. 所有样式通过 Tailwind 工具类表达 — 基于 design-tokens.ts 定义的令牌
  3. shadcn-vue 组件替换自定义 HTML — Button, Card, Badge, Select, Separator
  4. Apple 设计规范合规 — canvas-parchment 背景, 白色卡片, pill 按钮, 无阴影
  5. 正确的 @/components/ui/ 导入路径

  ❌ 禁止使用：
  - backdrop-filter: blur() (glass-morphism)
  - linear-gradient / radial-gradient 背景
  - box-shadow 在卡片或按钮上
  - 彩色图标背景
  - var(--ui-xxx) 遗留 CSS 变量
  - 任何 <style scoped> 中的自定义 CSS class

  📐 设计令牌对照：
  - 页面背景: bg-canvas-parchment (#f5f5f7)
  - 卡片: bg-white rounded-lg border border-hairline p-lg shadow-none
  - 主文字: text-ink (#1d1d1f)
  - 次要文字: text-ink-muted-48 (#7a7a7a)
  - 强调色: text-primary / bg-primary (#0066cc)
  - 边框: border-hairline (#e0e0e0)
  - 间距: p-lg (24px), gap-sm (12px), gap-md (17px)
  - 圆角: rounded-lg (18px), rounded-pill (9999px), rounded-sm (8px)
-->

<script setup lang="ts">
/**
 * 迁移决策说明：
 *
 * [导入] 从 @/components/ui/ 导入 shadcn-vue 组件
 * - Button 替代 <button class="btn">
 * - Card/CardHeader/CardContent 替代 <div class="glass-card">
 * - Badge 替代 <span class="exam-status-badge">
 * - Select 系列替代 <IOSSelect> 自定义组件
 * - Separator 替代 CSS border-bottom 分割线
 *
 * [逻辑] 保持所有业务逻辑不变，仅修改模板和样式
 * - 所有 computed, ref, 事件处理器原样保留
 * - API 调用逻辑不变
 */
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'
import { writeExamToWidget } from '../utils/widget_bridge'

// shadcn-vue 组件导入 — 从 @/components/ui/ 路径
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'


const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps<{
  studentId: string
}>()

const emit = defineEmits<{
  back: []
  logout: []
}>()

const loading = ref(false)
const error = ref('')
const exams = ref<any[]>([])
const semesters = ref<string[]>([])
const selectedSemester = ref('')
const currentSemester = ref('')
const offline = ref(false)
const syncTime = ref('')

// ─── 业务逻辑（迁移时保持不变）───────────────────────────────

const isPassed = (examDate: string | undefined): boolean => {
  if (!examDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(examDate)
  return date < today
}

const formatExamTime = (timeStr: string | undefined): string => {
  if (!timeStr) return ''
  const text = String(timeStr).trim()
  const match = text.match(/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/)
  if (match) return `${match[1]}~${match[2]}`
  const timeOnly = text.match(/^\d{1,2}:\d{2}/)
  if (timeOnly) return text
  return text
}

const formatExamDate = (dateStr: string | undefined): string => {
  if (!dateStr) return ''
  const text = String(dateStr).trim()
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  return text
}

const daysUntilExam = (examDate: string | undefined): number | null => {
  if (!examDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(examDate)
  date.setHours(0, 0, 0, 0)
  const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}

const getCountdownLabel = (examDate: string | undefined): string => {
  const days = daysUntilExam(examDate)
  if (days === null) return ''
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days < 0) return ''
  if (days <= 7) return `${days}天后`
  return ''
}

const processedExams = computed(() => {
  if (!exams.value) return []
  const future: any[] = []
  const passed: any[] = []
  exams.value.forEach((exam) => {
    if (isPassed(exam.exam_date)) {
      passed.push(exam)
    } else {
      future.push(exam)
    }
  })
  future.sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())
  passed.sort((a, b) => new Date(b.exam_date).getTime() - new Date(a.exam_date).getTime())
  return [...future, ...passed]
})

const futureCount = computed(() => processedExams.value.filter((e) => !isPassed(e.exam_date)).length)
const passedCount = computed(() => processedExams.value.filter((e) => isPassed(e.exam_date)).length)

// ─── API 调用（迁移时保持不变）───────────────────────────────

const fetchSemesters = async () => {
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    })
    if (data?.success) {
      const sorted = normalizeSemesterList(data.semesters || [])
      semesters.value = sorted
      currentSemester.value = resolveCurrentSemester(sorted, data.current || '')
      if (!selectedSemester.value) {
        selectedSemester.value = currentSemester.value || sorted[0] || ''
      }
    }
  } catch (e) {
    console.error('获取学期列表失败:', e)
  }
}

const fetchExams = async () => {
  loading.value = true
  error.value = ''
  try {
    const cacheKey = `exams:${props.studentId}:${selectedSemester.value || 'current'}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/exams`, {
        student_id: props.studentId,
        semester: selectedSemester.value,
      })
      return res.data
    })
    if (data?.success) {
      exams.value = data.data || []
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
      const futureExams = (data.data || []).filter((e: any) => !isPassed(e.exam_date))
      if (futureExams.length > 0) {
        const daysLeft = daysUntilExam(futureExams[0].exam_date)
        writeExamToWidget({
          exams: futureExams.slice(0, 3).map((e: any) => ({
            course_name: e.course_name || '',
            exam_date: e.exam_date || '',
            exam_time: e.exam_time || '',
            location: e.location || '',
          })),
          days_left: daysLeft ?? -1,
        }).catch(() => {})
      }
    } else {
      error.value = data?.error || '获取考试安排失败'
    }
  } catch (e: any) {
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    loading.value = false
  }
}

const handleSemesterChange = (value: string) => {
  selectedSemester.value = value
  fetchExams()
}

onMounted(async () => {
  await fetchSemesters()
  await fetchExams()
})
</script>


<template>
  <!--
    [迁移决策] 页面容器
    - 遗留: class="exam-view" + background: var(--ui-bg-gradient)
    - 迁移: min-h-screen bg-canvas-parchment + font-family-text
    - 原因: Apple 设计规范要求纯色平面背景，禁止渐变
  -->
  <div class="min-h-screen bg-canvas-parchment font-text">

    <!--
      [迁移决策] 页面 Header
      - 遗留: <TPageHeader> 自定义组件 (含 .view-header class)
      - 迁移: 原生 header 元素 + Tailwind 工具类 + shadcn-vue Button
      - 规范: 高度 52px, tagline 字体 (21px/600), 无阴影无渐变
    -->
    <header class="h-[52px] flex items-center justify-between px-lg bg-canvas-parchment">
      <!-- 返回按钮: button-secondary-pill 规范 -->
      <Button
        variant="outline"
        class="rounded-pill border-primary text-primary bg-white hover:bg-canvas-parchment"
        @click="emit('back')"
      >
        ← 返回
      </Button>

      <!-- 页面标题: tagline 字体 (21px, weight 600) -->
      <h1 class="text-tagline text-ink">
        考试安排
      </h1>

      <!-- 占位元素保持标题居中 -->
      <div class="w-[72px]" />
    </header>

    <!-- 内容区域: 使用 spacing-lg (24px) 内边距 -->
    <main class="px-lg pb-lg max-w-[800px] mx-auto">

      <!--
        [迁移决策] 离线提示横幅
        - 遗留: class="offline-banner" + 自定义 CSS
        - 迁移: Tailwind 工具类直接表达样式
        - 使用 design token 颜色而非硬编码 rgba
      -->
      <div
        v-if="offline"
        class="mb-md px-lg py-sm rounded-lg border border-hairline bg-white text-caption text-ink-muted-48"
      >
        当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
      </div>

      <!--
        [迁移决策] 学期选择器
        - 遗留: <IOSSelect> 自定义组件 + class="semester-selector"
        - 迁移: shadcn-vue Select 组件 + Card 容器
        - 卡片规范: bg-white rounded-lg border border-hairline p-lg shadow-none
      -->
      <Card class="mb-md shadow-none border-hairline">
        <CardContent class="flex items-center gap-sm p-lg">
          <span class="text-body-strong text-ink">选择学期：</span>
          <Select
            :model-value="selectedSemester"
            @update:model-value="handleSemesterChange"
          >
            <SelectTrigger class="w-[200px] rounded-sm border-hairline">
              <SelectValue placeholder="请选择学期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="sem in semesters"
                :key="sem"
                :value="sem"
              >
                {{ sem }}
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <!--
        [迁移决策] 统计摘要 Badge
        - 遗留: class="summary-capsule capsule-upcoming/capsule-passed"
        - 迁移: shadcn-vue Badge 组件 + Tailwind 工具类
        - Badge 使用 pill 圆角 (rounded-full 已内置于 Badge)
      -->
      <div v-if="!loading && exams.length > 0" class="flex gap-xs mb-md flex-wrap">
        <Badge
          v-if="futureCount > 0"
          variant="destructive"
          class="text-caption"
        >
          🔥 待考 {{ futureCount }} 科
        </Badge>
        <Badge
          v-if="passedCount > 0"
          variant="secondary"
          class="text-caption"
        >
          ✅ 已考 {{ passedCount }} 科
        </Badge>
      </div>

      <!--
        [迁移决策] 加载/错误/空状态
        - 遗留: <TEmptyState> 自定义组件
        - 迁移: 原生 HTML + Tailwind 工具类 + shadcn-vue Button
        - 保持语义和交互行为不变
      -->

      <!-- 加载状态 -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-xxl">
        <div class="w-[32px] h-[32px] border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p class="mt-md text-body text-ink-muted-48">正在获取考试安排...</p>
      </div>

      <!-- 错误状态 -->
      <Card v-else-if="error" class="shadow-none border-hairline">
        <CardContent class="flex flex-col items-center py-xl p-lg">
          <p class="text-body text-ink-muted-48 mb-sm">{{ error }}</p>
          <Button
            variant="default"
            class="rounded-pill"
            @click="fetchExams"
          >
            重试
          </Button>
        </CardContent>
      </Card>

      <!-- 空状态 -->
      <Card v-else-if="exams.length === 0" class="shadow-none border-hairline">
        <CardContent class="flex flex-col items-center py-xl p-lg">
          <p class="text-body text-ink-muted-48">本学期暂无考试安排</p>
        </CardContent>
      </Card>

      <!--
        [迁移决策] 考试列表
        - 遗留: class="exam-list" + class="exam-card"
        - 迁移: flex 布局 + shadcn-vue Card 组件
        - 卡片间距: gap-md (17px) — 符合 Design System spacing
      -->
      <div v-else class="flex flex-col gap-md">
        <Card
          v-for="(exam, index) in processedExams"
          :key="index"
          :class="[
            'shadow-none border-hairline transition-opacity duration-200',
            isPassed(exam.exam_date) ? 'opacity-55 border-dashed' : 'border-l-4 border-l-primary'
          ]"
        >
          <CardContent class="p-lg">
            <!--
              [迁移决策] 卡片头部
              - 遗留: class="exam-header" + class="header-left"
              - 迁移: flex 布局 Tailwind 工具类
            -->
            <div class="flex items-center justify-between mb-sm gap-xs">
              <div class="flex items-center gap-xs min-w-0 flex-1">
                <!-- 状态 Badge -->
                <Badge
                  v-if="isPassed(exam.exam_date)"
                  variant="secondary"
                  class="shrink-0"
                >
                  已结束
                </Badge>
                <Badge
                  v-else-if="getCountdownLabel(exam.exam_date)"
                  variant="destructive"
                  class="shrink-0"
                >
                  {{ getCountdownLabel(exam.exam_date) }}
                </Badge>

                <!--
                  [迁移决策] 课程名
                  - 遗留: class="course-name" (16px/700 + 自定义 CSS)
                  - 迁移: text-body-strong + truncate
                  - 已结束课程: 添加 line-through + text-ink-muted-48
                -->
                <span
                  :class="[
                    'text-body-strong truncate',
                    isPassed(exam.exam_date) ? 'text-ink-muted-48 line-through' : 'text-ink'
                  ]"
                >
                  {{ exam.course_name }}
                </span>
              </div>

              <!--
                [迁移决策] 考试类型标签
                - 遗留: class="exam-type-capsule" (自定义 CSS)
                - 迁移: Badge outline variant + primary 色
              -->
              <Badge
                v-if="exam.exam_type"
                variant="outline"
                class="shrink-0 text-primary border-primary"
              >
                {{ exam.exam_type }}
              </Badge>
            </div>

            <!-- 分割线: 使用 shadcn-vue Separator -->
            <Separator class="my-sm" />

            <!--
              [迁移决策] 考试详情
              - 遗留: class="exam-details" + class="detail-capsule capsule-date/time/..."
              - 迁移: flex-col 布局 + Tailwind 工具类
              - Apple 规范: 使用 ink/ink-muted-48 单色，不使用彩色胶囊
              - 原因: Apple 设计禁止多色装饰，使用统一的 caption 排版
            -->
            <div class="flex flex-col gap-xs">
              <div v-if="exam.exam_date" class="flex items-center gap-xs text-caption text-ink-muted-48">
                <span class="w-[16px] text-center">📅</span>
                <span>{{ formatExamDate(exam.exam_date) }}</span>
              </div>
              <div v-if="exam.exam_time" class="flex items-center gap-xs text-caption text-ink-muted-48">
                <span class="w-[16px] text-center">⏰</span>
                <span>{{ formatExamTime(exam.exam_time) }}</span>
              </div>
              <div v-if="exam.location" class="flex items-center gap-xs text-caption text-ink-muted-48">
                <span class="w-[16px] text-center">📍</span>
                <span>{{ exam.location }}</span>
              </div>
              <div v-if="exam.seat_no" class="flex items-center gap-xs text-caption text-ink-muted-48">
                <span class="w-[16px] text-center">💺</span>
                <span>座位号：{{ exam.seat_no }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>

<!--
  [迁移决策] 无 <style> 块
  - 遗留: 200+ 行 <style scoped> 自定义 CSS
  - 迁移: 完全移除，所有样式通过 Tailwind 工具类在模板中表达
  - 原因: 零遗留 CSS 依赖，组件可在移除 @layer legacy 后独立运行

  如果确实需要极少量自定义样式（如复杂动画），可使用：
  <style scoped>
  /* 仅允许使用 Tailwind @apply 或 CSS 自定义属性 */
  </style>

  但本模板演示的是完全零 CSS 的理想迁移状态。
-->
