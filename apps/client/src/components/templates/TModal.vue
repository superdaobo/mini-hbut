<template>
  <Teleport to="body">
    <Transition name="t-modal">
      <div v-if="visible" class="t-modal__overlay" @click.self="onOverlayClick">
        <div
          class="t-modal__container glass-card"
          :style="containerStyle"
          role="dialog"
          aria-modal="true"
          :aria-label="title || undefined"
        >
          <div v-if="title || closable" class="t-modal__header">
            <h3 v-if="title" class="t-modal__title">{{ title }}</h3>
            <button v-if="closable" class="t-modal__close" @click="$emit('close')" :aria-label="t('common.close')">✕</button>
          </div>
          <div class="t-modal__body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="t-modal__footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
// #785：无障碍关闭标签接入轻量多语言（title 等 props 文案由调用方批次负责）
import { useI18n } from '../../utils/app_i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '360px' },
  closable: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true }
})

// 响应式 t：语言切换后无障碍标签即时生效
const { t } = useI18n()

const emit = defineEmits(['close'])

const containerStyle = computed(() => ({ maxWidth: props.width }))

const onOverlayClick = () => {
  if (props.closeOnOverlay) emit('close')
}
</script>

<style scoped>
.t-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  /* #1064：四边安全区内边距（iOS 刘海 / Home Indicator），普通设备回落 16px。
     --app-safe-top/bottom 已在 index.css 聚合 Android inset + iOS env + 兜底。 */
  padding:
    max(16px, var(--app-safe-top, 0px)) max(16px, env(safe-area-inset-right, 0px))
    max(16px, var(--app-safe-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
}
.t-modal__container {
  width: 100%;
  max-height: 80vh;
  /* 移动端动态视口：避免 iOS 地址栏/工具栏伸缩导致弹层内容被裁切 */
  max-height: 80dvh;
  overflow-y: auto;
  /* 滚动不穿透到背后的列表，保持关闭后滚动位置 */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  border-radius: calc(20px * var(--ui-radius-scale)) !important;
}
/* #1064：二级详情必须是可感知的**前景实体**面板。
   全局 .glass-card 的 --ui-surface 由用户「透明度」设置注入（默认 0.88/0.76，恒 < 1），
   会让卡片透出底层列表；这里用独立的不透明 token，并以更高优先级
   （.t-modal__overlay .t-modal__container 特化 > html.dark .glass-card）
   覆盖 .glass-card 皮肤与夜间模式的 !important，保证浅色纯白、深色实底。 */
.t-modal__overlay .t-modal__container {
  background: var(--ui-modal-surface, #ffffff) !important;
  color: var(--ui-text);
  border: 1px solid var(--ui-modal-surface-border, rgba(148, 163, 184, 0.28)) !important;
  box-shadow: var(--ui-modal-surface-shadow, 0 24px 60px rgba(15, 23, 42, 0.28)) !important;
  /* 实底无需毛玻璃：去掉模糊既省 GPU，也避免 iOS WebView 的合成异常 */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  padding: calc(1.25rem * var(--ui-space-scale));
}
.t-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(14px * var(--ui-space-scale));
}
.t-modal__title {
  margin: 0;
  font-size: calc(17px * var(--ui-font-scale));
  font-weight: 800;
  color: var(--ui-text);
}
.t-modal__close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.14);
  color: var(--ui-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.t-modal__close:hover {
  background: rgba(239, 68, 68, 0.12);
  color: var(--ui-danger);
}
.t-modal__body {
  color: var(--ui-text);
}
.t-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-top: calc(14px * var(--ui-space-scale));
  margin-top: calc(14px * var(--ui-space-scale));
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

/* 弹窗过渡（iOS 风格：遮罩淡入 + 内容轻微回弹缩放上滑，含离场） */
.t-modal-enter-active,
.t-modal-leave-active {
  transition: opacity calc(var(--ui-duration-normal) * var(--ui-motion-scale)) var(--ui-ease-out);
}
.t-modal-enter-active .t-modal__container,
.t-modal-leave-active .t-modal__container {
  transition:
    transform calc(var(--ui-duration-normal) * var(--ui-motion-scale)) var(--ui-ease-spring),
    opacity calc(var(--ui-duration-fast) * var(--ui-motion-scale)) var(--ui-ease-out);
}
.t-modal-enter-from,
.t-modal-leave-to {
  opacity: 0;
}
.t-modal-enter-from .t-modal__container {
  transform: scale(0.94) translateY(14px);
  opacity: 0;
}
.t-modal-leave-to .t-modal__container {
  transform: scale(0.97) translateY(8px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .t-modal-enter-active,
  .t-modal-leave-active,
  .t-modal-enter-active .t-modal__container,
  .t-modal-leave-active .t-modal__container {
    transition: none;
  }
}
</style>

<style>
/* #1064：共享 TModal 的**不透明实体底** token（运行时唯一来源）。
   浅色纯白、深色 slate-800 实底，不随用户「透明度」设置变得可透；
   深色同时覆盖 html.dark（夜间模式）与 html[data-theme='graphite_night']（深色预设）。 */
:root {
  --ui-modal-surface: #ffffff;
  --ui-modal-surface-border: rgba(148, 163, 184, 0.28);
  --ui-modal-surface-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
}
html.dark,
html[data-theme='graphite_night'] {
  --ui-modal-surface: #1e293b;
  --ui-modal-surface-border: rgba(148, 163, 184, 0.24);
  --ui-modal-surface-shadow: 0 24px 60px rgba(2, 6, 23, 0.6);
}
</style>
