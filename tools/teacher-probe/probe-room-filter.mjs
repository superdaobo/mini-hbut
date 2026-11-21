import { probe } from './probe-lib.mjs';

const base =
  'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid&page=1&rows=5&xnxq=2026-2027-1';
const variants = [
  ['无参（基线）', ''],
  ['jsmc=篮球馆303', '&jsmc=' + encodeURIComponent('篮球馆303')],
  ['jsbh=体育-002', '&jsbh=' + encodeURIComponent('体育-002')],
  ['query.jsmc||', '&query.jsmc||=' + encodeURIComponent('篮球馆303')],
  ['query.jsbh||', '&query.jsbh||=' + encodeURIComponent('体育-002')],
  ['jsmc=篮球馆', '&jsmc=' + encodeURIComponent('篮球馆')],
];

for (const [name, q] of variants) {
  const r = await probe(base + q, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/pkglcroomkb',
    },
  });
  const rows = r.json?.results || [];
  console.log(
    `[${name}] total=${r.json?.total} 返回=${rows.length} 首个=${rows[0]?.jsmc || '-'}`,
  );
  await new Promise((x) => setTimeout(x, 220));
}
