<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import axios from 'axios'
import hbutLogo from '../assets/hbut-logo.png'
import { fetchRemoteConfig, applyOcrRuntimeConfig, getStoredOcrConfig } from '../utils/remote_config.js'
import { invokeNative as invoke, isTauriRuntime } from '../platform/native'
import { pushDebugLog } from '../utils/debug_logger'

const props = defineProps({
  loginMode: { type: String, default: 'portal' }
})

const emit = defineEmits(['success', 'switchMode', 'showLegal'])

const LOGIN_METHOD_KEY = 'hbu_login_method'
const LOGIN_MODE_PREF_KEY = 'hbu_login_entry_mode'
const LOGIN_TEMP_FLAG_KEY = 'hbu_login_temporary'
const LOGOUT_REASON_KEY = 'hbu_logout_reason'
const TEMP_SESSION_EXPIRED_REASON = 'temp_session_expired'
const CHAOXING_ACCOUNT_KEY = 'hbu_cx_account'
const CHAOXING_PASSWORD_KEY = 'hbu_cx_password'
const CHAOXING_REMEMBER_KEY = 'hbu_cx_remember'

const LOGIN_MODES = [
  {
    key: 'portal',
    title: '新融合门户',
    desc: '账号密码 + 扫码临时登录'
  },
  {
    key: 'chaoxing',
    title: '学习通（功能受限）',
    desc: '账号密码 + 扫码临时登录'
  }
]

const normalizeModeKey = (mode) => {
  const raw = String(mode || '').trim()
  if (!raw) return ''
  if (raw === 'portal' || raw.startsWith('portal_')) return 'portal'
  if (raw === 'chaoxing' || raw.startsWith('chaoxing_')) return 'chaoxing'
  return raw
}

const isKnownMode = (mode) => LOGIN_MODES.some((item) => item.key === mode)
const resolveInitialMode = () => {
  const fromProp = normalizeModeKey(props.loginMode)
  if (isKnownMode(fromProp)) return fromProp
  const fromStorage = normalizeModeKey(localStorage.getItem(LOGIN_MODE_PREF_KEY))
  if (isKnownMode(fromStorage)) return fromStorage
  return 'portal'
}

const activeMode = ref(resolveInitialMode())
const username = ref('')
const password = ref('')
const chaoxingAccount = ref('')
const chaoxingPassword = ref('')
const rememberMe = ref(true)
const agreePolicy = ref(true)
const loading = ref(false)
const statusMsg = ref('')
const ocrConfigMode = ref('本地')
const debugLogs = ref([])
const portalQrVisible = ref(false)
const chaoxingQrVisible = ref(false)

const qrUuid = ref('')
const qrImageBase64 = ref('')
const qrState = ref('idle')
const qrStateMessage = ref('')
const qrSubmitting = ref(false)
const qrExpiresAt = ref(0)
const qrRemainingSeconds = ref(0)
let qrTimer = null
let qrPollingBusy = false

const cxQrUuid = ref('')
const cxQrEnc = ref('')
const cxQrImageBase64 = ref('')
const cxQrState = ref('idle')
const cxQrStateMessage = ref('')
const cxQrSubmitting = ref(false)
const cxQrExpiresAt = ref(0)
const cxQrRemainingSeconds = ref(0)
const cxQrContext = ref(null)
let cxQrTimer = null
let cxQrPollingBusy = false

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const CHAOXING_FORGET_PWD_URL = 'https://passport2.chaoxing.com/pwd/findpwd?version=1&fid=0&flushCookie=true&independentId=0&refer=https%3A%2F%2Fi.chaoxing.com'

let portalQrInitSeq = 0
let chaoxingQrInitSeq = 0

const isPortalMode = computed(() => activeMode.value === 'portal')
const isChaoxingMode = computed(() => activeMode.value === 'chaoxing')
const currentModeMeta = computed(() => LOGIN_MODES.find((item) => item.key === activeMode.value) || LOGIN_MODES[0])
const canSubmitPasswordLogin = computed(() => {
  return Boolean(username.value && password.value && agreePolicy.value && !loading.value)
})
const canSubmitChaoxingPasswordLogin = computed(() => {
  return Boolean(chaoxingAccount.value && chaoxingPassword.value && agreePolicy.value && !loading.value)
})

const isLikelyStudentId = (value) => /^\d{10}$/.test(String(value || '').trim())

const pickStudentIdCandidate = (payload) => {
  if (!payload || typeof payload !== 'object') return ''
  const candidates = [
    payload.student_id,
    payload.studentId,
    payload?.data?.student_id,
    payload?.data?.studentId,
    payload?.data?.xh,
    payload?.xh
  ]
  for (const item of candidates) {
    const sid = String(item || '').trim()
    if (isLikelyStudentId(sid)) {
      return sid
    }
  }
  return ''
}

const resolveChaoxingStudentId = async (payload = null) => {
  const payloadSid = pickStudentIdCandidate(payload)
  if (payloadSid) return payloadSid

  const cachedSid = String(localStorage.getItem('hbu_username') || '').trim()
  if (isLikelyStudentId(cachedSid)) return cachedSid

  if (isTauriRuntime()) {
    try {
      const studentInfo = await invoke('fetch_student_info')
      const infoSid = pickStudentIdCandidate(studentInfo)
      if (infoSid) return infoSid
    } catch (e) {
      pushDebug(`学习通学号解析失败(fetch_student_info): ${e.message || e}`)
    }
  }

  try {
    const res = await axios.post(`${API_BASE}/v2/student_info`)
    const sid = pickStudentIdCandidate(res?.data)
    if (sid) return sid
  } catch (e) {
    pushDebug(`学习通学号解析失败(v2/student_info): ${e.response?.data?.error || e.message || e}`)
  }

  const accountCandidates = [
    String(payload?.account || '').trim(),
    String(chaoxingAccount.value || '').trim()
  ]
  for (const candidate of accountCandidates) {
    if (isLikelyStudentId(candidate)) {
      return candidate
    }
  }
  return ''
}

