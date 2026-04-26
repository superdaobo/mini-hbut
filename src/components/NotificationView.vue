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
const classSummary = computed(() => snapshot.value?.classReminder || {})
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
    exams: { key: 'exams' }
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
    exams: ['#ef4444', '#fda4af', '#fbbf24']
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
  await updatePermissionState(true)
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
    statusMessage.value = '已完成一次实时检查。'
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
    const granted = await updatePermissionState(true)
    if (!granted) {
      statusMessage.value = '通知权限未授权，测试通知未发送。'
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
      <div class="brand">
        <img class="logo-img" src="/splash/app_icon.png" alt="HBUT" />
        <span class="title">HBUT 校园助手</span>
        <span class="page-tag">通知</span>
      </div>
      <div class="notification-header-actions">
        <button
          class="layout-btn"
          :class="{ active: isNotificationLayoutEditing }"
          @click="enterNotificationLayoutEdit"
          :title="isNotificationLayoutEditing ? '正在编辑通知布局' : '配置通知布局'"
        >
          {{ isNotificationLayoutEditing ? '编辑中' : '配置' }}
        </button>
      </div>
    </header>

    <section class="hero-card">
      <div class="hero-left">
        <span class="status-pill">通知权限：{{ permissionLabel }}</span>
        <span class="status-pill soft">最近检测：{{ lastCheckText }}</span>
        <span class="status-pill soft">运行环境：{{ runtimeDisplayText }}</span>
      </div>
      <div class="hero-actions">
        <button class="btn-primary" @click="handleRequestPermission">请求通知权限</button>
        <button class="btn-secondary" :disabled="checking" @click="runManualCheck">
          {{ checking ? '检查中...' : '立即检查一次' }}
        </button>
        <button class="btn-secondary" :disabled="sending" @click="handleTestNotification">
          {{ sending ? '发送中...' : '发送测试通知' }}
        </button>
      </div>
    </section>

    <section class="setting-card">
      <div class="setting-item">
        <div class="setting-label">
          <h3>后台自动检查</h3>
          <p>定时静默刷新课表/成绩，并检查考试与电费状态。</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableBackground" @change="handleBackgroundToggle">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>成绩更新通知</h3>
          <p>检测到成绩变化时发送通知。</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableGradeNotices" @change="handleOtherSettingChange">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>考试提醒</h3>
          <p>如果明天有考试，自动发送提醒通知。</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableExamReminders" @change="handleOtherSettingChange">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>电费低电通知</h3>
          <p>电费实时请求，低于 10 度时通知；每次打开应用只提醒一次。</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enablePowerNotices" @change="handleOtherSettingChange">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>上课提醒</h3>
          <p>根据当日课表，在开课前指定分钟推送通知。</p>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="enableClassReminders" @change="handleOtherSettingChange">
          <span class="slider round"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>上课提醒提前时间（分钟）</h3>
        </div>
        <IOSSelect
          v-model.number="classLeadMinutes"
          @change="handleClassLeadChange"
          class="select-input"
          :disabled="!enableClassReminders"
        >
          <option :value="5">5 分钟</option>
          <option :value="10">10 分钟</option>
          <option :value="15">15 分钟</option>
          <option :value="20">20 分钟</option>
          <option :value="30">30 分钟（默认）</option>
          <option :value="45">45 分钟</option>
          <option :value="60">60 分钟</option>
        </IOSSelect>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <h3>检查频率（分钟）</h3>
        </div>
        <IOSSelect v-model="checkInterval" @change="handleIntervalChange" class="select-input">
          <option :value="15">15 分钟</option>
          <option :value="30">30 分钟（默认）</option>
          <option :value="60">60 分钟</option>
        </IOSSelect>
      </div>

      <div class="status-row" v-if="enableBackground">
        <span class="status-pill soft">
          保活状态：{{ backgroundLockStatusText }}
        </span>
        <span class="status-pill soft">后台调度：{{ backgroundFetchStatusText }}</span>
        <span class="status-pill soft">激进保活：{{ keepAliveStatusText }}</span>
        <span class="status-pill soft" v-if="backgroundFetchState?.lastRunAt">
          最近后台触发：{{ formatRelativeTime(backgroundFetchState.lastRunAt) }}
        </span>
        <span class="status-pill soft" v-if="backgroundFetchState?.lastError">
          调度错误：{{ backgroundFetchState.lastError }}
        </span>
        <button
          v-if="currentRuntime === 'capacitor'"
          type="button"
          class="btn-secondary btn-mini"
          @click="openSystemPermissionSettings"
        >
          系统权限入口
        </button>
      </div>
    </section>

    <section
      ref="notificationLayoutRef"
      class="notification-layout"
      @pointerdown.passive="handleInfoGridPressStart"
      @pointermove.passive="handleInfoGridPressMove"
      @pointerup.passive="handleInfoGridPressEnd"
      @pointercancel.passive="handleInfoGridPressEnd"
      @pointerleave.passive="handleInfoGridPressEnd"
    >
      <LayoutCollisionFxLayer :items="notificationCollisionFx" />
      <div
        v-if="isNotificationLayoutEditing"
        class="notification-layout-toolbar notification-layout-toolbar--floating"
      >
        <div class="notification-layout-toolbar__copy">
          <span class="notification-layout-toolbar__eyebrow">Workspace Edit</span>
          <strong>通知布局编辑</strong>
          <span>直接拖动卡片上下换位，点击“完成”后才会保存。</span>
        </div>
        <div class="notification-layout-toolbar__meta">
          <span>{{ draftNotificationCardsOrder.length }} 张卡片</span>
          <span>草稿态未提交</span>
        </div>
        <div class="notification-layout-toolbar__actions">
          <button type="button" class="toolbar-btn ghost" @click="cancelNotificationLayoutEdit">取消</button>
          <button type="button" class="toolbar-btn ghost" @click="resetNotificationLayoutEdit">恢复默认</button>
          <button type="button" class="toolbar-btn primary" @click="saveNotificationLayoutEdit">完成</button>
        </div>
      </div>

      <TransitionGroup name="notification-card" tag="div" class="info-grid" :class="{ editing: isNotificationLayoutEditing }">
        <SortableSurface
          v-for="card in orderedInfoCards"
          :key="card.key"
          :id="card.key"
          group="notification-cards"
          section="notifications"
          :editing="isNotificationLayoutEditing"
          :surface-class="[
            'info-card',
            {
              'electricity-card': card.key === 'electricity',
              'info-card--over': hoverNotificationKey === card.key && draggingNotificationKey !== card.key
            }
          ]"
          @drag-start="handleNotificationDragStart"
          @drag-move="handleNotificationDragMove"
          @drag-end="stopNotificationLayoutDrag"
        >
          <template v-if="card.key === 'class_reminder'">
            <div class="info-card-head">
              <h3>上课提醒</h3>
              <span class="drag-hint">{{ isNotificationLayoutEditing ? '拖动换位' : '长按进入编辑' }}</span>
            </div>
            <p class="hint">{{ classReminderText }}</p>
            <div class="kv">
              <span>提醒提前</span>
              <strong>{{ classLeadMinutes }} 分钟</strong>
            </div>
            <div class="kv">
              <span>下一门课</span>
              <strong>{{ nextClassText }}</strong>
            </div>
          </template>

          <template v-else-if="card.key === 'electricity'">
            <h3>电费监控</h3>
            <p class="hint">监控房间：{{ selectedRoomLabel }}</p>
            <template v-if="powerSummary?.isDual">
              <div class="kv">
                <span>💡 照明电量</span>
                <strong :class="{ low: Number(powerSummary?.quantity) < 10 }">{{ powerQuantityText }}</strong>
              </div>
              <div class="kv">
                <span>❄️ 空调电量</span>
                <strong :class="{ low: Number(powerSummary?.acQuantity) < 10 }">{{ acPowerQuantityText }}</strong>
              </div>
            </template>
            <template v-else>
              <div class="kv">
                <span>剩余电量</span>
                <strong :class="{ low: powerSummary?.isLow }">{{ powerQuantityText }}</strong>
              </div>
            </template>
            <div class="kv">
              <span>状态</span>
              <strong>{{ powerStatusText }}</strong>
            </div>
          </template>

          <template v-else-if="card.key === 'grades'">
            <h3>成绩动态</h3>
            <p class="hint">总成绩：{{ gradeSummary?.total || 0 }} 条 · 本次是否变化：{{ gradeSummary?.changed ? '是' : '否' }}</p>
            <ul class="list" v-if="gradeItems.length">
              <li v-for="(item, idx) in gradeItems" :key="`${item.course_name}-${item.term}-${idx}`">
                <span class="item-main">{{ item.course_name || '-' }}</span>
                <span class="item-sub">{{ item.term || '未知学期' }} · {{ item.final_score || '-' }}</span>
              </li>
            </ul>
            <p v-else class="empty">暂无成绩摘要</p>
          </template>

          <template v-else>
            <h3>考试列表</h3>
            <p class="hint">近期考试：{{ examSummary?.upcoming?.length || 0 }} 门 · 明日考试：{{ examSummary?.tomorrowCount || 0 }} 门</p>
            <ul class="list" v-if="examItems.length">
              <li v-for="(item, idx) in examItems" :key="`${item.course_name}-${item.exam_date}-${idx}`">
                <span class="item-main">
                  {{ item.course_name || '-' }}
                  <small v-if="item.is_tomorrow" class="tag">明日</small>
                </span>
                <span class="item-sub">
                  {{ item.exam_date || '日期待定' }} {{ item.exam_time || '' }} · {{ item.location || '地点待定' }}
                </span>
              </li>
            </ul>
            <p v-else class="empty">暂无考试安排</p>
          </template>
        </SortableSurface>
      </TransitionGroup>
    </section>

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
.notification-view {
  min-height: 100%;
  padding: 18px 14px 120px;
  color: var(--ui-text);
  background: var(--ui-bg-gradient);
}

.logo-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
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
  padding: 14px;
  position: relative;
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
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 8px 0;
}

.kv span {
  color: var(--ui-muted);
  font-size: 12px;
}

.kv strong {
  color: var(--ui-text);
  font-size: 14px;
}

.kv strong.low {
  color: #dc2626;
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

.tag {
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-danger) 15%, #fff 85%);
  color: var(--ui-danger);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 35%, transparent);
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
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
