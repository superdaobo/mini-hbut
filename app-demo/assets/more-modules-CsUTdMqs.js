import { i as isTestAccountSession, a as invokeNative, d as detectRuntime, _ as __vitePreload, b as isTauriRuntime, c as isCapacitorRuntime, p as pushDebugLog, e as isLikelyAndroidUserAgent, t as toNativeFileSrc, g as getNativeAppVersion } from "./runtime-bridge-apFQ0nCw.js";
import { r as reactive, w as watch } from "./vue-core-DdLVj9yW.js";
const IS_APP_STORE_BUILD = String(
  ""
) === "1";
function isAppStoreBuild() {
  return IS_APP_STORE_BUILD;
}
function allowsInAppGithubUpdater() {
  return !isAppStoreBuild();
}
function getUpdateCheckMode() {
  return isAppStoreBuild() ? "apple_storefront" : "github_cdn";
}
const readStoredUsername = () => {
  try {
    return String(globalThis.localStorage?.getItem("hbu_username") || "").trim();
  } catch {
    return "";
  }
};
function resolveAppStoreSession(session) {
  if (session && (session.isLoggedIn !== void 0 || session.isDemoSession !== void 0)) {
    return {
      isLoggedIn: session.isLoggedIn !== void 0 ? Boolean(session.isLoggedIn) : Boolean(readStoredUsername()),
      isDemoSession: session.isDemoSession !== void 0 ? Boolean(session.isDemoSession) : isTestAccountSession()
    };
  }
  return {
    isLoggedIn: Boolean(readStoredUsername()),
    isDemoSession: isTestAccountSession()
  };
}
function shouldApplyAppStoreRestrictions(session) {
  if (!isAppStoreBuild()) return false;
  const { isLoggedIn, isDemoSession } = resolveAppStoreSession(session);
  if (isDemoSession) return true;
  if (isLoggedIn) return false;
  return true;
}
const FULL_POLICY = Object.freeze({
  remoteCode: true,
  remoteModules: true,
  customJavaScript: true,
  arbitraryWebBrowsing: true,
  campusWriteOperations: true,
  attendanceAutomation: true,
  campusCredentialCode: true,
  liveMobilityLocation: true,
  externalAI: true,
  userGeneratedContent: true,
  ranking: true,
  schoolInbox: true,
  qxzkb: true,
  electricity: true,
  transactions: true,
  campusNetwork: true,
  serviceStats: true,
  debugTools: true,
  library: true,
  campusMap: true,
  resourceShare: true,
  chaoxingClass: true,
  academicReadonly: true,
  smartOrientation: true
});
const APP_STORE_POLICY = Object.freeze({
  remoteCode: false,
  remoteModules: false,
  customJavaScript: false,
  arbitraryWebBrowsing: false,
  campusWriteOperations: false,
  attendanceAutomation: false,
  campusCredentialCode: false,
  liveMobilityLocation: false,
  externalAI: false,
  userGeneratedContent: false,
  ranking: false,
  schoolInbox: false,
  qxzkb: false,
  electricity: false,
  transactions: false,
  campusNetwork: false,
  serviceStats: false,
  debugTools: false,
  library: true,
  campusMap: true,
  resourceShare: false,
  chaoxingClass: false,
  academicReadonly: true,
  smartOrientation: false
});
function getFeaturePolicy(session) {
  return shouldApplyAppStoreRestrictions(session) ? APP_STORE_POLICY : FULL_POLICY;
}
const APP_STORE_BLOCKED_MODULE_IDS = Object.freeze(
  /* @__PURE__ */ new Set([
    // 教务写入 / 敏感学业
    "course_selection",
    "ranking",
    "qxzkb",
    "school_inbox",
    "teaching_eval",
    // 一码通与校园生活写操作
    "campus_code",
    "electricity",
    "transactions",
    "broadband",
    "sports_venue",
    "campus_network",
    // 学习通（含签到与资料）
    "chaoxing_hub",
    "chaoxing_inbox",
    "chaoxing_class",
    "more_chaoxing_checkin",
    // 远程代码 / 出行 / 其它高风险
    "resource_share",
    "towergo",
    "smart_orientation",
    "ai",
    "forum",
    "more",
    "more_module_host",
    "service_stats",
    "config",
    "school_website",
    "quick_links"
  ])
);
const APP_STORE_ALLOWED_CORE_IDS = Object.freeze(
  /* @__PURE__ */ new Set([
    "home",
    "schedule",
    "grades",
    "exams",
    "classroom",
    "academic",
    "training",
    "calendar",
    "library",
    "campus_map",
    "notifications",
    "me",
    "settings",
    "export_center",
    "official",
    "feedback",
    "studentinfo",
    "privacy_data",
    "__more__"
  ])
);
const normalizeId = (id) => String(id ?? "").trim();
function isModuleAllowed(moduleId, session) {
  const id = normalizeId(moduleId);
  if (!id) return false;
  if (id === "__more__") {
    return true;
  }
  if (!shouldApplyAppStoreRestrictions(session)) return true;
  if (APP_STORE_BLOCKED_MODULE_IDS.has(id)) return false;
  if (APP_STORE_ALLOWED_CORE_IDS.has(id)) return true;
  return false;
}
function isViewAllowed(view, session) {
  const id = normalizeId(view);
  if (!id) return false;
  if (!shouldApplyAppStoreRestrictions(session)) return true;
  if (APP_STORE_BLOCKED_MODULE_IDS.has(id)) return false;
  if (APP_STORE_ALLOWED_CORE_IDS.has(id)) return true;
  if (["home", "schedule", "notifications", "me"].includes(id)) return true;
  return false;
}
function filterAllowedModules(modules, session) {
  return (modules || []).filter((m) => isModuleAllowed(m?.id, session));
}
function isLiveLocationAllowed() {
  return getFeaturePolicy().liveMobilityLocation;
}
function isCustomJavaScriptAllowed() {
  return getFeaturePolicy().customJavaScript;
}
function isRemoteModulesAllowed() {
  return getFeaturePolicy().remoteModules;
}
function isSponsorEntryAllowed(options) {
  return !shouldApplyAppStoreRestrictions({
    isLoggedIn: Boolean(options?.isLoggedIn),
    isDemoSession: Boolean(options?.isDemoSession)
  });
}
const NON_OFFICIAL_DISCLAIMER_ZH = "Mini-HBUT 是独立开发、社区维护的开源学生工具，不由任何学校或教育机构开发、运营、赞助或背书。";
const NON_OFFICIAL_DISCLAIMER_EN = "Mini-HBUT is an independently developed and community-maintained open-source student utility. It is not developed, operated, sponsored, or endorsed by any university or educational institution.";
const PRIVACY_POLICY_URL = "https://hbut.6661111.xyz/privacy";
const SUPPORT_DOCS_URL = "https://hbut.6661111.xyz/docs";
const SECURITY_DOCS_URL = "https://hbut.6661111.xyz/docs/security-privacy";
const PROJECT_HOME_URL = "https://hbut.6661111.xyz";
const GITHUB_URL = "https://github.com/superdaobo/mini-hbut";
const FEEDBACK_URL = "https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2";
const ICP_BEIAN_TEXT = "鲁ICP备2026039385号-1A";
const ICP_BEIAN_URL = "https://beian.miit.gov.cn/";
const DEMO_MODE_BANNER_ZH = "当前为审核演示模式，页面使用虚构数据，不连接真实校园服务。";
const DEMO_MODE_BANNER_EN = "Demo Mode: This session uses fictional local data and does not connect to live campus services.";
const app_store_policy = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  APP_STORE_ALLOWED_CORE_IDS,
  APP_STORE_BLOCKED_MODULE_IDS,
  DEMO_MODE_BANNER_EN,
  DEMO_MODE_BANNER_ZH,
  FEEDBACK_URL,
  GITHUB_URL,
  ICP_BEIAN_TEXT,
  ICP_BEIAN_URL,
  IS_APP_STORE_BUILD,
  NON_OFFICIAL_DISCLAIMER_EN,
  NON_OFFICIAL_DISCLAIMER_ZH,
  PRIVACY_POLICY_URL,
  PROJECT_HOME_URL,
  SECURITY_DOCS_URL,
  SUPPORT_DOCS_URL,
  allowsInAppGithubUpdater,
  filterAllowedModules,
  getFeaturePolicy,
  getUpdateCheckMode,
  isAppStoreBuild,
  isCustomJavaScriptAllowed,
  isLiveLocationAllowed,
  isModuleAllowed,
  isRemoteModulesAllowed,
  isSponsorEntryAllowed,
  isViewAllowed,
  resolveAppStoreSession,
  shouldApplyAppStoreRestrictions
}, Symbol.toStringTag, { value: "Module" }));
const STORAGE_KEY = "hbu_app_settings_v1";
const LOCAL_HOST_PATTERN = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i;
const DEFAULT_CLOUD_SYNC_ENDPOINT = "https://mini-hbut-testocr1.hf.space/api/cloud-sync";
const DEFAULT_BACKEND_TARGETS = {
  portal: "https://e.hbut.edu.cn/stu/index.html#/",
  jwxt: "https://jwxt.hbut.edu.cn/admin",
  chaoxing: "https://hbut.jw.chaoxing.com/admin",
  oneCode: "https://code.hbut.edu.cn",
  library: "https://lib.hbut.edu.cn"
};
const DEFAULT_SETTINGS = {
  retry: {
    electricity: 2,
    classroom: 2
  },
  retryDelayMs: 2e3,
  resourceShare: {
    previewThreadsMobile: 3,
    previewThreadsDesktop: 4,
    downloadThreadsMobile: 4,
    downloadThreadsDesktop: 6
  },
  backend: {
    useRemoteConfig: true,
    ocrEndpoint: "",
    tempUploadEndpoint: "",
    cloudSyncEndpoint: "",
    cloudSyncSecretRef: "",
    moduleTargets: { ...DEFAULT_BACKEND_TARGETS },
    moduleParams: {
      requestTimeoutMs: 15e3,
      probeTimeoutMs: 8e3,
      cloudSyncCooldownSec: 180,
      cloudSyncUploadCooldownSec: 120,
      cloudSyncDownloadCooldownSec: 10
    }
  }
};
const clampNumber = (value, min, max, fallback) => {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};
const normalizeUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text.replace(/\s+/g, "");
  const prefix = LOCAL_HOST_PATTERN.test(text) ? "http://" : "https://";
  return `${prefix}${text}`.replace(/\s+/g, "");
};
const normalizeSettings = (raw) => {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!raw || typeof raw !== "object") return base;
  const next = { ...base, ...raw };
  next.retry = { ...base.retry, ...raw.retry || {} };
  next.resourceShare = { ...base.resourceShare, ...raw.resourceShare || {} };
  next.backend = { ...base.backend, ...raw.backend || {} };
  next.backend.moduleTargets = { ...base.backend.moduleTargets };
  next.backend.moduleParams = {
    ...base.backend.moduleParams,
    ...raw.backend?.moduleParams || {}
  };
  next.retry.electricity = clampNumber(next.retry.electricity, 0, 5, base.retry.electricity);
  next.retry.classroom = clampNumber(next.retry.classroom, 0, 5, base.retry.classroom);
  next.retryDelayMs = clampNumber(next.retryDelayMs, 500, 1e4, base.retryDelayMs);
  next.resourceShare.previewThreadsMobile = clampNumber(
    next.resourceShare.previewThreadsMobile,
    1,
    8,
    base.resourceShare.previewThreadsMobile
  );
  next.resourceShare.previewThreadsDesktop = clampNumber(
    next.resourceShare.previewThreadsDesktop,
    1,
    12,
    base.resourceShare.previewThreadsDesktop
  );
  next.resourceShare.downloadThreadsMobile = clampNumber(
    next.resourceShare.downloadThreadsMobile,
    1,
    8,
    base.resourceShare.downloadThreadsMobile
  );
  next.resourceShare.downloadThreadsDesktop = clampNumber(
    next.resourceShare.downloadThreadsDesktop,
    1,
    12,
    base.resourceShare.downloadThreadsDesktop
  );
  next.backend.useRemoteConfig = next.backend.useRemoteConfig !== false;
  next.backend.ocrEndpoint = normalizeUrl(next.backend.ocrEndpoint);
  next.backend.tempUploadEndpoint = normalizeUrl(next.backend.tempUploadEndpoint);
  next.backend.cloudSyncEndpoint = normalizeUrl(next.backend.cloudSyncEndpoint);
  next.backend.cloudSyncSecretRef = String(next.backend.cloudSyncSecretRef || "").trim();
  next.backend.moduleTargets = { ...base.backend.moduleTargets };
  next.backend.moduleParams.requestTimeoutMs = clampNumber(
    next.backend.moduleParams.requestTimeoutMs,
    5e3,
    6e4,
    base.backend.moduleParams.requestTimeoutMs
  );
  next.backend.moduleParams.probeTimeoutMs = clampNumber(
    next.backend.moduleParams.probeTimeoutMs,
    3e3,
    3e4,
    base.backend.moduleParams.probeTimeoutMs
  );
  next.backend.moduleParams.cloudSyncCooldownSec = clampNumber(
    next.backend.moduleParams.cloudSyncCooldownSec,
    10,
    3600,
    base.backend.moduleParams.cloudSyncCooldownSec
  );
  next.backend.moduleParams.cloudSyncUploadCooldownSec = clampNumber(
    next.backend.moduleParams.cloudSyncUploadCooldownSec,
    120,
    3600,
    base.backend.moduleParams.cloudSyncUploadCooldownSec
  );
  next.backend.moduleParams.cloudSyncDownloadCooldownSec = clampNumber(
    next.backend.moduleParams.cloudSyncDownloadCooldownSec,
    10,
    3600,
    base.backend.moduleParams.cloudSyncDownloadCooldownSec
  );
  return next;
};
const loadStoredSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const state = reactive(normalizeSettings(loadStoredSettings()));
const initAppSettings = () => {
  watch(
    state,
    () => {
      const normalized = normalizeSettings(state);
      const normalizedText = JSON.stringify(normalized);
      const stateText = JSON.stringify(state);
      if (stateText !== normalizedText) {
        state.retry = { ...normalized.retry };
        state.retryDelayMs = normalized.retryDelayMs;
        state.resourceShare = { ...normalized.resourceShare };
        state.backend = {
          ...normalized.backend,
          moduleTargets: { ...normalized.backend.moduleTargets },
          moduleParams: { ...normalized.backend.moduleParams }
        };
      }
      try {
        localStorage.setItem(STORAGE_KEY, normalizedText);
      } catch {
      }
    },
    { deep: true, immediate: true }
  );
};
const useAppSettings = () => state;
const resetAppSettings = () => {
  Object.assign(state, normalizeSettings(DEFAULT_SETTINGS));
};
const applyAppSettingsSnapshot = (raw) => {
  const normalized = normalizeSettings(raw);
  state.retry = { ...normalized.retry };
  state.retryDelayMs = normalized.retryDelayMs;
  state.resourceShare = { ...normalized.resourceShare };
  state.backend = {
    ...normalized.backend,
    moduleTargets: { ...normalized.backend.moduleTargets },
    moduleParams: { ...normalized.backend.moduleParams }
  };
};
const DEFAULT_MODULE_CDN_BASE$1 = "https://hbut.6661111.xyz/modules";
const DEFAULT_MODULE_CENTER$1 = Object.freeze({
  channel: "main",
  modules: Object.freeze([
    Object.freeze({
      id: "hecheng_hugongda",
      name: "合成湖工大",
      icon: "🎮",
      description: "下载最新游戏包并打开",
      key_required: false,
      kind: "remote",
      order: 1
    }),
    Object.freeze({
      id: "jump_out_hbut",
      name: "跳出湖工大",
      icon: "🦘",
      description: "跳一跳风格校园跳跃小游戏",
      key_required: false,
      kind: "remote",
      order: 2
    }),
    Object.freeze({
      id: "hbut_2048",
      name: "2048 湖工大版",
      icon: "🔢",
      description: "经典 2048 数字合并游戏",
      key_required: false,
      kind: "remote",
      order: 3
    }),
    Object.freeze({
      id: "clumsy_bird_hbut",
      name: "笨鸟先飞",
      icon: "🐦",
      description: "点击屏幕控制小鸟飞行",
      key_required: false,
      kind: "remote",
      order: 4
    }),
    Object.freeze({
      id: "hbut_monopoly",
      name: "湖工大富翁",
      icon: "🎲",
      description: "投骰走遍校园，经营金币与绩点",
      key_required: false,
      kind: "remote",
      order: 5
    }),
    Object.freeze({
      id: "hbut_miner",
      name: "湖工矿工",
      icon: "⛏️",
      description: "摆动吊钩抓取湖工宝物",
      key_required: false,
      kind: "remote",
      order: 6
    }),
    Object.freeze({
      id: "hbut_memory_match",
      name: "湖工记忆牌",
      icon: "🧠",
      description: "翻开校园记忆，配对湖工地点",
      key_required: false,
      kind: "remote",
      order: 7
    }),
    Object.freeze({
      id: "hbut_gomoku",
      name: "湖工五子棋",
      icon: "◉",
      description: "本地双人十五路五子棋",
      key_required: false,
      kind: "remote",
      order: 8
    }),
    Object.freeze({
      id: "hbut_stack",
      name: "湖工叠塔",
      icon: "🏗️",
      description: "点击落下叠高楼，切除悬挑冲高分",
      key_required: false,
      kind: "remote",
      order: 9
    }),
    Object.freeze({
      id: "hbut_parking",
      name: "湖工挪车",
      icon: "🚌",
      description: "滑块挪车，把校车移出停车场",
      key_required: false,
      kind: "remote",
      order: 10
    }),
    Object.freeze({
      id: "hbut_match3",
      name: "湖工消消乐",
      icon: "🍬",
      description: "校园三消：交换连锁冲高分",
      key_required: false,
      kind: "remote",
      order: 11
    })
  ])
});
const safeText$1 = (value) => String(value ?? "").trim();
const firstNonEmpty$1 = (...values) => {
  for (const value of values) {
    const text = safeText$1(value);
    if (text) return text;
  }
  return "";
};
const toBool = (value) => value === true || value === 1 || value === "1";
const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const normalizeModuleCenterChannel$1 = (value, fallback = "main") => {
  const normalized = safeText$1(value).toLowerCase();
  if (normalized === "latest") return "latest";
  if (normalized === "dev") return "dev";
  if (normalized === "main") return "main";
  return fallback === "dev" || fallback === "latest" ? fallback : "main";
};
const buildModuleManifestUrl = ({
  rawUrl = "",
  channel = DEFAULT_MODULE_CENTER$1.channel,
  moduleId = "",
  moduleCdnBase = DEFAULT_MODULE_CDN_BASE$1
} = {}) => {
  const explicit = safeText$1(rawUrl);
  const normalizedChannel = normalizeModuleCenterChannel$1(channel);
  const id = safeText$1(moduleId);
  const base = safeText$1(moduleCdnBase).replace(/\/+$/, "") || DEFAULT_MODULE_CDN_BASE$1;
  if (explicit) {
    try {
      return new URL(explicit, `${base}/${normalizedChannel}/`).toString();
    } catch {
      return explicit;
    }
  }
  return id ? `${base}/${normalizedChannel}/${id}/manifest.json` : "";
};
const normalizeModuleCenterEntry$1 = (value, index = 0, channel = DEFAULT_MODULE_CENTER$1.channel, options = {}) => {
  const raw = value && typeof value === "object" ? value : {};
  const id = firstNonEmpty$1(raw.id, raw.module_id);
  if (!id) return null;
  const kindText = safeText$1(raw.kind || raw.type).toLowerCase();
  const kind = kindText === "internal" || id === "shuake" ? "internal" : "remote";
  const view = firstNonEmpty$1(raw.view, raw.route, id === "shuake" ? "more_shuake" : "");
  const order = safeNumber(raw.order, index + 1);
  return {
    id,
    name: firstNonEmpty$1(raw.name, raw.module_name, raw.title, id),
    icon: firstNonEmpty$1(raw.icon, id === "shuake" ? "🔐" : kind === "remote" ? "📦" : "🧩"),
    description: firstNonEmpty$1(raw.description, raw.desc),
    key_required: id === "shuake" || toBool(raw.key_required || raw.keyRequired),
    kind,
    view,
    order,
    min_compatible_version: firstNonEmpty$1(raw.min_compatible_version, raw.minCompatibleVersion),
    manifest_url: kind === "remote" ? buildModuleManifestUrl({
      rawUrl: firstNonEmpty$1(raw.manifest_url, raw.manifestUrl),
      channel,
      moduleId: id,
      moduleCdnBase: options.moduleCdnBase
    }) : ""
  };
};
const mergeRemoteCatalogFields = (item, catalogItem, channel, moduleCdnBase) => {
  if (!item || item.kind !== "remote" || !catalogItem) return item;
  return {
    ...catalogItem,
    ...item,
    kind: "remote",
    manifest_url: firstNonEmpty$1(
      catalogItem.manifest_url,
      catalogItem.manifestUrl,
      item.manifest_url,
      buildModuleManifestUrl({ channel, moduleId: item.id, moduleCdnBase })
    )
  };
};
const buildModuleCenterCards = ({
  channel = DEFAULT_MODULE_CENTER$1.channel,
  configuredModules = [],
  catalogModules = [],
  moduleCdnBase = DEFAULT_MODULE_CDN_BASE$1
} = {}) => {
  const normalizedChannel = normalizeModuleCenterChannel$1(channel);
  const normalize = (item, index) => normalizeModuleCenterEntry$1(item, index, normalizedChannel, { moduleCdnBase });
  const builtInModules = DEFAULT_MODULE_CENTER$1.modules.map(normalize).filter(Boolean);
  const builtInInternalModules = builtInModules.filter((item) => item.kind === "internal");
  const normalizedCatalogModules = (Array.isArray(catalogModules) ? catalogModules : []).map(normalize).filter(Boolean);
  const catalogMap = new Map(normalizedCatalogModules.map((item) => [item.id, item]));
  const normalizedConfiguredModules = (Array.isArray(configuredModules) ? configuredModules : []).map(normalize).filter(Boolean);
  const configuredMap = new Map(normalizedConfiguredModules.map((item) => [item.id, item]));
  const configuredInternalModules = normalizedConfiguredModules.filter((item) => item.kind === "internal");
  const mergedById = /* @__PURE__ */ new Map();
  for (const item of builtInInternalModules) {
    mergedById.set(item.id, item);
  }
  for (const item of configuredInternalModules) {
    mergedById.set(item.id, item);
  }
  for (const item of builtInModules.filter((entry) => entry.kind === "remote")) {
    const configuredItem = configuredMap.get(item.id);
    const catalogItem = catalogMap.get(item.id);
    const baseItem = configuredItem && configuredItem.kind === "remote" ? { ...item, ...configuredItem } : item;
    mergedById.set(
      item.id,
      mergeRemoteCatalogFields(baseItem, catalogItem, normalizedChannel, moduleCdnBase)
    );
  }
  for (const item of normalizedCatalogModules) {
    if (mergedById.has(item.id)) continue;
    mergedById.set(item.id, item);
  }
  return [...mergedById.values()].sort((a, b) => {
    const orderDelta = safeNumber(a.order, 999) - safeNumber(b.order, 999);
    if (orderDelta !== 0) return orderDelta;
    if (a.kind === "internal" && b.kind !== "internal") return -1;
    if (a.kind !== "internal" && b.kind === "internal") return 1;
    return safeText$1(a.id).localeCompare(safeText$1(b.id));
  });
};
const REMOTE_CONFIG_URLS = [
  "https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json",
  "https://gh-proxy.com/https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json"
];
const PACKAGE_CONFIG_URL = "/remote_config.json";
[...REMOTE_CONFIG_URLS, PACKAGE_CONFIG_URL];
const REMOTE_CONFIG_SNAPSHOT_KEY = "hbu_remote_config_snapshot";
const REMOTE_CONFIG_UPDATED_EVENT = "hbu-remote-config-updated";
const OCR_REMOTE_ENDPOINTS_KEY = "hbu_ocr_remote_endpoints";
const OCR_LOCAL_FALLBACK_ENDPOINTS_KEY = "hbu_ocr_local_fallback_endpoints";
const OCR_PRIMARY_ENDPOINT_KEY = "hbu_ocr_endpoint";
const DEFAULT_OCR_ENDPOINT = "https://mini-hbut-testocr1.hf.space/api/ocr/recognize";
const DEFAULT_OCR_ENDPOINTS = [DEFAULT_OCR_ENDPOINT];
const DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS = [
  "http://1.94.167.18:5080/api/ocr/recognize",
  "https://mini-hbut-testocr1.hf.space/api/ocr/recognize"
];
const DEFAULT_WEBDAV_ENDPOINT = "https://mini-hbut-chaoxing-webdav.hf.space";
const DEFAULT_FORUM_ENDPOINT = "https://mini-hbut-testocr1.hf.space/api/forum";
const LOCAL_FORUM_API_BASE_KEY = "hbu_forum_api_base";
const DEFAULT_CLOUD_SYNC_SECRET_REF = "kv1-main";
const MODULE_CDN_BASE = "https://hbut.6661111.xyz/modules";
const DEFAULT_MODULE_CENTER = DEFAULT_MODULE_CENTER$1;
const DEFAULT_CONFIG = {
  announcements: {
    pinned: [],
    ticker: [],
    list: [],
    confirm: []
  },
  force_update: {
    min_version: "",
    message: "",
    download_url: ""
  },
  ocr: {
    endpoint: DEFAULT_OCR_ENDPOINT,
    endpoints: [...DEFAULT_OCR_ENDPOINTS],
    local_fallback_endpoints: [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS],
    enabled: true
  },
  temp_file_server: {
    schedule_upload_endpoint: "",
    enabled: true
  },
  resource_share: {
    enabled: true,
    endpoint: DEFAULT_WEBDAV_ENDPOINT,
    username: "mini-hbut",
    password: "mini-hbut",
    office_preview_proxy: "https://view.officeapps.live.com/op/view.aspx?src=",
    temp_upload_endpoint: ""
  },
  forum: {
    enabled: true,
    api_base: DEFAULT_FORUM_ENDPOINT
  },
  cloud_sync: {
    enabled: true,
    mode: "proxy",
    proxy_endpoint: DEFAULT_CLOUD_SYNC_ENDPOINT,
    secret_ref: DEFAULT_CLOUD_SYNC_SECRET_REF,
    timeout_ms: 12e3,
    cooldown_seconds: 180
  },
  module_center: {
    channel: DEFAULT_MODULE_CENTER.channel,
    modules: [...DEFAULT_MODULE_CENTER.modules]
  },
  // #360 学习通资料库：远程只需 invite_code；课程名/教师/ID 由邀请码在线解析
  chaoxing_class: {
    enabled: true,
    invite_code: "18853572"
  },
  ai_models: [],
  config_admin_ids: []
};
const DEFAULT_CHAOXING_INVITE_CODE = "18853572";
const CHAOXING_INVITE_CACHE_KEY = "hbu_chaoxing_invite_code_cache_v1";
let chaoxingInviteMemory = "";
const REMOTE_CONFIG_KEYS = [
  "announcements",
  "announcement",
  "notices",
  "force_update",
  "ocr",
  "temp_file_server",
  "resource_share",
  "forum",
  "cloud_sync",
  "module_center",
  "more_modules",
  "chaoxing_class",
  "ai_models",
  "config_admin_ids"
];
const REMOTE_CONFIG_MEMORY_TTL_MS = 45 * 1e3;
const REMOTE_CONFIG_FETCH_TIMEOUT_MS = 3e3;
let remoteConfigMemory = null;
let remoteConfigMemoryAt = 0;
let remoteConfigInFlight = null;
const toArray = (value) => Array.isArray(value) ? value : [];
const toString = (value) => value == null ? "" : String(value);
const firstNonEmpty = (...values) => {
  for (const value of values) {
    const text = toString(value).trim();
    if (text) return text;
  }
  return "";
};
const normalizeCloudSyncProxyEndpoint = (value) => {
  const text = toString(value).trim();
  if (!text) return "";
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  const normalized = withProtocol.replace(/\/+$/, "");
  if (/\/api\/cloud-sync$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/api/cloud-sync`;
};
const normalizeOcrEndpoint = (value) => {
  const text = toString(value).trim();
  if (!text) return "";
  const withProtocol = /^https?:\/\//i.test(text) ? text : `http://${text}`;
  return withProtocol.includes("/api/ocr/recognize") ? withProtocol : `${withProtocol.replace(/\/+$/, "")}/api/ocr/recognize`;
};
const normalizeForumEndpoint = (value) => {
  const text = toString(value).trim();
  if (!text) return DEFAULT_FORUM_ENDPOINT;
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  const normalized = withProtocol.replace(/\/+$/, "");
  if (/\/api\/forum$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/api/forum`;
};
const isLocalForumEndpointOverride = (value) => {
  const endpoint = normalizeForumEndpoint(value);
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    return isLoopback ? endpoint : "";
  } catch {
    return "";
  }
};
const getLocalForumEndpointOverride = () => {
  let fromQuery = "";
  try {
    const search = globalThis.window?.location?.search || "";
    const params = new URLSearchParams(search);
    fromQuery = isLocalForumEndpointOverride(
      firstNonEmpty(params.get("forumApiBase"), params.get("forum_api_base"))
    );
  } catch {
    fromQuery = "";
  }
  let fromStorage = "";
  try {
    fromStorage = isLocalForumEndpointOverride(
      firstNonEmpty(globalThis.localStorage?.getItem(LOCAL_FORUM_API_BASE_KEY))
    );
  } catch {
    fromStorage = "";
  }
  return firstNonEmpty(fromQuery, fromStorage);
};
const normalizeEndpointList = (value) => {
  const array = toArray(value);
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of array) {
    const endpoint = normalizeOcrEndpoint(item);
    if (!endpoint || seen.has(endpoint)) continue;
    seen.add(endpoint);
    result.push(endpoint);
  }
  return result;
};
const getBackendSettings = () => {
  try {
    const settings = useAppSettings();
    return settings?.backend || {};
  } catch {
    return {};
  }
};
const isRemoteConfigEnabled = () => getBackendSettings()?.useRemoteConfig !== false;
const buildLocalOnlyConfig = () => {
  const backend = getBackendSettings();
  const normalized = normalizeRemoteConfig(DEFAULT_CONFIG);
  const localOcrEndpoint = normalizeOcrEndpoint(backend?.ocrEndpoint) || DEFAULT_OCR_ENDPOINT;
  const ocrEndpoints = [localOcrEndpoint];
  const primaryEndpoint = localOcrEndpoint;
  normalized.ocr.endpoint = primaryEndpoint;
  normalized.ocr.endpoints = ocrEndpoints;
  normalized.ocr.local_fallback_endpoints = [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS];
  normalized.ocr.enabled = true;
  const tempUploadEndpoint = firstNonEmpty(backend?.tempUploadEndpoint);
  normalized.temp_file_server.schedule_upload_endpoint = tempUploadEndpoint;
  normalized.temp_file_server.enabled = true;
  normalized.resource_share.temp_upload_endpoint = tempUploadEndpoint;
  normalized.cloud_sync = {
    enabled: true,
    mode: "proxy",
    proxy_endpoint: normalizeCloudSyncProxyEndpoint(
      firstNonEmpty(backend?.cloudSyncEndpoint, DEFAULT_CLOUD_SYNC_ENDPOINT)
    ),
    secret_ref: firstNonEmpty(backend?.cloudSyncSecretRef, DEFAULT_CLOUD_SYNC_SECRET_REF),
    timeout_ms: 12e3,
    cooldown_seconds: Number(backend?.moduleParams?.cloudSyncCooldownSec || 180),
    upload_cooldown_seconds: Number(backend?.moduleParams?.cloudSyncUploadCooldownSec || 120),
    download_cooldown_seconds: Number(backend?.moduleParams?.cloudSyncDownloadCooldownSec || 10)
  };
  return normalized;
};
const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const persistOcrConfig = (ocr) => {
  const endpoints = normalizeEndpointList(ocr?.endpoints);
  const localFallbackEndpoints = normalizeEndpointList(ocr?.local_fallback_endpoints);
  const primary = endpoints[0] || "";
  try {
    localStorage.setItem(OCR_REMOTE_ENDPOINTS_KEY, JSON.stringify(endpoints));
    localStorage.setItem(OCR_LOCAL_FALLBACK_ENDPOINTS_KEY, JSON.stringify(localFallbackEndpoints));
    if (primary) {
      localStorage.setItem(OCR_PRIMARY_ENDPOINT_KEY, primary);
    } else {
      localStorage.removeItem(OCR_PRIMARY_ENDPOINT_KEY);
    }
  } catch {
  }
  return { endpoints, localFallbackEndpoints, primary };
};
const getStoredOcrConfig = () => {
  const endpoints = normalizeEndpointList(
    safeJsonParse(localStorage.getItem(OCR_REMOTE_ENDPOINTS_KEY) || "[]", [])
  );
  const localFallbackEndpoints = normalizeEndpointList(
    safeJsonParse(localStorage.getItem(OCR_LOCAL_FALLBACK_ENDPOINTS_KEY) || "[]", [])
  );
  const primary = normalizeOcrEndpoint(localStorage.getItem(OCR_PRIMARY_ENDPOINT_KEY) || "");
  return {
    endpoints: endpoints.length > 0 ? endpoints : [...DEFAULT_OCR_ENDPOINTS],
    local_fallback_endpoints: localFallbackEndpoints.length > 0 ? localFallbackEndpoints : [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS],
    endpoint: primary || endpoints[0] || DEFAULT_OCR_ENDPOINT
  };
};
const withCacheBust$1 = (url) => {
  const text = String(url || "").trim();
  if (!text) return "";
  const joiner = text.includes("?") ? "&" : "?";
  return `${text}${joiner}_t=${Date.now()}`;
};
const withTimeout$1 = async (promise, timeoutMs, timeoutMessage) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage || "请求超时"));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const resolveAnnouncements = (cfg) => {
  const root = cfg && typeof cfg === "object" ? cfg : {};
  const obj = root.announcements || root.announcement || root.notices || {};
  return {
    pinned: toArray(obj.pinned || obj.pin || root.pinned),
    ticker: toArray(obj.ticker || obj.scroll || obj.marquee || root.ticker),
    list: toArray(obj.list || obj.items || root.notice_list || root.list),
    confirm: toArray(obj.confirm || obj.required || root.confirm)
  };
};
const normalizeModuleCenterChannel = (value) => {
  const normalized = toString(value).trim().toLowerCase();
  return normalized === "dev" ? "dev" : "main";
};
const resolveModuleManifestUrl = (rawUrl, channel, moduleId) => {
  const explicit = toString(rawUrl).trim();
  if (explicit) {
    try {
      return new URL(explicit, `${MODULE_CDN_BASE}/${channel}/`).toString();
    } catch {
      return explicit;
    }
  }
  return `${MODULE_CDN_BASE}/${channel}/${moduleId}/manifest.json`;
};
const normalizeModuleCenterEntry = (value, index = 0, channel = "main") => {
  const raw = value && typeof value === "object" ? value : {};
  const id = firstNonEmpty(raw.id, raw.module_id);
  if (!id) return null;
  const view = firstNonEmpty(raw.view, raw.route, id === "shuake" ? "more_shuake" : "");
  const kindText = toString(raw.kind || raw.type).trim().toLowerCase();
  const kind = kindText === "internal" || id === "shuake" ? "internal" : "remote";
  const order = Number(raw.order);
  return {
    id,
    name: firstNonEmpty(raw.name, raw.module_name, raw.title, id),
    icon: firstNonEmpty(raw.icon, id === "shuake" ? "🔐" : kind === "remote" ? "📦" : "🧩"),
    description: firstNonEmpty(raw.description, raw.desc),
    key_required: id === "shuake" || raw.key_required === true || raw.keyRequired === true,
    kind,
    view,
    order: Number.isFinite(order) ? order : index + 1,
    manifest_url: kind === "remote" ? resolveModuleManifestUrl(firstNonEmpty(raw.manifest_url, raw.manifestUrl), channel, id) : ""
  };
};
const resolveModuleCenter = (cfg) => {
  const root = cfg && typeof cfg === "object" ? cfg : {};
  const moduleCenter = root.module_center && typeof root.module_center === "object" ? root.module_center : {};
  const moreModules = root.more_modules && typeof root.more_modules === "object" ? root.more_modules : {};
  const channel = normalizeModuleCenterChannel(
    firstNonEmpty(
      moduleCenter.channel,
      moreModules.channel,
      root.module_channel,
      root.more_modules_channel,
      DEFAULT_MODULE_CENTER.channel
    )
  );
  const rawModules = toArray(
    moduleCenter.modules ?? moreModules.modules ?? (Array.isArray(root.more_modules) ? root.more_modules : [])
  );
  let modules = rawModules.map((item, index) => normalizeModuleCenterEntry(item, index, channel)).filter(Boolean);
  if (modules.length === 0) {
    modules = DEFAULT_MODULE_CENTER.modules.map((item, index) => normalizeModuleCenterEntry(item, index, channel)).filter(Boolean);
  }
  const deduped = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of modules) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return {
    channel,
    modules: deduped
  };
};
function normalizeRemoteConfig(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const announcements = resolveAnnouncements(cfg);
  const endpointCandidates = [
    ...toArray(cfg.ocr?.endpoints),
    cfg.ocr?.endpoint,
    cfg.ocr?.url,
    cfg.ocr_endpoint,
    cfg.ocrUrl
  ];
  const normalizedEndpoints = normalizeEndpointList(endpointCandidates);
  const ocrEndpoints = normalizedEndpoints.length > 0 ? normalizedEndpoints : [...DEFAULT_OCR_ENDPOINTS];
  const localFallbackCandidates = [
    ...toArray(cfg.ocr?.local_fallback_endpoints),
    ...toArray(cfg.ocr?.localFallbackEndpoints),
    ...toArray(cfg.ocr_local_fallback_endpoints)
  ];
  const normalizedLocalFallback = normalizeEndpointList(localFallbackCandidates);
  const localFallbackEndpoints = normalizedLocalFallback.length > 0 ? normalizedLocalFallback : [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS];
  const forumEndpointOverride = getLocalForumEndpointOverride();
  return {
    announcements,
    force_update: {
      min_version: firstNonEmpty(cfg.force_update?.min_version, cfg.force_update?.minVersion),
      message: firstNonEmpty(cfg.force_update?.message),
      download_url: firstNonEmpty(cfg.force_update?.download_url, cfg.force_update?.downloadUrl)
    },
    ocr: {
      endpoint: ocrEndpoints[0] || DEFAULT_OCR_ENDPOINT,
      endpoints: ocrEndpoints,
      local_fallback_endpoints: localFallbackEndpoints,
      enabled: cfg.ocr?.enabled !== false
    },
    temp_file_server: {
      schedule_upload_endpoint: firstNonEmpty(
        cfg.temp_file_server?.schedule_upload_endpoint,
        cfg.temp_file_server?.upload_endpoint,
        cfg.temp_file_server?.endpoint,
        cfg.temp_upload_endpoint
      ),
      enabled: cfg.temp_file_server?.enabled !== false
    },
    resource_share: {
      enabled: cfg.resource_share?.enabled !== false,
      endpoint: firstNonEmpty(
        cfg.resource_share?.endpoint,
        cfg.webdav?.endpoint,
        DEFAULT_WEBDAV_ENDPOINT
      ),
      username: firstNonEmpty(cfg.resource_share?.username, cfg.webdav?.username, "mini-hbut"),
      password: firstNonEmpty(cfg.resource_share?.password, cfg.webdav?.password, "mini-hbut"),
      office_preview_proxy: firstNonEmpty(
        cfg.resource_share?.office_preview_proxy,
        "https://view.officeapps.live.com/op/view.aspx?src="
      ),
      temp_upload_endpoint: firstNonEmpty(
        cfg.resource_share?.temp_upload_endpoint,
        cfg.temp_file_server?.schedule_upload_endpoint,
        cfg.temp_file_server?.upload_endpoint
      )
    },
    forum: {
      enabled: cfg.forum?.enabled !== false,
      api_base: normalizeForumEndpoint(
        firstNonEmpty(
          forumEndpointOverride,
          cfg.forum?.api_base,
          cfg.forum?.apiBase,
          cfg.forum?.endpoint,
          cfg.forum_api_base,
          DEFAULT_FORUM_ENDPOINT
        )
      )
    },
    cloud_sync: {
      enabled: cfg.cloud_sync?.enabled !== false,
      mode: firstNonEmpty(
        cfg.cloud_sync?.mode,
        cfg.cloud_sync_mode,
        cfg.sync?.mode,
        "proxy"
      ),
      proxy_endpoint: normalizeCloudSyncProxyEndpoint(
        firstNonEmpty(
          cfg.cloud_sync?.proxy_endpoint,
          cfg.cloud_sync?.proxyEndpoint,
          cfg.cloud_sync?.endpoint,
          cfg.cloud_sync_proxy_endpoint,
          cfg.cloud_sync_endpoint,
          cfg.sync?.proxy_endpoint,
          DEFAULT_CLOUD_SYNC_ENDPOINT
        )
      ),
      secret_ref: firstNonEmpty(
        cfg.cloud_sync?.secret_ref,
        cfg.cloud_sync?.secretRef,
        cfg.cloud_sync_secret_ref,
        cfg.sync?.secret_ref,
        DEFAULT_CLOUD_SYNC_SECRET_REF
      ),
      timeout_ms: Number(
        cfg.cloud_sync?.timeout_ms || cfg.cloud_sync?.timeoutMs || cfg.sync?.timeout_ms || 12e3
      ),
      cooldown_seconds: Number(
        cfg.cloud_sync?.cooldown_seconds || cfg.cloud_sync?.cooldownSeconds || cfg.sync?.cooldown_seconds || 180
      ),
      upload_cooldown_seconds: Number(
        cfg.cloud_sync?.upload_cooldown_seconds || cfg.cloud_sync?.uploadCooldownSeconds || cfg.sync?.upload_cooldown_seconds || cfg.cloud_sync?.cooldown_seconds || cfg.cloud_sync?.cooldownSeconds || cfg.sync?.cooldown_seconds || 120
      ),
      download_cooldown_seconds: Number(
        cfg.cloud_sync?.download_cooldown_seconds || cfg.cloud_sync?.downloadCooldownSeconds || cfg.sync?.download_cooldown_seconds || cfg.cloud_sync?.cooldown_seconds || cfg.cloud_sync?.cooldownSeconds || cfg.sync?.cooldown_seconds || 10
      )
    },
    module_center: resolveModuleCenter(cfg),
    chaoxing_class: normalizeChaoxingClassConfig(cfg.chaoxing_class || cfg.chaoxingClass, {
      // 远程 payload 里有 invite 时写入本地缓存（断网可复用）
      persistInvite: !!(cfg.chaoxing_class || cfg.chaoxingClass)
    }),
    ai_models: toArray(cfg.ai_models),
    config_admin_ids: toArray(cfg.config_admin_ids)
  };
}
function applyAppStoreRemoteConfigClamp(config) {
  if (!shouldApplyAppStoreRestrictions() || !config || typeof config !== "object") return config;
  const next = { ...config };
  next.module_center = {
    channel: firstNonEmpty(config.module_center?.channel, "main"),
    modules: []
  };
  next.resource_share = {
    ...config.resource_share || {},
    enabled: false
  };
  next.forum = {
    ...config.forum || {},
    enabled: false
  };
  next.chaoxing_class = {
    ...config.chaoxing_class || {},
    enabled: false
  };
  next.ai_models = [];
  next.config_admin_ids = [];
  const ocr = { ...config.ocr || {} };
  const httpsOnly = (list) => toArray(list).filter((u) => /^https:\/\//i.test(String(u || "").trim()));
  ocr.local_fallback_endpoints = httpsOnly(ocr.local_fallback_endpoints);
  ocr.endpoints = httpsOnly(ocr.endpoints).length ? httpsOnly(ocr.endpoints) : httpsOnly([ocr.endpoint]);
  if (ocr.endpoints[0]) ocr.endpoint = ocr.endpoints[0];
  next.ocr = ocr;
  next.cloud_sync = {
    ...config.cloud_sync || {},
    enabled: false
  };
  return next;
}
const readCachedChaoxingInvite = () => {
  if (chaoxingInviteMemory) return chaoxingInviteMemory;
  try {
    const fromStore = toString(localStorage.getItem(CHAOXING_INVITE_CACHE_KEY)).trim();
    if (fromStore) chaoxingInviteMemory = fromStore;
    return fromStore;
  } catch {
    return chaoxingInviteMemory || "";
  }
};
function persistChaoxingInviteCode(code) {
  const invite = toString(code).trim();
  if (!invite) return;
  chaoxingInviteMemory = invite;
  try {
    localStorage.setItem(CHAOXING_INVITE_CACHE_KEY, invite);
  } catch {
  }
}
function resolveChaoxingInviteCode(rawBlock) {
  const src = rawBlock && typeof rawBlock === "object" ? rawBlock : {};
  return firstNonEmpty(
    src.invite_code,
    src.inviteCode,
    src.invite,
    readCachedChaoxingInvite(),
    DEFAULT_CHAOXING_INVITE_CODE
  ) || DEFAULT_CHAOXING_INVITE_CODE;
}
function normalizeChaoxingClassConfig(raw, options = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const invite = resolveChaoxingInviteCode(src);
  if (options.persistInvite && invite) {
    const explicit = firstNonEmpty(src.invite_code, src.inviteCode, src.invite);
    if (explicit) persistChaoxingInviteCode(explicit);
  }
  return {
    enabled: src.enabled !== false,
    invite_code: invite,
    // 可选元数据：有则用，无则空（禁止回落到已废弃的旧班信息）
    course_id: firstNonEmpty(src.course_id, src.courseId),
    clazz_id: firstNonEmpty(src.clazz_id, src.clazzId, src.class_id),
    course_name: firstNonEmpty(src.course_name, src.courseName),
    teacher_name: firstNonEmpty(src.teacher_name, src.teacherName),
    cpi: firstNonEmpty(src.cpi),
    cover_url: firstNonEmpty(src.cover_url, src.coverUrl)
  };
}
function getChaoxingClassConfig(config) {
  if (config && typeof config === "object") {
    const block = config.chaoxing_class || config.chaoxingClass;
    if (block && typeof block === "object") {
      return normalizeChaoxingClassConfig(block);
    }
    return normalizeRemoteConfig(config).chaoxing_class;
  }
  const mem = readMemoryConfig();
  if (mem?.chaoxing_class) {
    const cached = readCachedChaoxingInvite();
    if (cached && cached !== mem.chaoxing_class.invite_code) {
      if (!mem.chaoxing_class.invite_code) {
        return { ...mem.chaoxing_class, invite_code: cached };
      }
    }
    return mem.chaoxing_class;
  }
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY);
    if (raw) {
      return normalizeRemoteConfig(JSON.parse(raw)).chaoxing_class;
    }
  } catch {
  }
  return normalizeChaoxingClassConfig({ invite_code: resolveChaoxingInviteCode({}) });
}
const remoteConfigFingerprint = (config) => {
  try {
    const normalized = normalizeRemoteConfig(config || {});
    return JSON.stringify(normalized);
  } catch {
    return "";
  }
};
const setMemoryConfig = (config) => {
  remoteConfigMemory = config && typeof config === "object" ? normalizeRemoteConfig(config) : null;
  remoteConfigMemoryAt = remoteConfigMemory ? Date.now() : 0;
};
const saveSnapshot = (config, { emitEvent = false, previousFingerprint = null } = {}) => {
  const normalized = config && typeof config === "object" ? normalizeRemoteConfig(config) : null;
  setMemoryConfig(normalized);
  if (!normalized) return { saved: false, changed: false };
  const nextFp = remoteConfigFingerprint(normalized);
  const prevFp = previousFingerprint != null ? previousFingerprint : (() => {
    try {
      const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY);
      return raw ? remoteConfigFingerprint(JSON.parse(raw)) : "";
    } catch {
      return "";
    }
  })();
  const changed = nextFp !== prevFp;
  if (changed || !prevFp) {
    try {
      localStorage.setItem(REMOTE_CONFIG_SNAPSHOT_KEY, JSON.stringify(normalized));
    } catch {
    }
  }
  if (emitEvent && changed) {
    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(
          new CustomEvent(REMOTE_CONFIG_UPDATED_EVENT, {
            detail: { source: "remote", fingerprint: nextFp }
          })
        );
      }
    } catch {
    }
  }
  return { saved: true, changed, fingerprint: nextFp };
};
const readMemoryConfig = () => {
  if (!remoteConfigMemory) return null;
  if (Date.now() - remoteConfigMemoryAt > REMOTE_CONFIG_MEMORY_TTL_MS) {
    remoteConfigMemory = null;
    remoteConfigMemoryAt = 0;
    return null;
  }
  return remoteConfigMemory;
};
const loadSnapshot = () => {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const fetchByInvoke = async (url) => {
  try {
    const payload = await withTimeout$1(
      invokeNative("fetch_remote_config", { url }),
      REMOTE_CONFIG_FETCH_TIMEOUT_MS,
      "远程配置原生请求超时"
    );
    if (payload && typeof payload === "object") return payload;
  } catch {
  }
  return null;
};
const parseRemoteJson = (raw) => {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};
const isLikelyRemoteConfigPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return REMOTE_CONFIG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
};
const fetchByCapacitor = async (url) => {
  if (detectRuntime() !== "capacitor") return null;
  try {
    const core = await __vitePreload(() => import("./runtime-bridge-apFQ0nCw.js").then((n) => n.N), true ? [] : void 0, import.meta.url);
    const capHttp = core?.CapacitorHttp || window?.Capacitor?.Plugins?.CapacitorHttp;
    if (!capHttp?.request) return null;
    const result = await capHttp.request({
      method: "GET",
      url,
      headers: { Accept: "application/json" },
      connectTimeout: 8e3,
      readTimeout: 8e3
    });
    return parseRemoteJson(result?.data);
  } catch {
    return null;
  }
};
const fetchByWeb = async (url) => {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let abortTimer = null;
  try {
    if (controller) {
      abortTimer = setTimeout(() => controller.abort(), REMOTE_CONFIG_FETCH_TIMEOUT_MS);
    }
    const res = await withTimeout$1(
      fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller?.signal
      }),
      REMOTE_CONFIG_FETCH_TIMEOUT_MS,
      "远程配置网页请求超时"
    );
    if (!res.ok) {
      throw new Error(`remote config http ${res.status}`);
    }
    return res.json();
  } finally {
    if (abortTimer) clearTimeout(abortTimer);
  }
};
const fetchFromUrlList = async (baseUrls) => {
  let lastError = "";
  for (const baseUrl of baseUrls || []) {
    const url = withCacheBust$1(baseUrl);
    if (!url) continue;
    const isLocalUrl = String(baseUrl).startsWith("/");
    if (!isLocalUrl) {
      const byInvoke = await fetchByInvoke(url);
      if (byInvoke && isLikelyRemoteConfigPayload(byInvoke)) {
        return { payload: byInvoke, sourceUrl: baseUrl };
      }
      const byCapacitor = await fetchByCapacitor(url);
      if (byCapacitor && isLikelyRemoteConfigPayload(byCapacitor)) {
        return { payload: byCapacitor, sourceUrl: baseUrl };
      }
    }
    try {
      const byWeb = await fetchByWeb(url);
      if (byWeb && isLikelyRemoteConfigPayload(byWeb)) {
        return { payload: byWeb, sourceUrl: baseUrl };
      }
    } catch (e) {
      lastError = e?.message || String(e);
    }
  }
  throw new Error(lastError || "remote config unavailable");
};
const fetchFromRemoteUrls = async () => fetchFromUrlList(REMOTE_CONFIG_URLS);
const fetchFromPackageUrl = async () => fetchFromUrlList([PACKAGE_CONFIG_URL]);
let remoteConfigBackgroundInFlight = null;
async function refreshRemoteConfigFromNetwork(options = {}) {
  const emitEvent = options?.emitEvent !== false;
  const snapshot = loadSnapshot();
  const prevFp = snapshot ? remoteConfigFingerprint(snapshot) : "";
  try {
    const { payload } = await fetchFromRemoteUrls();
    const normalized = normalizeRemoteConfig(payload);
    const { changed } = saveSnapshot(normalized, {
      emitEvent,
      previousFingerprint: prevFp
    });
    return {
      config: applyAppStoreRemoteConfigClamp(normalized),
      changed,
      source: "remote"
    };
  } catch {
    if (snapshot) {
      const normalized = normalizeRemoteConfig(snapshot);
      setMemoryConfig(normalized);
      return {
        config: applyAppStoreRemoteConfigClamp(normalized),
        changed: false,
        source: "snapshot"
      };
    }
    return { config: null, changed: false, source: "none" };
  }
}
const scheduleBackgroundRemoteRefresh = () => {
  if (remoteConfigBackgroundInFlight) return remoteConfigBackgroundInFlight;
  if (isTestAccountSession()) return null;
  if (!isRemoteConfigEnabled()) return null;
  remoteConfigBackgroundInFlight = refreshRemoteConfigFromNetwork({ emitEvent: true }).catch(() => null).finally(() => {
    remoteConfigBackgroundInFlight = null;
  });
  return remoteConfigBackgroundInFlight;
};
const applyOcrRuntimeConfig = async (configLike) => {
  const enabled = configLike?.ocr?.enabled !== false;
  const ocrPayload = enabled ? configLike?.ocr : null;
  const persisted = persistOcrConfig({
    endpoints: enabled ? ocrPayload?.endpoints || [ocrPayload?.endpoint] : [],
    local_fallback_endpoints: enabled ? ocrPayload?.local_fallback_endpoints || [] : [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS]
  });
  const runtimePayload = {
    endpoints: enabled ? persisted.endpoints : [],
    localFallbackEndpoints: persisted.localFallbackEndpoints
  };
  try {
    await invokeNative("set_ocr_runtime_config", {
      endpoints: runtimePayload.endpoints,
      local_fallback_endpoints: runtimePayload.localFallbackEndpoints,
      localFallbackEndpoints: runtimePayload.localFallbackEndpoints
    });
  } catch {
    try {
      await invokeNative("set_ocr_endpoint", { endpoint: enabled ? persisted.primary : "" });
    } catch {
    }
  }
  return runtimePayload;
};
async function fetchRemoteConfig(options = {}) {
  const forceRefresh = options?.force === true;
  if (isTestAccountSession()) {
    return applyAppStoreRemoteConfigClamp(normalizeRemoteConfig(DEFAULT_CONFIG));
  }
  if (!isRemoteConfigEnabled()) {
    return applyAppStoreRemoteConfigClamp(buildLocalOnlyConfig());
  }
  if (!forceRefresh) {
    const memory = readMemoryConfig();
    if (memory) {
      scheduleBackgroundRemoteRefresh();
      return applyAppStoreRemoteConfigClamp(memory);
    }
    if (remoteConfigInFlight) {
      return remoteConfigInFlight;
    }
    const snapshot = loadSnapshot();
    if (snapshot) {
      const normalized = normalizeRemoteConfig(snapshot);
      setMemoryConfig(normalized);
      scheduleBackgroundRemoteRefresh();
      return applyAppStoreRemoteConfigClamp(normalized);
    }
  }
  const task = (async () => {
    try {
      const { payload } = await fetchFromRemoteUrls();
      const normalized = normalizeRemoteConfig(payload);
      const prev = loadSnapshot();
      saveSnapshot(normalized, {
        emitEvent: false,
        previousFingerprint: prev ? remoteConfigFingerprint(prev) : ""
      });
      return applyAppStoreRemoteConfigClamp(normalized);
    } catch {
    }
    const snapshot = loadSnapshot();
    if (snapshot) {
      const normalized = normalizeRemoteConfig(snapshot);
      setMemoryConfig(normalized);
      return applyAppStoreRemoteConfigClamp(normalized);
    }
    try {
      const { payload } = await fetchFromPackageUrl();
      const normalized = normalizeRemoteConfig(payload);
      saveSnapshot(normalized, { emitEvent: false, previousFingerprint: "" });
      return applyAppStoreRemoteConfigClamp(normalized);
    } catch {
    }
    const fallback = normalizeRemoteConfig(DEFAULT_CONFIG);
    saveSnapshot(fallback, { emitEvent: false, previousFingerprint: "" });
    return applyAppStoreRemoteConfigClamp(fallback);
  })();
  if (forceRefresh) {
    return task;
  }
  remoteConfigInFlight = task;
  try {
    return await task;
  } finally {
    if (remoteConfigInFlight === task) {
      remoteConfigInFlight = null;
    }
  }
}
const assertRemoteModulesAllowed = () => {
  if (!isRemoteModulesAllowed()) {
    throw new Error("App Store 构建已禁用远程模块");
  }
};
const DEFAULT_MODULE_CDN_BASE = "https://hbut.6661111.xyz/modules";
const GITHUB_PAGES_MODULE_CDN_BASE = "https://superdaobo.github.io/mini-hbut/modules";
const GITHUB_REPO = "superdaobo/mini-hbut";
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}`;
const GITHUB_WEBSITE_BRANCH = "website-pages";
const GITHUB_PROXY_PREFIXES = Object.freeze(["https://hk.gh-proxy.org/", "https://gh-proxy.com/", ""]);
const MODULE_PUBLIC_REPO_PATH = "modules";
const MODULE_CDN_OVERRIDE_STORAGE_KEY = "hbu_debug_module_cdn_base";
const MODULE_STATE_STORAGE_KEY = "hbu_more_module_state_v1";
const MODULE_CATALOG_CACHE_STORAGE_KEY = "hbu_more_module_catalog_cache_v1";
const MODULE_MANIFEST_CACHE_STORAGE_KEY = "hbu_more_module_manifest_cache_v1";
const MODULE_SOURCE_ROTATION_STORAGE_KEY = "hbu_more_module_remote_source_rotation_v1";
const DEFAULT_CHANNEL = "main";
const SHARED_CHANNEL = "latest";
const MODULE_CHANNELS = /* @__PURE__ */ new Set(["main", "dev", SHARED_CHANNEL]);
const DEFAULT_REMOTE_JSON_TIMEOUT_MS = 4500;
const FAST_REMOTE_RACE_TIMEOUT_MS = 2200;
const FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS = 1800;
const CAPACITOR_MODULE_CACHE_ROOT = "modules";
const CAPACITOR_BUNDLE_TIMEOUT_MS = 2e4;
const PREVIEW_MODE_TAURI_LOCAL = "tauri-local";
const PREVIEW_MODE_CAPACITOR_LOCAL = "capacitor-local";
const PREVIEW_MODE_REMOTE = "remote-site";
const withCacheBust = (url) => {
  const text = safeText(url);
  if (!text) return "";
  const joiner = text.includes("?") ? "&" : "?";
  return `${text}${joiner}_t=${Date.now()}`;
};
const isAbsoluteHttpUrl = (url) => /^https?:\/\//i.test(safeText(url));
const isLocalModuleBridgePreviewUrl = (url) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/module_bundle\/content\//i.test(safeText(url));
const canUseLocalModuleBridgePreview = () => isTauriRuntime() && !isLikelyAndroidUserAgent();
const describeError = (error) => {
  if (!error) return "";
  if (error instanceof Error) {
    return [error.message, error.stack].filter(Boolean).join("\n");
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};
const resolveModuleCdnBase = () => {
  try {
    const override = safeText(
      globalThis?.__HBUT_MODULE_CDN_BASE_OVERRIDE__ || globalThis?.localStorage?.getItem(MODULE_CDN_OVERRIDE_STORAGE_KEY)
    );
    if (override) {
      return override.replace(/\/+$/, "");
    }
  } catch {
    const override = safeText(globalThis?.__HBUT_MODULE_CDN_BASE_OVERRIDE__);
    if (override) {
      return override.replace(/\/+$/, "");
    }
  }
  return DEFAULT_MODULE_CDN_BASE;
};
const isModuleCdnOverrideActive = () => resolveModuleCdnBase() !== DEFAULT_MODULE_CDN_BASE;
const sleep = (ms = 0) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage || "请求超时"));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const fetchWithTimeout = async (url, init = {}, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  try {
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }
    return await withTimeout(
      fetch(url, {
        ...init,
        signal: controller?.signal
      }),
      timeoutMs,
      "请求超时"
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const parseJsonPayload = (payload) => {
  if (payload && typeof payload === "object") return payload;
  if (typeof payload === "string") {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object") return parsed;
  }
  throw new Error("远程 JSON 响应无效");
};
const fetchJsonViaCapacitor = async (url, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
  const core = await __vitePreload(() => import("./runtime-bridge-apFQ0nCw.js").then((n) => n.N), true ? [] : void 0, import.meta.url);
  const capHttp = core?.CapacitorHttp || globalThis?.Capacitor?.Plugins?.CapacitorHttp;
  if (!capHttp?.request) {
    throw new Error("CapacitorHttp 不可用");
  }
  const result = await capHttp.request({
    method: "GET",
    url,
    headers: { Accept: "application/json" },
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs
  });
  const status = Number(result?.status || 0);
  if (status < 200 || status >= 400) {
    throw new Error(`请求失败：HTTP ${status || 0}`);
  }
  return parseJsonPayload(result?.data);
};
const probeUrlViaCapacitor = async (url, timeoutMs = FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS) => {
  const core = await __vitePreload(() => import("./runtime-bridge-apFQ0nCw.js").then((n) => n.N), true ? [] : void 0, import.meta.url);
  const capHttp = core?.CapacitorHttp || globalThis?.Capacitor?.Plugins?.CapacitorHttp;
  if (!capHttp?.request) return false;
  try {
    const result = await capHttp.request({
      method: "GET",
      url: withCacheBust(url),
      headers: { Accept: "text/html,*/*" },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs
    });
    const status = Number(result?.status || 0);
    return status >= 200 && status < 400;
  } catch {
    return false;
  }
};
const isNativeBridgeUnavailableError = (error) => {
  const text = describeError(error).toLowerCase();
  if (!text) return true;
  return text.includes("当前运行时不支持 invoke") || text.includes("window.__tauri_internal") || text.includes("__tauri_internal") || text.includes("__tauri_ipc__") || text.includes("tauri is not defined") || text.includes("ipc channel not found") || text.includes("could not find the webview window") || text.includes("this command is not allowed") || text.includes("not running in tauri");
};
const invokeNativeBridge = async (command, args, label = "") => {
  const core = await __vitePreload(() => import("./runtime-bridge-apFQ0nCw.js").then((n) => n.R), true ? [] : void 0, import.meta.url);
  try {
    const result = await core.invoke(command, args);
    if (label) {
      pushDebugLog("MoreModules", `${label}：原生桥接成功`, "debug", {
        command
      });
    }
    return result;
  } catch (error) {
    if (label) {
      pushDebugLog("MoreModules", `${label}：原生桥接失败`, "warn", {
        command,
        error: describeError(error)
      });
    }
    throw error;
  }
};
const safeText = (value) => String(value ?? "").trim();
const sanitizeStorageSegment = (value, fallback = "") => {
  const normalized = safeText(value || fallback).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
  const compact = normalized.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return compact || safeText(fallback);
};
const joinRelativePath = (...parts) => parts.map((part) => safeText(part).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
const normalizeRelativeModulePath = (value, fallback = "index.html") => {
  const normalized = safeText(value || fallback).replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    return safeText(fallback);
  }
  return segments.join("/");
};
const normalizeZipEntryPath = (value) => {
  let normalized = safeText(value).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.endsWith("/")) return "";
  if (/^site\//i.test(normalized)) {
    normalized = normalized.replace(/^site\//i, "");
  }
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    return "";
  }
  return segments.join("/");
};
const candidateEntryPaths = (requested = "index.html") => {
  const normalized = normalizeRelativeModulePath(requested, "index.html");
  return toUniqueTextList([
    normalized,
    `site/${normalized}`,
    "index.html",
    "site/index.html"
  ]).map((item) => normalizeRelativeModulePath(item, "index.html"));
};
const uint8ArrayToBase64 = (bytes) => {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const chunkSize = 32768;
  for (let index = 0; index < buffer.length; index += chunkSize) {
    const chunk = buffer.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};
const base64ToUint8Array = (base64Text = "") => {
  const text = safeText(base64Text);
  if (!text) return new Uint8Array();
  const binary = atob(text);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index);
  }
  return result;
};
const sha256Hex = async (bytes) => {
  const cryptoApi = globalThis?.crypto?.subtle;
  if (!cryptoApi) return "";
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const digest = await cryptoApi.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
};
const buildCapacitorModulePaths = ({ channel, moduleId, version }) => {
  const safeChannel = sanitizeStorageSegment(normalizeChannel(channel), DEFAULT_CHANNEL);
  const safeModuleId = sanitizeStorageSegment(moduleId, "module");
  const safeVersion = sanitizeStorageSegment(version, "latest");
  const versionRootPath = joinRelativePath(
    CAPACITOR_MODULE_CACHE_ROOT,
    safeChannel,
    safeModuleId,
    safeVersion
  );
  return {
    versionRootPath,
    siteRootPath: joinRelativePath(versionRootPath, "site"),
    bundleZipPath: joinRelativePath(versionRootPath, "bundle.zip")
  };
};
const safeCapacitorRemoveDir = async (path) => {
  const targetPath = safeText(path);
  if (!targetPath) return;
  const { Filesystem, Directory } = await __vitePreload(async () => {
    const { Filesystem: Filesystem2, Directory: Directory2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.X);
    return { Filesystem: Filesystem2, Directory: Directory2 };
  }, true ? [] : void 0, import.meta.url);
  await Filesystem.rmdir({
    path: targetPath,
    directory: Directory.Data,
    recursive: true
  }).catch(() => {
  });
};
const locateCapacitorEntryPath = async (versionRootPath, requestedEntryPath = "index.html") => {
  const { Filesystem, Directory } = await __vitePreload(async () => {
    const { Filesystem: Filesystem2, Directory: Directory2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.X);
    return { Filesystem: Filesystem2, Directory: Directory2 };
  }, true ? [] : void 0, import.meta.url);
  for (const candidate of candidateEntryPaths(requestedEntryPath)) {
    try {
      await Filesystem.stat({
        path: joinRelativePath(versionRootPath, candidate),
        directory: Directory.Data
      });
      return candidate;
    } catch {
    }
  }
  throw new Error(`模块入口不存在：${requestedEntryPath}`);
};
const buildCapacitorLocalPreviewUrl = async (versionRootPath, entryPath) => {
  const { Filesystem, Directory } = await __vitePreload(async () => {
    const { Filesystem: Filesystem2, Directory: Directory2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.X);
    return { Filesystem: Filesystem2, Directory: Directory2 };
  }, true ? [] : void 0, import.meta.url);
  const filePath = joinRelativePath(versionRootPath, entryPath);
  const resolved = await Filesystem.getUri({
    path: filePath,
    directory: Directory.Data
  });
  return await toNativeFileSrc(safeText(resolved?.uri || filePath));
};
const resolveCapacitorVersionRootPath = ({
  moduleId,
  channel,
  version,
  cacheDir,
  siteRootPath
}) => {
  const explicitCacheDir = safeText(cacheDir).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (explicitCacheDir) return explicitCacheDir;
  const explicitSiteRoot = safeText(siteRootPath).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (explicitSiteRoot) {
    return explicitSiteRoot.replace(/\/site$/i, "");
  }
  if (!safeText(moduleId) || !safeText(version)) return "";
  return buildCapacitorModulePaths({
    channel: normalizeChannel(channel || DEFAULT_CHANNEL),
    moduleId,
    version
  }).versionRootPath;
};
const normalizeChannel = (value) => {
  const normalized = safeText(value).toLowerCase();
  return MODULE_CHANNELS.has(normalized) ? normalized : DEFAULT_CHANNEL;
};
const detectChannelFromVersion = (version) => {
  const value = safeText(version).toLowerCase();
  if (!value) return DEFAULT_CHANNEL;
  return /(dev|beta|alpha|rc)/.test(value) ? "dev" : "main";
};
const buildCatalogFetchOrder = (inputChannel = "") => {
  const preferred = normalizeChannel(inputChannel);
  const order = [preferred, SHARED_CHANNEL];
  if (preferred === "dev") {
    order.push("main");
  } else if (preferred === "main") {
    order.push("dev");
  }
  order.push(DEFAULT_CHANNEL);
  return Array.from(new Set(order.filter(Boolean)));
};
const toAbsoluteUrl = (input, base = resolveModuleCdnBase()) => {
  const value = safeText(input);
  if (!value) return "";
  try {
    return new URL(value, `${safeText(base).replace(/\/+$/, "")}/`).toString();
  } catch {
    return value;
  }
};
const toUniqueTextList = (items = []) => Array.from(
  new Set(
    (Array.isArray(items) ? items : [items]).map((item) => safeText(item)).filter(Boolean)
  )
);
const detectModuleChannelHintFromPath = (relativePath = "") => {
  const firstSegment = safeText(relativePath).split("/").filter(Boolean)[0];
  if (firstSegment === "dev") return "dev";
  if (firstSegment === "main") return "main";
  if (firstSegment === SHARED_CHANNEL) return SHARED_CHANNEL;
  return "";
};
const extractModuleRelativePath = (inputUrl) => {
  const absolute = toAbsoluteUrl(inputUrl);
  if (!absolute) return "";
  try {
    const pathname = new URL(absolute).pathname.replace(/\\/g, "/");
    const markers = ["/dist/modules/", "/website/public/modules/", "/modules/"];
    for (const marker of markers) {
      const index = pathname.toLowerCase().indexOf(marker.toLowerCase());
      if (index >= 0) {
        return pathname.slice(index + marker.length).replace(/^\/+/, "");
      }
    }
  } catch {
  }
  return "";
};
const buildGithubRawUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, "");
  if (!safePath) return "";
  return `${GITHUB_RAW_BASE}/${GITHUB_WEBSITE_BRANCH}/${MODULE_PUBLIC_REPO_PATH}/${safePath}`;
};
const buildGithubPagesModuleUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, "");
  if (!safePath) return "";
  return `${GITHUB_PAGES_MODULE_CDN_BASE.replace(/\/+$/, "")}/${safePath}`;
};
const buildCurrentBaseUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, "");
  if (!safePath) return "";
  return `${resolveModuleCdnBase().replace(/\/+$/, "")}/${safePath}`;
};
const buildMirrorCandidateUrls = (targetUrl) => {
  const absolute = safeText(targetUrl);
  if (!absolute) return [];
  return toUniqueTextList(
    GITHUB_PROXY_PREFIXES.map((prefix) => prefix ? `${prefix}${absolute}` : absolute)
  );
};
const readSourceRotationMap = () => {
  try {
    const raw = globalThis?.localStorage?.getItem(MODULE_SOURCE_ROTATION_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
const writeSourceRotationMap = (nextMap) => {
  try {
    globalThis?.localStorage?.setItem(
      MODULE_SOURCE_ROTATION_STORAGE_KEY,
      JSON.stringify(nextMap || {})
    );
  } catch {
  }
};
const rotateRemoteCandidates = (items, purpose = "remote", scope = "") => {
  const list = toUniqueTextList(items);
  if (list.length <= 1) return list;
  const rotationKey = `${safeText(purpose || "remote")}:${safeText(scope || list[0])}`;
  const rotationMap = readSourceRotationMap();
  const rawIndex = Number(rotationMap?.[rotationKey] || 0);
  const startIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? rawIndex % list.length : 0;
  rotationMap[rotationKey] = startIndex + 1;
  writeSourceRotationMap(rotationMap);
  return [...list.slice(startIndex), ...list.slice(0, startIndex)];
};
const shouldRotateRemoteCandidates = (purpose = "remote") => safeText(purpose).toLowerCase() === "open";
const finalizeRemoteCandidates = (items, purpose = "remote", scope = "") => {
  let list = toUniqueTextList(items);
  if (purpose === "open") {
    const filtered = list.filter((url) => !GITHUB_PROXY_PREFIXES.some((p) => p && url.startsWith(p)));
    if (filtered.length > 0) list = filtered;
  }
  if (list.length <= 1) return list;
  return shouldRotateRemoteCandidates(purpose) ? rotateRemoteCandidates(list, purpose, scope) : list;
};
const buildRemoteUrlCandidates = (inputUrl, preferredChannel = "", purpose = "remote") => {
  const absolute = toAbsoluteUrl(inputUrl);
  if (!absolute) return [];
  const relativePath = extractModuleRelativePath(absolute);
  if (!relativePath) return finalizeRemoteCandidates([absolute], purpose, absolute);
  const channelHint = detectModuleChannelHintFromPath(relativePath);
  const normalizedRelativePath = channelHint && preferredChannel && normalizeChannel(preferredChannel) !== channelHint ? relativePath.replace(new RegExp(`^${channelHint}/`), `${normalizeChannel(preferredChannel)}/`) : relativePath;
  const currentBaseUrl = buildCurrentBaseUrl(normalizedRelativePath);
  const githubPagesUrl = buildGithubPagesModuleUrl(normalizedRelativePath);
  const rawUrl = buildGithubRawUrl(normalizedRelativePath);
  const githubCandidates = buildMirrorCandidateUrls(rawUrl);
  const primaryCandidates = isModuleCdnOverrideActive() ? [currentBaseUrl] : [currentBaseUrl, githubPagesUrl, absolute];
  return finalizeRemoteCandidates(
    toUniqueTextList([...primaryCandidates, githubPagesUrl, ...githubCandidates]),
    purpose,
    normalizedRelativePath
  );
};
const readModuleStateMap = () => {
  try {
    const raw = localStorage.getItem(MODULE_STATE_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
const writeModuleStateMap = (nextMap) => {
  try {
    localStorage.setItem(MODULE_STATE_STORAGE_KEY, JSON.stringify(nextMap || {}));
  } catch {
  }
};
const updateModuleState = (moduleId, patch) => {
  const id = safeText(moduleId);
  if (!id) return;
  const map = readModuleStateMap();
  map[id] = {
    ...map[id] && typeof map[id] === "object" ? map[id] : {},
    ...patch && typeof patch === "object" ? patch : {},
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeModuleStateMap(map);
};
const getLocalModuleState = (moduleId) => {
  const id = safeText(moduleId);
  if (!id) return null;
  const map = readModuleStateMap();
  const value = map[id];
  return value && typeof value === "object" ? value : null;
};
const readStorageJson = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
};
const writeStorageJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
};
const readCachedCatalogSnapshot = (channel) => {
  const id = safeText(channel);
  if (!id) return null;
  const cacheMap = readStorageJson(MODULE_CATALOG_CACHE_STORAGE_KEY, {});
  const snapshot = cacheMap?.[id];
  if (!snapshot || typeof snapshot !== "object") return null;
  const modules = Array.isArray(snapshot?.catalog?.modules) ? snapshot.catalog.modules : [];
  if (!modules.length) return null;
  return {
    channel: normalizeChannel(snapshot.channel || id),
    url: safeText(snapshot.url),
    catalog: {
      schema_version: Number(snapshot?.catalog?.schema_version || 1),
      generated_at: safeText(snapshot?.catalog?.generated_at || snapshot?.catalog?.generatedAt || ""),
      modules
    },
    from_cache: true
  };
};
const writeCachedCatalogSnapshot = (channel, payload) => {
  const id = safeText(channel);
  if (!id || !payload?.catalog || !Array.isArray(payload.catalog.modules) || !payload.catalog.modules.length) return;
  const cacheMap = readStorageJson(MODULE_CATALOG_CACHE_STORAGE_KEY, {});
  cacheMap[id] = {
    channel: normalizeChannel(payload.channel || id),
    url: safeText(payload.url),
    stored_at: (/* @__PURE__ */ new Date()).toISOString(),
    catalog: {
      schema_version: Number(payload?.catalog?.schema_version || 1),
      generated_at: safeText(payload?.catalog?.generated_at || payload?.catalog?.generatedAt || ""),
      modules: payload.catalog.modules
    }
  };
  writeStorageJson(MODULE_CATALOG_CACHE_STORAGE_KEY, cacheMap);
};
const buildManifestCacheKey = (url) => safeText(toAbsoluteUrl(url));
const readCachedManifestSnapshot = (url) => {
  const cacheKey = buildManifestCacheKey(url);
  if (!cacheKey) return null;
  const cacheMap = readStorageJson(MODULE_MANIFEST_CACHE_STORAGE_KEY, {});
  const snapshot = cacheMap?.[cacheKey];
  if (!snapshot || typeof snapshot !== "object") return null;
  if (!safeText(snapshot.module_id) || !safeText(snapshot.version) || !safeText(snapshot.package_url)) return null;
  return {
    ...snapshot,
    url: cacheKey,
    from_cache: true
  };
};
const writeCachedManifestSnapshot = (manifest) => {
  const cacheKey = buildManifestCacheKey(manifest?.url);
  if (!cacheKey || !safeText(manifest?.module_id) || !safeText(manifest?.version) || !safeText(manifest?.package_url)) {
    return;
  }
  const cacheMap = readStorageJson(MODULE_MANIFEST_CACHE_STORAGE_KEY, {});
  cacheMap[cacheKey] = {
    url: cacheKey,
    stored_at: (/* @__PURE__ */ new Date()).toISOString(),
    schema_version: Number(manifest?.schema_version || 1),
    module_id: safeText(manifest?.module_id),
    module_name: safeText(manifest?.module_name || manifest?.module_id),
    version: safeText(manifest?.version),
    package_url: safeText(manifest?.package_url),
    package_urls: toUniqueTextList(manifest?.package_urls),
    package_sha256: safeText(manifest?.package_sha256),
    channel: safeText(manifest?.channel),
    entry_path: safeText(manifest?.entry_path || "index.html"),
    min_compatible_version: safeText(manifest?.min_compatible_version),
    published_at: safeText(manifest?.published_at),
    release_notes: safeText(manifest?.release_notes),
    open_url: safeText(manifest?.open_url)
  };
  writeStorageJson(MODULE_MANIFEST_CACHE_STORAGE_KEY, cacheMap);
};
const fetchJsonNoStore = async (url, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
  const targetUrl = toAbsoluteUrl(url, globalThis?.location?.href || resolveModuleCdnBase());
  const requestUrl = withCacheBust(targetUrl);
  if (isAbsoluteHttpUrl(targetUrl) && isTauriRuntime()) {
    try {
      return await withTimeout(
        invokeNativeBridge(
          "fetch_remote_json",
          { url: requestUrl },
          `远程 JSON ${targetUrl}`
        ),
        timeoutMs,
        "远程 JSON 请求超时"
      );
    } catch (error) {
      if (!isNativeBridgeUnavailableError(error)) {
        throw error;
      }
      pushDebugLog("MoreModules", `远程 JSON 回退浏览器请求：${targetUrl}`, "warn", {
        error: describeError(error)
      });
    }
  }
  if (isAbsoluteHttpUrl(targetUrl) && isCapacitorRuntime()) {
    try {
      return await withTimeout(fetchJsonViaCapacitor(requestUrl, timeoutMs), timeoutMs, "远程 JSON 请求超时");
    } catch (error) {
      pushDebugLog("MoreModules", `远程 JSON 回退浏览器请求：${targetUrl}`, "warn", {
        error: describeError(error)
      });
    }
  }
  const response = await fetchWithTimeout(
    requestUrl,
    { cache: "no-store" },
    timeoutMs
  );
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }
  return response.json();
};
const fetchJsonFromAnyCandidate = async (candidates, timeoutMs) => {
  const urls = toUniqueTextList(candidates);
  if (!urls.length) {
    throw new Error("远程配置地址为空");
  }
  return await new Promise((resolve, reject) => {
    let settled = false;
    let pending = urls.length;
    let lastError = null;
    urls.forEach((candidate) => {
      fetchJsonNoStore(candidate, timeoutMs).then((payload) => {
        if (settled) return;
        settled = true;
        resolve({ payload, url: candidate });
      }).catch((error) => {
        lastError = error;
      }).finally(() => {
        pending -= 1;
        if (!settled && pending <= 0) {
          reject(lastError || new Error("远程配置请求失败"));
        }
      });
    });
  });
};
const fetchJsonWithRetry = async (urlOrUrls, timeoutMsList = [DEFAULT_REMOTE_JSON_TIMEOUT_MS], options = {}) => {
  const candidates = toUniqueTextList(urlOrUrls).map((item) => toAbsoluteUrl(item));
  if (!candidates.length) {
    throw new Error("远程配置地址为空");
  }
  const normalizedTimeouts = toUniqueTextList(timeoutMsList).map((item) => Number(item) || DEFAULT_REMOTE_JSON_TIMEOUT_MS).filter((item) => item > 0);
  const raceFirst = options && options.raceFirst === true;
  let lastError = null;
  if (raceFirst && candidates.length > 1) {
    try {
      return await fetchJsonFromAnyCandidate(
        candidates,
        Math.min(FAST_REMOTE_RACE_TIMEOUT_MS, normalizedTimeouts[0] || DEFAULT_REMOTE_JSON_TIMEOUT_MS)
      );
    } catch (error) {
      lastError = error;
    }
  }
  for (const candidate of candidates) {
    for (let index = 0; index < normalizedTimeouts.length; index += 1) {
      try {
        const payload = await fetchJsonNoStore(
          candidate,
          normalizedTimeouts[index] || DEFAULT_REMOTE_JSON_TIMEOUT_MS
        );
        return {
          payload,
          url: candidate
        };
      } catch (error) {
        lastError = error;
        if (index < normalizedTimeouts.length - 1) {
          await sleep(180 * (index + 1));
        }
      }
    }
  }
  throw lastError || new Error("远程配置请求失败");
};
const pickFastestOpenUrl = async (candidates = []) => {
  const urls = toUniqueTextList(candidates);
  if (!urls.length) return "";
  if (!isCapacitorRuntime() || urls.length === 1) return urls[0];
  return await new Promise((resolve) => {
    let settled = false;
    let pending = urls.length;
    urls.forEach((candidate) => {
      probeUrlViaCapacitor(candidate, FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS).then((ok) => {
        if (!ok || settled) return;
        settled = true;
        resolve(candidate);
      }).catch(() => {
      }).finally(() => {
        pending -= 1;
        if (!settled && pending <= 0) {
          resolve(urls[0] || "");
        }
      });
    });
  });
};
const resolveModuleChannel = async () => {
  const overridden = normalizeChannel(localStorage.getItem("hbu_module_channel"));
  if (MODULE_CHANNELS.has(overridden)) return overridden;
  let version = "";
  try {
    version = await getNativeAppVersion();
  } catch {
  }
  if (!version && "1.4.4") {
    version = safeText("1.4.4");
  }
  return detectChannelFromVersion(version);
};
const normalizeCatalogModule = (item, channel) => {
  const raw = item && typeof item === "object" ? item : {};
  const id = safeText(raw.id || raw.module_id);
  const manifestUrl = toAbsoluteUrl(
    raw.manifest_url || `${resolveModuleCdnBase()}/${channel}/${id}/manifest.json`,
    `${resolveModuleCdnBase()}/${channel}/`
  );
  return {
    id,
    name: safeText(raw.name || raw.module_name || id),
    manifest_url: manifestUrl,
    min_compatible_version: safeText(raw.min_compatible_version || raw.minCompatibleVersion),
    key_required: !!raw.key_required,
    order: Number(raw.order || 999),
    icon: safeText(raw.icon || ""),
    description: safeText(raw.description || ""),
    raw
  };
};
const fetchModuleCatalog = async (inputChannel = "") => {
  assertRemoteModulesAllowed();
  const tried = [];
  for (const channel of buildCatalogFetchOrder(inputChannel)) {
    const resolved = normalizeChannel(channel);
    if (!resolved || tried.includes(resolved)) continue;
    tried.push(resolved);
    const url = `${resolveModuleCdnBase()}/${resolved}/catalog.json`;
    try {
      const { payload, url: resolvedUrl } = await fetchJsonWithRetry(
        buildRemoteUrlCandidates(url, resolved, "catalog"),
        [2500, 4200]
      );
      const rawModules = Array.isArray(payload?.modules) ? payload.modules : [];
      const modules = rawModules.map((item) => normalizeCatalogModule(item, resolved)).filter((item) => item.id && item.manifest_url).sort((a, b) => a.order - b.order);
      const snapshot = {
        channel: resolved,
        url: resolvedUrl,
        catalog: {
          schema_version: Number(payload?.schema_version || 1),
          generated_at: safeText(payload?.generated_at || payload?.generatedAt || ""),
          modules
        },
        from_fallback: resolved !== SHARED_CHANNEL
      };
      writeCachedCatalogSnapshot(resolved, snapshot);
      return snapshot;
    } catch {
    }
  }
  for (const channel of tried) {
    const snapshot = readCachedCatalogSnapshot(channel);
    if (snapshot) {
      return {
        ...snapshot,
        from_fallback: normalizeChannel(snapshot.channel || channel) !== SHARED_CHANNEL
      };
    }
  }
  throw new Error("无法获取模块清单，请检查网络后重试");
};
const fetchModuleManifest = async (manifestUrl) => {
  const url = toAbsoluteUrl(manifestUrl);
  if (!url) throw new Error("模块 manifest 地址为空");
  try {
    const { payload, url: resolvedUrl } = await fetchJsonWithRetry(
      buildRemoteUrlCandidates(url, "", "manifest"),
      [2800, 4500]
    );
    const moduleId = safeText(payload?.module_id || payload?.id);
    const version = safeText(payload?.version);
    const packageUrl = toAbsoluteUrl(payload?.package_url, resolvedUrl);
    const entryPath = safeText(payload?.entry_path || "index.html");
    if (!moduleId || !version || !packageUrl) {
      throw new Error("模块 manifest 字段不完整");
    }
    const preferredChannel = safeText(payload?.channel) || detectModuleChannelHintFromPath(extractModuleRelativePath(resolvedUrl)) || detectModuleChannelHintFromPath(extractModuleRelativePath(packageUrl));
    const packageUrls = buildRemoteUrlCandidates(packageUrl, preferredChannel, "package");
    const manifest = {
      url: resolvedUrl,
      schema_version: Number(payload?.schema_version || 1),
      module_id: moduleId,
      module_name: safeText(payload?.module_name || payload?.name || moduleId),
      version,
      package_url: packageUrl,
      package_urls: packageUrls,
      package_sha256: safeText(payload?.package_sha256 || payload?.sha256 || ""),
      package_size: Number(payload?.package_size || 0),
      channel: safeText(payload?.channel),
      entry_path: entryPath,
      min_compatible_version: safeText(payload?.min_compatible_version || payload?.minCompatibleVersion || ""),
      published_at: safeText(payload?.published_at || ""),
      release_notes: safeText(payload?.release_notes || ""),
      open_url: toAbsoluteUrl(payload?.open_url, resolvedUrl)
    };
    writeCachedManifestSnapshot(manifest);
    return manifest;
  } catch (error) {
    const cachedManifest = readCachedManifestSnapshot(url);
    if (cachedManifest) return cachedManifest;
    throw error;
  }
};
const buildRemoteOpenUrlCandidates = ({
  manifestUrl,
  channel,
  moduleId,
  version,
  packageUrl,
  packageUrls,
  entryPath,
  openUrl
}) => {
  const preferredChannel = safeText(channel) || normalizeChannel(channel) || detectModuleChannelHintFromPath(extractModuleRelativePath(manifestUrl)) || detectModuleChannelHintFromPath(extractModuleRelativePath(packageUrl));
  const normalizedEntryPath = normalizeRelativeModulePath(entryPath, "index.html");
  const explicit = toAbsoluteUrl(openUrl, safeText(manifestUrl));
  if (explicit && !isLocalModuleBridgePreviewUrl(explicit)) {
    return buildRemoteUrlCandidates(explicit, preferredChannel, "open");
  }
  const packageCandidates = toUniqueTextList(packageUrls || packageUrl);
  const siteCandidates = packageCandidates.map((candidate) => {
    if (candidate.includes("/bundle.zip")) {
      return candidate.replace(/\/bundle\.zip(?:\?.*)?$/i, `/site/${normalizedEntryPath}`);
    }
    return `${candidate.replace(/\/+$/, "")}/site/${normalizedEntryPath}`;
  });
  return finalizeRemoteCandidates(
    toUniqueTextList([
      ...siteCandidates,
      `${resolveModuleCdnBase()}/${normalizeChannel(preferredChannel)}/${safeText(moduleId)}/${safeText(version)}/site/${normalizedEntryPath}`
    ]),
    "open",
    `${normalizeChannel(preferredChannel)}/${safeText(moduleId)}/${safeText(version)}/site/${normalizedEntryPath}`
  );
};
const buildOpenUrlCandidates = ({ manifest, channel }) => buildRemoteOpenUrlCandidates({
  manifestUrl: safeText(manifest?.url),
  channel: safeText(manifest?.channel || channel),
  moduleId: safeText(manifest?.module_id),
  version: safeText(manifest?.version),
  packageUrl: safeText(manifest?.package_url),
  packageUrls: manifest?.package_urls,
  entryPath: safeText(manifest?.entry_path || "index.html"),
  openUrl: safeText(manifest?.open_url)
});
const prepareCapacitorLocalModuleBundle = async ({
  channel,
  moduleInfo,
  manifest,
  moduleId,
  packageUrl,
  packageUrls,
  openUrlCandidates
}) => {
  const { unzipSync } = await __vitePreload(async () => {
    const { unzipSync: unzipSync2 } = await import("./browser-Tjr86qEh.js");
    return { unzipSync: unzipSync2 };
  }, true ? [] : void 0, import.meta.url);
  const { Filesystem, Directory } = await __vitePreload(async () => {
    const { Filesystem: Filesystem2, Directory: Directory2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.X);
    return { Filesystem: Filesystem2, Directory: Directory2 };
  }, true ? [] : void 0, import.meta.url);
  const requestedEntryPath = normalizeRelativeModulePath(manifest?.entry_path, "index.html");
  const resolvedChannel = normalizeChannel(channel || manifest?.channel);
  const version = safeText(manifest?.version);
  const moduleName = safeText(moduleInfo?.name || manifest?.module_name || moduleId);
  const packageSha256 = safeText(manifest?.package_sha256).toLowerCase();
  const minCompatibleVersion = safeText(manifest?.min_compatible_version);
  const openUrl = safeText(manifest?.open_url || openUrlCandidates[0]);
  const manifestUrl = safeText(manifest?.url);
  const manifestCheckedAt = (/* @__PURE__ */ new Date()).toISOString();
  const modulePaths = buildCapacitorModulePaths({
    channel: resolvedChannel,
    moduleId,
    version
  });
  const localState = getLocalModuleState(moduleId) || {};
  const reuseCachedBundle = async () => {
    if (safeText(localState?.version) !== version) return null;
    if (packageSha256 && safeText(localState?.package_sha256).toLowerCase() && safeText(localState?.package_sha256).toLowerCase() !== packageSha256) {
      return null;
    }
    if (safeText(localState?.min_compatible_version) !== minCompatibleVersion) {
      return null;
    }
    try {
      const resolvedEntryPath2 = await locateCapacitorEntryPath(
        modulePaths.versionRootPath,
        safeText(localState?.requested_entry_path || requestedEntryPath)
      );
      const localPreviewUrl2 = safeText(localState?.local_preview_url) || await buildCapacitorLocalPreviewUrl(modulePaths.versionRootPath, resolvedEntryPath2);
      return {
        resolvedEntryPath: resolvedEntryPath2,
        localPreviewUrl: localPreviewUrl2
      };
    } catch {
      return null;
    }
  };
  const cachedBundle = await reuseCachedBundle();
  if (cachedBundle) {
    updateModuleState(moduleId, {
      channel: resolvedChannel,
      version,
      module_name: moduleName,
      package_url: packageUrl,
      package_urls: packageUrls,
      package_sha256: packageSha256,
      requested_entry_path: requestedEntryPath,
      resolved_entry_path: cachedBundle.resolvedEntryPath,
      entry_path: requestedEntryPath,
      min_compatible_version: minCompatibleVersion,
      open_url: openUrl,
      preview_url: cachedBundle.localPreviewUrl,
      preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
      local_preview_url: cachedBundle.localPreviewUrl,
      site_root_path: modulePaths.siteRootPath,
      bundle_zip_path: modulePaths.bundleZipPath,
      cache_dir: modulePaths.versionRootPath,
      bundle_path: modulePaths.bundleZipPath,
      manifest_url: manifestUrl,
      manifest_checked_at: manifestCheckedAt,
      source: "cache"
    });
    pushDebugLog("MoreModules", `安卓模块缓存命中：${moduleId}`, "info", {
      preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
      entry_path: cachedBundle.resolvedEntryPath,
      preview_url: cachedBundle.localPreviewUrl
    });
    return {
      ready: true,
      launch_mode: "cache",
      version,
      package_url: packageUrl,
      package_urls: packageUrls,
      cache_dir: modulePaths.versionRootPath,
      bundle_path: modulePaths.bundleZipPath,
      bundle_zip_path: modulePaths.bundleZipPath,
      site_root_path: modulePaths.siteRootPath,
      preview_url: cachedBundle.localPreviewUrl,
      local_preview_url: cachedBundle.localPreviewUrl,
      open_url: openUrl,
      min_compatible_version: minCompatibleVersion,
      source: "cache",
      module_id: moduleId,
      module_name: moduleName,
      channel: resolvedChannel,
      requested_entry_path: requestedEntryPath,
      resolved_entry_path: cachedBundle.resolvedEntryPath,
      preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
      local_ready: true
    };
  }
  await safeCapacitorRemoveDir(modulePaths.versionRootPath);
  await Filesystem.mkdir({
    path: modulePaths.siteRootPath,
    directory: Directory.Data,
    recursive: true
  }).catch(() => {
  });
  let lastError = null;
  for (const candidate of packageUrls) {
    try {
      await Filesystem.downloadFile({
        url: withCacheBust(candidate),
        path: modulePaths.bundleZipPath,
        directory: Directory.Data,
        progress: false,
        connectTimeout: CAPACITOR_BUNDLE_TIMEOUT_MS,
        readTimeout: CAPACITOR_BUNDLE_TIMEOUT_MS
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw new Error(`模块压缩包下载失败：${safeText(lastError?.message || lastError) || "未知错误"}`);
  }
  const bundleFile = await Filesystem.readFile({
    path: modulePaths.bundleZipPath,
    directory: Directory.Data
  });
  const bundleBytes = base64ToUint8Array(bundleFile?.data || "");
  if (!bundleBytes.length) {
    throw new Error("模块压缩包为空，无法解压");
  }
  const actualSha = await sha256Hex(bundleBytes);
  if (packageSha256 && actualSha && actualSha !== packageSha256) {
    throw new Error(`模块压缩包校验失败：期望 ${packageSha256}，实际 ${actualSha}`);
  }
  const archive = unzipSync(bundleBytes);
  const archiveEntries = Object.entries(archive);
  if (!archiveEntries.length) {
    throw new Error("模块压缩包内容为空");
  }
  for (const [entryName, entryBytes] of archiveEntries) {
    const normalizedEntry = normalizeZipEntryPath(entryName);
    if (!normalizedEntry) continue;
    await Filesystem.writeFile({
      path: joinRelativePath(modulePaths.siteRootPath, normalizedEntry),
      directory: Directory.Data,
      data: uint8ArrayToBase64(entryBytes),
      recursive: true
    });
  }
  const resolvedEntryPath = await locateCapacitorEntryPath(
    modulePaths.versionRootPath,
    requestedEntryPath
  );
  const localPreviewUrl = await buildCapacitorLocalPreviewUrl(
    modulePaths.versionRootPath,
    resolvedEntryPath
  );
  updateModuleState(moduleId, {
    channel: resolvedChannel,
    version,
    module_name: moduleName,
    package_url: packageUrl,
    package_urls: packageUrls,
    package_sha256: packageSha256 || actualSha,
    requested_entry_path: requestedEntryPath,
    resolved_entry_path: resolvedEntryPath,
    entry_path: requestedEntryPath,
    min_compatible_version: minCompatibleVersion,
    open_url: openUrl,
    preview_url: localPreviewUrl,
    preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
    local_preview_url: localPreviewUrl,
    site_root_path: modulePaths.siteRootPath,
    bundle_zip_path: modulePaths.bundleZipPath,
    cache_dir: modulePaths.versionRootPath,
    bundle_path: modulePaths.bundleZipPath,
    manifest_url: manifestUrl,
    manifest_checked_at: manifestCheckedAt,
    source: "download"
  });
  pushDebugLog("MoreModules", `安卓模块已切换到真本地 bundle：${moduleId}`, "info", {
    preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
    entry_path: resolvedEntryPath,
    preview_url: localPreviewUrl
  });
  return {
    ready: true,
    launch_mode: "in_app",
    version,
    package_url: packageUrl,
    package_urls: packageUrls,
    cache_dir: modulePaths.versionRootPath,
    bundle_path: modulePaths.bundleZipPath,
    bundle_zip_path: modulePaths.bundleZipPath,
    site_root_path: modulePaths.siteRootPath,
    preview_url: localPreviewUrl,
    local_preview_url: localPreviewUrl,
    open_url: openUrl,
    min_compatible_version: minCompatibleVersion,
    source: "download",
    module_id: moduleId,
    module_name: moduleName,
    channel: resolvedChannel,
    requested_entry_path: requestedEntryPath,
    resolved_entry_path: resolvedEntryPath,
    preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
    local_ready: true
  };
};
const resolveModuleHostPreviewSource = (payload = {}, options = {}) => {
  const raw = payload && typeof payload === "object" ? payload : {};
  const moduleId = safeText(raw.module_id || raw.moduleId);
  const localState = options && Object.prototype.hasOwnProperty.call(options, "localState") ? options.localState : getLocalModuleState(moduleId);
  const requestedEntryPath = normalizeRelativeModulePath(
    raw.requested_entry_path || raw.requestedEntryPath || raw.entry_path || raw.entryPath || localState?.requested_entry_path || localState?.entry_path || "index.html",
    "index.html"
  );
  const packageUrl = safeText(raw.package_url || raw.packageUrl || localState?.package_url);
  const packageUrls = toUniqueTextList(
    raw.package_urls || raw.packageUrls || localState?.package_urls || packageUrl
  );
  const openUrl = safeText(raw.open_url || raw.openUrl || localState?.open_url);
  const rawPreviewUrl = safeText(raw.preview_url || raw.previewUrl || localState?.preview_url);
  const previewMode = safeText(raw.preview_mode || raw.previewMode || localState?.preview_mode);
  const localPreviewUrl = safeText(
    raw.local_preview_url || raw.localPreviewUrl || localState?.local_preview_url
  );
  const candidateUrls = buildRemoteOpenUrlCandidates({
    manifestUrl: safeText(raw.manifest_url || raw.manifestUrl || localState?.manifest_url),
    channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL),
    moduleId,
    version: safeText(raw.version || localState?.version),
    packageUrl,
    packageUrls,
    entryPath: requestedEntryPath,
    openUrl
  });
  let resolvedPreviewUrl = "";
  let sourceKind = "invalid";
  if (canUseLocalModuleBridgePreview()) {
    const tauriPreviewUrl = safeText(rawPreviewUrl || localState?.preview_url);
    if (isLocalModuleBridgePreviewUrl(tauriPreviewUrl) || previewMode === PREVIEW_MODE_TAURI_LOCAL) {
      resolvedPreviewUrl = tauriPreviewUrl;
      sourceKind = PREVIEW_MODE_TAURI_LOCAL;
    }
  } else if (localPreviewUrl) {
    if (isCapacitorRuntime() && openUrl && isAbsoluteHttpUrl(openUrl) && !isLocalModuleBridgePreviewUrl(openUrl)) {
      resolvedPreviewUrl = openUrl;
      sourceKind = PREVIEW_MODE_REMOTE;
    } else {
      resolvedPreviewUrl = localPreviewUrl;
      sourceKind = PREVIEW_MODE_CAPACITOR_LOCAL;
    }
  } else if (rawPreviewUrl && !isLocalModuleBridgePreviewUrl(rawPreviewUrl) && (!isCapacitorRuntime() || previewMode === PREVIEW_MODE_REMOTE)) {
    resolvedPreviewUrl = rawPreviewUrl;
    sourceKind = PREVIEW_MODE_REMOTE;
  } else if (openUrl && !isLocalModuleBridgePreviewUrl(openUrl) && (!isCapacitorRuntime() || previewMode === PREVIEW_MODE_REMOTE)) {
    resolvedPreviewUrl = openUrl;
    sourceKind = PREVIEW_MODE_REMOTE;
  } else if (candidateUrls.length && !isCapacitorRuntime()) {
    resolvedPreviewUrl = candidateUrls[0];
    sourceKind = PREVIEW_MODE_REMOTE;
  }
  return {
    resolvedPreviewUrl,
    sourceKind,
    candidateUrls,
    previewMode: sourceKind && sourceKind !== "invalid" ? sourceKind : previewMode,
    moduleId,
    packageUrl,
    packageUrls,
    entryPath: requestedEntryPath,
    openUrl: openUrl || candidateUrls[0] || "",
    localPreviewUrl,
    siteRootPath: safeText(raw.site_root_path || raw.siteRootPath || localState?.site_root_path),
    bundleZipPath: safeText(raw.bundle_zip_path || raw.bundleZipPath || localState?.bundle_zip_path),
    resolvedEntryPath: safeText(
      raw.resolved_entry_path || raw.resolvedEntryPath || localState?.resolved_entry_path
    ),
    manifestUrl: safeText(raw.manifest_url || raw.manifestUrl || localState?.manifest_url)
  };
};
const normalizeModuleHostSessionPayload = async (payload = {}, options = {}) => {
  assertRemoteModulesAllowed();
  const raw = payload && typeof payload === "object" ? payload : {};
  const moduleId = safeText(raw.module_id || raw.moduleId);
  const localState = options && Object.prototype.hasOwnProperty.call(options, "localState") ? options.localState : getLocalModuleState(moduleId);
  const resolved = resolveModuleHostPreviewSource(raw, {
    ...options,
    localState
  });
  const rawPreviewUrl = safeText(raw.preview_url || raw.previewUrl || localState?.preview_url);
  const rawPreviewMode = safeText(raw.preview_mode || raw.previewMode || localState?.preview_mode);
  let resolvedPreviewUrl = safeText(resolved.resolvedPreviewUrl);
  let sourceKind = safeText(resolved.sourceKind);
  let localPreviewUrl = safeText(
    raw.local_preview_url || raw.localPreviewUrl || resolved.localPreviewUrl
  );
  let siteRootPath = safeText(raw.site_root_path || raw.siteRootPath || resolved.siteRootPath);
  let bundleZipPath = safeText(raw.bundle_zip_path || raw.bundleZipPath || resolved.bundleZipPath);
  let resolvedEntryPath = safeText(
    raw.resolved_entry_path || raw.resolvedEntryPath || resolved.resolvedEntryPath
  );
  let invalidReason = "";
  const bridgeBlocked = isLocalModuleBridgePreviewUrl(rawPreviewUrl) || isLocalModuleBridgePreviewUrl(resolvedPreviewUrl) || rawPreviewMode === PREVIEW_MODE_TAURI_LOCAL;
  if (canUseLocalModuleBridgePreview()) {
    return {
      ...raw,
      module_id: moduleId || resolved.moduleId,
      channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL) || DEFAULT_CHANNEL,
      version: safeText(raw.version || localState?.version),
      preview_url: resolvedPreviewUrl,
      preview_mode: sourceKind === "invalid" ? rawPreviewMode : sourceKind || rawPreviewMode,
      local_preview_url: localPreviewUrl,
      site_root_path: siteRootPath,
      bundle_zip_path: bundleZipPath,
      resolved_entry_path: resolvedEntryPath,
      entry_path: safeText(raw.entry_path || raw.entryPath || resolved.entryPath),
      open_url: safeText(raw.open_url || raw.openUrl || resolved.openUrl),
      package_url: safeText(raw.package_url || raw.packageUrl || resolved.packageUrl),
      package_urls: Array.isArray(raw.package_urls) ? raw.package_urls : Array.isArray(raw.packageUrls) ? raw.packageUrls : resolved.packageUrls,
      manifest_url: safeText(raw.manifest_url || raw.manifestUrl || resolved.manifestUrl),
      invalid_reason: ""
    };
  }
  if (isCapacitorRuntime()) {
    const versionRootPath = resolveCapacitorVersionRootPath({
      moduleId: moduleId || resolved.moduleId,
      channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL),
      version: safeText(raw.version || localState?.version),
      cacheDir: safeText(raw.cache_dir || raw.cacheDir || localState?.cache_dir),
      siteRootPath: siteRootPath || safeText(localState?.site_root_path)
    });
    const shouldRecoverLocal = !!(localPreviewUrl || versionRootPath || siteRootPath || bundleZipPath) && (bridgeBlocked || rawPreviewMode === PREVIEW_MODE_CAPACITOR_LOCAL || sourceKind === PREVIEW_MODE_CAPACITOR_LOCAL || !resolvedPreviewUrl);
    if (shouldRecoverLocal && versionRootPath) {
      try {
        const recoveredEntryPath = await locateCapacitorEntryPath(
          versionRootPath,
          resolved.entryPath || "index.html"
        );
        const recoveredPreviewUrl = await buildCapacitorLocalPreviewUrl(
          versionRootPath,
          recoveredEntryPath
        );
        resolvedPreviewUrl = recoveredPreviewUrl;
        sourceKind = PREVIEW_MODE_CAPACITOR_LOCAL;
        localPreviewUrl = recoveredPreviewUrl;
        resolvedEntryPath = recoveredEntryPath;
        siteRootPath = siteRootPath || joinRelativePath(versionRootPath, "site");
        bundleZipPath = bundleZipPath || joinRelativePath(versionRootPath, "bundle.zip");
        updateModuleState(moduleId || resolved.moduleId, {
          preview_url: recoveredPreviewUrl,
          preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
          local_preview_url: recoveredPreviewUrl,
          resolved_entry_path: recoveredEntryPath,
          site_root_path: siteRootPath,
          bundle_zip_path: bundleZipPath,
          cache_dir: versionRootPath
        });
        if (bridgeBlocked) {
          pushDebugLog("MoreModules", `安卓宿主入口已重写为本地 bundle：${moduleId || resolved.moduleId}`, "info", {
            preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
            preview_url: recoveredPreviewUrl,
            entry_path: recoveredEntryPath
          });
        }
      } catch (error) {
        if (bridgeBlocked || rawPreviewMode === PREVIEW_MODE_CAPACITOR_LOCAL || sourceKind === PREVIEW_MODE_CAPACITOR_LOCAL) {
          resolvedPreviewUrl = "";
          sourceKind = "invalid";
          localPreviewUrl = "";
          resolvedEntryPath = "";
          invalidReason = "local-cache-missing";
          updateModuleState(moduleId || resolved.moduleId, {
            preview_url: "",
            preview_mode: "",
            local_preview_url: "",
            resolved_entry_path: ""
          });
          pushDebugLog("MoreModules", `安卓宿主入口恢复失败：${moduleId || resolved.moduleId}`, "warn", {
            invalid_reason: invalidReason,
            error: safeText(error?.message || error)
          });
        }
      }
    } else if (bridgeBlocked) {
      resolvedPreviewUrl = "";
      sourceKind = "invalid";
      invalidReason = "tauri-bridge-blocked";
      pushDebugLog("MoreModules", `安卓宿主入口已拦截桌面本地桥：${moduleId || resolved.moduleId}`, "warn", {
        preview_mode: rawPreviewMode,
        preview_url: rawPreviewUrl
      });
    }
  } else if (bridgeBlocked) {
    resolvedPreviewUrl = "";
    sourceKind = "invalid";
    invalidReason = "tauri-bridge-blocked";
  }
  return {
    ...raw,
    module_id: moduleId || resolved.moduleId,
    channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL) || DEFAULT_CHANNEL,
    version: safeText(raw.version || localState?.version),
    preview_url: resolvedPreviewUrl,
    preview_mode: sourceKind === "invalid" ? "" : sourceKind || rawPreviewMode,
    local_preview_url: localPreviewUrl,
    site_root_path: siteRootPath,
    bundle_zip_path: bundleZipPath,
    resolved_entry_path: resolvedEntryPath,
    entry_path: safeText(raw.entry_path || raw.entryPath || resolved.entryPath),
    open_url: safeText(raw.open_url || raw.openUrl || resolved.openUrl),
    package_url: safeText(raw.package_url || raw.packageUrl || resolved.packageUrl),
    package_urls: Array.isArray(raw.package_urls) ? raw.package_urls : Array.isArray(raw.packageUrls) ? raw.packageUrls : resolved.packageUrls,
    manifest_url: safeText(raw.manifest_url || raw.manifestUrl || resolved.manifestUrl),
    local_ready: !!resolvedPreviewUrl && raw.local_ready !== false,
    invalid_reason: invalidReason
  };
};
const prepareModuleBundle = async ({ channel, moduleInfo, manifest }) => {
  assertRemoteModulesAllowed();
  const moduleId = safeText(moduleInfo?.id || manifest?.module_id);
  const openUrlCandidates = buildOpenUrlCandidates({ manifest, channel });
  const openUrl = safeText(openUrlCandidates[0]);
  const packageUrl = safeText(manifest?.package_url);
  const packageUrls = toUniqueTextList(manifest?.package_urls || packageUrl);
  if (canUseLocalModuleBridgePreview()) {
    try {
      const prepared = await invokeNativeBridge(
        "prepare_module_bundle",
        {
          request: {
            channel: normalizeChannel(channel),
            moduleId,
            moduleName: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
            version: safeText(manifest?.version),
            packageUrl,
            packageUrls,
            packageSha256: safeText(manifest?.package_sha256),
            minCompatibleVersion: safeText(manifest?.min_compatible_version),
            entryPath: safeText(manifest?.entry_path || "index.html")
          }
        },
        `模块本地准备 ${moduleId}`
      );
      const preparedPreviewUrl = safeText(prepared?.preview_url || openUrl);
      updateModuleState(moduleId, {
        channel: normalizeChannel(channel),
        version: safeText(prepared?.version || manifest?.version),
        module_name: safeText(prepared?.module_name || moduleInfo?.name || manifest?.module_name || moduleId),
        package_url: packageUrl,
        package_urls: packageUrls,
        package_sha256: safeText(manifest?.package_sha256),
        requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, "index.html"),
        resolved_entry_path: safeText(prepared?.entry_path || manifest?.entry_path || "index.html"),
        entry_path: normalizeRelativeModulePath(manifest?.entry_path, "index.html"),
        min_compatible_version: safeText(manifest?.min_compatible_version),
        open_url: safeText(manifest?.open_url || openUrl),
        preview_url: preparedPreviewUrl,
        preview_mode: PREVIEW_MODE_TAURI_LOCAL,
        cache_dir: safeText(prepared?.cache_dir),
        site_root_path: safeText(prepared?.cache_dir),
        bundle_zip_path: safeText(prepared?.bundle_path),
        bundle_path: safeText(prepared?.bundle_path),
        manifest_url: safeText(manifest?.url),
        source: safeText(prepared?.source || "download"),
        manifest_checked_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return {
        ready: true,
        launch_mode: safeText(prepared?.source) === "cache" ? "cache" : "in_app",
        version: safeText(prepared?.version || manifest?.version),
        package_url: packageUrl,
        package_urls: packageUrls,
        cache_dir: safeText(prepared?.cache_dir),
        site_root_path: safeText(prepared?.cache_dir),
        bundle_zip_path: safeText(prepared?.bundle_path),
        bundle_path: safeText(prepared?.bundle_path),
        preview_url: preparedPreviewUrl,
        open_url: safeText(manifest?.open_url || openUrl),
        min_compatible_version: safeText(manifest?.min_compatible_version),
        source: safeText(prepared?.source || "download"),
        module_id: moduleId,
        module_name: safeText(prepared?.module_name || moduleInfo?.name || manifest?.module_name || moduleId),
        channel: normalizeChannel(channel),
        requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, "index.html"),
        resolved_entry_path: safeText(prepared?.entry_path || manifest?.entry_path || "index.html"),
        preview_mode: PREVIEW_MODE_TAURI_LOCAL,
        local_ready: true
      };
    } catch (error) {
      throw new Error(safeText(error?.message || error) || "模块本地准备失败");
    }
  }
  if (isCapacitorRuntime()) {
    return await prepareCapacitorLocalModuleBundle({
      channel,
      moduleInfo,
      manifest,
      moduleId,
      packageUrl,
      packageUrls,
      openUrlCandidates
    });
  }
  const bestOpenUrl = await pickFastestOpenUrl(openUrlCandidates);
  if (bestOpenUrl) {
    updateModuleState(moduleId, {
      channel: normalizeChannel(channel),
      version: safeText(manifest?.version),
      module_name: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
      package_url: packageUrl,
      package_urls: packageUrls,
      requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, "index.html"),
      entry_path: normalizeRelativeModulePath(manifest?.entry_path, "index.html"),
      min_compatible_version: safeText(manifest?.min_compatible_version),
      open_url: bestOpenUrl,
      preview_url: bestOpenUrl,
      preview_mode: PREVIEW_MODE_REMOTE,
      manifest_url: safeText(manifest?.url),
      manifest_checked_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return {
      ready: true,
      launch_mode: "remote",
      version: safeText(manifest?.version),
      open_url: bestOpenUrl,
      preview_url: bestOpenUrl,
      package_url: packageUrl,
      package_urls: packageUrls,
      min_compatible_version: safeText(manifest?.min_compatible_version),
      module_id: moduleId,
      module_name: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
      channel: normalizeChannel(channel),
      requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, "index.html"),
      preview_mode: PREVIEW_MODE_REMOTE,
      local_ready: false
    };
  }
  throw new Error("模块启动失败");
};
export {
  DEFAULT_BACKEND_TARGETS as A,
  SUPPORT_DOCS_URL as B,
  PROJECT_HOME_URL as C,
  DEMO_MODE_BANNER_ZH as D,
  normalizeModuleCenterChannel$1 as E,
  FEEDBACK_URL as F,
  GITHUB_URL as G,
  resolveModuleChannel as H,
  ICP_BEIAN_TEXT as I,
  buildModuleCenterCards as J,
  fetchModuleCatalog as K,
  getLocalModuleState as L,
  fetchModuleManifest as M,
  NON_OFFICIAL_DISCLAIMER_ZH as N,
  prepareModuleBundle as O,
  PRIVACY_POLICY_URL as P,
  isLiveLocationAllowed as Q,
  REMOTE_CONFIG_UPDATED_EVENT as R,
  SECURITY_DOCS_URL as S,
  getChaoxingClassConfig as T,
  app_store_policy as U,
  allowsInAppGithubUpdater as a,
  DEMO_MODE_BANNER_EN as b,
  isCustomJavaScriptAllowed as c,
  applyAppSettingsSnapshot as d,
  DEFAULT_CLOUD_SYNC_ENDPOINT as e,
  isAppStoreBuild as f,
  getUpdateCheckMode as g,
  getFeaturePolicy as h,
  isViewAllowed as i,
  fetchRemoteConfig as j,
  applyOcrRuntimeConfig as k,
  isRemoteConfigEnabled as l,
  getStoredOcrConfig as m,
  normalizeModuleHostSessionPayload as n,
  canUseLocalModuleBridgePreview as o,
  isLocalModuleBridgePreviewUrl as p,
  initAppSettings as q,
  resolveModuleHostPreviewSource as r,
  shouldApplyAppStoreRestrictions as s,
  isModuleAllowed as t,
  useAppSettings as u,
  filterAllowedModules as v,
  NON_OFFICIAL_DISCLAIMER_EN as w,
  ICP_BEIAN_URL as x,
  isSponsorEntryAllowed as y,
  resetAppSettings as z
};
