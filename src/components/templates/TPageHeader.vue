<template>
  <header class="sticky top-0 z-50 bg-surface/90 backdrop-blur-md px-4 h-14 flex items-center justify-between">
    <button v-if="showBack" @click="$emit('back')" class="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container-highest transition-colors text-on-surface">
      <span class="material-symbols-outlined">arrow_back_ios_new</span>
    </button>
    <span v-else class="w-10 h-10" aria-hidden="true"></span>
    <h1 class="font-bold text-lg text-on-surface flex items-center gap-2">
      <span v-if="icon && isMaterialIcon" class="material-symbols-outlined text-primary">{{ icon }}</span>
      <span v-else-if="icon">{{ icon }}</span>
      <span>{{ title }}</span>
    </h1>
    <div v-if="!$slots.actions" class="w-10 h-10"></div>
    <div v-else class="flex items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  showBack: { type: Boolean, default: true }
})
defineEmits(['back'])

// Material symbol names are ASCII-only (e.g. "edit_document", "emoji_events")
// Emojis contain non-ASCII characters
const isMaterialIcon = computed(() => {
  if (!props.icon) return false
  return /^[a-z0-9_]+$/.test(props.icon)
})
</script>
