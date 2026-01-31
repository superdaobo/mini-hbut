<script setup>
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { renderMarkdown } from '../utils/markdown.js'

const props = defineProps({
  studentId: String,
  modelOptions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['back'])

const DEFAULT_WELCOME = '您好，我是湖工小实，很高兴与你相遇，请问有什么可以帮您?'
const messages = ref([])
const input = ref('')
const isLoading = ref(false)
const chatContainer = ref(null)
const fileInput = ref(null)
const attachment = ref(null) // { name: '...', url: '...' }
const defaultModelOptions = [
  { label: 'Qwen-Plus', value: 'qwen-plus' },
  { label: 'Qwen-Max', value: 'qwen-max' },
  { label: 'DeepSeek-R1', value: 'deepseek-r1' },
  { label: 'Doubao1.5-Pro', value: 'doubao-1.5-pro' }
]
const normalizedModelOptions = computed(() => {
  if (Array.isArray(props.modelOptions) && props.modelOptions.length) {
    return props.modelOptions
  }
  return defaultModelOptions
})
const selectedModel = ref(normalizedModelOptions.value[0]?.value || 'qwen-max')

// Auth State
const token = ref('')
const bladeAuth = ref('')
const initStatus = ref('loading') // loading, success, error
const initError = ref('')
const historyOpen = ref(false)
const sessions = ref([])
const activeSessionId = ref('')
const STREAM_ENDPOINT = 'http://127.0.0.1:4399/ai_chat_stream'
const AI_DEBUG = (() => {
  try {
    return localStorage.getItem('hbu_ai_debug') === '1'
  } catch {
    return false
  }
})()

const initAiSession = async () => {
  try {
    initStatus.value = 'loading'
    initError.value = ''
    const res = await invoke('hbut_ai_init')
    if (res.success) {
      token.value = res.token
      bladeAuth.value = res.blade_auth
      initStatus.value = 'success'
    } else {
      initStatus.value = 'error'
      initError.value = res.msg || 'Init failed'
    }
  } catch (e) {
    initStatus.value = 'error'
    initError.value = String(e)
  }
}

const HISTORY_LIMIT = 120
const historyKey = computed(() => `hbu_ai_history_${props.studentId || 'guest'}`)

const createSession = (seedMessages) => {
  const now = Date.now()
  return {
    id: `session_${now}_${Math.random().toString(16).slice(2, 8)}`,
    title: '新对话',
    updatedAt: now,
    messages: seedMessages || [{ role: 'assistant', content: DEFAULT_WELCOME }]
  }
}

const updateSessionTitle = (session) => {
  if (!session) return
  const firstUser = session.messages.find((m) => m.role === 'user' && m.content)
  if (firstUser && typeof firstUser.content === 'string') {
    session.title = firstUser.content.trim().slice(0, 20) || session.title
  }
}

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(historyKey.value)
    const parsed = JSON.parse(raw || 'null')
    if (parsed && Array.isArray(parsed.sessions)) {
      sessions.value = parsed.sessions
      activeSessionId.value = parsed.activeId || parsed.sessions[0]?.id || ''
    } else if (Array.isArray(parsed) && parsed.length) {
      const session = createSession(parsed)
      sessions.value = [session]
      activeSessionId.value = session.id
    }
  } catch {
    // ignore
  }
  if (!sessions.value.length) {
    const session = createSession()
    sessions.value = [session]
    activeSessionId.value = session.id
  }
  const active = sessions.value.find((s) => s.id === activeSessionId.value) || sessions.value[0]
  activeSessionId.value = active.id
  messages.value = active.messages || [{ role: 'assistant', content: DEFAULT_WELCOME }]
}

