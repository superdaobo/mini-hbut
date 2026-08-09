<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { initMarkdownRuntime } from '../utils/markdown.js'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { isTestAccountSession } from '../utils/test_account.js'
import {
  DEFAULT_WELCOME,
  AI_BRIDGE_CANDIDATES,
  AI_BRIDGE_PATHS,
  AI_POST_TIMEOUT_MS,
  AI_PROBE_TIMEOUT_MS,
  AI_RETRY_DELAYS_MS,
  AI_ALLOWED_FILE_EXTENSIONS,
  AI_UPLOAD_ACCEPT,
  AI_MAX_UPLOAD_BYTES,
  AI_MIME_BY_EXT,
  buildTestAccountAiReply,
  defaultModelOptions,
  MODEL_ID_DEEPSEEK,
  MODEL_ID_DOUBAO,
  MODEL_ALIAS_MAP,
  MODEL_DISPLAY_MAP,
  normalizeModelValue,
  normalizeModelToken,
  detectModelFamily,
  isDeepSeekModel,
  modelDisplayName,
  detectRenderMode,
  normalizeMessage,
  makeMessage,
  makeSession,
  formatSessionTime,
  parseAiResponseText,
  extractFileExtension,
  readFileAsBase64,
  isLikelyHexNoise,
  isNoiseMessage,
  sanitizeStreamText,
  compactDisplayText,
  normalizeStreamIncrement,
  renderMessage,
  parseStreamEvents,
  appendDeepSeekChunk,
  shouldUseThinkingWindow
} from '../features/ai/chat-model.js'

const props = defineProps({
  studentId: String,
  modelOptions: {
    type: Array,
    default: () => []
  }
})

defineEmits(['back'])

const token = ref('')
const bladeAuth = ref('')
const dynamicModelOptions = ref([])
const initStatus = ref('loading')
const initError = ref('')

const selectedModel = ref('qwen-max')
const historyOpen = ref(false)
const sessions = ref([])
const activeSessionId = ref('')
const messages = ref([])
const deleteConfirmVisible = ref(false)
const deleteConfirmLoading = ref(false)
const deleteConfirmError = ref('')
const pendingDeleteSessionId = ref('')

const input = ref('')
const isLoading = ref(false)
const attachment = ref(null)
const fileInput = ref(null)
const chatContainer = ref(null)
const rootEl = ref(null)
const inputBarEl = ref(null)
const attachmentBarEl = ref(null)
const autoScrollEnabled = ref(true)
const skipInitialScroll = ref(true)
const streamStats = ref({
  active: false,
  raw: 0,
  delta: 0,
  progress: 0,
  fallback: false,
  lastEvent: '-'
})

const resetStreamStats = () => {
  streamStats.value = {
    active: false,
    raw: 0,
    delta: 0,
    progress: 0,
    fallback: false,
    lastEvent: '-'
  }
}

let resizeObserver = null
let viewportResizeHandler = null
let windowResizeHandler = null
const setRootCssVar = (name, value) => {
  if (!rootEl.value) return
  rootEl.value.style.setProperty(name, value)
}

const updateLayoutMetrics = () => {
  const inputHeight = Math.max(64, Math.ceil(inputBarEl.value?.offsetHeight || 72))
  const attachmentHeight = Math.ceil(attachmentBarEl.value?.offsetHeight || 0)
  setRootCssVar('--ai-input-height', `${inputHeight}px`)
  setRootCssVar('--ai-attachment-height', `${attachmentHeight}px`)
}

const updateKeyboardOffset = () => {
  if (typeof window === 'undefined') return
  const vv = window.visualViewport
  if (!vv) {
    setRootCssVar('--ai-keyboard-offset', '0px')
    return
  }
  const offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
  setRootCssVar('--ai-keyboard-offset', `${offset}px`)
}

const handleInputFocus = () => {
  nextTick(() => {
    updateKeyboardOffset()
    updateLayoutMetrics()
    queueAutoScroll()
  })
}

const handleInputBlur = () => {
  window.setTimeout(() => {
    updateKeyboardOffset()
    updateLayoutMetrics()
  }, 80)
}

const AI_DEBUG = (() => {
  try {
    return localStorage.getItem('hbu_ai_debug') === '1'
  } catch {
    return false
  }
})()

const normalizedModelOptions = computed(() => {
  const mergeLists = (...lists) => {
    const out = []
    const seen = new Set()
    for (const list of lists) {
      for (const item of list) {
        const key = normalizeModelValue(item.value)
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(item)
      }
    }
    return out
  }
  const normalizeList = (list) => {
    const safe = Array.isArray(list) ? list : []
    return safe
      .map((item) => {
        const value = String(item?.value || '').trim()
        if (!value) return null
        const key = normalizeModelValue(value)
        const label = String(item?.label || MODEL_DISPLAY_MAP[key] || value).trim()
        return { label, value }
      })
      .filter(Boolean)
  }
  const defaults = normalizeList(defaultModelOptions)
  const fromProps = normalizeList(props.modelOptions)
  const fromDynamic = normalizeList(dynamicModelOptions.value)
  if (Array.isArray(dynamicModelOptions.value) && dynamicModelOptions.value.length) {
    return mergeLists(fromDynamic, fromProps, defaults)
  }
  if (Array.isArray(props.modelOptions) && props.modelOptions.length) {
    return mergeLists(fromProps, defaults)
  }
  return defaults
})

