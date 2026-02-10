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
        <span class="title glitch-text" data-text="HBUT 校园助手">HBUT 校园助手</span>
        <span class="page-tag">我的</span>
      </div>
      <div class="user-info">
        <div class="profile-inline">
          <div class="avatar">👤</div>
          <div class="hero-info">
            <h2>个人中心</h2>
            <p>{{ isLoggedIn ? '欢迎回来' : '请先登录' }}</p>
          </div>
        </div>
        <span class="student-id">👤 {{ studentId || (isLoggedIn ? '已登录' : '未登录') }}</span>
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
          <span class="link-icon">📣</span>
          <span class="link-text">官方发布</span>
        </button>
        <button class="link-item" @click="handleOpenSettings">
          <span class="link-icon">🎚️</span>
          <span class="link-text">设置</span>
        </button>
        <button class="link-item" @click="handleOpenExport">
          <span class="link-icon">📦</span>
          <span class="link-text">导出中心</span>
        </button>
        <button v-if="isConfigAdmin()" class="link-item" @click="handleOpenConfig">
          <span class="link-icon">🛠️</span>
          <span class="link-text">配置工具</span>
        </button>
        <button class="link-item" @click="handleCheckUpdate">
          <span class="link-icon">🔄</span>
          <span class="link-text">检查更新</span>
        </button>
        <button class="link-item" @click="handleFeedback">
          <span class="link-icon">📝</span>
          <span class="link-text">问题反馈</span>
        </button>
        <button class="link-item" @click="handleOpenSource">
          <span class="link-icon">📖</span>
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

.profile-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 12px;
  background: var(--ui-primary-soft);
}

.avatar {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--ui-primary-soft-strong);
  font-size: 20px;
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
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
  }

  .dashboard-header .user-info {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
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
  font-size: 28px;
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





