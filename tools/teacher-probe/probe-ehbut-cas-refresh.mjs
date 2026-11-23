// 用 CAS ticket 刷新 e.hbut 门户会话（无密码、只读、走正常导航链路）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mask } from './probe-lib.mjs';

const SID = process.env.TEACHER_SID || '20000000';
const s = JSON.parse(fs.readFileSync(path.join(process.env.TEMP || os.tmpdir(), `teacher_session_${SID}.json`), 'utf8'));
const jar = {};
// 初始化 jar：所有域按 host 匹配
function cookieFor(host) {
  const parts = [];
  for (const [domain, cookies] of Object.entries(s.domains || {})) {
    const d = domain.replace(/^\./, '');
    if (host === d || host.endsWith('.' + d)) for (const [k, v] of Object.entries(cookies)) parts.push(`${k}=${v}`);
  }
  // 去重，后者覆盖
  const m = new Map(parts.map(p => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
  return [...m].map(([k, v]) => `${k}=${v}`).join('; ');
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36';
const jars = {}; // host -> {k:v}
function jarStr(host) {
  const j = jars[host] || {};
  return Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');
}
function seed(host) { jars[host] = {}; for (const p of cookieFor(host).split('; ')) { const i = p.indexOf('='); if (i > 0) jars[host][p.slice(0, i)] = p.slice(i + 1); } }
function absorb(host, res) {
  const setc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setc) { const m = c.match(/^([^=]+)=([^;]*)/); if (m && m[1]) (jars[host] ||= {})[m[1].trim()] = m[2]; }
}
async function go(url) {
  const u = new URL(url); if (!jars[u.hostname]) seed(u.hostname);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: jarStr(u.hostname) }, redirect: 'manual' });
  absorb(u.hostname, res);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text };
}

// 1) e.hbut /login -> CAS -> ticket -> e.hbut
let url = 'https://e.hbut.edu.cn/login';
for (let i = 0; i < 8; i++) {
  const r = await go(url);
  console.log(`[${r.status}] ${url.slice(0, 130)}`);
  if (r.location) console.log(`    -> ${r.location.slice(0, 160)}`);
  if (r.status === 200) break;
  if (!r.location) break;
  url = new URL(r.location, url).href;
  await new Promise(r2 => setTimeout(r2, 250));
}
// 2) 用刷新后的 jar 测卡片
const J = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
for (const [w, id] of [['9793387617112675', 'CUS_CARD_ALLSERVICEBUS'], ['21021468792076103', 'CUS_CARD_TODOTASK'], ['13036226013086594', 'CUS_CARD_MYAPP']]) {
  const r = await go('https://e.hbut.edu.cn/execCardMethod/' + w + '/' + id);
  console.log('GET card(预期405/405):', id, r.status);
  const res = await fetch('https://e.hbut.edu.cn/execCardMethod/' + w + '/' + id, { method: 'POST', headers: { 'User-Agent': UA, Cookie: jarStr('e.hbut.edu.cn'), ...J }, body: JSON.stringify({ method: 'renderData', param: { fromMaster: true } }) });
  absorb('e.hbut.edu.cn', res);
  const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch {}
  console.log('  POST', id, '->', j?.errcode, t.slice(0, 120));
  await new Promise(r2 => setTimeout(r2, 250));
}
// 3) 保存刷新后的 e.hbut cookie 供后续复用（不落敏感值到仓库？落 jar 键名即可）
const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
fs.writeFileSync(`${OUT}/refreshed-ehbut-cookies.json`, JSON.stringify(jars['e.hbut.edu.cn'] || {}), 'utf8');
console.log('jar keys saved:', Object.keys(jars['e.hbut.edu.cn'] || {}));