const historyKey = computed(() => `hbu_ai_history_v2_${props.studentId || 'guest'}`)

const findSession = (id) => sessions.value.find((item) => item.id === id)

const ensureModelSelection = () => {
  const list = normalizedModelOptions.value
  if (!Array.isArray(list) || !list.length) return
  if (!list.some((m) => m?.value === selectedModel.value)) {
    selectedModel.value = list[0].value
  }
}

const buildModelCandidates = (selected) => {
  const out = []
  const seen = new Set()
  const push = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return
    const key = raw.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(raw)
  }

  const normalized = normalizeModelValue(selected)
  const selectedOption = (normalizedModelOptions.value || []).find((item) => normalizeModelValue(item?.value) === normalized)
  const selectedLabel = String(selectedOption?.label || '')
  const family = detectModelFamily(selected, selectedLabel)
  push(selected)
  if (selectedLabel) push(selectedLabel)
  for (const alias of MODEL_ALIAS_MAP[normalized] || []) {
    push(alias)
  }
  if (family === 'deepseek') {
    for (const alias of MODEL_ALIAS_MAP['deepseek-r1'] || []) push(alias)
    push(MODEL_ID_DEEPSEEK)
  } else if (family === 'doubao') {
    for (const alias of MODEL_ALIAS_MAP['doubao-1.5-pro'] || []) push(alias)
    push(MODEL_ID_DOUBAO)
  } else if (family === 'qwen-plus') {
    for (const alias of MODEL_ALIAS_MAP['qwen-plus'] || []) push(alias)
  } else if (family === 'qwen-max') {
    for (const alias of MODEL_ALIAS_MAP['qwen-max'] || []) push(alias)
  }
  for (const option of normalizedModelOptions.value || []) {
    const value = String(option?.value || '').trim()
    const label = String(option?.label || '').trim()
    const optionFamily = detectModelFamily(value, label)
    if (!family || optionFamily === family) {
      push(value)
      if (label) push(label)
    }
  }
  push('qwen-max')
  push('qwen-plus')
  return out
}

const isIllegalModelError = (err) => {
  const text = String(err || '').toLowerCase()
  return text.includes('模型名非法') || text.includes('illegal model') || text.includes('model非法') || (text.includes('模型') && text.includes('非法'))
}

const unwrapApiData = (resp) => {
  if (!resp || typeof resp !== 'object') return null
  if ('data' in resp) return resp.data
  return resp
}

const sleep = (ms = 0) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const isNetworkFetchError = (error) => {
  const text = String(error || '').toLowerCase()
  return (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('abort') ||
    text.includes('timeout') ||
    text.includes('load failed') ||
    text.includes('connection')
  )
}

const buildBridgeUrl = (path, base = activeBridgeBase) => {
  const cleanPath = String(path || '').trim()
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath
  if (!cleanPath.startsWith('/')) return `${base}/${cleanPath}`
  return `${base}${cleanPath}`
}

const rotateBridgeCandidate = () => {
  activeBridgeIndex = (activeBridgeIndex + 1) % AI_BRIDGE_CANDIDATES.length
  activeBridgeBase = AI_BRIDGE_CANDIDATES[activeBridgeIndex]
  return activeBridgeBase
}

const probeBridge = async (base) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), AI_PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(buildBridgeUrl(AI_BRIDGE_PATHS.health, base), {
      method: 'GET',
      signal: controller.signal
    })
    if (!res.ok) {
      throw new Error(`health ${res.status}`)
    }
    return true
  } finally {
    window.clearTimeout(timeoutId)
  }
}

const ensureBridgeAvailable = async (forceProbe = false) => {
  const candidateOrder = []
  for (let i = 0; i < AI_BRIDGE_CANDIDATES.length; i += 1) {
    const idx = (activeBridgeIndex + i) % AI_BRIDGE_CANDIDATES.length
    candidateOrder.push({ idx, base: AI_BRIDGE_CANDIDATES[idx] })
  }
  if (!forceProbe && candidateOrder.length) {
    return candidateOrder[0].base
  }
  let lastError = null
  for (const item of candidateOrder) {
    try {
      await probeBridge(item.base)
      activeBridgeIndex = item.idx
      activeBridgeBase = item.base
      return item.base
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`本地 AI 服务不可用：${String(lastError || 'bridge unavailable')}`)
}

const parsePostResponse = async (res) => {
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(text || `请求失败(${res.status})`)
  }
  const extractErrorMessage = (payload) => {
    if (!payload || typeof payload !== 'object') return ''
    return String(
      payload?.error?.message ||
        payload?.error_description ||
        payload?.message ||
        payload?.msg ||
        ''
    ).trim()
  }
  const errorMessage = extractErrorMessage(json)
  if (!res.ok) {
    throw new Error(errorMessage || `请求失败(${res.status})`)
  }
  if (json?.success === false) {
    throw new Error(errorMessage || '请求失败')
  }
  return json
}

