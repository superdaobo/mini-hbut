<script setup lang="ts">
import { computed, provide, readonly, toRef } from 'vue'

const props = defineProps<{
  view: string
  studentId: string
  loggedIn: boolean
}>()

const shellContext = {
  view: readonly(toRef(props, 'view')),
  studentId: readonly(toRef(props, 'studentId')),
  loggedIn: computed(() => props.loggedIn)
}

provide('mini-hbut-app-shell', shellContext)
</script>

<template>
  <slot />
</template>
