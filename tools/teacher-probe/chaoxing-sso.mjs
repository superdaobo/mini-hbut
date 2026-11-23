// 学习通（chaoxing）教师身份会话：CAS → fysso/cassso/hbutsie → logindsso → loginfanya
// 成功后把 .chaoxing.com 关键 cookie 统一导出为 chaoxing.com 域，供任何子域使用
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { UA } from './probe-lib.mjs';

const SID = process.env.TEACHER_SID || '20000000';
const TMP = process.env.TEMP || os.tmpdir();
const SESSION_FILE = path.join(TMP, `teacher_session_${SID}.json`);
const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

const jar = new Map(); // "domain|name" -> {name,value,domain}

function storeSetCookie(list, host) {
  for (const sc of list) {
    const [pair, ...attrs] = sc.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    let domain = host;
    for (const a of attrs) {
      const [k, v] = a.split('=');
      if (k && k.trim().toLowerCase() === 'domain' && v) domain = v.trim().replace(/^\./, '');
    }
    if (!name) continue;
    jar.set(`${domain}|${name}`, { name, value, domain });
  }
}

function seedFromSession() {
  for (const [domain, cookies] of Object.entries(session.domains || {})) {
    for (const [k, v] of Object.entries(cookies)) jar.set(`${domain}|${k}`, { name: k, value: v, domain });
  }
}

function cookieFor(host) {
  const parts = [];
  for (const c of jar.values()) {
    const d = c.domain.replace(/^\./, '');
    if (host === d || host.endsWith('.' + d)) parts.push(`${c.name}=${c.value}`);
  }
  return parts.join('; ');
}

async function get(url, opts = {}) {
  const u = new URL(url);
  const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
  const ck = cookieFor(u.hostname);
  if (ck) headers.Cookie = ck;
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body, redirect: 'manual' });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  storeSetCookie(sc, u.hostname);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text };
}

async function follow(start, maxHops = 15, headers = {}) {
  let cur = start;
  const hops = [];
  for (let i = 0; i < maxHops; i++) {
    const r = await get(cur, { headers });
    hops.push({ url: cur.slice(0, 150), status: r.status, loc: (r.location || '').slice(0, 150) });
    if (r.status >= 300 && r.status < 400 && r.location) {
      cur = new URL(r.location, cur).toString();
      continue;
    }
    return { hops, finalUrl: cur, status: r.status, text: r.text };
  }
  return { hops, finalUrl: cur, status: 0, text: '' };
}

seedFromSession();
const out = { steps: [] };

// 1) CAS → FYSSO 桥接
const casUrl = 'https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Ffysso.chaoxing.com%2Fcassso%2Fhbutsie';
const bridge = await follow(casUrl, 15);
out.steps.push({ stage: 'cas-to-fysso', hops: bridge.hops, finalUrl: bridge.finalUrl.slice(0, 160), status: bridge.status });

// 2) 激活教务镜像会话
const jw = await follow('https://hbut.jw.chaoxing.com/admin/', 10, { Referer: 'https://i.chaoxing.com/' });
out.steps.push({ stage: 'jwxt-mirror', finalUrl: jw.finalUrl.slice(0, 140), status: jw.status });

// 3) 用 mooc 接口激活（不碰 i.chaoxing.com/base，避免清 cookie）
const mooc = await get('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1', {
  headers: { Accept: 'application/json, text/plain, */*', Referer: 'https://mooc1.chaoxing.com/' },
});
out.steps.push({ stage: 'mooc-backclazzdata', status: mooc.status, len: mooc.text.length, sample: mooc.text.slice(0, 200) });

// 4) 汇总 chaoxing 相关 cookie
const KEY_NAMES = new Set(['UID', '_uid', 'fid', 'cx_p_token', 'p_auth_token', 'xxtenc', '_d', 'uf', 'spaceFid', 'spaceRoleId', 'vc3', 'roleEnc', 'uf_role']);
const cx = {};
const all = {};
for (const c of jar.values()) {
  const d = c.domain.replace(/^\./, '');
  if (!/chaoxing\.com$/.test(d) && d !== 'chaoxing.com') continue;
  (all[d] ||= {})[c.name] = c.value;
  if (KEY_NAMES.has(c.name)) cx[c.name] = c.value;
}

const hasUid = !!(cx.UID || cx._uid);
out.hasUid = hasUid;
out.cookieNames = Object.keys(cx);
out.domains = Object.keys(all);

// 5) 导出：关键 cookie 统一挂到 chaoxing.com（父域），各域保留原样
if (hasUid) {
  session.domains['chaoxing.com'] = cx;
  for (const [d, cookies] of Object.entries(all)) {
    session.domains[d] = { ...(session.domains[d] || {}), ...cookies };
  }
  session.chaoxing = { bridged_at: new Date().toISOString(), hasUid, keys: Object.keys(cx) };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
}

console.log(JSON.stringify(out, null, 2));
console.log('\n== 结果 ==');
console.log('hasUid:', hasUid, '| 关键 cookie:', Object.keys(cx).join(',') || '(无)');