const postJson = async (path, body, options = {}) => {
  if (isTestAccountSession()) {
    return {
      success: false,
      demo_disabled: true,
      error: '演示账号不会调用外部 AI 服务'
    }
  }
  const retries = Number.isFinite(options?.retries) ? Math.max(0, Number(options.retries)) : 2
  const skipProbe = options?.skipProbe === true
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const delay = AI_RETRY_DELAYS_MS[Math.min(attempt, AI_RETRY_DELAYS_MS.length - 1)] || 0
    if (delay > 0) {
      await sleep(delay)
    }
    try {
      await ensureBridgeAvailable(!skipProbe || attempt > 0)
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), AI_POST_TIMEOUT_MS)
      const res = await fetch(buildBridgeUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      }).finally(() => {
        window.clearTimeout(timeoutId)
      })
      return await parsePostResponse(res)
    } catch (error) {
      lastError = error
      if (!isNetworkFetchError(error) || attempt >= retries) {
        throw error
      }
      rotateBridgeCandidate()
    }
  }
  throw lastError || new Error('请求失败')
}

const invokeAiCommand = async (command, camelArgs = undefined, snakeArgs = undefined) => {
  try {
    return await invokeNative(command, camelArgs)
  } catch (firstError) {
    if (!snakeArgs || String(firstError || '').toLowerCase().includes('unknown field') === false) {
      throw firstError
    }
    return invokeNative(command, snakeArgs)
  }
}

const tryInvokeAiInit = async () => {
  if (!hasTauriRuntime) return null
  const payload = await invokeAiCommand('hbut_ai_init')
  return payload
}

const tryInvokeAiChat = async (payload) => {
  if (!hasTauriRuntime) return ''
  const camelArgs = {
    token: payload.token,
    bladeAuth: payload.bladeAuth,
    question: payload.question,
    uploadUrl: payload.user_attachment || '',
    model: payload.model,
    sessionId: payload.session_id || ''
  }
  const snakeArgs = {
    token: payload.token,
    blade_auth: payload.bladeAuth,
    question: payload.question,
    upload_url: payload.user_attachment || '',
    model: payload.model,
    session_id: payload.session_id || ''
  }
  const data = await invokeAiCommand('hbut_ai_chat', camelArgs, snakeArgs)
  return parseAiResponseText(data)
}

const tryInvokeAiUpload = async (payload) => {
  if (!hasTauriRuntime) return null
  const camelArgs = {
    token: payload.token,
    bladeAuth: payload.bladeAuth,
    fileContent: '',
    fileName: payload.fileName,
    fileBase64: payload.fileBase64,
    fileMime: payload.fileMime
  }
  const snakeArgs = {
    token: payload.token,
    blade_auth: payload.bladeAuth,
    file_content: '',
    file_name: payload.fileName,
    file_base64: payload.fileBase64,
    file_mime: payload.fileMime
  }
  return invokeAiCommand('hbut_ai_upload', camelArgs, snakeArgs)
}

const applyInitPayload = (payload) => {
  const data = unwrapApiData(payload)
  token.value = data?.token || ''
  bladeAuth.value = data?.blade_auth || data?.bladeAuth || ''
  if (!token.value || !bladeAuth.value) {
    throw new Error('AI 凭证缺失')
  }
  if (Array.isArray(data?.models) && data.models.length) {
    dynamicModelOptions.value = data.models
  }
  ensureModelSelection()
}

const requestStreamOnce = async (payload, hooks) => {
  await ensureBridgeAvailable(true)
  const streamUrl = buildBridgeUrl(AI_BRIDGE_PATHS.stream)
  return fetchEventSource(streamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...hooks
  })
}

const saveLocalHistory = () => {
  try {
    const active = findSession(activeSessionId.value)
    if (active) {
      active.messages = messages.value.slice(-200)
      active.updatedAt = Date.now()
      const firstUser = active.messages.find((m) => m.role === 'user' && m.content?.trim())
      if (firstUser) active.title = firstUser.content.trim().slice(0, 20)
      const latest = [...active.messages].reverse().find((m) => m.content?.trim())
      active.preview = latest?.content?.slice(0, 120) || active.preview
    }
    localStorage.setItem(historyKey.value, JSON.stringify({
      activeSessionId: activeSessionId.value,
      sessions: sessions.value.slice(0, 80)
    }))
  } catch {
    // ignore cache failure
  }
}

const loadLocalHistory = () => {
  let parsed = null
  try {
    parsed = JSON.parse(localStorage.getItem(historyKey.value) || 'null')
  } catch {
    parsed = null
  }
  if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length) {
    sessions.value = parsed.sessions.map((item) => makeSession(item))
    activeSessionId.value = parsed.activeSessionId || sessions.value[0].id
    const active = findSession(activeSessionId.value) || sessions.value[0]
    activeSessionId.value = active.id
    messages.value = active.messages || [makeMessage('assistant', DEFAULT_WELCOME)]
    return
  }
  const session = makeSession()
  sessions.value = [session]
  activeSessionId.value = session.id
  messages.value = session.messages
}

const syncMessagesToActiveSession = () => {
  const active = findSession(activeSessionId.value)
  if (!active) return
  active.messages = messages.value
  active.updatedAt = Date.now()
}

const handleChatScroll = () => {
  const el = chatContainer.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  autoScrollEnabled.value = distance < 48
}

