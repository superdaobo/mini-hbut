<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { fetchRemoteConfig } from '../utils/remote_config'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'

defineProps({
  studentId: { type: String, default: '' }
})

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

const defaultConfig: ShareConfig = {
  enabled: true,
  endpoint: 'https://mini-hbut-chaoxing-webdav.hf.space',
  username: 'mini-hbut',
  password: 'mini-hbut',
  office_preview_proxy: 'https://view.officeapps.live.com/op/view.aspx?src=',
  temp_upload_endpoint: ''
}

const isNative = (() => {
  try {
    return typeof isTauri === 'function' && isTauri()
  } catch {
    return false
  }
})()

const isMobile = (() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /android|iphone|ipad|ipod/i.test(ua)
})()

const loadingConfig = ref(true)
const loadingList = ref(false)
const listError = ref('')
const config = ref<ShareConfig>({ ...defaultConfig })
const currentPath = ref('/')
const breadcrumb = ref<string[]>(['/'])
const files = ref<DavItem[]>([])
const keyword = ref('')
const onlyFolder = ref(false)
const sortBy = ref<'name' | 'size' | 'modified'>('name')
const sortAsc = ref(true)
const showFilter = ref(false)
const activeFile = ref<DavItem | null>(null)
const previewMode = ref<'none' | 'image' | 'video' | 'audio' | 'pdf' | 'iframe' | 'text'>('none')
const previewUrl = ref('')
const previewText = ref('')
const previewHint = ref('')
const previewLoading = ref(false)
const previewProgress = ref(0)
const downloading = ref(false)
const downloadProgress = ref(0)

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname />
    <d:getcontentlength />
    <d:getlastmodified />
    <d:getcontenttype />
    <d:resourcetype />
  </d:prop>
