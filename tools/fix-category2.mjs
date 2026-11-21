// 插入 chaoxing 分类定义（PowerShell 转义太坑，改用脚本文件）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/config/teacher_feature_catalog.ts';
let c = fs.readFileSync(p, 'utf8');

const anchor = "  { id: 'academic', labelKey: 'teacher.category.academic' },";
const insert =
  anchor +
  "\n  // goal-21：学习通独立分类（教师端学情不属于教务系统）\n  { id: 'chaoxing', labelKey: 'teacher.category.chaoxing' },";

if (c.includes("id: 'chaoxing', labelKey")) {
  console.log('已存在，跳过');
} else if (c.includes(anchor)) {
  c = c.replace(anchor, insert);
  fs.writeFileSync(p, c, 'utf8');
  console.log('已插入 chaoxing 分类');
} else {
  console.log('锚点未找到');
}

// 校验
const check = fs.readFileSync(p, 'utf8');
console.log('含 chaoxing 分类:', check.includes("id: 'chaoxing', labelKey"));
console.log('类型:', /'academic' \| 'chaoxing' \| 'resource'/.test(check));
console.log('学情归类 chaoxing:', /id: 'teacher_chaoxing_analytics',[\s\S]{0,140}?category: 'chaoxing'/.test(check));
