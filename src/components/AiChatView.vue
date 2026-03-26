<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { initMarkdownRuntime, renderMarkdown } from '../utils/markdown.js'
import { invokeNative, isTauriRuntime } from '../platform/native'

const props = defineProps({
  studentId: String,
  modelOptions: {
    type: Array,
    default: () => []
  }
})

defineEmits(['back'])

const DEFAULT_WELCOME = '您好，我是湖工小实，很高兴与你相遇，请问有什么可以帮您?'
const AI_BRIDGE_CANDIDATES = ['http://127.0.0.1:4399', 'http://localhost:4399']
const AI_BRIDGE_PATHS = {
  health: '/health',
  init: '/ai_init',
  upload: '/ai_upload',
  chat: '/ai_chat',
  stream: '/ai_chat_stream',
  sessionNew: '/ai_chat_session/new',
  sessionHistory: '/ai_chat_session/history',
  sessionMessages: '/ai_chat_session/messages',
  sessionDelete: '/ai_chat_session/delete'
}
const AI_POST_TIMEOUT_MS = 25000
const AI_PROBE_TIMEOUT_MS = 3200
const AI_RETRY_DELAYS_MS = [0, 220, 520]
const hasTauriRuntime = isTauriRuntime()
let activeBridgeIndex = 0
let activeBridgeBase = AI_BRIDGE_CANDIDATES[0]
const AI_ALLOWED_FILE_EXTENSIONS = ['docx', 'pdf', 'txt', 'md']
const AI_UPLOAD_ACCEPT = AI_ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')
const AI_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const AI_MIME_BY_EXT = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown'
}

const defaultModelOptions = [
  { label: 'Qwen-Plus', value: 'qwen-plus' },
  { label: 'Qwen-Max', value: 'qwen-max' },
  { label: 'DeepSeek-R1', value: 'ep-20250207092149-pvc95' },
  { label: 'Doubao1.5-Pro', value: 'ep-20250219175323-5mvmg' }
]
const MODEL_ID_DEEPSEEK = 'ep-20250207092149-pvc95'
const MODEL_ID_DOUBAO = 'ep-20250219175323-5mvmg'
const MODEL_ALIAS_MAP = {
  'qwen-max': ['qwen-max', 'Qwen-Max', 'qwen_max'],
  'qwen-plus': ['qwen-plus', 'Qwen-Plus', 'qwen_plus'],
  'deepseek-r1': [
    'deepseek-r1',
    'DeepSeek-R1',
    'deepseek_r1',
    'deepseek-r1-250120',
    'deepseek-r1-thinking',
    MODEL_ID_DEEPSEEK
  ],
  'doubao-1.5-pro': ['doubao-1.5-pro', 'doubao1.5-pro', 'Doubao1.5-Pro', MODEL_ID_DOUBAO],
  [MODEL_ID_DEEPSEEK]: [MODEL_ID_DEEPSEEK, 'deepseek-r1', 'DeepSeek-R1'],
  [MODEL_ID_DOUBAO]: [MODEL_ID_DOUBAO, 'doubao-1.5-pro', 'doubao1.5-pro', 'Doubao1.5-Pro']
}
const MODEL_DISPLAY_MAP = {
  'qwen-plus': 'Qwen-Plus',
  'qwen-max': 'Qwen-Max',
  [MODEL_ID_DEEPSEEK]: 'DeepSeek-R1',
  'deepseek-r1': 'DeepSeek-R1',
  [MODEL_ID_DOUBAO]: 'Doubao1.5-Pro',
  'doubao-1.5-pro': 'Doubao1.5-Pro'
}

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

const normalizeModelValue = (value) => String(value || '').trim().toLowerCase()
const normalizeModelToken = (value) => normalizeModelValue(value).replace(/[^a-z0-9]+/g, '')

const detectModelFamily = (value, label = '') => {
  const full = `${normalizeModelValue(value)} ${normalizeModelValue(label)}`
  const token = normalizeModelToken(`${value || ''}${label || ''}`)
  if (full.includes('deepseek') || token.includes('deepseek') || full.includes(MODEL_ID_DEEPSEEK.toLowerCase())) {
    return 'deepseek'
  }
  if (full.includes('doubao') || full.includes('豆包') || token.includes('doubao') || full.includes(MODEL_ID_DOUBAO.toLowerCase())) {
    return 'doubao'
  }
  if (full.includes('qwen') || token.includes('qwen')) {
    if (full.includes('max') || token.includes('max')) return 'qwen-max'
    if (full.includes('plus') || token.includes('plus')) return 'qwen-plus'
  }
  return ''
}

