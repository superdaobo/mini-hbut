// 教师端卡片 + 服务目录接口探测（只读 POST）
import { probe, mask, isLoginPage } from './probe-lib.mjs';
import fs from 'node:fs';

const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw';
const BASE = 'https://e.hbut.edu.cn';
const results = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = { 'Content-Type': 'application/json' };

function fieldsOf(j) {
  if (j == null) return '';
  const d = j.data !== undefined ? j.data : j;
  if (Array.isArray(d)) return `data=arr(${d.length}) ${d.length ? 'keys:' + Object.keys(d[0] ?? {}).slice(0, 20).join(',') : ''}`;
  if (d && typeof d === 'object') return `errcode=${j.errcode} ` + Object.keys(d).slice(0, 25).join(',');
  return `errcode=${j.errcode} data=${typeof d}`;
}

async function post(page, path, body, note) {
  const r = await probe(BASE + path, { method: 'POST', headers: J, body: JSON.stringify(body) });
  const e = { page, url: mask(BASE + path), method: 'POST', params: mask(JSON.stringify(body)).slice(0, 300), status: r.status, login: isLoginPage(r), ms: r.ms, fields: fieldsOf(r.json), note: note || '', sample: mask(r.text).slice(0, 700) };
  results.push(e);
  console.log(`[${r.status}] POST ${path.padEnd(70)} ${fieldsOf(r.json).slice(0, 80)}`);
  await sleep(200 + Math.random() * 100);
  return r;
}
async function get(page, url, note) {
  const r = await probe(url);
  const e = { page, url: mask(url), method: 'GET', params: '', status: r.status, login: isLoginPage(r), ms: r.ms, location: r.location || '', fields: fieldsOf(r.json), note: note || '', sample: mask(r.text).slice(0, 700) };
  results.push(e);
  console.log(`[${r.status}] GET  ${url.slice(BASE.length).padEnd(90)} ${fieldsOf(r.json).slice(0, 80)}`);
  await sleep(200 + Math.random() * 100);
  return r;
}

// ── A. 首页 8 张卡片 execCardMethod/renderData ─────────────────────────────
const cards = JSON.parse(fs.readFileSync(`${OUT}/cards.json`, 'utf8'));
for (const c of cards) {
  await post(`card-${c.cardId}`, `/execCardMethod/${c.cardWid}/${c.cardId}`,
    { method: 'renderData', param: { fromMaster: true } }, `卡片 renderData: ${c.title}`);
}

// ── B. 服务/目录相关 GET ────────────────────────────────────────────────────
await get('misc', `${BASE}/getPageInfo`, '页面信息?');
await get('misc', `${BASE}/getPageInfo?pageCode=home`, '页面信息 home');
await get('search', `${BASE}/personalized/getHotSearch`, '热搜词');
await get('search', `${BASE}/getSearchHisVal`, '搜索历史');
await get('search', `${BASE}/personalized/getPersonalizedMenus`, '个性化菜单');
await get('search', `${BASE}/personalized/getComponentCardInfo`, '组件卡信息');
await get('search', `${BASE}/personalized/getSysIcons`, '系统图标');
await get('config', `${BASE}/base/getPortalConfig`, '门户配置GET');
await post('config', '/base/getPortalConfig', {}, '门户配置POST空体');
await post('config', '/base/getPortalSysConfig', {}, '门户系统配置');
await post('config', '/base/getCommonConfigToPortal', {}, '通用配置');
await post('config', '/base/getThemeData', {}, '主题数据');
await get('config', `${BASE}/common/getProgrammeLocalStyle`, '方案本地样式');
await get('user', `${BASE}/getUserPreferenceSetting`, '用户偏好');
await get('user', `${BASE}/queryUserSiteWitching`, '站点切换查询');
await get('sidebar', `${BASE}/getSidebarCount`, '侧栏计数');
await get('notify', `${BASE}/userNotify/getNewsNotify`, '消息通知');
await get('notify', `${BASE}/userNotify/getRecommendCycle`, '推荐周期');
await get('misc', `${BASE}/getScene`, '场景');
await get('misc', `${BASE}/getAssistantConfig`, '助手配置');
await post('assistant', '/assistant/getQuestionAndAnswer', {}, '助手问答(空)');
await get('misc', `${BASE}/getWorkWxConfig`, '企业微信配置');
await get('misc', `${BASE}/service/getHealthInfo`, '服务健康');
await get('misc', `${BASE}/language/getStaticData`, '语言静态数据');
await get('misc', `${BASE}/queryI18nList`, 'i18n 清单');
await get('misc', `${BASE}/getPlaceholderVal`, '占位值');
await get('misc', `${BASE}/ariaHelp`, '无障碍?');
await get('misc', `${BASE}/getQuickProcessAiFormKey`, 'AI表单key');
await get('misc', `${BASE}/schedule/getShareEvent`, '日程分享');
await get('misc', `${BASE}/programme/queryPopupWindowDisplay`, '弹窗显示查询');
await get('search', `${BASE}/chooseService`, '选择服务');
await get('search', `${BASE}/chooseGroup`, '选择分组');
await get('search', `${BASE}/queryFolderAndService`, '目录+服务');
await get('search', `${BASE}/queryFolderAndAgent`, '目录+代理');
await get('search', `${BASE}/queryFolderAndItem`, '目录+事项');
await get('auth', `${BASE}/getLoginOrLogoutUrl`, '登录登出URL');
await get('auth', `${BASE}/getLoginHref`, '登录链接');
await post('execTemplate', '/execTemplateMethod', { method: 'getServiceItemRelService' }, '模板方法-服务项关联');

fs.writeFileSync(`${OUT}/ehbut-teacher-probe-02-cards-misc.json`, JSON.stringify(results, null, 1), 'utf8');
console.log('\nDONE', results.length, 'requests');