const scrollToBottom = () => {
  const el = chatContainer.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

const forceScrollToBottom = () => {
  autoScrollEnabled.value = true
  nextTick(() => {
    scrollToBottom()
    window.requestAnimationFrame(() => {
      scrollToBottom()
    })
  })
}

const snapToLatest = () => {
  skipInitialScroll.value = false
  forceScrollToBottom()
}

const syncAutoScroll = () => {
  nextTick(() => {
    if (!chatContainer.value) return
    if (skipInitialScroll.value) {
      skipInitialScroll.value = false
      scrollToBottom()
      window.requestAnimationFrame(() => {
        scrollToBottom()
      })
      return
    }
    if (autoScrollEnabled.value) {
      scrollToBottom()
    }
  })
}

let autoScrollFrame = 0
const queueAutoScroll = () => {
  if (!autoScrollEnabled.value) return
  if (autoScrollFrame) return
  autoScrollFrame = window.requestAnimationFrame(() => {
    autoScrollFrame = 0
    scrollToBottom()
  })
}

const handleInputTyping = () => {
  forceScrollToBottom()
}

const initViewportHooks = () => {
  updateLayoutMetrics()
  updateKeyboardOffset()
  windowResizeHandler = () => {
    updateKeyboardOffset()
    updateLayoutMetrics()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', windowResizeHandler)
  }
  if (typeof window !== 'undefined' && window.visualViewport) {
    viewportResizeHandler = () => {
      updateKeyboardOffset()
      updateLayoutMetrics()
    }
    window.visualViewport.addEventListener('resize', viewportResizeHandler)
    window.visualViewport.addEventListener('scroll', viewportResizeHandler)
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateLayoutMetrics()
      updateKeyboardOffset()
    })
    if (rootEl.value) resizeObserver.observe(rootEl.value)
    if (inputBarEl.value) resizeObserver.observe(inputBarEl.value)
    if (attachmentBarEl.value) resizeObserver.observe(attachmentBarEl.value)
  }
}

const disposeViewportHooks = () => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (typeof window !== 'undefined' && window.visualViewport && viewportResizeHandler) {
    window.visualViewport.removeEventListener('resize', viewportResizeHandler)
    window.visualViewport.removeEventListener('scroll', viewportResizeHandler)
  }
  if (typeof window !== 'undefined' && windowResizeHandler) {
    window.removeEventListener('resize', windowResizeHandler)
  }
  viewportResizeHandler = null
  windowResizeHandler = null
}

const initAiSession = async () => {
  initStatus.value = 'loading'
  initError.value = ''
  if (isTestAccountSession()) {
    token.value = 'test-account-token'
    bladeAuth.value = 'test-account-blade-auth'
    dynamicModelOptions.value = defaultModelOptions
    initStatus.value = 'success'
    initError.value = ''
    return
  }
  try {
    const resp = await postJson(AI_BRIDGE_PATHS.init, {})
    applyInitPayload(resp)
    initStatus.value = 'success'
  } catch (error) {
    if (AI_DEBUG) {
      console.debug('[AI] bridge 初始化失败，尝试 invoke 兜底:', error)
    }
    try {
      const payload = await tryInvokeAiInit()
      if (!payload) {
        throw error
      }
      applyInitPayload(payload)
      initStatus.value = 'success'
      initError.value = ''
      return
    } catch (invokeError) {
      initStatus.value = 'error'
      initError.value = String(invokeError || error)
    }
  }
}

const ensureInitReady = async () => {
  if (initStatus.value === 'success' && token.value && bladeAuth.value) return
  await initAiSession()
  if (initStatus.value !== 'success' || !token.value || !bladeAuth.value) {
    throw new Error(initError.value || 'AI 初始化失败')
  }
}

const createRemoteSession = async () => {
  if (isTestAccountSession()) return ''
  await ensureInitReady()
  const resp = await postJson(AI_BRIDGE_PATHS.sessionNew, {
    token: token.value,
    blade_auth: bladeAuth.value
  })
  const data = unwrapApiData(resp)
  const sessionId = data?.session_id || resp?.session_id
  if (!sessionId) {
    throw new Error('远端未返回 session_id')
  }
  return sessionId
}

const loadSessionMessagesFromRemote = async (session, force = false) => {
  if (!session?.remoteSessionId) return
  if (session.loaded && !force) return
  await ensureInitReady()
  try {
    const resp = await postJson(AI_BRIDGE_PATHS.sessionMessages, {
      token: token.value,
      blade_auth: bladeAuth.value,
      session_id: session.remoteSessionId
    })
    const data = unwrapApiData(resp)
    const list = data?.messages || []
    if (Array.isArray(list) && list.length) {
      session.messages = list.map((item) => makeMessage(
        item.role === 'user' ? 'user' : 'assistant',
        item.content || '',
        {
          createdAt: Number(item.timestamp || Date.now())
        }
      ))
      session.loaded = true
      const latest = [...session.messages].reverse().find((m) => m.content?.trim())
      if (latest) {
        session.preview = latest.content.slice(0, 120)
      }
    }
    if (session.id === activeSessionId.value) {
      messages.value = session.messages
      snapToLatest()
    }
    saveLocalHistory()
  } catch (error) {
    if (AI_DEBUG) {
      console.debug('[AI] 加载会话消息失败:', error)
    }
  }
}

