<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { fetchRemoteConfig } from '../utils/remote_config'
import { openExternal } from '../utils/external_link'

const emit = defineEmits(['back'])

const DIR_CACHE_TTL_MS = 15 * 60 * 1000
const DIR_CACHE_STORAGE_KEY = 'hbut_resource_dir_cache_v4'
const DIRECT_URL_CACHE_TTL_MS = 10 * 60 * 1000
const DEFAULT_WEBDAV_ENDPOINT = 'https://mini-hbut-chaoxing-webdav.hf.space'

const endpoint = ref(DEFAULT_WEBDAV_ENDPOINT)
const username = ref('mini-hbut')
const password = ref('mini-hbut')
const officePreviewProxy = ref('https://view.officeapps.live.com/op/view.aspx?src=')
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
const previewTitle = ref('')
const previewPath = ref('')
const previewKind = ref('unknown')
const previewText = ref('')
const previewUrl = ref('')
const previewHint = ref('')
const previewNeedAuth = ref(false)
const previewProxyFallbackUsed = ref(false)

const previewBodyRef = ref(null)
const previewVideoRef = ref(null)

const runtimeIsTauri = (() => {
  try {
    return typeof isTauri === 'function' && isTauri()
  } catch {
    return false
  }
})()

const bridgeBase = runtimeIsTauri ? 'http://127.0.0.1:4399' : '/bridge'

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

const getProxyUrl = (path) => {
  const query = new URLSearchParams({
    endpoint: endpoint.value,
    path: normalizePath(path),
    username: username.value,
    password: password.value
  })
  return `${bridgeBase}/resource_share/proxy?${query.toString()}`
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

const getSignedDirectUrl = async (path) => {
  const normalized = normalizePath(path)
  const cacheKey = `${endpoint.value}|${normalized}`
  const cached = directUrlCache.get(cacheKey)
  if (cached?.url && Number(cached.expireAt || 0) > Date.now() + 5000) {
    return { url: cached.url, needAuth: !!cached.needAuth }
  }

  if (runtimeIsTauri) {
    const query = new URLSearchParams({
      endpoint: endpoint.value,
      path: normalized,
      username: username.value,
      password: password.value
    })
    const response = await fetchWithTimeout(`${bridgeBase}/resource_share/direct_url?${query.toString()}`, {}, 20000)
    if (!response.ok) {
      throw new Error(`获取直链失败（HTTP ${response.status}）`)
    }
    const payload = await response.json().catch(() => ({}))
    const direct = String(payload?.data?.url || '').trim()
    const needAuth = !!payload?.data?.need_auth
    if (!direct) {
      throw new Error('未获取到可用直链')
    }
    const expireAt = parseDirectUrlExpireAt(direct)
    directUrlCache.set(cacheKey, { url: direct, expireAt, needAuth })
    return { url: direct, needAuth }
  }

  const fallback = getDavUrl(normalized)
  directUrlCache.set(cacheKey, { url: fallback, expireAt: Date.now() + 3 * 60 * 1000, needAuth: true })
  return { url: fallback, needAuth: true }
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

const onFullscreenChange = () => {
  isViewerFullscreen.value = !!document.fullscreenElement
}

const closePreview = async () => {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen()
    } catch {
      // ignore
    }
  }
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
}

const fallbackPdfToProxy = () => {
  if (previewKind.value !== 'pdf' || !runtimeIsTauri || previewProxyFallbackUsed.value || !previewPath.value) return
  previewProxyFallbackUsed.value = true
  previewUrl.value = getProxyUrl(previewPath.value)
  previewHint.value = '已切换为应用内代理预览（国内网络优化）'
}

