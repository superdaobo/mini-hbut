<script setup lang="ts">
// TeacherTeachingView（E5 #1025 负责实现）：我的教学（教学任务 / 教学班）占位视图。
// E0 阶段仅渲染「功能建设中」空态，**不发起任何网络请求**。

import TeacherPlaceholder from '../components/TeacherPlaceholder.vue'
</script>

<template>
  <TeacherPlaceholder
    title-key="teacher.teaching.comingSoon"
    description-key="teacher.common.comingSoonDesc"
  />
</template>
