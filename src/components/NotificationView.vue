<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { enableBackgroundPowerLock, disableBackgroundPowerLock } from '../utils/power_guard'
import { invokeNative as invoke, isTauriRuntime } from '../platform/native'
import { getRuntime, platformBridge } from '../platform'
import { isAndroidLike, isIOSLike } from '../platform/runtime'
import { fetchDormitoryDataset } from '../utils/static_resource_cache.js'
import { buildDefaultWorkspaceLayout } from '../config/ui_settings'
import { cloneWorkspaceLayout, flushUiSettings, useUiSettings } from '../utils/ui_settings'
import { captureLayoutSlotAnchors, moveLayoutItemToIndex, resolveLayoutSlotTarget } from '../utils/layout_drag.js'
import {
  advanceLayoutCollisionFx,
  createLayoutCollisionBurst,
  resolveCollisionPalette,
  resolveRelativeCollisionPoint
} from '../utils/layout_collision_fx.js'
import LayoutCollisionFxLayer from './LayoutCollisionFxLayer.vue'
import SortableSurface from './SortableSurface.vue'
import {
  NOTIFY_SNAPSHOT_EVENT,
  getLastNotifySnapshot,
  getNotificationMonitorSettings,
  runNotificationCheck
} from '../utils/notify_center.js'
import { reconcileLocalReminders } from '../utils/local_reminder_scheduler'
import { formatRelativeTime } from '../utils/time.js'

const props = defineProps({
  studentId: String
})

const emit = defineEmits(['back', 'openWorkspaceLayout'])
const uiSettings = useUiSettings()
const NOTIFICATION_LAYOUT_LONG_PRESS_MS = 380
const NOTIFICATION_LAYOUT_LONG_PRESS_DISTANCE = 14
const NOTIFICATION_LAYOUT_SCROLL_OFFSET_PX = 18

const enableBackground = ref(false)
const enableExamReminders = ref(true)
const enableGradeNotices = ref(true)
const enablePowerNotices = ref(true)
const enableClassReminders = ref(true)
const enableSchoolInboxNotices = ref(true)
// #615：per-feature 后台检测开关（成绩/考试变化/学校消息，独立 enable/disable）
const bgFeatureGrades = ref(true)
const bgFeatureExams = ref(true)
const bgFeatureSchool = ref(true)
const bgNativeState = ref(null)
const classLeadMinutes = ref(30)
const checkInterval = ref(30)
const showBatteryPrompt = ref(false)
const backgroundLockEnabled = ref(false)
const backgroundLockSource = ref('')
const aggressiveKeepAliveSupported = ref(false)
const keepAliveReason = ref('')

const permissionState = ref('unknown')
const statusMessage = ref('')
const lastError = ref('')
const sending = ref(false)
const checking = ref(false)
const snapshot = ref(null)
const dormData = ref([])
const selectedPath = ref([])
const currentRuntime = ref(getRuntime())
const notificationLayoutRef = ref(null)
const isNotificationLayoutEditing = ref(false)
const draftNotificationCardsOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).notifications.cardsOrder])
const draggingNotificationKey = ref('')
const hoverNotificationKey = ref('')
const notificationCollisionFx = ref([])

const runtimeDisplayText = computed(() => {
  // UA 判断收敛到 src/platform/runtime.ts（单一来源）
  const isAndroidUA = isAndroidLike()
  const isIosUA = isIOSLike()
  const platformText = isAndroidUA ? 'Android' : (isIosUA ? 'iOS' : '未知平台')
  if (currentRuntime.value === 'capacitor') return `${platformText} / Capacitor`
  if (currentRuntime.value === 'tauri') {
    if (isAndroidUA || isIosUA) return `${platformText} / Tauri`
    return '桌面端 / Tauri'
  }
  return '浏览器 / Web'
})

// 平台判断统一收敛到 src/platform/runtime.ts（单一来源）
const isAndroid = isAndroidLike

const isAclDeniedError = (err) => {
  const text = String(err || '')
  return text.includes('not allowed by ACL') || text.includes('plugin:notification')
}

const normalizeDormPathValue = (value) => {
  if (value && typeof value === 'object') {
    return String(value.value ?? value.id ?? value.label ?? value.name ?? '').trim()
  }
  return String(value ?? '').trim()
}

const normalizeDormSelection = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeDormPathValue(item))
    .filter((item) => item !== '')
}

const readLocalDormSelection = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('last_dorm_selection') || '[]')
    if (!Array.isArray(parsed) || parsed.length !== 4) return []
    return normalizeDormSelection(parsed)
  } catch {
    return []
  }
}

const saveSettings = () => {
  localStorage.setItem('hbu_notify_bg', enableBackground.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_exam', enableExamReminders.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_grade', enableGradeNotices.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_power', enablePowerNotices.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_class', enableClassReminders.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_school_inbox', enableSchoolInboxNotices.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_class_lead_min', String(classLeadMinutes.value))
  localStorage.setItem('hbu_notify_interval', String(checkInterval.value))
  // #615：per-feature 后台检测开关（成绩/考试变化/学校消息独立 enable/disable）
  localStorage.setItem('hbu_bg_feature_grades', bgFeatureGrades.value ? 'true' : 'false')
  localStorage.setItem('hbu_bg_feature_exams', bgFeatureExams.value ? 'true' : 'false')
  localStorage.setItem('hbu_bg_feature_school', bgFeatureSchool.value ? 'true' : 'false')
  // #615：同步 #609 BackgroundCheckConfig 契约到后台插件（native business 列表
  // 由适配器映射：grades/exams/school_inbox），并刷新真实状态展示。
  void platformBridge
    .setBackgroundCheckConfig({
      enabled: enableBackground.value,
      checkGradeChanges: bgFeatureGrades.value,
      checkExamChanges: bgFeatureExams.value,
      checkSchoolInbox: bgFeatureSchool.value,
      intervalMinutes: checkInterval.value,
      schemaVersion: 1,
      updatedAt: new Date().toISOString()
    })
    .then((state) => {
      bgNativeState.value = state
    })
    .catch(() => {
      // 插件未接入时适配器返回真实状态而非伪造 ready
    })
  // #610：通知设置变化（开关/提前分钟数）后触发系统预调度 reconcile，
  // 旧 pending 按新设置准确取消/补建
  if (props.studentId) {
    void reconcileLocalReminders({
      studentId: props.studentId,
      reason: 'notification-settings'
    }).catch(() => {})
  }
}