const isDeepSeekModel = (value) => {
  return detectModelFamily(value) === 'deepseek'
}

const modelDisplayName = (value) => {
  const normalized = normalizeModelValue(value)
  return MODEL_DISPLAY_MAP[normalized] || String(value || '').trim() || '未知模型'
}
const availableModelSet = computed(() => {
  const set = new Set()
  for (const option of normalizedModelOptions.value || []) {
    const val = normalizeModelValue(option?.value)
    if (val) set.add(val)
  }
  return set
})

const detectRenderMode = (role, content = '') => {
  if (role !== 'assistant') return 'plain'
  const text = String(content || '').trim()
  if (!text) return 'plain'
  return 'markdown'
}

const normalizeMessage = (msg = {}) => {
  const role = msg?.role === 'user' ? 'user' : 'assistant'
  const content = sanitizeStreamText(String(msg?.content || ''))
  const modelUsed = String(msg?.modelUsed || '')
  const runtimeStreaming = Boolean(msg?.runtimeStreaming)
  return {
    ...msg,
    id: msg?.id || `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    role,
    content,
    thinking: sanitizeStreamText(String(msg?.thinking || '')),
    showThinking: Boolean(msg?.showThinking),
    runtimeStreaming,
    isStreaming: runtimeStreaming && Boolean(msg?.isStreaming),
    progress: runtimeStreaming ? String(msg?.progress || '') : '',
    modelUsed,
    thinkStreamMode: Boolean(msg?.thinkStreamMode),
    streamCarry: String(msg?.streamCarry || ''),
    createdAt: Number(msg?.createdAt || Date.now()),
    renderMode: msg?.renderMode || detectRenderMode(role, content)
  }
}

const makeMessage = (role, content = '', extra = {}) => normalizeMessage({
  role,
  content,
  thinking: '',
  showThinking: false,
  isStreaming: false,
  progress: '',
  createdAt: Date.now(),
  renderMode: detectRenderMode(role, content),
  ...extra
})

const makeSession = ({
  id,
  remoteSessionId = '',
  title = '新对话',
  preview = '',
  updatedAt = Date.now(),
  messages: seedMessages,
  loaded = false
} = {}) => ({
  id: id || `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
  remoteSessionId,
  title,
  preview,
  updatedAt,
  loaded,
  messages: Array.isArray(seedMessages) && seedMessages.length
    ? seedMessages.map((item) => normalizeMessage(item))
    : [makeMessage('assistant', DEFAULT_WELCOME)]
})

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

const formatSessionTime = (ts) => new Date(ts || Date.now()).toLocaleString()

const parseAiResponseText = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value.content || value.text || value.answer || ''
  }
  return String(value)
}

const extractFileExtension = (fileName = '') => {
  const normalized = String(fileName || '').trim().toLowerCase()
  if (!normalized) return ''
  const idx = normalized.lastIndexOf('.')
  if (idx < 0 || idx === normalized.length - 1) return ''
  return normalized.slice(idx + 1)
}

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const commaIndex = raw.indexOf(',')
      resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw)
    }
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })

const NOISE_MESSAGES = ['操作成功', '请求完成', 'success']
const isLikelyHexNoise = (value) => {
  const compact = String(value || '').replace(/\s+/g, '')
  if (compact.length < 128) return false
  const hexChars = compact.replace(/[^0-9a-f]/gi, '').length
  return hexChars / compact.length > 0.97
}

const stripHexNoiseRuns = (value) => {
  const text = String(value || '')
  if (!text) return ''
  return text.replace(/[0-9a-fA-F]{80,}/g, (run) => (isLikelyHexNoise(run) ? '' : run))
}

const isNoiseMessage = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return true
  if (NOISE_MESSAGES.includes(text)) return true
  if (isLikelyHexNoise(text)) return true
  return text.startsWith('正在读取文件') || text.startsWith('正在阅读文件')
}

const isAiUnauthorizedText = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return false
  return text.includes('请求未授权') || text.includes('unauthorized') || text.includes('401')
}

const stripCitationMarkers = (value) => {
  const text = String(value || '')
  // 若回复只有 `!!2!!` 这类内容，视为用户显式要求输出，保留原样。
  if (/^\s*!![\s\u00A0]*\d+[\s\u00A0]*!!\s*$/.test(text)) return text
  return text.replace(/!![\s\u00A0]*\d+[\s\u00A0]*!!/g, '')
}

