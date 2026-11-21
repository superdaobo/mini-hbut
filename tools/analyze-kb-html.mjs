import fs from 'node:fs';

const html = fs.readFileSync(
  'D:/wt/teacher-portal-probe-1120/tools/teacher-probe/page-ckbjkb-real.html',
  'utf8',
);

// td class 分布
const cls = {};
for (const m of html.matchAll(/<td[^>]*class="([^"]+)"/g)) {
  const key = m[1].split(' ')[0];
  cls[key] = (cls[key] || 0) + 1;
}
console.log('=== td class 分布（前 8）===');
Object.entries(cls)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

// 含 kb 的 div class
const divs = [...html.matchAll(/<div[^>]*class="([^"]*kb[^"]*)"/g)].map((m) => m[1]);
console.log('\n=== 含 kb 的 div class（前 10）===');
[...new Set(divs)].slice(0, 10).forEach((c) => console.log(`  ${c}`));

// 找一段真正的课程格子内容：搜索 "周" 且邻近有课程名
const courseNames = ['建筑设计', '建筑', '设计', '英语', '数学', '思政', '体育'];
let found = null;
for (const name of courseNames) {
  const idx = html.indexOf(name);
  if (idx > 0) {
    found = { name, idx };
    break;
  }
}
if (found) {
  console.log(`\n=== 课程名「${found.name}」附近 400 字符 ===`);
  console.log(html.slice(found.idx - 200, found.idx + 200).replace(/\s+/g, ' '));
} else {
  console.log('\n未找到常见课程名，改看 td 内部结构');
  const tdMatch = html.match(/<td[^>]*class="[^"]*kb-content[^"]*"[^>]*>([\s\S]{0,400}?)<\/td>/);
  if (tdMatch) console.log(tdMatch[0].replace(/\s+/g, ' ').slice(0, 400));
}

// 看是否有 JSON 数据内嵌
const jsonHints = ['var kbData', 'kbList', 'scheduleData', 'courses =', 'courseList'];
console.log('\n=== 内嵌 JSON 变量探测 ===');
for (const hint of jsonHints) {
  const idx = html.indexOf(hint);
  if (idx > 0) {
    console.log(`  找到 ${hint} @ ${idx}`);
    console.log(`    ${html.slice(idx, idx + 200).replace(/\s+/g, ' ')}`);
  }
}
