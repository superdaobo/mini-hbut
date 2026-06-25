<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { enableBackgroundPowerLock, disableBackgroundPowerLock } from '../utils/power_guard'
import { invokeNative as invoke, isTauriRuntime } from '../platform/native'
import { getRuntime, platformBridge } from '../platform'
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
import {
  getBackgroundFetchRuntimeState,
  syncBackgroundFetchContext
} from '../utils/background_fetch.js'
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
const classLeadMinutes = ref(30)
const checkInterval = ref(30)
const showBatteryPrompt = ref(false)
const backgroundLockEnabled = ref(false)
const backgroundLockSource = ref('')
const aggressiveKeepAliveSupported = ref(false)
const keepAliveReason = ref('')
const backgroundFetchState = ref(null)

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
  const ua = String(navigator.userAgent || '')
  const isAndroidUA = /Android/i.test(ua)
  const isIosUA = /iPhone|iPad|iPod/i.test(ua)
  const platformText = isAndroidUA ? 'Android' : (isIosUA ? 'iOS' : '未知平台')
  if (currentRuntime.value === 'capacitor') return `${platformText} / Capacitor`
  if (currentRuntime.value === 'tauri') {
    if (isAndroidUA || isIosUA) return `${platformText} / Tauri`
    return '桌面端 / Tauri'
  }
  return '浏览器 / Web'
})

const isAndroid = () => /Android/i.test(navigator.userAgent)

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
  syncBackgroundFetchContext({
    studentId: props.studentId,
    settings: {
      enableBackground: enableBackground.value,
      enableExamReminder: enableExamReminders.value,
      enableGradeNotice: enableGradeNotices.value,
      enablePowerNotice: enablePowerNotices.value,
      enableClassReminder: enableClassReminders.value,
      enableSchoolInbox: enableSchoolInboxNotices.value,
      classLeadMinutes: classLeadMinutes.value,
      intervalMinutes: checkInterval.value
    },
    dormSelection: selectedPath.value
  }).catch(() => {})
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