const sanitizeStreamText = (value) => {
  const stripped = stripHexNoiseRuns(String(value || ''))
  const noCitation = stripCitationMarkers(stripped)
  return noCitation.replace(/\u0000/g, '')
}

const normalizeMathText = (text) => {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/\$\s+([^$\n]+?)\s+\$/g, (_m, inner) => `$${String(inner).trim()}$`)
    .replace(/\\\s+frac/g, '\\frac')
    .replace(/\\\s+sum/g, '\\sum')
}

const compactDisplayText = (text) => {
  return sanitizeStreamText(String(text || ''))
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/g, '')
    .trimStart()
}

const normalizeStreamIncrement = (currentText, incomingText) => {
  const current = String(currentText || '')
  const incoming = String(incomingText || '')
  if (!incoming) return ''
  if (!current) return incoming
  if (incoming === current) return ''
  if (incoming.startsWith(current)) {
    return incoming.slice(current.length)
  }
  if (current.endsWith(incoming)) return ''
  const maxOverlap = Math.min(current.length, incoming.length)
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (current.slice(-overlap) === incoming.slice(0, overlap)) {
      return incoming.slice(overlap)
    }
  }
  return incoming
}

const renderMessage = (msg) => {
  if (!msg?.content) return ''
  const normalized = compactDisplayText(normalizeMathText(msg.content))
  return renderMarkdown(normalized)
}

const initAiSession = async () => {
  initStatus.value = 'loading'
  initError.value = ''
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

const parseStreamEventObject = (obj) => {
  if (!obj || typeof obj !== 'object') return null
  if (obj?.event) {
    const eventName = String(obj.event)
    if (eventName === 'delta') {
      const delta = sanitizeStreamText(String(
        obj.delta ??
        obj.content ??
        obj.text ??
        (typeof obj.data === 'string' ? obj.data : '')
      ))
      if (!delta || isNoiseMessage(delta) || isLikelyHexNoise(delta)) return null
      return { event: 'delta', delta }
    }
    if (eventName === 'thinking') {
      const delta = sanitizeStreamText(String(obj.delta ?? obj.thinking ?? obj.content ?? ''))
      if (!delta || isNoiseMessage(delta) || isLikelyHexNoise(delta)) return null
      return { event: 'thinking', delta }
    }
    if (eventName === 'progress') {
      const message = sanitizeStreamText(String(obj.message ?? obj.msg ?? obj.content ?? ''))
      if (!message || isNoiseMessage(message)) return null
      return { event: 'progress', message }
    }
    if (eventName === 'session') {
      return { event: 'session', session_id: obj.session_id ?? obj.sessionId ?? '' }
    }
    if (eventName === 'done' || eventName === 'error') {
      return obj
    }
    const fallback = sanitizeStreamText(parseAiResponseText(obj))
    if (fallback?.trim() && !isNoiseMessage(fallback)) return { event: 'delta', delta: fallback }
    return null
  }
  const type = Number(obj?.type)
  if (type === 1) {
    const content = sanitizeStreamText(typeof obj?.content === 'string' ? obj.content : '')
    const thinking = sanitizeStreamText(typeof obj?.thinking === 'string' ? obj.thinking : '')
    if (content && !isNoiseMessage(content)) return { event: 'delta', delta: content }
    if (thinking && !isNoiseMessage(thinking)) return { event: 'thinking', delta: thinking }
    return null
  }
  if (type === 4 || type === 12) {
    const content = sanitizeStreamText(typeof obj?.content === 'string' ? obj.content : '')
    if (!content || isNoiseMessage(content) || isLikelyHexNoise(content)) return null
    return { event: 'delta', delta: content }
  }
  if (type === 13 || type === 14 || type === 23) return null
  if (type === -1) {
    const content = sanitizeStreamText(typeof obj?.content === 'string' ? obj.content : '')
    if (!content || isNoiseMessage(content) || isLikelyHexNoise(content)) return null
    return { event: 'replace', content }
  }
  if (type === 11) {
    const thinking = sanitizeStreamText(typeof obj?.thinking === 'string' ? obj.thinking : '')
    if (thinking && !isNoiseMessage(thinking) && !isLikelyHexNoise(thinking)) return { event: 'thinking', delta: thinking }
    return null
  }
  if (type === 24) {
    const msg = sanitizeStreamText(obj?.message || obj?.msg || obj?.processInfo?.content || '')
    if (isNoiseMessage(msg)) return null
    return { event: 'progress', message: msg }
  }
  if (Number(obj?.finish) === 1) return { event: 'done' }
  const fallback = sanitizeStreamText(parseAiResponseText(obj))
  if (fallback?.trim() && !isNoiseMessage(fallback) && !isLikelyHexNoise(fallback)) return { event: 'delta', delta: fallback }
  return null
}

const parseStreamEvents = (raw) => {
  if (!raw || typeof raw !== 'string') return []
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!rows.length) return []

  const out = []
  for (const row of rows) {
    const line = row.startsWith('data:') ? row.slice(5).trim() : row
    if (!line || line === 'keep-alive' || line.startsWith('event:') || line.startsWith(':')) continue
    if (line === '[DONE]') {
      out.push({ event: 'done' })
      continue
    }
    try {
      const obj = JSON.parse(line)
      const parsed = parseStreamEventObject(obj)
      if (parsed) out.push(parsed)
      continue
    } catch {
      const cleaned = sanitizeStreamText(line)
      if (!isNoiseMessage(cleaned) && !isLikelyHexNoise(cleaned)) {
        out.push({ event: 'delta', delta: cleaned })
      }
    }
  }
  return out
}

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'
const extractThinkCarryLength = (text) => {
  const source = String(text || '').toLowerCase()
  if (!source) return 0
  let best = 0
  for (const token of [THINK_OPEN_TAG, THINK_CLOSE_TAG]) {
    const maxLen = Math.min(token.length - 1, source.length)
    for (let len = maxLen; len >= 1; len -= 1) {
      if (token.startsWith(source.slice(source.length - len))) {
        best = Math.max(best, len)
        break
      }
    }
  }
  return best
}

