import { probe } from './probe-lib.mjs';

const list = await probe(
  'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid&page=1&rows=10&xnxq=2026-2027-1',
  {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb',
    },
  },
);
const rows = list.json?.results || [];
// 找一间普通教室（非运动场所），更容易有课
const target =
  rows.find((r) => String(r.jslx || '') !== '22' && String(r.jsmc || '').includes('-')) || rows[0];
console.log(`目标教室: ${target?.jsmc} | jsbh=${target?.jsbh} | jxlmc=${target?.jxlmc}`);
console.log(`encodeId: ${target?.encodeId}`);

const url =
  'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb/sdpkkbList?' +
  new URLSearchParams({
    xnxq: target?.xnxq || '2026-2027-1',
    id: target?.encodeId || '',
    xqdm: target?.xqdm || '1',
    zxzc: '',
    zdzc: '',
    zc: '',
    zxxq: '',
    zdxq: '',
    zxjc: '',
    zdjc: '',
    xsqbkb: '',
    xslx: '',
    schoolCode: '',
  }).toString();

const r = await probe(url, {
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb',
  },
});
console.log(`\nsdpkkbList(教室): ${r.status} len=${r.text.length} json=${!!r.json}`);

if (Array.isArray(r.json)) {
  console.log(`数组长度: ${r.json.length}`);
  if (r.json[0]) {
    console.log('字段:', Object.keys(r.json[0]).join(','));
    console.log('首条:', JSON.stringify(r.json[0]).slice(0, 450));
  }
} else {
  console.log('非数组:', JSON.stringify(r.json).slice(0, 200));
}
