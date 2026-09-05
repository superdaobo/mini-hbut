import { p as prepareOneCodeAppOpen } from "./one_code_open-Cx8KvGm9.js";
import { q as qrToDataURL } from "./qrcode-Cx34DNxj.js";
import { _ as _export_sfc, o as openExternal, i as showToast } from "./app-demo-BxokP0Ga.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BuBxb9nY.js";
import { a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, t as toDisplayString, d as createCommentVNode, e as createTextVNode, r as ref } from "./vue-core-DPI62iBa.js";
import "./runtime-bridge-HjlgKupV.js";
import "./more-modules-c4l-U-qE.js";
import "./debug-tools-3S6y50wl.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "page" };
const _hoisted_2 = { class: "body" };
const _hoisted_3 = { class: "card" };
const _hoisted_4 = {
  key: 0,
  class: "err"
};
const _hoisted_5 = { class: "actions" };
const _hoisted_6 = ["disabled"];
const _hoisted_7 = ["disabled", "aria-pressed"];
const _hoisted_8 = {
  key: 1,
  class: "qr"
};
const _hoisted_9 = ["src"];
const _sfc_main = {
  __name: "BroadbandView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const loading = ref(false);
    const error = ref("");
    const qrDataUrl = ref("");
    const showQr = ref(false);
    const mintAndOpen = async () => {
      loading.value = true;
      error.value = "";
      try {
        const res = await prepareOneCodeAppOpen({
          appCode: "broadband",
          appName: "缴纳教育网网费"
        });
        await openExternal(res.openUrl);
      } catch (e) {
        error.value = String(e?.message || e || "打开失败");
        showToast(error.value);
      } finally {
        loading.value = false;
      }
    };
    const mintQr = async () => {
      if (showQr.value) {
        showQr.value = false;
        return;
      }
      loading.value = true;
      error.value = "";
      try {
        const res = await prepareOneCodeAppOpen({
          appCode: "broadband",
          appName: "缴纳教育网网费"
        });
        qrDataUrl.value = await qrToDataURL(res.openUrl, { width: 180 });
        showQr.value = true;
      } catch (e) {
        error.value = String(e?.message || e || "生成失败");
        showToast(error.value);
      } finally {
        loading.value = false;
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "教育网网费",
          icon: "wifi",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("section", _hoisted_3, [
            error.value ? (openBlock(), createElementBlock("div", _hoisted_4, toDisplayString(error.value), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("button", {
                type: "button",
                class: "main",
                disabled: loading.value,
                onClick: mintAndOpen
              }, [
                _cache[1] || (_cache[1] = createBaseVNode("span", { class: "material-symbols-outlined" }, "payments", -1)),
                createTextVNode(" " + toDisplayString(loading.value ? "打开中…" : "缴纳网费"), 1)
              ], 8, _hoisted_6),
              createBaseVNode("button", {
                type: "button",
                class: "side",
                disabled: loading.value,
                "aria-pressed": showQr.value,
                onClick: mintQr
              }, [..._cache[2] || (_cache[2] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "qr_code_2", -1)
              ])], 8, _hoisted_7)
            ]),
            showQr.value && qrDataUrl.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
              createBaseVNode("img", {
                src: qrDataUrl.value,
                alt: "网费缴纳",
                width: "180",
                height: "180"
              }, null, 8, _hoisted_9)
            ])) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const BroadbandView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-2e79aa99"]]);
export {
  BroadbandView as default
};
