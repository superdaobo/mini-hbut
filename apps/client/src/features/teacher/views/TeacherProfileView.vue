<script setup lang="ts">
// TeacherProfileView（E2 #1022）：教师个人资料。
//
// 展示字段**仅限有真实只读来源**的四项（recon 02 §2.1/§2.2）：
//   工号（`.admin_name` / `currentUserName`）、姓名（`.arrowbt`）、
//   教师身份（`#roleId` = `js`）、部门 ID（`currentDepartmentId`）。
//
// 明确**不展示**：部门名称、职称、邮箱 —— 只读勘察无真实来源，不猜测、不编造。
// 视觉原子（页头 / 资料卡 / 信息网格 / 加载与空态）复用现有组件与样式语言，
// **不复用** StudentInfoView 的数据模型。

import { computed, onMounted } from 'vue'

import { TCard, TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n } from '../../../utils/app_i18n'
import {
  TEACHER_ROLE_ID,
  TEACHER_ROLE_LABEL_KEY,
  useTeacherProfile
} from '../composables/useTeacherProfile'

const emit = defineEmits<{ back: [] }>()

const { t } = useI18n()

const { profile, loading, isEmpty, hasError, errorMessageKey, reload } = useTeacherProfile()

/** 头像文字：姓名首字优先，其次工号；两者皆空时用占位符。 */
const avatarText = computed(() => {
  const source = String(profile.value?.name || profile.value?.accountId || '').trim()
  return source ? source.charAt(0) : '?'
})

/** 教师身份文案：`js` 映射为本地化「教师」；其余原样回显（不猜测语义）。 */
const roleText = computed(() => {
  const roleId = String(profile.value?.roleId || '').trim()
  if (!roleId) return ''
  return roleId === TEACHER_ROLE_ID ? t(TEACHER_ROLE_LABEL_KEY) : roleId
})

/** 仅四项有来源的字段；缺失值用占位符，绝不填充猜测内容。 */
const fields = computed(() => {
  const data = profile.value
  if (!data) return []
  return [
    { key: 'accountId', labelKey: 'teacher.profile.field.accountId', icon: 'badge', value: data.accountId },
    { key: 'name', labelKey: 'teacher.profile.field.name', icon: 'person', value: data.name },
    { key: 'role', labelKey: 'teacher.profile.field.role', icon: 'school', value: roleText.value },
    ...(data.departmentName ? [{
      key: 'departmentName',
      labelKey: 'teacher.profile.field.departmentName',
      icon: 'apartment',
      value: data.departmentName
    }] : [])
  ].map((row) => ({ ...row, value: String(row.value || '').trim() || '—' }))
})

/** 有资料即展示（刷新中保留旧资料，页头图标转圈表示进行中）。 */
const showContent = computed(() => Boolean(profile.value))

onMounted(() => {
  void reload()
})
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface max-w-[448px] mx-auto pb-24">
    <TPageHeader :title="t('teacher.profile.title')" icon="badge" @back="emit('back')">
      <template #actions>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.profile.refresh')" :disabled="loading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': loading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="p-4 space-y-4">
      <TEmptyState v-if="loading && !profile" type="loading" :message="t('teacher.profile.loading')" />
      <TEmptyState v-else-if="hasError && !profile" type="error" :message="t(errorMessageKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">{{ t('teacher.profile.retry') }}</button>
      </TEmptyState>
      <TEmptyState v-else-if="isEmpty && !profile" :message="t('teacher.profile.empty')" />

      <template v-else-if="showContent">
        <TCard>
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
              {{ avatarText }}
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="font-bold text-lg text-on-surface truncate">{{ profile?.name || '—' }}</h2>
              <p class="text-sm text-on-surface-variant mt-1">{{ t('teacher.profile.field.accountId') }}：{{ profile?.accountId || '—' }}</p>
              <span class="inline-flex mt-2 px-2 py-1 bg-surface-container-high text-xs text-on-surface rounded-full">
                {{ roleText || '—' }}
              </span>
            </div>
          </div>
        </TCard>
        <TCard>
          <h3 class="font-bold text-on-surface mb-3">{{ t('teacher.profile.section.details') }}</h3>
          <dl class="divide-y divide-outline-variant/30">
            <div v-for="row in fields" :key="row.key" class="flex gap-4 justify-between py-3 first:pt-0 last:pb-0">
              <dt class="text-sm text-on-surface-variant flex items-center gap-2">
                <span class="material-symbols-outlined text-base text-on-surface-variant" aria-hidden="true">{{ row.icon }}</span>
                {{ t(row.labelKey) }}
              </dt>
              <dd class="text-sm font-semibold text-on-surface text-right min-w-0 break-words">{{ row.value }}</dd>
            </div>
          </dl>
        </TCard>
      </template>
    </main>
  </div>
</template>
