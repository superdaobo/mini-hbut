<script setup lang="ts">
import { ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { readMockLocation, resolveCampusLocation, writeMockLocation } from '../services/location-service'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const lat = ref(String(readMockLocation()?.latitude ?? store.userLocation.latitude))
const lng = ref(String(readMockLocation()?.longitude ?? store.userLocation.longitude))

const applyMock = async () => {
  const latitude = Number(lat.value)
  const longitude = Number(lng.value)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showToast('请输入有效坐标', 'warning', 1800)
    return
  }
  writeMockLocation({ latitude, longitude, name: '模拟定位' })
  await store.refreshLocation()
  showToast('模拟定位已应用', 'success', 1500)
}

const clearMock = async () => {
  writeMockLocation(null)
  await store.refreshLocation()
  const point = await resolveCampusLocation()
  lat.value = String(point.latitude)
  lng.value = String(point.longitude)
  showToast('已恢复真实定位', 'success', 1500)
}
</script>

<template>
  <GuidePageLayout title="模拟定位" icon="my_location" @back="emit('back')">
    <label class="campus-guide-field">
      <span>纬度 latitude</span>
      <input v-model="lat" class="campus-guide-input" />
    </label>
    <label class="campus-guide-field">
      <span>经度 longitude</span>
      <input v-model="lng" class="campus-guide-input" />
    </label>
    <div class="campus-guide-action-row">
      <button type="button" class="primary" @click="applyMock">应用模拟定位</button>
      <button type="button" @click="clearMock">清除</button>
    </div>
  </GuidePageLayout>
</template>