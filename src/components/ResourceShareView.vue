<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { fetchRemoteConfig } from '../utils/remote_config'
import { openExternal } from '../utils/external_link'

const emit = defineEmits(['back'])

const DIR_CACHE_TTL_MS = 15 * 60 * 1000
const PREVIEW_CACHE_NAME = 'hbut-resource-preview-v2'
const DIR_CACHE_STORAGE_KEY = 'hbut_resource_dir_cache_v2'
const OFFICE_CACHE_STORAGE_KEY = 'hbut_resource_office_cache_v2'
const DEFAULT_WEBDAV_ENDPOINT = 'https://mini-hbut-chaoxing-webdav.hf.space'
const DEFAULT_TEMP_UPLOAD_ENDPOINT = 'https://mini-hbut-ocr-service.hf.space/api/temp/upload'

const endpoint = ref(DEFAULT_WEBDAV_ENDPOINT)
const username = ref('mini-hbut')
const password = ref('mini-hbut')
const officePreviewProxy = ref('https://view.officeapps.live.com/op/view.aspx?src=')
const tempUploadEndpoint = ref(DEFAULT_TEMP_UPLOAD_ENDPOINT)
const enabled = ref(true)

const currentPath = ref('/')
const items = ref([])
const loadingConfig = ref(true)
const loadingList = ref(false)
const loadingPreview = ref(false)
const errorMessage = ref('')
const totalCount = ref(0)

const showPreview = ref(false)
const previewFullscreen = ref(false)
const previewTitle = ref('')
const previewPath = ref('')
const previewKind = ref('unknown')
const previewText = ref('')
const previewUrl = ref('')
const previewHint = ref('')

let currentObjectUrl = ''

const runtimeIsTauri = (() => {
  try {
    return typeof isTauri === 'function' && isTauri()
  } catch {
    return false
  }
})()

const proxyBase = runtimeIsTauri ? 'http://127.0.0.1:4399' : '/bridge'

const normalizePath = (path) => {
  const text = String(path || '').replaceAll('\\', '/').trim()
  if (!text) return '/'
  const withSlash = text.startsWith('/') ? text : `/${text}`
  const normalized = withSlash.replace(/\/{2,}/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1)
  }
  return normalized || '/'
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

const getProxyUrl = (path) => {
  const q = new URLSearchParams({
    endpoint: endpoint.value,
    path: normalizePath(path),
    username: username.value,
    password: password.value
  })
  return `${proxyBase}/resource_share/proxy?${q.toString()}`
}

const mimeMap = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  log: 'text/plain'
}

