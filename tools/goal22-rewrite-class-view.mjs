// goal-22 / T04：把 TeacherClassScheduleView 从「openExternal 跳浏览器」改为「页内网格渲染」
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/views/TeacherClassScheduleView.vue';
let c = fs.readFileSync(p, 'utf8');
const before = c;

// ── 1. import：去掉 openExternal / showToast，加网格相关 ──────────────
c = c.replace(
  "import { openExternal } from '../../../utils/external_link'\nimport { showToast } from '../../../utils/toast'\n",
  '',
);
c = c.replace(
  "import TeacherSyncBar from '../components/TeacherSyncBar.vue'",
  "import TeacherSyncBar from '../components/TeacherSyncBar.vue'\n" +
    "import ScheduleGrid from '../../../features/schedule/components/ScheduleGrid.vue'\n" +
    "import {\n" +
    "  buildWeekDates,\n" +
    "  useTeacherScheduleGrid\n" +
    "} from '../composables/useTeacherScheduleGrid'",
);

// ── 2. 用网格数据层替换 openExternal 逻辑 ───────────────────────────
const openStart = c.indexOf('// ── 打开课表页（系统浏览器；失败 toast，绝不静默）──');
const tail = c.indexOf('// ── 卡片文案 ──');
if (openStart < 0 || tail <= openStart) {
  console.log('openClassSchedule 定位失败', openStart, tail);
  process.exit(1);
}

const replacement = `// ── 课表网格（goal-22：完全在应用内渲染，不再 openExternal 跳浏览器）──
const scheduleGrid = useTeacherScheduleGrid()
const activeClass = ref<TeacherScheduleClass | null>(null)
const weekDates = buildWeekDates()
const activeTitle = computed(() => activeClass.value?.className || activeClass.value?.classNo || '')
const activeCourseCount = computed(() => scheduleGrid.courses.value.length)
const activeIsEmpty = computed(
  () => !scheduleGrid.loading.value && !scheduleGrid.error.value && activeCourseCount.value === 0
)

const viewClassSchedule = async (item: TeacherScheduleClass): Promise<void> => {
  if (!item.encodeId) return
  activeClass.value = item
  recordRecentClass(item)
  await scheduleGrid.load({
    kind: 'class',
    encodeId: item.encodeId,
    semester: item.semester || semester.value,
    campusId: item.campusId || undefined,
    displayName: item.className || item.classNo || ''
  })
}

const closeSchedule = (): void => {
  activeClass.value = null
  scheduleGrid.reset()
}

const reloadSchedule = async (): Promise<void> => {
  if (!activeClass.value) return
  await viewClassSchedule(activeClass.value)
}

`;

c = c.slice(0, openStart) + replacement + c.slice(tail);

// ── 3. 模板：说明条改为「点班级看课表」+ 插入网格区块 ────────────────
c = c.replace(
  '          <span class="material-symbols-outlined text-[16px] text-primary mt-px" aria-hidden="true">open_in_new</span>\n          <p class="tch-cs-note-text">{{ sourceReason || t(\'teacher.schedule.source.hint\') }}</p>',
  '          <span class="material-symbols-outlined text-[16px] text-primary mt-px" aria-hidden="true">grid_view</span>\n          <p class="tch-cs-note-text">{{ t(\'teacher.schedule.source.hint\') }}</p>',
);

// 在「三态」之前插入网格区块
const gridBlock = `        <!-- 课表网格（选中班级后页内渲染，零浏览器外跳） -->
        <section v-if="activeClass" class="tch-cs-grid-wrap">
          <div class="flex items-center justify-between px-1 pb-2">
            <div class="min-w-0">
              <p class="text-[15px] font-semibold truncate">{{ activeTitle }}</p>
              <p class="tch-cs-label-micro text-outline">
                {{ tf('teacher.schedule.class.courseCount', { n: activeCourseCount }) }}
              </p>
            </div>
            <button type="button" class="text-[13px] font-semibold text-primary shrink-0"
              :disabled="scheduleGrid.loading.value" @click="reloadSchedule">
              {{ t('teacher.schedule.action.refresh') }}
            </button>
          </div>

          <div v-if="scheduleGrid.loading.value" class="tch-cs-grid-loading">
            <span class="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
            <span class="tch-cs-label-micro">{{ t('teacher.schedule.loading') }}</span>
          </div>
          <div v-else-if="scheduleGrid.error.value" class="tch-cs-grid-empty">
            <span class="material-symbols-outlined text-danger" aria-hidden="true">error</span>
            <p class="tch-cs-label-micro">{{ scheduleGrid.error.value }}</p>
            <button type="button" class="text-[13px] font-semibold text-primary mt-1" @click="reloadSchedule">
              {{ t('teacher.schedule.action.retry') }}
            </button>
          </div>
          <div v-else-if="activeIsEmpty" class="tch-cs-grid-empty">
            <span class="material-symbols-outlined text-outline" aria-hidden="true">event_busy</span>
            <p class="tch-cs-label-micro">{{ t('teacher.schedule.class.noCourses') }}</p>
          </div>
          <ScheduleGrid v-else
            :week-dates="weekDates"
            :current-month="weekDates[0]?.month || 1"
            :selected-week="0"
            :get-courses-for-day="scheduleGrid.getCoursesForDay"
            :get-course-style="scheduleGrid.getCourseStyleFor"
            :enable-blank-create="false"
            view-mode="courses"
          />

          <button type="button" class="tch-cs-back-list" @click="closeSchedule">
            {{ t('teacher.schedule.class.backToList') }}
          </button>
        </section>

`;

const threeStateAnchor = '        <!-- 三态 -->';
if (c.includes(threeStateAnchor)) {
  c = c.replace(threeStateAnchor, gridBlock + threeStateAnchor);
} else {
  console.log('三态锚点未找到');
}

// 列表在选中班级时隐藏（网格优先）
c = c.replace(
  '<TEmptyState v-if="isLoading && !hasData" type="loading" :message="t(\'teacher.schedule.loading\')" />',
  '<TEmptyState v-if="!activeClass && isLoading && !hasData" type="loading" :message="t(\'teacher.schedule.loading\')" />',
);

// 把卡片点击从 openClassSchedule 改为 viewClassSchedule
c = c.replace(/@click="openClassSchedule\(/g, '@click="viewClassSchedule(');
c = c.replace(/:disabled="openingClassKey[^"]*"/g, ':disabled="false"');

fs.writeFileSync(p, c, 'utf8');
console.log('改动生效:', before !== c);
console.log('openExternal 残留:', (c.match(/openExternal/g) || []).length);
console.log('openClassSchedule 残留:', (c.match(/openClassSchedule/g) || []).length);
console.log('viewClassSchedule 次数:', (c.match(/viewClassSchedule/g) || []).length);
console.log('ScheduleGrid 引用:', (c.match(/ScheduleGrid/g) || []).length);