const syncRemoteHistory = async () => {
  if (isTestAccountSession()) return
  await ensureInitReady()
  const resp = await postJson(AI_BRIDGE_PATHS.sessionHistory, {
    token: token.value,
    blade_auth: bladeAuth.value,
    current: 1,
    size: 50
  })
  const data = unwrapApiData(resp)
  const remoteSessions = Array.isArray(data?.sessions) ? data.sessions : []

  const localOnly = sessions.value.filter((item) => !item.remoteSessionId)
  const merged = remoteSessions.map((remoteItem) => {
    const existing = sessions.value.find((s) => s.remoteSessionId === remoteItem.session_id)
    return makeSession({
      id: existing?.id || `remote_${remoteItem.session_id}`,
      remoteSessionId: remoteItem.session_id,
      title: remoteItem.title || existing?.title || '新对话',
      preview: remoteItem.preview || existing?.preview || '',
      updatedAt: Number(remoteItem.updated_at || existing?.updatedAt || Date.now()),
      messages: existing?.messages,
      loaded: existing?.loaded || false
    })
  })

  sessions.value = [...merged, ...localOnly]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 80)

  if (!sessions.value.length) {
    const remoteSessionId = await createRemoteSession().catch(() => '')
    sessions.value = [makeSession({ remoteSessionId })]
  }

  const stillActive = findSession(activeSessionId.value)
  if (!stillActive) {
    activeSessionId.value = sessions.value[0].id
  }
  const active = findSession(activeSessionId.value) || sessions.value[0]
  activeSessionId.value = active.id
  messages.value = active.messages
  snapToLatest()
  saveLocalHistory()
  await loadSessionMessagesFromRemote(active, false)
}

const selectSession = async (id) => {
  const target = findSession(id)
  if (!target) return
  activeSessionId.value = target.id
  messages.value = target.messages || [makeMessage('assistant', DEFAULT_WELCOME)]
  snapToLatest()
  historyOpen.value = false
  saveLocalHistory()
  await loadSessionMessagesFromRemote(target, false)
}

const startNewSession = async () => {
  let remoteSessionId = ''
  try {
    remoteSessionId = await createRemoteSession()
  } catch {
    // 允许离线新建本地会话
  }
  const session = makeSession({ remoteSessionId, messages: [makeMessage('assistant', DEFAULT_WELCOME)] })
  sessions.value.unshift(session)
  activeSessionId.value = session.id
  messages.value = session.messages
  snapToLatest()
  historyOpen.value = false
  saveLocalHistory()
}

const requestDeleteSession = (sessionId) => {
  pendingDeleteSessionId.value = sessionId
  deleteConfirmVisible.value = true
  deleteConfirmLoading.value = false
  deleteConfirmError.value = ''
}

const cancelDeleteSession = () => {
  if (deleteConfirmLoading.value) return
  deleteConfirmVisible.value = false
  deleteConfirmError.value = ''
  pendingDeleteSessionId.value = ''
}

const deleteSessionConfirmed = async () => {
  const sessionId = pendingDeleteSessionId.value
  const idx = sessions.value.findIndex((item) => item.id === sessionId)
  if (idx < 0) {
    deleteConfirmVisible.value = false
    pendingDeleteSessionId.value = ''
    return
  }
  deleteConfirmLoading.value = true
  deleteConfirmError.value = ''
  const target = sessions.value[idx]
  try {
    if (target.remoteSessionId) {
      await ensureInitReady()
      await postJson(AI_BRIDGE_PATHS.sessionDelete, {
        token: token.value,
        blade_auth: bladeAuth.value,
        session_id: target.remoteSessionId
      })
    }
  } catch (error) {
    deleteConfirmError.value = `远端删除失败：${String(error)}`
    deleteConfirmLoading.value = false
    return
  }
  const wasActive = sessions.value[idx].id === activeSessionId.value
  sessions.value.splice(idx, 1)
  if (!sessions.value.length) {
    sessions.value = [makeSession()]
  }
  if (wasActive) {
    activeSessionId.value = sessions.value[0].id
    messages.value = sessions.value[0].messages
    snapToLatest()
  }
  saveLocalHistory()
  deleteConfirmLoading.value = false
  deleteConfirmVisible.value = false
  pendingDeleteSessionId.value = ''
}