const updateSettingsFromStorage = () => {
  const settings = getNotificationMonitorSettings()
  enableBackground.value = !!settings.enableBackground
  enableExamReminders.value = !!settings.enableExamReminder
  enableGradeNotices.value = !!settings.enableGradeNotice
  enablePowerNotices.value = !!settings.enablePowerNotice
  enableClassReminders.value = !!settings.enableClassReminder
  enableSchoolInboxNotices.value = settings.enableSchoolInbox !== false
  classLeadMinutes.value = [5, 10, 15, 20, 30, 45, 60].includes(Number(settings.classLeadMinutes))
    ? Number(settings.classLeadMinutes)
    : 30
  checkInterval.value = [15, 30, 60].includes(settings.intervalMinutes)
    ? settings.intervalMinutes
    : 30
  // #615：per-feature 开关（默认开启；与前台 notify_center_checks 同一 key）
  const readFeature = (key, fallback = true) => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return fallback
      return raw === 'true'
    } catch {
      return fallback
    }
  }
  bgFeatureGrades.value = readFeature('hbu_bg_feature_grades')
  bgFeatureExams.value = readFeature('hbu_bg_feature_exams')
  bgFeatureSchool.value = readFeature('hbu_bg_feature_school')
}

const findByValue = (list, value) =>
  (Array.isArray(list) ? list : []).find((item) => String(item?.value) === String(value))

const selectedRoomLabel = computed(() => {
  const path = selectedPath.value
  if (!Array.isArray(path) || path.length !== 4) return '未选择房间（请先在电费模块选择）'
  const [areaId, buildingId, layerId, roomId] = path
  const area = findByValue(dormData.value, areaId)
  const building = findByValue(area?.children, buildingId)
  const layer = findByValue(building?.children, layerId)
  const room = findByValue(layer?.children, roomId)
  const names = [area?.label, building?.label, layer?.label, room?.label].filter(Boolean)
  return names.length ? names.join(' / ') : path.join(' - ')
})

const permissionLabel = computed(() => {
  if (permissionState.value === 'granted') return '已授权'
  if (permissionState.value === 'denied') return '已拒绝'
  if (permissionState.value === 'default') return '未授权'
  if (permissionState.value === 'unsupported') return '当前环境不支持'
  return '未知'
})

const lastCheckText = computed(() => {
  const checkedAt = snapshot.value?.checkedAt
  return checkedAt ? formatRelativeTime(checkedAt) : '未检测'
})

const gradeSummary = computed(() => snapshot.value?.grades || {})
const gradeItems = computed(() =>
  Array.isArray(gradeSummary.value?.latestItems) ? gradeSummary.value.latestItems : []
)
const examSummary = computed(() => snapshot.value?.exams || {})
const examItems = computed(() =>
  Array.isArray(examSummary.value?.upcoming) ? examSummary.value.upcoming : []
)

// 格式化考试时间：去掉重复的日期部分，只保留 HH:mm~HH:mm
const formatNotifyExamTime = (timeStr) => {
  if (!timeStr) return ''
  const text = String(timeStr).trim()
  const match = text.match(/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/)
  if (match) return `${match[1]}~${match[2]}`
  return text
}

const classSummary = computed(() => snapshot.value?.classReminder || {})
const schoolInboxSummary = computed(() => snapshot.value?.schoolInbox || {})
const powerSummary = computed(() => snapshot.value?.electricity || {})

const powerQuantityText = computed(() => {
  const quantity = Number(powerSummary.value?.quantity)
  if (!Number.isFinite(quantity)) return '--'
  return `${quantity.toFixed(2)} 度`
})

const acPowerQuantityText = computed(() => {
  const q = Number(powerSummary.value?.acQuantity)
  if (!Number.isFinite(q)) return '--'
  return `${q.toFixed(2)} 度`
})

const powerStatusText = computed(() => {
  if (
    powerSummary.value?.error === '未设置宿舍房间，请先在电费模块选择房间。' &&
    selectedPath.value.length === 4
  ) {
    return '已配置宿舍房间，等待重新检测'
  }
  if (powerSummary.value?.error) return powerSummary.value.error
  return powerSummary.value?.status || '暂无状态'
})

const classReminderText = computed(() => {
  if (!classSummary.value?.enabled) return '已关闭'
  const total = Number(classSummary.value?.totalToday || 0)
  const trigger = Number(classSummary.value?.triggered || 0)
  return `今日课程 ${total} 门，本次触发 ${trigger} 条`
})

const nextClassText = computed(() => {
  const next = classSummary.value?.nextCourse
  if (!next?.name) return '暂无即将开始课程'
  const mins = Number(next?.minsUntilStart || 0)
  const when = mins > 0 ? `${mins} 分钟后` : '即将'
  return `${when}：${next.name}（${next.startClock || '--:--'} ${next.room || '教室待定'}）`
})

// #615：per-feature 后台检测状态（真实来源：#609 BackgroundCheckState + 最近快照）
const bgFeatureStatusText = computed(() => {
  const state = bgNativeState.value
  if (!state) return '状态未知'
  if (!state?.supported) return state?.reason || '当前环境不支持后台检测'
  if (state?.scheduler?.status === 'unavailable') return '系统调度暂未接入（后台检测不可用）'
  const lastResult = String(state?.lastResult || 'unknown')
  const errorText = state?.lastError ? `（${state.lastError}）` : ''
  return `调度 ${state?.scheduler?.kind || 'unknown'} · 最近结果 ${lastResult}${errorText}`
})

