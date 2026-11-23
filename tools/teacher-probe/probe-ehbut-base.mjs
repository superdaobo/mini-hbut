// 教师端 e.hbut.edu.cn 门户基础接口勘察（只读）
// 用法: $env:NODE_TLS_REJECT_UNAUTHORIZED='0'; node probe-ehbut-base.mjs
import { probe, isLoginPage, mask } from './probe-lib.mjs';
import fs from 'node:fs';

const BASE = 'https://e.hbut.edu.cn';
const results = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fieldsOf(j) {
  if (j == null) return [];
  if (Array.isArray(j)) return j.length ? `[${j.length}] keys:${Object.keys(j[0] ?? {}).slice(0, 25).join(',')}` : '[]empty';
  if (typeof j === 'object') {
    const ks = Object.keys(j);
    return ks.slice(0, 30).map(k => {
      const v = j[k];
      const t = Array.isArray(v) ? `arr(${v.length})` : typeof v;
      return `${k}:${t}`;
    }).join(',');
  }
  return typeof j;
}

async function doProbe(page, url, opts = {}) {
  const r = await probe(url, opts);
  const entry = {
    page,
    url: mask(url),
    method: opts.method || 'GET',
    params: opts.params || '',
    status: r.status,
    login: isLoginPage(r),
    ms: r.ms,
    location: r.location || '',
    fields: r.json ? fieldsOf(r.json) : (r.text || '').slice(0, 80),
    note: opts.note || '',
    sample: mask((r.json ? JSON.stringify(r.json) : r.text) || '').slice(0, 600),
  };
  results.push(entry);
  console.log(`[${entry.status}] ${entry.method} ${url.slice(0, 110)}  ${entry.ms}ms ${entry.login ? 'LOGIN!' : ''}`);
  await sleep(200 + Math.random() * 100);
  return r;
}

// 1) 基础鉴权/门户接口
const rUser = await doProbe('auth', `${BASE}/getLoginUser`, { note: '登录用户信息' });
await doProbe('auth', `${BASE}/getLoginUserAndGuest`, { note: '登录用户+访客' });
await doProbe('auth', `${BASE}/getUserInfo`, { note: '学生勘察称死端点，教师端复测' });
await doProbe('auth', `${BASE}/getMessageCount`, { note: '消息计数' });
await doProbe('misc', `${BASE}/common/clientIp`, { note: '客户端IP' });
await doProbe('auth', `${BASE}/getUserPermissionRouters`, { note: '站点/菜单权限路由' });
await doProbe('portal', `${BASE}/base/getPortalConfig`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, note: '门户配置(POST JSON)' });
await doProbe('portal', `${BASE}/getPageView?_t=${Date.now()}&pageCode=&originalUrl=${encodeURIComponent('https://e.hbut.edu.cn/tea/index.html#/')}&lang=zh_CN`, { note: '页面卡片布局(tea)' });
await doProbe('portal', `${BASE}/getPageView?_t=${Date.now()}&pageCode=&originalUrl=${encodeURIComponent('https://e.hbut.edu.cn/stu/index.html#/')}&lang=zh_CN`, { note: '页面卡片布局(stu,教师访问)' });
await doProbe('portal', `${BASE}/getPageView?_t=${Date.now()}&pageCode=&originalUrl=${encodeURIComponent('https://e.hbut.edu.cn/index.html#/')}&lang=zh_CN`, { note: '页面卡片布局(root)' });

// 2) 首页 HTML / SPA 入口
for (const p of ['/', '/index.html', '/tea/index.html', '/stu/index.html']) {
  const r = await doProbe('html', `${BASE}${p}`, { note: 'SPA入口HTML' });
  if (r.status === 200 && r.text.includes('<html')) {
    fs.writeFileSync(`tmp-index-${p.replace(/[^\w]/g, '_')}.html`, r.text, 'utf8');
    const m = r.text.match(/src="([^"]+\.js[^"]*)"/g) || [];
    console.log('   scripts:', m.join(' | '));
  }
}

fs.mkdirSync('../../data/teacher-portal-recon-1120/raw', { recursive: true });
fs.writeFileSync('../../data/teacher-portal-recon-1120/raw/ehbut-teacher-probe-01-base.json', JSON.stringify(results, null, 1), 'utf8');
console.log('\nDONE', results.length, 'requests');
