<script setup lang="ts">
// TeacherExamsView（E6 #1026 负责实现）：考试与监考占位视图。
// E0 阶段仅渲染「功能建设中」空态，**不发起任何网络请求**。

import TeacherPlaceholder from '../components/TeacherPlaceholder.vue'
</script>

<template>
  <TeacherPlaceholder
    title-key="teacher.exams.comingSoon"
    description-key="teacher.common.comingSoonDesc"
  />
</template>
