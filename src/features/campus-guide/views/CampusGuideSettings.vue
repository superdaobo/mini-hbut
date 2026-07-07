<script setup lang="ts">
import { ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { readCampusGuideMode, writeCampusGuideMode } from '../config'
import { clearCampusGuideOfflineCaches } from '../services/offline-cache'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const guideMode = ref(readCampusGuideMode())

const applyMode = () => {
  writeCampusGuideMode(guideMode.value)
  showToast('地图模式已保存，重新进入校园地图后生效', 'success', 2200)
}

const clearCache = () => {
  clearCampusGuideOfflineCaches()
  showToast('校园导览缓存已清除', 'success', 1800)
}
</script>

<template>
  <GuidePageLayout title="导览设置" icon="settings" @back="emit('back')">
    <label class="campus-guide-field">
      <span>地图模式</span>
      <select v-model="guideMode" class="campus-guide-input">
        <option value="tencent">腾讯手绘导览（推荐）</option>
        <option value="legacy">旧版静态地图</option>
      </select>
    </label>
    <button type="button" class="campus-guide-primary-btn" @click="applyMode">保存设置</button>

    <section class="campus-phase2-section">
      <h3>离线缓存</h3>
      <p class="campus-guide-muted">
        状态：{{ store.offline ? '离线模式' : '在线模式' }}
        <template v-if="store.cacheUpdatedAt"> · 更新于 {{ store.cacheUpdatedAt }}</template>
      </p>
      <button type="button" class="campus-guide-primary-btn" @click="clearCache">清除导览缓存</button>
    </section>
  </GuidePageLayout>
</template>