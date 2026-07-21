<script setup>
/**
 * 教学评教 — 列表/表单 + 一键满分并提交（确认 / 不再询问）
 * Issue: #439
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState, TModal } from './templates'

const emit = defineEmits(['back'])
const SKIP_KEY = 'hbu_teaching_eval_skip_confirm'
const COMMENT_TEMPLATE = '认真负责，收获很大。'

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
    if (!isTauriRuntime()) throw new Error('请在客户端内使用评教')
    const res = await invokeNative('teaching_eval_list', {})
    protocolReady.value = res?.protocol_ready !== false
    items.value = Array.isArray(res?.items) ? res.items : []
    if (res?.message && !items.value.length) {
      error.value = String(res.message)
    }
  } catch (e) {
    error.value = String(e?.message || e || '加载失败')
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
    showToast(String(e?.message || e || '表单加载失败'))
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
  showToast('已填入满分与默认评语')
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
    if (res?.success === false) throw new Error(res?.message || '提交失败')
    showToast('提交成功')
    selected.value = null
    form.value = null
    await fetchList()
  } catch (e) {
    showToast(String(e?.message || e || '提交失败'))
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
  showToast('已恢复每次确认')
}

onMounted(() => {
  loadSkip()
  void fetchList()
})
</script>

<template>
  <div class="te-page">
    <TPageHeader
      title="教学评教"
      :subtitle="selected ? selected.title : '待评课程'"
      @back="selected ? ((selected = null), (form = null)) : emit('back')"
    />

    <div class="te-body">
      <div class="te-toolbar">
        <button type="button" class="te-btn" :disabled="loading" @click="fetchList">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <button v-if="skipConfirm" type="button" class="te-btn ghost" @click="resetSkipPreference">
          重置「不再询问」
        </button>
      </div>

      <p v-if="error" class="te-error">{{ error }}</p>
      <p v-if="!protocolReady" class="te-warn">
        评教协议尚未完全对接时，列表可能为空。后续版本将补齐抓包路径。
      </p>

      <template v-if="!selected">
        <h3 class="te-h">待评（{{ pending.length }}）</h3>
        <TEmptyState
          v-if="!loading && !pending.length"
          title="暂无待评"
          description="当前学期若有评教任务会显示在此。"
        />
        <button
          v-for="item in pending"
          :key="item.id"
          type="button"
          class="card-surface te-row"
          @click="openItem(item)"
        >
          <div class="te-title">{{ item.title || item.course_name || '评教任务' }}</div>
          <div class="te-meta">{{ item.teacher || item.teacher_name || '' }} · 待完成</div>
        </button>

        <h3 class="te-h">已评（{{ done.length }}）</h3>
        <button
          v-for="item in done"
          :key="item.id"
          type="button"
          class="card-surface te-row muted"
          @click="openItem(item)"
        >
          <div class="te-title">{{ item.title || item.course_name || '评教任务' }}</div>
          <div class="te-meta">已完成</div>
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
            <p v-else class="te-meta">题型：{{ q.kind || '未知' }}</p>
          </div>
        </div>
        <TEmptyState v-else title="暂无表单详情" description="后端将在协议对接后返回题目结构。" />

        <div class="te-actions">
          <button type="button" class="te-btn" @click="fillFullScore">全部 10 分</button>
          <button
            type="button"
            class="te-btn primary"
            :disabled="submitting"
            @click="onQuickSubmit"
          >
            {{ submitting ? '提交中…' : '一键满分并提交' }}
          </button>
        </div>
      </section>
    </div>

    <TModal :visible="showConfirm" title="确认满分提交" @close="showConfirm = false">
      <p>将对本评教全部评分题填 10 分（或满分）并提交，通常不可撤销。</p>
      <label class="te-check">
        <input v-model="skipConfirm" type="checkbox" />
        不再询问
      </label>
      <div class="te-actions">
        <button type="button" class="te-btn" @click="showConfirm = false">取消</button>
        <button type="button" class="te-btn primary" @click="confirmSubmit(skipConfirm)">
          确认提交
        </button>
      </div>
    </TModal>
  </div>
</template>

<style scoped>
.te-page {
  min-height: 100%;
  background: var(--ui-bg, #f5f7fb);
  color: var(--ui-text, #0f172a);
}
.te-body {
  padding: 12px 16px 28px;
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
  background: var(--ui-primary, #a855f7);
  border-color: transparent;
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
  background: var(--ui-surface, #fff);
  border: 1px solid var(--ui-border, #e2e8f0);
  border-radius: 14px;
  padding: 12px;
  text-align: left;
  color: inherit;
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
  border-color: var(--ui-border, #1f2937);
}
</style>
