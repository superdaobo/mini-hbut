<script setup>
import { toastState } from '../utils/toast'
</script>

<template>
  <Transition name="toast-fade">
    <div v-if="toastState.show" class="toast-container" :class="toastState.type">
      <div class="toast-content">
        {{ toastState.message }}
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 10px 20px;
  border-radius: 25px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  backdrop-filter: blur(10px);
}

.toast-container.info {
  background: rgba(30, 41, 59, 0.82);
  color: white;
}

.toast-container.success {
  background: rgba(16, 185, 129, 0.9);
  color: white;
}

.toast-container.warning {
  background: rgba(245, 158, 11, 0.9);
  color: white;
}

.toast-container.error {
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
