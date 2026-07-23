<script setup>
import { ref } from 'vue'
import { openExternal } from '../utils/external_link'
import {
  FEEDBACK_URL,
  GITHUB_URL,
  NON_OFFICIAL_DISCLAIMER_EN,
  NON_OFFICIAL_DISCLAIMER_ZH,
  PRIVACY_POLICY_URL,
  PROJECT_HOME_URL,
  SECURITY_DOCS_URL,
  SUPPORT_DOCS_URL,
  isAppStoreBuild
} from '../config/app_store_policy'
import {
  clearTestAccountSession,
  isTestAccountSession
} from '../utils/test_account.js'
import { showToast } from '../utils/toast'
import { TPageHeader } from './templates'

const emit = defineEmits(['back', 'logout', 'cleared'])

const busy = ref('')
const message = ref('')

const openUrl = async (url) => {
  await openExternal(url)
}

const clearLocalCaches = () => {
  busy.value = 'cache'
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith('cache:') || k.includes('_cache') || k.startsWith('hbu_cloud_sync')) {
        keys.push(k)
      }
    }
    keys.forEach((k) => localStorage.removeItem(k))
    message.value = `已清除 ${keys.length} 项离线缓存键`
    showToast(message.value)
  } catch (e) {
    message.value = String(e?.message || e)
  } finally {
    busy.value = ''
  }
}

const clearSession = () => {
  busy.value = 'session'
  try {
    ;[
      'hbu_login_method',
      'hbu_test_account_session',
      'hbu_manual_logout',
      'hbu_logout_reason'
    ].forEach((k) => localStorage.removeItem(k))
    if (isTestAccountSession()) clearTestAccountSession()
    message.value = '已请求清除登录会话标记；请再点退出登录以清理内存态'
    showToast(message.value)
    emit('logout')
  } catch (e) {
    message.value = String(e?.message || e)
  } finally {
    busy.value = ''
  }
}

const clearAllLocal = () => {
  if (!confirm('将清除本应用在本设备保存的本地数据（缓存、设置快照、演示标记等）。不会删除学校账号。是否继续？')) {
    return
  }
  busy.value = 'all'
  try {
    const preserve = new Set([])
    const dump = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && !preserve.has(k)) dump.push(k)
    }
    dump.forEach((k) => localStorage.removeItem(k))
    try {
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    clearTestAccountSession()
    message.value = '已清除全部本地 Web 存储。建议完全退出应用后重新打开。'
    showToast(message.value)
    emit('cleared')
    emit('logout')
  } catch (e) {
    message.value = String(e?.message || e)
  } finally {
    busy.value = ''
  }
}

const disableCloudAndStats = () => {
  try {
    localStorage.setItem('hbu_cloud_sync_user_disabled', '1')
    localStorage.setItem('hbu_usage_stats_user_disabled', '1')
    message.value = '已标记关闭云同步与使用统计上传（本地偏好）'
    showToast(message.value)
  } catch (e) {
    message.value = String(e?.message || e)
  }
}

