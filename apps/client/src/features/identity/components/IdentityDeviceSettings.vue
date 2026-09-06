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
// #795：响应式 t（locale 变化后模板即时重渲染）
import { useI18n } from '../../../utils/app_i18n'

const { t } = useI18n()

const ui = identityUiState

/** 撤销确认需要输入的确切短语（更强确认；文案随 locale，输入匹配按当前语言） */
const revokeConfirmPhrase = computed(() => t('identity.device.action.revoke'))

const revokeModalVisible = ref(false)
const revokeConfirmInput = ref('')
const confirmMismatch = computed(() => revokeConfirmInput.value !== revokeConfirmPhrase.value)

const serviceEnabledText = computed(() =>
  ui.deviceStatus === null
    ? t('identity.device.status.checking')
    : ui.deviceStatus.available
      ? t('identity.device.status.enabled')
      : t('identity.device.status.disabled')
)

const boundText = computed(() => {
  if (ui.deviceStatus === null) return t('identity.device.status.checking')
  if (ui.deviceStatus.available === false) return t('identity.device.bind.unavailable')
  return ui.deviceId
    ? t('identity.device.bind.bound')
    : ui.deviceStatus.has_key
      ? t('identity.device.bind.key_pending')
      : t('identity.device.bind.unbound')
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
      setIdentityDeviceError(status.error || t('identity.device.error.storage_unavailable'))
    }
  } catch {
    setIdentityDeviceError(t('identity.device.error.read_failed'))
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
    showToast(t('identity.device.toast.not_bound'), 'info')
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
    showToast(t('identity.device.toast.revoked'), 'success')
  } catch (err) {
    const message = String((err as Error)?.message || err || t('identity.device.revoke.fallback_message'))
    setIdentityDeviceError(message)
    showToast(t('identity.device.toast.revoke_failed'), 'error')
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
      <p class="identity-test-note">
        🧪 <strong>{{ t('identity.overlay.test.badge') }}</strong>{{ t('identity.device.test_note') }}
      </p>
      <dl class="identity-device-grid">
        <div class="identity-device-field">
          <dt>{{ t('identity.device.field.device') }}</dt>
          <dd>{{ getIdentityDeviceDisplayName() }}</dd>
        </div>
        <div class="identity-device-field">
          <dt>{{ t('identity.device.field.bind_status') }}</dt>
          <dd>{{ boundText }}</dd>
        </div>
        <div class="identity-device-field">
          <dt>{{ t('identity.device.field.last_auth') }}</dt>
          <dd>{{ verifiedAtText }}</dd>
        </div>
        <div class="identity-device-field">
          <dt>{{ t('identity.device.field.method') }}</dt>
          <dd>{{ t('identity.device.field.method_value') }}</dd>
        </div>
        <div v-if="ui.deviceStatus?.fingerprint" class="identity-device-field identity-device-field--wide">
          <dt>{{ t('identity.device.field.fingerprint') }}</dt>
          <dd class="identity-device-mono">{{ ui.deviceStatus.fingerprint }}</dd>
        </div>
        <div v-if="ui.deviceId" class="identity-device-field identity-device-field--wide">
          <dt>{{ t('identity.device.field.device_id') }}</dt>
          <dd class="identity-device-mono">{{ ui.deviceId }}</dd>
        </div>
      </dl>
      <p class="identity-device-hint">
        {{ t('identity.device.hint.bind_flow') }}
      </p>
      <p v-if="ui.deviceError" class="identity-device-error">{{ ui.deviceError }}</p>
      <div class="identity-device-actions">
        <button class="mini-btn btn-ripple" :disabled="ui.deviceRefreshing" @click="refreshDeviceStatus">
          {{ ui.deviceRefreshing ? t('identity.device.action.refreshing') : t('identity.device.action.refresh') }}
        </button>
        <button
          class="mini-btn btn-ripple identity-device-revoke"
          :disabled="!ui.deviceId || ui.revoking"
          @click="openRevokeModal"
        >
          {{ ui.revoking ? t('identity.device.action.revoking') : t('identity.device.action.revoke') }}
        </button>
      </div>
    </section>

    <!-- 授权记录：入口引导（完整列表在「我的 → 授权记录」页） -->
    <section class="identity-device-section glass-card">
      <div class="section-head">
        <h3>{{ t('identity.device.history.title') }}</h3>
      </div>
      <p class="identity-device-hint">
        {{ t('identity.device.history.desc') }}
      </p>
    </section>

    <!-- 撤销强确认 Modal -->
    <div v-if="revokeModalVisible" class="identity-revoke-modal" role="dialog" aria-modal="true" :aria-label="t('identity.device.revoke.dialog.aria')">
      <div class="identity-revoke-card modal-pop-card">
        <h3>{{ t('identity.device.revoke.title') }}</h3>
        <p class="identity-revoke-desc">
          {{ t('identity.device.revoke.desc.effect') }}
        </p>
        <p class="identity-revoke-desc identity-revoke-desc--strong">
          {{ t('identity.device.revoke.desc.last_device') }}
        </p>
        <label class="identity-revoke-label">
          {{ t('identity.device.revoke.confirm_prompt').replace('{phrase}', revokeConfirmPhrase) }}
          <input
            v-model="revokeConfirmInput"
            class="identity-revoke-input"
            type="text"
            :placeholder="revokeConfirmPhrase"
            autocomplete="off"
            spellcheck="false"
            @keydown.esc="closeRevokeModal"
          />
        </label>
        <div class="identity-revoke-actions">
          <button class="btn-secondary btn-ripple" :disabled="ui.revoking" @click="closeRevokeModal">{{ t('identity.device.revoke.action.cancel') }}</button>
          <button
            class="btn-danger btn-ripple"
            :disabled="confirmMismatch || ui.revoking"
            @click="revokeCurrentDevice"
          >
            {{ ui.revoking ? t('identity.device.action.revoking') : t('identity.device.revoke.action.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./IdentityDeviceSettings.scoped.css" scoped></style>