const saveHistory = () => {
  try {
    const active = sessions.value.find((s) => s.id === activeSessionId.value)
    if (active) {
      active.messages = messages.value.slice(-HISTORY_LIMIT)
      active.updatedAt = Date.now()
      updateSessionTitle(active)
    }
    const payload = {
      activeId: activeSessionId.value,
      sessions: sessions.value.slice(0, 50)
    }
    localStorage.setItem(historyKey.value, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

const extractTextFromEvent = (obj) => {
  if (!obj || typeof obj !== 'object') return ''
  if (obj.type === 11 || obj.type === '11') {
    return ''
  }
  if (obj.type === 1 || obj.type === '1') {
    if (typeof obj.content === 'string') return obj.content
  } else if (obj.type != null) {
    return ''
  }
  const data = obj.data
  if (typeof data === 'string') {
    const trimmed = data.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const nested = JSON.parse(trimmed)
        const nestedText = extractTextFromEvent(nested)
        if (nestedText) return nestedText
      } catch {
        // ignore
      }
    }
    return data
  }
  if (data && typeof data === 'object') {
    if (data.type === 11 || data.type === '11') return ''
    if (data.type === 1 || data.type === '1') {
      if (typeof data.content === 'string') return data.content
    } else if (data.type != null) {
      return ''
    }
    for (const key of ['content', 'answer', 'text', 'msg']) {
      if (typeof data[key] === 'string') return data[key]
    }
    const processInfo = data.processInfo
    if (processInfo && typeof processInfo === 'object') {
      if (processInfo.type === 11 || processInfo.type === '11') return ''
      if (processInfo.type === 1 || processInfo.type === '1') {
        if (typeof processInfo.content === 'string') return processInfo.content
      } else if (processInfo.type != null) {
        return ''
      }
      for (const key of ['content', 'answer', 'text', 'msg']) {
        if (typeof processInfo[key] === 'string') return processInfo[key]
      }
    }
  }
  for (const key of ['content', 'answer', 'text', 'msg']) {
    if (typeof obj[key] === 'string') return obj[key]
  }
  if (typeof obj.message === 'string' && !isNoiseMessage(obj.message)) {
    return obj.message
  }
  return ''
}

const parseAiResponseText = (raw) => {
  if (raw == null) return ''
  if (typeof raw !== 'string') return String(raw)
  const trimmed = raw.trim()
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[')
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed)
      const extracted = extractTextFromEvent(obj)
      if (extracted) {
        const decoded = tryDecodeHex(extracted) || extracted
        return decodeHexFragments(stripNoisePrefix(decoded))
      }
    } catch {
      const objs = extractJsonObjects(raw)
      if (objs.length) {
        const parts = []
        for (const item of objs) {
          try {
            const obj = JSON.parse(item)
            const extracted = extractTextFromEvent(obj)
            if (extracted) parts.push(extracted)
          } catch {
            // ignore
          }
        }
        if (parts.length) {
          const joined = parts.join('')
          const decoded = tryDecodeHex(joined) || joined
          return decodeHexFragments(stripNoisePrefix(decoded))
        }
        return ''
      }
      if (looksJson) {
        return ''
      }
    }
  }
  const lines = raw.split(/\r?\n/).filter(Boolean)
  let parsedAny = false
  const parts = []
  for (let line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('data:')) {
      line = trimmed.slice(5).trim()
    }
    if (line === '[DONE]') break
    try {
      const obj = JSON.parse(line)
      parsedAny = true
      const chunk = extractTextFromEvent(obj)
      if (chunk && !isNoiseMessage(chunk)) parts.push(chunk)
    } catch {
      if (!line.startsWith(':') && !line.startsWith('{') && !line.startsWith('[')) {
        if (!isNoiseMessage(line)) parts.push(line)
      }
    }
  }
  if (!parsedAny) return trimTrailingHexNoise(decodeHexFragments(stripNoisePrefix(raw)))
  const joined = parts.join('')
  const decoded = tryDecodeHex(joined)
  return trimTrailingHexNoise(decodeHexFragments(stripNoisePrefix(decoded || joined)))
}

const extractJsonObjects = (raw) => {
  if (!raw || typeof raw !== 'string') return []
  const result = []
  let start = -1
  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (ch === '}' || ch === ']') {
      if (depth > 0) {
        depth -= 1
        if (depth === 0 && start >= 0) {
          result.push(raw.slice(start, i + 1))
          start = -1
        }
      }
    }
  }
  return result
}

const unwrapAiResponse = (resp) => {
  if (resp == null) return ''
  if (typeof resp === 'string') return resp
  if (typeof resp === 'object') {
    if (typeof resp.data === 'string') return resp.data
    if (typeof resp.result === 'string') return resp.result
    if (typeof resp.text === 'string') return resp.text
  }
  return resp
}

