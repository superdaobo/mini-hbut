<template>
  <div class="t-collapse" :class="`t-collapse--${tone}`">
    <button type="button" class="t-collapse__toggle" :aria-expanded="open" @click="open = !open">
      <strong class="t-collapse__title">{{ title }}</strong>
      <span class="material-symbols-outlined t-collapse__icon" aria-hidden="true">
        {{ open ? 'expand_less' : 'expand_more' }}
      </span>
    </button>
    <div v-if="open" class="t-collapse__body">
      <slot />
    </div>
  </div>
</template>

<script setup>
/**
 * 通用折叠区块（#1082 图书馆预约界面文字精简）。
 *
 * 原型取自 `library-reserve/ReserveRoomPanel.vue` 的「预约须知」手写折叠块
 * （`.notice__toggle` + `aria-expanded` + `expand_more` / `expand_less`），
 * 抽为模板组件供各页面复用，视觉继续走 `--ui-*` token，不引入新的色值 / 字号体系。
 *
 * 用法：`<TCollapse :title="t('...')">正文</TCollapse>`
 * - `title`：**折叠标题即区块标题**（收起态也要能看懂这里是什么）；
 * - `defaultOpen`：默认展开；说明 / 规则类默认收起，风险类（违约、锁定）**不要**折叠；
 * - `tone`：`danger` 仅把标题改成告警色，正文样式仍由调用方决定。
 */
import { ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  defaultOpen: { type: Boolean, default: false },
  tone: { type: String, default: 'default' }
})

/** 展开态（组件内自持；调用方只需给标题与正文） */
const open = ref(props.defaultOpen)
</script>

<style scoped>
.t-collapse {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.t-collapse__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.t-collapse__title {
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-text);
  text-align: left;
}
.t-collapse--danger .t-collapse__title {
  color: var(--ui-danger);
}
.t-collapse__icon {
  flex: 0 0 auto;
  font-size: 20px;
  color: var(--ui-muted);
}
.t-collapse__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
