import { _ as _export_sfc, m as useI18n, j as showToast } from "./app-demo-CUOWTnz-.js";
import "./runtime-bridge-Dt57BD2i.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, j as createBlock, d as createCommentVNode, r as ref } from "./vue-core-Dzs4fLAU.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "official-view" };
const _hoisted_2 = ["aria-label"];
const _hoisted_3 = { class: "iframe-container" };
const officialUrl = "https://docs.qq.com/doc/DQnVTWFFFbEhNTXhx";
const _sfc_main = {
  __name: "OfficialView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const loading = ref(true);
    const iframeRef = ref(null);
    const handleLoad = () => {
      loading.value = false;
    };
    const handleError = () => {
      loading.value = false;
    };
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(officialUrl);
        console.log("Link copied to clipboard");
        showToast(t("official.toast.linkCopied"), "success");
      } catch (err) {
        console.error("copy failed:", err);
        showToast(t("official.toast.copyFailed"), "error");
      }
    };
    onMounted(() => {
      setTimeout(() => {
        loading.value = false;
      }, 5e3);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("official.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "back-btn",
              onClick: copyLink,
              "aria-label": unref(t)("official.copyAria")
            }, "↗", 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_3, [
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading"
          })) : createCommentVNode("", true),
          createBaseVNode("iframe", {
            ref_key: "iframeRef",
            ref: iframeRef,
            src: officialUrl,
            sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
            frameborder: "0",
            allowfullscreen: "",
            onLoad: handleLoad,
            onError: handleError
          }, null, 544)
        ])
      ]);
    };
  }
};
const OfficialView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f3abb68a"]]);
export {
  OfficialView as default
};
