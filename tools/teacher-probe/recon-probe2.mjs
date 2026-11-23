// recon-probe2.mjs — 补充实测：/twork 微服务 + ttb SPA 参数化 GET
import fs from 'node:fs';
import { probe, isLoginPage } from './probe-lib.mjs';

const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw/jwxt-teacher-probe2.json';
const B = 'https://jwxt.hbut.edu.cn';
const XNXQ = '2026-2027-1';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

const TASKS = [
  // ============ /twork 微服务（工作量 SPA 真实前缀）============
  { page: '工作量SPA', url: `/twork/jsd/current-user-info`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/jsd/current-user-gzl`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/jsd/search`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/config/current-data`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/config/current-nd-xnxq`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/config/currentXnxqList`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/config/ifLock`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/all-enum`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/jw-system-xnxn`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/xnxq-search-info`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/xy-search-info`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/search`, method: 'GET', note: 'GET 形态试' },
  { page: '工作量SPA', url: `/twork/append/search`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/append/js-xy-search-info`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/append/jxb-js-xy-gzl`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/del/search`, method: 'GET', note: 'del 前缀查询,谨慎但语义为 search' },
  { page: '工作量SPA', url: `/twork/system/jxb-js-gzl`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/jxb-js-xy-gzl`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/read_jxbZcMx`, method: 'GET' },
  { page: '工作量SPA', url: `/twork/system/data-import`, method: 'GET', note: 'GET 形态确认是否只读' },
  { page: '工作量SPA', url: `/admin/api/system/getYxForGzl`, method: 'GET', note: '对照(已在第一轮)' },
  { page: '工作量SPA', url: `/admin/StuGrade/CurrentUserYx`, method: 'POST', body: ``, headers: FORM, note: '纯查询 POST' },

  // ============ ttb SPA 补测参数化 ============
  { page: '调停补SPA', url: `/admin/jsd/ttbgl/queryTtbxxList?listtype=js&xnxq=${XNXQ}`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/jsd/ttbgl/queryTtbxxList?listtype=js&xnxq=${XNXQ}&pageNo=1&pageSize=10`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/jyjs2/getTeacherPageList?pageNo=1&pageSize=10`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/zkb/getZkb?xnxq=${XNXQ}&bjid=`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/xqkb/getXqkb?xnxq=${XNXQ}&bjid=`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/xqkb/getBjList?xnxq=${XNXQ}`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/xqkb/getBjTkxx?xnxq=${XNXQ}`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/xqkb/getTop?xnxq=${XNXQ}`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/jcsjsz/getJcsz`, method: 'POST', body: `xnxq=${XNXQ}`, headers: FORM, note: 'POST 查询形态' },
  { page: '调停补SPA', url: `/admin/pk/pkttbgl/showZcxsList`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pk/pkttbgl/querybcpzxx`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pk/pkttbgl/jssqsnapshot`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/sdznpk/getPkxxByJxbid?jxbid=0fa2a700a1d544ca809a91e70b44a6be`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/sdznpk/getZcxspzByJxbid?jxbid=0fa2a700a1d544ca809a91e70b44a6be`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pkgl/sdznpk/checkThjsCtzc?xnxq=${XNXQ}`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/system/jxzy/jxl/getJxlList`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/xkgl/xkrwgl/ajaxListDatas`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/system/jcsj/zysj/getZyList`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/system/jcsj/bmsj/getKkjysList`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/system/jcsj/bmsj/getKkjysListNoAuth`, method: 'GET' },
  // 移动端教师查询 补充
  { page: '移动端/教师查询', url: `/admin/jwxtgld/jscx/jsxxlist?yxid=`, method: 'GET', note: '无 yxid 对照' },
  // 教学班成绩查看页（带真实 jxbid 的 encodeId 不可构造，试 jxbid 明文）
  { page: '教学班成绩查询', url: `/admin/jsd/jsdcjcx/jsdxscjck?id=`, method: 'GET', note: '无 id 形态' },
  // 监考详情
  { page: '监考安排', url: `/admin/jsd/kwglJsdJkcx/detail`, method: 'GET' },
  // getJxbzcxq 对照（无 jxbid）
  { page: '我的课表', url: `/admin/pkgl/pkgljskb/getJxbzcxq?xnxq=${XNXQ}&jxbid=`, method: 'GET', note: '空 jxbid 对照' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const IDENT = new Set(['currentUserId','userRoleId','dataAuth','dataXnxq','currentRoleId','currentJsId','currentUserName','currentDepartmentId','new']);

function summarize(r) {
  const out = { status: r.status, ms: r.ms };
  if (isLoginPage(r)) { out.note = '!!! 会话失效'; return out; }
  const j = r.json;
  if (j && typeof j === 'object') {
    if ('ret' in j) out.ret = j.ret;
    if ('code' in j) out.code = j.code;
    if ('msg' in j) out.msg = String(j.msg).slice(0, 100);
    if ('message' in j) out.msg = String(j.message).slice(0, 100);
    if ('total' in j) out.total = j.total;
    const rows = j.results || j.rows || (Array.isArray(j) ? j : null);
    if (Array.isArray(rows)) {
      out.rowsReturned = rows.length;
      if (rows[0] && typeof rows[0] === 'object') out.fields = Object.keys(rows[0]).filter(k => !IDENT.has(k)).slice(0, 50);
      else out.fields = [`array(len=${rows.length})`];
    } else if (j.data !== undefined) {
      if (Array.isArray(j.data)) {
        out.rowsReturned = j.data.length;
        if (j.data[0] && typeof j.data[0] === 'object') out.fields = Object.keys(j.data[0]).filter(k => !IDENT.has(k)).slice(0, 50);
        else out.fields = [`array(len=${j.data.length})`];
      } else if (j.data && typeof j.data === 'object') {
        out.fields = Object.keys(j.data).filter(k => !IDENT.has(k)).slice(0, 50);
        if (j.data.items) out.itemsLen = j.data.items.length;
        if (j.data.total !== undefined) out.total = j.data.total;
      } else out.dataScalar = JSON.stringify(j.data)?.slice(0, 80);
    }
    if (!out.fields && !Array.isArray(j)) {
      const biz = Object.keys(j).filter(k => !['ret','msg','message','page','rows','total','totalPages','results','extend','data','success','code','timestamp','status','error','path'].includes(k));
      if (biz.length) out.fields = biz.slice(0, 50);
    }
    out.shape = 'json';
  } else {
    const t = r.text || '';
    out.shape = t.trimStart().startsWith('<') ? 'html' : 'text';
    const tm = t.match(/<title>\s*([^<]+)/i);
    if (tm) out.title = tm[1].trim().slice(0, 60);
    out.bytes = t.length;
    out.snippet = t.replace(/\s+/g, ' ').slice(0, 100);
  }
  return out;
}

const results = [];
let i = 0;
for (const t of TASKS) {
  i++;
  let r, err = null;
  for (let a = 0; a < 2; a++) {
    try { r = await probe(B + t.url, { method: t.method, body: t.body, headers: t.headers }); break; }
    catch (e) { err = e; await sleep(400); }
  }
  const rec = { page: t.page, url: t.url, method: t.method };
  if (t.note) rec.note = t.note;
  if (t.body !== undefined) rec.params = t.body;
  if (err) rec.error = String(err.message || err);
  else Object.assign(rec, summarize(r));
  results.push(rec);
  console.log(`[${i}/${TASKS.length}]`, t.method, t.url, '→', rec.status || rec.error,
    rec.ret !== undefined ? `ret=${rec.ret}` : '', rec.code !== undefined ? `code=${rec.code}` : '',
    rec.total !== undefined ? `total=${rec.total}` : '', rec.fields ? `fields=${rec.fields.length}` : '', rec.title || '');
  if (rec.note && rec.note.includes('会话失效')) break;
  await sleep(120 + Math.random() * 180);
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log('DONE ->', OUT, results.length);
