import { _ as _export_sfc, s as showToast } from "./app-demo-CxKBY5JQ.js";
import "./runtime-bridge-apFQ0nCw.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { o as onMounted, a as ref, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, l as withCtx, u as unref, k as createBlock, f as createCommentVNode } from "./vue-core-DdLVj9yW.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "official-view" };
const _hoisted_2 = { class: "iframe-container" };
const officialUrl = "https://docs.qq.com/doc/DQnVTWFFFbEhNTXhx";
const _sfc_main = {
  __name: "OfficialView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
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
        showToast("链接已复制到剪贴板！", "success");
      } catch (err) {
        console.error("复制失败:", err);
        showToast("复制失败，请手动复制", "error");
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
          title: "官方发布",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "back-btn",
              onClick: copyLink,
              "aria-label": "复制发布链接"
            }, "↗")
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_2, [
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
const OfficialView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-52f40eb9"]]);
export {
  OfficialView as default
};