const tryDecodeHex = (raw) => {
  if (!raw || typeof raw !== 'string') return ''
  const cleaned = raw.replace(/\s+/g, '')
  if (cleaned.length < 8 || cleaned.length % 2 !== 0) return ''
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return ''
  try {
    const bytes = new Uint8Array(cleaned.match(/../g).map((b) => parseInt(b, 16)))
    const decoded = new TextDecoder('utf-8').decode(bytes)
    if (decoded && decoded.trim()) return decoded
    if (bytes.length % 2 === 0) {
      const decodeUtf16 = (littleEndian) => {
        let result = ''
        for (let i = 0; i < bytes.length; i += 2) {
          const code = littleEndian
            ? bytes[i] | (bytes[i + 1] << 8)
            : (bytes[i] << 8) | bytes[i + 1]
          result += String.fromCharCode(code)
        }
        return result
      }
      const utf16le = decodeUtf16(true)
      if (utf16le && utf16le.trim()) return utf16le
      const utf16be = decodeUtf16(false)
      if (utf16be && utf16be.trim()) return utf16be
    }
    return ''
  } catch {
    return ''
  }
}

const decodeHexFragments = (value) => {
  if (!value || typeof value !== 'string') return ''
  let out = ''
  let buf = ''
  const flush = () => {
    if (buf.length >= 8 && buf.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(buf)) {
      const decoded = tryDecodeHex(buf)
      if (decoded && looksLikeText(decoded)) {
        const result = decoded
        buf = ''
        return result
      }
    }
    const keep = buf
    buf = ''
    return keep
  }
  for (const ch of value) {
    if (/[0-9a-fA-F]/.test(ch)) {
      buf += ch
    } else {
      out += flush()
      out += ch
    }
  }
  out += flush()
  return out
}

const trimTrailingHexNoise = (value) => {
  if (!value || typeof value !== 'string' || value.length < 120) return value || ''
  const trimmed = value.trimEnd()
  const tailWindow = Math.max(0, trimmed.length - Math.floor(trimmed.length / 4))
  const re = /[0-9a-fA-F]{120,}/g
  let lastMatch = null
  let match
  while ((match = re.exec(trimmed)) !== null) {
    if (match.index + match[0].length >= tailWindow) {
      lastMatch = match
    }
  }
  if (lastMatch) {
    const start = lastMatch.index
    const end = start + lastMatch[0].length
    const suffix = trimmed.slice(end)
    if (!suffix.trim() && hasMeaningfulText(trimmed.slice(0, start))) {
      return trimmed.slice(0, start).trimEnd()
    }
  }
  return trimmed
}

const hasMeaningfulText = (text) => {
  if (!text) return false
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  return cjk + latin >= 4
}

const looksLikeText = (text) => {
  if (!text || typeof text !== 'string') return false
  if (text.includes('\uFFFD')) return false
  const hasCjk = /[\u4e00-\u9fff]/.test(text)
  const hasWord = /[A-Za-z0-9]/.test(text)
  return hasCjk || hasWord
}

const stripNoisePrefix = (value) => {
  if (!value || typeof value !== 'string') return ''
  const prefixes = ['操作成功', '请求完成', 'success', '正在阅读文件', '正在读取文件']
  let text = value.trimStart()
  let changed = true
  while (changed) {
    changed = false
    for (const prefix of prefixes) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trimStart()
        changed = true
        break
      }
    }
  }
  return text
}

const isNoiseMessage = (value) => {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed === '操作成功'
    || trimmed === '请求完成'
    || trimmed === 'success'
    || trimmed.startsWith('正在阅读文件')
    || trimmed.startsWith('正在读取文件')
}

