<script setup lang="ts">
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
</script>

<template>
  <GuidePageLayout title="校园概况" icon="school" @back="emit('back')">
    <h2 class="campus-guide-title">{{ store.scenic?.name || '湖北工业大学' }}</h2>
    <p class="campus-guide-muted">
      中心坐标：{{ store.scenic?.latitude }}, {{ store.scenic?.longitude }}
    </p>
    <article class="campus-guide-article">
      {{
        store.scenic?.introduction ||
          '湖北工业大学校园导览，支持教学楼标点、分类筛选、步行导航、游览路线、班车路线、活动公告、云游打卡与校庆打卡等功能。'
      }}
    </article>
  </GuidePageLayout>
</template>