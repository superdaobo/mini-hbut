<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { fetchRemoteConfig } from '../utils/remote_config'
import { showToast } from '../utils/toast'
import { useAppSettings } from '../utils/app_settings'

defineProps({ studentId: { type: String, default: '' } })
const emit = defineEmits(['back'])

type ShareConfig = {
  enabled: boolean
  endpoint: string
  username: string
  password: string
  office_preview_proxy: string
  temp_upload_endpoint: string
}

type DavItem = {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: string
  content_type: string
}

type DownloadProgressStat = {
  percent: number
  loaded: number
  total: number
  elapsedMs: number
}

const DEFAULT_CONFIG: ShareConfig = {
  enabled: true,
  endpoint: 'https://mini-hbut-chaoxing-webdav.hf.space',
  username: 'mini-hbut',
  password: 'mini-hbut',
  office_preview_proxy: 'https://view.officeapps.live.com/op/view.aspx?src=',
  temp_upload_endpoint: ''
}

const appSettings = useAppSettings()
const DIR_CACHE_TTL_MS = 15 * 60 * 1000
const PREVIEW_CACHE_NAME = 'mini-hbut-preview-v1'
const PREVIEW_CACHE_MAX_BYTES = 30 * 1024 * 1024
const PARALLEL_MIN_SIZE = 2 * 1024 * 1024
const dirCache = new Map<string, { ts: number; items: DavItem[] }>()

const isNative = (() => {
  try {
    return typeof isTauri === 'function' && isTauri()
  } catch {
    return false
  }
})()
const isMobile = (() => {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent || '')
})()
const useDirectNoPort = isNative && isMobile
const BRIDGE_BASE = isNative ? 'http://127.0.0.1:4399' : '/bridge'

const loadingConfig = ref(true)
const loadingList = ref(false)
const loadingMaskText = ref('正在加载资料...')
const listError = ref('')
const config = ref<ShareConfig>({ ...DEFAULT_CONFIG })
const currentPath = ref('/')
const files = ref<DavItem[]>([])
const breadcrumb = ref<string[]>(['/'])

const activeFile = ref<DavItem | null>(null)
const previewMode = ref<'none' | 'image' | 'video' | 'audio' | 'pdf' | 'iframe' | 'text'>('none')
const previewUrl = ref('')
const previewText = ref('')
const previewHint = ref('')
const previewLoading = ref(false)
const previewProgress = ref(0)
const previewPaneFullscreen = ref(false)

const downloading = ref(false)
const downloadProgress = ref(0)
const downloadSpeedMbps = ref(0)
const downloadEtaSeconds = ref(0)
const lastSpeedPoint = ref<{ loaded: number; ts: number } | null>(null)

