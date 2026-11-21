// 更新过时注释（不再说"用 openExternal 打开"）
import fs from 'node:fs';

const ROOT = 'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher';

// 1) TeacherClassScheduleView.vue 顶部注释
const viewPath = `${ROOT}/views/TeacherClassScheduleView.vue`;
let v = fs.readFileSync(viewPath, 'utf8');
v = v.replace(
  '//     点击卡片用 openExternal 在系统浏览器打开后端拼好的 scheduleUrl。',
  '//     点击卡片在**页内**用 ScheduleGrid 渲染该班级课表（goal-22：不再跳系统浏览器）。',
);
v = v.replace(
  '//   scheduleUrl 为空（encodeId/classNo/campusId 任一缺失）的班级不可点，',
  '//   encodeId 为空（后端未返回）的班级不可点，',
);
fs.writeFileSync(viewPath, v, 'utf8');
console.log('view 注释已更新');

// 2) useTeacherScheduleLists.ts 顶部注释
const listPath = `${ROOT}/composables/useTeacherScheduleLists.ts`;
let l = fs.readFileSync(listPath, 'utf8');
l = l.replace(
  '//      课表页只能经 `openExternal` 在系统浏览器打开。',
  '//      课表已由 `class_schedule` / `sdpkkbList` 提供结构化数据，在应用内网格渲染。',
);
fs.writeFileSync(listPath, l, 'utf8');
console.log('composable 注释已更新');

// 校验
const check1 = fs.readFileSync(viewPath, 'utf8');
const check2 = fs.readFileSync(listPath, 'utf8');
console.log('view 里 openExternal 出现:', (check1.match(/openExternal/g) || []).length);
console.log('composable 里 openExternal 出现:', (check2.match(/openExternal/g) || []).length);
