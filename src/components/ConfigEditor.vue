<script setup>
import { ref, computed, onMounted } from 'vue'
import { renderMarkdown } from '../utils/markdown'
import { showToast } from '../utils/toast'
import { fetchRemoteConfig } from '../utils/remote_config'

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

const currentList = computed(() => config.value.announcements[activeTab.value])

const newNotice = () => ({
  id: `notice-${Date.now()}`,
  title: '新公告',
  summary: '',
  content: '在这里写 Markdown 内容',
  image: '',
  updated_at: new Date().toISOString().slice(0, 10),
  pinned: activeTab.value === 'pinned',
  require_confirm: activeTab.value === 'confirm'
})

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
    config.value = remote
    rawJson.value = JSON.stringify(remote, null, 2)
  } catch (e) {
    jsonError.value = '加载远程配置失败'
  }
}

const exportJson = async () => {
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
    showToast('已生成 JSON 文件', 'success')
    return
  } catch (e) {
    // ignore
  }

  try {
    await navigator.clipboard.writeText(data)
    showToast('导出失败，已复制 JSON 到剪贴板', 'success')
  } catch (e) {
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
      <h2>配置编辑器</h2>
      <p>可视化编辑公告、OCR、强制更新并导出 JSON</p>
    </header>

    <section class="editor-card">
      <h3>基础配置</h3>
      <div class="form-grid">
        <label>
          OCR 服务器地址
          <input v-model="config.ocr.endpoint" placeholder="http://1.94.167.18:5080/api/ocr/recognize" />
        </label>
        <label class="toggle">
          <input type="checkbox" v-model="config.ocr.enabled" />
          OCR 启用
        </label>
      </div>
    </section>

    <section class="editor-card">
      <h3>强制更新</h3>
      <div class="form-grid">
        <label>
          最低版本
          <input v-model="config.force_update.min_version" placeholder="1.2.0" />
        </label>
        <label>
          更新说明
          <input v-model="config.force_update.message" placeholder="当前版本过低，请更新后继续使用" />
        </label>
        <label>
          下载地址
          <input v-model="config.force_update.download_url" placeholder="https://example.com/download" />
        </label>
      </div>
    </section>

    <section class="editor-card">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-btn', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
        <button class="add-btn" @click="addNotice">+ 新增公告</button>
      </div>

      <div v-if="!currentList.length" class="empty">暂无公告</div>
      <div v-for="(notice, index) in currentList" :key="notice.id" class="notice-editor">
        <div class="notice-header">
          <h4>{{ notice.title }}</h4>
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
            封面图片 URL
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
      <h3>导出</h3>
      <textarea v-model="rawJson" rows="6" readonly placeholder="导出的 JSON 会显示在此处"></textarea>
      <div class="actions">
        <button class="btn-primary" @click="exportJson">导出 JSON</button>
      </div>
      <p v-if="jsonError" class="error">{{ jsonError }}</p>
    </section>
  </div>
</template>

<style scoped>
.config-editor {
  min-height: 100vh;
  padding: 20px 20px 120px;
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 55%, #22d3ee 100%);
}

.editor-header {
  color: white;
  margin-bottom: 20px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  padding: 6px 12px;
  border-radius: 999px;
  margin-bottom: 10px;
  cursor: pointer;
}

.editor-header h2 {
  margin: 0 0 6px;
  font-size: 24px;
}

.editor-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 10px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

input, textarea {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  font-size: 13px;
  background: #fff;
}

.toggle {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.tab-btn {
  padding: 6px 12px;
  border-radius: 999px;
  border: none;
  background: #e0e7ff;
  color: #4338ca;
  cursor: pointer;
}

.tab-btn.active {
  background: #4338ca;
  color: white;
}

.add-btn {
  margin-left: auto;
  padding: 6px 12px;
  border-radius: 10px;
  border: none;
  background: #10b981;
  color: white;
  cursor: pointer;
}

.notice-editor {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fff;
}

.notice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.remove-btn {
  background: #fee2e2;
  color: #b91c1c;
  border: none;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.markdown-editor {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.markdown-preview {
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px;
  min-height: 120px;
  font-size: 13px;
  color: #334155;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.btn-primary,
.btn-secondary {
  border: none;
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
}

.btn-primary {
  background: #4f46e5;
  color: white;
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
  color: #dc2626;
  margin-top: 6px;
}
</style>
