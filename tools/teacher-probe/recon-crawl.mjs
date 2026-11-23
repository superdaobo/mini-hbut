// recon-crawl.mjs — 教师端全菜单页面抓取 + 接口路径提取（只读 GET）
// 输出: data/teacher-portal-recon-1120/raw/crawl-pages.json
import fs from 'node:fs';
import path from 'node:path';
import { probe, isLoginPage, mask } from './probe-lib.mjs';

const OUT_DIR = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'https://jwxt.hbut.edu.cn';

// 14 个一级菜单下的全部页面（相对 /admin/）
const PAGES = [
  { page: '我的申请/调停补申请(SPA)', url: '/fe/#/pkgl/teacherTtbApply' },
  { page: '我的申请/调停补课申请(移动端)', url: '/admin/jsd/ttbgl' },
  { page: '我的申请/学生异动申请', url: '/admin/xjgl/xsydsq/teacherlist' },
  { page: '我的申请/工作流/我的申请', url: '/admin/activiti/myApply/listMyApply' },
  { page: '我的申请/工作流/我的待办', url: '/admin/activiti/dbsy/toDbsyPage' },
  { page: '我的申请/工作流/我的经办', url: '/admin/activiti/myApply/operationApply' },
  { page: '学籍管理/学分统计', url: '/admin/xjgl/xftj' },
  { page: '我的课表', url: '/admin/pkgl/pkgljskb/queryKbForJsd' },
  { page: '成绩管理/成绩录入', url: '/admin/jsd/jsdcjlr/list1' },
  { page: '成绩管理/成绩修改', url: '/admin/jsd/jsdcjxgsq/list1' },
  { page: '班级课表', url: '/admin/pkgl/kbcx/bjkb?qx=1' },
  { page: '试卷分析', url: '/admin/jsd/sjfx/list' },
  { page: '信息查询/学生信息查询', url: '/admin/xjgl/xsjbxx/xsxxcx' },
  { page: '信息查询/校历', url: '/admin/system/zy/xlgl/queryForXsd' },
  { page: '信息查询/教学任务', url: '/admin/jsd/jxrw' },
  { page: '信息查询/教室课表', url: '/admin/pkgl/pkglcroomkb' },
  { page: '信息查询/全校总课表', url: '/admin/jsd/qxzkb/list3' },
  { page: '信息查询/空教室查询', url: '/admin/system/jxzy/jsxx/toZyKjsPage' },
  { page: '信息查询/班级考试信息', url: '/admin/jsd/kwglJsdJkcx/rkjxbkslist' },
  { page: '信息查询/缓考任务查询', url: '/admin/kw/kwhkgl/hkrwcx' },
  { page: '信息查询/监考安排', url: '/admin/jsd/kwglJsdJkcx' },
  { page: '信息查询/教学班成绩查询', url: '/admin/jsd/jsdcjcx/jsdcjcx' },
  { page: '信息查询/评教信息查看', url: '/admin/pj/xspjxxcx' },
  { page: '信息查询/剩余试卷', url: '/admin/jsd/sjgl/sysjList' },
  { page: '信息查询/试卷管理', url: '/admin/jsd/sjgl' },
  { page: '信息查询/学生评价结果查询', url: '/admin/pj/xspjjgcx' },
  { page: '信息查询/同行评教结果查询', url: '/admin/pj/thpjcx' },
  { page: '信息查询/工作业绩考核登记', url: '/admin/jsd/gzyjkhdj' },
  { page: '信息查询/教师卡片', url: '/admin/sz/szjsjbxx/queryJsxxFroJsd' },
  { page: '教师端工作量(SPA)', url: '/fe/#/workloadManage/eduStat' },
  { page: '学生考勤统计(老师)', url: '/admin/jsd/xskq' },
  { page: '通知管理/通知管理', url: '/admin/jsd/notice/list' },
  { page: '通知管理/通知收件箱', url: '/admin/system/tzsjx' },
  { page: '移动端/教师查询', url: '/admin/jwxtgld/jscx/list' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const WRITE_RE = /save|add|create|update|edit|modify|delete|remove|submit|apply|confirm|audit|approve|reject|import|insert|upload|export|print|report|reset|change|send|batch|collect|chehui|reapply|cxsq|record|unlock|topping|dotrans|jump/i;

function extractPaths(html) {
  const set = new Set();
  for (const m of html.matchAll(/\/admin\/[A-Za-z0-9_\/.?=&%\-]+/g)) {
    let p = m[0].replace(/&amp;/g, '&').replace(/[?&]+$/, '');
    // 截掉常见误匹配尾巴
    p = p.replace(/(,\s*|\)\s*|\s+.*)$/, '');
    set.add(p);
  }
  return [...set];
}

// 提取 jqGrid settings 块中的 url/mtype/postData/prmNames
function extractGrids(html) {
  const grids = [];
  // url: "..." 附近找 mtype
  for (const m of html.matchAll(/url\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    const url = m[1];
    if (!url.startsWith('/admin/') && !url.includes('/admin/')) continue;
    const ctx = html.slice(Math.max(0, m.index - 400), m.index + 800);
    const mtype = (ctx.match(/mtype\s*:\s*["'`](\w+)["'`]/) || [])[1] || null;
    const postData = (ctx.match(/postData\s*:\s*([A-Za-z_$][\w$]*|\{[^}]*\})/) || [])[1] || null;
    const gridId = (ctx.match(/#\s*([A-Za-z_][\w]*Grid\w*|list_\w+|table_\w+)/) || [])[1] || null;
    grids.push({ url, mtype, postData, gridId });
  }
  return grids;
}

// 提取 hidden input（如 teacherId）
function extractHidden(html) {
  const out = {};
  for (const m of html.matchAll(/<input[^>]+type=["']?hidden["']?[^>]*>/gi)) {
    const tag = m[0];
    const id = (tag.match(/id=["']([\w-]+)["']/) || [])[1];
    const name = (tag.match(/name=["']([\w-]+)["']/) || [])[1];
    const value = (tag.match(/value=["']([^"']*)["']/) || [])[1] || '';
    if (id || name) out[id || name] = value;
  }
  return out;
}

function extractTitle(html) {
  const m = html.match(/<title>\s*([^<]+)/i);
  return m ? m[1].trim() : '';
}

const results = [];
for (const p of PAGES) {
  const url = BASE + p.url;
  let r;
  try {
    r = await probe(url);
  } catch (e) {
    results.push({ ...p, error: String(e) });
    console.log('FAIL', p.page, e.message);
    await sleep(200);
    continue;
  }
  const login = isLoginPage(r);
  const html = r.status === 200 ? (r.text || '') : '';
  const entry = {
    page: p.page,
    url: p.url,
    status: r.status,
    login,
    title: extractTitle(html),
    bytes: html.length,
    hidden: extractHidden(html),
    grids: extractGrids(html),
    paths: extractPaths(html).map(u => ({
      url: u,
      write: WRITE_RE.test(u),
    })),
  };
  results.push(entry);
  console.log(r.status, login ? 'LOGIN!' : '', p.page, '| paths:', entry.paths.length, '| grids:', entry.grids.length, '| title:', entry.title.slice(0, 30));
  // 页面 HTML 存盘（脱敏）供后续人工看
  fs.writeFileSync(path.join(OUT_DIR, `page-${p.url.split('/').pop().split('?')[0]}.html`), mask(html));
  if (login) { console.error('!!! 会话失效，停止'); break; }
  await sleep(150 + Math.random() * 150);
}

fs.writeFileSync(path.join(OUT_DIR, 'crawl-pages.json'), JSON.stringify(results, null, 2));
console.log('DONE ->', path.join(OUT_DIR, 'crawl-pages.json'));
