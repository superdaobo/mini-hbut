<script setup>
import { computed, ref } from 'vue'
import { applyPreset, flushUiSettings, resetUiSettings, UI_PRESETS, useUiSettings } from '../utils/ui_settings'
import { resetAppSettings, useAppSettings } from '../utils/app_settings'
import { loadDeyiHeiFont, useFontSettings } from '../utils/font_settings'
import { showToast } from '../utils/toast'
import hbutLogo from '../assets/hbut-logo.png'

const emit = defineEmits(['back'])

const activeTab = ref('appearance')
const uiSettings = useUiSettings()
const appSettings = useAppSettings()
const fontSettings = useFontSettings()

const downloadingFont = ref(false)
const showFontModal = ref(false)
const fontDownloadProgress = ref(0)
const fontDownloadStatus = ref('idle')
const fontDownloadError = ref('')

const isMobileDevice = (() => {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent || '')
})()

const currentStudentId = computed(() => localStorage.getItem('hbu_username') || '未登录')
const currentPresetLabel = computed(() => UI_PRESETS[uiSettings.preset]?.label || '自定义')
const activeDeviceLabel = computed(() => (isMobileDevice ? '移动端' : '桌面端'))
const activePreviewThreads = computed(() =>
  isMobileDevice
    ? appSettings.resourceShare.previewThreadsMobile
    : appSettings.resourceShare.previewThreadsDesktop
)
const activeDownloadThreads = computed(() =>
  isMobileDevice
    ? appSettings.resourceShare.downloadThreadsMobile
    : appSettings.resourceShare.downloadThreadsDesktop
)

const presetEntries = computed(() =>
  Object.entries(UI_PRESETS).map(([key, preset]) => ({
    key,
    ...preset
  }))
)

const cardStyleOptions = [
  { key: 'glass', label: '玻璃卡片', desc: '半透明层叠，观感轻盈' },
  { key: 'solid', label: '实体卡片', desc: '信息稳定，适合高频阅读' },
  { key: 'outline', label: '线框卡片', desc: '弱背景，强调边界层级' }
]

const navStyleOptions = [
  { key: 'floating', label: '悬浮导航', desc: '圆角悬浮底栏，现代移动风格' },
  { key: 'pill', label: '胶囊导航', desc: '选中态更突出，反馈更明显' },
  { key: 'compact', label: '紧凑导航', desc: '占用更少高度，提升信息密度' }
]

const densityOptions = [
  { key: 'comfortable', label: '舒适', desc: '留白更多，触控更友好' },
  { key: 'balanced', label: '均衡', desc: '效率与观感平衡（推荐）' },
  { key: 'compact', label: '紧凑', desc: '压缩间距，单屏显示更多内容' }
]

const iconOptions = [
  { key: 'duotone', label: '双色图标', desc: '重点信息更醒目' },
  { key: 'line', label: '线性图标', desc: '简洁专业，细节清晰' },
  { key: 'mono', label: '单色图标', desc: '弱化装饰，强化可读性' }
]

const decorOptions = [
  { key: 'mesh', label: '网格光斑', desc: '轻微光效与网格纹理' },
  { key: 'grain', label: '纸感颗粒', desc: '弱纹理背景，减少视觉疲劳' },
  { key: 'none', label: '纯净背景', desc: '移除装饰，仅保留渐变底色' }
]

const interactionProfiles = [
  {
    key: 'mobile_focus',
    label: '移动高效',
    desc: '按钮更大，动画更克制',
    patch: { radiusScale: 1.12, fontScale: 1.03, spaceScale: 1.08, motionScale: 0.9 }
  },
  {
    key: 'desktop_dense',
    label: '桌面密集',
    desc: '信息更紧凑，浏览更高效',
    patch: { radiusScale: 0.92, fontScale: 0.95, spaceScale: 0.9, motionScale: 0.85 }
  },
  {
    key: 'presentation',
    label: '展示模式',
    desc: '字号更大，过渡更柔和',
    patch: { radiusScale: 1.1, fontScale: 1.08, spaceScale: 1.06, motionScale: 1.12 }
  }
]

const handleApplyPreset = (presetKey) => {
  applyPreset(presetKey)
  flushUiSettings()
  showToast(`已切换主题：${UI_PRESETS[presetKey].label}`, 'success')
}

const setProfileOption = (field, value, label) => {
  if (uiSettings.profile[field] === value) {
    flushUiSettings()
    showToast(`${label}已生效`, 'info')
    return
  }
  uiSettings.profile[field] = value
  flushUiSettings()
  showToast(`已切换：${label}`, 'success')
}