const imageExt = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'])
const videoExt = new Set(['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v'])
const audioExt = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'])
const textExt = new Set(['txt', 'md', 'json', 'csv', 'log', 'yaml', 'yml', 'xml'])
const officeExt = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])
const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname /><d:getcontentlength /><d:getlastmodified /><d:getcontenttype /><d:resourcetype /></d:prop></d:propfind>`

const endpointBase = computed(() => String(config.value.endpoint || '').trim().replace(/\/+$/, ''))
const authHeader = computed(() => `Basic ${btoa(`${config.value.username || ''}:${config.value.password || ''}`)}`)
const hasValidConfig = computed(() => !!endpointBase.value && !!config.value.username && !!config.value.password && config.value.enabled)
const downloadThreadCount = computed(() => Math.max(1, Number(isMobile ? appSettings.resourceShare?.downloadThreadsMobile : appSettings.resourceShare?.downloadThreadsDesktop) || 1))
const previewThreadCount = computed(() => Math.max(1, Number(isMobile ? appSettings.resourceShare?.previewThreadsMobile : appSettings.resourceShare?.previewThreadsDesktop) || 1))
const filteredFiles = computed(() => files.value)
const fileCountText = computed(() => `共 ${filteredFiles.value.length} 项`)
const canPreview = computed(() => !!activeFile.value && previewMode.value !== 'none')
const loadingMaskVisible = computed(() => loadingConfig.value || loadingList.value || previewLoading.value)
const downloadSpeedText = computed(() => (!downloading.value || downloadSpeedMbps.value <= 0 ? '--' : `${downloadSpeedMbps.value.toFixed(2)} MB/s`))
const downloadEtaText = computed(() => (!downloading.value ? '--' : formatEta(downloadEtaSeconds.value)))

const normalizePath = (p: string) => {
  const raw = String(p || '/').replace(/\\/g, '/').trim()
  if (!raw || raw === '/') return '/'
  const cleaned = raw.startsWith('/') ? raw : `/${raw}`
  return cleaned.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
}
const encodeDavPath = (p: string) => normalizePath(p).split('/').map((seg) => encodeURIComponent(seg)).join('/')
const buildDavUrl = (p: string) => `${endpointBase.value}/dav${encodeDavPath(p)}`
const buildProxyUrl = (p: string) => {
  const query = new URLSearchParams({
    endpoint: endpointBase.value,
    path: normalizePath(p),
    username: config.value.username || '',
    password: config.value.password || ''
  })
  return `${BRIDGE_BASE}/resource_share/proxy?${query.toString()}`
}
const buildDirectMediaUrl = (p: string) => {
  try {
    const u = new URL(endpointBase.value)
    u.username = config.value.username || ''
    u.password = config.value.password || ''
    const basePath = u.pathname.replace(/\/+$/, '')
    u.pathname = `${basePath}/dav${encodeDavPath(p)}`
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return buildProxyUrl(p)
  }
}
const buildMediaPreviewUrl = (p: string) => {
  // 仅移动端原生避免本地端口依赖；桌面端继续走本地桥接避免系统弹登录框
  if (useDirectNoPort) return buildDirectMediaUrl(p)
  return buildProxyUrl(p)
}
const buildPreferredFetchUrl = (p: string) => (useDirectNoPort ? buildDirectMediaUrl(p) : buildProxyUrl(p))
const buildRemoteOpenUrl = (p: string) => {
  const query = new URLSearchParams({
    path: normalizePath(p),
    username: config.value.username || '',
    password: config.value.password || ''
  })
  return `${endpointBase.value}/api/open?${query.toString()}`
}
const resolvePreviewUrl = (p: string) => (useDirectNoPort ? buildRemoteOpenUrl(p) : buildMediaPreviewUrl(p))
const resolveFetchUrl = (p: string) => (useDirectNoPort ? buildRemoteOpenUrl(p) : buildPreferredFetchUrl(p))
const resolveDirectDownloadUrl = (p: string) => (useDirectNoPort ? buildRemoteOpenUrl(p) : buildDirectMediaUrl(p))

const buildCacheRequestKey = (path: string) => {
  const key = `${endpointBase.value}|${normalizePath(path)}`
  return `https://mini-hbut-preview.local/cache/${encodeURIComponent(key)}`
}

const readPreviewCacheBlob = async (path: string) => {
  try {
    if (!('caches' in globalThis)) return null
    const cache = await caches.open(PREVIEW_CACHE_NAME)
    const req = new Request(buildCacheRequestKey(path))
    const hit = await cache.match(req)
    if (!hit) return null
    return await hit.blob()
  } catch {
    return null
  }
}

const writePreviewCacheBlob = async (path: string, blob: Blob) => {
  try {
    if (!('caches' in globalThis)) return
    if (!blob || blob.size <= 0 || blob.size > PREVIEW_CACHE_MAX_BYTES) return
    const cache = await caches.open(PREVIEW_CACHE_NAME)
    const req = new Request(buildCacheRequestKey(path))
    await cache.put(
      req,
      new Response(blob, {
        headers: {
          'content-type': blob.type || 'application/octet-stream',
          'cache-control': 'max-age=604800'
        }
      })
    )
  } catch {
    // ignore cache write errors
  }
}

const shouldCachePreview = (ext: string, fileSize: number) => {
  if (fileSize > 0 && fileSize > PREVIEW_CACHE_MAX_BYTES) return false
  if (imageExt.has(ext) || videoExt.has(ext) || audioExt.has(ext) || ext === 'pdf' || textExt.has(ext)) return true
  return false
}

