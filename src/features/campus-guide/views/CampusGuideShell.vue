<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import {
  CAMPUS_GUIDE_VIEW_TITLES,
  CAMPUS_GUIDE_VIEWS,
  isKnownCampusGuideView
} from '../navigation'
import { resetCampusGuideStore, useCampusGuideStore } from '../store/campus-guide-store'
import '../map/map-theme.css'
import CampusGuideAbout from './CampusGuideAbout.vue'
import CampusGuideActivity from './CampusGuideActivity.vue'
import CampusGuideActivityDetail from './CampusGuideActivityDetail.vue'
import CampusGuideBus from './CampusGuideBus.vue'
import CampusGuideCollect from './CampusGuideCollect.vue'
import CampusGuideHome from './CampusGuideHome.vue'
import CampusGuideHub from './CampusGuideHub.vue'
import CampusGuideMockLocation from './CampusGuideMockLocation.vue'
import CampusGuideNoticeDetail from './CampusGuideNoticeDetail.vue'
import CampusGuideNoticeList from './CampusGuideNoticeList.vue'
import CampusGuidePoiDetail from './CampusGuidePoiDetail.vue'
import CampusGuidePunchAlumniCard from './CampusGuidePunchAlumniCard.vue'
import CampusGuidePunchHome from './CampusGuidePunchHome.vue'
import CampusGuidePunchMap from './CampusGuidePunchMap.vue'
import CampusGuidePunchMy from './CampusGuidePunchMy.vue'
import CampusGuidePunchPostcard from './CampusGuidePunchPostcard.vue'
import CampusGuideRouteList from './CampusGuideRouteList.vue'
import CampusGuideSettings from './CampusGuideSettings.vue'
import CampusGuideRouteMap from './CampusGuideRouteMap.vue'
import CampusGuideSearch from './CampusGuideSearch.vue'
import CampusGuideWalkLine from './CampusGuideWalkLine.vue'
import CampusGuideYunyouClue from './CampusGuideYunyouClue.vue'
import CampusGuideYunyouDetail from './CampusGuideYunyouDetail.vue'
import CampusGuideYunyouIntro from './CampusGuideYunyouIntro.vue'
import CampusGuideYunyouSignature from './CampusGuideYunyouSignature.vue'

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const activeView = computed(() => store.currentView)
const isUnknownView = computed(() => !isKnownCampusGuideView(activeView.value))

const handleAppBack = () => {
  if (activeView.value === CAMPUS_GUIDE_VIEWS.hub) {
    emit('back')
    return
  }
  if (activeView.value === CAMPUS_GUIDE_VIEWS.home) {
    store.navigateTo(CAMPUS_GUIDE_VIEWS.hub)
    return
  }
  store.goBack()
}

onBeforeUnmount(() => resetCampusGuideStore())
</script>

<template>
  <div class="campus-guide-shell">
    <CampusGuideHub v-if="activeView === CAMPUS_GUIDE_VIEWS.hub" @back="handleAppBack" />
    <KeepAlive>
      <CampusGuideHome v-if="activeView === CAMPUS_GUIDE_VIEWS.home" @back="handleAppBack" />
    </KeepAlive>
    <CampusGuideSearch v-if="activeView === CAMPUS_GUIDE_VIEWS.search" @back="store.goBack" />
    <CampusGuideWalkLine v-if="activeView === CAMPUS_GUIDE_VIEWS.walkline" @back="store.goBack" />
    <CampusGuidePoiDetail v-if="activeView === CAMPUS_GUIDE_VIEWS.poi" @back="store.goBack" />
    <CampusGuideRouteList v-if="activeView === CAMPUS_GUIDE_VIEWS.route" @back="store.goBack" />
    <CampusGuideRouteMap v-if="activeView === CAMPUS_GUIDE_VIEWS.roadmap" @back="store.goBack" />
    <CampusGuideBus v-if="activeView === CAMPUS_GUIDE_VIEWS.bus" @back="store.goBack" />
    <CampusGuideActivity v-if="activeView === CAMPUS_GUIDE_VIEWS.activity" @back="store.goBack" />
    <CampusGuideActivityDetail
      v-if="activeView === CAMPUS_GUIDE_VIEWS.activityDetail"
      @back="store.goBack"
    />
    <CampusGuideNoticeList v-if="activeView === CAMPUS_GUIDE_VIEWS.notice" @back="store.goBack" />
    <CampusGuideNoticeDetail
      v-if="activeView === CAMPUS_GUIDE_VIEWS.noticeDetail"
      @back="store.goBack"
    />
    <CampusGuideAbout v-if="activeView === CAMPUS_GUIDE_VIEWS.about" @back="store.goBack" />
    <CampusGuideCollect v-if="activeView === CAMPUS_GUIDE_VIEWS.collect" @back="store.goBack" />
    <CampusGuideMockLocation
      v-if="activeView === CAMPUS_GUIDE_VIEWS.mockLocation"
      @back="store.goBack"
    />
    <CampusGuideSettings v-if="activeView === CAMPUS_GUIDE_VIEWS.settings" @back="store.goBack" />
    <CampusGuideYunyouIntro
      v-if="activeView === CAMPUS_GUIDE_VIEWS.yunyouIntro"
      @back="store.goBack"
    />
    <CampusGuideYunyouDetail
      v-if="activeView === CAMPUS_GUIDE_VIEWS.yunyouDetail"
      @back="store.goBack"
    />
    <CampusGuideYunyouClue v-if="activeView === CAMPUS_GUIDE_VIEWS.yunyouClue" @back="store.goBack" />
    <CampusGuideYunyouSignature
      v-if="activeView === CAMPUS_GUIDE_VIEWS.yunyouSignature"
      @back="store.goBack"
    />
    <CampusGuidePunchHome v-if="activeView === CAMPUS_GUIDE_VIEWS.punchHome" @back="store.goBack" />
    <CampusGuidePunchMap v-if="activeView === CAMPUS_GUIDE_VIEWS.punchMap" @back="store.goBack" />
    <CampusGuidePunchPostcard
      v-if="activeView === CAMPUS_GUIDE_VIEWS.punchPostcard"
      @back="store.goBack"
    />
    <CampusGuidePunchAlumniCard
      v-if="activeView === CAMPUS_GUIDE_VIEWS.punchAlumniCard"
      @back="store.goBack"
    />
    <CampusGuidePunchMy v-if="activeView === CAMPUS_GUIDE_VIEWS.punchMy" @back="store.goBack" />
    <div v-if="isUnknownView" class="campus-guide-page">
      <p>未知页面：{{ CAMPUS_GUIDE_VIEW_TITLES[activeView] || activeView }}</p>
      <button type="button" @click="store.goBack">返回</button>
    </div>
  </div>
</template>