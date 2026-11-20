// hall/datacenter 卡片（card 单数结构）
import { probe, mask } from './probe-lib.mjs';
import fs from 'node:fs';
const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const J = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const cards = [
  { page: 'hall', cardWid: '1809922293628241', cardId: 'CUS_CARD_ALLSERVICE' },
  { page: 'datacenter', cardWid: '2662243601602181', cardId: 'SYS_CARD_RECOMMENDSUBJECT' },
];
for (const c of cards) {
  for (const method of ['renderData', 'getConfig']) {
    const rr = await probe(`https://e.hbut.edu.cn/execCardMethod/${c.cardWid}/${c.cardId}`,
      { method: 'POST', headers: J, body: JSON.stringify({ method, param: { fromMaster: true } }) });
    results.push({ page: `card-${c.page}-${c.cardId}-${method}`, url: `https://e.hbut.edu.cn/execCardMethod/${c.cardWid}/${c.cardId}`, method: 'POST', params: method, status: rr.status, ms: rr.ms, fields: rr.json ? `errcode=${rr.json.errcode} ${rr.json.data && typeof rr.json.data === 'object' ? Object.keys(rr.json.data).slice(0, 15).join(',') : String(rr.json.data).slice(0, 60)}` : rr.text.slice(0, 60), sample: mask(rr.text).slice(0, 900) });
    console.log(c.page, c.cardId, method, '->', rr.json?.errcode);
    fs.writeFileSync(`${OUT}/card-${c.page}-${c.cardId}-${method}.masked.json`, mask(rr.text), 'utf8');
    await sleep(250);
  }
}
fs.writeFileSync(`${OUT}/ehbut-teacher-probe-05-pagecards.json`, JSON.stringify(results, null, 1), 'utf8');
// 提取 ALLSERVICE 里的服务
const all = JSON.parse(fs.readFileSync(`${OUT}/card-hall-CUS_CARD_ALLSERVICE-renderData.masked.json`, 'utf8'));
console.log('\n== ALLSERVICE data keys:', Object.keys(all.data || {}));
const out = [];
function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === 'object') { if (o.serviceName && o.serviceWid) out.push({ name: o.serviceName, wid: o.serviceWid, pc: o.pcAccessUrl, mobile: o.mobileAccessUrl }); for (const v of Object.values(o)) walk(v); } }
walk(all.data);
console.log('services:', out.length);
out.slice(0, 60).forEach(s => console.log('  ', s.name, '->', (s.pc || '').slice(0, 100)));
fs.writeFileSync(`${OUT}/allservice-catalog.masked.json`, JSON.stringify(out, null, 1), 'utf8');