// 学校消息：provider 后台不受支持时显示真实 unsupported/foreground-only 状态，
// 而不是静默假成功（#615 验收：设置页显示真实状态）
const schoolFeatureStatusText = computed(() => {
  const school = schoolInboxSummary.value
  const enabled = bgFeatureSchool.value
  if (!enabled) return '已关闭'
  if (school?.error) return `前台检测：${school.error}`
  if (school?.total != null) {
    const sourceText = school?.source === 'chaoxing' ? '学习通' : '教务'
    return `前台检测可用（${sourceText}，共 ${school.total} 条）`
  }
  const state = bgNativeState.value
  if (state && !state?.supported) return '当前环境不支持后台检测（前台可检测）'
  return '等待检测'
})

const examsFeatureStatusText = computed(() => {
  const exams = examSummary.value
  if (!bgFeatureExams.value) return '已关闭'
  if (exams?.total != null) return `共 ${exams.total} 门考试（明日 ${exams.tomorrowCount || 0} 门）`
  return '等待检测'
})

// #616：keep-screen-on / 前台保活仅作为桌面端能力展示（移动端不再把它
// 描述为后台智能检查成功；移动端调度状态见 bgFeatureStatusText）。
const keepAliveStatusText = computed(() => {
  if (!aggressiveKeepAliveSupported.value) return keepAliveReason.value || '未启用'
  return backgroundLockEnabled.value ? '已运行' : '未运行'
})

const backgroundLockStatusText = computed(() => {
  if (backgroundLockEnabled.value) {
    return `已启用（${backgroundLockSource.value || '系统'}）`
  }
  if (aggressiveKeepAliveSupported.value) {
    return '未启用（可启用）'
  }
  if (keepAliveReason.value) {
    return `未启用（${keepAliveReason.value}）`
  }
  if (currentRuntime.value === 'tauri') {
    return '未启用（桌面端可用）'
  }
  return '未启用'
})

const notificationCardsOrder = computed(() =>
  isNotificationLayoutEditing.value
    ? draftNotificationCardsOrder.value
    : uiSettings.workspaceLayout.notifications.cardsOrder
)

const orderedInfoCards = computed(() => {
  const cardMap = {
    class_reminder: { key: 'class_reminder' },
    electricity: { key: 'electricity' },
    grades: { key: 'grades' },
    exams: { key: 'exams' },
    school_inbox: { key: 'school_inbox' }
  }
  return notificationCardsOrder.value
    .map((key) => cardMap[key])
    .filter(Boolean)
})

let notificationLayoutLongPressTimer = null
let notificationLayoutLongPressStart = { x: 0, y: 0 }
let notificationDragAnchors = []
let notificationDragTargetIndex = -1
let notificationCollisionFxRaf = 0
let notificationCollisionFxLastTs = 0

const syncNotificationLayoutDraft = () => {
  const snapshot = cloneWorkspaceLayout(uiSettings.workspaceLayout)
  draftNotificationCardsOrder.value = [...snapshot.notifications.cardsOrder]
}

const getNotificationCollisionPalette = (activeKey, targetKey = '') => {
  const paletteMap = {
    class_reminder: ['#5b8cff', '#8fd6ff', '#c4b5fd'],
    electricity: ['#22c55e', '#86efac', '#bef264'],
    grades: ['#f59e0b', '#fcd34d', '#fdba74'],
    exams: ['#ef4444', '#fda4af', '#fbbf24'],
    school_inbox: ['#6366f1', '#a5b4fc', '#c4b5fd']
  }
  return resolveCollisionPalette(paletteMap[activeKey], paletteMap[targetKey], '#8fd6ff')
}

const stopNotificationCollisionFxLoop = () => {
  if (notificationCollisionFxRaf) {
    cancelAnimationFrame(notificationCollisionFxRaf)
    notificationCollisionFxRaf = 0
  }
  notificationCollisionFxLastTs = 0
}

const tickNotificationCollisionFx = (timestamp) => {
  const previousTs = notificationCollisionFxLastTs || timestamp
  notificationCollisionFxLastTs = timestamp
  notificationCollisionFx.value = advanceLayoutCollisionFx(
    notificationCollisionFx.value,
    timestamp - previousTs
  )
  if (notificationCollisionFx.value.length === 0) {
    stopNotificationCollisionFxLoop()
    return
  }
  notificationCollisionFxRaf = requestAnimationFrame(tickNotificationCollisionFx)
}

const ensureNotificationCollisionFxLoop = () => {
  if (notificationCollisionFxRaf) return
  notificationCollisionFxLastTs = performance.now()
  notificationCollisionFxRaf = requestAnimationFrame(tickNotificationCollisionFx)
}

const spawnNotificationCollisionFx = (activeKey, target) => {
  const root = notificationLayoutRef.value
  const rootRect = root?.getBoundingClientRect?.()
  if (!rootRect || !target?.rect) return
  const sourceRect = notificationDragAnchors.find((item) => item.id === activeKey)?.rect || null
  const origin = resolveRelativeCollisionPoint({
    rootRect,
    sourceRect,
    targetRect: target.rect
  })
  const burst = createLayoutCollisionBurst({
    x: origin.x,
    y: origin.y,
    colors: getNotificationCollisionPalette(activeKey, target.id)
  })
  notificationCollisionFx.value = [...notificationCollisionFx.value.slice(-48), ...burst]
  ensureNotificationCollisionFxLoop()
}

const reorderDraftNotificationLayout = (activeKey, targetIndex) => {
  if (!activeKey || !Number.isFinite(Number(targetIndex))) return
  draftNotificationCardsOrder.value = moveLayoutItemToIndex(
    draftNotificationCardsOrder.value,
    activeKey,
    targetIndex
  )
}

const stopNotificationLayoutDrag = () => {
  draggingNotificationKey.value = ''
  hoverNotificationKey.value = ''
  notificationDragAnchors = []
  notificationDragTargetIndex = -1
}

