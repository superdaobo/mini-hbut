<script setup>
import { ref, nextTick } from 'vue'
import { openExternal } from '../utils/external_link'
import LoginV3 from './LoginV3.vue'
import hbutLogo from '../assets/hbut-logo.png'

const props = defineProps({
  studentId: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  loginMode: { type: String, default: 'captcha' },
  configAdminIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['success', 'switchMode', 'logout', 'navigate', 'checkUpdate', 'openOfficial', 'openFeedback', 'openConfig', 'openSettings'])

const activeLegalTab = ref('disclaimer')
const legalSectionRef = ref(null)
const showOpenSourceModal = ref(false)

const handleLogout = () => emit('logout')
const goStudentInfo = () => emit('navigate', 'studentinfo')
const handleCheckUpdate = () => emit('checkUpdate')
const handleOpenOfficial = () => emit('openOfficial')
const handleOpenConfig = () => emit('openConfig')
const handleOpenSettings = () => emit('openSettings')
const handleOpenExport = () => emit('navigate', 'export_center')
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
    <header class="dashboard-header">
      <div class="brand">
        <img class="logo-img" :src="hbutLogo" alt="HBUT" />
        <span class="title">HBUT 校园助手</span>
        <span class="page-tag">我的</span>
      </div>
    </header>

    <section v-if="isLoggedIn" class="me-content glass-card">
      <div class="me-row">
        <span class="label">学号</span>
        <span class="value">{{ studentId }}</span>
      </div>
      <div class="me-row">
        <span class="label">静默登录</span>
        <span class="value">已启用</span>
      </div>
      <div class="me-actions">
        <button class="primary" @click="goStudentInfo">个人信息</button>
        <button class="danger" @click="handleLogout">退出登录</button>
      </div>
    </section>

    <section v-else class="me-content">
      <LoginV3 
        @success="emit('success', $event)"
        @showLegal="handleShowLegal"
      />
    </section>

    <!-- 功能入口 -->
    <section class="quick-links glass-card">
      <h3 class="section-title">更多功能</h3>
      <div class="links-grid">
        <button class="link-item" @click="handleOpenOfficial">
          <span class="link-icon" aria-hidden="true">
            <svg class="link-svg" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" />
              <path d="M19 10v1a7 7 0 01-14 0v-1" />
              <path d="M12 19v3" />
              <path d="M8 22h8" />
            </svg>
          </span>
          <span class="link-text">官方发布</span>
        </button>
        <button class="link-item" @click="handleOpenSettings">
          <span class="link-icon" aria-hidden="true">
            <svg class="link-svg" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </span>
          <span class="link-text">设置</span>
        </button>
        <button class="link-item" @click="handleOpenExport">
          <span class="link-icon" aria-hidden="true">
            <svg class="link-svg" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <path d="M7 10l5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
          </span>
          <span class="link-text">导出中心</span>
        </button>
        <button v-if="isConfigAdmin()" class="link-item" @click="handleOpenConfig">
          <span class="link-icon" aria-hidden="true">
            <svg class="link-svg" viewBox="0 0 24 24" fill="none">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </span>
          <span class="link-text">配置工具</span>
        </button>
        <button class="link-item" @click="handleCheckUpdate">
          <span class="link-icon" aria-hidden="true">
            <svg class="link-svg" viewBox="0 0 24 24" fill="none">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </span>
          <span class="link-text">检查更新</span>
        </button>
        <button class="link-item" @click="handleFeedback">
          <span class="link-icon" aria-hidden="true">
            <svg class="link-svg" viewBox="0 0 24 24" fill="none">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
          </span>
          <span class="link-text">问题反馈</span>
        </button>
        <button class="link-item" @click="handleOpenSource">
          <span class="link-icon" aria-hidden="true">
            <svg class="link-svg" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
              <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72M2.8 10.3c6.02-.6 9.43-.25 17.72-2.33M2.08 14.5c4.13-.56 10.3.1 17.18-1.94" />
            </svg>
          </span>
          <span class="link-text">开源说明</span>
        </button>
      </div>
    </section>

    <section ref="legalSectionRef" class="legal-section glass-card">
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
        <h3>开源说明</h3>
        <p>Mini-HBUT 是一个开源项目，致力于提供更好的校园信息查询体验。</p>
        <p><strong>项目地址：</strong></p>
        <a class="github-link" @click="openGithub">https://github.com/superdaobo/mini-hbut</a>
        <p>感谢以下开源项目：</p>
        <ul class="opensource-list">
          <li>Tauri / Vue 3 / Vite</li>
          <li>reqwest / scraper / serde</li>
          <li>...以及所有贡献者</li>
        </ul>
        <div class="modal-actions">
          <button class="btn-primary" @click="showOpenSourceModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.me-view {
  min-height: 100vh;
  padding: 20px 20px 110px;
  background: var(--ui-bg-gradient);
}

