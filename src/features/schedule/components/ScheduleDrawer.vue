<script setup>
/**
 * 课表抽屉：学期选择 / 课程样式 / 自定义课程管理 / 云同步 / 数据导出。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 */
import { computed } from 'vue'

const props = defineProps({
  showMenu: { type: Boolean, default: false },
  semesterOptions: { type: Array, default: () => [] },
  semesterDraft: { type: String, default: '' },
  semesterLoading: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  semesterError: { type: String, default: '' },
  scheduleCourseCardStyle: { type: String, default: 'modern' },
  styleOptions: { type: Array, default: () => [] },
  addingCourse: { type: Boolean, default: false },
  loadingManageCourses: { type: Boolean, default: false },
  syncUploading: { type: Boolean, default: false },
  syncDownloading: { type: Boolean, default: false },
  customCourseImporting: { type: Boolean, default: false },
  customCourseExporting: { type: Boolean, default: false },
  syncUploadCooldownText: { type: String, default: '' },
  syncDownloadCooldownText: { type: String, default: '' },
  syncStatusText: { type: String, default: '' },
  customCourseExportLocation: { type: String, default: '' },
  exporting: { type: Boolean, default: false },
  exportingMode: { type: String, default: '' },
  exportUrl: { type: String, default: '' },
  exportError: { type: String, default: '' },
  exportCopied: { type: Boolean, default: false },
})
const emit = defineEmits([
  'close',
  'update:semesterDraft',
  'semester-change',
  'set-style',
  'open-add-course',
  'open-manage-courses',
  'sync-upload',
  'sync-download',
  'export-json',
  'import-json',
  'import-file',
  'export-calendar',
  'copy-export-url',
])

const semesterDraftModel = computed({
  get: () => props.semesterDraft,
  set: (value) => emit('update:semesterDraft', value),
})
</script>

