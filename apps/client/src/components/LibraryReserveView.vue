<script setup>
/**
 * 图书馆预约 — 单页 Tab 框架（#1055）
 *
 * 本阶段只做「框架与接线」：四个 Tab（座位预约 / 静音仓 / 研讨室 / 我的预约）
 * 均为结构完整的占位，包含加载中 / 空态 / 错误态三种基础状态处理。
 * 真实取数由 S5/S6 接入，接口形态见 data/library-reserve-recon/01-api-contract.md。
 *
 * 未登录（在线会话未确认）时展示明确引导并可直接跳转登录，避免出现空白或死入口。
 * 与 LibraryView.vue（馆藏检索 OPAC）无关，二者是相互独立的视图。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { TPageHeader, TEmptyState } from './templates'
import { useLocale } from '../utils/app_i18n'
import { useAuthStore } from '../stores/auth'

const { t } = useLocale()
const authStore = useAuthStore()

const emit = defineEmits(['back', 'require-login'])

/** 四个 Tab 的 key（同时作为 i18n 词条后缀与状态隔离维度） */
const TABS = ['seat', 'quiet', 'room', 'mine']

/** 占位图标（Material Symbols 名称，按 Tab 取用） */
const TAB_ICONS = {
  seat: 'event_seat',
  quiet: 'headphones',
  room: 'groups',
  mine: 'event_available'
}

const activeTab = ref('seat')
const loading = ref(false)
const error = ref('')

/**
 * 是否已具备使用预约的在线会话。
 * 仅「在线会话已确认」才放行（契约 D：不得以缓存身份代替已确认会话），
 * 否则一律走登录引导，保证不出现点了没反应的死入口。
 */
const canUse = computed(() => Boolean(authStore.isLoggedIn && authStore.sessionVerified))

/**
 * Tab 占位数据源：本阶段不接真实后端，直接完成（结果恒为空）。
 * S5/S6 接入时把这里替换为 reserve.chaoxing.com 的真实请求即可，
 * 上层 loading / error / 空态的处理无需改动。
 */
const fetchTabData = async () => {
  await Promise.resolve()
}

/** 拉取当前 Tab 数据（切换 Tab 与重试共用同一入口） */
const loadActiveTab = async () => {
  if (!canUse.value) return
  loading.value = true
  error.value = ''
  try {
    await fetchTabData()
  } catch (e) {
    error.value = String(e?.message || e || t('library.reserve.state.error'))
  } finally {
    loading.value = false
  }
}

const selectTab = (tabKey) => {
  if (activeTab.value === tabKey) return
  activeTab.value = tabKey
  void loadActiveTab()
}

const goLogin = () => emit('require-login')

/** 会话确认后自动补拉一次（覆盖「先进页面后登录」的时序） */
watch(canUse, (ok) => {
  if (ok) void loadActiveTab()
})

onMounted(() => {
  void loadActiveTab()
})
</script>

<template>
  <div class="page">
    <TPageHeader :title="t('library.reserve.title')" icon="event_seat" @back="emit('back')" />

    <div class="body">
      <!-- 未登录 / 会话未确认：明确引导，不展示任何死入口 -->
      <section v-if="!canUse" class="guide">
        <span class="guide__icon material-symbols-outlined" aria-hidden="true">account_circle</span>
        <h2 class="guide__title">{{ t('library.reserve.login.title') }}</h2>
        <p class="guide__desc">{{ t('library.reserve.login.desc') }}</p>
        <button type="button" class="primary" @click="goLogin">
          {{ t('library.reserve.login.action') }}
        </button>
      </section>

      <template v-else>
        <!-- 顶部 Tab：座位 / 静音仓 / 研讨室 / 我的预约 -->
        <div class="tabs" role="tablist" :aria-label="t('library.reserve.title')">
          <button
            v-for="tabKey in TABS"
            :key="tabKey"
            type="button"
            class="tab"
            :class="{ active: activeTab === tabKey }"
            role="tab"
            :aria-selected="activeTab === tabKey"
            @click="selectTab(tabKey)"
          >
            {{ t(`library.reserve.tab.${tabKey}`) }}
          </button>
        </div>

        <TEmptyState v-if="loading" type="loading" :message="t('library.reserve.state.loading')" />

        <section v-else-if="error" class="card error-card">
          <p class="err">{{ error }}</p>
          <button type="button" class="ghost" @click="loadActiveTab">
            {{ t('library.reserve.btn.retry') }}
          </button>
        </section>

        <!-- 我的预约：本阶段为空态占位 -->
        <TEmptyState
          v-else-if="activeTab === 'mine'"
          type="empty"
          :message="t('library.reserve.mine.empty')"
        >
          <p class="sub-hint">{{ t('library.reserve.mine.hint') }}</p>
        </TEmptyState>

        <!-- 三类资源：结构完整的空态占位（S5/S6 替换为真实预约界面） -->
        <section v-else class="card placeholder">
          <span class="placeholder__icon material-symbols-outlined" aria-hidden="true">
            {{ TAB_ICONS[activeTab] }}
          </span>
          <h2 class="placeholder__title">{{ t(`library.reserve.tab.${activeTab}`) }}</h2>
          <p class="placeholder__desc">{{ t(`library.reserve.${activeTab}.desc`) }}</p>
          <p class="placeholder__hint">{{ t('library.reserve.placeholder.desc') }}</p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  padding-bottom: 96px;
  color: var(--ui-text);
}
.body {
  padding: 12px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(16px * var(--ui-radius-scale));
  padding: 16px;
}

/* 登录引导 */
.guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 48px 20px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(18px * var(--ui-radius-scale));
}
.guide__icon {
  font-size: 48px;
  color: var(--ui-primary);
}
.guide__title {
  margin: 0;
  font-size: calc(17px * var(--ui-font-scale));
  color: var(--ui-text);
}
.guide__desc {
  margin: 0;
  max-width: 420px;
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.6;
  color: var(--ui-muted);
}

/* 顶部 Tab（窄屏横向滚动，宽屏等分） */
.tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.tab {
  flex: 1 0 auto;
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(999px * var(--ui-radius-scale));
  background: var(--ui-surface);
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background calc(0.16s * var(--ui-motion-scale)) ease,
    color calc(0.16s * var(--ui-motion-scale)) ease;
}
.tab.active {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  color: #fff;
}

/* 占位卡片 */
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 40px 20px;
}
.placeholder__icon {
  font-size: 44px;
  color: var(--ui-primary);
}
.placeholder__title {
  margin: 0;
  font-size: calc(16px * var(--ui-font-scale));
  color: var(--ui-text);
}
.placeholder__desc {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-muted);
}
.placeholder__hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
  opacity: 0.85;
}

/* 错误态 */
.error-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.err {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-danger);
}
.sub-hint {
  margin: 8px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

/* 按钮 */
.primary,
.ghost {
  min-height: 44px;
  padding: 0 20px;
  border-radius: calc(14px * var(--ui-radius-scale));
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
.primary {
  border: 0;
  background: var(--ui-primary);
  color: #fff;
}
.ghost {
  border: 1px solid var(--ui-surface-border);
  background: transparent;
  color: var(--ui-text);
}

/* 宽屏（≥768 主断点）：Tab 等分占满，内容留出呼吸感 */
@media (min-width: 768px) {
  .body {
    padding: 16px 20px 32px;
  }
  .tab {
    flex: 1 1 0;
    min-width: 0;
  }
  .guide,
  .placeholder {
    padding: 64px 24px;
  }
}
</style>
