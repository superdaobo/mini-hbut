import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DhSUOFfG.js";
import { u as useI18n, c as useAuthStore, p as openExternal, _ as _export_sfc } from "./app-demo-DztvWo2z.js";
import { T as TEmptyState } from "./TEmptyState-B5LRf-mZ.js";
import { b as buildSchoolInboxDetailHtml } from "./school_inbox_content-CxpfsU1v.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { u as useTeacherNotifications, T as TEACHER_ERROR_I18N_KEY } from "./useTeacherNotifications-BcHQrvPs.js";
import { r as resolveTeacherAccountId } from "./teacher_scope-Dh6O3Ukw.js";
import { y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, t as toDisplayString, d as createCommentVNode, F as Fragment, f as renderList, j as createBlock, r as ref, h as computed } from "./vue-core-D-44rohN.js";
import "./runtime-bridge-gQMtwwk6.js";
import "./more-modules-yxgAg-Rh.js";
import "./debug-tools-CyNtADDO.js";
import "./capture-YhmA9GNe.js";
import "./teacherApi-BZ56ekcn.js";
const _hoisted_1 = { class: "teacher-notification-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-24" };
const _hoisted_2 = ["aria-busy", "aria-label"];
const _hoisted_3 = {
  key: 0,
  class: "flex-1 flex flex-col gap-4 p-4"
};
const _hoisted_4 = { class: "teacher-notice-card" };
const _hoisted_5 = { class: "flex items-start justify-between gap-3" };
const _hoisted_6 = { class: "text-lg font-bold text-on-surface leading-snug" };
const _hoisted_7 = {
  key: 0,
  class: "teacher-notice-badge"
};
const _hoisted_8 = { class: "mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant" };
const _hoisted_9 = { class: "teacher-notice-source" };
const _hoisted_10 = ["innerHTML"];
const _hoisted_11 = { class: "mt-3 text-xs text-on-surface-variant" };
const _hoisted_12 = {
  key: 1,
  class: "mt-1 text-xs text-on-surface-variant"
};
const _hoisted_13 = {
  key: 1,
  class: "flex-1 flex flex-col gap-4 p-4"
};
const _hoisted_14 = { class: "teacher-notice-card" };
const _hoisted_15 = { class: "text-lg font-bold text-on-surface leading-snug" };
const _hoisted_16 = { class: "mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant" };
const _hoisted_17 = { class: "teacher-notice-body" };
const _hoisted_18 = {
  class: "teacher-notice-tabs",
  role: "tablist"
};
const _hoisted_19 = ["aria-selected", "onClick"];
const _hoisted_20 = {
  key: 0,
  class: "mx-4 mt-2 px-3 py-2 rounded-xl bg-surface-container-low text-on-surface-variant text-xs"
};
const _hoisted_21 = { class: "flex-1 flex flex-col gap-3 p-4" };
const _hoisted_22 = {
  key: 0,
  class: "flex flex-col gap-2"
};
const _hoisted_23 = ["onClick"];
const _hoisted_24 = { class: "flex-1 min-w-0" };
const _hoisted_25 = { class: "block text-sm font-semibold text-on-surface leading-snug line-clamp-2" };
const _hoisted_26 = {
  key: 0,
  class: "block mt-1 text-xs text-on-surface-variant line-clamp-2"
};
const _hoisted_27 = { class: "block mt-2 text-[11px] text-outline" };
const _hoisted_28 = {
  key: 0,
  class: "flex flex-col gap-2"
};
const _hoisted_29 = ["onClick"];
const _hoisted_30 = { class: "flex-1 min-w-0" };
const _hoisted_31 = { class: "block text-sm font-semibold text-on-surface leading-snug line-clamp-2" };
const _hoisted_32 = { class: "block mt-2 text-[11px] text-outline" };
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
    const refresh = async () => {
      await Promise.all([loadNotices(), loadReminders()]);
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
      void refresh();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: detailTitle.value,
          icon: "mail",
          onBack: handleBack
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "teacher-notification-refresh",
              type: "button",
              "aria-busy": unref(loading) || unref(remindersLoading),
              "aria-label": unref(tLocale)("notify.inbox.refreshList"),
              onClick: refresh
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: unref(loading) || unref(remindersLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        selectedNotice.value ? (openBlock(), createElementBlock("main", _hoisted_3, [
          createBaseVNode("article", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("h2", _hoisted_6, toDisplayString(selectedNotice.value.title || unref(tLocale)("notify.inbox.untitled")), 1),
              !selectedIsRead.value ? (openBlock(), createElementBlock("span", _hoisted_7, toDisplayString(unref(tLocale)("notify.inbox.unread")), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("span", _hoisted_9, toDisplayString(sourceLabel(selectedNotice.value)), 1),
              createBaseVNode("span", null, toDisplayString(formatItemTime(selectedNotice.value.createdAt)), 1)
            ]),
            createBaseVNode("div", {
              class: "teacher-notice-body",
              onClick: handleDetailClick,
              innerHTML: detailHtml.value
            }, null, 8, _hoisted_10),
            !selectedIsRead.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "teacher-notice-mark-read",
              type: "button",
              onClick: markSelectedAsRead
            }, [
              _cache[0] || (_cache[0] = createBaseVNode("span", { class: "material-symbols-outlined text-base" }, "done_all", -1)),
              createBaseVNode("span", null, toDisplayString(unref(tLocale)("notify.inbox.markRead")), 1)
            ])) : createCommentVNode("", true),
            createBaseVNode("p", _hoisted_11, toDisplayString(unref(tLocale)("notify.inbox.teacherLocalOnly")), 1),
            markHint.value ? (openBlock(), createElementBlock("p", _hoisted_12, toDisplayString(markHint.value), 1)) : createCommentVNode("", true)
          ])
        ])) : selectedReminder.value ? (openBlock(), createElementBlock("main", _hoisted_13, [
          createBaseVNode("article", _hoisted_14, [
            createBaseVNode("h2", _hoisted_15, toDisplayString(selectedReminder.value.title), 1),
            createBaseVNode("div", _hoisted_16, [
              createBaseVNode("span", null, toDisplayString(reminderTime(selectedReminder.value)), 1)
            ]),
            createBaseVNode("p", _hoisted_17, toDisplayString(selectedReminder.value.body), 1)
          ])
        ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          createBaseVNode("nav", _hoisted_18, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(tabs.value, (tab) => {
              return openBlock(), createElementBlock("button", {
                key: tab.id,
                class: normalizeClass(["teacher-notice-tab", { "teacher-notice-tab--active": activeTab.value === tab.id }]),
                type: "button",
                role: "tab",
                "aria-selected": activeTab.value === tab.id,
                onClick: ($event) => activeTab.value = tab.id
              }, toDisplayString(tab.label), 11, _hoisted_19);
            }), 128))
          ]),
          !unref(desktopOnly) && !unref(error) && unref(academicNotices).length > 0 ? (openBlock(), createElementBlock("div", _hoisted_20, toDisplayString(unref(tLocale)("notify.inbox.unread")) + ": " + toDisplayString(unref(unreadCount)) + " / " + toDisplayString(unref(academicNotices).length), 1)) : createCommentVNode("", true),
          createBaseVNode("main", _hoisted_21, [
            unref(desktopOnly) ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(tLocale)("notify.inbox.desktopOnlyFull")
            }, null, 8, ["message"])) : unref(loading) && unref(academicNotices).length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "loading",
              message: unref(tLocale)("notify.inbox.loadingList")
            }, null, 8, ["message"])) : unref(error) && unref(academicNotices).length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 2,
              type: "error",
              message: errorMessage.value
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  class: "teacher-notice-retry",
                  type: "button",
                  onClick: refresh
                }, toDisplayString(unref(tLocale)("notify.inbox.retry")), 1)
              ]),
              _: 1
            }, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
              showNotices.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                unref(academicNotices).length > 0 ? (openBlock(), createElementBlock("ul", _hoisted_22, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(academicNotices), (item) => {
                    return openBlock(), createElementBlock("li", {
                      key: item.id
                    }, [
                      createBaseVNode("button", {
                        type: "button",
                        class: normalizeClass(["teacher-notice-item", { "teacher-notice-item--unread": !item.isRead }]),
                        onClick: ($event) => openNotice(item)
                      }, [
                        createBaseVNode("span", {
                          class: normalizeClass(["teacher-notice-dot", item.isRead ? "teacher-notice-dot--read" : "teacher-notice-dot--unread"]),
                          "aria-hidden": "true"
                        }, null, 2),
                        createBaseVNode("span", _hoisted_24, [
                          createBaseVNode("span", _hoisted_25, toDisplayString(item.title || unref(tLocale)("notify.inbox.untitled")), 1),
                          item.summary ? (openBlock(), createElementBlock("span", _hoisted_26, toDisplayString(item.summary), 1)) : createCommentVNode("", true),
                          createBaseVNode("span", _hoisted_27, toDisplayString(sourceLabel(item)) + " · " + toDisplayString(formatItemTime(item.createdAt)), 1)
                        ])
                      ], 10, _hoisted_23)
                    ]);
                  }), 128))
                ])) : activeTab.value !== "teaching" ? (openBlock(), createBlock(unref(TEmptyState), {
                  key: 1,
                  type: "empty",
                  message: unref(tLocale)("teacher.notification.empty")
                }, null, 8, ["message"])) : createCommentVNode("", true)
              ], 64)) : createCommentVNode("", true),
              showReminders.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                unref(reminders).length > 0 ? (openBlock(), createElementBlock("ul", _hoisted_28, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(reminders), (event) => {
                    return openBlock(), createElementBlock("li", {
                      key: event.id
                    }, [
                      createBaseVNode("button", {
                        type: "button",
                        class: "teacher-notice-item",
                        onClick: ($event) => openReminder(event)
                      }, [
                        _cache[1] || (_cache[1] = createBaseVNode("span", { class: "material-symbols-outlined text-base text-outline" }, "notifications_active", -1)),
                        createBaseVNode("span", _hoisted_30, [
                          createBaseVNode("span", _hoisted_31, toDisplayString(event.title), 1),
                          createBaseVNode("span", _hoisted_32, toDisplayString(reminderTime(event)), 1)
                        ])
                      ], 8, _hoisted_29)
                    ]);
                  }), 128))
                ])) : activeTab.value !== "academic" && unref(remindersLoading) === false ? (openBlock(), createBlock(unref(TEmptyState), {
                  key: 1,
                  type: "empty",
                  message: unref(tLocale)("teacher.notification.teachingReminderEmpty")
                }, null, 8, ["message"])) : createCommentVNode("", true)
              ], 64)) : createCommentVNode("", true)
            ], 64))
          ])
        ], 64))
      ]);
    };
  }
});
const TeacherNotificationView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6079594a"]]);
export {
  TeacherNotificationView as default
};
