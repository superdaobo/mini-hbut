<script setup lang="ts">
// 教师端「教室课表」查询入口视图（goal-21 / T12）。
//
// ⚠️ 本页**不渲染课表网格**，教室卡片也**不可点击**——教务没有单间教室课表的
//   JSON 接口（与班级页同理，教室课表同样是服务端渲染页，且后端未提供教室
//   scheduleUrl）。页面定位是「教室清单 + 楼栋/关键词筛选」，底部明确说明
//   「单间教室的课表需在教务系统查询，App 暂不支持」。
// 视觉：stitch 设计包 `_11`（Schedule）的筛选器部分（搜索胶囊 + 楼栋胶囊），
//   token 见 tailwind.config.ts m3Colors；自定义类 .tch-rs-*，暗色覆盖在
//   配套 CSS 末尾。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from '../../../components/templates'
import { useI18n, tf } from '../../../utils/app_i18n'
import { useAuthStore } from '../../../stores/auth'
import { useTeacherScheduleLists, type TeacherScheduleRoom } from '../composables/useTeacherScheduleLists'
import { resolveTeacherAccountId } from '../utils/teacher_scope'
import { teacherSemesterOptions } from '../utils/teacher_semesters'
import TeacherSyncBar from '../components/TeacherSyncBar.vue'

const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const auth = useAuthStore()

const {
  semester,
  rooms,
  roomTotal,
  buildingChips,
  buildingFilter,
  isLoading,
  isEmpty,
  isError,
  errorKey,
  lastSuccessfulSyncAt,
  syncStatus,
  load,
  setSemester,
  setKeyword,
  setBuildingFilter,
  retry
} = useTeacherScheduleLists({ accountId: () => resolveTeacherAccountId(auth.studentId) })

const hasData = computed(() => rooms.value.length > 0)

// ── 页头学期胶囊（<details> 原生展开/收起，与 T07/T10 同款）──
const semesterDraft = ref(semester.value)
watch(semester, (value) => { semesterDraft.value = value })
const semesters = computed(() => teacherSemesterOptions(semesterDraft.value))
const semesterDetails = ref<HTMLElement | null>(null)
const semesterMenuOpen = ref(false)
const onSemesterToggle = (): void => {
  semesterMenuOpen.value = (semesterDetails.value as HTMLDetailsElement | null)?.open === true
}
const closeSemesterMenu = (): void => {
  if (semesterDetails.value) (semesterDetails.value as HTMLDetailsElement).open = false
  semesterMenuOpen.value = false
}
const applySemester = async (): Promise<void> => {
  closeSemesterMenu()
  if (semesterDraft.value === semester.value) return
  await setSemester(semesterDraft.value)
}
const reload = async (): Promise<void> => { await retry() }

// ── 教室搜索（300ms 防抖 → 接口 keyword 参数）──
const keywordDraft = ref('')
let keywordTimer: ReturnType<typeof setTimeout> | null = null
const onKeywordInput = (): void => {
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    keywordTimer = null
    void setKeyword(keywordDraft.value)
  }, 300)
}
const clearKeyword = (): void => {
  keywordDraft.value = ''
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = null
  void setKeyword('')
}

// ── 楼栋筛选（本地精确匹配 buildingName；再点一次还原）──
const onBuildingPill = (name: string): void => {
  setBuildingFilter(name)
}
const isBuildingActive = (name: string): boolean => buildingFilter.value === name

// ── 卡片文案 ──
const roomTitle = (item: TeacherScheduleRoom): string =>
  item.roomName || item.roomNo || '—'
const roomMeta = (item: TeacherScheduleRoom): string =>
  [
    item.buildingName,
    item.campusName,
    item.roomType ? tf('teacher.schedule.room.type', { type: item.roomType }) : ''
  ]
    .filter(Boolean)
    .join(' · ')
const footerText = computed(() =>
  tf('teacher.schedule.footer.loaded', { loaded: rooms.value.length, total: roomTotal.value })
)

onMounted(() => { void load() })
onBeforeUnmount(() => {
  if (keywordTimer) clearTimeout(keywordTimer)
})
</script>

