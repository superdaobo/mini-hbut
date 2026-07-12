<script setup>
/**
 * 学习通班级资料
 * - 固定邀请码 73202625（库来西库）
 * - 首次进入未入班：先询问是否加入
 * - 门户 CAS → 学习通 SSO（不二次登录）
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from '../utils/external_link'
import { TPageHeader } from './templates'

/** 固定班级邀请码（产品约定，不开放自填） */
const FIXED_INVITE_CODE = '73202625'
/** 与后端固定元数据一致：邀请码 → 课程/班级 */
const FIXED_CLASS_META = Object.freeze({
  invite_code: FIXED_INVITE_CODE,
  course_id: '264356359',
  clazz_id: '148246853',
  course_name: '库来西库',
  teacher_name: '周金阳',
  cover_url: '',
  cpi: '509967218'
})
const LAST_CLASS_KEY = 'hbu_chaoxing_class_last_v1'
const JOIN_DECLINED_KEY = 'hbu_chaoxing_class_declined_v1'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const loadingSso = ref(false)
const loadingBoot = ref(true)
const loadingJoin = ref(false)
const loadingResources = ref(false)
const actingId = ref('')
const ssoReady = ref(false)
const ssoHint = ref('')
const error = ref('')
const statusMsg = ref('')
const preview = ref(null)
const resources = ref([])
const activeClass = ref(null)
const showJoinDialog = ref(false)
const joinDeclined = ref(false)
const bootPhase = ref('init') // init | sso | preview | ready | error
/** 文件夹导航栈：{ name, parent_data_id, folder_kind, data_name } */
const folderStack = ref([])
const showPreviewModal = ref(false)
const previewModalTitle = ref('')
const previewModalUrl = ref('')
const previewModalLoading = ref(false)
const previewModalError = ref('')
const previewModalOfficial = ref(false)
const previewDownloadUrl = ref('')

const hasTauri = isTauriRuntime()

const courseTitle = computed(() => {
  const p = activeClass.value || preview.value
  return String(p?.course_name || p?.courseName || '班级资料').trim()
})

const teacherName = computed(() => {
  const p = activeClass.value || preview.value
  return String(p?.teacher_name || p?.teacherName || '').trim()
})

