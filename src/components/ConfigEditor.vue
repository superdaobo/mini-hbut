<script setup>
import { computed, onMounted, ref } from 'vue'
import { renderMarkdown } from '../utils/markdown'
import { fetchRemoteConfig } from '../utils/remote_config'
import { showToast } from '../utils/toast'

const emit = defineEmits(['back'])

const defaultConfig = {
  announcements: {
    ticker: [],
    pinned: [],
    list: [],
    confirm: []
  },
  force_update: {
    min_version: '',
    message: '',
    download_url: ''
  },
  ocr: {
    endpoint: '',
    enabled: true
  },
  temp_file_server: {
    schedule_upload_endpoint: '',
    enabled: true
  },
  resource_share: {
    enabled: true,
    endpoint: 'https://mini-hbut-chaoxing-webdav.hf.space',
    username: 'mini-hbut',
    password: 'mini-hbut',
    office_preview_proxy: 'https://view.officeapps.live.com/op/view.aspx?src=',
    temp_upload_endpoint: ''
  }
}

const config = ref(JSON.parse(JSON.stringify(defaultConfig)))
const activeTab = ref('ticker')
const rawJson = ref('')
const jsonError = ref('')

const tabs = [
  { key: 'ticker', label: '滚动公告' },
  { key: 'pinned', label: '置顶公告' },
  { key: 'list', label: '公告列表' },
  { key: 'confirm', label: '确认公告' }
]

const currentList = computed(() => config.value.announcements[activeTab.value] || [])

const newNotice = () => ({
  id: `notice-${Date.now()}`,
  title: '新公告',
  summary: '',
  content: '在这里填写 Markdown 正文',
  image: '',
  updated_at: new Date().toISOString().slice(0, 10),
  pinned: activeTab.value === 'pinned',
  require_confirm: activeTab.value === 'confirm'
})

const ensureStruct = () => {
  if (!config.value.announcements) {
    config.value.announcements = { ticker: [], pinned: [], list: [], confirm: [] }
  }
  for (const key of ['ticker', 'pinned', 'list', 'confirm']) {
    if (!Array.isArray(config.value.announcements[key])) config.value.announcements[key] = []
  }
  if (!config.value.force_update) {
    config.value.force_update = { min_version: '', message: '', download_url: '' }
  }
  if (!config.value.ocr) {
    config.value.ocr = { endpoint: '', enabled: true }
  }
  if (!config.value.temp_file_server) {
    config.value.temp_file_server = { schedule_upload_endpoint: '', enabled: true }
  }
  if (!config.value.resource_share) {
    config.value.resource_share = { ...defaultConfig.resource_share }
  }
}

const addNotice = () => {
  currentList.value.push(newNotice())
}

const removeNotice = (index) => {
  currentList.value.splice(index, 1)
}

const loadRemoteConfig = async () => {
  jsonError.value = ''
  try {
    const remote = await fetchRemoteConfig()
    config.value = JSON.parse(JSON.stringify(remote || defaultConfig))
    ensureStruct()
    rawJson.value = JSON.stringify(config.value, null, 2)
  } catch {
    jsonError.value = '加载远程配置失败'
  }
}

const exportJson = async () => {
  ensureStruct()
  const data = JSON.stringify(config.value, null, 2)
  rawJson.value = data
  try {
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'remote_config.json'
    a.click()
    URL.revokeObjectURL(url)
    showToast('已导出 remote_config.json', 'success')
    return
  } catch {
    // ignore
  }
  try {
    await navigator.clipboard.writeText(data)
    showToast('导出失败，已复制 JSON 到剪贴板', 'warning')
  } catch {
    showToast('导出失败，请手动复制下方 JSON', 'error')
  }
}

onMounted(() => {
  loadRemoteConfig()
})
</script>

