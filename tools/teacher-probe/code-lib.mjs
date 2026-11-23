// 一码通（code.hbut.edu.cn）教师端只读接口探测
// 鉴权：POST JSON + Authorization: <accessToken>（无 Bearer）
// 加密：success=false 时 data 为 SM4-ECB 密文（key=w687-9+3C_H&je_5）
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { probe, mask } from './probe-lib.mjs';

const KEY = Buffer.from('w687-9+3C_H&je_5', 'utf8');
const SID = process.env.TEACHER_SID || '20000000';
const SESSION_FILE = path.join(process.env.TEMP || os.tmpdir(), `teacher_session_${SID}.json`);
const OUT = process.env.PROBE_OUT || path.join(process.cwd(), '..', '..', 'data', 'teacher-portal-recon-1120', 'raw', 'code-teacher-probe.json');

export function sm4Decrypt(b64) {
  try {
    const d = crypto.createDecipheriv('sm4-ecb', KEY, null);
    d.setAutoPadding(true);
    return Buffer.concat([d.update(Buffer.from(b64, 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    return '<decrypt-failed: ' + e.message + '>';
  }
}

const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
let TOKEN = session.one_code?.token?.resultData?.accessToken;

/** 自动 refresh：token 1h 过期 */
async function refresh() {
  const rt = session.one_code?.token?.resultData?.refreshToken;
  if (!rt) throw new Error('无 refreshToken');
  const r = await probe('https://code.hbut.edu.cn/server/auth/updateToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  const j = r.json;
  if (j?.success && j.resultData?.accessToken) {
    session.one_code.token = j;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
    TOKEN = j.resultData.accessToken;
    return true;
  }
  return false;
}

const results = [];

/**
 * 调一个 code 域接口。默认 POST JSON（这是该系统的真实形态）。
 * @param {string} name 逻辑名
 * @param {string} p 路径，如 /server/home/config
 * @param {object} body 请求体
 */
export async function call(name, p, body = {}, opts = {}) {
  const url = 'https://code.hbut.edu.cn' + p;
  const method = opts.method || 'POST';
  const headers = { 'Content-Type': 'application/json', Authorization: TOKEN, Referer: 'https://code.hbut.edu.cn/' };
  const r = await probe(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  let plain = r.text;
  let decrypted = null;
  try {
    const j = JSON.parse(r.text);
    if (typeof j.data === 'string' && j.data.length > 16) {
      decrypted = sm4Decrypt(j.data);
      plain = JSON.stringify(j).slice(0, 300) + ' || decrypted=' + decrypted.slice(0, 1200);
    }
  } catch {}
  const rec = {
    name,
    path: p,
    method,
    body: opts.recordBody === false ? undefined : body,
    status: r.status,
    ms: r.ms,
    sample: mask(plain).slice(0, 1500),
  };
  results.push(rec);
  await new Promise(res => setTimeout(res, 150));
  return rec;
}

export function dump() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8');
  return OUT;
}

export { TOKEN, refresh, results, SESSION_FILE };
