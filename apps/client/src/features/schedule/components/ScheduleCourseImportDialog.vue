<script setup>
/**
 * AI 课表导入 Dialog（#815 / #819）。
 *
 * 两阶段流程：
 *   Step 1 输入：目标学期 + 复制提示词 + 粘贴/文件导入 + 解析
 *   Step 2 预览：统计摘要 + 课程列表（勾选 / 改色 / 冲突与重复提示）+ 确认导入
 *   Step 3 结果：added / skipped / failed 汇总
 *
 * 本组件只负责展示与交互，所有解析 / 合并 / 冲突 / 配色 / 提交规则
 * 均由 useScheduleImport 编排，组件内不重复实现业务规则。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../../utils/app_i18n'
import CourseColorPicker from '../../../components/CourseColorPicker.vue'
import ScheduleGrid from './ScheduleGrid.vue'
import { getWeekDayLabels } from '../constants'
import { getCourseStyle } from '../utils/layout'
import { formatWeeksText } from '../utils/weeks'
import { buildAiCourseImportPrompt, buildAiCourseImportExample } from '../utils/importPrompt'

const props = defineProps({
  showImportDialog: { type: Boolean, default: false },
  /** input | preview | result */
  stage: { type: String, default: 'input' },
  targetSemester: { type: String, default: '' },
  rawText: { type: String, default: '' },
  showExample: { type: Boolean, default: false },
  parsing: { type: Boolean, default: false },
  committing: { type: Boolean, default: false },
  parseError: { type: String, default: '' },
  globalDiagnostics: { type: Array, default: () => [] },
  previewCourses: { type: Array, default: () => [] },
  importResult: { type: Object, default: null },
  summary: { type: Object, default: () => ({}) },
  hasImportable: { type: Boolean, default: false },
  semesterOptions: { type: Array, default: () => [] },
  // #821 课表预览
  previewMode: { type: String, default: 'list' },
  previewWeek: { type: Number, default: 1 },
  previewTotalWeeks: { type: Number, default: 1 },
  previewWeekDates: { type: Array, default: () => [] },
  previewGetCoursesForDay: { type: Function, default: () => () => [] },
  previewConflictsOf: { type: Function, default: () => null },
  scheduleCourseCardStyle: { type: String, default: 'modern' },
})

const emit = defineEmits([
  'close',
  'update:targetSemester',
  'update:rawText',
  'toggle-example',
  'copy-prompt',
  'file-import',
  'parse',
  'back',
  'toggle-select',
  'select-all',
  'color-change',
  'ai-colors',
  'balanced-colors',
  'reset-colors',
  'commit',
  'set-preview-mode',
  'set-preview-week',
  'prev-preview-week',
  'next-preview-week',
])

const { t } = useI18n()

const fileInputEl = ref(null)

const promptText = computed(() => buildAiCourseImportPrompt())
const exampleText = computed(() => buildAiCourseImportExample())

/** 学期下拉的当前值（受控） */
const semesterModel = computed({
  get: () => props.targetSemester,
  set: (value) => emit('update:targetSemester', value),
})

const rawTextModel = computed({
  get: () => props.rawText,
  set: (value) => emit('update:rawText', value),
})

const weekdayLabels = computed(() => getWeekDayLabels())

const weekdayText = (weekday) => weekdayLabels.value[Number(weekday) - 1] || `周${weekday}`

const weeksText = (weeks) => {
  const text = formatWeeksText(weeks)
  return text ? t('schedule.import.weeksSuffix').replace('{t}', text) : ''
}

const periodText = (course) => `${course.period}-${course.period + course.djs - 1}`

/** 课程名相同即为同一颜色组 */
const isSameGroup = (item, other) =>
  String(item?.course?.name || '').trim().toLowerCase() ===
  String(other?.course?.name || '').trim().toLowerCase()

const triggerFilePick = () => fileInputEl.value?.click()

const onFileChange = (event) => emit('file-import', event)

