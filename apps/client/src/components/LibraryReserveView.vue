<script setup>
/**
 * 图书馆预约 — 单页 Tab 框架（#1055 / #1056 / #1057）
 *
 * 四个 Tab：座位预约 / 静音仓 / 研讨室 / 我的预约。
 * - #1056 已接入静音仓与研讨室的完整预约流程（资源列表 → 选时段 → 填表 → 提交）
 *   以及「我的预约」列表与取消，见 ./library-reserve/ 下的子组件；
 * - #1057 已接入座位预约（seatengine 接口体系）的**查询**面板，见 ReserveSeatPanel.vue。
 *
 * 各 Tab 的数据加载 / 错误态 / 空态由各自面板负责（面板挂载即拉取），
 * 本组件只做「会话门禁 + Tab 切换」，不再持有 Tab 级 loading / error 状态。
 *
 * 未登录（在线会话未确认）时展示明确引导并可直接跳转登录，避免出现空白或死入口。
 * 与 LibraryView.vue（馆藏检索 OPAC）无关，二者是相互独立的视图。
 */
import { computed, ref } from 'vue'
import { TPageHeader } from './templates'
import ReserveSeatPanel from './library-reserve/ReserveSeatPanel.vue'
import ReserveRoomPanel from './library-reserve/ReserveRoomPanel.vue'
import ReserveMinePanel from './library-reserve/ReserveMinePanel.vue'
import { useLocale } from '../utils/app_i18n'
import { useAuthStore } from '../stores/auth'

const { t } = useLocale()
const authStore = useAuthStore()

const emit = defineEmits(['back', 'require-login', 'open-official'])

/** 四个 Tab 的 key（同时作为 i18n 词条后缀与状态隔离维度） */
const TABS = ['seat', 'quiet', 'room', 'mine']

const activeTab = ref('seat')

/**
 * 是否已具备使用预约的在线会话。
 * 仅「在线会话已确认」才放行（契约 D：不得以缓存身份代替已确认会话），
 * 否则一律走登录引导，保证不出现点了没反应的死入口。
 */
const canUse = computed(() => Boolean(authStore.isLoggedIn && authStore.sessionVerified))

const selectTab = (tabKey) => {
  activeTab.value = tabKey
}

const goLogin = () => emit('require-login')
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

        <!-- 座位预约：seatengine 查询面板（#1057）；A15 起官方页提交已移至「预约」模块 -->
        <ReserveSeatPanel v-if="activeTab === 'seat'" @open-official="emit('open-official')" />

        <!-- 静音仓 / 研讨室：完整预约流程（#1056），同一面板按 app 复用 -->
        <ReserveRoomPanel v-else-if="activeTab === 'quiet'" key="quiet" app="quiet_room" />
        <ReserveRoomPanel v-else-if="activeTab === 'room'" key="room" app="seminar_room" />

        <!-- 我的预约（静音仓 / 研讨室，合并展示 + 取消；#1056） -->
        <ReserveMinePanel v-else />
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
