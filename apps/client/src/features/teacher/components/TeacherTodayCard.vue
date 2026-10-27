<script setup lang="ts">
// Teacher Portal V2（E1 #1021）：教师首页「今日授课」条目补充信息。
//
// 只做展示，不发任何网络请求：
//   - 教学班（`class_name`，如「26建筑学1,26建筑学2」）
//   - 人数（`class_size`，教师课表专属字段，学生端为空）
//   - 教室（`room`）
//
// 学生端**不渲染**本组件（Dashboard 用 `isTeacherHome` 分流），因此不会出现
// 教师语义混入学生今日安排的情况。

import { computed } from 'vue'
import { useI18n } from '../../../utils/app_i18n'

const { t } = useI18n()

const props = defineProps<{
  /** 今日授课条目（教务课表条目或个人日程） */
  course?: {
    className?: string
    classSize?: string
    room?: string
  } | null
  /** 高亮卡片（蓝底白字）用 `active`，其余用 `muted` */
  variant?: 'active' | 'muted'
}>()

const className = computed(() => String(props.course?.className || '').trim())
const classSize = computed(() => String(props.course?.classSize || '').trim())
const room = computed(() => String(props.course?.room || '').trim())
const isActive = computed(() => props.variant === 'active')
</script>

<template>
  <div class="teacher-today-card" :class="isActive ? 'is-active' : 'is-muted'">
    <p v-if="className" class="teacher-today-card__line">
      <i class="fas fa-users" aria-hidden="true"></i>
      <span class="teacher-today-card__label">{{ t('teacher.home.today.classLabel') }}</span>
      <span class="teacher-today-card__value">{{ className }}</span>
      <span v-if="classSize" class="teacher-today-card__meta">
        · {{ t('teacher.home.today.sizeLabel') }} {{ classSize }}
      </span>
    </p>
    <p v-if="room" class="teacher-today-card__line">
      <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
      <span class="teacher-today-card__value">{{ room }}</span>
    </p>
  </div>
</template>

<style scoped>
.teacher-today-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
}

.teacher-today-card__line {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  min-width: 0;
}

.teacher-today-card__label {
  flex: 0 0 auto;
}

.teacher-today-card__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.teacher-today-card__meta {
  flex: 0 0 auto;
}

.teacher-today-card.is-muted {
  color: #6b7280;
}

.teacher-today-card.is-active {
  color: rgba(255, 255, 255, 0.92);
}

.teacher-today-card.is-active .teacher-today-card__label {
  color: rgba(255, 255, 255, 0.75);
}
</style>