const handleApplyProfile = (profile) => {
  Object.entries(profile.patch).forEach(([k, v]) => {
    uiSettings[k] = v
  })
  flushUiSettings()
  showToast(`已应用方案：${profile.label}`, 'success')
}

const handleResetAppearance = () => {
  resetUiSettings()
  flushUiSettings()
  showToast('已恢复默认主题设置', 'success')
}

const handleResetBackend = () => {
  resetAppSettings()
  showToast('已恢复默认后端参数', 'success')
}

const handleSelectFont = (fontKey) => {
  if (fontKey !== 'deyihei') {
    fontSettings.font = fontKey
    flushUiSettings()
    showToast('字体设置已更新', 'success')
    return
  }
  if (fontSettings.loaded) {
    fontSettings.font = 'deyihei'
    flushUiSettings()
    showToast('已应用得意黑', 'success')
    return
  }
  showFontModal.value = true
  handleDownloadFont()
}

const handleDownloadFont = async (force = false) => {
  if (downloadingFont.value) return
  downloadingFont.value = true
  showFontModal.value = true
  fontDownloadProgress.value = 15
  fontDownloadStatus.value = 'downloading'
  fontDownloadError.value = ''
  try {
    await loadDeyiHeiFont(force)
    fontDownloadProgress.value = 100
    fontDownloadStatus.value = 'success'
    fontSettings.font = 'deyihei'
    showToast('字体下载完成，已应用得意黑', 'success')
    showFontModal.value = false
  } catch (e) {
    fontDownloadStatus.value = 'failed'
    fontDownloadError.value = '字体下载失败，请检查网络后重试'
    fontDownloadProgress.value = 0
    showToast('字体下载失败，请检查网络后重试', 'error')
    console.warn('[Font] download failed', e)
  } finally {
    downloadingFont.value = false
  }
}
</script>

