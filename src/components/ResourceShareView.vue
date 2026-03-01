<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, markRaw, watch } from 'vue'
import { fetchRemoteConfig } from '../utils/remote_config'
import { openExternal } from '../utils/external_link'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { detectRuntime } from '../platform/runtime'
import { importModuleFromCdn, loadScriptFromCdn, loadStyleFromCdn } from '../utils/cdn_loader'

const emit = defineEmits(['back'])

const DIR_CACHE_TTL_MS = 15 * 60 * 1000
const DIR_CACHE_STORAGE_KEY = 'hbut_resource_dir_cache_v4'
const DIRECT_URL_CACHE_TTL_MS = 10 * 60 * 1000
const DEFAULT_WEBDAV_ENDPOINT = 'https://mini-hbut-chaoxing-webdav.hf.space'

const endpoint = ref(DEFAULT_WEBDAV_ENDPOINT)
const username = ref('mini-hbut')
const password = ref('mini-hbut')
const officePreviewProxy = ref('https://view.officeapps.live.com/op/embed.aspx?src=')
const enabled = ref(true)

const currentPath = ref('/')
const items = ref([])
const loadingConfig = ref(true)
const loadingList = ref(false)
const loadingPreview = ref(false)
const errorMessage = ref('')
const totalCount = ref(0)

const showPreview = ref(false)
const isViewerFullscreen = ref(false)
const previewFrameKey = ref(0)
const previewTitle = ref('')
const previewPath = ref('')
const previewKind = ref('unknown')
const previewText = ref('')
const previewUrl = ref('')
const previewHint = ref('')
const previewNeedAuth = ref(false)
const previewProxyFallbackUsed = ref(false)
const officePreviewCandidates = ref([])
const pdfPreviewCandidates = ref([])
const previewUrlCandidates = ref([])
const previewObjectUrl = ref('')
const nativeBlobFallbackTried = ref(false)
const pdfCanvasRef = ref(null)
const pdfCanvasWrapRef = ref(null)
const pdfDocumentRef = shallowRef(null)
const pdfCurrentPage = ref(1)
const pdfPageCount = ref(1)
const pdfRenderPending = ref(false)
const pdfZoom = ref(1)
const isPdfPanning = ref(false)
const PDF_ZOOM_MIN = 0.6
const PDF_ZOOM_MAX = 3
const PDF_ZOOM_STEP = 0.2
const pdfPanState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  startScrollLeft: 0,
  startScrollTop: 0
}

const previewPlayerHostRef = ref(null)
let previewPlayerInstance = null
let pdfjsRuntime = null
let xgPlayerCtor = null

const CDN_ASSETS = {
  xgplayerScript: [
    'https://cdn.jsdelivr.net.cn/npm/xgplayer@3.0.22/dist/index.min.js',
    'https://unpkg.com/xgplayer@3.0.22/dist/index.min.js',
    'https://cdn.jsdelivr.net/npm/xgplayer@3.0.22/dist/index.min.js'
  ],
  xgplayerStyle: [
    'https://cdn.jsdelivr.net.cn/npm/xgplayer@3.0.22/dist/index.min.css',
    'https://unpkg.com/xgplayer@3.0.22/dist/index.min.css',
    'https://cdn.jsdelivr.net/npm/xgplayer@3.0.22/dist/index.min.css'
  ],
  pdfjsModule: [
    'https://cdn.jsdelivr.net.cn/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs',
    'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.mjs',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs'
  ],
  pdfjsWorker: [
    'https://cdn.jsdelivr.net.cn/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs',
    'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs'
  ]
}

const runtimeType = detectRuntime()
const runtimeIsTauri = runtimeType === 'tauri' || isTauriRuntime()
const runtimeIsCapacitor = runtimeType === 'capacitor'

const bridgeBaseCandidates = runtimeIsTauri
  ? ['http://127.0.0.1:4399', 'http://localhost:4399', '/bridge']
  : ['/bridge']
const bridgeBase = bridgeBaseCandidates[0]

const normalizePath = (path) => {
  const text = String(path || '').replaceAll('\\', '/').trim()
  if (!text) return '/'
  const withLeading = text.startsWith('/') ? text : `/${text}`
  const normalized = withLeading.replace(/\/{2,}/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) return normalized.slice(0, -1)
  return normalized
}

const joinPath = (basePath, name) => {
  const base = normalizePath(basePath)
  const child = String(name || '').trim()
  if (!child) return base
  return normalizePath(base === '/' ? `/${child}` : `${base}/${child}`)
}

