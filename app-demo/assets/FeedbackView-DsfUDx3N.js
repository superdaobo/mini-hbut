import { _ as _export_sfc, m as useI18n, o as openExternal, j as showToast } from "./app-demo-CUOWTnz-.js";
import { U as subscribeDebugLogs, M as formatDebugTime, L as getDebugLogs } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { o as onMounted, l as onBeforeUnmount, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, t as toDisplayString, u as unref, d as createCommentVNode, j as createBlock, F as Fragment, f as renderList, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "feedback-view" };
const _hoisted_2 = { class: "feedback-body" };
const _hoisted_3 = { class: "feedback-card feedback-card--actions" };
const _hoisted_4 = { class: "feedback-actions" };
const _hoisted_5 = ["disabled"];
const _hoisted_6 = ["disabled"];
const _hoisted_7 = {
  key: 0,
  class: "status-line status-line--error"
};
const _hoisted_8 = { class: "feedback-card" };
const _hoisted_9 = { class: "section-head" };
const _hoisted_10 = { class: "section-count" };
const _hoisted_11 = {
  key: 1,
  class: "error-list"
};
const _hoisted_12 = { class: "error-head" };
const _hoisted_13 = { class: "error-meta" };
const _hoisted_14 = ["onClick"];
const _hoisted_15 = { class: "error-details" };
const feedbackUrl = "https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2";
const DEBUG_LOG_LIMIT = 200;
const _sfc_main = {
  __name: "FeedbackView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const browserOpening = ref(false);
    const browserOpenError = ref("");
    const debugLogs = ref([]);
    let unsubscribeDebugLogs = null;
    const recentErrorLogs = computed(() => {
      return debugLogs.value.filter((item) => item && item.level === "error").slice(-8).reverse();
    });
    const formatErrorItem = (item) => {
      const scope = String(item?.scope || "APP").trim() || "APP";
      const level = String(item?.level || "error").trim().toUpperCase() || "ERROR";
      const head = `${formatDebugTime(item?.ts)} [${level}][${scope}]`;
      const message = String(item?.message || "").trim();
      const details = String(item?.details || "").trim();
      return [head, message, details && details !== message ? details : ""].filter(Boolean).join("\n");
    };
    const recentErrorText = computed(() => recentErrorLogs.value.map((item) => formatErrorItem(item)).join("\n\n"));
    const refreshDebugLogs = () => {
      debugLogs.value = getDebugLogs(DEBUG_LOG_LIMIT);
    };
    const openInBrowser = async () => {
      browserOpening.value = true;
      browserOpenError.value = "";
      try {
        const opened = await openExternal(feedbackUrl);
        if (!opened) {
          throw new Error(t("feedback.toast.browserFailed"));
        }
        showToast(t("feedback.toast.opened"), "success");
      } catch (error) {
        browserOpenError.value = String(error?.message || error || t("feedback.toast.openFailed"));
        showToast(browserOpenError.value, "error");
      } finally {
        browserOpening.value = false;
      }
    };
    const copyText = async (text, successMessage, emptyMessage) => {
      const value = String(text || "").trim();
      if (!value) {
        showToast(emptyMessage, "info");
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        showToast(successMessage, "success");
      } catch (error) {
        console.error("[Feedback] copy failed", error);
        showToast(t("feedback.toast.copyFailed"), "error");
      }
    };
    const copyLink = async () => {
      await copyText(feedbackUrl, t("feedback.toast.linkCopied"), t("feedback.toast.linkEmpty"));
    };
    const copyRecentErrors = async () => {
      await copyText(recentErrorText.value, t("feedback.toast.errorsCopied"), t("feedback.toast.errorsEmpty"));
    };
    const copySingleError = async (item) => {
      await copyText(formatErrorItem(item), t("feedback.toast.errorCopied"), t("feedback.toast.errorEmpty"));
    };
    onMounted(() => {
      refreshDebugLogs();
      unsubscribeDebugLogs = subscribeDebugLogs((logs) => {
        debugLogs.value = Array.isArray(logs) ? logs.slice(-DEBUG_LOG_LIMIT) : [];
      });
    });
    onBeforeUnmount(() => {
      if (typeof unsubscribeDebugLogs === "function") {
        unsubscribeDebugLogs();
        unsubscribeDebugLogs = null;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("feedback.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "header-btn",
              type: "button",
              onClick: copyLink
            }, toDisplayString(unref(t)("feedback.copyLink")), 1)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("section", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              createBaseVNode("button", {
                class: "primary-btn",
                type: "button",
                disabled: browserOpening.value,
                onClick: openInBrowser
              }, toDisplayString(browserOpening.value ? unref(t)("feedback.opening") : unref(t)("feedback.openForm")), 9, _hoisted_5),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: copyLink
              }, toDisplayString(unref(t)("feedback.copyLinkBtn")), 1),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                disabled: !recentErrorLogs.value.length,
                onClick: copyRecentErrors
              }, toDisplayString(unref(t)("feedback.copyErrors")), 9, _hoisted_6)
            ]),
            browserOpenError.value ? (openBlock(), createElementBlock("p", _hoisted_7, toDisplayString(browserOpenError.value), 1)) : createCommentVNode("", true)
          ]),
          createBaseVNode("section", _hoisted_8, [
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("h3", null, toDisplayString(unref(t)("feedback.recentErrors")), 1),
              createBaseVNode("span", _hoisted_10, toDisplayString(recentErrorLogs.value.length), 1)
            ]),
            !recentErrorLogs.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("feedback.noErrors")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_11, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(recentErrorLogs.value, (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.id,
                  class: "error-item"
                }, [
                  createBaseVNode("div", _hoisted_12, [
                    createBaseVNode("div", _hoisted_13, [
                      createBaseVNode("strong", null, toDisplayString(item.scope || "APP"), 1),
                      createBaseVNode("time", null, toDisplayString(unref(formatDebugTime)(item.ts)), 1)
                    ]),
                    createBaseVNode("button", {
                      class: "inline-copy-btn",
                      type: "button",
                      onClick: ($event) => copySingleError(item)
                    }, toDisplayString(unref(t)("feedback.copy")), 9, _hoisted_14)
                  ]),
                  createBaseVNode("pre", _hoisted_15, toDisplayString(formatErrorItem(item)), 1)
                ]);
              }), 128))
            ]))
          ])
        ])
      ]);
    };
  }
};
const FeedbackView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-7558e59b"]]);
export {
  FeedbackView as default
};
