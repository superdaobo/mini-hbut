<script setup>
/**
 * 教学评教 — 列表/表单 + 一键满分并提交（确认 / 不再询问）
 * Issue: #439
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { showToast } from '../utils/toast'
import { useI18n } from '../utils/app_i18n'
import { TPageHeader, TEmptyState, TModal } from './templates'

const emit = defineEmits(['back'])

// i18n（#794 批次 I）
const { t } = useI18n()
const SKIP_KEY = 'hbu_teaching_eval_skip_confirm'
// 默认评语模板（数据格式值：随表单提交到教务，必须为中文原文，\u 转义通过 CJK 扫描）
const COMMENT_TEMPLATE = '\u8ba4\u771f\u8d1f\u8d23\uff0c\u6536\u83b7\u5f88\u5927\u3002'

const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const items = ref([])
const selected = ref(null)
const form = ref(null)
const showConfirm = ref(false)
const skipConfirm = ref(false)
const protocolReady = ref(true)

const pending = computed(() => items.value.filter((i) => i.status !== 'done'))
const done = computed(() => items.value.filter((i) => i.status === 'done'))

const loadSkip = () => {
  try {
    skipConfirm.value = localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    skipConfirm.value = false
  }
}

const saveSkip = (value) => {
  try {
    if (value) localStorage.setItem(SKIP_KEY, '1')
    else localStorage.removeItem(SKIP_KEY)
  } catch {
    /* ignore */
  }
  skipConfirm.value = !!value
}

const fetchList = async () => {
  loading.value = true
  error.value = ''
  try {
    if (!isTauriRuntime()) throw new Error(t('eval.error.clientOnly'))
    const res = await invokeNative('teaching_eval_list', {})
    protocolReady.value = res?.protocol_ready !== false
    items.value = Array.isArray(res?.items) ? res.items : []
    if (res?.message && !items.value.length) {
      error.value = String(res.message)
    }
  } catch (e) {
    error.value = String(e?.message || e || t('eval.error.loadFailed'))
    protocolReady.value = false
  } finally {
    loading.value = false
  }
}

const openItem = async (item) => {
  selected.value = item
  form.value = null
  try {
    if (!isTauriRuntime()) return
    const res = await invokeNative('teaching_eval_form', { eval_id: item.id })
    form.value = res || null
  } catch (e) {
    showToast(String(e?.message || e || t('eval.error.formFailed')))
  }
}

const fillFullScore = () => {
  if (!form.value?.questions) return
  form.value = {
    ...form.value,
    questions: form.value.questions.map((q) => {
      if (q.kind === 'score' || q.kind === 'rate') {
        return { ...q, value: q.max_score ?? 10 }
      }
      if (q.kind === 'text' && (!q.value || !String(q.value).trim())) {
        return { ...q, value: COMMENT_TEMPLATE }
      }
      return q
    })
  }
  showToast(t('eval.toast.fullScoreFilled'))
}

const doSubmit = async () => {
  if (!selected.value) return
  submitting.value = true
  try {
    fillFullScore()
    const res = await invokeNative('teaching_eval_submit', {
      eval_id: selected.value.id,
      answers: form.value?.questions || [],
      quick_full_score: true
    })
    if (res?.success === false) throw new Error(res?.message || t('eval.error.submitFailed'))
    showToast(t('eval.toast.submitted'))
    selected.value = null
    form.value = null
    await fetchList()
  } catch (e) {
    showToast(String(e?.message || e || t('eval.error.submitFailed')))
  } finally {
    submitting.value = false
    showConfirm.value = false
  }
}

const onQuickSubmit = () => {
  if (skipConfirm.value) {
    void doSubmit()
    return
  }
  showConfirm.value = true
}

const confirmSubmit = (remember) => {
  if (remember) saveSkip(true)
  void doSubmit()
}

const resetSkipPreference = () => {
  saveSkip(false)
  showToast(t('eval.toast.confirmRestored'))
}

onMounted(() => {
  loadSkip()
  void fetchList()
})
</script>