const scrollNotificationLayoutIntoView = () => {
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = notificationLayoutRef.value
        if (!root) return
        const shell = root.closest?.('.app-shell')
        if (shell && typeof shell.scrollTo === 'function') {
          const shellRect = shell.getBoundingClientRect()
          const rootRect = root.getBoundingClientRect()
          const nextTop = Math.max(
            0,
            shell.scrollTop + rootRect.top - shellRect.top - NOTIFICATION_LAYOUT_SCROLL_OFFSET_PX
          )
          shell.scrollTo({
            top: nextTop,
            behavior: 'smooth'
          })
          return
        }
        const nextTop = Math.max(
          0,
          window.scrollY + root.getBoundingClientRect().top - NOTIFICATION_LAYOUT_SCROLL_OFFSET_PX
        )
        window.scrollTo({
          top: nextTop,
          behavior: 'smooth'
        })
      })
    })
  })
}

const enterNotificationLayoutEdit = () => {
  if (!isNotificationLayoutEditing.value) {
    syncNotificationLayoutDraft()
    isNotificationLayoutEditing.value = true
  }
  scrollNotificationLayoutIntoView()
}

const cancelNotificationLayoutEdit = () => {
  stopNotificationLayoutDrag()
  syncNotificationLayoutDraft()
  isNotificationLayoutEditing.value = false
}

const resetNotificationLayoutEdit = () => {
  draftNotificationCardsOrder.value = [...buildDefaultWorkspaceLayout().notifications.cardsOrder]
}

const saveNotificationLayoutEdit = () => {
  const nextLayout = cloneWorkspaceLayout(uiSettings.workspaceLayout)
  nextLayout.notifications.cardsOrder = [...draftNotificationCardsOrder.value]
  uiSettings.workspaceLayout = nextLayout
  flushUiSettings()
  stopNotificationLayoutDrag()
  isNotificationLayoutEditing.value = false
}

const handleNotificationDragStart = ({ id }) => {
  const activeId = String(id || '')
  draggingNotificationKey.value = activeId
  hoverNotificationKey.value = activeId
  notificationDragAnchors = captureLayoutSlotAnchors(notificationLayoutRef.value, 'notifications')
  notificationDragTargetIndex = notificationDragAnchors.find((item) => item.id === activeId)?.index ?? -1
}

const handleNotificationDragMove = ({ id, point }) => {
  if (!isNotificationLayoutEditing.value) return
  const activeId = String(id || '').trim()
  if (!activeId || !point) return
  const target = resolveLayoutSlotTarget(notificationDragAnchors, point)
  if (!target || notificationDragTargetIndex === target.index) return
  spawnNotificationCollisionFx(activeId, target)
  notificationDragTargetIndex = target.index
  hoverNotificationKey.value = target.id
  reorderDraftNotificationLayout(activeId, target.index)
}

const clearNotificationLayoutLongPress = () => {
  if (notificationLayoutLongPressTimer) {
    window.clearTimeout(notificationLayoutLongPressTimer)
    notificationLayoutLongPressTimer = null
  }
}

const isTouchPointerEvent = (event) => String(event?.pointerType || '').toLowerCase() === 'touch'

const handleInfoGridPressStart = (event) => {
  if (isNotificationLayoutEditing.value) return
  if (!isTouchPointerEvent(event)) return
  clearNotificationLayoutLongPress()
  notificationLayoutLongPressStart = {
    x: Number(event.clientX || 0),
    y: Number(event.clientY || 0)
  }
  notificationLayoutLongPressTimer = window.setTimeout(() => {
    enterNotificationLayoutEdit()
    clearNotificationLayoutLongPress()
  }, NOTIFICATION_LAYOUT_LONG_PRESS_MS)
}

const handleInfoGridPressMove = (event) => {
  if (!notificationLayoutLongPressTimer || !isTouchPointerEvent(event)) return
  const deltaX = Math.abs(Number(event.clientX || 0) - notificationLayoutLongPressStart.x)
  const deltaY = Math.abs(Number(event.clientY || 0) - notificationLayoutLongPressStart.y)
  if (deltaX > NOTIFICATION_LAYOUT_LONG_PRESS_DISTANCE || deltaY > NOTIFICATION_LAYOUT_LONG_PRESS_DISTANCE) {
    clearNotificationLayoutLongPress()
  }
}

const handleInfoGridPressEnd = () => {
  clearNotificationLayoutLongPress()
}

const getNativePermissionState = async (requestNow = false) => {
  try {
    if (requestNow) {
      const state = await invoke('request_notification_permission_native')
      return String(state || 'default')
    }
    const state = await invoke('get_notification_permission_native')
    return String(state || 'default')
  } catch (error) {
    throw new Error(String(error))
  }
}

const updatePermissionState = async (requestNow = false) => {
  try {
    const state = requestNow
      ? await platformBridge.requestNotificationPermission()
      : await platformBridge.getNotificationPermission()
    permissionState.value = state
    if (requestNow) {
      statusMessage.value =
        state === 'granted'
          ? '通知权限已授权。'
          : '通知权限未授权，请在系统设置中允许通知。'
    }
    return state === 'granted'
  } catch (error) {
    if (currentRuntime.value === 'web') {
      permissionState.value = 'unsupported'
      statusMessage.value = '当前环境不支持系统通知。'
      return false
    }

    if (isAclDeniedError(error) && isTauriRuntime()) {
      try {
        const nativeState = await getNativePermissionState(requestNow)
        permissionState.value = nativeState
        if (requestNow) {
          statusMessage.value =
            nativeState === 'granted'
              ? '通知权限已授权。'
              : '通知权限未授权，请在系统设置中允许通知。'
        }
        return nativeState === 'granted'
      } catch (nativeErr) {
        permissionState.value = 'denied'
        lastError.value = String(nativeErr)
        statusMessage.value = `查询通知权限失败：${lastError.value}`
        return false
      }
    }

    permissionState.value = 'denied'
    lastError.value = String(error)
    statusMessage.value = `查询通知权限失败：${lastError.value}`
    return false
  }
}

