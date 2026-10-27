<script setup>
/**
 * 预约 — 内嵌超星官方预约页（A15）
 *
 * 本模块与「图书馆预约」（`library_reserve`，纯原生接口逻辑）是**两套完全独立的实现**：
 * - 图书馆预约：自己实现 UI 与取数，直接调用 `reserve/item/*` 与 seatengine 接口；
 * - 预约（本模块）：把超星**官方预约页**整体搬进 App，由官方页自己完成选位、校验与提交。
 *
 * 之所以两条路都必须存在：座位的快速预约提交必须带 **cxCaptcha 行为验证 token**（需真人点击），
 * 纯接口方案已被线上证伪（见 #1078 / #1081）；而官方页是不可控 SPA，体验不如原生。
 * 因此分工是——原生承担能稳定跑通的场景，本模块承担「必须借官方页才能完成」的场景。
 *
 * 覆盖三个场景（用户明确要求全部保留）：
 * - 座位预约：官方快速预约页（`kind="live"`，有直达业务页的深链）
 * - 静音仓  ：官方入口落地页（`kind="index"`，房间类没有 live 深链）
 * - 研讨室  ：同上
 *
 * 内嵌通道本身由 `LibraryReserveEmbed` 承载，按平台自动三分支：
 * 桌面 = Rust 子 WebView / iOS = Bridge 反向代理 + iframe / 其他 = 系统浏览器降级。
 *
 * 注：本模块**不提供「我的预约」**——查看与取消留在原生模块，避免两处语义重叠。
 */
import { computed, ref } from 'vue'
import { TPageHeader } from './templates'
import LibraryReserveEmbed from './library-reserve/LibraryReserveEmbed.vue'
import { useLocale } from '../utils/app_i18n'
import { useAuthStore } from '../stores/auth'

const { t } = useLocale()
const authStore = useAuthStore()

const emit = defineEmits(['back', 'require-login'])

/** 三个 Tab 的 key（同时作为 i18n 词条后缀与状态隔离维度） */
const TABS = ['seat', 'quiet', 'room']

const activeTab = ref('seat')

/**
 * 是否已具备使用预约的在线会话。
 * 与原生模块保持完全一致的门禁：仅「在线会话已确认」才放行，
 * 不得以缓存身份代替已确认会话，否则内嵌页只会落在登录页。
 */
const canUse = computed(() => Boolean(authStore.isLoggedIn && authStore.sessionVerified))

const selectTab = (tabKey) => {
  activeTab.value = tabKey
}

const goLogin = () => emit('require-login')
</script>

<template>
  <div class="page">
    <TPageHeader :title="t('home.module.chaoxing_reserve')" icon="web_asset" @back="emit('back')" />

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
        <!-- 顶部 Tab：座位 / 静音仓 / 研讨室 -->
        <div class="tabs" role="tablist" :aria-label="t('home.module.chaoxing_reserve')">
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

        <!-- 座位：官方快速预约页（live 深链，可直接选时段并提交） -->
        <LibraryReserveEmbed v-if="activeTab === 'seat'" app="seat" kind="live" />

        <!-- 静音仓 / 研讨室：官方入口落地页（房间类无 live 深链，只给 index） -->
        <LibraryReserveEmbed v-else-if="activeTab === 'quiet'" app="quiet_room" kind="index" />
        <LibraryReserveEmbed v-else app="seminar_room" kind="index" />
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

/* 按钮（仅登录引导使用） */
.primary {
  min-height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: calc(14px * var(--ui-radius-scale));
  background: var(--ui-primary);
  color: #fff;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
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
  .guide {
    padding: 64px 24px;
  }
}
</style>
