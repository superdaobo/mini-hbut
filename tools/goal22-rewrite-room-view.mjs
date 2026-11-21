// goal-22 / T04：教室课表页改造（页内网格渲染）
import fs from 'node:fs';

const ROOT = 'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher';

// ── 1. 类型补 encodeId / semester / campusId ──────────────────────
const listPath = `${ROOT}/composables/useTeacherScheduleLists.ts`;
let list = fs.readFileSync(listPath, 'utf8');
if (!list.includes('encodeId: string')) {
  list = list.replace(
    '    /** 座位容量（zdskrnrs）。 */\n    capacity: number | null\n  }',
    '    /** 座位容量（zdskrnrs）。 */\n    capacity: number | null\n' +
      '    /** 加密 ID（goal-22：教室课表查询必须要它）。 */\n    encodeId: string\n' +
      '    /** 学期（xnxq）。 */\n    semester: string\n' +
      '    /** 校区代码（xqdm）。 */\n    campusId: string\n  }',
  );
  fs.writeFileSync(listPath, list, 'utf8');
  console.log('类型已补 encodeId/semester/campusId');
} else {
  console.log('类型已存在');
}

// 找 normalizeRoom 补字段
let list2 = fs.readFileSync(listPath, 'utf8');
if (!list2.includes('encodeId: text(record')) {
  // 在 capacity 那一行后补
  const marker = /capacity:\s*number_field\(record,\s*"zdskrnrs"\)|capacity:\s*toNumber\(record\.zdskrnrs\)/;
  const m = list2.match(marker);
  if (m) {
    const line = m[0];
    list2 = list2.replace(
      line,
      `${line},\n      encodeId: String(record.encodeId ?? '').trim(),\n      semester: String(record.semester ?? '').trim(),\n      campusId: String(record.campusId ?? '').trim()`,
    );
    fs.writeFileSync(listPath, list2, 'utf8');
    console.log('normalizeRoom 已补字段');
  } else {
    console.log('normalizeRoom 锚点未找到（需手工核对）');
  }
}

// ── 2. 视图改造 ──────────────────────────────────────────────────
const viewPath = `${ROOT}/views/TeacherRoomScheduleView.vue`;
let v = fs.readFileSync(viewPath, 'utf8');

// 2a import
if (!v.includes('useTeacherScheduleGrid')) {
  v = v.replace(
    "import TeacherSyncBar from '../components/TeacherSyncBar.vue'",
    "import TeacherSyncBar from '../components/TeacherSyncBar.vue'\n" +
      "import ScheduleGrid from '../../../features/schedule/components/ScheduleGrid.vue'\n" +
      "import { buildWeekDates, useTeacherScheduleGrid } from '../composables/useTeacherScheduleGrid'",
  );
}

// 2b script：插入网格数据层（在「卡片文案」之前）
if (!v.includes('viewRoomSchedule')) {
  const anchor = '// ── 卡片文案 ──';
  const block = `// ── 课表网格（goal-22：选中教室后页内渲染，零浏览器外跳）──
const scheduleGrid = useTeacherScheduleGrid()
const activeRoom = ref<TeacherScheduleRoom | null>(null)
const weekDates = buildWeekDates()
const activeTitle = computed(() => activeRoom.value?.roomName || activeRoom.value?.roomNo || '')
const activeCourseCount = computed(() => scheduleGrid.courses.value.length)
const activeIsEmpty = computed(
  () => !scheduleGrid.loading.value && !scheduleGrid.error.value && activeCourseCount.value === 0
)

const viewRoomSchedule = async (item: TeacherScheduleRoom): Promise<void> => {
  if (!item.encodeId) return
  activeRoom.value = item
  await scheduleGrid.load({
    kind: 'room',
    encodeId: item.encodeId,
    semester: item.semester || semester.value,
    campusId: item.campusId || undefined,
    displayName: item.roomName || item.roomNo || ''
  })
}

const closeSchedule = (): void => {
  activeRoom.value = null
  scheduleGrid.reset()
}

const reloadSchedule = async (): Promise<void> => {
  if (!activeRoom.value) return
  await viewRoomSchedule(activeRoom.value)
}

`;
  if (v.includes(anchor)) {
    v = v.replace(anchor, block + anchor);
  } else {
    console.log('卡片文案锚点未找到');
  }
}

