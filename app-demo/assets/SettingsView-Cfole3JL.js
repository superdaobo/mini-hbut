const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-apFQ0nCw.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { d as detectRuntime, b as isTauriRuntime, H as subscribeDebugLogs, x as formatDebugTime, v as getDebugLogs, p as pushDebugLog, I as clearDebugLogs, a as invokeNative, _ as __vitePreload } from "./runtime-bridge-apFQ0nCw.js";
import { a as ref, w as watch, o as onMounted, m as onBeforeUnmount, c as createElementBlock, b as openBlock, d as createBaseVNode, k as createBlock, f as createCommentVNode, n as normalizeClass, F as Fragment, u as unref, i as renderList, h as normalizeStyle, t as toDisplayString, e as computed, C as withDirectives, D as vModelText, v as Teleport } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, C as CLOUD_SYNC_UPDATED_EVENT, u as useUiSettings, s as showToast, $ as useFontSettings, a0 as FONT_CDN_OPTIONS, a1 as getCloudSyncLocalStatus, A as flushUiSettings, a2 as ensureFontLoaded, a3 as loadDeyiHeiFont, a4 as setFontCdnProvider, a5 as prefetchCdnFonts, a6 as getCloudSyncRuntimeConfig } from "./app-demo-CxKBY5JQ.js";
import { u as useAppSettings, e as DEFAULT_CLOUD_SYNC_ENDPOINT, z as resetAppSettings, m as getStoredOcrConfig, k as applyOcrRuntimeConfig, A as DEFAULT_BACKEND_TARGETS } from "./more-modules-CsUTdMqs.js";
import { i as isNightModeEnabled, a as initNightModeClass, b as applyNightModePreference } from "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "settings-view" };
const _hoisted_2 = { class: "settings-page-header" };
const _hoisted_3 = { class: "settings-tab-bar" };
const _hoisted_4 = { class: "settings-section glass-card startup-page-section" };
const _hoisted_5 = { class: "startup-page-row" };
const _hoisted_6 = { class: "startup-page-toggle" };
const _hoisted_7 = { class: "startup-page-row" };
const _hoisted_8 = { class: "startup-page-toggle" };
const _hoisted_9 = { class: "settings-section glass-card" };
const _hoisted_10 = { class: "theme-toggle-container" };
const _hoisted_11 = {
  key: 0,
  class: "sun-icon"
};
const _hoisted_12 = {
  key: 1,
  class: "moon-icon"
};
const _hoisted_13 = { class: "theme-labels" };
const _hoisted_14 = { class: "theme-hint" };
const _hoisted_15 = { class: "settings-section glass-card" };
const _hoisted_16 = { class: "option-group" };
const _hoisted_17 = { class: "chip-row" };
const _hoisted_18 = ["onClick"];
const _hoisted_19 = { class: "option-group" };
const _hoisted_20 = { class: "chip-row" };
const _hoisted_21 = ["onClick"];
const _hoisted_22 = { class: "option-group" };
const _hoisted_23 = { class: "chip-row" };
const _hoisted_24 = ["onClick"];
const _hoisted_25 = { class: "settings-section glass-card" };
const _hoisted_26 = { class: "profile-grid" };
const _hoisted_27 = ["onClick"];
const _hoisted_28 = { class: "settings-section glass-card" };
const _hoisted_29 = { class: "font-actions" };
const _hoisted_30 = { class: "font-cdn" };
const _hoisted_31 = { class: "font-cdn-row" };
const _hoisted_32 = ["onClick"];
const _hoisted_33 = { class: "font-availability" };
const _hoisted_34 = { class: "font-download-row" };
const _hoisted_35 = ["disabled"];
const _hoisted_36 = ["disabled"];
const _hoisted_37 = ["disabled"];
const _hoisted_38 = {
  key: 1,
  class: "settings-section glass-card backend-shell"
};
const _hoisted_39 = { class: "backend-summary" };
const _hoisted_40 = { class: "status-pill" };
const _hoisted_41 = { class: "status-pill" };
const _hoisted_42 = { class: "status-pill" };
const _hoisted_43 = { class: "status-pill" };
const _hoisted_44 = { class: "status-pill" };
const _hoisted_45 = { class: "backend-block" };
const _hoisted_46 = { class: "cloud-sync-status-grid" };
const _hoisted_47 = { class: "cloud-sync-status-item" };
const _hoisted_48 = { class: "cloud-sync-status-item" };
const _hoisted_49 = { class: "cloud-sync-status-item" };
const _hoisted_50 = { class: "cloud-sync-status-item" };
const _hoisted_51 = {
  key: 0,
  class: "hint cloud-sync-error"
};
const _hoisted_52 = {
  key: 1,
  class: "hint cloud-sync-error"
};
const _hoisted_53 = { class: "backend-block" };
const _hoisted_54 = { class: "toggle-meta" };
const _hoisted_55 = ["aria-checked"];
const _hoisted_56 = { class: "backend-block" };
const _hoisted_57 = {
  key: 0,
  class: "hint"
};
const _hoisted_58 = { class: "backend-grid" };
const _hoisted_59 = { class: "field" };
const _hoisted_60 = { class: "field" };
const _hoisted_61 = { class: "field" };
const _hoisted_62 = ["placeholder"];
const _hoisted_63 = { class: "field" };
const _hoisted_64 = { class: "backend-block" };
const _hoisted_65 = { class: "backend-grid" };
const _hoisted_66 = { class: "field" };
const _hoisted_67 = { class: "field" };
const _hoisted_68 = { class: "field" };
const _hoisted_69 = { class: "field" };
const _hoisted_70 = { class: "field" };
const _hoisted_71 = { class: "field" };
const _hoisted_72 = { class: "field" };
const _hoisted_73 = { class: "field" };
const _hoisted_74 = { class: "field" };
const _hoisted_75 = { class: "field" };
const _hoisted_76 = { class: "field" };
const _hoisted_77 = { class: "backend-block" };
const _hoisted_78 = { class: "section-head section-head-compact" };
const _hoisted_79 = ["disabled"];
const _hoisted_80 = { class: "probe-list" };
const _hoisted_81 = { class: "probe-main" };
const _hoisted_82 = { class: "probe-url" };
const _hoisted_83 = {
  key: 0,
  class: "hint"
};
const _hoisted_84 = {
  key: 2,
  class: "settings-section glass-card debug-shell"
};
const _hoisted_85 = { class: "backend-summary" };
const _hoisted_86 = { class: "status-pill" };
const _hoisted_87 = { class: "status-pill" };
const _hoisted_88 = { class: "status-pill" };
const _hoisted_89 = { class: "debug-filter-row" };
const _hoisted_90 = ["onClick"];
const _hoisted_91 = { class: "debug-log-head" };
const _hoisted_92 = { class: "debug-time" };
const _hoisted_93 = { class: "debug-level" };
const _hoisted_94 = { class: "debug-scope" };
const _hoisted_95 = { class: "debug-message" };
const _hoisted_96 = {
  key: 0,
  class: "hint"
};
const _hoisted_97 = {
  key: 3,
  class: "font-modal"
};
const _hoisted_98 = { class: "font-modal-card" };
const _hoisted_99 = { class: "font-modal-progress" };
const _hoisted_100 = { class: "progress-bar" };
const _hoisted_101 = { key: 0 };
const _hoisted_102 = { key: 1 };
const _hoisted_103 = { key: 2 };
const _hoisted_104 = { key: 3 };
const _hoisted_105 = {
  key: 0,
  class: "font-step"
};
const _hoisted_106 = {
  key: 1,
  class: "font-error"
};
const _hoisted_107 = { class: "font-modal-actions" };
const _hoisted_108 = { class: "theme-scene" };
const _hoisted_109 = { class: "theme-moon-anim" };
const _hoisted_110 = { class: "moon-stars" };
const _hoisted_111 = { class: "theme-transition-text" };
const REMOTE_CONFIG_MODE_EVENT = "hbu-remote-config-mode-changed";
const REMOTE_UPLOAD_ENDPOINT_KEY = "hbu_temp_upload_endpoint";
const REMOTE_CONFIG_SNAPSHOT_KEY = "hbu_remote_config_snapshot";
const DEFAULT_OCR_ENDPOINT = "https://mini-hbut-testocr1.hf.space/api/ocr/recognize";
const DEBUG_LOG_LIMIT = 1e3;
const _sfc_main = {
  __name: "SettingsView",
  emits: ["back", "openWorkspaceLayout"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const LOCAL_HOST_PATTERN = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i;
    const runtimeType = detectRuntime();
    const isTauriApp = isTauriRuntime();
    const isCapacitorApp = runtimeType === "capacitor";
    const runtimeLabel = computed(() => {
      if (runtimeType === "tauri") return "Tauri";
      if (runtimeType === "capacitor") return "Capacitor";
      return "Web";
    });
    const activeTab = ref("appearance");
    const uiSettings = useUiSettings();
    const appSettings = useAppSettings();
    const fontSettings = useFontSettings();
    const isDarkMode = ref(isNightModeEnabled());
    const themeTransitioning = ref(false);
    const themeTransitionType = ref("");
    const toggleDarkMode = (event) => {
      const willBeDark = !isDarkMode.value;
      themeTransitionType.value = willBeDark ? "to-dark" : "to-light";
      themeTransitioning.value = true;
      setTimeout(() => {
        isDarkMode.value = willBeDark;
        applyNightModePreference(willBeDark);
        flushUiSettings();
      }, 400);
      setTimeout(() => {
        themeTransitioning.value = false;
        themeTransitionType.value = "";
      }, 1200);
    };
    const initDarkMode = () => {
      isDarkMode.value = initNightModeClass();
    };
    initDarkMode();
    const downloadingFont = ref(false);
    const showFontModal = ref(false);
    const fontDownloadProgress = ref(0);
    const fontDownloadStatus = ref("idle");
    const fontDownloadError = ref("");
    const fontModalTitle = ref("字体加载");
    const fontModalDescription = ref("正在处理字体资源，请稍候。");
    const fontDownloadStep = ref("");
    const fontModalRetryMode = ref("deyihei");
    const pendingFontKey = ref("");
    const cdnPrefetching = ref(false);
    const probeRunning = ref(false);
    const probeResults = ref({});
    const probeFinishedAt = ref("");
    const cloudSyncStatus = ref(null);
    const cloudSyncStatusUpdatedAt = ref("");
    let backendAutoApplyTimer = null;
    let backendAutoApplying = false;
    const debugLogs = ref([]);
    const debugFilter = ref("all");
    const debugPanelRef = ref(null);
    let unsubscribeDebugLogs = null;
    const debugLevelOptions = [
      { key: "all", label: "全部" },
      { key: "debug", label: "Debug" },
      { key: "info", label: "Info" },
      { key: "warn", label: "Warn" },
      { key: "error", label: "Error" },
      { key: "log", label: "Log" }
    ];
    const isMobileDevice = (() => {
      if (typeof navigator === "undefined") return false;
      return /android|iphone|ipad|ipod/i.test(navigator.userAgent || "");
    })();
    const currentStudentId = computed(() => localStorage.getItem("hbu_username") || "未登录");
    const activeDeviceLabel = computed(() => isMobileDevice ? "移动端" : "桌面端");
    const backendSourceLabel = computed(
      () => appSettings.backend.useRemoteConfig ? "远程配置（含本地兜底）" : "仅本地配置"
    );
    const activePreviewThreads = computed(
      () => isMobileDevice ? appSettings.resourceShare.previewThreadsMobile : appSettings.resourceShare.previewThreadsDesktop
    );
    const activeDownloadThreads = computed(
      () => isMobileDevice ? appSettings.resourceShare.downloadThreadsMobile : appSettings.resourceShare.downloadThreadsDesktop
    );
    const fontCdnOptions = FONT_CDN_OPTIONS;
    const localOnlyModeEnabled = computed(() => !appSettings.backend.useRemoteConfig);
    const cloudSyncRuntime = computed(() => getCloudSyncRuntimeConfig());
    const cloudSyncEnabledText = computed(
      () => cloudSyncRuntime.value.enabled ? "已启用" : "未启用"
    );
    const cloudSyncUploadStatusText = computed(() => {
      const status = cloudSyncStatus.value;
      if (!status || !status.lastUploadAt) return "暂无上传记录";
      return status.lastUploadOk ? "最近上传成功" : "最近上传失败";
    });
    const cloudSyncDownloadStatusText = computed(() => {
      const status = cloudSyncStatus.value;
      if (!status || !status.lastDownloadAt) return "暂无下载记录";
      return status.lastDownloadOk ? "最近下载成功" : "最近下载失败";
    });
    const cloudSyncLastUploadError = computed(
      () => String(cloudSyncStatus.value?.lastUploadError || "").trim()
    );
    const cloudSyncLastDownloadError = computed(
      () => String(cloudSyncStatus.value?.lastDownloadError || "").trim()
    );
    const fontLocalAvailability = computed(() => {
      if (isMobileDevice) {
        return [
          "默认字体：本地可用（系统字体）",
          "黑体/宋体/楷体/仿宋：移动端通常不内置，建议先点“预缓存 CDN 字体”",
          "得意黑：需点击“下载得意黑”单独缓存"
        ];
      }
      return [
        "默认字体：本地可用（系统字体）",
        "黑体/宋体：Windows/macOS 上通常可本地替换",
        "楷体/仿宋：不同桌面系统覆盖不一致，建议预缓存 CDN 字体"
      ];
    });
    const FONT_DISPLAY_NAME = {
      heiti: "黑体",
      songti: "宋体",
      kaiti: "楷体",
      fangsong: "仿宋",
      deyihei: "得意黑"
    };
    const prefetchButtonText = computed(() => {
      const pending = String(pendingFontKey.value || "").trim();
      if (pending && pending !== "default") {
        return `预缓存${FONT_DISPLAY_NAME[pending] || pending}`;
      }
      const current = String(fontSettings.font || "").trim();
      if (current && current !== "default") {
        return `预缓存${FONT_DISPLAY_NAME[current] || current}`;
      }
      return "先选字体再缓存";
    });
    const filteredDebugLogs = computed(() => {
      if (debugFilter.value === "all") return debugLogs.value;
      return debugLogs.value.filter((item) => item.level === debugFilter.value);
    });
    const debugStats = computed(() => {
      const total = debugLogs.value.length;
      const errors = debugLogs.value.filter((item) => item.level === "error").length;
      const warns = debugLogs.value.filter((item) => item.level === "warn").length;
      return { total, errors, warns };
    });
    const toSafeText = (value) => String(value || "").trim();
    const formatStatusTime = (value) => {
      const ts = Number(value || 0);
      if (!Number.isFinite(ts) || ts <= 0) return "—";
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return "—";
      }
    };
    const refreshCloudSyncStatus = () => {
      const sid = String(localStorage.getItem("hbu_username") || "").trim();
      if (!sid) {
        cloudSyncStatus.value = null;
        cloudSyncStatusUpdatedAt.value = "";
        return;
      }
      const status = getCloudSyncLocalStatus(sid);
      cloudSyncStatus.value = status;
      cloudSyncStatusUpdatedAt.value = (/* @__PURE__ */ new Date()).toLocaleString();
    };
    const readSnapshotUploadEndpoint = () => {
      try {
        const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY);
        if (!raw) return "";
        const snapshot = JSON.parse(raw);
        return toSafeText(
          snapshot?.temp_file_server?.schedule_upload_endpoint || snapshot?.resource_share?.temp_upload_endpoint
        );
      } catch {
        return "";
      }
    };
    const getEffectiveUploadEndpoint = (backend) => {
      const localValue = toSafeText(backend?.tempUploadEndpoint);
      if (!backend?.useRemoteConfig) return localValue;
      return toSafeText(localStorage.getItem(REMOTE_UPLOAD_ENDPOINT_KEY)) || readSnapshotUploadEndpoint() || localValue;
    };
    const normalizeProbeTarget = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      if (/^https?:\/\//i.test(text)) return text;
      const prefix = LOCAL_HOST_PATTERN.test(text) ? "http://" : "https://";
      return `${prefix}${text}`;
    };
    const probeRows = computed(() => {
      const backend = appSettings.backend || {};
      const stored = getStoredOcrConfig();
      const uploadEndpoint = getEffectiveUploadEndpoint(backend);
      const cloudSyncConfig = getCloudSyncRuntimeConfig();
      const cloudSyncEndpoint = cloudSyncConfig.enabled ? normalizeProbeTarget(cloudSyncConfig.endpoint || DEFAULT_CLOUD_SYNC_ENDPOINT) : "";
      const localOcr = String(
        backend.ocrEndpoint || (!backend.useRemoteConfig ? DEFAULT_OCR_ENDPOINT : stored.endpoint)
      ).trim();
      return [
        {
          id: "ocr",
          label: "OCR 服务器",
          url: normalizeProbeTarget(localOcr),
          desc: "验证码识别服务"
        },
        {
          id: "upload",
          label: "临时上传服务器",
          url: normalizeProbeTarget(uploadEndpoint),
          desc: "课表导出临时文件上传"
        },
        {
          id: "cloud_sync",
          label: "云同步服务",
          url: cloudSyncEndpoint,
          desc: "账号设置与课表云备份"
        },
        {
          id: "portal",
          label: "新融合门户",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.portal),
          desc: "统一门户可达性"
        },
        {
          id: "jwxt",
          label: "教务系统",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.jwxt),
          desc: "课程/成绩主系统"
        },
        {
          id: "chaoxing",
          label: "超星渠道",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.chaoxing),
          desc: "教务超星入口"
        },
        {
          id: "oneCode",
          label: "一码通",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.oneCode),
          desc: "一卡通与电费认证入口"
        },
        {
          id: "library",
          label: "图书馆",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.library),
          desc: "图书服务站点"
        }
      ];
    });
    const cardStyleOptions = [
      { key: "glass", label: "玻璃卡片", desc: "半透明层叠，观感轻盈" },
      { key: "solid", label: "实体卡片", desc: "信息稳定，适合高频阅读" },
      { key: "outline", label: "线框卡片", desc: "弱背景，强调边界层级" }
    ];
    const navStyleOptions = [
      { key: "floating", label: "悬浮导航", desc: "圆角悬浮底栏，现代移动风格" },
      { key: "pill", label: "胶囊导航", desc: "选中态更突出，反馈更明显" },
      { key: "compact", label: "紧凑导航", desc: "占用更少高度，提升信息密度" }
    ];
    const densityOptions = [
      { key: "comfortable", label: "舒适", desc: "留白更多，触控更友好" },
      { key: "balanced", label: "均衡", desc: "效率与观感平衡（推荐）" },
      { key: "compact", label: "紧凑", desc: "压缩间距，单屏显示更多内容" }
    ];
    const interactionProfiles = [
      {
        key: "mobile_focus",
        label: "移动高效",
        desc: "大按钮 · 紧凑间距 · 快速响应",
        patch: { radiusScale: 1.12, fontScale: 1.03, spaceScale: 1.08, motionScale: 0.9 },
        profile: { cardStyle: "solid", navStyle: "compact", density: "compact", iconStyle: "line", decor: "none" }
      },
      {
        key: "immersive_read",
        label: "沉浸阅读",
        desc: "柔和光效 · 舒适间距 · 细节丰富",
        patch: { radiusScale: 1.1, fontScale: 1.02, spaceScale: 1.04, motionScale: 1 },
        profile: { cardStyle: "glass", navStyle: "floating", density: "comfortable", iconStyle: "duotone", decor: "grain" }
      },
      {
        key: "minimal",
        label: "极简模式",
        desc: "线条简洁 · 信息密集 · 零装饰",
        patch: { radiusScale: 0.92, fontScale: 0.95, spaceScale: 0.9, motionScale: 0.85 },
        profile: { cardStyle: "outline", navStyle: "compact", density: "compact", iconStyle: "mono", decor: "none" }
      },
      {
        key: "classic",
        label: "经典布局",
        desc: "均衡配色 · 标准密度 · 双色图标",
        patch: { radiusScale: 1, fontScale: 1, spaceScale: 1, motionScale: 1 },
        profile: { cardStyle: "solid", navStyle: "pill", density: "balanced", iconStyle: "duotone", decor: "mesh" }
      }
    ];
    const withCacheBust = (url) => {
      const text = String(url || "").trim();
      if (!text) return "";
      return `${text}${text.includes("?") ? "&" : "?"}_probe=${Date.now()}`;
    };
    const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const toShortError = (error) => {
      const text = String(error?.message || error || "").toLowerCase();
      if (!text) return "请求失败";
      if (text.includes("timeout") || text.includes("aborted")) return "超时";
      if (text.includes("failed to fetch") || text.includes("network")) return "网络异常";
      if (text.length > 18) return `${text.slice(0, 18)}...`;
      return text;
    };
    const probeViaCapacitorHttp = async (url, timeoutMs) => {
      if (!isCapacitorApp) return null;
      try {
        const core = await __vitePreload(() => import("./runtime-bridge-apFQ0nCw.js").then((n) => n.N), true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
        const capHttp = core?.CapacitorHttp || window?.Capacitor?.Plugins?.CapacitorHttp;
        if (!capHttp?.request) return null;
        const response = await capHttp.request({
          method: "GET",
          url: withCacheBust(url),
          headers: { Accept: "*/*" },
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs
        });
        return { status: Number(response?.status || 0), source: "capacitor-http" };
      } catch {
        return null;
      }
    };
    const probeViaFetch = async (url, timeoutMs) => {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = window.setTimeout(() => {
        controller?.abort?.();
      }, timeoutMs);
      try {
        const response = await fetch(withCacheBust(url), {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          signal: controller?.signal
        });
        return { status: Number(response?.status || 0), source: "fetch" };
      } finally {
        window.clearTimeout(timer);
      }
    };
    const probeViaImage = (url, timeoutMs) => new Promise((resolve, reject) => {
      const img = new Image();
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        img.onload = null;
        img.onerror = null;
        reject(new Error("timeout"));
      }, timeoutMs);
      const finish = (ok) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        {
          resolve({ status: 0, source: "image" });
        }
      };
      img.onload = () => finish();
      img.onerror = () => finish();
      img.src = withCacheBust(url);
    });
    const probeEndpoint = async (url, timeoutMs) => {
      const start = nowMs();
      try {
        const capMeta = await probeViaCapacitorHttp(url, timeoutMs);
        if (capMeta) {
          return {
            status: "success",
            latencyMs: Math.max(1, Math.round(nowMs() - start)),
            httpStatus: capMeta.status,
            source: capMeta.source
          };
        }
        const fetchMeta = await probeViaFetch(url, timeoutMs);
        return {
          status: "success",
          latencyMs: Math.max(1, Math.round(nowMs() - start)),
          httpStatus: fetchMeta.status,
          source: fetchMeta.source
        };
      } catch (fetchError) {
        try {
          const imageMeta = await probeViaImage(url, timeoutMs);
          return {
            status: "success",
            latencyMs: Math.max(1, Math.round(nowMs() - start)),
            httpStatus: imageMeta.status,
            source: imageMeta.source
          };
        } catch (imgError) {
          return {
            status: "error",
            latencyMs: Math.max(1, Math.round(nowMs() - start)),
            error: toShortError(imgError || fetchError)
          };
        }
      }
    };
    const getProbeResult = (id) => probeResults.value[id] || { status: "idle" };
    const probeStateClass = (id) => {
      const result = getProbeResult(id);
      if (result.status === "testing") return "testing";
      if (result.status === "error") return "error";
      if (result.status === "skipped") return "idle";
      if (result.status !== "success") return "idle";
      if (result.latencyMs < 250) return "fast";
      if (result.latencyMs < 800) return "medium";
      return "slow";
    };
    const probeStateText = (id) => {
      const result = getProbeResult(id);
      if (result.status === "testing") return "检测中...";
      if (result.status === "skipped") return "未配置地址";
      if (result.status === "error") return `失败：${result.error || "请求异常"}`;
      if (result.status === "success") {
        if (result.httpStatus > 0) {
          return `${result.latencyMs} ms · HTTP ${result.httpStatus}`;
        }
        return `${result.latencyMs} ms · 可达`;
      }
      return "待检测";
    };
    const runSingleProbe = async (item, timeoutMs) => {
      if (!item.url) {
        probeResults.value = {
          ...probeResults.value,
          [item.id]: { status: "skipped" }
        };
        return;
      }
      pushDebugLog("Probe", `开始检测 ${item.label}: ${item.url}`, "debug");
      probeResults.value = {
        ...probeResults.value,
        [item.id]: { status: "testing" }
      };
      const result = await probeEndpoint(item.url, timeoutMs);
      pushDebugLog(
        "Probe",
        `${item.label} -> ${result.status}${result.latencyMs ? ` (${result.latencyMs}ms)` : ""}`,
        result.status === "error" ? "warn" : "info",
        result
      );
      probeResults.value = {
        ...probeResults.value,
        [item.id]: result
      };
    };
    const handleRunConnectivityTest = async () => {
      if (probeRunning.value) return;
      const timeoutMs = Number(appSettings.backend.moduleParams.probeTimeoutMs || 8e3);
      const rows = probeRows.value;
      if (!rows.length) {
        showToast("当前没有可测速的目标地址", "info");
        return;
      }
      pushDebugLog("Settings", `开始功能测速：目标数=${rows.length}，超时=${timeoutMs}ms`, "info");
      probeRunning.value = true;
      probeFinishedAt.value = "";
      await Promise.all(rows.map((item) => runSingleProbe(item, timeoutMs)));
      probeRunning.value = false;
      probeFinishedAt.value = (/* @__PURE__ */ new Date()).toLocaleString();
      pushDebugLog("Settings", `功能测速完成，目标数=${rows.length}，超时=${timeoutMs}ms`, "info");
      showToast("测速完成", "success");
    };
    const refreshDebugPanel = () => {
      debugLogs.value = getDebugLogs(DEBUG_LOG_LIMIT);
    };
    const scrollDebugToBottom = () => {
      requestAnimationFrame(() => {
        const panel = debugPanelRef.value;
        if (!panel) return;
        panel.scrollTop = panel.scrollHeight;
      });
    };
    const handleClearDebugPanel = () => {
      clearDebugLogs();
      refreshDebugPanel();
      showToast("调试日志已清空", "success");
    };
    const handleCopyDebugLogs = async () => {
      const rows = debugLogs.value.map((item) => {
        return `${formatDebugTime(item.ts)} [${String(item.level || "log").toUpperCase()}][${item.scope}] ${item.message}`;
      });
      if (!rows.length) {
        showToast("当前没有调试日志", "info");
        return;
      }
      try {
        await navigator.clipboard.writeText(rows.join("\n"));
        showToast("调试日志已复制", "success");
      } catch {
        showToast("复制失败，请检查剪贴板权限", "error");
      }
    };
    const setProfileOption = (field, value, label) => {
      if (uiSettings.profile[field] === value) {
        flushUiSettings();
        showToast(`${label}已生效`, "info");
        return;
      }
      uiSettings.profile[field] = value;
      flushUiSettings();
      showToast(`已切换：${label}`, "success");
    };
    const handleApplyProfile = (profile) => {
      Object.entries(profile.patch).forEach(([k, v]) => {
        uiSettings[k] = v;
      });
      if (profile.profile) {
        Object.entries(profile.profile).forEach(([k, v]) => {
          uiSettings.profile[k] = v;
        });
      }
      flushUiSettings();
      showToast(`已应用方案：${profile.label}`, "success");
    };
    const handleApplyBackendSettings = async ({ silent = false, emitModeEvent = false } = {}) => {
      try {
        pushDebugLog(
          "Settings",
          `应用后端配置：useRemote=${appSettings.backend.useRemoteConfig ? "1" : "0"}`
        );
        const stored = getStoredOcrConfig();
        const customOcrEndpoint = String(appSettings.backend.ocrEndpoint || "").trim();
        const endpointList = customOcrEndpoint ? [customOcrEndpoint] : appSettings.backend.useRemoteConfig ? stored.endpoints : [DEFAULT_OCR_ENDPOINT];
        await applyOcrRuntimeConfig({
          ocr: {
            enabled: true,
            endpoint: endpointList[0] || stored.endpoint,
            endpoints: endpointList,
            local_fallback_endpoints: stored.local_fallback_endpoints
          }
        });
        window.dispatchEvent(new CustomEvent("hbu-ocr-config-updated"));
        const uploadEndpoint = String(appSettings.backend.tempUploadEndpoint || "").trim();
        const useRemoteConfig = appSettings.backend.useRemoteConfig;
        const shouldWriteUploadEndpoint = !!uploadEndpoint || !useRemoteConfig;
        if (shouldWriteUploadEndpoint) {
          if (uploadEndpoint) {
            localStorage.setItem(REMOTE_UPLOAD_ENDPOINT_KEY, uploadEndpoint);
          } else {
            localStorage.removeItem(REMOTE_UPLOAD_ENDPOINT_KEY);
          }
        }
        if (isTauriApp && shouldWriteUploadEndpoint) {
          await invokeNative("set_temp_upload_endpoint", { endpoint: uploadEndpoint || null });
        }
        const cloudSyncEndpoint = String(appSettings.backend.cloudSyncEndpoint || "").trim();
        const cloudSyncSecretRef = String(appSettings.backend.cloudSyncSecretRef || "").trim();
        const cloudSyncUploadCooldown = Number(appSettings.backend.moduleParams.cloudSyncUploadCooldownSec || 120);
        const cloudSyncDownloadCooldown = Number(appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec || 10);
        pushDebugLog(
          "Settings",
          `CloudSync 配置 endpoint=${cloudSyncEndpoint || "(remote/default)"} secret_ref=${cloudSyncSecretRef || "(remote/default)"} upload_cooldown=${cloudSyncUploadCooldown}s download_cooldown=${cloudSyncDownloadCooldown}s`,
          "debug"
        );
        if (emitModeEvent) {
          window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
        }
        if (!silent) {
          showToast("后端设置已应用", "success");
        }
        pushDebugLog("Settings", "后端配置应用成功", "info");
        return true;
      } catch (e) {
        pushDebugLog("Settings", "后端配置应用失败", "error", e);
        console.warn("[Settings] apply backend config failed", e);
        if (!silent) {
          showToast("应用后端设置失败，请检查地址格式", "error");
        }
        return false;
      }
    };
    const handleRemoteModeChanged = async () => {
      const nextUseRemoteConfig = !appSettings.backend.useRemoteConfig;
      appSettings.backend.useRemoteConfig = nextUseRemoteConfig;
      pushDebugLog("Settings", `切换配置源：${nextUseRemoteConfig ? "远程配置" : "仅本地"}`);
      if (nextUseRemoteConfig) {
        window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
        showToast("已启用远程配置", "success");
        return;
      }
      const ok = await handleApplyBackendSettings({ silent: true, emitModeEvent: true });
      if (ok) {
        showToast("已切换为仅本地配置", "success");
      }
    };
    const handleResetBackend = () => {
      resetAppSettings();
      probeResults.value = {};
      probeFinishedAt.value = "";
      window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
      pushDebugLog("Settings", "后端参数已恢复默认");
      showToast("已恢复默认后端参数", "success");
    };
    const clearBackendAutoApplyTimer = () => {
      if (backendAutoApplyTimer) {
        window.clearTimeout(backendAutoApplyTimer);
        backendAutoApplyTimer = null;
      }
    };
    const scheduleBackendAutoApply = () => {
      clearBackendAutoApplyTimer();
      backendAutoApplyTimer = window.setTimeout(async () => {
        if (backendAutoApplying) return;
        backendAutoApplying = true;
        try {
          await handleApplyBackendSettings({ silent: true, emitModeEvent: false });
        } finally {
          backendAutoApplying = false;
        }
      }, 420);
    };
    watch(
      () => [
        appSettings.backend.useRemoteConfig,
        appSettings.backend.ocrEndpoint,
        appSettings.backend.tempUploadEndpoint,
        appSettings.backend.cloudSyncEndpoint,
        appSettings.backend.cloudSyncSecretRef,
        appSettings.backend.moduleParams.requestTimeoutMs,
        appSettings.backend.moduleParams.probeTimeoutMs,
        appSettings.backend.moduleParams.cloudSyncCooldownSec,
        appSettings.backend.moduleParams.cloudSyncUploadCooldownSec,
        appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec,
        appSettings.retry.electricity,
        appSettings.retry.classroom,
        appSettings.retryDelayMs,
        appSettings.resourceShare.previewThreadsMobile,
        appSettings.resourceShare.previewThreadsDesktop,
        appSettings.resourceShare.downloadThreadsMobile,
        appSettings.resourceShare.downloadThreadsDesktop
      ],
      () => {
        scheduleBackendAutoApply();
      }
    );
    watch(
      () => activeTab.value,
      (tab) => {
        if (tab !== "debug") return;
        refreshDebugPanel();
        scrollDebugToBottom();
      }
    );
    watch(
      () => currentStudentId.value,
      () => {
        refreshCloudSyncStatus();
      }
    );
    onMounted(() => {
      refreshDebugPanel();
      refreshCloudSyncStatus();
      unsubscribeDebugLogs = subscribeDebugLogs((logs) => {
        debugLogs.value = logs.slice(-DEBUG_LOG_LIMIT);
        if (activeTab.value === "debug") {
          scrollDebugToBottom();
        }
      });
      window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, refreshCloudSyncStatus);
      if (activeTab.value === "debug") {
        scrollDebugToBottom();
      }
    });
    onBeforeUnmount(() => {
      clearBackendAutoApplyTimer();
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, refreshCloudSyncStatus);
      if (typeof unsubscribeDebugLogs === "function") {
        unsubscribeDebugLogs();
        unsubscribeDebugLogs = null;
      }
    });
    const handleSelectFont = async (fontKey) => {
      if (fontKey === "default") {
        fontSettings.font = "default";
        pendingFontKey.value = "";
        pushDebugLog("Font", "切换字体：默认");
        flushUiSettings();
        showToast("字体已应用", "success");
        return;
      }
      pushDebugLog("Font", `切换字体：${FONT_DISPLAY_NAME[fontKey] || fontKey}`);
      showFontModal.value = true;
      fontModalTitle.value = `加载${FONT_DISPLAY_NAME[fontKey] || "字体"}`;
      fontModalDescription.value = "正在检测本地缓存...";
      fontModalRetryMode.value = fontKey === "deyihei" ? "deyihei" : "prefetch";
      fontDownloadProgress.value = 20;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      fontDownloadStep.value = `检测本地缓存：${FONT_DISPLAY_NAME[fontKey] || fontKey}`;
      try {
        const cached = await ensureFontLoaded(fontKey, false, true);
        if (cached) {
          fontSettings.font = fontKey;
          pendingFontKey.value = "";
          flushUiSettings();
          pushDebugLog("Font", `字体切换成功（缓存命中）：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, "info");
          fontDownloadProgress.value = 100;
          fontDownloadStatus.value = "success";
          fontDownloadStep.value = "本地缓存命中，字体已应用";
          showToast("字体已应用", "success");
          showFontModal.value = false;
          return;
        }
      } catch {
      }
      pushDebugLog("Font", `本地缓存未命中，开始从 CDN 下载：${FONT_DISPLAY_NAME[fontKey] || fontKey}`);
      fontModalDescription.value = "本地未缓存，正在从 CDN 下载字体...";
      fontDownloadProgress.value = 40;
      fontDownloadStep.value = `正在下载：${FONT_DISPLAY_NAME[fontKey] || fontKey}`;
      try {
        let loaded = false;
        if (fontKey === "deyihei") {
          loaded = await loadDeyiHeiFont(true);
        } else {
          loaded = await ensureFontLoaded(fontKey, true, false);
        }
        if (!loaded) throw new Error("font download failed");
        fontSettings.font = fontKey;
        pendingFontKey.value = "";
        flushUiSettings();
        pushDebugLog("Font", `字体下载并应用成功：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, "info");
        fontDownloadProgress.value = 100;
        fontDownloadStatus.value = "success";
        fontDownloadStep.value = "字体下载完成，已应用";
        showToast("字体已应用", "success");
        showFontModal.value = false;
      } catch (e) {
        console.warn("[Font] download failed", e);
        pendingFontKey.value = fontKey;
        pushDebugLog("Font", `字体下载失败：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, "error", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = "字体下载失败，请检查网络后重试。";
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast("字体下载失败，请检查网络后重试", "error");
      }
    };
    const handleSelectCdnProvider = async (provider) => {
      if (fontSettings.cdnProvider === provider) return;
      setFontCdnProvider(provider);
      if (fontSettings.font !== "default") {
        await ensureFontLoaded(fontSettings.font, true);
      }
      pushDebugLog("Font", `切换 CDN 节点：${provider}`);
      showToast(`字体 CDN 已切换为：${provider === "auto" ? "自动" : provider}`, "success");
    };
    const handlePrefetchFonts = async (force = false, cacheAll = false) => {
      if (cdnPrefetching.value) return;
      const pending = String(pendingFontKey.value || "").trim();
      const current = String(fontSettings.font || "").trim();
      let targets;
      if (cacheAll) {
        targets = ["heiti", "songti", "kaiti", "fangsong", "deyihei"];
      } else {
        targets = pending && pending !== "default" ? [pending] : current && current !== "default" ? [current] : [];
      }
      if (!targets.length) {
        showToast("请先选择一个字体，再执行预缓存", "info");
        return;
      }
      pushDebugLog("Font", `开始预缓存字体，force=${force ? "1" : "0"}`);
      cdnPrefetching.value = true;
      const needDeyiheiDownload = targets.includes("deyihei") && !fontSettings.loaded;
      showFontModal.value = true;
      fontModalTitle.value = cacheAll ? "缓存全部字体" : "预缓存云端字体";
      fontModalDescription.value = cacheAll ? `正在缓存全部 ${targets.length} 种字体...` : needDeyiheiDownload ? "未检测到本地得意黑，将先缓存得意黑后再应用。" : `正在缓存：${targets.map((key) => FONT_DISPLAY_NAME[key] || key).join(" / ")}`;
      fontModalRetryMode.value = "prefetch";
      fontDownloadProgress.value = 8;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      fontDownloadStep.value = "准备预缓存字体...";
      try {
        const results = await prefetchCdnFonts(force, ({ key, index, total, ok }) => {
          const label = FONT_DISPLAY_NAME[key] || key;
          if (showFontModal.value) {
            fontDownloadProgress.value = Math.max(12, Math.round(index / total * 100));
            fontDownloadStep.value = `(${index}/${total}) ${label}${ok ? " 缓存完成" : " 缓存失败"}`;
          }
        }, targets);
        const success = Object.values(results).filter(Boolean).length;
        const requestedKey = targets[0];
        if (requestedKey && results[requestedKey]) {
          fontSettings.font = requestedKey;
          pendingFontKey.value = "";
          flushUiSettings();
        }
        if (success === Object.keys(results).length) {
          pushDebugLog("Font", `字体预缓存完成：${success}/${Object.keys(results).length}`);
          fontDownloadStatus.value = "success";
          showToast(`字体缓存完成：${success}/${Object.keys(results).length}`, "success");
          showFontModal.value = false;
        } else {
          pushDebugLog(
            "Font",
            `字体预缓存部分失败：${success}/${Object.keys(results).length}`,
            "warn",
            results
          );
          fontDownloadStatus.value = "failed";
          fontDownloadError.value = `部分字体缓存失败（${success}/${Object.keys(results).length}）`;
          showToast("部分字体缓存失败，请重试", "error");
        }
      } catch (e) {
        pushDebugLog("Font", "字体预缓存失败", "error", e);
        console.warn("[Font] prefetch failed", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = "字体缓存失败，请检查网络后重试";
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast("字体缓存失败，请检查网络后重试", "error");
      } finally {
        cdnPrefetching.value = false;
      }
    };
    const handleDownloadFont = async (force = false) => {
      if (downloadingFont.value) return;
      pushDebugLog("Font", `下载得意黑：force=${force ? "1" : "0"}`);
      downloadingFont.value = true;
      showFontModal.value = true;
      fontModalTitle.value = "下载得意黑字体";
      fontModalDescription.value = "首次启用需下载字体文件，下载完成后会自动应用。";
      fontModalRetryMode.value = "deyihei";
      fontDownloadStep.value = "准备下载得意黑...";
      fontDownloadProgress.value = 15;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      try {
        const loaded = await loadDeyiHeiFont(force);
        if (!loaded) {
          throw new Error("font not loaded");
        }
        fontDownloadProgress.value = 100;
        fontDownloadStatus.value = "success";
        fontDownloadStep.value = "得意黑已缓存并应用";
        fontSettings.font = "deyihei";
        pendingFontKey.value = "";
        pushDebugLog("Font", "得意黑下载并应用成功");
        showToast("字体下载完成，已应用得意黑", "success");
        showFontModal.value = false;
      } catch (e) {
        pushDebugLog("Font", "得意黑下载失败", "error", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = "字体下载失败，请检查网络后重试";
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast("字体下载失败，请检查网络后重试", "error");
        console.warn("[Font] download failed", e);
      } finally {
        downloadingFont.value = false;
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("header", _hoisted_2, [
            createBaseVNode("button", {
              class: "header-icon-btn",
              onClick: _cache[0] || (_cache[0] = ($event) => emit("back"))
            }, [..._cache[35] || (_cache[35] = [
              createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
            ])]),
            _cache[36] || (_cache[36] = createBaseVNode("h1", { class: "header-title" }, "设置中心", -1)),
            _cache[37] || (_cache[37] = createBaseVNode("div", { class: "header-spacer" }, null, -1))
          ]),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              class: normalizeClass(["settings-tab-item", { active: activeTab.value === "appearance" }]),
              onClick: _cache[1] || (_cache[1] = ($event) => activeTab.value = "appearance")
            }, " 外观 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["settings-tab-item", { active: activeTab.value === "backend" }]),
              onClick: _cache[2] || (_cache[2] = ($event) => activeTab.value = "backend")
            }, " 后端 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["settings-tab-item", { active: activeTab.value === "debug" }]),
              onClick: _cache[3] || (_cache[3] = ($event) => activeTab.value = "debug")
            }, " 调试 ", 2)
          ]),
          activeTab.value === "appearance" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("section", _hoisted_4, [
              createBaseVNode("div", _hoisted_5, [
                _cache[38] || (_cache[38] = createBaseVNode("span", { class: "startup-page-label" }, "启动页面", -1)),
                createBaseVNode("div", _hoisted_6, [
                  createBaseVNode("button", {
                    class: normalizeClass(["toggle-btn btn-ripple", { active: unref(uiSettings).startupPage === "home" }]),
                    onClick: _cache[4] || (_cache[4] = ($event) => {
                      unref(uiSettings).startupPage = "home";
                      unref(showToast)("启动页面：首页", "success");
                    })
                  }, "首页", 2),
                  createBaseVNode("button", {
                    class: normalizeClass(["toggle-btn btn-ripple", { active: unref(uiSettings).startupPage === "schedule" }]),
                    onClick: _cache[5] || (_cache[5] = ($event) => {
                      unref(uiSettings).startupPage = "schedule";
                      unref(showToast)("启动页面：课表", "success");
                    })
                  }, "课表", 2)
                ])
              ]),
              createBaseVNode("div", _hoisted_7, [
                _cache[39] || (_cache[39] = createBaseVNode("span", { class: "startup-page-label" }, "开屏动画", -1)),
                createBaseVNode("div", _hoisted_8, [
                  createBaseVNode("button", {
                    class: normalizeClass(["toggle-btn btn-ripple", { active: unref(uiSettings).splashEnabled }]),
                    onClick: _cache[6] || (_cache[6] = ($event) => {
                      unref(uiSettings).splashEnabled = true;
                      unref(showToast)("开屏动画：已开启", "success");
                    })
                  }, "开启", 2),
                  createBaseVNode("button", {
                    class: normalizeClass(["toggle-btn btn-ripple", { active: !unref(uiSettings).splashEnabled }]),
                    onClick: _cache[7] || (_cache[7] = ($event) => {
                      unref(uiSettings).splashEnabled = false;
                      unref(showToast)("开屏动画：已关闭", "success");
                    })
                  }, "关闭", 2)
                ])
              ])
            ]),
            createBaseVNode("section", _hoisted_9, [
              _cache[42] || (_cache[42] = createBaseVNode("div", { class: "section-head" }, [
                createBaseVNode("h3", null, "主题模式")
              ], -1)),
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("div", {
                  class: normalizeClass(["theme-toggle-track", { "is-dark": isDarkMode.value }]),
                  onClick: toggleDarkMode
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["theme-sky", isDarkMode.value ? "theme-sky--night" : "theme-sky--day"])
                  }, [
                    createBaseVNode("div", {
                      class: normalizeClass(["theme-stars", { "opacity-100": isDarkMode.value, "opacity-0": !isDarkMode.value }])
                    }, [
                      (openBlock(), createElementBlock(Fragment, null, renderList(6, (i) => {
                        return createBaseVNode("span", {
                          key: i,
                          class: "star",
                          style: normalizeStyle({ left: `${10 + i * 14}%`, top: `${15 + i % 3 * 20}%`, animationDelay: `${i * 0.3}s` })
                        }, null, 4);
                      }), 64))
                    ], 2)
                  ], 2),
                  createBaseVNode("div", {
                    class: normalizeClass(["theme-celestial", isDarkMode.value ? "theme-celestial--moon" : "theme-celestial--sun"])
                  }, [
                    !isDarkMode.value ? (openBlock(), createElementBlock("div", _hoisted_11, [..._cache[40] || (_cache[40] = [
                      createBaseVNode("i", { class: "fas fa-sun" }, null, -1)
                    ])])) : (openBlock(), createElementBlock("div", _hoisted_12, [..._cache[41] || (_cache[41] = [
                      createBaseVNode("i", { class: "fas fa-moon" }, null, -1)
                    ])]))
                  ], 2),
                  createBaseVNode("div", _hoisted_13, [
                    createBaseVNode("span", {
                      class: normalizeClass(["theme-label", { active: !isDarkMode.value }])
                    }, "白天", 2),
                    createBaseVNode("span", {
                      class: normalizeClass(["theme-label", { active: isDarkMode.value }])
                    }, "夜间", 2)
                  ])
                ], 2),
                createBaseVNode("p", _hoisted_14, toDisplayString(isDarkMode.value ? "夜间模式已开启，保护您的眼睛" : "白天模式，清爽明亮"), 1)
              ])
            ]),
            createBaseVNode("section", _hoisted_15, [
              _cache[46] || (_cache[46] = createBaseVNode("h3", null, "界面个性化", -1)),
              createBaseVNode("div", _hoisted_16, [
                _cache[43] || (_cache[43] = createBaseVNode("label", null, "卡片风格", -1)),
                createBaseVNode("div", _hoisted_17, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(cardStyleOptions, (item) => {
                    return createBaseVNode("button", {
                      key: item.key,
                      class: normalizeClass(["option-chip", { active: unref(uiSettings).profile.cardStyle === item.key }]),
                      onClick: ($event) => setProfileOption("cardStyle", item.key, `卡片风格：${item.label}`)
                    }, [
                      createBaseVNode("strong", null, toDisplayString(item.label), 1),
                      createBaseVNode("small", null, toDisplayString(item.desc), 1)
                    ], 10, _hoisted_18);
                  }), 64))
                ])
              ]),
              createBaseVNode("div", _hoisted_19, [
                _cache[44] || (_cache[44] = createBaseVNode("label", null, "导航样式", -1)),
                createBaseVNode("div", _hoisted_20, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(navStyleOptions, (item) => {
                    return createBaseVNode("button", {
                      key: item.key,
                      class: normalizeClass(["option-chip", { active: unref(uiSettings).profile.navStyle === item.key }]),
                      onClick: ($event) => setProfileOption("navStyle", item.key, `导航样式：${item.label}`)
                    }, [
                      createBaseVNode("strong", null, toDisplayString(item.label), 1),
                      createBaseVNode("small", null, toDisplayString(item.desc), 1)
                    ], 10, _hoisted_21);
                  }), 64))
                ])
              ]),
              createBaseVNode("div", _hoisted_22, [
                _cache[45] || (_cache[45] = createBaseVNode("label", null, "界面密度", -1)),
                createBaseVNode("div", _hoisted_23, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(densityOptions, (item) => {
                    return createBaseVNode("button", {
                      key: item.key,
                      class: normalizeClass(["option-chip", { active: unref(uiSettings).profile.density === item.key }]),
                      onClick: ($event) => setProfileOption("density", item.key, `界面密度：${item.label}`)
                    }, [
                      createBaseVNode("strong", null, toDisplayString(item.label), 1),
                      createBaseVNode("small", null, toDisplayString(item.desc), 1)
                    ], 10, _hoisted_24);
                  }), 64))
                ])
              ])
            ]),
            createBaseVNode("section", _hoisted_25, [
              _cache[47] || (_cache[47] = createBaseVNode("h3", null, "风格套装", -1)),
              createBaseVNode("div", _hoisted_26, [
                (openBlock(), createElementBlock(Fragment, null, renderList(interactionProfiles, (profile) => {
                  return createBaseVNode("button", {
                    key: profile.key,
                    class: "profile-card",
                    onClick: ($event) => handleApplyProfile(profile)
                  }, [
                    createBaseVNode("strong", null, toDisplayString(profile.label), 1),
                    createBaseVNode("span", null, toDisplayString(profile.desc), 1)
                  ], 8, _hoisted_27);
                }), 64))
              ])
            ]),
            createBaseVNode("section", _hoisted_28, [
              _cache[51] || (_cache[51] = createBaseVNode("h3", null, "字体", -1)),
              createBaseVNode("div", _hoisted_29, [
                createBaseVNode("button", {
                  class: normalizeClass(["font-btn btn-ripple", { active: unref(fontSettings).font === "default" }]),
                  onClick: _cache[8] || (_cache[8] = ($event) => handleSelectFont("default"))
                }, " 默认字体 ", 2),
                createBaseVNode("button", {
                  class: normalizeClass(["font-btn btn-ripple", { active: unref(fontSettings).font === "heiti" }]),
                  onClick: _cache[9] || (_cache[9] = ($event) => handleSelectFont("heiti"))
                }, " 黑体 ", 2),
                createBaseVNode("button", {
                  class: normalizeClass(["font-btn btn-ripple", { active: unref(fontSettings).font === "songti" }]),
                  onClick: _cache[10] || (_cache[10] = ($event) => handleSelectFont("songti"))
                }, " 宋体 ", 2),
                createBaseVNode("button", {
                  class: normalizeClass(["font-btn btn-ripple", { active: unref(fontSettings).font === "kaiti" }]),
                  onClick: _cache[11] || (_cache[11] = ($event) => handleSelectFont("kaiti"))
                }, " 楷体 ", 2),
                createBaseVNode("button", {
                  class: normalizeClass(["font-btn btn-ripple", { active: unref(fontSettings).font === "fangsong" }]),
                  onClick: _cache[12] || (_cache[12] = ($event) => handleSelectFont("fangsong"))
                }, " 仿宋 ", 2),
                createBaseVNode("button", {
                  class: normalizeClass(["font-btn btn-ripple", { active: unref(fontSettings).font === "deyihei" }]),
                  onClick: _cache[13] || (_cache[13] = ($event) => handleSelectFont("deyihei"))
                }, " 得意黑（需下载） ", 2)
              ]),
              createBaseVNode("div", _hoisted_30, [
                _cache[48] || (_cache[48] = createBaseVNode("label", null, "字体 CDN 节点", -1)),
                createBaseVNode("div", _hoisted_31, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(fontCdnOptions), (option) => {
                    return openBlock(), createElementBlock("button", {
                      key: option.key,
                      class: normalizeClass(["font-cdn-btn btn-ripple", { active: unref(fontSettings).cdnProvider === option.key }]),
                      onClick: ($event) => handleSelectCdnProvider(option.key)
                    }, [
                      createBaseVNode("strong", null, toDisplayString(option.label), 1),
                      createBaseVNode("small", null, toDisplayString(option.desc), 1)
                    ], 10, _hoisted_32);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_33, [
                _cache[49] || (_cache[49] = createBaseVNode("label", null, "本地字体可用性说明", -1)),
                createBaseVNode("ul", null, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(fontLocalAvailability.value, (item) => {
                    return openBlock(), createElementBlock("li", { key: item }, toDisplayString(item), 1);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_34, [
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple",
                  disabled: downloadingFont.value,
                  onClick: _cache[14] || (_cache[14] = ($event) => handleDownloadFont(unref(fontSettings).loaded))
                }, toDisplayString(downloadingFont.value ? "下载中..." : unref(fontSettings).loaded ? "重新下载得意黑" : "下载得意黑"), 9, _hoisted_35),
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple",
                  disabled: cdnPrefetching.value,
                  onClick: _cache[15] || (_cache[15] = ($event) => handlePrefetchFonts(false))
                }, toDisplayString(cdnPrefetching.value ? "缓存中..." : prefetchButtonText.value), 9, _hoisted_36),
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple",
                  disabled: cdnPrefetching.value,
                  onClick: _cache[16] || (_cache[16] = ($event) => handlePrefetchFonts(false, true))
                }, toDisplayString(cdnPrefetching.value ? "缓存中..." : "缓存全部字体"), 9, _hoisted_37),
                _cache[50] || (_cache[50] = createBaseVNode("span", { class: "hint" }, "字体选择会自动保存；下次打开应用会自动恢复上次字体。", -1))
              ])
            ])
          ], 64)) : activeTab.value === "backend" ? (openBlock(), createElementBlock("section", _hoisted_38, [
            createBaseVNode("div", { class: "section-head" }, [
              _cache[52] || (_cache[52] = createBaseVNode("h3", null, "后端与模块参数", -1)),
              createBaseVNode("button", {
                class: "mini-btn btn-ripple",
                onClick: handleResetBackend
              }, "恢复默认")
            ]),
            createBaseVNode("div", _hoisted_39, [
              createBaseVNode("span", _hoisted_40, "配置源：" + toDisplayString(backendSourceLabel.value), 1),
              createBaseVNode("span", _hoisted_41, "运行时：" + toDisplayString(runtimeLabel.value), 1),
              createBaseVNode("span", _hoisted_42, "预览线程：" + toDisplayString(activePreviewThreads.value), 1),
              createBaseVNode("span", _hoisted_43, "下载线程：" + toDisplayString(activeDownloadThreads.value), 1),
              createBaseVNode("span", _hoisted_44, "设备：" + toDisplayString(activeDeviceLabel.value), 1)
            ]),
            createBaseVNode("div", _hoisted_45, [
              createBaseVNode("div", { class: "section-head section-head-compact" }, [
                _cache[53] || (_cache[53] = createBaseVNode("h4", null, "云同步状态", -1)),
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple",
                  onClick: refreshCloudSyncStatus
                }, "刷新状态")
              ]),
              _cache[58] || (_cache[58] = createBaseVNode("p", { class: "hint" }, "用于确认本机云同步上传/下载是否执行成功。", -1)),
              createBaseVNode("div", _hoisted_46, [
                createBaseVNode("article", _hoisted_47, [
                  _cache[54] || (_cache[54] = createBaseVNode("small", null, "服务状态", -1)),
                  createBaseVNode("strong", {
                    class: normalizeClass({ ok: cloudSyncRuntime.value.enabled, error: !cloudSyncRuntime.value.enabled })
                  }, toDisplayString(cloudSyncEnabledText.value), 3)
                ]),
                createBaseVNode("article", _hoisted_48, [
                  _cache[55] || (_cache[55] = createBaseVNode("small", null, "上次上传", -1)),
                  createBaseVNode("strong", {
                    class: normalizeClass({ ok: cloudSyncStatus.value?.lastUploadOk, error: cloudSyncStatus.value?.lastUploadAt && !cloudSyncStatus.value?.lastUploadOk })
                  }, toDisplayString(cloudSyncUploadStatusText.value), 3),
                  createBaseVNode("span", null, toDisplayString(formatStatusTime(cloudSyncStatus.value?.lastUploadAt)), 1)
                ]),
                createBaseVNode("article", _hoisted_49, [
                  _cache[56] || (_cache[56] = createBaseVNode("small", null, "上次下载", -1)),
                  createBaseVNode("strong", {
                    class: normalizeClass({ ok: cloudSyncStatus.value?.lastDownloadOk, error: cloudSyncStatus.value?.lastDownloadAt && !cloudSyncStatus.value?.lastDownloadOk })
                  }, toDisplayString(cloudSyncDownloadStatusText.value), 3),
                  createBaseVNode("span", null, toDisplayString(formatStatusTime(cloudSyncStatus.value?.lastDownloadAt)), 1)
                ]),
                createBaseVNode("article", _hoisted_50, [
                  _cache[57] || (_cache[57] = createBaseVNode("small", null, "最近更新", -1)),
                  createBaseVNode("strong", null, toDisplayString(cloudSyncStatusUpdatedAt.value || "—"), 1),
                  createBaseVNode("span", null, "学号：" + toDisplayString(cloudSyncStatus.value?.studentId || currentStudentId.value), 1)
                ])
              ]),
              cloudSyncLastUploadError.value ? (openBlock(), createElementBlock("p", _hoisted_51, "上传错误：" + toDisplayString(cloudSyncLastUploadError.value), 1)) : createCommentVNode("", true),
              cloudSyncLastDownloadError.value ? (openBlock(), createElementBlock("p", _hoisted_52, "下载错误：" + toDisplayString(cloudSyncLastDownloadError.value), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_53, [
              createBaseVNode("div", {
                class: normalizeClass(["toggle-row", {
                  active: localOnlyModeEnabled.value,
                  inactive: !localOnlyModeEnabled.value
                }])
              }, [
                _cache[60] || (_cache[60] = createBaseVNode("div", { class: "toggle-text" }, [
                  createBaseVNode("strong", null, "不使用远程配置（仅本地）"),
                  createBaseVNode("small", null, "开启后只应用本地设置，远程配置将不再覆盖 OCR/上传地址。")
                ], -1)),
                createBaseVNode("div", _hoisted_54, [
                  createBaseVNode("span", {
                    class: normalizeClass(["toggle-badge", {
                      active: localOnlyModeEnabled.value,
                      inactive: !localOnlyModeEnabled.value
                    }])
                  }, toDisplayString(localOnlyModeEnabled.value ? "仅本地" : "远程配置"), 3),
                  createBaseVNode("button", {
                    type: "button",
                    class: normalizeClass(["toggle-switch", { checked: localOnlyModeEnabled.value }]),
                    role: "switch",
                    "aria-checked": localOnlyModeEnabled.value,
                    onClick: handleRemoteModeChanged
                  }, [..._cache[59] || (_cache[59] = [
                    createBaseVNode("span", { class: "toggle-thumb" }, null, -1)
                  ])], 10, _hoisted_55)
                ])
              ], 2)
            ]),
            createBaseVNode("div", _hoisted_56, [
              _cache[65] || (_cache[65] = createBaseVNode("h4", null, "本地服务设置", -1)),
              _cache[66] || (_cache[66] = createBaseVNode("p", { class: "hint" }, "仅支持手动填写地址，不展示本地预设列表。", -1)),
              _cache[67] || (_cache[67] = createBaseVNode("p", { class: "hint" }, "修改后会自动保存到本地并自动应用到当前运行实例。", -1)),
              unref(appSettings).backend.useRemoteConfig ? (openBlock(), createElementBlock("p", _hoisted_57, " 当前启用远程配置，远程刷新后 OCR/上传/云同步中转地址可能被覆盖；若需固定使用本地地址，请开启“仅本地”。 ")) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_58, [
                createBaseVNode("label", _hoisted_59, [
                  _cache[61] || (_cache[61] = createBaseVNode("span", null, "OCR 服务器", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "text",
                    placeholder: "https://your-ocr.example/api/ocr/recognize",
                    "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => unref(appSettings).backend.ocrEndpoint = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).backend.ocrEndpoint,
                      void 0,
                      { trim: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_60, [
                  _cache[62] || (_cache[62] = createBaseVNode("span", null, "临时文件上传服务器", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "text",
                    placeholder: "https://your-upload.example/api/temp/upload",
                    "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => unref(appSettings).backend.tempUploadEndpoint = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).backend.tempUploadEndpoint,
                      void 0,
                      { trim: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_61, [
                  _cache[63] || (_cache[63] = createBaseVNode("span", null, "云同步中转地址", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "text",
                    placeholder: `默认：${unref(DEFAULT_CLOUD_SYNC_ENDPOINT)}`,
                    "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => unref(appSettings).backend.cloudSyncEndpoint = $event)
                  }, null, 8, _hoisted_62), [
                    [
                      vModelText,
                      unref(appSettings).backend.cloudSyncEndpoint,
                      void 0,
                      { trim: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_63, [
                  _cache[64] || (_cache[64] = createBaseVNode("span", null, "云同步秘钥引用（secret_ref）", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "text",
                    placeholder: "默认：kv1-main（仅引用，不是明文秘钥）",
                    "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => unref(appSettings).backend.cloudSyncSecretRef = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).backend.cloudSyncSecretRef,
                      void 0,
                      { trim: true }
                    ]
                  ])
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_64, [
              _cache[79] || (_cache[79] = createBaseVNode("h4", null, "模块参数", -1)),
              createBaseVNode("div", _hoisted_65, [
                createBaseVNode("label", _hoisted_66, [
                  _cache[68] || (_cache[68] = createBaseVNode("span", null, "电费查询重试次数", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "0",
                    max: "5",
                    "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => unref(appSettings).retry.electricity = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).retry.electricity,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_67, [
                  _cache[69] || (_cache[69] = createBaseVNode("span", null, "空教室查询重试次数", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "0",
                    max: "5",
                    "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => unref(appSettings).retry.classroom = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).retry.classroom,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_68, [
                  _cache[70] || (_cache[70] = createBaseVNode("span", null, "重试间隔（ms）", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "500",
                    max: "10000",
                    step: "100",
                    "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => unref(appSettings).retryDelayMs = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).retryDelayMs,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_69, [
                  _cache[71] || (_cache[71] = createBaseVNode("span", null, "通知检查请求超时（ms）", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "5000",
                    max: "60000",
                    step: "500",
                    "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => unref(appSettings).backend.moduleParams.requestTimeoutMs = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).backend.moduleParams.requestTimeoutMs,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_70, [
                  _cache[72] || (_cache[72] = createBaseVNode("span", null, "功能测速超时（ms）", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "3000",
                    max: "30000",
                    step: "500",
                    "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => unref(appSettings).backend.moduleParams.probeTimeoutMs = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).backend.moduleParams.probeTimeoutMs,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_71, [
                  _cache[73] || (_cache[73] = createBaseVNode("span", null, "云同步上传冷却（秒，至少120）", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "120",
                    max: "3600",
                    step: "10",
                    "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => unref(appSettings).backend.moduleParams.cloudSyncUploadCooldownSec = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).backend.moduleParams.cloudSyncUploadCooldownSec,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_72, [
                  _cache[74] || (_cache[74] = createBaseVNode("span", null, "云同步下载冷却（秒，至少10）", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "10",
                    max: "3600",
                    step: "5",
                    "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => unref(appSettings).backend.moduleParams.cloudSyncDownloadCooldownSec = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).backend.moduleParams.cloudSyncDownloadCooldownSec,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_73, [
                  _cache[75] || (_cache[75] = createBaseVNode("span", null, "移动端预览线程", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "1",
                    max: "8",
                    step: "1",
                    "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => unref(appSettings).resourceShare.previewThreadsMobile = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).resourceShare.previewThreadsMobile,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_74, [
                  _cache[76] || (_cache[76] = createBaseVNode("span", null, "桌面端预览线程", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "1",
                    max: "12",
                    step: "1",
                    "onUpdate:modelValue": _cache[29] || (_cache[29] = ($event) => unref(appSettings).resourceShare.previewThreadsDesktop = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).resourceShare.previewThreadsDesktop,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_75, [
                  _cache[77] || (_cache[77] = createBaseVNode("span", null, "移动端下载线程", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "1",
                    max: "8",
                    step: "1",
                    "onUpdate:modelValue": _cache[30] || (_cache[30] = ($event) => unref(appSettings).resourceShare.downloadThreadsMobile = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).resourceShare.downloadThreadsMobile,
                      void 0,
                      { number: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_76, [
                  _cache[78] || (_cache[78] = createBaseVNode("span", null, "桌面端下载线程", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "number",
                    min: "1",
                    max: "12",
                    step: "1",
                    "onUpdate:modelValue": _cache[31] || (_cache[31] = ($event) => unref(appSettings).resourceShare.downloadThreadsDesktop = $event)
                  }, null, 512), [
                    [
                      vModelText,
                      unref(appSettings).resourceShare.downloadThreadsDesktop,
                      void 0,
                      { number: true }
                    ]
                  ])
                ])
              ]),
              _cache[80] || (_cache[80] = createBaseVNode("p", { class: "hint" }, "并发越高速度通常越快，但会提高设备与网络占用。", -1))
            ]),
            createBaseVNode("div", _hoisted_77, [
              createBaseVNode("div", _hoisted_78, [
                _cache[81] || (_cache[81] = createBaseVNode("h4", null, "功能测试", -1)),
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple",
                  disabled: probeRunning.value,
                  onClick: handleRunConnectivityTest
                }, toDisplayString(probeRunning.value ? "测速中..." : "开始测速"), 9, _hoisted_79)
              ]),
              _cache[82] || (_cache[82] = createBaseVNode("p", { class: "hint" }, "并发测试当前 OCR、上传、云同步、新融合门户、教务系统、超星渠道、一卡通与图书馆地址。", -1)),
              createBaseVNode("div", _hoisted_80, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(probeRows.value, (item) => {
                  return openBlock(), createElementBlock("article", {
                    key: item.id,
                    class: "probe-item"
                  }, [
                    createBaseVNode("div", _hoisted_81, [
                      createBaseVNode("strong", null, toDisplayString(item.label), 1),
                      createBaseVNode("small", null, toDisplayString(item.desc), 1),
                      createBaseVNode("code", _hoisted_82, toDisplayString(item.url || "未设置地址"), 1)
                    ]),
                    createBaseVNode("span", {
                      class: normalizeClass(["probe-state", probeStateClass(item.id)])
                    }, toDisplayString(probeStateText(item.id)), 3)
                  ]);
                }), 128))
              ]),
              probeFinishedAt.value ? (openBlock(), createElementBlock("p", _hoisted_83, "最近测速：" + toDisplayString(probeFinishedAt.value), 1)) : createCommentVNode("", true)
            ])
          ])) : (openBlock(), createElementBlock("section", _hoisted_84, [
            createBaseVNode("div", { class: "section-head" }, [
              _cache[83] || (_cache[83] = createBaseVNode("h3", null, "调试日志", -1)),
              createBaseVNode("div", { class: "debug-head-actions" }, [
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple",
                  onClick: refreshDebugPanel
                }, "刷新"),
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple",
                  onClick: handleCopyDebugLogs
                }, "复制"),
                createBaseVNode("button", {
                  class: "mini-btn btn-ripple danger",
                  onClick: handleClearDebugPanel
                }, "清空")
              ])
            ]),
            createBaseVNode("div", _hoisted_85, [
              createBaseVNode("span", _hoisted_86, "总日志：" + toDisplayString(debugStats.value.total), 1),
              createBaseVNode("span", _hoisted_87, "告警：" + toDisplayString(debugStats.value.warns), 1),
              createBaseVNode("span", _hoisted_88, "错误：" + toDisplayString(debugStats.value.errors), 1)
            ]),
            createBaseVNode("div", _hoisted_89, [
              (openBlock(), createElementBlock(Fragment, null, renderList(debugLevelOptions, (option) => {
                return createBaseVNode("button", {
                  key: option.key,
                  class: normalizeClass(["debug-filter-btn btn-ripple", { active: debugFilter.value === option.key }]),
                  onClick: ($event) => debugFilter.value = option.key
                }, toDisplayString(option.label), 11, _hoisted_90);
              }), 64))
            ]),
            createBaseVNode("div", {
              ref_key: "debugPanelRef",
              ref: debugPanelRef,
              class: "debug-log-panel"
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(filteredDebugLogs.value, (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.id,
                  class: normalizeClass(["debug-log-item", `lvl-${item.level}`])
                }, [
                  createBaseVNode("header", _hoisted_91, [
                    createBaseVNode("span", _hoisted_92, toDisplayString(unref(formatDebugTime)(item.ts)), 1),
                    createBaseVNode("span", _hoisted_93, toDisplayString(String(item.level || "log").toUpperCase()), 1),
                    createBaseVNode("span", _hoisted_94, toDisplayString(item.scope), 1)
                  ]),
                  createBaseVNode("p", _hoisted_95, toDisplayString(item.message), 1)
                ], 2);
              }), 128)),
              !filteredDebugLogs.value.length ? (openBlock(), createElementBlock("p", _hoisted_96, "暂无日志，执行一次功能后会自动出现。")) : createCommentVNode("", true)
            ], 512)
          ])),
          showFontModal.value ? (openBlock(), createElementBlock("div", _hoisted_97, [
            createBaseVNode("div", _hoisted_98, [
              createBaseVNode("h3", null, toDisplayString(fontModalTitle.value), 1),
              createBaseVNode("p", null, toDisplayString(fontModalDescription.value), 1),
              createBaseVNode("div", _hoisted_99, [
                createBaseVNode("div", _hoisted_100, [
                  createBaseVNode("div", {
                    class: "progress-fill",
                    style: normalizeStyle({ width: `${fontDownloadProgress.value}%` })
                  }, null, 4)
                ]),
                fontDownloadStatus.value === "downloading" ? (openBlock(), createElementBlock("span", _hoisted_101, "下载中...")) : fontDownloadStatus.value === "success" ? (openBlock(), createElementBlock("span", _hoisted_102, "下载完成")) : fontDownloadStatus.value === "failed" ? (openBlock(), createElementBlock("span", _hoisted_103, "下载失败")) : (openBlock(), createElementBlock("span", _hoisted_104, "等待开始"))
              ]),
              fontDownloadStep.value ? (openBlock(), createElementBlock("p", _hoisted_105, toDisplayString(fontDownloadStep.value), 1)) : createCommentVNode("", true),
              fontDownloadError.value ? (openBlock(), createElementBlock("p", _hoisted_106, toDisplayString(fontDownloadError.value), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_107, [
                fontDownloadStatus.value === "failed" && fontModalRetryMode.value === "deyihei" ? (openBlock(), createElementBlock("button", {
                  key: 0,
                  class: "btn-secondary btn-ripple",
                  onClick: _cache[32] || (_cache[32] = ($event) => handleDownloadFont(true))
                }, " 重试下载 ")) : createCommentVNode("", true),
                fontDownloadStatus.value === "failed" && fontModalRetryMode.value === "prefetch" ? (openBlock(), createElementBlock("button", {
                  key: 1,
                  class: "btn-secondary btn-ripple",
                  onClick: _cache[33] || (_cache[33] = ($event) => handlePrefetchFonts(true))
                }, " 重试缓存 ")) : createCommentVNode("", true),
                createBaseVNode("button", {
                  class: "btn-primary btn-ripple",
                  onClick: _cache[34] || (_cache[34] = ($event) => showFontModal.value = false)
                }, "关闭")
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          themeTransitioning.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: normalizeClass(["theme-fullscreen-overlay", themeTransitionType.value])
          }, [
            createBaseVNode("div", _hoisted_108, [
              _cache[88] || (_cache[88] = createBaseVNode("div", { class: "theme-horizon" }, null, -1)),
              themeTransitionType.value === "to-light" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                _cache[84] || (_cache[84] = createBaseVNode("div", { class: "theme-sun-anim" }, [
                  createBaseVNode("div", { class: "sun-body" }, [
                    createBaseVNode("i", { class: "fas fa-sun" })
                  ]),
                  createBaseVNode("div", { class: "sun-rays" })
                ], -1)),
                _cache[85] || (_cache[85] = createBaseVNode("div", { class: "theme-moon-fall" }, [
                  createBaseVNode("div", {
                    class: "moon-body",
                    style: { "width": "56px", "height": "56px", "font-size": "24px" }
                  }, [
                    createBaseVNode("i", { class: "fas fa-moon" })
                  ])
                ], -1))
              ], 64)) : createCommentVNode("", true),
              themeTransitionType.value === "to-dark" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                createBaseVNode("div", _hoisted_109, [
                  _cache[86] || (_cache[86] = createBaseVNode("div", { class: "moon-body" }, [
                    createBaseVNode("i", { class: "fas fa-moon" })
                  ], -1)),
                  createBaseVNode("div", _hoisted_110, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(12, (i) => {
                      return createBaseVNode("span", {
                        key: i,
                        class: "m-star",
                        style: normalizeStyle({ "--delay": `${i * 0.08}s`, "--x": `${Math.random() * 100}%`, "--y": `${Math.random() * 60}%` })
                      }, null, 4);
                    }), 64))
                  ])
                ]),
                _cache[87] || (_cache[87] = createBaseVNode("div", { class: "theme-sun-fall" }, [
                  createBaseVNode("div", {
                    class: "sun-body",
                    style: { "width": "56px", "height": "56px", "font-size": "24px" }
                  }, [
                    createBaseVNode("i", { class: "fas fa-sun" })
                  ])
                ], -1))
              ], 64)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_111, toDisplayString(themeTransitionType.value === "to-dark" ? "夜间模式" : "白天模式"), 1)
            ])
          ], 2)) : createCommentVNode("", true)
        ]))
      ], 64);
    };
  }
};
const SettingsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-28236a16"]]);
export {
  SettingsView as default
};
