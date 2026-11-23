import { _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { a as openBlock, c as createElementBlock, v as renderSlot, d as createCommentVNode, b as createBaseVNode, n as normalizeClass } from "./vue-core-4L5yFbGc.js";
const _hoisted_1 = {
  key: 0,
  class: "t-card__header"
};
const _hoisted_2 = { class: "t-card__body" };
const _hoisted_3 = {
  key: 1,
  class: "t-card__footer"
};
const _sfc_main = {
  __name: "TCard",
  props: {
    hoverable: { type: Boolean, default: false },
    compact: { type: Boolean, default: false }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["t-card", "glass-card", { "t-card--hoverable": __props.hoverable, "t-card--compact": __props.compact }])
      }, [
        _ctx.$slots.header ? (openBlock(), createElementBlock("div", _hoisted_1, [
          renderSlot(_ctx.$slots, "header", {}, void 0, true)
        ])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_2, [
          renderSlot(_ctx.$slots, "default", {}, void 0, true)
        ]),
        _ctx.$slots.footer ? (openBlock(), createElementBlock("div", _hoisted_3, [
          renderSlot(_ctx.$slots, "footer", {}, void 0, true)
        ])) : createCommentVNode("", true)
      ], 2);
    };
  }
};
const TCard = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-2275a01a"]]);
export {
  TCard as T
};
