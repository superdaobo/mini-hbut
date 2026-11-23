import fs from 'node:fs';
import { probe } from './probe-lib.mjs';

// 1) 教室列表：看有没有 encodeId / xnxq
const list = await probe(
  'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid&page=1&rows=3&xnxq=2026-2027-1',
  {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb',
    },
  },
);
const rows = list.json?.results || [];
console.log(`教室列表 total=${list.json?.total} 返回=${rows.length}`);
if (rows[0]) {
  console.log('字段:', Object.keys(rows[0]).filter((k) => !k.startsWith('current') && k !== 'new').join(','));
  const r = rows[0];
  for (const k of ['jsbh', 'jsmc', 'encodeId', 'xnxq', 'xqdm', 'jxldm', 'jxlmc']) {
    if (k in r) console.log(`  ${k} = ${JSON.stringify(r[k]).slice(0, 60)}`);
  }
}

// 2) 抓 ckcroomkb 页面，找内部 AJAX
const t = rows[0];
const url =
  'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb/ckcroomkb?' +
  new URLSearchParams({
    id: t?.encodeId || '',
    xnxq: t?.xnxq || '2026-2027-1',
    xqdm: t?.xqdm || '1',
  }).toString();
const page = await probe(url, {
  headers: { Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb' },
});
console.log(`\nckcroomkb: ${page.status} ${page.text.length} bytes`);
fs.writeFileSync('page-ckcroomkb.html', page.text, 'utf8');

const urls = [
  ...new Set(
    [...page.text.matchAll(/url\s*:\s*['"]([^'"]{4,140})['"]/g)].map((m) => m[1]),
  ),
];
console.log('页面内 AJAX 接口:');
urls.forEach((u) => console.log('  ' + u));

// 3) 找课表数据变量
const kbVars = [
  ...new Set(
    [...page.text.matchAll(/function\s+(\w*(?:[Kk]b|[Kk]cb|[Cc]ourse)\w*)\s*\(/g)].map((m) => m[1]),
  ),
];
console.log('\n含 kb/course 的函数:', kbVars.slice(0, 12).join(', ') || '(无)');
