// 补教室课表 i18n + CSS
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/wt/teacher-portal-probe-1120/apps/client';
const DIR = `${ROOT}/src/utils/i18n/messages`;

const ENTRIES = [
  ['teacher.schedule.room.gridHint', '选择教室后在下方直接查看课表', 'Pick a room to view its schedule below', '教室を選ぶと下に時間割が表示されます'],
  ['teacher.schedule.room.courseCount', '共 {n} 条排课', '{n} entries', '全 {n} 件'],
  ['teacher.schedule.room.noCourses', '该教室本学期无排课', 'No classes in this room this semester', '今学期の授業はありません'],
  ['teacher.schedule.room.backToList', '返回教室列表', 'Back to room list', '教室一覧に戻る'],
];

const FILES = [
  ['zh-CN.ts', 1],
  ['en.ts', 2],
  ['ja.ts', 3],
];
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

for (const [file, index] of FILES) {
  const full = path.join(DIR, file);
  let text = fs.readFileSync(full, 'utf8');
  const missing = ENTRIES.filter(([k]) => !text.includes(`'${k}':`));
  if (missing.length === 0) {
    console.log(`${file}: 已存在`);
    continue;
  }
  const block = missing
    .map(([k, ...langs]) => `    '${k}': '${esc(langs[index - 1])}',`)
    .join('\n');
  const tail = /\r?\n\}\r?\n?$/.exec(text);
  if (!tail) throw new Error(`${file}: 找不到收尾`);
  text = `${text.slice(0, tail.index)}\n\n    // goal-22：教室课表网格\n${block}${text.slice(tail.index)}`;
  fs.writeFileSync(full, text, 'utf8');
  console.log(`${file}: 新增 ${missing.length} 条`);
}

// CSS
const cssPath = `${ROOT}/src/styles/views/TeacherRoomSchedule.scoped.css`;
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('.tch-rs-grid-wrap')) {
  css += `
/* ── goal-22：教室课表网格区块 ─────────────────────────────────── */
.tch-rs-card--clickable {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tch-rs-card--clickable:active {
  transform: scale(0.985);
}
.tch-rs-open {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: rgb(37, 99, 235);
}

.tch-rs-grid-wrap {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 20px;
  padding: 12px 10px 10px;
  box-shadow: 0 8px 24px -4px rgba(37, 99, 235, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.02);
}

.tch-rs-grid-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 12px;
  text-align: center;
  color: rgb(148, 163, 184);
}

.tch-rs-grid-empty .material-symbols-outlined {
  font-size: 26px;
}

.tch-rs-back-list {
  display: block;
  width: 100%;
  margin-top: 10px;
  padding: 9px 0;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: rgb(37, 99, 235);
  background: rgba(219, 234, 254, 0.5);
}

html:is(.dark, [data-theme='graphite_night']) .tch-rs-open {
  color: #93c5fd;
}

html:is(.dark, [data-theme='graphite_night']) .tch-rs-grid-wrap {
  background: #111827;
  border-color: rgba(148, 163, 184, 0.14);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 8px 24px -12px rgba(0, 0, 0, 0.6);
}

html:is(.dark, [data-theme='graphite_night']) .tch-rs-grid-empty {
  color: rgb(100, 116, 139);
}

html:is(.dark, [data-theme='graphite_night']) .tch-rs-back-list {
  color: #93c5fd;
  background: rgba(96, 165, 250, 0.12);
}
`;
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('CSS 已追加');
} else {
  console.log('CSS 已存在');
}

// 三语一致性
const sets = FILES.map(([f]) => {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  const keys = new Set();
  for (const m of t.matchAll(/^\s*'([a-zA-Z0-9_.]+)':/gm)) keys.add(m[1]);
  return { f, keys };
});
const [base, ...rest] = sets;
console.log(`\n${base.f}: ${base.keys.size}`);
for (const o of rest) {
  const miss = [...base.keys].filter((k) => !o.keys.has(k));
  const extra = [...o.keys].filter((k) => !base.keys.has(k));
  console.log(`${o.f}: ${o.keys.size} | 缺 ${miss.length} | 多 ${extra.length}`);
}
