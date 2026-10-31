import { _ as _export_sfc, u as useI18n, z as tf } from "./app-demo-BXR7Wchv.js";
import { a as openBlock, c as createElementBlock, v as renderSlot, d as createCommentVNode, b as createBaseVNode, n as normalizeClass, i as defineComponent, o as onMounted, p as onBeforeUnmount, t as toDisplayString, g as createTextVNode, u as unref, F as Fragment, r as ref, h as computed } from "./vue-core-CVT-P0lT.js";
import { d as describeTeacherSyncTime, t as teacherSyncStatusKey } from "./teacher_sync_status-But3HSMJ.js";
const _hoisted_1$1 = {
  key: 0,
  class: "t-card__header"
};
const _hoisted_2$1 = { class: "t-card__body" };
const _hoisted_3$1 = {
  key: 1,
  class: "t-card__footer"
};
const _sfc_main$1 = {
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
        _ctx.$slots.header ? (openBlock(), createElementBlock("div", _hoisted_1$1, [
          renderSlot(_ctx.$slots, "header", {}, void 0, true)
        ])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_2$1, [
          renderSlot(_ctx.$slots, "default", {}, void 0, true)
        ]),
        _ctx.$slots.footer ? (openBlock(), createElementBlock("div", _hoisted_3$1, [
          renderSlot(_ctx.$slots, "footer", {}, void 0, true)
        ])) : createCommentVNode("", true)
      ], 2);
    };
  }
};
const TCard = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-2275a01a"]]);
const _hoisted_1 = {
  class: "mt-4 border-t border-outline-variant/30 pt-3",
  style: { "padding-bottom": "max(0.5rem, env(safe-area-inset-bottom))" }
};
const _hoisted_2 = { class: "flex items-center gap-2 text-xs text-on-surface-variant" };
const _hoisted_3 = { class: "sr-only" };
const _hoisted_4 = { "aria-hidden": "true" };
const _hoisted_5 = {
  key: 0,
  class: "mt-1 text-xs text-on-surface-variant"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherSyncBar",
  props: {
    status: {},
    lastSuccessfulSyncAt: { default: "" },
    errorKey: { default: "" }
  },
  setup(__props) {
    const props = __props;
    const { t, locale } = useI18n();
    const now = ref(Date.now());
    let timer = null;
    onMounted(() => {
      timer = setInterval(() => {
        now.value = Date.now();
      }, 6e4);
    });
    onBeforeUnmount(() => {
      if (timer) clearInterval(timer);
      timer = null;
    });
    const timeText = computed(() => {
      void locale.value;
      const descriptor = describeTeacherSyncTime(props.lastSuccessfulSyncAt, now.value);
      return descriptor ? tf(descriptor.key, descriptor.params) : "";
    });
    const statusText = computed(() => {
      void locale.value;
      return t(teacherSyncStatusKey(props.status));
    });
    const ariaText = computed(() => {
      const time = timeText.value || statusText.value;
      return tf("teacher.sync.aria", { time, status: statusText.value });
    });
    const chipClass = computed(() => {
      if (props.status === "synced") return "bg-primary/10 text-primary";
      if (props.status === "cached" || props.status === "failed") {
        return "bg-error-container/60 text-on-error-container";
      }
      return "bg-surface-container-high text-on-surface-variant";
    });
    const showStaleHint = computed(
      () => props.status === "cached" || props.status === "failed"
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("footer", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("span", _hoisted_3, toDisplayString(ariaText.value), 1),
          _cache[0] || (_cache[0] = createBaseVNode("span", {
            class: "material-symbols-outlined text-sm",
            "aria-hidden": "true"
          }, "schedule", -1)),
          createBaseVNode("span", _hoisted_4, [
            createTextVNode(toDisplayString(unref(t)("teacher.sync.label")) + " ", 1),
            timeText.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createTextVNode("：" + toDisplayString(timeText.value), 1)
            ], 64)) : createCommentVNode("", true)
          ]),
          createBaseVNode("span", {
            class: normalizeClass(["ml-auto px-2 py-0.5 rounded-full font-medium", chipClass.value]),
            "aria-hidden": "true"
          }, toDisplayString(statusText.value), 3)
        ]),
        showStaleHint.value ? (openBlock(), createElementBlock("p", _hoisted_5, toDisplayString(__props.errorKey ? unref(t)(__props.errorKey) : unref(t)("teacher.sync.staleHint")), 1)) : createCommentVNode("", true)
      ]);
    };
  }
});
export {
  TCard as T,
  _sfc_main as _
};