</d:propfind>`

const imageExt = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'])
const videoExt = new Set(['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v'])
const audioExt = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'])
const textExt = new Set(['txt', 'md', 'json', 'csv', 'log', 'yaml', 'yml', 'xml'])
const officeExt = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

const endpointBase = computed(() => String(config.value.endpoint || '').trim().replace(/\/+$/, ''))

const hasValidConfig = computed(() => {
  return (
    config.value.enabled &&
    !!endpointBase.value &&
    !!config.value.username?.trim() &&
    !!config.value.password?.trim()
  )
})

const authHeader = computed(() => {
  const raw = `${config.value.username || ''}:${config.value.password || ''}`
  return `Basic ${btoa(raw)}`
})

const filteredFiles = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  let out = files.value.filter((item) => {
    if (onlyFolder.value && !item.is_dir) return false
    if (!key) return true
    return item.name.toLowerCase().includes(key)
  })
  out = out.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    if (sortBy.value === 'size') {
      const diff = (a.size || 0) - (b.size || 0)
      return sortAsc.value ? diff : -diff
    }
    if (sortBy.value === 'modified') {
      const diff = new Date(a.modified || 0).getTime() - new Date(b.modified || 0).getTime()
      return sortAsc.value ? diff : -diff
    }
    return sortAsc.value
      ? a.name.localeCompare(b.name, 'zh-Hans-CN')
      : b.name.localeCompare(a.name, 'zh-Hans-CN')
  })
  return out
})

const fileCountText = computed(() => `共 ${filteredFiles.value.length} 项`)
const canPreview = computed(() => !!activeFile.value && previewMode.value !== 'none')

const normalizePath = (path: string) => {
  const raw = String(path || '/').replace(/\\/g, '/').trim()
  if (!raw || raw === '/') return '/'
  const cleaned = raw.startsWith('/') ? raw : `/${raw}`
  return cleaned.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
}

const encodeDavPath = (path: string) => {
  const normalized = normalizePath(path)
  if (normalized === '/') return '/'
  return normalized
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

const buildDavUrl = (path: string) => `${endpointBase.value}/dav${encodeDavPath(path)}`

const buildBreadCrumb = (path: string) => {
  const normalized = normalizePath(path)
  if (normalized === '/') return ['/']
  const parts = normalized.split('/').filter(Boolean)
  const out: string[] = ['/']
  let curr = ''
  parts.forEach((part) => {
    curr += `/${part}`
    out.push(curr)
  })
  return out
}

const parseDavItems = (xml: string, targetPath: string) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const responseNodes = Array.from(doc.getElementsByTagNameNS('*', 'response'))
  const normalizedTarget = normalizePath(targetPath)
  const parsed: DavItem[] = []

  for (const node of responseNodes) {
    const hrefNode = node.getElementsByTagNameNS('*', 'href')[0]
    if (!hrefNode?.textContent) continue

    let itemPath = '/'
    try {
      const hrefUrl = new URL(hrefNode.textContent, endpointBase.value)
      itemPath = decodeURIComponent(hrefUrl.pathname || '/')
    } catch {
      itemPath = decodeURIComponent(hrefNode.textContent || '/')
    }

    itemPath = itemPath.replace(/^\/dav/, '')
    itemPath = normalizePath(itemPath || '/')
    if (itemPath === normalizedTarget) continue

    const display = node.getElementsByTagNameNS('*', 'displayname')[0]?.textContent?.trim()
    const name = display || decodeURIComponent(itemPath.split('/').filter(Boolean).pop() || '')
    if (!name) continue

    const contentLength = node.getElementsByTagNameNS('*', 'getcontentlength')[0]?.textContent?.trim()
    const size = Number(contentLength || 0)
    const modified = node.getElementsByTagNameNS('*', 'getlastmodified')[0]?.textContent?.trim() || ''
    const contentType = node.getElementsByTagNameNS('*', 'getcontenttype')[0]?.textContent?.trim() || ''
    const isDir = node.getElementsByTagNameNS('*', 'collection').length > 0

    parsed.push({
      name,
      path: itemPath,
      is_dir: isDir,
      size: Number.isFinite(size) ? size : 0,
      modified,
      content_type: contentType
    })
  }

  return parsed
}

const cleanupPreviewUrl = () => {
  if (previewUrl.value && previewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = ''
}

const resetPreview = () => {
  cleanupPreviewUrl()
  previewMode.value = 'none'
  previewText.value = ''
  previewHint.value = ''
  previewProgress.value = 0
}

const extOf = (name: string) => (String(name || '').split('.').pop() || '').toLowerCase()

const formatSize = (size: number) => {
  const n = Number(size || 0)
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const formatTime = (text: string) => {
  if (!text) return '-'
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return text
  return d.toLocaleString('zh-CN', { hour12: false })
}

const fileIcon = (item: DavItem) => {
  if (item.is_dir) return '📁'
  const ext = extOf(item.name)
  if (imageExt.has(ext)) return '🖼️'
  if (videoExt.has(ext)) return '🎞️'
  if (audioExt.has(ext)) return '🎵'
  if (ext === 'pdf') return '📄'
  if (officeExt.has(ext)) return '📊'
  if (textExt.has(ext)) return '📝'
  return '📦'
}

const fetchBlobWithProgress = async (
  path: string,
  onProgress?: (percent: number) => void
): Promise<Blob> => {
  const resp = await fetch(buildDavUrl(path), {
    method: 'GET',
    headers: {
      Authorization: authHeader.value
    }
  })
  if (!resp.ok) {
    throw new Error(`下载失败: HTTP ${resp.status}`)
  }

  const total = Number(resp.headers.get('content-length') || 0)
  const contentType = resp.headers.get('content-type') || 'application/octet-stream'
  if (!resp.body) {
    const blob = await resp.blob()
    onProgress?.(100)
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
        onProgress?.(Math.min(99, Math.floor((loaded / total) * 100)))
      }
    }
  }
  onProgress?.(100)
  return new Blob(chunks, { type: contentType })
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
  const contentBase64 = await blobToDataBase64(blob)
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: fileName,
      content_base64: contentBase64,
      content_type: blob.type || 'application/octet-stream',
      ttl_seconds: 7200
    })
  })
  const payload = await resp.json().catch(() => ({}))
  if (!resp.ok || !payload?.success || !payload?.url) {
    throw new Error(payload?.error || `临时上传失败: HTTP ${resp.status}`)
  }
  return String(payload.url)
}

const previewFile = async (file: DavItem) => {
  activeFile.value = file
  previewLoading.value = true
  resetPreview()
  try {
    const ext = extOf(file.name)
    const blob = await fetchBlobWithProgress(file.path, (v) => {
      previewProgress.value = v
    })

    if (imageExt.has(ext)) {
      previewMode.value = 'image'
      previewUrl.value = URL.createObjectURL(blob)
      return
    }
    if (videoExt.has(ext)) {
      previewMode.value = 'video'
      previewUrl.value = URL.createObjectURL(blob)
      return
    }
    if (audioExt.has(ext)) {
      previewMode.value = 'audio'
      previewUrl.value = URL.createObjectURL(blob)
      return
    }
    if (ext === 'pdf') {
      previewMode.value = 'pdf'
      previewUrl.value = URL.createObjectURL(blob)
      return
    }
    if (textExt.has(ext) || (blob.type || '').includes('text')) {
      previewMode.value = 'text'
      previewText.value = await blob.text()
      return
    }
    if (officeExt.has(ext)) {
      const publicUrl = await uploadTempForOffice(file.name, blob)
      const prefix = config.value.office_preview_proxy || defaultConfig.office_preview_proxy
      previewMode.value = 'iframe'
      previewUrl.value = `${prefix}${encodeURIComponent(publicUrl)}`
      previewHint.value = '该预览由在线 Office 预览服务提供。'
      return
    }
    previewMode.value = 'none'
    previewHint.value = '该文件类型暂不支持在线预览，请下载后查看。'
  } catch (e: any) {
    previewMode.value = 'none'
    previewHint.value = e?.message || '预览失败'
  } finally {
    previewLoading.value = false
  }
}

const openFile = async (item: DavItem) => {
  if (item.is_dir) {
    await loadPath(item.path)
    return
  }
  await previewFile(item)
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

  const base64 = await blobToDataBase64(blob)
  return invoke('save_export_file', {
    req: {
      fileName: file.name,
      mimeType: blob.type || 'application/octet-stream',
      contentBase64: base64,
      preferMedia: imageExt.has(extOf(file.name)) || videoExt.has(extOf(file.name))
    }
  }) as Promise<{ path: string; saved_to: string }>
}

const shareSavedFile = async (path: string) => {
  if (!path) return
  try {
    await invoke('open_file_with_system', { path })
  } catch {
    await openExternal(`file://${path}`)
  }
}

