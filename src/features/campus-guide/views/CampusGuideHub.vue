<script setup lang="ts">
import { onMounted } from 'vue'
import { TPageHeader } from '../../../components/templates'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()

// #491：Hub 仅保留导览入口（默认路径已直达 home，此处作兜底）
const openGuide = () => store.navigateTo(CAMPUS_GUIDE_VIEWS.home)

onMounted(() => {
  // 默认路径已直达 home；Hub 仅作兜底页，点击进入导览
  if (!store.scenic) void store.bootstrap().catch(() => undefined)
})
</script>

<template>
  <div class="campus-guide-page campus-guide-hub">
    <TPageHeader title="湖工大导览" icon="explore" @back="emit('back')" />
    <div class="campus-guide-page-body">
      <div
        v-if="store.scenic?.screen_url"
        class="campus-guide-hub-cover"
        :style="{ backgroundImage: `url(${store.scenic.screen_url})` }"
      />
      <h2 class="campus-guide-title">{{ store.scenic?.name || '湖北工业大学' }}</h2>
      <p class="campus-guide-muted">正在进入校园导览地图…</p>
      <div class="campus-guide-hub-actions">
        <button type="button" class="campus-guide-hub-card primary" @click="openGuide">
          <strong>校园导览</strong>
          <span>手绘地图 · POI · 导航</span>
        </button>
      </div>
    </div>
  </div>
</template>