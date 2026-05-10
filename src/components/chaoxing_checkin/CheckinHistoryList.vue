<script setup>
import { computed } from 'vue'
import { TEmptyState, TStatusBadge } from '../templates'

const props = defineProps({
  entries: { type: Array, default: () => [] }
})

const maskStudentId = (id) => {
  if (!id || id.length < 4) return '****'
  return id.slice(0, 2) + '****' + id.slice(-2)
}

const typeLabel = (type) => {
  const map = {
    normal: '普通',
    location: '位置',
    photo: '拍照',
    qrcode: '二维码',
    gesture: '手势'
  }
  return map[type] || '签到'
}

const resultBadgeType = (result) => {
  if (result === 'success') return 'success'
  if (result === 'already_signed') return 'muted'
  return 'danger'
}

const resultLabel = (result) => {
  if (result === 'success') return '成功'
  if (result === 'already_signed') return '已签'
  return '失败'
}

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hh}:${mm}`
}

const sortedEntries = computed(() => {
  return [...props.entries].sort((a, b) => (b.submitted_at || 0) - (a.submitted_at || 0))
})
</script>

<template>
  <div class="history-list">
    <TEmptyState v-if="!sortedEntries.length" type="empty" message="暂无签到记录" icon="📋" />
    <div v-else class="history-list__items">
      <div v-for="entry in sortedEntries" :key="`${entry.active_id}-${entry.submitted_at}`" class="history-item glass-card">
        <div class="history-item__head">
          <span class="history-item__course">{{ entry.course_name }}</span>
          <TStatusBadge :type="resultBadgeType(entry.result)" :text="resultLabel(entry.result)" />
        </div>
        <div class="history-item__meta">
          <span>{{ typeLabel(entry.activity_type) }}</span>
          <span class="history-item__sep">·</span>
          <span>{{ maskStudentId(entry.student_id) }}</span>
          <span class="history-item__sep">·</span>
          <span>{{ formatTime(entry.submitted_at) }}</span>
        </div>
        <p v-if="entry.error_message && entry.result === 'failure'" class="history-item__error">
          {{ entry.error_message }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-list__items {
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--ui-space-scale));
}

.history-item {
  padding: calc(12px * var(--ui-space-scale));
  border-radius: calc(12px * var(--ui-radius-scale));
}

.history-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.history-item__course {
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item__meta {
  margin-top: 4px;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.history-item__sep {
  margin: 0 4px;
  opacity: 0.5;
}

.history-item__error {
  margin: 6px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
}
</style>
