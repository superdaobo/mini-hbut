// recon-probe4.mjs — 第四轮：参数语义验证（只读）
import fs from 'node:fs';
import { probe, isLoginPage, mask } from './probe-lib.mjs';
const B = 'https://jwxt.hbut.edu.cn';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const XNXQ = '2026-2027-1';
const QXKB_QF = encodeURIComponent('id,jxbid,jxbbh,kcbh,kcmc,xnxq,skjs,jsmc,jxlmc,sksjdd,showzc');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TASKS = [
  // getXqrqxx 正确参数名（09 文档：zcStr）
  { page: '空教室', url: `/admin/system/jxzy/jsxx/getXqrqxx`, method: 'POST', body: `xnxq=${XNXQ}&zcStr=7` },
  // 全校课表过滤参数探索（同一接口，改过滤字段）
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${QXKB_QF}&page.pn=1&page.size=5&zc=7&xq=1&jc=1` , note: 'zc/xq/jc 过滤' },
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${QXKB_QF}&page.pn=1&page.size=5&zxzc=7&zxxq=1&zxjc=1`, note: 'zxzc/zxxq/zxjc 过滤' },
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${QXKB_QF}&page.pn=1&page.size=5&kcmc=${encodeURIComponent('计算机制图')}`, note: 'kcmc 过滤' },
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${QXKB_QF}&page.pn=1&page.size=5&jxbid=0fa2a700a1d544ca809a91e70b44a6be`, note: 'jxbid 过滤' },
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${QXKB_QF}&page.pn=1&page.size=5&jxbbh=202613844`, note: 'jxbbh 过滤' },
  { page: '全校总课表', url: `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${QXKB_QF}&page.pn=1&page.size=5&query.kcmc%7C%7C=${encodeURIComponent('计算机制图')}`, note: 'query.前缀过滤' },
  // 教学任务过滤（skzc 周次 / jxbid）
  { page: '教学任务', url: `/admin/jsd/jxrw/ajaxListJsJxrw?gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,jxbid,xnxq,kcbh,kcmc,jxbbh,jxbmc,skzc,ksxs,sfqr')}&page.pn=1&page.size=20&xnxq=2025-2026-2`, note: '旧学期对照' },
  // 班级课表 POST 带 rxnf 过滤
  { page: '班级课表', url: `/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,encodeId,xnxq,rxnf,yxmc,zymc,bjmc,bjrs,bjbh')}&page.pn=1&page.size=5&rxnf=2025&yxmc=${encodeURIComponent('土木建筑与环境学院')}`, note: 'rxnf+yxmc 过滤' },
  // 班级课表 GET 带过滤
  { page: '班级课表', url: `/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&gridtype=jqgrid&page.pn=1&page.size=5&rxnf=2025`, method: 'GET', note: 'GET rxnf 过滤' },
  // 教室课表过滤 jxldm
  { page: '教室课表', url: `/admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,encodeId,xnxq,xqmc,jsbh,jsmc,jxlmc,zdskrnrs,jslx')}&page.pn=1&page.size=20&jxldm=24`, note: 'jxldm=24 过滤' },
  // 监考/教学班成绩/调停补详情类
  { page: '监考安排', url: `/admin/jsd/kwglJsdJkcx/ajaxJsjkList?gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,xnxq,kspcmc,ksfs,kcmc,ksrq,kscc,jsmc,xqmc,zjk,jkjsxm,kkyx')}&page.pn=1&page.size=20&xnxq=2025-2026-2`, note: '旧学期对照' },
  // 调停补 SPA 审批列表 dspList 带参数
  { page: '调停补SPA', url: `/admin/pk/pkttbgl/dspList?pageNo=1&pageSize=10`, method: 'GET' },
  { page: '调停补SPA', url: `/admin/pk/pkttbgl/dspList?gridtype=jqgrid&page.pn=1&page.size=10`, method: 'GET' },
  // ttbxxnew 已返回数组 —— 再确认形态
  { page: '调停补SPA', url: `/admin/jsd/ttbgl/queryTtbxxList?listtype=js&xnxq=2025-2026-2`, method: 'GET', note: '旧学期' },
  // jscx/jsxxlist 带关键词（移动端教师查询的搜索参数）
  { page: '移动端/教师查询', url: `/admin/jwxtgld/jscx/jsxxlist?yxid=205&jsmc=`, method: 'GET' },
  // 教师卡片页面内联数据提取（页面 146KB 应含教师信息 JSON）
  // 学生考勤：教师维度页面接口
  { page: '学生考勤', url: `/admin/jsd/xskq/jcwdxskq?id=0fa2a700a1d544ca809a91e70b44a6be`, method: 'GET', note: '教师维度考勤页' },
  { page: '学生考勤', url: `/admin/jsd/xskq/xswdxskq?id=0fa2a700a1d544ca809a91e70b44a6be`, method: 'GET', note: '学生维度考勤页' },
  // 教学班成绩查看：encodeId 形态（用 jsdQueryJxbList 的 encodeId 需先拿——这里试 id 明文 jxbid）
  { page: '教学班成绩查询', url: `/admin/jsd/jsdcjcx/jsdxscjck?id=0fa2a700a1d544ca809a91e70b44a6be`, method: 'GET', note: '明文 jxbid' },
  // 成绩录入 sjfx（试卷分析页入口）
  { page: '成绩录入', url: `/admin/jsd/jsdcjlr/sjfx?jxbid=0fa2a700a1d544ca809a91e70b44a6be`, method: 'GET' },
  // 缓考名单 lx=1（待审）/ lx=2（通过）
  { page: '缓考任务', url: `/admin/kw/kwhkgl/hkmdcxjg?lx=1`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,kkyx,kcmc,skyx,rkjs,bjmc,xh,name,startTime,endTime,hmkyy,xdxz')}&page.pn=1&page.size=20`, note: 'lx=1' },
  // 学生信息查询按院系过滤（避免全校）
  { page: '学生信息查询', url: `/admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,xz,mzdm,sfzx,xsdqztdm,xm,sznj,yxdm,zymc,rxnj')}&page.pn=1&page.size=5&yxdm=205`, note: 'yxdm=205 过滤' },
  // 学分统计按班级过滤
  { page: '学分统计', url: `/admin/xjgl/xftj/getxftjlist?encodeId=1&gridtype=jqgrid`, method: 'POST',
    body: `queryFields=${encodeURIComponent('id,encodeId,xh,xm,sznj,zymc,bjmc,xfjd,cxxf,jhwxf')}&page.pn=1&page.size=5&yxdm=205`, note: 'yxdm=205' },
  // getBjgKcxx 不及格课程信息页（GET 页面）
  { page: '学分统计', url: `/admin/xjgl/xftj/getBjgKcxx`, method: 'GET' },
  // 校历：教学周时间另一形态
  { page: '校历', url: `/admin/system/zy/xlgl/selectJxzxsjXq/${XNXQ}`, method: 'GET' },
  // twork POST search（页面真实形态，带 jsGh?—— 教师端 eduStat 可能调 current-user-gzl）
  { page: '工作量SPA', url: `/twork/jsd/search`, method: 'POST', body: `xnxq=${XNXQ}`, headers: FORM, note: '教师端查询形态' },
  { page: '工作量SPA', url: `/twork/jsd/search`, method: 'GET', note: 'GET 无参（已测）' },
  { page: '工作量SPA', url: `/twork/jsd/search?xnxq=${XNXQ}&pageNum=1&pageSize=10`, method: 'GET', note: 'GET 带学期' },
  // twork 教师端 eduStat 实际接口（看 eduStat chunk 用什么函数）
];

