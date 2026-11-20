// 带滚动 cookie jar 的探测：验证 execCardMethod 是否需要实时会话
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mask } from './probe-lib.mjs';

const SID = process.env.TEACHER_SID || '20000000';
const SESSION_FILE = path.join(process.env.TEMP || os.tmpdir(), `teacher_session_${SID}.json`);
const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

// 滚动 cookie jar（仅 e.hbut.edu.cn 域）
const jar = { ...(s.domains['e.hbut.edu.cn'] || {}), ...(s.domains['.hbut.edu.cn'] || {}), ...(s.domains['edu.cn'] || {}) };
function cookieStr() { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36';
const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const results = [];

async function req(url, opts = {}) {
  const headers = { 'User-Agent': UA, Cookie: cookieStr(), ...(opts.headers || {}) };
  const t0 = Date.now();
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body, redirect: 'manual' });
  const setc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setc) {
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m && m[1] && !/^(Path|Domain|Expires|Max-Age|HttpOnly|SameSite|Secure)/.test(m[1])) jar[m[1].trim()] = m[2];
  }
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, ms: Date.now() - t0, location: res.headers.get('location'), setc: setc.map(c => c.split(';')[0].split('=')[0]) };
}

function rec(page, url, method, params, r, note) {
  results.push({ page, url: mask(url), method, params: mask(JSON.stringify(params || '')).slice(0, 250), status: r.status, ms: r.ms, location: r.location || '', setCookies: r.setc, fields: r.json ? `errcode=${r.json.errcode}` + (r.json.data && typeof r.json.data === 'object' ? ' keys:' + Object.keys(r.json.data).slice(0, 20).join(',') : ` data=${String(r.json.data).slice(0, 60)}`) : r.text.slice(0, 80), note: note || '', sample: mask(r.text).slice(0, 900) });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

// 先刷一次页面拿实时 cookie
let r = await req('https://e.hbut.edu.cn/index.html'); rec('init', 'index.html', 'GET', {}, r, '刷新会话');
await sleep(250);
r = await req('https://e.hbut.edu.cn/getLoginUser'); rec('init', 'getLoginUser', 'GET', {}, r, '');
await sleep(250);
// 卡片测试
const cards = [['21021468792076103', 'CUS_CARD_TODOTASK'], ['9793387617112675', 'CUS_CARD_ALLSERVICEBUS'], ['13036226013086594', 'CUS_CARD_MYAPP'], ['30287114549572314', 'CUS_CARD_HOTAPP'], ['5357818446432585', 'CUS_CARD_FAVORITEAPP'], ['484468705917928', 'CUS_CARD_MYTASK'], ['5624209932143497', 'CUS_CARD_DONETASK'], ['7207554905914351', 'CUS_CARD_COPYME']];
for (const [w, id] of cards) {
  r = await req(`https://e.hbut.edu.cn/execCardMethod/${w}/${id}`, { method: 'POST', headers: J, body: JSON.stringify({ method: 'renderData', param: { fromMaster: true } }) });
  rec('card', `/execCardMethod/${w}/${id}`, 'POST', { method: 'renderData', param: { fromMaster: true } }, r, '');
  console.log(id, '->', r.json?.errcode);
  await sleep(250);
}
fs.writeFileSync(`${OUT}/ehbut-teacher-probe-03-jar.json`, JSON.stringify(results, null, 1), 'utf8');
fs.writeFileSync(`${OUT}/jar-final.json`, JSON.stringify({ keys: Object.keys(jar) }, null, 1), 'utf8');
console.log('DONE; jar keys:', Object.keys(jar).join(','));