const appendDeepSeekChunk = (assistantMsg, rawChunk, appendContent) => {
  const chunk = sanitizeStreamText(String(rawChunk || ''))
  if (!chunk && !assistantMsg.streamCarry) return
  let text = `${assistantMsg.streamCarry || ''}${chunk}`
  assistantMsg.streamCarry = ''
  if (!text) return

  const appendThinking = (segment) => {
    const delta = normalizeStreamIncrement(assistantMsg.thinking, segment)
    if (delta) assistantMsg.thinking += delta
  }

  let cursor = 0
  while (cursor < text.length) {
    const rest = text.slice(cursor)
    const restLower = rest.toLowerCase()
    const openIdx = restLower.indexOf(THINK_OPEN_TAG)
    const closeIdx = restLower.indexOf(THINK_CLOSE_TAG)
    if (openIdx === -1 && closeIdx === -1) break
    let marker = THINK_OPEN_TAG
    let markerPos = openIdx
    if (openIdx === -1 || (closeIdx !== -1 && closeIdx < openIdx)) {
      marker = THINK_CLOSE_TAG
      markerPos = closeIdx
    }
    const absolute = cursor + markerPos
    const segment = text.slice(cursor, absolute)
    if (segment) {
      if (assistantMsg.thinkStreamMode) {
        appendThinking(segment)
      } else {
        appendContent(segment)
      }
    }
    assistantMsg.thinkStreamMode = marker === THINK_OPEN_TAG
    cursor = absolute + marker.length
  }

  const tail = text.slice(cursor)
  if (!tail) return
  const carryLen = extractThinkCarryLength(tail)
  if (carryLen > 0) {
    const body = tail.slice(0, tail.length - carryLen)
    if (body) {
      if (assistantMsg.thinkStreamMode) {
        appendThinking(body)
      } else {
        appendContent(body)
      }
    }
    assistantMsg.streamCarry = tail.slice(tail.length - carryLen)
    return
  }
  if (assistantMsg.thinkStreamMode) {
    appendThinking(tail)
  } else {
    appendContent(tail)
  }
}

