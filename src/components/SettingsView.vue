<script setup>
import { computed, ref } from 'vue'
import { applyPreset, resetUiSettings, UI_PRESETS, useUiSettings } from '../utils/ui_settings'
import { resetAppSettings, useAppSettings } from '../utils/app_settings'
import { loadDeyiHeiFont, useFontSettings } from '../utils/font_settings'
import { showToast } from '../utils/toast'
import hbutLogo from '../assets/hbut-logo.png'

const emit = defineEmits(['back'])

const activeTab = ref('appearance')
const uiSettings = useUiSettings()
const appSettings = useAppSettings()
const fontSettings = useFontSettings()
const presetEntries = computed(() => Object.entries(UI_PRESETS))
const downloading = ref(false)
const showFontModal = ref(false)

const handlePreset = (key) => {
  applyPreset(key)
}


const handleResetAppearance = () => {
  resetUiSettings()
  showToast('已恢复外观默认设置。', 'success')
}

const handleResetBackend = () => {
  resetAppSettings()
  showToast('已恢复后端默认设置。', 'success')
}

const handleSelectFont = (fontKey) => {
  if (fontKey !== 'deyihei') {
    fontSettings.font = fontKey
    return
  }
  if (fontSettings.loaded) {
    fontSettings.font = 'deyihei'
    return
  }
  showFontModal.value = true
  handleDownloadFont()
}

