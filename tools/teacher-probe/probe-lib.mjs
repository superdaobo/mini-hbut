// 通用请求器：从 teacher_session_<sid>.json 注入 cookie，按域名匹配
// 供各探测子代理复用：import { probe } from './probe-lib.mjs'
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SID = process.env.TEACHER_SID || '20000000';
const TMP = process.env.TEMP || os.tmpdir();
const SESSION_FILE = process.env.TEACHER_SESSION || path.join(TMP, `teacher_session_${SID}.json`);

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

let session = null;
export function loadSession() {
  if (!session) session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  return session;
}

/** 取某 host 可用的 cookie 头（含父域回退 + code 域 SSO 补票 cookie） */
export function cookieHeader(host) {
  const s = loadSession();
  const parts = [];
  const merge = (domains) => {
    for (const [domain, cookies] of Object.entries(domains || {})) {
      const d = domain.replace(/^\./, '');
      if (host === d || host.endsWith('.' + d)) {
        for (const [k, v] of Object.entries(cookies)) parts.push(`${k}=${v}`);
      }
    }
  };
  merge(s.domains);
  merge(s.one_code?.extra_cookies);
  return parts.join('; ');
}

/** 发请求，自动带 cookie；返回 {status, headers, text, json, ms} */
export async function probe(url, opts = {}) {
  const u = new URL(url);
  const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
  const ck = cookieHeader(u.hostname);
  if (ck) headers['Cookie'] = ck;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
    redirect: opts.redirect || 'manual',
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, location: res.headers.get('location'), text, json, ms };
}

/** 判定响应是否已掉登录（返回登录页） */
export function isLoginPage(r) {
  if (!r) return false;
  if (r.status === 302 && /authserver\/login/.test(r.location || '')) return true;
  return /<title>\s*(登录|统一身份认证)/.test(r.text || '') || /id="pwdEncryptSalt"/.test(r.text || '');
}

/** 脱敏：去掉工号/学号/姓名/token */
export function mask(s, sid = SID) {
  if (typeof s !== 'string') s = JSON.stringify(s);
  let out = s;
  if (sid) out = out.split(sid).join('***SID***');
  out = out.replace(/\b\d{10}\b/g, '***SID***');
  out = out.replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '***PHONE***');
  out = out.replace(/("(?:userName|currentUserName|realName|studentName|teacherName|empname)"\s*:\s*")[^"]+/g, '$1***NAME***');
  out = out.replace(/((?:accessToken|refreshToken|token|Authorization)"\s*:\s*")[^"]{8,}/g, '$1***TOKEN***');
  return out;
}