const colorOf = (item) => item?.colorOverride || '#cbd5e1'

// ===== #821 课表布局预览 =====

/** 预览课程卡片样式：复用主课表当前卡片样式模式 */
const previewCourseStyle = (course) => getCourseStyle(course, props.scheduleCourseCardStyle)

/** 预览网格不做 Widget 深链接高亮 */
const noHighlight = () => false

/** 预览周可选项（1..总周数） */
const previewWeekOptions = computed(() =>
  Array.from({ length: Math.max(1, Number(props.previewTotalWeeks) || 1) }, (_, i) => i + 1)
)

/** 预览网格左上角月份：无日期头时回退到当前月（与主课表 currentMonth 一致） */
const previewCurrentMonth = computed(
  () => Number(props.previewWeekDates[0]?.month || 0) || new Date().getMonth() + 1
)

/** 当前被点开的预览课程 key */
const activeConflictKey = ref('')

/** 当前预览课程的冲突详情（由 composable 按 key 取回） */
const activeConflict = computed(() => {
  if (!activeConflictKey.value) return null
  return props.previewConflictsOf(activeConflictKey.value) || null
})

/**
 * 点击网格课程：仅预览课程展示冲突信息，绝不打开真实课程详情；
 * 既有课程（无 _preview 标记）点击直接忽略。
 */
const onPreviewOpenDetail = (course) => {
  if (!course || !course._preview) return
  const key = String(course._uid || '')
  if (!key) return
  activeConflictKey.value = key
}

const closeConflict = () => {
  activeConflictKey.value = ''
}

/** 冲突来源文案（import / official / custom） */
const conflictSourceText = (source) => t(`schedule.import.preview.source.${source}`)

/** 预览周下拉文案：第 N 周 */
const weekOptionText = (week) => t('schedule.import.preview.weekOption').replace('{n}', String(week))

const onPreviewWeekChange = (event) => {
  emit('set-preview-week', Number(event?.target?.value || 1))
}

