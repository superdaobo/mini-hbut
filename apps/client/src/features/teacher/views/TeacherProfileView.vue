<script setup lang="ts">
// TeacherProfileView（E2 #1022 负责实现）：教师个人资料占位视图。
// E0 阶段仅渲染「功能建设中」空态，**不发起任何网络请求**。

import TeacherPlaceholder from '../components/TeacherPlaceholder.vue'
</script>

<template>
  <TeacherPlaceholder
    title-key="teacher.profile.comingSoon"
    description-key="teacher.common.comingSoonDesc"
  />
</template>
