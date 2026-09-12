import { p as pushDebugLog, a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _export_sfc, m as useI18n, t, j as showToast, o as openExternal } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { b as buildSchoolInboxDetailHtml } from "./school_inbox_content-CS2pL4iH.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, t as toDisplayString, u as unref, d as createCommentVNode, j as createBlock, F as Fragment, f as renderList, n as normalizeClass, r as ref, h as computed, C as nextTick } from "./vue-core-Dzs4fLAU.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
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
    const { t: tLocale } = useI18n();
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
      title: String(item?.title || tLocale("notify.inbox.untitled")),
      summary: String(item?.summary || ""),
      body: String(item?.body || item?.summary || ""),
      createdAt: String(item?.createdAt || item?.created_at || ""),
      isRead: !!(item?.isRead ?? item?.is_read),
      source: String(item?.source || ""),
      uuid: String(item?.uuid || "")
    });
    const formatItemTime = (value) => {
      const text = String(value || "").trim();
      if (!text) return tLocale("notify.inbox.unknownTime");
      const parsed = Date.parse(text.replace(/-/g, "/"));
      if (!Number.isFinite(parsed)) return text;
      return formatRelativeTime(new Date(parsed).toISOString()) || text;
    };
    const fetchList = async ({ force = false } = {}) => {
      loading.value = true;
      error.value = "";
      const t0 = Date.now();
      pushDebugLog("ChaoxingInbox", `load inbox force=${force}`, "info");
      try {
        if (!isTauriRuntime()) {
          throw new Error(tLocale("notify.cx.clientOnly"));
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
          `inbox done count=${items.value.length} (${Date.now() - t0}ms)`,
          "info"
        );
      } catch (e) {
        error.value = String(e?.message || e || tLocale("notify.cx.loadFailed"));
        pushDebugLog("ChaoxingInbox", `inbox failed: ${error.value}`, "error");
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
        showToast(String(e?.message || e || tLocale("notify.inbox.detailLoadFailed")));
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
        showToast(tLocale("notify.cx.unsafeLinkBlocked"));
        return;
      }
      try {
        await openExternal(url);
      } catch (e) {
        showToast(String(e?.message || e || tLocale("notify.cx.openLinkFailed")));
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
        showToast(String(e?.message || e || tLocale("notify.inbox.markReadFailed")));
      }
    };
    onMounted(fetchList);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(tLocale)("notify.cx.title"),
          icon: "inbox",
          onBack: _cache[1] || (_cache[1] = ($event) => selected.value ? closeDetail() : emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "cx-inbox-btn ghost",
              disabled: loading.value,
              onClick: _cache[0] || (_cache[0] = ($event) => fetchList({ force: true }))
            }, toDisplayString(loading.value ? unref(tLocale)("notify.inbox.refreshing") : unref(tLocale)("notify.inbox.refresh")), 9, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_3, [
          unreadCount.value ? (openBlock(), createElementBlock("p", _hoisted_4, toDisplayString(unref(t)("notify.inbox.unreadCount", { n: unreadCount.value })), 1)) : createCommentVNode("", true),
          loading.value && !items.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "loading",
            message: unref(tLocale)("notify.cx.loading")
          }, null, 8, ["message"])) : error.value && !items.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "error",
            message: error.value
          }, null, 8, ["message"])) : createCommentVNode("", true),
          !selected.value ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            !loading.value && !items.value.length && !error.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(tLocale)("notify.cx.empty")
            }, null, 8, ["message"])) : !loading.value && items.value.length ? (openBlock(), createElementBlock("p", _hoisted_5, toDisplayString(unref(t)("notify.inbox.totalCount", { n: items.value.length })), 1)) : createCommentVNode("", true),
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
                createBaseVNode("p", _hoisted_9, toDisplayString(item.summary || unref(tLocale)("notify.cx.viewDetail")), 1)
              ], 8, _hoisted_6);
            }), 128))
          ], 64)) : (openBlock(), createElementBlock("section", _hoisted_10, [
            createBaseVNode("h3", null, toDisplayString(selected.value.title), 1),
            createBaseVNode("p", _hoisted_11, toDisplayString(formatItemTime(selected.value.createdAt)), 1),
            detailLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(tLocale)("notify.inbox.loadingDetail")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", {
              key: 1,
              class: "cx-inbox-detail-body",
              innerHTML: detailHtml.value
            }, null, 8, _hoisted_12)),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("button", {
                type: "button",
                class: "cx-inbox-btn",
                onClick: closeDetail
              }, toDisplayString(unref(tLocale)("notify.inbox.backToList")), 1),
              !selected.value.isRead ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "cx-inbox-btn primary",
                onClick: markRead
              }, toDisplayString(unref(tLocale)("notify.inbox.markRead")), 1)) : createCommentVNode("", true)
            ])
          ]))
        ])
      ]);
    };
  }
};
const ChaoxingInboxView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-4f2808ad"]]);
export {
  ChaoxingInboxView as default
};