const coverUrl = computed(() => {
  const p = activeClass.value || preview.value
  const raw = String(p?.cover_url || p?.coverUrl || '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('http://')) return `https://${raw.slice(7)}`
  return raw
})

const resourceCount = computed(() => resources.value.length)

const isJoined = computed(() => !!(activeClass.value?.course_id && activeClass.value?.clazz_id))

const formatErr = (e) => {
  if (!e) return '未知错误'
  if (typeof e === 'string') return e
  return e?.message || e?.error || String(e)
}

const studentPayload = () => {
  const sid = String(props.studentId || '').trim()
  return sid ? { student_id: sid } : { student_id: null }
}

const loadLastClass = () => {
  try {
    const raw = localStorage.getItem(LAST_CLASS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.course_id && parsed?.clazz_id) {
      activeClass.value = {
        invite_code: FIXED_INVITE_CODE,
        course_id: String(parsed.course_id),
        clazz_id: String(parsed.clazz_id),
        course_name: String(parsed.course_name || ''),
        teacher_name: String(parsed.teacher_name || ''),
        cover_url: String(parsed.cover_url || ''),
        cpi: String(parsed.cpi || '0')
      }
      return activeClass.value
    }
  } catch {
    /* ignore */
  }
  return null
}

const saveLastClass = (cls) => {
  try {
    localStorage.setItem(LAST_CLASS_KEY, JSON.stringify(cls))
    localStorage.removeItem(JOIN_DECLINED_KEY)
  } catch {
    /* ignore */
  }
}

const loadDeclined = () => {
  try {
    joinDeclined.value = localStorage.getItem(JOIN_DECLINED_KEY) === FIXED_INVITE_CODE
  } catch {
    joinDeclined.value = false
  }
}

const markDeclined = () => {
  joinDeclined.value = true
  showJoinDialog.value = false
  try {
    localStorage.setItem(JOIN_DECLINED_KEY, FIXED_INVITE_CODE)
  } catch {
    /* ignore */
  }
}

const ensureSso = async () => {
  loadingSso.value = true
  bootPhase.value = 'sso'
  ssoHint.value = '正在通过门户会话接入学习通…'
  try {
    if (!hasTauri) {
      throw new Error('请在客户端内使用本功能')
    }
    const res = await invokeNative('chaoxing_class_ensure_sso', {
      req: studentPayload()
    })
    ssoReady.value = !!(res?.success ?? res?.sso)
    ssoHint.value = ssoReady.value
      ? (res?.partial ? '门户会话部分可用（已可访问固定班级）' : '门户 SSO 已连接')
      : '会话未就绪，请重新登录门户'
    return ssoReady.value
  } catch (e) {
    ssoReady.value = false
    const msg = formatErr(e)
    ssoHint.value = msg
    // 门户过期 ≠ 断网：明确提示用户去登录
    error.value = msg.includes('过期') || msg.includes('登录')
      ? `${msg}（接口可达，属于会话失效，不是客户端断网）`
      : msg
    return false
  } finally {
    loadingSso.value = false
  }
}

const fetchPreview = async () => {
  bootPhase.value = 'preview'
  const res = await invokeNative('chaoxing_class_preview_invite', {
    req: { invite_code: FIXED_INVITE_CODE, ...studentPayload() }
  })
  preview.value = {
    invite_code: FIXED_INVITE_CODE,
    course_id: String(res.course_id || ''),
    clazz_id: String(res.clazz_id || ''),
    course_name: String(res.course_name || '班级'),
    teacher_name: String(res.teacher_name || ''),
    cover_url: String(res.cover_url || ''),
    cpi: '0'
  }
  return preview.value
}

const handleJoinConfirm = async () => {
  loadingJoin.value = true
  error.value = ''
  statusMsg.value = ''
  try {
    // SSO 由后端 accept 路径统一缓存/静默续期，避免前端再串一遍
    const res = await invokeNative('chaoxing_class_accept_invite', {
      req: { invite_code: FIXED_INVITE_CODE, ...studentPayload() }
    })
    const p = res?.preview || preview.value || {}
    const cls = {
      invite_code: FIXED_INVITE_CODE,
      course_id: String(p.course_id || preview.value?.course_id || ''),
      clazz_id: String(p.clazz_id || preview.value?.clazz_id || ''),
      course_name: String(p.course_name || preview.value?.course_name || ''),
      teacher_name: String(p.teacher_name || preview.value?.teacher_name || ''),
      cover_url: String(p.cover_url || preview.value?.cover_url || ''),
      cpi: '0'
    }
    if (!cls.course_id || !cls.clazz_id) {
      throw new Error('入班成功但未返回课程信息')
    }
    preview.value = cls
    activeClass.value = cls
    saveLastClass(cls)
    showJoinDialog.value = false
    joinDeclined.value = false
    statusMsg.value = res?.already_joined ? '你已在该班级' : '加入成功'
    await loadResources()
  } catch (e) {
    const msg = formatErr(e)
    // 已加入类文案：仍视为成功并继续
    if (msg.includes('已') && (msg.includes('加入') || msg.includes('在'))) {
      if (preview.value?.course_id) {
        activeClass.value = { ...preview.value, invite_code: FIXED_INVITE_CODE, cpi: '0' }
        saveLastClass(activeClass.value)
        showJoinDialog.value = false
        await loadResources()
        return
      }
    }
    error.value = msg
  } finally {
    loadingJoin.value = false
  }
}

const reopenJoinDialog = async () => {
  error.value = ''
  joinDeclined.value = false
  try {
    localStorage.removeItem(JOIN_DECLINED_KEY)
  } catch {
    /* ignore */
  }
  try {
    if (!preview.value) await fetchPreview()
    showJoinDialog.value = true
  } catch (e) {
    error.value = formatErr(e)
  }
}

const currentFolder = computed(() =>
  folderStack.value.length ? folderStack.value[folderStack.value.length - 1] : null
)

const breadcrumbLabels = computed(() => {
  const base = ['班级资料']
  return base.concat(folderStack.value.map((f) => f.name || '文件夹'))
})

const mapResourceItem = (item) => ({
  data_id: String(item.data_id || item.dataId || ''),
  name: String(item.name || '未命名'),
  file_type: String(item.file_type || item.fileType || ''),
  object_id: String(item.object_id || item.objectId || ''),
  size_label: String(item.size_label || item.sizeLabel || '-'),
  creator: String(item.creator || ''),
  created_at: String(item.created_at || item.createdAt || ''),
  is_folder: !!(item.is_folder ?? item.isFolder),
  folder_kind: String(item.folder_kind || item.folderKind || ''),
  download_url: String(item.download_url || item.downloadUrl || ''),
  preview_cdn_url: String(item.preview_cdn_url || item.previewCdnUrl || ''),
  is_downloadable: !!(item.is_downloadable ?? item.isDownloadable ?? true)
})

const loadResources = async () => {
  const cls = activeClass.value || preview.value
  if (!cls?.course_id || !cls?.clazz_id) {
    error.value = '尚未加入班级'
    return
  }
  loadingResources.value = true
  error.value = ''
  try {
    const folder = currentFolder.value
    const res = await invokeNative('chaoxing_class_list_resources', {
      req: {
        course_id: cls.course_id,
        clazz_id: cls.clazz_id,
        cpi: cls.cpi || '0',
        parent_data_id: folder?.parent_data_id || null,
        data_name: folder?.data_name || null,
        parent_chain: folder?.parent_chain || null,
        folder_kind: folder?.folder_kind || null,
        ...studentPayload()
      }
    })
    // 回写真实 cpi
    if (res?.cpi && activeClass.value) {
      activeClass.value = { ...activeClass.value, cpi: String(res.cpi) }
      saveLastClass(activeClass.value)
    }
    const list = Array.isArray(res?.resources) ? res.resources : []
    resources.value = list.map(mapResourceItem)
    bootPhase.value = 'ready'
    statusMsg.value = resources.value.length
      ? `共 ${resources.value.length} 项`
      : '暂无资料'
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    loadingResources.value = false
  }
}

const openUrl = async (url) => {
  const href = String(url || '').trim()
  if (!href) {
    error.value = '链接为空'
    return
  }
  await openExternal(href)
}

const resolveAccess = async (item) => {
  const cls = activeClass.value || preview.value
  if (!cls) throw new Error('尚未加入班级')
  return invokeNative('chaoxing_class_resolve_resource', {
    req: {
      course_id: cls.course_id,
      clazz_id: cls.clazz_id,
      data_id: item.data_id,
      object_id: item.object_id || null,
      cpi: cls.cpi || '0',
      ...studentPayload()
    }
  })
}

const closePreviewModal = () => {
  showPreviewModal.value = false
  previewModalUrl.value = ''
  previewModalError.value = ''
  previewModalTitle.value = ''
  previewDownloadUrl.value = ''
}

const handleOpenFolder = async (item) => {
  if (!item?.is_folder) return
  const kind = item.folder_kind || (item.file_type === 'tch-courseware' ? 'tch-courseware' : 'afolder')
  folderStack.value = [
    ...folderStack.value,
    {
      name: item.name || '文件夹',
      parent_data_id: kind === 'tch-courseware' ? '0' : item.data_id || '0',
      folder_kind: kind,
      data_name: item.name || '',
      parent_chain: folderStack.value.map((f) => f.parent_data_id).filter(Boolean).join(',')
    }
  ]
  await loadResources()
}

const handleBreadcrumb = async (index) => {
  // 0 = 根
  if (index <= 0) {
    folderStack.value = []
  } else {
    folderStack.value = folderStack.value.slice(0, index)
  }
  await loadResources()
}

const handlePreviewResource = async (item) => {
  if (item.is_folder) {
    await handleOpenFolder(item)
    return
  }
  error.value = ''
  actingId.value = `p-${item.data_id}`
  previewModalTitle.value = item.name
  previewModalLoading.value = true
  previewModalError.value = ''
  previewModalUrl.value = ''
  previewModalOfficial.value = false
  previewDownloadUrl.value = item.download_url || ''
  showPreviewModal.value = true
  try {
    const res = await resolveAccess(item)
    const url = String(res?.preview_url || '').trim()
    const official = !!(res?.official_preview ?? res?.embeddable)
    previewDownloadUrl.value = String(res?.download_url || item.download_url || '')
    previewModalOfficial.value = official
    if (!url) throw new Error('未获取到官方预览地址')
    // 禁止优先裸 CDN；若仍是 star3/origin 给出提示
    if (url.includes('star3/origin')) {
      previewModalError.value =
        '未拿到签名预览，CDN 直链可能无权限。可尝试「系统打开」或「下载」。'
    }
    previewModalUrl.value = url
  } catch (e) {
    previewModalError.value = formatErr(e)
  } finally {
    previewModalLoading.value = false
    actingId.value = ''
  }
}

const handleDownloadResource = async (item) => {
  error.value = ''
  actingId.value = `d-${item.data_id}`
  try {
    const res = await resolveAccess(item)
    const url = String(res?.download_url || item.download_url || '').trim()
    if (!url) throw new Error('未获取到下载地址')
    await openUrl(url)
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    actingId.value = ''
  }
}

const fileKind = (item) => {
  if (item.is_folder || item.folder_kind === 'tch-courseware' || item.folder_kind === 'afolder') {
    return item.folder_kind === 'tch-courseware' ? 'courseware' : 'folder'
  }
  const t = `${item.file_type} ${item.name}`.toLowerCase()
  if (/\b(mp4|mov|avi|mkv|webm)\b/.test(t) || t.endsWith('.mp4')) return 'video'
  if (/\b(jpg|jpeg|png|gif|webp|bmp)\b/.test(t)) return 'image'
  if (/\bpdf\b/.test(t)) return 'pdf'
  if (/\b(ppt|pptx)\b/.test(t)) return 'ppt'
  if (/\b(doc|docx)\b/.test(t)) return 'doc'
  if (/\b(xls|xlsx)\b/.test(t)) return 'xls'
  if (/\b(zip|rar|7z)\b/.test(t)) return 'zip'
  return 'file'
}

const kindMeta = {
  folder: { icon: 'folder', label: '文件夹', tone: 'amber' },
  courseware: { icon: 'folder_special', label: '教师课件', tone: 'orange' },
  video: { icon: 'movie', label: '视频', tone: 'violet' },
  image: { icon: 'image', label: '图片', tone: 'sky' },
  pdf: { icon: 'picture_as_pdf', label: 'PDF', tone: 'rose' },
  ppt: { icon: 'slideshow', label: '演示', tone: 'orange' },
  doc: { icon: 'description', label: '文档', tone: 'blue' },
  xls: { icon: 'table_chart', label: '表格', tone: 'emerald' },
  zip: { icon: 'folder_zip', label: '压缩包', tone: 'slate' },
  file: { icon: 'draft', label: '文件', tone: 'slate' }
}

/**
 * #326 进入路径简化：
 * 1) SSO（缓存优先）
 * 2) 本地已入班 / 固定班可拉资料 → 直接资料库
 * 3) 否则最多一次入班确认
 */
const boot = async () => {
  loadingBoot.value = true
  error.value = ''
  loadDeclined()
  const saved = loadLastClass()
  const ssoOk = await ensureSso()
  if (!ssoOk) {
    bootPhase.value = 'error'
    loadingBoot.value = false
    return
  }

  // 已有本地班级记录：秒开资料
  if (saved) {
    try {
      await loadResources()
    } catch (e) {
      error.value = formatErr(e)
    }
    loadingBoot.value = false
    return
  }

  // 无本地记录：用固定班探测是否已在班（避免多余预览/入班往返）
  activeClass.value = { ...FIXED_CLASS_META }
  await loadResources()
  if (!error.value) {
    // 列表成功（即使 0 项）说明已在班
    saveLastClass(activeClass.value)
    statusMsg.value = resources.value.length
      ? `共 ${resources.value.length} 项`
      : '已在班级'
    bootPhase.value = 'ready'
    loadingBoot.value = false
    return
  }
  // 探测失败 → 回退加入流程
  activeClass.value = null
  error.value = ''

  if (joinDeclined.value) {
    preview.value = { ...FIXED_CLASS_META }
    bootPhase.value = 'ready'
    loadingBoot.value = false
    return
  }

  // 未入班：一次确认（元数据用固定班，不必再等 preview 网络）
  try {
    preview.value = { ...FIXED_CLASS_META }
    // 后台再补一次 preview（可选，不阻塞弹窗）
    void fetchPreview().catch(() => {})
    showJoinDialog.value = true
    bootPhase.value = 'ready'
  } catch (e) {
    error.value = formatErr(e)
    bootPhase.value = 'error'
  } finally {
    loadingBoot.value = false
  }
}

onMounted(() => {
  void boot()
})
</script>

<template>
  <div class="cx-page">
    <div class="cx-bg" aria-hidden="true" />

    <TPageHeader title="学习通" icon="menu_book" @back="emit('back')">
      <template v-if="isJoined" #actions>
        <button
          type="button"
          class="cx-icon-btn"
          :disabled="loadingResources"
          title="刷新资料"
          @click="loadResources"
        >
          <span class="material-symbols-outlined" :class="{ spin: loadingResources }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <!-- 启动中 -->
    <div v-if="loadingBoot" class="cx-boot">
      <div class="cx-spinner" />
      <p class="cx-boot-text">
        {{ bootPhase === 'sso' ? '正在连接学习通…' : bootPhase === 'preview' ? '正在获取班级信息…' : '加载中…' }}
      </p>
      <p class="cx-boot-sub">通过校园门户 SSO 接入，无需学习通密码</p>
    </div>

    <template v-else>
      <!-- SSO 弱提示条 -->
      <div
        class="cx-sso-chip"
        :class="{ ok: ssoReady, bad: !ssoReady }"
        role="status"
      >
        <span class="cx-sso-dot" />
        <span class="cx-sso-label">{{ ssoReady ? ssoHint || '门户已连接' : ssoHint || '会话异常' }}</span>
        <button v-if="!ssoReady" type="button" class="cx-link-btn" @click="boot">重试</button>
        <button
          v-if="!ssoReady"
          type="button"
          class="cx-link-btn"
          @click="emit('back')"
        >
          去登录
        </button>
      </div>

      <p v-if="error" class="cx-alert" role="alert">{{ error }}</p>

      <!-- 已入班：资料库 -->
      <template v-if="isJoined">
        <header class="cx-hero">
          <div class="cx-hero-cover" :class="{ empty: !coverUrl }">
            <img v-if="coverUrl" :src="coverUrl" alt="" loading="lazy" />
            <span v-else class="material-symbols-outlined hero-fallback">menu_book</span>
            <div class="cx-hero-shade" />
          </div>
          <div class="cx-hero-body">
            <p class="cx-hero-kicker">班级资料库</p>
            <h2 class="cx-hero-title">{{ courseTitle }}</h2>
            <p class="cx-hero-meta">
              <span v-if="teacherName" class="cx-pill">
                <span class="material-symbols-outlined">person</span>
                {{ teacherName }}
              </span>
              <span class="cx-pill muted">
                <span class="material-symbols-outlined">inventory_2</span>
                {{ resourceCount }} 项
              </span>
            </p>
          </div>
        </header>

        <section class="cx-section">
          <nav class="cx-breadcrumb" aria-label="资料路径">
            <button
              v-for="(label, idx) in breadcrumbLabels"
              :key="`${idx}-${label}`"
              type="button"
              class="cx-crumb"
              :class="{ current: idx === breadcrumbLabels.length - 1 }"
              :disabled="idx === breadcrumbLabels.length - 1 || loadingResources"
              @click="handleBreadcrumb(idx)"
            >
              {{ label }}
              <span v-if="idx < breadcrumbLabels.length - 1" class="cx-crumb-sep" aria-hidden="true">/</span>
            </button>
          </nav>

          <div class="cx-section-head">
            <h3>{{ currentFolder?.name || '全部资料' }}</h3>
            <span v-if="statusMsg" class="cx-section-hint">{{ statusMsg }}</span>
          </div>

          <div v-if="loadingResources" class="cx-skeleton-list">
            <div v-for="n in 4" :key="n" class="cx-skeleton-card" />
          </div>

          <div v-else-if="!resources.length" class="cx-empty">
            <span class="material-symbols-outlined">folder_off</span>
            <p>暂无资料</p>
            <p class="sub">{{ currentFolder ? '此文件夹为空' : '教师上传后将显示在这里' }}</p>
            <button
              v-if="folderStack.length"
              type="button"
              class="cx-btn secondary"
              style="margin-top: 12px"
              @click="handleBreadcrumb(folderStack.length - 1)"
            >
              返回上级
            </button>
          </div>

          <div v-else class="cx-res-grid">
            <article
              v-for="item in resources"
              :key="item.data_id || item.name + item.folder_kind"
              class="cx-res-card"
              :class="{ folder: item.is_folder }"
              :data-tone="kindMeta[fileKind(item)].tone"
              @click="item.is_folder ? handleOpenFolder(item) : null"
            >
              <div class="cx-res-icon-wrap">
                <span class="material-symbols-outlined">{{ kindMeta[fileKind(item)].icon }}</span>
              </div>
              <div class="cx-res-main">
                <p class="cx-res-name" :title="item.name">{{ item.name }}</p>
                <p class="cx-res-meta">
                  <span class="cx-type-tag">{{ kindMeta[fileKind(item)].label }}</span>
                  <span v-if="item.size_label && item.size_label !== '-'">{{ item.size_label }}</span>
                  <span v-if="item.created_at">{{ item.created_at }}</span>
                </p>
              </div>
              <div class="cx-res-actions" @click.stop>
                <button
                  v-if="item.is_folder"
                  type="button"
                  class="cx-action primary"
                  :disabled="loadingResources"
                  @click="handleOpenFolder(item)"
                >
                  <span class="material-symbols-outlined">subdirectory_arrow_right</span>
                  进入
                </button>
                <template v-else>
                  <button
                    type="button"
                    class="cx-action"
                    :disabled="!!actingId"
                    @click="handlePreviewResource(item)"
                  >
                    <span class="material-symbols-outlined">
                      {{ actingId === `p-${item.data_id}` ? 'progress_activity' : 'visibility' }}
                    </span>
                    预览
                  </button>
                  <button
                    v-if="item.is_downloadable || item.download_url || item.data_id"
                    type="button"
                    class="cx-action primary"
                    :disabled="!!actingId"
                    @click="handleDownloadResource(item)"
                  >
                    <span class="material-symbols-outlined">
                      {{ actingId === `d-${item.data_id}` ? 'progress_activity' : 'download' }}
                    </span>
                    下载
                  </button>
                </template>
              </div>
            </article>
          </div>
        </section>
      </template>

      <!-- 未入班：引导 -->
      <template v-else>
        <section class="cx-welcome">
          <div class="cx-welcome-orb" aria-hidden="true" />
          <div class="cx-welcome-card">
            <div class="cx-welcome-badge">固定班级</div>
            <div v-if="preview?.cover_url" class="cx-welcome-cover">
              <img :src="coverUrl" alt="" />
            </div>
            <div v-else class="cx-welcome-icon">
              <span class="material-symbols-outlined">school</span>
            </div>
            <h2>{{ courseTitle || '学习通班级' }}</h2>
            <p v-if="teacherName" class="cx-welcome-teacher">任课教师 · {{ teacherName }}</p>
            <p class="cx-welcome-desc">
              本模块提供班级课件与资料的预览、下载。首次使用需加入班级（邀请码已内置，无需手动填写）。
            </p>
            <div class="cx-welcome-actions">
              <button type="button" class="cx-btn primary lg" @click="reopenJoinDialog">
                加入班级并查看资料
              </button>
            </div>
            <p v-if="joinDeclined" class="cx-welcome-note">你之前选择了暂不加入，可随时再次加入。</p>
          </div>
        </section>
      </template>
    </template>

    <!-- 官方预览弹层（pan-yz 签名页） -->
    <Teleport to="body">
      <div
        v-if="showPreviewModal"
        class="cx-preview-root"
        role="dialog"
        aria-modal="true"
        :aria-label="previewModalTitle || '资料预览'"
      >
        <div class="cx-preview-backdrop" @click="closePreviewModal" />
        <div class="cx-preview-sheet">
          <header class="cx-preview-head">
            <div class="cx-preview-titles">
              <p class="cx-preview-kicker">{{ previewModalOfficial ? '学习通官方预览' : '预览' }}</p>
              <h3 class="cx-preview-title">{{ previewModalTitle }}</h3>
            </div>
            <div class="cx-preview-head-actions">
              <button
                v-if="previewModalUrl"
                type="button"
                class="cx-action"
                @click="openUrl(previewModalUrl)"
              >
                系统打开
              </button>
              <button
                v-if="previewDownloadUrl"
                type="button"
                class="cx-action primary"
                @click="openUrl(previewDownloadUrl)"
              >
                下载
              </button>
              <button type="button" class="cx-icon-btn" aria-label="关闭" @click="closePreviewModal">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </header>
          <div class="cx-preview-body">
            <div v-if="previewModalLoading" class="cx-preview-state">
              <div class="cx-spinner" />
              <p>正在获取官方预览…</p>
            </div>
            <div v-else-if="previewModalError && !previewModalUrl" class="cx-preview-state err">
              <span class="material-symbols-outlined">error</span>
              <p>{{ previewModalError }}</p>
              <button
                v-if="previewDownloadUrl"
                type="button"
                class="cx-btn primary"
                @click="openUrl(previewDownloadUrl)"
              >
                改为下载
              </button>
            </div>
            <template v-else>
              <p v-if="previewModalError" class="cx-preview-warn">{{ previewModalError }}</p>
              <iframe
                v-if="previewModalUrl"
                class="cx-preview-frame"
                :src="previewModalUrl"
                title="资料预览"
                allow="fullscreen; autoplay"
                referrerpolicy="no-referrer-when-downgrade"
              />
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 首次入班确认弹层 -->
    <Teleport to="body">
      <div v-if="showJoinDialog" class="cx-dialog-root" role="dialog" aria-modal="true" aria-labelledby="cx-join-title">
        <div class="cx-dialog-backdrop" @click="markDeclined" />
        <div class="cx-dialog">
          <div class="cx-dialog-glow" aria-hidden="true" />
          <div class="cx-dialog-cover" :class="{ empty: !coverUrl }">
            <img v-if="coverUrl" :src="coverUrl" alt="" />
            <span v-else class="material-symbols-outlined">menu_book</span>
          </div>
          <p class="cx-dialog-kicker">首次进入</p>
          <h3 id="cx-join-title">是否加入班级？</h3>
          <p class="cx-dialog-course">{{ courseTitle || '班级' }}</p>
          <p v-if="teacherName" class="cx-dialog-teacher">教师 {{ teacherName }}</p>
          <p class="cx-dialog-desc">
            加入后可浏览与下载本班资料。认证仅使用校园门户登录态，不会要求学习通密码。
          </p>
          <div class="cx-dialog-actions">
            <button type="button" class="cx-btn ghost" :disabled="loadingJoin" @click="markDeclined">
              暂不加入
            </button>
            <button type="button" class="cx-btn primary" :disabled="loadingJoin" @click="handleJoinConfirm">
              {{ loadingJoin ? '加入中…' : '加入班级' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cx-page {
  --cx-primary: var(--ui-primary, #2563eb);
  --cx-text: var(--ui-text, #0f172a);
  --cx-muted: var(--ui-muted, #64748b);
  --cx-surface: color-mix(in srgb, #ffffff 92%, transparent);
  --cx-surface-2: #f8fafc;
  --cx-border: color-mix(in srgb, var(--cx-primary) 14%, #e2e8f0);
  --cx-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
  --cx-danger: #dc2626;
  --cx-ok: #16a34a;
  position: relative;
  min-height: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 0 48px;
  color: var(--cx-text);
}

.cx-bg {
  pointer-events: none;
  position: absolute;
  inset: 0 0 auto 0;
  height: 280px;
  background:
    radial-gradient(ellipse 80% 60% at 20% 0%, color-mix(in srgb, var(--cx-primary) 28%, transparent), transparent 70%),
    radial-gradient(ellipse 70% 50% at 90% 10%, color-mix(in srgb, #06b6d4 22%, transparent), transparent 65%);
  z-index: 0;
}

.cx-page > :not(.cx-bg) {
  position: relative;
  z-index: 1;
}

.cx-icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--cx-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cx-icon-btn:disabled {
  opacity: 0.5;
}

.cx-icon-btn .material-symbols-outlined {
  font-size: 22px;
}

.spin {
  animation: cx-spin 0.9s linear infinite;
}

@keyframes cx-spin {
  to {
    transform: rotate(360deg);
  }
}

.cx-boot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 24px;
  gap: 12px;
  text-align: center;
}

.cx-spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--cx-primary) 20%, transparent);
  border-top-color: var(--cx-primary);
  animation: cx-spin 0.75s linear infinite;
}

.cx-boot-text {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.cx-boot-sub {
  margin: 0;
  font-size: 12px;
  color: var(--cx-muted);
}

.cx-sso-chip {
  margin: 8px 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--cx-surface-2);
  border: 1px solid var(--cx-border);
  font-size: 12px;
  color: var(--cx-muted);
}

.cx-sso-chip.ok {
  border-color: color-mix(in srgb, var(--cx-ok) 35%, transparent);
  background: color-mix(in srgb, var(--cx-ok) 8%, var(--cx-surface-2));
}

.cx-sso-chip.bad {
  border-color: color-mix(in srgb, var(--cx-danger) 35%, transparent);
  background: color-mix(in srgb, var(--cx-danger) 8%, var(--cx-surface-2));
}

.cx-sso-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}

.cx-sso-chip.ok .cx-sso-dot {
  background: var(--cx-ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cx-ok) 25%, transparent);
}

.cx-sso-chip.bad .cx-sso-dot {
  background: var(--cx-danger);
}

.cx-sso-label {
  flex: 1;
  min-width: 0;
}

.cx-link-btn {
  border: none;
  background: transparent;
  color: var(--cx-primary);
  font-weight: 650;
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
}

.cx-alert {
  margin: 10px 16px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--cx-danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--cx-danger) 28%, transparent);
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.4;
}

.cx-hero {
  margin: 14px 16px 0;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--cx-border);
  background: var(--cx-surface);
  box-shadow: var(--cx-shadow);
}

.cx-hero-cover {
  position: relative;
  height: 148px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cx-primary) 55%, #1e293b), #0f172a);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.cx-hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cx-hero-cover .hero-fallback {
  font-size: 56px;
  color: rgba(255, 255, 255, 0.85);
}