const applyLoginMethodStorage = (mode) => {
  const isTemp = mode.endsWith('_temp')
  localStorage.setItem(LOGIN_METHOD_KEY, mode)
  localStorage.setItem(LOGIN_TEMP_FLAG_KEY, isTemp ? '1' : '0')
}

const pushDebug = (message) => {
  const text = String(message || '').trim()
  if (!text) return
  const ts = new Date().toLocaleTimeString()
  debugLogs.value = [`[${ts}] ${text}`, ...debugLogs.value].slice(0, 30)
  pushDebugLog('Login', text, 'debug')
}

const pushDebugList = (items) => {
  if (!Array.isArray(items)) return
  items.forEach((item) => pushDebug(item))
}

const clearDebugLogs = () => {
  debugLogs.value = []
}

const isPortalPendingError = (err) => {
  const msg = String(err?.message || err || '').toLowerCase()
  return msg.includes('未完成') || msg.includes('not complete') || msg.includes('等待')
}

const resolveOcrModeLabel = (status, endpoint) => {
  const activeSource = String(status?.active_source || '').trim()
  if (activeSource.includes('fallback') || activeSource.includes('local')) return '本地'
  if (activeSource && activeSource !== 'unknown') return '远程'

  const configured = String(status?.configured_endpoint || '').trim()
  if (configured || endpoint) return '远程'
  if (status?.fallback_used) return '本地'
  return '本地'
}

const refreshOcrMode = async (endpointHint = '') => {
  try {
    const runtime = await invoke('get_ocr_runtime_status')
    ocrConfigMode.value = resolveOcrModeLabel(runtime, endpointHint)
    const activeSource = String(runtime?.active_source || '')
    pushDebugLog(
      'Login',
      `OCR运行态 mode=${ocrConfigMode.value} source=${activeSource || 'unknown'}`,
      'debug'
    )
  } catch {
    ocrConfigMode.value = endpointHint ? '远程' : '本地'
    pushDebugLog('Login', '获取 OCR 运行态失败，使用本地模式显示', 'warn')
  }
}

const ensureOcrEndpointReady = async () => {
  let endpointHint = ''
  try {
    const cfg = await fetchRemoteConfig()
    await applyOcrRuntimeConfig(cfg)
    endpointHint = String(cfg?.ocr?.endpoint || '').trim()
    pushDebugLog('Login', `OCR配置已应用（远程配置）：${endpointHint || '未返回主端点'}`, 'info')
  } catch (e) {
    console.warn('[OCR] 拉取远程配置失败，改用本地 OCR 配置:', e)
    pushDebugLog('Login', 'OCR远程配置拉取失败，切换本地配置', 'warn', e)
    const localCfg = getStoredOcrConfig()
    await applyOcrRuntimeConfig({
      ocr: {
        enabled: true,
        endpoint: localCfg.endpoint,
        endpoints: localCfg.endpoints,
        local_fallback_endpoints: localCfg.local_fallback_endpoints
      }
    })
    endpointHint = localCfg.endpoint
    pushDebugLog('Login', `OCR配置已应用（本地配置）：${endpointHint || '未配置主端点'}`, 'info')
  }
  await refreshOcrMode(endpointHint)
}

const handleOcrConfigUpdated = () => {
  const localCfg = getStoredOcrConfig()
  refreshOcrMode(String(localCfg.endpoint || '').trim())
}

const clearQrTimer = () => {
  if (qrTimer) {
    clearTimeout(qrTimer)
    qrTimer = null
  }
}

const clearCxQrTimer = () => {
  if (cxQrTimer) {
    clearTimeout(cxQrTimer)
    cxQrTimer = null
  }
}

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const normalizeInvokePayload = (raw) => {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return { raw: text }
    }
  }
  return {}
}

const pickText = (payload, keys) => {
  if (!payload || typeof payload !== 'object') return ''
  const containers = [payload, payload.data, payload.result].filter(Boolean)
  for (const container of containers) {
    for (const key of keys) {
      const value = container?.[key]
      if (value === 0) return '0'
      if (value === false) return 'false'
      if (value === null || value === undefined) continue
      const text = String(value).trim()
      if (text) return text
    }
  }
  return ''
}

const normalizeQrImageSource = (raw) => {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.startsWith('data:image/')) return value
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) return value
  return `data:image/png;base64,${value}`
}

const resetQrState = () => {
  clearQrTimer()
  portalQrInitSeq += 1
  qrUuid.value = ''
  qrImageBase64.value = ''
  qrState.value = 'idle'
  qrStateMessage.value = ''
  qrExpiresAt.value = 0
  qrRemainingSeconds.value = 0
  qrSubmitting.value = false
  qrPollingBusy = false
}