const cachePreviewInBackground = async (path: string) => {
  try {
    const blob = await fetchBlobWithProgress(path, undefined, false, 1, useDirectNoPort)
    await writePreviewCacheBlob(path, blob)
  } catch {
    // ignore
  }
}
const buildAuthHeaders = (headers: Record<string, string> = {}) => ({ Authorization: authHeader.value, ...headers })
const buildBreadCrumb = (p: string) => {
  const n = normalizePath(p)
  if (n === '/') return ['/']
  const parts = n.split('/').filter(Boolean)
  const out = ['/']
  let cur = ''
  parts.forEach((part) => {
    cur += `/${part}`
    out.push(cur)
  })
  return out
}
const extOf = (name: string) => (String(name || '').split('.').pop() || '').toLowerCase()
const formatEta = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return '--'
  if (s < 60) return `${Math.ceil(s)} 秒`
  return `${Math.floor(s / 60)} 分 ${Math.ceil(s % 60)} 秒`
}
const formatSize = (n: number) => {
  if (n <= 0) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
const formatTime = (t: string) => {
  if (!t) return '-'
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString('zh-CN', { hour12: false })
}

const parseDavItems = (xml: string, targetPath: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const nodes = Array.from(doc.getElementsByTagNameNS('*', 'response'))
  const target = normalizePath(targetPath)
  const out: DavItem[] = []
  for (const node of nodes) {
    const hrefText = node.getElementsByTagNameNS('*', 'href')[0]?.textContent
    if (!hrefText) continue
    let itemPath = '/'
    try {
      itemPath = decodeURIComponent(new URL(hrefText, endpointBase.value).pathname || '/')
    } catch {
      itemPath = decodeURIComponent(hrefText)
    }
    itemPath = normalizePath(itemPath.replace(/^\/dav/, '') || '/')
    if (itemPath === target) continue
    const name =
      node.getElementsByTagNameNS('*', 'displayname')[0]?.textContent?.trim() ||
      decodeURIComponent(itemPath.split('/').filter(Boolean).pop() || '')
    if (!name) continue
    const size = Number(node.getElementsByTagNameNS('*', 'getcontentlength')[0]?.textContent?.trim() || 0)
    out.push({
      name,
      path: itemPath,
      is_dir: node.getElementsByTagNameNS('*', 'collection').length > 0,
      size: Number.isFinite(size) ? size : 0,
      modified: node.getElementsByTagNameNS('*', 'getlastmodified')[0]?.textContent?.trim() || '',
      content_type: node.getElementsByTagNameNS('*', 'getcontenttype')[0]?.textContent?.trim() || ''
    })
  }
  return out
}

const cleanupPreviewUrl = () => {
  if (previewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}
const resetPreview = () => {
  cleanupPreviewUrl()
  previewMode.value = 'none'
  previewText.value = ''
  previewHint.value = ''
  previewProgress.value = 0
  previewPaneFullscreen.value = false
}
const closePreview = () => {
  activeFile.value = null
  resetPreview()
}
const resetDownloadStat = () => {
  downloadProgress.value = 0
  downloadSpeedMbps.value = 0
  downloadEtaSeconds.value = 0
  lastSpeedPoint.value = null
}
const applyDownloadStat = (s: DownloadProgressStat) => {
  downloadProgress.value = s.percent
  const now = Date.now()
  if (!lastSpeedPoint.value) {
    lastSpeedPoint.value = { loaded: s.loaded, ts: now }
    return
  }
  const dBytes = Math.max(0, s.loaded - lastSpeedPoint.value.loaded)
  const dMs = Math.max(1, now - lastSpeedPoint.value.ts)
  const instantSpeed = (dBytes * 1000) / dMs
  const avgSpeed = s.loaded / Math.max(0.2, s.elapsedMs / 1000)
  const speed = instantSpeed > 0 ? instantSpeed : avgSpeed
  downloadSpeedMbps.value = speed / 1024 / 1024
  const remain = Math.max(0, s.total - s.loaded)
  downloadEtaSeconds.value = speed > 1 ? remain / speed : 0
  lastSpeedPoint.value = { loaded: s.loaded, ts: now }
}

const detectRangeSupport = async (url: string) => {
  const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
  if (resp.status !== 206) return null
  const match = String(resp.headers.get('content-range') || '').match(/bytes\s+\d+-\d+\/(\d+)/i)
  const total = Number(match?.[1] || 0)
  const contentType = resp.headers.get('content-type') || 'application/octet-stream'
  await resp.arrayBuffer().catch(() => {})
  return Number.isFinite(total) && total > 0 ? { total, contentType } : null
}

const fetchBlobSequential = async (url: string, onProgress?: (s: DownloadProgressStat) => void) => {
  const startedAt = Date.now()
  const resp = await fetch(url, { method: 'GET' })
  if (!resp.ok) throw new Error(`下载失败：HTTP ${resp.status}`)
  const total = Number(resp.headers.get('content-length') || 0)
  const contentType = resp.headers.get('content-type') || 'application/octet-stream'
  if (!resp.body) {
    const blob = await resp.blob()
    onProgress?.({
      percent: 100,
      loaded: blob.size || total || 0,
      total: total || blob.size || 0,
      elapsedMs: Date.now() - startedAt
    })
    return blob.type ? blob : new Blob([blob], { type: contentType })
  }

  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      if (total > 0) {
        onProgress?.({
          percent: Math.min(99, Math.floor((loaded / total) * 100)),
          loaded,
          total,
          elapsedMs: Date.now() - startedAt
        })
      }
    }
  }

  onProgress?.({
    percent: 100,
    loaded: total > 0 ? total : loaded,
    total: total > 0 ? total : loaded,
    elapsedMs: Date.now() - startedAt
  })
  return new Blob(chunks, { type: contentType })
}