const exportLocalMeta = () => {
  try {
    const payload = {
      exported_at: new Date().toISOString(),
      app_store_build: isAppStoreBuild(),
      demo_session: isTestAccountSession(),
      keys: Object.keys(localStorage || {})
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mini-hbut-local-data-export.json'
    a.click()
    URL.revokeObjectURL(url)
    showToast('已导出本地键名清单（不含密码）')
  } catch (e) {
    message.value = String(e?.message || e)
  }
}
</script>

<template>
  <div class="privacy-data-view">
    <TPageHeader title="隐私与数据" icon="shield" @back="emit('back')" />

    <main class="privacy-data-view__main">
      <section class="privacy-card privacy-card--enter" style="--enter-delay: 0ms">
        <div class="privacy-card__head">
          <span class="privacy-card__icon" aria-hidden="true">
            <span class="material-symbols-outlined">info</span>
          </span>
          <h2>非官方声明</h2>
        </div>
        <p>{{ NON_OFFICIAL_DISCLAIMER_ZH }}</p>
        <p class="muted">{{ NON_OFFICIAL_DISCLAIMER_EN }}</p>
      </section>

      <section class="privacy-card privacy-card--enter" style="--enter-delay: 60ms">
        <div class="privacy-card__head">
          <span class="privacy-card__icon privacy-card__icon--policy" aria-hidden="true">
            <span class="material-symbols-outlined">policy</span>
          </span>
          <h2>政策与支持</h2>
        </div>
        <div class="privacy-link-list">
          <button type="button" class="link-btn" @click="openUrl(PRIVACY_POLICY_URL)">
            <span class="link-btn__icon material-symbols-outlined">privacy_tip</span>
            <span class="link-btn__label">查看隐私政策</span>
            <span class="link-btn__chev material-symbols-outlined">open_in_new</span>
          </button>
          <button type="button" class="link-btn" @click="openUrl(SECURITY_DOCS_URL)">
            <span class="link-btn__icon material-symbols-outlined">security</span>
            <span class="link-btn__label">数据与安全说明</span>
            <span class="link-btn__chev material-symbols-outlined">open_in_new</span>
          </button>
          <button type="button" class="link-btn" @click="openUrl(SUPPORT_DOCS_URL)">
            <span class="link-btn__icon material-symbols-outlined">menu_book</span>
            <span class="link-btn__label">用户文档</span>
            <span class="link-btn__chev material-symbols-outlined">open_in_new</span>
          </button>
          <button type="button" class="link-btn" @click="openUrl(PROJECT_HOME_URL)">
            <span class="link-btn__icon material-symbols-outlined">public</span>
            <span class="link-btn__label">项目官网</span>
            <span class="link-btn__chev material-symbols-outlined">open_in_new</span>
          </button>
          <button type="button" class="link-btn" @click="openUrl(GITHUB_URL)">
            <span class="link-btn__icon material-symbols-outlined">code</span>
            <span class="link-btn__label">开源仓库</span>
            <span class="link-btn__chev material-symbols-outlined">open_in_new</span>
          </button>
          <button type="button" class="link-btn" @click="openUrl(FEEDBACK_URL)">
            <span class="link-btn__icon material-symbols-outlined">support_agent</span>
            <span class="link-btn__label">联系支持 / 反馈</span>
            <span class="link-btn__chev material-symbols-outlined">open_in_new</span>
          </button>
        </div>
      </section>

      <section class="privacy-card privacy-card--enter" style="--enter-delay: 120ms">
        <div class="privacy-card__head">
          <span class="privacy-card__icon privacy-card__icon--control" aria-hidden="true">
            <span class="material-symbols-outlined">database</span>
          </span>
          <h2>本应用数据控制</h2>
        </div>
        <p class="muted">
          Mini-HBUT 使用你已有的校园登录凭据查询你本人有权访问的信息，不创建独立的校园机构账号，因此无法删除学校侧账号。
        </p>
        <div class="privacy-action-list">
          <button type="button" class="action-btn" :disabled="!!busy" @click="clearLocalCaches">
            <span class="action-btn__icon material-symbols-outlined">cached</span>
            <span>清除离线缓存</span>
          </button>
          <button type="button" class="action-btn" :disabled="!!busy" @click="clearSession">
            <span class="action-btn__icon material-symbols-outlined">logout</span>
            <span>清除登录会话</span>
          </button>
          <button type="button" class="action-btn danger" :disabled="!!busy" @click="clearAllLocal">
            <span class="action-btn__icon material-symbols-outlined">delete_forever</span>
            <span>清除全部本地数据</span>
          </button>
          <button type="button" class="action-btn" @click="disableCloudAndStats">
            <span class="action-btn__icon material-symbols-outlined">cloud_off</span>
            <span>关闭云同步与使用统计</span>
          </button>
          <button type="button" class="action-btn" @click="exportLocalMeta">
            <span class="action-btn__icon material-symbols-outlined">download</span>
            <span>导出个人数据元信息</span>
          </button>
        </div>
        <p class="muted">
          删除 Mini-HBUT 云端数据：若你曾开启云同步，请在关闭同步后通过反馈渠道申请删除服务端关联记录（学号哈希/设备标识）。本页不会删除学校系统中的成绩或账号。
        </p>
      </section>

      <p v-if="message" class="status privacy-card--enter" style="--enter-delay: 160ms">{{ message }}</p>
    </main>
  </div>
</template>

<style scoped>
.privacy-data-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient, #f6fafe);
  color: var(--ui-text, #1e293b);
}

.privacy-data-view__main {
  display: grid;
  gap: 14px;
  padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
  max-width: 720px;
  margin: 0 auto;
}

.privacy-card {
  background: var(--ui-surface, rgba(255, 255, 255, 0.92));
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.28));
  border-radius: 20px;
  padding: 16px 16px 14px;
  box-shadow: var(--ui-shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.08));
}

