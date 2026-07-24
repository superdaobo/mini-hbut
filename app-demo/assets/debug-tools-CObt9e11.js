const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-apFQ0nCw.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { p as pushDebugLog, b as isTauriRuntime, _ as __vitePreload, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { c as captureElementToBlob, b as blobToDataUrl } from "./capture-DZL0crXj.js";
const NIGHT_MODE_STORAGE_KEY = "hbu_dark_mode";
const NIGHT_MODE_CHANGED_EVENT = "hbu-night-mode-changed";
const dispatchNightModeChanged = (enabled) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NIGHT_MODE_CHANGED_EVENT, { detail: { enabled } }));
};
const applyNightModePreference = (enabled) => {
  if (typeof document === "undefined") return enabled;
  if (enabled) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  try {
    localStorage.setItem(NIGHT_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
  }
  dispatchNightModeChanged(enabled);
  return enabled;
};
const initNightModeClass = () => {
  if (typeof document === "undefined") return false;
  const classList = document.documentElement.classList;
  try {
    const stored = localStorage.getItem(NIGHT_MODE_STORAGE_KEY);
    if (stored === "1") return applyNightModePreference(true);
    if (stored === "0") return applyNightModePreference(false);
  } catch {
  }
  return typeof classList.contains === "function" ? classList.contains("dark") : false;
};
const isNightModeEnabled = () => {
  if (typeof document === "undefined") return false;
  const classList = document.documentElement.classList;
  return typeof classList.contains === "function" ? classList.contains("dark") : false;
};
const GLOBAL_KEY = "__HBU_BOOT_METRICS__";
const nowMs = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};
const ensureState = () => {
  if (typeof window === "undefined") {
    return {
      boot_id: "server",
      started_at: Date.now(),
      started_perf: nowMs(),
      marks: {}
    };
  }
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = {
      boot_id: `boot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      started_at: Date.now(),
      started_perf: nowMs(),
      marks: {}
    };
  }
  return window[GLOBAL_KEY];
};
const resetBootMetrics = (context = {}) => {
  if (typeof window !== "undefined") {
    window[GLOBAL_KEY] = {
      boot_id: `boot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      started_at: Date.now(),
      started_perf: nowMs(),
      marks: {}
    };
  }
  const state = ensureState();
  markBootMetric("app_boot_start", context, { overwrite: true, level: "info" });
  return state;
};
const hasBootMetric = (name) => {
  const state = ensureState();
  return !!state.marks?.[String(name || "").trim()];
};
const getBootMetricsSnapshot = () => {
  const state = ensureState();
  return {
    boot_id: state.boot_id,
    started_at: state.started_at,
    marks: { ...state.marks || {} }
  };
};
const markBootMetric = (name, detail = {}, options = {}) => {
  const metricName = String(name || "").trim();
  if (!metricName) return null;
  const state = ensureState();
  if (state.marks[metricName] && options?.overwrite !== true) {
    return state.marks[metricName];
  }
  const mark = {
    name: metricName,
    at: Date.now(),
    elapsed_ms: Math.max(0, Number((nowMs() - state.started_perf).toFixed(1)) || 0),
    detail: detail && typeof detail === "object" ? detail : {}
  };
  state.marks[metricName] = mark;
  pushDebugLog(
    "Boot",
    `${metricName} +${mark.elapsed_ms}ms`,
    options?.level || "info",
    {
      boot_id: state.boot_id,
      ...mark.detail
    }
  );
  return mark;
};
const SCREENSHOT_EVENT_NAME = "hbu-debug-screenshot-request";
const OPEN_MODULE_EVENT_NAME = "hbu-debug-open-module-request";
const NAVIGATE_EVENT_NAME = "hbu-debug-navigate-request";
const RESET_MORE_MODULES_EVENT_NAME = "hbu-debug-reset-more-modules-request";
const STATE_EVENT_NAME = "hbu-debug-state-request";
const MODULE_HOST_SESSION_KEY = "hbu_more_module_host_session";
const MODULE_CDN_OVERRIDE_STORAGE_KEY = "hbu_debug_module_cdn_base";
const MORE_MODULE_STORAGE_KEYS = [
  MODULE_HOST_SESSION_KEY,
  "hbu_more_module_state_v1",
  "hbu_more_module_catalog_cache_v1",
  "hbu_more_module_manifest_cache_v1",
  "hbu_more_module_remote_source_rotation_v1",
  "hbu_module_channel"
];
let initialized = false;
let unlistenScreenshot = null;
let unlistenOpenModule = null;
let unlistenNavigate = null;
let unlistenResetMoreModules = null;
let unlistenState = null;
const resolveDebugHash = (sid, view) => {
  const normalizedSid = String(sid || "").trim();
  const normalizedView = String(view || "").trim() || "home";
  if (!/^\d{10}$/.test(normalizedSid)) return "#/";
  if (normalizedView === "home") return `#/${normalizedSid}`;
  return `#/${normalizedSid}/${normalizedView}`;
};
const completeScreenshot = async (payload) => {
  await invokeNative("complete_debug_screenshot", { payload });
};
const completeOpenModule = async (payload) => {
  await invokeNative("complete_debug_open_module", { payload });
};
const completeResetMoreModules = async (payload) => {
  await invokeNative("complete_debug_reset_more_modules", { payload });
};
const completeState = async (payload) => {
  await invokeNative("complete_debug_state", { payload });
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitForNextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const resolveDebugScreenshotBackgroundColor = (payload) => {
  const value = payload?.backgroundColor ?? payload?.background_color ?? null;
  const normalized = String(value ?? "").trim();
  return normalized || null;
};
const collectDebugScrollAncestors = () => {
  const entries = [];
  let current = document.querySelector(".more-module-host-view");
  while (current instanceof HTMLElement && entries.length < 8) {
    const style = window.getComputedStyle(current);
    entries.push({
      tag: current.tagName.toLowerCase(),
      className: current.className || "",
      overflowY: style.overflowY || "",
      clientHeight: Number(current.clientHeight || 0),
      scrollHeight: Number(current.scrollHeight || 0),
      scrollTop: Number(current.scrollTop || 0)
    });
    current = current.parentElement;
  }
  const scrollingElement = document.scrollingElement;
  if (scrollingElement instanceof HTMLElement) {
    entries.push({
      tag: scrollingElement.tagName.toLowerCase(),
      className: scrollingElement.className || "",
      overflowY: window.getComputedStyle(scrollingElement).overflowY || "",
      clientHeight: Number(scrollingElement.clientHeight || 0),
      scrollHeight: Number(scrollingElement.scrollHeight || 0),
      scrollTop: Number(scrollingElement.scrollTop || 0),
      kind: "document.scrollingElement"
    });
  }
  return entries;
};
const resolveDebugScrollContainer = () => {
  let current = document.querySelector(".more-module-host-view");
  while (current instanceof HTMLElement) {
    if (current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }
  const scrollingElement = document.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : null;
};
const readStoredModuleHostSession = () => {
  try {
    const raw = localStorage.getItem(MODULE_HOST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};
const resolveInjectedModuleHostSession = (value) => {
  if (!value || typeof value !== "object") return null;
  const session = value;
  const moduleId = String(session.module_id || session.moduleId || "").trim();
  const previewUrl = String(session.preview_url || session.previewUrl || "").trim();
  const version = String(session.version || "").trim();
  if (!moduleId && !previewUrl && !version) return null;
  return session;
};
const applyDebugScrollInstruction = async (instruction) => {
  if (instruction === null || instruction === void 0 || instruction === "") return;
  const scrollContainer = resolveDebugScrollContainer();
  const normalizedText = String(instruction).trim().toLowerCase();
  if (normalizedText === "top") {
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    await waitForNextPaint();
    return;
  }
  if (normalizedText === "bottom") {
    const targetTop = scrollContainer ? Math.max(0, Number(scrollContainer.scrollHeight || 0) - Number(scrollContainer.clientHeight || 0)) : Math.max(
      0,
      Number(document.documentElement?.scrollHeight || 0) - Number(window.innerHeight || 0)
    );
    if (scrollContainer) {
      scrollContainer.scrollTop = targetTop;
    } else {
      window.scrollTo({ top: targetTop, behavior: "instant" });
    }
    await waitForNextPaint();
    return;
  }
  const numeric = Number(instruction);
  if (Number.isFinite(numeric)) {
    if (scrollContainer) {
      scrollContainer.scrollTop = Math.max(0, numeric);
    } else {
      window.scrollTo({ top: Math.max(0, numeric), behavior: "instant" });
    }
    await waitForNextPaint();
  }
};
const applyDebugNightModeInstruction = async (value) => {
  if (value === null || value === void 0 || value === "") return;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "dark", "night", "on", "yes"].includes(normalized)) {
    applyNightModePreference(true);
    await waitForNextPaint();
    return;
  }
  if (["0", "false", "light", "day", "off", "no"].includes(normalized)) {
    applyNightModePreference(false);
    await waitForNextPaint();
  }
};
const readElementRect = (element) => {
  if (!(element instanceof Element)) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: Number(rect.x || 0),
    y: Number(rect.y || 0),
    top: Number(rect.top || 0),
    left: Number(rect.left || 0),
    right: Number(rect.right || 0),
    bottom: Number(rect.bottom || 0),
    width: Number(rect.width || 0),
    height: Number(rect.height || 0)
  };
};
const readModuleHostLayoutState = () => {
  const root = document.querySelector(".more-module-host-view");
  const body = document.querySelector(".more-module-host-view__body");
  const shell = document.querySelector(".module-frame-shell");
  const frame = document.querySelector(".module-frame");
  const rootEl = root instanceof HTMLElement ? root : null;
  const bodyEl = body instanceof HTMLElement ? body : null;
  const shellEl = shell instanceof HTMLElement ? shell : null;
  const frameEl = frame instanceof HTMLIFrameElement ? frame : null;
  if (!rootEl && !shellEl && !frameEl) return null;
  return {
    windowInnerWidth: Number(window.innerWidth || 0),
    windowInnerHeight: Number(window.innerHeight || 0),
    windowScrollY: Number(window.scrollY || 0),
    documentClientHeight: Number(document.documentElement?.clientHeight || 0),
    documentScrollHeight: Number(document.documentElement?.scrollHeight || 0),
    bodyClientHeight: Number(document.body?.clientHeight || 0),
    bodyScrollHeight: Number(document.body?.scrollHeight || 0),
    rootRect: readElementRect(rootEl),
    rootClientHeight: Number(rootEl?.clientHeight || 0),
    rootScrollHeight: Number(rootEl?.scrollHeight || 0),
    rootScrollTop: Number(rootEl?.scrollTop || 0),
    bodyRect: readElementRect(bodyEl),
    bodyClientHeightInner: Number(bodyEl?.clientHeight || 0),
    bodyScrollHeightInner: Number(bodyEl?.scrollHeight || 0),
    shellRect: readElementRect(shellEl),
    shellClientHeight: Number(shellEl?.clientHeight || 0),
    shellScrollHeight: Number(shellEl?.scrollHeight || 0),
    shellStyleHeight: shellEl?.style?.height || "",
    frameRect: readElementRect(frameEl),
    frameClientHeight: Number(frameEl?.clientHeight || 0),
    frameOffsetHeight: Number(frameEl?.offsetHeight || 0),
    frameStyleHeight: frameEl?.style?.height || "",
    frameSrc: frameEl?.src || "",
    scrollAncestors: collectDebugScrollAncestors()
  };
};
const initDebugBridgeClient = async () => {
  if (initialized || !isTauriRuntime()) return;
  const eventApi = await __vitePreload(() => import("./runtime-bridge-apFQ0nCw.js").then((n) => n.S), true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
  unlistenScreenshot = await eventApi.listen(SCREENSHOT_EVENT_NAME, async (event) => {
    const payload = event?.payload || {};
    const requestId = String(payload.requestId || "");
    const format = String(payload.format || "png").toLowerCase() === "webp" ? "webp" : "png";
    const returnMode = String(payload.return || payload.returnMode || "path").toLowerCase();
    pushDebugLog("DebugBridge", `收到截图请求：${requestId || "unknown"}`, "debug", payload);
    if (!requestId) {
      return;
    }
    try {
      const viewportHeight = Math.max(
        window.innerHeight || 0,
        document.documentElement?.clientHeight || 0,
        900
      );
      const captured = await captureElementToBlob({
        selector: payload.selector || null,
        format,
        backgroundColor: resolveDebugScreenshotBackgroundColor(payload),
        maxHeight: viewportHeight + 120,
        scale: 1.5
      });
      const dataUrl = await blobToDataUrl(captured.blob);
      const base64 = dataUrl.split(",")[1] || "";
      const saved = await invokeNative("save_debug_capture_file", {
        req: {
          filename: payload.filename || "",
          mimeType: captured.mime,
          contentBase64: base64
        }
      });
      await completeScreenshot({
        requestId,
        success: true,
        savedPath: saved?.path || "",
        mime: captured.mime,
        width: captured.width,
        height: captured.height,
        base64: returnMode === "base64" || returnMode === "both" ? base64 : null
      });
      pushDebugLog("DebugBridge", `截图完成：${requestId}`, "info", {
        path: saved?.path,
        width: captured.width,
        height: captured.height
      });
    } catch (error) {
      await completeScreenshot({
        requestId,
        success: false,
        error: error?.message || String(error || "截图失败")
      }).catch(() => {
      });
      pushDebugLog("DebugBridge", `截图失败：${requestId}`, "error", error);
    }
  });
  unlistenOpenModule = await eventApi.listen(OPEN_MODULE_EVENT_NAME, async (event) => {
    const payload = event?.payload || {};
    const requestId = String(payload.requestId || "");
    const moduleId = String(payload.moduleId || payload.module_id || "").trim();
    const requestedStudentId = String(
      payload.studentId || payload.student_id || localStorage.getItem("hbu_username") || ""
    ).trim();
    if (!requestId) return;
    try {
      if (!moduleId) {
        throw new Error("模块 ID 不能为空");
      }
      const targetHash = resolveDebugHash(requestedStudentId, "more");
      if (targetHash && targetHash !== "#/" && window.location.hash !== targetHash) {
        window.location.hash = targetHash;
        await sleep(260);
      } else if (targetHash && targetHash !== "#/") {
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      await waitForNextPaint();
      const startedAt = Date.now();
      const selector = `[data-module-id="${moduleId.replace(/"/g, '\\"')}"]`;
      let targetButton = null;
      while (Date.now() - startedAt < 8e3) {
        const matched = document.querySelector(selector);
        if (matched instanceof HTMLElement && !matched.hasAttribute("disabled")) {
          targetButton = matched;
          break;
        }
        await sleep(120);
      }
      if (!(targetButton instanceof HTMLElement)) {
        throw new Error(`未找到模块按钮：${moduleId}`);
      }
      targetButton.click();
      await completeOpenModule({
        requestId,
        success: true
      });
      pushDebugLog("DebugBridge", `模块点击完成：${moduleId}`, "info");
    } catch (error) {
      await completeOpenModule({
        requestId,
        success: false,
        error: error?.message || String(error || "模块点击失败")
      }).catch(() => {
      });
      pushDebugLog("DebugBridge", `模块点击失败：${moduleId || requestId}`, "error", error);
    }
  });
  unlistenResetMoreModules = await eventApi.listen(RESET_MORE_MODULES_EVENT_NAME, async (event) => {
    const payload = event?.payload || {};
    const requestId = String(payload.requestId || "");
    if (!requestId) return;
    try {
      const sid = String(localStorage.getItem("hbu_username") || "").trim();
      const moreHash = resolveDebugHash(sid, "more");
      if (sid && typeof window.location.hash === "string" && window.location.hash.includes("/more_module_host") && moreHash && moreHash !== "#/") {
        window.location.hash = moreHash;
        await sleep(260);
      }
      for (const key of MORE_MODULE_STORAGE_KEYS) {
        try {
          localStorage.removeItem(key);
        } catch {
        }
        try {
          sessionStorage.removeItem(key);
        } catch {
        }
      }
      const cdnBaseOverride = String(payload.cdnBaseOverride || payload.cdn_base_override || "").trim();
      if (cdnBaseOverride) {
        localStorage.setItem(MODULE_CDN_OVERRIDE_STORAGE_KEY, cdnBaseOverride);
      } else {
        localStorage.removeItem(MODULE_CDN_OVERRIDE_STORAGE_KEY);
      }
      await waitForNextPaint();
      await completeResetMoreModules({
        requestId,
        success: true
      });
      pushDebugLog("DebugBridge", "模块缓存状态已清空", "info", {
        clearedKeys: MORE_MODULE_STORAGE_KEYS,
        cdnBaseOverride
      });
    } catch (error) {
      await completeResetMoreModules({
        requestId,
        success: false,
        error: error?.message || String(error || "模块缓存状态清空失败")
      }).catch(() => {
      });
      pushDebugLog("DebugBridge", "模块缓存状态清空失败", "error", error);
    }
  });
  unlistenNavigate = await eventApi.listen(NAVIGATE_EVENT_NAME, async (event) => {
    const payload = event?.payload || {};
    const navigatePayload = payload.payload && typeof payload.payload === "object" ? payload.payload : null;
    const view = String(payload.view || payload.module || "").trim() || "home";
    const sid = String(
      payload.studentId || payload.student_id || localStorage.getItem("hbu_username") || ""
    ).trim();
    const targetHash = resolveDebugHash(sid, view);
    if (!targetHash || targetHash === "#/") {
      pushDebugLog("DebugBridge", `导航请求忽略：缺少有效学号（view=${view}）`, "warn", payload);
      return;
    }
    const injectedModuleHostSession = view === "more_module_host" ? resolveInjectedModuleHostSession(navigatePayload) : null;
    if (injectedModuleHostSession) {
      try {
        localStorage.setItem(MODULE_HOST_SESSION_KEY, JSON.stringify(injectedModuleHostSession));
      } catch {
      }
    }
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    } else {
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    await waitForNextPaint();
    await applyDebugNightModeInstruction(
      payload.nightMode ?? payload.night_mode ?? payload.darkMode ?? payload.dark_mode ?? navigatePayload?.nightMode ?? navigatePayload?.night_mode ?? navigatePayload?.darkMode ?? navigatePayload?.dark_mode
    );
    await applyDebugScrollInstruction(
      payload.scrollTo ?? payload.scroll_to ?? navigatePayload?.scrollTo ?? navigatePayload?.scroll_to
    );
    pushDebugLog("DebugBridge", `导航完成：${targetHash}`, "info", payload);
  });
  unlistenState = await eventApi.listen(STATE_EVENT_NAME, async (event) => {
    const payload = event?.payload || {};
    const requestId = String(payload.requestId || "");
    if (!requestId) return;
    try {
      await completeState({
        requestId,
        success: true,
        state: {
          hash: window.location.hash || "",
          href: window.location.href || "",
          title: document.title || "",
          capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
          bootMetrics: getBootMetricsSnapshot(),
          moduleHostSession: readStoredModuleHostSession(),
          moduleHostLayout: readModuleHostLayoutState()
        }
      });
    } catch (error) {
      await completeState({
        requestId,
        success: false,
        error: error?.message || String(error || "状态读取失败")
      }).catch(() => {
      });
      pushDebugLog("DebugBridge", `状态读取失败：${requestId}`, "error", error);
    }
  });
  await invokeNative("set_debug_bridge_ready", { ready: true }).catch((error) => {
    pushDebugLog("DebugBridge", "设置截图桥接就绪状态失败", "warn", error);
  });
  window.addEventListener("beforeunload", () => {
    void invokeNative("set_debug_bridge_ready", { ready: false }).catch(() => {
    });
    if (typeof unlistenScreenshot === "function") {
      unlistenScreenshot();
      unlistenScreenshot = null;
    }
    if (typeof unlistenOpenModule === "function") {
      unlistenOpenModule();
      unlistenOpenModule = null;
    }
    if (typeof unlistenNavigate === "function") {
      unlistenNavigate();
      unlistenNavigate = null;
    }
    if (typeof unlistenResetMoreModules === "function") {
      unlistenResetMoreModules();
      unlistenResetMoreModules = null;
    }
    if (typeof unlistenState === "function") {
      unlistenState();
      unlistenState = null;
    }
    initialized = false;
  });
  initialized = true;
  pushDebugLog("DebugBridge", "调试桥接客户端已初始化", "info");
};
const debug_bridge = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  initDebugBridgeClient,
  resolveDebugScreenshotBackgroundColor
}, Symbol.toStringTag, { value: "Module" }));
export {
  NIGHT_MODE_CHANGED_EVENT as N,
  initNightModeClass as a,
  applyNightModePreference as b,
  debug_bridge as d,
  hasBootMetric as h,
  isNightModeEnabled as i,
  markBootMetric as m,
  resetBootMetrics as r
};