const fetchBlobParallel = async (
  url: string,
  total: number,
  contentType: string,
  threadCount: number,
  onProgress?: (s: DownloadProgressStat) => void
) => {
  const startedAt = Date.now()
  const chunkSize = Math.max(1024 * 1024, Math.ceil(total / Math.max(1, threadCount)))
  const ranges: Array<{ start: number; end: number; index: number }> = []
  for (let start = 0; start < total; start += chunkSize) {
    ranges.push({ start, end: Math.min(total - 1, start + chunkSize - 1), index: ranges.length })
  }

  const buffers = new Array<Uint8Array>(ranges.length)
  let loaded = 0
  let cursor = 0
  const workers = Array.from({ length: Math.min(threadCount, ranges.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= ranges.length) break
      const range = ranges[index]
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Range: `bytes=${range.start}-${range.end}` }
      })
      if (!(resp.ok || resp.status === 206)) {
        throw new Error(`分片下载失败：HTTP ${resp.status}`)
      }
      const arr = new Uint8Array(await resp.arrayBuffer())
      buffers[range.index] = arr
      loaded += arr.byteLength
      onProgress?.({
        percent: Math.min(99, Math.floor((loaded / total) * 100)),
        loaded,
        total,
        elapsedMs: Date.now() - startedAt
      })
    }
  })
  await Promise.all(workers)
  onProgress?.({ percent: 100, loaded: total, total, elapsedMs: Date.now() - startedAt })
  return new Blob(buffers, { type: contentType || 'application/octet-stream' })
}

const fetchBlobWithProgress = async (
  path: string,
  onProgress?: (s: DownloadProgressStat) => void,
  preferParallel = true,
  threadCount = 4,
  preferDirect = false
) => {
  const proxyUrl = preferDirect ? resolveDirectDownloadUrl(path) : buildProxyUrl(path)
  if (preferParallel) {
    try {
      const support = await detectRangeSupport(proxyUrl)
      if (support && support.total >= PARALLEL_MIN_SIZE) {
        return await fetchBlobParallel(proxyUrl, support.total, support.contentType, Math.max(2, threadCount), onProgress)
      }
    } catch (e) {
      console.warn('[资料分享] 并发下载不可用，回退顺序下载', e)
    }
  }
  return fetchBlobSequential(proxyUrl, onProgress)
}

const blobToDataBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      resolve(text.includes(',') ? text.split(',')[1] : text)
    }
    reader.onerror = (e) => reject(e)
    reader.readAsDataURL(blob)
  })

const uploadTempForOffice = async (fileName: string, blob: Blob) => {
  const endpoint = String(config.value.temp_upload_endpoint || '').trim()
  if (!endpoint) {
    throw new Error('未配置临时上传地址，无法在线预览 Office 文件')
  }
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: fileName,
      content_base64: await blobToDataBase64(blob),
      content_type: blob.type || 'application/octet-stream',
      ttl_seconds: 7200
    })
  })
  const payload = await resp.json().catch(() => ({}))
  if (!resp.ok || !payload?.success || !payload?.url) {
    throw new Error(payload?.error || `临时上传失败：HTTP ${resp.status}`)
  }
  return String(payload.url)
}

const parseAndSetConfig = async () => {
  loadingConfig.value = true
  loadingMaskText.value = '正在同步远程配置...'
  try {
    const remote = await fetchRemoteConfig()
    const share = remote?.resource_share || {}
    const tempServer = remote?.temp_file_server || {}
    config.value = {
      enabled: share.enabled !== false,
      endpoint: String(share.endpoint || DEFAULT_CONFIG.endpoint),
      username: String(share.username || DEFAULT_CONFIG.username),
      password: String(share.password || DEFAULT_CONFIG.password),
      office_preview_proxy: String(share.office_preview_proxy || DEFAULT_CONFIG.office_preview_proxy),
      temp_upload_endpoint: String(share.temp_upload_endpoint || tempServer.schedule_upload_endpoint || DEFAULT_CONFIG.temp_upload_endpoint)
    }
    dirCache.clear()
  } catch {
    config.value = { ...DEFAULT_CONFIG }
    dirCache.clear()
  } finally {
    loadingConfig.value = false
  }
}

