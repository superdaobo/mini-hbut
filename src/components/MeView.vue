<script setup>
import { ref, nextTick } from 'vue'
import LoginV3 from './LoginV3.vue'

const props = defineProps({
  studentId: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  loginMode: { type: String, default: 'captcha' }
})

const emit = defineEmits(['success', 'switchMode', 'logout', 'navigate', 'checkUpdate', 'openOfficial'])

const activeLegalTab = ref('disclaimer')
const legalSectionRef = ref(null)

const handleLogout = () => emit('logout')
const goStudentInfo = () => emit('navigate', 'studentinfo')
const handleCheckUpdate = () => emit('checkUpdate')
const handleOpenOfficial = () => emit('openOfficial')

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
    <header class="me-hero">
      <div class="hero-card">
        <div class="avatar">🎓</div>
        <div class="hero-info">
          <h2>个人中心</h2>
          <p>{{ isLoggedIn ? '已登录' : '未登录' }}</p>
        </div>
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
          <span class="link-icon">📢</span>
          <span class="link-text">官方发布</span>
        </button>
        <button class="link-item" @click="handleCheckUpdate">
          <span class="link-icon">🔄</span>
          <span class="link-text">检查更新</span>
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
          <li>我们会尽力保证展示信息的及时性与准确性，但不对其完整性、准确性、时效性做保证。</li>
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
  </div>
</template>

<style scoped>
.me-view {
  min-height: 100vh;
  padding: 20px 20px 110px;
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 55%, #22d3ee 100%);
}

.me-hero {
  margin-bottom: 20px;
}

.hero-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
}

.avatar {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: rgba(99, 102, 241, 0.15);
  font-size: 28px;
}

.hero-info h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
}

.hero-info p {
  margin: 0;
  color: #475569;
  font-weight: 600;
}

.me-content {
  padding: 20px;
}

.me-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  font-size: 15px;
}

.me-row .label {
  color: #64748b;
}

.me-row .value {
  font-weight: 600;
  color: #0f172a;
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
  background: #6366f1;
  color: white;
}

.me-actions .danger {
  background: #ef4444;
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
  color: #0f172a;
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
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.link-item:hover {
  background: rgba(99, 102, 241, 0.15);
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
  color: #374151;
}

.legal-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.legal-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.legal-tab {
  padding: 10px 12px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.08);
  color: #1e293b;
  font-weight: 600;
  cursor: pointer;
}

.legal-tab.active {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

.legal-content {
  color: #334155;
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
</style>
