<script setup>
import { ref, computed } from 'vue'
import { TModal } from '../templates'

defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])

const mode = ref('grid') // 'grid' | 'number'
const selectedDots = ref([])
const numberInput = ref('')
const error = ref('')
const submitting = ref(false)

// 9 宫格点位（1-9）
const GRID_DOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const patternString = computed(() => {
  if (mode.value === 'number') return numberInput.value.trim()
  return selectedDots.value.join('')
})

const handleDotClick = (dot) => {
  if (selectedDots.value.includes(dot)) return
  selectedDots.value = [...selectedDots.value, dot]
}

const handleClearGrid = () => {
  selectedDots.value = []
}

const handleSubmit = () => {
  const pattern = patternString.value
  if (!pattern || pattern.length < 3) {
    error.value = '手势至少需要连接 3 个点'
    return
  }
  // 验证：仅允许 1-9 的数字组合
  if (!/^[1-9]+$/.test(pattern)) {
    error.value = '手势格式无效，仅允许 1-9 的数字'
    return
  }
  error.value = ''
  submitting.value = true
  emit('submit', pattern)
  submitting.value = false
}

const handleClose = () => {
  error.value = ''
  selectedDots.value = []
  numberInput.value = ''
  emit('close')
}
</script>

<template>
  <TModal :visible="visible" title="手势签到" width="360px" @close="handleClose">
    <div class="gesture-modal">
      <!-- 模式切换 -->
      <div class="gesture-modal__mode-switch">
        <button
          :class="['gesture-mode-btn', { 'gesture-mode-btn--active': mode === 'grid' }]"
          @click="mode = 'grid'"
        >
          九宫格
        </button>
        <button
          :class="['gesture-mode-btn', { 'gesture-mode-btn--active': mode === 'number' }]"
          @click="mode = 'number'"
        >
          数字输入
        </button>
      </div>

      <!-- 九宫格模式 -->
      <div v-if="mode === 'grid'" class="gesture-grid">
        <button
          v-for="dot in GRID_DOTS"
          :key="dot"
          :class="['gesture-dot', { 'gesture-dot--selected': selectedDots.includes(dot) }]"
          @click="handleDotClick(dot)"
        >
          <span class="gesture-dot__label">{{ dot }}</span>
          <span v-if="selectedDots.includes(dot)" class="gesture-dot__order">
            {{ selectedDots.indexOf(dot) + 1 }}
          </span>
        </button>
      </div>

      <!-- 数字输入模式 -->
      <div v-else class="gesture-number">
        <input
          v-model="numberInput"
          class="gesture-number__input"
          type="text"
          inputmode="numeric"
          placeholder="输入手势数字序列，如 14789"
          maxlength="9"
        />
        <p class="gesture-number__hint">数字 1-9 对应九宫格从左上到右下的位置</p>
      </div>

      <!-- 当前手势预览 -->
      <div v-if="patternString" class="gesture-modal__preview">
        当前手势：<strong>{{ patternString }}</strong>
      </div>

      <!-- 清除按钮（九宫格模式） -->
      <button v-if="mode === 'grid' && selectedDots.length" class="gesture-clear-btn" @click="handleClearGrid">
        清除重选
      </button>

      <p v-if="error" class="gesture-modal__error">{{ error }}</p>
    </div>

    <template #footer>
      <button class="modal-btn modal-btn--cancel" @click="handleClose">取消</button>
      <button class="modal-btn modal-btn--primary" :disabled="submitting" @click="handleSubmit">
        确认签到
      </button>
    </template>
  </TModal>
</template>

<style scoped>
.gesture-modal {
  display: flex;
  flex-direction: column;
  gap: calc(14px * var(--ui-space-scale));
}

.gesture-modal__mode-switch {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: calc(10px * var(--ui-radius-scale));
  background: rgba(148, 163, 184, 0.1);
}

.gesture-mode-btn {
  flex: 1;
  padding: 7px 12px;
  border: none;
  border-radius: calc(8px * var(--ui-radius-scale));
  background: transparent;
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.gesture-mode-btn--active {
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-soft);
}

.gesture-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  max-width: 240px;
  margin: 0 auto;
}

.gesture-dot {
  position: relative;
  width: 60px;
  height: 60px;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-radius: 50%;
  background: color-mix(in oklab, var(--ui-surface) 80%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.gesture-dot--selected {
  border-color: var(--ui-primary);
  background: color-mix(in oklab, var(--ui-primary) 12%, var(--ui-surface) 88%);
}

.gesture-dot__label {
  font-size: calc(16px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
}

.gesture-dot__order {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ui-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gesture-number__input {
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 80%, transparent);
  color: var(--ui-text);
  font-size: calc(18px * var(--ui-font-scale));
  font-weight: 700;
  text-align: center;
  letter-spacing: 4px;
  outline: none;
  transition: border-color 0.15s;
}

.gesture-number__input:focus {
  border-color: var(--ui-primary);
}

.gesture-number__hint {
  margin: 4px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
  text-align: center;
}

.gesture-modal__preview {
  text-align: center;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.gesture-modal__preview strong {
  color: var(--ui-primary);
  letter-spacing: 2px;
}

.gesture-clear-btn {
  padding: 8px;
  border: none;
  border-radius: calc(8px * var(--ui-radius-scale));
  background: rgba(148, 163, 184, 0.1);
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  cursor: pointer;
}

.gesture-modal__error {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
  text-align: center;
}

.modal-btn {
  padding: 8px 18px;
  border: none;
  border-radius: calc(10px * var(--ui-radius-scale));
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.modal-btn--cancel {
  background: rgba(148, 163, 184, 0.14);
  color: var(--ui-muted);
}

.modal-btn--primary {
  background: var(--ui-primary);
  color: #fff;
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