const resetCxQrState = () => {
  clearCxQrTimer()
  chaoxingQrInitSeq += 1
  cxQrUuid.value = ''
  cxQrEnc.value = ''
  cxQrImageBase64.value = ''
  cxQrState.value = 'idle'
  cxQrStateMessage.value = ''
  cxQrExpiresAt.value = 0
  cxQrRemainingSeconds.value = 0
  cxQrSubmitting.value = false
  cxQrContext.value = null
  cxQrPollingBusy = false
}

const updateQrCountdown = () => {
  if (!qrExpiresAt.value) {
    qrRemainingSeconds.value = 0
    return
  }
  const remain = Math.max(0, Math.ceil((qrExpiresAt.value - Date.now()) / 1000))
  qrRemainingSeconds.value = remain
  if (remain === 0 && qrState.value !== 'success') {
    qrState.value = 'expired'
    qrStateMessage.value = '二维码已失效，请点击刷新二维码。'
    clearQrTimer()
  }
}

const updateCxQrCountdown = () => {
  if (!cxQrExpiresAt.value) {
    cxQrRemainingSeconds.value = 0
    return
  }
  const remain = Math.max(0, Math.ceil((cxQrExpiresAt.value - Date.now()) / 1000))
  cxQrRemainingSeconds.value = remain
  if (remain === 0 && cxQrState.value !== 'success') {
    cxQrState.value = 'expired'
    cxQrStateMessage.value = '学习通二维码已失效，请点击刷新。'
    clearCxQrTimer()
  }
}

const scheduleQrPoll = () => {
  clearQrTimer()
  qrTimer = setTimeout(() => {
    pollPortalQrStatus().catch((e) => {
      console.warn('[QR] 轮询状态失败:', e)
    })
  }, 1000)
}

const scheduleCxQrPoll = () => {
  clearCxQrTimer()
  cxQrTimer = setTimeout(() => {
    pollChaoxingQrStatus().catch((e) => {
      pushDebug(`学习通二维码轮询异常: ${e.message || e}`)
    })
  }, 1200)
}

const fetchGradesAfterLogin = async (sid) => {
  const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid })
  return res.data
}

const emitSuccessWithGrades = async (sid) => {
  try {
    const gradesData = await fetchGradesAfterLogin(sid)
    if (gradesData?.success) {
      emit('success', gradesData.data || [])
      return
    }
    statusMsg.value = `⚠️ 登录成功，但成绩同步失败：${gradesData?.error || '未知错误'}`
    emit('success', [])
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message || '未知错误'
    statusMsg.value = `⚠️ 登录成功，但成绩同步失败：${errMsg}`
    emit('success', [])
  }
}

const savePortalCredentials = () => {
  if (rememberMe.value) {
    localStorage.setItem('hbu_username', username.value)
    localStorage.setItem('hbu_credentials', password.value)
    localStorage.setItem('hbu_remember', 'true')
  } else {
    localStorage.removeItem('hbu_credentials')
    localStorage.setItem('hbu_remember', 'false')
  }
}

const saveChaoxingCredentials = () => {
  if (rememberMe.value) {
    localStorage.setItem(CHAOXING_ACCOUNT_KEY, chaoxingAccount.value)
    localStorage.setItem(CHAOXING_PASSWORD_KEY, chaoxingPassword.value)
    localStorage.setItem(CHAOXING_REMEMBER_KEY, 'true')
  } else {
    localStorage.removeItem(CHAOXING_PASSWORD_KEY)
    localStorage.setItem(CHAOXING_REMEMBER_KEY, 'false')
  }
}

const handlePasswordLogin = async () => {
  if (!username.value || !password.value) {
    statusMsg.value = '请输入完整的账号和密码'
    return
  }
  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }

  loading.value = true
  statusMsg.value = '🔒 正在登录...'
  await ensureOcrEndpointReady()
  savePortalCredentials()

  try {
    const res = await axios.post(`${API_BASE}/v2/start_login`, {
      username: username.value,
      password: password.value,
      captcha: '',
      lt: '',
      execution: ''
    })
    const result = res.data

    if (!result?.success) {
      statusMsg.value = `❌ ${result?.error || '登录失败'}`
      return
    }

    const sid = String(result?.data?.student_id || username.value || '').trim()
    if (sid) {
      localStorage.setItem('hbu_username', sid)
    }
    applyLoginMethodStorage('portal_password')
    localStorage.removeItem(LOGOUT_REASON_KEY)
    statusMsg.value = '✅ 登录成功，正在同步数据...'
    await emitSuccessWithGrades(sid || username.value)
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message || '未知错误'
    statusMsg.value = `⚠️ 登录失败: ${errMsg}`
  } finally {
    loading.value = false
    await refreshOcrMode(String(getStoredOcrConfig().endpoint || '').trim())
  }
}

const pollPortalQrStatus = async () => {
  if (!qrUuid.value || !isPortalMode.value || !portalQrVisible.value) return
  if (qrSubmitting.value || qrPollingBusy) return

  updateQrCountdown()
  if (qrState.value === 'expired') return

  qrPollingBusy = true
  try {
    const payload = await invoke('portal_qr_check_status', { uuid: qrUuid.value })
    const code = String(payload?.status_code || '').trim()

    if (code === '1') {
      qrState.value = 'confirming'
      qrStateMessage.value = '扫码确认成功，正在提交登录...'
      await confirmPortalQrLogin()
      return
    }
    if (code === '2') {
      qrState.value = 'scanned'
      qrStateMessage.value = '已扫码，正在确认登录状态...'
      const submitted = await confirmPortalQrLogin({ allowPending: true })
      if (submitted) return
    } else if (code === '3') {
      qrState.value = 'expired'
      qrStateMessage.value = '二维码已失效，请点击刷新二维码。'
      clearQrTimer()
      return
    } else {
      qrState.value = 'waiting'
      qrStateMessage.value = '等待扫码中...'
    }
  } catch (e) {
    qrState.value = 'error'
    qrStateMessage.value = `二维码状态查询失败：${e.message || e}`
  } finally {
    qrPollingBusy = false
  }

  updateQrCountdown()
  if (qrState.value !== 'expired' && qrState.value !== 'success') {
    scheduleQrPoll()
  }
}

