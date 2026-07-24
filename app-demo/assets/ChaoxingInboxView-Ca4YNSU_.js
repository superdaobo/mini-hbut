import { p as pushDebugLog, b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc, s as showToast, o as openExternal } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { b as buildSchoolInboxDetailHtml } from "./school_inbox_content-B2KfsM4H.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { o as onMounted, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, l as withCtx, a as ref, t as toDisplayString, u as unref, f as createCommentVNode, k as createBlock, e as computed, F as Fragment, i as renderList, n as normalizeClass, z as nextTick } from "./vue-core-DdLVj9yW.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "cx-inbox-page" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "cx-inbox-body" };
const _hoisted_4 = {
  key: 0,
  class: "cx-inbox-unread"
};
const _hoisted_5 = {
  key: 1,
  class: "cx-inbox-count"
};
const _hoisted_6 = ["onClick"];
const _hoisted_7 = { class: "cx-inbox-row-top" };
const _hoisted_8 = { class: "cx-inbox-time" };
const _hoisted_9 = { class: "cx-inbox-summary" };
const _hoisted_10 = {
  key: 4,
  class: "cx-inbox-detail"
};
const _hoisted_11 = { class: "cx-inbox-time" };
const _hoisted_12 = ["innerHTML"];
const _hoisted_13 = { class: "cx-inbox-actions" };
const CHAOXING_LOGIN_MODE = "chaoxing";
const _sfc_main = {
  __name: "ChaoxingInboxView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const loading = ref(false);
    const detailLoading = ref(false);
    const error = ref("");
    const items = ref([]);
    const selected = ref(null);
    const unreadCount = computed(() => items.value.filter((i) => !i.isRead).length);
    const detailHtml = computed(
      () => selected.value ? buildSchoolInboxDetailHtml(selected.value.body) : ""
    );
    const normalizeItem = (item) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "无标题"),
      summary: String(item?.summary || ""),
      body: String(item?.body || item?.summary || ""),
      createdAt: String(item?.createdAt || item?.created_at || ""),
      isRead: !!(item?.isRead ?? item?.is_read),
      source: String(item?.source || ""),
      uuid: String(item?.uuid || "")
    });
    const formatItemTime = (value) => {
      const text = String(value || "").trim();
      if (!text) return "未知时间";
      const parsed = Date.parse(text.replace(/-/g, "/"));
      if (!Number.isFinite(parsed)) return text;
      return formatRelativeTime(new Date(parsed).toISOString()) || text;
    };
    const fetchList = async ({ force = false } = {}) => {
      loading.value = true;
      error.value = "";
      const t0 = Date.now();
      pushDebugLog("ChaoxingInbox", `加载收件箱 force=${force}`, "info");
      try {
        if (!isTauriRuntime()) {
          throw new Error("请在客户端内使用学习通收件箱");
        }
        const res = await invokeNative("school_inbox_fetch", {
          loginMode: CHAOXING_LOGIN_MODE,
          login_mode: CHAOXING_LOGIN_MODE,
          force
        });
        const raw = Array.isArray(res?.items) ? res.items : [];
        items.value = raw.map(normalizeItem).filter((i) => i.source === "chaoxing" || String(i.id).startsWith("chaoxing:"));
        if (!items.value.length && res?.error) {
          error.value = String(res.error);
        }
        pushDebugLog(
          "ChaoxingInbox",
          `收件箱完成 count=${items.value.length} (${Date.now() - t0}ms)`,
          "info"
        );
      } catch (e) {
        error.value = String(e?.message || e || "加载失败");
        pushDebugLog("ChaoxingInbox", `收件箱失败: ${error.value}`, "error");
      } finally {
        loading.value = false;
      }
    };
    const openDetail = async (item) => {
      selected.value = item;
      detailLoading.value = true;
      try {
        if (!isTauriRuntime()) return;
        const res = await invokeNative("school_inbox_detail_fetch", {
          loginMode: CHAOXING_LOGIN_MODE,
          login_mode: CHAOXING_LOGIN_MODE,
          itemId: item.id,
          item_id: item.id,
          fallback: item
        });
        if (res) {
          selected.value = normalizeItem({ ...item, ...res });
        }
      } catch (e) {
        showToast(String(e?.message || e || "详情加载失败"));
      } finally {
        detailLoading.value = false;
        nextTick(() => bindLinkClicks());
      }
    };
    const closeDetail = () => {
      selected.value = null;
    };
    const handleChaoxingLink = async (href) => {
      const url = String(href || "").trim();
      if (!url) return;
      const lower = url.toLowerCase();
      if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("file:")) {
        showToast("已拦截不安全链接");
        return;
      }
      try {
        await openExternal(url);
      } catch (e) {
        showToast(String(e?.message || e || "无法打开链接"));
      }
    };
    const bindLinkClicks = () => {
      const root = document.querySelector(".cx-inbox-detail-body");
      if (!root) return;
      root.querySelectorAll("a[href]").forEach((a) => {
        a.addEventListener(
          "click",
          (ev) => {
            ev.preventDefault();
            void handleChaoxingLink(a.getAttribute("href"));
          },
          { once: false }
        );
      });
    };
    const markRead = async () => {
      if (!selected.value?.id || selected.value.isRead) return;
      try {
        await invokeNative("school_inbox_mark_read", {
          loginMode: CHAOXING_LOGIN_MODE,
          login_mode: CHAOXING_LOGIN_MODE,
          itemId: selected.value.id,
          item_id: selected.value.id
        });
        selected.value = { ...selected.value, isRead: true };
        items.value = items.value.map(
          (i) => i.id === selected.value.id ? { ...i, isRead: true } : i
        );
      } catch (e) {
        showToast(String(e?.message || e || "标记已读失败"));
      }
    };
    onMounted(fetchList);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "收件箱",
          icon: "inbox",
          onBack: _cache[1] || (_cache[1] = ($event) => selected.value ? closeDetail() : emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "cx-inbox-btn ghost",
              disabled: loading.value,
              onClick: _cache[0] || (_cache[0] = ($event) => fetchList({ force: true }))
            }, toDisplayString(loading.value ? "刷新中" : "刷新"), 9, _hoisted_2)
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_3, [
          unreadCount.value ? (openBlock(), createElementBlock("p", _hoisted_4, "未读 " + toDisplayString(unreadCount.value) + " 条", 1)) : createCommentVNode("", true),
          loading.value && !items.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "loading",
            message: "正在加载学习通消息…"
          })) : error.value && !items.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "error",
            message: error.value
          }, null, 8, ["message"])) : createCommentVNode("", true),
          !selected.value ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            !loading.value && !items.value.length && !error.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: "暂无学习通消息。点刷新同步历史通知。"
            })) : !loading.value && items.value.length ? (openBlock(), createElementBlock("p", _hoisted_5, "共 " + toDisplayString(items.value.length) + " 条", 1)) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                type: "button",
                class: "cx-inbox-row",
                onClick: ($event) => openDetail(item)
              }, [
                createBaseVNode("div", _hoisted_7, [
                  createBaseVNode("span", {
                    class: normalizeClass(["cx-inbox-title", { unread: !item.isRead }])
                  }, toDisplayString(item.title), 3),
                  createBaseVNode("span", _hoisted_8, toDisplayString(formatItemTime(item.createdAt)), 1)
                ]),
                createBaseVNode("p", _hoisted_9, toDisplayString(item.summary || "点击查看详情"), 1)
              ], 8, _hoisted_6);
            }), 128))
          ], 64)) : (openBlock(), createElementBlock("section", _hoisted_10, [
            createBaseVNode("h3", null, toDisplayString(selected.value.title), 1),
            createBaseVNode("p", _hoisted_11, toDisplayString(formatItemTime(selected.value.createdAt)), 1),
            detailLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: "加载详情…"
            })) : (openBlock(), createElementBlock("div", {
              key: 1,
              class: "cx-inbox-detail-body",
              innerHTML: detailHtml.value
            }, null, 8, _hoisted_12)),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("button", {
                type: "button",
                class: "cx-inbox-btn",
                onClick: closeDetail
              }, "返回列表"),
              !selected.value.isRead ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "cx-inbox-btn primary",
                onClick: markRead
              }, " 标为已读 ")) : createCommentVNode("", true)
            ])
          ]))
        ])
      ]);
    };
  }
};
const ChaoxingInboxView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-5af1695e"]]);
export {
  ChaoxingInboxView as default
};
