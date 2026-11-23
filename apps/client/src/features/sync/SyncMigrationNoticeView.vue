<script setup lang="ts">
// src/features/sync/SyncMigrationNoticeView.vue
//
// Epic #1243（G3-05 / mini-hbut#1258）：旧「关闭同步」用户的**一次性迁移告知**。
//
// 红线（与 `syncMigrationNotice.ts` 一致）：
//   - **绝不静默上传**：曾关闭同步的用户必须先看到这页；
//   - 「暂不」= 本次不上传，且**下次启动还会再问**（不能一次点击就永久静默上传）；
//   - 文案必须说明可以随时导出/删除云端数据。

import { computed } from 'vue'

import {
  buildMigrationNotice,
  resolveMigrationChoice,
  type MigrationChoice,
  type MigrationModel
} from './syncMigrationNotice'

const props = withDefaults(
  defineProps<{
    /** 旧偏好值（`localStorage['hbu_cloud_sync_user_disabled']`） */
    legacyDisabled?: string | boolean | null
    /** 是否已确认过 */
    acknowledged?: boolean
    /** 用户做出选择 */
    onChoose?: (choice: MigrationChoice) => void
  }>(),
  { legacyDisabled: null, acknowledged: false, onChoose: undefined }
)

const model = computed<MigrationModel>(() =>
  buildMigrationNotice({
    legacyDisabled: props.legacyDisabled,
    acknowledged: props.acknowledged
  })
)

const choose = (choice: MigrationChoice): void => {
  // 落地动作（写确认标记 / 清旧键 / 是否允许上传）由调用方按返回值执行
  const outcome = resolveMigrationChoice(choice)
  props.onChoose && props.onChoose(choice)
  // 供调用方读取（也便于测试断言「暂不」不放行上传）
  emit('resolved', { choice, ...outcome })
}

const emit = defineEmits<{
  resolved: [{ choice: MigrationChoice; markAcknowledged: boolean; clearLegacyKey: boolean; allowUpload: boolean }]
}>()
</script>

<template>
  <section v-if="model.shouldShow" class="migration" role="dialog" aria-labelledby="migration-title">
    <h2 id="migration-title" class="migration__title">{{ model.title }}</h2>
    <p class="migration__body">{{ model.body }}</p>
    <div class="migration__actions">
      <button type="button" class="migration__accept" @click="choose('accept')">
        {{ model.acceptText }}
      </button>
      <button type="button" class="migration__defer" @click="choose('defer')">
        {{ model.deferText }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.migration {
  padding: 20px;
}
.migration__title {
  font-size: 17px;
  font-weight: 600;
}
.migration__body {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.6;
}
.migration__actions {
  margin-top: 18px;
  display: flex;
  gap: 12px;
}
.migration__accept,
.migration__defer {
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
}
</style>
