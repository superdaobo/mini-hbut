// 补录：正式记录 ad-hoc 探测（POST query 系 / queryServiceByWid / 卡片 method / host-open→tid→getToken）
import { probe, mask, isLoginPage } from './probe-lib.mjs';
import fs from 'node:fs';
const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const BASE = 'https://e.hbut.edu.cn';
const J = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const results = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function rec(page, url, method, params, r, note) {
  results.push({
    page, url: mask(url), method, params: mask(JSON.stringify(params ?? '')).slice(0, 250),
    status: r.status, login: isLoginPage(r), ms: r.ms, location: r.location || '',
    fields: r.json ? `errcode=${r.json.errcode}` + (r.json.data != null && typeof r.json.data === 'object' ? ' keys:' + Object.keys(r.json.data).slice(0, 18).join(',') : ' data=' + String(r.json.data).slice(0, 60)) : 'html',
    note: note || '', sample: mask(r.text).slice(0, 700),
  });
}
async function get(page, url, note) { const r = await probe(url); rec(page, url, 'GET', '', r, note); console.log(r.status, 'GET ', url.slice(BASE.length).padEnd(80), r.json?.errcode ?? ''); await sleep(220); return r; }
async function post(page, path, body, note) { const r = await probe(BASE + path, { method: 'POST', headers: J, body: JSON.stringify(body) }); rec(page, BASE + path, 'POST', body, r, note); console.log(r.status, 'POST', path.padEnd(80), r.json?.errcode ?? 'html'); await sleep(220); return r; }

// POST query 系列（空体即返回收藏夹目录）
await post('folder', '/queryFolderAndService', {}, '服务收藏夹');
await post('folder', '/queryFolderAndAgent', {}, '代理收藏夹');
await post('folder', '/queryFolderAndItem', {}, '事项收藏夹');
await post('site', '/queryUserSiteWitching', {}, '站点切换');
await post('config', '/base/getPortalConfig', { key: 'SITE_RULE' }, '配置查询 by key');
await post('config', '/base/getPortalSysConfig', {}, '门户系统配置');
await post('config', '/base/getCommonConfigToPortal', {}, '通用配置(前次500)');
await post('misc', '/programme/queryPopupWindowDisplay', { programmeId: '2d8296b6d3bc49ec977af23029b3d717' }, '弹窗');
await post('misc', '/common/getProgrammeLocalStyle', { programmeId: '2d8296b6d3bc49ec977af23029b3d717' }, '方案样式');
await post('misc', '/cal/queryOrgUsers', {}, '日历组织用户(401)');
await post('misc', '/auth/minos/getMinosOrg', {}, 'minos组织(403)');
await post('misc', '/appAppraise/queryAppraiseByPage', { serviceWid: '1403335323158573056', pageNum: 1, pageSize: 5 }, '服务评价');
await post('misc', '/card/componentCard/getIconList', { url: 'test' }, '组件卡图标');
// queryServiceByWid REST
await get('service', `${BASE}/queryServiceByWid/1403335323158573056/0`, '一码通服务详情');
await get('service', `${BASE}/queryServiceByWid/1394635247029297152/0`, '教管一体化服务详情');
// 卡片 method 全量
const cards = JSON.parse(fs.readFileSync(`${OUT}/cards.json`, 'utf8'));
for (const c of cards) {
  for (const m of ['getConfig', 'getMarkNumber']) {
    const r = await probe(`${BASE}/execCardMethod/${c.cardWid}/${c.cardId}`, { method: 'POST', headers: J, body: JSON.stringify({ method: m, param: {} }) });
    rec(`card-${c.cardId}`, `${BASE}/execCardMethod/${c.cardWid}/${c.cardId}`, 'POST', { method: m }, r, c.title);
    console.log(r.status, `${c.cardId} ${m}`.padEnd(60), r.json?.errcode);
    await sleep(220);
  }
}
// hall/datacenter 卡 getMarkNumber
for (const [w, id, pg] of [['1809922293628241', 'CUS_CARD_ALLSERVICE', 'hall'], ['2662243601602181', 'SYS_CARD_RECOMMENDSUBJECT', 'datacenter']]) {
  const r = await probe(`${BASE}/execCardMethod/${w}/${id}`, { method: 'POST', headers: J, body: JSON.stringify({ method: 'getMarkNumber', param: {} }) });
  rec(`card-${pg}-${id}`, `${BASE}/execCardMethod/${w}/${id}`, 'POST', { method: 'getMarkNumber' }, r, '');
  console.log(r.status, `${id} getMarkNumber`.padEnd(60), r.json?.errcode);
  await sleep(220);
}
// misc GET
await get('misc', `${BASE}/getPageInfo?pageCode=hall`, '');
await get('misc', `${BASE}/getPageInfo?pageCode=datacenter`, '');
await get('misc', `${BASE}/getSidebarCount`, '侧栏计数(500页)');
await get('misc', `${BASE}/simJump?id=1403335323158573056`, '服务跳转页');
await get('misc', `${BASE}/serviceShow?wid=1403335323158573056`, '服务展示');
await get('misc', `${BASE}/qrCode/getKey`, '二维码key');
await get('misc', `${BASE}/dataRefresh/init`, 'SSE 数据刷新');
// ── code 域 tid 链路（正式记录）──
let url = 'https://code.hbut.edu.cn/server/auth/host/open?pc=1&org=2&host=28';
let last;
for (let i = 0; i < 8; i++) {
  const r = await probe(url);
  rec('code-sso', url, 'GET', '', { status: r.status, location: r.location, ms: r.ms, json: r.json, text: r.text }, `hop${i}`);
  console.log('hop', r.status, url.slice(0, 110), '->', (r.location || '').slice(0, 110));
  if (!r.location) { last = r; break; }
  url = new URL(r.location, url).href;
  await sleep(250);
}
const tid = new URL(url).searchParams.get('tid');
if (tid) {
  const r = await probe('https://code.hbut.edu.cn/server/auth/getToken', { method: 'POST', headers: J, body: JSON.stringify({ tid, orgId: 2 }) });
  rec('code-sso', 'https://code.hbut.edu.cn/server/auth/getToken', 'POST', { tid: '<tid>', orgId: 2 }, r, 'tid换accessToken');
  console.log('getToken', r.status, mask(r.text).slice(0, 200));
}
fs.writeFileSync(`${OUT}/ehbut-teacher-probe-07-final.json`, JSON.stringify(results, null, 1), 'utf8');
console.log('DONE', results.length);