const handleDownloadFont = async (force = false) => {
  if (downloading.value) return
  downloading.value = true
  showFontModal.value = true
  try {
    await loadDeyiHeiFont(force)
    fontSettings.font = 'deyihei'
    showToast('字体下载完成，已应用得意黑。', 'success')
    showFontModal.value = false
  } catch (e) {
    showToast('字体下载失败，请检查网络后重试。', 'error')
    console.warn('[Font] download failed', e)
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="settings-view">
    <header class="dashboard-header settings-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <span class="title glitch-text" data-text="HBUT 校园助手">HBUT 校园助手</span>
        <span class="page-tag">设置</span>
      </div>
      <div class="user-info">
        <button class="header-btn btn-ripple" @click="emit('back')">返回</button>
        <button class="header-btn btn-ripple" @click="activeTab === 'appearance' ? handleResetAppearance() : handleResetBackend()">
          恢复默认
        </button>
      </div>
    </header>

    <div class="settings-intro glass-card">
      <h2>设置中心</h2>
      <p>外观、字体与后端参数统一在这里配置，修改立即生效。</p>
    </div>

    <div class="tab-bar">
      <button class="tab-btn btn-ripple" :class="{ active: activeTab === 'appearance' }" @click="activeTab = 'appearance'">外观</button>
      <button class="tab-btn btn-ripple" :class="{ active: activeTab === 'backend' }" @click="activeTab = 'backend'">后端</button>
    </div>

    <section v-if="activeTab === 'appearance'" class="settings-section glass-card">
      <h3>主题预设</h3>
      <div class="preset-grid">
        <button
          v-for="[key, preset] in presetEntries"
          :key="key"
          class="preset-card"
          :class="{ active: uiSettings.preset === key }"
          @click="handlePreset(key)"
        >
          <span class="preset-swatch" :style="{ background: preset.background }"></span>
          <span class="preset-name">{{ preset.label }}</span>
        </button>
      </div>
    </section>

    <section v-if="activeTab === 'appearance'" class="settings-section glass-card">
      <h3>字体</h3>
      <div class="form-grid">
        <label class="field">
          <span>字体选择</span>
          <div class="font-actions">
            <button
              class="font-btn btn-ripple"
              :class="{ active: fontSettings.font === 'default' }"
              @click="handleSelectFont('default')"
            >
              默认字体
            </button>
            <button
              class="font-btn btn-ripple"
              :class="{ active: fontSettings.font === 'heiti' }"
              @click="handleSelectFont('heiti')"
            >
              黑体
            </button>
            <button
              class="font-btn btn-ripple"
              :class="{ active: fontSettings.font === 'songti' }"
              @click="handleSelectFont('songti')"
            >
              宋体
            </button>
            <button
              class="font-btn btn-ripple"
              :class="{ active: fontSettings.font === 'kaiti' }"
              @click="handleSelectFont('kaiti')"
            >
              楷体
            </button>
            <button
              class="font-btn btn-ripple"
              :class="{ active: fontSettings.font === 'fangsong' }"
              @click="handleSelectFont('fangsong')"
            >
              仿宋
            </button>
            <button
              class="font-btn btn-ripple"
              :class="{ active: fontSettings.font === 'deyihei' }"
              @click="handleSelectFont('deyihei')"
            >
              得意黑（需下载）
            </button>
          </div>
          <small>黑体/宋体/楷体/仿宋为系统字体，得意黑需要下载字体文件。</small>
        </label>
        <div class="font-download">
          <button class="download-btn btn-ripple" :disabled="downloading" @click="handleDownloadFont(fontSettings.loaded)">
            {{ downloading ? '正在下载...' : fontSettings.loaded ? '重新下载字体' : '下载并应用得意黑' }}
          </button>
          <p class="download-hint">
            下载来源：设置中提供的字体文件（点击按钮自动下载）。
          </p>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'appearance' && uiSettings.preset === 'custom'" class="settings-section glass-card">
      <h3>自定义主题代码</h3>
      <div class="form-grid">
        <label class="field field-wide">
          <span>自定义 CSS</span>
          <textarea
            class="text-input code-input"
            rows="8"
            placeholder="请输入自定义 CSS，例如 .module-card { border-radius: 24px; }"
            v-model="uiSettings.customCss"
          ></textarea>
        </label>
        <label class="field field-wide">
          <span>自定义 JS</span>
          <textarea
            class="text-input code-input"
            rows="6"
            placeholder="请输入自定义 JS，例如 document.body.style.background = '#000';"
            v-model="uiSettings.customJs"
          ></textarea>
        </label>
      </div>
      <div class="rules">
        <h4>开发规则</h4>
        <ul>
          <li>仅允许修改前端样式与交互效果，禁止读取或上传用户隐私数据。</li>
          <li>不要移除或覆盖核心容器（如 .app-shell、.module-card）结构。</li>
          <li>避免长时间执行脚本或高频定时器，以防止卡顿。</li>
          <li>优先使用 CSS 变量（如 --ui-primary、--ui-bg-gradient）实现主题效果。</li>
        </ul>
      </div>
    </section>

    <section v-if="activeTab === 'appearance'" class="settings-section glass-card">
      <h3>视觉细节</h3>
      <div class="slider-grid">
        <label class="slider-field">
          <span>卡片透明度</span>
          <input type="range" min="0.72" max="1" step="0.02" v-model.number="uiSettings.surfaceOpacity" />
          <em>{{ uiSettings.surfaceOpacity.toFixed(2) }}</em>
        </label>
        <label class="slider-field">
          <span>边框透明度</span>
          <input type="range" min="0.12" max="0.6" step="0.02" v-model.number="uiSettings.borderOpacity" />
          <em>{{ uiSettings.borderOpacity.toFixed(2) }}</em>
        </label>
        <label class="slider-field">
          <span>圆角大小</span>
          <input type="range" min="0.8" max="1.4" step="0.05" v-model.number="uiSettings.radiusScale" />
          <em>{{ uiSettings.radiusScale.toFixed(2) }}</em>
        </label>
      </div>
    </section>

    <section v-if="activeTab === 'appearance'" class="settings-section glass-card">
      <h3>排版与动画</h3>
      <div class="slider-grid">
        <label class="slider-field">
          <span>字体大小</span>
          <input type="range" min="0.85" max="1.2" step="0.05" v-model.number="uiSettings.fontScale" />
          <em>{{ uiSettings.fontScale.toFixed(2) }}</em>
        </label>
        <label class="slider-field">
          <span>间距密度</span>
          <input type="range" min="0.8" max="1.3" step="0.05" v-model.number="uiSettings.spaceScale" />
          <em>{{ uiSettings.spaceScale.toFixed(2) }}</em>
        </label>
        <label class="slider-field">
          <span>动效强度</span>
          <input type="range" min="0" max="1.2" step="0.1" v-model.number="uiSettings.motionScale" />
          <em>{{ uiSettings.motionScale.toFixed(1) }}</em>
        </label>
      </div>
    </section>

    <section v-if="activeTab === 'appearance'" class="settings-section preview-card">
      <div class="preview-surface">
        <h4>预览</h4>
        <p>这里展示当前主题在卡片、文字、按钮上的效果。</p>
        <button class="preview-btn btn-ripple">示例按钮</button>
      </div>
    </section>

    <div v-if="showFontModal" class="font-modal">
      <div class="font-modal-card">
        <h3>正在下载得意黑</h3>
        <p>首次使用需要下载字体文件，完成后会自动应用。</p>
        <div class="font-modal-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: downloading ? '70%' : '100%' }"></div>
          </div>
          <span>{{ downloading ? '下载中...' : '下载完成' }}</span>
        </div>
        <button class="btn-primary btn-ripple" @click="showFontModal = false">我知道了</button>
      </div>
    </div>

    <section v-if="activeTab === 'backend'" class="settings-section glass-card">
      <h3>请求与重试</h3>
      <div class="form-grid">
        <label class="field">
          <span>电费查询自动重试次数</span>
          <input type="number" min="0" max="5" v-model.number="appSettings.retry.electricity" />
        </label>
        <label class="field">
          <span>空教室查询自动重试次数</span>
          <input type="number" min="0" max="5" v-model.number="appSettings.retry.classroom" />
        </label>
        <label class="field">
          <span>重试间隔（毫秒）</span>
          <input type="number" min="500" max="10000" step="100" v-model.number="appSettings.retryDelayMs" />
        </label>
      </div>
      <p class="hint">数值会自动限制在合理范围内，设置后立即生效。</p>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  padding: 24px 20px 120px;
  background: var(--ui-bg-gradient);
  color: var(--ui-text);
}

.settings-header {
  margin-bottom: 16px;
}

.settings-intro {
  margin-bottom: 16px;
  padding: 16px 20px;
}

.settings-intro h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
}