// 切换预览模式 / 预览周时收起冲突详情，避免残留过期信息
watch(
  () => [props.previewMode, props.previewWeek],
  () => {
    activeConflictKey.value = ''
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="sci-fade">
      <div v-if="showImportDialog" class="sci-mask" @click.self="emit('close')">
        <div
          class="sci-panel"
          :class="{ 'sci-panel--wide': stage === 'preview' && previewMode === 'grid' }"
          role="dialog"
          aria-modal="true"
        >
          <header class="sci-header">
            <div class="sci-title">{{ t('schedule.import.title') }}</div>
            <button type="button" class="sci-close" :aria-label="t('common.close')" @click="emit('close')">
              <span class="material-symbols-outlined">close</span>
            </button>
          </header>

          <!-- Step 1：输入 -->
          <div v-if="stage === 'input'" class="sci-body">
            <p class="sci-desc">{{ t('schedule.import.desc') }}</p>

            <label class="sci-field">
              <span class="sci-field-label">{{ t('schedule.import.semester') }}</span>
              <select v-model="semesterModel" class="sci-select">
                <option v-for="item in semesterOptions" :key="item.value || item" :value="item.value || item">
                  {{ item.label || item }}
                </option>
              </select>
            </label>

            <div class="sci-tools">
              <button type="button" class="sci-btn ghost" @click="emit('copy-prompt')">
                <span class="material-symbols-outlined">content_copy</span>
                {{ t('schedule.import.copyPrompt') }}
              </button>
              <button type="button" class="sci-btn ghost" @click="emit('toggle-example')">
                <span class="material-symbols-outlined">help</span>
                {{ showExample ? t('schedule.import.hideExample') : t('schedule.import.showExample') }}
              </button>
            </div>

            <pre v-if="showExample" class="sci-example">{{ exampleText }}</pre>

            <textarea
              v-model="rawTextModel"
              class="sci-textarea"
              :placeholder="t('schedule.import.placeholder')"
              spellcheck="false"
            />

            <div v-if="parseError" class="sci-error">{{ parseError }}</div>

            <div class="sci-footer">
              <button type="button" class="sci-btn ghost" @click="triggerFilePick">
                <span class="material-symbols-outlined">file_upload</span>
                {{ t('schedule.import.fromFile') }}
              </button>
              <button
                type="button"
                class="sci-btn primary"
                :disabled="parsing || !rawText.trim()"
                @click="emit('parse')"
              >
                {{ parsing ? t('schedule.import.parsing') : t('schedule.import.parse') }}
              </button>
            </div>

            <input
              ref="fileInputEl"
              type="file"
              accept=".json,.txt,application/json,text/plain"
              class="sci-file-input"
              @change="onFileChange"
            >
          </div>

          <!-- Step 2：预览 -->
          <div v-else-if="stage === 'preview'" class="sci-body">
            <div class="sci-summary">
              <span class="sci-chip">{{ t('schedule.import.summary.raw') }} {{ summary.raw }}</span>
              <span class="sci-chip">{{ t('schedule.import.summary.merged') }} {{ summary.merged }}</span>
              <span class="sci-chip accent">{{ t('schedule.import.summary.importable') }} {{ summary.importable }}</span>
              <span v-if="summary.duplicate" class="sci-chip warn">{{ t('schedule.import.summary.duplicate') }} {{ summary.duplicate }}</span>
              <span v-if="summary.conflict" class="sci-chip warn">{{ t('schedule.import.summary.conflict') }} {{ summary.conflict }}</span>
              <span v-if="summary.warning" class="sci-chip warn">{{ t('schedule.import.summary.warning') }} {{ summary.warning }}</span>
              <span v-if="summary.error" class="sci-chip danger">{{ t('schedule.import.summary.error') }} {{ summary.error }}</span>
            </div>

            <!-- #821 预览模式切换：列表 / 课表 -->
            <div class="sci-mode-switch" role="tablist">
              <button
                type="button"
                class="sci-mode-btn"
                :class="{ active: previewMode === 'list' }"
                @click="emit('set-preview-mode', 'list')"
              >
                {{ t('schedule.import.preview.modeList') }}
              </button>
              <button
                type="button"
                class="sci-mode-btn"
                :class="{ active: previewMode === 'grid' }"
                @click="emit('set-preview-mode', 'grid')"
              >
                {{ t('schedule.import.preview.modeGrid') }}
              </button>
            </div>

            <!-- 列表预览 -->
            <template v-if="previewMode === 'list'">
            <div class="sci-list-tools">
              <button type="button" class="sci-link" @click="emit('select-all', true)">{{ t('schedule.import.selectAll') }}</button>
              <button type="button" class="sci-link" @click="emit('select-all', false)">{{ t('schedule.import.selectNone') }}</button>
              <span class="sci-list-tools-spacer" />
              <button type="button" class="sci-link" @click="emit('ai-colors')">{{ t('schedule.import.color.ai') }}</button>
              <button type="button" class="sci-link" @click="emit('balanced-colors')">{{ t('schedule.import.color.balanced') }}</button>
              <button type="button" class="sci-link" @click="emit('reset-colors')">{{ t('schedule.import.color.reset') }}</button>
            </div>

            <div v-if="!previewCourses.length" class="sci-empty">{{ t('schedule.import.empty') }}</div>

            <ul v-else class="sci-list">
              <li v-for="item in previewCourses" :key="item.key" class="sci-item">
                <label class="sci-item-main">
                  <input
                    type="checkbox"
                    class="sci-check"
                    :checked="item.selected"
                    :disabled="item.duplicateKind === 'exact'"
                    @change="emit('toggle-select', item.key)"
                  >
                  <span class="sci-item-text">
                    <span class="sci-item-name">
                      {{ item.course.name }}
                      <span v-if="item.duplicateKind === 'exact'" class="sci-badge warn">{{ t('schedule.import.badge.duplicate') }}</span>
                      <span v-else-if="item.duplicateKind === 'possible'" class="sci-badge warn">{{ t('schedule.import.badge.possibleDuplicate') }}</span>
                    </span>
                    <span class="sci-item-meta">
                      {{ weekdayText(item.course.weekday) }} {{ periodText(item.course) }}{{ t('schedule.import.periodSuffix') }}
                      <template v-if="weeksText(item.course.weeks)"> · {{ weeksText(item.course.weeks) }}</template>
                    </span>
                    <span v-if="item.course.room || item.course.teacher" class="sci-item-meta">
                      {{ item.course.room || '—' }} · {{ item.course.teacher || '—' }}
                    </span>
                    <span
                      v-for="(conflict, ci) in item.conflicts"
                      :key="`c-${ci}`"
                      class="sci-item-warn"
                    >
                      {{ t('schedule.import.badge.conflictWith').replace('{name}', conflict.withCourseName) }}
                      <template v-if="conflict.overlapWeeks.length">
                        （{{ t('schedule.import.overlapWeeks').replace('{t}', formatWeeksText(conflict.overlapWeeks)) }}）
                      </template>
                    </span>
                  </span>
                </label>

                <div class="sci-item-color">
                  <CourseColorPicker
                    :model-value="item.colorOverride || ''"
                    @update:model-value="emit('color-change', item, $event)"
                  />
                </div>
              </li>
            </ul>

            <div v-if="globalDiagnostics.length" class="sci-global-diag">
              <div v-for="(diag, di) in globalDiagnostics" :key="`g-${di}`" class="sci-item-warn">{{ diag.message }}</div>
            </div>
            </template>

            <!-- 课表预览（#821）：真实网格布局 + 冲突可视化，仅预览不写库 -->
            <template v-else>
              <div class="sci-week-nav">
                <button
                  type="button"
                  class="sci-btn ghost sci-week-btn"
                  :disabled="previewWeek <= 1"
                  :aria-label="t('schedule.import.preview.prevWeek')"
                  @click="emit('prev-preview-week')"
                >
                  <span class="material-symbols-outlined">chevron_left</span>
                </button>
                <select class="sci-select sci-week-select" :value="previewWeek" @change="onPreviewWeekChange">
                  <option v-for="w in previewWeekOptions" :key="w" :value="w">{{ weekOptionText(w) }}</option>
                </select>
                <button
                  type="button"
                  class="sci-btn ghost sci-week-btn"
                  :disabled="previewWeek >= previewTotalWeeks"
                  :aria-label="t('schedule.import.preview.nextWeek')"
                  @click="emit('next-preview-week')"
                >
                  <span class="material-symbols-outlined">chevron_right</span>
                </button>
                <span class="sci-week-note">{{ t('schedule.import.preview.weekNote') }}</span>
              </div>

              <div class="sci-grid-scroll">
                <div class="sci-grid-inner">
                  <ScheduleGrid
                    :week-dates="previewWeekDates"
                    :current-month="previewCurrentMonth"
                    :selected-week="previewWeek"
                    week-transition-name="week-slide-left"
                    :schedule-course-card-style="scheduleCourseCardStyle"
                    :course-card-refresh-nonce="0"
                    :get-courses-for-day="previewGetCoursesForDay"
                    :get-course-style="previewCourseStyle"
                    :is-widget-highlighted="noHighlight"
                    @open-detail="onPreviewOpenDetail"
                  />
                </div>
              </div>

              <div v-if="activeConflict" class="sci-conflict-panel">
                <div class="sci-conflict-head">
                  <span class="sci-conflict-title">{{ t('schedule.import.preview.conflictTitle') }}</span>
                  <button type="button" class="sci-close" :aria-label="t('common.close')" @click="closeConflict">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div class="sci-conflict-course">{{ activeConflict.course.name }}</div>
                <div v-if="!activeConflict.conflicts.length" class="sci-item-meta">
                  {{ t('schedule.import.preview.noConflict') }}
                </div>
                <div v-for="(conflict, ci) in activeConflict.conflicts" :key="`pc-${ci}`" class="sci-item-warn">
                  <div>{{ t('schedule.import.badge.conflictWith').replace('{name}', conflict.withCourseName) }}</div>
                  <div>
                    {{ t('schedule.import.preview.conflictPeriod')
                      .replace('{a}', String(conflict.overlapPeriodStart))
                      .replace('{b}', String(conflict.overlapPeriodEnd)) }}
                  </div>
                  <div v-if="conflict.overlapWeeks.length">
                    {{ t('schedule.import.overlapWeeks').replace('{t}', formatWeeksText(conflict.overlapWeeks)) }}
                  </div>
                  <div>{{ t('schedule.import.preview.conflictSource').replace('{s}', conflictSourceText(conflict.source)) }}</div>
                </div>
              </div>
            </template>

            <div class="sci-footer">
              <button type="button" class="sci-btn ghost" @click="emit('back')">{{ t('schedule.import.back') }}</button>
              <button
                type="button"
                class="sci-btn primary"
                :disabled="committing || !hasImportable"
                @click="emit('commit')"
              >
                {{ committing
                  ? t('schedule.import.committing')
                  : t('schedule.import.confirm').replace('{n}', String(summary.importable)) }}
              </button>
            </div>
          </div>

          <!-- Step 3：结果汇总 -->
          <div v-else class="sci-body">
            <div class="sci-result">
              <div class="sci-result-row">
                <span class="sci-result-label">{{ t('schedule.import.result.added') }}</span>
                <span class="sci-result-value">{{ importResult?.added ?? 0 }}</span>
              </div>
              <div class="sci-result-row">
                <span class="sci-result-label">{{ t('schedule.import.result.skipped') }}</span>
                <span class="sci-result-value">{{ importResult?.skipped ?? 0 }}</span>
              </div>
              <div class="sci-result-row">
                <span class="sci-result-label">{{ t('schedule.import.result.failed') }}</span>
                <span class="sci-result-value danger">{{ importResult?.failed ?? 0 }}</span>
              </div>
            </div>
            <div class="sci-footer">
              <button type="button" class="sci-btn primary" @click="emit('close')">{{ t('schedule.import.done') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sci-mask {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.sci-panel {
  width: min(100%, 560px);
  max-height: min(86dvh, 760px);
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  overflow: hidden;
}

.sci-panel--wide {
  width: min(100%, 980px);
}

.sci-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}

.sci-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.sci-close {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  padding: 2px;
}

.sci-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
}

.sci-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.sci-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sci-field-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.sci-select {
  min-height: 38px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
}

.sci-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sci-example {
  margin: 0;
  padding: 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 11px;
  line-height: 1.5;
  color: #334155;
  overflow-x: auto;
  max-height: 200px;
}

.sci-textarea {
  min-height: 160px;
  resize: vertical;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: #0f172a;
  box-sizing: border-box;
}

.sci-textarea:focus {
  outline: none;
  border-color: #2563eb;
}

.sci-error {
  padding: 10px;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.5;
}

.sci-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.sci-btn {
  min-height: 40px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
}

.sci-btn .material-symbols-outlined {
  font-size: 18px;
}

.sci-btn.ghost {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
}

.sci-btn.primary {
  border: none;
  background: #2563eb;
  color: #fff;
}

.sci-btn.primary:disabled,
.sci-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sci-file-input {
  display: none;
}

.sci-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sci-chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}

.sci-chip.accent {
  background: #dbeafe;
  color: #1d4ed8;
}

.sci-chip.warn {
  background: #fef3c7;
  color: #b45309;
}

.sci-chip.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.sci-list-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.sci-list-tools-spacer {
  flex: 1 1 auto;
}

.sci-link {
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}

.sci-empty {
  padding: 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.sci-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sci-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fbfdff;
}

.sci-item-main {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  cursor: pointer;
}

.sci-check {
  margin-top: 2px;
  flex-shrink: 0;
}

.sci-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sci-item-name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sci-item-meta {
  font-size: 11px;
  color: #64748b;
}

.sci-item-warn {
  font-size: 11px;
  color: #b45309;
  line-height: 1.5;
}

.sci-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
  font-weight: 600;
}

.sci-item-color {
  width: 118px;
  flex-shrink: 0;
}

.sci-item-color :deep(.ccp-entry) {
  min-height: 30px;
  border-radius: 8px;
  padding: 0 6px;
}

.sci-item-color :deep(.ccp-entry-label) {
  display: none;
}

.sci-item-color :deep(.ccp-entry-meta) {
  font-size: 11px;
  max-width: 5em;
}

.sci-global-diag {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ===== #821 课表布局预览 ===== */

/* 预览模式切换：列表 / 课表 */
.sci-mode-switch {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.sci-mode-btn {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 999px;
  cursor: pointer;
}

.sci-mode-btn.active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

/* 预览周导航 */
.sci-week-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sci-week-btn {
  min-height: 34px;
  padding: 0 8px;
}

.sci-week-select {
  min-width: 108px;
}

.sci-week-note {
  font-size: 11px;
  color: #94a3b8;
}

/* 课表预览滚动容器：移动端横向滚动，保持星期/节次可读 */
.sci-grid-scroll {
  height: min(56dvh, 520px);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  overflow: auto;
}

/* 为 ScheduleGrid 补齐其依赖的 CSS 变量（Dialog 被 Teleport 到 body，无法继承 .schedule-view） */
.sci-grid-inner {
  --time-axis-width: 40px;
  --date-header-height: 46px;
  --schedule-bottom-gap: 12px;
  --slot-height: clamp(40px, calc((min(56dvh, 520px) - 58px) / 11), 60px);
  min-width: 700px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 点击预览课程后的冲突详情面板 */
.sci-conflict-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.sci-conflict-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sci-conflict-title {
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
}

.sci-conflict-course {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.sci-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.sci-result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sci-result-label {
  font-size: 13px;
  color: #475569;
}

.sci-result-value {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.sci-result-value.danger {
  color: #b91c1c;
}

.sci-fade-enter-active,
.sci-fade-leave-active {
  transition: opacity 0.2s ease;
}

.sci-fade-enter-from,
.sci-fade-leave-to {
  opacity: 0;
}

@media (max-width: 560px) {
  .sci-panel {
    max-height: 92dvh;
  }

  .sci-item {
    flex-direction: column;
  }

  .sci-item-color {
    width: 100%;
  }
}

:global(html.dark) .sci-panel {
  background: #0f172a;
  border-color: #334155;
}

:global(html.dark) .sci-title,
:global(html.dark) .sci-item-name {
  color: #e2e8f0;
}

:global(html.dark) .sci-select,
:global(html.dark) .sci-textarea {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

:global(html.dark) .sci-item {
  background: #1e293b;
  border-color: #334155;
}

:global(html.dark) .sci-btn.ghost {
  background: #1e293b;
  border-color: #475569;
  color: #e2e8f0;
}

/* #821 课表预览深色适配 */
:global(html.dark) .sci-mode-switch {
  background: #1e293b;
  border-color: #334155;
}

:global(html.dark) .sci-mode-btn {
  color: #cbd5e1;
}

:global(html.dark) .sci-mode-btn.active {
  background: #334155;
  color: #93c5fd;
}

:global(html.dark) .sci-grid-scroll {
  background: #0f172a;
  border-color: #334155;
}

:global(html.dark) .sci-conflict-panel {
  background: #3f2d0b;
  border-color: #a16207;
}

:global(html.dark) .sci-conflict-course {
  color: #f1f5f9;
}

:global(html.dark) .sci-week-note {
  color: #64748b;
}
</style>
