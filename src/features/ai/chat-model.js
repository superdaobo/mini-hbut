/** AI 对话的模型、消息、附件与流事件纯逻辑。 */

import { renderMarkdown } from '../../utils/markdown.js'



export const DEFAULT_WELCOME = '您好，我是湖工小实，很高兴与你相遇，请问有什么可以帮您?'
export const AI_BRIDGE_CANDIDATES = ['http://127.0.0.1:4399', 'http://localhost:4399']
export const AI_BRIDGE_PATHS = {
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
export const AI_POST_TIMEOUT_MS = 25000
export const AI_PROBE_TIMEOUT_MS = 3200
export const AI_RETRY_DELAYS_MS = [0, 220, 520]
export const hasTauriRuntime = isTauriRuntime()
let activeBridgeIndex = 0
let activeBridgeBase = AI_BRIDGE_CANDIDATES[0]
export const AI_ALLOWED_FILE_EXTENSIONS = ['docx', 'pdf', 'txt', 'md']
export const AI_UPLOAD_ACCEPT = AI_ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')
export const AI_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const AI_MIME_BY_EXT = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown'
}

export const buildTestAccountAiReply = (question = '') => {
  const prompt = String(question || '').trim()
  return [
    '演示账号不会调用外部 AI 服务。',
    prompt ? `你刚才的问题是：${prompt}` : '你可以继续输入问题查看本地演示回复。',
    'TestFlight 审核环境下，此模块只展示界面与历史记录交互。'
  ].join('\n\n')
}

export const defaultModelOptions = [
  { label: 'Qwen-Plus', value: 'qwen-plus' },
  { label: 'Qwen-Max', value: 'qwen-max' },
  { label: 'DeepSeek-R1', value: 'ep-20250207092149-pvc95' },
  { label: 'Doubao1.5-Pro', value: 'ep-20250219175323-5mvmg' }
]
export const MODEL_ID_DEEPSEEK = 'ep-20250207092149-pvc95'
export const MODEL_ID_DOUBAO = 'ep-20250219175323-5mvmg'
export const MODEL_ALIAS_MAP = {
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
export const MODEL_DISPLAY_MAP = {
  'qwen-plus': 'Qwen-Plus',
  'qwen-max': 'Qwen-Max',
  [MODEL_ID_DEEPSEEK]: 'DeepSeek-R1',
  'deepseek-r1': 'DeepSeek-R1',
  [MODEL_ID_DOUBAO]: 'Doubao1.5-Pro',
  'doubao-1.5-pro': 'Doubao1.5-Pro'
}

export const normalizeModelValue = (value) => String(value || '').trim().toLowerCase()
export const normalizeModelToken = (value) => normalizeModelValue(value).replace(/[^a-z0-9]+/g, '')

export const detectModelFamily = (value, label = '') => {
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

export const isDeepSeekModel = (value) => {
  return detectModelFamily(value) === 'deepseek'
}

export const modelDisplayName = (value) => {
  const normalized = normalizeModelValue(value)
  return MODEL_DISPLAY_MAP[normalized] || String(value || '').trim() || '未知模型'
}
export const availableModelSet = computed(() => {
  const set = new Set()
  for (const option of normalizedModelOptions.value || []) {
    const val = normalizeModelValue(option?.value)
    if (val) set.add(val)
  }
  return set
})

export const detectRenderMode = (role, content = '') => {
  if (role !== 'assistant') return 'plain'
  const text = String(content || '').trim()
  if (!text) return 'plain'
  return 'markdown'
}

export const normalizeMessage = (msg = {}) => {
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

export const makeMessage = (role, content = '', extra = {}) => normalizeMessage({
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

export const makeSession = ({
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

export const formatSessionTime = (ts) => new Date(ts || Date.now()).toLocaleString()

export const parseAiResponseText = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value.content || value.text || value.answer || ''
  }
  return String(value)
}

export const extractFileExtension = (fileName = '') => {
  const normalized = String(fileName || '').trim().toLowerCase()
  if (!normalized) return ''
  const idx = normalized.lastIndexOf('.')
  if (idx < 0 || idx === normalized.length - 1) return ''
  return normalized.slice(idx + 1)
}

export const readFileAsBase64 = (file) =>
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

export const NOISE_MESSAGES = ['操作成功', '请求完成', 'success']
export const isLikelyHexNoise = (value) => {
  const compact = String(value || '').replace(/\s+/g, '')
  if (compact.length < 128) return false
  const hexChars = compact.replace(/[^0-9a-f]/gi, '').length
  return hexChars / compact.length > 0.97
}

export const stripHexNoiseRuns = (value) => {
  const text = String(value || '')
  if (!text) return ''
  return text.replace(/[0-9a-fA-F]{80,}/g, (run) => (isLikelyHexNoise(run) ? '' : run))
}

export const isNoiseMessage = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return true
  if (NOISE_MESSAGES.includes(text)) return true
  if (isLikelyHexNoise(text)) return true
  return text.startsWith('正在读取文件') || text.startsWith('正在阅读文件')
}

export const isAiUnauthorizedText = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return false
  return text.includes('请求未授权') || text.includes('unauthorized') || text.includes('401')
}

export const stripCitationMarkers = (value) => {
  const text = String(value || '')
  // 若回复只有 `!!2!!` 这类内容，视为用户显式要求输出，保留原样。
  if (/^\s*!![\s\u00A0]*\d+[\s\u00A0]*!!\s*$/.test(text)) return text
  return text.replace(/!![\s\u00A0]*\d+[\s\u00A0]*!!/g, '')
}

export const sanitizeStreamText = (value) => {
  const stripped = stripHexNoiseRuns(String(value || ''))
  const noCitation = stripCitationMarkers(stripped)
  return noCitation.replace(/\u0000/g, '')
}

export const normalizeMathText = (text) => {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/\$\s+([^$\n]+?)\s+\$/g, (_m, inner) => `$${String(inner).trim()}$`)
    .replace(/\\\s+frac/g, '\\frac')
    .replace(/\\\s+sum/g, '\\sum')
}

export const compactDisplayText = (text) => {
  return sanitizeStreamText(String(text || ''))
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/g, '')
    .trimStart()
}

export const normalizeStreamIncrement = (currentText, incomingText) => {
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

export const renderMessage = (msg) => {
  if (!msg?.content) return ''
  const normalized = compactDisplayText(normalizeMathText(msg.content))
  return renderMarkdown(normalized)
}

export const parseStreamEventObject = (obj) => {
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

export const parseStreamEvents = (raw) => {
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

export const THINK_OPEN_TAG = '<think>'
export const THINK_CLOSE_TAG = '</think>'
export const extractThinkCarryLength = (text) => {
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

export const appendDeepSeekChunk = (assistantMsg, rawChunk, appendContent) => {
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

export const shouldUseThinkingWindow = (msg) => {
  if (!msg || msg.role !== 'assistant') return false
  return isDeepSeekModel(msg.modelUsed)
}
