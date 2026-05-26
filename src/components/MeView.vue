<script setup>
import { ref, nextTick, watch } from 'vue'
import { openExternal } from '../utils/external_link'
import LoginV3 from './LoginV3.vue'

const props = defineProps({
  studentId: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  loginMode: { type: String, default: 'portal_password' },
  configAdminIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['success', 'switchMode', 'logout', 'navigate', 'checkUpdate', 'openOfficial', 'openFeedback', 'openConfig', 'openSettings'])

const activeLegalTab = ref('disclaimer')
const legalSectionRef = ref(null)
const showOpenSourceModal = ref(false)
const showSponsorModal = ref(false)
const sponsorImageUrl = ref('')
const sponsorImageLoading = ref(false)

const SPONSOR_IMAGE_CACHE_KEY = 'hbu_sponsor_qr_cache'
const SPONSOR_IMAGE_SRC = 'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/%E8%B5%9E%E8%B5%8F%E7%A0%81.JPG'

// 加载赞赏码（首次下载，之后缓存）
const loadSponsorImage = async () => {
  // 检查缓存
  const cached = localStorage.getItem(SPONSOR_IMAGE_CACHE_KEY)
  if (cached) {
    sponsorImageUrl.value = cached
    return
  }
  // 首次下载
  sponsorImageLoading.value = true
  try {
    const res = await fetch(SPONSOR_IMAGE_SRC)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      sponsorImageUrl.value = dataUrl
      try { localStorage.setItem(SPONSOR_IMAGE_CACHE_KEY, dataUrl) } catch { /* quota */ }
      sponsorImageLoading.value = false
    }
    reader.readAsDataURL(blob)
  } catch {
    // 降级：直接用远程 URL
    sponsorImageUrl.value = SPONSOR_IMAGE_SRC
    sponsorImageLoading.value = false
  }
}

watch(showSponsorModal, (val) => {
  if (val && !sponsorImageUrl.value) loadSponsorImage()
})

const handleLogout = () => emit('logout')
const goStudentInfo = () => emit('navigate', 'studentinfo')
const handleCheckUpdate = () => emit('checkUpdate')
const handleOpenOfficial = () => emit('openOfficial')
const handleOpenConfig = () => emit('openConfig')
const handleOpenSettings = () => emit('openSettings')
const handleOpenExport = () => emit('navigate', 'export_center')
const handleOpenServiceStats = () => emit('navigate', 'service_stats')
const handleOpenMore = () => emit('navigate', 'more')
const isConfigAdmin = () => Array.isArray(props.configAdminIds) && props.configAdminIds.includes(props.studentId)

const handleFeedback = () => emit('openFeedback')

const handleOpenSource = () => {
    showOpenSourceModal.value = true
}

const openGithub = async () => {
    await openExternal('https://github.com/superdaobo/mini-hbut')
}

