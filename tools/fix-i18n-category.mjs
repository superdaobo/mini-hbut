// 补 teacher.category.chaoxing（三语）
import fs from 'node:fs';
import path from 'node:path';

const DIR =
  'D:/wt/teacher-portal-probe-1120/apps/client/src/utils/i18n/messages';
const ENTRIES = [
  ['teacher.category.chaoxing', '学习通', 'Chaoxing', '学習通'],
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
  text = `${text.slice(0, tail.index)}\n\n    // goal-21：学习通分类\n${block}${text.slice(tail.index)}`;
  fs.writeFileSync(full, text, 'utf8');
  console.log(`${file}: 新增 ${missing.length} 条`);
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
