<script setup lang="ts">
// IdentityDeviceSettings.vue —— #623 设置中心「登录与安全」设备管理。
//
// 展示：
//   - Mini-HBUT 身份服务状态（keyring 可用性 / 是否已绑定）；
//   - 当前设备指纹 / device_id / 最近认证时间；
//   - 撤销当前设备（强确认 Modal + 恢复说明：所有撤销都按“可能是最后设备”对待，
//     因为 #622 冻结 Core 无设备列表端点，无法预知是否最后一台）。
//
// 授权记录列表为 V1.1 可选范围，本页只预留入口（TODO 注释）。

import { computed, onMounted, ref } from 'vue'
import type { IdentityLocalDeviceStatus } from '../types'
import {
  clearIdentityDeviceMeta,
  identityUiState,
  setIdentityDeviceError,
  setIdentityDeviceRefreshing,
  setIdentityDeviceStatus,
  setIdentityRevoking
} from '../identityStore'
import { getIdentityCoreBaseUrl } from '../identityService'
import {
  getIdentityDeviceDisplayName,
  identityDeviceStatus as invokeIdentityDeviceStatus,
  identityRevokeCurrentDeviceLocal
} from '../../../platform/native'
import { showToast } from '../../../utils/toast'

const ui = identityUiState

/** 撤销确认需要输入的确切短语（更强确认） */
const REVOKE_CONFIRM_PHRASE = '撤销此设备'

const revokeModalVisible = ref(false)
const revokeConfirmInput = ref('')
const confirmMismatch = computed(() => revokeConfirmInput.value !== REVOKE_CONFIRM_PHRASE)

const serviceEnabledText = computed(() =>
  ui.deviceStatus === null ? '检测中…' : ui.deviceStatus.available ? '已启用' : '未启用'
)

const boundText = computed(() => {
  if (ui.deviceStatus === null) return '检测中…'
  if (ui.deviceStatus.available === false) return '不可用'
  return ui.deviceId ? '已绑定' : ui.deviceStatus.has_key ? '本机已有密钥（待绑定）' : '未绑定'
})

const verifiedAtText = computed(() => {
  if (!ui.verifiedAt) return '—'
  try {
    return new Date(ui.verifiedAt).toLocaleString()
  } catch {
    return '—'
  }
})

const refreshDeviceStatus = async (): Promise<void> => {
  setIdentityDeviceRefreshing(true)
  setIdentityDeviceError('')
  try {
    const status = await invokeIdentityDeviceStatus<IdentityLocalDeviceStatus>()
    setIdentityDeviceStatus(status)
    if (status?.available === false) {
      setIdentityDeviceError(status.error || '本机安全存储不可用')
    }
  } catch {
    setIdentityDeviceError('无法读取设备状态')
  } finally {
    setIdentityDeviceRefreshing(false)
  }
}

const openRevokeModal = (): void => {
  revokeConfirmInput.value = ''
  revokeModalVisible.value = true
}

const closeRevokeModal = (): void => {
  revokeModalVisible.value = false
  revokeConfirmInput.value = ''
}

const revokeCurrentDevice = async (): Promise<void> => {
  if (confirmMismatch.value || ui.revoking) return
  const deviceId = ui.deviceId
  if (!deviceId) {
    showToast('当前设备尚未绑定，无需撤销', 'info')
    closeRevokeModal()
    return
  }
  setIdentityRevoking(true)
  setIdentityDeviceError('')
  try {
    await identityRevokeCurrentDeviceLocal({
      base_url: getIdentityCoreBaseUrl(),
      device_id: deviceId
    })
    // Rust 侧已先调 Core revoke（成功才删本地 key）
    clearIdentityDeviceMeta()
    closeRevokeModal()
    showToast('当前设备已撤销', 'success')
  } catch (err) {
    const message = String((err as Error)?.message || err || '撤销失败')
    setIdentityDeviceError(message)
    showToast('撤销失败，请稍后重试', 'error')
  } finally {
    setIdentityRevoking(false)
  }
  await refreshDeviceStatus()
}

onMounted(() => {
  void refreshDeviceStatus()
})

defineExpose({ refreshDeviceStatus })
</script>

