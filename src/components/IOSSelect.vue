<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  modelValue: {
    type: [String, Number, Boolean],
    default: ''
  },
  modelModifiers: {
    type: Object,
    default: () => ({})
  },
  placeholder: {
    type: String,
    default: '请选择'
  },
  title: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const nativeSelectRef = ref(null)
const open = ref(false)
const optionList = ref([])
let lastBodyOverflow = ''
let optionObserver = null

const asComparableValue = (value) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const parseOutgoingValue = (value) => {
  if (props.modelModifiers?.number) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return value
}

const isSameOptionList = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (!x || !y) return false
    if (x.value !== y.value) return false
    if (x.label !== y.label) return false
    if (x.disabled !== y.disabled) return false
  }
  return true
}

const refreshOptionsFromNative = () => {
  const el = nativeSelectRef.value
  if (!el) {
    if (optionList.value.length) optionList.value = []
    return
  }
  const nextList = Array.from(el.options || []).map((option, idx) => ({
    key: `${idx}:${option.value}:${option.textContent || ''}`,
    value: option.value,
    label: String(option.textContent || '').trim(),
    disabled: !!option.disabled
  }))
  if (!isSameOptionList(optionList.value, nextList)) {
    optionList.value = nextList
  }
}

const selectedOption = computed(() => {
  const target = asComparableValue(props.modelValue)
  return optionList.value.find((option) => asComparableValue(option.value) === target) || null
})

const selectedLabel = computed(() => selectedOption.value?.label || props.placeholder)

const syncNativeSelectValue = () => {
  const el = nativeSelectRef.value
  if (!el) return
  const target = asComparableValue(props.modelValue)
  if (el.value !== target) {
    el.value = target
  }
}

const emitChangeEvent = (value) => {
  emit('change', { target: { value }, detail: { value } })
}

const closePicker = () => {
  open.value = false
}

const openPicker = async () => {
  if (props.disabled) return
  await nextTick()
  refreshOptionsFromNative()
  if (!optionList.value.length) return
  open.value = true
}

const selectOption = (option) => {
  if (!option || option.disabled) return
  const value = parseOutgoingValue(option.value)
  emit('update:modelValue', value)
  emitChangeEvent(value)
  closePicker()
}

const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    closePicker()
  }
}

const disconnectOptionObserver = () => {
  if (optionObserver) {
    optionObserver.disconnect()
    optionObserver = null
  }
}

const connectOptionObserver = () => {
  disconnectOptionObserver()
  const el = nativeSelectRef.value
  if (!el || typeof MutationObserver === 'undefined') return
  optionObserver = new MutationObserver(() => {
    refreshOptionsFromNative()
    syncNativeSelectValue()
  })
  optionObserver.observe(el, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  })
}

watch(
  () => props.modelValue,
  async () => {
    await nextTick()
    syncNativeSelectValue()
    refreshOptionsFromNative()
  },
  { immediate: true }
)

watch(open, (value) => {
  if (typeof document === 'undefined') return
  if (value) {
    lastBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeydown)
    return
  }
  document.body.style.overflow = lastBodyOverflow || ''
  window.removeEventListener('keydown', handleKeydown)
})

onMounted(async () => {
  await nextTick()
  refreshOptionsFromNative()
  syncNativeSelectValue()
  connectOptionObserver()
})

watch(
  () => nativeSelectRef.value,
  async () => {
    await nextTick()
    refreshOptionsFromNative()
    syncNativeSelectValue()
    connectOptionObserver()
  }
)

