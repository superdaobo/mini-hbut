const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./school_website_embed-DWdoZd7Q.js","./runtime-bridge-apFQ0nCw.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc, o as openExternal } from "./app-demo-CxKBY5JQ.js";
import { forceCloseSchoolWebsiteEmbed, resolveSchoolWebsiteEmbedMode, mountSchoolWebsiteEmbed, SCHOOL_WEBSITE_URL, resolveSchoolWebsiteIframeUrl } from "./school_website_embed-DWdoZd7Q.js";
import { o as onMounted, z as nextTick, m as onBeforeUnmount, c as createElementBlock, b as openBlock, d as createBaseVNode, f as createCommentVNode, a as ref, t as toDisplayString, e as computed } from "./vue-core-DdLVj9yW.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "school-website-view" };
const _hoisted_2 = {
  key: 0,
  class: "frame-overlay"
};
const _hoisted_3 = {
  key: 1,
  class: "frame-message frame-message--error"
};
const _hoisted_4 = {
  key: 2,
  class: "frame-message frame-message--hint"
};
const _hoisted_5 = ["src"];
const _sfc_main = {
  __name: "SchoolWebsiteView",
  emits: ["back"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const emit = __emit;
    const leaving = ref(false);
    const frameShellRef = ref(null);
    const embedMode = ref("direct-iframe");
    const loading = ref(true);
    const loadError = ref("");
    const loadHint = ref("");
    const useNativeEmbed = computed(() => embedMode.value === "tauri-webview");
    const useExternalOnly = computed(() => embedMode.value === "external-open");
    const iframeSrc = computed(() => {
      if (useNativeEmbed.value || useExternalOnly.value) return "";
      const mode = embedMode.value === "proxy-iframe" ? "proxy-iframe" : "direct-iframe";
      return resolveSchoolWebsiteIframeUrl(mode);
    });
    let loadingGuardTimer = null;
    let embedCleanup = null;
    const hasIframeLoadedOnce = ref(false);
    const clearLoadingGuardTimer = () => {
      if (loadingGuardTimer) {
        clearTimeout(loadingGuardTimer);
        loadingGuardTimer = null;
      }
    };
    const showBridgeUnavailable = (reason = "bridge") => {
      clearLoadingGuardTimer();
      loading.value = false;
      loadHint.value = "";
      if (reason === "external-only" || reason === "android") {
        loadError.value = "当前环境无法在应用内嵌学校官网，请点击下方按钮在系统浏览器中打开。";
        return;
      }
      loadError.value = "本地桥接服务暂时不可用，无法在应用内加载学校官网。可点「重试加载」；若仍失败请在浏览器中打开。";
    };
    const resetIframeState = () => {
      clearLoadingGuardTimer();
      hasIframeLoadedOnce.value = false;
      loading.value = true;
      loadError.value = "";
      loadHint.value = "";
      loadingGuardTimer = window.setTimeout(() => {
        if (!loading.value || useNativeEmbed.value || useExternalOnly.value) return;
        loading.value = false;
        loadHint.value = "页面加载较慢，若长时间空白可尝试在浏览器中打开。";
      }, 4500);
    };
    const handleLoad = () => {
      if (useNativeEmbed.value || useExternalOnly.value) return;
      clearLoadingGuardTimer();
      hasIframeLoadedOnce.value = true;
      loading.value = false;
      loadError.value = "";
      loadHint.value = "";
    };
    const handleError = () => {
      if (useNativeEmbed.value || useExternalOnly.value) return;
      if (embedMode.value === "proxy-iframe" && hasIframeLoadedOnce.value) return;
      if (embedMode.value === "proxy-iframe") {
        showBridgeUnavailable();
        return;
      }
      clearLoadingGuardTimer();
      loading.value = false;
      loadError.value = "官网页面无法在应用内嵌入显示，请点击下方按钮在浏览器中打开。";
      loadHint.value = "";
    };
    const handleOpenExternal = async () => {
      await openExternal(SCHOOL_WEBSITE_URL);
    };
    const cleanupEmbed = async () => {
      clearLoadingGuardTimer();
      hasIframeLoadedOnce.value = false;
      if (embedCleanup) {
        const cleanup = embedCleanup;
        embedCleanup = null;
        await cleanup();
      }
    };
    const mountEmbed = async () => {
      const container = frameShellRef.value;
      if (!container) return;
      await cleanupEmbed();
      embedMode.value = await resolveSchoolWebsiteEmbedMode();
      if (embedMode.value === "external-open") {
        const androidLike = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
        showBridgeUnavailable(androidLike ? "android" : "external-only");
        return;
      }
      if (embedMode.value === "tauri-webview") {
        try {
          const mounted = await mountSchoolWebsiteEmbed({
            container,
            onReady: () => {
              loading.value = false;
              loadError.value = "";
              loadHint.value = "";
            },
            onError: (message) => {
              loadError.value = message;
            }
          });
          embedCleanup = mounted.cleanup;
          return;
        } catch {
          loading.value = false;
          loadError.value = "创建学校官网内嵌视图失败，请点击下方按钮在浏览器中打开。";
          return;
        }
      }
      resetIframeState();
    };
    const remountAfterResume = async (eventDetail = null) => {
      loading.value = true;
      loadError.value = "";
      loadHint.value = "";
      try {
        const { recoverSchoolWebsiteBridgeOnResume } = await __vitePreload(async () => {
          const { recoverSchoolWebsiteBridgeOnResume: recoverSchoolWebsiteBridgeOnResume2 } = await import("./school_website_embed-DWdoZd7Q.js");
          return { recoverSchoolWebsiteBridgeOnResume: recoverSchoolWebsiteBridgeOnResume2 };
        }, true ? __vite__mapDeps([0,1,2,3]) : void 0, import.meta.url);
        await recoverSchoolWebsiteBridgeOnResume();
      } catch {
      }
      await cleanupEmbed();
      await nextTick();
      await mountEmbed();
      if (eventDetail?.forceFallback && embedMode.value === "external-open" && !loadError.value) {
        showBridgeUnavailable("bridge");
      }
    };
    const handleRetryEmbed = () => {
      void remountAfterResume({ forceFallback: true });
    };
    const handleBack = async () => {
      if (leaving.value) return;
      leaving.value = true;
      try {
        await forceCloseSchoolWebsiteEmbed();
      } catch {
      }
      try {
        await cleanupEmbed();
      } catch {
      }
      try {
        await forceCloseSchoolWebsiteEmbed();
      } catch {
      }
      emit("back");
      window.setTimeout(() => {
        void forceCloseSchoolWebsiteEmbed();
      }, 0);
      window.setTimeout(() => {
        void forceCloseSchoolWebsiteEmbed();
      }, 120);
    };
    const handleVisibilityForEmbed = () => {
      if (document.hidden || leaving.value) return;
      if (loadError.value || embedMode.value === "proxy-iframe") {
        void remountAfterResume();
      }
    };
    const handleAppEmbedResumeEvent = (event) => {
      if (leaving.value) return;
      const view = String(event?.detail?.view || "");
      if (view !== "school_website") return;
      void remountAfterResume(event?.detail || null);
    };
    onMounted(() => {
      document.addEventListener("visibilitychange", handleVisibilityForEmbed);
      window.addEventListener("hbu-embed-resume", handleAppEmbedResumeEvent);
      void nextTick().then(() => mountEmbed());
    });
    onBeforeUnmount(() => {
      document.removeEventListener("visibilitychange", handleVisibilityForEmbed);
      window.removeEventListener("hbu-embed-resume", handleAppEmbedResumeEvent);
      void cleanupEmbed().finally(() => {
        void forceCloseSchoolWebsiteEmbed();
      });
    });
    __expose({ remountAfterResume });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", { class: "subpage-header" }, [
          createBaseVNode("button", {
            class: "back-button",
            type: "button",
            onClick: handleBack,
            "aria-label": "返回"
          }, [..._cache[0] || (_cache[0] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
          ])]),
          _cache[2] || (_cache[2] = createBaseVNode("div", { class: "header-copy" }, [
            createBaseVNode("span", { class: "header-kicker" }, "我的"),
            createBaseVNode("h1", null, "学校官网")
          ], -1)),
          createBaseVNode("button", {
            class: "external-button",
            type: "button",
            onClick: handleOpenExternal,
            "aria-label": "在浏览器中打开"
          }, [..._cache[1] || (_cache[1] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "open_in_new", -1)
          ])])
        ]),
        createBaseVNode("div", {
          ref_key: "frameShellRef",
          ref: frameShellRef,
          class: "frame-shell"
        }, [
          loading.value ? (openBlock(), createElementBlock("div", _hoisted_2, [..._cache[3] || (_cache[3] = [
            createBaseVNode("span", { class: "material-symbols-outlined spinning" }, "progress_activity", -1),
            createBaseVNode("p", null, "正在加载学校官网…", -1)
          ])])) : createCommentVNode("", true),
          loadError.value ? (openBlock(), createElementBlock("div", _hoisted_3, [
            createBaseVNode("p", null, toDisplayString(loadError.value), 1),
            createBaseVNode("div", { class: "frame-message-actions" }, [
              createBaseVNode("button", {
                class: "external-open-btn",
                type: "button",
                onClick: handleRetryEmbed
              }, "重试加载"),
              createBaseVNode("button", {
                class: "external-open-btn",
                type: "button",
                onClick: handleOpenExternal
              }, "在浏览器中打开")
            ])
          ])) : loadHint.value ? (openBlock(), createElementBlock("div", _hoisted_4, [
            createBaseVNode("p", null, toDisplayString(loadHint.value), 1),
            createBaseVNode("button", {
              class: "external-open-btn",
              type: "button",
              onClick: handleOpenExternal
            }, "在浏览器中打开")
          ])) : createCommentVNode("", true),
          !useNativeEmbed.value && !useExternalOnly.value && iframeSrc.value ? (openBlock(), createElementBlock("iframe", {
            key: 3,
            class: "website-frame",
            src: iframeSrc.value,
            title: "湖北工业大学官网",
            allowfullscreen: "",
            referrerpolicy: "no-referrer-when-downgrade",
            loading: "eager",
            onLoad: handleLoad,
            onError: handleError
          }, null, 40, _hoisted_5)) : createCommentVNode("", true)
        ], 512)
      ]);
    };
  }
};
const SchoolWebsiteView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b320d3e2"]]);
export {
  SchoolWebsiteView as default
};