const downloadFile = async (file: DavItem, shareAfter = false) => {
  downloading.value = true
  downloadProgress.value = 0
  try {
    const blob = await fetchBlobWithProgress(file.path, (v) => {
      downloadProgress.value = v
    })
    const saved = await saveDownloadedBlob(file, blob)
    showToast(`下载成功：${saved.path}`, 'success')
    if (shareAfter || isMobile) {
      await shareSavedFile(saved.path)
    }
  } catch (e: any) {
    showToast(e?.message || '下载失败', 'error')
  } finally {
    downloading.value = false
  }
}

const parseAndSetConfig = async () => {
  loadingConfig.value = true
  try {
    const remote = await fetchRemoteConfig()
    const share = remote?.resource_share || {}
    const tempServer = remote?.temp_file_server || {}
    config.value = {
      enabled: share.enabled !== false,
      endpoint: String(share.endpoint || defaultConfig.endpoint),
      username: String(share.username || defaultConfig.username),
      password: String(share.password || defaultConfig.password),
      office_preview_proxy: String(share.office_preview_proxy || defaultConfig.office_preview_proxy),
      temp_upload_endpoint: String(
        share.temp_upload_endpoint ||
          tempServer.schedule_upload_endpoint ||
          defaultConfig.temp_upload_endpoint
      )
    }
  } catch {
    config.value = { ...defaultConfig }
  } finally {
    loadingConfig.value = false
  }
}

const loadPath = async (path: string) => {
  if (!hasValidConfig.value) {
    listError.value = '资料分享配置不完整，请在配置工具中检查。'
    files.value = []
    return
  }
  loadingList.value = true
  listError.value = ''
  try {
    const url = buildDavUrl(path === '/' ? '/' : `${normalizePath(path)}/`)
    const resp = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader.value,
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8'
      },
      body: PROPFIND_BODY
    })
    if (!resp.ok) {
      throw new Error(`目录读取失败: HTTP ${resp.status}`)
    }
    const text = await resp.text()
    files.value = parseDavItems(text, path)
    currentPath.value = normalizePath(path)
    breadcrumb.value = buildBreadCrumb(path)
  } catch (e: any) {
    listError.value = e?.message || '目录读取失败'
    files.value = []
  } finally {
    loadingList.value = false
  }
}