const renderMessage = (msg) => {
  if (!msg?.content) return ''
  if (msg.role === 'assistant' && typeof msg.content === 'string' && /^\s*[{[]/.test(msg.content)) {
    const parsed = parseAiResponseText(msg.content)
    if (parsed) {
      return renderMarkdown(parsed)
    }
  }
  return renderMarkdown(msg.content)
}

const skipInitialScroll = ref(true)
const autoScrollEnabled = ref(true)
const showLoadingBubble = computed(() => {
  if (!isLoading.value) return false
  return !messages.value.some((m) => m.role === 'assistant' && !m.content)
})

const handleChatScroll = () => {
  const el = chatContainer.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  autoScrollEnabled.value = distance < 40
}

const resetChatScrollTop = () => {
  const el = chatContainer.value
  if (el) {
    el.scrollTop = 0
  }
}

onMounted(() => {
  loadHistory()
  initAiSession()
  nextTick(() => {
    resetChatScrollTop()
  })
})

// Auto scroll to bottom
watch(messages, () => {
  nextTick(() => {
    if (chatContainer.value) {
      if (skipInitialScroll.value) {
        resetChatScrollTop()
        skipInitialScroll.value = false
        return
      }
      if (autoScrollEnabled.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      }
    }
  })
}, { deep: true })

watch(messages, saveHistory, { deep: true })

watch(historyKey, () => {
  loadHistory()
})

const selectSession = (sessionId) => {
  const target = sessions.value.find((s) => s.id === sessionId)
  if (!target) return
  activeSessionId.value = target.id
  messages.value = target.messages || [{ role: 'assistant', content: DEFAULT_WELCOME }]
  skipInitialScroll.value = true
}

const startNewSession = () => {
  const session = createSession()
  sessions.value.unshift(session)
  activeSessionId.value = session.id
  messages.value = session.messages
  skipInitialScroll.value = true
  historyOpen.value = false
  saveHistory()
}

const deleteSession = (sessionId) => {
  const idx = sessions.value.findIndex((s) => s.id === sessionId)
  if (idx === -1) return
  const confirmed = window.confirm('确认删除该对话记录吗？')
  if (!confirmed) return
  const wasActive = sessions.value[idx].id === activeSessionId.value
  sessions.value.splice(idx, 1)
  if (!sessions.value.length) {
    const session = createSession()
    sessions.value = [session]
    activeSessionId.value = session.id
    messages.value = session.messages
  } else if (wasActive) {
    activeSessionId.value = sessions.value[0].id
    messages.value = sessions.value[0].messages || [{ role: 'assistant', content: DEFAULT_WELCOME }]
  }
  saveHistory()
}

const formatSessionTime = (ts) => {
  const value = ts || Date.now()
  return new Date(value).toLocaleString()
}

watch(normalizedModelOptions, (list) => {
  if (!list?.length) return
  if (!list.find((item) => item.value === selectedModel.value)) {
    selectedModel.value = list[0].value
  }
}, { immediate: true })

const uploadEmptyFile = async () => {
  const res = await invoke('hbut_ai_upload', {
    token: token.value,
    bladeAuth: bladeAuth.value,
    fileContent: '',
    fileName: `empty_${Date.now()}.txt`
  })
  if (!res.success) {
    throw new Error(res.msg || '空文件上传失败')
  }
  return res.link
}

const sendMessage = async () => {
  if ((!input.value.trim() && !attachment.value) || isLoading.value) return

  const userMsg = input.value
  const userAttachment = attachment.value
  
  messages.value.push({
    role: 'user',
    content: userMsg,
    file: userAttachment
  })
  
  input.value = ''
  attachment.value = null
  isLoading.value = true

  try {
    if (initStatus.value !== 'success' || !token.value) {
      await initAiSession()
    }
    if (initStatus.value !== 'success' || !token.value) {
      throw new Error('AI 初始化失败')
    }
    const emptyUploadUrl = await uploadEmptyFile()
    const assistantMsg = { role: 'assistant', content: '', thinking: '', showThinking: false }
    messages.value.push(assistantMsg)
    await streamChatResponse({
      token: token.value,
      bladeAuth: bladeAuth.value,
      question: userMsg || (userAttachment ? '请分析上传的文件' : 'Hello'),
      uploadUrl: userAttachment ? userAttachment.url : emptyUploadUrl,
      model: selectedModel.value
    }, {
      onChunk: (chunk) => {
        if (!chunk) return
        assistantMsg.content += chunk
      },
      onThinking: (chunk) => {
        if (!chunk) return
        assistantMsg.thinking = (assistantMsg.thinking || '') + chunk
      }
    })
    if (!assistantMsg.content.trim()) {
      assistantMsg.content = '（未返回可解析内容）'
    }
  } catch (e) {
    messages.value.push({
      role: 'error',
      content: '发送失败：' + e
    })
  } finally {
    isLoading.value = false
  }
}

const streamChatResponse = async (payload, handlers) => {
  const onChunk = handlers?.onChunk || (() => {})
  const onThinking = handlers?.onThinking || (() => {})
  let gotContent = false
  let gotAny = false
const onChunkWrapped = (chunk) => {
  if (!chunk) return
  if (/^\s*[{[]/.test(chunk)) {
    const parsed = parseAiResponseText(chunk)
    if (!parsed) return
    chunk = parsed
  }
  if (AI_DEBUG) {
    console.debug('[AI] chunk', chunk.slice(0, 120))
  }
  gotContent = true
  gotAny = true
  onChunk(chunk)
}
  const onThinkingWrapped = (chunk) => {
    if (!chunk) return
    if (AI_DEBUG) {
      console.debug('[AI] thinking', chunk.slice(0, 120))
    }
    gotAny = true
    onThinking(chunk)
  }
  try {
    const res = await fetch(STREAM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        token: payload.token,
        blade_auth: payload.bladeAuth,
        question: payload.question,
        upload_url: payload.uploadUrl,
        model: payload.model
      })
    })
    if (!res.ok || !res.body) {
      throw new Error(`Stream failed: ${res.status}`)
    }
    if (AI_DEBUG) {
      console.debug('[AI] stream connected', res.status)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let done = false
    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) {
        buffer += decoder.decode(value, { stream: true })
        if (AI_DEBUG) {
          console.debug('[AI] raw chunk', buffer.slice(0, 200))
        }
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          let raw = line
          if (raw.startsWith('data:')) {
            raw = raw.slice(5).trim()
          }
          if (raw === '[DONE]') {
            return
          }
          if (/^[0-9a-fA-F]{120,}$/.test(raw)) {
            continue
          }
          if (AI_DEBUG) {
            console.debug('[AI] sse line', raw.slice(0, 200))
          }
          handleStreamPayload(raw, onChunkWrapped, onThinkingWrapped)
        }
      }
    }
    if (buffer.trim()) {
      if (AI_DEBUG) {
        console.debug('[AI] tail buffer', buffer.slice(0, 200))
      }
      handleStreamPayload(buffer, onChunkWrapped, onThinkingWrapped)
    }
    if (!gotContent) {
      const response = await invoke('hbut_ai_chat', {
        token: payload.token,
        bladeAuth: payload.bladeAuth,
        question: payload.question,
        uploadUrl: payload.uploadUrl,
        model: payload.model
      })
      const rawResponse = unwrapAiResponse(response)
      const parsedText = parseAiResponseText(rawResponse)
      const fallbackText = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse || '')
      const finalText = parsedText || (fallbackText && !isNoiseMessage(fallbackText) ? fallbackText : '')
      if (AI_DEBUG) {
        console.debug('[AI] fallback', { parsedText: parsedText?.slice?.(0, 200), fallbackText: fallbackText?.slice?.(0, 200) })
      }
      if (finalText) {
        onChunkWrapped(finalText)
      }
    }
  } catch (err) {
    if (AI_DEBUG) {
      console.debug('[AI] stream error, fallback to hbut_ai_chat', err)
    }
    const response = await invoke('hbut_ai_chat', {
      token: payload.token,
      bladeAuth: payload.bladeAuth,
      question: payload.question,
      uploadUrl: payload.uploadUrl,
      model: payload.model
    })
    const rawResponse = unwrapAiResponse(response)
    const parsedText = parseAiResponseText(rawResponse)
    const fallbackText = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse || '')
    if (AI_DEBUG) {
      console.debug('[AI] fallback (error)', { parsedText: parsedText?.slice?.(0, 200), fallbackText: fallbackText?.slice?.(0, 200) })
    }
    onChunkWrapped(parsedText || (fallbackText && !isNoiseMessage(fallbackText) ? fallbackText : '') || '')
  }
}