<template>
  <div class="config-editor">
    <header class="editor-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h2>配置工具</h2>
      <p>编辑远程配置并导出为 JSON 文件。</p>
    </header>

    <section class="editor-card">
      <h3>基础服务配置</h3>
      <div class="form-grid">
        <label>
          OCR 服务地址
          <input v-model="config.ocr.endpoint" placeholder="https://mini-hbut-ocr-service.hf.space/api/ocr/recognize" />
        </label>
        <label class="toggle">
          <input v-model="config.ocr.enabled" type="checkbox" />
          启用 OCR
        </label>
        <label>
          临时文件上传地址
          <input
            v-model="config.temp_file_server.schedule_upload_endpoint"
            placeholder="https://mini-hbut-ocr-service.hf.space/api/temp/upload"
          />
        </label>
        <label class="toggle">
          <input v-model="config.temp_file_server.enabled" type="checkbox" />
          启用临时文件服务
        </label>
      </div>
    </section>

    <section class="editor-card">
      <h3>资料分享（WebDAV）</h3>
      <div class="form-grid">
        <label class="toggle">
          <input v-model="config.resource_share.enabled" type="checkbox" />
          启用资料分享
        </label>
        <label>
          WebDAV 服务地址
          <input v-model="config.resource_share.endpoint" placeholder="https://mini-hbut-chaoxing-webdav.hf.space" />
        </label>
        <label>
          WebDAV 用户名
          <input v-model="config.resource_share.username" placeholder="mini-hbut" />
        </label>
        <label>
          WebDAV 密码
          <input v-model="config.resource_share.password" placeholder="mini-hbut" />
        </label>
        <label>
          Office 在线预览代理
          <input
            v-model="config.resource_share.office_preview_proxy"
            placeholder="https://view.officeapps.live.com/op/view.aspx?src="
          />
        </label>
        <label>
          Office 预览临时上传地址
          <input
            v-model="config.resource_share.temp_upload_endpoint"
            placeholder="https://mini-hbut-ocr-service.hf.space/api/temp/upload"
          />
        </label>
      </div>
    </section>

    <section class="editor-card">
      <h3>强制更新</h3>
      <div class="form-grid">
        <label>
          最低版本
          <input v-model="config.force_update.min_version" placeholder="1.1.0" />
        </label>
        <label>
          更新说明
          <input v-model="config.force_update.message" placeholder="当前版本过低，请更新后继续使用。" />
        </label>
        <label>
          下载地址
          <input v-model="config.force_update.download_url" placeholder="https://github.com/superdaobo/mini-hbut/releases" />
        </label>
      </div>
    </section>

    <section class="editor-card">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
        <button class="add-btn" @click="addNotice">+ 新增公告</button>
      </div>

      <div v-if="!currentList.length" class="empty">暂无公告</div>
      <div v-for="(notice, index) in currentList" :key="notice.id" class="notice-editor">
        <div class="notice-header">
          <h4>{{ notice.title || '未命名公告' }}</h4>
          <button class="remove-btn" @click="removeNotice(index)">删除</button>
        </div>
        <div class="form-grid">
          <label>
            ID
            <input v-model="notice.id" />
          </label>
          <label>
            标题
            <input v-model="notice.title" />
          </label>
          <label>
            更新时间
            <input v-model="notice.updated_at" />
          </label>
          <label>
            图片地址
            <input v-model="notice.image" placeholder="https://..." />
          </label>
          <label>
            摘要
            <input v-model="notice.summary" />
          </label>
        </div>
        <div class="markdown-editor">
          <div>
            <h5>正文（Markdown）</h5>
            <textarea v-model="notice.content" rows="6"></textarea>
          </div>
          <div>
            <h5>预览</h5>
            <div class="markdown-preview" v-html="renderMarkdown(notice.content || '')"></div>
          </div>
        </div>
      </div>
    </section>

    <section class="editor-card">
      <h3>导出 JSON</h3>
      <textarea v-model="rawJson" rows="10" readonly placeholder="导出的 JSON 会显示在这里"></textarea>
      <div class="actions">
        <button class="btn-primary" @click="exportJson">导出 JSON</button>
        <button class="btn-secondary" @click="loadRemoteConfig">重新加载</button>
      </div>
      <p v-if="jsonError" class="error">{{ jsonError }}</p>
    </section>
  </div>
</template>

<style scoped>
.config-editor {
  min-height: 100vh;
  padding: 20px 20px 120px;
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 55%, #22d3ee 100%);
}

.editor-header {
  color: #fff;
  margin-bottom: 16px;
}

.editor-header h2 {
  margin: 8px 0 4px;
  font-size: 26px;
}

.editor-header p {
  margin: 0;
  font-size: 14px;
  opacity: 0.92;
}

.back-btn {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
}

.editor-card {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 16px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12);
  padding: 16px;
  margin-bottom: 14px;
}

.editor-card h3 {
  margin: 0 0 10px;
  color: #0f172a;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

.toggle {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

input,
textarea {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  color: #0f172a;
  background: #fff;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.tab-btn {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  background: #e0e7ff;
  color: #4338ca;
  cursor: pointer;
}

.tab-btn.active {
  background: #4338ca;
  color: #fff;
}

.add-btn {
  margin-left: auto;
  border: none;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  background: #10b981;
  color: #fff;
  cursor: pointer;
}

.notice-editor {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  padding: 12px;
  margin-bottom: 12px;
}

.notice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.notice-header h4 {
  margin: 0;
  color: #0f172a;
}

.remove-btn {
  border: none;
  border-radius: 8px;
  background: #fee2e2;
  color: #b91c1c;
  padding: 4px 10px;
  cursor: pointer;
}

.markdown-editor {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.markdown-editor h5 {
  margin: 0 0 6px;
  color: #334155;
}

.markdown-preview {
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  min-height: 120px;
  padding: 10px;
  color: #334155;
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.btn-primary,
.btn-secondary {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
}

.btn-primary {
  background: #4f46e5;
  color: #fff;
}

.btn-secondary {
  background: #e2e8f0;
  color: #334155;
}

.empty {
  text-align: center;
  color: #64748b;
  padding: 10px 0;
}

.error {
  margin: 8px 0 0;
  color: #dc2626;
}
</style>