const backgroundFetchStatusText = computed(() => {
  const state = backgroundFetchState.value
  if (!state) return '状态未知'
  if (state?.runtime === 'tauri') return '桌面前台轮询（已启用）'
  if (!state?.supported) return state?.reason || '当前环境不支持'
  if (state?.available) return '可用'
  if (state?.configured) return '已配置（待系统调度）'
  return '未配置'
})

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
  try {
    backgroundFetchState.value = await getBackgroundFetchRuntimeState()
  } catch {
    backgroundFetchState.value = null
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
  if (currentRuntime.value === 'capacitor') {
    const keepAlive = await platformBridge.setAggressiveKeepAlive(enableBackground.value)
    aggressiveKeepAliveSupported.value = !!keepAlive?.supported
    backgroundLockEnabled.value = !!keepAlive?.active
    backgroundLockSource.value = String(keepAlive?.source || '')
    keepAliveReason.value = String(keepAlive?.reason || '')
    if (enableBackground.value && isAndroid()) {
      showBatteryPrompt.value = true
    }
    if (enableBackground.value && !isAndroid() && currentRuntime.value === 'capacitor') {
      statusMessage.value = 'iOS 后台任务由系统自动调度，前台服务保活不可用。请确保已授予通知权限。'
    }
    await refreshRuntimeStates()
    return
  }

  if (isTauriRuntime()) {
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

  if (enableBackground.value && currentRuntime.value === 'capacitor') {
    const keepAlive = await platformBridge.setAggressiveKeepAlive(true)
    aggressiveKeepAliveSupported.value = !!keepAlive?.supported
    backgroundLockEnabled.value = !!keepAlive?.active
    backgroundLockSource.value = String(keepAlive?.source || '')
    keepAliveReason.value = String(keepAlive?.reason || '')
  } else if (enableBackground.value && isTauriRuntime()) {
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
        <span class="header-title">HBUT 校园助手</span>
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

      <!-- Background Status -->
      <div class="status-row" v-if="enableBackground">
        <span class="status-pill soft">保活：{{ backgroundLockStatusText }}</span>
        <span class="status-pill soft">调度：{{ backgroundFetchStatusText }}</span>
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
<style scoped>
/* ===== New Design System Styles ===== */
.notification-view {
  min-height: 100%;
  color: var(--md-sys-color-on-background, #171c1f);
  background: var(--md-sys-color-background, #f6fafe);
  max-width: 448px;
  margin: 0 auto;
  width: 100%;
  padding-bottom: 6rem;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}

.notify-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Permission Card */
.permission-card {
  background: var(--md-sys-color-primary-fixed, #d8e2ff);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(173, 198, 255, 0.3);
}

.permission-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.permission-icon-circle {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  background: rgba(0, 88, 190, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--md-sys-color-primary, #0058be);
}

.permission-info h2 {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--md-sys-color-on-primary-fixed-variant, #004395);
  margin: 0;
}

.permission-info p {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin: 0;
}

.permission-manage-btn {
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  background: var(--md-sys-color-primary, #0058be);
  color: var(--md-sys-color-on-primary, #ffffff);
  border: none;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

/* Section Heading */
.section-heading {
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

/* Notification Types Grid */
.notify-types-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.notify-types-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  position: relative;
}

.notify-type-card {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.notify-type-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.notify-type-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notify-type-icon .material-symbols-outlined {
  font-size: 20px;
}

.icon-accent {
  background: rgba(91, 134, 229, 0.1);
  color: #5b86e5;
}

.icon-orange {
  background: rgba(249, 115, 22, 0.1);
  color: #f97316;
}

.icon-teal {
  background: rgba(20, 184, 166, 0.1);
  color: #14b8a6;
}

.icon-sky {
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
}

.icon-indigo {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.notify-type-body h4 {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

.notify-type-body p {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin: 0;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.toggle-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  display: block;
  width: 2.5rem;
  height: 1.5rem;
  background: var(--md-sys-color-surface-variant, #dfe3e7);
  border-radius: 9999px;
  position: relative;
  transition: background 0.2s;
}

.toggle-track::after {
  content: '';
  position: absolute;
  width: 1rem;
  height: 1rem;
  background: #ffffff;
  border-radius: 9999px;
  top: 0.25rem;
  left: 0.25rem;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.toggle-switch input:checked + .toggle-track {
  background: var(--md-sys-color-primary, #0058be);
}

.toggle-switch input:checked + .toggle-track::after {
  transform: translateX(1rem);
}

/* Sync Settings Card */
.sync-settings-card {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.sync-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.sync-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sync-header-left .material-symbols-outlined {
  color: var(--md-sys-color-outline, #727785);
}

.sync-title {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

.sync-interval-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 2rem;
  border-top: 1px solid var(--md-sys-color-surface-variant, #dfe3e7);
  padding-top: 0.75rem;
}

.sync-interval-label {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

.sync-interval-select {
  background: var(--md-sys-color-surface-container, #eaeef2);
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  border: none;
  color: var(--md-sys-color-on-surface, #171c1f);
  font-size: 12px;
  font-weight: 500;
  outline: none;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 0.75rem;
}

.action-btn {
  flex: 1;
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.secondary {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border: 1px solid var(--md-sys-color-outline-variant, #c2c6d6);
  color: var(--md-sys-color-primary, #0058be);
}

.action-btn.secondary:hover {
  background: var(--md-sys-color-surface-container-low, #f0f4f8);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Recent Section */
.recent-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.recent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.25rem;
}

.recent-time {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

/* Notification Message Cards */
.notify-message-card {
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  border: 1px solid transparent;
  cursor: pointer;
  transition: transform 0.2s;
}

.notify-message-card:active {
  transform: scale(0.98);
}

.notify-message-card.unread {
  border-left: 4px solid #5b86e5;
}

.notify-msg-left {
  display: flex;
  gap: 0.75rem;
}

.notify-msg-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.notify-msg-body {
  flex: 1;
}

.notify-msg-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.25rem;
}

.notify-msg-title {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #171c1f);
  margin: 0;
}

.notify-msg-time {
  font-size: 10px;
  line-height: 14px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

.notify-msg-text {
  font-size: 14px;
  line-height: 20px;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notify-end-hint {
  text-align: center;
  padding: 0.5rem 0 1.5rem;
  font-size: 12px;
  color: rgba(66, 71, 84, 0.6);
}

/* Notification Detail Lists */
.notify-detail-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.notify-detail-list li {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.375rem 0.5rem;
  background: var(--md-sys-color-surface-container-low, #f0f4f8);
  border-radius: 0.5rem;
  font-size: 13px;
  overflow: hidden;
}

.detail-main {
  flex: 1;
  min-width: 0;
  color: var(--md-sys-color-on-surface, #171c1f);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-urgent {
  display: inline-block;
  margin-left: 0.25rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  font-size: 10px;
  font-weight: 700;
}

.detail-badges {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
  flex-wrap: wrap;
  max-width: 50%;
  justify-content: flex-end;
}

.detail-sub {
  display: flex;
  gap: 0.5rem;
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant, #424754);
  margin-top: 0.125rem;
}

.detail-row {
  flex-direction: row !important;
  justify-content: space-between;
  align-items: center;
}

.detail-row .detail-sub {
  margin-top: 0;
}

.detail-score {
  font-weight: 700;
  color: var(--md-sys-color-primary, #0058be);
}

.detail-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--md-sys-color-surface-container, #eaeef2);
  color: var(--md-sys-color-on-surface-variant, #424754);
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.detail-badge.highlight {
  background: rgba(0, 88, 190, 0.1);
  color: var(--md-sys-color-primary, #0058be);
  font-weight: 700;
}

.notify-detail-kv {
  margin-top: 0.375rem;
  display: flex;
  gap: 0.75rem;
}

.kv-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant, #424754);
}

.mini-icon {
  font-size: 14px;
}

.notify-msg-title.bold {
  font-weight: 700;
}

/* Layout Edit Bar */
.layout-edit-bar {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  padding: 0.75rem 0;
}

.layout-edit-btn {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--md-sys-color-outline-variant, #c2c6d6);
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  color: var(--md-sys-color-on-surface, #171c1f);
  font-size: 13px;
  cursor: pointer;
}

.layout-edit-btn.primary {
  background: var(--md-sys-color-primary, #0058be);
  color: #ffffff;
  border-color: transparent;
}

/* Material Symbols */
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.material-symbols-outlined.fill {
  font-variation-settings: 'FILL' 1;
}

/* ===== Legacy Styles (kept for header and status) ===== */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  height: 4rem;
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(246, 250, 254, 0.9);
  backdrop-filter: blur(12px);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 50%;
}

.header-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.header-pill {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-primary, #2563eb);
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
  padding: 6px 16px;
  border-radius: 9999px;
}

.notification-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.layout-btn {
  min-width: 68px;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 62%, #fff 38%);
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
}

.layout-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px color-mix(in oklab, var(--ui-primary) 14%, transparent);
}

.layout-btn.active {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
}

.hero-card,
.setting-card,
.info-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  box-shadow: var(--ui-shadow-soft);
}

.hero-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.hero-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.setting-card {
  padding: 2px 16px 12px;
  margin-bottom: 12px;
}

.setting-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid color-mix(in oklab, var(--ui-primary) 10%, rgba(148, 163, 184, 0.35));
}

.setting-item:last-of-type {
  border-bottom: none;
}

.setting-label h3 {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--ui-text);
}

.setting-label {
  min-width: 0;
}

.setting-label p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-muted);
  word-break: break-word;
}

.status-row {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, transparent);
}

.status-pill.soft {
  color: var(--ui-muted);
  background: color-mix(in oklab, var(--ui-primary-soft) 48%, #fff 52%);
}

.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 28px;
  flex: 0 0 auto;
  justify-self: end;
  align-self: center;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.42));
  transition: 0.3s;
}

.slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: 0.3s;
}

input:checked + .slider {
  background-color: var(--ui-primary);
}

input:checked + .slider:before {
  transform: translateX(22px);
}

.slider.round {
  border-radius: 34px;
}

.slider.round:before {
  border-radius: 50%;
}

.select-input {
  justify-self: end;
  width: min(56vw, 320px);
  max-width: 100%;
  min-width: 168px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 16%, rgba(148, 163, 184, 0.4));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  color: var(--ui-text);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.notification-layout {
  position: relative;
  display: grid;
  gap: 12px;
  margin-top: 2px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.notification-layout :deep(*) {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.notification-layout-toolbar {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 22px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 16%, transparent);
  background:
    linear-gradient(160deg, color-mix(in oklab, var(--ui-primary-soft) 62%, rgba(255, 255, 255, 0.76) 38%), rgba(255, 255, 255, 0.74)),
    radial-gradient(circle at top right, color-mix(in oklab, var(--ui-primary) 14%, transparent), transparent 54%);
  box-shadow:
    0 24px 60px rgba(15, 23, 42, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.notification-layout-toolbar--floating {
  position: sticky;
  top: 84px;
  z-index: 14;
}

.notification-layout-toolbar__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notification-layout-toolbar__copy strong {
  color: var(--ui-text);
  font-size: 15px;
}

.notification-layout-toolbar__copy span {
  color: var(--ui-muted);
  font-size: 12px;
  line-height: 1.6;
}

.notification-layout-toolbar__eyebrow {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ui-primary);
  background: color-mix(in oklab, var(--ui-primary-soft) 68%, #fff 32%);
}

.notification-layout-toolbar__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.notification-layout-toolbar__meta span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text);
  background: rgba(255, 255, 255, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.48);
}

.notification-layout-toolbar__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-btn {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, transparent);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
}

.toolbar-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px color-mix(in oklab, var(--ui-primary) 14%, transparent);
}

.toolbar-btn.ghost {
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-primary-soft) 46%, #fff 54%);
}

.toolbar-btn.primary {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
}

.info-grid.editing {
  padding-bottom: 96px;
}

.info-card {
  --drag-translate-x: 0px;
  --drag-translate-y: 0px;
  padding: 16px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.26s ease,
    filter 0.26s ease,
    opacity 0.26s ease;
  will-change: transform, box-shadow, filter;
}

.info-card.editing {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(244, 248, 255, 0.74));
  border-color: color-mix(in oklab, var(--ui-primary) 12%, rgba(148, 163, 184, 0.3));
  box-shadow:
    0 18px 34px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.44);
}

.info-card.editing:not(.dragging) {
  animation: notification-card-float 2.6s ease-in-out infinite;
}

.info-card.dragging {
  z-index: 5;
  cursor: grabbing;
  pointer-events: none;
  transform:
    translate3d(var(--drag-translate-x), var(--drag-translate-y), 0)
    scale(1.04)
    rotate(0.5deg);
  box-shadow:
    0 24px 42px rgba(15, 23, 42, 0.18),
    0 0 0 1px color-mix(in oklab, var(--ui-primary) 16%, transparent);
  filter: saturate(1.05) brightness(1.02);
}

.info-card.dragging::after {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: inherit;
  background:
    linear-gradient(112deg, transparent 8%, rgba(255, 255, 255, 0.18) 34%, transparent 60%);
  pointer-events: none;
  animation: notification-drag-sheen 1s linear infinite;
}

.info-card.drop-target,
.info-card--over {
  box-shadow:
    0 22px 38px color-mix(in oklab, var(--ui-primary) 14%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  border-color: color-mix(in oklab, var(--ui-primary) 30%, transparent);
  transform: translate3d(0, 0, 0) scale(1.02);
  animation: notification-target-pulse 1.04s ease-in-out infinite;
}

.notification-card-move {
  transition:
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease;
}

.info-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.info-card h3 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 800;
}

.drag-hint {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px dashed color-mix(in oklab, var(--ui-primary) 28%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 40%, #fff 60%);
  color: var(--ui-muted);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-muted);
}

.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 12px;
  background: #f9f9ff;
  border-radius: 12px;
  border: 1px solid rgba(195, 198, 215, 0.2);
}

.kv .kv-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kv .kv-label {
  color: var(--ui-muted, #6b7280);
  font-size: 12px;
  font-weight: 500;
}

.kv-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kv-icon .material-symbols-outlined {
  font-size: 18px;
}

.kv-icon--red { background: #fee2e2; color: #ef4444; }
.kv-icon--green { background: #dcfce7; color: #16a34a; }
.kv-icon--yellow { background: #fef9c3; color: #ca8a04; }
.kv-icon--blue { background: #dbeafe; color: #3b82f6; }
.kv-icon--emerald { background: #d1fae5; color: #059669; }

.kv strong {
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 600;
}

.kv strong.low {
  color: #dc2626;
  font-weight: 700;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.list li {
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 12%, rgba(148, 163, 184, 0.25));
  background: color-mix(in oklab, var(--ui-primary-soft) 20%, #fff 80%);
  padding: 9px 10px;
  display: grid;
  gap: 3px;
}

.item-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
}

.item-sub {
  font-size: 12px;
  color: var(--ui-muted);
}

.item-sub-capsules {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.mini-capsule {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.mini-capsule .mini-icon {
  font-size: 14px;
}

.mc-date {
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.mc-time {
  background: rgba(168, 85, 247, 0.08);
  color: #7c3aed;
  border: 1px solid rgba(168, 85, 247, 0.15);
}

.mc-location {
  background: rgba(16, 185, 129, 0.08);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.mc-seat {
  background: rgba(245, 158, 11, 0.08);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.15);
}

.tag {
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-danger) 15%, #fff 85%);
  color: var(--ui-danger);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 35%, transparent);
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
}

.tag-urgent {
  animation: pulse-tag 2s infinite;
}

@keyframes pulse-tag {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--ui-muted);
}

.btn-primary,
.btn-secondary {
  border: none;
  border-radius: 10px;
  min-height: 36px;
  padding: 0 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: filter 0.2s ease;
}

.btn-primary {
  color: #fff;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
}

.btn-secondary {
  color: var(--ui-primary);
  background: var(--ui-primary-soft);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 25%, transparent);
}

.btn-mini {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  border-radius: 999px;
}

.btn-primary:hover,
.btn-secondary:hover {
  filter: brightness(1.04);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-msg {
  margin: 12px 0 0;
  color: color-mix(in oklab, var(--ui-primary) 82%, #111827 18%);
  font-size: 13px;
}

.status-err {
  margin: 6px 0 0;
  color: #dc2626;
  font-size: 12px;
  word-break: break-all;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: var(--ui-surface);
  width: 85%;
  max-width: 320px;
  padding: 20px;
  border-radius: 16px;
  box-shadow: var(--ui-shadow-strong);
  border: 1px solid var(--ui-surface-border);
}

.modal-card h3 {
  margin: 0 0 8px;
}

.modal-card p {
  margin: 0;
  color: var(--ui-muted);
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.btn-text {
  background: none;
  border: none;
  color: var(--ui-muted);
  cursor: pointer;
  font-weight: 700;
}

@keyframes notification-card-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -4px, 0);
  }
}

@keyframes notification-drag-sheen {
  0% {
    transform: translate3d(-30%, 0, 0);
    opacity: 0;
  }
  20% {
    opacity: 0.72;
  }
  100% {
    transform: translate3d(30%, 0, 0);
    opacity: 0;
  }
}

@keyframes notification-target-pulse {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1.02);
  }
  50% {
    transform: translate3d(0, -2px, 0) scale(1.03);
  }
}

@media (max-width: 980px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .notification-layout-toolbar {
    padding: 14px 14px 16px;
  }

  .notification-layout-toolbar__actions {
    width: 100%;
  }

  .toolbar-btn {
    flex: 1 1 0;
  }

  .hero-actions {
    flex-direction: column;
  }

  .hero-actions .btn-primary,
  .hero-actions .btn-secondary {
    width: 100%;
  }

  .info-card-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .notification-header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .layout-btn {
    min-width: 60px;
    padding: 0 12px;
  }

  .info-grid.editing {
    padding-bottom: 128px;
  }
}

@media (max-width: 480px) {
  .notification-view {
    padding-left: 12px;
    padding-right: 12px;
  }

  .info-grid.editing {
    padding-bottom: 150px;
  }
}
</style>