const loadPath = async (path: string, forceRefresh = false) => {
  if (!hasValidConfig.value) {
    listError.value = '资料分享配置不完整，请在配置工具中检查'
    files.value = []
    return
  }

  const normalized = normalizePath(path)
  const cached = dirCache.get(normalized)
  if (!forceRefresh && cached && Date.now() - cached.ts < DIR_CACHE_TTL_MS) {
    files.value = cached.items
    currentPath.value = normalized
    breadcrumb.value = buildBreadCrumb(normalized)
    listError.value = ''
    return
  }

  loadingList.value = true
  loadingMaskText.value = '正在读取目录...'
  listError.value = ''
  try {
    const url = buildDavUrl(normalized === '/' ? '/' : `${normalized}/`)
    const resp = await fetch(url, {
      method: 'PROPFIND',
      headers: buildAuthHeaders({
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8'
      }),
      body: PROPFIND_BODY
    })
    if (!resp.ok) throw new Error(`目录读取失败：HTTP ${resp.status}`)
    const items = parseDavItems(await resp.text(), normalized)
    files.value = items
    dirCache.set(normalized, { ts: Date.now(), items })
    currentPath.value = normalized
    breadcrumb.value = buildBreadCrumb(normalized)
  } catch (e: any) {
    listError.value = e?.message || '目录读取失败'
    files.value = []
  } finally {
    loadingList.value = false
  }
}

const goParent = async () => {
  if (currentPath.value === '/') return
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  await loadPath(parts.length ? `/${parts.join('/')}` : '/')
}
const openBreadcrumb = async (path: string) => {
  await loadPath(path)
}
const refreshList = async () => {
  await loadPath(currentPath.value, true)
}

const previewFile = async (file: DavItem) => {
  activeFile.value = file
  resetPreview()
  previewLoading.value = true
  loadingMaskText.value = '正在准备预览...'
  try {
    const ext = extOf(file.name)
    const canCache = shouldCachePreview(ext, file.size)
    if (canCache) {
      const cachedBlob = await readPreviewCacheBlob(file.path)
      if (cachedBlob) {
        previewMode.value = imageExt.has(ext)
          ? 'image'
          : videoExt.has(ext)
            ? 'video'
            : audioExt.has(ext)
              ? 'audio'
          : ext === 'pdf'
            ? 'pdf'
            : textExt.has(ext)
              ? 'text'
              : 'none'
        if (previewMode.value === 'text') {
          previewText.value = await cachedBlob.text()
        } else if (previewMode.value !== 'none') {
          previewUrl.value = URL.createObjectURL(cachedBlob)
        }
        if (previewMode.value !== 'none') {
          previewHint.value = '已命中本地缓存'
          return
        }
      }
    }

    if (imageExt.has(ext)) {
      let blob: Blob | null = null
      if (canCache) {
        try {
          blob = await fetchBlobWithProgress(file.path, (s) => {
            previewProgress.value = s.percent
          }, false, 1, useDirectNoPort)
        } catch {
          blob = null
        }
      }
      previewMode.value = 'image'
      if (blob) {
        previewUrl.value = URL.createObjectURL(blob)
        await writePreviewCacheBlob(file.path, blob)
      } else {
        previewUrl.value = resolvePreviewUrl(file.path)
      }
      return
    }
    if (videoExt.has(ext)) {
      previewMode.value = 'video'
      previewUrl.value = resolvePreviewUrl(file.path)
      if (canCache) void cachePreviewInBackground(file.path)
      return
    }
    if (audioExt.has(ext)) {
      previewMode.value = 'audio'
      previewUrl.value = resolvePreviewUrl(file.path)
      if (canCache) void cachePreviewInBackground(file.path)
      return
    }
    if (ext === 'pdf') {
      let blob: Blob | null = null
      if (canCache) {
        try {
          blob = await fetchBlobWithProgress(file.path, (s) => {
            previewProgress.value = s.percent
          }, false, 1, useDirectNoPort)
        } catch {
          blob = null
        }
      }
      previewMode.value = 'pdf'
      if (blob) {
        previewUrl.value = URL.createObjectURL(blob)
        await writePreviewCacheBlob(file.path, blob)
      } else {
        previewUrl.value = resolvePreviewUrl(file.path)
      }
      return
    }
    if (textExt.has(ext)) {
      previewMode.value = 'text'
      if (canCache) {
        try {
          const blob = await fetchBlobWithProgress(file.path, (s) => {
            previewProgress.value = s.percent
          }, false, 1, useDirectNoPort)
          previewText.value = await blob.text()
          await writePreviewCacheBlob(file.path, blob)
        } catch {
          const resp = await fetch(resolveFetchUrl(file.path))
          if (!resp.ok) throw new Error(`预览读取失败：HTTP ${resp.status}`)
          previewText.value = await resp.text()
        }
      } else {
        const resp = await fetch(resolveFetchUrl(file.path))
        if (!resp.ok) throw new Error(`预览读取失败：HTTP ${resp.status}`)
        previewText.value = await resp.text()
      }
      return
    }
    if (officeExt.has(ext)) {
      const blob = await fetchBlobWithProgress(
        file.path,
        (s) => {
          previewProgress.value = s.percent
        },
        true,
        previewThreadCount.value,
        useDirectNoPort
      )
      const url = await uploadTempForOffice(file.name, blob)
      previewMode.value = 'iframe'
      previewUrl.value = `${config.value.office_preview_proxy || DEFAULT_CONFIG.office_preview_proxy}${encodeURIComponent(url)}`
      previewHint.value = '该预览由在线 Office 服务提供'
      return
    }
    previewHint.value = '该文件类型暂不支持在线预览，请下载后查看'
  } catch (e: any) {
    previewHint.value = `预览失败：${e?.message || '未知错误'}`
  } finally {
    previewLoading.value = false
  }
}

