// 给 TeacherScheduleRoom 补 encodeId/semester/campusId + normalizeRoom 补字段
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/composables/useTeacherScheduleLists.ts';
let c = fs.readFileSync(p, 'utf8');

// 1) 类型：在 capacity 后补三个字段（锚点用 roomType 注释确保唯一）
const typeAnchor = `    /** 座位容量（zdskrnrs）。 */
    capacity: number | null
  }`;
if (c.includes(typeAnchor) && !c.includes('encodeId: string')) {
  c = c.replace(
    typeAnchor,
    `    /** 座位容量（zdskrnrs）。 */
    capacity: number | null
    /** 加密 ID（goal-22：教室课表查询必须要它）。 */
    encodeId: string
    /** 学期（xnxq）。 */
    semester: string
    /** 校区代码（xqdm）。 */
    campusId: string
  }`,
  );
  console.log('类型已补');
} else {
  console.log('类型已存在或锚点未命中');
}

// 2) normalizeRoom：看实际实现
const idx = c.indexOf('const normalizeRoom');
if (idx >= 0) {
  console.log('--- normalizeRoom 片段 ---');
  console.log(c.slice(idx, idx + 700));
}

fs.writeFileSync(p, c, 'utf8');
