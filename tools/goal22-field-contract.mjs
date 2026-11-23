// goal-22 / T08：给字段对照表补 class_schedule 模块
import fs from 'node:fs';

const p = 'D:/wt/teacher-portal-probe-1120/tools/t14-field-contract.mjs';
let c = fs.readFileSync(p, 'utf8');

if (c.includes("key: 'class_schedule'")) {
  console.log('已存在');
  process.exit(0);
}

const anchor = `  {
    key: 'chaoxing_teacher', title: '学习通教师侧',`;
const addition = `  {
    key: 'class_schedule', title: '班级/教室课表',
    be: path.join(BE, 'class_schedule.rs'),
    fe: path.join(FE, 'composables/useTeacherScheduleGrid.ts'),
    upstream: 'GET /admin/pkgl/kbcx/bjkb/sdpkkbList（班级）+ /pkglcroomkb/sdpkkbList（教室）',
    note: '与学生课表同一接口同一套字段；tmc/croommc/kcmc 是 HTML，已剥离；连堂已合并（46→16）',
  },
  {
    key: 'chaoxing_teacher', title: '学习通教师侧',`;

if (c.includes(anchor)) {
  c = c.replace(anchor, addition);
  fs.writeFileSync(p, c, 'utf8');
  console.log('已加 class_schedule 模块');
} else {
  console.log('锚点未找到');
}
