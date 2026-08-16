<script setup lang="ts">
const emit = defineEmits<{
  about: []
  route: []
  collect: []
  activity: []
  bus: []
  mock: []
  settings: []
}>()
</script>

<template>
  <div class="campus-entrance-menu">
    <button type="button" @click="emit('about')">概况</button>
    <button type="button" @click="emit('route')">路线</button>
    <button type="button" @click="emit('collect')">收藏</button>
    <button type="button" @click="emit('activity')">活动</button>
    <button type="button" @click="emit('bus')">班车</button>
    <button type="button" @click="emit('mock')">模拟定位</button>
    <button type="button" @click="emit('settings')">设置</button>
  </div>
</template>