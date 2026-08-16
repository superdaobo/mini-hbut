<script setup>
/**
 * 周次选择器（底部弹层，Teleport 到 body）。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 */
defineProps({
  showWeekPicker: { type: Boolean, default: false },
  semesterWeekOptions: { type: Array, default: () => [] },
  selectedWeeks: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'toggle-week', 'select-all', 'clear-all'])
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-up">
      <div v-if="showWeekPicker" class="week-picker-mask" @click.self="emit('close')">
        <div class="week-picker-sheet">
          <div class="week-picker-header">
            <div class="week-picker-title">选择周次</div>
            <div class="week-picker-ops">
              <button @click="emit('select-all')">全选</button>
              <button @click="emit('clear-all')">清空</button>
            </div>
          </div>
          <div class="week-picker-grid">
            <button
              v-for="week in semesterWeekOptions"
              :key="week"
              class="week-cell"
              :class="{ active: selectedWeeks.includes(week) }"
              @click="emit('toggle-week', week)"
            >
              第{{ week }}周
            </button>
          </div>
          <button class="week-picker-confirm" @click="emit('close')">完成</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.week-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 520;
  background: rgba(15, 23, 42, 0.48);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.week-picker-sheet {
  width: min(100vw, 520px);
  max-height: min(78dvh, 620px);
  background: #ffffff;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
  box-shadow: 0 -20px 44px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.week-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.week-picker-title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.week-picker-ops {
  display: flex;
  gap: 8px;
}

.week-picker-ops button {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.week-picker-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
  padding-right: 2px;
}

.week-cell {
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  min-height: 42px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.week-cell.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.week-picker-confirm {
  width: 100%;
  min-height: 42px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.sheet-up-enter-active,
.sheet-up-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-up-enter-active .week-picker-sheet,
.sheet-up-leave-active .week-picker-sheet {
  transition: transform 0.24s ease;
}

.sheet-up-enter-from,
.sheet-up-leave-to {
  opacity: 0;
}

.sheet-up-enter-from .week-picker-sheet,
.sheet-up-leave-to .week-picker-sheet {
  transform: translateY(100%);
}

@media (max-width: 768px) {
  .week-picker-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
}
</style>
