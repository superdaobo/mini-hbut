// 逐行修复图标映射（避开 \r 与正则 $ 的坑）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/composables/useTeacherHome.ts';
const raw = fs.readFileSync(p, 'utf8');
const lines = raw.split(/\r?\n/);

// 找出两个映射块的行范围
const iconStart = lines.findIndex((l) => l.includes('TEACHER_MODULE_ICONS: Record'));
const colorStart = lines.findIndex((l) => l.includes('TEACHER_MODULE_ICON_COLORS: Record'));

function fixBlock(startIdx) {
  if (startIdx < 0) return 0;
  let fixed = 0;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '}') break;
    const m = /^\s*(teacher[a-zA-Z]+):\s*'([^']+)'\s*,?\s*$/.exec(line);
    if (m) {
      lines[i] = `    ${m[1]}: '${m[2]}',`;
      fixed += 1;
    }
  }
  return fixed;
}

const n1 = fixBlock(iconStart);
const n2 = fixBlock(colorStart);

// 去掉每个块最后一项的多余逗号
function stripLastComma(startIdx) {
  if (startIdx < 0) return;
  let lastItem = -1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '}') break;
    if (/^\s*teacher[a-zA-Z]+:/.test(lines[i])) lastItem = i;
  }
  if (lastItem > 0) {
    lines[lastItem] = lines[lastItem].replace(/,\s*$/, '');
  }
}
stripLastComma(iconStart);
stripLastComma(colorStart);

fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log(`图标块修复 ${n1} 行，配色块修复 ${n2} 行`);
console.log('=== 图标块 ===');
lines.slice(iconStart, iconStart + 15).forEach((l) => console.log('  ' + l));
