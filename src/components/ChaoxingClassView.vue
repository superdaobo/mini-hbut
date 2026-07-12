<script setup>
/**
 * 学习通班级资料 MVP
 * - 仅门户 CAS → 学习通 SSO（不二次登录）
 * - 邀请码入班 + 班级资料列表 / 预览 / 下载
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from '../utils/external_link'
import { TPageHeader, TEmptyState } from './templates'

const LAST_CLASS_KEY = 'hbu_chaoxing_class_last_v1'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const inviteCode = ref('')
const loadingSso = ref(false)
const loadingPreview = ref(false)
const loadingJoin = ref(false)
const loadingResources = ref(false)
const ssoReady = ref(false)
const ssoHint = ref('')
const error = ref('')
const statusMsg = ref('')
const preview = ref(null)
const resources = ref([])
const activeClass = ref(null)

const hasTauri = isTauriRuntime()

const canJoin = computed(() => {
  const code = inviteCode.value.trim()
  return code.length >= 4 && !loadingPreview.value && !loadingJoin.value
})

const courseTitle = computed(() => {
  const p = preview.value || activeClass.value
  if (!p) return ''
  return String(p.course_name || p.courseName || '').trim()
})

const teacherName = computed(() => {
  const p = preview.value || activeClass.value
  if (!p) return ''
  return String(p.teacher_name || p.teacherName || '').trim()
})

const resourceCount = computed(() => resources.value.length)

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
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed?.course_id && parsed?.clazz_id) {
      activeClass.value = parsed
      if (parsed.invite_code) inviteCode.value = String(parsed.invite_code)
    }
  } catch {
    /* ignore */
  }
}

const saveLastClass = (cls) => {
  try {
    localStorage.setItem(LAST_CLASS_KEY, JSON.stringify(cls))
  } catch {
    /* ignore */
  }
}

const ensureSso = async () => {
  loadingSso.value = true
  error.value = ''
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
      ? '已通过门户 SSO 接入学习通（无需学习通密码）'
      : '学习通会话未就绪，请重新登录门户后重试'
    return ssoReady.value
  } catch (e) {
    ssoReady.value = false
    ssoHint.value = formatErr(e)
    error.value = formatErr(e)
    return false
  } finally {
    loadingSso.value = false
  }
}

const handlePreview = async () => {
  const code = inviteCode.value.trim()
  if (!code) {
    error.value = '请输入邀请码'
    return
  }
  loadingPreview.value = true
  error.value = ''
  statusMsg.value = ''
  preview.value = null
  try {
    const res = await invokeNative('chaoxing_class_preview_invite', {
      req: { invite_code: code, ...studentPayload() }
    })
    preview.value = {
      invite_code: code,
      course_id: String(res.course_id || ''),
      clazz_id: String(res.clazz_id || ''),
      course_name: String(res.course_name || ''),
      teacher_name: String(res.teacher_name || ''),
      cover_url: String(res.cover_url || ''),
      cpi: '0'
    }
    statusMsg.value = '已解析班级，确认后可加入并查看资料'
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    loadingPreview.value = false
  }
}

const handleJoin = async () => {
  const code = inviteCode.value.trim()
  if (!code) {
    error.value = '请输入邀请码'
    return
  }
  loadingJoin.value = true
  error.value = ''
  statusMsg.value = ''
  try {
    const res = await invokeNative('chaoxing_class_accept_invite', {
      req: { invite_code: code, ...studentPayload() }
    })
    const p = res?.preview || preview.value || {}
    const cls = {
      invite_code: code,
      course_id: String(p.course_id || ''),
      clazz_id: String(p.clazz_id || ''),
      course_name: String(p.course_name || ''),
      teacher_name: String(p.teacher_name || ''),
      cover_url: String(p.cover_url || ''),
      cpi: '0'
    }
    if (!cls.course_id || !cls.clazz_id) {
      throw new Error('入班成功但未返回课程信息')
    }
    preview.value = cls
    activeClass.value = cls
    saveLastClass(cls)
    statusMsg.value = res?.already_joined
      ? '你已在该班级，正在加载资料…'
      : '加入成功，正在加载资料…'
    await loadResources()
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    loadingJoin.value = false
  }
}