.cx-hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(15, 23, 42, 0.55), transparent 55%);
  pointer-events: none;
}

.cx-hero-body {
  padding: 14px 16px 16px;
}

.cx-hero-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cx-primary);
}

.cx-hero-title {
  margin: 4px 0 10px;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.cx-hero-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cx-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: color-mix(in srgb, var(--cx-primary) 12%, transparent);
  color: var(--cx-primary);
}

.cx-pill .material-symbols-outlined {
  font-size: 15px;
}

.cx-pill.muted {
  background: var(--cx-surface-2);
  color: var(--cx-muted);
  border: 1px solid var(--cx-border);
}

.cx-section {
  margin: 18px 16px 0;
}

.cx-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.cx-section-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.cx-section-hint {
  font-size: 12px;
  color: var(--cx-muted);
}

.cx-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cx-skeleton-card {
  height: 84px;
  border-radius: 16px;
  background: linear-gradient(
    90deg,
    var(--cx-surface-2) 0%,
    color-mix(in srgb, var(--cx-primary) 8%, var(--cx-surface-2)) 50%,
    var(--cx-surface-2) 100%
  );
  background-size: 200% 100%;
  animation: cx-shimmer 1.2s ease-in-out infinite;
}

@keyframes cx-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.cx-empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--cx-muted);
  border-radius: 18px;
  border: 1px dashed var(--cx-border);
  background: var(--cx-surface);
}

