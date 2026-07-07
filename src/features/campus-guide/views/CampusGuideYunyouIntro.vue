<script setup lang="ts">
import { ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { markYunyouIntroSeen, readYunyouUser, writeYunyouUser } from '../services/phase2-storage'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const nickName = ref(readYunyouUser()?.nickName || '')

const startYunyou = () => {
  const name = nickName.value.trim()
  if (!name) return
  writeYunyouUser({ nickName: name })
  markYunyouIntroSeen()
  store.navigateTo(CAMPUS_GUIDE_VIEWS.yunyouDetail)
}
</script>

<template>
  <GuidePageLayout title="云游打卡" icon="cloud" @back="emit('back')">
    <h2 class="campus-guide-title">校庆云游文化衫</h2>
    <p class="campus-guide-muted">
      在线参与湖工大校庆云游活动，定制文化衫签名，收集线索并完成云游打卡。
    </p>
    <label class="campus-guide-field">
      <span>昵称（用于文化衫展示）</span>
      <input v-model="nickName" class="campus-guide-input" placeholder="输入昵称" />
    </label>
    <button type="button" class="campus-guide-primary-btn" :disabled="!nickName.trim()" @click="startYunyou">
      开始云游
    </button>
  </GuidePageLayout>
</template>