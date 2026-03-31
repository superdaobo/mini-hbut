<template>
  <header class="t-page-header view-header">
    <button v-if="showBack" class="back-btn" @click="$emit('back')">← 返回</button>
    <span v-else class="header-spacer" aria-hidden="true"></span>
    <h1>
      <span v-if="icon">{{ icon }}</span>
      <span>{{ title }}</span>
    </h1>
    <span v-if="!$slots.actions" class="header-spacer" aria-hidden="true"></span>
    <div v-else class="header-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  showBack: { type: Boolean, default: true }
})
defineEmits(['back'])
</script>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