const handleStreamPayload = (raw, onChunk, onThinking) => {
  if (!raw) return
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') {
      const type = Number(obj.type)
      const content = typeof obj.content === 'string' ? obj.content : ''
      const thinking = typeof obj.thinking === 'string' ? obj.thinking : ''
      if (AI_DEBUG) {
        console.debug('[AI] payload', { type, hasContent: !!content, hasThinking: !!thinking })
      }
      if (type === 11) {
        const cleaned = stripNoisePrefix(thinking)
        if (cleaned) onThinking(cleaned)
        return
      }
      if (type === 1) {
        const cleaned = trimTrailingHexNoise(decodeHexFragments(stripNoisePrefix(content)))
        if (cleaned && !isNoiseMessage(cleaned)) onChunk(cleaned)
        return
      }
    }
  } catch {
    // ignore and fallback to text parser
  }
  const chunk = parseAiResponseText(raw)
  if (chunk && !isNoiseMessage(chunk)) {
    if (AI_DEBUG) {
      console.debug('[AI] parsed fallback chunk', chunk.slice(0, 200))
    }
    onChunk(chunk)
  }
}

const triggerUpload = () => {
  fileInput.value.click()
}

const handleFileChange = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  
  // Read file content (Text only for now as per previous logic, or base64?)
  // Backend expects "file_content" string. If binary, maybe base64?
  // User's example was text file upload. Let's try text.
  // If it's an image, we need base64.
  // For safety, let's treat it as text if small, else warn.
  
  const reader = new FileReader()
  reader.onload = async (event) => {
    const content = event.target.result
    try {
      const res = await invoke('hbut_ai_upload', {
        token: token.value,
        bladeAuth: bladeAuth.value,
        fileContent: content,
        fileName: file.name
      })
      
      if (res.success) {
        attachment.value = {
          name: file.name,
          url: res.link
        }
      } else {
        alert('上传失败: ' + res.msg)
      }
    } catch (err) {
      alert('上传出错: ' + err)
    }
  }
  reader.readAsText(file) // Assuming text based on previous context
  e.target.value = ''
}
</script>

