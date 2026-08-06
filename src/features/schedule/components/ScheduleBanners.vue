<script setup>
/**
 * 课表横幅区：离线/假期/错误提示 + 回到当前周按钮。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 */
defineProps({
  offline: { type: Boolean, default: false },
  initialFetchDone: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  offlineBannerText: { type: String, default: '' },
  vacationNotice: { type: String, default: '' },
  errorMsg: { type: String, default: '' },
  currentWeek: { type: Number, default: 0 },
  selectedWeek: { type: Number, default: 0 },
})
const emit = defineEmits(['jump-current'])
</script>

<template>
  <!-- 在线刷新中不展示离线条，避免秒开缓存误报 10s「登录恢复」 -->
  <div v-if="offline && initialFetchDone && !loading" class="offline-banner">
    {{ offlineBannerText }}
  </div>

  <div v-if="vacationNotice" class="vacation-banner">
    {{ vacationNotice }}
  </div>

  <div v-if="errorMsg" class="error-banner">
    {{ errorMsg }}
  </div>

  <button
    v-if="currentWeek && selectedWeek && selectedWeek !== currentWeek"
    class="jump-current-btn"
    @click="emit('jump-current')"
    title="跳转到当前周"
  >
    回到当前周
  </button>
</template>

<style scoped>
.offline-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}

.vacation-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(217, 119, 6, 0.35);
  color: #92400e;
  border-radius: 12px;
  font-weight: 600;
}

.error-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(234, 88, 12, 0.12);
  border: 1px solid rgba(234, 88, 12, 0.3);
  color: #9a3412;
  border-radius: 12px;
  font-weight: 600;
}

.jump-current-btn {
  position: fixed;
  bottom: calc(84px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 18px;
  border: none;
  border-radius: 9999px;
  background: #111827;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
  z-index: 30;
}
</style>
