import { p as prepareOneCodeAppOpen } from "./one_code_open-DolWkQwu.js";
import { q as qrToDataURL } from "./qrcode-DqJHidZ9.js";
import { _ as _export_sfc, m as useI18n, t, o as openExternal, j as showToast } from "./app-demo-CUOWTnz-.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, t as toDisplayString, d as createCommentVNode, g as createTextVNode, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
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
const _hoisted_9 = ["src", "alt"];
const _sfc_main = {
  __name: "BroadbandView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const loading = ref(false);
    const error = ref("");
    const qrDataUrl = ref("");
    const showQr = ref(false);
    const { t: tLocale } = useI18n();
    const qrAlt = computed(() => tLocale("broadband.qrAlt"));
    const mintAndOpen = async () => {
      loading.value = true;
      error.value = "";
      try {
        const res = await prepareOneCodeAppOpen({
          appCode: "broadband",
          appName: t("broadband.oneCode.appName")
        });
        await openExternal(res.openUrl);
      } catch (e) {
        error.value = String(e?.message || e || t("broadband.error.openFailed"));
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
          appName: t("broadband.oneCode.appName")
        });
        qrDataUrl.value = await qrToDataURL(res.openUrl, { width: 180 });
        showQr.value = true;
      } catch (e) {
        error.value = String(e?.message || e || t("broadband.error.qrFailed"));
        showToast(error.value);
      } finally {
        loading.value = false;
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(tLocale)("broadband.title"),
          icon: "wifi",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
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
                createTextVNode(" " + toDisplayString(loading.value ? unref(tLocale)("broadband.opening") : unref(tLocale)("broadband.pay")), 1)
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
                alt: qrAlt.value,
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
const BroadbandView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-3dc742f6"]]);
export {
  BroadbandView as default
};
