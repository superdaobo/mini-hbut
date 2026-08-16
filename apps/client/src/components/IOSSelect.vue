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
.ios26-select,
.ios26-select-overlay {
  position: relative;
  --ios-select-accent: var(--ui-primary, #2563eb);
  --ios-select-accent-2: var(--ui-secondary, #06b6d4);
  --ios-select-text: var(--ui-text, #0f172a);
  --ios-select-muted: var(--ui-muted, #475569);
  --ios-select-border: color-mix(in oklab, var(--ios-select-accent) 22%, rgba(148, 163, 184, 0.42));
  --ios-select-trigger-bg: #ffffff;
  --ios-select-panel: #ffffff;
  --ios-select-item: #f8fafc;
  --ios-select-active: var(--ios-select-accent);
  --ios-select-active-text: #ffffff;
  --ios-select-safe-bottom: env(safe-area-inset-bottom, 0px);
  --ios-select-shadow: 0 9px 21px rgba(15, 23, 42, 0.08);
}

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
  border: 1px solid var(--ios-select-border);
  background: var(--ios-select-trigger-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.86),
    0 4px 9px rgba(15, 23, 42, 0.04);
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
    0 2px 6px rgba(15, 23, 42, 0.04);
}

.ios26-select-text {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 15px;
  font-weight: 700;
  color: var(--ios-select-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0;
}

.ios26-select-text.placeholder {
  color: color-mix(in oklab, var(--ios-select-muted) 82%, #ffffff 18%);
}

.ios26-select-arrow {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in oklab, var(--ios-select-accent) 72%, var(--ios-select-text) 28%);
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
  background: rgba(15, 23, 42, 0.32);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
  backdrop-filter: blur(14px) saturate(1.12);
  -webkit-backdrop-filter: blur(14px) saturate(1.12);
}

.ios26-select-sheet {
  width: min(540px, 100%);
  max-height: min(78vh, 560px);
  margin: 0 auto;
  border-radius: 24px;
  border: 1px solid color-mix(in oklab, var(--ios-select-accent) 18%, rgba(148, 163, 184, 0.36));
  background: var(--ios-select-panel);
  box-shadow:
    var(--ios-select-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
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
  background: color-mix(in oklab, var(--ios-select-muted) 30%, #ffffff 70%);
}

.ios26-select-title {
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  color: color-mix(in oklab, var(--ios-select-muted) 86%, #ffffff 14%);
  padding: 6px 18px 10px;
  flex-shrink: 0;
}

.ios26-select-list {
  flex: 1;
  overflow-y: auto;
  padding: 2px 10px 10px;
  background: var(--ios-select-panel);
}

.ios26-select-item {
  width: 100%;
  border: 1px solid color-mix(in oklab, var(--ios-select-accent) 12%, rgba(148, 163, 184, 0.22));
  background: var(--ios-select-item);
  min-height: 48px;
  padding: 0 14px 0 16px;
  border-radius: 14px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--ios-select-text);
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.ios26-select-item:not(.is-disabled):active {
  transform: scale(0.995);
  background: #f1f5f9;
}

.ios26-select-item.is-active {
  border-color: color-mix(in oklab, var(--ios-select-accent) 42%, rgba(148, 163, 184, 0.28));
  background: var(--ios-select-active);
  box-shadow: 0 5px 10px color-mix(in oklab, var(--ios-select-accent) 10%, transparent);
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
  color: var(--ios-select-text);
}

.ios26-select-item-check {
  opacity: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--ios-select-active-text);
  margin-left: 10px;
}

.ios26-select-item.is-active .ios26-select-item-check {
  opacity: 1;
}

.ios26-select-item.is-active .ios26-select-item-label {
  color: var(--ios-select-active-text);
}

.ios26-select-cancel {
  width: 100%;
  border: none;
  border-top: 1px solid color-mix(in oklab, var(--ios-select-accent) 18%, rgba(148, 163, 184, 0.28));
  min-height: 52px;
  background: var(--ios-select-panel);
  color: var(--ios-select-accent);
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.ios26-select-cancel:active {
  background-color: color-mix(in oklab, #ffffff 78%, var(--ios-select-accent) 22%);
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

:global(html[data-theme='graphite_night']) .ios26-select,
:global(html[data-theme='graphite_night']) .ios26-select-overlay,
:global(html.dark) .ios26-select,
:global(html.dark) .ios26-select-overlay {
  --ios-select-accent: #60a5fa;
  --ios-select-accent-2: #22d3ee;
  --ios-select-text: #e2e8f0;
  --ios-select-muted: #94a3b8;
  --ios-select-border: color-mix(in oklab, var(--ios-select-accent) 28%, rgba(148, 163, 184, 0.34));
  --ios-select-trigger-bg: #111827;
  --ios-select-panel: #0f172a;
  --ios-select-item: #1e293b;
  --ios-select-active: #2563eb;
  --ios-select-shadow: 0 13px 29px rgba(2, 6, 23, 0.29);
}

@media (prefers-color-scheme: dark) {
  :global(.ios26-select),
  :global(.ios26-select-overlay) {
    --ios-select-accent: #60a5fa;
    --ios-select-accent-2: #22d3ee;
    --ios-select-text: #e2e8f0;
    --ios-select-muted: #94a3b8;
    --ios-select-border: color-mix(in oklab, var(--ios-select-accent) 28%, rgba(148, 163, 184, 0.34));
    --ios-select-trigger-bg: #111827;
    --ios-select-panel: #0f172a;
    --ios-select-item: #1e293b;
    --ios-select-active: #2563eb;
    --ios-select-shadow: 0 13px 29px rgba(2, 6, 23, 0.29);
  }
}

:global(html.dark) .ios26-select-trigger,
:global(html[data-theme='graphite_night']) .ios26-select-trigger {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 5px 12px rgba(2, 6, 23, 0.14) !important;
}

:global(html.dark) .ios26-select-overlay,
:global(html[data-theme='graphite_night']) .ios26-select-overlay {
  background: rgba(2, 6, 23, 0.58) !important;
}

:global(html.dark) .ios26-select-sheet,
:global(html[data-theme='graphite_night']) .ios26-select-sheet,
:global(html.dark) .ios26-select-item,
:global(html[data-theme='graphite_night']) .ios26-select-item {
  box-shadow:
    var(--ios-select-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
}

@media (min-width: 769px) {
  .ios26-select-overlay {
    align-items: center;
    padding: 20px;
  }

  .ios26-select-sheet {
    border-radius: 20px;
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
    border-radius: 24px 24px 18px 18px;
    max-height: min(74vh, 580px);
  }

  .ios26-select-item-label {
    font-size: 15px;
  }

  .ios26-select-overlay {
    padding: 10px 10px calc(12px + var(--ios-select-safe-bottom));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ios26-select-trigger,
  .ios26-select-item,
  .ios26-select-cancel,
  .ios26-select-fade-enter-active,
  .ios26-select-fade-leave-active {
    transition: none !important;
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