<template>
  <div class="min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-rs">
    <TPageHeader :title="t('teacher.schedule.room.title')" icon="meeting_room" @back="emit('back')">
      <template #actions>
        <details ref="semesterDetails" class="tch-rs-semester" @toggle="onSemesterToggle">
          <summary class="tch-rs-semester-pill" :title="t('teacher.schedule.semester.label')">
            <span class="tch-rs-label-micro">{{ semester }}</span>
            <span class="material-symbols-outlined text-[14px] transition-transform duration-300"
              :class="{ 'rotate-180': semesterMenuOpen }" aria-hidden="true">expand_more</span>
          </summary>
          <div class="tch-rs-semester-menu" @click.self="closeSemesterMenu">
            <label v-for="value in semesters" :key="value" class="tch-rs-semester-option">
              <input type="radio" name="tch-room-schedule-semester" :value="value" v-model="semesterDraft"
                :disabled="isLoading" @change="applySemester" />
              <span>{{ value }}</span>
            </label>
          </div>
        </details>
        <button type="button" class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest"
          :aria-label="t('teacher.schedule.action.refresh')" :disabled="isLoading" @click="reload">
          <span class="material-symbols-outlined" :class="{ 'animate-spin': isLoading }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <main class="px-4 pt-3 space-y-3">
      <!-- 三态 -->
      <TEmptyState v-if="isLoading && !hasData" type="loading" :message="t('teacher.schedule.loading')" />
      <TEmptyState v-else-if="isError && !hasData" type="error" :message="t(errorKey)">
        <button type="button" class="mt-3 text-primary font-semibold" @click="reload">
          {{ t('teacher.schedule.action.retry') }}
        </button>
      </TEmptyState>
      <TEmptyState v-else-if="isEmpty || !hasData" :message="t('teacher.schedule.room.empty')" />

      <template v-else>
        <!-- 搜索胶囊（300ms 防抖 → 服务端 keyword） -->
        <div class="tch-rs-search">
          <span class="material-symbols-outlined text-[20px] text-outline" aria-hidden="true">search</span>
          <input v-model="keywordDraft" class="tch-rs-search-input" type="search"
            :placeholder="t('teacher.schedule.room.search.placeholder')"
            :aria-label="t('teacher.schedule.room.search.aria')" @input="onKeywordInput" />
          <button v-if="keywordDraft" type="button" class="tch-rs-search-clear"
            :aria-label="t('teacher.schedule.search.clear')" @click="clearKeyword">
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>

        <!-- 楼栋筛选胶囊（本地 buildingName 精确匹配，按教室数降序） -->
        <div v-if="buildingChips.length" class="tch-rs-buildings"
          :aria-label="t('teacher.schedule.room.buildings.aria')">
          <button v-for="chip in buildingChips" :key="chip.name" type="button" class="tch-rs-building-pill"
            :class="{ 'tch-rs-building-pill--active': isBuildingActive(chip.name) }"
            :aria-pressed="isBuildingActive(chip.name)" @click="onBuildingPill(chip.name)">
            <span class="truncate max-w-[96px]">{{ chip.name }}</span>
            <span class="tch-rs-building-count">{{ chip.count }}</span>
          </button>
        </div>

        <!-- 教室卡片流（不可点击：无教室课表 URL） -->
        <section class="flex flex-col gap-2.5">
          <article v-for="item in rooms" :key="item.key" class="tch-rs-card p-3.5">
            <div class="flex items-center justify-between gap-2 min-w-0">
              <span class="tch-rs-card-title truncate">{{ roomTitle(item) }}</span>
              <span v-if="item.capacity !== null" class="tch-rs-card-count shrink-0">
                {{ tf('teacher.schedule.room.capacity', { n: item.capacity }) }}
              </span>
            </div>
            <p v-if="roomMeta(item)" class="tch-rs-card-meta mt-1 truncate" :title="roomMeta(item)">
              {{ roomMeta(item) }}
            </p>
          </article>
        </section>

        <!-- 底部：已加载 N / 共 total（接口只回第一页） -->
        <div class="flex items-center justify-center pt-1">
          <p class="tch-rs-footer">
            <span class="tch-rs-footer-dot" aria-hidden="true"></span>
            {{ footerText }}
            <span class="tch-rs-footer-dot" aria-hidden="true"></span>
          </p>
        </div>
      </template>

      <!-- 教室课表说明：单教室课表需到教务系统查（App 无对应接口） -->
      <div class="tch-rs-note flex items-start gap-2 px-3.5 py-2.5">
        <span class="material-symbols-outlined text-[16px] text-outline mt-px" aria-hidden="true">info</span>
        <p class="tch-rs-note-text">{{ t('teacher.schedule.room.notSupported') }}</p>
      </div>

      <TeacherSyncBar
        :status="syncStatus"
        :last-successful-sync-at="lastSuccessfulSyncAt"
        :error-key="isError ? errorKey : ''"
      />
    </main>
  </div>
</template>

<style src="../../../styles/views/TeacherRoomSchedule.scoped.css" scoped></style>
