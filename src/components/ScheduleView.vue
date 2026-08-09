<script setup lang="ts">
/**
 * 课表页面入口（编排层）。
 * 原巨型单文件（约 4900 行）已按职责拆分至 src/features/schedule/**：
 *  - composables：数据加载 / 学期周次 / 布局派生 / 课程编辑 / 导入导出 / 云同步 / 弹层状态
 *  - components：顶部导航 / 抽屉 / 课表网格 / 详情 / 添加编辑 / 管理 / 周选择器 / 确认框 / 横幅
 *  - utils：颜色分配 / 布局合并 / 日历事件 / 导入导出 / 学期派生 / 弹窗存储 等纯函数
 * 本文件仅保留：props/emits 契约、composable 组合、事件接线、Widget 深链接与生命周期编排。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  clearScheduleLock,
  consumeScheduleSwitchPending,
  isAutoScheduleLockReason,
  readScheduleLock,
  readScheduleLockDetail,
  warmupScheduleForStudent,
  writeScheduleLock
} from '../utils/schedule_prefetch.js'
import { CLOUD_SYNC_UPDATED_EVENT } from '../utils/cloud_sync.js'
import { pushDebugLog } from '../utils/debug_logger'
import { formatRelativeTime } from '../utils/time.js'

import { useConfirmDialog } from '../features/schedule/composables/useConfirmDialog'
import { useScheduleMenu } from '../features/schedule/composables/useScheduleMenu'
import { useScheduleSemester } from '../features/schedule/composables/useScheduleSemester'
import { useScheduleData } from '../features/schedule/composables/useScheduleData'
import { useScheduleGrid } from '../features/schedule/composables/useScheduleGrid'
import { useScheduleDetail } from '../features/schedule/composables/useScheduleDetail'
import { useScheduleEditor } from '../features/schedule/composables/useScheduleEditor'
import { useScheduleIO } from '../features/schedule/composables/useScheduleIO'
import { useScheduleSync } from '../features/schedule/composables/useScheduleSync'
import { deriveSemesterByDate, readStoredSemester } from '../features/schedule/utils/semester'
import { consumePendingSemesterPopup } from '../features/schedule/utils/popup'

import ScheduleTopbar from '../features/schedule/components/ScheduleTopbar.vue'
import ScheduleDrawer from '../features/schedule/components/ScheduleDrawer.vue'
import ScheduleBanners from '../features/schedule/components/ScheduleBanners.vue'
import ScheduleGrid from '../features/schedule/components/ScheduleGrid.vue'
import ScheduleCourseDetail from '../features/schedule/components/ScheduleCourseDetail.vue'
import ScheduleAddCourseDialog from '../features/schedule/components/ScheduleAddCourseDialog.vue'
import ScheduleManageCoursesDialog from '../features/schedule/components/ScheduleManageCoursesDialog.vue'
import ScheduleWeekPicker from '../features/schedule/components/ScheduleWeekPicker.vue'
import ScheduleConfirmDialog from '../features/schedule/components/ScheduleConfirmDialog.vue'

const props = defineProps({
  studentId: { type: String, default: '' },
  widgetDate: { type: String, default: '' },
  widgetPeriod: { type: Number, default: 0 },
})

const emit = defineEmits(['back', 'logout', 'widget-deeplink-consumed'])

// ============ 组合式状态（按依赖顺序实例化） ============
const confirmDialog = useConfirmDialog()
const menu = useScheduleMenu({ props })
const semesterApi = useScheduleSemester({
  // 惰性求值：运行时各弹层状态均已就绪
  isAnyOverlayOpen: () => anyOverlayOpen.value,
})
const data = useScheduleData(props, emit, { semester: semesterApi })
const grid = useScheduleGrid({ data, semester: semesterApi, menu })
const detail = useScheduleDetail({ data, semester: semesterApi })
const editor = useScheduleEditor({ props, data, semester: semesterApi, detail, menu, confirmDialog })
const io = useScheduleIO({ props, data, semester: semesterApi, editor, confirmDialog })
const sync = useScheduleSync({ props, data, semester: semesterApi, editor, confirmDialog })

// 任一弹层打开时禁用周次滑动/键盘切换（与原始 shouldIgnoreWeekSwipe 一致）
const anyOverlayOpen = computed(() => {
  return (
    menu.showMenu.value ||
    menu.showSemesterBadgePopover.value ||
    menu.showSemesterPopup.value ||
    detail.showDetail.value ||
    editor.showAddCourse.value ||
    editor.showManageCourses.value ||
    editor.showWeekPicker.value ||
    confirmDialog.showConfirmDialog.value
  )
})

// ============ 顶层解构（模板自动解包） ============
// 学期周次
const {
  semester,
  semesterDraft,
  currentWeek,
  selectedWeek,
  totalWeeks,

  vacationNotice,
  weekDates,
  currentMonth,
  semesterWeekOptions,
  weekTransitionName,
  jumpToCurrentWeek,
} = semesterApi
// 菜单/样式
const {
  showMenu,
  scheduleCourseCardStyle,
  courseCardRefreshNonce,
  styleOptions,
  toggleMenu,
  setScheduleCourseCardStyle,
} = menu
// 数据
const {
  loading,
  errorMsg,
  offline,
  offlineHint,
  syncTime,
  initialFetchDone,
  semesterOptions,
  semesterLoading,
  semesterError,
  loadingManageCourses,
  manageCoursesError,
  managedCourseGroups,
  manageExpandedSemesters,
} = data
// 详情
const { showDetail, selectedCourse, detailActionError } = detail
// 编辑
const {
  showAddCourse,
  courseDialogMode,
  courseDialogSemester,
  addCourseForm,
  addCourseError,
  addingCourse,
  courseSpanOptions,
  addWeeksCountText,
  showManageCourses,
  showWeekPicker,
} = editor
// 导入导出
const {
  exporting,
  exportingMode,
  exportUrl,
  exportError,
  exportCopied,
  customCourseExporting,
  customCourseImporting,
  customCourseExportLocation,
} = io
// 云同步
const {
  syncUploading,
  syncDownloading,
  syncStatusText,
  syncUploadCooldownText,
  syncDownloadCooldownText,
} = sync
// 确认对话框
const {
  showConfirmDialog,
  confirmDialogTitle,
  confirmDialogLines,
  confirmDialogConfirmText,
  confirmDialogCancelText,
  confirmDialogDanger,
} = confirmDialog

// ============ 展示派生 ============
const offlineBannerText = computed(() => {
  if (offlineHint.value) return offlineHint.value
  if (syncTime.value) {
    return `当前显示为离线数据，更新于${formatRelativeTime(syncTime.value)}`
  }
  return '当前显示为离线数据'
})

// ============ 入口级交互接线 ============
const handleToggleMenu = () => {
  toggleMenu()
  if (!showMenu.value) {
    exportCopied.value = false
  }
}

const closeMenu = () => {
  showMenu.value = false
  exportCopied.value = false
}

const openAddCourseDialog = () => {
  showMenu.value = false
  void editor.openAddCourseDialog()
}

const handleEditManagedCourse = (course: any) => {
  void editor.openEditCourseDialog(course, { reopenManage: true })
}

const handleSemesterChange = () => {
  void data.onSemesterChange()
}

// ============ 数据 watchers（入口级） ============
watch(
  () => props.studentId,
  async (nextSid, prevSid) => {
    sync.refreshCloudSyncCooldown()
    const next = String(nextSid || '').trim()
    const prev = String(prevSid || '').trim()
    if (!next || next === prev) return
    const targetSemester = String(
      semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()
    ).trim()
    if (targetSemester) {
      const hasRenderSnapshot = data.applyStoredScheduleRenderSnapshot(targetSemester, { markBoot: false })
      const hasInstantCache = hasRenderSnapshot || data.applyCachedScheduleImmediately(targetSemester)
      if (hasInstantCache) {
        initialFetchDone.value = true
        errorMsg.value = ''
      }
    }
    void data.fetchSchedule(targetSemester)
  }
)

// Widget 深链接：接收 date + period，定位到对应周次/日并高亮
let widgetHighlightTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => props.widgetDate,
  (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
    if (!semesterApi.startDateStr.value) return // 课表尚未就绪，忽略深链接
    const targetDate = new Date(`${dateStr}T00:00:00+08:00`)
    const startDate = new Date(`${semesterApi.startDateStr.value}T00:00:00+08:00`)
    if (Number.isNaN(targetDate.getTime()) || Number.isNaN(startDate.getTime())) return

    const diffMs = targetDate.getTime() - startDate.getTime()
    const diffDays = Math.round(diffMs / 86400000)
    const targetWeek = Math.max(1, Math.floor(diffDays / 7) + 1)
    const targetDay = (diffDays % 7) + 1

    const maxWeeks = Math.max(1, Number(totalWeeks.value || 1))
    if (targetWeek >= 1 && targetWeek <= maxWeeks) {
      selectedWeek.value = targetWeek
    }

    // 设置高亮
    const period = Number(props.widgetPeriod) || 0
    grid.setWidgetHighlight(targetDay, period)

    // 延迟滚动到目标位置
    nextTick(() => {
      semesterApi.scrollToWidgetTarget(targetDay, period)
    })

    // 3 秒后清除高亮
    if (widgetHighlightTimer) clearTimeout(widgetHighlightTimer)
    widgetHighlightTimer = setTimeout(() => {
      grid.clearWidgetHighlight()
      widgetHighlightTimer = null
    }, 3000)

    // 通知父组件已消费深链接参数
    emit('widget-deeplink-consumed')
  },
  { immediate: true }
)

// ============ 生命周期 ============
onMounted(async () => {
  window.addEventListener('keydown', semesterApi.handleWeekKeydown)
  window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, sync.handleCloudSyncUpdated)
  window.addEventListener('hbu-session-online', data.handleSessionOnline)
  window.addEventListener('hbu-session-logout', data.handleSessionLogout)
  document.addEventListener('visibilitychange', sync.handleScheduleVisibilityChange)
  sync.refreshCloudSyncCooldown()
  sync.ensureCloudSyncCooldownTimer()
  void data.fetchSemesterOptions()

  // 下次进入自动切换：后台检测到新学期并已确认有课表数据时生效。
  const switchSemester = consumeScheduleSwitchPending(props.studentId)
  if (switchSemester) {
    writeScheduleLock(props.studentId, switchSemester, 'pending-switch')
    semester.value = switchSemester
    semesterDraft.value = switchSemester
  }

  const lockDetail = readScheduleLockDetail(props.studentId) as {
    semester?: string
    reason?: string
  } | null
  const todaySemester = deriveSemesterByDate()
  if (
    lockDetail?.semester &&
    todaySemester &&
    lockDetail.semester !== todaySemester &&
    isAutoScheduleLockReason(lockDetail.reason)
  ) {
    const cleared = clearScheduleLock(props.studentId)
    if (cleared) {
      pushDebugLog(
        'Schedule',
        `检测到自动锁定学期(${lockDetail.semester})与当前日期学期(${todaySemester})冲突，已清理并重探测`,
        'warn'
      )
    }
  }

  // 仅当存在“显式锁定学期”时才走秒开锁定路径；
  // 旧版本可能只留下了 hbu_schedule_meta，不能把它当作锁定依据。
  const lockedSemester = String(readScheduleLock(props.studentId) || '').trim()
  const startupSemester = String(
    semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()
  ).trim()
  const startupRenderSnapshot = data.initialRenderSnapshotApplied ||
    (startupSemester ? data.applyStoredScheduleRenderSnapshot(startupSemester, { markBoot: false }) : false)
  const startupCached = startupRenderSnapshot || (startupSemester ? data.applyCachedScheduleImmediately(startupSemester) : false)
  if (startupCached) {
    initialFetchDone.value = true
    errorMsg.value = ''
    void data.loadCustomCourses(startupSemester)
  }
  if (lockedSemester) {
    semester.value = lockedSemester
    semesterDraft.value = lockedSemester

    const hasInstantCache = data.applyCachedScheduleImmediately(lockedSemester)
    if (hasInstantCache) {
      void data.loadCustomCourses(lockedSemester)
      // 有缓存时先秒开，再后台刷新，避免每次进入“空白等待”。
      void data.fetchSchedule(lockedSemester)
    } else {
      await data.fetchSchedule(lockedSemester)
    }
  } else if (props.studentId) {
    const probeAndRefresh = async () => {
      const warmed = await warmupScheduleForStudent(props.studentId, {
        forceProbe: true,
        reason: 'first-enter'
      }) as {
        success?: boolean
        semester?: string
        payload?: any
      }
      if (warmed?.success && warmed?.semester) {
        semester.value = warmed.semester
        semesterDraft.value = warmed.semester
        if (!data.applySchedulePayload(warmed.payload, warmed.semester)) {
          await data.fetchSchedule(warmed.semester)
        } else {
          await data.loadCustomCourses(warmed.semester)
        }
      } else {
        await data.fetchSchedule()
      }
    }
    // 首次进入且无锁定学期：允许一次性等待，探测最近有课表的学期并锁定。
    if (startupCached) {
      void probeAndRefresh()
    } else {
      await probeAndRefresh()
    }
  } else {
    if (!startupCached) {
      await data.fetchSchedule()
    }
  }

  const pendingSemester = consumePendingSemesterPopup(props.studentId)
  if (pendingSemester) {
    menu.openSemesterPopup(pendingSemester)
    return
  }
  if (!menu.isPopupShown()) {
    menu.openSemesterPopup(semester.value || semesterDraft.value)
  }
  document.addEventListener('click', menu.closeSemesterBadgePopover)
})

onBeforeUnmount(() => {
  data.persistScheduleRenderSnapshot('component-unmount')
  window.removeEventListener('keydown', semesterApi.handleWeekKeydown)
  window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, sync.handleCloudSyncUpdated)
  window.removeEventListener('hbu-session-online', data.handleSessionOnline)
  window.removeEventListener('hbu-session-logout', data.handleSessionLogout)
  document.removeEventListener('visibilitychange', sync.handleScheduleVisibilityChange)
  document.removeEventListener('click', menu.closeSemesterBadgePopover)
  sync.clearCloudSyncCooldownTimer()
  if (widgetHighlightTimer) {
    clearTimeout(widgetHighlightTimer)
    widgetHighlightTimer = null
  }
})
</script>

<template>
  <div
    class="schedule-view"
    @touchstart.passive="semesterApi.handleTouchStart"
    @touchmove.passive="semesterApi.handleTouchMove"
    @touchend.passive="semesterApi.handleTouchEnd"
    @touchcancel.passive="semesterApi.handleTouchEnd"
  >
    <!-- 头部导航 -->
    <ScheduleTopbar
      :semester="semester"
      :selected-week="selectedWeek"
      :total-weeks="totalWeeks"
      @update:selected-week="selectedWeek = $event"
      @toggle-menu="handleToggleMenu"
    />

    <!-- 抽屉：学期/样式/课程管理/同步/导出 -->
    <ScheduleDrawer
      :show-menu="showMenu"
      :semester-options="semesterOptions"
      :semester-draft="semesterDraft"
      :semester-loading="semesterLoading"
      :loading="loading"
      :semester-error="semesterError"
      :schedule-course-card-style="scheduleCourseCardStyle"
      :style-options="styleOptions"
      :adding-course="addingCourse"
      :loading-manage-courses="loadingManageCourses"
      :sync-uploading="syncUploading"
      :sync-downloading="syncDownloading"
      :custom-course-importing="customCourseImporting"
      :custom-course-exporting="customCourseExporting"
      :sync-upload-cooldown-text="syncUploadCooldownText"
      :sync-download-cooldown-text="syncDownloadCooldownText"
      :sync-status-text="syncStatusText"
      :custom-course-export-location="customCourseExportLocation"
      :exporting="exporting"
      :exporting-mode="exportingMode"
      :export-url="exportUrl"
      :export-error="exportError"
      :export-copied="exportCopied"
      @close="closeMenu"
      @update:semester-draft="semesterDraft = $event"
      @semester-change="handleSemesterChange"
      @set-style="setScheduleCourseCardStyle"
      @open-add-course="openAddCourseDialog"
      @open-manage-courses="editor.openManageCoursesDialog"
      @sync-upload="sync.handleCloudSyncUpload"
      @sync-download="sync.handleCloudSyncDownload"
      @export-json="io.exportCustomCoursesJson"
      @import-json="io.triggerImportCustomCourses"
      @import-file="io.handleCustomCourseFileChange"
      @export-calendar="io.exportCalendar"
      @copy-export-url="io.copyExportUrl"
    />

    <!-- 在线刷新中不展示离线条，避免秒开缓存误报 10s「登录恢复」 -->
    <ScheduleBanners
      :offline="offline"
      :initial-fetch-done="initialFetchDone"
      :loading="loading"
      :offline-banner-text="offlineBannerText"
      :vacation-notice="vacationNotice"
      :error-msg="errorMsg"
      :current-week="currentWeek"
      :selected-week="selectedWeek"
      @jump-current="jumpToCurrentWeek"
    />

    <!-- 课表主体 -->
    <ScheduleGrid
      :week-dates="weekDates"
      :current-month="currentMonth"
      :selected-week="selectedWeek"
      :week-transition-name="weekTransitionName"
      :schedule-course-card-style="scheduleCourseCardStyle"
      :course-card-refresh-nonce="courseCardRefreshNonce"
      :get-courses-for-day="grid.getCoursesForDay"
      :get-course-style="grid.getCourseCardStyle"
      :is-widget-highlighted="grid.isWidgetHighlighted"
      @open-detail="detail.openDetail"
    />

    <!-- 详情弹窗 -->
    <ScheduleCourseDetail
      :show-detail="showDetail"
      :selected-course="selectedCourse"
      :detail-action-error="detailActionError"
      @close="showDetail = false"
      @open-conflict-course-detail="detail.openConflictCourseDetail"
      @open-edit-course="editor.openEditCourseDialog"
      @delete-custom-course="editor.deleteCustomCourse"
      @copy-detail="detail.copySelectedCourseDetail"
    />

    <!-- 添加/修改课程弹窗 -->
    <ScheduleAddCourseDialog
      :show-add-course="showAddCourse"
      :course-dialog-mode="courseDialogMode"
      :course-dialog-semester="courseDialogSemester"
      :add-course-form="addCourseForm"
      :add-course-error="addCourseError"
      :adding-course="addingCourse"
      :course-span-options="courseSpanOptions"
      :add-weeks-count-text="addWeeksCountText"
      @close="editor.closeAddCourseDialog"
      @submit="editor.submitAddCourse"
      @open-week-picker="showWeekPicker = true"
    />

    <!-- 管理课程弹窗 -->
    <ScheduleManageCoursesDialog
      :show-manage-courses="showManageCourses"
      :loading-manage-courses="loadingManageCourses"
      :manage-courses-error="manageCoursesError"
      :managed-course-groups="managedCourseGroups"
      :manage-expanded-semesters="manageExpandedSemesters"
      @close="editor.closeManageCoursesDialog"
      @toggle-semester="editor.toggleManageSemester"
      @edit-course="handleEditManagedCourse"
      @delete-course="editor.deleteManagedCourse"
    />

    <!-- 周次选择器 -->
    <ScheduleWeekPicker
      :show-week-picker="showWeekPicker"
      :semester-week-options="semesterWeekOptions"
      :selected-weeks="addCourseForm.weeks"
      @close="showWeekPicker = false"
      @toggle-week="editor.toggleAddCourseWeek"
      @select-all="editor.selectAllAddCourseWeeks"
      @clear-all="editor.clearAddCourseWeeks"
    />

    <!-- 确认对话框 -->
    <ScheduleConfirmDialog
      :show-confirm-dialog="showConfirmDialog"
      :confirm-dialog-title="confirmDialogTitle"
      :confirm-dialog-lines="confirmDialogLines"
      :confirm-dialog-confirm-text="confirmDialogConfirmText"
      :confirm-dialog-cancel-text="confirmDialogCancelText"
      :confirm-dialog-danger="confirmDialogDanger"
      @confirm="confirmDialog.closeConfirmDialog"
    />
  </div>
</template>

<style scoped>
.schedule-view {
  /* 以下 CSS 变量与拆分前 ScheduleView.vue（PR #585 之前）保持一致：
     --slot-height 按视口高度动态计算，使课表随页面高度拉伸；拆分时曾被简化为固定 55px 导致高度压缩 */
  --time-axis-width: 40px;
  --topbar-height: 44px;
  --date-header-height: 50px;
  --schedule-bottom-gap: calc(108px + env(safe-area-inset-bottom));
  --schedule-safe-top: 0px;
  --slot-height: clamp(
    46px,
    calc(
      (
          var(--app-vh, 1vh) * 100
          - var(--topbar-height)
          - var(--date-header-height)
          - var(--schedule-bottom-gap)
        ) / 11
    ),
    70px
  );
  width: 100%;
  height: calc(var(--app-vh, 1vh) * 100);
  min-height: calc(var(--app-vh, 1vh) * 100);
  display: flex;
  flex-direction: column;
  background: #f9f9ff;
  font-family: var(--ui-font-family);
  overflow: hidden;
  box-sizing: border-box;
  padding-top: 0;
  position: relative;
}

/* 语义化占位（原 semester-badge 无对应 DOM，保留选择器兼容外部样式覆盖） */
.semester-badge-wrap {
  position: relative;
}

.semester-badge-btn {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
}

.semester-badge-btn:hover {
  background: #f1f5f9;
}

.semester-badge-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

.semester-badge-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 200px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  padding: 14px;
  z-index: 60;
}

.semester-badge-popover-title {
  font-size: 12px;
  color: #9ca3af;
}

.semester-badge-popover-value {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.semester-badge-popover-desc {
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 768px) {
  .schedule-view {
    --time-axis-width: 32px;
    --topbar-height: 42px;
    --date-header-height: 44px;
  }
}
</style>
