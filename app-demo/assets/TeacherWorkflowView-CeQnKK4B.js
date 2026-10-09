import { u as useI18n, _ as _export_sfc } from "./app-demo-DztvWo2z.js";
import { y as defineComponent, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, d as createCommentVNode, j as createBlock } from "./vue-core-D-44rohN.js";
import "./runtime-bridge-gQMtwwk6.js";
import "./more-modules-yxgAg-Rh.js";
import "./debug-tools-CyNtADDO.js";
import "./capture-YhmA9GNe.js";
const _hoisted_1 = {
  class: "teacher-placeholder",
  role: "status",
  "aria-live": "polite"
};
const _hoisted_2 = { class: "teacher-placeholder__title" };
const _hoisted_3 = {
  key: 0,
  class: "teacher-placeholder__desc"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "TeacherPlaceholder",
  props: {
    titleKey: {},
    descriptionKey: {}
  },
  setup(__props) {
    const { t } = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1, [
        _cache[0] || (_cache[0] = createBaseVNode("div", {
          class: "teacher-placeholder__emoji",
          "aria-hidden": "true"
        }, "🚧", -1)),
        createBaseVNode("h2", _hoisted_2, toDisplayString(unref(t)(__props.titleKey)), 1),
        __props.descriptionKey ? (openBlock(), createElementBlock("p", _hoisted_3, toDisplayString(unref(t)(__props.descriptionKey)), 1)) : createCommentVNode("", true)
      ]);
    };
  }
});
const TeacherPlaceholder = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-7c7f7837"]]);
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherWorkflowView",
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createBlock(TeacherPlaceholder, {
        "title-key": "teacher.workflow.comingSoon",
        "description-key": "teacher.common.comingSoonDesc"
      });
    };
  }
});
export {
  _sfc_main as default
};
