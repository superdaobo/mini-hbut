<script setup lang="ts">
import type { ScenicNotice } from '../types'

defineProps<{
  notice: ScenicNotice | null
}>()

const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button v-if="notice?.title" class="campus-notice-bar" type="button" @click="emit('open')">
    <span class="campus-notice-tag">公告</span>
    <span class="campus-notice-text">{{ notice.title }}</span>
  </button>
</template>