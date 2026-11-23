// 修复模板里对已删除符号的引用
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/views/TeacherClassScheduleView.vue';
let c = fs.readFileSync(p, 'utf8');

c = c.split('@click="onCardClick(item)"').join('@click="viewClassSchedule(item)"');
c = c.split(':disabled="Boolean(openingClassKey)"').join(':disabled="scheduleGrid.loading.value"');
c = c.split('openingClassKey === item.key').join('scheduleGrid.loading.value');

fs.writeFileSync(p, c, 'utf8');
console.log('onCardClick 残留:', (c.match(/onCardClick/g) || []).length);
console.log('openingClassKey 残留:', (c.match(/openingClassKey/g) || []).length);
console.log('viewClassSchedule 次数:', (c.match(/viewClassSchedule/g) || []).length);