const openBreadcrumb = async (path: string) => {
  await loadPath(path)
}

const goParent = async () => {
  if (currentPath.value === '/') return
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  const parent = parts.length ? `/${parts.join('/')}` : '/'
  await loadPath(parent)
}

const toggleSortDirection = () => {
  sortAsc.value = !sortAsc.value
}

const closePreview = () => {
  activeFile.value = null
  resetPreview()
}

const refreshList = async () => {
  await loadPath(currentPath.value)
}

onMounted(async () => {
  await parseAndSetConfig()
  await loadPath('/')
})

onBeforeUnmount(() => {
  resetPreview()
})
</script>

<template>
  <div class="resource-share-view">
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>资料分享</h1>
      <button class="ghost-btn" @click="refreshList">刷新</button>
    </header>

    <section class="status-card">
      <p><strong>WebDAV：</strong>{{ config.endpoint }}</p>
      <p><strong>账号：</strong>{{ config.username }}</p>
      <p><strong>状态：</strong>{{ hasValidConfig ? '可用' : '不可用' }}</p>
    </section>

    <section class="toolbar-card">
      <div class="toolbar-row">
        <button class="ghost-btn" :disabled="currentPath === '/'" @click="goParent">上一级</button>
        <div class="path-view">{{ currentPath }}</div>
      </div>
      <div class="toolbar-row">
        <input v-model.trim="keyword" class="search-input" placeholder="搜索文件或文件夹..." />
        <button class="ghost-btn" @click="showFilter = !showFilter">
          {{ showFilter ? '收起筛选' : '展开筛选' }}
        </button>
      </div>
      <div v-if="showFilter" class="toolbar-row filter-row">
        <label class="check-item">
          <input v-model="onlyFolder" type="checkbox" />
          仅文件夹
        </label>
        <select v-model="sortBy" class="select-box">
          <option value="name">按名称</option>
          <option value="size">按大小</option>
          <option value="modified">按时间</option>
        </select>
        <button class="ghost-btn" @click="toggleSortDirection">
          {{ sortAsc ? '升序' : '降序' }}
        </button>
      </div>
      <div class="breadcrumb">
        <button
          v-for="node in breadcrumb"
          :key="node"
          class="crumb-btn"
          @click="openBreadcrumb(node)"
        >
          {{ node === '/' ? '根目录' : node.split('/').pop() }}
        </button>
      </div>
    </section>

    <section class="files-card">
      <div class="files-head">
        <span>{{ fileCountText }}</span>
        <span v-if="loadingList">正在加载...</span>
      </div>
      <p v-if="listError" class="error-text">{{ listError }}</p>
      <div v-else-if="filteredFiles.length === 0" class="empty-box">暂无文件</div>
      <div v-else class="file-list">
        <button
          v-for="item in filteredFiles"
          :key="item.path"
          class="file-row"
          :class="{ folder: item.is_dir }"
          @click="openFile(item)"
        >
          <span class="icon">{{ fileIcon(item) }}</span>
          <span class="name">{{ item.name }}</span>
          <span class="meta">{{ item.is_dir ? '文件夹' : formatSize(item.size) }}</span>
          <span class="meta">{{ formatTime(item.modified) }}</span>
        </button>
      </div>
    </section>

    <section v-if="activeFile" class="preview-card">
      <div class="preview-head">
        <div>
          <h3>{{ activeFile.name }}</h3>
          <p>{{ activeFile.path }}</p>
        </div>
        <div class="preview-actions">
          <button class="primary-btn" :disabled="downloading" @click="downloadFile(activeFile, false)">
            {{ downloading ? `下载中 ${downloadProgress}%` : '下载' }}
          </button>
          <button class="ghost-btn" :disabled="downloading" @click="downloadFile(activeFile, true)">下载并分享</button>
          <button class="ghost-btn" @click="closePreview">关闭</button>
        </div>
      </div>

      <div v-if="previewLoading" class="loading-box">
        正在加载预览... {{ previewProgress }}%
      </div>
      <p v-if="previewHint" class="hint-text">{{ previewHint }}</p>
      <template v-if="canPreview && !previewLoading">
        <img v-if="previewMode === 'image'" class="preview-image" :src="previewUrl" alt="preview" />
        <video v-else-if="previewMode === 'video'" class="preview-media" :src="previewUrl" controls />
        <audio v-else-if="previewMode === 'audio'" class="preview-media" :src="previewUrl" controls />
        <iframe v-else-if="previewMode === 'pdf' || previewMode === 'iframe'" class="preview-frame" :src="previewUrl" />
        <pre v-else-if="previewMode === 'text'" class="preview-text">{{ previewText }}</pre>
      </template>
    </section>
  </div>
