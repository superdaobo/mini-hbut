// 剩余 GET 只读接口复测（会话已刷新）
import { probe, mask, isLoginPage } from './probe-lib.mjs';
import fs from 'node:fs';
const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const BASE = 'https://e.hbut.edu.cn';
const results = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

async function get(page, path, note) {
  const r = await probe(BASE + path);
  results.push({ page, url: mask(BASE + path), method: 'GET', params: '', status: r.status, login: isLoginPage(r), ms: r.ms, fields: r.json ? `errcode=${r.json.errcode} ${r.json.data && typeof r.json.data === 'object' ? Object.keys(r.json.data).slice(0, 18).join(',') : String(r.json.data).slice(0, 60)}` : r.text.slice(0, 70), note: note || '', sample: mask(r.text).slice(0, 700) });
  console.log(`[${r.status}] GET  ${path.padEnd(75)} ${r.json ? 'err=' + r.json.errcode : 'html'}`);
  await sleep(220);
  return r;
}
async function post(page, path, body, note) {
  const r = await probe(BASE + path, { method: 'POST', headers: J, body: JSON.stringify(body) });
  results.push({ page, url: mask(BASE + path), method: 'POST', params: mask(JSON.stringify(body)).slice(0, 200), status: r.status, ms: r.ms, fields: r.json ? `errcode=${r.json.errcode}` : r.text.slice(0, 70), note: note || '', sample: mask(r.text).slice(0, 700) });
  console.log(`[${r.status}] POST ${path.padEnd(75)} ${r.json ? 'err=' + r.json.errcode : 'html'}`);
  await sleep(220);
  return r;
}

await get('search', '/queryFolderAndService', '目录+服务树');
await get('search', '/queryFolderAndAgent', '目录+代理');
await get('search', '/queryFolderAndItem', '目录+事项');
await get('search', '/personalized/getHotSearch', '热搜词');
await get('search', '/personalized/getPersonalizedMenus', '个性化菜单');
await get('search', '/personalized/getComponentCardInfo', '组件卡');
await get('user', '/getUserPreferenceSetting', '偏好设置');
await get('user', '/queryUserSiteWitching', '站点切换');
await get('misc', '/getPageInfo?pageCode=hall', '页面信息 hall');
await get('misc', '/getPageInfo?pageCode=datacenter', '页面信息 datacenter');
await get('auth', '/auth/minos/getMinosOrg', 'minos 组织');
await get('auth', '/auth/minos/getFieldGroups', 'minos 字段组');
await get('auth', '/auth/minos/searchUser?keyword=test', 'minos 搜用户');
await get('cal', '/cal/queryOrgUsers', '日程-组织用户');
await get('card', '/card/componentCard/getIconList', '组件卡图标');
await get('misc', '/escapePageCount/count', '页面访问计数?');
await get('misc', '/getAssistantConfig', '助手配置');
await get('misc', '/appAppraise/appraiseSummary', '服务评价汇总');
await get('misc', '/appAppraise/getServiceAppraiseMode', '评价模式');
await get('misc', '/appAppraise/getUserCommentPhraseList', '评价短语');
await post('misc', '/appAppraise/queryAppraiseByPage', { pageNum: 1, pageSize: 5 }, '评价分页');
await post('misc', '/appAppraise/queryAppraiseByPageNew', { pageNum: 1, pageSize: 5 }, '评价分页v2');
await get('misc', '/getFeedbackPhraseListForPortal', '反馈短语');
await get('misc', '/feedback/getFeedbackParse', '反馈解析');
await get('misc', '/programme/queryPopupWindowDisplay', '弹窗');
await get('misc', '/dataRefresh/init', '数据刷新init');
await get('misc', '/service/getHealthInfo', '服务健康');
await get('misc', '/queryI18nList', 'i18n');
await get('misc', '/language/getStaticData', '语言静态');
await get('misc', '/common/getProgrammeLocalStyle', '方案样式');
await get('misc', '/base/getPortalSysConfig', '门户系统配置GET');
await get('misc', '/getWorkWxConfig', '企微配置');
await get('misc', '/qrCode/getKey', '二维码key(读)');
await get('misc', '/dailyCalShare/getCalShareQrPath', '日程分享二维码');
await get('misc', '/getQuickProcessAiFormKey', 'AI表单的key');
await post('misc', '/execTemplateMethod', { method: 'getServiceItemRelService', id: '' }, '模板方法空id');
await get('misc', '/queryServiceByWid?wid=1403335323158573056', '按wid查服务(一码通)');
await get('misc', '/getSidebarCount', '侧栏计数(前次500)');

fs.writeFileSync(`${OUT}/ehbut-teacher-probe-06-misc.json`, JSON.stringify(results, null, 1), 'utf8');
console.log('DONE', results.length);
