import { _ as _export_sfc, m as useI18n } from "./app-demo-CUOWTnz-.js";
import { a as openBlock, c as createElementBlock, t as toDisplayString, b as createBaseVNode, q as renderSlot, n as normalizeClass, h as computed } from "./vue-core-Dzs4fLAU.js";
const _hoisted_1 = {
  key: 0,
  class: "t-state__spinner"
};
const _hoisted_2 = {
  key: 1,
  class: "t-state__icon"
};
const _hoisted_3 = { class: "t-state__message" };
const _sfc_main = {
  __name: "TEmptyState",
  props: {
    type: { type: String, default: "empty", validator: (v) => ["empty", "loading", "error"].includes(v) },
    message: { type: String, default: "" },
    icon: { type: String, default: "" }
  },
  setup(__props) {
    const props = __props;
    const { t } = useI18n();
    const defaultMessage = computed(() => {
      if (props.type === "loading") return t("common.empty.loading");
      if (props.type === "error") return t("common.empty.error");
      return t("common.empty.text");
    });
    const resolvedIcon = computed(() => {
      if (props.icon) return props.icon;
      if (props.type === "error") return "⚠️";
      return "📭";
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["t-state", `t-state--${__props.type}`])
      }, [
        __props.type === "loading" ? (openBlock(), createElementBlock("div", _hoisted_1)) : (openBlock(), createElementBlock("div", _hoisted_2, toDisplayString(resolvedIcon.value), 1)),
        createBaseVNode("p", _hoisted_3, toDisplayString(__props.message || defaultMessage.value), 1),
        renderSlot(_ctx.$slots, "default", {}, void 0, true)
      ], 2);
    };
  }
};
const TEmptyState = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ae17b1d7"]]);
export {
  TEmptyState as T
};
