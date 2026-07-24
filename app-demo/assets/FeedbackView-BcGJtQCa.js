import { _ as _export_sfc, o as openExternal, s as showToast } from "./app-demo-CxKBY5JQ.js";
import { H as subscribeDebugLogs, x as formatDebugTime, v as getDebugLogs } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { o as onMounted, m as onBeforeUnmount, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, l as withCtx, u as unref, f as createCommentVNode, a as ref, t as toDisplayString, e as computed, k as createBlock, F as Fragment, i as renderList } from "./vue-core-DdLVj9yW.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
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
          throw new Error("默认浏览器未成功拉起");
        }
        showToast("已在默认浏览器打开反馈页", "success");
      } catch (error) {
        browserOpenError.value = String(error?.message || error || "浏览器打开失败");
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
        console.error("[Feedback] 复制失败", error);
        showToast("复制失败", "error");
      }
    };
    const copyLink = async () => {
      await copyText(feedbackUrl, "反馈链接已复制", "反馈链接为空");
    };
    const copyRecentErrors = async () => {
      await copyText(recentErrorText.value, "最近 error 已复制", "当前没有最近 error");
    };
    const copySingleError = async (item) => {
      await copyText(formatErrorItem(item), "error 已复制", "当前 error 为空");
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
          title: "问题反馈",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "header-btn",
              type: "button",
              onClick: copyLink
            }, "复制链接")
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("section", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              createBaseVNode("button", {
                class: "primary-btn",
                type: "button",
                disabled: browserOpening.value,
                onClick: openInBrowser
              }, toDisplayString(browserOpening.value ? "打开中..." : "打开反馈表单"), 9, _hoisted_5),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: copyLink
              }, "复制反馈链接"),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                disabled: !recentErrorLogs.value.length,
                onClick: copyRecentErrors
              }, " 复制最近 error ", 8, _hoisted_6)
            ]),
            browserOpenError.value ? (openBlock(), createElementBlock("p", _hoisted_7, toDisplayString(browserOpenError.value), 1)) : createCommentVNode("", true)
          ]),
          createBaseVNode("section", _hoisted_8, [
            createBaseVNode("div", _hoisted_9, [
              _cache[1] || (_cache[1] = createBaseVNode("h3", null, "最近 error", -1)),
              createBaseVNode("span", _hoisted_10, toDisplayString(recentErrorLogs.value.length), 1)
            ]),
            !recentErrorLogs.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: "当前没有最近 error。"
            })) : (openBlock(), createElementBlock("div", _hoisted_11, [
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
                    }, "复制", 8, _hoisted_14)
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
const FeedbackView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-83a39bf9"]]);
export {
  FeedbackView as default
};