// 2c 模板：说明条改文案
v = v.replace(
  'aria-hidden="true">info</span>',
  'aria-hidden="true">grid_view</span>',
);
v = v.replace(
  "{{ t('teacher.schedule.room.notSupported') }}",
  "{{ t('teacher.schedule.room.gridHint') }}",
);

// 2d 教室卡改为可点按钮
v = v.replace(
  '<article v-for="item in rooms" :key="item.key" class="tch-rs-card p-3.5">',
  '<button v-for="item in rooms" :key="item.key" type="button" class="tch-rs-card tch-rs-card--clickable p-3.5 text-left w-full"\n              :disabled="scheduleGrid.loading.value" @click="viewRoomSchedule(item)">',
);
v = v.replace(
  `              <p v-if="roomMeta(item)" class="tch-rs-card-meta mt-1 truncate" :title="roomMeta(item)">
                {{ roomMeta(item) }}
              </p>
            </article>`,
  `              <p v-if="roomMeta(item)" class="tch-rs-card-meta mt-1 truncate" :title="roomMeta(item)">
                {{ roomMeta(item) }}
              </p>
              <span class="tch-rs-open">查看课表 ›</span>
            </button>`,
);

// 2e 插入网格区块（说明条之前）
if (!v.includes('tch-rs-grid-wrap')) {
  const anchor = '<!-- 教室课表说明：单教室课表需到教务系统查（App 无对应接口） -->';
  const gridBlock = `<!-- 课表网格（goal-22：选中教室后页内渲染） -->
        <section v-if="activeRoom" class="tch-rs-grid-wrap">
          <div class="flex items-center justify-between px-1 pb-2">
            <div class="min-w-0">
              <p class="text-[15px] font-semibold truncate">{{ activeTitle }}</p>
              <p class="tch-rs-label-micro text-outline">
                {{ tf('teacher.schedule.room.courseCount', { n: activeCourseCount }) }}
              </p>
            </div>
            <button type="button" class="text-[13px] font-semibold text-primary shrink-0"
              :disabled="scheduleGrid.loading.value" @click="reloadSchedule">
              {{ t('teacher.schedule.action.refresh') }}
            </button>
          </div>

          <div v-if="scheduleGrid.loading.value" class="tch-rs-grid-empty">
            <span class="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
            <p class="tch-rs-label-micro">{{ t('teacher.schedule.loading') }}</p>
          </div>
          <div v-else-if="scheduleGrid.error.value" class="tch-rs-grid-empty">
            <span class="material-symbols-outlined text-danger" aria-hidden="true">error</span>
            <p class="tch-rs-label-micro">{{ scheduleGrid.error.value }}</p>
            <button type="button" class="text-[13px] font-semibold text-primary mt-1" @click="reloadSchedule">
              {{ t('teacher.schedule.action.retry') }}
            </button>
          </div>
          <div v-else-if="activeIsEmpty" class="tch-rs-grid-empty">
            <span class="material-symbols-outlined text-outline" aria-hidden="true">event_busy</span>
            <p class="tch-rs-label-micro">{{ t('teacher.schedule.room.noCourses') }}</p>
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

          <button type="button" class="tch-rs-back-list" @click="closeSchedule">
            {{ t('teacher.schedule.room.backToList') }}
          </button>
        </section>

        `;
  if (v.includes(anchor)) {
    v = v.replace(anchor, gridBlock + anchor);
    console.log('网格区块已插入');
  } else {
    console.log('网格锚点未找到');
  }
}

fs.writeFileSync(viewPath, v, 'utf8');
console.log('openExternal 残留:', (v.match(/openExternal/g) || []).length);
console.log('viewRoomSchedule 次数:', (v.match(/viewRoomSchedule/g) || []).length);
console.log('ScheduleGrid 次数:', (v.match(/ScheduleGrid/g) || []).length);
