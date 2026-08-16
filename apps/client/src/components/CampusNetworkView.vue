<script setup>
import { computed, onMounted, ref } from 'vue'
import { TPageHeader } from './templates'
import { showToast } from '../utils/toast'
import { loadRememberedCredential, buildCampusAccountKey } from '../utils/credential_storage'
import {
  CAMPUS_CARRIER_OPTIONS,
  HBUT_CAMPUS_GATEWAYS,
  campusStatusLabel,
  readCampusNetworkSettings,
  writeCampusNetworkSettings
} from '../utils/campus_network_settings'
import { loginCampusNetwork, probeCampusNetwork } from '../utils/campus_network_service'
import { isTauriRuntime } from '../platform/native'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const settings = ref(readCampusNetworkSettings())
const account = ref('')
const password = ref('')
const showPassword = ref(false)
const probing = ref(false)
const loggingIn = ref(false)
const probeMessage = ref('')
const status = ref(settings.value.last_status || 'unknown')

const statusText = computed(() => {
  if (probing.value) return '检测中…'
  const base = campusStatusLabel(status.value)
  if (status.value === 'error' || status.value === 'needs_auth') {
    const msg = probeMessage.value || settings.value.last_message
    return msg ? `${base}：${msg}` : base
  }
  return probeMessage.value || base
})

const refreshProbe = async () => {
  if (!isTauriRuntime()) {
    status.value = 'unknown'
    probeMessage.value = '请在桌面/移动端应用中使用校园网认证'
    return
  }
  probing.value = true
  status.value = 'checking'
  try {
    const result = await probeCampusNetwork(settings.value.gateway_override)
    status.value = result?.status || 'unknown'
    probeMessage.value = String(result?.message || '')
    settings.value = readCampusNetworkSettings()
  } finally {
    probing.value = false
  }
}

const persistSettings = (patch) => {
  settings.value = writeCampusNetworkSettings(patch)
}

const handleCarrierChange = (carrier) => {
  persistSettings({ carrier })
}

const handleToggleRemember = () => {
  persistSettings({ remember_password: !settings.value.remember_password })
}

const handleToggleAutoLogin = () => {
  persistSettings({ auto_login: !settings.value.auto_login })
}

const handleToggleAdvanced = () => {
  persistSettings({ show_advanced: !settings.value.show_advanced })
}

const handleGatewayInput = (event) => {
  persistSettings({ gateway_override: String(event.target.value || '').trim() })
}

const handleLogin = async () => {
  const sid = String(account.value || props.studentId || localStorage.getItem('hbu_username') || '').trim()
  if (!sid) {
    showToast('请填写学号', 'error')
    return
  }
  if (!password.value) {
    showToast('请填写密码', 'error')
    return
  }

  loggingIn.value = true
  try {
    const probe = await probeCampusNetwork(settings.value.gateway_override)
    const result = await loginCampusNetwork({
      studentId: sid,
      password: password.value,
      carrier: settings.value.carrier,
      gatewayOverride: settings.value.gateway_override,
      queryString: probe?.query_string || undefined,
      rememberPassword: settings.value.remember_password
    })
    settings.value = readCampusNetworkSettings()
    status.value = result.success ? 'authenticated' : 'error'
    probeMessage.value = result.message
    showToast(result.message, result.success ? 'success' : 'error')
    if (result.success) {
      await refreshProbe()
    }
  } finally {
    loggingIn.value = false
  }
}

onMounted(async () => {
  const sid = String(props.studentId || localStorage.getItem('hbu_username') || '').trim()
  account.value = sid
  if (sid && settings.value.remember_password) {
    const saved = await loadRememberedCredential(buildCampusAccountKey(sid))
    if (saved) password.value = saved
  }
  await refreshProbe()
})
</script>

