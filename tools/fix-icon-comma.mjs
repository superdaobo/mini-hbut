// 修复图标映射缺逗号 + 缩进（node 脚本插入时漏了逗号）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/composables/useTeacherHome.ts';
let c = fs.readFileSync(p, 'utf8');

// 1) 把 6 空格缩进的 teacher* 行规范为 4 空格，并在行末补逗号（若不是最后一项）
c = c.replace(/^ {6}(teacher[a-z]+: '[^']+')$/gm, '    $1,');
// 2) 最后一项（紧跟 `  }` 的那行）去掉多余逗号
c = c.replace(/^(    teacher[a-z]+: '[^']+'),\n(  \})/gm, '$1\n$2');

fs.writeFileSync(p, c, 'utf8');

const lines = c.split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('TEACHER_MODULE_ICONS: Record'));
console.log('=== 修复后图标块 ===');
lines.slice(start, start + 15).forEach((l) => console.log('  ' + l));