const shouldUseThinkingWindow = (msg) => {
  if (!msg || msg.role !== 'assistant') return false
  return isDeepSeekModel(msg.modelUsed)
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

<template>
  <div ref="rootEl" class="ai-view" :class="{ 'has-attachment': !!attachment }">
    <div class="ai-header glass-card">
      <div class="header-top-row">
        <div class="header-left-actions">
          <button class="back-btn" @click="$emit('back')">
            <span class="icon">&#8592;</span>
            <span class="label">返回</span>
          </button>
          <button class="history-btn" @click="historyOpen = !historyOpen">历史</button>
        </div>
        <div class="model-select">
          <IOSSelect v-model="selectedModel" :disabled="isLoading || initStatus !== 'success'">
            <option v-for="m in normalizedModelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </IOSSelect>
        </div>
      </div>
    </div>

    <div class="stream-debug glass-card">
      <span class="debug-pill" :class="{ active: streamStats.active }">
        {{ streamStats.active ? '流式进行中' : '流式空闲' }}
      </span>
      <span>raw {{ streamStats.raw }}</span>
      <span>delta {{ streamStats.delta }}</span>
      <span>progress {{ streamStats.progress }}</span>
      <span>fallback {{ streamStats.fallback ? '1' : '0' }}</span>
      <span>last {{ streamStats.lastEvent }}</span>
    </div>

    <div class="chat-area" ref="chatContainer" @scroll="handleChatScroll">
      <div v-if="initStatus === 'loading'" class="status-msg">正在连接 AI 服务...</div>
      <div v-else-if="initStatus === 'error'" class="status-msg error">
        <div>连接失败：{{ initError }}</div>
        <button class="retry-btn" @click="initAiSession">重试连接</button>
      </div>
      <div v-else class="messages">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-row"
          :class="msg.role"
        >
          <div class="avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="bubble">
            <div v-if="msg.file" class="attachment-preview">📄 {{ msg.file.name }}</div>
            <div v-if="shouldUseThinkingWindow(msg) && (msg.thinking || msg.isStreaming)" class="thinking-window">
              <div class="thinking-window-header">
                <span class="thinking-window-title">{{ modelDisplayName(msg.modelUsed) }} 思考流</span>
                <span v-if="msg.isStreaming" class="thinking-window-state">流式中</span>
              </div>
              <div v-if="msg.thinking" class="thinking-content" v-html="renderMarkdown(msg.thinking)"></div>
              <div v-else class="thinking-placeholder">正在生成思考内容...</div>
            </div>
            <div v-else-if="msg.thinking" class="thinking-block">
              <button class="thinking-toggle" @click="msg.showThinking = !msg.showThinking">
                深度思考
              </button>
              <div v-if="msg.showThinking" class="thinking-content" v-html="renderMarkdown(msg.thinking)"></div>
            </div>
            <div v-if="msg.progress && msg.isStreaming" class="progress-hint">{{ msg.progress }}</div>
            <div v-if="msg.role === 'assistant' && msg.isStreaming && !msg.content" class="stream-loading">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="stream-label">正在生成回答</span>
            </div>
            <div
              v-if="msg.role === 'assistant'"
              class="text rich-text"
              v-html="renderMessage(msg)"
            ></div>
            <div v-else class="text plain-text" v-text="msg.content"></div>
          </div>
        </div>

        <div v-if="showLoadingBubble" class="message-row assistant loading">
          <div class="avatar">🤖</div>
          <div class="bubble">正在思考...</div>
        </div>
      </div>
    </div>

    <div v-if="attachment" ref="attachmentBarEl" class="attachment-bar glass-card">
      <span>📎 {{ attachment.name }}</span>
      <button @click="attachment = null">×</button>
    </div>

    <div ref="inputBarEl" class="input-area glass-card">
      <button class="attach-btn" @click="triggerUpload" :disabled="isLoading || initStatus !== 'success'">➕</button>
      <input ref="fileInput" type="file" :accept="AI_UPLOAD_ACCEPT" style="display: none" @change="handleFileChange">
      <input
        v-model="input"
        type="text"
        @input="handleInputTyping"
        @keyup.enter="sendMessage"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
        :disabled="isLoading || initStatus !== 'success'"
        placeholder="输入问题或上传文件..."
      >
      <button class="send-btn" :disabled="(!input && !attachment) || isLoading || initStatus !== 'success'" @click="sendMessage">发送</button>
    </div>

    <div v-if="historyOpen" class="history-backdrop" @click="historyOpen = false"></div>
    <div class="history-panel" :class="{ open: historyOpen }">
      <div class="history-header">
        <h3>历史记录</h3>
        <button class="history-close" @click="historyOpen = false">×</button>
      </div>
      <button class="new-chat-btn" @click="startNewSession">新对话</button>
      <div class="history-list">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="history-item"
          :class="{ active: s.id === activeSessionId }"
          @click="selectSession(s.id)"
        >
          <div class="history-title">{{ s.title || '新对话' }}</div>
          <div class="history-meta">{{ formatSessionTime(s.updatedAt) }}</div>
          <div v-if="s.preview" class="history-preview">{{ s.preview }}</div>
          <button class="history-delete" @click.stop="requestDeleteSession(s.id)">删除</button>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirmVisible" class="confirm-backdrop">
      <div class="confirm-dialog glass-card">
        <h4>删除历史对话</h4>
        <p>删除后将同步清理云端会话记录，无法恢复。</p>
        <div v-if="deleteConfirmError" class="confirm-error">{{ deleteConfirmError }}</div>
        <div class="confirm-actions">
          <button class="confirm-cancel" :disabled="deleteConfirmLoading" @click="cancelDeleteSession">取消</button>
          <button class="confirm-danger" :disabled="deleteConfirmLoading" @click="deleteSessionConfirmed">
            {{ deleteConfirmLoading ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-view {
  --ai-input-height: 88px;
  --ai-attachment-height: 0px;
  --ai-keyboard-offset: 0px;
  --ai-safe-top: env(safe-area-inset-top, 0px);
  --ai-safe-bottom: env(safe-area-inset-bottom, 0px);
  --ai-bottom-offset: var(--ai-keyboard-offset, 0px);
  height: calc(var(--app-vh, 1vh) * 100);
  max-height: calc(var(--app-vh, 1vh) * 100);
  min-height: calc(var(--app-vh, 1vh) * 100);
  display: flex;
  flex-direction: column;
  position: relative;
  background: linear-gradient(135deg, #f5f7fa 0%, #e9edf5 100%);
  padding-top: 0;
  padding-bottom: 8px;
  box-sizing: border-box;
  overflow: hidden;
}

.stream-debug {
  margin: 8px 14px 0;
  padding: 6px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11px;
  color: #475569;
}

.debug-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  color: #334155;
  font-weight: 600;
}

.debug-pill.active {
  background: rgba(59, 130, 246, 0.2);
  color: #1d4ed8;
}

.ai-header {
  min-height: 58px;
  margin: 8px 14px 0;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.header-top-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  gap: 10px;
  min-width: 0;
}

.header-left-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
}

.model-select {
  flex: 0 0 auto;
  margin-left: auto;
  width: clamp(180px, 34vw, 300px);
  min-width: 180px;
  max-width: min(58vw, 320px);
}

.model-select :deep(.ios26-select-trigger) {
  min-height: 42px;
}

.model-select :deep(.ios26-select-text) {
  font-size: 14px;
}

.history-btn {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.82);
  border-radius: 999px;
  padding: 0 14px;
  min-height: 42px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  min-height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.8);
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.chat-area {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 0 16px;
  scroll-padding-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 14px;
  min-height: min-content;
}

.message-row {
  display: flex;
  gap: 10px;
  width: 100%;
  align-items: flex-start;
}

.message-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 36px;
  height: 36px;
  background: #eef1f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.message-row.assistant .avatar {
  background: #e1f5fe;
}

