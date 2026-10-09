<script setup lang="ts">
// TeacherNotificationView（E3 #1023 负责实现）：教师通知占位视图。
// E0 阶段仅渲染「功能建设中」空态，**不发起任何网络请求**。

import TeacherPlaceholder from '../components/TeacherPlaceholder.vue'
</script>

<template>
  <TeacherPlaceholder
    title-key="teacher.notification.comingSoon"
    description-key="teacher.common.comingSoonDesc"
  />
</template>
