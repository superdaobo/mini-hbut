const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-BimU7Kjk.js","./more-modules-DshM5kk8.js"])))=>i.map(i=>d[i]);
import { _ as _sfc_main$2 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { _ as _export_sfc, b as useLocale, p as openExternal, c as useAuthStore } from "./app-demo-D7XNtlJ4.js";
import { aa as isTauriDesktopRuntime, a as isTauriRuntime, b as isLikelyAndroidUserAgent, a9 as isLikelyIOSUserAgent, d as invokeNative, z as detectRuntime, _ as __vitePreload } from "./runtime-bridge-BimU7Kjk.js";
import { T as TCollapse } from "./TCollapse-CedWHAss.js";
import { x as watch, p as onBeforeUnmount, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, k as createVNode, l as withCtx, d as createCommentVNode, r as ref, h as computed, C as nextTick, F as Fragment, f as renderList, n as normalizeClass, j as createBlock } from "./vue-core-CVT-P0lT.js";
import "./more-modules-DshM5kk8.js";
import "./debug-tools-Qn_xy0xQ.js";
import "./capture-C0vEZJ2q.js";
const LIBRARY_RESERVE_EMBED_PREFIX = "/reserve-embed/";
const LOCAL_BRIDGE_BASE = detectRuntime() === "tauri" ? "http://127.0.0.1:4399" : "/bridge";
const bridgeBase = () => LOCAL_BRIDGE_BASE.replace(/\/$/, "");
const probeLibraryReserveProxyReachable = async () => {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    try {
      const health = await fetch(`${bridgeBase()}/health`, {
        method: "GET",
        signal: controller.signal
      });
      if (health.ok) {
        window.clearTimeout(timer);
        return true;
      }
    } catch {
    }
    const response = await fetch(`${bridgeBase()}${LIBRARY_RESERVE_EMBED_PREFIX}`, {
      method: "HEAD",
      signal: controller.signal
    });
    window.clearTimeout(timer);
    return response.status > 0;
  } catch {
    return false;
  }
};
const resolveLibraryReserveEmbedMode = async () => {
  if (isTauriDesktopRuntime()) return "native-webview";
  if (isTauriRuntime() && isLikelyAndroidUserAgent()) return "external-open";
  if (isTauriRuntime() && isLikelyIOSUserAgent()) {
    return await probeLibraryReserveProxyReachable() ? "proxy-iframe" : "external-open";
  }
  return "external-open";
};
const retryLibraryReserveEmbedMode = async () => {
  if (isTauriDesktopRuntime()) return "native-webview";
  if (!isTauriRuntime() || isLikelyAndroidUserAgent()) return "external-open";
  try {
    const result = await invokeNative("ensure_http_bridge");
    if (result?.healthy === true) return "proxy-iframe";
    if (result?.enabled === false) return "external-open";
  } catch {
  }
  return await probeLibraryReserveProxyReachable() ? "proxy-iframe" : "external-open";
};
const fetchLibraryReserveEmbedProxyInfo = async (input) => {
  const info = await invokeNative(
    "library_reserve_embed_proxy_url",
    {
      req: {
        app: input.app,
        kind: input.kind ?? "live",
        force: input.force ?? false
      }
    }
  );
  if (!info || typeof info.url !== "string" || !info.url || typeof info.entryUrl !== "string") {
    throw new Error("library_reserve_embed_proxy_url returned empty");
  }
  return info;
};
const _hoisted_1$1 = { class: "card embed" };
const _hoisted_2$1 = { class: "embed__head" };
const _hoisted_3$1 = { class: "embed__title" };
const _hoisted_4$1 = { class: "embed__badge" };
const _hoisted_5$1 = ["disabled"];
const _hoisted_6$1 = { class: "hint" };
const _hoisted_7$1 = { class: "hint" };
const _hoisted_8 = {
  key: 0,
  class: "err"
};
const _hoisted_9 = {
  key: 2,
  class: "embed__host embed__host--frame"
};
const _hoisted_10 = {
  key: 0,
  class: "hint embed__loading"
};
const _hoisted_11 = ["src", "title"];
const _hoisted_12 = {
  key: 3,
  class: "fallback"
};
const _hoisted_13 = { class: "hint" };
const _hoisted_14 = ["disabled"];
const _sfc_main$1 = {
  __name: "LibraryReserveEmbed",
  props: {
    /** 应用标识：seat / quiet_room / seminar_room */
    app: { type: String, required: true },
    /** 页面形态：live（座位快速预约页）/ index（入口落地页） */
    kind: { type: String, default: "live" }
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const { t } = useLocale();
    const mode = ref("native-webview");
    const host = ref(null);
    const opened = ref(false);
    const busy = ref(false);
    const error = ref("");
    const iframeSrc = ref("");
    const entryUrl = ref("");
    const fallbackVisible = ref(false);
    const frameLoading = ref(false);
    const useNativeEmbed = computed(() => mode.value === "native-webview");
    const useIframe = computed(() => mode.value === "proxy-iframe" && !!iframeSrc.value);
    let resizeObserver = null;
    let syncTimer = null;
    const boundsOf = () => {
      const el = host.value;
      if (!el || !el.isConnected) return null;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.round(rect.left));
      const y = Math.max(0, Math.round(rect.top));
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (width < 8 || height < 8) return null;
      return { x, y, width, height };
    };
    const sync = async () => {
      if (!opened.value || !useNativeEmbed.value) return;
      const bounds = boundsOf();
      if (!bounds) return;
      try {
        await invokeNative("library_reserve_embed_resize", { bounds });
      } catch {
      }
    };
    const onViewportChange = () => {
      void sync();
    };
    const stopSync = () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (syncTimer !== null) {
        window.clearInterval(syncTimer);
        syncTimer = null;
      }
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
    const startSync = () => {
      stopSync();
      resizeObserver = new ResizeObserver(onViewportChange);
      if (host.value) resizeObserver.observe(host.value);
      if (host.value?.parentElement) resizeObserver.observe(host.value.parentElement);
      window.addEventListener("resize", onViewportChange);
      window.addEventListener("scroll", onViewportChange, true);
      syncTimer = window.setInterval(onViewportChange, 400);
    };
    const waitForLayout = () => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const openNativeEmbed = async () => {
      opened.value = true;
      await nextTick();
      host.value?.scrollIntoView({ block: "nearest", inline: "nearest" });
      await waitForLayout();
      const bounds = boundsOf();
      if (!bounds) {
        opened.value = false;
        error.value = t("library.reserve.embed.error");
        return;
      }
      await invokeNative("library_reserve_embed_open", {
        req: { app: props.app, kind: props.kind, bounds }
      });
      startSync();
    };
    const open = async () => {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      fallbackVisible.value = false;
      try {
        let resolved = await resolveLibraryReserveEmbedMode();
        if (resolved === "external-open") {
          resolved = await retryLibraryReserveEmbedMode();
        }
        mode.value = resolved;
        if (resolved === "native-webview") {
          await openNativeEmbed();
          return;
        }
        if (resolved === "proxy-iframe") {
          const info = await fetchLibraryReserveEmbedProxyInfo({
            app: props.app,
            kind: props.kind
          });
          entryUrl.value = info.entryUrl;
          iframeSrc.value = info.url;
          frameLoading.value = true;
          opened.value = true;
          return;
        }
        opened.value = false;
        fallbackVisible.value = true;
      } catch (e) {
        opened.value = false;
        iframeSrc.value = "";
        const detail = String(e?.message ?? e ?? "");
        if (detail) {
          try {
            const { pushDebugLog } = await __vitePreload(async () => {
              const { pushDebugLog: pushDebugLog2 } = await import("./runtime-bridge-BimU7Kjk.js").then((n) => n.ag);
              return { pushDebugLog: pushDebugLog2 };
            }, true ? __vite__mapDeps([0,1]) : void 0, import.meta.url);
            pushDebugLog("LibraryReserve", `embed open failed: ${detail}`, "warn");
          } catch {
          }
        }
        error.value = t("library.reserve.embed.error");
      } finally {
        busy.value = false;
      }
    };
    const close = async () => {
      stopSync();
      opened.value = false;
      iframeSrc.value = "";
      frameLoading.value = false;
      fallbackVisible.value = false;
      try {
        await invokeNative("library_reserve_embed_close");
      } catch {
      }
    };
    const onIframeLoad = () => {
      frameLoading.value = false;
    };
    const onIframeError = () => {
      frameLoading.value = false;
      if (useNativeEmbed.value) return;
      error.value = t("library.reserve.embed.error");
      fallbackVisible.value = true;
    };
    const openInBrowser = async () => {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        let target = entryUrl.value;
        if (!target) {
          const info = await fetchLibraryReserveEmbedProxyInfo({
            app: props.app,
            kind: props.kind
          });
          entryUrl.value = info.entryUrl;
          target = info.entryUrl;
        }
        const ok = await openExternal(target);
        if (!ok) error.value = t("library.reserve.embed.error");
      } catch (e) {
        const detail = String(e?.message ?? e ?? "");
        if (detail) {
          try {
            const { pushDebugLog } = await __vitePreload(async () => {
              const { pushDebugLog: pushDebugLog2 } = await import("./runtime-bridge-BimU7Kjk.js").then((n) => n.ag);
              return { pushDebugLog: pushDebugLog2 };
            }, true ? __vite__mapDeps([0,1]) : void 0, import.meta.url);
            pushDebugLog("LibraryReserve", `embed external open failed: ${detail}`, "warn");
          } catch {
          }
        }
        error.value = t("library.reserve.embed.error");
      } finally {
        busy.value = false;
      }
    };
    watch(
      () => [props.app, props.kind],
      () => {
        if (opened.value || fallbackVisible.value) void close();
      }
    );
    onBeforeUnmount(() => {
      void close();
    });
    __expose({ open, close });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("div", _hoisted_3$1, [
            createBaseVNode("strong", null, toDisplayString(unref(t)("library.reserve.embed.title")), 1),
            createBaseVNode("span", _hoisted_4$1, toDisplayString(unref(t)("library.reserve.embed.badge")), 1)
          ]),
          !opened.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            type: "button",
            class: "primary embed__btn",
            disabled: busy.value,
            onClick: open
          }, toDisplayString(busy.value ? unref(t)("library.reserve.embed.opening") : unref(t)("library.reserve.embed.open")), 9, _hoisted_5$1)) : (openBlock(), createElementBlock("button", {
            key: 1,
            type: "button",
            class: "ghost embed__btn",
            onClick: close
          }, toDisplayString(unref(t)("library.reserve.embed.close")), 1))
        ]),
        createBaseVNode("p", _hoisted_6$1, toDisplayString(unref(t)("library.reserve.embed.hintShort")), 1),
        createVNode(unref(TCollapse), {
          title: unref(t)("library.reserve.collapse.hint")
        }, {
          default: withCtx(() => [
            createBaseVNode("p", _hoisted_7$1, toDisplayString(unref(t)("library.reserve.embed.hint")), 1)
          ]),
          _: 1
        }, 8, ["title"]),
        error.value ? (openBlock(), createElementBlock("p", _hoisted_8, toDisplayString(error.value), 1)) : createCommentVNode("", true),
        opened.value && useNativeEmbed.value ? (openBlock(), createElementBlock("div", {
          key: 1,
          ref_key: "host",
          ref: host,
          class: "embed__host"
        }, null, 512)) : createCommentVNode("", true),
        opened.value && useIframe.value ? (openBlock(), createElementBlock("div", _hoisted_9, [
          frameLoading.value ? (openBlock(), createElementBlock("p", _hoisted_10, toDisplayString(unref(t)("library.reserve.embed.opening")), 1)) : createCommentVNode("", true),
          createBaseVNode("iframe", {
            class: "embed__frame",
            src: iframeSrc.value,
            title: unref(t)("library.reserve.embed.iframeTitle"),
            referrerpolicy: "no-referrer-when-downgrade",
            loading: "eager",
            onLoad: onIframeLoad,
            onError: onIframeError
          }, null, 40, _hoisted_11)
        ])) : createCommentVNode("", true),
        fallbackVisible.value ? (openBlock(), createElementBlock("div", _hoisted_12, [
          createBaseVNode("p", _hoisted_13, toDisplayString(unref(t)("library.reserve.embed.externalHint")), 1),
          createBaseVNode("button", {
            type: "button",
            class: "ghost embed__btn",
            disabled: busy.value,
            onClick: openInBrowser
          }, toDisplayString(unref(t)("library.reserve.embed.externalOpen")), 9, _hoisted_14)
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const LibraryReserveEmbed = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-85a69ce8"]]);
const _hoisted_1 = { class: "page" };
const _hoisted_2 = { class: "body" };
const _hoisted_3 = {
  key: 0,
  class: "guide"
};
const _hoisted_4 = { class: "guide__title" };
const _hoisted_5 = { class: "guide__desc" };
const _hoisted_6 = ["aria-label"];
const _hoisted_7 = ["aria-selected", "onClick"];
const _sfc_main = {
  __name: "ChaoxingReserveView",
  emits: ["back", "require-login"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const authStore = useAuthStore();
    const emit = __emit;
    const TABS = ["seat", "quiet", "room"];
    const activeTab = ref("seat");
    const canUse = computed(() => Boolean(authStore.isLoggedIn && authStore.sessionVerified));
    const selectTab = (tabKey) => {
      activeTab.value = tabKey;
    };
    const goLogin = () => emit("require-login");
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$2), {
          title: unref(t)("home.module.chaoxing_reserve"),
          icon: "web_asset",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        createBaseVNode("div", _hoisted_2, [
          !canUse.value ? (openBlock(), createElementBlock("section", _hoisted_3, [
            _cache[1] || (_cache[1] = createBaseVNode("span", {
              class: "guide__icon material-symbols-outlined",
              "aria-hidden": "true"
            }, "account_circle", -1)),
            createBaseVNode("h2", _hoisted_4, toDisplayString(unref(t)("library.reserve.login.title")), 1),
            createBaseVNode("p", _hoisted_5, toDisplayString(unref(t)("library.reserve.login.desc")), 1),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              onClick: goLogin
            }, toDisplayString(unref(t)("library.reserve.login.action")), 1)
          ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", {
              class: "tabs",
              role: "tablist",
              "aria-label": unref(t)("home.module.chaoxing_reserve")
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(TABS, (tabKey) => {
                return createBaseVNode("button", {
                  key: tabKey,
                  type: "button",
                  class: normalizeClass(["tab", { active: activeTab.value === tabKey }]),
                  role: "tab",
                  "aria-selected": activeTab.value === tabKey,
                  onClick: ($event) => selectTab(tabKey)
                }, toDisplayString(unref(t)(`library.reserve.tab.${tabKey}`)), 11, _hoisted_7);
              }), 64))
            ], 8, _hoisted_6),
            activeTab.value === "seat" ? (openBlock(), createBlock(LibraryReserveEmbed, {
              key: 0,
              app: "seat",
              kind: "live"
            })) : activeTab.value === "quiet" ? (openBlock(), createBlock(LibraryReserveEmbed, {
              key: 1,
              app: "quiet_room",
              kind: "index"
            })) : (openBlock(), createBlock(LibraryReserveEmbed, {
              key: 2,
              app: "seminar_room",
              kind: "index"
            }))
          ], 64))
        ])
      ]);
    };
  }
};
const ChaoxingReserveView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-4ca85a8f"]]);
export {
  ChaoxingReserveView as default
};
