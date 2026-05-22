import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const requiredPages = [
  ['src/pages/docs/QuickStart.tsx', '/docs/quick-start', '快速开始'],
  ['src/pages/docs/UserGuide.tsx', '/docs/user-guide', '用户手册'],
  ['src/pages/docs/AcademicServices.tsx', '/docs/academic', '教务服务'],
  ['src/pages/docs/CampusLife.tsx', '/docs/campus-life', '校园生活'],
  ['src/pages/docs/CommunityNotifications.tsx', '/docs/community-notifications', '社区与通知'],
  ['src/pages/docs/Extensions.tsx', '/docs/extensions', '扩展模块'],
  ['src/pages/docs/SettingsData.tsx', '/docs/settings-data', '设置与数据'],
  ['src/pages/docs/Troubleshooting.tsx', '/docs/troubleshooting', '故障排查'],
  ['src/pages/docs/DeveloperOverview.tsx', '/docs/developer', '开发者总览'],
  ['src/pages/docs/ArchitectureDataFlow.tsx', '/docs/architecture', '架构与数据流'],
  ['src/pages/docs/PlatformTauri.tsx', '/docs/platform-tauri', '平台与 Tauri'],
  ['src/pages/docs/ModuleSystem.tsx', '/docs/module-system', '模块系统'],
  ['src/pages/docs/BuildRelease.tsx', '/docs/build-release', '构建发布'],
  ['src/pages/docs/SecurityPrivacy.tsx', '/docs/security-privacy', '安全与隐私'],
  ['src/pages/docs/ReferenceIndex.tsx', '/docs/reference', '参考资料'],
];

const referenceRoutes = [
  ['/docs/reference/tauri-api', 'TauriApi'],
  ['/docs/reference/dev-rules', 'DevRules'],
  ['/docs/reference/nonebot', 'Nonebot'],
  ['/docs/reference/implementation-notes', 'Implementation'],
];

const navSections = ['开始', '用户文档', '开发者文档', '参考资料'];

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const app = read('src/App.tsx');
const layout = read('src/layouts/DocsLayout.tsx');
const vite = read('vite.config.ts');
const overview = read('src/pages/docs/Overview.tsx');
const search = read('src/pages/Search.tsx');

for (const [pagePath, route, label] of requiredPages) {
  expect(existsSync(path.join(root, pagePath)), `缺少页面文件: ${pagePath}`);
  expect(app.includes(`path="${route.replace('/docs/', '')}"`) || app.includes(`path="${route.slice('/docs/'.length)}"`), `App.tsx 未注册路由: ${route}`);
  expect(layout.includes(label), `DocsLayout.tsx 未包含导航标签: ${label}`);
  expect(vite.includes(`'${route.slice(1)}/index.html'`), `vite.config.ts 未包含静态入口: ${route}`);
}

for (const [route, componentName] of referenceRoutes) {
  expect(app.includes(componentName), `App.tsx 未导入或使用参考页面组件: ${componentName}`);
  expect(app.includes(`path="${route.slice('/docs/'.length)}"`), `App.tsx 未注册参考路由: ${route}`);
  expect(layout.includes(route), `DocsLayout.tsx 未包含参考路由链接: ${route}`);
  expect(vite.includes(`'${route.slice(1)}/index.html'`), `vite.config.ts 未包含参考静态入口: ${route}`);
}

for (const section of navSections) {
  expect(layout.includes(section), `DocsLayout.tsx 未包含分组标题: ${section}`);
}

expect(!layout.includes('const links = ['), 'DocsLayout.tsx 仍使用旧扁平 links 导航');
expect(layout.includes('docsNavSections'), 'DocsLayout.tsx 未使用 docsNavSections 分组导航');

const currentDocsRoutes = [
  '/docs/quick-start',
  '/docs/user-guide',
  '/docs/academic',
  '/docs/campus-life',
  '/docs/community-notifications',
  '/docs/extensions',
  '/docs/settings-data',
  '/docs/troubleshooting',
  '/docs/developer',
  '/docs/architecture',
  '/docs/platform-tauri',
  '/docs/module-system',
  '/docs/build-release',
  '/docs/security-privacy',
  '/docs/reference',
];

for (const route of currentDocsRoutes) {
  expect(overview.includes(route), `Overview.tsx 文档导航未覆盖新路由: ${route}`);
}

for (const route of [
  '/docs/quick-start',
  '/docs/user-guide',
  '/docs/academic',
  '/docs/campus-life',
  '/docs/troubleshooting',
  '/docs/developer',
  '/docs/reference',
]) {
  expect(search.includes(route), `Search.tsx 站内搜索未覆盖新路由: ${route}`);
}

expect(!overview.includes('v1.2.5'), 'Overview.tsx 仍包含过期版本号 v1.2.5');

if (failures.length > 0) {
  console.error('docs IA contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('docs IA contract passed');
