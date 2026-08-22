import { _ as _export_sfc, T as fetchRemoteConfig, o as openExternal } from "./app-demo-Bca6_3ab.js";
import { q as detectRuntime, a as isTauriRuntime, i as isTestAccountSession, d as invokeNative } from "./runtime-bridge-BU9jeOXP.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-EUTLkGHa.js";
import { a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, F as Fragment, g as renderList, n as normalizeClass, t as toDisplayString, d as createCommentVNode, w as withModifiers, r as ref, o as onMounted, l as onBeforeUnmount, v as watch, Y as markRaw, Z as shallowRef, C as nextTick, h as computed } from "./vue-core-DWoFi2CM.js";
import "./more-modules-CfNfahoc.js";
import "./debug-tools-BgYILSb8.js";
import "./capture-D-zd0oUS.js";
const scriptLoaders = /* @__PURE__ */ new Map();
const moduleLoaders = /* @__PURE__ */ new Map();
const styleLoaders = /* @__PURE__ */ new Map();
const CDN_CACHE_NAME = "hbut-cdn-runtime-v2";
const normalizeUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  return urls.map((item) => String(item || "").trim()).filter(Boolean);
};
const withTimeout = (promise, timeoutMs = 15e3) => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => {
    reject(new Error("CDN load timeout"));
  }, timeoutMs);
  promise.then((value) => {
    window.clearTimeout(timer);
    resolve(value);
  }).catch((error) => {
    window.clearTimeout(timer);
    reject(error);
  });
});
const hasCacheStorage = () => typeof window !== "undefined" && typeof window.caches !== "undefined";
const openCdnCache = async () => {
  if (!hasCacheStorage()) return null;
  try {
    return await window.caches.open(CDN_CACHE_NAME);
  } catch {
    return null;
  }
};
const fetchTextByUrl = async (url, timeoutMs = 15e3) => {
  const response = await withTimeout(
    fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store"
    }),
    timeoutMs
  );
  if (!response.ok) {
    throw new Error(`fetch failed(${response.status}): ${url}`);
  }
  const cache = await openCdnCache();
  if (cache) {
    try {
      await cache.put(url, response.clone());
    } catch {
    }
  }
  return response.text();
};
const readCachedTextByUrl = async (url) => {
  const cache = await openCdnCache();
  if (!cache) return "";
  try {
    const response = await cache.match(url);
    if (!response || !response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
};
const loadScriptByUrl = (url) => new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.src = url;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.onload = () => resolve(url);
  script.onerror = () => reject(new Error(`load script failed: ${url}`));
  document.head.appendChild(script);
});
const loadScriptByText = (code, sourceUrl = "") => new Promise((resolve, reject) => {
  try {
    const blob = new Blob([`${code}
//# sourceURL=${sourceUrl || "hbut-cdn-runtime.js"}`], {
      type: "text/javascript"
    });
    const blobUrl = URL.createObjectURL(blob);
    withTimeout(loadScriptByUrl(blobUrl), 15e3).then(() => {
      URL.revokeObjectURL(blobUrl);
      resolve(sourceUrl || blobUrl);
    }).catch((error) => {
      URL.revokeObjectURL(blobUrl);
      reject(error);
    });
  } catch (error) {
    reject(error);
  }
});
const loadScriptFromCdn = async ({
  cacheKey,
  urls,
  timeoutMs = 15e3,
  resolveGlobal
} = {}) => {
  const key = String(cacheKey || "");
  const list = normalizeUrls(urls);
  if (!key || !list.length) {
    throw new Error("CDN script config invalid");
  }
  const pickGlobal = typeof resolveGlobal === "function" ? resolveGlobal : () => null;
  const existed = pickGlobal();
  if (existed) return existed;
  const pending = scriptLoaders.get(key);
  if (pending) return pending;
  const task = (async () => {
    let lastError = null;
    for (const url of list) {
      try {
        const cached = await readCachedTextByUrl(url);
        if (!cached) continue;
        await loadScriptByText(cached, url);
        const loaded = pickGlobal();
        if (loaded) return loaded;
      } catch (error) {
        lastError = error;
      }
    }
    for (const url of list) {
      try {
        const code = await fetchTextByUrl(url, timeoutMs);
        await loadScriptByText(code, url);
        const loaded = pickGlobal();
        if (loaded) return loaded;
      } catch (error) {
        lastError = error;
      }
    }
    for (const url of list) {
      try {
        await withTimeout(loadScriptByUrl(url), timeoutMs);
        const loaded = pickGlobal();
        if (loaded) return loaded;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`CDN script load failed: ${key}`);
  })();
  scriptLoaders.set(key, task);
  try {
    return await task;
  } finally {
    if (!pickGlobal()) {
      scriptLoaders.delete(key);
    }
  }
};
const importByUrl = async (url) => import(
  /* @vite-ignore */
  url
);
const importModuleFromCdn = async ({
  cacheKey,
  urls,
  timeoutMs = 15e3
} = {}) => {
  const key = String(cacheKey || "");
  const list = normalizeUrls(urls);
  if (!key || !list.length) {
    throw new Error("CDN module config invalid");
  }
  const pending = moduleLoaders.get(key);
  if (pending) return pending;
  const task = (async () => {
    let lastError = null;
    for (const url of list) {
      try {
        return await withTimeout(importByUrl(url), timeoutMs);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`CDN module load failed: ${key}`);
  })();
  moduleLoaders.set(key, task);
  try {
    return await task;
  } catch (error) {
    moduleLoaders.delete(key);
    throw error;
  }
};
const loadStyleByUrl = (url, id) => new Promise((resolve, reject) => {
  const existed = document.getElementById(id);
  if (existed) {
    resolve(url);
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = url;
  link.crossOrigin = "anonymous";
  link.onload = () => resolve(url);
  link.onerror = () => reject(new Error(`load stylesheet failed: ${url}`));
  document.head.appendChild(link);
});
const loadStyleByText = (cssText, id) => new Promise((resolve, reject) => {
  const existed = document.getElementById(id);
  if (existed) {
    resolve(id);
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssText;
  try {
    document.head.appendChild(style);
    resolve(id);
  } catch (error) {
    reject(error);
  }
});
const loadStyleFromCdn = async ({
  cacheKey,
  urls,
  timeoutMs = 15e3
} = {}) => {
  const key = String(cacheKey || "");
  const list = normalizeUrls(urls);
  if (!key || !list.length) {
    throw new Error("CDN style config invalid");
  }
  const pending = styleLoaders.get(key);
  if (pending) return pending;
  const styleId = `cdn-style-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const task = (async () => {
    let lastError = null;
    for (const url of list) {
      try {
        const cached = await readCachedTextByUrl(url);
        if (!cached) continue;
        await loadStyleByText(cached, styleId);
        return url;
      } catch (error) {
        lastError = error;
      }
    }
    for (const url of list) {
      try {
        const cssText = await fetchTextByUrl(url, timeoutMs);
        await loadStyleByText(cssText, styleId);
        return url;
      } catch (error) {
        lastError = error;
      }
    }
    for (const url of list) {
      try {
        return await withTimeout(loadStyleByUrl(url, styleId), timeoutMs);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`CDN style load failed: ${key}`);
  })();
  styleLoaders.set(key, task);
  try {
    return await task;
  } catch (error) {
    styleLoaders.delete(key);
    throw error;
  }
};
const _hoisted_1 = { class: "resource-share-view module-page" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "path-card" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = { class: "breadcrumbs" };
const _hoisted_6 = ["onClick"];
const _hoisted_7 = { class: "list-card" };
const _hoisted_8 = { class: "list-meta" };
const _hoisted_9 = { class: "count-chip" };
const _hoisted_10 = {
  key: 0,
  class: "error-text"
};
const _hoisted_11 = {
  key: 0,
  class: "empty"
};
const _hoisted_12 = { class: "items-grid" };
const _hoisted_13 = ["onClick"];
const _hoisted_14 = { class: "item-title-row" };
const _hoisted_15 = { class: "item-title" };
const _hoisted_16 = { class: "item-meta-row" };
const _hoisted_17 = {
  key: 0,
  class: "meta-size"
};
const _hoisted_18 = { class: "item-time" };
const _hoisted_19 = { class: "preview-modal" };
const _hoisted_20 = { class: "preview-head" };
const _hoisted_21 = { class: "preview-path" };
const _hoisted_22 = { class: "preview-actions" };
const _hoisted_23 = {
  key: 1,
  class: "preview-loading"
};
const _hoisted_24 = {
  id: "resource-xgplayer-host",
  ref: "previewPlayerHostRef",
  class: "xgplayer-host"
};
const _hoisted_25 = {
  key: 3,
  class: "preview-image-wrap"
};
const _hoisted_26 = ["src"];
const _hoisted_27 = {
  key: 4,
  class: "pdf-viewer"
};
const _hoisted_28 = { class: "pdf-toolbar" };
const _hoisted_29 = ["disabled"];
const _hoisted_30 = { class: "pdf-page-chip" };
const _hoisted_31 = ["disabled"];
const _hoisted_32 = ["disabled"];
const _hoisted_33 = ["disabled"];
const _hoisted_34 = {
  ref: "pdfCanvasRef",
  class: "pdf-canvas"
};
const _hoisted_35 = ["src"];
const _hoisted_36 = {
  key: 6,
  class: "preview-text"
};
const _hoisted_37 = {
  key: 7,
  class: "preview-empty"
};
const _hoisted_38 = {
  key: 0,
  class: "preview-hint"
};
const _hoisted_39 = {
  key: 1,
  class: "center-loading-overlay"
};
const _hoisted_40 = { class: "center-loading-card" };
function render(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("div", _hoisted_1, [
    createVNode($setup["TPageHeader"], {
      icon: "folder_shared",
      title: "资源网盘",
      onBack: _cache[0] || (_cache[0] = ($event) => $setup.emit("back"))
    }, {
      actions: withCtx(() => [
        createBaseVNode("button", {
          class: "header-btn",
          disabled: $setup.loadingList || $setup.loadingConfig,
          onClick: $setup.refreshCurrent
        }, "刷新", 8, _hoisted_2)
      ]),
      _: 1
    }),
    createBaseVNode("section", _hoisted_3, [
      createBaseVNode("button", {
        class: "path-btn",
        disabled: !$setup.canGoParent || $setup.loadingList,
        onClick: $setup.goParent
      }, "上一级", 8, _hoisted_4),
      createBaseVNode("div", _hoisted_5, [
        (openBlock(true), createElementBlock(Fragment, null, renderList($setup.breadcrumbItems, (crumb, idx) => {
          return openBlock(), createElementBlock("button", {
            key: crumb.path,
            class: normalizeClass(["crumb-chip", { active: idx === $setup.breadcrumbItems.length - 1 }]),
            onClick: ($event) => $setup.openBreadcrumb(crumb.path)
          }, toDisplayString(crumb.label), 11, _hoisted_6);
        }), 128))
      ])
    ]),
    createBaseVNode("section", _hoisted_7, [
      createBaseVNode("div", _hoisted_8, [
        createBaseVNode("span", _hoisted_9, "共 " + toDisplayString($setup.totalCount) + " 项", 1),
        $setup.errorMessage ? (openBlock(), createElementBlock("span", _hoisted_10, toDisplayString($setup.errorMessage), 1)) : createCommentVNode("", true)
      ]),
      !$setup.items.length && !$setup.loadingList ? (openBlock(), createElementBlock("div", _hoisted_11, "当前目录为空")) : createCommentVNode("", true),
      createBaseVNode("div", _hoisted_12, [
        (openBlock(true), createElementBlock(Fragment, null, renderList($setup.items, (item) => {
          return openBlock(), createElementBlock("button", {
            key: item.path,
            class: "item-card",
            onClick: ($event) => $setup.openItem(item)
          }, [
            createBaseVNode("div", _hoisted_14, [
              createBaseVNode("span", {
                class: normalizeClass(["item-icon", `type-${$setup.getTypeClass(item)}`])
              }, toDisplayString($setup.getItemIcon(item)), 3),
              createBaseVNode("span", _hoisted_15, toDisplayString(item.name), 1)
            ]),
            createBaseVNode("div", _hoisted_16, [
              createBaseVNode("span", {
                class: normalizeClass(["meta-chip", `type-${$setup.getTypeClass(item)}`])
              }, toDisplayString($setup.getItemTypeLabel(item)), 3),
              !item.isDir ? (openBlock(), createElementBlock("span", _hoisted_17, toDisplayString($setup.formatSize(item.size)), 1)) : createCommentVNode("", true),
              createBaseVNode("span", _hoisted_18, toDisplayString($setup.formatTime(item.modified)), 1)
            ])
          ], 8, _hoisted_13);
        }), 128))
      ])
    ]),
    $setup.showPreview ? (openBlock(), createElementBlock("div", {
      key: 0,
      class: "preview-overlay",
      onClick: withModifiers($setup.closePreview, ["self"])
    }, [
      createBaseVNode("div", _hoisted_19, [
        createBaseVNode("div", _hoisted_20, [
          createBaseVNode("h3", null, toDisplayString($setup.previewTitle), 1),
          createBaseVNode("p", _hoisted_21, toDisplayString($setup.previewPath), 1)
        ]),
        createBaseVNode("div", _hoisted_22, [
          createBaseVNode("button", {
            class: "action-btn",
            onClick: $setup.toggleFullscreenPreview
          }, toDisplayString($setup.isViewerFullscreen ? "退出全屏预览器" : "全屏预览器"), 1),
          createBaseVNode("button", {
            class: "action-btn primary",
            onClick: $setup.openDownload
          }, "下载"),
          createBaseVNode("button", {
            class: "action-btn",
            onClick: $setup.closePreview
          }, "关闭")
        ]),
        createBaseVNode("div", {
          class: normalizeClass(["preview-body", { "viewer-fullscreen": $setup.isViewerFullscreen }])
        }, [
          $setup.isViewerFullscreen ? (openBlock(), createElementBlock("button", {
            key: 0,
            class: "viewer-exit-btn",
            onClick: $setup.exitViewerFullscreen
          }, "← 退出全屏")) : createCommentVNode("", true),
          $setup.loadingPreview ? (openBlock(), createElementBlock("div", _hoisted_23, "预览加载中...")) : $setup.previewKind === "video" || $setup.previewKind === "audio" ? (openBlock(), createElementBlock("div", {
            key: 2,
            class: normalizeClass(["preview-media-wrap xgplayer-wrap", { audio: $setup.previewKind === "audio" }])
          }, [
            createBaseVNode("div", _hoisted_24, null, 512)
          ], 2)) : $setup.previewKind === "image" ? (openBlock(), createElementBlock("div", _hoisted_25, [
            createBaseVNode("img", {
              class: "preview-image",
              src: $setup.previewUrl,
              alt: "preview",
              onError: $setup.onPreviewImageError
            }, null, 40, _hoisted_26)
          ])) : $setup.previewKind === "pdf" ? (openBlock(), createElementBlock("div", _hoisted_27, [
            createBaseVNode("div", _hoisted_28, [
              createBaseVNode("button", {
                class: "pdf-tool-btn",
                disabled: $setup.pdfCurrentPage <= 1,
                onClick: $setup.prevPdfPage
              }, "上一页", 8, _hoisted_29),
              createBaseVNode("span", _hoisted_30, "第 " + toDisplayString($setup.pdfCurrentPage) + " / " + toDisplayString($setup.pdfPageCount) + " 页", 1),
              createBaseVNode("button", {
                class: "pdf-tool-btn",
                disabled: $setup.pdfCurrentPage >= $setup.pdfPageCount,
                onClick: $setup.nextPdfPage
              }, "下一页", 8, _hoisted_31),
              createBaseVNode("button", {
                class: "pdf-tool-btn",
                disabled: $setup.pdfZoom <= $setup.PDF_ZOOM_MIN + 1e-3,
                onClick: $setup.zoomOutPdf
              }, "缩小", 8, _hoisted_32),
              createBaseVNode("button", {
                class: "pdf-page-chip",
                onClick: $setup.resetPdfZoom
              }, toDisplayString($setup.pdfZoomText), 1),
              createBaseVNode("button", {
                class: "pdf-tool-btn",
                disabled: $setup.pdfZoom >= $setup.PDF_ZOOM_MAX - 1e-3,
                onClick: $setup.zoomInPdf
              }, "放大", 8, _hoisted_33)
            ]),
            createBaseVNode("div", {
              ref: "pdfCanvasWrapRef",
              class: normalizeClass(["pdf-canvas-wrap", { panning: $setup.isPdfPanning, zoomed: $setup.pdfZoom > 1.001 }]),
              onPointerdown: $setup.onPdfPanPointerDown,
              onPointermove: $setup.onPdfPanPointerMove,
              onPointerup: $setup.onPdfPanPointerUp,
              onPointercancel: $setup.onPdfPanPointerUp
            }, [
              createBaseVNode("canvas", _hoisted_34, null, 512)
            ], 34)
          ])) : $setup.previewKind === "office" ? (openBlock(), createElementBlock("iframe", {
            key: `office-${$setup.previewFrameKey}`,
            class: "preview-frame",
            src: $setup.previewUrl,
            title: "office preview",
            onError: $setup.onPreviewFrameError
          }, null, 40, _hoisted_35)) : $setup.previewKind === "text" ? (openBlock(), createElementBlock("pre", _hoisted_36, toDisplayString($setup.previewText), 1)) : (openBlock(), createElementBlock("div", _hoisted_37, toDisplayString($setup.previewHint || "暂不支持该类型在线预览"), 1))
        ], 2),
        $setup.previewHint && $setup.previewKind !== "unknown" ? (openBlock(), createElementBlock("p", _hoisted_38, toDisplayString($setup.previewHint), 1)) : createCommentVNode("", true)
      ])
    ])) : createCommentVNode("", true),
    $setup.loadingConfig || $setup.loadingList ? (openBlock(), createElementBlock("div", _hoisted_39, [
      createBaseVNode("div", _hoisted_40, [
        _cache[1] || (_cache[1] = createBaseVNode("div", { class: "spinner" }, null, -1)),
        createBaseVNode("p", null, toDisplayString($setup.loadingConfig ? "加载远程配置中..." : "加载目录中..."), 1)
      ])
    ])) : createCommentVNode("", true)
  ]);
}
const DIR_CACHE_TTL_MS = 15 * 60 * 1e3;
const DIR_CACHE_STORAGE_KEY = "hbut_resource_dir_cache_v4";
const DIRECT_URL_CACHE_TTL_MS = 10 * 60 * 1e3;
const DEFAULT_WEBDAV_ENDPOINT = "https://mini-hbut-chaoxing-webdav.hf.space";
const PDF_ZOOM_MIN = 0.6;
const PDF_ZOOM_MAX = 3;
const PDF_ZOOM_STEP = 0.2;
const _sfc_main = {
  __name: "ResourceShareView",
  emits: ["back"],
  setup(__props, { expose: __expose, emit: __emit }) {
    __expose();
    const emit = __emit;
    const endpoint = ref(DEFAULT_WEBDAV_ENDPOINT);
    const username = ref("mini-hbut");
    const password = ref("mini-hbut");
    const officePreviewProxy = ref("https://view.officeapps.live.com/op/embed.aspx?src=");
    const enabled = ref(true);
    const currentPath = ref("/");
    const items = ref([]);
    const loadingConfig = ref(true);
    const loadingList = ref(false);
    const loadingPreview = ref(false);
    const errorMessage = ref("");
    const totalCount = ref(0);
    const showPreview = ref(false);
    const isViewerFullscreen = ref(false);
    const previewFrameKey = ref(0);
    const previewTitle = ref("");
    const previewPath = ref("");
    const previewKind = ref("unknown");
    const previewText = ref("");
    const previewUrl = ref("");
    const previewHint = ref("");
    const previewNeedAuth = ref(false);
    const previewProxyFallbackUsed = ref(false);
    const officePreviewCandidates = ref([]);
    const pdfPreviewCandidates = ref([]);
    const previewUrlCandidates = ref([]);
    const previewObjectUrl = ref("");
    const nativeBlobFallbackTried = ref(false);
    const pdfCanvasRef = ref(null);
    const pdfCanvasWrapRef = ref(null);
    const pdfDocumentRef = shallowRef(null);
    const pdfCurrentPage = ref(1);
    const pdfPageCount = ref(1);
    const pdfRenderPending = ref(false);
    const pdfZoom = ref(1);
    const isPdfPanning = ref(false);
    const pdfPanState = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      startScrollTop: 0
    };
    const previewPlayerHostRef = ref(null);
    let previewPlayerInstance = null;
    let pdfjsRuntime = null;
    let xgPlayerCtor = null;
    let previewResizeRaf = 0;
    let mediaResizeTimer = null;
    let pdfResizeTimer = null;
    const CDN_ASSETS = {
      xgplayerScript: [
        "https://cdn.jsdelivr.net.cn/npm/xgplayer@3.0.22/dist/index.min.js",
        "https://unpkg.com/xgplayer@3.0.22/dist/index.min.js",
        "https://cdn.jsdelivr.net/npm/xgplayer@3.0.22/dist/index.min.js"
      ],
      xgplayerStyle: [
        "https://cdn.jsdelivr.net.cn/npm/xgplayer@3.0.22/dist/index.min.css",
        "https://unpkg.com/xgplayer@3.0.22/dist/index.min.css",
        "https://cdn.jsdelivr.net/npm/xgplayer@3.0.22/dist/index.min.css"
      ],
      pdfjsModule: [
        "https://cdn.jsdelivr.net.cn/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs",
        "https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.mjs",
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs"
      ],
      pdfjsWorker: [
        "https://cdn.jsdelivr.net.cn/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs",
        "https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs",
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs"
      ]
    };
    const runtimeType = detectRuntime();
    const runtimeIsTauri = runtimeType === "tauri" || isTauriRuntime();
    const runtimeIsCapacitor = runtimeType === "capacitor";
    const bridgeBaseCandidates = runtimeIsTauri ? ["http://127.0.0.1:4399", "http://localhost:4399", "/bridge"] : ["/bridge"];
    const bridgeBase = bridgeBaseCandidates[0];
    const normalizePath = (path) => {
      const text = String(path || "").replaceAll("\\", "/").trim();
      if (!text) return "/";
      const withLeading = text.startsWith("/") ? text : `/${text}`;
      const normalized = withLeading.replace(/\/{2,}/g, "/");
      if (normalized.length > 1 && normalized.endsWith("/")) return normalized.slice(0, -1);
      return normalized;
    };
    const joinPath = (basePath, name) => {
      const base = normalizePath(basePath);
      const child = String(name || "").trim();
      if (!child) return base;
      return normalizePath(base === "/" ? `/${child}` : `${base}/${child}`);
    };
    const encodeDavPath = (path) => normalizePath(path).split("/").map((part) => encodeURIComponent(part)).join("/");
    const getDavUrl = (path) => `${String(endpoint.value || "").replace(/\/+$/, "")}/dav${encodeDavPath(path)}`;
    const getDavAuthUrl = (path) => {
      const base = String(endpoint.value || "").trim();
      if (!base) return getDavUrl(path);
      try {
        const url = new URL(base);
        url.username = String(username.value || "");
        url.password = String(password.value || "");
        const basePath = (url.pathname || "/").replace(/\/+$/, "");
        url.pathname = `${basePath}/dav${encodeDavPath(path)}`;
        return url.toString();
      } catch {
        return getDavUrl(path);
      }
    };
    const getProxyUrl = (path) => {
      const query = new URLSearchParams({
        endpoint: endpoint.value,
        path: normalizePath(path),
        username: username.value,
        password: password.value
      });
      return `${bridgeBase}/resource_share/proxy?${query.toString()}`;
    };
    const getProxyUrlByBase = (base, path) => {
      const query = new URLSearchParams({
        endpoint: endpoint.value,
        path: normalizePath(path),
        username: username.value,
        password: password.value
      });
      return `${base}/resource_share/proxy?${query.toString()}`;
    };
    const buildProxyCandidates = (path) => {
      const normalized = normalizePath(path);
      return [...new Set(bridgeBaseCandidates.map((base) => getProxyUrlByBase(base, normalized)).filter(Boolean))];
    };
    const imageExts = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
    const videoExts = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
    const audioExts = /* @__PURE__ */ new Set(["mp3", "wav", "flac", "m4a", "ogg", "aac"]);
    const textExts = /* @__PURE__ */ new Set(["txt", "md", "json", "csv", "xml", "yaml", "yml", "log"]);
    const wordExts = /* @__PURE__ */ new Set(["doc", "docx"]);
    const sheetExts = /* @__PURE__ */ new Set(["xls", "xlsx"]);
    const slideExts = /* @__PURE__ */ new Set(["ppt", "pptx"]);
    const officeExts = /* @__PURE__ */ new Set([...wordExts, ...sheetExts, ...slideExts]);
    const getExt = (name) => {
      const text = String(name || "");
      const idx = text.lastIndexOf(".");
      if (idx < 0) return "";
      return text.slice(idx + 1).toLowerCase();
    };
    const formatSize = (size) => {
      const n = Number(size || 0);
      if (!Number.isFinite(n) || n <= 0) return "-";
      if (n < 1024) return `${n.toFixed(0)} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
      return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };
    const formatTime = (value) => {
      if (!value) return "-";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString("zh-CN", { hour12: false });
    };
    const getItemIcon = (item) => {
      if (item?.isDir) return "📁";
      const ext = getExt(item?.name);
      if (videoExts.has(ext)) return "🎬";
      if (audioExts.has(ext)) return "🎵";
      if (imageExts.has(ext)) return "🖼️";
      if (ext === "pdf") return "📕";
      if (wordExts.has(ext)) return "📝";
      if (sheetExts.has(ext)) return "📊";
      if (slideExts.has(ext)) return "📽️";
      if (textExts.has(ext)) return "📄";
      return "📦";
    };
    const getItemTypeLabel = (item) => {
      if (item?.isDir) return "文件夹";
      const ext = getExt(item?.name);
      if (videoExts.has(ext)) return "视频";
      if (audioExts.has(ext)) return "音频";
      if (imageExts.has(ext)) return "图片";
      if (ext === "pdf") return "PDF";
      if (wordExts.has(ext)) return "文档";
      if (sheetExts.has(ext)) return "表格";
      if (slideExts.has(ext)) return "PPT";
      if (textExts.has(ext)) return "文本";
      return ext ? ext.toUpperCase() : "文件";
    };
    const getTypeClass = (item) => {
      if (item?.isDir) return "folder";
      const ext = getExt(item?.name);
      if (videoExts.has(ext)) return "video";
      if (audioExts.has(ext)) return "audio";
      if (imageExts.has(ext)) return "image";
      if (ext === "pdf") return "pdf";
      if (wordExts.has(ext)) return "word";
      if (sheetExts.has(ext)) return "sheet";
      if (slideExts.has(ext)) return "slide";
      if (textExts.has(ext)) return "text";
      return "other";
    };
    const buildTestAccountResourceShareItems = (path = "/") => {
      const targetPath = normalizePath(path);
      if (targetPath === "/") {
        return [
          {
            name: "TestFlight演示资料",
            path: "/TestFlight演示资料",
            isDir: true,
            size: 0,
            modified: "2026-07-06T08:00:00+08:00",
            contentType: ""
          },
          {
            name: "演示说明.txt",
            path: "/演示说明.txt",
            isDir: false,
            size: 128,
            modified: "2026-07-06T08:00:00+08:00",
            contentType: "text/plain"
          }
        ];
      }
      if (targetPath === "/TestFlight演示资料") {
        return [
          {
            name: "课程资料预览.txt",
            path: "/TestFlight演示资料/课程资料预览.txt",
            isDir: false,
            size: 96,
            modified: "2026-07-06T08:00:00+08:00",
            contentType: "text/plain"
          }
        ];
      }
      return [];
    };
    const getTestAccountResourceText = (path = "/") => `Mini-HBUT TestFlight demo resource

Path: ${normalizePath(path)}
This is a local demo payload.`;
    const getTestAccountResourceDirectUrl = (path = "/") => ({
      url: `data:text/plain;charset=utf-8,${encodeURIComponent(getTestAccountResourceText(path))}`,
      needAuth: false
    });
    const fetchWithTimeout = async (url, init = {}, timeoutMs = 25e3) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };
    const makeAuthHeader = () => {
      const raw = `${username.value}:${password.value}`;
      return `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
    };
    const parseJsonStorage = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return parsed;
      } catch {
        return {};
      }
    };
    const saveJsonStorage = (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
      }
    };
    const dirCache = ref(parseJsonStorage(DIR_CACHE_STORAGE_KEY));
    const directUrlCache = /* @__PURE__ */ new Map();
    const textByLocalName = (node, localName) => {
      const list = node?.getElementsByTagNameNS?.("*", localName);
      if (!list || !list.length) return "";
      return String(list[0].textContent || "").trim();
    };
    const parseHrefPath = (href) => {
      try {
        const base = `${String(endpoint.value || "").replace(/\/+$/, "")}/`;
        const url = new URL(String(href || ""), base);
        const marker = "/dav";
        const idx = url.pathname.indexOf(marker);
        const rawPath = idx >= 0 ? url.pathname.slice(idx + marker.length) : url.pathname;
        return normalizePath(decodeURIComponent(rawPath || "/"));
      } catch {
        return normalizePath(href || "/");
      }
    };
    const parsePropfindXml = (xmlText, targetPath) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "application/xml");
      if (doc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("目录响应解析失败");
      }
      const responses = [...doc.getElementsByTagNameNS("*", "response")];
      const normalizedTarget = normalizePath(targetPath);
      const parsed = [];
      for (const node of responses) {
        const href = textByLocalName(node, "href");
        const path = parseHrefPath(href);
        if (!path || path === normalizedTarget) continue;
        const prop = node.getElementsByTagNameNS("*", "prop")[0];
        const display = textByLocalName(prop || node, "displayname");
        const contentType = textByLocalName(prop || node, "getcontenttype");
        const contentLength = Number(textByLocalName(prop || node, "getcontentlength") || 0);
        const modified = textByLocalName(prop || node, "getlastmodified");
        const isDir = !!(prop && prop.getElementsByTagNameNS("*", "collection").length > 0);
        const fallbackName = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
        const name = display || fallbackName || (isDir ? "未命名文件夹" : "未命名文件");
        parsed.push({
          name,
          path,
          isDir,
          size: Number.isFinite(contentLength) ? contentLength : 0,
          modified,
          contentType
        });
      }
      parsed.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-CN");
      });
      return parsed;
    };
    const breadcrumbItems = computed(() => {
      const full = normalizePath(currentPath.value);
      const parts = full.split("/").filter(Boolean);
      const result = [{ label: "根目录", path: "/" }];
      let running = "";
      for (const part of parts) {
        running = joinPath(running || "/", part);
        result.push({ label: part, path: running });
      }
      return result;
    });
    const canGoParent = computed(() => normalizePath(currentPath.value) !== "/");
    const getParentPath = (path) => {
      const normalized = normalizePath(path);
      if (normalized === "/") return "/";
      const parts = normalized.split("/").filter(Boolean);
      parts.pop();
      return parts.length ? `/${parts.join("/")}` : "/";
    };
    const fetchDirectoryViaNative = async (path) => {
      const payload = await invokeNative("resource_share_list_dir_native", {
        req: {
          endpoint: endpoint.value,
          path: normalizePath(path),
          username: username.value,
          password: password.value,
          depth: 1
        }
      });
      const xml = String(payload?.xml || "");
      if (!xml) {
        throw new Error("原生目录接口返回空响应");
      }
      return xml;
    };
    const listDirectory = async (path, force = false) => {
      const targetPath = normalizePath(path);
      errorMessage.value = "";
      loadingList.value = true;
      try {
        const now = Date.now();
        if (isTestAccountSession()) {
          const demoItems = buildTestAccountResourceShareItems(targetPath);
          currentPath.value = targetPath;
          items.value = demoItems;
          totalCount.value = demoItems.length;
          return;
        }
        const cached = dirCache.value[targetPath];
        if (!force && cached && now - Number(cached.time || 0) <= DIR_CACHE_TTL_MS && Array.isArray(cached.items)) {
          currentPath.value = targetPath;
          items.value = cached.items;
          totalCount.value = cached.items.length;
          return;
        }
        if (runtimeIsTauri) {
          try {
            const xml = await fetchDirectoryViaNative(targetPath);
            const parsed2 = parsePropfindXml(xml, targetPath);
            currentPath.value = targetPath;
            items.value = parsed2;
            totalCount.value = parsed2.length;
            dirCache.value[targetPath] = { time: now, items: parsed2 };
            saveJsonStorage(DIR_CACHE_STORAGE_KEY, dirCache.value);
            return;
          } catch (nativeError) {
            console.warn("[ResourceShare] native list_dir failed, fallback fetch:", nativeError?.message || nativeError);
          }
        }
        const res = await fetchWithTimeout(
          getDavUrl(targetPath),
          {
            method: "PROPFIND",
            headers: {
              Authorization: makeAuthHeader(),
              Depth: "1"
            }
          },
          28e3
        );
        if (!res.ok) {
          throw new Error(`目录加载失败（HTTP ${res.status}）`);
        }
        const parsed = parsePropfindXml(await res.text(), targetPath);
        currentPath.value = targetPath;
        items.value = parsed;
        totalCount.value = parsed.length;
        dirCache.value[targetPath] = { time: now, items: parsed };
        saveJsonStorage(DIR_CACHE_STORAGE_KEY, dirCache.value);
      } catch (error) {
        if (error?.name === "AbortError") {
          errorMessage.value = "目录加载超时，请重试";
        } else {
          errorMessage.value = error?.message || "目录加载失败";
        }
      } finally {
        loadingList.value = false;
      }
    };
    const buildOfficePreviewUrl = (fileUrl) => {
      const proxy = String(officePreviewProxy.value || "").trim();
      if (!proxy) return "";
      if (proxy.includes("{url}")) return proxy.replace("{url}", encodeURIComponent(fileUrl));
      if (proxy.endsWith("=") || proxy.endsWith("src=")) return `${proxy}${encodeURIComponent(fileUrl)}`;
      const joiner = proxy.includes("?") ? "&" : "?";
      return `${proxy}${joiner}src=${encodeURIComponent(fileUrl)}`;
    };
    const buildOfficePreviewCandidates = (fileUrl) => {
      const primary = buildOfficePreviewUrl(fileUrl);
      const result = [];
      if (primary) result.push(primary);
      if (primary.includes("/op/view.aspx")) {
        result.push(primary.replace("/op/view.aspx", "/op/embed.aspx"));
      } else if (primary.includes("/op/embed.aspx")) {
        result.push(primary.replace("/op/embed.aspx", "/op/view.aspx"));
      }
      return [...new Set(result.filter(Boolean))];
    };
    const parseDirectUrlExpireAt = (url) => {
      try {
        const parsed = new URL(url);
        const exp = parsed.searchParams.get("exp");
        if (exp && /^\d+$/.test(exp)) return Number(exp) * 1e3;
      } catch {
      }
      return Date.now() + DIRECT_URL_CACHE_TTL_MS;
    };
    const withCacheBustUrl = (url) => {
      const text = String(url || "").trim();
      if (!text) return "";
      const joiner = text.includes("?") ? "&" : "?";
      return `${text}${joiner}_rt=${Date.now()}`;
    };
    const buildPreviewUrlCandidates = (path, signed) => {
      if (isTestAccountSession()) return [String(signed?.url || "").trim()].filter(Boolean);
      const normalized = normalizePath(path);
      const candidates = [];
      const signedUrl = String(signed?.url || "").trim();
      if (signedUrl) candidates.push(signedUrl);
      candidates.push(getDavAuthUrl(normalized));
      for (const proxyUrl of buildProxyCandidates(normalized)) {
        candidates.push(proxyUrl);
      }
      candidates.push(getDavUrl(normalized));
      return [...new Set(candidates.filter(Boolean))];
    };
    const shiftNextPreviewCandidate = () => {
      while (previewUrlCandidates.value.length) {
        const next = String(previewUrlCandidates.value.shift() || "");
        if (!next) continue;
        if (next === previewUrl.value) continue;
        setPreviewUrl(next);
        return next;
      }
      return "";
    };
    const decodeBase64Bytes = (base64) => {
      const raw = atob(String(base64 || ""));
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) {
        out[i] = raw.charCodeAt(i);
      }
      return out;
    };
    const releasePreviewObjectUrl = () => {
      if (!previewObjectUrl.value) return;
      try {
        URL.revokeObjectURL(previewObjectUrl.value);
      } catch {
      }
      previewObjectUrl.value = "";
    };
    const createPreviewObjectUrl = (base64, contentType) => {
      const bytes = decodeBase64Bytes(base64);
      const blob = new Blob([bytes], { type: contentType || "application/octet-stream" });
      releasePreviewObjectUrl();
      const nextUrl = URL.createObjectURL(blob);
      previewObjectUrl.value = nextUrl;
      return nextUrl;
    };
    const fetchDirectUrlByNativeInvoke = async (path) => {
      const payload = await invokeNative("resource_share_direct_url_native", {
        req: {
          endpoint: endpoint.value,
          path: normalizePath(path),
          username: username.value,
          password: password.value
        }
      });
      return {
        url: String(payload?.url || ""),
        needAuth: !!payload?.needAuth
      };
    };
    const fetchDirectUrlFromBridge = async (params) => {
      const query = new URLSearchParams(params).toString();
      let lastError = null;
      for (const base of bridgeBaseCandidates) {
        try {
          const response = await fetchWithTimeout(`${base}/resource_share/direct_url?${query}`, {}, 2e4);
          if (!response.ok) {
            throw new Error(`获取直链失败（HTTP ${response.status}）`);
          }
          const payload = await response.json().catch(() => ({}));
          return payload;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("获取直链失败");
    };
    const getSignedDirectUrl = async (path) => {
      const normalized = normalizePath(path);
      if (isTestAccountSession()) return getTestAccountResourceDirectUrl(normalized);
      const cacheKey = `${endpoint.value}|${normalized}`;
      const cached = directUrlCache.get(cacheKey);
      if (cached?.url && Number(cached.expireAt || 0) > Date.now() + 5e3) {
        return { url: cached.url, needAuth: !!cached.needAuth };
      }
      if (runtimeIsTauri) {
        try {
          const nativePayload = await fetchDirectUrlByNativeInvoke(normalized);
          const nativeDirect = String(nativePayload.url || "").trim();
          const nativeNeedAuth = !!nativePayload.needAuth;
          if (nativeDirect) {
            const expireAt = parseDirectUrlExpireAt(nativeDirect);
            directUrlCache.set(cacheKey, { url: nativeDirect, expireAt, needAuth: nativeNeedAuth });
            return { url: nativeDirect, needAuth: nativeNeedAuth };
          }
          throw new Error("未获取到可用直链");
        } catch (nativeError) {
          console.warn("[ResourceShare] invoke direct_url failed, fallback to auth url:", nativeError?.message || nativeError);
          const direct = getDavAuthUrl(normalized);
          const expireAt = Date.now() + DIRECT_URL_CACHE_TTL_MS;
          directUrlCache.set(cacheKey, { url: direct, expireAt, needAuth: false });
          return { url: direct, needAuth: false };
        }
      }
      if (runtimeIsCapacitor) {
        const direct = getDavAuthUrl(normalized);
        const expireAt = Date.now() + DIRECT_URL_CACHE_TTL_MS;
        directUrlCache.set(cacheKey, { url: direct, expireAt, needAuth: false });
        return { url: direct, needAuth: false };
      }
      const fallback = getDavUrl(normalized);
      directUrlCache.set(cacheKey, { url: fallback, expireAt: Date.now() + 3 * 60 * 1e3, needAuth: true });
      return { url: fallback, needAuth: true };
    };
    const fetchNativeResourcePayload = async (path, maxBytes = void 0) => {
      if (isTestAccountSession()) {
        return {
          base64: btoa(getTestAccountResourceText(path)),
          contentType: "text/plain"
        };
      }
      if (!runtimeIsTauri) return null;
      return invokeNative("resource_share_fetch_file_payload_native", {
        req: {
          endpoint: endpoint.value,
          path: normalizePath(path),
          username: username.value,
          password: password.value,
          maxBytes
        }
      });
    };
    const applyNativeBlobPreview = async (kind) => {
      if (!runtimeIsTauri || !previewPath.value) return false;
      const isMedia = kind === "video" || kind === "audio";
      const isPdf = kind === "pdf";
      const maxBytes = isMedia ? 120 * 1024 * 1024 : 40 * 1024 * 1024;
      const payload = await fetchNativeResourcePayload(previewPath.value, maxBytes);
      const base64 = String(payload?.base64 || "").trim();
      if (!base64) return false;
      const defaultType = isPdf ? "application/pdf" : isMedia ? "video/mp4" : "application/octet-stream";
      const contentType = String(payload?.contentType || defaultType).trim() || defaultType;
      const blobUrl = createPreviewObjectUrl(base64, contentType);
      setPreviewUrl(blobUrl);
      previewUrlCandidates.value = [];
      return true;
    };
    const resolvePreviewPlayableUrl = (path, signed) => {
      if (!path) return String(signed?.url || "");
      if (!signed?.needAuth) return String(signed?.url || "");
      if (runtimeIsTauri) return getDavAuthUrl(path);
      if (runtimeIsCapacitor) return getDavAuthUrl(path);
      return getProxyUrl(path);
    };
    const fetchTextWithAuth = async (path) => {
      if (isTestAccountSession()) {
        return getTestAccountResourceText(path);
      }
      const response = await fetchWithTimeout(
        getDavUrl(path),
        {
          method: "GET",
          headers: {
            Authorization: makeAuthHeader()
          }
        },
        35e3
      );
      if (!response.ok) {
        throw new Error(`文本读取失败（HTTP ${response.status}）`);
      }
      return response.text();
    };
    const closePreview = async () => {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
        }
      }
      destroyPreviewPlayer();
      showPreview.value = false;
      isViewerFullscreen.value = false;
      previewTitle.value = "";
      previewPath.value = "";
      previewKind.value = "unknown";
      previewText.value = "";
      previewUrl.value = "";
      previewHint.value = "";
      previewNeedAuth.value = false;
      previewProxyFallbackUsed.value = false;
      officePreviewCandidates.value = [];
      pdfPreviewCandidates.value = [];
      previewUrlCandidates.value = [];
      pdfDocumentRef.value = null;
      pdfCurrentPage.value = 1;
      pdfPageCount.value = 1;
      pdfRenderPending.value = false;
      pdfZoom.value = 1;
      isPdfPanning.value = false;
      pdfPanState.active = false;
      pdfPanState.pointerId = null;
      nativeBlobFallbackTried.value = false;
      releasePreviewObjectUrl();
      previewFrameKey.value += 1;
    };
    const setPreviewUrl = (url) => {
      const next = String(url || "");
      if (previewObjectUrl.value && previewObjectUrl.value !== next) {
        releasePreviewObjectUrl();
      }
      previewUrl.value = next;
      previewFrameKey.value += 1;
    };
    const onPreviewFrameError = () => {
      if (previewKind.value !== "office") return;
      const next = officePreviewCandidates.value.shift();
      if (next) {
        setPreviewUrl(next);
        previewHint.value = "Office 预览线路已自动切换，正在重试...";
        return;
      }
      previewHint.value = "Office 在线预览失败，请点击下载后查看";
    };
    const ensurePdfRuntime = async () => {
      if (pdfjsRuntime) return pdfjsRuntime;
      let pdfjs = null;
      try {
        pdfjs = await importModuleFromCdn({
          cacheKey: "pdfjs-dist-runtime",
          urls: CDN_ASSETS.pdfjsModule
        });
      } catch {
        pdfjs = await importModuleFromCdn({
          cacheKey: "pdfjs-dist-runtime",
          urls: CDN_ASSETS.pdfjsModule.map((url) => withCacheBustUrl(url))
        });
      }
      pdfjs.GlobalWorkerOptions.workerSrc = CDN_ASSETS.pdfjsWorker[0];
      pdfjsRuntime = markRaw(pdfjs);
      return pdfjsRuntime;
    };
    const ensureXgplayerRuntime = async () => {
      if (xgPlayerCtor) return xgPlayerCtor;
      try {
        await loadStyleFromCdn({
          cacheKey: "xgplayer-style",
          urls: CDN_ASSETS.xgplayerStyle
        });
      } catch {
        await loadStyleFromCdn({
          cacheKey: "xgplayer-style",
          urls: CDN_ASSETS.xgplayerStyle.map((url) => withCacheBustUrl(url))
        });
      }
      let runtime = null;
      try {
        runtime = await loadScriptFromCdn({
          cacheKey: "xgplayer-script",
          urls: CDN_ASSETS.xgplayerScript,
          resolveGlobal: () => window?.Player || window?.XGPlayer || window?.xgplayer || window?.xgPlayer
        });
      } catch {
        runtime = await loadScriptFromCdn({
          cacheKey: "xgplayer-script",
          urls: CDN_ASSETS.xgplayerScript.map((url) => withCacheBustUrl(url)),
          resolveGlobal: () => window?.Player || window?.XGPlayer || window?.xgplayer || window?.xgPlayer
        });
      }
      xgPlayerCtor = runtime;
      return xgPlayerCtor;
    };
    const renderPdfPage = async () => {
      if (previewKind.value !== "pdf" || !pdfDocumentRef.value || !pdfCanvasRef.value) return;
      if (pdfRenderPending.value) return;
      pdfRenderPending.value = true;
      try {
        const canvas = pdfCanvasRef.value;
        const page = await pdfDocumentRef.value.getPage(pdfCurrentPage.value);
        const baseViewport = page.getViewport({ scale: 1 });
        const wrapWidth = Math.max((canvas.parentElement?.clientWidth || 0) - 24, 320);
        const fitScale = Math.max(0.4, wrapWidth / baseViewport.width);
        const scale = fitScale * pdfZoom.value;
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
      } finally {
        pdfRenderPending.value = false;
      }
    };
    const openPdfWithCandidates = async (urls) => {
      const runtime = await ensurePdfRuntime();
      let lastErr = "";
      for (let i = 0; i < urls.length; i += 1) {
        const candidate = urls[i];
        try {
          const response = await fetchWithTimeout(candidate, {}, 6e4);
          if (!response.ok) {
            throw new Error(`PDF 获取失败（HTTP ${response.status}）`);
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          const loadingTask = runtime.getDocument({
            data: bytes,
            useSystemFonts: true,
            isEvalSupported: false
          });
          const doc = await loadingTask.promise;
          pdfDocumentRef.value = markRaw(doc);
          pdfCurrentPage.value = 1;
          pdfPageCount.value = doc.numPages || 1;
          pdfZoom.value = 1;
          setPreviewUrl(candidate);
          pdfPreviewCandidates.value = urls.slice(i + 1);
          return;
        } catch (error) {
          lastErr = error?.message || "未知错误";
        }
      }
      throw new Error(lastErr || "PDF 预览失败");
    };
    const prevPdfPage = async () => {
      if (!pdfDocumentRef.value || pdfCurrentPage.value <= 1) return;
      pdfCurrentPage.value -= 1;
      await renderPdfPage();
    };
    const nextPdfPage = async () => {
      if (!pdfDocumentRef.value || pdfCurrentPage.value >= pdfPageCount.value) return;
      pdfCurrentPage.value += 1;
      await renderPdfPage();
    };
    const pdfZoomText = computed(() => `${Math.round(pdfZoom.value * 100)}%`);
    const clampPdfZoom = (zoom) => Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom));
    const setPdfZoom = async (zoom) => {
      const next = clampPdfZoom(zoom);
      if (Math.abs(next - pdfZoom.value) < 1e-3) return;
      pdfZoom.value = next;
      await renderPdfPage();
    };
    const zoomInPdf = async () => {
      await setPdfZoom(pdfZoom.value + PDF_ZOOM_STEP);
    };
    const zoomOutPdf = async () => {
      await setPdfZoom(pdfZoom.value - PDF_ZOOM_STEP);
    };
    const resetPdfZoom = async () => {
      await setPdfZoom(1);
    };
    const onPdfPanPointerDown = (event) => {
      if (previewKind.value !== "pdf") return;
      const wrap = pdfCanvasWrapRef.value;
      if (!wrap) return;
      if (event.pointerType === "touch") return;
      if (event.button !== void 0 && event.button !== 0) return;
      pdfPanState.active = true;
      pdfPanState.pointerId = event.pointerId ?? null;
      pdfPanState.startX = event.clientX;
      pdfPanState.startY = event.clientY;
      pdfPanState.startScrollLeft = wrap.scrollLeft;
      pdfPanState.startScrollTop = wrap.scrollTop;
      isPdfPanning.value = true;
      if (wrap.setPointerCapture && event.pointerId !== void 0) {
        try {
          wrap.setPointerCapture(event.pointerId);
        } catch {
        }
      }
      event.preventDefault();
    };
    const onPdfPanPointerMove = (event) => {
      if (!pdfPanState.active) return;
      if (pdfPanState.pointerId !== null && event.pointerId !== pdfPanState.pointerId) return;
      const wrap = pdfCanvasWrapRef.value;
      if (!wrap) return;
      const dx = event.clientX - pdfPanState.startX;
      const dy = event.clientY - pdfPanState.startY;
      wrap.scrollLeft = pdfPanState.startScrollLeft - dx;
      wrap.scrollTop = pdfPanState.startScrollTop - dy;
      event.preventDefault();
    };
    const onPdfPanPointerUp = (event) => {
      if (!pdfPanState.active) return;
      const wrap = pdfCanvasWrapRef.value;
      if (wrap?.releasePointerCapture && event.pointerId !== void 0) {
        try {
          wrap.releasePointerCapture(event.pointerId);
        } catch {
        }
      }
      pdfPanState.active = false;
      pdfPanState.pointerId = null;
      isPdfPanning.value = false;
    };
    const destroyPreviewPlayer = () => {
      if (!previewPlayerInstance) return;
      try {
        previewPlayerInstance.destroy();
      } catch {
      }
      previewPlayerInstance = null;
    };
    const initPreviewPlayer = async () => {
      if (previewKind.value !== "video" && previewKind.value !== "audio") return;
      if (!showPreview.value || loadingPreview.value || !previewUrl.value) return;
      const PlayerCtor = await ensureXgplayerRuntime();
      if (!PlayerCtor) {
        previewHint.value = "播放器运行时加载失败，请稍后重试";
        return;
      }
      await nextTick();
      const host = previewPlayerHostRef.value;
      if (!host) return;
      destroyPreviewPlayer();
      const isAudio = previewKind.value === "audio";
      previewPlayerInstance = markRaw(new PlayerCtor({
        id: "resource-xgplayer-host",
        url: previewUrl.value,
        lang: "zh-cn",
        autoplay: false,
        playsinline: true,
        videoInit: true,
        cssFullscreen: true,
        closeVideoClick: true,
        fluid: !isAudio,
        width: "100%",
        height: isAudio ? 92 : "100%",
        volume: 0.8,
        pip: !isAudio,
        rotateFullscreen: false,
        poster: "",
        ignores: isAudio ? ["fullscreen", "cssfullscreen", "pip", "download"] : ["download"],
        controls: {
          mode: "flex",
          initShow: true
        }
      }));
      previewPlayerInstance.on?.("error", () => {
        onPreviewMediaError();
      });
    };
    const onPreviewMediaError = () => {
      if (previewKind.value !== "video" && previewKind.value !== "audio") return;
      const next = shiftNextPreviewCandidate();
      if (next) {
        previewProxyFallbackUsed.value = true;
        previewHint.value = "当前线路不可用，已切换备用线路重试播放";
        return;
      }
      if (runtimeIsTauri && !nativeBlobFallbackTried.value) {
        nativeBlobFallbackTried.value = true;
        previewHint.value = "正在切换本地安全通道加载媒体...";
        void applyNativeBlobPreview(previewKind.value).then((ok) => {
          if (ok) {
            previewHint.value = "已切换本地安全通道播放";
            return;
          }
          previewHint.value = "当前文件无法在线播放，请点击下载后用系统播放器打开";
        }).catch((error) => {
          previewHint.value = `媒体预览失败：${error?.message || "未知错误"}`;
        });
        return;
      }
      previewHint.value = "当前文件无法在线播放，请点击下载后用系统播放器打开";
    };
    const onPreviewImageError = () => {
      if (previewKind.value !== "image") return;
      const next = shiftNextPreviewCandidate();
      if (next) {
        previewHint.value = "图片加载失败，已自动切换备用线路";
        return;
      }
      if (runtimeIsTauri && !nativeBlobFallbackTried.value) {
        nativeBlobFallbackTried.value = true;
        previewHint.value = "正在切换本地安全通道加载图片...";
        void applyNativeBlobPreview("image").then((ok) => {
          if (ok) {
            previewHint.value = "已切换本地安全通道预览图片";
            return;
          }
          previewHint.value = "图片预览失败，请点击下载后查看";
        }).catch((error) => {
          previewHint.value = `图片预览失败：${error?.message || "未知错误"}`;
        });
        return;
      }
      previewHint.value = "图片预览失败，请点击下载后查看";
    };
    const preparePreview = async (item) => {
      const ext = getExt(item.name);
      previewTitle.value = item.name;
      previewPath.value = item.path;
      previewHint.value = "";
      previewText.value = "";
      previewUrl.value = "";
      previewKind.value = "unknown";
      previewNeedAuth.value = false;
      previewProxyFallbackUsed.value = false;
      officePreviewCandidates.value = [];
      pdfPreviewCandidates.value = [];
      previewUrlCandidates.value = [];
      nativeBlobFallbackTried.value = false;
      releasePreviewObjectUrl();
      pdfDocumentRef.value = null;
      pdfCurrentPage.value = 1;
      pdfPageCount.value = 1;
      pdfRenderPending.value = false;
      pdfZoom.value = 1;
      isPdfPanning.value = false;
      pdfPanState.active = false;
      pdfPanState.pointerId = null;
      isViewerFullscreen.value = false;
      showPreview.value = true;
      loadingPreview.value = true;
      try {
        if (textExts.has(ext)) {
          previewKind.value = "text";
          previewText.value = await fetchTextWithAuth(item.path);
          return;
        }
        const signed = await getSignedDirectUrl(item.path);
        previewNeedAuth.value = signed.needAuth;
        if (videoExts.has(ext)) {
          previewKind.value = "video";
          const candidates = buildPreviewUrlCandidates(item.path, signed);
          previewUrlCandidates.value = candidates.slice(1);
          setPreviewUrl(candidates[0] || resolvePreviewPlayableUrl(item.path, signed));
          previewHint.value = signed.needAuth ? "已切换受鉴权资源预览通道" : "已使用直链流式播放";
          return;
        }
        if (audioExts.has(ext)) {
          previewKind.value = "audio";
          const candidates = buildPreviewUrlCandidates(item.path, signed);
          previewUrlCandidates.value = candidates.slice(1);
          setPreviewUrl(candidates[0] || resolvePreviewPlayableUrl(item.path, signed));
          previewHint.value = signed.needAuth ? "已切换受鉴权资源预览通道" : "已使用直链流式播放";
          return;
        }
        if (imageExts.has(ext)) {
          previewKind.value = "image";
          const candidates = buildPreviewUrlCandidates(item.path, signed);
          previewUrlCandidates.value = candidates.slice(1);
          setPreviewUrl(candidates[0] || resolvePreviewPlayableUrl(item.path, signed));
          return;
        }
        if (ext === "pdf") {
          previewKind.value = "pdf";
          const urls = buildPreviewUrlCandidates(item.path, signed);
          const uniqueUrls = [...new Set(urls.filter(Boolean))];
          if (!uniqueUrls.length) {
            throw new Error("PDF 预览地址为空");
          }
          try {
            await openPdfWithCandidates(uniqueUrls);
          } catch (pdfError) {
            if (!runtimeIsTauri) throw pdfError;
            const payload = await fetchNativeResourcePayload(item.path, 80 * 1024 * 1024);
            const base64 = String(payload?.base64 || "").trim();
            if (!base64) throw pdfError;
            const bytes = decodeBase64Bytes(base64);
            const runtime = await ensurePdfRuntime();
            const loadingTask = runtime.getDocument({
              data: bytes,
              useSystemFonts: true,
              isEvalSupported: false
            });
            const doc = await loadingTask.promise;
            pdfDocumentRef.value = markRaw(doc);
            pdfCurrentPage.value = 1;
            pdfPageCount.value = doc.numPages || 1;
            pdfZoom.value = 1;
            setPreviewUrl("native://pdf-inline");
          }
          previewHint.value = runtimeIsCapacitor ? "PDF 已使用移动端兼容线路预览" : "PDF 已建立预览通道，失败会自动切换备用线路";
          return;
        }
        if (officeExts.has(ext)) {
          if (signed.needAuth) {
            throw new Error("当前文件未生成可公开直链，无法直接在线预览 Office");
          }
          const officeUrls = buildOfficePreviewCandidates(signed.url);
          if (!officeUrls.length) {
            throw new Error("未配置 Office 在线预览地址");
          }
          previewKind.value = "office";
          setPreviewUrl(officeUrls[0]);
          officePreviewCandidates.value = officeUrls.slice(1);
          previewHint.value = "已通过 OneDrive 直链拼接 Office 在线预览";
          return;
        }
        previewKind.value = "unknown";
        previewHint.value = "该文件类型暂不支持在线预览，请使用下载";
      } catch (error) {
        previewKind.value = "unknown";
        previewHint.value = error?.message || "预览失败";
      } finally {
        loadingPreview.value = false;
        if (previewKind.value === "pdf") {
          await nextTick();
          try {
            await renderPdfPage();
          } catch (error) {
            previewHint.value = `PDF 渲染失败：${error?.message || "未知错误"}`;
            previewKind.value = "unknown";
          }
        }
      }
    };
    const openItem = async (item) => {
      if (loadingList.value || loadingPreview.value) return;
      if (item.isDir) {
        await listDirectory(item.path, false);
        return;
      }
      await preparePreview(item);
    };
    const goParent = async () => {
      if (!canGoParent.value) return;
      await listDirectory(getParentPath(currentPath.value), false);
    };
    const refreshCurrent = async () => {
      await listDirectory(currentPath.value, true);
    };
    const openBreadcrumb = async (path) => {
      await listDirectory(path, false);
    };
    const openDownload = async () => {
      if (!previewPath.value) return;
      if (isTestAccountSession()) {
        previewHint.value = "演示账号不下载真实资料";
        return;
      }
      try {
        const signed = await getSignedDirectUrl(previewPath.value);
        const baseCandidates = buildPreviewUrlCandidates(previewPath.value, signed);
        const candidates = [.../* @__PURE__ */ new Set([
          ...baseCandidates,
          ...baseCandidates.map((url) => encodeURI(url))
        ])];
        for (const url of candidates) {
          const ok = await openExternal(url);
          if (ok) return;
        }
        if (runtimeIsTauri) {
          for (const url of candidates) {
            try {
              await invokeNative("open_external_url", { url });
              return;
            } catch {
            }
          }
        }
        if (typeof document !== "undefined") {
          const domFallback = candidates[0] || "";
          if (domFallback) {
            try {
              const anchor = document.createElement("a");
              anchor.href = domFallback;
              anchor.target = "_blank";
              anchor.rel = "noopener noreferrer";
              document.body.appendChild(anchor);
              anchor.click();
              document.body.removeChild(anchor);
              previewHint.value = "已触发浏览器下载，请检查系统浏览器";
              return;
            } catch {
            }
          }
        }
        previewHint.value = "无法打开外部下载链接，请稍后重试";
      } catch (error) {
        previewHint.value = error?.message || "无法打开下载链接";
      }
    };
    const toggleFullscreenPreview = () => {
      isViewerFullscreen.value = !isViewerFullscreen.value;
    };
    const exitViewerFullscreen = () => {
      isViewerFullscreen.value = false;
    };
    const loadConfig = async () => {
      loadingConfig.value = true;
      try {
        const config = await fetchRemoteConfig();
        const share = config?.resource_share || {};
        enabled.value = share.enabled !== false;
        endpoint.value = String(share.endpoint || DEFAULT_WEBDAV_ENDPOINT).trim() || DEFAULT_WEBDAV_ENDPOINT;
        username.value = String(share.username || "mini-hbut").trim() || "mini-hbut";
        password.value = String(share.password || "mini-hbut").trim() || "mini-hbut";
        officePreviewProxy.value = String(share.office_preview_proxy || "https://view.officeapps.live.com/op/embed.aspx?src=").trim() || "https://view.officeapps.live.com/op/embed.aspx?src=";
      } catch (error) {
        errorMessage.value = error?.message || "远程配置加载失败，已使用默认配置";
      } finally {
        loadingConfig.value = false;
      }
    };
    const handleWindowResizeCore = () => {
      if ((previewKind.value === "video" || previewKind.value === "audio") && showPreview.value && previewPlayerInstance?.resize) {
        if (mediaResizeTimer) {
          window.clearTimeout(mediaResizeTimer);
        }
        mediaResizeTimer = window.setTimeout(() => {
          mediaResizeTimer = null;
          try {
            previewPlayerInstance.resize();
          } catch {
          }
        }, 80);
      }
      if (previewKind.value === "pdf" && showPreview.value) {
        if (pdfResizeTimer) {
          window.clearTimeout(pdfResizeTimer);
        }
        pdfResizeTimer = window.setTimeout(() => {
          pdfResizeTimer = null;
          void renderPdfPage();
        }, 80);
      }
    };
    const handleWindowResize = () => {
      if (previewResizeRaf) return;
      previewResizeRaf = window.requestAnimationFrame(() => {
        previewResizeRaf = 0;
        handleWindowResizeCore();
      });
    };
    onMounted(async () => {
      window.addEventListener("resize", handleWindowResize);
      await loadConfig();
      if (enabled.value) {
        await listDirectory("/", false);
      } else {
        errorMessage.value = "资料分享模块已禁用";
      }
    });
    onBeforeUnmount(() => {
      window.removeEventListener("resize", handleWindowResize);
      if (previewResizeRaf) {
        window.cancelAnimationFrame(previewResizeRaf);
        previewResizeRaf = 0;
      }
      if (mediaResizeTimer) {
        window.clearTimeout(mediaResizeTimer);
        mediaResizeTimer = null;
      }
      if (pdfResizeTimer) {
        window.clearTimeout(pdfResizeTimer);
        pdfResizeTimer = null;
      }
      destroyPreviewPlayer();
      releasePreviewObjectUrl();
      void closePreview();
    });
    watch([showPreview, previewKind, previewUrl, loadingPreview], async ([open, kind, url, busy]) => {
      if (!open || busy || !url || kind !== "video" && kind !== "audio") {
        destroyPreviewPlayer();
        return;
      }
      await initPreviewPlayer();
    });
    watch(isViewerFullscreen, () => {
      if (previewPlayerInstance?.resize) {
        window.setTimeout(() => {
          try {
            previewPlayerInstance.resize();
          } catch {
          }
        }, 120);
      }
      if (previewKind.value === "pdf" && showPreview.value) {
        window.setTimeout(() => {
          void renderPdfPage();
        }, 120);
      }
    });
    const __returned__ = { emit, DIR_CACHE_TTL_MS, DIR_CACHE_STORAGE_KEY, DIRECT_URL_CACHE_TTL_MS, DEFAULT_WEBDAV_ENDPOINT, endpoint, username, password, officePreviewProxy, enabled, currentPath, items, loadingConfig, loadingList, loadingPreview, errorMessage, totalCount, showPreview, isViewerFullscreen, previewFrameKey, previewTitle, previewPath, previewKind, previewText, previewUrl, previewHint, previewNeedAuth, previewProxyFallbackUsed, officePreviewCandidates, pdfPreviewCandidates, previewUrlCandidates, previewObjectUrl, nativeBlobFallbackTried, pdfCanvasRef, pdfCanvasWrapRef, pdfDocumentRef, pdfCurrentPage, pdfPageCount, pdfRenderPending, pdfZoom, isPdfPanning, PDF_ZOOM_MIN, PDF_ZOOM_MAX, PDF_ZOOM_STEP, pdfPanState, previewPlayerHostRef, get previewPlayerInstance() {
      return previewPlayerInstance;
    }, set previewPlayerInstance(v) {
      previewPlayerInstance = v;
    }, get pdfjsRuntime() {
      return pdfjsRuntime;
    }, set pdfjsRuntime(v) {
      pdfjsRuntime = v;
    }, get xgPlayerCtor() {
      return xgPlayerCtor;
    }, set xgPlayerCtor(v) {
      xgPlayerCtor = v;
    }, get previewResizeRaf() {
      return previewResizeRaf;
    }, set previewResizeRaf(v) {
      previewResizeRaf = v;
    }, get mediaResizeTimer() {
      return mediaResizeTimer;
    }, set mediaResizeTimer(v) {
      mediaResizeTimer = v;
    }, get pdfResizeTimer() {
      return pdfResizeTimer;
    }, set pdfResizeTimer(v) {
      pdfResizeTimer = v;
    }, CDN_ASSETS, runtimeType, runtimeIsTauri, runtimeIsCapacitor, bridgeBaseCandidates, bridgeBase, normalizePath, joinPath, encodeDavPath, getDavUrl, getDavAuthUrl, getProxyUrl, getProxyUrlByBase, buildProxyCandidates, imageExts, videoExts, audioExts, textExts, wordExts, sheetExts, slideExts, officeExts, getExt, formatSize, formatTime, getItemIcon, getItemTypeLabel, getTypeClass, buildTestAccountResourceShareItems, getTestAccountResourceText, getTestAccountResourceDirectUrl, fetchWithTimeout, makeAuthHeader, parseJsonStorage, saveJsonStorage, dirCache, directUrlCache, textByLocalName, parseHrefPath, parsePropfindXml, breadcrumbItems, canGoParent, getParentPath, fetchDirectoryViaNative, listDirectory, buildOfficePreviewUrl, buildOfficePreviewCandidates, parseDirectUrlExpireAt, withCacheBustUrl, buildPreviewUrlCandidates, shiftNextPreviewCandidate, decodeBase64Bytes, releasePreviewObjectUrl, createPreviewObjectUrl, fetchDirectUrlByNativeInvoke, fetchDirectUrlFromBridge, getSignedDirectUrl, fetchNativeResourcePayload, applyNativeBlobPreview, resolvePreviewPlayableUrl, fetchTextWithAuth, closePreview, setPreviewUrl, onPreviewFrameError, ensurePdfRuntime, ensureXgplayerRuntime, renderPdfPage, openPdfWithCandidates, prevPdfPage, nextPdfPage, pdfZoomText, clampPdfZoom, setPdfZoom, zoomInPdf, zoomOutPdf, resetPdfZoom, onPdfPanPointerDown, onPdfPanPointerMove, onPdfPanPointerUp, destroyPreviewPlayer, initPreviewPlayer, onPreviewMediaError, onPreviewImageError, preparePreview, openItem, goParent, refreshCurrent, openBreadcrumb, openDownload, toggleFullscreenPreview, exitViewerFullscreen, loadConfig, handleWindowResizeCore, handleWindowResize, computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, markRaw, watch, get fetchRemoteConfig() {
      return fetchRemoteConfig;
    }, get openExternal() {
      return openExternal;
    }, get invokeNative() {
      return invokeNative;
    }, get isTauriRuntime() {
      return isTauriRuntime;
    }, get detectRuntime() {
      return detectRuntime;
    }, get importModuleFromCdn() {
      return importModuleFromCdn;
    }, get loadScriptFromCdn() {
      return loadScriptFromCdn;
    }, get loadStyleFromCdn() {
      return loadStyleFromCdn;
    }, get isTestAccountSession() {
      return isTestAccountSession;
    }, get TPageHeader() {
      return _sfc_main$1;
    } };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
};
const ResourceShareView = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", render], ["__scopeId", "data-v-5d2edb5b"]]);
export {
  ResourceShareView as default
};
