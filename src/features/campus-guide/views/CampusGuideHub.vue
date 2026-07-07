<script setup lang="ts">
import { onMounted } from 'vue'
import { TPageHeader } from '../../../components/templates'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { hasSeenYunyouIntro, readYunyouUser } from '../services/phase2-storage'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()

const openGuide = () => store.navigateTo(CAMPUS_GUIDE_VIEWS.home)
const openPunch = () => store.navigateTo(CAMPUS_GUIDE_VIEWS.punchHome)
onMounted(() => {
  if (!store.scenic) void store.bootstrap().catch(() => undefined)
})

const openYunyou = () => {
  if (hasSeenYunyouIntro() && readYunyouUser()?.nickName) {
    store.navigateTo(CAMPUS_GUIDE_VIEWS.yunyouDetail)
    return
  }
  store.navigateTo(CAMPUS_GUIDE_VIEWS.yunyouIntro)
}
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
      <p class="campus-guide-muted">选择导览模式，进入校园地图、校庆打卡或云游文化衫。</p>
      <div class="campus-guide-hub-actions">
        <button type="button" class="campus-guide-hub-card primary" @click="openGuide">
          <strong>校园导览</strong>
          <span>手绘地图 · POI · 导航</span>
        </button>
        <button type="button" class="campus-guide-hub-card" @click="openPunch">
          <strong>校庆打卡</strong>
          <span>地图打卡 · 明信片 · 校友卡</span>
        </button>
        <button type="button" class="campus-guide-hub-card" @click="openYunyou">
          <strong>云游文化衫</strong>
          <span>在线报名 · 签名定制</span>
        </button>
      </div>
    </div>
  </div>
</template>