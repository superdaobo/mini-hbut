// CAS 登录：教师账号 → 建立 auth.hbut.edu.cn 会话（CASTGC），导出各域 cookie
// 用法: node cas-login.mjs <sid>
// 只读：仅登录 + 取 token，不触碰任何业务写接口
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SID = process.argv[2] || '20000000';
const TMP = process.env.TEMP || os.tmpdir();
const CRED_FILE = path.join(TMP, `portal_session_${SID}.json`);
const OUT_FILE = path.join(TMP, `teacher_session_${SID}.json`);

const BASE = 'https://auth.hbut.edu.cn';
const OCR = 'https://mini.hbut.site/api/ocr/recognize';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

// ── cookie jar ────────────────────────────────────────────────
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
    jar.set(`${domain}|${name}`, { name, value, domain });
  }
}

function cookieHeader(host) {
  const out = [];
  for (const c of jar.values()) {
    if (host === c.domain || host.endsWith('.' + c.domain)) out.push(`${c.name}=${c.value}`);
  }
  return out.join('; ');
}

function jarFor(host) {
  const o = {};
  for (const c of jar.values()) {
    if (host === c.domain || host.endsWith('.' + c.domain)) o[c.name] = c.value;
  }
  return o;
}

async function req(url, opts = {}) {
  const u = new URL(url);
  const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
  const ck = cookieHeader(u.hostname);
  if (ck) headers['Cookie'] = ck;
  const res = await fetch(url, { ...opts, headers, redirect: 'manual' });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  storeSetCookie(sc, u.hostname);
  return res;
}

// ── CAS 密码盐加密（复算页面 encrypt.js 的 encryptPassword）────
const AES_CHARS = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
function randomString(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += AES_CHARS[Math.floor(Math.random() * AES_CHARS.length)];
  return s;
}
function encryptPassword(pwd, salt) {
  if (!salt) return pwd;
  const key = Buffer.from(salt, 'utf8');
  const iv = Buffer.from(randomString(16), 'utf8');
  const plain = randomString(64) + pwd;
  const c = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([c.update(plain, 'utf8'), c.final()]).toString('base64');
}

// ── 验证码 OCR ────────────────────────────────────────────────
async function recognize(buf) {
  const res = await fetch(OCR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: Buffer.from(buf).toString('base64') }),
  });
  const j = await res.json();
  if (!j.success || !j.result) throw new Error('OCR 失败: ' + JSON.stringify(j));
  return String(j.result).trim();
}

// ── 跟随重定向 ────────────────────────────────────────────────
async function follow(url, maxHops = 10) {
  let cur = url;
  const hops = [];
  for (let i = 0; i < maxHops; i++) {
    const res = await req(cur);
    hops.push({ url: cur, status: res.status, location: res.headers.get('location') || null });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      cur = new URL(loc, cur).toString();
      continue;
    }
    const text = await res.text();
    return { hops, finalUrl: cur, status: res.status, text };
  }
  return { hops, finalUrl: cur, status: 0, text: '' };
}

function parseHidden(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`)) ||
            html.match(new RegExp(`name="${id}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
}

// ── 主流程 ────────────────────────────────────────────────────
const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
const PASSWORD = cred.portal_password;
if (!PASSWORD) throw new Error('凭据文件里没有 portal_password');

const result = { sid: SID, steps: [], login: null, domains: {} };
let ok = false;

for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
  jar.clear();
  const page = await follow(`${BASE}/authserver/login`);
  const salt = parseHidden(page.text, 'pwdEncryptSalt');
  const execution = parseHidden(page.text, 'execution') || 'e1s1';
  const lt = parseHidden(page.text, 'lt');
  result.steps.push({ attempt, stage: 'get-login-page', status: page.status, salt: salt ? '<16B>' : 'MISS', execution });

  // 验证码：同一会话内立刻取图并识别
  const capRes = await req(`${BASE}/authserver/getCaptcha.htl?${Date.now()}`);
  const capBuf = Buffer.from(await capRes.arrayBuffer());
  const captcha = await recognize(capBuf);
  result.steps.push({ attempt, stage: 'captcha', bytes: capBuf.length, code: captcha });

  const form = new URLSearchParams({
    username: SID,
    password: encryptPassword(PASSWORD, salt),
    captcha,
    lt,
    execution,
    _eventId: 'submit',
    cllt: 'userNameLogin',
    dllt: 'generalLogin',
    pwdEncryptSalt: salt,
  });

  const loginRes = await req(`${BASE}/authserver/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${BASE}/authserver/login` },
    body: form.toString(),
  });
  const loc = loginRes.headers.get('location') || '';
  const bodyText = await loginRes.text();
  result.steps.push({ attempt, stage: 'post-login', status: loginRes.status, location: loc.slice(0, 160) });

  const hasTicket = /ticket=ST-/i.test(loc);
  const toIndex = /index\.do/.test(loc);
  const badCaptcha = /图形动态码|验证码/.test(bodyText);
  const badPwd = /密码错误|账号或密码/.test(bodyText);

  // 无 service 登录时成功形态 = 302 → /authserver/index.do（此时已下发 CASTGC）
  if (loginRes.status === 302 && (hasTicket || toIndex) && !badCaptcha && !badPwd) {
    result.login = { ticket: hasTicket, toIndex, castgc: [...jar.values()].some(c => c.name === 'CASTGC') };
    result.steps.push({ attempt, stage: 'login-ok', location: loc.slice(0, 120) });
    ok = true;
    break;
  }
  result.steps.push({ attempt, stage: 'fail', badCaptcha, badPwd, bodySample: bodyText.replace(/\s+/g, ' ').slice(0, 300) });
  if (badPwd) break; // 密码错就别重试
  await new Promise(r => setTimeout(r, 800));
}

// 导出 cookie
const byDomain = {};
for (const c of jar.values()) {
  (byDomain[c.domain] ||= {})[c.name] = c.value;
}
result.domains = byDomain;
result.ok = ok;

// ── 逐个 SP 走 CAS 换票落地（复用同一个 CASTGC）─────────────
const SPS = [
  { name: 'code', start: 'https://code.hbut.edu.cn/' },
  { name: 'jwxt', start: 'https://jwxt.hbut.edu.cn/admin/caslogin' },
  { name: 'ehbut', start: 'https://e.hbut.edu.cn/' },
];
if (ok) {
  result.sp = {};
  for (const sp of SPS) {
    try {
      const r = await follow(sp.start, 12);
      result.sp[sp.name] = {
        finalUrl: r.finalUrl,
        status: r.status,
        hops: r.hops.map(h => ({ status: h.status, loc: (h.location || '').slice(0, 140) })),
        titleHint: (r.text.match(/<title>([^<]*)<\/title>/) || [, ''])[1].slice(0, 80),
        len: r.text.length,
      };
    } catch (e) {
      result.sp[sp.name] = { error: String(e).slice(0, 200) };
    }
  }
}

// 重新导出（换票会新增 cookie）
const byDomain2 = {};
for (const c of jar.values()) {
  (byDomain2[c.domain] ||= {})[c.name] = c.value;
}
result.domains = byDomain2;

fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
console.log('OK=' + ok, '| 域=' + Object.keys(byDomain).join(','));
console.log('CASTGC=' + (Object.values(byDomain).some(d => d.CASTGC) ? '有' : '无'));
console.log('写出: ' + OUT_FILE);
if (!ok) {
  console.log(JSON.stringify(result.steps.slice(-2), null, 2));
  process.exitCode = 2;
}
