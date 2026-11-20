<script setup lang="ts">
// TeacherWorkflowView（E7 #1027 负责实现，本轮延期）：只读工作流占位视图。
// E0 阶段仅渲染「功能建设中」空态，**不发起任何网络请求**。
//
// #1336 P3-A：审批流协议尚未对接（3 个只读端点 qryMyApply / qryOperationApply /
// listRunningProcessInstaces 已登记 allowlist 但全仓无调用方）。本页保持零网络的
// 「暂未支持」空态，并在描述里指向官方入口，避免教师反复点击等结果。

import TeacherPlaceholder from '../components/TeacherPlaceholder.vue'
</script>

<template>
  <TeacherPlaceholder
    title-key="teacher.workflow.comingSoon"
    description-key="teacher.workflow.comingSoonDesc"
  />
</template>