const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'])
const videoExts = new Set(['mp4', 'webm', 'mov', 'm4v'])
const audioExts = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'])
const textExts = new Set(['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'log'])
const officeExts = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

const getExt = (name) => {
  const text = String(name || '')
  const idx = text.lastIndexOf('.')
  if (idx < 0) return ''
  return text.slice(idx + 1).toLowerCase()
}

const guessMime = (name, fallback = '') => {
  const ext = getExt(name)
  if (ext && mimeMap[ext]) return mimeMap[ext]
  return fallback || 'application/octet-stream'
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
  const t = new Date(value)
  if (Number.isNaN(t.getTime())) return String(value)
  return t.toLocaleString('zh-CN', { hour12: false })
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
const officeCache = ref(parseJsonStorage(OFFICE_CACHE_STORAGE_KEY))

const cacheRequest = (cacheKey) => new Request(`https://cache.local/${encodeURIComponent(cacheKey)}`)

const getCachedBlob = async (cacheKey) => {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(PREVIEW_CACHE_NAME)
  const matched = await cache.match(cacheRequest(cacheKey))
  if (!matched) return null
  return matched.blob()
}

const setCachedBlob = async (cacheKey, blob) => {
  if (typeof caches === 'undefined') return
  const cache = await caches.open(PREVIEW_CACHE_NAME)
  await cache.put(cacheRequest(cacheKey), new Response(blob))
}

const getBlobCacheKey = (item) => {
  const p = normalizePath(item.path || '')
  return `${endpoint.value}|${p}|${item.modified || ''}|${item.size || 0}`
}

const clearObjectUrl = () => {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = ''
  }
}

const setObjectUrl = (blob) => {
  clearObjectUrl()
  currentObjectUrl = URL.createObjectURL(blob)
  previewUrl.value = currentObjectUrl
}

const textByLocalName = (node, localName) => {
  const list = node?.getElementsByTagNameNS?.('*', localName)
  if (!list || !list.length) return ''
  return String(list[0].textContent || '').trim()
}

const parseHrefPath = (href) => {
  try {
    const base = `${String(endpoint.value || '').replace(/\/+$/, '')}/`
    const u = new URL(String(href || ''), base)
    const marker = '/dav'
    const idx = u.pathname.indexOf(marker)
    const path = idx >= 0 ? u.pathname.slice(idx + marker.length) : u.pathname
    return normalizePath(decodeURIComponent(path || '/'))
  } catch {
    return normalizePath(href || '/')
  }
}

const parsePropfindXml = (xmlText, targetPath) => {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const respNodes = [...doc.getElementsByTagNameNS('*', 'response')]
  const normalizedTarget = normalizePath(targetPath)
  const parsed = []
  for (const node of respNodes) {
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
      contentType: contentType || guessMime(name)
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
  const arr = [{ label: '根目录', path: '/' }]
  let running = ''
  for (const part of parts) {
    running = joinPath(running || '/', part)
    arr.push({ label: part, path: running })
  }
  return arr
})

const canGoParent = computed(() => normalizePath(currentPath.value) !== '/')

const getParentPath = (path) => {
  const n = normalizePath(path)
  if (n === '/') return '/'
  const parts = n.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}` : '/'
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

    const res = await fetchWithTimeout(getDavUrl(targetPath), {
      method: 'PROPFIND',
      headers: {
        Authorization: makeAuthHeader(),
        Depth: '1'
      }
    }, 28000)

    if (!res.ok) {
      throw new Error(`目录加载失败（HTTP ${res.status}）`)
    }
    const text = await res.text()
    const parsed = parsePropfindXml(text, targetPath)
    currentPath.value = targetPath
    items.value = parsed
    totalCount.value = parsed.length
    dirCache.value[targetPath] = { time: now, items: parsed }
    saveJsonStorage(DIR_CACHE_STORAGE_KEY, dirCache.value)
  } catch (e) {
    if (e?.name === 'AbortError') {
      errorMessage.value = '目录加载超时，请重试'
    } else {
      errorMessage.value = e?.message || '目录加载失败'
    }
  } finally {
    loadingList.value = false
  }
}

const toBase64 = async (blob) => {
  const arr = new Uint8Array(await blob.arrayBuffer())
  const chunk = 0x8000
  let result = ''
  for (let i = 0; i < arr.length; i += chunk) {
    result += String.fromCharCode(...arr.subarray(i, i + chunk))
  }
  return btoa(result)
}

const buildOfficePreviewUrl = (fileUrl) => {
  const proxy = String(officePreviewProxy.value || '').trim()
  if (!proxy) return ''
  if (proxy.includes('{url}')) return proxy.replace('{url}', encodeURIComponent(fileUrl))
  if (proxy.endsWith('=') || proxy.endsWith('src=')) return `${proxy}${encodeURIComponent(fileUrl)}`
  const joiner = proxy.includes('?') ? '&' : '?'
  return `${proxy}${joiner}src=${encodeURIComponent(fileUrl)}`
}

const getCachedOfficeUrl = (itemKey) => {
  const hit = officeCache.value[itemKey]
  if (!hit) return ''
  if (hit.expireAt && Date.now() > Number(hit.expireAt)) {
    delete officeCache.value[itemKey]
    saveJsonStorage(OFFICE_CACHE_STORAGE_KEY, officeCache.value)
    return ''
  }
  return hit.url || ''
}

const fetchFileBlob = async (item, allowCache = true) => {
  const cacheKey = getBlobCacheKey(item)
  if (allowCache) {
    const cachedBlob = await getCachedBlob(cacheKey)
    if (cachedBlob) return cachedBlob
  }
  const res = await fetchWithTimeout(getDavUrl(item.path), {
    method: 'GET',
    headers: {
      Authorization: makeAuthHeader()
    }
  }, 40000)
  if (!res.ok) {
    throw new Error(`文件读取失败（HTTP ${res.status}）`)
  }
  const blob = await res.blob()
  if (allowCache) {
    await setCachedBlob(cacheKey, blob)
  }
  return blob
}

const ensureOfficeTempUrl = async (item, blob) => {
  const itemKey = getBlobCacheKey(item)
  const cached = getCachedOfficeUrl(itemKey)
  if (cached) return cached

  const uploadUrl = String(tempUploadEndpoint.value || '').trim() || DEFAULT_TEMP_UPLOAD_ENDPOINT
  const base64 = await toBase64(blob)
  const res = await fetchWithTimeout(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: item.name,
      content_base64: base64,
      content_type: guessMime(item.name, item.contentType),
      ttl_seconds: 86400
    })
  }, 50000)
  if (!res.ok) {
    throw new Error(`预览上传失败（HTTP ${res.status}）`)
  }
  const data = await res.json()
  if (!data?.success || !data?.url) {
    throw new Error(data?.error || '预览上传失败')
  }
  const expireAt = data?.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 23 * 60 * 60 * 1000
  officeCache.value[itemKey] = { url: data.url, expireAt }
  saveJsonStorage(OFFICE_CACHE_STORAGE_KEY, officeCache.value)
  return data.url
}

const closePreview = () => {
  showPreview.value = false
  previewFullscreen.value = false
  previewTitle.value = ''
  previewPath.value = ''
  previewKind.value = 'unknown'
  previewText.value = ''
  previewUrl.value = ''
  previewHint.value = ''
  clearObjectUrl()
}

const preparePreview = async (item) => {
  const ext = getExt(item.name)
  previewTitle.value = item.name
  previewPath.value = item.path
  previewHint.value = ''
  previewText.value = ''
  previewUrl.value = ''
  previewKind.value = 'unknown'
  showPreview.value = true
  loadingPreview.value = true
  clearObjectUrl()

  try {
    if (videoExts.has(ext)) {
      previewKind.value = 'video'
      previewUrl.value = getProxyUrl(item.path)
      previewHint.value = '视频采用流式预览，首屏会有短暂缓冲。'
      return
    }
    if (audioExts.has(ext)) {
      previewKind.value = 'audio'
      previewUrl.value = getProxyUrl(item.path)
      return
    }

    const blob = await fetchFileBlob(item, true)

    if (imageExts.has(ext)) {
      previewKind.value = 'image'
      setObjectUrl(blob)
      return
    }
    if (ext === 'pdf') {
      previewKind.value = 'pdf'
      setObjectUrl(blob)
      return
    }
    if (textExts.has(ext)) {
      previewKind.value = 'text'
      previewText.value = await blob.text()
      return
    }
    if (officeExts.has(ext)) {
      const tempFileUrl = await ensureOfficeTempUrl(item, blob)
      const officeUrl = buildOfficePreviewUrl(tempFileUrl)
      if (!officeUrl) {
        throw new Error('未配置 Office 在线预览地址')
      }
      previewKind.value = 'office'
      previewUrl.value = officeUrl
      return
    }

    previewKind.value = 'unknown'
    previewHint.value = '该文件类型暂不支持在线预览，请使用下载功能。'
  } catch (e) {
    previewKind.value = 'unknown'
    previewHint.value = e?.message || '预览失败'
  } finally {
    loadingPreview.value = false
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

const buildExternalDownloadUrl = (path) => {
  try {
    const raw = new URL(getDavUrl(path))
    raw.username = username.value
    raw.password = password.value
    return raw.toString()
  } catch {
    return getDavUrl(path)
  }
}

const openDownload = async () => {
  if (!previewPath.value) return
  const ok = await openExternal(buildExternalDownloadUrl(previewPath.value))
  if (!ok) {
    previewHint.value = '无法打开外部下载，请稍后重试。'
  }
}

const toggleFullscreenPreview = () => {
  previewFullscreen.value = !previewFullscreen.value
}

const loadConfig = async () => {
  loadingConfig.value = true
  try {
    const cfg = await fetchRemoteConfig()
    const share = cfg?.resource_share || {}
    enabled.value = share.enabled !== false
    endpoint.value = String(share.endpoint || DEFAULT_WEBDAV_ENDPOINT).trim() || DEFAULT_WEBDAV_ENDPOINT
    username.value = String(share.username || 'mini-hbut').trim() || 'mini-hbut'
    password.value = String(share.password || 'mini-hbut').trim() || 'mini-hbut'
    officePreviewProxy.value =
      String(share.office_preview_proxy || 'https://view.officeapps.live.com/op/view.aspx?src=').trim() ||
      'https://view.officeapps.live.com/op/view.aspx?src='
    tempUploadEndpoint.value = String(share.temp_upload_endpoint || '').trim()
      || String(cfg?.temp_file_server?.schedule_upload_endpoint || '').trim()
      || DEFAULT_TEMP_UPLOAD_ENDPOINT
  } catch (e) {
    errorMessage.value = e?.message || '远程配置加载失败，已使用默认配置'
  } finally {
    loadingConfig.value = false
  }
}

onMounted(async () => {
  await loadConfig()
  if (enabled.value) {
    await listDirectory('/', false)
  } else {
    errorMessage.value = '资料分享模块已禁用'
  }
})

onBeforeUnmount(() => {
  clearObjectUrl()
})
</script>

<template>
  <div class="resource-share-view module-page">
    <div class="module-header">
      <button class="header-btn back-btn" @click="$emit('back')">← 返回</button>
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
        <button
          v-for="item in items"
          :key="item.path"
          class="item-card"
          @click="openItem(item)"
        >
          <div class="item-title-row">
            <span class="item-icon">{{ item.isDir ? '📁' : '📄' }}</span>
            <span class="item-title">{{ item.name }}</span>
          </div>
          <div class="item-meta-row">
            <span class="meta-chip">{{ item.isDir ? '文件夹' : formatSize(item.size) }}</span>
            <span class="item-time">{{ formatTime(item.modified) }}</span>
          </div>
        </button>
      </div>
    </section>

    <div v-if="showPreview" class="preview-overlay" @click.self="closePreview">
      <div class="preview-modal" :class="{ fullscreen: previewFullscreen }">
        <div class="preview-head">
          <h3>{{ previewTitle }}</h3>
          <p class="preview-path">{{ previewPath }}</p>
        </div>
        <div class="preview-actions">
          <button class="action-btn" @click="toggleFullscreenPreview">全屏预览器</button>
          <button class="action-btn primary" @click="openDownload">下载</button>
          <button class="action-btn" @click="closePreview">关闭</button>
        </div>
        <div class="preview-body">
          <div v-if="loadingPreview" class="preview-loading">预览加载中...</div>
          <div v-else-if="previewKind === 'video'" class="preview-media-wrap">
            <video class="preview-media" :src="previewUrl" controls playsinline preload="metadata" />
          </div>
          <div v-else-if="previewKind === 'audio'" class="preview-audio-wrap">
            <audio class="preview-audio" :src="previewUrl" controls preload="metadata" />
          </div>
          <div v-else-if="previewKind === 'image'" class="preview-image-wrap">
            <img class="preview-image" :src="previewUrl" alt="preview" />
          </div>
          <iframe v-else-if="previewKind === 'pdf'" class="preview-frame" :src="previewUrl" title="pdf preview" />
          <iframe v-else-if="previewKind === 'office'" class="preview-frame" :src="previewUrl" title="office preview" />
          <pre v-else-if="previewKind === 'text'" class="preview-text">{{ previewText }}</pre>
          <div v-else class="preview-empty">{{ previewHint || '暂不支持该类型预览' }}</div>
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
  padding: 22px 18px 28px;
  color: var(--ui-text, #0f172a);
}

.module-header {
  display: grid;
  grid-template-columns: 110px 1fr 110px;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 18px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 92%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 28%, transparent);
}

.module-title {
  margin: 0;
  font-size: 33px;
  text-align: center;
}

.header-btn {
  height: 44px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 32%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, transparent);
  color: var(--ui-text, #0f172a);
  font-size: 23px;
  font-weight: 700;
  cursor: pointer;
}

.header-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.path-card,
.list-card {
  margin-top: 14px;
  border-radius: 18px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 92%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 20%, transparent);
  padding: 14px;
}

.path-btn {
  width: 100%;
  height: 42px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 32%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 95%, transparent);
  font-size: 23px;
  font-weight: 700;
  cursor: pointer;
}

.path-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.breadcrumbs {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.crumb-chip {
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 38%, transparent);
  border-radius: 999px;
  height: 34px;
  padding: 0 12px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 95%, transparent);
  color: var(--ui-primary, #3b82f6);
  font-size: 21px;
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
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary, #3b82f6) 14%, transparent);
  color: var(--ui-primary, #3b82f6);
  font-size: 20px;
  font-weight: 700;
}

.error-text {
  color: #dc2626;
  font-size: 19px;
}

.empty {
  margin-top: 12px;
  border-radius: 12px;
  border: 1px dashed color-mix(in oklab, var(--ui-primary, #3b82f6) 30%, transparent);
  color: var(--ui-muted, #475569);
  font-size: 22px;
  font-weight: 600;
  min-height: 80px;
  display: grid;
  place-items: center;
}

.items-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.item-card {
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 24%, transparent);
  border-radius: 14px;
  padding: 12px;
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
  font-size: 22px;
}

.item-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-all;
}

.item-meta-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.meta-chip {
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary, #3b82f6) 12%, transparent);
  color: var(--ui-primary, #3b82f6);
  font-size: 18px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}

.item-time {
  color: var(--ui-muted, #64748b);
  font-size: 18px;
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
  padding: 16px;
}

.preview-modal {
  width: min(980px, 100%);
  max-height: 92vh;
  border-radius: 20px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 96%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 24%, transparent);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.32);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-modal.fullscreen {
  width: 100%;
  max-width: 100%;
  height: 100%;
  max-height: 100%;
  border-radius: 0;
}

.preview-head h3 {
  margin: 0;
  font-size: 32px;
  line-height: 1.35;
  word-break: break-all;
}

.preview-path {
  margin: 6px 0 0;
  color: var(--ui-muted, #64748b);
  font-size: 20px;
  word-break: break-all;
}

.preview-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.action-btn {
  height: 46px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 34%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 95%, transparent);
  font-size: 24px;
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
  min-height: 240px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 24%, transparent);
  border-radius: 14px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 98%, transparent);
  overflow: hidden;
  flex: 1;
  display: flex;
}

.preview-loading,
.preview-empty {
  width: 100%;
  min-height: 220px;
  display: grid;
  place-items: center;
  color: var(--ui-muted, #64748b);
  font-size: 22px;
  font-weight: 600;
  padding: 18px;
}

.preview-frame {
  width: 100%;
  min-height: 58vh;
  border: none;
}

.preview-media-wrap,
.preview-image-wrap {
  width: 100%;
  height: 100%;
  min-height: 220px;
  display: grid;
  place-items: center;
  background: #0f172a;
}

.preview-media {
  width: 100%;
  max-height: 68vh;
}

.preview-audio-wrap {
  width: 100%;
  min-height: 180px;
  display: grid;
  place-items: center;
}

.preview-audio {
  width: calc(100% - 24px);
}

.preview-image {
  max-width: 100%;
  max-height: 72vh;
  object-fit: contain;
}

.preview-text {
  margin: 0;
  width: 100%;
  min-height: 58vh;
  overflow: auto;
  padding: 14px;
  font-size: 17px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: #0f172a;
  background: color-mix(in oklab, var(--ui-surface, #fff) 98%, transparent);
}

.preview-hint {
  margin: 0;
  color: var(--ui-muted, #64748b);
  font-size: 18px;
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
  min-width: 220px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 24%, transparent);
  background: color-mix(in oklab, var(--ui-surface, #fff) 96%, transparent);
  padding: 16px 20px;
  display: grid;
  justify-items: center;
  gap: 10px;
}

.center-loading-card p {
  margin: 0;
  font-size: 22px;
  color: var(--ui-text, #0f172a);
}

.spinner {
  width: 26px;
  height: 26px;
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

@media (max-width: 900px) {
  .module-title {
    font-size: 20px;
  }

  .header-btn {
    font-size: 18px;
    height: 42px;
  }

  .crumb-chip,
  .count-chip,
  .path-btn {
    font-size: 16px;
  }

  .item-title {
    font-size: 16px;
  }

  .item-time,
  .meta-chip {
    font-size: 13px;
  }

  .preview-head h3 {
    font-size: 20px;
  }

  .preview-path {
    font-size: 14px;
  }

  .action-btn {
    font-size: 16px;
    height: 42px;
  }

  .preview-frame {
    min-height: 52vh;
  }

  .preview-text {
    min-height: 52vh;
    font-size: 14px;
  }
}
</style>
