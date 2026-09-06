<!--
  授权记录页：展示本机（签名设备）在 Identity 平台（id.湖北工业大学.com）
  批准过的 OAuth 授权历史 —— 哪个应用、何时授权、授权了哪些权限。
  数据源：GET /api/v1/app/devices/me/auth-history（设备签名认证，Rust identity_fetch_auth_history）。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { TPageHeader, TEmptyState } from '../../../components/templates'
import { fetchAuthHistory } from '../identityService'
import { IdentityServiceError, type IdentityAuthHistoryItem } from '../types'
import { showToast } from '../../../utils/toast'

const emit = defineEmits(['back'])

type LoadState = 'loading' | 'ready' | 'error' | 'no_device'

const items = ref<IdentityAuthHistoryItem[]>([])
const loadState = ref<LoadState>('loading')
const errorMessage = ref('')
/** #777：错误态附加指引（如安全存储不可用的重启建议；空字符串表示无附加指引） */
const errorHint = ref('')
const loading = ref(false)

/** 相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期） */
const formatRelativeTime = (iso: string): string => {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 完整时间（用于详情行） */
const formatFullTime = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 授权次数 */
const totalCount = computed(() => items.value.length)
/** 涉及的应用数（按应用名去重） */
const appCount = computed(() => new Set(items.value.map((i) => i.client.name)).size)
/** 最近授权时间 */
const lastTime = computed(() => (items.value[0] ? formatRelativeTime(items.value[0].approved_at) : '—'))

const load = async () => {
  loading.value = true
  loadState.value = 'loading'
  errorMessage.value = ''
  errorHint.value = ''
  try {
    items.value = await fetchAuthHistory()
    loadState.value = 'ready'
  } catch (err) {
    if (err instanceof IdentityServiceError && err.code === 'device_not_bound') {
      loadState.value = 'no_device'
      errorMessage.value = err.message
    } else {
      loadState.value = 'error'
      errorMessage.value = err instanceof IdentityServiceError ? err.message : '加载失败，请稍后重试'
      // #777：安全存储不可用给出专属指引（fail closed，重启应用可能恢复临时性故障）
      if (err instanceof IdentityServiceError && err.code === 'secure_storage_unavailable') {
        errorHint.value = '这通常是系统凭据存储暂时不可用。可尝试完全退出并重启本应用后重试；若持续出现，请通过「设置 → 关于」反馈版本号。'
      }
    }
  } finally {
    loading.value = false
  }
}

const handleRefresh = async () => {
  await load()
  if (loadState.value === 'ready') showToast('授权记录已刷新')
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="auth-history-view">
    <TPageHeader title="授权记录" icon="history" show-back @back="emit('back')">
      <template #actions>
        <button class="history-refresh-btn" aria-label="刷新" :disabled="loading" @click="handleRefresh">
          <span class="material-symbols-outlined" :class="{ spinning: loading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <!-- 统计概览 -->
    <section v-if="loadState === 'ready' && items.length > 0" class="history-stats-card">
      <div class="stat-item">
        <span class="stat-value">{{ totalCount }}</span>
        <span class="stat-label">授权次数</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ appCount }}</span>
        <span class="stat-label">涉及应用</span>
      </div>
      <div class="stat-item">
        <span class="stat-value stat-value--time">{{ lastTime }}</span>
        <span class="stat-label">最近授权</span>
      </div>
    </section>

    <!-- 设备未注册引导 -->
    <section v-if="loadState === 'no_device'" class="history-tip-card">
      <span class="material-symbols-outlined tip-icon">devices</span>
      <p class="tip-title">本机尚未注册为身份签名设备</p>
      <p class="tip-desc">{{ errorMessage }}</p>
      <p class="tip-desc">授权记录由本机签名设备批准后产生。请先在「设置 → 登录与安全」完成设备注册，再发起一次授权即可看到记录。</p>
    </section>

    <!-- 错误态 -->
    <section v-if="loadState === 'error'" class="history-tip-card">
      <span class="material-symbols-outlined tip-icon tip-icon--error">error</span>
      <p class="tip-title">加载失败</p>
      <p class="tip-desc">{{ errorMessage }}</p>
      <p v-if="errorHint" class="tip-desc tip-hint">{{ errorHint }}</p>
      <button class="history-retry-btn" @click="load">重试</button>
    </section>

    <!-- 空状态 -->
    <section v-if="loadState === 'ready' && items.length === 0" class="history-empty-wrap">
      <TEmptyState
        icon="🗂️"
        message="还没有授权记录 —— 从网页发起授权并在此设备确认后，记录会显示在这里。"
      />
    </section>

    <!-- 授权记录列表 -->
    <section v-if="loadState === 'ready' && items.length > 0" class="history-list">
      <article v-for="item in items" :key="item.request_id" class="history-item-card">
        <div class="history-item-main">
          <div class="history-app-icon">
            <span class="material-symbols-outlined">apps</span>
          </div>
          <div class="history-item-body">
            <div class="history-app-line">
              <span class="history-app-name">{{ item.client.name || '未命名应用' }}</span>
              <span v-if="item.client.is_test" class="history-test-badge">测试应用</span>
            </div>
            <span v-if="item.client.homepage_host" class="history-app-host">{{ item.client.homepage_host }}</span>
            <div class="history-scope-line">
              <span
                v-for="scope in item.scopes"
                :key="scope.id"
                class="history-scope-tag"
                :class="{ 'history-scope-tag--sensitive': scope.risk === 'sensitive' }"
              >
                {{ scope.label }}
              </span>
            </div>
          </div>
          <span class="history-status-badge">已授权</span>
        </div>
        <div class="history-item-time">
          <span class="history-time-relative">{{ formatRelativeTime(item.approved_at) }}</span>
          <span class="history-time-full">{{ formatFullTime(item.approved_at) }}</span>
        </div>
      </article>
    </section>

    <!-- 数据说明 -->
    <p class="history-footnote">
      授权记录由身份服务按本机设备签名统计，仅展示本设备批准过的授权（上限 50 条），不会上传任何凭据。
    </p>
  </div>