const saveDownloadedBlob = async (file: DavItem, blob: Blob) => {
  if (!isNative) {
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = file.name
    a.click()
    URL.revokeObjectURL(href)
    return { path: file.name, saved_to: 'browser' }
  }

  return (await invoke('save_export_file', {
    req: {
      fileName: file.name,
      mimeType: blob.type || 'application/octet-stream',
      contentBase64: await blobToDataBase64(blob),
      preferMedia: imageExt.has(extOf(file.name)) || videoExt.has(extOf(file.name))
    }
  })) as { path: string; saved_to: string }
}

const shareSavedFile = async (path: string) => {
  if (!path) return
  try {
    await invoke('open_file_with_system', { path })
    showToast('已调用系统分享/打开面板', 'success')
  } catch (e: any) {
    showToast(e?.message || '调用系统分享失败', 'error')
  }
}

const downloadFile = async (file: DavItem, shareAfter = false) => {
  downloading.value = true
  resetDownloadStat()
  loadingMaskText.value = '正在下载文件...'
  try {
    const blob = await fetchBlobWithProgress(
      file.path,
      (s) => applyDownloadStat(s),
      true,
      downloadThreadCount.value
    )
    const saved = await saveDownloadedBlob(file, blob)
    showToast(`下载成功：${saved.path}`, 'success')
    if (shareAfter) {
      await shareSavedFile(saved.path)
    }
  } catch (e: any) {
    showToast(e?.message || '下载失败', 'error')
  } finally {
    downloading.value = false
    resetDownloadStat()
  }
}

onMounted(async () => {
  await parseAndSetConfig()
  await loadPath('/')
})

onBeforeUnmount(() => {
  resetPreview()
  resetDownloadStat()
})
</script>

