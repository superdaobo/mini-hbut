// 插入课表网格区块（锚点无前导空格）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/views/TeacherClassScheduleView.vue';
let c = fs.readFileSync(p, 'utf8');

if (c.includes('tch-cs-grid-wrap')) {
  console.log('网格区块已存在，跳过');
  process.exit(0);
}

const anchor = '<!-- 三态 -->';
if (!c.includes(anchor)) {
  console.log('锚点未找到');
  process.exit(1);
}

const gridBlock = `<!-- 课表网格（goal-22：选中班级后页内渲染，零浏览器外跳） -->
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

        <div v-if="scheduleGrid.loading.value" class="tch-cs-grid-empty">
          <span class="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
          <p class="tch-cs-label-micro">{{ t('teacher.schedule.loading') }}</p>
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

c = c.replace(anchor, gridBlock + anchor);

// 列表在选中班级时隐藏
c = c.replace(
  '<TEmptyState v-else-if="isEmpty || !hasData" :message="t(\'teacher.schedule.class.empty\')" />',
  '<TEmptyState v-else-if="!activeClass && (isEmpty || !hasData)" :message="t(\'teacher.schedule.class.empty\')" />',
);

fs.writeFileSync(p, c, 'utf8');
console.log('网格区块已插入');
console.log('tch-cs-grid-wrap:', (c.match(/tch-cs-grid-wrap/g) || []).length);
console.log('ScheduleGrid 标签:', (c.match(/<ScheduleGrid/g) || []).length);
