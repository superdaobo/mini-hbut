<script setup>
/**
 * 「更多」页游乐场快捷入口（#910，Worker E 提供，Integration 负责挂载到 MoreView.vue）。
 *
 * 目标：让用户在「更多」页明显发现 **积分中心 / 总排行榜 / 漂流瓶 / 全部游戏** 四个入口。
 *
 * 关键决策：
 * 1. 可见性判定全部收敛在 `utils/game_center/quick_entries.ts`（双层闸门：flag + capability），
 *    组件只渲染与派发，不自行解释开关，避免判据多处漂移；
 * 2. `flags` 必需（MoreView 已有 `resolveEffectiveGameCenterFlags` 结果）；缺省 = fail closed
 *    整块不渲染（宁可没有入口，也不显示一个点了必然失败的按钮）；
 * 3. 点击只登记一次性 Tab 意图 + `emit('open')`，**不复制导航状态机**：
 *    Integration 让 MoreView 复用既有 `openGameCenter` 即可（`navigate('game_center')`）；
 * 4. 经典 11 个游戏入口与旧版路径零影响：本组件不触碰 MoreView 的模块宫格链路。
 */
import { computed } from 'vue'
import { useI18n } from '../../utils/app_i18n'
import {
  listVisibleGameCenterQuickEntries,
  requestGameCenterTabForEntry
} from '../../utils/game_center/quick_entries'

const props = defineProps({
  /** 生效 flags（resolveEffectiveGameCenterFlags 的结果）；缺省 = 未就绪，整块隐藏 */
  flags: { type: Object, default: null },
  /** 可选 `/meta.capabilities`；未提供时只按 flag 判定（点击后由 GameCenterView 兜底） */
  capabilities: { type: Object, default: null }
})

const emit = defineEmits(['open'])

const { t } = useI18n()

const entries = computed(() =>
  listVisibleGameCenterQuickEntries({
    flags: props.flags,
    capabilities: props.capabilities
  })
)

const handleOpen = (entry) => {
  // 登记失败（未知 Tab）不导航，避免把用户带到一个无法落位的页面
  if (!requestGameCenterTabForEntry(entry.id)) return
  emit('open', entry.id)
}
</script>

<template>
  <section v-if="entries.length" class="gc-quick" data-section="game-center-quick-entries">
    <p class="gc-quick__title">{{ t('more.quickEntries.title') }}</p>
    <div class="gc-quick__grid">
      <button
        v-for="entry in entries"
        :key="entry.id"
        class="gc-quick__card"
        type="button"
        :data-entry-id="entry.id"
        @click="handleOpen(entry)"
      >
        <span class="gc-quick__icon" aria-hidden="true">{{ entry.icon }}</span>
        <span class="gc-quick__body">
          <strong class="gc-quick__name">{{ t(entry.titleKey) }}</strong>
          <span class="gc-quick__desc">{{ t(entry.descKey) }}</span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.gc-quick {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gc-quick__title {
  margin: 0;
  padding: 0 4px;
  font-size: calc(13px * var(--ui-font-scale, 1));
  font-weight: 700;
  color: var(--ui-text, #1f2937);
}

.gc-quick__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.gc-quick__card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
  text-align: left;
  cursor: pointer;
}

.gc-quick__card:active {
  transform: scale(0.98);
}

.gc-quick__icon {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: rgba(59, 130, 246, 0.12);
}

.gc-quick__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gc-quick__name {
  font-size: calc(13px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-quick__desc {
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