<template>
  <div class="identity-device-settings">
    <!-- 身份服务状态 -->
    <section class="identity-device-section glass-card">
      <div class="section-head">
        <h3>Mini-HBUT Identity</h3>
        <span class="identity-device-pill" :class="{ ok: ui.deviceStatus?.available }">{{ serviceEnabledText }}</span>
      </div>
      <dl class="identity-device-grid">
        <div class="identity-device-field">
          <dt>当前设备</dt>
          <dd>{{ getIdentityDeviceDisplayName() }}</dd>
        </div>
        <div class="identity-device-field">
          <dt>绑定状态</dt>
          <dd>{{ boundText }}</dd>
        </div>
        <div class="identity-device-field">
          <dt>最近认证</dt>
          <dd>{{ verifiedAtText }}</dd>
        </div>
        <div class="identity-device-field">
          <dt>学校身份验证方式</dt>
          <dd>Mini-HBUT 本地验证</dd>
        </div>
        <div v-if="ui.deviceStatus?.fingerprint" class="identity-device-field identity-device-field--wide">
          <dt>设备指纹</dt>
          <dd class="identity-device-mono">{{ ui.deviceStatus.fingerprint }}</dd>
        </div>
        <div v-if="ui.deviceId" class="identity-device-field identity-device-field--wide">
          <dt>设备 ID</dt>
          <dd class="identity-device-mono">{{ ui.deviceId }}</dd>
        </div>
      </dl>
      <p class="identity-device-hint">
        首次允许授权时 App 会自动绑定本设备；撤销后如需恢复，请重新从网页发起授权流程。
      </p>
      <p v-if="ui.deviceError" class="identity-device-error">{{ ui.deviceError }}</p>
      <div class="identity-device-actions">
        <button class="mini-btn btn-ripple" :disabled="ui.deviceRefreshing" @click="refreshDeviceStatus">
          {{ ui.deviceRefreshing ? '刷新中…' : '刷新状态' }}
        </button>
        <button
          class="mini-btn btn-ripple identity-device-revoke"
          :disabled="!ui.deviceId || ui.revoking"
          @click="openRevokeModal"
        >
          {{ ui.revoking ? '撤销中…' : '撤销此设备' }}
        </button>
      </div>
    </section>

    <!-- 授权记录：V1.1 预留入口（TODO: #623 可选范围，展示哪些 Client 获得过哪些 scope 并允许 revoke consent） -->
    <section class="identity-device-section glass-card">
      <div class="section-head">
        <h3>授权记录</h3>
      </div>
      <p class="identity-device-hint">
        未来版本将展示哪些应用获得过哪些权限，并支持撤销历史授权（V1.1 预留）。
      </p>
    </section>

    <!-- 撤销强确认 Modal -->
    <div v-if="revokeModalVisible" class="identity-revoke-modal" role="dialog" aria-modal="true" aria-label="撤销当前设备">
      <div class="identity-revoke-card modal-pop-card">
        <h3>撤销当前设备</h3>
        <p class="identity-revoke-desc">
          撤销后，本设备将无法再完成 Mini-HBUT 授权审批；此操作不会影响其他设备（如有）。
        </p>
        <p class="identity-revoke-desc identity-revoke-desc--strong">
          如果这是你唯一的设备，撤销后将无法在此设备继续使用身份服务，需要重新通过网页授权流程绑定。
        </p>
        <label class="identity-revoke-label">
          请输入「{{ REVOKE_CONFIRM_PHRASE }}」以确认
          <input
            v-model="revokeConfirmInput"
            class="identity-revoke-input"
            type="text"
            :placeholder="REVOKE_CONFIRM_PHRASE"
            autocomplete="off"
            spellcheck="false"
            @keydown.esc="closeRevokeModal"
          />
        </label>
        <div class="identity-revoke-actions">
          <button class="btn-secondary btn-ripple" :disabled="ui.revoking" @click="closeRevokeModal">取消</button>
          <button
            class="btn-danger btn-ripple"
            :disabled="confirmMismatch || ui.revoking"
            @click="revokeCurrentDevice"
          >
            {{ ui.revoking ? '撤销中…' : '确认撤销' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./IdentityDeviceSettings.scoped.css" scoped></style>
