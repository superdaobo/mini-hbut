<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { fetchRemoteConfig } from '../utils/remote_config'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { useAppSettings } from '../utils/app_settings'

defineProps({ studentId: { type: String, default: '' } })
const emit = defineEmits(['back'])

type ShareConfig = { enabled: boolean; endpoint: string; username: string; password: string; office_preview_proxy: string; temp_upload_endpoint: string }
type DavItem = { name: string; path: string; is_dir: boolean; size: number; modified: string; content_type: string }
type DownloadProgressStat = { percent: number; loaded: number; total: number; elapsedMs: number }

const DEFAULT_CONFIG: ShareConfig = {
  enabled: true,
  endpoint: 'https://mini-hbut-chaoxing-webdav.hf.space',
  username: 'mini-hbut',
  password: 'mini-hbut',
  office_preview_proxy: 'https://view.officeapps.live.com/op/view.aspx?src=',
  temp_upload_endpoint: ''
}

const appSettings = useAppSettings()
const DIR_CACHE_TTL_MS = 30_000
const PARALLEL_MIN_SIZE = 2 * 1024 * 1024
const dirCache = new Map<string, { ts: number; items: DavItem[] }>()

const isNative = (() => { try { return typeof isTauri === 'function' && isTauri() } catch { return false } })()
const isMobile = (() => (typeof navigator === 'undefined' ? false : /android|iphone|ipad|ipod/i.test(navigator.userAgent || '')))()

const loadingConfig = ref(true)
const loadingList = ref(false)
const listError = ref('')
const config = ref<ShareConfig>({ ...DEFAULT_CONFIG })
const currentPath = ref('/')
const files = ref<DavItem[]>([])
const keyword = ref('')
const onlyFolder = ref(false)
const sortBy = ref<'name' | 'size' | 'modified'>('name')
const sortAsc = ref(true)
const showFilter = ref(false)
const breadcrumb = ref<string[]>(['/'])

const activeFile = ref<DavItem | null>(null)
const previewMode = ref<'none' | 'image' | 'video' | 'audio' | 'pdf' | 'iframe' | 'text'>('none')
const previewUrl = ref('')
const previewText = ref('')
const previewHint = ref('')
const previewLoading = ref(false)
const previewProgress = ref(0)
const previewFullscreen = ref(false)

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
const previewThreadCount = computed(() => Math.max(1, Number(isMobile ? appSettings.resourceShare?.previewThreadsMobile : appSettings.resourceShare?.previewThreadsDesktop) || 1))
const downloadThreadCount = computed(() => Math.max(1, Number(isMobile ? appSettings.resourceShare?.downloadThreadsMobile : appSettings.resourceShare?.downloadThreadsDesktop) || 1))
const threadConfigHint = computed(() => `当前设备：${isMobile ? '移动端' : '桌面端'} · 预览并发 ${previewThreadCount.value} 线程 · 下载并发 ${downloadThreadCount.value} 线程（设置 > 后端 可修改）`)
const fileCountText = computed(() => `共 ${filteredFiles.value.length} 项`)
const canPreview = computed(() => !!activeFile.value && previewMode.value !== 'none')
const downloadSpeedText = computed(() => (!downloading.value || downloadSpeedMbps.value <= 0 ? '--' : `${downloadSpeedMbps.value.toFixed(2)} MB/s`))
const downloadEtaText = computed(() => (downloading.value ? formatEta(downloadEtaSeconds.value) : '--'))

const filteredFiles = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  const out = files.value.filter((it) => (onlyFolder.value ? it.is_dir : true) && (!key || it.name.toLowerCase().includes(key)))
  return out.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    if (sortBy.value === 'size') return sortAsc.value ? a.size - b.size : b.size - a.size
    if (sortBy.value === 'modified') return sortAsc.value ? new Date(a.modified).getTime() - new Date(b.modified).getTime() : new Date(b.modified).getTime() - new Date(a.modified).getTime()
    return sortAsc.value ? a.name.localeCompare(b.name, 'zh-Hans-CN') : b.name.localeCompare(a.name, 'zh-Hans-CN')
  })
})

