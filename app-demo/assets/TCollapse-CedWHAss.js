import { _ as _export_sfc } from "./app-demo-D7XNtlJ4.js";
import { r as ref, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, v as renderSlot, d as createCommentVNode, n as normalizeClass } from "./vue-core-CVT-P0lT.js";
const _hoisted_1 = ["aria-expanded"];
const _hoisted_2 = { class: "t-collapse__title" };
const _hoisted_3 = {
  class: "material-symbols-outlined t-collapse__icon",
  "aria-hidden": "true"
};
const _hoisted_4 = {
  key: 0,
  class: "t-collapse__body"
};
const _sfc_main = {
  __name: "TCollapse",
  props: {
    title: { type: String, default: "" },
    defaultOpen: { type: Boolean, default: false },
    tone: { type: String, default: "default" }
  },
  setup(__props) {
    const props = __props;
    const open = ref(props.defaultOpen);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["t-collapse", `t-collapse--${__props.tone}`])
      }, [
        createBaseVNode("button", {
          type: "button",
          class: "t-collapse__toggle",
          "aria-expanded": open.value,
          onClick: _cache[0] || (_cache[0] = ($event) => open.value = !open.value)
        }, [
          createBaseVNode("strong", _hoisted_2, toDisplayString(__props.title), 1),
          createBaseVNode("span", _hoisted_3, toDisplayString(open.value ? "expand_less" : "expand_more"), 1)
        ], 8, _hoisted_1),
        open.value ? (openBlock(), createElementBlock("div", _hoisted_4, [
          renderSlot(_ctx.$slots, "default", {}, void 0, true)
        ])) : createCommentVNode("", true)
      ], 2);
    };
  }
};
const TCollapse = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-16dedb5b"]]);
export {
  TCollapse as T
};
