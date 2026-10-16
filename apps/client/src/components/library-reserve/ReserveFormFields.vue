<script setup>
/**
 * 动态预约表单渲染器（#1056）
 *
 * 纯展示组件：按归一化后的字段定义渲染控件，并把值变更回抛给父组件；
 * 校验由父组件调用 `catalog.ts` 的 `validateFormValues` 完成，本组件只负责显示错误。
 * 字段定义来自后端 `customFormConfig`（归一化见 `catalog.ts`）。
 */
import { useLocale } from '../../utils/app_i18n'
import { formatFieldErrorText } from './catalog'

const props = defineProps({
  /** 归一化后的字段定义 */
  fields: { type: Array, default: () => [] },
  /** 表单值（checkbox 为数组） */
  values: { type: Object, default: () => ({}) },
  /** 字段名 → i18n 错误 key */
  errors: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:values'])

const { t } = useLocale()

/** 单值更新：产出新对象，不直接改 props */
const setValue = (key, value) => {
  emit('update:values', { ...props.values, [key]: value })
}

/** 输入框 / 下拉变更 */
const onInput = (key, event) => {
  setValue(key, String(event?.target?.value ?? ''))
}

/** 多选切换 */
const toggleOption = (key, optionValue) => {
  const current = Array.isArray(props.values[key]) ? props.values[key] : []
  const next = current.includes(optionValue)
    ? current.filter((item) => item !== optionValue)
    : [...current, optionValue]
  setValue(key, next)
}

/** 取值字符串（用于 textarea / input 的 :value） */
const textValue = (key) => String(props.values[key] ?? '')

/**
 * 错误文案：按错误 key 选择上下限替换 {n}。
 * 修复 P1-2：交由 catalog.formatFieldErrorText 按 key 取对应限值，避免 min/max 并存时
 * 「不能大于」文案显示成下限（旧实现以 min 优先，恒取下限）。
 */
const errorText = (field) => formatFieldErrorText(field, props.errors[field.key], t)

/** 占位提示：字段自带优先，否则用通用文案 */
const placeholderOf = (field) => field.placeholder || t('library.reserve.form.placeholder')
</script>

<template>
  <div class="form">
    <div v-for="field in props.fields" :key="field.key" class="field">
      <label class="field__label" :for="`rf-${field.key}`">
        {{ field.label }}
        <span v-if="field.required" class="field__required" aria-hidden="true">*</span>
      </label>

      <textarea
        v-if="field.control === 'textarea'"
        :id="`rf-${field.key}`"
        class="field__input field__input--area"
        :class="{ invalid: props.errors[field.key] }"
        :value="textValue(field.key)"
        :placeholder="placeholderOf(field)"
        :disabled="props.disabled"
        rows="3"
        @input="onInput(field.key, $event)"
      />

      <select
        v-else-if="field.control === 'select'"
        :id="`rf-${field.key}`"
        class="field__input"
        :class="{ invalid: props.errors[field.key] }"
        :value="textValue(field.key)"
        :disabled="props.disabled"
        @change="onInput(field.key, $event)"
      >
        <option value="">{{ placeholderOf(field) }}</option>
        <option v-for="option in field.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <div
        v-else-if="field.control === 'radio'"
        class="field__options"
        role="radiogroup"
        :aria-label="field.label"
      >
        <label v-for="option in field.options" :key="option.value" class="option">
          <input
            type="radio"
            :name="`rf-${field.key}`"
            :value="option.value"
            :checked="textValue(field.key) === option.value"
            :disabled="props.disabled"
            @change="onInput(field.key, $event)"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>

      <div v-else-if="field.control === 'checkbox'" class="field__options">
        <label v-for="option in field.options" :key="option.value" class="option">
          <input
            type="checkbox"
            :value="option.value"
            :checked="Array.isArray(props.values[field.key]) && props.values[field.key].includes(option.value)"
            :disabled="props.disabled"
            @change="toggleOption(field.key, option.value)"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>

      <input
        v-else
        :id="`rf-${field.key}`"
        class="field__input"
        :class="{ invalid: props.errors[field.key] }"
        :type="field.control === 'number' ? 'number' : field.control"
        :value="textValue(field.key)"
        :placeholder="placeholderOf(field)"
        :disabled="props.disabled"
        @input="onInput(field.key, $event)"
      />

      <p v-if="errorText(field)" class="field__error">{{ errorText(field) }}</p>
    </div>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field__label {
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
}
.field__required {
  color: var(--ui-danger);
  margin-left: 2px;
}
.field__input {
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
  font-family: inherit;
}
.field__input--area {
  min-height: 76px;
  resize: vertical;
}
.field__input.invalid {
  border-color: var(--ui-danger);
}
.field__options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-text);
  cursor: pointer;
}
.field__error {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
}
</style>