const streamChatResponse = async (payload, assistantMsg, onSession = () => {}) => {
  const deepSeekMode = isDeepSeekModel(payload.model)
  let doneReceived = false
  let receivedAnyPayload = false
  let deltaBuffer = ''
  let flushTimer = 0
  const flushIntervalMs = 22

  const flushDeltaNow = () => {
    if (!deltaBuffer) return
    assistantMsg.content += deltaBuffer
    assistantMsg.progress = ''
    deltaBuffer = ''
    queueAutoScroll()
  }

  const scheduleDeltaFlush = () => {
    if (flushTimer) return
    flushTimer = window.setTimeout(() => {
      flushTimer = 0
      flushDeltaNow()
      if (!doneReceived && deltaBuffer) {
        scheduleDeltaFlush()
      }
    }, flushIntervalMs)
  }

  const enqueueDelta = (text) => {
    if (!text) return
    deltaBuffer += text
    if (doneReceived) {
      flushDeltaNow()
    } else {
      scheduleDeltaFlush()
    }
  }

  const enqueueDeltaSmart = (text) => {
    const incoming = String(text || '')
    if (!incoming) return
    const currentSnapshot = `${assistantMsg.content}${deltaBuffer}`
    const delta = normalizeStreamIncrement(currentSnapshot, incoming)
    if (!delta) return
    enqueueDelta(delta)
  }

  streamStats.value.active = true
  streamStats.value.lastEvent = 'connect'
  assistantMsg.modelUsed = payload.model
  assistantMsg.thinkStreamMode = false
  assistantMsg.streamCarry = ''
  if (deepSeekMode) {
    assistantMsg.showThinking = true
  }
  const streamAttempts = Math.max(1, AI_BRIDGE_CANDIDATES.length)
  let lastStreamError = null
  for (let attempt = 0; attempt < streamAttempts; attempt += 1) {
    const controller = new AbortController()
    try {
      await requestStreamOnce(payload, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(payload),
        openWhenHidden: true,
        signal: controller.signal,
        async onopen(response) {
          if (!response.ok) {
            throw new Error(`流式连接失败(${response.status})`)
          }
        },
        onmessage(event) {
          const rawCount = String(event.data || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean).length
          streamStats.value.raw += Math.max(1, rawCount)
          const parsedItems = parseStreamEvents(event.data)
          if (!parsedItems.length) return
          for (const parsed of parsedItems) {
            if (parsed.event === 'done') {
              streamStats.value.lastEvent = 'done'
              doneReceived = true
              flushDeltaNow()
              controller.abort()
              return
            }
            if (parsed.event === 'session') {
              streamStats.value.lastEvent = 'session'
              const sid = String(parsed.session_id || '').trim()
              if (sid) onSession(sid)
              continue
            }
            if (parsed.event === 'delta') {
              receivedAnyPayload = true
              streamStats.value.delta += 1
              streamStats.value.lastEvent = 'delta'
              const text = sanitizeStreamText(String(parsed.delta || ''))
              if (text) {
                if (deepSeekMode) {
                  appendDeepSeekChunk(assistantMsg, text, enqueueDeltaSmart)
                } else {
                  enqueueDeltaSmart(text)
                }
              }
              continue
            }
            if (parsed.event === 'thinking') {
              receivedAnyPayload = true
              streamStats.value.lastEvent = 'thinking'
              const text = sanitizeStreamText(String(parsed.delta || ''))
              if (text) {
                if (deepSeekMode) {
                  const delta = normalizeStreamIncrement(assistantMsg.thinking, text)
                  if (delta) {
                    assistantMsg.thinking += delta
                  }
                  assistantMsg.showThinking = true
                } else {
                  enqueueDeltaSmart(text)
                }
              }
              continue
            }
            if (parsed.event === 'progress') {
              receivedAnyPayload = true
              streamStats.value.progress += 1
              streamStats.value.lastEvent = 'progress'
              const text = String(parsed.message || '')
              assistantMsg.progress = text
              continue
            }
            if (parsed.event === 'replace') {
              receivedAnyPayload = true
              streamStats.value.lastEvent = 'replace'
              const text = sanitizeStreamText(String(parsed.content || ''))
              if (text) {
                doneReceived = false
                deltaBuffer = ''
                assistantMsg.content = compactDisplayText(text)
                assistantMsg.thinking = ''
                assistantMsg.progress = ''
                queueAutoScroll()
              }
              continue
            }
            if (parsed.event === 'error') {
              streamStats.value.lastEvent = 'error'
              throw new Error(String(parsed.message || '流式返回错误'))
            }
          }
        },
        onclose() {
          if (!doneReceived && receivedAnyPayload) {
            doneReceived = true
            flushDeltaNow()
            return
          }
          if (!doneReceived) {
            throw new Error('流式连接被提前关闭')
          }
        },
        onerror(error) {
          if (doneReceived) return
          throw error
        }
      })
      lastStreamError = null
      break
    } catch (error) {
      lastStreamError = error
      const aborted = String(error || '').toLowerCase().includes('abort')
      if (doneReceived || aborted) {
        lastStreamError = null
        break
      }
      const canRetry = isNetworkFetchError(error) && !receivedAnyPayload && attempt < streamAttempts - 1
      if (!canRetry) {
        throw error
      }
      rotateBridgeCandidate()
      const retryDelay = AI_RETRY_DELAYS_MS[Math.min(attempt + 1, AI_RETRY_DELAYS_MS.length - 1)] || 200
      await sleep(retryDelay)
    }
  }
  if (lastStreamError) {
    throw lastStreamError
  }
  if (flushTimer) {
    window.clearTimeout(flushTimer)
    flushTimer = 0
  }
  flushDeltaNow()
  assistantMsg.streamCarry = ''
  streamStats.value.active = false
}