</template>

<style scoped>
.resource-share-view {
  min-height: 100vh;
  padding: 20px 20px 110px;
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 45%, #22d3ee 100%);
}

.view-header,
.status-card,
.toolbar-card,
.files-card,
.preview-card {
  max-width: 1080px;
  margin: 0 auto 16px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 18px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
}

.view-header {
  display: grid;
  grid-template-columns: 110px 1fr 110px;
  align-items: center;
  padding: 14px;
}

.view-header h1 {
  margin: 0;
  text-align: center;
  font-size: 22px;
  color: #0f172a;
}

.status-card {
  padding: 12px 16px;
  font-size: 14px;
  color: #334155;
}

.status-card p {
  margin: 6px 0;
}

.toolbar-card {
  padding: 14px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.filter-row {
  flex-wrap: wrap;
}

.path-view {
  flex: 1;
  min-height: 38px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-input,
.select-box {
  height: 38px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0 12px;
  font-size: 14px;
  color: #0f172a;
  background: #fff;
}

.search-input {
  flex: 1;
}

.check-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

.ghost-btn,
.back-btn,
.primary-btn {
  height: 38px;
  border-radius: 10px;
  border: none;
  padding: 0 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.ghost-btn,
.back-btn {
  background: rgba(99, 102, 241, 0.14);
  color: #1e293b;
}

.primary-btn {
  background: linear-gradient(120deg, #2563eb, #0891b2);
  color: #fff;
}

.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.crumb-btn {
  border: 1px solid rgba(37, 99, 235, 0.26);
  background: rgba(219, 234, 254, 0.65);
  color: #1d4ed8;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.files-card {
  padding: 14px;
}

.files-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  color: #334155;
}

.file-list {
  display: grid;
  gap: 8px;
}

.file-row {
  display: grid;
  grid-template-columns: 28px 1fr 120px 160px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
}

.file-row.folder {
  background: rgba(240, 249, 255, 0.9);
}

.file-row .icon {
  font-size: 18px;
}

.file-row .name {
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row .meta {
  font-size: 12px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-box {
  padding: 16px;
  text-align: center;
  color: #64748b;
  border: 1px dashed #94a3b8;
  border-radius: 12px;
}

.error-text {
  margin: 0;
  color: #dc2626;
  font-size: 13px;
}

.preview-card {
  padding: 14px;
}

.preview-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.preview-head h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.preview-head p {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
}

.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.loading-box,
.hint-text {
  font-size: 13px;
  color: #475569;
  margin: 0 0 10px;
}

.preview-image {
  width: 100%;
  max-height: 60vh;
  object-fit: contain;
  border-radius: 12px;
  background: #0f172a;
}

.preview-media {
  width: 100%;
}

.preview-frame {
  width: 100%;
  min-height: 60vh;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
}

.preview-text {
  margin: 0;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  max-height: 60vh;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 820px) {
  .resource-share-view {
    padding: 14px 12px 100px;
  }

  .view-header {
    grid-template-columns: 88px 1fr 88px;
    padding: 10px;
  }

  .view-header h1 {
    font-size: 19px;
  }

  .toolbar-row {
    flex-wrap: wrap;
  }

  .search-input,
  .select-box,
  .path-view {
    width: 100%;
  }

  .file-row {
    grid-template-columns: 26px 1fr;
    gap: 6px;
  }

  .file-row .meta {
    grid-column: 2 / 3;
  }

  .preview-head {
    flex-direction: column;
  }
}
</style>
