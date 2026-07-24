import { c as createElementBlock, b as openBlock, d as createBaseVNode, f as createCommentVNode, e as computed, t as toDisplayString, s as renderSlot } from "./vue-core-DdLVj9yW.js";
const _hoisted_1 = { class: "sticky top-0 z-50 bg-surface/90 backdrop-blur-md px-4 h-14 flex items-center justify-between" };
const _hoisted_2 = {
  key: 1,
  class: "w-10 h-10",
  "aria-hidden": "true"
};
const _hoisted_3 = { class: "font-bold text-lg text-on-surface flex items-center gap-2" };
const _hoisted_4 = {
  key: 0,
  class: "material-symbols-outlined text-primary"
};
const _hoisted_5 = { key: 1 };
const _hoisted_6 = {
  key: 2,
  class: "w-10 h-10"
};
const _hoisted_7 = {
  key: 3,
  class: "flex items-center justify-end gap-2"
};
const _sfc_main = {
  __name: "TPageHeader",
  props: {
    title: { type: String, required: true },
    icon: { type: String, default: "" },
    showBack: { type: Boolean, default: true }
  },
  emits: ["back"],
  setup(__props) {
    const props = __props;
    const isMaterialIcon = computed(() => {
      if (!props.icon) return false;
      return /^[a-z0-9_]+$/.test(props.icon);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("header", _hoisted_1, [
        __props.showBack ? (openBlock(), createElementBlock("button", {
          key: 0,
          onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("back")),
          class: "w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container-highest transition-colors text-on-surface"
        }, [..._cache[1] || (_cache[1] = [
          createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back_ios_new", -1)
        ])])) : (openBlock(), createElementBlock("span", _hoisted_2)),
        createBaseVNode("h1", _hoisted_3, [
          __props.icon && isMaterialIcon.value ? (openBlock(), createElementBlock("span", _hoisted_4, toDisplayString(__props.icon), 1)) : __props.icon ? (openBlock(), createElementBlock("span", _hoisted_5, toDisplayString(__props.icon), 1)) : createCommentVNode("", true),
          createBaseVNode("span", null, toDisplayString(__props.title), 1)
        ]),
        !_ctx.$slots.actions ? (openBlock(), createElementBlock("div", _hoisted_6)) : (openBlock(), createElementBlock("div", _hoisted_7, [
          renderSlot(_ctx.$slots, "actions")
        ]))
      ]);
    };
  }
};
export {
  _sfc_main as _
};
