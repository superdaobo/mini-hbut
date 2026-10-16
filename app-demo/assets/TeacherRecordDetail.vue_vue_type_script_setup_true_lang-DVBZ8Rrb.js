import { u as useI18n, bX as TModal } from "./app-demo-TQEQRs3d.js";
import { y as defineComponent, v as watch, l as onBeforeUnmount, a as openBlock, j as createBlock, k as withCtx, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, F as Fragment, f as renderList, d as createCommentVNode, q as renderSlot, h as computed } from "./vue-core-CU1bwGIw.js";
const teacherSemesterOptions = (selected, now = /* @__PURE__ */ new Date()) => {
  const baseYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const options = /* @__PURE__ */ new Set();
  for (let year = baseYear; year >= baseYear - 4; year -= 1) {
    options.add(`${year}-${year + 1}-1`);
    options.add(`${year}-${year + 1}-2`);
  }
  if (/^\d{4}-\d{4}-[12]$/.test(selected)) options.add(selected);
  return [...options].sort((a, b) => b.localeCompare(a));
};
const _hoisted_1 = {
  key: 0,
  class: "mb-4"
};
const _hoisted_2 = { class: "text-sm font-semibold text-on-surface mb-3" };
const _hoisted_3 = { class: "grid grid-cols-2 gap-x-4 gap-y-4" };
const _hoisted_4 = { class: "text-xs text-on-surface-variant mb-1" };
const _hoisted_5 = { class: "text-sm font-medium text-on-surface break-words whitespace-pre-wrap" };
const _hoisted_6 = {
  key: 1,
  class: "pt-3 border-t border-outline-variant/30"
};
const _hoisted_7 = { class: "text-sm font-semibold text-on-surface mb-3" };
const _hoisted_8 = { class: "grid grid-cols-2 gap-x-4 gap-y-4" };
const _hoisted_9 = { class: "text-xs text-on-surface-variant mb-1" };
const _hoisted_10 = { class: "text-sm font-medium text-on-surface break-words whitespace-pre-wrap" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherRecordDetail",
  props: {
    visible: { type: Boolean },
    title: {},
    primary: {},
    extra: { default: () => [] },
    extraTitle: { default: "" }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    const nonempty = (items) => items.filter((row) => row.value !== null && row.value !== void 0 && String(row.value).trim() !== "");
    const mainRows = computed(() => nonempty(props.primary));
    const extraRows = computed(() => nonempty(props.extra));
    const onKeydown = (event) => {
      if (event.key === "Escape" && props.visible) emit("close");
    };
    watch(() => props.visible, (visible) => {
      if (typeof window === "undefined") return;
      if (visible) window.addEventListener("keydown", onKeydown);
      else window.removeEventListener("keydown", onKeydown);
    }, { immediate: true });
    onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(TModal), {
        visible: __props.visible,
        title: __props.title,
        width: "480px",
        onClose: _cache[0] || (_cache[0] = ($event) => emit("close"))
      }, {
        default: withCtx(() => [
          mainRows.value.length ? (openBlock(), createElementBlock("section", _hoisted_1, [
            createBaseVNode("h4", _hoisted_2, toDisplayString(unref(t)("teacher.detail.basic")), 1),
            createBaseVNode("dl", _hoisted_3, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(mainRows.value, (row) => {
                return openBlock(), createElementBlock("div", {
                  key: row.key,
                  class: "min-w-0"
                }, [
                  createBaseVNode("dt", _hoisted_4, toDisplayString(row.label), 1),
                  createBaseVNode("dd", _hoisted_5, toDisplayString(row.value), 1)
                ]);
              }), 128))
            ])
          ])) : createCommentVNode("", true),
          extraRows.value.length ? (openBlock(), createElementBlock("section", _hoisted_6, [
            createBaseVNode("h4", _hoisted_7, toDisplayString(__props.extraTitle || unref(t)("teacher.detail.more")), 1),
            createBaseVNode("dl", _hoisted_8, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(extraRows.value, (row) => {
                return openBlock(), createElementBlock("div", {
                  key: row.key,
                  class: "min-w-0"
                }, [
                  createBaseVNode("dt", _hoisted_9, toDisplayString(row.label), 1),
                  createBaseVNode("dd", _hoisted_10, toDisplayString(row.value), 1)
                ]);
              }), 128))
            ])
          ])) : createCommentVNode("", true),
          renderSlot(_ctx.$slots, "default")
        ]),
        _: 3
      }, 8, ["visible", "title"]);
    };
  }
});
export {
  _sfc_main as _,
  teacherSemesterOptions as t
};