.cx-empty .material-symbols-outlined {
  font-size: 40px;
  opacity: 0.7;
}

.cx-empty p {
  margin: 8px 0 0;
  font-weight: 650;
  color: var(--cx-text);
}

.cx-empty .sub {
  font-weight: 400;
  font-size: 13px;
  color: var(--cx-muted);
}

.cx-res-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cx-res-card {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'icon main'
    'actions actions';
  gap: 10px 12px;
  padding: 14px;
  border-radius: 18px;
  background: var(--cx-surface);
  border: 1px solid var(--cx-border);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  transition: transform 0.15s ease, border-color 0.15s ease;
}

@media (min-width: 520px) {
  .cx-res-card {
    grid-template-columns: auto 1fr auto;
    grid-template-areas: 'icon main actions';
    align-items: center;
  }
}

.cx-res-card:active {
  transform: scale(0.995);
}

.cx-res-icon-wrap {
  grid-area: icon;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--cx-primary) 12%, transparent);
  color: var(--cx-primary);
}

.cx-res-card[data-tone='violet'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #8b5cf6 16%, transparent);
  color: #7c3aed;
}
.cx-res-card[data-tone='sky'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #0ea5e9 16%, transparent);
  color: #0284c7;
}
.cx-res-card[data-tone='rose'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #f43f5e 16%, transparent);
  color: #e11d48;
}
.cx-res-card[data-tone='orange'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #f97316 16%, transparent);
  color: #ea580c;
}
.cx-res-card[data-tone='amber'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #d97706;
}
.cx-res-card[data-tone='emerald'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #10b981 16%, transparent);
  color: #059669;
}
.cx-res-card[data-tone='blue'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #3b82f6 16%, transparent);
  color: #2563eb;
}
.cx-res-card[data-tone='slate'] .cx-res-icon-wrap {
  background: color-mix(in srgb, #64748b 14%, transparent);
  color: #475569;
}

.cx-res-icon-wrap .material-symbols-outlined {
  font-size: 26px;
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.cx-res-main {
  grid-area: main;
  min-width: 0;
}

.cx-res-name {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cx-res-meta {
  margin: 6px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11px;
  color: var(--cx-muted);
}

.cx-type-tag {
  font-weight: 700;
  color: var(--cx-primary);
}

.cx-res-actions {
  grid-area: actions;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.cx-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--cx-border);
  background: var(--cx-surface-2);
  color: var(--cx-text);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.cx-action .material-symbols-outlined {
  font-size: 16px;
}

.cx-action.primary {
  border-color: transparent;
  background: var(--cx-primary);
  color: #fff;
}

.cx-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 欢迎 / 未加入 */
.cx-welcome {
  position: relative;
  margin: 20px 16px 0;
  padding: 8px 0 24px;
}

.cx-welcome-orb {
  position: absolute;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  top: -20px;
  right: -30px;
  background: radial-gradient(circle, color-mix(in srgb, var(--cx-primary) 35%, transparent), transparent 70%);
  filter: blur(4px);
  pointer-events: none;
}

.cx-welcome-card {
  position: relative;
  border-radius: 24px;
  padding: 28px 22px 24px;
  background: var(--cx-surface);
  border: 1px solid var(--cx-border);
  box-shadow: var(--cx-shadow);
  text-align: center;
}

.cx-welcome-badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--cx-primary);
  background: color-mix(in srgb, var(--cx-primary) 12%, transparent);
  margin-bottom: 16px;
}

.cx-welcome-cover {
  width: 88px;
  height: 88px;
  margin: 0 auto 14px;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.cx-welcome-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cx-welcome-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 14px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--cx-primary), color-mix(in srgb, var(--cx-primary) 50%, #06b6d4));
  color: #fff;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--cx-primary) 35%, transparent);
}

.cx-welcome-icon .material-symbols-outlined {
  font-size: 36px;
}

.cx-welcome-card h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.cx-welcome-teacher {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--cx-muted);
}

