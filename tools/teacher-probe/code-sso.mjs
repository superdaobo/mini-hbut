// 一码通（code.hbut.edu.cn）教师身份 SSO：host/open → CAS 换票 → tid → getToken
// 产出：把 accessToken/tid 写进 teacher_session_<sid>.json 的 one_code 字段
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { probe, mask, UA } from './probe-lib.mjs';

const SID = process.env.TEACHER_SID || '20000000';
const TMP = process.env.TEMP || os.tmpdir();
const SESSION_FILE = path.join(TMP, `teacher_session_${SID}.json`);
const CODE = 'https://code.hbut.edu.cn';
const AUTH = 'https://auth.hbut.edu.cn';

const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

// 手动跟随重定向，逐步收集 cookie（probe 不存 cookie，这里自己维护 code 域）
const extra = {}; // domain -> {name:value}
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
    (extra[domain] ||= {})[name] = value;
  }
}

function cookieFor(host) {
  const parts = [];
  for (const [domain, cookies] of Object.entries(session.domains || {})) {
    const d = domain.replace(/^\./, '');
    if (host === d || host.endsWith('.' + d)) for (const [k, v] of Object.entries(cookies)) parts.push(`${k}=${v}`);
  }
  for (const [domain, cookies] of Object.entries(extra)) {
    const d = domain.replace(/^\./, '');
    if (host === d || host.endsWith('.' + d)) for (const [k, v] of Object.entries(cookies)) parts.push(`${k}=${v}`);
  }
  return parts.join('; ');
}

async function get(url, opts = {}) {
  const u = new URL(url);
  const headers = { 'User-Agent': opts.ua || UA, ...(opts.headers || {}) };
  const ck = cookieFor(u.hostname);
  if (ck) headers.Cookie = ck;
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body, redirect: 'manual' });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  storeSetCookie(sc, u.hostname);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text, headers: res.headers };
}

async function follow(start, maxHops = 15, ua) {
  let cur = start;
  const hops = [];
  for (let i = 0; i < maxHops; i++) {
    const r = await get(cur, { ua });
    hops.push({ url: cur.slice(0, 130), status: r.status, loc: (r.location || '').slice(0, 130) });
    if (r.status >= 300 && r.status < 400 && r.location) {
      cur = new URL(r.location, cur).toString();
      continue;
    }
    return { hops, finalUrl: cur, status: r.status, text: r.text, headers: r.headers };
  }
  return { hops, finalUrl: cur, status: 0, text: '' };
}

const out = { sid: SID, steps: [] };

// 1) 先让 CAS 把 code 的 service 票签出来（我们已有 CASTGC）
const codeService = `${CODE}/server/auth/host/open?host=28&org=2`;
const ssoUrl = `${AUTH}/authserver/login?service=${encodeURIComponent(codeService)}`;
const cas = await follow(ssoUrl);
out.steps.push({ stage: 'cas-for-code', hops: cas.hops, finalUrl: cas.finalUrl.slice(0, 160), status: cas.status });

let tid = '';
{
  const m = cas.finalUrl.match(/tid=([^&"']+)/) || cas.text.match(/tid=([^&"']+)/);
  if (m) tid = decodeURIComponent(m[1]);
}
out.steps.push({ stage: 'extract-tid', tid: tid ? '<len=' + tid.length + '>' : 'MISS' });

// 2) 直接走 host/open（自动重定向链）
if (!tid) {
  const r = await follow(codeService, 15);
  out.steps.push({ stage: 'host-open', hops: r.hops, finalUrl: r.finalUrl.slice(0, 160) });
  const m = r.finalUrl.match(/tid=([^&"']+)/) || r.text.match(/tid=([^&"']+)/);
  if (m) tid = decodeURIComponent(m[1]);
}

// 3) getToken（必须 POST JSON）
let token = null;
if (tid) {
  const r = await get(`${CODE}/server/auth/getToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: `${CODE}/?tid=${tid}&orgId=2` },
    body: JSON.stringify({ tid, orgId: 2 }),
  });
  try { token = JSON.parse(r.text); } catch {}
  out.steps.push({ stage: 'getToken', status: r.status, sample: mask(r.text).slice(0, 400) });
}

// 4) 若拿到 accessToken，验证 user/info
const at = token?.resultData?.accessToken || token?.accessToken || token?.data?.accessToken;
if (at) {
  const r = await get(`${CODE}/server/user/info`, { headers: { Authorization: at } });
  out.steps.push({ stage: 'user-info', status: r.status, sample: mask(r.text).slice(0, 300) });
}

// 5) 落盘
session.one_code = {
  tid: tid || null,
  token: token || null,
  extra_cookies: extra,
  probed_at: new Date().toISOString(),
};
fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');

console.log(JSON.stringify(out, null, 2));
console.log('\n== 结果 ==');
console.log('tid:', tid ? '有 (len=' + tid.length + ')' : 'MISS');
console.log('token:', token ? Object.keys(token).join(',') : 'MISS');
