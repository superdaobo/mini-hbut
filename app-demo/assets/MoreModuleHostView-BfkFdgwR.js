const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./school_website_embed-DWdoZd7Q.js","./runtime-bridge-apFQ0nCw.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload, p as pushDebugLog } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { _ as _export_sfc, o as openExternal } from "./app-demo-CxKBY5JQ.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { p as isLocalModuleBridgePreviewUrl, o as canUseLocalModuleBridgePreview, r as resolveModuleHostPreviewSource } from "./more-modules-CsUTdMqs.js";
import { w as watch, o as onMounted, m as onBeforeUnmount, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, l as withCtx, e as computed, u as unref, f as createCommentVNode, F as Fragment, i as renderList, t as toDisplayString, n as normalizeClass, a as ref, g as createTextVNode } from "./vue-core-DdLVj9yW.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "more-module-host-view" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "more-module-host-view__body" };
const _hoisted_4 = {
  key: 0,
  class: "module-runtime-strip"
};
const _hoisted_5 = ["title"];
const _hoisted_6 = {
  key: 1,
  class: "module-empty-card"
};
const _hoisted_7 = {
  key: 0,
  class: "module-loading-overlay"
};
const _hoisted_8 = {
  key: 1,
  class: "module-frame-error"
};
const _hoisted_9 = {
  key: 2,
  class: "module-frame-hint"
};
const _hoisted_10 = ["src"];
const _sfc_main = {
  __name: "MoreModuleHostView",
  props: {
    session: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const frameKey = ref(0);
    const frameRef = ref(null);
    const frameContentHeight = ref(0);
    const loading = ref(true);
    const loadError = ref("");
    const externalOpenUrl = ref("");
    const loadHint = ref("");
    const usedCapacitorLocalFallback = ref(false);
    let loadingGuardTimer = null;
    let frameSizeHintTimer = null;
    let capacitorFallbackTimer = null;
    const safeText = (value) => String(value ?? "").trim();
    const moduleName = computed(() => safeText(props.session?.module_name) || "远程模块");
    const moduleId = computed(() => safeText(props.session?.module_id));
    const moduleVersion = computed(() => safeText(props.session?.version));
    const minCompatibleVersion = computed(() => safeText(props.session?.min_compatible_version));
    const moduleChannel = computed(() => safeText(props.session?.channel) || "main");
    const invalidReason = computed(() => safeText(props.session?.invalid_reason || props.session?.invalidReason));
    const resolvedPreviewSource = computed(() => resolveModuleHostPreviewSource(props.session || {}));
    const previewMode = computed(() => {
      const resolvedKind = safeText(resolvedPreviewSource.value?.sourceKind);
      if (resolvedKind && resolvedKind !== "invalid") {
        return resolvedKind;
      }
      const fallbackMode = safeText(props.session?.preview_mode || props.session?.previewMode);
      if (!canUseLocalModuleBridgePreview() && fallbackMode === "tauri-local") {
        return "";
      }
      return fallbackMode;
    });
    const previewUrl = computed(() => {
      const resolvedUrl = safeText(resolvedPreviewSource.value?.resolvedPreviewUrl);
      const raw = resolvedUrl || (canUseLocalModuleBridgePreview() ? safeText(props.session?.preview_url) : "");
      if (isLocalModuleBridgePreviewUrl(raw) && !canUseLocalModuleBridgePreview()) {
        return "";
      }
      return raw;
    });
    const capacitorLocalFallbackUrl = computed(() => {
      if (usedCapacitorLocalFallback.value) return "";
      const localUrl = safeText(resolvedPreviewSource.value?.localPreviewUrl || props.session?.local_preview_url);
      if (!localUrl || localUrl === previewUrl.value) return "";
      if (isLocalModuleBridgePreviewUrl(localUrl)) return "";
      return localUrl;
    });
    const ready = computed(() => !!previewUrl.value);
    const emptyStateMessage = computed(() => {
      if (invalidReason.value === "local-cache-missing" || previewMode.value === "capacitor-local") {
        return "本地模块缓存缺失或入口失效，请返回更多页重新下载模块。";
      }
      if (invalidReason.value === "tauri-bridge-blocked" || isLocalModuleBridgePreviewUrl(safeText(props.session?.preview_url))) {
        return "当前运行时已禁止桌面本地桥地址，请返回更多页重新进入模块。";
      }
      return "模块预览地址缺失，请返回更多页重新进入。";
    });
    const withFrameCacheBust = (url, keyParts = []) => {
      const text = safeText(url);
      if (!text) return "";
      const [basePart, hashPart = ""] = text.split("#", 2);
      if (!basePart) return text;
      const token = keyParts.map((item) => safeText(item)).filter(Boolean).join("-");
      const params = new URLSearchParams();
      params.set("_host_frame_v", token || `${Date.now()}`);
      const joiner = basePart.includes("?") ? "&" : "?";
      const nextUrl = `${basePart}${joiner}${params.toString()}`;
      return hashPart ? `${nextUrl}#${hashPart}` : nextUrl;
    };
    const activePreviewUrl = computed(() => {
      if (usedCapacitorLocalFallback.value) {
        const localUrl = safeText(resolvedPreviewSource.value?.localPreviewUrl || props.session?.local_preview_url);
        if (localUrl && !isLocalModuleBridgePreviewUrl(localUrl)) return localUrl;
      }
      return previewUrl.value;
    });
    const frameSrc = computed(
      () => withFrameCacheBust(activePreviewUrl.value, [
        moduleChannel.value || "main",
        moduleVersion.value || "unknown",
        String(frameKey.value)
      ])
    );
    const formatModuleChannel = (value) => {
      const channel = safeText(value).toLowerCase();
      if (channel === "latest") return "最新包";
      if (channel === "main") return "正式渠道";
      if (channel === "dev") return "测试渠道";
      return channel ? `渠道 ${channel}` : "";
    };
    const formatModuleVersion = (value) => {
      const raw = safeText(value);
      if (!raw) return "";
      const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:-([a-z0-9]+))?$/i);
      if (!match) return raw.replace(/^v/i, "");
      const [, year, month, day, hour, minute, _second, hash] = match;
      return hash ? `${year}-${month}-${day} ${hour}:${minute} · ${hash}` : `${year}-${month}-${day} ${hour}:${minute}`;
    };
    const moduleRuntimeBadges = computed(() => {
      const badges = ["内嵌运行"];
      if (previewMode.value === "capacitor-local") badges.push("安卓本地包");
      if (previewMode.value === "tauri-local") badges.push("桌面本地包");
      if (previewMode.value === "remote-site") badges.push("远端页面");
      const channel = formatModuleChannel(moduleChannel.value);
      const version = formatModuleVersion(moduleVersion.value);
      if (channel) badges.push(channel);
      if (version) badges.push(`构建 ${version}`);
      if (minCompatibleVersion.value) {
        badges.push(`兼容 >= ${minCompatibleVersion.value}`);
      }
      return badges;
    });
    const hasEmbeddedFrameHeight = computed(() => frameContentHeight.value > 0);
    const clearLoadingGuardTimer = () => {
      if (loadingGuardTimer) {
        clearTimeout(loadingGuardTimer);
        loadingGuardTimer = null;
      }
    };
    const clearFrameSizeHintTimer = () => {
      if (frameSizeHintTimer) {
        clearTimeout(frameSizeHintTimer);
        frameSizeHintTimer = null;
      }
    };
    const clearCapacitorFallbackTimer = () => {
      if (capacitorFallbackTimer) {
        clearTimeout(capacitorFallbackTimer);
        capacitorFallbackTimer = null;
      }
    };
    const scheduleFrameSizeFallback = () => {
      clearFrameSizeHintTimer();
      frameSizeHintTimer = window.setTimeout(() => {
        if (frameContentHeight.value > 0 || loadError.value) return;
        frameContentHeight.value = 800;
        loading.value = false;
        loadHint.value = "模块页面已加载，使用默认显示高度。";
        pushDebugLog("ModuleHost", `使用默认高度 800px（模块未上报尺寸）`, "info");
        const isIos = /(iphone|ipad|ipod)/i.test(String(globalThis?.navigator?.userAgent || ""));
        if (isIos) {
          window.setTimeout(() => {
            if (frameContentHeight.value === 800 && !loadError.value) {
              const src = frameSrc.value;
              if (src && src.startsWith("http")) {
                externalOpenUrl.value = src;
                loadHint.value = "iOS 设备可能无法嵌入显示，可尝试在浏览器中打开。";
                pushDebugLog("ModuleHost", `iOS 白屏检测触发，提供外部打开`, "warn", { src: src?.slice(0, 100) });
              }
            }
          }, 6e3);
        }
      }, 3500);
    };
    const tryCapacitorLocalFallback = () => {
      const fallbackUrl = capacitorLocalFallbackUrl.value;
      if (!fallbackUrl) return false;
      usedCapacitorLocalFallback.value = true;
      frameKey.value += 1;
      resetFrameState();
      return true;
    };
    const scheduleConnectionRefusedRetry = () => {
      capacitorFallbackTimer = window.setTimeout(() => {
        if (frameContentHeight.value > 0) return;
        if (usedCapacitorLocalFallback.value) return;
        const currentSrc = frameSrc.value;
        if (!currentSrc || !currentSrc.includes("127.0.0.1")) return;
        if (tryCapacitorLocalFallback()) {
          loadHint.value = "本地桥接连接超时，切换到备用地址...";
        }
      }, 3e3);
    };
    const scheduleFrameSizeHint = () => {
      clearFrameSizeHintTimer();
      frameSizeHintTimer = window.setTimeout(() => {
        if (frameContentHeight.value > 0 || loadError.value) return;
        loadHint.value = "模块页面已加载，正在等待模块上报真实高度。";
      }, 1200);
    };
    const resetFrameState = () => {
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      clearCapacitorFallbackTimer();
      frameContentHeight.value = 0;
      loading.value = ready.value;
      loadError.value = "";
      loadHint.value = "";
      externalOpenUrl.value = "";
      pushDebugLog("ModuleHost", `iframe 开始加载`, "info", {
        src: frameSrc.value?.slice(0, 150),
        previewMode: previewMode.value,
        ua: String(globalThis?.navigator?.userAgent || "").slice(0, 80)
      });
      if (!ready.value) return;
      loadingGuardTimer = window.setTimeout(() => {
        if (!loading.value) return;
        loading.value = false;
        loadHint.value = "模块页面已开始渲染，正在等待模块上报真实高度。";
        pushDebugLog("ModuleHost", `加载超时（4.5s），iframe 未触发 load 事件`, "warn", {
          src: frameSrc.value?.slice(0, 120),
          previewMode: previewMode.value
        });
        scheduleConnectionRefusedRetry();
      }, 4500);
    };
    const handleFrameSizeMessage = (event) => {
      const frameWindow = frameRef.value?.contentWindow;
      const payload = event?.data;
      if (!frameWindow || event.source !== frameWindow) return;
      if (!payload || payload.type !== "mini-hbut:module-size") return;
      const nextModuleId = safeText(payload.module_id || payload.moduleId);
      const nextVersion = safeText(payload.version);
      if (moduleId.value && nextModuleId && nextModuleId !== moduleId.value) return;
      if (moduleVersion.value && nextVersion && nextVersion !== moduleVersion.value) return;
      const nextHeight = Math.ceil(Number(payload.height) || 0);
      if (nextHeight <= 0) return;
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      frameContentHeight.value = nextHeight;
      loading.value = false;
      loadHint.value = "";
    };
    const reloadFrame = () => {
      if (!ready.value) return;
      frameKey.value += 1;
      resetFrameState();
    };
    const handleLoad = () => {
      clearLoadingGuardTimer();
      clearCapacitorFallbackTimer();
      loading.value = false;
      loadError.value = "";
      pushDebugLog("ModuleHost", `iframe onload 触发`, "info", {
        src: frameSrc.value?.slice(0, 120),
        hasHeight: frameContentHeight.value > 0
      });
      if (!frameContentHeight.value) {
        scheduleFrameSizeHint();
        scheduleFrameSizeFallback();
      }
    };
    const handleError = () => {
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      clearCapacitorFallbackTimer();
      clearFrameSizeHintTimer();
      pushDebugLog("ModuleHost", `iframe onerror 触发`, "error", {
        src: frameSrc.value?.slice(0, 120),
        previewMode: previewMode.value
      });
      const currentSrc = frameSrc.value;
      if (currentSrc && currentSrc.includes("127.0.0.1")) {
        if (tryCapacitorLocalFallback()) return;
      }
      if (tryCapacitorLocalFallback()) return;
      loading.value = false;
      frameContentHeight.value = 0;
      const isIos = /(iphone|ipad|ipod)/i.test(String(globalThis?.navigator?.userAgent || ""));
      if (isIos && currentSrc && currentSrc.startsWith("http")) {
        loadError.value = "当前设备不支持嵌入加载，请点击下方按钮在浏览器中打开。";
        externalOpenUrl.value = currentSrc;
      } else {
        loadError.value = previewMode.value === "capacitor-local" ? "本地模块页面加载失败，请返回更多页重新下载后再试。" : "模块页面加载失败，请返回更多页后重试。";
      }
      loadHint.value = "";
    };
    watch(
      () => previewUrl.value,
      () => {
        frameKey.value += 1;
        resetFrameState();
      },
      { immediate: true }
    );
    const handleAppEmbedResumeEvent = async (event) => {
      const view = String(event?.detail?.view || "");
      if (view && view !== "more_module_host") return;
      const detail = event?.detail || {};
      const usesLoopback = isLocalModuleBridgePreviewUrl(safeText(previewUrl.value));
      let bridgeOk = detail.bridgeOk !== false;
      if (usesLoopback && canUseLocalModuleBridgePreview()) {
        try {
          const { recoverSchoolWebsiteBridgeOnResume } = await __vitePreload(async () => {
            const { recoverSchoolWebsiteBridgeOnResume: recoverSchoolWebsiteBridgeOnResume2 } = await import("./school_website_embed-DWdoZd7Q.js");
            return { recoverSchoolWebsiteBridgeOnResume: recoverSchoolWebsiteBridgeOnResume2 };
          }, true ? __vite__mapDeps([0,1,2,3]) : void 0, import.meta.url);
          bridgeOk = await recoverSchoolWebsiteBridgeOnResume();
        } catch {
          bridgeOk = false;
        }
      }
      loadError.value = "";
      loadHint.value = "";
      externalOpenUrl.value = "";
      usedCapacitorLocalFallback.value = false;
      if (usesLoopback && !bridgeOk) {
        if (tryCapacitorLocalFallback()) {
          return;
        }
        loading.value = false;
        loadError.value = "模块本地服务暂时不可用。可点右上角重试；或返回更多页重新进入/下载模块。";
        const raw = safeText(props.session?.open_url || props.session?.preview_url);
        if (raw && raw.startsWith("http") && !isLocalModuleBridgePreviewUrl(raw)) {
          externalOpenUrl.value = raw;
        }
        return;
      }
      reloadFrame();
    };
    onMounted(() => {
      window.addEventListener("message", handleFrameSizeMessage);
      window.addEventListener("hbu-embed-resume", handleAppEmbedResumeEvent);
    });
    onBeforeUnmount(() => {
      clearLoadingGuardTimer();
      clearFrameSizeHintTimer();
      clearCapacitorFallbackTimer();
      window.removeEventListener("message", handleFrameSizeMessage);
      window.removeEventListener("hbu-embed-resume", handleAppEmbedResumeEvent);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: moduleName.value,
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "icon-btn",
              disabled: !ready.value,
              onClick: reloadFrame
            }, "↻", 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_3, [
          moduleRuntimeBadges.value.length ? (openBlock(), createElementBlock("div", _hoisted_4, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(moduleRuntimeBadges.value, (badge) => {
              return openBlock(), createElementBlock("span", {
                key: badge,
                class: "module-runtime-pill",
                title: moduleVersion.value || badge
              }, toDisplayString(badge), 9, _hoisted_5);
            }), 128))
          ])) : createCommentVNode("", true),
          !ready.value ? (openBlock(), createElementBlock("div", _hoisted_6, [
            createVNode(unref(TEmptyState), {
              type: "empty",
              message: emptyStateMessage.value
            }, null, 8, ["message"])
          ])) : (openBlock(), createElementBlock("div", {
            key: 2,
            class: normalizeClass(["module-frame-shell", { "module-frame-shell--content": hasEmbeddedFrameHeight.value }])
          }, [
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_7, [
              createVNode(unref(TEmptyState), {
                type: "loading",
                message: "正在加载模块页面..."
              })
            ])) : createCommentVNode("", true),
            loadError.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
              createTextVNode(toDisplayString(loadError.value) + " ", 1),
              externalOpenUrl.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "external-open-btn",
                onClick: _cache[1] || (_cache[1] = ($event) => unref(openExternal)(externalOpenUrl.value))
              }, " 在浏览器中打开 ")) : createCommentVNode("", true)
            ])) : loadHint.value ? (openBlock(), createElementBlock("div", _hoisted_9, [
              createTextVNode(toDisplayString(loadHint.value) + " ", 1),
              externalOpenUrl.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "external-open-btn",
                onClick: _cache[2] || (_cache[2] = ($event) => unref(openExternal)(externalOpenUrl.value))
              }, " 在浏览器中打开 ")) : createCommentVNode("", true)
            ])) : createCommentVNode("", true),
            (openBlock(), createElementBlock("iframe", {
              key: frameKey.value,
              ref_key: "frameRef",
              ref: frameRef,
              class: normalizeClass(["module-frame", { "module-frame--content": hasEmbeddedFrameHeight.value }]),
              src: frameSrc.value,
              allowfullscreen: "",
              allow: "cross-origin-isolated; clipboard-write",
              referrerpolicy: "no-referrer-when-downgrade",
              loading: "eager",
              onLoad: handleLoad,
              onError: handleError
            }, null, 42, _hoisted_10))
          ], 2))
        ])
      ]);
    };
  }
};
const MoreModuleHostView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-20be53a6"]]);
export {
  MoreModuleHostView as default
};
