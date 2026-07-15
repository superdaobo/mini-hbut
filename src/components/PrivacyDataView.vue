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
    <header class="privacy-data-view__header">
      <button type="button" class="back-btn" @click="emit('back')">返回</button>
      <h1>隐私与数据</h1>
      <span class="spacer" />
    </header>

    <section class="card">
      <h2>非官方声明</h2>
      <p>{{ NON_OFFICIAL_DISCLAIMER_ZH }}</p>
      <p class="muted">{{ NON_OFFICIAL_DISCLAIMER_EN }}</p>
    </section>

    <section class="card">
      <h2>政策与支持</h2>
      <button type="button" class="link-btn" @click="openUrl(PRIVACY_POLICY_URL)">查看隐私政策</button>
      <button type="button" class="link-btn" @click="openUrl(SECURITY_DOCS_URL)">数据与安全说明</button>
      <button type="button" class="link-btn" @click="openUrl(SUPPORT_DOCS_URL)">用户文档</button>
      <button type="button" class="link-btn" @click="openUrl(PROJECT_HOME_URL)">项目官网</button>
      <button type="button" class="link-btn" @click="openUrl(GITHUB_URL)">开源仓库</button>
      <button type="button" class="link-btn" @click="openUrl(FEEDBACK_URL)">联系支持 / 反馈</button>
    </section>

    <section class="card">
      <h2>本应用数据控制</h2>
      <p class="muted">
        Mini-HBUT 使用你已有的校园登录凭据查询你本人有权访问的信息，不创建独立的校园机构账号，因此无法删除学校侧账号。
      </p>
      <button type="button" class="action-btn" :disabled="!!busy" @click="clearLocalCaches">
        清除离线缓存
      </button>
      <button type="button" class="action-btn" :disabled="!!busy" @click="clearSession">
        清除登录会话
      </button>
      <button type="button" class="action-btn danger" :disabled="!!busy" @click="clearAllLocal">
        清除全部本地数据
      </button>
      <button type="button" class="action-btn" @click="disableCloudAndStats">
        关闭云同步与使用统计
      </button>
      <button type="button" class="action-btn" @click="exportLocalMeta">
        导出个人数据元信息
      </button>
      <p class="muted">
        删除 Mini-HBUT 云端数据：若你曾开启云同步，请在关闭同步后通过反馈渠道申请删除服务端关联记录（学号哈希/设备标识）。本页不会删除学校系统中的成绩或账号。
      </p>
    </section>

    <p v-if="message" class="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.privacy-data-view {
  padding: 12px 14px 96px;
  max-width: 720px;
  margin: 0 auto;
}
.privacy-data-view__header {
  display: grid;
  grid-template-columns: 90px 1fr 90px;
  align-items: center;
  margin-bottom: 12px;
}
.privacy-data-view__header h1 {
  margin: 0;
  text-align: center;
  font-size: 18px;
}
.spacer {
  display: block;
}
.card {
  background: color-mix(in oklab, #fff 92%, var(--ui-primary, #667eea) 8%);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
}
.card h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
.card p {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.5;
}
.muted {
  color: #64748b;
  font-size: 12px !important;
}
.link-btn,
.action-btn {
  display: block;
  width: 100%;
  text-align: left;
  margin: 6px 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.action-btn.danger {
  border-color: color-mix(in oklab, #ef4444 45%, transparent);
  color: #b91c1c;
}
.status {
  font-size: 12px;
  color: #0f766e;
}
.back-btn {
  min-width: 72px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #fff;
  cursor: pointer;
}
</style>
