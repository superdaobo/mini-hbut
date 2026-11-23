// recon-probe3.mjs — 第三轮补测 + 原文抽样
import fs from 'node:fs';
import { probe, isLoginPage, mask } from './probe-lib.mjs';
const B = 'https://jwxt.hbut.edu.cn';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TASKS = [
  // SelectUnion 改 POST（GET 报 method not supported）
  { page: '班级课表', url: `/admin/api/jcsj/bmsj/getYxSelectUnionByStudent`, method: 'POST', body: '' },
  { page: '班级课表', url: `/admin/api/jcsj/zysj/getZySelectUnion`, method: 'POST', body: 'yxid=205' },
  { page: '班级课表', url: `/admin/api/jcsj/bjxx/getBjSelectUnion`, method: 'POST', body: 'yxid=205&zydm=' },
  // getXqrqxx 参数补全
  { page: '空教室', url: `/admin/system/jxzy/jsxx/getXqrqxx`, method: 'POST', body: 'xnxq=2026-2027-1&zc=7&xq=1' },
  { page: '空教室', url: `/admin/system/jxzy/jsxx/getXqrqxx`, method: 'POST', body: 'xnxq=2026-2027-1' },
  // CourseTable 需要的真实 bjid 形态（用一个已知班级 encodeId? 先试 bjbh）
  { page: '调停补SPA', url: `/admin/pkgl/zkb/getZkb?xnxq=2026-2027-1&bjbh=wbj226`, method: 'GET', note: 'bjbh 试' },
  { page: '调停补SPA', url: `/admin/pkgl/xqkb/getXqkb?xnxq=2026-2027-1&xqid=1`, method: 'GET' },
  // 学生异动（POST 形态对照——页面显示为 GET url?gridtype=jqgrid）
  { page: '学生异动申请', url: `/admin/xjgl/xsydsq/qryXsydsqByBzr`, method: 'POST', body: 'gridtype=jqgrid&page.pn=1&page.size=20' },
  // 全校课表按教学班过滤（证明可服务端过滤）
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,jxbid,jxbbh,kcbh,kcmc,xnxq,skjs,jsmc,jxlmc,sksjdd,showzc')}&page.pn=1&page.size=20&jxbid=0fa2a700a1d544ca809a91e70b44a6be` },
  // 全校课表按周次过滤
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,jxbid,jxbbh,kcbh,kcmc,xnxq,skjs,jsmc,jxlmc,sksjdd,showzc')}&page.pn=1&page.size=5&zc=7` },
  // 监考按教学班查询考试任务（getZkKsrwByJxbid ret=-1 参数可能叫别的）
  { page: '教学任务', url: `/admin/jsd/kwglJsdJkcx/getZkKsrwByJxbid`, method: 'POST', body: 'id=0fa2a700a1d544ca809a91e70b44a6be' },
  { page: '教学任务', url: `/admin/jsd/kwglJsdJkcx/getZkKsrwByJxbid`, method: 'GET' },
  // 调停补列表参数形态（SPA 的 params:e → 页面字段）
  { page: '调停补SPA', url: `/admin/jsd/ttbgl/queryTtbxxList?xnxq=2026-2027-1&listtype=js&pagesize=10&pageno=1`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/jsd/ttbgl/queryJsPkxx?xnxq=2026-2027-1`, method: 'GET' },
  // checkThjsCtzc 带 jxbid
  { page: '调停补SPA', url: `/admin/pkgl/sdznpk/checkThjsCtzc?jxbid=0fa2a700a1d544ca809a91e70b44a6be&xnxq=2026-2027-1`, method: 'GET' },
  // 教师卡片（看页面是否有 json 数据接口）
  { page: '教师卡片', url: `/admin/sz/szjsjbxx/queryJsxxFroJsd?json=1`, method: 'GET', note: '试 json 形态' },
  // 通知详情
  { page: '通知收件箱', url: `/admin/system/tzsjx/showdetail?id=`, method: 'GET' },
  // 校历 allXlbz（页面新提取）
  { page: '校历', url: `/admin/system/zy/xlrq/allXlbz?type=2&rq=`, method: 'GET' },
  // 学生异动详情（无 id 形态）
  { page: '学生异动申请', url: `/admin/xjgl/xsydsq/showDetail?id=`, method: 'GET' },
  // 排课数据分布统计 —— 换学期验证过滤
  { page: '调停补SPA', url: `/admin/sjfx/pkgl/pkrcfbtj?xnxq=2025-2026-2`, method: 'GET', note: '旧学期对照' },
  // gzyjkhdj 页面数据接口猜测：个人设置读
  { page: '工作业绩考核登记', url: `/admin/jsd/gzyjkhdj/getJsGrsz`, method: 'GET', note: '猜测读接口' },
  { page: '工作业绩考核登记', url: `/admin/jsd/gzyjkhdj/queryJsGrsz`, method: 'GET', note: '猜测读接口2' },
  // 移动端调停补：yddyspList GET 对照
  { page: '调停补(移动端)', url: `/admin/pk/pkttbgl/yddyspList?pagesize=10&pageno=1&listtype=js&xnxq=2026-2027-1`, method: 'GET', note: 'GET 对照 POST' },
];

const results = [];
for (const t of TASKS) {
  let r, err = null;
  for (let a = 0; a < 2; a++) {
    try { r = await probe(B + t.url, { method: t.method, body: t.body, headers: t.body !== undefined ? FORM : undefined }); break; }
    catch (e) { err = e; await sleep(400); }
  }
  const rec = { page: t.page, url: t.url, method: t.method, params: t.body };
  if (t.note) rec.note = t.note;
  if (err) rec.error = String(err.message || err);
  else {
    rec.status = r.status; rec.ms = r.ms;
    if (isLoginPage(r)) rec.note = '!!! 会话失效';
    else {
      const txt = mask(r.text || '');
      rec.snippet = txt.replace(/\s+/g, ' ').slice(0, 400);
      if (r.json) {
        rec.json = true;
        rec.ret = r.json.ret; rec.code = r.json.code; rec.msg = (r.json.msg || r.json.message || '').slice(0, 100);
        rec.total = r.json.total;
        const rows = r.json.results || r.json.rows || (Array.isArray(r.json) ? r.json : r.json.data);
        if (Array.isArray(rows) && rows[0] && typeof rows[0] === 'object') rec.fields = Object.keys(rows[0]).slice(0, 50);
        if (Array.isArray(rows)) rec.rowsReturned = rows.length;
      }
    }
  }
  results.push(rec);
  console.log(t.method, t.url, '→', rec.status || rec.error, rec.ret !== undefined ? `ret=${rec.ret}` : '', rec.code !== undefined ? `code=${rec.code}` : '', rec.total !== undefined ? `total=${rec.total}` : '');
  if (rec.note && rec.note.includes('会话失效')) break;
  await sleep(120 + Math.random() * 180);
}
fs.writeFileSync('D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw/jwxt-teacher-probe3.json', JSON.stringify(results, null, 1));
console.log('DONE');
