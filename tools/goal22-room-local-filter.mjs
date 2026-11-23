// 给 rooms computed 加本地 keyword 过滤（教室列表不支持服务端搜索）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/composables/useTeacherScheduleLists.ts';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

const start = lines.findIndex((l) => l.includes('const rooms = computed<TeacherScheduleRoom[]>'));
if (start < 0) {
  console.log('未找到 rooms computed');
  process.exit(1);
}
// 找到该 computed 的结束 `})`
let end = -1;
for (let i = start; i < lines.length; i++) {
  if (lines[i].trim() === '})') {
    end = i;
    break;
  }
}
if (end < 0) {
  console.log('未找到结束');
  process.exit(1);
}

const indent = lines[start].match(/^\s*/)[0];
const replacement = [
  `${indent}const rooms = computed<TeacherScheduleRoom[]>(() => {`,
  `${indent}  const list = state.value.data?.rooms ?? []`,
  `${indent}  const filter = buildingFilter.value`,
  `${indent}  // goal-22：教室列表**不支持服务端搜索**（实测 jsmc 精确匹配返 0、query.jsmc|| 无效），`,
  `${indent}  // 所以 keyword 由前端本地匹配（教室名 / 编号）。`,
  `${indent}  const kw = keyword.value.trim().toLowerCase()`,
  `${indent}  let out = list`,
  `${indent}  if (kw) {`,
  `${indent}    out = out.filter(`,
  `${indent}      (item) =>`,
  `${indent}        item.roomName.toLowerCase().includes(kw) ||`,
  `${indent}        item.roomNo.toLowerCase().includes(kw)`,
  `${indent}    )`,
  `${indent}  }`,
  `${indent}  if (filter) {`,
  `${indent}    out = out.filter((item) => item.buildingName === filter)`,
  `${indent}  }`,
  `${indent}  return out`,
  `${indent}})`,
];

lines.splice(start, end - start + 1, ...replacement);
fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('rooms computed 已加本地 keyword 过滤');
