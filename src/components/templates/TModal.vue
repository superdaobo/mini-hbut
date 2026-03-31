<template>
  <Teleport to="body">
    <Transition name="t-modal">
      <div v-if="visible" class="t-modal__overlay" @click.self="onOverlayClick">
        <div class="t-modal__container glass-card" :style="containerStyle">
          <div v-if="title || closable" class="t-modal__header">
            <h3 v-if="title" class="t-modal__title">{{ title }}</h3>
            <button v-if="closable" class="t-modal__close" @click="$emit('close')" aria-label="关闭">✕</button>
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

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '360px' },
  closable: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true }
})

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
  padding: 16px;
}
.t-modal__container {
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  border-radius: calc(20px * var(--ui-radius-scale)) !important;
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

.t-modal-enter-active,
.t-modal-leave-active {
  transition: opacity calc(0.2s * var(--ui-motion-scale)) ease;
}
.t-modal-enter-active .t-modal__container,
.t-modal-leave-active .t-modal__container {
  transition: transform calc(0.2s * var(--ui-motion-scale)) ease;
}
.t-modal-enter-from,
.t-modal-leave-to {
  opacity: 0;
}
.t-modal-enter-from .t-modal__container {
  transform: scale(0.92) translateY(12px);
}
.t-modal-leave-to .t-modal__container {
  transform: scale(0.95) translateY(6px);
}
</style>
