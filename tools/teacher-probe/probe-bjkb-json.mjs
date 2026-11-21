import { probe } from './probe-lib.mjs';

// 1) 取一个班级的 encodeId
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
const target =
  rows.find((r) => String(r.bjmc || '').includes('25建筑学')) || rows[0];
console.log('目标班级:', target?.bjmc, '| bjbh:', target?.bjbh);

// 2) 调 sdpkkbList（班级课表 JSON）
const url =
  'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/sdpkkbList?' +
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
    kcxz: '',
  }).toString();

const r = await probe(url, {
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1',
  },
});
console.log('sdpkkbList:', r.status, '| json:', !!r.json, '| len:', r.text.length);

if (r.json) {
  const j = r.json;
  console.log('顶层键:', Object.keys(j).join(','));
  console.log('ret:', j.ret, '| msg:', String(j.msg || '').slice(0, 40));
  const data = j.data;
  console.log('data 类型:', Array.isArray(data) ? `数组(${data.length})` : typeof data);
  const first = Array.isArray(data) ? data[0] : null;
  if (first) {
    console.log('首条字段:', Object.keys(first).join(','));
    console.log('首条样例:', JSON.stringify(first).slice(0, 400));
  }
} else {
  console.log('HTML 片段:', r.text.slice(0, 200).replace(/\s+/g, ' '));
}
