<script setup lang="ts">
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { useCampusGuideStore } from '../store/campus-guide-store'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
</script>

<template>
  <GuidePageLayout title="通知公告" icon="campaign" @back="emit('back')">
    <ul class="campus-guide-list">
      <li v-for="item in store.notices" :key="item.id">
        <button type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.noticeDetail, { noticeId: item.id })">
          <strong>{{ item.title }}</strong>
        </button>
      </li>
    </ul>
  </GuidePageLayout>
</template>