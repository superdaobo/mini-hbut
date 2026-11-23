// 下载 SPA 相关 chunk 并静态提取 /admin/ 接口
import fs from 'node:fs';
import path from 'node:path';
import { probe } from './probe-lib.mjs';

const DIR = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw/fe-chunks';
fs.mkdirSync(DIR, { recursive: true });
const BASE = 'https://jwxt.hbut.edu.cn/fe/assets/';

const CHUNKS = [
  // teacherTtbApply 路由
  'index-71f293db.js','index-f12a645a.js','index-12c34cdf.js','AttachmentWrap-7b78e4d9.js',
  'index-8f9d87de.js','index-177ba49e.js','index.vue_vue_type_style_index_0_lang-6bbfdcd6.js',
  'teacher_role-005abf41.js','admin_role-eb64c63e.js','index-8d053a57.js','index-f5821ae7.js',
  'MessageBox-a0a6d4a7.js','sendNotice-81c14016.js','user-8e1c6956.js','role-c9343d85.js',
  'CheckBox-5ebcc578.js','CuRadio-90cdf84c.js','weeklyIndex-bcb9a896.js','CourseTable-359fd44f.js',
  'semesterIndex-0022a4d5.js','index-5c01cf88.js','PendApprove-df06aefa.js','pageTemplate2-54dd2899.js',
  'SvgIcon2-1871b022.js','useTtbApprove-1c1900ba.js','Modal-b6383962.js','VerticalTab-e2c86d39.js',
  'DetailModal-e1531e81.js',
  // eduStat 路由
  'eduStat-99e2b457.js','FieldTable-9cb94372.js','index-2b8e34f1.js','useBaseData-7930cf49.js',
  'index-91660c41.js','AlertBar-097f5c89.js','index-97816861.js','workInfoModal-0ce4abc7.js',
  'workload-fdf61092.js','delete-8665e249.js','footer-5e4f10ef.js','collegePercent-2301dd49.js',
  'workload-89a8c124.js','toolTip-52b618fd.js','index-1293f096.js','promptModal-168f19ea.js',
  'index-417a2d4d.js','alert-0781468c.js','addNewMajor-4392bea8.js',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = [];
for (const c of CHUNKS) {
  const f = path.join(DIR, c);
  if (fs.existsSync(f) && fs.statSync(f).size > 100) { ok.push(c); continue; }
  try {
    const r = await probe(BASE + c);
    if (r.status === 200 && r.text.length > 50) {
      fs.writeFileSync(f, r.text);
      ok.push(c);
      console.log('ok', c, r.text.length);
    } else console.log('miss', c, r.status, r.text.length);
  } catch (e) { console.log('err', c, e.message); }
  await sleep(120);
}
console.log('downloaded', ok.length, '/', CHUNKS.length);

// 静态提取: 形如 request.get('/admin/...') / http.post('/admin/...') / url:'/admin/...'
const apiSet = new Map(); // path -> {methods:Set, files:Set}
for (const c of ok) {
  const js = fs.readFileSync(path.join(DIR, c), 'utf8');
  for (const m of js.matchAll(/(?:\.(?:get|post|put|delete|request)\s*\(\s*|url\s*[:=]\s*|api\s*[:=]\s*|action\s*[:=]\s*)["'`]((?:\/)?admin\/[^"'`{}]+|\$\{[^}]+\}\/admin\/[^"'`{}]+)[\"'`]/g)) {
    const p = m[1].replace(/^\$?\{?[^}]*\}?\/?/, '/').replace(/\/+/g, '/');
    const method = (/\.(get|post|put|delete)\s*\(/.test(m[0]) ? m[0].match(/\.(get|post|put|delete)/)[1] : (m[0].includes('post') ? 'post' : 'unknown')).toUpperCase();
    if (!apiSet.has(p)) apiSet.set(p, { methods: new Set(), files: new Set() });
    apiSet.get(p).methods.add(method); apiSet.get(p).files.add(c);
  }
  // 裸字符串常量 '/admin/...'
  for (const m of js.matchAll(/["'`](\/admin\/[A-Za-z0-9_\/.\-]+)["'`]/g)) {
    const p = m[1];
    if (!apiSet.has(p)) apiSet.set(p, { methods: new Set(), files: new Set() });
    apiSet.get(p).methods.add('STR'); apiSet.get(p).files.add(c);
  }
}
const out = [...apiSet.entries()].map(([path, v]) => ({ path, methods: [...v.methods], files: [...v.files] }));
fs.writeFileSync('D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw/fe-api-static.json', JSON.stringify(out, null, 2));
console.log('api paths:', out.length);