<template>
  <div class="resource-share-view">
    <header class="view-header">
      <button class="btn btn-ghost" @click="emit('back')">← 返回</button>
      <h1 class="page-title">资料分享</h1>
      <button class="btn btn-primary-solid" @click="refreshList">刷新</button>
    </header>

    <section class="card control-card">
      <div class="row">
        <button class="btn btn-ghost" :disabled="currentPath === '/'" @click="goParent">上一级</button>
      </div>
      <nav class="path-nav" aria-label="当前路径">
        <template v-for="(node, index) in breadcrumb" :key="node">
          <button class="crumb-link" @click="openBreadcrumb(node)">
            {{ node === '/' ? '根目录' : node.split('/').pop() }}
          </button>
          <span v-if="index < breadcrumb.length - 1" class="path-sep">/</span>
        </template>
      </nav>
    </section>

    <section class="card">
      <div class="head">
        <span class="head-pill">{{ fileCountText }}</span>
      </div>
      <p v-if="listError" class="error">{{ listError }}</p>
      <div v-else-if="filteredFiles.length === 0" class="empty">暂无文件</div>
      <div v-else class="list">
        <button
          v-for="item in filteredFiles"
          :key="item.path"
          class="item"
          @click="item.is_dir ? loadPath(item.path) : previewFile(item)"
        >
          <span class="item-icon" :class="{ folder: item.is_dir }">
            {{ item.is_dir ? '📁' : '📄' }}
          </span>
          <span class="name">{{ item.name }}</span>
          <span class="meta">{{ item.is_dir ? '文件夹' : formatSize(item.size) }}</span>
          <span class="meta">{{ formatTime(item.modified) }}</span>
        </button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="activeFile" class="overlay" @click.self="closePreview">
        <div class="modal">
          <div class="modal-head">
            <div class="title-wrap">
              <h3>{{ activeFile.name }}</h3>
              <p>{{ activeFile.path }}</p>
            </div>
            <div class="actions center">
              <button class="btn btn-ghost" :disabled="!canPreview" @click="previewPaneFullscreen = true">全屏预览器</button>
              <button class="btn btn-primary-solid" :disabled="downloading" @click="downloadFile(activeFile, false)">
                {{ downloading ? `下载中 ${downloadProgress}%` : '下载' }}
              </button>
              <button class="btn btn-ghost" :disabled="downloading" @click="downloadFile(activeFile, true)">下载并分享</button>
              <button class="btn btn-ghost" @click="closePreview">关闭</button>
            </div>
          </div>

          <div v-if="downloading" class="stats">
            <span>速度：{{ downloadSpeedText }}</span>
            <span>剩余：{{ downloadEtaText }}</span>
            <span>进度：{{ downloadProgress }}%</span>
          </div>
          <div v-if="downloading" class="track"><div class="fill" :style="{ width: `${downloadProgress}%` }" /></div>

          <p v-if="previewHint" class="hint">{{ previewHint }}</p>
          <p v-if="previewLoading" class="hint">正在加载预览... {{ previewProgress }}%</p>

          <div class="preview-pane" :class="{ zoomable: canPreview }">
            <img
              v-if="canPreview && !previewLoading && previewMode === 'image'"
              class="preview image-preview"
              :src="previewUrl"
              alt="preview"
            />
            <video
              v-else-if="canPreview && !previewLoading && previewMode === 'video'"
              class="preview media-preview"
              :src="previewUrl"
              controls
              playsinline
              preload="metadata"
            />
            <audio
              v-else-if="canPreview && !previewLoading && previewMode === 'audio'"
              class="audio-preview"
              :src="previewUrl"
              controls
              preload="metadata"
            />
            <div
              v-else-if="canPreview && !previewLoading && (previewMode === 'pdf' || previewMode === 'iframe')"
              class="frame-wrap"
            >
              <iframe class="frame" :src="previewUrl" />
            </div>
            <pre
              v-else-if="canPreview && !previewLoading && previewMode === 'text'"
              class="text"
            >{{ previewText }}</pre>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="previewPaneFullscreen && canPreview" class="fullscreen-overlay" @click.self="previewPaneFullscreen = false">
        <div class="fullscreen-toolbar">
          <button class="btn btn-primary-solid" @click="previewPaneFullscreen = false">退出全屏</button>
        </div>
        <div class="fullscreen-content">
          <img
            v-if="previewMode === 'image'"
            class="preview image-preview"
            :src="previewUrl"
            alt="preview"
          />
          <video
            v-else-if="previewMode === 'video'"
            class="preview media-preview"
            :src="previewUrl"
            controls
            playsinline
            preload="metadata"
          />
          <audio
            v-else-if="previewMode === 'audio'"
            class="audio-preview"
            :src="previewUrl"
            controls
            preload="metadata"
          />
          <div v-else-if="previewMode === 'pdf' || previewMode === 'iframe'" class="frame-wrap">
            <iframe class="frame" :src="previewUrl" />
          </div>
          <pre v-else-if="previewMode === 'text'" class="text">{{ previewText }}</pre>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="loadingMaskVisible" class="loading-mask">
        <div class="loading-card">
          <div class="spinner"></div>
          <p>{{ loadingMaskText }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.resource-share-view {
  min-height: calc(var(--app-vh, 1vh) * 100);
  padding: 16px 16px 120px;
  background: var(--ui-bg-gradient);
}

.view-header,
.card {
  max-width: 1080px;
  margin: 0 auto 12px;
  background: color-mix(in oklab, var(--ui-surface) 94%, transparent 6%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.35));
  border-radius: 18px;
  box-shadow: var(--ui-shadow-soft);
}

.view-header {
  display: grid;
  grid-template-columns: 100px 1fr 100px;
  align-items: center;
  padding: 10px;
}

.page-title {
  margin: 0;
  text-align: center;
  font-size: clamp(20px, 2.2vw, 26px);
  color: var(--ui-text);
}

.card {
  padding: 14px;
}

