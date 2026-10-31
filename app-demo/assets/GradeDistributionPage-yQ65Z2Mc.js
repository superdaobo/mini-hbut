import { _ as _export_sfc, b as useLocale } from "./app-demo-BXR7Wchv.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { G as GradeDistributionView } from "./GradeDistributionView-CMj_I4Mj.js";
import { a as openBlock, c as createElementBlock, k as createVNode, u as unref, b as createBaseVNode } from "./vue-core-CVT-P0lT.js";
import "./runtime-bridge-z2ulLxEq.js";
import "./more-modules-DkooyOvE.js";
import "./debug-tools-B-8Pd-e1.js";
import "./capture-CoTlEFL0.js";
const _hoisted_1 = { class: "grade-distribution-page" };
const _hoisted_2 = { class: "grade-distribution-page__body" };
const _sfc_main = {
  __name: "GradeDistributionPage",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("grade.dist.title"),
          icon: "bar_chart",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        createBaseVNode("div", _hoisted_2, [
          createVNode(GradeDistributionView)
        ])
      ]);
    };
  }
};
const GradeDistributionPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-7302871f"]]);
export {
  GradeDistributionPage as default
};
