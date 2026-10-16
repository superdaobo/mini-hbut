import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-CSGuhC_h.js";
import { T as TCard, _ as _sfc_main$5 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-hy13FaxX.js";
import { T as TEmptyState } from "./TEmptyState-Q6txwufz.js";
import { u as useI18n, c as useAuthStore, bX as TModal, a8 as buildSchoolInboxDetailHtml, p as openExternal, c3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-TQEQRs3d.js";
import { _ as _sfc_main$2, a as _sfc_main$3, b as _sfc_main$4 } from "./TabsTrigger.vue_vue_type_script_setup_true_lang-Dq713ErW.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { u as useTeacherNotifications, T as TEACHER_ERROR_I18N_KEY } from "./useTeacherNotifications-BjYMMTdR.js";
import { y as defineComponent, o as onMounted, l as onBeforeUnmount, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, F as Fragment, f as renderList, j as createBlock, g as createTextVNode, t as toDisplayString, d as createCommentVNode, r as ref, h as computed } from "./vue-core-CU1bwGIw.js";
import "./teacher_sync_status-But3HSMJ.js";
import "./runtime-bridge-DtTGpr5b.js";
import "./more-modules-DxXoZJOA.js";
import "./debug-tools-Csa71jvB.js";
import "./capture-DDnJhEie.js";
const _hoisted_1 = { class: "min-h-screen bg-surface text-on-surface max-w-[448px] mx-auto pb-24" };
const _hoisted_2 = ["aria-label", "disabled"];
const _hoisted_3 = { class: "p-4 space-y-4" };
const _hoisted_4 = {
  key: 0,
  class: "px-3 py-2 text-xs text-on-surface-variant rounded-xl bg-surface-container-low"
};
const _hoisted_5 = {
  key: 0,
  class: "space-y-2"
};
const _hoisted_6 = {
  key: 1,
  class: "space-y-2"
};
const _hoisted_7 = ["onClick"];
const _hoisted_8 = { class: "flex-1 min-w-0" };
const _hoisted_9 = { class: "block text-sm font-bold text-on-surface break-words" };
const _hoisted_10 = {
  key: 0,
  class: "block text-xs mt-1 text-on-surface-variant line-clamp-2"
};
const _hoisted_11 = { class: "block text-xs mt-2 text-on-surface-variant" };
const _hoisted_12 = {
  key: 1,
  class: "space-y-2"
};
const _hoisted_13 = {
  key: 1,
  class: "space-y-2"
};
const _hoisted_14 = ["onClick"];
const _hoisted_15 = { class: "flex-1 min-w-0" };
const _hoisted_16 = { class: "block text-sm font-bold text-on-surface" };
const _hoisted_17 = { class: "block mt-2 text-xs text-on-surface-variant" };
const _hoisted_18 = {
  key: 0,
  class: "space-y-3"
};
const _hoisted_19 = { class: "text-base font-bold text-on-surface break-words" };
const _hoisted_20 = { class: "text-xs text-on-surface-variant" };
const _hoisted_21 = ["innerHTML"];
const _hoisted_22 = { class: "text-xs text-on-surface-variant" };
const _hoisted_23 = {
  key: 1,
  class: "text-xs text-on-surface-variant"
};
const _hoisted_24 = {
  key: 1,
  class: "space-y-3"
};
const _hoisted_25 = { class: "text-base font-bold text-on-surface" };
const _hoisted_26 = { class: "text-xs text-on-surface-variant" };
const _hoisted_27 = { class: "text-sm text-on-surface whitespace-pre-wrap" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherNotificationView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t: tLocale } = useI18n();
    const authStore = useAuthStore();
    const accountId = computed(() => resolveTeacherAccountId(authStore.studentId));
    const semester = computed(() => "");
    const {
      reminders,
      loading,
      remindersLoading,
      error,
      desktopOnly,
      unreadCount,
      academicNotices,
      lastSuccessfulSyncAt,
      syncStatus,
      loadNotices,
      loadReminders,
      markLocalRead,
      isLocallyRead
    } = useTeacherNotifications({
      accountId: () => accountId.value,
      semester: () => semester.value
    });
    const activeTab = ref("all");
    const selectedNotice = ref(null);
    const selectedReminder = ref(null);
    const markHint = ref("");
    const tabs = computed(() => [
      { id: "all", label: tLocale("notify.inbox.all") },
      { id: "academic", label: tLocale("teacher.notification.tabAcademic") },
      { id: "teaching", label: tLocale("teacher.notification.tabTeachingReminder") }
    ]);
    const showNotices = computed(() => activeTab.value !== "teaching");
    const showReminders = computed(() => activeTab.value !== "academic");
    const errorMessage = computed(() => {
      if (!error.value) return "";
      return tLocale(TEACHER_ERROR_I18N_KEY[error.value.kind] || "teacher.error.unknown");
    });
    const syncErrorKey = computed(
      () => error.value ? TEACHER_ERROR_I18N_KEY[error.value.kind] || "teacher.error.unknown" : ""
    );
    const selectedIsRead = computed(() => {
      const item = selectedNotice.value;
      if (!item) return true;
      return item.isRead || isLocallyRead(item.id);
    });
    const detailHtml = computed(
      () => selectedNotice.value ? buildSchoolInboxDetailHtml(selectedNotice.value.body) : ""
    );
    const detailTitle = computed(() => {
      if (selectedNotice.value || selectedReminder.value) return tLocale("notify.inbox.detailTitle");
      return tLocale("teacher.notification.title");
    });
    const formatItemTime = (value) => {
      const text = String(value || "").trim();
      if (!text) return tLocale("notify.inbox.unknownTime");
      const parsed = Date.parse(text.replace(/-/g, "/"));
      if (!Number.isFinite(parsed)) return text;
      return formatRelativeTime(new Date(parsed).toISOString()) || text;
    };
    const reminderTime = (event) => {
      const secs = Number(event?.atEpochSecs || 0);
      if (!secs) return tLocale("notify.inbox.unknownTime");
      return formatRelativeTime(new Date(secs * 1e3).toISOString()) || tLocale("notify.inbox.unknownTime");
    };
    const sourceLabel = (item) => item.source === "portal" ? tLocale("teacher.notification.academicSource") : item.source;
    const loadInitial = async () => {
      await Promise.all([loadNotices(), loadReminders()]);
    };
    const refresh = async () => {
      await Promise.all([loadNotices({ force: true }), loadReminders()]);
    };
    const openNotice = (item) => {
      markHint.value = "";
      selectedReminder.value = null;
      selectedNotice.value = item;
    };
    const openReminder = (event) => {
      selectedNotice.value = null;
      selectedReminder.value = event;
    };
    const closeDetail = () => {
      selectedNotice.value = null;
      selectedReminder.value = null;
      markHint.value = "";
    };
    const closeDetailOnEscape = (event) => {
      if (event.key === "Escape" && (selectedNotice.value || selectedReminder.value)) closeDetail();
    };
    const handleBack = () => {
      if (selectedNotice.value || selectedReminder.value) {
        closeDetail();
        return;
      }
      emit("back");
    };
    const handleDetailClick = async (event) => {
      const target = event.target?.closest?.("a");
      const href = target?.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      await openExternal(href);
    };
    const markSelectedAsRead = () => {
      const item = selectedNotice.value;
      if (!item || selectedIsRead.value) return;
      markLocalRead(item.id);
      markHint.value = tLocale("notify.inbox.teacherLocalOnly");
    };
    onMounted(() => {
      window.addEventListener("keydown", closeDetailOnEscape);
      void loadInitial();
    });
    onBeforeUnmount(() => window.removeEventListener("keydown", closeDetailOnEscape));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(tLocale)("teacher.notification.title"),
          icon: "mail",
          onBack: handleBack
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest",
              "aria-label": unref(tLocale)("notify.inbox.refreshList"),
              disabled: unref(loading) || unref(remindersLoading),
              onClick: refresh
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(loading) || unref(remindersLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("main", _hoisted_3, [
          createVNode(unref(_sfc_main$4), {
            modelValue: activeTab.value,
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => activeTab.value = $event)
          }, {
            default: withCtx(() => [
              createVNode(unref(_sfc_main$2), {
                class: "w-full rounded-2xl bg-surface-container-high p-1",
                "aria-label": unref(tLocale)("teacher.notification.title")
              }, {
                default: withCtx(() => [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(tabs.value, (tab) => {
                    return openBlock(), createBlock(unref(_sfc_main$3), {
                      key: tab.id,
                      value: tab.id,
                      class: "flex-1 rounded-xl"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(tab.label), 1)
                      ]),
                      _: 2
                    }, 1032, ["value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["aria-label"])
            ]),
            _: 1
          }, 8, ["modelValue"]),
          !unref(desktopOnly) && !unref(error) && unref(academicNotices).length ? (openBlock(), createElementBlock("div", _hoisted_4, toDisplayString(unref(tLocale)("notify.inbox.unread")) + "：" + toDisplayString(unref(unreadCount)) + " / " + toDisplayString(unref(academicNotices).length), 1)) : createCommentVNode("", true),
          unref(desktopOnly) ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            message: unref(tLocale)("notify.inbox.desktopOnlyFull")
          }, null, 8, ["message"])) : unref(loading) && !unref(academicNotices).length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "loading",
            message: unref(tLocale)("notify.inbox.loadingList")
          }, null, 8, ["message"])) : unref(error) && !unref(academicNotices).length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 3,
            type: "error",
            message: errorMessage.value
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "mt-3 text-primary font-semibold",
                onClick: refresh
              }, toDisplayString(unref(tLocale)("notify.inbox.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            showNotices.value ? (openBlock(), createElementBlock("section", _hoisted_5, [
              !unref(academicNotices).length && activeTab.value === "academic" ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                message: unref(tLocale)("teacher.notification.empty")
              }, null, 8, ["message"])) : (openBlock(), createElementBlock("ul", _hoisted_6, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(academicNotices), (item) => {
                  return openBlock(), createElementBlock("li", {
                    key: item.id
                  }, [
                    createVNode(unref(TCard), {
                      compact: "",
                      hoverable: ""
                    }, {
                      default: withCtx(() => [
                        createBaseVNode("button", {
                          type: "button",
                          class: "w-full text-left flex items-center gap-3 min-w-0",
                          onClick: ($event) => openNotice(item)
                        }, [
                          createBaseVNode("span", {
                            class: normalizeClass(["rounded-full w-2 h-2 shrink-0", item.isRead || unref(isLocallyRead)(item.id) ? "bg-outline/40" : "bg-primary"]),
                            "aria-hidden": "true"
                          }, null, 2),
                          createBaseVNode("span", _hoisted_8, [
                            createBaseVNode("span", _hoisted_9, toDisplayString(item.title || unref(tLocale)("notify.inbox.untitled")), 1),
                            item.summary ? (openBlock(), createElementBlock("span", _hoisted_10, toDisplayString(item.summary), 1)) : createCommentVNode("", true),
                            createBaseVNode("span", _hoisted_11, toDisplayString(sourceLabel(item)) + " · " + toDisplayString(formatItemTime(item.createdAt)), 1)
                          ]),
                          _cache[1] || (_cache[1] = createBaseVNode("span", {
                            class: "material-symbols-outlined text-on-surface-variant text-lg",
                            "aria-hidden": "true"
                          }, "chevron_right", -1))
                        ], 8, _hoisted_7)
                      ]),
                      _: 2
                    }, 1024)
                  ]);
                }), 128))
              ]))
            ])) : createCommentVNode("", true),
            showReminders.value ? (openBlock(), createElementBlock("section", _hoisted_12, [
              !unref(reminders).length && !unref(remindersLoading) && activeTab.value === "teaching" ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                message: unref(tLocale)("teacher.notification.teachingReminderEmpty")
              }, null, 8, ["message"])) : (openBlock(), createElementBlock("ul", _hoisted_13, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(reminders), (event) => {
                  return openBlock(), createElementBlock("li", {
                    key: event.id
                  }, [
                    createVNode(unref(TCard), {
                      compact: "",
                      hoverable: ""
                    }, {
                      default: withCtx(() => [
                        createBaseVNode("button", {
                          type: "button",
                          class: "w-full text-left flex items-center gap-3 min-w-0",
                          onClick: ($event) => openReminder(event)
                        }, [
                          _cache[2] || (_cache[2] = createBaseVNode("span", { class: "material-symbols-outlined text-primary" }, "notifications_active", -1)),
                          createBaseVNode("span", _hoisted_15, [
                            createBaseVNode("span", _hoisted_16, toDisplayString(event.title), 1),
                            createBaseVNode("span", _hoisted_17, toDisplayString(reminderTime(event)), 1)
                          ]),
                          _cache[3] || (_cache[3] = createBaseVNode("span", {
                            class: "material-symbols-outlined text-on-surface-variant text-lg",
                            "aria-hidden": "true"
                          }, "chevron_right", -1))
                        ], 8, _hoisted_14)
                      ]),
                      _: 2
                    }, 1024)
                  ]);
                }), 128))
              ]))
            ])) : createCommentVNode("", true)
          ], 64)),
          createVNode(_sfc_main$5, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": syncErrorKey.value
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ]),
        createVNode(unref(TModal), {
          visible: Boolean(selectedNotice.value || selectedReminder.value),
          title: detailTitle.value,
          width: "480px",
          onClose: closeDetail
        }, {
          default: withCtx(() => [
            selectedNotice.value ? (openBlock(), createElementBlock("article", _hoisted_18, [
              createBaseVNode("h2", _hoisted_19, toDisplayString(selectedNotice.value.title || unref(tLocale)("notify.inbox.untitled")), 1),
              createBaseVNode("p", _hoisted_20, toDisplayString(sourceLabel(selectedNotice.value)) + " · " + toDisplayString(formatItemTime(selectedNotice.value.createdAt)), 1),
              createBaseVNode("div", {
                class: "teacher-notice-html text-sm text-on-surface leading-relaxed break-words",
                onClick: handleDetailClick,
                innerHTML: detailHtml.value
              }, null, 8, _hoisted_21),
              !selectedIsRead.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "rounded-xl px-3 py-2 text-sm font-semibold bg-surface-container-low text-on-surface",
                onClick: markSelectedAsRead
              }, toDisplayString(unref(tLocale)("notify.inbox.markRead")), 1)) : createCommentVNode("", true),
              createBaseVNode("p", _hoisted_22, toDisplayString(unref(tLocale)("notify.inbox.teacherLocalOnly")), 1),
              markHint.value ? (openBlock(), createElementBlock("p", _hoisted_23, toDisplayString(markHint.value), 1)) : createCommentVNode("", true)
            ])) : selectedReminder.value ? (openBlock(), createElementBlock("article", _hoisted_24, [
              createBaseVNode("h2", _hoisted_25, toDisplayString(selectedReminder.value.title), 1),
              createBaseVNode("p", _hoisted_26, toDisplayString(reminderTime(selectedReminder.value)), 1),
              createBaseVNode("p", _hoisted_27, toDisplayString(selectedReminder.value.body), 1)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["visible", "title"])
      ]);
    };
  }
});
const TeacherNotificationView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-bdca83ce"]]);
export {
  TeacherNotificationView as default
};
