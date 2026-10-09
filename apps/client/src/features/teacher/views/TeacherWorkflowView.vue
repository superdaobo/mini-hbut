<script setup lang="ts">
// TeacherWorkflowView（E7 #1027 负责实现，本轮延期）：只读工作流占位视图。
// E0 阶段仅渲染「功能建设中」空态，**不发起任何网络请求**。

import TeacherPlaceholder from '../components/TeacherPlaceholder.vue'
</script>

<template>
  <TeacherPlaceholder
    title-key="teacher.workflow.comingSoon"
    description-key="teacher.common.comingSoonDesc"
  />
</template>