<template>
  <Transition name="drawer-fade">
    <div v-if="showMenu" class="drawer-overlay" @click="emit('close')"></div>
  </Transition>
  <Transition name="drawer-slide">
    <aside v-if="showMenu" class="drawer-panel" @click.stop>
      <div class="drawer-title">
        <span class="material-symbols-outlined drawer-title-icon">calendar_month</span>
        课表工具
      </div>
      <div class="drawer-section">
        <div class="drawer-subtitle" data-step="1">选择学期</div>
        <div class="drawer-semester-row">
          <IOSSelect
            class="drawer-select"
            v-model="semesterDraftModel"
            :disabled="semesterLoading || loading"
            @change="emit('semester-change')"
          >
            <option disabled value="">请选择学期</option>
            <option v-for="sem in semesterOptions" :key="sem" :value="sem">{{ sem }}</option>
          </IOSSelect>
        </div>
        <div v-if="semesterError" class="drawer-error">{{ semesterError }}</div>
      </div>

      <div class="drawer-section">
        <div class="drawer-subtitle" data-step="2">课程样式</div>
        <div class="drawer-style-switch" role="tablist" aria-label="课程样式切换">
          <button
            v-for="item in styleOptions"
            :key="item.key"
            type="button"
            class="drawer-style-chip"
            :class="{ active: scheduleCourseCardStyle === item.key }"
            role="tab"
            :aria-pressed="scheduleCourseCardStyle === item.key"
            :aria-selected="scheduleCourseCardStyle === item.key"
            @click.stop="emit('set-style', item.key)"
          >
            <strong>{{ item.label }}</strong>
          </button>
        </div>
      </div>

      <div class="drawer-actions">
        <div class="drawer-course-group">
          <div class="drawer-subtitle" data-step="3">自定义课程管理</div>
          <div class="drawer-course-actions">
            <button class="drawer-action add-course" :disabled="addingCourse" @click="emit('open-add-course')">
              <span class="material-symbols-outlined">add_circle</span>
              添加课程
            </button>
            <button class="drawer-action manage-course" :disabled="loadingManageCourses" @click="emit('open-manage-courses')">
              <span class="material-symbols-outlined">folder_copy</span>
              {{ loadingManageCourses ? '加载中...' : '管理课程' }}
            </button>
          </div>
        </div>
        <div class="drawer-sync-group">
          <div class="drawer-subtitle" data-step="4">自定义课程同步</div>
          <div class="drawer-sync-actions">
            <button
              class="drawer-action sync-upload"
              :disabled="syncUploading || syncDownloading || customCourseImporting || customCourseExporting"
              @click="emit('sync-upload')"
            >
              <span class="material-symbols-outlined">cloud_upload</span>
              {{ syncUploading ? '云上传中...' : '云上传' }}
            </button>
            <button
              class="drawer-action sync-download"
              :disabled="syncUploading || syncDownloading || customCourseImporting || customCourseExporting"
              @click="emit('sync-download')"
            >
              <span class="material-symbols-outlined">cloud_download</span>
              {{ syncDownloading ? '云下载中...' : '云下载' }}
            </button>
          </div>
          <div class="drawer-sync-actions drawer-sync-actions--json">
            <button
              class="drawer-action sync-json-export"
              :disabled="syncUploading || syncDownloading || customCourseImporting || customCourseExporting"
              @click="emit('export-json')"
            >
              <span class="material-symbols-outlined">data_object</span>
              {{ customCourseExporting ? '导出中...' : '导出 JSON' }}
            </button>
            <button
              class="drawer-action sync-json-import"
              :disabled="syncUploading || syncDownloading || customCourseImporting || customCourseExporting"
              @click="emit('import-json')"
            >
              <span class="material-symbols-outlined">file_upload</span>
              {{ customCourseImporting ? '导入中...' : '导入 JSON' }}
            </button>
          </div>
          <input
            ref="customCourseFileInput"
            type="file"
            accept=".json,application/json"
            style="display: none"
            @change="emit('import-file', $event)"
          >
          <div class="drawer-sync-status">
            <span class="drawer-sync-cooldown">上传：{{ syncUploadCooldownText }}</span>
            <span class="drawer-sync-cooldown">下载：{{ syncDownloadCooldownText }}</span>
            <span v-if="syncStatusText" class="drawer-sync-running">{{ syncStatusText }}</span>
            <span v-if="customCourseExportLocation" class="drawer-sync-export-path">导出位置：{{ customCourseExportLocation }}</span>
          </div>
        </div>
        <div class="drawer-subtitle" data-step="5">导出数据</div>
        <button
          class="drawer-action"
          :disabled="exporting"
          @click="emit('export-calendar', 'week')"
        >
          <span class="material-symbols-outlined">calendar_today</span>
          {{ exporting && exportingMode === 'week' ? '正在生成...' : '导出本周' }}
        </button>
        <button class="drawer-action ghost" :disabled="exporting" @click="emit('export-calendar', 'semester')">
          <span class="material-symbols-outlined">school</span>
          {{ exporting && exportingMode === 'semester' ? '正在生成...' : '导出本学期' }}
        </button>
      </div>
      <div class="drawer-tip">生成后复制链接，用浏览器打开即可导入手机日历</div>

      <div v-if="exportUrl" class="export-result">
        <div class="export-label">本地导入链接</div>
        <div class="export-row">
          <input class="export-input" type="text" :value="exportUrl" readonly />
          <button class="export-copy" @click="emit('copy-export-url')">复制</button>
        </div>
        <div v-if="exportCopied" class="export-copied">已复制链接</div>
      </div>

      <div v-if="exportError" class="export-error">{{ exportError }}</div>
    </aside>
  </Transition>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(2px);
  z-index: 40;
}

.drawer-panel {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 18px);
  left: 0;
  width: min(85vw, 360px);
  height: calc(100dvh - env(safe-area-inset-top, 0px) - 18px);
  background: #ffffff;
  border-right: none;
  border-top-right-radius: 24px;
  border-bottom-right-radius: 24px;
  padding: 24px 20px calc(28px + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
}

.drawer-panel::-webkit-scrollbar {
  display: none;
}

/* 小屏：抽屉改为贴底布局，适配单手操作与底部安全区 */
@media (max-width: 768px) {
  .drawer-panel {
    top: calc(env(safe-area-inset-top, 0px) + 10px);
    bottom: 0;
    height: auto;
    max-height: none;
    padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px) + 12px);
  }
}

