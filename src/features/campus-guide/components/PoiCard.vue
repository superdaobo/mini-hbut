<script setup lang="ts">
import { computed } from 'vue'
import { distanceMeters, distanceUnit } from '../utils/geo'
import type { CampusSpot, GeoPoint } from '../types'

const props = defineProps<{
  spot: CampusSpot | null
  userLocation: GeoPoint
}>()

const emit = defineEmits<{
  detail: []
  navigate: []
  favorite: []
  audio: []
  close: []
}>()

const distanceText = computed(() => {
  if (!props.spot) return ''
  if (props.spot.distancer) return props.spot.distancer
  const point = props.spot.point
  if (!point) return ''
  return distanceUnit(distanceMeters(props.userLocation, point))
})
</script>

<template>
  <section v-if="spot" class="campus-poi-card">
    <button class="campus-poi-close" type="button" aria-label="关闭" @click="emit('close')">×</button>
    <div class="campus-poi-head">
      <h3>{{ spot.name }}</h3>
      <span>{{ distanceText || '距离计算中' }}</span>
    </div>
    <p v-if="spot.introduction || spot.info" class="campus-poi-desc">
      {{ spot.introduction || spot.info }}
    </p>
    <div class="campus-poi-actions">
      <button type="button" @click="emit('detail')">详情</button>
      <button type="button" @click="emit('audio')">讲解</button>
      <button type="button" @click="emit('favorite')">{{ spot.is_saved ? '已收藏' : '收藏' }}</button>
      <button type="button" class="primary" @click="emit('navigate')">导航</button>
    </div>
  </section>
</template>