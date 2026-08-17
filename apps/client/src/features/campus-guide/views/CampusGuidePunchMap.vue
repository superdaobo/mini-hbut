<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { TPageHeader } from '../../../components/templates'
import { showToast } from '../../../utils/toast'
import { CampusMapCore } from '../map/campus-map-core'
import { canCheckInCard, checkInPunchCard, loadPunchCards } from '../services/punch-service'
import { useCampusGuideStore } from '../store/campus-guide-store'
import type { CampusSpot } from '../types'
import type { PunchCard } from '../types/phase2'
import { distanceUnit, distanceMeters } from '../utils/geo'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const mapContainerRef = ref<HTMLElement | null>(null)
const mapCore = ref<CampusMapCore | null>(null)
const cards = ref<PunchCard[]>([])
const selected = ref<PunchCard | null>(null)
const checking = ref(false)
const loading = ref(true)

const selectedDistance = computed(() => {
  if (!selected.value?.point) return ''
  return distanceUnit(distanceMeters(store.userLocation, selected.value.point))
})

const refreshCards = async () => {
  const result = await loadPunchCards()
  cards.value = result.card_list
  return result
}

const toSpotLike = (card: PunchCard): CampusSpot => ({
  spot_id: card.card_id,
  name: card.name,
  point: card.point,
  latitude: card.latitude,
  longitude: card.longitude,
  introduction: card.info,
  is_saved: card.is_check
})

const initMap = async () => {
  await nextTick()
  const container = mapContainerRef.value
  if (!container || mapCore.value) return
  const core = new CampusMapCore(container, {
    center: store.mapCenter,
    aoiRings: store.scenic?.aoi || [],
    onMarkerClick: (spot) => {
      const card = cards.value.find((item) => String(item.card_id) === String(spot.spot_id))
      if (card) selected.value = card
    }
  })
  await core.init()
  core.renderLocation(store.userLocation)
  mapCore.value = core
  requestAnimationFrame(() => mapCore.value?.resize())
}

const syncMarkers = () => {
  if (!mapCore.value) return
  const spots = cards.value
    .filter((card) => card.point)
    .map((card) => toSpotLike(card))
  mapCore.value.renderSpots(spots, selected.value?.card_id)
}

const handleCheckIn = async () => {
  if (!selected.value || selected.value.is_check) return
  checking.value = true
  try {
    await store.refreshLocation()
    const result = await checkInPunchCard(selected.value, store.userLocation)
    cards.value = result.card_list
    selected.value = cards.value.find((item) => item.card_id === selected.value?.card_id) || null
    syncMarkers()
    showToast('打卡成功', 'success', 1500)
  } catch (err) {
    showToast((err as Error)?.message || '打卡失败', 'error', 2200)
  } finally {
    checking.value = false
  }
}

onMounted(async () => {
  try {
    await refreshCards()
    await initMap()
    syncMarkers()
  } catch (err) {
    showToast((err as Error)?.message || '地图加载失败', 'error', 2200)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  mapCore.value?.destroy()
  mapCore.value = null
})
</script>

<template>
  <div class="campus-guide-root campus-guide-root--immersive">
    <TPageHeader title="地图打卡" icon="map" @back="emit('back')" />

    <div v-if="loading" class="campus-guide-status">加载打卡点…</div>

    <div class="campus-guide-map-shell campus-guide-map-shell--immersive">
      <div ref="mapContainerRef" class="campus-guide-map-canvas" />

      <div class="campus-guide-overlay">
        <section v-if="selected" class="campus-poi-card campus-phase2-check-panel">
          <h3>{{ selected.name }}</h3>
          <p class="campus-guide-muted">{{ selectedDistance }} · {{ selected.is_check ? '已打卡' : '未打卡' }}</p>
          <p v-if="selected.info" class="campus-guide-muted">{{ selected.info }}</p>
          <button
            v-if="!selected.is_check"
            type="button"
            class="campus-guide-primary-btn"
            :disabled="checking || !canCheckInCard(selected, store.userLocation)"
            @click="handleCheckIn"
          >
            {{ checking ? '打卡中…' : '在此打卡' }}
          </button>
        </section>
      </div>
    </div>
  </div>
</template>