const results = [];
for (const t of TASKS) {
  let r, err = null;
  for (let a = 0; a < 2; a++) {
    try { r = await probe(B + t.url, { method: t.method, body: t.body, headers: t.body !== undefined ? FORM : undefined }); break; }
    catch (e) { err = e; await sleep(400); }
  }
  const rec = { page: t.page, url: t.url, method: t.method };
  if (t.body !== undefined) rec.params = t.body;
  if (t.note) rec.note = t.note;
  if (err) rec.error = String(err.message || err);
  else {
    rec.status = r.status; rec.ms = r.ms;
    if (isLoginPage(r)) rec.note = '!!! 会话失效';
    else {
      if (r.json) {
        rec.json = true;
        rec.ret = r.json.ret; rec.code = r.json.code;
        rec.msg = (r.json.msg || r.json.message || '').slice(0, 100);
        rec.total = r.json.total;
        const rows = r.json.results || r.json.rows || (Array.isArray(r.json) ? r.json : r.json.data);
        if (Array.isArray(rows)) { rec.rowsReturned = rows.length;
          if (rows[0] && typeof rows[0] === 'object') rec.fields = Object.keys(rows[0]).slice(0, 50); }
      } else {
        const t2 = mask(r.text || '');
        rec.shape = t2.trimStart().startsWith('<') ? 'html' : 'text';
        rec.snippet = t2.replace(/\s+/g, ' ').slice(0, 300);
      }
    }
  }
  results.push(rec);
  console.log(t.method, t.url.slice(0, 90), '→', rec.status || rec.error,
    rec.ret !== undefined ? `ret=${rec.ret}` : '', rec.code !== undefined ? `code=${rec.code}` : '',
    rec.total !== undefined ? `total=${rec.total}` : '', rec.rowsReturned !== undefined ? `rows=${rec.rowsReturned}` : '');
  if (rec.note && rec.note.includes('会话失效')) break;
  await sleep(120 + Math.random() * 180);
}
fs.writeFileSync('D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw/jwxt-teacher-probe4.json', JSON.stringify(results, null, 1));
console.log('DONE', results.length);