.message-row.user .avatar {
  background: #c8e6c9;
}

.bubble {
  background: #fff;
  padding: 10px 14px;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
  font-size: 15px;
  line-height: 1.5;
  max-width: calc(100% - 56px);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bubble > :last-child {
  margin-bottom: 0 !important;
}

.message-row.user .bubble {
  background: linear-gradient(135deg, #9be76d 0%, #6fdc85 100%);
}

.text {
  width: 100%;
  word-break: break-word;
  margin: 0;
}

.plain-text {
  white-space: pre-wrap;
  line-height: 1.45;
  margin: 0;
}

.rich-text {
  white-space: normal;
  line-height: 1.5;
}

.rich-text :deep(p) {
  margin: 0 !important;
}

.rich-text :deep(p + p) {
  margin-top: 0.42em;
}

.rich-text :deep(*:last-child) {
  margin-bottom: 0 !important;
}

.rich-text :deep(ul),
.rich-text :deep(ol) {
  margin: 0.36em 0 0.24em 1.2em;
  padding: 0;
}

.rich-text :deep(li) {
  margin: 0.18em 0;
}

.rich-text :deep(li > p) {
  margin: 0;
}

.rich-text :deep(h1),
.rich-text :deep(h2),
.rich-text :deep(h3),
.rich-text :deep(h4),
.rich-text :deep(h5),
.rich-text :deep(h6) {
  margin: 0.3em 0 0.25em;
  line-height: 1.35;
}

.rich-text :deep(pre) {
  background: rgba(0, 0, 0, 0.04);
  padding: 10px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.32em 0;
}

.rich-text :deep(code) {
  background: rgba(0, 0, 0, 0.04);
  padding: 0 4px;
  border-radius: 4px;
}

.rich-text :deep(.katex-display) {
  margin: 0.3em 0;
  overflow-x: auto;
}

.thinking-block {
  border: 1px dashed rgba(148, 163, 184, 0.6);
  background: #f8fafc;
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
}

.thinking-window {
  border: 1px solid rgba(99, 102, 241, 0.22);
  background: linear-gradient(180deg, rgba(238, 242, 255, 0.9), rgba(241, 245, 249, 0.92));
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 4px;
}

.thinking-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 8px;
}

.thinking-window-title {
  font-size: 12px;
  font-weight: 700;
  color: #4338ca;
}

.thinking-window-state {
  font-size: 11px;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.14);
  padding: 2px 8px;
  border-radius: 999px;
}

