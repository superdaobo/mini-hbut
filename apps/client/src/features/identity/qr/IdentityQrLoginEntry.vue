<script setup lang="ts">
// IdentityQrLoginEntry.vue —— #627 设置页「扫一扫登录」入口卡片。
//
// 与同设备 Deep Link 共用同一 AuthRequest：扫码成功后调用
// IdentityCoordinator.submitIntent（与深链解析分发完全相同的入口），
// 由 #623 Overlay 完成用户确认 + Device Key 签名审批。
// 本组件只负责「打开扫描器 + 提交意图」，不持有任何 secret。

import { ref } from 'vue'
import type { IdentityCoordinator } from '../../../app/contracts/runtime'
import IdentityQrScanner from './IdentityQrScanner.vue'
import { showToast } from '../../../utils/toast'

const props = defineProps<{
  /** 由 App.vue 注入的 IdentityCoordinator（web 预览等无身份环境为 null） */
  identity: IdentityCoordinator | null
}>()

const scannerVisible = ref(false)

const openScanner = (): void => {
  if (!props.identity) {
    showToast('当前环境不支持扫码登录，请使用「打开 Mini-HBUT」按钮', 'warning')
    return
  }
  scannerVisible.value = true
}

/** 提交授权意图：与 Deep Link 同一 coordinator 入口（去重/队列提示由内部处理） */
const submitIntent = (requestId: string, handoff: string): void => {
  if (!props.identity) return
  props.identity.submitIntent({ requestId, handoff, arrivedAt: Date.now() })
}

const closeScanner = (): void => {
  scannerVisible.value = false
}
</script>

<template>
  <section class="glass-card identity-qr-entry">
    <div class="identity-qr-entry-main">
      <span class="material-symbols-outlined identity-qr-entry-icon" aria-hidden="true">qr_code_scanner</span>
      <div class="identity-qr-entry-text">
        <h4>扫一扫登录</h4>
        <p>用本机相机扫描电脑网页上的登录二维码，即可在手机上完成授权。</p>
      </div>
    </div>
    <button class="mini-btn btn-ripple identity-qr-entry-btn" type="button" @click="openScanner">
      扫一扫
    </button>
    <IdentityQrScanner :visible="scannerVisible" :submit-intent="submitIntent" @close="closeScanner" />
  </section>
</template>

<style scoped>
.identity-qr-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.identity-qr-entry-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.identity-qr-entry-icon {
  font-size: 28px;
  color: var(--ui-primary, #2563eb);
  flex-shrink: 0;
}

.identity-qr-entry-text h4 {
  margin: 0 0 2px;
  font-size: calc(14px * var(--ui-font-scale, 1));
}

.identity-qr-entry-text p {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.identity-qr-entry-btn {
  flex-shrink: 0;
}
</style>
