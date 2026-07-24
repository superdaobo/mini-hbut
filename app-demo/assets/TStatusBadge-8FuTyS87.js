import { _ as _export_sfc } from "./app-demo-CxKBY5JQ.js";
import { c as createElementBlock, b as openBlock, s as renderSlot, g as createTextVNode, t as toDisplayString, n as normalizeClass } from "./vue-core-DdLVj9yW.js";
const _sfc_main = {
  __name: "TStatusBadge",
  props: {
    type: {
      type: String,
      default: "primary",
      validator: (v) => ["primary", "success", "danger", "warning", "info", "muted"].includes(v)
    },
    text: { type: String, default: "" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("span", {
        class: normalizeClass(["t-badge", `t-badge--${__props.type}`])
      }, [
        renderSlot(_ctx.$slots, "default", {}, () => [
          createTextVNode(toDisplayString(__props.text), 1)
        ], true)
      ], 2);
    };
  }
};
const TStatusBadge = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-45408d6f"]]);
export {
  TStatusBadge as T
};
