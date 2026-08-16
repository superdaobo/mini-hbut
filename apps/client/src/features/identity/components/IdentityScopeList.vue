<script setup lang="ts">
// IdentityScopeList.vue —— #623 权限列表（按风险分组）。
//
// - 基础/敏感分组展示；敏感组使用图标 + 边框 + 文字三重标识（不只依赖颜色）；
// - 敏感 scope 附明确提示（非恐吓式）；
// - 底部固定显示“非官方声明”（#617 信任边界：Mini-HBUT 本地验证 ≠ 官方认证）。

import { computed } from 'vue'
import type { IdentityScopeInfo } from '../types'
import {
  groupScopesByRisk,
  NON_OFFICIAL_NOTICE,
  SENSITIVE_SCOPE_NOTICE
} from '../identityScopes'

const props = defineProps<{ scopes: IdentityScopeInfo[] }>()

const grouped = computed(() => groupScopesByRisk(props.scopes || []))
const hasAny = computed(
  () => (props.scopes || []).length > 0
)
</script>

<template>
  <div class="identity-scope-list">
    <template v-if="hasAny">
      <section v-if="grouped.basic.length" class="identity-scope-group">
        <h4 class="identity-scope-group-title">基础权限</h4>
        <ul class="identity-scope-items">
          <li v-for="scope in grouped.basic" :key="scope.id" class="identity-scope-item">
            <span class="material-symbols-outlined identity-scope-icon" aria-hidden="true">info</span>
            <div class="identity-scope-text">
              <strong>{{ scope.id }}</strong>
              <p>{{ scope.label }}</p>
            </div>
          </li>
        </ul>
      </section>

      <section
        v-if="grouped.sensitive.length"
        class="identity-scope-group identity-scope-group--sensitive"
        aria-label="敏感权限"
      >
        <h4 class="identity-scope-group-title">
          <span class="material-symbols-outlined identity-scope-group-title-icon" aria-hidden="true">warning</span>
          敏感权限
        </h4>
        <ul class="identity-scope-items">
          <li
            v-for="scope in grouped.sensitive"
            :key="scope.id"
            class="identity-scope-item identity-scope-item--sensitive"
          >
            <span class="material-symbols-outlined identity-scope-icon" aria-hidden="true">shield_person</span>
            <div class="identity-scope-text">
              <strong>{{ scope.id }}</strong>
              <p>{{ scope.label }}</p>
            </div>
          </li>
        </ul>
        <p class="identity-scope-notice" role="note">
          <span class="material-symbols-outlined identity-scope-notice-icon" aria-hidden="true">gpp_maybe</span>
          {{ SENSITIVE_SCOPE_NOTICE }}
        </p>
      </section>
    </template>
    <p v-else class="identity-scope-empty">该应用未请求任何权限</p>

    <p class="identity-nonofficial" role="note">
      <span class="material-symbols-outlined identity-nonofficial-icon" aria-hidden="true">verified_user</span>
      {{ NON_OFFICIAL_NOTICE }}
    </p>
  </div>
</template>

<style src="./IdentityScopeList.scoped.css" scoped></style>
