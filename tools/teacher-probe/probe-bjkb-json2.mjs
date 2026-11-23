import { probe } from './probe-lib.mjs';

const list = await probe(
  'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid&page=1&rows=5&xnxq=2026-2027-1',
  {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1',
    },
  },
);
const rows = list.json?.results || [];
const t = rows[0];
console.log('班级:', t?.bjmc, '| encodeId:', String(t?.encodeId).slice(0, 20), '| xqdm:', t?.xqdm);

const base = {
  xnxq: t?.xnxq || '2026-2027-1',
  id: t?.encodeId || '',
  xqdm: t?.xqdm || '1',
};

const variants = [
  ['仅基础参数', { ...base }],
  ['带 zc=1', { ...base, zc: '1' }],
  ['带 zc=12', { ...base, zc: '12' }],
  ['带 zcStr', { ...base, zc: '12', zxzc: '1', zdzc: '20' }],
  ['POST 表单', null], // 特殊处理
];

for (const [name, params] of variants) {
  let r;
  if (params === null) {
    // POST 表单
    const body = new URLSearchParams({ ...base }).toString();
    r = await probe('https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/sdpkkbList', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1',
      },
      body,
    });
  } else {
    const url =
      'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/sdpkkbList?' +
      new URLSearchParams(params).toString();
    r = await probe(url, {
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1',
      },
    });
  }
  const preview = r.text.slice(0, 160).replace(/\s+/g, ' ');
  console.log(`[${name}] ${r.status} len=${r.text.length} json=${!!r.json} :: ${preview}`);
  await new Promise((x) => setTimeout(x, 250));
}
