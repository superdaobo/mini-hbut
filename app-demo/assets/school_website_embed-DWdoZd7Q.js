const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-apFQ0nCw.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { b as isTauriRuntime, e as isLikelyAndroidUserAgent, _ as __vitePreload, d as detectRuntime, J as isTauriDesktopRuntime, K as isLikelyIOSUserAgent } from "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./vue-core-DdLVj9yW.js";
const SCHOOL_WEBSITE_URL = "https://www.hbut.edu.cn/";
const LOCAL_BRIDGE_BASE = detectRuntime() === "tauri" ? "http://127.0.0.1:4399" : "/bridge";
const SCHOOL_WEBSITE_PROXY_URL = `${LOCAL_BRIDGE_BASE}/school-website/`;
const resolveSchoolWebsiteIframeUrl = (mode) => mode === "proxy-iframe" ? SCHOOL_WEBSITE_PROXY_URL : SCHOOL_WEBSITE_URL;
const canUseTauriEmbeddedWebview = () => isTauriDesktopRuntime();
const probeSchoolWebsiteProxyReachable = async () => {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    const healthUrl = LOCAL_BRIDGE_BASE.replace(/\/$/, "") + "/health";
    try {
      const health = await fetch(healthUrl, { method: "GET", signal: controller.signal });
      if (health.ok) {
        window.clearTimeout(timer);
        return true;
      }
    } catch {
    }
    const response = await fetch(SCHOOL_WEBSITE_PROXY_URL, {
      method: "HEAD",
      signal: controller.signal
    });
    window.clearTimeout(timer);
    return response.ok || response.status === 405 || response.status === 404;
  } catch {
    return false;
  }
};
const invokeEnsureHttpBridge = async () => {
  if (!isTauriRuntime()) return null;
  if (isLikelyAndroidUserAgent()) {
    return { enabled: false, healthy: false, respawned: false, status: "disabled" };
  }
  try {
    const result = await invokeNative("ensure_http_bridge");
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
};
const recoverSchoolWebsiteBridgeOnResume = async () => {
  if (!isTauriRuntime()) return false;
  if (isLikelyAndroidUserAgent()) return false;
  const ensured = await invokeEnsureHttpBridge();
  if (ensured?.healthy === true) return true;
  if (ensured?.enabled === false) return false;
  return probeSchoolWebsiteProxyReachable();
};
const resolveSchoolWebsiteEmbedMode = async () => {
  if (canUseTauriEmbeddedWebview()) return "tauri-webview";
  if (isTauriRuntime() && isLikelyAndroidUserAgent()) {
    return "external-open";
  }
  if (isTauriRuntime() && isLikelyIOSUserAgent()) {
    if (await probeSchoolWebsiteProxyReachable()) return "proxy-iframe";
    return "external-open";
  }
  if (await probeSchoolWebsiteProxyReachable()) return "proxy-iframe";
  return "direct-iframe";
};
const waitForLayout = async () => {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
};
const measureSchoolWebsiteEmbedBounds = async (container) => {
  await waitForLayout();
  const rect = container.getBoundingClientRect();
  let top = Math.max(0, Math.round(rect.top));
  let left = Math.max(0, Math.round(rect.left));
  let width = Math.max(1, Math.round(rect.width));
  let height = Math.max(1, Math.round(rect.height));
  if (canUseTauriEmbeddedWebview()) {
    try {
      const { getCurrentWindow } = await __vitePreload(async () => {
        const { getCurrentWindow: getCurrentWindow2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.U);
        return { getCurrentWindow: getCurrentWindow2 };
      }, true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
      const win = getCurrentWindow();
      const scaleFactor = await win.scaleFactor();
      const innerSize = await win.innerSize();
      const innerLogical = innerSize.toLogical(scaleFactor);
      const bottomPadding = 12;
      if (top <= 0 && container.parentElement) {
        const parentRect = container.parentElement.getBoundingClientRect();
        top = Math.max(0, Math.round(parentRect.top + (rect.top - parentRect.top)));
      }
      if (width < 8) {
        width = Math.max(1, Math.round(innerLogical.width - left * 2));
      }
      if (height < 8) {
        height = Math.max(1, Math.round(innerLogical.height - top - bottomPadding));
      }
    } catch {
    }
  }
  return { x: left, y: top, width, height };
};
let schoolWebsiteEmbedSuppressed = false;
const isSchoolWebsiteEmbedSuppressed = () => schoolWebsiteEmbedSuppressed;
const suppressSchoolWebsiteEmbed = () => {
  schoolWebsiteEmbedSuppressed = true;
};
const allowSchoolWebsiteEmbed = () => {
  schoolWebsiteEmbedSuppressed = false;
};
const forceCloseSchoolWebsiteEmbed = async () => {
  suppressSchoolWebsiteEmbed();
  if (!isTauriRuntime()) return;
  try {
    const { pushDebugLog } = await __vitePreload(async () => {
      const { pushDebugLog: pushDebugLog2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.O);
      return { pushDebugLog: pushDebugLog2 };
    }, true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
    pushDebugLog("SchoolWebsite", "forceClose school_website_embed_close", "info");
  } catch {
  }
  try {
    await invokeNative("school_website_embed_close");
  } catch {
  }
  try {
    await invokeNative("school_website_embed_close");
  } catch {
  }
};
const invokeNative = async (command, args) => {
  const core = await __vitePreload(() => import("./runtime-bridge-apFQ0nCw.js").then((n) => n.R), true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
  if (typeof args === "undefined") return core.invoke(command);
  return core.invoke(command, args);
};
const syncNativeEmbedBounds = async (container) => {
  if (schoolWebsiteEmbedSuppressed) return;
  if (!container.isConnected) return;
  const bounds = await measureSchoolWebsiteEmbedBounds(container);
  if (schoolWebsiteEmbedSuppressed) return;
  if (bounds.width < 8 || bounds.height < 8) return;
  await invokeNative("school_website_embed_resize", { bounds });
};
const mountSchoolWebsiteEmbed = async ({
  container,
  onReady,
  onError
}) => {
  const mode = await resolveSchoolWebsiteEmbedMode();
  if (mode !== "tauri-webview") {
    onReady?.();
    return {
      mode,
      cleanup: async () => {
      }
    };
  }
  allowSchoolWebsiteEmbed();
  let closed = false;
  try {
    const bounds = await measureSchoolWebsiteEmbedBounds(container);
    if (closed || schoolWebsiteEmbedSuppressed) {
      return { mode, cleanup: async () => {
      } };
    }
    await invokeNative("school_website_embed_open", { bounds });
    if (schoolWebsiteEmbedSuppressed) {
      try {
        await invokeNative("school_website_embed_close");
      } catch {
      }
      return {
        mode,
        cleanup: async () => {
          closed = true;
        }
      };
    }
    const resizeObserver = new ResizeObserver(() => {
      if (closed) return;
      if (!container.isConnected) return;
      const r = container.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      void syncNativeEmbedBounds(container).catch(() => {
      });
    });
    resizeObserver.observe(container);
    if (container.parentElement) {
      resizeObserver.observe(container.parentElement);
    }
    const handleWindowResize = () => {
      if (closed || !container.isConnected) return;
      void syncNativeEmbedBounds(container).catch(() => {
      });
    };
    window.addEventListener("resize", handleWindowResize);
    const layoutTimer = window.setInterval(() => {
      if (closed || !container.isConnected) return;
      void syncNativeEmbedBounds(container).catch(() => {
      });
    }, 300);
    window.setTimeout(() => {
      window.clearInterval(layoutTimer);
    }, 1800);
    onReady?.();
    return {
      mode,
      cleanup: async () => {
        if (closed) return;
        closed = true;
        suppressSchoolWebsiteEmbed();
        window.clearInterval(layoutTimer);
        resizeObserver.disconnect();
        window.removeEventListener("resize", handleWindowResize);
        try {
          await invokeNative("school_website_embed_close");
        } catch {
        }
        try {
          await invokeNative("school_website_embed_close");
        } catch {
        }
      }
    };
  } catch (error) {
    closed = true;
    suppressSchoolWebsiteEmbed();
    try {
      await invokeNative("school_website_embed_close");
    } catch {
    }
    const message = error instanceof Error ? error.message : "创建学校官网内嵌视图失败";
    onError?.(message);
    throw error;
  }
};
export {
  SCHOOL_WEBSITE_PROXY_URL,
  SCHOOL_WEBSITE_URL,
  allowSchoolWebsiteEmbed,
  forceCloseSchoolWebsiteEmbed,
  invokeEnsureHttpBridge,
  isSchoolWebsiteEmbedSuppressed,
  measureSchoolWebsiteEmbedBounds,
  mountSchoolWebsiteEmbed,
  probeSchoolWebsiteProxyReachable,
  recoverSchoolWebsiteBridgeOnResume,
  resolveSchoolWebsiteEmbedMode,
  resolveSchoolWebsiteIframeUrl,
  suppressSchoolWebsiteEmbed
};