const loadResources = async () => {
  const cls = activeClass.value || preview.value
  if (!cls?.course_id || !cls?.clazz_id) {
    error.value = '请先通过邀请码加入班级'
    return
  }
  loadingResources.value = true
  error.value = ''
  try {
    const res = await invokeNative('chaoxing_class_list_resources', {
      req: {
        course_id: cls.course_id,
        clazz_id: cls.clazz_id,
        cpi: cls.cpi || '0',
        ...studentPayload()
      }
    })
    const list = Array.isArray(res?.resources) ? res.resources : []
    resources.value = list.map((item) => ({
      data_id: String(item.data_id || item.dataId || ''),
      name: String(item.name || '未命名'),
      file_type: String(item.file_type || item.fileType || ''),
      object_id: String(item.object_id || item.objectId || ''),
      size_label: String(item.size_label || item.sizeLabel || '-'),
      creator: String(item.creator || ''),
      created_at: String(item.created_at || item.createdAt || ''),
      is_folder: !!(item.is_folder ?? item.isFolder),
      download_url: String(item.download_url || item.downloadUrl || ''),
      preview_cdn_url: String(item.preview_cdn_url || item.previewCdnUrl || '')
    }))
    if (!resources.value.length) {
      statusMsg.value = '该班级暂无资料，或列表解析为空'
    } else {
      statusMsg.value = `共 ${resources.value.length} 项资料`
    }
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

const handlePreviewResource = async (item) => {
  error.value = ''
  const cls = activeClass.value || preview.value
  if (!cls) return
  try {
    if (item.preview_cdn_url) {
      await openUrl(item.preview_cdn_url)
      return
    }
    const res = await invokeNative('chaoxing_class_resolve_resource', {
      req: {
        course_id: cls.course_id,
        clazz_id: cls.clazz_id,
        data_id: item.data_id,
        object_id: item.object_id || null,
        cpi: cls.cpi || '0',
        ...studentPayload()
      }
    })
    const url = String(res?.preview_url || res?.download_url || '').trim()
    if (!url) throw new Error('未获取到预览地址')
    await openUrl(url)
  } catch (e) {
    error.value = formatErr(e)
  }
}

const handleDownloadResource = async (item) => {
  error.value = ''
  const cls = activeClass.value || preview.value
  if (!cls) return
  try {
    if (item.download_url) {
      await openUrl(item.download_url)
      return
    }
    const res = await invokeNative('chaoxing_class_resolve_resource', {
      req: {
        course_id: cls.course_id,
        clazz_id: cls.clazz_id,
        data_id: item.data_id,
        object_id: item.object_id || null,
        cpi: cls.cpi || '0',
        ...studentPayload()
      }
    })
    const url = String(res?.download_url || '').trim()
    if (!url) throw new Error('未获取到下载地址')
    await openUrl(url)
  } catch (e) {
    error.value = formatErr(e)
  }
}

const fileIcon = (item) => {
  if (item.is_folder) return '📁'
  const t = (item.file_type || item.name || '').toLowerCase()
  if (t.includes('mp4') || t.includes('mov') || t.includes('avi')) return '🎬'
  if (t.includes('jpg') || t.includes('jpeg') || t.includes('png') || t.includes('gif')) return '🖼️'
  if (t.includes('pdf')) return '📄'
  if (t.includes('ppt') || t.includes('pptx')) return '📊'
  if (t.includes('doc') || t.includes('docx')) return '📝'
  return '📎'
}

onMounted(async () => {
  loadLastClass()
  await ensureSso()
  if (activeClass.value?.course_id) {
    await loadResources()
  }
})
</script>

<template>
  <div class="cx-class-page">
    <TPageHeader title="学习通" subtitle="邀请码入班 · 班级资料" @back="emit('back')" />

    <section class="cx-card sso-card" :class="{ ready: ssoReady, bad: !ssoReady && !loadingSso }">
      <div class="sso-row">
        <span class="sso-dot" :class="{ on: ssoReady }" />
        <div class="sso-text">
          <p class="sso-title">{{ ssoReady ? '门户 SSO 已就绪' : '学习通会话' }}</p>
          <p class="sso-desc">{{ loadingSso ? '检测中…' : ssoHint }}</p>
        </div>
        <button type="button" class="btn ghost" :disabled="loadingSso" @click="ensureSso">
          {{ loadingSso ? '…' : '重试' }}
        </button>
      </div>
    </section>

    <section class="cx-card">
      <h3 class="section-title">邀请码入班</h3>
      <p class="section-hint">使用教师分享的课程邀请码加入班级，无需再次输入学习通密码。</p>
      <div class="invite-row">
        <input
          v-model="inviteCode"
          class="invite-input"
          type="text"
          inputmode="numeric"
          maxlength="16"
          placeholder="输入邀请码，如 73202625"
          :disabled="loadingPreview || loadingJoin"
          @keyup.enter="handlePreview"
        />
      </div>
      <div class="btn-row">
        <button type="button" class="btn secondary" :disabled="!canJoin" @click="handlePreview">
          {{ loadingPreview ? '解析中…' : '预览班级' }}
        </button>
        <button type="button" class="btn primary" :disabled="!canJoin" @click="handleJoin">
          {{ loadingJoin ? '加入中…' : '加入并查看资料' }}
        </button>
      </div>

      <div v-if="preview || activeClass" class="preview-box">
        <div class="preview-main">
          <p class="preview-name">{{ courseTitle || '未命名课程' }}</p>
          <p class="preview-meta">
            <span v-if="teacherName">教师：{{ teacherName }}</span>
            <span v-if="(preview || activeClass)?.course_id">
              · 课程 {{ (preview || activeClass).course_id }}
            </span>
            <span v-if="(preview || activeClass)?.clazz_id">
              · 班级 {{ (preview || activeClass).clazz_id }}
            </span>
          </p>
        </div>
        <button
          v-if="activeClass?.course_id"
          type="button"
          class="btn ghost"
          :disabled="loadingResources"
          @click="loadResources"
        >
          {{ loadingResources ? '刷新中…' : '刷新资料' }}
        </button>
      </div>
    </section>

    <p v-if="error" class="msg error">{{ error }}</p>
    <p v-else-if="statusMsg" class="msg ok">{{ statusMsg }}</p>

    <section class="cx-card resources-card">
      <div class="resources-head">
        <h3 class="section-title">班级资料</h3>
        <span v-if="resourceCount" class="count-pill">{{ resourceCount }}</span>
      </div>

      <div v-if="loadingResources" class="loading-line">正在加载资料…</div>

      <TEmptyState
        v-else-if="!resources.length"
        message="暂无资料，加入班级后可在此查看与下载"
      />

      <ul v-else class="res-list">
        <li v-for="item in resources" :key="item.data_id || item.name" class="res-item">
          <div class="res-icon" aria-hidden="true">{{ fileIcon(item) }}</div>
          <div class="res-body">
            <p class="res-name">{{ item.name }}</p>
            <p class="res-meta">
              <span v-if="item.file_type">{{ item.file_type }}</span>
              <span v-if="item.size_label"> · {{ item.size_label }}</span>
              <span v-if="item.created_at"> · {{ item.created_at }}</span>
            </p>
          </div>
          <div class="res-actions">
            <button
              v-if="!item.is_folder"
              type="button"
              class="btn tiny"
              @click="handlePreviewResource(item)"
            >
              预览
            </button>
            <button
              v-if="!item.is_folder && (item.download_url || item.data_id)"
              type="button"
              class="btn tiny primary"
              @click="handleDownloadResource(item)"
            >
              下载
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.cx-class-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cx-card {
  background: color-mix(in srgb, var(--ui-surface, #fff) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-primary, #2563eb) 12%, transparent);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}

.sso-card.ready {
  border-color: color-mix(in srgb, #16a34a 35%, transparent);
}

.sso-card.bad {
  border-color: color-mix(in srgb, #dc2626 30%, transparent);
}

.sso-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sso-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}

.sso-dot.on {
  background: #16a34a;
  box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.15);
}

.sso-text {
  flex: 1;
  min-width: 0;
}

.sso-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text, #0f172a);
}

.sso-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ui-muted, #64748b);
  line-height: 1.4;
}

.section-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 650;
  color: var(--ui-text, #0f172a);
}

.section-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--ui-muted, #64748b);
  line-height: 1.45;
}

.invite-row {
  margin-bottom: 10px;
}

.invite-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dbe3f0;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 16px;
  letter-spacing: 0.04em;
  background: #fff;
  color: var(--ui-text, #0f172a);
}

.invite-input:focus {
  outline: none;
  border-color: var(--ui-primary, #2563eb);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-primary, #2563eb) 18%, transparent);
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #e2e8f0;
  color: #0f172a;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--ui-primary, #2563eb);
  color: #fff;
}

.btn.secondary {
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 12%, #fff);
  color: var(--ui-primary, #2563eb);
}

.btn.ghost {
  background: transparent;
  color: var(--ui-primary, #2563eb);
  padding: 8px 10px;
}

.btn.tiny {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 8px;
}

.preview-box {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 6%, #f8fafc);
  display: flex;
  align-items: center;
  gap: 10px;
}

.preview-main {
  flex: 1;
  min-width: 0;
}

.preview-name {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.preview-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ui-muted, #64748b);
  word-break: break-all;
}

.msg {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  padding: 0 4px;
}

.msg.error {
  color: #dc2626;
}

.msg.ok {
  color: #15803d;
}

.resources-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.resources-head .section-title {
  margin: 0;
}

.count-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 14%, transparent);
  color: var(--ui-primary, #2563eb);
}

.loading-line {
  font-size: 13px;
  color: var(--ui-muted, #64748b);
  padding: 12px 0;
}

.res-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.res-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}

.res-icon {
  font-size: 20px;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}

.res-body {
  flex: 1;
  min-width: 0;
}

.res-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text, #0f172a);
  word-break: break-word;
}

.res-meta {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--ui-muted, #64748b);
}

.res-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
</style>