<template>
  <div class="settings-view">
    <header class="dashboard-header settings-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <div class="title-wrap">
          <span class="title">系统设置</span>
          <span class="sub-title">主题与性能</span>
        </div>
      </div>
      <button class="header-btn btn-ripple" @click="emit('back')">返回</button>
    </header>

    <section class="settings-intro glass-card">
      <div class="pill-row">
        <span class="meta-pill student-pill">学号：{{ currentStudentId }}</span>
        <span class="meta-pill">设备：{{ activeDeviceLabel }}</span>
        <span class="meta-pill">主题：{{ currentPresetLabel }}</span>
      </div>
      <p>统一管理主题外观、交互风格与下载线程，配置会自动保存并实时生效。</p>
    </section>

    <div class="tab-bar">
      <button class="tab-btn btn-ripple" :class="{ active: activeTab === 'appearance' }" @click="activeTab = 'appearance'">
        外观
      </button>
      <button class="tab-btn btn-ripple" :class="{ active: activeTab === 'backend' }" @click="activeTab = 'backend'">
        后端
      </button>
    </div>

    <template v-if="activeTab === 'appearance'">
      <section class="settings-section glass-card">
        <div class="section-head">
          <h3>主题（5 选 1）</h3>
          <button class="mini-btn btn-ripple" @click="handleResetAppearance">恢复默认</button>
        </div>
        <div class="preset-grid">
          <button
            v-for="preset in presetEntries"
            :key="preset.key"
            class="preset-card"
            :class="{ active: uiSettings.preset === preset.key }"
            @click="handleApplyPreset(preset.key)"
          >
            <span class="preset-swatch" :style="{ background: preset.background }"></span>
            <span class="preset-name">{{ preset.label }}</span>
            <span class="preset-tagline">{{ preset.tagline }}</span>
          </button>
        </div>
      </section>

      <section class="settings-section glass-card">
        <h3>界面个性化</h3>
        <div class="option-group">
          <label>卡片风格</label>
          <div class="chip-row">
            <button
              v-for="item in cardStyleOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.cardStyle === item.key }"
              @click="setProfileOption('cardStyle', item.key, `卡片风格：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>导航样式</label>
          <div class="chip-row">
            <button
              v-for="item in navStyleOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.navStyle === item.key }"
              @click="setProfileOption('navStyle', item.key, `导航样式：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>界面密度</label>
          <div class="chip-row">
            <button
              v-for="item in densityOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.density === item.key }"
              @click="setProfileOption('density', item.key, `界面密度：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>图标风格</label>
          <div class="chip-row">
            <button
              v-for="item in iconOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.iconStyle === item.key }"
              @click="setProfileOption('iconStyle', item.key, `图标风格：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label>背景装饰</label>
          <div class="chip-row">
            <button
              v-for="item in decorOptions"
              :key="item.key"
              class="option-chip"
              :class="{ active: uiSettings.profile.decor === item.key }"
              @click="setProfileOption('decor', item.key, `背景装饰：${item.label}`)"
            >
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section glass-card">
        <h3>快捷方案</h3>
        <div class="profile-grid">
          <button
            v-for="profile in interactionProfiles"
            :key="profile.key"
            class="profile-card"
            @click="handleApplyProfile(profile)"
          >
            <strong>{{ profile.label }}</strong>
            <span>{{ profile.desc }}</span>
          </button>
        </div>
      </section>

      <section class="settings-section glass-card">
        <h3>字体</h3>
        <div class="font-actions">
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'default' }" @click="handleSelectFont('default')">
            默认字体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'heiti' }" @click="handleSelectFont('heiti')">
            黑体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'songti' }" @click="handleSelectFont('songti')">
            宋体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'kaiti' }" @click="handleSelectFont('kaiti')">
            楷体
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'fangsong' }" @click="handleSelectFont('fangsong')">
            仿宋
          </button>
          <button class="font-btn btn-ripple" :class="{ active: fontSettings.font === 'deyihei' }" @click="handleSelectFont('deyihei')">
            得意黑（需下载）
          </button>
        </div>
        <div class="font-download-row">
          <button class="mini-btn btn-ripple" :disabled="downloadingFont" @click="handleDownloadFont(fontSettings.loaded)">
            {{ downloadingFont ? '下载中...' : fontSettings.loaded ? '重新下载得意黑' : '下载得意黑' }}
          </button>
          <span class="hint">默认可直接使用系统字体，下载为可选项。</span>
        </div>
      </section>
    </template>

    <section v-else class="settings-section glass-card">
      <div class="section-head">
        <h3>请求与并发</h3>
        <button class="mini-btn btn-ripple" @click="handleResetBackend">恢复默认</button>
      </div>
      <div class="backend-summary">
        <span class="status-pill">预览线程：{{ activePreviewThreads }}</span>
        <span class="status-pill">下载线程：{{ activeDownloadThreads }}</span>
        <span class="status-pill">设备：{{ activeDeviceLabel }}</span>
      </div>
      <div class="backend-grid">
        <label class="field">
          <span>电费查询重试次数</span>
          <input type="number" min="0" max="5" v-model.number="appSettings.retry.electricity" />
        </label>
        <label class="field">
          <span>空教室查询重试次数</span>
          <input type="number" min="0" max="5" v-model.number="appSettings.retry.classroom" />
        </label>
        <label class="field">
          <span>重试间隔（ms）</span>
          <input type="number" min="500" max="10000" step="100" v-model.number="appSettings.retryDelayMs" />
        </label>
        <label class="field">
          <span>移动端预览线程</span>
          <input type="number" min="1" max="8" step="1" v-model.number="appSettings.resourceShare.previewThreadsMobile" />
        </label>
        <label class="field">
          <span>桌面端预览线程</span>
          <input type="number" min="1" max="12" step="1" v-model.number="appSettings.resourceShare.previewThreadsDesktop" />
        </label>
        <label class="field">
          <span>移动端下载线程</span>
          <input type="number" min="1" max="8" step="1" v-model.number="appSettings.resourceShare.downloadThreadsMobile" />
        </label>
        <label class="field">
          <span>桌面端下载线程</span>
          <input type="number" min="1" max="12" step="1" v-model.number="appSettings.resourceShare.downloadThreadsDesktop" />
        </label>
      </div>
      <p class="hint">并发线程越高速度通常越快，但会增加设备与网络占用。</p>
    </section>

    <div v-if="showFontModal" class="font-modal">
      <div class="font-modal-card">
        <h3>下载得意黑字体</h3>
        <p>首次启用需下载字体文件，下载完成后会自动应用。</p>
        <div class="font-modal-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${fontDownloadProgress}%` }"></div>
          </div>
          <span v-if="fontDownloadStatus === 'downloading'">下载中...</span>
          <span v-else-if="fontDownloadStatus === 'success'">下载完成</span>
          <span v-else-if="fontDownloadStatus === 'failed'">下载失败</span>
          <span v-else>等待开始</span>
        </div>
        <p v-if="fontDownloadError" class="font-error">{{ fontDownloadError }}</p>
        <div class="font-modal-actions">
          <button v-if="fontDownloadStatus === 'failed'" class="btn-secondary btn-ripple" @click="handleDownloadFont(true)">
            重试下载
          </button>
          <button class="btn-primary btn-ripple" @click="showFontModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  padding: 22px 18px 124px;
  color: var(--ui-text);
  background: var(--ui-bg-gradient);
}