const initPortalQrLogin = async () => {
  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }
  if (!isTauriRuntime()) {
    statusMsg.value = '当前运行时暂不支持原生扫码登录，请使用账号密码登录。'
    return
  }

  portalQrVisible.value = true
  statusMsg.value = ''
  qrSubmitting.value = false
  qrState.value = 'loading'
  qrStateMessage.value = '正在生成二维码...'
  clearQrTimer()
  const currentSeq = ++portalQrInitSeq

  try {
    const rawPayload = await withTimeout(invoke('portal_qr_init_login', {
      service: 'https://e.hbut.edu.cn/login#/'
    }), 20000, '二维码生成超时，请检查网络后重试')
    if (currentSeq !== portalQrInitSeq) return
    const payload = normalizeInvokePayload(rawPayload)
    const uuid = pickText(payload, ['uuid', 'qr_uuid'])
    const qrImg = normalizeQrImageSource(
      pickText(payload, [
        'qr_image_base64',
        'qrImageBase64',
        'qr_image',
        'qrImage',
        'image_base64',
        'imageBase64',
        'image'
      ])
    )

    if (!uuid || !qrImg) {
      throw new Error('二维码数据不完整，请重试')
    }

    qrUuid.value = uuid
    qrImageBase64.value = qrImg
    qrExpiresAt.value = Date.now() + 180 * 1000
    qrState.value = 'waiting'
    qrStateMessage.value = '请使用新融合门户 App 扫码登录。'
    updateQrCountdown()
    scheduleQrPoll()
  } catch (e) {
    qrState.value = 'error'
    qrStateMessage.value = `二维码生成失败：${e.message || e}`
  }
}

const openPortalQrPanel = async (refresh = false) => {
  portalQrVisible.value = true
  if (refresh || !qrImageBase64.value || qrState.value === 'expired') {
    await initPortalQrLogin()
  }
}

const closePortalQrPanel = () => {
  portalQrVisible.value = false
  resetQrState()
}

const confirmPortalQrLogin = async ({ allowPending = false } = {}) => {
  if (!qrUuid.value || qrSubmitting.value) return false
  qrSubmitting.value = true
  clearQrTimer()

  try {
    const userInfo = await invoke('portal_qr_confirm_login', {
      uuid: qrUuid.value,
      service: 'https://e.hbut.edu.cn/login#/'
    })
    const sid = String(userInfo?.student_id || '').trim()
    if (!sid) {
      throw new Error('扫码成功但未获取到学号')
    }

    username.value = sid
    localStorage.setItem('hbu_username', sid)
    localStorage.removeItem('hbu_credentials')
    localStorage.setItem('hbu_remember', 'false')
    applyLoginMethodStorage('portal_qr_temp')
    localStorage.removeItem('hbu_manual_logout')
    localStorage.removeItem(LOGOUT_REASON_KEY)

    qrState.value = 'success'
    qrStateMessage.value = '✅ 扫码登录成功，正在同步数据...'
    await emitSuccessWithGrades(sid)
    return true
  } catch (e) {
    if (allowPending && isPortalPendingError(e)) {
      qrState.value = 'scanned'
      qrStateMessage.value = '已扫码，请在手机端完成确认...'
      return false
    }
    qrState.value = 'error'
    qrStateMessage.value = `扫码登录失败：${e.message || e}`
    return false
  } finally {
    qrSubmitting.value = false
  }
}

const handleChaoxingLoginSuccess = async (payload, modeKey) => {
  const sid = await resolveChaoxingStudentId(payload)
  if (!sid) {
    throw new Error('学习通登录成功，但未解析到 10 位学号，请先检查账号绑定信息')
  }
  username.value = sid
  localStorage.setItem('hbu_username', sid)
  localStorage.removeItem('hbu_credentials')
  localStorage.setItem('hbu_remember', 'false')
  saveChaoxingCredentials()
  applyLoginMethodStorage(modeKey)
  localStorage.removeItem('hbu_manual_logout')
  localStorage.removeItem(LOGOUT_REASON_KEY)
  statusMsg.value = '✅ 学习通登录成功，正在进入首页...'
  pushDebugList(payload?.debug)
  emit('success', [])
}

const handleChaoxingPasswordLogin = async () => {
  if (!chaoxingAccount.value || !chaoxingPassword.value) {
    statusMsg.value = '请输入完整的学习通账号和密码'
    return
  }
  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }
  if (!isTauriRuntime()) {
    statusMsg.value = '当前运行时暂不支持学习通原生登录，请在桌面端/原生容器使用。'
    return
  }

  loading.value = true
  statusMsg.value = '🔒 正在登录学习通...'
  try {
    const payload = await invoke('chaoxing_password_login', {
      account: chaoxingAccount.value,
      password: chaoxingPassword.value
    })
    await handleChaoxingLoginSuccess(payload, 'chaoxing_password')
  } catch (e) {
    statusMsg.value = `⚠️ 学习通登录失败: ${e.message || e}`
    pushDebug(`学习通密码登录失败: ${e.message || e}`)
  } finally {
    loading.value = false
  }
}

