<script setup>
/**
 * 智慧迎新 — 只读（#457 / #459）
 * 命令：smart_orientation_list_panels / list_messages / profile_blocks
 * 无填报/提交 UI；token 走 var(--ui-*)
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { TPageHeader, TEmptyState } from './templates'

const emit = defineEmits(['back'])

const loading = ref(false)
const error = ref('')
const notice = ref('')
const demo = ref(false)
const source = ref('')
const panels = ref([])
const messages = ref([])
const mentor = ref(null)
const counselor = ref(null)
const dorm = ref(null)
const profile = ref(null)
const selectedPanel = ref('all')

const hasAny = computed(
  () =>
    messages.value.length > 0 ||
    mentor.value ||
    counselor.value ||
    dorm.value ||
    profile.value ||
    panels.value.length > 0
)

const personLines = (p) => {
  if (!p) return []
  return [
    { label: '姓名', value: p.name },
    { label: '工号', value: p.staffId || p.staff_id },
    { label: '学院', value: p.college },
    { label: '电话', value: p.phone },
    { label: '邮箱', value: p.email },
    { label: '办公室', value: p.office },
    { label: '备注', value: p.remark }
  ].filter((x) => x.value)
}

const dormLines = computed(() => {
  const d = dorm.value || {}
  return [
    { label: '校区', value: d.campus },
    { label: '楼栋', value: d.building },
    { label: '房间', value: d.room },
    { label: '床位', value: d.bed },
    { label: '状态', value: d.status },
    { label: '备注', value: d.remark }
  ].filter((x) => x.value)
})

const profileLines = computed(() => {
  const p = profile.value || {}
  return [
    { label: '姓名', value: p.name },
    { label: '学号', value: p.studentId || p.student_id },
    { label: '性别', value: p.gender },
    { label: '学院', value: p.college },
    { label: '专业', value: p.major },
    { label: '班级', value: p.className || p.class_name },
    { label: '年级', value: p.grade },
    { label: '学历', value: p.educationLevel || p.education_level },
    { label: '手机', value: p.phone },
    { label: '迎新状态', value: p.orientationStatus || p.orientation_status }
  ].filter((x) => x.value)
})

const showMessages = computed(
  () => selectedPanel.value === 'all' || selectedPanel.value === 'messages'
)
const showMentor = computed(
  () => selectedPanel.value === 'all' || selectedPanel.value === 'mentor'
)
const showCounselor = computed(
  () => selectedPanel.value === 'all' || selectedPanel.value === 'counselor'
)
const showDorm = computed(
  () => selectedPanel.value === 'all' || selectedPanel.value === 'dorm'
)
const showProfile = computed(
  () => selectedPanel.value === 'all' || selectedPanel.value === 'profile'
)

const load = async () => {
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    if (!isTauriRuntime()) {
      throw new Error('请在客户端内使用智慧迎新')
    }
    const [pRes, mRes, bRes] = await Promise.all([
      invokeNative('smart_orientation_list_panels', {}),
      invokeNative('smart_orientation_list_messages', {}),
      invokeNative('smart_orientation_profile_blocks', {})
    ])
    panels.value = Array.isArray(pRes?.panels) ? pRes.panels : []
    messages.value = Array.isArray(mRes?.items) ? mRes.items : []
    mentor.value = bRes?.mentor || null
    counselor.value = bRes?.counselor || null
    dorm.value = bRes?.dorm || null
    profile.value = bRes?.profile || null
    demo.value = Boolean(pRes?.demo || mRes?.demo || bRes?.demo)
    source.value = String(pRes?.source || mRes?.source || bRes?.source || '')
    notice.value = String(
      pRes?.notice || mRes?.notice || bRes?.notice || ''
    ).trim()
    const errs = [pRes?.error, mRes?.error, bRes?.error].filter(Boolean)
    if (errs.length && !hasAny.value) {
      error.value = String(errs[0])
    } else if (!hasAny.value) {
      error.value = notice.value || '暂无迎新数据'
    }
  } catch (e) {
    error.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="so-page">
    <TPageHeader title="智慧迎新" subtitle="只读 · 门户会话" @back="emit('back')">
      <template #actions>
        <button type="button" class="so-refresh" :disabled="loading" @click="load">
          {{ loading ? '加载中' : '刷新' }}
        </button>
      </template>
    </TPageHeader>

    <div class="so-body">
      <p class="so-banner">
        仅展示官方已有信息，不支持填报、签名与提交。
        <span v-if="demo" class="so-pill">样例/回落</span>
        <span v-if="source" class="so-pill so-pill-muted">{{ source }}</span>
      </p>
      <p v-if="notice" class="so-notice">{{ notice }}</p>

      <div v-if="panels.length" class="so-tabs" role="tablist">
        <button
          type="button"
          class="so-tab"
          :class="{ active: selectedPanel === 'all' }"
          @click="selectedPanel = 'all'"
        >
          全部
        </button>
        <button
          v-for="p in panels"
          :key="p.id"
          type="button"
          class="so-tab"
          :class="{ active: selectedPanel === p.id }"
          @click="selectedPanel = p.id"
        >
          {{ p.title }}
          <span v-if="p.badge" class="so-badge">{{ p.badge }}</span>
        </button>
      </div>

      <div v-if="loading && !hasAny" class="so-loading">
        <div class="so-spinner" />
        <p>正在拉取迎新只读数据…</p>
      </div>

      <TEmptyState
        v-else-if="!loading && !hasAny"
        title="暂无数据"
        :description="error || '当前可能不在迎新开放时段，或需重新登录门户'"
      />

      <template v-else>
        <section v-if="showMessages && messages.length" class="so-section">
          <h2 class="so-section-title">事项与进度</h2>
          <article
            v-for="m in messages"
            :key="m.id"
            class="so-card so-msg"
            :data-unread="m.isRead === false || m.is_read === false"
          >
            <div class="so-msg-head">
              <h3 class="so-msg-title">{{ m.title }}</h3>
              <time v-if="m.publishedAt || m.published_at" class="so-msg-time">
                {{ m.publishedAt || m.published_at }}
              </time>
            </div>
            <p v-if="m.summary || m.body" class="so-msg-body">{{ m.summary || m.body }}</p>
          </article>
        </section>

        <section v-if="showMentor && mentor" class="so-section">
          <h2 class="so-section-title">班导师</h2>
          <div class="so-card so-kv-grid">
            <div v-for="(row, i) in personLines(mentor)" :key="'mt-' + i" class="so-kv">
              <span class="so-kv-label">{{ row.label }}</span>
              <span class="so-kv-value">{{ row.value }}</span>
            </div>
          </div>
        </section>

        <section v-if="showCounselor && counselor" class="so-section">
          <h2 class="so-section-title">辅导员</h2>
          <div class="so-card so-kv-grid">
            <div v-for="(row, i) in personLines(counselor)" :key="'c-' + i" class="so-kv">
              <span class="so-kv-label">{{ row.label }}</span>
              <span class="so-kv-value">{{ row.value }}</span>
            </div>
          </div>
        </section>

        <section v-if="showDorm && dormLines.length" class="so-section">
          <h2 class="so-section-title">宿舍信息</h2>
          <div class="so-card so-kv-grid">
            <div v-for="(row, i) in dormLines" :key="'d-' + i" class="so-kv">
              <span class="so-kv-label">{{ row.label }}</span>
              <span class="so-kv-value">{{ row.value }}</span>
            </div>
          </div>
        </section>

        <section v-if="showProfile && profileLines.length" class="so-section">
          <h2 class="so-section-title">个人信息</h2>
          <div class="so-card so-kv-grid">
            <div v-for="(row, i) in profileLines" :key="'p-' + i" class="so-kv">
              <span class="so-kv-label">{{ row.label }}</span>
              <span class="so-kv-value">{{ row.value }}</span>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.so-page {
  min-height: 100%;
  background: var(--ui-bg, #f5f7fb);
  color: var(--ui-text, #0f172a);
}
.so-body {
  padding: 12px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.so-banner,
.so-notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-muted, #64748b);
  background: var(--ui-surface, rgba(255, 255, 255, 0.72));
  border: 1px solid var(--ui-border, rgba(15, 23, 42, 0.08));
}
.so-notice {
  color: var(--ui-primary, #2563eb);
}
.so-pill {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, var(--ui-primary, #3b82f6) 16%, transparent);
  color: var(--ui-primary, #2563eb);
}
.so-pill-muted {
  background: var(--ui-border, rgba(15, 23, 42, 0.08));
  color: var(--ui-muted, #64748b);
}
.so-refresh {
  border: none;
  background: transparent;
  color: var(--ui-primary, #3b82f6);
  font-size: 14px;
  font-weight: 600;
  padding: 6px 8px;
  cursor: pointer;
}
.so-refresh:disabled {
  opacity: 0.5;
}
.so-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.so-tab {
  border: 1px solid var(--ui-border, rgba(15, 23, 42, 0.1));
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.so-tab.active {
  border-color: var(--ui-primary, #3b82f6);
  color: var(--ui-primary, #2563eb);
  font-weight: 650;
}
.so-badge {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.85;
}
.so-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--ui-muted, #64748b);
}
.so-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--ui-border, rgba(15, 23, 42, 0.12));
  border-top-color: var(--ui-primary, #3b82f6);
  animation: so-spin 0.8s linear infinite;
}
@keyframes so-spin {
  to {
    transform: rotate(360deg);
  }
}
.so-section-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
}
.so-card {
  background: var(--ui-surface, #fff);
  border: 1px solid var(--ui-border, rgba(15, 23, 42, 0.08));
  border-radius: 14px;
  padding: 14px 16px;
}
.so-msg + .so-msg {
  margin-top: 10px;
}
.so-msg-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.so-msg-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}
.so-msg-time {
  font-size: 12px;
  color: var(--ui-muted, #64748b);
  flex-shrink: 0;
}
.so-msg-body {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-muted, #475569);
}
.so-kv-grid {
  display: grid;
  gap: 10px;
}
.so-kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}
.so-kv-label {
  color: var(--ui-muted, #64748b);
}
.so-kv-value {
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}
</style>