onBeforeUnmount(() => {
  closePicker()
  disconnectOptionObserver()
  if (typeof document !== 'undefined') {
    document.body.style.overflow = lastBodyOverflow || ''
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <div class="ios26-select" :class="{ 'is-disabled': disabled }">
    <!-- 保留隐藏原生 select 仅用于承载 option 列表和动态内容，不参与交互。 -->
    <select
      ref="nativeSelectRef"
      class="ios26-select-native"
      :value="asComparableValue(modelValue)"
      :disabled="disabled"
      tabindex="-1"
      aria-hidden="true"
    >
      <slot />
    </select>

    <button
      type="button"
      class="ios26-select-trigger"
      :disabled="disabled"
      @click="openPicker"
    >
      <span
        class="ios26-select-text"
        :class="{ placeholder: !selectedOption }"
      >
        {{ selectedLabel }}
      </span>
      <span class="ios26-select-arrow" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="M5 7.5L10 12.5L15 7.5" />
        </svg>
      </span>
    </button>
  </div>

  <teleport to="body">
    <transition name="ios26-select-fade">
      <div
        v-if="open"
        class="ios26-select-overlay"
        @click.self="closePicker"
      >
        <div class="ios26-select-sheet" role="dialog" aria-modal="true">
          <div class="ios26-select-handle" />
          <div class="ios26-select-title">{{ title || '选择选项' }}</div>
          <div class="ios26-select-list">
            <button
              v-for="option in optionList"
              :key="option.key"
              type="button"
              class="ios26-select-item"
              :class="{
                'is-active': asComparableValue(option.value) === asComparableValue(modelValue),
                'is-disabled': option.disabled
              }"
              :disabled="option.disabled"
              @click="selectOption(option)"
            >
              <span class="ios26-select-item-label">{{ option.label || '未命名选项' }}</span>
              <span class="ios26-select-item-check" aria-hidden="true">✓</span>
            </button>
          </div>
          <button type="button" class="ios26-select-cancel" @click="closePicker">取消</button>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.ios26-select {
  position: relative;
  width: 100%;
  min-width: 0;
}

.ios26-select-native {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  user-select: none;
}

.ios26-select-trigger {
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(248, 250, 252, 0.92);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #2563eb) 24%, rgba(148, 163, 184, 0.45));
  background: linear-gradient(
    160deg,
    color-mix(in oklab, #ffffff 88%, var(--ui-primary, #2563eb) 12%),
    color-mix(in oklab, #f8fafc 84%, var(--ui-secondary, #06b6d4) 16%)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 8px 20px color-mix(in oklab, var(--ui-primary, #2563eb) 12%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.22s ease;
}

.ios26-select-trigger:active {
  transform: translateY(1px) scale(0.997);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 4px 12px color-mix(in oklab, var(--ui-primary, #2563eb) 14%, transparent);
}

.ios26-select-text {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 15px;
  font-weight: 700;
  color: color-mix(in oklab, var(--ui-text, #0f172a) 94%, #ffffff 6%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.15px;
}

.ios26-select-text.placeholder {
  color: color-mix(in oklab, var(--ui-muted, #475569) 84%, #ffffff 16%);
}

.ios26-select-arrow {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in oklab, var(--ui-primary, #2563eb) 60%, var(--ui-text, #0f172a) 40%);
  flex-shrink: 0;
}

.ios26-select-arrow svg {
  width: 12px;
  height: 12px;
}

.ios26-select-arrow path {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ios26-select.is-disabled .ios26-select-trigger,
.ios26-select-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
}

.ios26-select-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 15, 28, 0.34);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.ios26-select-sheet {
  width: min(540px, 100%);
  max-height: min(78vh, 560px);
  margin: 0 auto;
  border-radius: 22px 22px 16px 16px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid color-mix(in oklab, var(--ui-primary, #2563eb) 16%, rgba(148, 163, 184, 0.38));
  background: linear-gradient(
    165deg,
    color-mix(in oklab, #ffffff 92%, var(--ui-primary, #2563eb) 8%),
    color-mix(in oklab, #f8fafc 86%, var(--ui-secondary, #06b6d4) 14%)
  );
  box-shadow:
    0 22px 52px rgba(8, 15, 28, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: translateY(0);
}

.ios26-select-handle {
  display: block;
  width: 38px;
  height: 4px;
  border-radius: 999px;
  margin: 10px auto 4px;
  background: color-mix(in oklab, var(--ui-muted, #64748b) 36%, #ffffff 64%);
}

.ios26-select-title {
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.25px;
  color: color-mix(in oklab, var(--ui-muted, #475569) 86%, #ffffff 14%);
  padding: 6px 18px 10px;
  flex-shrink: 0;
}

.ios26-select-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 10px;
  background: transparent;
}

.ios26-select-item {
  width: 100%;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.92);
  background: color-mix(in oklab, #ffffff 92%, var(--ui-primary, #2563eb) 8%);
  min-height: 46px;
  padding: 0 14px;
  border-radius: 12px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--ui-text, #0f172a);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.ios26-select-item:not(.is-disabled):active {
  transform: scale(0.995);
  background: color-mix(in oklab, #ffffff 78%, var(--ui-primary, #2563eb) 22%);
}

.ios26-select-item.is-active {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(237, 248, 255, 0.94);
  border-color: color-mix(in oklab, var(--ui-primary, #2563eb) 34%, rgba(148, 163, 184, 0.4));
  background: linear-gradient(
    160deg,
    color-mix(in oklab, #ffffff 80%, var(--ui-primary, #2563eb) 20%),
    color-mix(in oklab, #f1f5f9 68%, var(--ui-secondary, #06b6d4) 32%)
  );
  box-shadow: 0 8px 16px color-mix(in oklab, var(--ui-primary, #2563eb) 16%, transparent);
}

.ios26-select-item.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ios26-select-item-label {
  text-align: left;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--ui-text, #0f172a);
}

.ios26-select-item-check {
  opacity: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-primary, #2563eb);
  margin-left: 10px;
}

.ios26-select-item.is-active .ios26-select-item-check {
  opacity: 1;
}

.ios26-select-cancel {
  width: 100%;
  border: none;
  border-top: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 0.92);
  border-top: 1px solid color-mix(in oklab, var(--ui-primary, #2563eb) 20%, rgba(148, 163, 184, 0.34));
  min-height: 52px;
  background: color-mix(in oklab, #ffffff 88%, var(--ui-primary, #2563eb) 12%);
  color: var(--ui-primary, #2563eb);
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.ios26-select-cancel:active {
  background-color: color-mix(in oklab, #ffffff 76%, var(--ui-primary, #2563eb) 24%);
  transform: scale(0.996);
}

.ios26-select-fade-enter-active,
.ios26-select-fade-leave-active {
  transition: opacity 0.18s ease;
}

.ios26-select-fade-enter-from,
.ios26-select-fade-leave-to {
  opacity: 0;
}

@media (min-width: 769px) {
  .ios26-select-overlay {
    align-items: center;
    padding: 20px;
  }

  .ios26-select-sheet {
    border-radius: 18px;
    width: min(460px, 90%);
    max-height: min(72vh, 560px);
  }

  .ios26-select-handle {
    display: none;
  }
}

@media (max-width: 768px) {
  .ios26-select-trigger {
    min-height: 42px;
    border-radius: 13px;
  }

  .ios26-select-text {
    font-size: 15px;
  }

  .ios26-select-sheet {
    width: min(100%, 520px);
    border-radius: 22px 22px 14px 14px;
    max-height: min(74vh, 580px);
  }

  .ios26-select-item-label {
    font-size: 15px;
  }

  .ios26-select-overlay {
    padding: 10px 10px calc(12px + env(safe-area-inset-bottom));
  }
}

:global(html.window-resizing) .ios26-select-trigger,
:global(html.window-resizing) .ios26-select-overlay,
:global(html.window-resizing) .ios26-select-sheet {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  transition: none !important;
}
</style>
