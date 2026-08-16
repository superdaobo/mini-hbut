<script setup>
/**
 * 课表顶部导航：菜单按钮 + 标题/学期 + 周次选择。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 */
defineProps({
  semester: { type: String, default: '' },
  selectedWeek: { type: Number, default: 0 },
  totalWeeks: { type: Number, default: 25 },
})
const emit = defineEmits(['update:selectedWeek', 'toggle-menu'])
</script>

<template>
  <div class="schedule-topbar">
    <button class="menu-btn btn-ripple" @click="emit('toggle-menu')" aria-label="打开课表菜单">
      <span class="material-symbols-outlined menu-icon">menu</span>
    </button>
    <div class="topbar-center">
      <h1 class="topbar-title">课表</h1>
      <p class="topbar-semester">{{ semester || '加载中...' }}</p>
    </div>
    <div class="topbar-right">
      <div class="week-selector">
        <IOSSelect :model-value="selectedWeek" @update:model-value="emit('update:selectedWeek', $event)">
          <option disabled :value="0">请选择周次</option>
          <option v-for="w in totalWeeks" :key="w" :value="w">第{{ w }}周</option>
        </IOSSelect>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px 6px;
  min-height: var(--topbar-height);
  background: #f9f9ff;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 4px 20px -2px rgba(59, 130, 246, 0.05);
  box-sizing: border-box;
}

.topbar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
}

.topbar-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  line-height: 1.2;
}

.topbar-semester {
  font-size: 11px;
  color: #9ca3af;
  margin: 2px 0 0;
}

.schedule-topbar .menu-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
}

.schedule-topbar .menu-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.week-selector {
  position: relative;
  background: transparent !important;
  padding: 0;
  min-height: 32px;
  border-radius: 9999px;
  border: none !important;
  box-shadow: none !important;
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
}

.week-selector :deep(.ios26-select-trigger) {
  min-height: 32px !important;
  height: 32px !important;
  line-height: 32px;
  font-size: 13px;
  font-weight: 800;
  padding: 0 11px !important;
  border-radius: 9999px !important;
  background: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
  border: 1px solid #f0f0f0 !important;
}

.week-selector :deep(.ios26-select-value) {
  white-space: nowrap;
}

.week-selector :deep(.ios26-select-trigger:focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 768px) {
  .schedule-topbar {
    padding: 8px 12px 6px;
  }

  .week-selector {
    padding: 6px 12px;
  }

  .week-selector :deep(.ios26-select-trigger) {
    min-height: 30px !important;
    height: 30px !important;
    line-height: 30px !important;
    font-size: 12px;
    font-weight: 800;
    border-radius: 9999px !important;
  }
}
</style>