<template>
  <div class="ai-view">
    <!-- Header -->
    <div class="view-header glass-card">
      <button class="back-btn" @click="$emit('back')">
        <span class="icon">&#8592;</span>
        <span class="label">返回</span>
      </button>
      <div class="title-group">
        <h2>校园 AI 助手</h2>
        <span class="sub">智能问答 · 校园服务</span>
      </div>
      <div class="model-select">
        <label>模型</label>
        <select v-model="selectedModel" :disabled="initStatus !== 'success' || isLoading">
          <option v-for="m in normalizedModelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
      <button class="history-btn" @click="historyOpen = !historyOpen">历史</button>
    </div>

    <!-- Content -->
    <div class="chat-area" ref="chatContainer" @scroll="handleChatScroll">
      <div v-if="initStatus === 'loading'" class="status-msg">正在连接 AI 服务...</div>
      <div v-else-if="initStatus === 'error'" class="status-msg error">
        连接失败: {{ initError }}
        <p>请尝试重试或重新登录 One Code Pass</p>
        <button class="retry-btn" @click="initAiSession">重试连接</button>
      </div>
      
      <div v-else class="messages">
        <div 
          v-for="(msg, idx) in messages" 
          :key="idx" 
          class="message-row"
          :class="msg.role"
        >
          <div class="avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="bubble">
            <div v-if="msg.file" class="attachment-preview">
              📄 {{ msg.file.name }}
            </div>
            <div v-if="msg.thinking" class="thinking-block">
              <button class="thinking-toggle" @click="msg.showThinking = !msg.showThinking">
                ????
              </button>
              <div v-if="msg.showThinking" class="thinking-content" v-html="renderMarkdown(msg.thinking)"></div>
            </div>
            <div class="text" v-html="renderMessage(msg)"></div>
          </div>
        </div>
        
        <div v-if="showLoadingBubble" class="message-row assistant loading">
          <div class="avatar">🤖</div>
          <div class="bubble">正在思考...</div>
        </div>
      </div>
    </div>

    <!-- Pre-Input Attachment Indicator -->
    <div v-if="attachment" class="attachment-bar glass-card">
      <span>📎 {{ attachment.name }}</span>
      <button @click="attachment = null">×</button>
    </div>

    <!-- Input Area -->
    <div class="input-area glass-card">
      <button class="attach-btn" @click="triggerUpload" :disabled="isLoading || initStatus !== 'success'">
        ➕
      </button>
      <input 
        type="file" 
        ref="fileInput" 
        style="display: none" 
        @change="handleFileChange"
      />
      
      <input 
        v-model="input" 
        @keyup.enter="sendMessage"
        placeholder="输入问题或上传文件..."
        :disabled="isLoading || initStatus !== 'success'"
      />
      
      <button class="send-btn" @click="sendMessage" :disabled="(!input && !attachment) || isLoading || initStatus !== 'success'">
        发送
      </button>
    </div>

    <!-- History Panel -->
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
          <button class="history-delete" @click.stop="deleteSession(s.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-view {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7fa 0%, #e9edf5 100%);
  padding-top: env(safe-area-inset-top);
  padding-bottom: 0;
  overflow: hidden;
}