const buildAuthHeaders = (headers: Record<string, string> = {}) => ({ Authorization: authHeader.value, ...headers })
const normalizePath = (p: string) => { const raw = String(p || '/').replace(/\\/g, '/').trim(); if (!raw || raw === '/') return '/'; const cleaned = raw.startsWith('/') ? raw : `/${raw}`; return cleaned.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/' }
const encodeDavPath = (p: string) => normalizePath(p).split('/').map((seg) => encodeURIComponent(seg)).join('/')
const buildDavUrl = (p: string) => `${endpointBase.value}/dav${encodeDavPath(p)}`
const buildBreadCrumb = (p: string) => { const n = normalizePath(p); if (n === '/') return ['/']; const parts = n.split('/').filter(Boolean); const out = ['/']; let cur = ''; parts.forEach((part) => { cur += `/${part}`; out.push(cur) }); return out }
const formatEta = (s: number) => (!Number.isFinite(s) || s <= 0 ? '--' : s < 60 ? `${Math.ceil(s)} 秒` : `${Math.floor(s / 60)} 分 ${Math.ceil(s % 60)} 秒`)
const formatSize = (n: number) => (n <= 0 ? '-' : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`)
const formatTime = (t: string) => { if (!t) return '-'; const d = new Date(t); return Number.isNaN(d.getTime()) ? t : d.toLocaleString('zh-CN', { hour12: false }) }
const fileIcon = (it: DavItem) => it.is_dir ? '📁' : imageExt.has(extOf(it.name)) ? '🖼️' : videoExt.has(extOf(it.name)) ? '🎬' : audioExt.has(extOf(it.name)) ? '🎵' : extOf(it.name) === 'pdf' ? '📕' : officeExt.has(extOf(it.name)) ? '📘' : textExt.has(extOf(it.name)) ? '📄' : '📦'
const extOf = (name: string) => (String(name || '').split('.').pop() || '').toLowerCase()

const cleanupPreviewUrl = () => { if (previewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value); previewUrl.value = '' }
const resetPreview = () => { cleanupPreviewUrl(); previewMode.value = 'none'; previewText.value = ''; previewHint.value = ''; previewProgress.value = 0 }
const resetDownloadStat = () => { downloadProgress.value = 0; downloadSpeedMbps.value = 0; downloadEtaSeconds.value = 0; lastSpeedPoint.value = null }
const applyDownloadStat = (s: DownloadProgressStat) => {
  downloadProgress.value = s.percent
  const now = Date.now()
  if (!lastSpeedPoint.value) { lastSpeedPoint.value = { loaded: s.loaded, ts: now }; return }
  const dBytes = Math.max(0, s.loaded - lastSpeedPoint.value.loaded)
  const dMs = Math.max(1, now - lastSpeedPoint.value.ts)
  const instSpeed = (dBytes * 1000) / dMs
  const avgSpeed = s.loaded / Math.max(0.2, s.elapsedMs / 1000)
  const speed = instSpeed > 0 ? instSpeed : avgSpeed
  downloadSpeedMbps.value = speed / 1024 / 1024
  const remain = Math.max(0, s.total - s.loaded)
  downloadEtaSeconds.value = speed > 1 ? remain / speed : 0
  lastSpeedPoint.value = { loaded: s.loaded, ts: now }
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
    try { itemPath = decodeURIComponent(new URL(hrefText, endpointBase.value).pathname || '/') } catch { itemPath = decodeURIComponent(hrefText) }
    itemPath = normalizePath(itemPath.replace(/^\/dav/, '') || '/')
    if (itemPath === target) continue
    const name = node.getElementsByTagNameNS('*', 'displayname')[0]?.textContent?.trim() || decodeURIComponent(itemPath.split('/').filter(Boolean).pop() || '')
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

const detectRangeSupport = async (path: string) => {
  const resp = await fetch(buildDavUrl(path), { method: 'GET', headers: buildAuthHeaders({ Range: 'bytes=0-0' }) })
  if (resp.status !== 206) return null
  const match = String(resp.headers.get('content-range') || '').match(/bytes\s+\d+-\d+\/(\d+)/i)
  const total = Number(match?.[1] || 0)
  const contentType = resp.headers.get('content-type') || 'application/octet-stream'
  await resp.arrayBuffer().catch(() => {})
  return Number.isFinite(total) && total > 0 ? { total, contentType } : null
}

const fetchBlobSequential = async (path: string, onProgress?: (s: DownloadProgressStat) => void) => {
  const startedAt = Date.now()
  const resp = await fetch(buildDavUrl(path), { method: 'GET', headers: buildAuthHeaders() })
  if (!resp.ok) throw new Error(`下载失败：HTTP ${resp.status}`)
  const total = Number(resp.headers.get('content-length') || 0)
  const contentType = resp.headers.get('content-type') || 'application/octet-stream'
  if (!resp.body) {
    const blob = await resp.blob()
    onProgress?.({ percent: 100, loaded: blob.size || total || 0, total: total || blob.size || 0, elapsedMs: Date.now() - startedAt })
    return blob.type ? blob : new Blob([blob], { type: contentType })
  }
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) { chunks.push(value); loaded += value.byteLength; if (total > 0) onProgress?.({ percent: Math.min(99, Math.floor((loaded / total) * 100)), loaded, total, elapsedMs: Date.now() - startedAt }) }
  }
  onProgress?.({ percent: 100, loaded: total > 0 ? total : loaded, total: total > 0 ? total : loaded, elapsedMs: Date.now() - startedAt })
  return new Blob(chunks, { type: contentType })
}

const fetchBlobParallel = async (path: string, total: number, contentType: string, threadCount: number, onProgress?: (s: DownloadProgressStat) => void) => {
  const startedAt = Date.now()
  const chunkSize = Math.max(1024 * 1024, Math.ceil(total / Math.max(1, threadCount)))
  const ranges: Array<{ start: number; end: number; index: number }> = []
  for (let start = 0; start < total; start += chunkSize) ranges.push({ start, end: Math.min(total - 1, start + chunkSize - 1), index: ranges.length })
  const buffers = new Array<Uint8Array>(ranges.length)
  let loaded = 0
  let cursor = 0
  const workers = Array.from({ length: Math.min(threadCount, ranges.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= ranges.length) break
      const rg = ranges[i]
      const resp = await fetch(buildDavUrl(path), { method: 'GET', headers: buildAuthHeaders({ Range: `bytes=${rg.start}-${rg.end}` }) })
      if (!(resp.ok || resp.status === 206)) throw new Error(`分片下载失败：HTTP ${resp.status}`)
      const arr = new Uint8Array(await resp.arrayBuffer())
      buffers[rg.index] = arr
      loaded += arr.byteLength
      onProgress?.({ percent: Math.min(99, Math.floor((loaded / total) * 100)), loaded, total, elapsedMs: Date.now() - startedAt })
    }
  })
  await Promise.all(workers)
  onProgress?.({ percent: 100, loaded: total, total, elapsedMs: Date.now() - startedAt })
  return new Blob(buffers, { type: contentType || 'application/octet-stream' })
}

const fetchBlobWithProgress = async (path: string, onProgress?: (s: DownloadProgressStat) => void, preferParallel = true, threadCount = 4) => {
  if (preferParallel) {
    try {
      const support = await detectRangeSupport(path)
      if (support && support.total >= PARALLEL_MIN_SIZE) return await fetchBlobParallel(path, support.total, support.contentType, Math.max(2, threadCount), onProgress)
    } catch (e) { console.warn('[资料分享] 并发模式不可用，回退顺序下载', e) }
  }
  return fetchBlobSequential(path, onProgress)
}

const blobToDataBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => { const text = String(reader.result || ''); resolve(text.includes(',') ? text.split(',')[1] : text) }
  reader.onerror = (e) => reject(e)
  reader.readAsDataURL(blob)
})

const uploadTempForOffice = async (fileName: string, blob: Blob) => {
  const endpoint = String(config.value.temp_upload_endpoint || '').trim()
  if (!endpoint) throw new Error('未配置临时上传地址，无法在线预览 Office 文件')
  const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: fileName, content_base64: await blobToDataBase64(blob), content_type: blob.type || 'application/octet-stream', ttl_seconds: 7200 }) })
  const payload = await resp.json().catch(() => ({}))
  if (!resp.ok || !payload?.success || !payload?.url) throw new Error(payload?.error || `临时上传失败：HTTP ${resp.status}`)
  return String(payload.url)
}

const previewFile = async (file: DavItem) => {
  activeFile.value = file
  previewLoading.value = true
  previewFullscreen.value = false
  resetPreview()
  try {
    const ext = extOf(file.name)
    const blob = await fetchBlobWithProgress(file.path, (s) => { previewProgress.value = s.percent }, true, previewThreadCount.value)
    if (imageExt.has(ext)) { previewMode.value = 'image'; previewUrl.value = URL.createObjectURL(blob); return }
    if (videoExt.has(ext)) { previewMode.value = 'video'; previewUrl.value = URL.createObjectURL(blob); return }
    if (audioExt.has(ext)) { previewMode.value = 'audio'; previewUrl.value = URL.createObjectURL(blob); return }
    if (ext === 'pdf') { previewMode.value = 'pdf'; previewUrl.value = URL.createObjectURL(blob); return }
    if (textExt.has(ext) || (blob.type || '').includes('text')) { previewMode.value = 'text'; previewText.value = await blob.text(); return }
    if (officeExt.has(ext)) {
      const url = await uploadTempForOffice(file.name, blob)
      previewMode.value = 'iframe'
      previewUrl.value = `${config.value.office_preview_proxy || DEFAULT_CONFIG.office_preview_proxy}${encodeURIComponent(url)}`
      previewHint.value = '该预览由在线 Office 服务提供。'
      return
    }
    previewHint.value = '该文件类型暂不支持在线预览，请下载后查看。'
  } catch (e: any) {
    previewHint.value = e?.message || '预览失败'
  } finally {
    previewLoading.value = false
  }
}

const saveDownloadedBlob = async (file: DavItem, blob: Blob) => {
  if (!isNative) {
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href; a.download = file.name; a.click(); URL.revokeObjectURL(href)
    return { path: file.name, saved_to: 'browser' }
  }
  return invoke('save_export_file', { req: { fileName: file.name, mimeType: blob.type || 'application/octet-stream', contentBase64: await blobToDataBase64(blob), preferMedia: imageExt.has(extOf(file.name)) || videoExt.has(extOf(file.name)) } }) as Promise<{ path: string; saved_to: string }>
}

const shareSavedFile = async (path: string) => { if (!path) return; try { await invoke('open_file_with_system', { path }) } catch { await openExternal(`file://${path}`) } }
const downloadFile = async (file: DavItem, shareAfter = false) => {
  downloading.value = true
  resetDownloadStat()
  try {
    const blob = await fetchBlobWithProgress(file.path, (s) => applyDownloadStat(s), true, downloadThreadCount.value)
    const saved = await saveDownloadedBlob(file, blob)
    showToast(`下载成功：${saved.path}`, 'success')
    if (shareAfter || isMobile) await shareSavedFile(saved.path)
  } catch (e: any) { showToast(e?.message || '下载失败', 'error') }
  finally { downloading.value = false; resetDownloadStat() }
}

const parseAndSetConfig = async () => {
  loadingConfig.value = true
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
  } catch { config.value = { ...DEFAULT_CONFIG }; dirCache.clear() }
  finally { loadingConfig.value = false }
}

const loadPath = async (path: string, forceRefresh = false) => {
  if (!hasValidConfig.value) { listError.value = '资料分享配置不完整，请在配置工具中检查。'; files.value = []; return }
  const normalized = normalizePath(path)
  const cached = dirCache.get(normalized)
  if (!forceRefresh && cached && Date.now() - cached.ts < DIR_CACHE_TTL_MS) {
    files.value = cached.items; currentPath.value = normalized; breadcrumb.value = buildBreadCrumb(normalized); listError.value = ''; return
  }
  loadingList.value = true
  listError.value = ''
  try {
    const url = buildDavUrl(normalized === '/' ? '/' : `${normalized}/`)
    const resp = await fetch(url, { method: 'PROPFIND', headers: buildAuthHeaders({ Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }), body: PROPFIND_BODY })
    if (!resp.ok) throw new Error(`目录读取失败：HTTP ${resp.status}`)
    files.value = parseDavItems(await resp.text(), normalized)
    dirCache.set(normalized, { ts: Date.now(), items: files.value })
    currentPath.value = normalized
    breadcrumb.value = buildBreadCrumb(normalized)
  } catch (e: any) { listError.value = e?.message || '目录读取失败'; files.value = [] }
  finally { loadingList.value = false }
}

const closePreview = () => { activeFile.value = null; previewFullscreen.value = false; resetPreview() }
const goParent = async () => { if (currentPath.value === '/') return; const parts = currentPath.value.split('/').filter(Boolean); parts.pop(); await loadPath(parts.length ? `/${parts.join('/')}` : '/') }
const openBreadcrumb = async (path: string) => { await loadPath(path) }
const refreshList = async () => { await loadPath(currentPath.value, true) }

onMounted(async () => { await parseAndSetConfig(); await loadPath('/') })
onBeforeUnmount(() => { resetPreview(); resetDownloadStat() })
</script>

<template>
  <div class="resource-share-view">
    <header class="view-header">
      <button class="btn" @click="emit('back')">← 返回</button>
      <h1>资料分享</h1>
      <button class="btn" @click="refreshList">刷新</button>
    </header>

    <section class="card">
      <div class="row"><button class="btn" :disabled="currentPath === '/'" @click="goParent">上一级</button><div class="path">{{ currentPath }}</div></div>
      <div class="row"><input v-model.trim="keyword" class="input" placeholder="搜索文件或文件夹..." /><button class="btn" @click="showFilter = !showFilter">{{ showFilter ? '收起筛选' : '展开筛选' }}</button></div>
      <div v-if="loadingConfig" class="hint">正在同步远程配置...</div>
      <div v-else class="hint">{{ threadConfigHint }}</div>
      <div v-if="showFilter" class="row wrap">
        <label class="check"><input v-model="onlyFolder" type="checkbox" />仅文件夹</label>
        <select v-model="sortBy" class="input short"><option value="name">按名称</option><option value="size">按大小</option><option value="modified">按时间</option></select>
        <button class="btn" @click="sortAsc = !sortAsc">{{ sortAsc ? '升序' : '降序' }}</button>
      </div>
      <div class="crumbs"><button v-for="node in breadcrumb" :key="node" class="crumb" @click="openBreadcrumb(node)">{{ node === '/' ? '根目录' : node.split('/').pop() }}</button></div>
    </section>

    <section class="card">
      <div class="head"><span>{{ fileCountText }}</span><span v-if="loadingList">正在加载...</span></div>
      <p v-if="listError" class="error">{{ listError }}</p>
      <div v-else-if="filteredFiles.length === 0" class="empty">暂无文件</div>
      <div v-else class="list">
        <button v-for="item in filteredFiles" :key="item.path" class="item" @click="item.is_dir ? loadPath(item.path) : previewFile(item)">
          <span>{{ fileIcon(item) }}</span><span class="name">{{ item.name }}</span><span class="meta">{{ item.is_dir ? '文件夹' : formatSize(item.size) }}</span><span class="meta">{{ formatTime(item.modified) }}</span>
        </button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="activeFile" class="overlay" @click.self="closePreview">
        <div class="modal" :class="{ fullscreen: previewFullscreen }">
          <div class="modal-head">
            <div><h3>{{ activeFile.name }}</h3><p>{{ activeFile.path }}</p></div>
            <div class="actions">
              <button class="btn" @click="previewFullscreen = !previewFullscreen">{{ previewFullscreen ? '退出全屏' : '全屏预览' }}</button>
              <button class="btn primary" :disabled="downloading" @click="downloadFile(activeFile, false)">{{ downloading ? `下载中 ${downloadProgress}%` : '下载' }}</button>
              <button class="btn" :disabled="downloading" @click="downloadFile(activeFile, true)">下载并分享</button>
              <button class="btn" @click="closePreview">关闭</button>
            </div>
          </div>
          <div v-if="downloading" class="stats"><span>速度：{{ downloadSpeedText }}</span><span>预计剩余：{{ downloadEtaText }}</span><span>进度：{{ downloadProgress }}%</span></div>
          <div v-if="downloading" class="track"><div class="fill" :style="{ width: `${downloadProgress}%` }" /></div>
          <div v-if="previewLoading" class="hint">正在加载预览... {{ previewProgress }}%</div>
          <p v-if="previewHint" class="hint">{{ previewHint }}</p>
          <img v-if="canPreview && !previewLoading && previewMode === 'image'" class="preview" :src="previewUrl" alt="preview" />
          <video v-else-if="canPreview && !previewLoading && previewMode === 'video'" class="preview" :src="previewUrl" controls />
          <audio v-else-if="canPreview && !previewLoading && previewMode === 'audio'" class="preview" :src="previewUrl" controls />
          <iframe v-else-if="canPreview && !previewLoading && (previewMode === 'pdf' || previewMode === 'iframe')" class="frame" :src="previewUrl" />
          <pre v-else-if="canPreview && !previewLoading && previewMode === 'text'" class="text">{{ previewText }}</pre>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.resource-share-view{min-height:100vh;padding:20px 20px 110px;background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 45%,#22d3ee 100%)}
.view-header,.card{max-width:1080px;margin:0 auto 16px;background:rgba(255,255,255,.94);border:1px solid rgba(148,163,184,.3);border-radius:18px;box-shadow:0 10px 24px rgba(15,23,42,.14)}
.view-header{display:grid;grid-template-columns:110px 1fr 110px;align-items:center;padding:14px}
.view-header h1{margin:0;text-align:center;font-size:22px;color:#0f172a}
.card{padding:14px}
.row{display:flex;align-items:center;gap:10px;margin-bottom:10px}.row.wrap{flex-wrap:wrap}
.path,.input{height:38px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;padding:0 12px}.path{flex:1;display:flex;align-items:center;background:#f8fafc;font-size:13px;color:#1e293b}
.input{flex:1;font-size:14px;color:#0f172a}.input.short{width:auto;flex:none}
.btn{height:38px;border:none;border-radius:10px;background:rgba(99,102,241,.14);padding:0 14px;font-size:14px;font-weight:600;color:#1e293b;cursor:pointer}.btn:disabled{opacity:.6;cursor:not-allowed}.btn.primary{background:linear-gradient(120deg,#2563eb,#0891b2);color:#fff}
.check{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#334155}
.hint{margin:0 0 10px;font-size:12px;color:#64748b}
.crumbs{display:flex;flex-wrap:wrap;gap:8px}.crumb{border:1px solid rgba(37,99,235,.26);background:rgba(219,234,254,.65);color:#1d4ed8;border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:13px;color:#334155}
.list{display:grid;gap:8px}.item{display:grid;grid-template-columns:28px 1fr 120px 160px;gap:8px;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:12px;background:#fff;padding:8px 10px;text-align:left;cursor:pointer}
.name{font-size:14px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta{font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{padding:16px;text-align:center;color:#64748b;border:1px dashed #94a3b8;border-radius:12px}.error{margin:0;color:#dc2626;font-size:13px}
.overlay{position:fixed;inset:0;z-index:90;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px}
.modal{width:min(1260px,96vw);height:min(88vh,920px);background:rgba(255,255,255,.98);border:1px solid rgba(148,163,184,.3);border-radius:18px;box-shadow:0 12px 30px rgba(15,23,42,.3);padding:14px;display:flex;flex-direction:column;overflow:hidden}.modal.fullscreen{width:100vw;height:100vh;border-radius:0;padding:12px}
.modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}.modal-head h3{margin:0;font-size:18px;color:#0f172a}.modal-head p{margin:6px 0 0;font-size:12px;color:#64748b;word-break:break-all}.actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:-2px 0 10px;color:#475569;font-size:13px}.track{width:100%;height:8px;border-radius:999px;background:rgba(148,163,184,.26);overflow:hidden;margin:-2px 0 10px}.fill{height:100%;background:linear-gradient(90deg,#2563eb,#06b6d4);transition:width .18s ease}
.preview{width:100%;max-height:calc(100vh - 180px);object-fit:contain;background:#0f172a;border-radius:12px;flex:1}.frame{width:100%;height:calc(100vh - 180px);min-height:320px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;flex:1}.text{margin:0;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:12px;max-height:calc(100vh - 180px);overflow:auto;font-size:12px;line-height:1.5;flex:1}
@media (max-width:820px){.resource-share-view{padding:14px 12px 100px}.view-header{grid-template-columns:88px 1fr 88px;padding:10px}.view-header h1{font-size:19px}.row{flex-wrap:wrap}.input,.path{width:100%}.item{grid-template-columns:26px 1fr;gap:6px}.meta{grid-column:2 / 3}.modal-head{flex-direction:column}.modal{width:100%;height:92vh;padding:12px}}
</style>