const onPreviewFrameError = () => {
  fallbackPdfToProxy()
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
      previewUrl.value = signed.needAuth ? getProxyUrl(item.path) : signed.url
      previewHint.value = signed.needAuth ? '已切换应用内代理流式播放' : '已使用 OneDrive 直链流式播放'
      return
    }
    if (audioExts.has(ext)) {
      previewKind.value = 'audio'
      previewUrl.value = signed.needAuth ? getProxyUrl(item.path) : signed.url
      previewHint.value = signed.needAuth ? '已切换应用内代理流式播放' : '已使用 OneDrive 直链流式播放'
      return
    }
    if (imageExts.has(ext)) {
      previewKind.value = 'image'
      previewUrl.value = signed.needAuth ? getProxyUrl(item.path) : signed.url
      return
    }
    if (ext === 'pdf') {
      previewKind.value = 'pdf'
      previewUrl.value = signed.needAuth ? getProxyUrl(item.path) : signed.url
      previewHint.value = signed.needAuth ? 'PDF 已切换应用内代理预览（国内网络优化）' : 'PDF 已使用 OneDrive 直链预览'
      return
    }
    if (officeExts.has(ext)) {
      if (signed.needAuth) {
        throw new Error('当前文件未生成可公开直链，无法直接在线预览 Office')
      }
      const officeUrl = buildOfficePreviewUrl(signed.url)
      if (!officeUrl) {
        throw new Error('未配置 Office 在线预览地址')
      }
      previewKind.value = 'office'
      previewUrl.value = officeUrl
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
    const url = signed.url || getDavUrl(previewPath.value)
    const ok = await openExternal(url)
    if (!ok) {
      previewHint.value = '无法打开外部下载链接，请稍后重试'
    }
  } catch (error) {
    previewHint.value = error?.message || '无法打开下载链接'
  }
}

const toggleFullscreenPreview = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }

    const body = previewBodyRef.value
    if (body?.requestFullscreen) {
      await body.requestFullscreen()
      return
    }

    const video = previewVideoRef.value
    if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
      return
    }

    previewHint.value = '当前设备不支持预览区全屏'
  } catch {
    previewHint.value = '预览区全屏失败，请稍后重试'
  }
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
      String(share.office_preview_proxy || 'https://view.officeapps.live.com/op/view.aspx?src=').trim() ||
      'https://view.officeapps.live.com/op/view.aspx?src='
  } catch (error) {
    errorMessage.value = error?.message || '远程配置加载失败，已使用默认配置'
  } finally {
    loadingConfig.value = false
  }
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  await loadConfig()
  if (enabled.value) {
    await listDirectory('/', false)
  } else {
    errorMessage.value = '资料分享模块已禁用'
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  void closePreview()
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
        <div ref="previewBodyRef" class="preview-body">
          <div v-if="loadingPreview" class="preview-loading">预览加载中...</div>
          <div v-else-if="previewKind === 'video'" class="preview-media-wrap">
            <video ref="previewVideoRef" class="preview-media" :src="previewUrl" controls playsinline preload="metadata" />
          </div>
          <div v-else-if="previewKind === 'audio'" class="preview-audio-wrap">
            <audio class="preview-audio" :src="previewUrl" controls preload="metadata" />
          </div>
          <div v-else-if="previewKind === 'image'" class="preview-image-wrap">
            <img class="preview-image" :src="previewUrl" alt="preview" />
          </div>
          <iframe
            v-else-if="previewKind === 'pdf'"
            class="preview-frame"
            :src="previewUrl"
            title="pdf preview"
            @error="onPreviewFrameError"
          />
          <iframe
            v-else-if="previewKind === 'office'"
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
  min-height: 220px;
  border: 1px solid color-mix(in oklab, var(--ui-primary, #3b82f6) 22%, transparent);
  border-radius: 13px;
  background: color-mix(in oklab, var(--ui-surface, #fff) 98%, transparent);
  overflow: hidden;
  flex: 1;
  display: flex;
}

.preview-body:fullscreen,
.preview-body:-webkit-full-screen {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  border: none;
  background: #0f172a;
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

.preview-media-wrap,
.preview-image-wrap {
  width: 100%;
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
  min-height: 160px;
  display: grid;
  place-items: center;
}

.preview-audio {
  width: calc(100% - 20px);
}

.preview-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
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
}
</style>
