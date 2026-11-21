// 修正说明条文案（旧文案说"只能浏览器看"，现在已支持应用内渲染）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/views/TeacherClassScheduleView.vue';
let c = fs.readFileSync(p, 'utf8');

// 说明条图标：open_in_new → grid_view
c = c.replace('aria-hidden="true">open_in_new</span>', 'aria-hidden="true">grid_view</span>');

// 说明条文本：不再用 sourceReason（后端写的"请用 WebView 承载"），改成本地文案
c = c.replace(
  "{{ sourceReason || t('teacher.schedule.source.hint') }}",
  "{{ t('teacher.schedule.class.gridHint') }}",
);

fs.writeFileSync(p, c, 'utf8');
console.log('open_in_new 残留:', (c.match(/open_in_new/g) || []).length);
console.log('sourceReason 引用:', (c.match(/sourceReason/g) || []).length);
console.log('gridHint 引用:', (c.match(/gridHint/g) || []).length);
