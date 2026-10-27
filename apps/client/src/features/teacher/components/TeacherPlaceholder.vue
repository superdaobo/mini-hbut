<script setup lang="ts">
// Teacher Portal V2（#1019）：教师视图占位组件。
//
// ⚠️ 本组件**不发起任何网络请求**，仅渲染「功能建设中」空态。
// E1–E6 用各自实现替换 views/*.vue，本组件可保留为未开放功能的统一降级态。

import { useI18n } from '../../../utils/app_i18n'

const { t } = useI18n()

defineProps<{
  /** 标题 i18n key（必须为 `teacher.` 前缀）。 */
  titleKey: string
  /** 说明 i18n key（可选）。 */
  descriptionKey?: string
}>()
</script>

<template>
  <section class="teacher-placeholder" role="status" aria-live="polite">
    <div class="teacher-placeholder__emoji" aria-hidden="true">🚧</div>
    <h2 class="teacher-placeholder__title">{{ t(titleKey) }}</h2>
    <p v-if="descriptionKey" class="teacher-placeholder__desc">{{ t(descriptionKey) }}</p>
  </section>
</template>

<style scoped>
.teacher-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40vh;
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
}

.teacher-placeholder__emoji {
  font-size: 40px;
  line-height: 1;
}

.teacher-placeholder__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.teacher-placeholder__desc {
  margin: 0;
  font-size: 13px;
  max-width: 22em;
}
</style>
