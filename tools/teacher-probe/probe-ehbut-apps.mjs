// dump 完整服务列表卡 + 搜一码通入口域
import { probe, mask } from './probe-lib.mjs';
import fs from 'node:fs';

const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const J = { 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const cards = JSON.parse(fs.readFileSync(`${OUT}/cards.json`, 'utf8'));
const dumps = {};
for (const c of cards) {
  const r = await probe(`https://e.hbut.edu.cn/execCardMethod/${c.cardWid}/${c.cardId}`,
    { method: 'POST', headers: J, body: JSON.stringify({ method: 'renderData', param: { fromMaster: true } }) });
  dumps[c.cardId] = JSON.parse(mask(r.text));
  await sleep(250);
}
fs.writeFileSync(`${OUT}/cards-full.masked.json`, JSON.stringify(dumps, null, 1), 'utf8');

// 提取所有服务条目
const seen = new Map(); // serviceWid -> record
function collect(o, src) {
  if (Array.isArray(o)) return o.forEach(x => collect(x, src));
  if (o && typeof o === 'object') {
    if (o.serviceWid && (o.serviceName || o.pcAccessUrl)) {
      seen.set(o.serviceWid + '|' + src, {
        name: o.serviceName, wid: o.serviceWid, pc: o.pcAccessUrl, mobile: o.mobileAccessUrl,
        src, perm: o.permission, fav: o.favorite, station: o.serviceStation,
        type: o.serviceType, visit: o.visitCount, extra: Object.keys(o).filter(k => !/icon|Link|Name|wid|Url|time|Time|num|Num|count|Count/.test(k)),
      });
    }
    for (const v of Object.values(o)) collect(v, src);
  }
}
for (const [cid, d] of Object.entries(dumps)) collect(d.data, cid);
const list = [...seen.values()];
fs.writeFileSync(`${OUT}/services-catalog.masked.json`, JSON.stringify(list, null, 1), 'utf8');
console.log('== unique services:', list.length);
const domains = new Map();
for (const s of list) {
  try { const h = new URL(s.pc).hostname; domains.set(h, (domains.get(h) || 0) + 1); } catch { domains.set('(no-url)', (domains.get('(no-url)') || 0) + 1); }
}
console.log('== pcAccessUrl domains:'); for (const [h, n] of [...domains].sort((a, b) => b[1] - a[1])) console.log('  ', n, h);
console.log('\n== 一码通/code 相关:');
for (const s of list) if (/code\.hbut|一码通|yimatong|校园码|二维码/.test((s.pc || '') + (s.name || '') + (s.mobile || ''))) console.log('  ', JSON.stringify(s));
console.log('\n== all services:');
for (const s of list) console.log('  ', s.name, '->', (s.pc || '').slice(0, 110));
