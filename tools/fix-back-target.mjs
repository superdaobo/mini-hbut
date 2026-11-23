// 修正 11 个新入口的返回目标：handleBackToMe -> handleBackToDashboard
import fs from 'node:fs';

const path = 'D:/wt/teacher-portal-probe-1120/apps/client/src/App.vue';
let content = fs.readFileSync(path, 'utf8');

const ids = [
  'teacherattendance',
  'teacherworkload',
  'teacherexamaffairs',
  'teachercredits',
  'teacheradjustment',
  'teacherroster',
  'teachergradeentry',
  'teacherchaoxinganalytics',
  'teacherportal',
  'teacherclassschedule',
  'teacherroomschedule',
];

let changed = 0;
for (const id of ids) {
  // 匹配形如：currentView === 'teacherattendance'" :is="VIEW_COMPONENTS.teacherattendance" @back="handleBackToMe" />
  const pattern = new RegExp(
    `(currentView === '${id}'"[^>]*@back=")handleBackToMe(")`,
  );
  if (pattern.test(content)) {
    content = content.replace(pattern, '$1handleBackToDashboard$2');
    changed += 1;
  } else {
    console.log(`未匹配: ${id}`);
  }
}

fs.writeFileSync(path, content, 'utf8');
console.log(`已改 ${changed} / ${ids.length} 个分支`);
console.log(`剩余 handleBackToMe 次数: ${(content.match(/handleBackToMe/g) || []).length}`);
