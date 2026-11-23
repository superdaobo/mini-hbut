import { probe } from './probe-lib.mjs';

// 试多种过滤方式找当前学期的班级
const tries = [
  ['query.bjmc||', 'query.bjmc||=25建筑学'],
  ['query.rxnf||', 'query.rxnf||=2025'],
  ['bjmc 裸参数', 'bjmc=25建筑学2'],
  ['rxnf 裸参数', 'rxnf=2025'],
  ['大页', 'page.pn=1&page.size=500'],
];

let target = null;
for (const [name, q] of tries) {
  const r = await probe(
    `https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid&${q}`,
    {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1',
      },
    },
  );
  const rows = r.json?.results || [];
  const hit = rows.find((x) => String(x.bjmc || '').includes('25建筑学'));
  console.log(
    `[${name}] total=${r.json?.total} 返回=${rows.length} 首个=${rows[0]?.bjmc || '-'} 命中25建筑学=${!!hit}`,
  );
  if (hit && !target) target = hit;
  await new Promise((x) => setTimeout(x, 250));
}

if (!target) {
  console.log('\n未找到 25 级班级，改用返回里 rxnf 最新的一个');
  const r = await probe(
    'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid&page.pn=1&page.size=200',
    {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1',
      },
    },
  );
  const rows = r.json?.results || [];
  target = rows
    .filter((x) => x.rxnf)
    .sort((a, b) => String(b.rxnf).localeCompare(String(a.rxnf)))[0];
}

if (!target) {
  console.log('无可用班级');
  process.exit(0);
}

console.log(
  `\n目标: ${target.bjmc} | rxnf=${target.rxnf} | bjbh=${target.bjbh} | xqdm=${target.xqdm}`,
);

const url =
  'https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/sdpkkbList?' +
  new URLSearchParams({
    xnxq: target.xnxq || '2026-2027-1',
    id: target.encodeId || '',
    xqdm: target.xqdm || '1',
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
const j = r.json;
console.log(`sdpkkbList: ${r.status} len=${r.text.length}`);
if (Array.isArray(j)) {
  console.log(`数组长度: ${j.length}`);
  if (j[0]) {
    console.log('首条字段:', Object.keys(j[0]).join(','));
    console.log('首条:', JSON.stringify(j[0]).slice(0, 500));
  }
} else {
  console.log('非数组:', JSON.stringify(j).slice(0, 300));
}
