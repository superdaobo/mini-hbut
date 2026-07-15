<script setup>
import { ref, onMounted } from 'vue'
import {
  DEMO_MODE_BANNER_EN,
  DEMO_MODE_BANNER_ZH
} from '../config/app_store_policy'
import { isTestAccountSession } from '../utils/test_account.js'

const DISMISS_KEY = 'hbu_demo_banner_dismissed'

const visible = ref(false)

const emit = defineEmits(['dismiss'])

onMounted(() => {
  if (!isTestAccountSession()) {
    visible.value = false
    return
  }
  try {
    visible.value = localStorage.getItem(DISMISS_KEY) !== '1'
  } catch {
    visible.value = true
  }
})

const dismiss = () => {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
  visible.value = false
  emit('dismiss')
}

defineExpose({
  showAgain() {
    try {
      localStorage.removeItem(DISMISS_KEY)
    } catch {
      /* ignore */
    }
    if (isTestAccountSession()) visible.value = true
  }
})
</script>

<template>
  <div v-if="visible" class="demo-mode-banner" role="status">
    <div class="demo-mode-banner__text">
      <strong>演示模式</strong>
      <span>{{ DEMO_MODE_BANNER_ZH }}</span>
      <span class="demo-mode-banner__en">{{ DEMO_MODE_BANNER_EN }}</span>
    </div>
    <button type="button" class="demo-mode-banner__close" aria-label="关闭" @click="dismiss">
      ×
    </button>
  </div>
</template>

<style scoped>
.demo-mode-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 8px 12px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, #fef3c7 88%, #fff 12%);
  border: 1px solid color-mix(in oklab, #f59e0b 35%, transparent);
  color: #78350f;
  font-size: 12px;
  line-height: 1.45;
  z-index: 20;
}
.demo-mode-banner__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.demo-mode-banner__en {
  opacity: 0.85;
  font-size: 11px;
}
.demo-mode-banner__close {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  padding: 0 4px;
}
</style>