const fallbackChatRequest = async (payload) => {
  const normalizedPayload = {
    token: payload?.token || '',
    bladeAuth: payload?.bladeAuth || payload?.blade_auth || '',
    question: payload?.question || '',
    user_attachment: payload?.user_attachment || '',
    model: payload?.model || selectedModel.value,
    session_id: payload?.session_id || ''
  }
  try {
    const response = await postJson(AI_BRIDGE_PATHS.chat, {
      token: normalizedPayload.token,
      blade_auth: normalizedPayload.bladeAuth,
      question: normalizedPayload.question,
      user_attachment: normalizedPayload.user_attachment || '',
      model: normalizedPayload.model,
      session_id: normalizedPayload.session_id || ''
    })
    const data = unwrapApiData(response)
    const parsed = normalizeMathText(parseAiResponseText(data?.data ?? data))
    if (isNoiseMessage(parsed)) return ''
    return parsed
  } catch (error) {
    if (AI_DEBUG) {
      console.debug('[AI] bridge fallbackChat 失败，尝试 invoke 兜底:', error)
    }
    const invokeText = await tryInvokeAiChat(normalizedPayload).catch(() => '')
    const parsedInvoke = normalizeMathText(parseAiResponseText(invokeText))
    if (parsedInvoke && !isNoiseMessage(parsedInvoke)) {
      return parsedInvoke
    }
    throw error
  }
}

