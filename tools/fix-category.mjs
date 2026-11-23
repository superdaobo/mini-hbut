// goal-21 修复：教务系统与学习通分开（新增 chaoxing 一级分类）
import fs from 'node:fs';

const catalogPath =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/config/teacher_feature_catalog.ts';
let c = fs.readFileSync(catalogPath, 'utf8');

// 1) 类型：academic | resource -> academic | chaoxing | resource
c = c.replace(
  "export type TeacherFeatureCategory = 'academic' | 'resource'",
  "export type TeacherFeatureCategory = 'academic' | 'chaoxing' | 'resource'",
);

// 2) 分类定义：在 academic 之后插入 chaoxing
c = c.replace(
  "  { id: 'academic', labelKey: 'teacher.category.academic' },\n  { id: 'resource', labelKey: 'teacher.category.resource' }",
  "  { id: 'academic', labelKey: 'teacher.category.academic' },\n  // goal-21：学习通独立分类（教师端学情不属于教务系统）\n  { id: 'chaoxing', labelKey: 'teacher.category.chaoxing' },\n  { id: 'resource', labelKey: 'teacher.category.resource' }",
);

// 3) 学情条目归类改为 chaoxing
c = c.replace(
  /(id: 'teacher_chaoxing_analytics',\s*\n\s*viewId: 'teacherchaoxinganalytics',\s*\n\s*category: )'academic'/,
  "$1'chaoxing'",
);

fs.writeFileSync(catalogPath, c, 'utf8');

const hasType = c.includes("'academic' | 'chaoxing' | 'resource'");
const hasCategory = c.includes("id: 'chaoxing', labelKey: 'teacher.category.chaoxing'");
const movedItem = /id: 'teacher_chaoxing_analytics',[\s\S]{0,120}?category: 'chaoxing'/.test(c);
console.log('类型扩展:', hasType);
console.log('分类定义:', hasCategory);
console.log('学情归类:', movedItem);