.drawer-title {
  font-size: 20px;
  color: #1f2937;
  padding: 0 0 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-title-icon {
  font-size: 22px;
  color: var(--ui-primary, #2563eb);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
  border-radius: 12px;
}

.drawer-section {
  display: grid;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px dashed #e5e7eb;
}

.drawer-section:last-child {
  border-bottom: none;
}

.drawer-subtitle {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-subtitle::before {
  content: attr(data-step);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--ui-primary, #2563eb);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.drawer-semester-row {
  display: grid;
  gap: 8px;
}

.drawer-select {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--ui-primary, #2563eb) 4%, #ffffff 96%);
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 4%, #ffffff 96%);
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  padding: 0 14px;
}

.drawer-select:focus {
  outline: 2px solid color-mix(in srgb, var(--ui-primary, #2563eb) 30%, transparent 70%);
  outline-offset: 1px;
}

.drawer-error {
  font-size: 12px;
  color: #dc2626;
}

.drawer-style-switch {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
  gap: 0;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  background: #f9fafb;
}

.drawer-style-chip {
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 12px;
  min-height: 36px;
  padding: 0 8px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.drawer-style-chip strong {
  font-size: 13px;
  font-weight: 600;
}

.drawer-style-chip.active {
  color: #ffffff;
  background: var(--ui-primary, #2563eb);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ui-primary, #2563eb) 30%, transparent 70%);
  font-weight: 600;
}

.drawer-action {
  padding: 14px 16px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease;
}

.drawer-action:active {
  transform: scale(0.98);
}

.drawer-actions {
  display: grid;
  gap: 10px;
}

.drawer-course-group {
  display: grid;
  gap: 10px;
}

.drawer-course-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.drawer-course-actions button,
.drawer-course-actions .drawer-action {
  padding: 20px 12px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.drawer-course-actions button:first-child,
.drawer-course-actions .drawer-action:first-child {
  background: linear-gradient(135deg, #f97316, #ec4899);
  box-shadow: 0 6px 16px rgba(249, 115, 22, 0.2);
}

.drawer-course-actions button:last-child,
.drawer-course-actions .drawer-action:last-child {
  background: linear-gradient(135deg, #6366f1, #3b82f6);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.2);
}

.drawer-sync-group {
  display: grid;
  gap: 10px;
}

.drawer-sync-actions {
  display: grid;
  gap: 10px;
}

.drawer-sync-actions button,
.drawer-sync-actions .drawer-action {
  padding: 14px 16px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease;
}

.drawer-sync-actions button:active,
.drawer-sync-actions .drawer-action:active {
  transform: scale(0.98);
}

.drawer-sync-actions--json {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.drawer-action.ghost {
  background: #111827;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.2);
}

.drawer-action.add-course {
  background: linear-gradient(135deg, #f97316, #ec4899);
  box-shadow: 0 10px 18px rgba(236, 72, 153, 0.26);
}

.drawer-action.manage-course {
  background: linear-gradient(135deg, #8b5cf6, #2563eb);
  box-shadow: 0 10px 18px rgba(79, 70, 229, 0.22);
}

.drawer-action.sync-upload {
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.24);
}

.drawer-action.sync-download {
  background: linear-gradient(135deg, #10b981, #0f766e);
  box-shadow: 0 10px 18px rgba(15, 118, 110, 0.24);
}

.drawer-action.sync-json-export {
  background: linear-gradient(135deg, #6366f1, #2563eb);
  box-shadow: 0 10px 18px rgba(79, 70, 229, 0.24);
}

.drawer-action.sync-json-import {
  background: linear-gradient(135deg, #f97316, #ea580c);
  box-shadow: 0 10px 18px rgba(234, 88, 12, 0.24);
}

.drawer-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.drawer-sync-status {
  display: grid;
  gap: 4px;
}

.drawer-sync-cooldown,
.drawer-sync-running {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}

.drawer-sync-running {
  color: #0f766e;
  font-weight: 600;
}

.drawer-sync-export-path {
  font-size: 12px;
  color: #2563eb;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-all;
}

.drawer-tip {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.export-result {
  padding: 10px;
  background: #f9fafb;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

.export-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.export-row {
  display: flex;
  gap: 8px;
}

.export-input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  font-size: 12px;
  color: #111827;
  background: white;
}

.export-copy {
  padding: 8px 10px;
  border-radius: 10px;
  border: none;
  background: #111827;
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.export-copied {
  margin-top: 6px;
  font-size: 12px;
  color: #059669;
  font-weight: 600;
}

.export-error {
  font-size: 12px;
  color: #dc2626;
  background: #fff1f2;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #fecdd3;
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.25s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(-100%);
}
</style>