const pollChaoxingQrStatus = async () => {
  if (!cxQrUuid.value || !cxQrEnc.value || !isChaoxingMode.value || !chaoxingQrVisible.value) return
  if (cxQrSubmitting.value || cxQrPollingBusy) return

  updateCxQrCountdown()
  if (cxQrState.value === 'expired') return

  cxQrPollingBusy = true
  try {
    const payload = await invoke('chaoxing_qr_check_status', {
      uuid: cxQrUuid.value,
      enc: cxQrEnc.value,
      forbidotherlogin: String(cxQrContext.value?.forbidotherlogin || '0'),
      double_factor_login: String(cxQrContext.value?.double_factor_login || '0')
    })
    pushDebugList(payload?.debug)
    const typeCode = String(payload?.type_code || '').trim()
    if (payload?.should_finish_login) {
      cxQrState.value = 'confirming'
      cxQrStateMessage.value = '扫码确认成功，正在提交学习通登录...'
      await confirmChaoxingQrLogin()
      return
    }
    if (typeCode === '4') {
      cxQrState.value = 'scanned'
      cxQrStateMessage.value = payload?.nickname
        ? `已扫码：${payload.nickname}，请在学习通确认登录。`
        : '已扫码，请在学习通确认登录。'
    } else if (typeCode === '6') {
      cxQrState.value = 'expired'
      cxQrStateMessage.value = '客户端取消登录，二维码已失效。'
      clearCxQrTimer()
      return
    } else if (typeCode === '7') {
      cxQrState.value = 'expired'
      cxQrStateMessage.value = payload?.message || '二维码异常，请刷新。'
      clearCxQrTimer()
      return
    } else if (typeCode === '3') {
      cxQrState.value = 'waiting'
      cxQrStateMessage.value = payload?.message || '等待扫码中...'
    } else {
      cxQrState.value = 'waiting'
      cxQrStateMessage.value = payload?.message || '等待扫码中...'
    }
  } catch (e) {
    cxQrState.value = 'error'
    cxQrStateMessage.value = `学习通二维码状态查询失败：${e.message || e}`
    pushDebug(`学习通二维码状态失败: ${e.message || e}`)
  } finally {
    cxQrPollingBusy = false
  }

  updateCxQrCountdown()
  if (cxQrState.value !== 'expired' && cxQrState.value !== 'success') {
    scheduleCxQrPoll()
  }
}

const initChaoxingQrLogin = async (preferRefresh = false) => {
  if (!agreePolicy.value) {
    statusMsg.value = '请先阅读并同意免责声明与隐私政策'
    return
  }
  if (!isTauriRuntime()) {
    statusMsg.value = '当前运行时暂不支持学习通扫码登录。'
    return
  }

  chaoxingQrVisible.value = true
  statusMsg.value = ''
  cxQrSubmitting.value = false
  cxQrState.value = 'loading'
  cxQrStateMessage.value = '正在生成学习通二维码...'
  clearCxQrTimer()
  const currentSeq = ++chaoxingQrInitSeq

  try {
    const command = preferRefresh && cxQrUuid.value ? 'chaoxing_qr_refresh_login' : 'chaoxing_qr_init_login'
    const rawPayload = await withTimeout(invoke(command), 20000, '学习通二维码生成超时，请检查网络后重试')
    if (currentSeq !== chaoxingQrInitSeq) return
    const payload = normalizeInvokePayload(rawPayload)
    const uuid = pickText(payload, ['uuid', 'qr_uuid'])
    const enc = pickText(payload, ['enc', 'encrypt'])
    const qrImg = normalizeQrImageSource(
      pickText(payload, [
        'qr_image_base64',
        'qrImageBase64',
        'qr_image',
        'qrImage',
        'image_base64',
        'imageBase64',
        'image'
      ])
    )
    if (!uuid || !enc || !qrImg) {
      throw new Error('学习通二维码数据不完整')
    }

    cxQrUuid.value = uuid
    cxQrEnc.value = enc
    cxQrImageBase64.value = qrImg
    cxQrContext.value = payload?.context || null
    const ttl = Number(payload?.expires_in_seconds || 150)
    cxQrExpiresAt.value = Date.now() + Math.max(60, ttl) * 1000
    cxQrState.value = 'waiting'
    cxQrStateMessage.value = '请使用学习通 App 扫码登录。'
    updateCxQrCountdown()
    scheduleCxQrPoll()
    pushDebugList(payload?.debug)
  } catch (e) {
    cxQrState.value = 'error'
    cxQrStateMessage.value = `学习通二维码生成失败：${e.message || e}`
    pushDebug(`学习通二维码生成失败: ${e.message || e}`)
  }
}

const openChaoxingQrPanel = async (refresh = false) => {
  chaoxingQrVisible.value = true
  if (refresh || !cxQrImageBase64.value || cxQrState.value === 'expired') {
    await initChaoxingQrLogin(refresh || !!cxQrImageBase64.value)
  }
}

const closeChaoxingQrPanel = () => {
  chaoxingQrVisible.value = false
  resetCxQrState()
}