const appendTextWithTyping = async (assistantMsg, text) => {
  const normalized = normalizeMathText(String(text || ''))
  if (!normalized) return
  await new Promise((resolve) => {
    let cursor = 0
    const step = normalized.length > 300 ? 8 : 6
    const tick = () => {
      if (cursor >= normalized.length) {
        queueAutoScroll()
        resolve(true)
        return
      }
      assistantMsg.content += normalized.slice(cursor, cursor + step)
      cursor += step
      queueAutoScroll()
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  })
}

const ensureActiveSession = async () => {
  let active = findSession(activeSessionId.value)
  if (!active) {
    await startNewSession()
    active = findSession(activeSessionId.value)
  }
  if (!active.remoteSessionId) {
    active.remoteSessionId = await createRemoteSession().catch(() => '')
  }
  return active
}

const sendMessage = async () => {
  if ((!input.value.trim() && !attachment.value) || isLoading.value) return
  resetStreamStats()
  const userText = input.value.trim()
  const userAttachment = attachment.value
  input.value = ''
  attachment.value = null
  isLoading.value = true

  const userMessage = makeMessage('user', userText || '请分析上传内容', {
    file: userAttachment || null
  })
  messages.value.push(userMessage)

  const assistantMsg = makeMessage('assistant', '', {
    isStreaming: true,
    runtimeStreaming: true,
    thinking: '',
    progress: '',
    modelUsed: selectedModel.value,
    showThinking: isDeepSeekModel(selectedModel.value),
    thinkStreamMode: false,
    streamCarry: ''
  })
  messages.value.push(assistantMsg)
  forceScrollToBottom()
  syncMessagesToActiveSession()

  try {
    if (isTestAccountSession()) {
      await appendTextWithTyping(assistantMsg, buildTestAccountAiReply(userText))
      return
    }
    await ensureInitReady()
    ensureModelSelection()
    const active = await ensureActiveSession()
    let effectiveModel = selectedModel.value
    const payload = {
      token: token.value,
      blade_auth: bladeAuth.value,
      question: userText || (userAttachment ? '请分析上传的文件' : '你好'),
      model: effectiveModel,
      session_id: active.remoteSessionId || '',
      user_attachment: userAttachment?.url || ''
    }
    if (AI_DEBUG) {
      console.debug('[AI] send payload:', payload)
    }
    const modelCandidates = buildModelCandidates(selectedModel.value)
    let streamOk = false
    let streamError = null
    for (const modelCandidate of modelCandidates) {
      payload.model = modelCandidate
      effectiveModel = modelCandidate
      try {
        await streamChatResponse(payload, assistantMsg, (sid) => {
          if (active && !active.remoteSessionId) {
            active.remoteSessionId = sid
          }
        })
        streamOk = true
        break
      } catch (error) {
        streamError = error
        if (isIllegalModelError(error)) {
          continue
        }
        throw error
      }
    }
    if (!streamOk) {
      if (isIllegalModelError(streamError)) {
        throw new Error('当前账号不支持该模型，请切换其他模型后重试。')
      }
      throw streamError || new Error('流式请求失败')
    }
    if (selectedModel.value !== effectiveModel) {
      selectedModel.value = effectiveModel
    }
    assistantMsg.modelUsed = effectiveModel
    if (isAiUnauthorizedText(assistantMsg.content) || isAiUnauthorizedText(assistantMsg.progress)) {
      await initAiSession()
      payload.token = token.value
      payload.blade_auth = bladeAuth.value
      assistantMsg.content = ''
      assistantMsg.thinking = ''
      assistantMsg.progress = ''
      assistantMsg.isStreaming = true
      assistantMsg.runtimeStreaming = true
      await streamChatResponse(payload, assistantMsg, (sid) => {
        if (active && !active.remoteSessionId) {
          active.remoteSessionId = sid
        }
      })
      if (isAiUnauthorizedText(assistantMsg.content) || isAiUnauthorizedText(assistantMsg.progress)) {
        throw new Error('AI 服务鉴权失败，请重新登录后重试')
      }
    }
    if (!assistantMsg.content.trim()) {
      const fallback = await fallbackChatRequest({
        token: token.value,
        bladeAuth: bladeAuth.value,
        question: payload.question,
        model: effectiveModel,
        session_id: payload.session_id,
        user_attachment: payload.user_attachment
      })
      streamStats.value.fallback = true
      streamStats.value.lastEvent = 'fallback'
      if (fallback) {
        await appendTextWithTyping(assistantMsg, fallback)
      } else {
        assistantMsg.content = '未获取到有效回答，请重试。'
      }
    }
  } catch (error) {
    try {
      const active = findSession(activeSessionId.value)
      const fallbackCandidates = buildModelCandidates(selectedModel.value)
      const fallbackModel = fallbackCandidates.find((item) => availableModelSet.value.has(normalizeModelValue(item)))
        || fallbackCandidates[0]
        || 'qwen-max'
      if (selectedModel.value !== fallbackModel) {
        selectedModel.value = fallbackModel
      }
      const fallback = await fallbackChatRequest({
        token: token.value,
        bladeAuth: bladeAuth.value,
        question: userText || '你好',
        model: fallbackModel,
        session_id: active?.remoteSessionId || '',
        user_attachment: userAttachment?.url || ''
      })
      streamStats.value.fallback = true
      streamStats.value.lastEvent = 'fallback-error'
      if (fallback) {
        await appendTextWithTyping(assistantMsg, fallback)
      } else {
        assistantMsg.content = `发送失败：${String(error)}`
      }
    } catch (fallbackError) {
      assistantMsg.content = `发送失败：${String(fallbackError)}`
    }
  } finally {
    streamStats.value.active = false
    assistantMsg.runtimeStreaming = false
    assistantMsg.content = compactDisplayText(assistantMsg.content)
    assistantMsg.thinking = compactDisplayText(assistantMsg.thinking)
    assistantMsg.streamCarry = ''
    assistantMsg.thinkStreamMode = false
    assistantMsg.renderMode = detectRenderMode(assistantMsg.role, assistantMsg.content)
    assistantMsg.isStreaming = false
    assistantMsg.progress = ''
    isLoading.value = false
    syncMessagesToActiveSession()
    saveLocalHistory()
  }
}

const triggerUpload = () => fileInput.value?.click()

const handleFileChange = async (event) => {
  const file = event?.target?.files?.[0]
  if (!file) return
  if (isTestAccountSession()) {
    attachment.value = { name: file.name, url: 'demo://ai-upload-disabled' }
    event.target.value = ''
    return
  }
  if (initStatus.value !== 'success') {
    await initAiSession()
  }
  try {
    const ext = extractFileExtension(file.name)
    if (!AI_ALLOWED_FILE_EXTENSIONS.includes(ext)) {
      throw new Error(`仅支持上传 ${AI_UPLOAD_ACCEPT} 格式文件`)
    }
    if (file.size > AI_MAX_UPLOAD_BYTES) {
      throw new Error('文件大小不能超过 20MB')
    }
    const fileBase64 = await readFileAsBase64(file)
    if (!fileBase64) {
      throw new Error('文件内容为空或读取失败')
    }
    const mime = file.type || AI_MIME_BY_EXT[ext] || 'application/octet-stream'
    let link = ''
    try {
      const res = await postJson(AI_BRIDGE_PATHS.upload, {
        token: token.value,
        blade_auth: bladeAuth.value,
        file_name: file.name,
        file_content: '',
        file_base64: fileBase64,
        file_mime: mime
      })
      const data = unwrapApiData(res)
      link = data?.link || data?.data?.link || ''
    } catch (error) {
      if (AI_DEBUG) {
        console.debug('[AI] bridge 上传失败，尝试 invoke 兜底:', error)
      }
      const invokeRes = await tryInvokeAiUpload({
        token: token.value,
        bladeAuth: bladeAuth.value,
        fileName: file.name,
        fileBase64,
        fileMime: mime
      })
      const data = unwrapApiData(invokeRes)
      link = data?.link || data?.data?.link || ''
    }
    if (!link) {
      throw new Error('上传失败')
    }
    attachment.value = { name: file.name, url: link }
  } catch (error) {
    window.alert(`文件上传失败：${String(error)}`)
  } finally {
    event.target.value = ''
  }
}

const showLoadingBubble = computed(() => isLoading.value && !messages.value.some((m) => m.role === 'assistant' && m.isStreaming))

watch(normalizedModelOptions, ensureModelSelection, { immediate: true })
watch(() => messages.value.length, () => {
  syncMessagesToActiveSession()
  saveLocalHistory()
  syncAutoScroll()
})
watch(() => !!attachment.value, () => {
  nextTick(() => {
    updateLayoutMetrics()
  })
})

watch(historyKey, () => {
  loadLocalHistory()
  initAiSession().then(() => syncRemoteHistory()).catch(() => {})
})

onMounted(async () => {
  await initMarkdownRuntime(6000).catch(() => {})
  loadLocalHistory()
  await initAiSession()
  if (initStatus.value === 'success') {
    try {
      await syncRemoteHistory()
    } catch (error) {
      if (AI_DEBUG) {
        console.debug('[AI] 同步远端历史失败，已回退本地缓存:', error)
      }
    }
  }
  nextTick(() => {
    initViewportHooks()
    snapToLatest()
  })
})

onBeforeUnmount(() => {
  disposeViewportHooks()
})
</script>

<template src="../templates/views/AiChatView.html"></template>

<style src="../styles/views/AiChatView.scoped.css" scoped></style>
