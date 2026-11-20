// 一码通教师端批量存在性验证：只跑只读查询路径，无参先探形态
import fs from 'node:fs';
import path from 'node:path';
import { call, dump, results } from './code-lib.mjs';

const PATHS = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'code-paths.json'), 'utf8'));

// 只读白名单：get*/query*/list*/config/*List/getXxx
const WRITE = /(bind|unbind|pay|recharge|refund|loss|report|update|delete|save|add|submit|confirm|transfer|apply\/submit|scan|password|change)/i;
const targets = PATHS.filter(p => {
  const last = p.split('/').pop();
  if (WRITE.test(p)) return false;
  return /^(get|query|list|config|my|check|find|search)/i.test(last) || /(List|Config)$/.test(last) || /\/(home|car|card|consume|apply|alumuns|captcha)\//.test(p);
});

console.log('候选接口数:', targets.length);

let i = 0;
for (const p of targets) {
  i++;
  try {
    const r = await call(p.replace('/server/', ''), p, {});
    const tag = r.status === 200 ? '200' : String(r.status);
    console.log(`[${i}/${targets.length}] ${tag} ${p}  ${(r.sample || '').slice(0, 90).replace(/\n/g, ' ')}`);
  } catch (e) {
    console.log(`[${i}/${targets.length}] ERR ${p} ${String(e).slice(0, 80)}`);
  }
}

const out = dump();
console.log('\n落盘:', out, '条数:', results.length);