.privacy-card--enter {
  animation: privacySlideUp 0.38s ease both;
  animation-delay: var(--enter-delay, 0ms);
}

.privacy-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.privacy-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in oklab, var(--ui-primary, #667eea) 14%, var(--ui-surface, #fff) 86%);
  color: var(--ui-primary, #3b82f6);
  flex-shrink: 0;
}

.privacy-card__icon--policy {
  background: color-mix(in oklab, #0ea5e9 16%, var(--ui-surface, #fff) 84%);
  color: #0284c7;
}

.privacy-card__icon--control {
  background: color-mix(in oklab, #8b5cf6 16%, var(--ui-surface, #fff) 84%);
  color: #7c3aed;
}

.privacy-card__icon .material-symbols-outlined {
  font-size: 20px;
  line-height: 1;
}

.privacy-card h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--ui-text, #1e293b);
}

.privacy-card p {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ui-text, #1e293b);
}

.muted {
  color: var(--ui-muted, #64748b);
  font-size: 12px !important;
}

.privacy-link-list,
.privacy-action-list {
  display: grid;
  gap: 8px;
  margin: 4px 0 10px;
}

.link-btn,
.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  margin: 0;
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.35));
  background: color-mix(in oklab, var(--ui-surface, #fff) 88%, var(--ui-primary-soft, #eff6ff) 12%);
  color: var(--ui-text, #1e293b);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
  -webkit-tap-highlight-color: transparent;
}

.link-btn:active,
.action-btn:active:not(:disabled) {
  transform: scale(0.985);
}

.link-btn:hover,
.action-btn:hover:not(:disabled) {
  border-color: color-mix(in oklab, var(--ui-primary, #3b82f6) 28%, transparent);
  box-shadow: 0 6px 16px color-mix(in oklab, var(--ui-primary, #3b82f6) 10%, transparent);
}

.link-btn__icon,
.action-btn__icon {
  font-size: 18px;
  line-height: 1;
  color: var(--ui-primary, #3b82f6);
  flex-shrink: 0;
}

.link-btn__label {
  flex: 1;
  min-width: 0;
}

.link-btn__chev {
  font-size: 16px;
  line-height: 1;
  color: var(--ui-muted, #94a3b8);
  flex-shrink: 0;
}

.action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.action-btn.danger {
  border-color: color-mix(in oklab, #ef4444 40%, transparent);
  color: #b91c1c;
  background: color-mix(in oklab, #fef2f2 70%, var(--ui-surface, #fff) 30%);
}

.action-btn.danger .action-btn__icon {
  color: #dc2626;
}

.status {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #0f766e;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, #ccfbf1 55%, var(--ui-surface, #fff) 45%);
  border: 1px solid color-mix(in oklab, #14b8a6 24%, transparent);
}

@keyframes privacySlideUp {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .privacy-card--enter {
    animation: none;
  }

  .link-btn,
  .action-btn {
    transition: none;
  }
}
</style>
