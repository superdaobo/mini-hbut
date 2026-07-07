<script setup lang="ts">
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()

const clues = [
  '在图书馆附近寻找第一处云游印记',
  '前往体育馆打卡点解锁背面图案',
  '完成签名后可在文化衫详情页查看效果',
  '所有线索完成后可参与校庆线下打卡联动'
]
</script>

<template>
  <GuidePageLayout title="云游线索" icon="lightbulb" @back="emit('back')">
    <p class="campus-guide-muted">根据线索在校园内探索，完成云游文化衫定制。</p>
    <ol class="campus-phase2-clue-list">
      <li v-for="(item, index) in clues" :key="index">{{ item }}</li>
    </ol>
    <button type="button" class="campus-guide-primary-btn" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.yunyouSignature)">
      去签名
    </button>
  </GuidePageLayout>
</template>