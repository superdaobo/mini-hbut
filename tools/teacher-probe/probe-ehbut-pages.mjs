// 抓 hall/datacenter 页面卡片布局并跑 renderData
import { probe, mask } from './probe-lib.mjs';
import fs from 'node:fs';
const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const J = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];

for (const pageCode of ['hall', 'datacenter']) {
  const url = `https://e.hbut.edu.cn/getPageView?_t=${Date.now()}&pageCode=${pageCode}&originalUrl=${encodeURIComponent('https://e.hbut.edu.cn/index.html#/portal/' + pageCode)}&lang=zh_CN`;
  const r = await probe(url);
  results.push({ page: `pageview-${pageCode}`, url: mask(url), method: 'GET', status: r.status, ms: r.ms, note: '', fields: `errcode=${r.json?.errcode}`, sample: '' });
  fs.writeFileSync(`${OUT}/pageview-${pageCode}.masked.json`, mask(r.text), 'utf8');
  const pie = r.json?.data?.pageContext?.pageInfoEntity;
  console.log(`== ${pageCode}: pageName=${pie?.pageName} pageCode=${pie?.pageCode}`);
  let cards = [];
  try {
    for (const section of JSON.parse(pie?.cardLayout || '[]'))
      for (const col of section.columns || [])
        for (const c of col.cards?.cards || [])
          cards.push(c);
  } catch (e) { console.log('cardLayout parse fail', e.message); }
  console.log('  cards:', cards.map(c => c.cardId).join(','));
  await sleep(250);
  for (const c of cards) {
    const rr = await probe(`https://e.hbut.edu.cn/execCardMethod/${c.cardWid}/${c.cardId}`,
      { method: 'POST', headers: J, body: JSON.stringify({ method: 'renderData', param: { fromMaster: true } }) });
    const rec = { page: `card-${pageCode}-${c.cardId}`, url: mask(`https://e.hbut.edu.cn/execCardMethod/${c.cardWid}/${c.cardId}`), method: 'POST', params: 'renderData fromMaster', status: rr.status, ms: rr.ms, note: (c.layoutCardTitle?.cardTitle || c.cardName || ''), fields: rr.json ? `errcode=${rr.json.errcode} ${rr.json.data && typeof rr.json.data === 'object' ? Object.keys(rr.json.data).slice(0, 15).join(',') : String(rr.json.data).slice(0, 60)}` : rr.text.slice(0, 60), sample: mask(rr.text).slice(0, 900) };
    results.push(rec);
    console.log('   ', c.cardId, '->', rr.json?.errcode, rec.fields.slice(0, 80));
    fs.writeFileSync(`${OUT}/card-${pageCode}-${c.cardId}.masked.json`, mask(rr.text), 'utf8');
    await sleep(250);
  }
}
fs.appendFileSync(`${OUT}/ehbut-teacher-probe-04-pages.json`, JSON.stringify(results, null, 1));
console.log('DONE');