.cx-welcome-desc {
  margin: 14px auto 0;
  max-width: 34em;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cx-muted);
}

.cx-welcome-actions {
  margin-top: 20px;
}

.cx-welcome-note {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--cx-muted);
}

.cx-btn {
  border: none;
  border-radius: 12px;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  background: var(--cx-surface-2);
  color: var(--cx-text);
  border: 1px solid var(--cx-border);
}

.cx-btn.primary {
  background: linear-gradient(135deg, var(--cx-primary), color-mix(in srgb, var(--cx-primary) 70%, #06b6d4));
  color: #fff;
  border: none;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--cx-primary) 30%, transparent);
}

.cx-btn.ghost {
  background: transparent;
}

.cx-btn.lg {
  width: 100%;
  padding: 14px 18px;
  font-size: 15px;
  border-radius: 14px;
}

.cx-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 对话框 */
.cx-dialog-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

@media (min-width: 560px) {
  .cx-dialog-root {
    align-items: center;
  }
}

.cx-dialog-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(6px);
}

.cx-dialog {
  position: relative;
  width: min(100%, 400px);
  border-radius: 24px;
  padding: 22px 20px 18px;
  background: var(--cx-surface, #fff);
  border: 1px solid var(--cx-border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
  text-align: center;
  animation: cx-dialog-in 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes cx-dialog-in {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.cx-dialog-glow {
  position: absolute;
  top: -40px;
  left: 50%;
  width: 160px;
  height: 160px;
  transform: translateX(-50%);
  background: radial-gradient(circle, color-mix(in srgb, var(--cx-primary) 40%, transparent), transparent 70%);
  pointer-events: none;
}

.cx-dialog-cover {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--cx-primary), #0f172a);
  color: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}

.cx-dialog-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cx-dialog-cover .material-symbols-outlined {
  font-size: 34px;
}

.cx-dialog-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cx-primary);
}

.cx-dialog h3 {
  margin: 6px 0 0;
  font-size: 20px;
  font-weight: 750;
}

.cx-dialog-course {
  margin: 8px 0 0;
  font-size: 15px;
  font-weight: 650;
}

.cx-dialog-teacher {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--cx-muted);
}

