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

import { TEmptyState, TPageHeader } from '../../../components/templates'
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
    {
      key: 'departmentId',
      labelKey: 'teacher.profile.field.departmentId',
      icon: 'apartment',
      value: data.departmentId
    }
  ].map((row) => ({ ...row, value: String(row.value || '').trim() || '—' }))
})

/** 有资料即展示（刷新中保留旧资料，页头图标转圈表示进行中）。 */
const showContent = computed(() => Boolean(profile.value))

onMounted(() => {
  void reload()
})
</script>

<template>
  <div class="teacher-profile-view">
    <TPageHeader :title="t('teacher.profile.title')" icon="badge" @back="emit('back')">
      <template #actions>
        <button
          class="header-action-btn"
          type="button"
          :aria-label="t('teacher.profile.refresh')"
          :disabled="loading"
          @click="reload"
        >
          <span class="material-symbols-outlined" :class="{ spinning: loading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="view-content">
      <TEmptyState
        v-if="loading && !profile"
        type="loading"
        :message="t('teacher.profile.loading')"
      />

      <TEmptyState
        v-else-if="hasError && !profile"
        type="error"
        :message="t(errorMessageKey)"
      >
        <button class="btn-retry" type="button" @click="reload">
          {{ t('teacher.profile.retry') }}
        </button>
      </TEmptyState>

      <TEmptyState
        v-else-if="isEmpty && !profile"
        type="empty"
        :message="t('teacher.profile.empty')"
      />

      <div v-else-if="showContent" class="panel-stack">
        <section class="profile-card">
          <div class="profile-gradient-bg"></div>
          <div class="profile-content">
            <div class="avatar-ring">
              <div class="avatar-circle">{{ avatarText }}</div>
            </div>
            <h2 class="profile-name">{{ profile?.name || '—' }}</h2>
            <p class="profile-id">{{ profile?.accountId || '—' }}</p>
            <span class="profile-badge">{{ roleText || '—' }}</span>
          </div>
        </section>

        <section class="info-card">
          <h3 class="card-section-title">{{ t('teacher.profile.section.details') }}</h3>
          <div class="info-grid">
            <article v-for="row in fields" :key="row.key" class="info-field">
              <span class="field-label">
                <span class="material-symbols-outlined field-icon">{{ row.icon }}</span>
                {{ t(row.labelKey) }}
              </span>
              <span class="field-value">{{ row.value }}</span>
            </article>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.teacher-profile-view {
  min-height: 100vh;
  background: var(--md-sys-color-background, #f6fafe);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  max-width: 448px;
  margin: 0 auto;
  padding-bottom: 6rem;
}

.header-action-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant, #424754);
  cursor: pointer;
  transition: background 0.2s;
}

.header-action-btn:hover {
  background: var(--md-sys-color-surface-container-low, #f0f4f8);
}

.header-action-btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

.header-action-btn .material-symbols-outlined.spinning {
  animation: refreshSpin 0.8s linear infinite;
}

@keyframes refreshSpin {
  to {
    transform: rotate(360deg);
  }
}

.view-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.profile-card {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border-radius: 24px;
  padding: 1.25rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow: hidden;
}

.profile-gradient-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 6rem;
  background: linear-gradient(to right, rgba(91, 134, 229, 0.2), rgba(54, 209, 220, 0.2));
}

.profile-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 1.5rem;
}

.avatar-ring {
  width: 6rem;
  height: 6rem;
  border-radius: 9999px;
  border: 4px solid var(--md-sys-color-surface-container-lowest, #ffffff);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 0.75rem;
}

.avatar-circle {
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #5b86e5, #36d1dc);
}

.profile-name {
  font-size: 20px;
  line-height: 28px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

.profile-id {
  font-size: 14px;
  line-height: 20px;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin: 0;
}

.profile-badge {
  margin-top: 0.75rem;
  background: var(--md-sys-color-secondary-container, #dce2f3);
  color: var(--md-sys-color-on-secondary-container, #5e6572);
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.info-card {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border-radius: 24px;
  padding: 1.25rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.card-section-title {
  font-size: 16px;
  line-height: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.info-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #424754);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.field-icon {
  font-size: 16px;
}

.field-value {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #171c1f);
}

.btn-retry {
  margin-top: 12px;
  padding: 0.5rem 1.25rem;
  border-radius: 9999px;
  border: none;
  background: var(--md-sys-color-primary, #0058be);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
</style>
