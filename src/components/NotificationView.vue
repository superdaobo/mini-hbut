<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import hbutLogo from '../assets/hbut-logo.png'
import { enableBackgroundPowerLock, disableBackgroundPowerLock } from '../utils/power_guard'
import { invokeNative as invoke, isTauriRuntime } from '../platform/native'
import { getRuntime, platformBridge } from '../platform'
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
const backgroundFetchState = ref(null)

const permissionState = ref('unknown')
const statusMessage = ref('')
const lastError = ref('')
const sending = ref(false)
const checking = ref(false)
const snapshot = ref(null)
const dormData = ref([])
const selectedPath = ref([])
const currentRuntime = getRuntime()

const resolveRuntimeDisplay = () => {
  const ua = String(navigator.userAgent || '')
  const isAndroidUA = /Android/i.test(ua)
  const isIosUA = /iPhone|iPad|iPod/i.test(ua)
  const platformText = isAndroidUA ? 'Android' : (isIosUA ? 'iOS' : '未知平台')
  if (currentRuntime === 'capacitor') return `${platformText} / Capacitor`
  if (currentRuntime === 'tauri') return '桌面端 / Tauri'
  return '浏览器 / Web'
}
const runtimeDisplayText = resolveRuntimeDisplay()

const isAndroid = () => /Android/i.test(navigator.userAgent)

const isAclDeniedError = (err) => {
  const text = String(err || '')
  return text.includes('not allowed by ACL') || text.includes('plugin:notification')
}

const readLocalDormSelection = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('last_dorm_selection') || '[]')
    if (!Array.isArray(parsed) || parsed.length !== 4) return []
    return parsed.map((item) => String(item || '').trim()).filter(Boolean)
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

const powerBalanceText = computed(() => {
  const balance = Number(powerSummary.value?.balance)
  if (!Number.isFinite(balance)) return '--'
  return `¥${balance.toFixed(2)}`
})

const powerStatusText = computed(() => {
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
  if (!state?.supported) return '当前环境不支持'
  if (state?.available) return '可用'
  if (state?.configured) return '已配置（待系统调度）'
  return '未配置'
})

const keepAliveStatusText = computed(() => {
  if (!aggressiveKeepAliveSupported.value) return '未启用'
  return backgroundLockEnabled.value ? '已运行' : '未运行'
})

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
    if (currentRuntime === 'web') {
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
  } catch {
    aggressiveKeepAliveSupported.value = false
  }
}

const handleBackgroundToggle = async () => {
  saveSettings()
  if (currentRuntime === 'capacitor' && isAndroid()) {
    const keepAlive = await platformBridge.setAggressiveKeepAlive(enableBackground.value)
    aggressiveKeepAliveSupported.value = !!keepAlive?.supported
    backgroundLockEnabled.value = !!keepAlive?.active
    backgroundLockSource.value = String(keepAlive?.source || '')
    if (enableBackground.value) {
      showBatteryPrompt.value = true
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
  platformBridge.openBatteryOptimizationSettings().catch(() => {})
}

const cancelBatterySettings = () => {
  showBatteryPrompt.value = false
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
      if (!ok && currentRuntime === 'capacitor') {
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
  updateSettingsFromStorage()
  selectedPath.value = readLocalDormSelection()
  snapshot.value = getLastNotifySnapshot(props.studentId) || null

  try {
    const res = await axios.get('/dormitory_data.json')
    dormData.value = Array.isArray(res?.data) ? res.data : []
  } catch {
    dormData.value = []
  }

  await updatePermissionState(false)
  await ensureAndroidChannel()
  await refreshRuntimeStates()

  if (enableBackground.value && currentRuntime === 'capacitor' && isAndroid()) {
    const keepAlive = await platformBridge.setAggressiveKeepAlive(true)
    aggressiveKeepAliveSupported.value = !!keepAlive?.supported
    backgroundLockEnabled.value = !!keepAlive?.active
    backgroundLockSource.value = String(keepAlive?.source || '')
  } else if (enableBackground.value && isTauriRuntime()) {
    const result = await enableBackgroundPowerLock()
    backgroundLockEnabled.value = result.enabled
    backgroundLockSource.value = result.source.join(' + ')
  }

  window.addEventListener(NOTIFY_SNAPSHOT_EVENT, handleSnapshotEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener(NOTIFY_SNAPSHOT_EVENT, handleSnapshotEvent)
})
</script>

<template>
  <div class="notification-view fade-in">
    <header class="dashboard-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <span class="title">HBUT 校园助手</span>
        <span class="page-tag">通知</span>
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
          保活状态：{{ backgroundLockEnabled ? ('已启用（' + (backgroundLockSource || '插件') + '）') : '未启用（当前平台不支持或插件不可用）' }}
        </span>
        <span class="status-pill soft">后台调度：{{ backgroundFetchStatusText }}</span>
        <span class="status-pill soft">激进保活：{{ keepAliveStatusText }}</span>
        <span class="status-pill soft" v-if="backgroundFetchState?.lastRunAt">
          最近后台触发：{{ formatRelativeTime(backgroundFetchState.lastRunAt) }}
        </span>
        <span class="status-pill soft" v-if="backgroundFetchState?.lastError">
          调度错误：{{ backgroundFetchState.lastError }}
        </span>
      </div>
    </section>

    <section class="info-grid">
      <article class="info-card">
        <h3>上课提醒</h3>
        <p class="hint">{{ classReminderText }}</p>
        <div class="kv">
          <span>提醒提前</span>
          <strong>{{ classLeadMinutes }} 分钟</strong>
        </div>
        <div class="kv">
          <span>下一门课</span>
          <strong>{{ nextClassText }}</strong>
        </div>
      </article>

      <article class="info-card electricity-card">
        <h3>电费监控</h3>
        <p class="hint">监控房间：{{ selectedRoomLabel }}</p>
        <div class="kv">
          <span>剩余电量</span>
          <strong :class="{ low: powerSummary?.isLow }">{{ powerQuantityText }}</strong>
        </div>
        <div class="kv">
          <span>账户余额</span>
          <strong>{{ powerBalanceText }}</strong>
        </div>
        <div class="kv">
          <span>状态</span>
          <strong>{{ powerStatusText }}</strong>
        </div>
      </article>

      <article class="info-card">
        <h3>成绩动态</h3>
        <p class="hint">总成绩：{{ gradeSummary?.total || 0 }} 条 · 本次是否变化：{{ gradeSummary?.changed ? '是' : '否' }}</p>
        <ul class="list" v-if="gradeItems.length">
          <li v-for="(item, idx) in gradeItems" :key="`${item.course_name}-${item.term}-${idx}`">
            <span class="item-main">{{ item.course_name || '-' }}</span>
            <span class="item-sub">{{ item.term || '未知学期' }} · {{ item.final_score || '-' }}</span>
          </li>
        </ul>
        <p v-else class="empty">暂无成绩摘要</p>
      </article>

      <article class="info-card">
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
      </article>
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

.info-card {
  padding: 14px;
}

.info-card h3 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 800;
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

@media (max-width: 980px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .hero-actions {
    flex-direction: column;
  }

  .hero-actions .btn-primary,
  .hero-actions .btn-secondary {
    width: 100%;
  }
}
</style>