const ensureAndroidChannel = async () => {
  if (!isAndroid()) return
  try {
    await platformBridge.ensureNotificationChannel('hbut-default')
  } catch (error) {
    if (!isAclDeniedError(error)) {
      lastError.value = String(error || '')
    }
  }
}

const handleRequestPermission = async () => {
  statusMessage.value = ''
  lastError.value = ''
  const granted = await updatePermissionState(true)
  if (!granted && currentRuntime.value === 'capacitor' && isAndroid()) {
    const opened = await platformBridge.openNotificationSettings().catch(() => false)
    statusMessage.value = opened
      ? '已打开系统通知设置，请允许 Mini-HBUT 发送通知。'
      : '通知权限未授权，请在系统设置中允许 Mini-HBUT 发送通知。'
  }
}

const updateSnapshot = (nextSnapshot) => {
  if (!nextSnapshot) return
  if (String(nextSnapshot?.studentId || '') !== String(props.studentId || '')) return
  snapshot.value = nextSnapshot
  if (Array.isArray(nextSnapshot?.electricity?.selectedPath)) {
    selectedPath.value = nextSnapshot.electricity.selectedPath.map((item) => String(item))
  } else {
    selectedPath.value = readLocalDormSelection()
  }
}

const handleSnapshotEvent = (event) => {
  updateSnapshot(event?.detail)
}

const runManualCheck = async () => {
  if (!props.studentId) {
    statusMessage.value = '未登录状态下无法执行检查。'
    return
  }

  checking.value = true
  statusMessage.value = ''
  lastError.value = ''
  try {
    const result = await runNotificationCheck({
      studentId: props.studentId,
      reason: 'manual',
      launchCheck: false,
      allowPermissionPrompt: false
    })
    updateSnapshot(result)
    await refreshRuntimeStates()
    const queuedCount = Number(result?.notifications?.queued || 0)
    const sentCount = Number(result?.notifications?.sent || 0)
    statusMessage.value =
      queuedCount > 0 && sentCount === 0
        ? '已完成检查，但系统通知未发送。请确认通知权限已授权。'
        : `已完成一次实时检查。通知队列 ${queuedCount} 条，已发送 ${sentCount} 条。`
  } catch (error) {
    lastError.value = String(error)
    statusMessage.value = `检查失败：${lastError.value}`
  } finally {
    checking.value = false
  }
}

const refreshRuntimeStates = async () => {
  currentRuntime.value = getRuntime()

  // #615：真实后台检查状态（supported/scheduler/auth/lastResult/error），
  // 不伪造 ready（#609 契约；插件未接入时如实显示 unavailable）
  try {
    bgNativeState.value = await platformBridge.getBackgroundCheckState()
  } catch {
    bgNativeState.value = null
  }

  try {
    const state = await platformBridge.getAggressiveKeepAliveState()
    aggressiveKeepAliveSupported.value = !!state?.supported
    backgroundLockEnabled.value = !!state?.active
    backgroundLockSource.value = String(state?.source || '')
    keepAliveReason.value = String(state?.reason || '')
  } catch {
    aggressiveKeepAliveSupported.value = false
    keepAliveReason.value = '状态读取失败'
  }
}

const handleBackgroundToggle = async () => {
  saveSettings()
  // #616：Capacitor 壳不再启动前台服务保活（已退役）。移动端真实后台调度由
  // Tauri 插件配置（saveSettings 内 setBackgroundCheckConfig）负责；
  // Android 仍提示电池优化白名单（对 WorkManager 调度有实际影响）。
  if (currentRuntime.value === 'capacitor') {
    if (enableBackground.value && isAndroid()) {
      showBatteryPrompt.value = true
    }
    await refreshRuntimeStates()
    return
  }

  if (isTauriRuntime()) {
    if (isAndroid() || isIOSLike()) {
      // 移动端 Tauri：桌面 keep-screen-on 不适用于移动后台；仅刷新真实调度状态
      if (enableBackground.value && isAndroid()) {
        showBatteryPrompt.value = true
      }
      await refreshRuntimeStates()
      return
    }
    // 桌面端：keep-screen-on / 前台保活仍是桌面产品能力（#608 非目标保留）
    if (enableBackground.value) {
      const result = await enableBackgroundPowerLock()
      backgroundLockEnabled.value = result.enabled
      backgroundLockSource.value = result.source.join(' + ')
      return
    }
    const result = await disableBackgroundPowerLock()
    backgroundLockEnabled.value = false
    backgroundLockSource.value = result.source.join(' + ')
  }
}

const handleOtherSettingChange = () => {
  saveSettings()
}

// #615：per-feature 开关变化 -> 落盘 + 同步 #609 配置到后台插件
const handleBgFeatureChange = () => {
  saveSettings()
}

const handleIntervalChange = () => {
  if (![15, 30, 60].includes(Number(checkInterval.value))) {
    checkInterval.value = 30
  }
  saveSettings()
}

const handleClassLeadChange = () => {
  const candidate = Number(classLeadMinutes.value)
  classLeadMinutes.value = [5, 10, 15, 20, 30, 45, 60].includes(candidate) ? candidate : 30
  saveSettings()
}

const confirmBatterySettings = () => {
  showBatteryPrompt.value = false
  void platformBridge.openBatteryOptimizationSettings()
    .then((ok) => {
      statusMessage.value = ok
        ? '已打开系统设置，请允许通知与后台运行权限。'
        : '无法自动打开系统设置，请手动授予后台权限。'
    })
    .catch(() => {
      statusMessage.value = '无法自动打开系统设置，请手动授予后台权限。'
    })
}

const cancelBatterySettings = () => {
  showBatteryPrompt.value = false
}

