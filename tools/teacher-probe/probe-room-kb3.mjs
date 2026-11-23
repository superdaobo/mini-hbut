import { probe } from './probe-lib.mjs';

const list = await probe(
  'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid&page=1&rows=40&xnxq=2026-2027-1',
  {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb',
    },
  },
);
const rows = list.json?.results || [];
console.log(`候选教室: ${rows.length} 间`);

let found = null;
for (const t of rows) {
  const url =
    'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb/sdpkkbList?' +
    new URLSearchParams({
      xnxq: t.xnxq || '2026-2027-1',
      id: t.encodeId || '',
      xqdm: t.xqdm || '1',
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
  const arr = Array.isArray(r.json) ? r.json : [];
  if (arr.length > 0) {
    console.log(`\n✅ 有课教室: ${t.jsmc} (${t.jsbh}) → ${arr.length} 条`);
    console.log('字段:', Object.keys(arr[0]).join(','));
    console.log('首条:', JSON.stringify(arr[0]).slice(0, 500));
    found = { room: t, entries: arr };
    break;
  }
  await new Promise((x) => setTimeout(x, 200));
}

if (!found) {
  console.log('\n⚠️ 40 间教室全部返回空数组');
  console.log('结论：接口可用（200 + JSON 数组），但当前学期这些教室无排课数据');
  console.log('或：教室课表需要额外参数（如 zc 周次）');
}
