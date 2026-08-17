<script setup lang="ts">
// IdentityClientCard.vue —— #623 第三方应用信息卡。
//
// 必须同时显示应用名 + 域名（homepage_host），防止同名钓鱼；
// 展示资料全部来自 Core sanitized DTO，App 不信任 deep link 里的任何资料。

import { computed } from 'vue'
import type { IdentityClientInfo } from '../types'

const props = defineProps<{ client: IdentityClientInfo }>()

/** 审核状态展示：active/verified -> 已审核；suspended/revoked -> 已暂停；其余 -> 未审核 */
const reviewLabel = computed<{ text: string; ok: boolean }>(() => {
  const status = String(props.client?.review_status || '').trim().toLowerCase()
  if (status === 'active' || status === 'verified') return { text: '已审核', ok: true }
  if (status === 'suspended' || status === 'revoked') return { text: '已暂停', ok: false }
  return { text: '未审核', ok: false }
})
</script>

<template>
  <div class="identity-client-card">
    <div class="identity-client-head">
      <div class="identity-client-icon" aria-hidden="true">
        <span class="material-symbols-outlined">apps</span>
      </div>
      <div class="identity-client-main">
        <h3 class="identity-client-name">{{ client.name || '未知应用' }}</h3>
        <p class="identity-client-host">{{ client.homepage_host || '—' }}</p>
      </div>
      <span class="identity-review-badge" :class="{ ok: reviewLabel.ok }">{{ reviewLabel.text }}</span>
    </div>
    <p class="identity-client-developer">
      <span class="material-symbols-outlined identity-client-developer-icon" aria-hidden="true">badge</span>
      开发者：{{ client.developer_display_name || '—' }}
    </p>
  </div>
</template>

<style src="./IdentityClientCard.scoped.css" scoped></style>