const openSystemPermissionSettings = async () => {
  const ok = await platformBridge.openBatteryOptimizationSettings().catch(() => false)
  statusMessage.value = ok
    ? '已打开系统设置，请完成后台运行与通知权限授权。'
    : '无法自动打开系统设置，请在系统设置中手动授权后台运行。'
}

const handleTestNotification = async () => {
  sending.value = true
  statusMessage.value = ''
  lastError.value = ''

  try {
    const granted = await updatePermissionState(false)
    if (!granted) {
      statusMessage.value = '通知权限未授权，测试通知未发送。请点击上方“管理”开启通知权限。'
      return
    }

    await ensureAndroidChannel()
    const testId = Math.floor(Date.now() % 2147483000)

    try {
      const ok = await platformBridge.sendLocalNotification({
        id: testId,
        channelId: 'hbut-default',
        title: 'Mini-HBUT',
        body: '这是一个测试通知，用于验证通知权限和推送能力。'
      })
      if (!ok && currentRuntime.value === 'capacitor') {
        const retryOk = await platformBridge.sendLocalNotification({
          id: testId + 1,
          channelId: 'hbut-default',
          title: 'Mini-HBUT',
          body: '这是一个测试通知（移动端重试通道）。'
        })
        if (!retryOk) {
          throw new Error('移动端通知调度失败，请检查系统通知权限与电池优化设置')
        }
      }
      if (!ok && isTauriRuntime()) {
        await invoke('send_test_notification_native', {
          title: 'Mini-HBUT',
          body: '这是一个测试通知（Rust 兜底通道）。'
        })
      }
    } catch (notifyError) {
      if (!isAclDeniedError(notifyError)) throw notifyError
    }

    statusMessage.value = '测试通知已发送，请查看系统通知栏。'
  } catch (error) {
    lastError.value = String(error)
    statusMessage.value = `发送测试通知失败：${lastError.value}`
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  currentRuntime.value = getRuntime()
  updateSettingsFromStorage()
  selectedPath.value = readLocalDormSelection()
  snapshot.value = getLastNotifySnapshot(props.studentId) || null

  try {
    const { data } = await fetchDormitoryDataset()
    dormData.value = Array.isArray(data?.data) ? data.data : []
  } catch {
    dormData.value = []
  }

  await updatePermissionState(false)
  await ensureAndroidChannel()
  await refreshRuntimeStates()

  // #616：移动端不再自动启动前台服务保活（已退役）；桌面端保留 keep-screen-on
  if (enableBackground.value && isTauriRuntime() && !isAndroidLike() && !isIOSLike()) {
    const result = await enableBackgroundPowerLock()
    backgroundLockEnabled.value = result.enabled
    backgroundLockSource.value = result.source.join(' + ')
    keepAliveReason.value = result.enabled ? '' : '窗口保活未生效'
  }

  window.addEventListener(NOTIFY_SNAPSHOT_EVENT, handleSnapshotEvent)
})

onBeforeUnmount(() => {
  clearNotificationLayoutLongPress()
  stopNotificationLayoutDrag()
  stopNotificationCollisionFxLoop()
  window.removeEventListener(NOTIFY_SNAPSHOT_EVENT, handleSnapshotEvent)
})

