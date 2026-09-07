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
import { tf, useLocale } from '../utils/app_i18n'

const props = defineProps({
  studentId: String
})

const emit = defineEmits(['back', 'openWorkspaceLayout'])
const uiSettings = useUiSettings()
// #790：响应式 locale + 取词函数（语言切换即时生效）
const { t: tLocale } = useLocale()
const NOTIFICATION_LAYOUT_LONG_PRESS_MS = 380
const NOTIFICATION_LAYOUT_LONG_PRESS_DISTANCE = 14
const NOTIFICATION_LAYOUT_SCROLL_OFFSET_PX = 18

const enableBackground = ref(false)
const enableExamReminders = ref(true)
const enableGradeNotices = ref(true)
const enablePowerNotices = ref(true)
const enableClassReminders = ref(true)
const enableSchoolInboxNotices = ref(true)
// #715：学习通通知独立渠道开关
const enableChaoxingInboxNotices = ref(true)
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
  const platformText = isAndroidUA ? 'Android' : (isIosUA ? 'iOS' : tLocale('notify.platform.unknown'))
  if (currentRuntime.value === 'capacitor') return `${platformText} / Capacitor`
  if (currentRuntime.value === 'tauri') {
    if (isAndroidUA || isIosUA) return `${platformText} / Tauri`
    return tLocale('notify.platform.desktop')
  }
  return tLocale('notify.platform.web')
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
  // #715：学习通通知独立渠道开关落盘
  localStorage.setItem('hbu_notify_chaoxing_inbox', enableChaoxingInboxNotices.value ? 'true' : 'false')
  localStorage.setItem('hbu_notify_class_lead_min', String(classLeadMinutes.value))
  localStorage.setItem('hbu_notify_interval', String(checkInterval.value))
  // #706：同步 #609 BackgroundCheckConfig 契约到后台插件。check* 直接映射上方
  // 通知类型开关（唯一控制面，原 per-feature 独立开关已移除）；native business
  // 列表由适配器映射：grades/exams/school_inbox，并刷新真实状态展示。
  void platformBridge
    .setBackgroundCheckConfig({
      enabled: enableBackground.value,
      checkGradeChanges: enableGradeNotices.value,
      checkExamChanges: enableExamReminders.value,
      checkSchoolInbox: enableSchoolInboxNotices.value,
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
  enableChaoxingInboxNotices.value = settings.enableChaoxingInbox !== false
  classLeadMinutes.value = [5, 10, 15, 20, 30, 45, 60].includes(Number(settings.classLeadMinutes))
    ? Number(settings.classLeadMinutes)
    : 30
  checkInterval.value = [15, 30, 60].includes(settings.intervalMinutes)
    ? settings.intervalMinutes
    : 30
}

const findByValue = (list, value) =>
  (Array.isArray(list) ? list : []).find((item) => String(item?.value) === String(value))

const selectedRoomLabel = computed(() => {
  const path = selectedPath.value
  if (!Array.isArray(path) || path.length !== 4) return tLocale('notify.room.notSelected')
  const [areaId, buildingId, layerId, roomId] = path
  const area = findByValue(dormData.value, areaId)
  const building = findByValue(area?.children, buildingId)
  const layer = findByValue(building?.children, layerId)
  const room = findByValue(layer?.children, roomId)
  const names = [area?.label, building?.label, layer?.label, room?.label].filter(Boolean)
  return names.length ? names.join(' / ') : path.join(' - ')
})

const permissionLabel = computed(() => {
  if (permissionState.value === 'granted') return tLocale('notify.permission.granted')
  if (permissionState.value === 'denied') return tLocale('notify.permission.denied')
  if (permissionState.value === 'default') return tLocale('notify.permission.default')
  if (permissionState.value === 'unsupported') return tLocale('notify.permission.unsupported')
  return tLocale('notify.permission.unknown')
})

const lastCheckText = computed(() => {
  const checkedAt = snapshot.value?.checkedAt
  return checkedAt ? formatRelativeTime(checkedAt) : tLocale('notify.status.notChecked')
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
// #715：学习通通知独立渠道摘要
const chaoxingInboxSummary = computed(() => snapshot.value?.chaoxingInbox || {})
const powerSummary = computed(() => snapshot.value?.electricity || {})

const powerQuantityText = computed(() => {
  const quantity = Number(powerSummary.value?.quantity)
  if (!Number.isFinite(quantity)) return '--'
  return tf('notify.unit.kwh', { n: quantity.toFixed(2) })
})

const acPowerQuantityText = computed(() => {
  const q = Number(powerSummary.value?.acQuantity)
  if (!Number.isFinite(q)) return '--'
  return tf('notify.unit.kwh', { n: q.toFixed(2) })
})

const powerStatusText = computed(() => {
  if (
    powerSummary.value?.error === tLocale('notify.electricity.noRoomSelected') &&
    selectedPath.value.length === 4
  ) {
    return tLocale('notify.electricity.reconfigured')
  }
  if (powerSummary.value?.error) return powerSummary.value.error
  return powerSummary.value?.status || tLocale('notify.electricity.noStatus')
})

const classReminderText = computed(() => {
  if (!classSummary.value?.enabled) return tLocale('notify.common.disabled')
  const total = Number(classSummary.value?.totalToday || 0)
  const trigger = Number(classSummary.value?.triggered || 0)
  return tf('notify.class.todaySummary', { total, triggered: trigger })
})

const nextClassText = computed(() => {
  const next = classSummary.value?.nextCourse
  if (!next?.name) return tLocale('notify.class.noneUpcoming')
  const mins = Number(next?.minsUntilStart || 0)
  const when = mins > 0 ? tf('notify.class.inMinutes', { n: mins }) : tLocale('notify.class.soon')
  return tf('notify.class.nextCourse', {
    when,
    course: next.name,
    clock: next.startClock || '--:--',
    room: next.room || tLocale('notify.room.tbd')
  })
})

// #615：per-feature 后台检测状态（真实来源：#609 BackgroundCheckState + 最近快照）
const bgFeatureStatusText = computed(() => {
  const state = bgNativeState.value
  if (!state) return tLocale('notify.status.statusUnknown')
  if (!state?.supported) return state?.reason || tLocale('notify.bg.unsupported')
  if (state?.scheduler?.status === 'unavailable') return tLocale('notify.bg.schedulerUnavailable')
  const lastResult = String(state?.lastResult || 'unknown')
  const errorText = state?.lastError ? tf('notify.bg.lastErrorSuffix', { error: state.lastError }) : ''
  return tf('notify.bg.schedulerStatus', {
    kind: state?.scheduler?.kind || 'unknown',
    result: lastResult
  }) + errorText
})

// 学校消息：provider 后台不受支持时显示真实 unsupported/foreground-only 状态，
// 而不是静默假成功（#615 验收：设置页显示真实状态）。#706：开关来源收敛为
// 上方通知类型开关 enableSchoolInboxNotices（原 per-feature 独立开关已移除）。
const schoolFeatureStatusText = computed(() => {
  const school = schoolInboxSummary.value
  const enabled = enableSchoolInboxNotices.value
  if (!enabled) return tLocale('notify.common.disabled')
  if (school?.error) return tf('notify.inbox.frontCheckError', { error: school.error })
  if (school?.total != null) {
    const sourceText = school?.source === 'chaoxing' ? tLocale('notify.source.chaoxing') : tLocale('notify.source.academic')
    return tf('notify.inbox.frontCheckOk', { source: sourceText, total: school.total })
  }
  const state = bgNativeState.value
  if (state && !state?.supported) return tLocale('notify.inbox.bgUnsupported')
  return tLocale('notify.status.waiting')
})

const examsFeatureStatusText = computed(() => {
  const exams = examSummary.value
  if (!enableExamReminders.value) return tLocale('notify.common.disabled')
  if (exams?.total != null) {
    return tf('notify.exams.summary', { total: exams.total, tomorrow: exams.tomorrowCount || 0 })
  }
  return tLocale('notify.status.waiting')
})

// #616：keep-screen-on / 前台保活仅作为桌面端能力展示（移动端不再把它
// 描述为后台智能检查成功；移动端调度状态见 bgFeatureStatusText）。
const keepAliveStatusText = computed(() => {
  if (!aggressiveKeepAliveSupported.value) return keepAliveReason.value || tLocale('notify.keepalive.notEnabled')
  return backgroundLockEnabled.value ? tLocale('notify.keepalive.running') : tLocale('notify.keepalive.notRunning')
})

const backgroundLockStatusText = computed(() => {
  if (backgroundLockEnabled.value) {
    return tf('notify.keepalive.enabled', { source: backgroundLockSource.value || tLocale('notify.keepalive.system') })
  }
  if (aggressiveKeepAliveSupported.value) {
    return tLocale('notify.keepalive.canEnable')
  }
  if (keepAliveReason.value) {
    return tf('notify.keepalive.disabledReason', { reason: keepAliveReason.value })
  }
  if (currentRuntime.value === 'tauri') {
    return tLocale('notify.keepalive.desktopAvailable')
  }
  return tLocale('notify.keepalive.notEnabled')
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
    school_inbox: { key: 'school_inbox' },
    chaoxing_inbox: { key: 'chaoxing_inbox' }
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
    school_inbox: ['#6366f1', '#a5b4fc', '#c4b5fd'],
    chaoxing_inbox: ['#14b8a6', '#5eead4', '#99f6e4']
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
          ? tLocale('notify.msg.permissionGranted')
          : tLocale('notify.msg.permissionDenied')
    }
    return state === 'granted'
  } catch (error) {
    if (currentRuntime.value === 'web') {
      permissionState.value = 'unsupported'
      statusMessage.value = tLocale('notify.msg.unsupportedEnv')
      return false
    }

    if (isAclDeniedError(error) && isTauriRuntime()) {
      try {
        const nativeState = await getNativePermissionState(requestNow)
        permissionState.value = nativeState
        if (requestNow) {
          statusMessage.value =
            nativeState === 'granted'
              ? tLocale('notify.msg.permissionGranted')
              : tLocale('notify.msg.permissionDenied')
        }
        return nativeState === 'granted'
      } catch (nativeErr) {
        permissionState.value = 'denied'
        lastError.value = String(nativeErr)
        statusMessage.value = tf('notify.msg.queryFailed', { error: lastError.value })
        return false
      }
    }

    permissionState.value = 'denied'
    lastError.value = String(error)
    statusMessage.value = tf('notify.msg.queryFailed', { error: lastError.value })
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
      ? tLocale('notify.msg.settingsOpened')
      : tLocale('notify.msg.settingsNotOpened')
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
    statusMessage.value = tLocale('notify.msg.notLoggedIn')
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
        ? tLocale('notify.msg.checkDoneNoSend')
        : tf('notify.msg.checkDone', { queued: queuedCount, sent: sentCount })
  } catch (error) {
    lastError.value = String(error)
    statusMessage.value = tf('notify.msg.checkFailed', { error: lastError.value })
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
    keepAliveReason.value = tLocale('notify.msg.keepAliveReadFailed')
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
        ? tLocale('notify.msg.batterySettingsOpened')
        : tLocale('notify.msg.batterySettingsFailed')
    })
    .catch(() => {
      statusMessage.value = tLocale('notify.msg.batterySettingsFailed')
    })
}

const cancelBatterySettings = () => {
  showBatteryPrompt.value = false
}

const openSystemPermissionSettings = async () => {
  const ok = await platformBridge.openBatteryOptimizationSettings().catch(() => false)
  statusMessage.value = ok
    ? tLocale('notify.msg.batteryAllOpened')
    : tLocale('notify.msg.batteryManual')
}

const handleTestNotification = async () => {
  sending.value = true
  statusMessage.value = ''
  lastError.value = ''

  try {
    const granted = await updatePermissionState(false)
    if (!granted) {
      statusMessage.value = tLocale('notify.msg.testNotSent')
      return
    }

    await ensureAndroidChannel()
    const testId = Math.floor(Date.now() % 2147483000)

    try {
      const ok = await platformBridge.sendLocalNotification({
        id: testId,
        channelId: 'hbut-default',
        title: 'Mini-HBUT',
        body: tLocale('notify.test.body')
      })
      if (!ok && currentRuntime.value === 'capacitor') {
        const retryOk = await platformBridge.sendLocalNotification({
          id: testId + 1,
          channelId: 'hbut-default',
          title: 'Mini-HBUT',
          body: tLocale('notify.test.bodyRetry')
        })
        if (!retryOk) {
          throw new Error(tLocale('notify.test.mobileFailed'))
        }
      }
      if (!ok && isTauriRuntime()) {
        await invoke('send_test_notification_native', {
          title: 'Mini-HBUT',
          body: tLocale('notify.test.bodyRust')
        })
      }
    } catch (notifyError) {
      if (!isAclDeniedError(notifyError)) throw notifyError
    }

    statusMessage.value = tLocale('notify.msg.testSent')
  } catch (error) {
    lastError.value = String(error)
    statusMessage.value = tf('notify.msg.testFailed', { error: lastError.value })
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
    keepAliveReason.value = result.enabled ? '' : tLocale('notify.msg.keepAliveInactive')
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
      <span class="header-pill">{{ tLocale('tab.notifications') }}</span>
    </header>

    <main class="notify-content">
      <!-- Permission Status Card -->
      <section class="permission-card">
        <div class="permission-left">
          <div class="permission-icon-circle">
            <span class="material-symbols-outlined fill">notifications_active</span>
          </div>
          <div class="permission-info">
            <h2 class="permission-title">{{ permissionLabel === tLocale('notify.permission.granted') ? tLocale('notify.permission.pushOn') : tLocale('notify.permission.pushOff') }}</h2>
            <p class="permission-desc">{{ permissionLabel === tLocale('notify.permission.granted') ? tLocale('notify.permission.grantedDesc') : tLocale('notify.permission.notGrantedDesc') }}</p>
          </div>
        </div>
        <button class="permission-manage-btn" @click="handleRequestPermission">{{ tLocale('notify.permission.manage') }}</button>
      </section>

      <!-- Notification Types Panel (Bento Grid) -->
      <section class="notify-types-section">
        <h3 class="section-heading">{{ tLocale('notify.section.types') }}</h3>
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
                <h4 class="notify-type-name">{{ tLocale('notify.card.grades') }}</h4>
                <p class="notify-type-desc">{{ tLocale('notify.card.gradesDesc') }}</p>
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
                <h4 class="notify-type-name">{{ tLocale('notify.card.exams') }}</h4>
                <p class="notify-type-desc">{{ tLocale('notify.card.examsDesc') }}</p>
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
                <h4 class="notify-type-name">{{ tLocale('notify.card.electricity') }}</h4>
                <p class="notify-type-desc">{{ tLocale('notify.card.electricityDesc') }}</p>
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
                <h4 class="notify-type-name">{{ tLocale('notify.card.classReminder') }}</h4>
                <p class="notify-type-desc">{{ tf('notify.card.classReminderDesc', { n: classLeadMinutes }) }}</p>
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
                <h4 class="notify-type-name">{{ tLocale('notify.card.schoolInbox') }}</h4>
                <p class="notify-type-desc">{{ tLocale('notify.card.schoolInboxDesc') }}</p>
              </div>
            </div>

            <!-- #715 学习通通知（独立渠道，固定学习通收件箱源） -->
            <div v-if="card.key === 'chaoxing_inbox'" class="notify-type-card">
              <div class="notify-type-top">
                <div class="notify-type-icon icon-teal">
                  <span class="material-symbols-outlined fill">mark_email_unread</span>
                </div>
                <label class="toggle-switch" @click.stop>
                  <input type="checkbox" v-model="enableChaoxingInboxNotices" @change="handleOtherSettingChange">
                  <span class="toggle-track"></span>
                </label>
              </div>
              <div class="notify-type-body">
                <h4 class="notify-type-name">{{ tLocale('notify.card.chaoxingInbox') }}</h4>
                <p class="notify-type-desc">{{ tLocale('notify.card.chaoxingInboxDesc') }}</p>
              </div>
            </div>
          </SortableSurface>
          <LayoutCollisionFxLayer :particles="notificationCollisionFx" />
        </div>

        <!-- Layout Edit Controls -->
        <div v-if="isNotificationLayoutEditing" class="layout-edit-bar">
          <button class="layout-edit-btn" @click="resetNotificationLayoutEdit">{{ tLocale('common.reset') }}</button>
          <button class="layout-edit-btn" @click="cancelNotificationLayoutEdit">{{ tLocale('common.cancel') }}</button>
          <button class="layout-edit-btn primary" @click="saveNotificationLayoutEdit">{{ tLocale('common.save') }}</button>
        </div>
      </section>

      <!-- Background Sync Settings -->
      <section class="sync-settings-card">
        <div class="sync-header">
          <div class="sync-header-left">
            <span class="material-symbols-outlined">sync</span>
            <h3 class="sync-title">{{ tLocale('notify.sync.title') }}</h3>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" v-model="enableBackground" @change="handleBackgroundToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="sync-interval-row">
          <span class="sync-interval-label">{{ tLocale('notify.sync.intervalLabel') }}</span>
          <select class="sync-interval-select" v-model="checkInterval" @change="handleIntervalChange">
            <option :value="15">{{ tf('notify.sync.intervalMinutes', { n: 15 }) }}</option>
            <option :value="30">{{ tf('notify.sync.intervalMinutes', { n: 30 }) }}</option>
            <option :value="60">{{ tLocale('notify.sync.intervalHourly') }}</option>
          </select>
        </div>

        <!-- #706：后台检测调度状态展示；分项控制已收敛至上方通知类型开关 -->
        <div class="sync-features-block">
          <p class="sync-feature-hint">{{ tf('notify.sync.statusPrefix', { status: bgFeatureStatusText }) }}</p>
        </div>
      </section>

      <!-- Action Buttons -->
      <section class="action-buttons">
        <button class="action-btn secondary" :disabled="checking" @click="runManualCheck">
          {{ checking ? tLocale('notify.action.checking') : tLocale('notify.action.checkNow') }}
        </button>
        <button class="action-btn secondary" :disabled="sending" @click="handleTestNotification">
          {{ sending ? tLocale('notify.action.sending') : tLocale('notify.action.sendTest') }}
        </button>
      </section>


      <!-- Recent Notifications -->
      <section class="recent-section">
        <div class="recent-header">
          <h3 class="section-heading">{{ tLocale('notify.recent.title') }}</h3>
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
                <h4 class="notify-msg-title" :class="{ bold: gradeSummary?.changed }">{{ gradeSummary?.changed ? tLocale('notify.card.gradesNew') : tLocale('notify.card.grades') }}</h4>
                <span class="notify-msg-time">{{ lastCheckText }}</span>
              </div>
              <p class="notify-msg-text">{{ tf('notify.recent.gradesSummary', { total: gradeSummary?.total || 0, changed: gradeSummary?.changed ? tLocale('notify.recent.changed') : tLocale('notify.recent.unchanged') }) }}</p>
              <ul v-if="gradeItems.length" class="notify-detail-list">
                <li v-for="(item, idx) in gradeItems.slice(0, 3)" :key="`grade-${idx}`" class="detail-row">
                  <span class="detail-main">{{ item.course_name || '-' }}</span>
                  <span class="detail-sub">
                    <span>{{ item.term || tLocale('grade.term.unknown') }}</span>
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
                <h4 class="notify-msg-title">{{ tLocale('notify.card.classReminder') }}</h4>
                <span class="notify-msg-time">{{ classReminderText }}</span>
              </div>
              <p class="notify-msg-text">{{ nextClassText }}</p>
              <div class="notify-detail-kv" v-if="classSummary?.nextCourse?.name">
                <span class="kv-item"><span class="material-symbols-outlined mini-icon">alarm</span> {{ tf('notify.class.leadMinutes', { n: classLeadMinutes }) }}</span>
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
                <h4 class="notify-msg-title">{{ tLocale('notify.card.exams') }}</h4>
                <span class="notify-msg-time">{{ examSummary?.tomorrowCount ? tLocale('notify.exams.tomorrowBadge') : '' }}</span>
              </div>
              <p class="notify-msg-text">{{ tf('notify.recent.examsSummary', { recent: examItems.length, tomorrow: examSummary?.tomorrowCount || 0 }) }}</p>
              <ul class="notify-detail-list">
                <li v-for="(item, idx) in examItems.slice(0, 3)" :key="`exam-${idx}`">
                  <span class="detail-main">
                    {{ item.course_name || '-' }}
                    <small v-if="item.is_tomorrow" class="tag-urgent">{{ tLocale('notify.exams.tomorrow') }}</small>
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

        <!-- Electricity Card（#732：前移至上课提醒/考试与学校消息之间） -->
        <div v-if="powerSummary?.quantity != null" class="notify-message-card">
          <div class="notify-msg-left">
            <div class="notify-msg-icon icon-teal">
              <span class="material-symbols-outlined fill">bolt</span>
            </div>
            <div class="notify-msg-body">
              <div class="notify-msg-head">
                <h4 class="notify-msg-title">{{ tLocale('notify.card.electricity') }}</h4>
                <span class="notify-msg-time">{{ powerStatusText }}</span>
              </div>
              <p class="notify-msg-text">{{ tf('notify.recent.powerRemaining', { quantity: powerQuantityText }) }}</p>
              <p v-if="powerSummary?.isDual" class="notify-msg-text">{{ tf('notify.recent.powerAc', { quantity: acPowerQuantityText }) }}</p>
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
                  {{ schoolInboxSummary?.triggered > 0 ? tLocale('notify.card.schoolInboxNew') : tLocale('notify.card.schoolInbox') }}
                </h4>
                <span class="notify-msg-time">{{ lastCheckText }}</span>
              </div>
              <p class="notify-msg-text">
                {{ tf('notify.recent.inboxSummary', {
                  total: schoolInboxSummary?.total || 0,
                  source: schoolInboxSummary?.source ? tf('notify.recent.sourceParens', { source: schoolInboxSummary.source === 'chaoxing' ? tLocale('notify.source.chaoxing') : tLocale('notify.source.academic') }) : '',
                  triggered: schoolInboxSummary?.triggered || 0
                }) }}
              </p>
              <p v-if="schoolInboxSummary?.error" class="notify-msg-text warn">{{ schoolInboxSummary.error }}</p>
            </div>
          </div>
        </div>

        <!-- #715 学习通通知 Card（独立渠道） -->
        <div v-if="chaoxingInboxSummary?.enabled" class="notify-message-card">
          <div class="notify-msg-left">
            <div class="notify-msg-icon icon-teal">
              <span class="material-symbols-outlined fill">mark_email_unread</span>
            </div>
            <div class="notify-msg-body">
              <div class="notify-msg-head">
                <h4 class="notify-msg-title" :class="{ bold: chaoxingInboxSummary?.triggered > 0 }">
                  {{ chaoxingInboxSummary?.triggered > 0 ? tLocale('notify.card.chaoxingInboxNew') : tLocale('notify.card.chaoxingInbox') }}
                </h4>
                <span class="notify-msg-time">{{ lastCheckText }}</span>
              </div>
              <p class="notify-msg-text">
                {{ tf('notify.recent.inboxSummaryPlain', { total: chaoxingInboxSummary?.total || 0, triggered: chaoxingInboxSummary?.triggered || 0 }) }}
              </p>
              <p v-if="chaoxingInboxSummary?.error" class="notify-msg-text warn">{{ chaoxingInboxSummary.error }}</p>
            </div>
          </div>
        </div>

        <div class="notify-end-hint">{{ tLocale('notify.recent.longPressHint') }}</div>
      </section>

      <!-- 后台状态（#616：保活仅桌面端展示；移动端展示真实调度状态） -->
      <div class="status-row" v-if="enableBackground">
        <span v-if="currentRuntime === 'tauri' && !isAndroidLike() && !isIOSLike()" class="status-pill soft">{{ tf('notify.status.keepAlivePrefix', { status: backgroundLockStatusText }) }}</span>
        <span class="status-pill soft">{{ tf('notify.status.schedulerPrefix', { status: bgFeatureStatusText }) }}</span>
      </div>
    </main>

    <p v-if="statusMessage" class="status-msg">{{ statusMessage }}</p>
    <p v-if="lastError" class="status-err">{{ tf('notify.status.errorDetail', { error: lastError }) }}</p>

    <div v-if="showBatteryPrompt" class="modal-mask">
      <div class="modal-card">
        <h3>{{ tLocale('notify.battery.title') }}</h3>
        <p>{{ tLocale('notify.battery.desc') }}</p>
        <div class="modal-actions">
          <button class="btn-text" @click="cancelBatterySettings">{{ tLocale('notify.battery.later') }}</button>
          <button class="btn-primary" @click="confirmBatterySettings">{{ tLocale('notify.battery.ack') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
<style src="../styles/views/NotificationView.scoped.css" scoped></style>