.control-card {
  position: sticky;
  top: 10px;
  z-index: 6;
  backdrop-filter: blur(10px);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.btn {
  height: 40px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, rgba(148, 163, 184, 0.35));
  padding: 0 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.btn-ghost {
  background: color-mix(in oklab, var(--ui-primary-soft) 62%, #fff 38%);
  color: var(--ui-text);
}

.btn-primary-solid {
  background: linear-gradient(120deg, var(--ui-primary), var(--ui-secondary));
  color: #fff;
  border-color: transparent;
}

.path-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.crumb-link {
  border: none;
  background: transparent;
  color: var(--ui-text);
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.crumb-link:hover {
  color: var(--ui-primary);
}

.path-sep {
  color: var(--ui-muted);
  font-weight: 700;
  margin-right: 2px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.head-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
}

.list {
  display: grid;
  gap: 8px;
}

.item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 130px 168px;
  gap: 8px;
  align-items: center;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 14%, rgba(148, 163, 184, 0.32));
  border-radius: 14px;
  background: color-mix(in oklab, var(--ui-surface) 94%, #fff 6%);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}

.item-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
}

.item-icon.folder {
  background: color-mix(in oklab, #f59e0b 20%, #fff 80%);
}

.name {
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 12px;
  color: var(--ui-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  padding: 16px;
  text-align: center;
  color: var(--ui-muted);
  border: 1px dashed rgba(148, 163, 184, 0.6);
  border-radius: 12px;
}

.error {
  margin: 0;
  color: #dc2626;
  font-size: 13px;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal {
  width: min(1260px, 96vw);
  height: min(90vh, 940px);
  background: color-mix(in oklab, var(--ui-surface) 96%, #fff 4%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 16%, rgba(148, 163, 184, 0.35));
  border-radius: 18px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-head {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.title-wrap h3 {
  margin: 0;
  font-size: 20px;
  color: var(--ui-text);
}

.title-wrap p {
  margin: 4px 0 0;
  color: var(--ui-muted);
  font-size: 13px;
  word-break: break-all;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.actions.center {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  justify-content: initial;
}

.actions.center .btn {
  width: 100%;
}

.stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 0 0 8px;
  color: var(--ui-muted);
  font-size: 13px;
}

.track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary-soft) 52%, rgba(148, 163, 184, 0.42));
  overflow: hidden;
  margin: 0 0 10px;
}

.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ui-primary), var(--ui-secondary));
  transition: width 0.18s ease;
}

.hint {
  margin: 2px 0 10px;
  font-size: 13px;
  color: var(--ui-muted);
}

.preview-pane {
  flex: 1;
  min-height: 0;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, rgba(148, 163, 184, 0.5));
  border-radius: 12px;
  background: color-mix(in oklab, var(--ui-surface) 96%, #fff 4%);
  overflow: auto;
  padding: 8px;
}

.preview {
  width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-preview,
.media-preview {
  background: #0f172a;
}

.audio-preview {
  width: 100%;
}

.frame-wrap {
  width: 100%;
  height: 100%;
  min-height: 520px;
  overflow: auto;
}

.frame {
  width: 100%;
  height: 100%;
  min-height: 520px;
  border: none;
  background: #fff;
}

.text {
  margin: 0;
  padding: 12px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 10px;
  line-height: 1.55;
  min-height: 100%;
}

.fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(2, 6, 23, 0.92);
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: calc(var(--app-vh, 1vh) * 100);
  padding-bottom: env(safe-area-inset-bottom);
}

.fullscreen-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: calc(env(safe-area-inset-top) + 10px) 10px 10px;
  background: rgba(15, 23, 42, 0.55);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.fullscreen-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.fullscreen-content .preview {
  width: 100%;
  height: 100%;
  max-height: none;
  object-fit: contain;
}

.fullscreen-content .audio-preview {
  width: min(900px, 96vw);
  margin: auto;
}

.fullscreen-content .frame-wrap {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.fullscreen-content .frame {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.fullscreen-content .text {
  width: 100%;
  height: 100%;
  min-height: 100%;
  border-radius: 0;
  overflow: auto;
}

.loading-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(15, 23, 42, 0.25);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-card {
  min-width: 180px;
  padding: 16px 20px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--ui-surface) 96%, #fff 4%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.35));
  box-shadow: var(--ui-shadow-soft);
  text-align: center;
}

.loading-card p {
  margin: 10px 0 0;
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 600;
}

.spinner {
  width: 26px;
  height: 26px;
  margin: 0 auto;
  border: 3px solid color-mix(in oklab, var(--ui-primary) 18%, #e2e8f0);
  border-top-color: var(--ui-primary);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .resource-share-view {
    padding: 14px 12px 100px;
  }

  .view-header {
    grid-template-columns: 86px 1fr 86px;
  }

  .row {
    flex-wrap: wrap;
  }

  .item {
    grid-template-columns: 32px minmax(0, 1fr);
  }

  .meta {
    grid-column: 2 / 3;
  }

  .modal {
    width: 100%;
    height: 92vh;
    padding: 12px;
  }

  .frame-wrap,
  .frame {
    min-height: 420px;
  }
}
</style>