.settings-intro p {
  margin: 0;
  color: var(--ui-muted);
  font-size: 14px;
}

.tab-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.tab-btn {
  border: none;
  padding: 8px 16px;
  border-radius: 999px;
  cursor: pointer;
  background: var(--ui-surface);
  color: var(--ui-muted);
  font-weight: 600;
  box-shadow: var(--ui-shadow-soft);
}

.tab-btn.active {
  background: var(--ui-primary);
  color: white;
}

.settings-section {
  margin-top: 16px;
}

.settings-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.preset-card.active {
  border-color: var(--ui-primary);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.18);
  transform: translateY(-2px);
}

.preset-swatch {
  width: 100%;
  height: 60px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.preset-name {
  font-weight: 600;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 600;
  color: var(--ui-muted);
}

.field input[type='number'] {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.95);
}

.field-wide {
  grid-column: 1 / -1;
}

.text-input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.95);
}

.code-input {
  font-family: 'Courier New', monospace;
  line-height: 1.5;
}

.field small {
  color: var(--ui-muted);
  font-size: 12px;
}

.font-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.font-btn {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.font-btn.active {
  border-color: var(--ui-primary);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.35);
}

.font-download {
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}

.download-btn {
  border: none;
  background: linear-gradient(to right, var(--ui-primary), var(--ui-secondary));
  color: white;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.download-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.download-hint {
  font-size: 12px;
  color: var(--ui-muted);
  word-break: break-all;
}

.rules {
  margin-top: 16px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  color: var(--ui-muted);
}

.rules h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--ui-text);
}

.rules ul {
  margin: 0;
  padding-left: 18px;
}

.rules li {
  margin-bottom: 6px;
}

.slider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.slider-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--ui-muted);
  font-weight: 600;
}

.slider-field input[type='range'] {
  width: 100%;
}

.slider-field em {
  font-style: normal;
  font-size: 12px;
  color: var(--ui-text);
}

.preview-card {
  margin-top: 20px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.preview-surface {
  background: var(--ui-surface);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--ui-shadow-soft);
}

.preview-surface h4 {
  margin: 0 0 8px;
  font-size: 18px;
}

.preview-surface p {
  margin: 0 0 16px;
  color: var(--ui-muted);
  line-height: 1.6;
}

.preview-btn {
  border: none;
  padding: 10px 18px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  background: linear-gradient(to right, var(--ui-primary), var(--ui-secondary));
  color: white;
}

.hint {
  margin-top: 12px;
  color: var(--ui-muted);
  font-size: 13px;
}

.font-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.font-modal-card {
  width: min(360px, 90%);
  background: var(--ui-surface);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--ui-shadow-strong);
  text-align: center;
}

.font-modal-card h3 {
  margin: 0 0 8px;
}

.font-modal-card p {
  margin: 0 0 16px;
  color: var(--ui-muted);
  font-size: 14px;
}

.font-modal-progress {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

.progress-bar {
  height: 8px;
  background: rgba(148, 163, 184, 0.3);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(to right, var(--ui-primary), var(--ui-secondary));
  transition: width 0.3s ease;
}

@media (max-width: 640px) {
  .settings-header {
    flex-wrap: wrap;
    gap: 12px;
  }

  .settings-intro {
    padding: 14px 16px;
  }
}
</style>


