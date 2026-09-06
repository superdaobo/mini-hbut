<script setup>
/**
 * 课程详情弹窗：单门课程信息 / 冲突详情 / 复制 / 编辑 / 删除。
 * 自 ScheduleView.vue 拆分，DOM 结构/class 完全保留。
 * #788 i18n：文案经 useI18n 响应式取词。
 */
import { getCourseEndPeriod } from '../utils/layout'
import { useI18n } from '../../../utils/app_i18n'

defineProps({
  showDetail: { type: Boolean, default: false },
  selectedCourse: { type: Object, default: null },
  detailActionError: { type: String, default: '' },
})
const emit = defineEmits([
  'close',
  'open-conflict-course-detail',
  'open-edit-course',
  'delete-custom-course',
  'copy-detail',
])

// 响应式 t：语言切换后详情文案即时生效
const { t } = useI18n()
</script>

<template>
  <Transition name="fade">
    <div v-if="showDetail" class="modal-overlay" @click="emit('close')">
      <div class="modal-content glass" @click.stop>
        <div class="modal-header">
          <h3>{{ selectedCourse?.name }}</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>
        <div v-if="selectedCourse?.is_conflict" class="modal-body">
          <div class="conflict-hint">{{ t('schedule.detail.conflictBannerHint') }}</div>
          <div
            v-for="(item, idx) in selectedCourse?.conflict_courses || []"
            :key="`${item.id || item.name}-${idx}`"
            class="conflict-item"
            :class="{ clickable: item.is_custom }"
            @click="item.is_custom && emit('open-conflict-course-detail', item)"
          >
            <div class="conflict-item-title">
              {{ idx + 1 }}. {{ item.name }}
              <span v-if="item.is_custom" class="conflict-tag">{{ t('schedule.detail.tag.custom') }}</span>
            </div>
            <div class="conflict-item-row">{{ t('schedule.detail.teacher') }}：{{ item.teacher || t('schedule.detail.teacherNotFilled') }}</div>
            <div class="conflict-item-row">
              {{ t('schedule.detail.location') }}：{{ [item.building, item.room || item.room_code].filter(Boolean).join(' ') || t('schedule.detail.locationNotFilled') }}
            </div>
            <div class="conflict-item-row">
              {{ t('schedule.detail.time') }}：{{ t('schedule.detail.conflictPeriod').replace('{n}', String(item.weekday)).replace('{s}', String(item.period)).replace('{e}', String(getCourseEndPeriod(item))) }}
            </div>
          </div>
        </div>
        <div v-else class="modal-body">
          <div v-if="selectedCourse?.is_custom" class="info-row">
            <span class="label">{{ t('schedule.detail.type') }}</span>
            <span class="value">{{ t('schedule.detail.typeCustom') }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.teacher') }}</span>
            <span class="value">{{ selectedCourse?.teacher }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.classroom') }}</span>
            <span class="value">{{ selectedCourse?.room }} ({{ selectedCourse?.building }})</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.time') }}</span>
            <span class="value">{{ t('schedule.detail.conflictPeriod').replace('{n}', String(selectedCourse?.weekday ?? '')).replace('{s}', String(selectedCourse?.period ?? '')).replace('{e}', String(getCourseEndPeriod(selectedCourse))) }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.weeks') }}</span>
            <span class="value">{{ selectedCourse?.weeks_text }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.credit') }}</span>
            <span class="value">{{ selectedCourse?.credit }}</span>
          </div>
          <div class="info-row">
            <span class="label">{{ t('schedule.detail.classGroup') }}</span>
            <span class="value">{{ selectedCourse?.class_name }}</span>
          </div>
          <div v-if="selectedCourse?.is_custom" class="custom-course-actions">
            <button class="custom-delete-btn edit" @click="emit('open-edit-course', selectedCourse, { reopenDetail: true })">{{ t('schedule.detail.editCourse') }}</button>
            <button class="custom-delete-btn week" @click="emit('delete-custom-course', 'current_week')">{{ t('schedule.detail.deleteCurrentWeek') }}</button>
            <button class="custom-delete-btn all" @click="emit('delete-custom-course', 'all')">{{ t('schedule.detail.deleteAllWeeks') }}</button>
          </div>
        </div>
        <div class="detail-copy-actions">
          <button class="detail-copy-btn" @click="emit('copy-detail')">{{ t('schedule.detail.copyDetail') }}</button>
        </div>
        <div v-if="detailActionError" class="detail-action-error">{{ detailActionError }}</div>
      </div>
    </div>
  </Transition>
</template>

<style src="../styles/modal.css" scoped></style>
<style scoped>
.modal-body {
  display: grid;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 0;
}

.info-row .label {
  color: #9ca3af;
  font-size: 13px;
}

.info-row .value {
  color: #374151;
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  max-width: 70%;
}

.custom-course-actions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.custom-delete-btn {
  min-height: 34px;
  border-radius: 10px;
  border: none;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.custom-delete-btn.week {
  background: #fee2e2;
  color: #b91c1c;
}

.custom-delete-btn.edit {
  background: #dbeafe;
  color: #1d4ed8;
}

.custom-delete-btn.all {
  background: #dc2626;
  color: #ffffff;
}

.detail-copy-actions {
  margin-top: 12px;
}

.detail-copy-btn {
  width: 100%;
  min-height: 36px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.detail-action-error {
  margin-top: 10px;
  font-size: 12px;
  color: #b91c1c;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 10px;
  padding: 8px 10px;
}

.conflict-hint {
  font-size: 12px;
  color: #475569;
  margin-bottom: 10px;
}

.conflict-item {
  border: 1px solid #fecaca;
  background: #fff7f7;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
}

.conflict-item.clickable {
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.conflict-item.clickable:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(239, 68, 68, 0.12);
}

.conflict-item:last-child {
  margin-bottom: 0;
}

.conflict-item-title {
  font-size: 13px;
  font-weight: 700;
  color: #7f1d1d;
  display: flex;
  align-items: center;
  gap: 6px;
}

.conflict-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  background: #111827;
  color: #ffffff;
}

.conflict-item-row {
  margin-top: 6px;
  font-size: 12px;
  color: #374151;
}
</style>
