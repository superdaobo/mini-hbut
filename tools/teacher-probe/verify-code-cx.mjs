// 解密 code 域 SM4-ECB 响应（key 硬编码），验证教师身份；并探测 chaoxing 各域登录态
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { probe, mask } from './probe-lib.mjs';

const KEY = Buffer.from('w687-9+3C_H&je_5', 'utf8'); // 16B → SM4-128

function sm4Decrypt(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    const d = crypto.createDecipheriv('sm4-ecb', KEY, null);
    d.setAutoPadding(true);
    return Buffer.concat([d.update(buf), d.final()]).toString('utf8');
  } catch (e) {
    return '<decrypt-failed: ' + e.message + '>';
  }
}

const SID = process.env.TEACHER_SID || '20000000';
const SESSION_FILE = path.join(process.env.TEMP || os.tmpdir(), `teacher_session_${SID}.json`);
const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
const at = session.one_code?.token?.resultData?.accessToken;
const out = {};

// 1) 教师身份（code 域 user/info）
if (at) {
  const r = await probe('https://code.hbut.edu.cn/server/user/info', { headers: { Authorization: at } });
  const j = r.json;
  if (j && typeof j.data === 'string') {
    const plain = sm4Decrypt(j.data);
    try {
      const d = JSON.parse(plain);
      const u = d.resultData?.user || {};
      out.code_user = {
        success: d.success,
        username: u.username ? '<len=' + u.username.length + '>' : null,
        positionCode: u.positionCode,
        positionName: u.positionName,
        departName: u.departName,
        schoolName: u.schoolName,
        hasCard: u.hasCard,
        accStatusName: u.accStatusName,
      };
    } catch {
      out.code_user = { decryptFail: plain.slice(0, 200) };
    }
  } else {
    out.code_user = { status: r.status, sample: mask(r.text).slice(0, 200) };
  }
}

// 2) chaoxing 各域登录态探测（只读）
const CX_TARGETS = [
  ['hbut.jw.chaoxing.com', 'https://hbut.jw.chaoxing.com/'],
  ['i.chaoxing.com', 'https://i.chaoxing.com/base'],
  ['mooc1.chaoxing.com', 'https://mooc1.chaoxing.com/visit/interaction'],
  ['mooc1-api.chaoxing.com', 'https://mooc1-api.chaoxing.com/mycourse/backclazzdata'],
  ['passport2.chaoxing.com', 'https://passport2.chaoxing.com/mlogin?fid=25368'],
  ['fysso.chaoxing.com', 'https://fysso.chaoxing.com/'],
];
out.chaoxing = {};
for (const [name, url] of CX_TARGETS) {
  try {
    const r = await probe(url);
    const title = (r.text.match(/<title>([^<]*)<\/title>/) || [, ''])[1].trim().slice(0, 60);
    const needLogin = /login|登录|请先登录|passport2/.test(r.location || '') ||
                      /请先登录|用户登录|统一身份认证/.test(r.text.slice(0, 4000));
    out.chaoxing[name] = { status: r.status, loc: (r.location || '').slice(0, 100), title, needLogin, len: r.text.length };
  } catch (e) {
    out.chaoxing[name] = { error: String(e).slice(0, 120) };
  }
  await new Promise(r => setTimeout(r, 200));
}

console.log(JSON.stringify(out, null, 2));