const handleShowLegal = async (tab) => {
  activeLegalTab.value = tab
  await nextTick()
  if (legalSectionRef.value?.scrollIntoView) {
    legalSectionRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>

<template>
  <div class="me-view">
    <!-- Header -->
    <header class="dashboard-header">
      <div class="header-left">
        <img class="logo-img" src="/splash/app_icon.png" alt="HBUT" />
        <span class="header-title">HBUT 校园助手</span>
      </div>
      <span class="header-pill">我的</span>
    </header>

    <!-- Profile Card -->
    <section v-if="isLoggedIn" class="profile-card">
      <div class="profile-avatar">
        <span class="material-symbols-outlined avatar-icon">person</span>
      </div>
      <h2 class="profile-student-id">{{ studentId }}</h2>
      <p class="profile-school">湖北工业大学</p>
      <div class="profile-actions">
        <button class="btn-info" @click="goStudentInfo">个人信息</button>
        <button class="btn-logout" @click="handleLogout">退出登录</button>
      </div>
    </section>

    <section v-else class="profile-card">
      <LoginV3
        :login-mode="loginMode"
        @success="emit('success', $event)"
        @switchMode="emit('switchMode', $event)"
        @showLegal="handleShowLegal"
      />
    </section>

    <!-- Login Status Card -->
    <section class="status-card">
      <div class="status-left">
        <div class="status-icon-box">
          <span class="material-symbols-outlined status-icon">verified_user</span>
        </div>
        <div class="status-text">
          <span class="status-title">登录状态</span>
          <span class="status-subtitle">静默登录已开启</span>
        </div>
      </div>
      <span class="status-dot"></span>
    </section>

    <!-- Functional Grid -->
    <section class="func-grid">
      <button class="grid-item" @click="handleOpenOfficial">
        <div class="grid-icon-box" style="background: #E8F0FE;">
          <span class="material-symbols-outlined" style="color: #1A73E8;">campaign</span>
        </div>
        <span class="grid-label">官方帖子</span>
      </button>
      <button class="grid-item" @click="handleOpenSettings">
        <div class="grid-icon-box" style="background: #FCE8E6;">
          <span class="material-symbols-outlined" style="color: #D93025;">settings</span>
        </div>
        <span class="grid-label">设置中心</span>
      </button>
      <button class="grid-item" @click="handleOpenExport">
        <div class="grid-icon-box" style="background: #E6F4EA;">
          <span class="material-symbols-outlined" style="color: #1E8E3E;">download</span>
        </div>
        <span class="grid-label">导出中心</span>
      </button>
      <button v-if="isLoggedIn" class="grid-item" @click="handleOpenServiceStats">
        <div class="grid-icon-box" style="background: #E0F2F1;">
          <span class="material-symbols-outlined" style="color: #00796B;">monitoring</span>
        </div>
        <span class="grid-label">服务统计</span>
      </button>
      <button v-if="isConfigAdmin()" class="grid-item" @click="handleOpenConfig">
        <div class="grid-icon-box" style="background: #FEF7E0;">
          <span class="material-symbols-outlined" style="color: #F9AB00;">build</span>
        </div>
        <span class="grid-label">配置工具</span>
      </button>
      <button class="grid-item" @click="handleCheckUpdate">
        <div class="grid-icon-box" style="background: #F3E8FD;">
          <span class="material-symbols-outlined" style="color: #9333EA;">update</span>
        </div>
        <span class="grid-label">检查更新</span>
      </button>
      <button class="grid-item" @click="handleFeedback">
        <div class="grid-icon-box" style="background: #E1F5FE;">
          <span class="material-symbols-outlined" style="color: #0288D1;">feedback</span>
        </div>
        <span class="grid-label">意见反馈</span>
      </button>
      <button class="grid-item" @click="handleOpenSource">
        <div class="grid-icon-box" style="background: #ECEFF1;">
          <span class="material-symbols-outlined" style="color: #455A64;">code</span>
        </div>
        <span class="grid-label">开源协议</span>
      </button>
      <button class="grid-item" @click="showSponsorModal = true">
        <div class="grid-icon-box" style="background: #FFF3E0;">
          <span class="material-symbols-outlined" style="color: #E65100;">favorite</span>
        </div>
        <span class="grid-label">赞助</span>
      </button>
      <button class="grid-item" @click="handleOpenMore">
        <div class="grid-icon-box" style="background: #F3E5F5;">
          <span class="material-symbols-outlined" style="color: #7B1FA2;">apps</span>
        </div>
        <span class="grid-label">更多</span>
      </button>
    </section>

    <!-- Legal Section -->
    <section ref="legalSectionRef" class="legal-card">
      <h3 class="legal-title">免责声明与隐私政策</h3>
      <div class="legal-tabs">
        <button
          class="legal-tab"
          :class="{ active: activeLegalTab === 'disclaimer' }"
          @click="activeLegalTab = 'disclaimer'"
        >
          免责声明
        </button>
        <button
          class="legal-tab"
          :class="{ active: activeLegalTab === 'privacy' }"
          @click="activeLegalTab = 'privacy'"
        >
          隐私政策
        </button>
      </div>

      <div v-if="activeLegalTab === 'disclaimer'" class="legal-content">
        <p>本应用为学习与信息查询工具，非学校官方系统或官方网站。</p>
        <ul>
          <li>数据来源于学校相关系统接口或公开信息，仅用于展示与查询参考。</li>
          <li>我们会尽力保证展示信息的及时性与准确性，但不对其完整性、准确性、时效性作保证。</li>
          <li>因网络、系统维护、第三方服务变化等导致的服务中断或信息错误，我们不承担责任。</li>
          <li>请勿将本应用用于任何违法、违规或侵害他人权益的用途。</li>
        </ul>
      </div>

      <div v-else class="legal-content">
        <p>我们仅收集提供服务所必需的数据，并采取合理措施保护数据安全。</p>
        <ul>
          <li><strong>收集内容</strong>：学号、登录会话信息、验证码参数、查询所需的临时授权信息。</li>
          <li><strong>使用目的</strong>：用于身份验证、成绩/课表/电费等查询与展示。</li>
          <li><strong>存储方式</strong>：本地会存储加密后的账号凭据与缓存数据；后端仅保存必要的会话与授权信息。</li>
          <li><strong>数据共享</strong>：不会向无关第三方共享个人信息，除非获得你的明确授权或法律要求。</li>
          <li><strong>数据保留</strong>：仅在实现功能所需期限内保留，可通过退出登录清理会话。</li>
        </ul>
        <p>继续使用即表示你已阅读并同意本隐私政策。</p>
      </div>
    </section>

    <!-- 开源说明弹窗 -->
    <div v-if="showOpenSourceModal" class="modal-mask" @click="showOpenSourceModal = false">
      <div class="modal-card" @click.stop>
        <h3>📚 开源说明</h3>
        <p class="intro">Mini-HBUT 是一个开源项目，致力于提供更好的校园信息查询体验。</p>
        <div class="section">
          <p class="label">项目地址</p>
          <a class="github-link" @click="openGithub">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            https://github.com/superdaobo/mini-hbut
          </a>
        </div>
        <div class="section">
          <p class="label">开源技术</p>
          <ul class="opensource-list">
            <li><span class="tag">前端</span> Tauri / Vue 3 / Vite</li>
            <li><span class="tag">后端</span> Rust (reqwest / scraper / serde)</li>
            <li><span class="tag">感谢</span> 所有开源贡献者</li>
          </ul>
        </div>
        <div class="section thanks">
          <p>感谢原 <strong>Mini湖工</strong> 小程序的开发者，为本项目提供了宝贵的灵感</p>
          <p>感谢开发者的 <strong>朋友们和舍友们</strong>，提供了测试和反馈</p>
          <p class="highlight">感谢所有为 Mini-HBUT 做出贡献的人！ 🎉</p>
        </div>
        <div class="modal-actions">
          <button class="btn-primary" @click="showOpenSourceModal = false">知道了</button>
        </div>
      </div>
    </div>

    <!-- 赞助弹窗 -->
    <div v-if="showSponsorModal" class="modal-mask" @click="showSponsorModal = false">
      <div class="modal-card sponsor-modal" @click.stop>
        <h3>❤️ 赞助支持</h3>
        <p class="intro">如果 Mini-HBUT 对你有帮助，欢迎请作者喝杯咖啡 ☕</p>
        <div class="sponsor-qr-container">
          <div v-if="sponsorImageLoading" class="sponsor-loading">加载中...</div>
          <img
            v-else-if="sponsorImageUrl"
            :src="sponsorImageUrl"
            alt="微信赞赏码"
            class="sponsor-qr-image"
          />
        </div>
        <p class="sponsor-hint">长按或截图扫码 · 微信赞赏</p>
        <div class="modal-actions">
          <button class="btn-primary" @click="showSponsorModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.me-view {
  min-height: 100vh;
  background: #f9f9ff;
  padding: 18px 16px 120px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

/* Header */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 50%;
}

.header-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.header-pill {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-primary, #2563eb);
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
  padding: 6px 16px;
  border-radius: 9999px;
}

/* Profile Card */
.profile-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 32px 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.avatar-icon {
  font-size: 40px;
  color: var(--ui-primary, #2563eb);
}

.profile-student-id {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
}

.profile-school {
  margin: 0 0 20px;
  font-size: 14px;
  color: #6b7280;
}

.profile-actions {
  display: flex;
  gap: 12px;
  width: 100%;
  max-width: 280px;
}

.btn-info {
  flex: 1;
  padding: 10px 18px;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-primary, #2563eb);
  color: #ffffff;
  transition: opacity 0.2s;
}

.btn-info:active {
  opacity: 0.85;
}

.btn-logout {
  flex: 1;
  padding: 10px 18px;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #fce8e6;
  color: #d93025;
  transition: opacity 0.2s;
}

.btn-logout:active {
  opacity: 0.85;
}

/* Login Status Card */
.status-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 18px 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 10%, #ffffff 90%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon {
  font-size: 24px;
  color: var(--ui-primary, #2563eb);
}

.status-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.status-subtitle {
  font-size: 13px;
  color: #6b7280;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

/* Functional Grid */
.func-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 20px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s, box-shadow 0.15s;
}

.grid-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.grid-item:active {
  transform: scale(0.96);
}

.grid-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-icon-box .material-symbols-outlined {
  font-size: 26px;
}

.grid-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  text-align: center;
  line-height: 1.3;
}

/* Legal Section */
.legal-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 24px 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.legal-title {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 700;
  color: #1f2937;
}

.legal-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.legal-tab {
  padding: 8px 18px;
  border: none;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #f3f4f6;
  color: #6b7280;
  transition: all 0.2s;
}

.legal-tab.active {
  background: var(--ui-primary, #2563eb);
  color: #ffffff;
}

.legal-content {
  color: #4b5563;
  line-height: 1.7;
  font-size: 14px;
}

.legal-content ul {
  margin: 8px 0 0 18px;
  padding: 0;
}

.legal-content li {
  margin: 6px 0;
}

/* Modal */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: #ffffff;
  width: 85%;
  max-width: 340px;
  padding: 24px;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.modal-card h3 {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.modal-card .intro {
  margin-bottom: 20px;
  color: #374151;
  line-height: 1.6;
  font-size: 14px;
}

.modal-card .section {
  margin-bottom: 16px;
}

.modal-card .label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.github-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f9fafb;
  border-radius: 12px;
  color: var(--ui-primary, #2563eb);
  text-decoration: none;
  font-size: 14px;
  word-break: break-all;
  cursor: pointer;
}

.github-link .icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.modal-card .tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--ui-primary, #2563eb);
  color: white;
  border-radius: 6px;
  font-size: 11px;
  margin-right: 8px;
}

.modal-card .thanks {
  padding: 12px;
  background: #f9fafb;
  border-radius: 12px;
  border-left: 3px solid var(--ui-primary, #2563eb);
}

.modal-card .thanks p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

.modal-card .thanks p:last-child {
  margin-bottom: 0;
}

.modal-card .thanks .highlight {
  color: var(--ui-primary, #2563eb);
  font-weight: 600;
  text-align: center;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.opensource-list {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
  color: #6b7280;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.btn-primary {
  background: var(--ui-primary, #2563eb);
  color: white;
  border: none;
  padding: 10px 22px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary:active {
  opacity: 0.85;
}

/* Sponsor Modal */
.sponsor-modal {
  max-width: 340px;
  text-align: center;
}

.sponsor-qr-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  margin: 16px 0;
}

.sponsor-qr-image {
  max-width: 240px;
  max-height: 300px;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.sponsor-loading {
  color: #6b7280;
  font-size: 14px;
}

.sponsor-hint {
  font-size: 12px;
  color: #6b7280;
  margin: 8px 0 16px;
}

/* Responsive: 小屏幕 grid 变 3 列 */
@media (max-width: 380px) {
  .func-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