const confirmChaoxingQrLogin = async () => {
  if (!cxQrUuid.value || !cxQrEnc.value || cxQrSubmitting.value) return
  cxQrSubmitting.value = true
  clearCxQrTimer()

  try {
    const payload = await invoke('chaoxing_qr_confirm_login', {
      uuid: cxQrUuid.value,
      enc: cxQrEnc.value,
      account_hint: chaoxingAccount.value || undefined
    })
    cxQrState.value = 'success'
    cxQrStateMessage.value = '✅ 学习通扫码登录成功，正在进入首页...'
    await handleChaoxingLoginSuccess(payload, 'chaoxing_qr_temp')
  } catch (e) {
    cxQrState.value = 'error'
    cxQrStateMessage.value = `学习通扫码登录失败：${e.message || e}`
    pushDebug(`学习通扫码登录失败: ${e.message || e}`)
  } finally {
    cxQrSubmitting.value = false
  }
}

const switchMode = (mode) => {
  if (!isKnownMode(mode) || activeMode.value === mode) return
  activeMode.value = mode
  statusMsg.value = ''
  clearDebugLogs()
  if (mode !== 'portal') {
    portalQrVisible.value = false
    resetQrState()
  }
  if (mode !== 'chaoxing') {
    chaoxingQrVisible.value = false
    resetCxQrState()
  }
}

const handleKeyPress = (event) => {
  if (event.key !== 'Enter' || loading.value) return
  if (isPortalMode.value) {
    handlePasswordLogin()
    return
  }
  if (isChaoxingMode.value) {
    handleChaoxingPasswordLogin()
  }
}

watch(
  () => props.loginMode,
  (mode) => {
    const nextMode = normalizeModeKey(mode)
    if (isKnownMode(nextMode) && nextMode !== activeMode.value) {
      activeMode.value = nextMode
    }
  }
)

watch(activeMode, (mode) => {
  localStorage.setItem(LOGIN_MODE_PREF_KEY, mode)
  emit('switchMode', mode)
})

onMounted(async () => {
  const savedMode = normalizeModeKey(localStorage.getItem(LOGIN_MODE_PREF_KEY))
  if (isKnownMode(savedMode) && savedMode !== activeMode.value) {
    activeMode.value = savedMode
  }

  const reason = String(localStorage.getItem(LOGOUT_REASON_KEY) || '').trim()
  if (reason === TEMP_SESSION_EXPIRED_REASON) {
    statusMsg.value = '扫码临时登录已失效，请重新登录。'
    localStorage.removeItem(LOGOUT_REASON_KEY)
  }

  const savedUsername = localStorage.getItem('hbu_username')
  const savedRemember = localStorage.getItem('hbu_remember')
  const savedCredentials = localStorage.getItem('hbu_credentials')
  if (savedRemember !== 'false' && savedUsername) {
    username.value = savedUsername
    password.value = savedCredentials || ''
    rememberMe.value = true
  }

  const savedCxRemember = localStorage.getItem(CHAOXING_REMEMBER_KEY)
  const savedCxAccount = localStorage.getItem(CHAOXING_ACCOUNT_KEY)
  const savedCxPassword = localStorage.getItem(CHAOXING_PASSWORD_KEY)
  if (savedCxRemember !== 'false' && savedCxAccount) {
    chaoxingAccount.value = savedCxAccount
    chaoxingPassword.value = savedCxPassword || ''
    rememberMe.value = true
  }

  await ensureOcrEndpointReady()
  window.addEventListener('hbu-ocr-config-updated', handleOcrConfigUpdated)
})

onBeforeUnmount(() => {
  clearQrTimer()
  clearCxQrTimer()
  window.removeEventListener('hbu-ocr-config-updated', handleOcrConfigUpdated)
})
</script>

