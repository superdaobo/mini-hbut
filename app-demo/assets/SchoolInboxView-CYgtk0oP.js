import { a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _export_sfc, m as useI18n, t, W as markSchoolInboxNotified, o as openExternal } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { b as buildSchoolInboxDetailHtml } from "./school_inbox_content-CS2pL4iH.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, S as createSlots, k as withCtx, b as createBaseVNode, t as toDisplayString, u as unref, n as normalizeClass, d as createCommentVNode, j as createBlock, F as Fragment, f as renderList, r as ref, h as computed, C as nextTick } from "./vue-core-Dzs4fLAU.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "school-inbox-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-24" };
const _hoisted_2 = ["disabled", "aria-busy"];
const _hoisted_3 = {
  key: 1,
  class: "w-10 h-10",
  "aria-hidden": "true"
};
const _hoisted_4 = ["aria-busy", "aria-label"];
const _hoisted_5 = {
  key: 0,
  class: "p-4"
};
const _hoisted_6 = {
  key: 1,
  class: "flex-1 flex flex-col gap-4 p-4"
};
const _hoisted_7 = { class: "inbox-detail-card bg-surface-container-lowest border border-outline-variant" };
const _hoisted_8 = { class: "flex items-start justify-between gap-3" };
const _hoisted_9 = { class: "text-lg font-bold text-on-surface leading-snug" };
const _hoisted_10 = {
  key: 0,
  class: "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-container text-on-primary-container"
};
const _hoisted_11 = { class: "mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant" };
const _hoisted_12 = { class: "inbox-source-badge" };
const _hoisted_13 = ["innerHTML"];
const _hoisted_14 = {
  key: 2,
  class: "mt-3 text-xs text-on-surface-variant"
};
const _hoisted_15 = {
  key: 0,
  class: "mx-4 mt-2 px-3 py-2 rounded-xl bg-surface-container-low text-on-surface-variant text-xs"
};
const _hoisted_16 = { class: "flex-1 flex flex-col gap-3 p-4" };
const _hoisted_17 = {
  key: 0,
  class: "grid grid-cols-2 gap-3"
};
const _hoisted_18 = { class: "bg-primary-container rounded-2xl p-4 shadow-sm" };
const _hoisted_19 = { class: "text-xs font-medium text-on-primary-container/80" };
const _hoisted_20 = { class: "text-3xl font-bold text-on-primary-container leading-tight mt-1" };
const _hoisted_21 = { class: "bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant shadow-sm" };
const _hoisted_22 = { class: "text-xs font-medium text-on-surface-variant" };
const _hoisted_23 = { class: "text-3xl font-bold text-on-surface leading-tight mt-1" };
const _hoisted_24 = {
  key: 4,
  class: "flex flex-col gap-2"
};
const _hoisted_25 = ["onClick"];
const _hoisted_26 = { class: "flex items-start gap-3" };
const _hoisted_27 = { class: "flex-1 min-w-0" };
const _hoisted_28 = { class: "flex items-start justify-between gap-2" };
const _hoisted_29 = { class: "text-sm font-semibold text-on-surface leading-snug line-clamp-2" };
const _hoisted_30 = {
  key: 0,
  class: "mt-1 text-xs text-on-surface-variant line-clamp-2"
};
const _hoisted_31 = { class: "mt-2 flex items-center gap-2 text-[11px] text-outline" };
const _hoisted_32 = {
  key: 5,
  class: "text-xs text-error text-center"
};
const LOGIN_METHOD_KEY = "hbu_login_method";
const _sfc_main = {
  __name: "SchoolInboxView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const { t: tLocale } = useI18n();
    const resolveInboxLoginMode = () => String(localStorage.getItem(LOGIN_METHOD_KEY) || "").trim() || "portal";
    const props = __props;
    const emit = __emit;
    const loading = ref(false);
    const refreshing = ref(false);
    const detailLoading = ref(false);
    const markingRead = ref(false);
    const markReadHint = ref("");
    const error = ref("");
    const items = ref([]);
    const fetchedAt = ref("");
    const source = ref("");
    const selectedItem = ref(null);
    const isInitialLoading = computed(() => loading.value && items.value.length === 0);
    const unreadCount = computed(() => items.value.filter((item) => !item.isRead).length);
    const sourceLabel = computed(() => {
      if (source.value === "chaoxing") return tLocale("notify.source.chaoxing");
      if (source.value === "portal") return tLocale("notify.source.academicSystem");
      return tLocale("notify.card.schoolInbox");
    });
    const selectedDetailHtml = computed(
      () => selectedItem.value ? buildSchoolInboxDetailHtml(selectedItem.value.body) : ""
    );
    let listScrollTop = 0;
    const scrollSchoolInboxToTop = () => {
      nextTick(() => {
        requestAnimationFrame(() => {
          const root = document.querySelector(".school-inbox-page");
          const shell = root?.closest?.(".app-shell");
          if (shell) {
            shell.scrollTop = 0;
            return;
          }
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        });
      });
    };
    const restoreListScroll = () => {
      nextTick(() => {
        requestAnimationFrame(() => {
          const root = document.querySelector(".school-inbox-page");
          const shell = root?.closest?.(".app-shell");
          const targetTop = Math.max(0, listScrollTop);
          if (shell) {
            shell.scrollTop = targetTop;
            return;
          }
          window.scrollTo(0, targetTop);
        });
      });
    };
    const rememberListScroll = () => {
      const root = document.querySelector(".school-inbox-page");
      const shell = root?.closest?.(".app-shell");
      listScrollTop = shell ? shell.scrollTop : window.scrollY;
    };
    const formatItemTime = (value) => {
      const text = String(value || "").trim();
      if (!text) return tLocale("notify.inbox.unknownTime");
      const parsed = Date.parse(text.replace(/-/g, "/"));
      if (!Number.isFinite(parsed)) return text;
      return formatRelativeTime(new Date(parsed).toISOString()) || text;
    };
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
    const syncItemReadState = (itemId, isRead = true) => {
      items.value = items.value.map(
        (item) => item.id === itemId ? { ...item, isRead } : item
      );
      if (selectedItem.value?.id === itemId) {
        selectedItem.value = { ...selectedItem.value, isRead };
      }
    };
    const fetchMessages = async ({ force = false } = {}) => {
      if (!isTauriRuntime()) {
        error.value = tLocale("notify.inbox.desktopOnly");
        return;
      }
      const loginMode = resolveInboxLoginMode();
      if (force) {
        refreshing.value = true;
      } else {
        loading.value = true;
      }
      error.value = "";
      try {
        const response = await invokeNative("school_inbox_fetch", { loginMode });
        const list = Array.isArray(response?.items) ? response.items : [];
        items.value = list.map(normalizeItem).filter((item) => item.id);
        fetchedAt.value = String(response?.fetchedAt || response?.fetched_at || "");
        source.value = String(response?.source || list[0]?.source || "");
        if (response?.error) {
          error.value = String(response.error);
        }
      } catch (err) {
        error.value = err?.message || String(err) || tLocale("notify.inbox.fetchFailed");
      } finally {
        loading.value = false;
        refreshing.value = false;
      }
    };
    const loadDetail = async (item) => {
      if (!isTauriRuntime() || !item?.id) return;
      const loginMode = resolveInboxLoginMode();
      detailLoading.value = true;
      markReadHint.value = "";
      try {
        const response = await invokeNative("school_inbox_detail_fetch", {
          loginMode,
          itemId: item.id,
          fallback: {
            id: item.id,
            title: item.title,
            summary: item.summary,
            body: item.body,
            createdAt: item.createdAt,
            isRead: item.isRead,
            source: item.source,
            uuid: item.uuid || void 0
          }
        });
        if (response?.body) {
          const next = {
            ...item,
            title: String(response.title || item.title),
            body: String(response.body || item.body),
            createdAt: String(response.createdAt || response.created_at || item.createdAt),
            isRead: !!(response.isRead ?? response.is_read ?? item.isRead),
            source: String(response.source || item.source)
          };
          selectedItem.value = next;
          items.value = items.value.map((entry) => entry.id === next.id ? next : entry);
        }
      } catch (err) {
        markReadHint.value = err?.message || String(err) || tLocale("notify.inbox.detailFallback");
      } finally {
        detailLoading.value = false;
      }
    };
    const openItem = async (item) => {
      rememberListScroll();
      selectedItem.value = item;
      scrollSchoolInboxToTop();
      await loadDetail(item);
    };
    const closeDetail = () => {
      selectedItem.value = null;
      detailLoading.value = false;
      markingRead.value = false;
      markReadHint.value = "";
      restoreListScroll();
    };
    const handleBack = () => {
      if (selectedItem.value) {
        closeDetail();
        return;
      }
      emit("back");
    };
    const handleDetailClick = async (event) => {
      const target = event.target?.closest?.("a");
      if (!target?.href) return;
      event.preventDefault();
      await openExternal(target.href);
    };
    const markSelectedAsRead = async () => {
      if (!selectedItem.value || selectedItem.value.isRead || markingRead.value) return;
      if (!isTauriRuntime()) return;
      const loginMode = resolveInboxLoginMode();
      const itemId = selectedItem.value.id;
      markingRead.value = true;
      markReadHint.value = "";
      syncItemReadState(itemId, true);
      markSchoolInboxNotified(props.studentId, itemId);
      try {
        const response = await invokeNative("school_inbox_mark_read", {
          loginMode,
          itemId
        });
        if (response?.success === false) {
          markReadHint.value = String(response?.message || tLocale("notify.inbox.markReadServerFailed"));
        }
      } catch (err) {
        markReadHint.value = err?.message || String(err) || tLocale("notify.inbox.markReadFailed");
      } finally {
        markingRead.value = false;
      }
    };
    onMounted(() => {
      fetchMessages();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: selectedItem.value ? unref(tLocale)("notify.inbox.detailTitle") : unref(tLocale)("notify.card.schoolInbox"),
          icon: "mail",
          onBack: handleBack
        }, createSlots({ _: 2 }, [
          selectedItem.value ? {
            name: "actions",
            fn: withCtx(() => [
              !selectedItem.value.isRead ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "inbox-mark-read-btn",
                type: "button",
                disabled: markingRead.value,
                "aria-busy": markingRead.value,
                onClick: markSelectedAsRead
              }, [
                _cache[2] || (_cache[2] = createBaseVNode("span", { class: "material-symbols-outlined text-base" }, "done_all", -1)),
                createBaseVNode("span", null, toDisplayString(markingRead.value ? unref(tLocale)("notify.inbox.marking") : unref(tLocale)("notify.inbox.markRead")), 1)
              ], 8, _hoisted_2)) : (openBlock(), createElementBlock("div", _hoisted_3))
            ]),
            key: "0"
          } : {
            name: "actions",
            fn: withCtx(() => [
              createBaseVNode("button", {
                class: "inbox-refresh-btn",
                type: "button",
                "aria-busy": refreshing.value || loading.value,
                "aria-label": unref(tLocale)("notify.inbox.refreshList"),
                onClick: _cache[0] || (_cache[0] = ($event) => fetchMessages({ force: true }))
              }, [
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined", { spinning: refreshing.value || loading.value }])
                }, "refresh", 2)
              ], 8, _hoisted_4)
            ]),
            key: "1"
          }
        ]), 1032, ["title"]),
        !unref(isTauriRuntime)() ? (openBlock(), createElementBlock("div", _hoisted_5, [
          createVNode(unref(TEmptyState), {
            type: "empty",
            message: unref(tLocale)("notify.inbox.desktopOnlyFull")
          }, null, 8, ["message"])
        ])) : selectedItem.value ? (openBlock(), createElementBlock("main", _hoisted_6, [
          createBaseVNode("article", _hoisted_7, [
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("h2", _hoisted_9, toDisplayString(selectedItem.value.title), 1),
              !selectedItem.value.isRead ? (openBlock(), createElementBlock("span", _hoisted_10, toDisplayString(unref(tLocale)("notify.inbox.unread")), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_11, [
              createBaseVNode("span", _hoisted_12, toDisplayString(selectedItem.value.source === "chaoxing" ? unref(tLocale)("notify.source.chaoxing") : unref(tLocale)("notify.source.academicSystem")), 1),
              createBaseVNode("span", null, toDisplayString(selectedItem.value.createdAt || unref(tLocale)("notify.inbox.unknownTime")), 1)
            ]),
            detailLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(tLocale)("notify.inbox.loadingDetail")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", {
              key: 1,
              class: "inbox-detail-body inbox-detail-body--rich",
              onClick: handleDetailClick,
              innerHTML: selectedDetailHtml.value
            }, null, 8, _hoisted_13)),
            markReadHint.value ? (openBlock(), createElementBlock("p", _hoisted_14, toDisplayString(markReadHint.value), 1)) : createCommentVNode("", true)
          ])
        ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          fetchedAt.value ? (openBlock(), createElementBlock("div", _hoisted_15, toDisplayString(unref(t)("notify.inbox.sourceUpdated", { source: sourceLabel.value, time: unref(formatRelativeTime)(fetchedAt.value) || fetchedAt.value })), 1)) : createCommentVNode("", true),
          createBaseVNode("main", _hoisted_16, [
            !isInitialLoading.value && !error.value && items.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_17, [
              createBaseVNode("div", _hoisted_18, [
                createBaseVNode("span", _hoisted_19, toDisplayString(unref(tLocale)("notify.inbox.all")), 1),
                createBaseVNode("div", _hoisted_20, toDisplayString(items.value.length), 1)
              ]),
              createBaseVNode("div", _hoisted_21, [
                createBaseVNode("span", _hoisted_22, toDisplayString(unref(tLocale)("notify.inbox.unread")), 1),
                createBaseVNode("div", _hoisted_23, toDisplayString(unreadCount.value), 1)
              ])
            ])) : createCommentVNode("", true),
            isInitialLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "loading",
              message: unref(tLocale)("notify.inbox.loadingList")
            }, null, 8, ["message"])) : error.value && items.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 2,
              type: "error",
              message: error.value
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  class: "mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold text-sm",
                  onClick: _cache[1] || (_cache[1] = ($event) => fetchMessages({ force: true }))
                }, toDisplayString(unref(tLocale)("notify.inbox.retry")), 1)
              ]),
              _: 1
            }, 8, ["message"])) : items.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 3,
              type: "empty",
              message: unref(tLocale)("notify.inbox.empty")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("ul", _hoisted_24, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
                return openBlock(), createElementBlock("li", {
                  key: item.id
                }, [
                  createBaseVNode("button", {
                    type: "button",
                    class: normalizeClass(["inbox-item w-full text-left bg-surface-container-lowest border border-outline-variant", { "inbox-item--unread": !item.isRead }]),
                    onClick: ($event) => openItem(item)
                  }, [
                    createBaseVNode("div", _hoisted_26, [
                      createBaseVNode("span", {
                        class: normalizeClass(["inbox-item-dot", item.isRead ? "inbox-item-dot--read" : "inbox-item-dot--unread"]),
                        "aria-hidden": "true"
                      }, null, 2),
                      createBaseVNode("div", _hoisted_27, [
                        createBaseVNode("div", _hoisted_28, [
                          createBaseVNode("h3", _hoisted_29, toDisplayString(item.title), 1),
                          _cache[3] || (_cache[3] = createBaseVNode("span", { class: "material-symbols-outlined text-base text-outline shrink-0" }, "chevron_right", -1))
                        ]),
                        item.summary ? (openBlock(), createElementBlock("p", _hoisted_30, toDisplayString(item.summary), 1)) : createCommentVNode("", true),
                        createBaseVNode("div", _hoisted_31, [
                          createBaseVNode("span", null, toDisplayString(item.source === "chaoxing" ? unref(tLocale)("notify.source.chaoxing") : unref(tLocale)("notify.source.academic")), 1),
                          _cache[4] || (_cache[4] = createBaseVNode("span", null, "·", -1)),
                          createBaseVNode("span", null, toDisplayString(formatItemTime(item.createdAt)), 1)
                        ])
                      ])
                    ])
                  ], 10, _hoisted_25)
                ]);
              }), 128))
            ])),
            error.value && items.value.length > 0 ? (openBlock(), createElementBlock("p", _hoisted_32, toDisplayString(error.value), 1)) : createCommentVNode("", true)
          ])
        ], 64))
      ]);
    };
  }
};
const SchoolInboxView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-93266e32"]]);
export {
  SchoolInboxView as default
};