watch(
  () => uiSettings.workspaceLayout.notifications.cardsOrder.join('|'),
  () => {
    if (!isNotificationLayoutEditing.value) {
      syncNotificationLayoutDraft()
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="notification-view fade-in">
    <header class="dashboard-header">
      <div class="header-left">
        <img class="logo-img" src="/splash/app_icon.png" alt="HBUT" />
        <span class="header-title">Mini-HBUT</span>
      </div>
      <span class="header-pill">通知</span>
    </header>

    <main class="notify-content">
      <!-- Permission Status Card -->
      <section class="permission-card">
        <div class="permission-left">
          <div class="permission-icon-circle">
            <span class="material-symbols-outlined fill">notifications_active</span>
          </div>
          <div class="permission-info">
            <h2 class="permission-title">推送通知{{ permissionLabel === '已授权' ? '已开启' : '未开启' }}</h2>
            <p class="permission-desc">{{ permissionLabel === '已授权' ? '你将准时收到校园提醒' : '请授权通知权限以接收提醒' }}</p>
          </div>
        </div>
        <button class="permission-manage-btn" @click="handleRequestPermission">管理</button>
      </section>

      <!-- Notification Types Panel (Bento Grid) -->
      <section class="notify-types-section">
        <h3 class="section-heading">通知类型设置</h3>
        <div class="notify-types-grid" ref="notificationLayoutRef"
          @pointerdown="handleInfoGridPressStart"
          @pointermove="handleInfoGridPressMove"
          @pointerup="handleInfoGridPressEnd"
          @pointercancel="handleInfoGridPressEnd"
        >
          <SortableSurface
            v-for="card in orderedInfoCards"
            :key="card.key"
            :item-id="card.key"
            :editing="isNotificationLayoutEditing"
            :dragging="draggingNotificationKey === card.key"
            :hover="hoverNotificationKey === card.key"
            @drag-start="handleNotificationDragStart"
            @drag-move="handleNotificationDragMove"
            @drag-end="stopNotificationLayoutDrag"
          >
            <!-- Grade Alerts -->
            <div v-if="card.key === 'grades'" class="notify-type-card">
              <div class="notify-type-top">
                <div class="notify-type-icon icon-accent">
                  <span class="material-symbols-outlined fill">school</span>
                </div>
                <label class="toggle-switch" @click.stop>
                  <input type="checkbox" v-model="enableGradeNotices" @change="handleOtherSettingChange">
                  <span class="toggle-track"></span>
                </label>
              </div>
              <div class="notify-type-body">
                <h4 class="notify-type-name">成绩更新</h4>
                <p class="notify-type-desc">出分第一时间提醒</p>
              </div>
            </div>

            <!-- Exam Alerts -->
            <div v-if="card.key === 'exams'" class="notify-type-card">
              <div class="notify-type-top">
                <div class="notify-type-icon icon-orange">
                  <span class="material-symbols-outlined fill">edit_document</span>
                </div>
                <label class="toggle-switch" @click.stop>
                  <input type="checkbox" v-model="enableExamReminders" @change="handleOtherSettingChange">
                  <span class="toggle-track"></span>
                </label>
              </div>
              <div class="notify-type-body">
                <h4 class="notify-type-name">考试安排</h4>
                <p class="notify-type-desc">考前 3 天提醒</p>
              </div>
            </div>

            <!-- Electricity Alerts -->
            <div v-if="card.key === 'electricity'" class="notify-type-card">
              <div class="notify-type-top">
                <div class="notify-type-icon icon-teal">
                  <span class="material-symbols-outlined fill">bolt</span>
                </div>
                <label class="toggle-switch" @click.stop>
                  <input type="checkbox" v-model="enablePowerNotices" @change="handleOtherSettingChange">
                  <span class="toggle-track"></span>
                </label>
              </div>
              <div class="notify-type-body">
                <h4 class="notify-type-name">寝室电费</h4>
                <p class="notify-type-desc">余额不足自动推送</p>
              </div>
            </div>

            <!-- Class Alerts -->
            <div v-if="card.key === 'class_reminder'" class="notify-type-card">
              <div class="notify-type-top">
                <div class="notify-type-icon icon-sky">
                  <span class="material-symbols-outlined fill">schedule</span>
                </div>
                <label class="toggle-switch" @click.stop>
                  <input type="checkbox" v-model="enableClassReminders" @change="handleOtherSettingChange">
                  <span class="toggle-track"></span>
                </label>
              </div>
              <div class="notify-type-body">
                <h4 class="notify-type-name">上课提醒</h4>
                <p class="notify-type-desc">课前 {{ classLeadMinutes }} 分钟提醒</p>
              </div>
            </div>

            <!-- School Inbox Alerts -->
            <div v-if="card.key === 'school_inbox'" class="notify-type-card">
              <div class="notify-type-top">
                <div class="notify-type-icon icon-indigo">
                  <span class="material-symbols-outlined fill">mail</span>
                </div>
                <label class="toggle-switch" @click.stop>
                  <input type="checkbox" v-model="enableSchoolInboxNotices" @change="handleOtherSettingChange">
                  <span class="toggle-track"></span>
                </label>
              </div>
              <div class="notify-type-body">
                <h4 class="notify-type-name">学校消息</h4>
                <p class="notify-type-desc">教务/学习通消息中心新通知</p>
              </div>
            </div>
          </SortableSurface>
          <LayoutCollisionFxLayer :particles="notificationCollisionFx" />
        </div>

        <!-- Layout Edit Controls -->
        <div v-if="isNotificationLayoutEditing" class="layout-edit-bar">
          <button class="layout-edit-btn" @click="resetNotificationLayoutEdit">重置</button>
          <button class="layout-edit-btn" @click="cancelNotificationLayoutEdit">取消</button>
          <button class="layout-edit-btn primary" @click="saveNotificationLayoutEdit">保存</button>
        </div>
      </section>

      <!-- Background Sync Settings -->
      <section class="sync-settings-card">
        <div class="sync-header">
          <div class="sync-header-left">
            <span class="material-symbols-outlined">sync</span>
            <h3 class="sync-title">后台自动检查</h3>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" v-model="enableBackground" @change="handleBackgroundToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="sync-interval-row">
          <span class="sync-interval-label">检查间隔</span>
          <select class="sync-interval-select" v-model="checkInterval" @change="handleIntervalChange">
            <option :value="15">每 15 分钟</option>
            <option :value="30">每 30 分钟</option>
            <option :value="60">每 1 小时</option>
          </select>
        </div>

        <!-- #615：per-feature 独立开关（成绩变化 / 考试安排变化 / 学校消息） -->
        <div class="sync-features-block">
          <div class="sync-feature-row">
            <span class="sync-feature-label">成绩变化检测</span>
            <span class="sync-feature-status">{{ bgNativeState ? (bgFeatureGrades ? '开启' : '关闭') : '' }}</span>
            <label class="toggle-switch" @click.stop>
              <input type="checkbox" v-model="bgFeatureGrades" @change="handleBgFeatureChange">
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="sync-feature-row">
            <span class="sync-feature-label">考试安排变化检测</span>
            <span class="sync-feature-status">{{ examsFeatureStatusText }}</span>
            <label class="toggle-switch" @click.stop>
              <input type="checkbox" v-model="bgFeatureExams" @change="handleBgFeatureChange">
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="sync-feature-row">
            <span class="sync-feature-label">学校消息检测</span>
            <span class="sync-feature-status">{{ schoolFeatureStatusText }}</span>
            <label class="toggle-switch" @click.stop>
              <input type="checkbox" v-model="bgFeatureSchool" @change="handleBgFeatureChange">
              <span class="toggle-track"></span>
            </label>
          </div>
          <p class="sync-feature-hint">后台检测状态：{{ bgFeatureStatusText }}</p>
        </div>
      </section>

      <!-- Action Buttons -->
      <section class="action-buttons">
        <button class="action-btn secondary" :disabled="checking" @click="runManualCheck">
          {{ checking ? '检查中...' : '立即检查一次' }}
        </button>
        <button class="action-btn secondary" :disabled="sending" @click="handleTestNotification">
          {{ sending ? '发送中...' : '发送测试通知' }}
        </button>
      </section>


      <!-- Recent Notifications -->
      <section class="recent-section">
        <div class="recent-header">
          <h3 class="section-heading">近期消息</h3>
          <span class="recent-time">{{ lastCheckText }}</span>
        </div>

        <!-- Grade Card (Unread style with details) -->
        <div v-if="gradeItems.length" class="notify-message-card unread">
          <div class="notify-msg-left">
            <div class="notify-msg-icon icon-accent">
              <span class="material-symbols-outlined fill">school</span>
            </div>
            <div class="notify-msg-body">
              <div class="notify-msg-head">
                <h4 class="notify-msg-title" :class="{ bold: gradeSummary?.changed }">{{ gradeSummary?.changed ? '新成绩发布' : '成绩动态' }}</h4>
                <span class="notify-msg-time">{{ lastCheckText }}</span>
              </div>
              <p class="notify-msg-text">总成绩 {{ gradeSummary?.total || 0 }} 条 · 本次{{ gradeSummary?.changed ? '有变化' : '无变化' }}</p>
              <ul v-if="gradeItems.length" class="notify-detail-list">
                <li v-for="(item, idx) in gradeItems.slice(0, 3)" :key="`grade-${idx}`" class="detail-row">
                  <span class="detail-main">{{ item.course_name || '-' }}</span>
                  <span class="detail-sub">
                    <span>{{ item.term || '未知学期' }}</span>
                    <span class="detail-score">{{ item.final_score || '-' }}</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Class Reminder Card (with details) -->
        <div v-if="classSummary?.enabled" class="notify-message-card">
          <div class="notify-msg-left">
            <div class="notify-msg-icon icon-sky">
              <span class="material-symbols-outlined fill">schedule</span>
            </div>
            <div class="notify-msg-body">
              <div class="notify-msg-head">
                <h4 class="notify-msg-title">上课提醒</h4>
                <span class="notify-msg-time">{{ classReminderText }}</span>
              </div>
              <p class="notify-msg-text">{{ nextClassText }}</p>
              <div class="notify-detail-kv" v-if="classSummary?.nextCourse?.name">
                <span class="kv-item"><span class="material-symbols-outlined mini-icon">alarm</span> 提前 {{ classLeadMinutes }} 分钟</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Exam Card (with details) -->
        <div v-if="examItems.length" class="notify-message-card">
          <div class="notify-msg-left">
            <div class="notify-msg-icon icon-orange">
              <span class="material-symbols-outlined fill">edit_document</span>
            </div>
            <div class="notify-msg-body">
              <div class="notify-msg-head">
                <h4 class="notify-msg-title">考试安排</h4>
                <span class="notify-msg-time">{{ examSummary?.tomorrowCount ? '明日有考试' : '' }}</span>
              </div>
              <p class="notify-msg-text">近期 {{ examItems.length }} 门 · 明日 {{ examSummary?.tomorrowCount || 0 }} 门</p>
              <ul class="notify-detail-list">
                <li v-for="(item, idx) in examItems.slice(0, 3)" :key="`exam-${idx}`">
                  <span class="detail-main">
                    {{ item.course_name || '-' }}
                    <small v-if="item.is_tomorrow" class="tag-urgent">明日</small>
                  </span>
                  <span class="detail-sub">
                    <span v-if="item.exam_date">{{ item.exam_date }}</span>
                    <span v-if="item.exam_time">{{ formatNotifyExamTime(item.exam_time) }}</span>
                    <span v-if="item.location">{{ item.location }}</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- School Inbox Card -->
        <div v-if="schoolInboxSummary?.enabled" class="notify-message-card">
          <div class="notify-msg-left">
            <div class="notify-msg-icon icon-indigo">
              <span class="material-symbols-outlined fill">mail</span>
            </div>
            <div class="notify-msg-body">
              <div class="notify-msg-head">
                <h4 class="notify-msg-title" :class="{ bold: schoolInboxSummary?.triggered > 0 }">
                  {{ schoolInboxSummary?.triggered > 0 ? '新学校消息' : '学校消息' }}
                </h4>
                <span class="notify-msg-time">{{ lastCheckText }}</span>
              </div>
              <p class="notify-msg-text">
                共 {{ schoolInboxSummary?.total || 0 }} 条
                <template v-if="schoolInboxSummary?.source">（{{ schoolInboxSummary.source === 'chaoxing' ? '学习通' : '教务' }}）</template>
                · 本次新增 {{ schoolInboxSummary?.triggered || 0 }} 条
              </p>
              <p v-if="schoolInboxSummary?.error" class="notify-msg-text warn">{{ schoolInboxSummary.error }}</p>
            </div>
          </div>
        </div>

        <!-- Electricity Card -->
        <div v-if="powerSummary?.quantity != null" class="notify-message-card">
          <div class="notify-msg-left">
            <div class="notify-msg-icon icon-teal">
              <span class="material-symbols-outlined fill">bolt</span>
            </div>
            <div class="notify-msg-body">
              <div class="notify-msg-head">
                <h4 class="notify-msg-title">电费监控</h4>
                <span class="notify-msg-time">{{ powerStatusText }}</span>
              </div>
              <p class="notify-msg-text">剩余电量：{{ powerQuantityText }}</p>
              <p v-if="powerSummary?.isDual" class="notify-msg-text">空调电量：{{ acPowerQuantityText }}</p>
            </div>
          </div>
        </div>

        <div class="notify-end-hint">长按卡片进入管理模式</div>
      </section>

      <!-- 后台状态（#616：保活仅桌面端展示；移动端展示真实调度状态） -->
      <div class="status-row" v-if="enableBackground">
        <span v-if="currentRuntime === 'tauri' && !isAndroidLike() && !isIOSLike()" class="status-pill soft">保活：{{ backgroundLockStatusText }}</span>
        <span class="status-pill soft">调度：{{ bgFeatureStatusText }}</span>
      </div>
    </main>

    <p v-if="statusMessage" class="status-msg">{{ statusMessage }}</p>
    <p v-if="lastError" class="status-err">错误详情：{{ lastError }}</p>

    <div v-if="showBatteryPrompt" class="modal-mask">
      <div class="modal-card">
        <h3>电池优化提示</h3>
        <p>Android 建议将本应用加入后台白名单，避免系统回收后无法按时通知。</p>
        <div class="modal-actions">
          <button class="btn-text" @click="cancelBatterySettings">稍后</button>
          <button class="btn-primary" @click="confirmBatterySettings">我知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>
<style src="../styles/views/NotificationView.scoped.css" scoped></style>