.view-header {
  min-height: 64px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  gap: 10px 12px;
}

.title-group {
  display: flex;
  flex-direction: column;
  flex: 1 1 160px;
  min-width: 140px;
}

.title-group h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.title-group .sub {
  font-size: 12px;
  color: #8a8f98;
}

.model-select {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-select label {
  font-size: 12px;
  color: #666;
}

.model-select select {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px 10px;
  background: #fff;
  font-size: 12px;
}

.history-btn {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.8);
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.back-btn .icon {
  font-size: 16px;
}

.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overscroll-behavior: contain;
}

.message-row {
  display: flex;
  gap: 10px;
  width: 100%;
  align-items: flex-start;
  padding: 0;
}

.message-row.user {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.message-row.assistant {
  justify-content: flex-start;
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
  background: white;
  padding: 10px 14px;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.06);
  font-size: 15px;
  line-height: 1.5;
  max-width: calc(100% - 56px);
}
.text {
  white-space: pre-wrap;
  word-break: break-word;
}

.text :deep(p) {
  margin: 0 0 0.5em;
}

.text :deep(p:last-child) {
  margin-bottom: 0;
}

.text :deep(code) {
  background: rgba(0, 0, 0, 0.04);
  padding: 0 4px;
  border-radius: 4px;
}

.text :deep(pre) {
  background: rgba(0, 0, 0, 0.04);
  padding: 10px;
  border-radius: 8px;
  overflow-x: auto;
}

.text :deep(.katex-display) {
  margin: 0.6em 0;
  overflow-x: auto;
}

.thinking-block {
  border: 1px dashed rgba(148, 163, 184, 0.6);
  background: #f8fafc;
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
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
  white-space: pre-wrap;
}

.message-row.user .bubble {
  background: linear-gradient(135deg, #9be76d 0%, #6fdc85 100%);
}

.attachment-preview {
  margin-bottom: 5px;
  font-weight: bold;
  font-size: 0.9em;
  color: #555;
  border-bottom: 1px solid rgba(0,0,0,0.1);
  padding-bottom: 4px;
}

.input-area {
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: white;
  display: flex;
  gap: 10px;
  align-items: center;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
}

.input-area input[type=text] {
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
  font-weight: bold;
  font-size: 1rem;
}

.send-btn:disabled {
  color: #ccc;
}

.attachment-bar {
  padding: 8px 16px;
  background: rgba(255,255,255,0.9);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #eee;
}

.status-msg {
  text-align: center;
  color: #666;
  margin-top: 20px;
}
.status-msg.error {
  color: red;
}

.retry-btn {
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}

.history-panel {
  position: absolute;
  top: 64px;
  right: 12px;
  width: 260px;
  height: calc(100% - 140px);
  background: rgba(255, 255, 255, 0.96);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.16);
  border: 1px solid rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  transform: translateX(110%);
  transition: transform 0.2s ease;
  z-index: 20;
}

.history-panel.open {
  transform: translateX(0);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

.history-header h3 {
  margin: 0;
  font-size: 14px;
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
}

.history-meta {
  font-size: 11px;
  color: #6b7280;
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
</style>