<template>
  <div class="campus-network-view">
    <TPageHeader title="校园网" icon="wifi" @back="emit('back')" />

    <section class="glass-card status-card">
      <div class="status-row">
        <span class="material-symbols-outlined status-icon">router</span>
        <div class="status-copy">
          <span class="status-label">连接状态</span>
          <span class="status-value">{{ statusText }}</span>
        </div>
        <button class="icon-btn" type="button" :disabled="probing" @click="refreshProbe" aria-label="重新检测">
          <span class="material-symbols-outlined" :class="{ spin: probing }">refresh</span>
        </button>
      </div>
    </section>

    <section class="glass-card form-card">
      <label class="field">
        <span>学号</span>
        <input v-model="account" type="text" inputmode="numeric" autocomplete="username" placeholder="默认读取已保存学号" />
      </label>

      <label class="field">
        <span>密码</span>
        <div class="password-row">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="校园网密码"
          />
          <button class="icon-btn" type="button" @click="showPassword = !showPassword" aria-label="显示密码">
            <span class="material-symbols-outlined">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
          </button>
        </div>
      </label>

      <div class="toggle-row">
        <div>
          <strong>记住密码</strong>
          <small>保存到系统密钥环（campus: 前缀）</small>
        </div>
        <button
          class="toggle"
          type="button"
          role="switch"
          :aria-checked="settings.remember_password"
          :class="{ on: settings.remember_password }"
          @click="handleToggleRemember"
        />
      </div>

      <div class="option-group">
        <label>运营商</label>
        <div class="chip-row">
          <button
            v-for="item in CAMPUS_CARRIER_OPTIONS"
            :key="item.id"
            type="button"
            class="option-chip"
            :class="{ active: settings.carrier === item.id }"
            @click="handleCarrierChange(item.id)"
          >
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </button>
        </div>
      </div>

      <div class="toggle-row">
        <div>
          <strong>自动认证</strong>
          <small>连接 iHBUT 后，应用前台恢复时尽力自动登录</small>
        </div>
        <button
          class="toggle"
          type="button"
          role="switch"
          :aria-checked="settings.auto_login"
          :class="{ on: settings.auto_login }"
          @click="handleToggleAutoLogin"
        />
      </div>

      <button class="primary-btn" type="button" :disabled="loggingIn" @click="handleLogin">
        {{ loggingIn ? '认证中…' : '立即认证' }}
      </button>

      <button class="link-btn" type="button" @click="handleToggleAdvanced">
        {{ settings.show_advanced ? '收起高级' : '高级' }}
      </button>

      <div v-if="settings.show_advanced" class="advanced-box">
        <label class="field">
          <span>认证服务器覆盖</span>
          <input
            :value="settings.gateway_override"
            type="url"
            placeholder="留空使用预置网关"
            @input="handleGatewayInput"
          />
        </label>
        <p class="hint">预置：{{ HBUT_CAMPUS_GATEWAYS.join('、') }}</p>
        <p class="hint">iOS 无法保证后台连 WiFi 即登；Android 依赖系统后台任务频率。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.campus-network-view {
  min-height: calc(var(--app-vh, 1vh) * 100);
  min-height: 100dvh;
  padding: 0 16px 120px;
  background: var(--ui-bg-gradient, #f9f9ff);
}

.glass-card {
  margin-top: 12px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  background: color-mix(in srgb, #ffffff 88%, var(--ui-primary, #2563eb) 12%);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-icon {
  color: var(--ui-primary, #2563eb);
  font-size: 28px;
}

.status-copy {
  flex: 1;
  min-width: 0;
}

.status-label {
  display: block;
  font-size: 12px;
  color: #64748b;
}

.status-value {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  word-break: break-word;
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 13px;
  color: #475569;
}

.field input {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 15px;
  background: #fff;
  color: #0f172a;
}

.password-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.password-row input {
  flex: 1;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
  color: var(--ui-primary, #2563eb);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 14px 0;
}

.toggle-row strong {
  display: block;
  font-size: 14px;
  color: #0f172a;
}

.toggle-row small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.toggle {
  width: 48px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: #cbd5e1;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}

.toggle::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.toggle.on {
  background: var(--ui-primary, #2563eb);
}

.toggle.on::after {
  transform: translateX(20px);
}

.option-group {
  margin: 16px 0;
}

.option-group > label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: #475569;
}

.chip-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.option-chip {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  padding: 10px 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.option-chip strong {
  display: block;
  font-size: 14px;
  color: #0f172a;
}

.option-chip small {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #64748b;
}

.option-chip.active {
  border-color: var(--ui-primary, #2563eb);
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 10%, #ffffff 90%);
}

.primary-btn {
  width: 100%;
  margin-top: 8px;
  border: none;
  border-radius: 16px;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: var(--ui-primary, #2563eb);
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.link-btn {
  width: 100%;
  margin-top: 10px;
  border: none;
  background: transparent;
  color: var(--ui-primary, #2563eb);
  font-size: 14px;
  cursor: pointer;
}

.advanced-box {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(15, 23, 42, 0.1);
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