.settings-header {
  margin-bottom: 14px;
  padding: 12px 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.title-wrap {
  display: grid;
  gap: 2px;
}

.title {
  font-size: clamp(19px, 2.4vw, 24px);
  font-weight: 800;
  line-height: 1.1;
}

.sub-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-muted);
}

.settings-intro {
  margin-bottom: 14px;
  padding: 16px;
  display: grid;
  gap: 10px;
}

.settings-intro p {
  margin: 0;
  color: var(--ui-muted);
  line-height: 1.65;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 26%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 70%, #fff 30%);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 700;
}

.student-pill {
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 26%, #fff 74%),
    color-mix(in oklab, var(--ui-secondary) 20%, #fff 80%)
  );
  box-shadow: 0 8px 16px color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.tab-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.tab-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.42));
  background: var(--ui-surface);
  color: var(--ui-muted);
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.tab-btn.active {
  border-color: transparent;
  color: #ffffff;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
}

.settings-section {
  margin-bottom: 14px;
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.settings-section h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--ui-text);
}

.mini-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, rgba(148, 163, 184, 0.34));
  background: var(--ui-surface);
  color: var(--ui-text);
  border-radius: 10px;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}

.preset-card {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.34));
  border-radius: 14px;
  padding: 10px;
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  display: grid;
  gap: 6px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.preset-card.active {
  border-color: color-mix(in oklab, var(--ui-primary) 72%, #fff 28%);
  box-shadow: 0 10px 20px color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.preset-card:hover {
  transform: translateY(-1px);
}

.preset-swatch {
  width: 100%;
  height: 56px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.52);
}

.preset-name {
  font-size: 14px;
  font-weight: 800;
  color: var(--ui-text);
}

.preset-tagline {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-muted);
}

.option-group {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.option-group > label {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-muted);
}

.chip-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
}

.option-chip {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.32));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  color: var(--ui-text);
  border-radius: 12px;
  padding: 10px;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
}

.option-chip strong {
  font-size: 13px;
}

.option-chip small {
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.45;
}

.option-chip.active {
  border-color: color-mix(in oklab, var(--ui-primary) 72%, white);
  background: color-mix(in oklab, var(--ui-primary) 12%, #fff 88%);
  box-shadow: 0 8px 18px color-mix(in oklab, var(--ui-primary) 22%, transparent);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.profile-card {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, rgba(148, 163, 184, 0.34));
  background: color-mix(in oklab, var(--ui-surface) 86%, #fff 14%);
  color: var(--ui-text);
  border-radius: 12px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 6px;
}

.profile-card strong {
  font-size: 14px;
}

.profile-card span {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-muted);
}

.font-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.font-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.34));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  color: var(--ui-text);
  border-radius: 10px;
  height: 38px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.font-btn.active {
  border-color: transparent;
  color: #ffffff;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
}

.font-download-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.backend-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 700;
}

.backend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-muted);
}

.field input {
  height: 42px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, rgba(148, 163, 184, 0.4));
  background: color-mix(in oklab, var(--ui-surface) 90%, #fff 10%);
  padding: 0 12px;
  color: var(--ui-text);
}

.hint {
  margin-top: 10px;
  font-size: 13px;
  color: var(--ui-muted);
  line-height: 1.6;
}

.font-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.font-modal-card {
  width: min(360px, 100%);
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  border-radius: 16px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.36));
  box-shadow: var(--ui-shadow-strong);
  padding: 18px;
}

.font-modal-card h3 {
  margin: 0;
  font-size: 20px;
  color: var(--ui-text);
}

.font-modal-card p {
  margin: 8px 0 0;
  color: var(--ui-muted);
  line-height: 1.6;
}

.font-modal-progress {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.25);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ui-primary), var(--ui-secondary));
}

.font-error {
  color: var(--ui-danger);
  font-size: 13px;
}

.font-modal-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-secondary,
.btn-primary {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, rgba(148, 163, 184, 0.3));
  border-radius: 10px;
  min-width: 88px;
  height: 38px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.btn-secondary {
  background: color-mix(in oklab, var(--ui-primary-soft) 42%, #fff 58%);
  color: var(--ui-text);
}

.btn-primary {
  border: none;
  color: #ffffff;
  background: linear-gradient(130deg, var(--ui-primary), var(--ui-secondary));
}

@media (max-width: 720px) {
  .settings-view {
    padding: 14px 12px 110px;
  }

  .settings-header {
    padding: 10px 12px;
  }

  .title {
    font-size: 20px;
  }

  .preset-grid,
  .chip-row,
  .profile-grid,
  .backend-grid {
    grid-template-columns: 1fr;
  }

  .font-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
