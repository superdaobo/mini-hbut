// 按行号补 TeacherScheduleRoom 的 encodeId/semester/campusId（类型 + 归一化）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/composables/useTeacherScheduleLists.ts';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

// 1) 类型：找到 `capacity: number | null` 且下一行是 `  }` 的位置
let typeIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'capacity: number | null' && lines[i + 1]?.trim() === '}') {
    typeIdx = i;
    break;
  }
}
if (typeIdx >= 0 && !lines.slice(typeIdx, typeIdx + 6).join('').includes('encodeId')) {
  lines.splice(
    typeIdx + 1,
    0,
    '    /** 加密 ID（goal-22：教室课表查询必须要它）。 */',
    '    encodeId: string',
    '    /** 学期（xnxq）。 */',
    '    semester: string',
    '    /** 校区代码（xqdm）。 */',
    '    campusId: string',
  );
  console.log('类型已补 @', typeIdx + 1);
} else {
  console.log('类型已存在或未定位', typeIdx);
}

// 2) 归一化：找到 `capacity: asNumber(record.capacity ?? record.zdskrnrs) ?? null`
let normIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('capacity: asNumber(record.capacity ?? record.zdskrnrs)')) {
    normIdx = i;
    break;
  }
}
if (normIdx >= 0 && !lines.slice(normIdx, normIdx + 4).join('').includes('encodeId')) {
  const indent = lines[normIdx].match(/^\s*/)[0];
  lines[normIdx] = lines[normIdx].replace(/\s*$/, '') + ',';
  lines.splice(
    normIdx + 1,
    0,
    `${indent}encodeId: asString(record.encodeId),`,
    `${indent}semester: asString(record.semester ?? record.xnxq),`,
    `${indent}campusId: asString(record.campusId ?? record.xqdm),`,
  );
  console.log('归一化已补 @', normIdx + 1);
} else {
  console.log('归一化已存在或未定位', normIdx);
}

fs.writeFileSync(p, lines.join('\n'), 'utf8');
const check = fs.readFileSync(p, 'utf8');
console.log('encodeId 次数:', (check.match(/encodeId/g) || []).length);