.cx-dialog-desc {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cx-muted);
}

.cx-dialog-actions {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 10px;
}

/* ========== Dark mode ========== */
:global(html.dark) .cx-page {
  --cx-text: #e8eef8;
  --cx-muted: #94a3b8;
  --cx-surface: color-mix(in srgb, #1e293b 92%, #0f172a);
  --cx-surface-2: #0f172a;
  --cx-border: color-mix(in srgb, var(--cx-primary) 22%, #334155);
  --cx-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}

:global(html.dark) .cx-bg {
  background:
    radial-gradient(ellipse 80% 60% at 15% 0%, color-mix(in srgb, var(--cx-primary) 35%, transparent), transparent 70%),
    radial-gradient(ellipse 70% 50% at 95% 8%, color-mix(in srgb, #22d3ee 18%, transparent), transparent 65%);
  opacity: 0.9;
}

:global(html.dark) .cx-sso-chip {
  background: color-mix(in srgb, #1e293b 90%, #000);
}

:global(html.dark) .cx-sso-chip.ok {
  background: color-mix(in srgb, #16a34a 12%, #0f172a);
}

:global(html.dark) .cx-sso-chip.bad {
  background: color-mix(in srgb, #dc2626 12%, #0f172a);
}

:global(html.dark) .cx-alert {
  color: #fca5a5;
  background: color-mix(in srgb, #dc2626 16%, #0f172a);
  border-color: color-mix(in srgb, #f87171 35%, transparent);
}

:global(html.dark) .cx-hero,
:global(html.dark) .cx-welcome-card,
:global(html.dark) .cx-res-card,
:global(html.dark) .cx-empty {
  background: color-mix(in srgb, #1e293b 94%, #0b1220);
}

:global(html.dark) .cx-hero-shade {
  background: linear-gradient(to top, rgba(2, 6, 23, 0.75), transparent 55%);
}

:global(html.dark) .cx-pill.muted {
  background: #0f172a;
  color: #94a3b8;
}

:global(html.dark) .cx-action {
  background: #0f172a;
  color: #e2e8f0;
  border-color: #334155;
}

:global(html.dark) .cx-action.primary {
  background: linear-gradient(135deg, var(--cx-primary), color-mix(in srgb, var(--cx-primary) 65%, #06b6d4));
  color: #fff;
  border-color: transparent;
}

:global(html.dark) .cx-btn {
  background: #0f172a;
  color: #e2e8f0;
  border-color: #334155;
}

:global(html.dark) .cx-btn.primary {
  background: linear-gradient(135deg, var(--cx-primary), color-mix(in srgb, var(--cx-primary) 65%, #06b6d4));
  color: #fff;
  border: none;
}

:global(html.dark) .cx-btn.ghost {
  background: transparent;
  color: #cbd5e1;
}

:global(html.dark) .cx-dialog-backdrop {
  background: rgba(2, 6, 23, 0.72);
}

:global(html.dark) .cx-dialog {
  background: #1e293b;
  border-color: #334155;
  color: #e8eef8;
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.55);
}

:global(html.dark) .cx-dialog-course {
  color: #f1f5f9;
}

:global(html.dark) .cx-skeleton-card {
  background: linear-gradient(
    90deg,
    #1e293b 0%,
    color-mix(in srgb, var(--cx-primary) 18%, #1e293b) 50%,
    #1e293b 100%
  );
  background-size: 200% 100%;
}

:global(html.dark) .cx-icon-btn {
  color: #e2e8f0;
}

:global(html.dark) .cx-res-card[data-tone='violet'] .cx-res-icon-wrap {
  color: #c4b5fd;
}
:global(html.dark) .cx-res-card[data-tone='sky'] .cx-res-icon-wrap {
  color: #7dd3fc;
}
:global(html.dark) .cx-res-card[data-tone='rose'] .cx-res-icon-wrap {
  color: #fda4af;
}
:global(html.dark) .cx-res-card[data-tone='orange'] .cx-res-icon-wrap {
  color: #fdba74;
}
:global(html.dark) .cx-res-card[data-tone='amber'] .cx-res-icon-wrap {
  color: #fcd34d;
}
:global(html.dark) .cx-res-card[data-tone='emerald'] .cx-res-icon-wrap {
  color: #6ee7b7;
}
:global(html.dark) .cx-res-card[data-tone='blue'] .cx-res-icon-wrap {
  color: #93c5fd;
}
:global(html.dark) .cx-res-card[data-tone='slate'] .cx-res-icon-wrap {
  color: #cbd5e1;
}

/* 面包屑 */
.cx-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 2px;
  margin-bottom: 12px;
  font-size: 12px;
}

.cx-crumb {
  border: none;
  background: transparent;
  color: var(--cx-primary);
  font-weight: 650;
  font-size: 12px;
  padding: 4px 2px;
  cursor: pointer;
}

.cx-crumb.current {
  color: var(--cx-muted);
  cursor: default;
  font-weight: 600;
}

.cx-crumb:disabled {
  opacity: 1;
}

.cx-crumb-sep {
  margin-left: 4px;
  color: var(--cx-muted);
  font-weight: 400;
}

.cx-res-card.folder {
  cursor: pointer;
}

.cx-res-card.folder:hover {
  border-color: color-mix(in srgb, var(--cx-primary) 35%, var(--cx-border));
}

/* 官方预览弹层 */
.cx-preview-root {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

@media (min-width: 720px) {
  .cx-preview-root {
    align-items: center;
    padding: 24px;
  }
}

.cx-preview-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
}

.cx-preview-sheet {
  position: relative;
  width: min(100%, 920px);
  height: min(92vh, 860px);
  display: flex;
  flex-direction: column;
  border-radius: 20px 20px 0 0;
  background: var(--cx-surface, #fff);
  border: 1px solid var(--cx-border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

@media (min-width: 720px) {
  .cx-preview-sheet {
    border-radius: 20px;
    height: min(88vh, 800px);
  }
}

.cx-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--cx-border);
}

.cx-preview-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--cx-primary);
  letter-spacing: 0.06em;
}

.cx-preview-title {
  margin: 4px 0 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  word-break: break-word;
}

.cx-preview-head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.cx-preview-body {
  flex: 1;
  min-height: 0;
  background: #0b1220;
  position: relative;
}

.cx-preview-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: #0b1220;
}

.cx-preview-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #e2e8f0;
  padding: 24px;
  text-align: center;
}

.cx-preview-state.err {
  color: #fecaca;
}

.cx-preview-warn {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}

:global(html.dark) .cx-preview-sheet {
  background: #1e293b;
  border-color: #334155;
}

:global(html.dark) .cx-crumb {
  color: #93c5fd;
}
</style>
