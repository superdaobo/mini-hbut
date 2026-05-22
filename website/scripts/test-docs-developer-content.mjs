import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const developerOverview = read('src/pages/docs/DeveloperOverview.tsx');
const architectureDataFlow = read('src/pages/docs/ArchitectureDataFlow.tsx');
const platformTauri = read('src/pages/docs/PlatformTauri.tsx');
const buildRelease = read('src/pages/docs/BuildRelease.tsx');
const securityPrivacy = read('src/pages/docs/SecurityPrivacy.tsx');

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

expectIncludes(platformTauri, 'PlatformTauri', [
  '平台与 Tauri',
  '运行时识别',
  'src/platform/runtime.ts',
  'detectRuntime',
  'looksLikePackagedCapacitorHost',
  'PlatformBridge',
  'src/platform/types.ts',
  'src/platform/index.ts',
  'pickBridge',
  'platformBridge',
  'src/platform/native.ts',
  'invokeNative',
  'getCurrentNativeWindow',
  'exitNativeApp',
  'getNativeAppVersion',
  'toNativeFileSrc',
  'readNativeBinaryFile',
  'Tauri adapter',
  'src/platform/adapters/tauri.ts',
  'tauriBridge',
  'open_external_url',
  'get_notification_permission_native',
  'request_notification_permission_native',
  'send_local_notification_native',
  'tauri-plugin-keep-screen-on-api',
  'Capacitor adapter',
  'src/platform/adapters/capacitor.ts',
  'capacitorBridge',
  '@capacitor/app-launcher',
  '@capacitor/local-notifications',
  '@capacitor/share',
  'HBUTNative',
  'Web fallback',
  'src/platform/adapters/web.ts',
  'Notification.requestPermission',
  'navigator.share',
  'wakeLock',
  '通知动作边界',
  'src/platform/notification_actions.ts',
  'ALLOWED_NOTIFICATION_TARGETS',
  'normalizeNotificationTargetView',
  'resolveNotificationActionTarget',
  'Widget 桥接',
  'src/platform/capacitor/widget.ts',
  'getWidgetBridge',
  'writeSnapshot',
  'WidgetBridgeError',
  'SNAPSHOT_TOO_LARGE',
  'INVALID_SNAPSHOT',
  'Tauri 配置',
  'src-tauri/tauri.conf.json',
  'Mini-HBUT',
  'com.hbut.mini',
  'src-tauri/capabilities/main.json',
  'notification:allow-request-permission',
  'notification:allow-create-channel',
  'shell:default',
  'window-state:default',
  'Rust command',
  'src-tauri/src/lib.rs',
  'tauri_plugin_notification',
  'tauri_plugin_shell',
  'tauri_plugin_fs',
  'tauri_plugin_autostart',
  'tauri_plugin_window_state',
  'prepare_module_bundle',
  'open_module_bundle_window',
  'resource_share_list_dir_native',
  'write_widget_snapshot',
  'write_electricity_snapshot',
  'write_exam_snapshot',
  'debug_widget_paths',
  'Capacitor 配置',
  'capacitor.config.ts',
  'webDir',
  'androidScheme',
  'iosScheme',
  '权限边界',
  '能力矩阵',
  '源码证据索引',
]);

if (
  platformTauri.includes('后续扩写来源') ||
  platformTauri.includes('本页骨架职责') ||
  platformTauri.includes('DocSectionPage')
) {
  failures.push('PlatformTauri 仍包含骨架页占位或通用骨架组件');
}

expectIncludes(buildRelease, 'BuildRelease', [
  '构建发布',
  'package.json',
  'prebuild',
  'scripts/prepare_dist.mjs',
  'build:web',
  'build:hot-bundle',
  'scripts/build_hot_bundle.mjs',
  'dist-hot',
  'hot-manifest.json',
  'sha256',
  'src-tauri/tauri.conf.json',
  'beforeBuildCommand',
  'scripts/check_dist_boundary.mjs',
  'allowedEntries',
  'forbiddenSegments',
  'MINI_HBUT_BUILD_PROFILE',
  'manualChunks',
  'Capacitor',
  'cap:sync',
  'capacitor.config.ts',
  'webDir',
  'scripts/build_release_manifests.mjs',
  'stable-latest.json',
  'dev-latest.json',
  'active.json',
  'channels.json',
  'history.json',
  'latest/active',
  'scripts/build_website_modules.mjs',
  'website/public/modules',
  'catalog.json',
  'bundle.zip',
  'package_sha256',
  'scripts/guard_sensitive_uploads.mjs',
  'scripts/check-frontend-safety.mjs',
  'scripts/check-design-tokens.mjs',
  'website/package.json',
  'test:docs-ia',
  'test:docs-developer-content',
  'test:docs-user-content',
  'test:release-links',
  'website/scripts/test-release-links.mjs',
  '写入型脚本',
  '只读检查脚本',
  '发布前检查清单',
  '源码证据索引',
]);

if (
  buildRelease.includes('后续扩写来源') ||
  buildRelease.includes('本页骨架职责') ||
  buildRelease.includes('DocSectionPage')
) {
  failures.push('BuildRelease 仍包含骨架页占位或通用骨架组件');
}

expectIncludes(securityPrivacy, 'SecurityPrivacy', [
  '安全与隐私',
  '用户说明',
  '开发者边界',
  '统一身份认证',
  '学习通',
  'Cookie',
  'Cookie Jar',
  'get_cookies',
  'get_cookie_snapshot',
  'restore_session',
  'clear_session',
  'src-tauri/src/http_client/session.rs',
  'src-tauri/src/http_client/auth.rs',
  'src-tauri/src/http_client/mod.rs',
  'encrypt_password_aes',
  'last_password',
  'electricity_token',
  'user_sessions',
  'encrypted_password',
  'base64 不是强加密',
  'one_code_token',
  'electricity_refresh_token',
  'online_learning_platform_state',
  'cookie_blob',
  'chaoxing_checkin_log',
  'src-tauri/src/db.rs',
  'localStorage',
  'hbu_username',
  'hbu_remember',
  'hbu_remote_config_snapshot',
  'hbu_cloud_sync_device_id',
  'hbu_cloud_sync_status',
  'x-cloud-sync-challenge',
  'src/utils/cloud_sync.js',
  'src/utils/remote_config.js',
  'config_admin_ids',
  'customCss',
  'customJs',
  'scriptEl.textContent',
  'src/utils/ui_settings.ts',
  'src-tauri/capabilities/main.json',
  'security.csp',
  'csp: null',
  'shell:default',
  'notification:allow-request-permission',
  '远程内容',
  '模块包',
  'package_sha256',
  'zip 路径',
  'src-tauri/src/modules/module_bundle.rs',
  '调试桥',
  'enableBridgeTools',
  'debug_bridge',
  '热更新',
  'sha256',
  'signature',
  'verifyHotBundleSignature',
  '非对称签名',
  'scripts/guard_sensitive_uploads.mjs',
  'scripts/check-frontend-safety.mjs',
  'scripts/check-design-tokens.mjs',
  '敏感信息生命周期',
  '权限边界',
  '源码证据索引',
]);

if (
  securityPrivacy.includes('后续扩写来源') ||
  securityPrivacy.includes('本页骨架职责') ||
  securityPrivacy.includes('DocSectionPage')
) {
  failures.push('SecurityPrivacy 仍包含骨架页占位或通用骨架组件');
}

if (failures.length > 0) {
  console.error('docs developer content contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('docs developer content contract passed');
