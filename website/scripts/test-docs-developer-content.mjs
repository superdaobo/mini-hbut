import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const developerOverview = read('src/pages/docs/DeveloperOverview.tsx');
const architectureDataFlow = read('src/pages/docs/ArchitectureDataFlow.tsx');

const failures = [];
const expectIncludes = (content, label, terms) => {
  for (const term of terms) {
    if (!content.includes(term)) {
      failures.push(`${label} 缺少内容关键词: ${term}`);
    }
  }
};

expectIncludes(developerOverview, 'DeveloperOverview', [
  '开发者架构总览',
  '入口层',
  'src/main.ts',
  'bootstrap',
  'initThemeBridge',
  'initUiSettings',
  'initAppSettings',
  'initFontSettings',
  'runDeferredInitializers',
  'initBackgroundFetchScheduler',
  'runNotificationCheck',
  'initDebugBridgeClient',
  '视图调度层',
  'src/App.vue',
  'createAsyncPage',
  'defineAsyncComponent',
  'MAIN_TABS',
  'ME_SUB_VIEWS',
  'HIERARCHICAL_PARENT_VIEW_MAP',
  'VIEW_PREFETCHERS',
  'goToView',
  'goToViewInternal',
  'ensureProtectedViewAccess',
  'resolveParentView',
  'goToParentView',
  'handleNavigate',
  'handleBackToDashboard',
  'homeScrollSnapshot',
  'moduleHostSession',
  'replaceHistorySnapshot',
  'pushHistorySnapshot',
  'syncFromHash',
  '组件组织层',
  'src/components',
  'src/components/templates',
  'src/components/ui',
  'TPageHeader',
  'TCard',
  'TEmptyState',
  'TStatusBadge',
  'shadcn-vue',
  '业务页面组件',
  '组合式能力',
  'src/composables/useChaoxingCheckin.ts',
  'src/composables/useGeolocation.ts',
  'src/composables/useQrScanner.ts',
  '设计与样式基座',
  'src/config/ui_settings.ts',
  'src/config/design-tokens.ts',
  'src/utils/ui_settings.ts',
  'src/utils/theme-bridge.ts',
  'src/styles/main.css',
  'src/styles/dark-mode.css',
  'src/styles/ui_ux_pro_max.css',
  '平台边界层',
  'src/platform/types.ts',
  'PlatformBridge',
  'RuntimePlatform',
  'detectRuntime',
  'platformBridge',
  'tauriBridge',
  'capacitorBridge',
  'webBridge',
  'invokeNative',
  'openHttp',
  'openUri',
  'sendLocalNotification',
  'keepScreenOn',
  'shareLinkOrFile',
  'setAggressiveKeepAlive',
  'WidgetBridge',
  '开发阅读顺序',
  '架构与数据流',
  '平台与 Tauri',
  '模块系统',
  '构建发布',
  '安全与隐私',
]);

if (
  developerOverview.includes('后续扩写来源') ||
  developerOverview.includes('本页骨架职责') ||
  developerOverview.includes('DocSectionPage')
) {
  failures.push('DeveloperOverview 仍包含骨架页占位或通用骨架组件');
}

expectIncludes(architectureDataFlow, 'ArchitectureDataFlow', [
  '架构与数据流',
  '请求入口',
  'src/utils/axios_adapter.js',
  'src/utils/api.js',
  'fetchWithCache',
  'getCachedData',
  'setCachedData',
  'withOfflineMeta',
  'hbu_jwxt_maintenance',
  'setMaintenanceFlag',
  'looksLikeMaintenanceIssue',
  'isQuotaExceededError',
  'localStorage',
  'src/utils/api.ts',
  'serverOcrRecognize',
  'syncDataToServer',
  'fetchDataFromServer',
  'src/utils/remote_config.js',
  'hbu_remote_config_snapshot',
  'cloud_sync',
  'src/utils/cloud_sync.js',
  'requestCloudSync',
  'x-cloud-sync-challenge',
  'cooldown',
  'src/utils/static_resource_cache.js',
  'static_resource:dormitory_data',
  'src/utils/forum_api.js',
  'hbu_forum_token',
  'src/utils/notify_center.js',
  'runNotificationCheck',
  'src/utils/background_fetch.js',
  'src/utils/widget_bridge.ts',
  'src/utils/widget_snapshot.ts',
  'src-tauri/src/http_client/mod.rs',
  'HbutClient',
  'Cookie Jar',
  'encrypt_password_aes',
  'login_cooldown_remaining',
  'src-tauri/src/http_client/session.rs',
  'restore_session',
  'get_cookie_snapshot',
  'clear_session',
  'src-tauri/src/db.rs',
  'save_cache',
  'get_cache',
  'user_sessions',
  'grades_cache',
  'schedule_cache',
  'electricity_cache',
  'ai_session_cache',
  '敏感信息边界',
  'base64 不是强加密',
  '离线能力边界',
  '错误处理',
  '源码证据索引',
]);

if (
  architectureDataFlow.includes('后续扩写来源') ||
  architectureDataFlow.includes('本页骨架职责') ||
  architectureDataFlow.includes('DocSectionPage')
) {
  failures.push('ArchitectureDataFlow 仍包含骨架页占位或通用骨架组件');
}

if (failures.length > 0) {
  console.error('docs developer content contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('docs developer content contract passed');