<template>
  <div class="te-page">
    <TPageHeader
      :title="t('eval.title')"
      :subtitle="selected ? selected.title : t('eval.subtitle.pending')"
      @back="selected ? ((selected = null), (form = null)) : emit('back')"
    />

    <div class="te-body">
      <div class="te-toolbar">
        <button type="button" class="te-btn" :disabled="loading" @click="fetchList">
          {{ loading ? t('eval.action.refreshing') : t('common.refresh') }}
        </button>
        <button v-if="skipConfirm" type="button" class="te-btn ghost" @click="resetSkipPreference">
          {{ t('eval.action.resetSkip') }}
        </button>
      </div>

      <p v-if="error" class="te-error">{{ error }}</p>
      <p v-if="!protocolReady" class="te-warn">
        {{ t('eval.warn.protocol') }}
      </p>

      <template v-if="!selected">
        <h3 class="te-h">{{ tf('eval.list.pending', { n: pending.length }) }}</h3>
        <TEmptyState
          v-if="!loading && !pending.length"
          type="empty"
          :message="t('eval.list.emptyPending')"
        />
        <button
          v-for="item in pending"
          :key="item.id"
          type="button"
          class="card-surface te-row"
          @click="openItem(item)"
        >
          <div class="te-title">{{ item.title || item.course_name || t('eval.list.taskFallback') }}</div>
          <div class="te-meta">{{ item.teacher || item.teacher_name || '' }} · {{ t('eval.list.pendingMeta') }}</div>
        </button>

        <h3 class="te-h">{{ tf('eval.list.done', { n: done.length }) }}</h3>
        <button
          v-for="item in done"
          :key="item.id"
          type="button"
          class="card-surface te-row muted"
          @click="openItem(item)"
        >
          <div class="te-title">{{ item.title || item.course_name || t('eval.list.taskFallback') }}</div>
          <div class="te-meta">{{ t('eval.list.doneMeta') }}</div>
        </button>
      </template>

      <section v-else class="card-surface">
        <h3 class="te-title">{{ selected.title || selected.course_name }}</h3>
        <p class="te-meta">{{ selected.teacher || selected.teacher_name }}</p>

        <div v-if="form?.questions?.length" class="te-form">
          <div v-for="(q, idx) in form.questions" :key="q.id || idx" class="te-q">
            <div class="te-q-title">{{ idx + 1 }}. {{ q.title || q.label }}</div>
            <input
              v-if="q.kind === 'score' || q.kind === 'rate'"
              v-model.number="q.value"
              type="number"
              :min="0"
              :max="q.max_score || 10"
              class="te-input"
            />
            <textarea
              v-else-if="q.kind === 'text'"
              v-model="q.value"
              class="te-input te-textarea"
              rows="3"
            />
            <p v-else class="te-meta">{{ tf('eval.form.questionType', { kind: q.kind || t('eval.form.kind.unknown') }) }}</p>
          </div>
        </div>
        <TEmptyState v-else type="empty" :message="t('eval.form.empty')" />

        <div class="te-actions">
          <button type="button" class="te-btn" @click="fillFullScore">{{ t('eval.action.fullScore') }}</button>
          <button
            type="button"
            class="te-btn primary"
            :disabled="submitting"
            @click="onQuickSubmit"
          >
            {{ submitting ? t('eval.action.submitting') : t('eval.action.quickSubmit') }}
          </button>
        </div>
      </section>
    </div>

    <TModal :visible="showConfirm" :title="t('eval.confirm.title')" @close="showConfirm = false">
      <p>{{ t('eval.confirm.text') }}</p>
      <label class="te-check">
        <input v-model="skipConfirm" type="checkbox" />
        {{ t('eval.confirm.noMoreAsk') }}
      </label>
      <div class="te-actions">
        <button type="button" class="te-btn" @click="showConfirm = false">{{ t('common.cancel') }}</button>
        <button type="button" class="te-btn primary" @click="confirmSubmit(skipConfirm)">
          {{ t('eval.confirm.submit') }}
        </button>
      </div>
    </TModal>
  </div>
</template>

<style scoped>
.te-page {
  min-height: 100%;
  background: #f6fafe;
  color: #1e293b;
  padding-bottom: 104px;
}
.te-body {
  padding: 12px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.te-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.te-btn {
  border: 1px solid var(--ui-border, #d0d7e2);
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
}
.te-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
.te-btn.ghost {
  background: transparent;
}
.te-error {
  color: #dc2626;
  font-size: 13px;
}
.te-warn {
  color: #b45309;
  font-size: 13px;
}
.te-h {
  margin: 8px 0 4px;
  font-size: 14px;
}
.card-surface {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  text-align: left;
  color: inherit;
  box-shadow: 0 4px 15px rgba(15, 23, 42, 0.04);
}
.te-row {
  width: 100%;
  cursor: pointer;
}
.te-row.muted {
  opacity: 0.85;
}
.te-title {
  font-weight: 600;
  font-size: 14px;
}
.te-meta {
  font-size: 12px;
  color: var(--ui-muted, #64748b);
  margin-top: 4px;
}
.te-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}
.te-q-title {
  font-size: 13px;
  margin-bottom: 6px;
}
.te-input {
  width: 100%;
  border: 1px solid var(--ui-border, #d0d7e2);
  border-radius: 8px;
  padding: 8px;
  background: var(--ui-bg, #fff);
  color: inherit;
}
.te-textarea {
  resize: vertical;
}
.te-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
}
.te-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  font-size: 13px;
}
html.dark .te-page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card-surface {
  background: var(--ui-surface, #111827);
  border-color: #334155;
}
html.dark .te-btn {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}
html.dark .te-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
</style>