<template>
  <div class="login-container glass-card">
    <div class="logo">
      <img class="logo-img" :src="hbutLogo" alt="Mini-HBUT" />
    </div>
    <h2>账号登录</h2>
    <p class="subtitle">选择入口后继续</p>

    <div class="entry-switch" role="tablist" aria-label="登录入口切换">
      <span class="entry-slider" :class="{ 'is-chaoxing': isChaoxingMode }"></span>
      <button
        class="entry-btn"
        :class="{ active: isPortalMode }"
        @click="switchMode('portal')"
      >
        新融合门户
      </button>
      <button
        class="entry-btn"
        :class="{ active: isChaoxingMode }"
        @click="switchMode('chaoxing')"
      >
        学习通
      </button>
    </div>
    <p class="mode-capsule">{{ currentModeMeta.title }}</p>

    <div v-if="loading" class="progress-container">
      <div class="loading-spinner">
        <div class="spinner"></div>
      </div>
      <p class="status-msg">{{ statusMsg }}</p>
    </div>

    <div v-else class="form-container">
      <template v-if="isPortalMode">
        <div class="input-group">
          <label>学号</label>
          <input
            v-model="username"
            type="text"
            placeholder="学号（10位数字）"
            maxlength="10"
            @keypress="handleKeyPress"
          />
        </div>

        <div class="input-group">
          <label>密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            @keypress="handleKeyPress"
          />
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="rememberMe" class="real-checkbox" />
            <span class="custom-checkbox"></span>
            记住密码
          </label>
        </div>

        <button
          class="login-btn"
          :disabled="!canSubmitPasswordLogin"
          @click="handlePasswordLogin"
        >
          登录
        </button>

        <div class="action-pills">
          <a
            class="action-pill action-pill-link"
            href="https://auth.hbut.edu.cn/retrieve-password/retrievePassword/index.html?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%23%2F#/"
            target="_blank"
            rel="noopener noreferrer"
          >
            忘记密码
          </a>
          <button class="action-pill action-pill-btn" @click="openPortalQrPanel()">
            扫码登录
          </button>
        </div>

        <transition name="fade-slide">
          <div v-if="portalQrVisible" class="qr-panel">
            <div class="qr-panel-head">
              <span class="qr-panel-title">扫码登录（临时）</span>
              <button class="qr-close-btn" type="button" @click="closePortalQrPanel">收起</button>
            </div>
            <div class="qr-image-box">
              <img v-if="qrImageBase64" :src="qrImageBase64" alt="扫码登录二维码" class="qr-image" />
              <div v-else class="qr-placeholder">
                {{ qrState === 'error' ? (qrStateMessage || '二维码加载失败') : '正在生成二维码...' }}
              </div>
            </div>
            <p class="qr-status">{{ qrStateMessage || '请使用新融合门户 App 扫码登录。' }}</p>
            <p v-if="qrRemainingSeconds > 0" class="qr-countdown">二维码剩余 {{ qrRemainingSeconds }} 秒</p>
            <button class="login-btn" :disabled="qrSubmitting" @click="openPortalQrPanel(true)">
              {{ qrImageBase64 ? '刷新二维码' : '生成二维码' }}
            </button>
          </div>
        </transition>

        <div class="mode-info">
          <span class="info-text">OCR 配置：{{ ocrConfigMode }}</span>
        </div>
      </template>

      <template v-else-if="isChaoxingMode">
        <div class="input-group">
          <label>学习通账号</label>
          <input
            v-model="chaoxingAccount"
            type="text"
            placeholder="手机号 / 超星号 / 学号"
            maxlength="40"
            @keypress="handleKeyPress"
          />
        </div>

        <div class="input-group">
          <label>学习通密码</label>
          <input
            v-model="chaoxingPassword"
            type="password"
            placeholder="密码"
            maxlength="40"
            @keypress="handleKeyPress"
          />
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="rememberMe" class="real-checkbox" />
            <span class="custom-checkbox"></span>
            记住密码
          </label>
        </div>

        <button
          class="login-btn"
          :disabled="!canSubmitChaoxingPasswordLogin"
          @click="handleChaoxingPasswordLogin"
        >
          登录
        </button>

        <div class="action-pills">
          <a
            class="action-pill action-pill-link"
            :href="CHAOXING_FORGET_PWD_URL"
            target="_blank"
            rel="noopener noreferrer"
          >
            忘记密码
          </a>
          <button class="action-pill action-pill-btn" @click="openChaoxingQrPanel()">
            扫码登录
          </button>
          <span class="action-pill action-pill-note">功能受限</span>
        </div>

        <transition name="fade-slide">
          <div v-if="chaoxingQrVisible" class="qr-panel">
            <div class="qr-panel-head">
              <span class="qr-panel-title">学习通扫码登录（临时）</span>
              <button class="qr-close-btn" type="button" @click="closeChaoxingQrPanel">收起</button>
            </div>
            <div class="qr-image-box">
              <img v-if="cxQrImageBase64" :src="cxQrImageBase64" alt="学习通扫码二维码" class="qr-image" />
              <div v-else class="qr-placeholder">
                {{ cxQrState === 'error' ? (cxQrStateMessage || '二维码加载失败') : '正在生成学习通二维码...' }}
              </div>
            </div>
            <p class="qr-status">{{ cxQrStateMessage || '请使用学习通 App 扫码登录。' }}</p>
            <p v-if="cxQrRemainingSeconds > 0" class="qr-countdown">二维码剩余 {{ cxQrRemainingSeconds }} 秒</p>
            <button class="login-btn" :disabled="cxQrSubmitting" @click="openChaoxingQrPanel(true)">
              {{ cxQrImageBase64 ? '刷新学习通二维码' : '生成学习通二维码' }}
            </button>
          </div>
        </transition>

        <div class="mode-info mode-info-warn">
          <span class="info-text">学习通登录后首页仅显示教务相关模块。</span>
        </div>
      </template>

      <div class="checkbox-group agreement">
        <label class="checkbox-label checkbox-label--agreement">
          <input type="checkbox" v-model="agreePolicy" class="real-checkbox" />
          <span class="custom-checkbox"></span>
          <span class="agreement-text">我已阅读并同意</span>
          <button type="button" class="link-btn" @click="emit('showLegal', 'disclaimer')">《免责声明》</button>
          <span class="agreement-text">与</span>
          <button type="button" class="link-btn" @click="emit('showLegal', 'privacy')">《隐私政策》</button>
        </label>
      </div>

      <p
        v-if="statusMsg"
        class="status-msg"
        :class="{ error: statusMsg.includes('失败') || statusMsg.includes('⚠️') || statusMsg.includes('❌') }"
      >
        {{ statusMsg }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  max-width: 520px;
  margin: 1.2rem auto;
  padding: 1.3rem 1.15rem;
  text-align: center;
}

.logo {
  margin-bottom: 0.6rem;
  display: flex;
  justify-content: center;
}

.logo-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

h2 {
  color: var(--primary-color);
  margin: 0 0 0.35rem;
  font-size: 1.28rem;
}

.subtitle {
  color: #64748b;
  margin: 0 0 0.92rem;
  font-size: 0.84rem;
}

.entry-switch {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  border: 1px solid #dbe5f0;
  border-radius: 999px;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
  padding: 3px;
  margin-bottom: 0.5rem;
}

.entry-slider {
  position: absolute;
  left: 4px;
  top: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  border-radius: 999px;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.28);
  transition: transform 0.25s ease;
  z-index: 0;
}

