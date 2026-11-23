// 删除 sourceReason computed（已不再使用）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/features/teacher/views/TeacherClassScheduleView.vue';
const raw = fs.readFileSync(p, 'utf8');
const lines = raw.split(/\r?\n/);

const out = [];
let skipping = false;
for (const line of lines) {
  const t = line.trim();
  if (t.startsWith('/** 底部说明：后端 reason 存在则直出')) {
    skipping = true;
    continue;
  }
  if (skipping) {
    // 跳过 sourceReason computed 的三行
    if (t.startsWith('const sourceReason = computed(')) continue;
    if (t.startsWith('() => scheduleSource.value?.reason')) continue;
    if (t === ')') {
      skipping = false;
      continue;
    }
    // 其它内容不跳过
    skipping = false;
  }
  out.push(line);
}

const next = out.join('\n');
fs.writeFileSync(p, next, 'utf8');
console.log('sourceReason 残留:', (next.match(/sourceReason/g) || []).length);
console.log('scheduleSource 残留:', (next.match(/scheduleSource/g) || []).length);
console.log('行数变化:', lines.length, '→', out.length);