const encodeDavPath = (path) =>
  normalizePath(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')

const getDavUrl = (path) => `${String(endpoint.value || '').replace(/\/+$/, '')}/dav${encodeDavPath(path)}`

const getDavAuthUrl = (path) => {
  const base = String(endpoint.value || '').trim()
  if (!base) return getDavUrl(path)
  try {
    const url = new URL(base)
    url.username = String(username.value || '')
    url.password = String(password.value || '')
    const basePath = (url.pathname || '/').replace(/\/+$/, '')
    url.pathname = `${basePath}/dav${encodeDavPath(path)}`
    return url.toString()
  } catch {
    return getDavUrl(path)
  }
}

const getProxyUrl = (path) => {
  const query = new URLSearchParams({
    endpoint: endpoint.value,
    path: normalizePath(path),
    username: username.value,
    password: password.value
  })
  return `${bridgeBase}/resource_share/proxy?${query.toString()}`
}

const getProxyUrlByBase = (base, path) => {
  const query = new URLSearchParams({
    endpoint: endpoint.value,
    path: normalizePath(path),
    username: username.value,
    password: password.value
  })
  return `${base}/resource_share/proxy?${query.toString()}`
}

const buildProxyCandidates = (path) => {
  const normalized = normalizePath(path)
  return [...new Set(bridgeBaseCandidates.map((base) => getProxyUrlByBase(base, normalized)).filter(Boolean))]
}

const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'])
const videoExts = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv'])
const audioExts = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'])
const textExts = new Set(['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'log'])
const wordExts = new Set(['doc', 'docx'])
const sheetExts = new Set(['xls', 'xlsx'])
const slideExts = new Set(['ppt', 'pptx'])
const officeExts = new Set([...wordExts, ...sheetExts, ...slideExts])

const getExt = (name) => {
  const text = String(name || '')
  const idx = text.lastIndexOf('.')
  if (idx < 0) return ''
  return text.slice(idx + 1).toLowerCase()
}

const formatSize = (size) => {
  const n = Number(size || 0)
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n < 1024) return `${n.toFixed(0)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const formatTime = (value) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

const getItemIcon = (item) => {
  if (item?.isDir) return '📁'
  const ext = getExt(item?.name)
  if (videoExts.has(ext)) return '🎬'
  if (audioExts.has(ext)) return '🎵'
  if (imageExts.has(ext)) return '🖼️'
  if (ext === 'pdf') return '📕'
  if (wordExts.has(ext)) return '📝'
  if (sheetExts.has(ext)) return '📊'
  if (slideExts.has(ext)) return '📽️'
  if (textExts.has(ext)) return '📄'
  return '📦'
}

const getItemTypeLabel = (item) => {
  if (item?.isDir) return '文件夹'
  const ext = getExt(item?.name)
  if (videoExts.has(ext)) return '视频'
  if (audioExts.has(ext)) return '音频'
  if (imageExts.has(ext)) return '图片'
  if (ext === 'pdf') return 'PDF'
  if (wordExts.has(ext)) return '文档'
  if (sheetExts.has(ext)) return '表格'
  if (slideExts.has(ext)) return 'PPT'
  if (textExts.has(ext)) return '文本'
  return ext ? ext.toUpperCase() : '文件'
}

const getTypeClass = (item) => {
  if (item?.isDir) return 'folder'
  const ext = getExt(item?.name)
  if (videoExts.has(ext)) return 'video'
  if (audioExts.has(ext)) return 'audio'
  if (imageExts.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (wordExts.has(ext)) return 'word'
  if (sheetExts.has(ext)) return 'sheet'
  if (slideExts.has(ext)) return 'slide'
  if (textExts.has(ext)) return 'text'
  return 'other'
}

const fetchWithTimeout = async (url, init = {}, timeoutMs = 25000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const makeAuthHeader = () => {
  const raw = `${username.value}:${password.value}`
  return `Basic ${btoa(unescape(encodeURIComponent(raw)))}`
}

const parseJsonStorage = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

const saveJsonStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const dirCache = ref(parseJsonStorage(DIR_CACHE_STORAGE_KEY))
const directUrlCache = new Map()

const textByLocalName = (node, localName) => {
  const list = node?.getElementsByTagNameNS?.('*', localName)
  if (!list || !list.length) return ''
  return String(list[0].textContent || '').trim()
}

const parseHrefPath = (href) => {
  try {
    const base = `${String(endpoint.value || '').replace(/\/+$/, '')}/`
    const url = new URL(String(href || ''), base)
    const marker = '/dav'
    const idx = url.pathname.indexOf(marker)
    const rawPath = idx >= 0 ? url.pathname.slice(idx + marker.length) : url.pathname
    return normalizePath(decodeURIComponent(rawPath || '/'))
  } catch {
    return normalizePath(href || '/')
  }
}

const parsePropfindXml = (xmlText, targetPath) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('目录响应解析失败')
  }
  const responses = [...doc.getElementsByTagNameNS('*', 'response')]
  const normalizedTarget = normalizePath(targetPath)
  const parsed = []
  for (const node of responses) {
    const href = textByLocalName(node, 'href')
    const path = parseHrefPath(href)
    if (!path || path === normalizedTarget) continue

    const prop = node.getElementsByTagNameNS('*', 'prop')[0]
    const display = textByLocalName(prop || node, 'displayname')
    const contentType = textByLocalName(prop || node, 'getcontenttype')
    const contentLength = Number(textByLocalName(prop || node, 'getcontentlength') || 0)
    const modified = textByLocalName(prop || node, 'getlastmodified')
    const isDir = !!(prop && prop.getElementsByTagNameNS('*', 'collection').length > 0)
    const fallbackName = decodeURIComponent(path.split('/').filter(Boolean).pop() || '')
    const name = display || fallbackName || (isDir ? '未命名文件夹' : '未命名文件')
    parsed.push({
      name,
      path,
      isDir,
      size: Number.isFinite(contentLength) ? contentLength : 0,
      modified,
      contentType
    })
  }
  parsed.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  return parsed
}

const breadcrumbItems = computed(() => {
  const full = normalizePath(currentPath.value)
  const parts = full.split('/').filter(Boolean)
  const result = [{ label: '根目录', path: '/' }]
  let running = ''
  for (const part of parts) {
    running = joinPath(running || '/', part)
    result.push({ label: part, path: running })
  }
  return result
})

const canGoParent = computed(() => normalizePath(currentPath.value) !== '/')

const getParentPath = (path) => {
  const normalized = normalizePath(path)
  if (normalized === '/') return '/'
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}` : '/'
}

const fetchDirectoryViaNative = async (path) => {
  const payload = await invokeNative('resource_share_list_dir_native', {
    req: {
      endpoint: endpoint.value,
      path: normalizePath(path),
      username: username.value,
      password: password.value,
      depth: 1
    }
  })
  const xml = String(payload?.xml || '')
  if (!xml) {
    throw new Error('原生目录接口返回空响应')
  }
  return xml
}

const listDirectory = async (path, force = false) => {
  const targetPath = normalizePath(path)
  errorMessage.value = ''
  loadingList.value = true
  try {
    const now = Date.now()
    const cached = dirCache.value[targetPath]
    if (!force && cached && now - Number(cached.time || 0) <= DIR_CACHE_TTL_MS && Array.isArray(cached.items)) {
      currentPath.value = targetPath
      items.value = cached.items
      totalCount.value = cached.items.length
      return
    }

    if (runtimeIsTauri) {
      try {
        const xml = await fetchDirectoryViaNative(targetPath)
        const parsed = parsePropfindXml(xml, targetPath)
        currentPath.value = targetPath
        items.value = parsed
        totalCount.value = parsed.length
        dirCache.value[targetPath] = { time: now, items: parsed }
        saveJsonStorage(DIR_CACHE_STORAGE_KEY, dirCache.value)
        return
      } catch (nativeError) {
        console.warn('[ResourceShare] native list_dir failed, fallback fetch:', nativeError?.message || nativeError)
      }
    }

    const res = await fetchWithTimeout(
      getDavUrl(targetPath),
      {
        method: 'PROPFIND',
        headers: {
          Authorization: makeAuthHeader(),
          Depth: '1'
        }
      },
      28000
    )

    if (!res.ok) {
      throw new Error(`目录加载失败（HTTP ${res.status}）`)
    }

    const parsed = parsePropfindXml(await res.text(), targetPath)
    currentPath.value = targetPath
    items.value = parsed
    totalCount.value = parsed.length
    dirCache.value[targetPath] = { time: now, items: parsed }
    saveJsonStorage(DIR_CACHE_STORAGE_KEY, dirCache.value)
  } catch (error) {
    if (error?.name === 'AbortError') {
      errorMessage.value = '目录加载超时，请重试'
    } else {
      errorMessage.value = error?.message || '目录加载失败'
    }
  } finally {
    loadingList.value = false
  }
}

const buildOfficePreviewUrl = (fileUrl) => {
  const proxy = String(officePreviewProxy.value || '').trim()
  if (!proxy) return ''
  if (proxy.includes('{url}')) return proxy.replace('{url}', encodeURIComponent(fileUrl))
  if (proxy.endsWith('=') || proxy.endsWith('src=')) return `${proxy}${encodeURIComponent(fileUrl)}`
  const joiner = proxy.includes('?') ? '&' : '?'
  return `${proxy}${joiner}src=${encodeURIComponent(fileUrl)}`
}

const buildOfficePreviewCandidates = (fileUrl) => {
  const primary = buildOfficePreviewUrl(fileUrl)
  const result = []
  if (primary) result.push(primary)
  if (primary.includes('/op/view.aspx')) {
    result.push(primary.replace('/op/view.aspx', '/op/embed.aspx'))
  } else if (primary.includes('/op/embed.aspx')) {
    result.push(primary.replace('/op/embed.aspx', '/op/view.aspx'))
  }
  return [...new Set(result.filter(Boolean))]
}

const parseDirectUrlExpireAt = (url) => {
  try {
    const parsed = new URL(url)
    const exp = parsed.searchParams.get('exp')
    if (exp && /^\d+$/.test(exp)) return Number(exp) * 1000
  } catch {
    // ignore
  }
  return Date.now() + DIRECT_URL_CACHE_TTL_MS
}

const withCacheBustUrl = (url) => {
  const text = String(url || '').trim()
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_rt=${Date.now()}`
}

const buildPreviewUrlCandidates = (path, signed) => {
  const normalized = normalizePath(path)
  const candidates = []
  const signedUrl = String(signed?.url || '').trim()
  if (signedUrl) candidates.push(signedUrl)
  candidates.push(getDavAuthUrl(normalized))
  for (const proxyUrl of buildProxyCandidates(normalized)) {
    candidates.push(proxyUrl)
  }
  candidates.push(getDavUrl(normalized))
  return [...new Set(candidates.filter(Boolean))]
}

const shiftNextPreviewCandidate = () => {
  while (previewUrlCandidates.value.length) {
    const next = String(previewUrlCandidates.value.shift() || '')
    if (!next) continue
    if (next === previewUrl.value) continue
    setPreviewUrl(next)
    return next
  }
  return ''
}

const decodeBase64Bytes = (base64) => {
  const raw = atob(String(base64 || ''))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i)
  }
  return out
}

const releasePreviewObjectUrl = () => {
  if (!previewObjectUrl.value) return
  try {
    URL.revokeObjectURL(previewObjectUrl.value)
  } catch {
    // ignore
  }
  previewObjectUrl.value = ''
}

const createPreviewObjectUrl = (base64, contentType) => {
  const bytes = decodeBase64Bytes(base64)
  const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' })
  releasePreviewObjectUrl()
  const nextUrl = URL.createObjectURL(blob)
  previewObjectUrl.value = nextUrl
  return nextUrl
}

const fetchDirectUrlByNativeInvoke = async (path) => {
  const payload = await invokeNative('resource_share_direct_url_native', {
    req: {
      endpoint: endpoint.value,
      path: normalizePath(path),
      username: username.value,
      password: password.value
    }
  })
  return {
    url: String(payload?.url || ''),
    needAuth: !!payload?.needAuth
  }
}

const fetchDirectUrlFromBridge = async (params) => {
  const query = new URLSearchParams(params).toString()
  let lastError = null
  for (const base of bridgeBaseCandidates) {
    try {
      const response = await fetchWithTimeout(`${base}/resource_share/direct_url?${query}`, {}, 20000)
      if (!response.ok) {
        throw new Error(`获取直链失败（HTTP ${response.status}）`)
      }
      const payload = await response.json().catch(() => ({}))
      return payload
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('获取直链失败')
}

const getSignedDirectUrl = async (path) => {
  const normalized = normalizePath(path)
  const cacheKey = `${endpoint.value}|${normalized}`
  const cached = directUrlCache.get(cacheKey)
  if (cached?.url && Number(cached.expireAt || 0) > Date.now() + 5000) {
    return { url: cached.url, needAuth: !!cached.needAuth }
  }

  if (runtimeIsTauri) {
    try {
      const nativePayload = await fetchDirectUrlByNativeInvoke(normalized)
      const nativeDirect = String(nativePayload.url || '').trim()
      const nativeNeedAuth = !!nativePayload.needAuth
      if (nativeDirect) {
        const expireAt = parseDirectUrlExpireAt(nativeDirect)
        directUrlCache.set(cacheKey, { url: nativeDirect, expireAt, needAuth: nativeNeedAuth })
        return { url: nativeDirect, needAuth: nativeNeedAuth }
      }
      throw new Error('未获取到可用直链')
    } catch (nativeError) {
      console.warn('[ResourceShare] invoke direct_url failed, fallback to auth url:', nativeError?.message || nativeError)
      const direct = getDavAuthUrl(normalized)
      const expireAt = Date.now() + DIRECT_URL_CACHE_TTL_MS
      directUrlCache.set(cacheKey, { url: direct, expireAt, needAuth: false })
      return { url: direct, needAuth: false }
    }
  }

  if (runtimeIsCapacitor) {
    const direct = getDavAuthUrl(normalized)
    const expireAt = Date.now() + DIRECT_URL_CACHE_TTL_MS
    directUrlCache.set(cacheKey, { url: direct, expireAt, needAuth: false })
    return { url: direct, needAuth: false }
  }

  const fallback = getDavUrl(normalized)
  directUrlCache.set(cacheKey, { url: fallback, expireAt: Date.now() + 3 * 60 * 1000, needAuth: true })
  return { url: fallback, needAuth: true }
}

const fetchNativeResourcePayload = async (path, maxBytes = undefined) => {
  if (!runtimeIsTauri) return null
  return invokeNative('resource_share_fetch_file_payload_native', {
    req: {
      endpoint: endpoint.value,
      path: normalizePath(path),
      username: username.value,
      password: password.value,
      maxBytes
    }
  })
}

const applyNativeBlobPreview = async (kind) => {
  if (!runtimeIsTauri || !previewPath.value) return false
  const isMedia = kind === 'video' || kind === 'audio'
  const isPdf = kind === 'pdf'
  const maxBytes = isMedia ? 120 * 1024 * 1024 : 40 * 1024 * 1024
  const payload = await fetchNativeResourcePayload(previewPath.value, maxBytes)
  const base64 = String(payload?.base64 || '').trim()
  if (!base64) return false
  const defaultType = isPdf ? 'application/pdf' : isMedia ? 'video/mp4' : 'application/octet-stream'
  const contentType = String(payload?.contentType || defaultType).trim() || defaultType
  const blobUrl = createPreviewObjectUrl(base64, contentType)
  setPreviewUrl(blobUrl)
  previewUrlCandidates.value = []
  return true
}

const resolvePreviewPlayableUrl = (path, signed) => {
  if (!path) return String(signed?.url || '')
  if (!signed?.needAuth) return String(signed?.url || '')
  if (runtimeIsTauri) return getDavAuthUrl(path)
  if (runtimeIsCapacitor) return getDavAuthUrl(path)
  return getProxyUrl(path)
}

const fetchTextWithAuth = async (path) => {
  const response = await fetchWithTimeout(
    getDavUrl(path),
    {
      method: 'GET',
      headers: {
        Authorization: makeAuthHeader()
      }
    },
    35000
  )
  if (!response.ok) {
    throw new Error(`文本读取失败（HTTP ${response.status}）`)
  }
  return response.text()
}

const closePreview = async () => {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen()
    } catch {
      // ignore
    }
  }
  destroyPreviewPlayer()
  showPreview.value = false
  isViewerFullscreen.value = false
  previewTitle.value = ''
  previewPath.value = ''
  previewKind.value = 'unknown'
  previewText.value = ''
  previewUrl.value = ''
  previewHint.value = ''
  previewNeedAuth.value = false
  previewProxyFallbackUsed.value = false
  officePreviewCandidates.value = []
  pdfPreviewCandidates.value = []
  previewUrlCandidates.value = []
  pdfDocumentRef.value = null
  pdfCurrentPage.value = 1
  pdfPageCount.value = 1
  pdfRenderPending.value = false
  pdfZoom.value = 1
  isPdfPanning.value = false
  pdfPanState.active = false
  pdfPanState.pointerId = null
  nativeBlobFallbackTried.value = false
  releasePreviewObjectUrl()
  previewFrameKey.value += 1
}

const setPreviewUrl = (url) => {
  const next = String(url || '')
  if (previewObjectUrl.value && previewObjectUrl.value !== next) {
    releasePreviewObjectUrl()
  }
  previewUrl.value = next
  previewFrameKey.value += 1
}

const onPreviewFrameError = () => {
  if (previewKind.value !== 'office') return
  const next = officePreviewCandidates.value.shift()
  if (next) {
    setPreviewUrl(next)
    previewHint.value = 'Office 预览线路已自动切换，正在重试...'
    return
  }
  previewHint.value = 'Office 在线预览失败，请点击下载后查看'
}

const ensurePdfRuntime = async () => {
  if (pdfjsRuntime) return pdfjsRuntime
  let pdfjs = null
  try {
    pdfjs = await importModuleFromCdn({
      cacheKey: 'pdfjs-dist-runtime',
      urls: CDN_ASSETS.pdfjsModule
    })
  } catch {
    pdfjs = await importModuleFromCdn({
      cacheKey: 'pdfjs-dist-runtime',
      urls: CDN_ASSETS.pdfjsModule.map((url) => withCacheBustUrl(url))
    })
  }
  pdfjs.GlobalWorkerOptions.workerSrc = CDN_ASSETS.pdfjsWorker[0]
  pdfjsRuntime = markRaw(pdfjs)
  return pdfjsRuntime
}

const ensureXgplayerRuntime = async () => {
  if (xgPlayerCtor) return xgPlayerCtor
  try {
    await loadStyleFromCdn({
      cacheKey: 'xgplayer-style',
      urls: CDN_ASSETS.xgplayerStyle
    })
  } catch {
    await loadStyleFromCdn({
      cacheKey: 'xgplayer-style',
      urls: CDN_ASSETS.xgplayerStyle.map((url) => withCacheBustUrl(url))
    })
  }
  let runtime = null
  try {
    runtime = await loadScriptFromCdn({
      cacheKey: 'xgplayer-script',
      urls: CDN_ASSETS.xgplayerScript,
      resolveGlobal: () =>
        window?.Player || window?.XGPlayer || window?.xgplayer || window?.xgPlayer
    })
  } catch {
    runtime = await loadScriptFromCdn({
      cacheKey: 'xgplayer-script',
      urls: CDN_ASSETS.xgplayerScript.map((url) => withCacheBustUrl(url)),
      resolveGlobal: () =>
        window?.Player || window?.XGPlayer || window?.xgplayer || window?.xgPlayer
    })
  }
  xgPlayerCtor = runtime
  return xgPlayerCtor
}

const renderPdfPage = async () => {
  if (previewKind.value !== 'pdf' || !pdfDocumentRef.value || !pdfCanvasRef.value) return
  if (pdfRenderPending.value) return
  pdfRenderPending.value = true
  try {
    const canvas = pdfCanvasRef.value
    const page = await pdfDocumentRef.value.getPage(pdfCurrentPage.value)
    const baseViewport = page.getViewport({ scale: 1 })
    const wrapWidth = Math.max((canvas.parentElement?.clientWidth || 0) - 24, 320)
    const fitScale = Math.max(0.4, wrapWidth / baseViewport.width)
    const scale = fitScale * pdfZoom.value
    const viewport = page.getViewport({ scale })
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvasContext: context, viewport }).promise
  } finally {
    pdfRenderPending.value = false
  }
}

const openPdfWithCandidates = async (urls) => {
  const runtime = await ensurePdfRuntime()
  let lastErr = ''
  for (let i = 0; i < urls.length; i += 1) {
    const candidate = urls[i]
    try {
      const response = await fetchWithTimeout(candidate, {}, 60000)
      if (!response.ok) {
        throw new Error(`PDF 获取失败（HTTP ${response.status}）`)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      const loadingTask = runtime.getDocument({
        data: bytes,
        useSystemFonts: true,
        isEvalSupported: false
      })
      const doc = await loadingTask.promise
      pdfDocumentRef.value = markRaw(doc)
      pdfCurrentPage.value = 1
      pdfPageCount.value = doc.numPages || 1
      pdfZoom.value = 1
      setPreviewUrl(candidate)
      pdfPreviewCandidates.value = urls.slice(i + 1)
      return
    } catch (error) {
      lastErr = error?.message || '未知错误'
    }
  }
  throw new Error(lastErr || 'PDF 预览失败')
}

const prevPdfPage = async () => {
  if (!pdfDocumentRef.value || pdfCurrentPage.value <= 1) return
  pdfCurrentPage.value -= 1
  await renderPdfPage()
}

const nextPdfPage = async () => {
  if (!pdfDocumentRef.value || pdfCurrentPage.value >= pdfPageCount.value) return
  pdfCurrentPage.value += 1
  await renderPdfPage()
}

const pdfZoomText = computed(() => `${Math.round(pdfZoom.value * 100)}%`)

const clampPdfZoom = (zoom) => Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom))

const setPdfZoom = async (zoom) => {
  const next = clampPdfZoom(zoom)
  if (Math.abs(next - pdfZoom.value) < 0.001) return
  pdfZoom.value = next
  await renderPdfPage()
}

const zoomInPdf = async () => {
  await setPdfZoom(pdfZoom.value + PDF_ZOOM_STEP)
}

const zoomOutPdf = async () => {
  await setPdfZoom(pdfZoom.value - PDF_ZOOM_STEP)
}

const resetPdfZoom = async () => {
  await setPdfZoom(1)
}

const onPdfPanPointerDown = (event) => {
  if (previewKind.value !== 'pdf') return
  const wrap = pdfCanvasWrapRef.value
  if (!wrap) return
  if (event.pointerType === 'touch') return
  if (event.button !== undefined && event.button !== 0) return

  pdfPanState.active = true
  pdfPanState.pointerId = event.pointerId ?? null
  pdfPanState.startX = event.clientX
  pdfPanState.startY = event.clientY
  pdfPanState.startScrollLeft = wrap.scrollLeft
  pdfPanState.startScrollTop = wrap.scrollTop
  isPdfPanning.value = true

  if (wrap.setPointerCapture && event.pointerId !== undefined) {
    try {
      wrap.setPointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }
  event.preventDefault()
}

const onPdfPanPointerMove = (event) => {
  if (!pdfPanState.active) return
  if (pdfPanState.pointerId !== null && event.pointerId !== pdfPanState.pointerId) return
  const wrap = pdfCanvasWrapRef.value
  if (!wrap) return
  const dx = event.clientX - pdfPanState.startX
  const dy = event.clientY - pdfPanState.startY
  wrap.scrollLeft = pdfPanState.startScrollLeft - dx
  wrap.scrollTop = pdfPanState.startScrollTop - dy
  event.preventDefault()
}

const onPdfPanPointerUp = (event) => {
  if (!pdfPanState.active) return
  const wrap = pdfCanvasWrapRef.value
  if (wrap?.releasePointerCapture && event.pointerId !== undefined) {
    try {
      wrap.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }
  pdfPanState.active = false
  pdfPanState.pointerId = null
  isPdfPanning.value = false
}

const destroyPreviewPlayer = () => {
  if (!previewPlayerInstance) return
  try {
    previewPlayerInstance.destroy()
  } catch {
    // ignore
  }
  previewPlayerInstance = null
}

const initPreviewPlayer = async () => {
  if (previewKind.value !== 'video' && previewKind.value !== 'audio') return
  if (!showPreview.value || loadingPreview.value || !previewUrl.value) return

  const PlayerCtor = await ensureXgplayerRuntime()
  if (!PlayerCtor) {
    previewHint.value = '播放器运行时加载失败，请稍后重试'
    return
  }

  await nextTick()
  const host = previewPlayerHostRef.value
  if (!host) return

  destroyPreviewPlayer()

  const isAudio = previewKind.value === 'audio'
  previewPlayerInstance = markRaw(new PlayerCtor({
    id: 'resource-xgplayer-host',
    url: previewUrl.value,
    lang: 'zh-cn',
    autoplay: false,
    playsinline: true,
    videoInit: true,
    cssFullscreen: true,
    closeVideoClick: true,
    fluid: !isAudio,
    width: '100%',
    height: isAudio ? 92 : '100%',
    volume: 0.8,
    pip: !isAudio,
    rotateFullscreen: false,
    poster: '',
    ignores: isAudio ? ['fullscreen', 'cssfullscreen', 'pip', 'download'] : ['download'],
    controls: {
      mode: 'flex',
      initShow: true
    }
  }))

  previewPlayerInstance.on?.('error', () => {
    onPreviewMediaError()
  })
}

const onPreviewMediaError = () => {
  if (previewKind.value !== 'video' && previewKind.value !== 'audio') return
  const next = shiftNextPreviewCandidate()
  if (next) {
    previewProxyFallbackUsed.value = true
    previewHint.value = '当前线路不可用，已切换备用线路重试播放'
    return
  }
  if (runtimeIsTauri && !nativeBlobFallbackTried.value) {
    nativeBlobFallbackTried.value = true
    previewHint.value = '正在切换本地安全通道加载媒体...'
    void applyNativeBlobPreview(previewKind.value)
      .then((ok) => {
        if (ok) {
          previewHint.value = '已切换本地安全通道播放'
          return
        }
        previewHint.value = '当前文件无法在线播放，请点击下载后用系统播放器打开'
      })
      .catch((error) => {
        previewHint.value = `媒体预览失败：${error?.message || '未知错误'}`
      })
    return
  }
  previewHint.value = '当前文件无法在线播放，请点击下载后用系统播放器打开'
}

const onPreviewImageError = () => {
  if (previewKind.value !== 'image') return
  const next = shiftNextPreviewCandidate()
  if (next) {
    previewHint.value = '图片加载失败，已自动切换备用线路'
    return
  }
  if (runtimeIsTauri && !nativeBlobFallbackTried.value) {
    nativeBlobFallbackTried.value = true
    previewHint.value = '正在切换本地安全通道加载图片...'
    void applyNativeBlobPreview('image')
      .then((ok) => {
        if (ok) {
          previewHint.value = '已切换本地安全通道预览图片'
          return
        }
        previewHint.value = '图片预览失败，请点击下载后查看'
      })
      .catch((error) => {
        previewHint.value = `图片预览失败：${error?.message || '未知错误'}`
      })
    return
  }
  previewHint.value = '图片预览失败，请点击下载后查看'
}

const preparePreview = async (item) => {
  const ext = getExt(item.name)
  previewTitle.value = item.name
  previewPath.value = item.path
  previewHint.value = ''
  previewText.value = ''
  previewUrl.value = ''
  previewKind.value = 'unknown'
  previewNeedAuth.value = false
  previewProxyFallbackUsed.value = false
  officePreviewCandidates.value = []
  pdfPreviewCandidates.value = []
  previewUrlCandidates.value = []
  nativeBlobFallbackTried.value = false
  releasePreviewObjectUrl()
  pdfDocumentRef.value = null
  pdfCurrentPage.value = 1
  pdfPageCount.value = 1
  pdfRenderPending.value = false
  pdfZoom.value = 1
  isPdfPanning.value = false
  pdfPanState.active = false
  pdfPanState.pointerId = null
  isViewerFullscreen.value = false
  showPreview.value = true
  loadingPreview.value = true

  try {
    if (textExts.has(ext)) {
      previewKind.value = 'text'
      previewText.value = await fetchTextWithAuth(item.path)
      return
    }

    const signed = await getSignedDirectUrl(item.path)
    previewNeedAuth.value = signed.needAuth

    if (videoExts.has(ext)) {
      previewKind.value = 'video'
      const candidates = buildPreviewUrlCandidates(item.path, signed)
      previewUrlCandidates.value = candidates.slice(1)
      setPreviewUrl(candidates[0] || resolvePreviewPlayableUrl(item.path, signed))
      previewHint.value = signed.needAuth ? '已切换受鉴权资源预览通道' : '已使用直链流式播放'
      return
    }
    if (audioExts.has(ext)) {
      previewKind.value = 'audio'
      const candidates = buildPreviewUrlCandidates(item.path, signed)
      previewUrlCandidates.value = candidates.slice(1)
      setPreviewUrl(candidates[0] || resolvePreviewPlayableUrl(item.path, signed))
      previewHint.value = signed.needAuth ? '已切换受鉴权资源预览通道' : '已使用直链流式播放'
      return
    }
    if (imageExts.has(ext)) {
      previewKind.value = 'image'
      const candidates = buildPreviewUrlCandidates(item.path, signed)
      previewUrlCandidates.value = candidates.slice(1)
      setPreviewUrl(candidates[0] || resolvePreviewPlayableUrl(item.path, signed))
      return
    }
    if (ext === 'pdf') {
      previewKind.value = 'pdf'
      const urls = buildPreviewUrlCandidates(item.path, signed)
      const uniqueUrls = [...new Set(urls.filter(Boolean))]
      if (!uniqueUrls.length) {
        throw new Error('PDF 预览地址为空')
      }
      try {
        await openPdfWithCandidates(uniqueUrls)
      } catch (pdfError) {
        if (!runtimeIsTauri) throw pdfError
        const payload = await fetchNativeResourcePayload(item.path, 80 * 1024 * 1024)
        const base64 = String(payload?.base64 || '').trim()
        if (!base64) throw pdfError
        const bytes = decodeBase64Bytes(base64)
        const runtime = await ensurePdfRuntime()
        const loadingTask = runtime.getDocument({
          data: bytes,
          useSystemFonts: true,
          isEvalSupported: false
        })
        const doc = await loadingTask.promise
        pdfDocumentRef.value = markRaw(doc)
        pdfCurrentPage.value = 1
        pdfPageCount.value = doc.numPages || 1
        pdfZoom.value = 1
        setPreviewUrl('native://pdf-inline')
      }
      previewHint.value = runtimeIsCapacitor
        ? 'PDF 已使用移动端兼容线路预览'
        : 'PDF 已建立预览通道，失败会自动切换备用线路'
      return
    }
    if (officeExts.has(ext)) {
      if (signed.needAuth) {
        throw new Error('当前文件未生成可公开直链，无法直接在线预览 Office')
      }
      const officeUrls = buildOfficePreviewCandidates(signed.url)
      if (!officeUrls.length) {
        throw new Error('未配置 Office 在线预览地址')
      }
      previewKind.value = 'office'
      setPreviewUrl(officeUrls[0])
      officePreviewCandidates.value = officeUrls.slice(1)
      previewHint.value = '已通过 OneDrive 直链拼接 Office 在线预览'
      return
    }

    previewKind.value = 'unknown'
    previewHint.value = '该文件类型暂不支持在线预览，请使用下载'
  } catch (error) {
    previewKind.value = 'unknown'
    previewHint.value = error?.message || '预览失败'
  } finally {
    loadingPreview.value = false
    if (previewKind.value === 'pdf') {
      await nextTick()
      try {
        await renderPdfPage()
      } catch (error) {
        previewHint.value = `PDF 渲染失败：${error?.message || '未知错误'}`
        previewKind.value = 'unknown'
      }
    }
  }
}

const openItem = async (item) => {
  if (loadingList.value || loadingPreview.value) return
  if (item.isDir) {
    await listDirectory(item.path, false)
    return
  }
  await preparePreview(item)
}

const goParent = async () => {
  if (!canGoParent.value) return
  await listDirectory(getParentPath(currentPath.value), false)
}

const refreshCurrent = async () => {
  await listDirectory(currentPath.value, true)
}

const openBreadcrumb = async (path) => {
  await listDirectory(path, false)
}

const openDownload = async () => {
  if (!previewPath.value) return
  try {
    const signed = await getSignedDirectUrl(previewPath.value)
    const baseCandidates = buildPreviewUrlCandidates(previewPath.value, signed)
    const candidates = [...new Set([
      ...baseCandidates,
      ...baseCandidates.map((url) => encodeURI(url))
    ])]
    for (const url of candidates) {
      const ok = await openExternal(url)
      if (ok) return
    }
    if (runtimeIsTauri) {
      for (const url of candidates) {
        try {
          await invokeNative('open_external_url', { url })
          return
        } catch {
          // try next
        }
      }
    }
    if (typeof document !== 'undefined') {
      const domFallback = candidates[0] || ''
      if (domFallback) {
        try {
          const anchor = document.createElement('a')
          anchor.href = domFallback
          anchor.target = '_blank'
          anchor.rel = 'noopener noreferrer'
          document.body.appendChild(anchor)
          anchor.click()
          document.body.removeChild(anchor)
          previewHint.value = '已触发浏览器下载，请检查系统浏览器'
          return
        } catch {
          // ignore
        }
      }
    }
    previewHint.value = '无法打开外部下载链接，请稍后重试'
  } catch (error) {
    previewHint.value = error?.message || '无法打开下载链接'
  }
}

const toggleFullscreenPreview = () => {
  isViewerFullscreen.value = !isViewerFullscreen.value
}

const exitViewerFullscreen = () => {
  isViewerFullscreen.value = false
}

const loadConfig = async () => {
  loadingConfig.value = true
  try {
    const config = await fetchRemoteConfig()
    const share = config?.resource_share || {}
    enabled.value = share.enabled !== false
    endpoint.value = String(share.endpoint || DEFAULT_WEBDAV_ENDPOINT).trim() || DEFAULT_WEBDAV_ENDPOINT
    username.value = String(share.username || 'mini-hbut').trim() || 'mini-hbut'
    password.value = String(share.password || 'mini-hbut').trim() || 'mini-hbut'
    officePreviewProxy.value =
      String(share.office_preview_proxy || 'https://view.officeapps.live.com/op/embed.aspx?src=').trim() ||
      'https://view.officeapps.live.com/op/embed.aspx?src='
  } catch (error) {
    errorMessage.value = error?.message || '远程配置加载失败，已使用默认配置'
  } finally {
    loadingConfig.value = false
  }
}

const handleWindowResize = () => {
  if ((previewKind.value === 'video' || previewKind.value === 'audio') && showPreview.value && previewPlayerInstance?.resize) {
    window.setTimeout(() => {
      try {
        previewPlayerInstance.resize()
      } catch {
        // ignore
      }
    }, 80)
  }
  if (previewKind.value === 'pdf' && showPreview.value) {
    window.setTimeout(() => {
      void renderPdfPage()
    }, 80)
  }
}

onMounted(async () => {
  window.addEventListener('resize', handleWindowResize)
  await loadConfig()
  if (enabled.value) {
    await listDirectory('/', false)
  } else {
    errorMessage.value = '资料分享模块已禁用'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  destroyPreviewPlayer()
  releasePreviewObjectUrl()
  void closePreview()
})

watch([showPreview, previewKind, previewUrl, loadingPreview], async ([open, kind, url, busy]) => {
  if (!open || busy || !url || (kind !== 'video' && kind !== 'audio')) {
    destroyPreviewPlayer()
    return
  }
  await initPreviewPlayer()
})

watch(isViewerFullscreen, () => {
  if (previewPlayerInstance?.resize) {
    window.setTimeout(() => {
      try {
        previewPlayerInstance.resize()
      } catch {
        // ignore
      }
    }, 120)
  }
  if (previewKind.value === 'pdf' && showPreview.value) {
    window.setTimeout(() => {
      void renderPdfPage()
    }, 120)
  }
})
</script>

<template>
  <div class="resource-share-view module-page">
    <div class="module-header">
      <button class="header-btn" @click="emit('back')">← 返回</button>
      <h2 class="module-title">资料分享</h2>
      <button class="header-btn" :disabled="loadingList || loadingConfig" @click="refreshCurrent">刷新</button>
    </div>

    <section class="path-card">
      <button class="path-btn" :disabled="!canGoParent || loadingList" @click="goParent">上一级</button>
      <div class="breadcrumbs">
        <button
          v-for="(crumb, idx) in breadcrumbItems"
          :key="crumb.path"
          class="crumb-chip"
          :class="{ active: idx === breadcrumbItems.length - 1 }"
          @click="openBreadcrumb(crumb.path)"
        >
          {{ crumb.label }}
        </button>
      </div>
    </section>

    <section class="list-card">
      <div class="list-meta">
        <span class="count-chip">共 {{ totalCount }} 项</span>
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      </div>

      <div v-if="!items.length && !loadingList" class="empty">当前目录为空</div>

      <div class="items-grid">
        <button v-for="item in items" :key="item.path" class="item-card" @click="openItem(item)">
          <div class="item-title-row">
            <span class="item-icon" :class="`type-${getTypeClass(item)}`">{{ getItemIcon(item) }}</span>
            <span class="item-title">{{ item.name }}</span>
          </div>
          <div class="item-meta-row">
            <span class="meta-chip" :class="`type-${getTypeClass(item)}`">{{ getItemTypeLabel(item) }}</span>
            <span v-if="!item.isDir" class="meta-size">{{ formatSize(item.size) }}</span>
            <span class="item-time">{{ formatTime(item.modified) }}</span>
          </div>
        </button>
      </div>
    </section>

    <div v-if="showPreview" class="preview-overlay" @click.self="closePreview">
      <div class="preview-modal">
        <div class="preview-head">
          <h3>{{ previewTitle }}</h3>
          <p class="preview-path">{{ previewPath }}</p>
        </div>
        <div class="preview-actions">
          <button class="action-btn" @click="toggleFullscreenPreview">
            {{ isViewerFullscreen ? '退出全屏预览器' : '全屏预览器' }}
          </button>
          <button class="action-btn primary" @click="openDownload">下载</button>
          <button class="action-btn" @click="closePreview">关闭</button>
        </div>
        <div class="preview-body" :class="{ 'viewer-fullscreen': isViewerFullscreen }">
          <button v-if="isViewerFullscreen" class="viewer-exit-btn" @click="exitViewerFullscreen">← 退出全屏</button>
          <div v-if="loadingPreview" class="preview-loading">预览加载中...</div>
          <div v-else-if="previewKind === 'video' || previewKind === 'audio'" class="preview-media-wrap xgplayer-wrap" :class="{ audio: previewKind === 'audio' }">
            <div id="resource-xgplayer-host" ref="previewPlayerHostRef" class="xgplayer-host"></div>
          </div>
          <div v-else-if="previewKind === 'image'" class="preview-image-wrap">
            <img class="preview-image" :src="previewUrl" alt="preview" @error="onPreviewImageError" />
          </div>
          <div v-else-if="previewKind === 'pdf'" class="pdf-viewer">
            <div class="pdf-toolbar">
              <button class="pdf-tool-btn" :disabled="pdfCurrentPage <= 1" @click="prevPdfPage">上一页</button>
              <span class="pdf-page-chip">第 {{ pdfCurrentPage }} / {{ pdfPageCount }} 页</span>
              <button class="pdf-tool-btn" :disabled="pdfCurrentPage >= pdfPageCount" @click="nextPdfPage">下一页</button>
              <button class="pdf-tool-btn" :disabled="pdfZoom <= PDF_ZOOM_MIN + 0.001" @click="zoomOutPdf">缩小</button>
              <button class="pdf-page-chip" @click="resetPdfZoom">{{ pdfZoomText }}</button>
              <button class="pdf-tool-btn" :disabled="pdfZoom >= PDF_ZOOM_MAX - 0.001" @click="zoomInPdf">放大</button>
            </div>
            <div
              ref="pdfCanvasWrapRef"
              class="pdf-canvas-wrap"
              :class="{ panning: isPdfPanning, zoomed: pdfZoom > 1.001 }"
              @pointerdown="onPdfPanPointerDown"
              @pointermove="onPdfPanPointerMove"
              @pointerup="onPdfPanPointerUp"
              @pointercancel="onPdfPanPointerUp"
            >
              <canvas ref="pdfCanvasRef" class="pdf-canvas"></canvas>
            </div>
          </div>
          <iframe
            v-else-if="previewKind === 'office'"
            :key="`office-${previewFrameKey}`"
            class="preview-frame"
            :src="previewUrl"
            title="office preview"
            @error="onPreviewFrameError"
          />
          <pre v-else-if="previewKind === 'text'" class="preview-text">{{ previewText }}</pre>
          <div v-else class="preview-empty">{{ previewHint || '暂不支持该类型在线预览' }}</div>
        </div>
        <p v-if="previewHint && previewKind !== 'unknown'" class="preview-hint">{{ previewHint }}</p>
      </div>
    </div>

    <div v-if="loadingConfig || loadingList" class="center-loading-overlay">
      <div class="center-loading-card">
        <div class="spinner"></div>
        <p>{{ loadingConfig ? '加载远程配置中...' : '加载目录中...' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-share-view {
  min-height: 100%;
  padding: 14px 14px 20px;
  color: var(--ui-text, #0f172a);
}

.module-header {
  display: grid;
  grid-template-columns: 96px 1fr 96px;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 92%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 26%, transparent);
}

.module-title {
  margin: 0;
  text-align: center;
  font-size: clamp(1.08rem, 1.7vw, 1.34rem);
}

.header-btn {
  height: 36px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 32%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, transparent);
  color: var(--ui-text, #0f172a);
  font-size: 0.94rem;
  font-weight: 700;
  cursor: pointer;
}

.header-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.path-card,
.list-card {
  margin-top: 12px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 92%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 20%, transparent);
  padding: 12px;
}

.path-btn {
  width: 100%;
  height: 36px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 32%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 95%, transparent);
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
}

.path-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.breadcrumbs {
  margin-top: 9px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.crumb-chip {
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 36%, transparent);
  border-radius: 999px;
  height: 28px;
  padding: 0 10px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 95%, transparent);
  color: var(--ui-primary, #3b82f6);
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
}

.crumb-chip.active {
  background: color-mix(in oklab, var(--ui-primary, #3b82f6) 16%, transparent);
}

.list-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.count-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary, #3b82f6) 14%, transparent);
  color: var(--ui-primary, #3b82f6);
  font-size: 0.84rem;
  font-weight: 700;
}

.error-text {
  color: #dc2626;
  font-size: 0.82rem;
}

.empty {
  margin-top: 10px;
  border-radius: 12px;
  border: 1px dashed color-mix(in oklab, var(--ui-primary, #3b82f6) 28%, transparent);
  color: var(--ui-muted, #475569);
  font-size: 0.9rem;
  font-weight: 600;
  min-height: 72px;
  display: grid;
  place-items: center;
}

.items-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 9px;
}

.item-card {
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 22%, transparent);
  border-radius: 13px;
  padding: 10px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 96%, transparent);
  text-align: left;
  cursor: pointer;
}

.item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-icon {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: inline-grid;
  place-items: center;
  font-size: 1rem;
  background: #e2e8f0;
}

.item-title {
  font-size: clamp(0.92rem, 1.35vw, 1.02rem);
  font-weight: 700;
  line-height: 1.32;
  word-break: break-all;
}

.item-meta-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.meta-chip {
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  color: #1f2937;
  background: #e2e8f0;
}

.item-time,
.meta-size {
  color: var(--ui-muted, #64748b);
  font-size: 0.76rem;
}

.type-folder {
  background: #fef3c7;
  color: #92400e;
}

.type-video {
  background: #fee2e2;
  color: #b91c1c;
}

.type-audio {
  background: #ede9fe;
  color: #6d28d9;
}

.type-image {
  background: #dbeafe;
  color: #1d4ed8;
}

.type-pdf {
  background: #ffe4e6;
  color: #be123c;
}

.type-word {
  background: #dbeafe;
  color: #1e3a8a;
}

.type-sheet {
  background: #dcfce7;
  color: #166534;
}

.type-slide {
  background: #ffedd5;
  color: #c2410c;
}

.type-text {
  background: #e2e8f0;
  color: #334155;
}

.type-other {
  background: #e5e7eb;
  color: #374151;
}

.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
}

.preview-modal {
  width: min(920px, 100%);
  max-height: 92vh;
  border-radius: 18px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 96%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 24%, transparent);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.32);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-head h3 {
  margin: 0;
  font-size: clamp(1.02rem, 1.65vw, 1.22rem);
  line-height: 1.3;
  word-break: break-all;
}

.preview-path {
  margin: 4px 0 0;
  color: var(--ui-muted, #64748b);
  font-size: 0.82rem;
  word-break: break-all;
}

.preview-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.action-btn {
  height: 38px;
  border-radius: 11px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 32%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 95%, transparent);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ui-text, #0f172a);
  cursor: pointer;
}

.action-btn.primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, var(--ui-primary, #3b82f6), var(--ui-secondary, #06b6d4));
}

.preview-body {
  position: relative;
  min-height: 220px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 22%, transparent);
  border-radius: 13px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 98%, transparent);
  overflow: hidden;
  flex: 1;
  display: flex;
}

.preview-body.viewer-fullscreen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  z-index: 5200;
  border: none;
  border-radius: 0;
  background: #0f172a;
}

.viewer-exit-btn {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  left: 10px;
  z-index: 5210;
  height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.62);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.preview-loading,
.preview-empty {
  width: 100%;
  min-height: 200px;
  display: grid;
  place-items: center;
  color: var(--ui-muted, #64748b);
  font-size: 0.9rem;
  font-weight: 600;
  padding: 16px;
}

.preview-frame {
  width: 100%;
  min-height: 56vh;
  border: none;
}

.pdf-viewer {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: #f8fafc;
}

.preview-body.viewer-fullscreen .pdf-viewer {
  min-height: 100dvh;
  background: #0f172a;
  padding-top: calc(env(safe-area-inset-top, 0px) + 52px);
}

.pdf-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-body.viewer-fullscreen .pdf-toolbar {
  justify-content: center;
}

.pdf-tool-btn {
  height: 32px;
  min-width: 56px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 30%, transparent);
  background: #ffffff;
  color: #0f172a;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.pdf-tool-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pdf-page-chip {
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary, #3b82f6) 14%, transparent);
  color: var(--ui-primary, #3b82f6);
  font-size: 0.8rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  border: none;
  cursor: pointer;
}

.preview-body.viewer-fullscreen .pdf-page-chip {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.pdf-canvas-wrap {
  width: 100%;
  flex: 1;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-x pan-y;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 16%, transparent);
  border-radius: 12px;
  background: #ffffff;
  cursor: grab;
}

.pdf-canvas-wrap:not(.zoomed) {
  justify-content: center;
}

.preview-body.viewer-fullscreen .pdf-canvas-wrap {
  height: 100%;
  background: #111827;
  border-color: rgba(255, 255, 255, 0.2);
}

.pdf-canvas-wrap.panning {
  cursor: grabbing;
  user-select: none;
}

.pdf-canvas {
  display: block;
  margin: 0 auto;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
}

.preview-media-wrap,
.preview-image-wrap {
  width: 100%;
  min-height: 220px;
  display: grid;
  place-items: center;
  background: #0f172a;
}

.xgplayer-wrap {
  width: 100%;
  height: 100%;
  min-height: 260px;
  padding: 10px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
}

.xgplayer-wrap.audio {
  min-height: 180px;
  background: linear-gradient(180deg, #111827 0%, #1f2937 100%);
}

.xgplayer-host {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
}

:deep(.xgplayer) {
  border-radius: 12px;
  overflow: hidden;
  background: #000;
}

:deep(.xgplayer .xgplayer-controls) {
  backdrop-filter: blur(6px);
}

:deep(.xgplayer .xgplayer-start) {
  transform: scale(1.1);
}

.preview-body.viewer-fullscreen .xgplayer-wrap {
  min-height: 100dvh;
  height: 100dvh;
  padding-top: calc(env(safe-area-inset-top, 0px) + 52px);
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
}

.preview-body.viewer-fullscreen .xgplayer-host {
  width: 100%;
  height: 100dvh;
}

.preview-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.preview-body.viewer-fullscreen .preview-image {
  max-height: 100dvh;
}

.preview-text {
  margin: 0;
  width: 100%;
  min-height: 56vh;
  overflow: auto;
  padding: 12px;
  font-size: 0.84rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: #0f172a;
}

.preview-hint {
  margin: 0;
  color: var(--ui-muted, #64748b);
  font-size: 0.78rem;
}

.preview-body.viewer-fullscreen .preview-frame,
.preview-body.viewer-fullscreen .preview-text {
  min-height: 100dvh;
  height: 100dvh;
}

.center-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 5100;
  background: rgba(15, 23, 42, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
}

.center-loading-card {
  min-width: 210px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 24%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 96%, transparent);
  padding: 14px 18px;
  display: grid;
  justify-items: center;
  gap: 8px;
}

.center-loading-card p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ui-text, #0f172a);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 30%, transparent);
  border-top-color: var(--ui-primary, #3b82f6);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .module-header {
    grid-template-columns: 88px 1fr 88px;
    gap: 8px;
  }

  .module-title {
    font-size: 1.02rem;
  }

  .header-btn,
  .path-btn {
    font-size: 0.86rem;
    height: 34px;
  }

  .crumb-chip,
  .count-chip {
    font-size: 0.8rem;
    height: 26px;
  }

  .item-title {
    font-size: 0.9rem;
  }

  .item-time,
  .meta-size,
  .meta-chip {
    font-size: 0.74rem;
  }

  .preview-actions {
    grid-template-columns: 1fr;
  }

  .preview-frame {
    min-height: 48vh;
  }

  .preview-text {
    min-height: 48vh;
    font-size: 0.8rem;
  }

  .pdf-tool-btn {
    height: 30px;
    font-size: 0.78rem;
    min-width: 50px;
  }

  .pdf-page-chip {
    height: 28px;
    font-size: 0.76rem;
  }
}
</style>