.entry-slider.is-chaoxing {
  transform: translateX(100%);
}

.entry-btn {
  position: relative;
  z-index: 1;
  border: 0;
  border-radius: 999px;
  padding: 0.48rem 0.16rem;
  background: transparent;
  color: #334155;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.22s ease;
}

.entry-btn.active {
  color: #ffffff;
}

.mode-capsule {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 0 0.65rem;
  padding: 0.25rem 0.72rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: #1d4ed8;
  background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%);
  border: 1px solid #bfdbfe;
}

.form-container {
  margin-top: 0.45rem;
}

.input-group {
  text-align: left;
  margin-bottom: 0.72rem;
}

.input-group label {
  display: block;
  margin-bottom: 0.3rem;
  font-weight: 600;
  color: var(--text-color);
  font-size: 0.88rem;
}

.input-group input {
  width: 100%;
  padding: 0.62rem 0.7rem;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 0.92rem;
  box-sizing: border-box;
}

.input-group input:focus {
  border-color: var(--primary-color);
  outline: none;
}

.checkbox-group {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 0.65rem;
}

.checkbox-group.agreement {
  display: block;
  width: 100%;
  margin-top: 0.88rem;
  justify-content: flex-start;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  padding: 0 0 2px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.88rem;
  color: #475569;
  user-select: text;
}

.checkbox-label--agreement {
  display: inline-flex;
  align-items: center;
  width: max-content;
  min-width: max-content;
  flex: 0 0 auto;
  white-space: nowrap;
  flex-wrap: nowrap;
  gap: 2px;
  background: linear-gradient(135deg, #ecfeff 0%, #eff6ff 100%);
  border: 1px solid #bae6fd;
  border-radius: 999px;
  padding: 0.35rem 0.68rem;
}

.agreement-text {
  display: inline;
  white-space: nowrap;
  flex: 0 0 auto;
  margin-right: 1px;
  font-size: 0.82rem;
}

.link-btn {
  background: none;
  border: none;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--primary-color);
  cursor: pointer;
  font-weight: 700;
  padding: 0 2px;
  white-space: nowrap;
  font-size: 0.82rem;
}

.link-btn:hover {
  text-decoration: underline;
}

.real-checkbox {
  display: none;
}

.custom-checkbox {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border: 2px solid #d1d5db;
  border-radius: 5px;
  margin-right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: white;
}

.real-checkbox:checked + .custom-checkbox {
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.custom-checkbox::after {
  content: "✓";
  color: white;
  font-size: 12px;
  font-weight: 700;
  opacity: 0;
}

.real-checkbox:checked + .custom-checkbox::after {
  opacity: 1;
}

.login-btn {
  width: 100%;
  padding: 0.7rem;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: white;
  border: none;
  border-radius: 11px;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.login-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.action-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.62rem 0 0.26rem;
}

.action-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.34rem 0.64rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
}

.action-pill-link {
  color: #1d4ed8;
  text-decoration: none;
  background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%);
  border-color: #bfdbfe;
}

.action-pill-link:hover {
  text-decoration: underline;
}

.action-pill-btn {
  color: #0f766e;
  background: linear-gradient(135deg, #ccfbf1 0%, #e0f2fe 100%);
  border-color: #99f6e4;
  cursor: pointer;
}

.action-pill-note {
  color: #9a3412;
  background: linear-gradient(135deg, #ffedd5 0%, #fef3c7 100%);
  border-color: #fed7aa;
}

.qr-panel {
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  padding: 0.74rem;
  margin-top: 0.45rem;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.qr-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 0.55rem;
}

.qr-panel-title {
  font-size: 0.79rem;
  font-weight: 700;
  color: #0f172a;
}

.qr-close-btn {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 0.72rem;
  padding: 0.2rem 0.48rem;
  cursor: pointer;
}

.qr-image-box {
  width: 198px;
  height: 198px;
  margin: 0 auto;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #dbe2ea;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.qr-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-placeholder {
  color: #94a3b8;
  font-size: 0.84rem;
  padding: 0 1rem;
}

.qr-status {
  margin: 0.58rem 0 0.3rem;
  color: #334155;
  font-size: 0.84rem;
}

.qr-countdown {
  margin: 0 0 0.6rem;
  color: #0f766e;
  font-size: 0.76rem;
  font-weight: 600;
}

.mode-info {
  margin-top: 0.56rem;
  padding: 0.5rem;
  background: #e0f2fe;
  border-radius: 10px;
}

.mode-info.mode-info-warn {
  background: #fff7ed;
}

.info-text {
  font-size: 0.79rem;
  color: #0c4a6e;
}

.mode-info.mode-info-warn .info-text {
  color: #9a3412;
}

.progress-container {
  padding: 1.2rem 0 0.3rem;
}

.loading-spinner {
  display: flex;
  justify-content: center;
}

.spinner {
  width: 42px;
  height: 42px;
  border: 4px solid #e2e8f0;
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-msg {
  margin-top: 0.65rem;
  font-size: 0.84rem;
  color: #334155;
}

.status-msg.error {
  color: #b91c1c;
  font-weight: 600;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 560px) {
  .login-container {
    padding: 1rem 0.85rem;
    margin: 0.75rem auto;
  }

  .qr-image-box {
    width: 186px;
    height: 186px;
  }

  .action-pills {
    gap: 0.45rem;
  }

  .action-pill {
    font-size: 0.76rem;
  }
}
</style>
