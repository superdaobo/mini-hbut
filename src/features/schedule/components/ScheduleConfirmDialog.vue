<script setup>
/**
 * 课表确认对话框。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 */
defineProps({
  showConfirmDialog: { type: Boolean, default: false },
  confirmDialogTitle: { type: String, default: '' },
  confirmDialogLines: { type: Array, default: () => [] },
  confirmDialogConfirmText: { type: String, default: '确认' },
  confirmDialogCancelText: { type: String, default: '取消' },
  confirmDialogDanger: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm'])
</script>

<template>
  <Transition name="fade">
    <div v-if="showConfirmDialog" class="modal-overlay confirm-overlay" @click="emit('confirm', false)">
      <div class="modal-content confirm-modal" @click.stop>
        <div class="confirm-title">{{ confirmDialogTitle }}</div>
        <div class="confirm-lines">
          <p v-for="(line, idx) in confirmDialogLines" :key="`confirm-${idx}`">{{ line }}</p>
        </div>
        <div class="confirm-actions">
          <button class="confirm-btn cancel" @click="emit('confirm', false)">{{ confirmDialogCancelText }}</button>
          <button
            class="confirm-btn"
            :class="{ danger: confirmDialogDanger }"
            @click="emit('confirm', true)"
          >
            {{ confirmDialogConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.confirm-overlay {
  z-index: 360;
}

.confirm-modal {
  width: min(90vw, 360px);
  max-width: 360px;
  border-radius: 16px;
  padding: 16px;
}

.confirm-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.confirm-lines {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}

.confirm-lines p {
  margin: 0;
  font-size: 13px;
  color: #334155;
  line-height: 1.4;
}

.confirm-actions {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.confirm-btn {
  min-height: 36px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}

.confirm-btn.cancel {
  background: #e2e8f0;
  color: #334155;
}

.confirm-btn.danger {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
}
</style>