</template>

<style scoped>
.auth-history-view {
  min-height: 100vh;
  max-width: 448px;
  margin: 0 auto;
  background: var(--md-sys-color-background, var(--ui-bg, #f6fafe));
  color: var(--ui-text, #1e293b);
  padding-bottom: 96px;
}

/* 刷新按钮 */
.history-refresh-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: var(--ui-muted, #475569);
  cursor: pointer;
  transition: background 0.2s ease;
}

.history-refresh-btn:active {
  background: var(--ui-primary-soft, #eff6ff);
}

.history-refresh-btn .material-symbols-outlined {
  font-size: 22px;
}

.history-refresh-btn .spinning {
  animation: history-spin 0.8s linear infinite;
}

@keyframes history-spin {
  to { transform: rotate(360deg); }
}

/* 统计卡 */
.history-stats-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 14px 16px 16px;
  padding: 16px 12px;
  background: var(--ui-surface, #ffffff);
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.22));
  border-radius: 20px;
  box-shadow: var(--ui-shadow-soft, 0 2px 12px rgba(0, 0, 0, 0.06));
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-primary, #2563eb);
}

.stat-value--time {
  font-size: 13px;
  line-height: 1.3;
  color: var(--ui-text, #1f2937);
}

.stat-label {
  font-size: 12px;
  color: var(--ui-muted, #64748b);
}

/* 提示卡（未注册 / 错误） */
.history-tip-card {
  margin: 14px 16px;
  padding: 24px 20px;
  background: var(--ui-surface, #ffffff);
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.22));
  border-radius: 20px;
  box-shadow: var(--ui-shadow-soft, 0 2px 12px rgba(0, 0, 0, 0.06));
  text-align: center;
}

.tip-icon {
  font-size: 36px;
  color: var(--ui-primary, #2563eb);
}

.tip-icon--error {
  color: var(--ui-danger, #ef4444);
}

.tip-title {
  margin: 10px 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text, #1f2937);
}

.tip-desc {
  margin: 0 auto;
  max-width: 320px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ui-muted, #64748b);
}

/* #777：错误附加指引（与主文案区分的弱化样式） */
.tip-hint {
  margin-top: 8px;
  font-size: 12px;
  color: color-mix(in oklab, var(--ui-muted, #64748b) 80%, var(--ui-text, #1f2937));
}

.history-retry-btn {
  margin-top: 14px;
  padding: 9px 26px;
  border: none;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-primary, #2563eb);
  color: #ffffff;
}

/* 空状态 */
.history-empty-wrap {
  margin-top: 24px;
}

/* 授权记录列表 */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 16px;
}

.history-item-card {
  padding: 14px 16px;
  background: var(--ui-surface, #ffffff);
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.22));
  border-radius: 20px;
  box-shadow: var(--ui-shadow-soft, 0 2px 12px rgba(0, 0, 0, 0.06));
}

.history-item-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.history-app-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: color-mix(in oklab, var(--ui-primary, #2563eb) 12%, var(--ui-surface, #fff) 88%);
  color: var(--ui-primary, #2563eb);
}

.history-app-icon .material-symbols-outlined {
  font-size: 22px;
}

.history-item-body {
  flex: 1;
  min-width: 0;
}

.history-app-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.history-app-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--ui-text, #1f2937);
}

.history-test-badge {
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in oklab, var(--ui-warning, #f59e0b) 16%, var(--ui-surface, #fff) 84%);
  color: var(--ui-warning, #d97706);
}

.history-app-host {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--ui-muted, #64748b);
  word-break: break-all;
}

.history-scope-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.history-scope-tag {
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--ui-primary-soft, #eff6ff);
  color: var(--ui-primary, #2563eb);
}

.history-scope-tag--sensitive {
  background: color-mix(in oklab, var(--ui-danger, #ef4444) 12%, var(--ui-surface, #fff) 88%);
  color: var(--ui-danger, #dc2626);
}

.history-status-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in oklab, var(--ui-success, #22c55e) 14%, var(--ui-surface, #fff) 86%);
  color: var(--ui-success, #16a34a);
}

.history-item-time {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--ui-surface-border, rgba(148, 163, 184, 0.28));
}

.history-time-relative {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-muted, #64748b);
}

.history-time-full {
  font-size: 11px;
  color: var(--ui-muted, #94a3b8);
}

/* 页脚说明 */
.history-footnote {
  margin: 16px 24px 0;
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  color: var(--ui-muted, #94a3b8);
}
</style>