.thinking-toggle {
  border: none;
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}

.thinking-content {
  margin-top: 6px;
  font-size: 13px;
  color: #475569;
  white-space: normal;
  margin-bottom: 0;
}

.thinking-content :deep(p) {
  margin: 0 !important;
}

.thinking-placeholder {
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}

.progress-hint {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}

.stream-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #93c5fd;
  animation: aiDot 1s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.15s;
}

.dot:nth-child(3) {
  animation-delay: 0.3s;
}

.stream-label {
  margin-left: 2px;
}

@keyframes aiDot {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.attachment-preview {
  margin-bottom: 5px;
  font-weight: 700;
  font-size: 0.9em;
  color: #555;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding-bottom: 4px;
}

.attachment-bar {
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 14px;
  margin: 8px 12px 0;
  flex: 0 0 auto;
  box-sizing: border-box;
}

.input-area {
  padding: 10px 14px calc(10px + var(--ai-safe-bottom));
  background: rgba(255, 255, 255, 0.96);
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 8px 12px 8px;
  flex: 0 0 auto;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  box-shadow: 0 -2px 16px rgba(15, 23, 42, 0.08);
  box-sizing: border-box;
  min-height: 72px;
}

.input-area input[type='text'] {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 20px;
  outline: none;
  background: #f8fafc;
}

.attach-btn, .send-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 8px;
}

.send-btn {
  color: #007bff;
  font-weight: 700;
  font-size: 1rem;
}

.send-btn:disabled {
  color: #ccc;
}

.status-msg {
  text-align: center;
  color: #666;
  margin-top: 20px;
}

.status-msg.error {
  color: #dc2626;
}

.retry-btn {
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}

.history-backdrop {
  position: fixed;
  left: 0;
  right: 0;
  top: calc(var(--ai-safe-top) + 88px);
  bottom: calc(var(--ai-input-height) + var(--ai-attachment-height) + 16px);
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(2px);
  z-index: 140;
}

.history-panel {
  position: fixed;
  top: calc(var(--ai-safe-top) + 94px);
  left: 10px;
  width: min(360px, calc(100vw - 20px));
  bottom: calc(var(--ai-input-height) + var(--ai-attachment-height) + 16px);
  height: auto;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  transform: translateX(-104%);
  transition: transform 0.22s ease;
  z-index: 150;
  overflow: hidden;
}

.history-panel.open {
  transform: translateX(0);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.history-close {
  border: none;
  background: #f3f4f6;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
}

.new-chat-btn {
  margin: 10px 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  text-align: left;
  padding: 8px 10px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: #f8fafc;
  cursor: pointer;
  position: relative;
}

.history-item.active {
  border-color: #93c5fd;
  background: #eef2ff;
}

.history-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
  max-width: calc(100% - 52px);
}

.history-meta {
  font-size: 11px;
  color: #6b7280;
}

.history-preview {
  margin-top: 4px;
  font-size: 12px;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-delete {
  position: absolute;
  top: 6px;
  right: 8px;
  border: none;
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  border-radius: 10px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 260;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.confirm-dialog {
  width: min(380px, calc(100vw - 24px));
  border-radius: 16px;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.95);
}

.confirm-dialog h4 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}

.confirm-dialog p {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #475569;
}

.confirm-error {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  color: #b91c1c;
  background: rgba(254, 226, 226, 0.8);
}

.confirm-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-actions button {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}

.confirm-cancel {
  background: rgba(148, 163, 184, 0.2);
  color: #334155;
}

.confirm-danger {
  background: #ef4444;
  color: #fff;
  font-weight: 600;
}

:global(html[data-theme='graphite_night']) .ai-view {
  background:
    radial-gradient(135% 120% at 6% 0%, rgba(37, 99, 235, 0.14), transparent 42%),
    linear-gradient(180deg, #07111f 0%, #0d1726 52%, #132132 100%);
  color: #e2e8f0;
}

:global(html[data-theme='graphite_night']) .ai-view .ai-header,
:global(html[data-theme='graphite_night']) .ai-view .stream-debug,
:global(html[data-theme='graphite_night']) .ai-view .attachment-bar,
:global(html[data-theme='graphite_night']) .ai-view .input-area,
:global(html[data-theme='graphite_night']) .ai-view .history-panel,
:global(html[data-theme='graphite_night']) .ai-view .confirm-dialog,
:global(html[data-theme='graphite_night']) .ai-view .thinking-window {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.84)) !important;
  border-color: color-mix(in oklab, var(--ui-primary) 28%, rgba(148, 163, 184, 0.28)) !important;
  color: #dbe6f7 !important;
}

