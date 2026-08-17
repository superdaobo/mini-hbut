<script setup>
import { computed } from 'vue'
import { TStatusBadge } from '../templates'

const props = defineProps({
  activity: { type: Object, required: true },
  inflight: { type: Boolean, default: false }
})

const emit = defineEmits(['action'])

const typeLabel = computed(() => {
  const map = {
    normal: '普通签到',
    location: '位置签到',
    photo: '拍照签到',
    qrcode: '二维码签到',
    gesture: '手势签到'
  }
  return map[props.activity.activity_type] || '签到'
})

const typeIcon = computed(() => {
  const map = {
    normal: '✋',
    location: '📍',
    photo: '📷',
    qrcode: '📱',
    gesture: '✍️'
  }
  return map[props.activity.activity_type] || '✅'
})

const statusBadgeType = computed(() => {
  const map = {
    active: 'success',
    pending: 'info',
    signed: 'muted',
    expired: 'danger'
  }
  return map[props.activity.status] || 'muted'
})

const statusLabel = computed(() => {
  const map = {
    active: '进行中',
    pending: '待开始',
    signed: '已签到',
    expired: '已过期'
  }
  return map[props.activity.status] || '未知'
})

const actionDisabled = computed(() => {
  return props.inflight || props.activity.status !== 'active'
})

const actionText = computed(() => {
  if (props.inflight) return '提交中...'
  if (props.activity.status === 'signed') return '已签'
  if (props.activity.status === 'expired') return '已过期'
  return '签到'
})

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
</script>

<template>
  <div class="activity-card glass-card">
    <div class="activity-card__head">
      <span class="activity-card__icon">{{ typeIcon }}</span>
      <div class="activity-card__info">
        <p class="activity-card__course">{{ activity.course_name }}</p>
        <p class="activity-card__meta">
          {{ typeLabel }} · {{ activity.teacher_name }}
          <span v-if="activity.start_time" class="activity-card__time">
            {{ formatTime(activity.start_time) }}
          </span>
        </p>
      </div>
      <TStatusBadge :type="statusBadgeType" :text="statusLabel" />
    </div>
    <div class="activity-card__actions">
      <button
        class="activity-card__btn"
        :disabled="actionDisabled"
        @click="emit('action')"
      >
        {{ actionText }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.activity-card {
  padding: calc(14px * var(--ui-space-scale));
  border-radius: calc(14px * var(--ui-radius-scale));
}

.activity-card__head {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--ui-space-scale));
}

.activity-card__icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}

.activity-card__info {
  flex: 1;
  min-width: 0;
}

.activity-card__course {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-card__meta {
  margin: 2px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.activity-card__time {
  margin-left: 6px;
  opacity: 0.7;
}

.activity-card__actions {
  margin-top: calc(10px * var(--ui-space-scale));
  display: flex;
  justify-content: flex-end;
}

.activity-card__btn {
  padding: 8px 20px;
  border: none;
  border-radius: calc(10px * var(--ui-radius-scale));
  background: var(--ui-primary);
  color: #fff;
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.activity-card__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.activity-card__btn:not(:disabled):active {
  transform: scale(0.96);
}
</style>