.dashboard-header .brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.dashboard-header .user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dashboard-header .title {
  font-size: clamp(16px, 4.2vw, 20px);
  font-weight: 800;
  letter-spacing: 0.2px;
  color: var(--ui-text) !important;
  background: none !important;
  -webkit-text-fill-color: currentColor !important;
  text-shadow: none !important;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-header .title::selection {
  color: #fff;
  -webkit-text-fill-color: #fff;
  background: color-mix(in oklab, var(--ui-primary) 70%, #111827 30%);
}

.dashboard-header .title.glitch-text::before {
  content: none;
}

.dashboard-header .title.glitch-text::after {
  content: none;
}

.page-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  min-width: 42px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-primary);
  background: color-mix(in oklab, var(--ui-primary-soft) 70%, #fff 30%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 30%, transparent);
}

.profile-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 12px;
  background: var(--ui-primary-soft);
}

.avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--ui-primary-soft-strong);
}

.avatar svg,
.student-id svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.student-id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 800;
  color: var(--ui-text);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 20%, #fff 80%),
    color-mix(in oklab, var(--ui-secondary) 15%, #fff 85%)
  );
  box-shadow: 0 8px 18px color-mix(in oklab, var(--ui-primary) 20%, transparent);
}

.hero-info h2 {
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
}

.hero-info p {
  margin: 0;
  color: var(--ui-muted);
  font-weight: 600;
}

.me-content {
  padding: 20px;
}

.me-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--ui-surface-border);
  font-size: 15px;
}

.me-row .label {
  color: var(--ui-muted);
}

.me-row .value {
  font-weight: 600;
  color: var(--ui-text);
}

@media (max-width: 768px) {
  .dashboard-header {
    gap: 8px;
    padding: 10px 12px;
  }

  .dashboard-header .user-info {
    max-width: 62%;
    justify-content: flex-end;
    flex-wrap: nowrap;
    gap: 6px;
  }

  .dashboard-header .student-id {
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.me-actions {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.me-actions button {
  flex: 1;
  padding: 10px 14px;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
}

.me-actions .primary {
  background: var(--ui-primary);
  color: white;
}

.me-actions .danger {
  background: var(--ui-danger);
  color: white;
}

.legal-section {
  margin-top: 20px;
  padding: 20px;
}

.section-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
}

.quick-links {
  margin-top: 20px;
  padding: 20px;
}

.links-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.link-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--ui-primary-soft);
  border: 1px solid var(--ui-primary-soft-strong);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.link-item:hover {
  background: var(--ui-primary-soft-strong);
  transform: translateY(-2px);
}

.link-item:active {
  transform: scale(0.98);
}

.link-icon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.22);
}

.link-svg {
  width: 14px;
  height: 14px;
  stroke: color-mix(in oklab, var(--ui-primary) 82%, var(--ui-secondary) 18%);
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.link-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-muted);
}

.legal-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
}

.legal-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.legal-tab {
  padding: 10px 12px;
  border: 1px solid var(--ui-primary-soft-strong);
  border-radius: 12px;
  background: var(--ui-primary-soft);
  color: var(--ui-text);
  font-weight: 600;
  cursor: pointer;
}

.legal-tab.active {
  background: var(--ui-primary);
  color: white;
  border-color: var(--ui-primary);
}

.legal-content {
  color: var(--ui-muted);
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
  background: var(--ui-surface);
  width: 85%;
  max-width: 320px;
  padding: 24px;
  border-radius: 16px;
  box-shadow: var(--ui-shadow-strong);
}

.modal-card h3 {
  margin-top: 0;
  color: var(--ui-text);
}

.github-link {
    display: block;
    margin: 10px 0;
    color: var(--ui-primary);
    text-decoration: underline;
    cursor: pointer;
    word-break: break-all;
}

.opensource-list {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
    color: var(--ui-muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.btn-primary {
  background: var(--ui-primary);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.profile-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
</style>