:global(html[data-theme='graphite_night']) .ai-view .back-btn,
:global(html[data-theme='graphite_night']) .ai-view .history-btn,
:global(html[data-theme='graphite_night']) .ai-view .new-chat-btn,
:global(html[data-theme='graphite_night']) .ai-view .history-close,
:global(html[data-theme='graphite_night']) .ai-view .retry-btn,
:global(html[data-theme='graphite_night']) .ai-view .confirm-cancel {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.76), rgba(30, 41, 59, 0.72)) !important;
  color: #e7f0ff !important;
  border-color: color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.24)) !important;
}

:global(html[data-theme='graphite_night']) .ai-view .debug-pill {
  background: rgba(15, 23, 42, 0.68) !important;
  color: #dbe6f7 !important;
}

:global(html[data-theme='graphite_night']) .ai-view .debug-pill.active,
:global(html[data-theme='graphite_night']) .ai-view .thinking-window-state {
  background: rgba(37, 99, 235, 0.22) !important;
  color: #bfdbfe !important;
}

:global(html[data-theme='graphite_night']) .ai-view .message-row.assistant .bubble {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.88)) !important;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.22));
  color: #e2e8f0 !important;
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.24);
}

:global(html[data-theme='graphite_night']) .ai-view .message-row.user .bubble {
  color: #08111f !important;
}

:global(html[data-theme='graphite_night']) .ai-view .thinking-window-title,
:global(html[data-theme='graphite_night']) .ai-view .history-title,
:global(html[data-theme='graphite_night']) .ai-view .confirm-dialog h4 {
  color: #f8fbff !important;
}

:global(html[data-theme='graphite_night']) .ai-view .thinking-content,
:global(html[data-theme='graphite_night']) .ai-view .thinking-placeholder,
:global(html[data-theme='graphite_night']) .ai-view .progress-hint,
:global(html[data-theme='graphite_night']) .ai-view .stream-loading,
:global(html[data-theme='graphite_night']) .ai-view .attachment-preview,
:global(html[data-theme='graphite_night']) .ai-view .history-meta,
:global(html[data-theme='graphite_night']) .ai-view .history-preview,
:global(html[data-theme='graphite_night']) .ai-view .confirm-dialog p {
  color: #9fb0cb !important;
}

:global(html[data-theme='graphite_night']) .ai-view .history-item {
  background: rgba(15, 23, 42, 0.78) !important;
  border-color: transparent !important;
}

:global(html[data-theme='graphite_night']) .ai-view .history-item.active {
  background: rgba(30, 64, 175, 0.22) !important;
  border-color: rgba(96, 165, 250, 0.36) !important;
}

:global(html[data-theme='graphite_night']) .ai-view .input-area input[type='text'] {
  background: rgba(15, 23, 42, 0.74) !important;
  color: #e2e8f0 !important;
  border-color: rgba(148, 163, 184, 0.24) !important;
}

:global(html[data-theme='graphite_night']) .ai-view .input-area input[type='text']::placeholder {
  color: #9fb0cb !important;
}

:global(html[data-theme='graphite_night']) .ai-view .rich-text :deep(pre),
:global(html[data-theme='graphite_night']) .ai-view .rich-text :deep(code) {
  background: rgba(8, 15, 28, 0.72) !important;
  color: #e2e8f0 !important;
}

@media (max-width: 768px) {
  .ai-header {
    min-height: 54px;
    margin: 8px 10px 0;
    padding: 8px 10px;
  }

  .header-top-row {
    min-height: 38px;
    gap: 6px;
  }

  .header-left-actions {
    gap: 6px;
  }

  .history-btn {
    padding: 0 10px;
    min-height: 38px;
    font-size: 12px;
  }

  .model-select :deep(.ios26-select-trigger) {
    min-height: 38px;
    padding: 0 12px;
  }

  .model-select :deep(.ios26-select-text) {
    font-size: 13px;
  }

  .model-select {
    width: clamp(160px, 46vw, 228px);
    max-width: 56vw;
    min-width: 160px;
  }

  .history-backdrop {
    top: calc(var(--ai-safe-top) + 82px);
  }

  .history-panel {
    top: calc(var(--ai-safe-top) + 88px);
  }
}
</style>
