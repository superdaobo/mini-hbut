<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { TModal } from '../../../components/templates'
import { useI18n } from '../../../utils/app_i18n'

export interface TeacherDetailRow {
  key: string
  label: string
  value?: string | number | null
}

const props = withDefaults(defineProps<{
  visible: boolean
  title: string
  primary: TeacherDetailRow[]
  extra?: TeacherDetailRow[]
  extraTitle?: string
}>(), { extra: () => [], extraTitle: '' })

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const nonempty = (items: TeacherDetailRow[]): TeacherDetailRow[] =>
  items.filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '')
const mainRows = computed(() => nonempty(props.primary))
const extraRows = computed(() => nonempty(props.extra))

// 与成绩页同样支持 Esc 退出详情，并保留底下列表的选中标签和滚动位置。
const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && props.visible) emit('close')
}
watch(() => props.visible, (visible) => {
  if (typeof window === 'undefined') return
  if (visible) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <TModal :visible="visible" :title="title" width="480px" @close="emit('close')">
    <section v-if="mainRows.length" class="mb-4">
      <h4 class="text-sm font-semibold text-on-surface mb-3">{{ t('teacher.detail.basic') }}</h4>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-4">
        <div v-for="row in mainRows" :key="row.key" class="min-w-0">
          <dt class="text-xs text-on-surface-variant mb-1">{{ row.label }}</dt>
          <dd class="text-sm font-medium text-on-surface break-words whitespace-pre-wrap">{{ row.value }}</dd>
        </div>
      </dl>
    </section>
    <section v-if="extraRows.length" class="pt-3 border-t border-outline-variant/30">
      <h4 class="text-sm font-semibold text-on-surface mb-3">{{ extraTitle || t('teacher.detail.more') }}</h4>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-4">
        <div v-for="row in extraRows" :key="row.key" class="min-w-0">
          <dt class="text-xs text-on-surface-variant mb-1">{{ row.label }}</dt>
          <dd class="text-sm font-medium text-on-surface break-words whitespace-pre-wrap">{{ row.value }}</dd>
        </div>
      </dl>
    </section>
    <slot />
  </TModal>
</template>
