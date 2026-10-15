<script setup lang="ts">
// src/features/teacher/components/TeacherSyncBar.vue
//
// Teacher Portal V2（#1066）：教师业务页面统一的「上次成功同步」轻量状态栏。
//
// 语义（与 #1066 验收一致，绝不把打开页面/读缓存/刷新失败当成功同步）：
//   - synced   已同步：展示真实最后成功时间；
//   - updating 正在更新：保留原时间；
//   - cached   已缓存·离线：时间 + 可能过期提示；
//   - never    尚未同步：无成功时间；
//   - failed   更新失败：保留旧时间 + 错误提示。
//
// 无障碍：可见文案为相对时间，另有 sr-only 完整时间供读屏获取。
// 安全区：在内容底部追加 `env(safe-area-inset-bottom)` 内边距（**叠加**而非覆盖全局 pb-24）。

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useI18n, tf } from '../../../utils/app_i18n'
import {
  describeTeacherSyncTime,
  teacherSyncStatusKey,
  type TeacherSyncStatus
} from '../cache/teacher_sync_status'

const props = withDefaults(
  defineProps<{
    /** 同步状态语义。 */
    status: TeacherSyncStatus
    /** 最后一次成功同步时间（ISO / `YYYY-MM-DD HH:MM`）。 */
    lastSuccessfulSyncAt?: string
    /** 失败时展示的错误文案 i18n key（可选）。 */
    errorKey?: string
  }>(),
  { lastSuccessfulSyncAt: '', errorKey: '' }
)

// locale 参与依赖：切换语言时同步刷新时间文案（t() 读模块级 currentLocale）。
const { t, locale } = useI18n()

/** 相对时间需随时间推移刷新（60s 粒度即可）。 */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  timer = null
})

/** 相对时间文案（今天 23:40 / 3 分钟前 …）；无有效时间则为空串。 */
const timeText = computed(() => {
  void locale.value
  const descriptor = describeTeacherSyncTime(props.lastSuccessfulSyncAt, now.value)
  return descriptor ? tf(descriptor.key, descriptor.params) : ''
})

const statusText = computed(() => {
  void locale.value
  return t(teacherSyncStatusKey(props.status))
})

/** 读屏用完整文案：上次成功同步时间 + 状态。 */
const ariaText = computed(() => {
  const time = timeText.value || statusText.value
  return tf('teacher.sync.aria', { time, status: statusText.value })
})

const chipClass = computed(() => {
  if (props.status === 'synced') return 'bg-primary/10 text-primary'
  if (props.status === 'cached' || props.status === 'failed') {
    return 'bg-error-container/60 text-on-error-container'
  }
  return 'bg-surface-container-high text-on-surface-variant'
})

const showStaleHint = computed(
  () => props.status === 'cached' || props.status === 'failed'
)
</script>

<template>
  <footer
    class="mt-4 border-t border-outline-variant/30 pt-3"
    style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom))"
  >
    <div class="flex items-center gap-2 text-xs text-on-surface-variant">
      <span class="sr-only">{{ ariaText }}</span>
      <span class="material-symbols-outlined text-sm" aria-hidden="true">schedule</span>
      <span aria-hidden="true">
        {{ t('teacher.sync.label') }}
        <template v-if="timeText">：{{ timeText }}</template>
      </span>
      <span
        class="ml-auto px-2 py-0.5 rounded-full font-medium"
        :class="chipClass"
        aria-hidden="true"
      >
        {{ statusText }}
      </span>
    </div>
    <p v-if="showStaleHint" class="mt-1 text-xs text-on-surface-variant">
      {{ errorKey ? t(errorKey) : t('teacher.sync.staleHint') }}
    </p>
  </footer>
</template>
