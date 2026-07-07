<script setup lang="ts">
import { TPageHeader } from '../../../components/templates'

defineProps<{
  title: string
  icon?: string
}>()

const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <div class="campus-guide-page">
    <TPageHeader :title="title" :icon="icon || 'map'" @back="emit('back')" />
    <div class="campus-guide-page-body">
      <slot />
    </div>
  </div>
</template>