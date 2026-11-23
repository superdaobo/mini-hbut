// dump getPageView 完整 renderData + 下载前端 bundle 提取 API 路径
import { probe, mask } from './probe-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const TMP = 'D:/wt/teacher-portal-probe-1120/tools/teacher-probe';
fs.mkdirSync(OUT, { recursive: true });

// 1) getPageView 完整响应（default 站点 + office 站点）
for (const [tag, url] of [
  ['default', 'https://e.hbut.edu.cn/index.html#/'],
  ['office', 'https://e.hbut.edu.cn/index.html#/office'],
]) {
  const r = await probe(`https://e.hbut.edu.cn/getPageView?_t=${Date.now()}&pageCode=&originalUrl=${encodeURIComponent(url)}&lang=zh_CN`);
  fs.writeFileSync(`${OUT}/pageview-${tag}.masked.json`, mask(r.text), 'utf8');
  if (r.json?.data?.renderData) {
    const rd = r.json.data.renderData;
    console.log(`== ${tag} renderData keys:`, Object.keys(rd));
    for (const [k, v] of Object.entries(rd)) {
      if (typeof v === 'object' && v) console.log(`   ${k}: ${Array.isArray(v) ? `arr(${v.length})` : Object.keys(v).slice(0, 20).join(',')}`);
    }
  }
  await new Promise(r2 => setTimeout(r2, 250));
}

// 2) 下载 JS bundle
const idx = await probe('https://e.hbut.edu.cn/index.html');
const scripts = [...idx.text.matchAll(/src="(\/js\/[^"]+\.js)"/g)].map(m => m[1]);
console.log('\n== scripts:', scripts);
const bundleDir = `${TMP}/bundle`; fs.mkdirSync(bundleDir, { recursive: true });
const apiSet = new Set();
for (const s of scripts) {
  const r = await probe('https://e.hbut.edu.cn' + s);
  const fname = path.basename(s);
  fs.writeFileSync(`${bundleDir}/${fname}`, r.text, 'utf8');
  console.log(`   ${fname}: ${r.status} ${r.text.length}B`);
  // 提取 API 路径
  for (const m of r.text.matchAll(/['"`](\/[a-zA-Z][\w\-/]{3,})['"`]/g)) apiSet.add(m[1]);
  await new Promise(r2 => setTimeout(r2, 150));
}
// 再扫 index.html 本身
for (const m of idx.text.matchAll(/['"`](\/[a-zA-Z][\w\-/]{3,})['"`]/g)) apiSet.add(m[1]);

const apis = [...apiSet].sort();
fs.writeFileSync(`${OUT}/bundle-api-paths.txt`, apis.join('\n'), 'utf8');
console.log(`\n== extracted ${apis.length} unique paths`);
console.log(apis.filter(a => !/\.(js|css|png|jpg|svg|woff|ico|json|map|gif)/.test(a)).join('\n'));
