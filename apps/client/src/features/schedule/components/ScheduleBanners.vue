<script setup>
/**
 * 课表横幅区：离线/假期/错误提示 + 回到当前周按钮。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 * #750：新增学期切换提示横幅（提前窗口内新学期课表未发布时展示）。
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
  termStartNotice: { type: String, default: '' },
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

  <!-- #750：提前窗口内新学期课表未发布，保持旧学期并提示将自动切换 -->
  <div v-if="termStartNotice" class="term-start-banner">
    {{ termStartNotice }}
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

/* #750：学期切换提示（信息级，蓝色系与回当前周按钮呼应） */
.term-start-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #1d4ed8;
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
  /* 恢复拆分前样式：页面右侧垂直居中、蓝色半透明背景（拆分时被误改为底部黑底） */
  position: fixed;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  padding: 10px 12px;
  border-radius: 14px;
  border: none;
  background: rgba(59, 130, 246, 0.85);
  color: white;
  font-weight: 600;
  font-size: 12px;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.3);
  cursor: pointer;
  z-index: 12;
}
</style>
