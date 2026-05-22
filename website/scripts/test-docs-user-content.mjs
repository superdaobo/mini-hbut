import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const quickStart = read('src/pages/docs/QuickStart.tsx');
const userGuide = read('src/pages/docs/UserGuide.tsx');

const failures = [];
const expectIncludes = (content, label, terms) => {
  for (const term of terms) {
    if (!content.includes(term)) {
      failures.push(`${label} 缺少内容关键词: ${term}`);
    }
  }
};

expectIncludes(quickStart, 'QuickStart', [
  '下载与安装',
  'Windows',
  'macOS',
  'Linux',
  'Android',
  'iOS',
  '统一身份认证',
  '学习通',
  '扫码临时登录',
  'Cookie',
  '自动恢复会话',
  '重新登录',
  '首页仪表盘',
  '今日安排',
  '快捷入口',
  '搜索服务、课程、资讯',
  '底部主 Tab',
  '返回仪表盘',
  '设置中心',
  '导出中心',
  '云同步',
  '离线缓存',
]);

expectIncludes(userGuide, 'UserGuide', [
  '普通用户阅读路径',
  '首页与全局导航',
  '教务服务',
  '一码通',
  '校园生活',
  '社区与通知',
  '扩展模块',
  '我的与设置',
  '需要登录',
  '无需登录',
  '加载中',
  '空状态',
  '登录过期',
  '离线',
  '成绩查询',
  '个人课表',
  '电费查询',
  '校园码',
  '图书查询',
  '资料分享',
  '论坛',
  '通知中心',
  '更多模块',
]);

if (quickStart.includes('后续 Task 6') || userGuide.includes('后续扩写来源')) {
  failures.push('用户文档仍包含 Task 6 前的占位提示');
}

if (failures.length > 0) {
  console.error('docs user content contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('docs user content contract passed');
