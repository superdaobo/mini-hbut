import { r as ref, o as onMounted, l as onBeforeUnmount, v as watch, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, F as Fragment, f as renderList, j as createBlock, k as withCtx, w as withModifiers, K as withDirectives, Q as vModelCheckbox, d as createCommentVNode, p as createVNode, P as vModelSelect, n as normalizeClass, g as createTextVNode, h as computed, C as nextTick } from "./vue-core-Dzs4fLAU.js";
import { _ as _imports_0 } from "./app_icon-BoqTJkLh.js";
import { q as getRuntime, e as platformBridge, a as isTauriRuntime, F as isAndroidLike, v as isIOSLike, d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _export_sfc, u as useLocale, c as cloneWorkspaceLayout, a9 as getLastNotifySnapshot, aa as NOTIFY_SNAPSHOT_EVENT, p as tf, b as useUiSettings, ab as getNotificationMonitorSettings, i as buildDefaultWorkspaceLayout, h as flushUiSettings, ac as runNotificationCheck, ad as reconcileLocalReminders } from "./app-demo-CUOWTnz-.js";
import { f as fetchDormitoryDataset } from "./static_resource_cache-BR2tzHfN.js";
import { _ as _sfc_main$1, L as LayoutCollisionFxLayer, d as resolveLayoutSlotTarget, e as captureLayoutSlotAnchors, r as resolveRelativeCollisionPoint, c as createLayoutCollisionBurst, m as moveLayoutItemToIndex, a as resolveCollisionPalette, b as advanceLayoutCollisionFx } from "./layout_collision_fx-BIrknfsm.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const isDesktopTauri = () => getRuntime() === "tauri";
async function tryKeepScreenOn(enable) {
  return platformBridge.keepScreenOn(enable);
}
async function enableBackgroundPowerLock() {
  if (getRuntime() === "web") {
    return { enabled: false, source: [] };
  }
  const source = [];
  if (await tryKeepScreenOn(true)) {
    source.push(isDesktopTauri() ? "tauri-keep-screen-on" : "capacitor-wakelock");
  }
  return {
    enabled: source.length > 0,
    source
  };
}
async function disableBackgroundPowerLock() {
  if (getRuntime() === "web") {
    return { disabled: false, source: [] };
  }
  const source = [];
  if (await tryKeepScreenOn(false)) {
    source.push(isDesktopTauri() ? "tauri-keep-screen-on" : "capacitor-wakelock");
  }
  return {
    disabled: source.length > 0,
    source
  };
}
const _hoisted_1 = { class: "notification-view fade-in" };
const _hoisted_2 = { class: "dashboard-header" };
const _hoisted_3 = { class: "header-pill" };
const _hoisted_4 = { class: "notify-content" };
const _hoisted_5 = { class: "permission-card" };
const _hoisted_6 = { class: "permission-left" };
const _hoisted_7 = { class: "permission-info" };
const _hoisted_8 = { class: "permission-title" };
const _hoisted_9 = { class: "permission-desc" };
const _hoisted_10 = { class: "notify-types-section" };
const _hoisted_11 = { class: "section-heading" };
const _hoisted_12 = {
  key: 0,
  class: "notify-type-card"
};
const _hoisted_13 = { class: "notify-type-top" };
const _hoisted_14 = { class: "notify-type-body" };
const _hoisted_15 = { class: "notify-type-name" };
const _hoisted_16 = { class: "notify-type-desc" };
const _hoisted_17 = {
  key: 1,
  class: "notify-type-card"
};
const _hoisted_18 = { class: "notify-type-top" };
const _hoisted_19 = { class: "notify-type-body" };
const _hoisted_20 = { class: "notify-type-name" };
const _hoisted_21 = { class: "notify-type-desc" };
const _hoisted_22 = {
  key: 2,
  class: "notify-type-card"
};
const _hoisted_23 = { class: "notify-type-top" };
const _hoisted_24 = { class: "notify-type-body" };
const _hoisted_25 = { class: "notify-type-name" };
const _hoisted_26 = { class: "notify-type-desc" };
const _hoisted_27 = {
  key: 3,
  class: "notify-type-card"
};
const _hoisted_28 = { class: "notify-type-top" };
const _hoisted_29 = { class: "notify-type-body" };
const _hoisted_30 = { class: "notify-type-name" };
const _hoisted_31 = { class: "notify-type-desc" };
const _hoisted_32 = {
  key: 4,
  class: "notify-type-card"
};
const _hoisted_33 = { class: "notify-type-top" };
const _hoisted_34 = { class: "notify-type-body" };
const _hoisted_35 = { class: "notify-type-name" };
const _hoisted_36 = { class: "notify-type-desc" };
const _hoisted_37 = {
  key: 5,
  class: "notify-type-card"
};
const _hoisted_38 = { class: "notify-type-top" };
const _hoisted_39 = { class: "notify-type-body" };
const _hoisted_40 = { class: "notify-type-name" };
const _hoisted_41 = { class: "notify-type-desc" };
const _hoisted_42 = {
  key: 0,
  class: "layout-edit-bar"
};
const _hoisted_43 = { class: "sync-settings-card" };
const _hoisted_44 = { class: "sync-header" };
const _hoisted_45 = { class: "sync-header-left" };
const _hoisted_46 = { class: "sync-title" };
const _hoisted_47 = { class: "toggle-switch" };
const _hoisted_48 = { class: "sync-interval-row" };
const _hoisted_49 = { class: "sync-interval-label" };
const _hoisted_50 = { value: 15 };
const _hoisted_51 = { value: 30 };
const _hoisted_52 = { value: 60 };
const _hoisted_53 = { class: "sync-features-block" };
const _hoisted_54 = { class: "sync-feature-hint" };
const _hoisted_55 = { class: "action-buttons" };
const _hoisted_56 = ["disabled"];
const _hoisted_57 = ["disabled"];
const _hoisted_58 = { class: "recent-section" };
const _hoisted_59 = { class: "recent-header" };
const _hoisted_60 = { class: "section-heading" };
const _hoisted_61 = { class: "recent-time" };
const _hoisted_62 = {
  key: 0,
  class: "notify-message-card unread"
};
const _hoisted_63 = { class: "notify-msg-left" };
const _hoisted_64 = { class: "notify-msg-body" };
const _hoisted_65 = { class: "notify-msg-head" };
const _hoisted_66 = { class: "notify-msg-time" };
const _hoisted_67 = { class: "notify-msg-text" };
const _hoisted_68 = {
  key: 0,
  class: "notify-detail-list"
};
const _hoisted_69 = { class: "detail-main" };
const _hoisted_70 = { class: "detail-sub" };
const _hoisted_71 = { class: "detail-score" };
const _hoisted_72 = {
  key: 1,
  class: "notify-message-card"
};
const _hoisted_73 = { class: "notify-msg-left" };
const _hoisted_74 = { class: "notify-msg-body" };
const _hoisted_75 = { class: "notify-msg-head" };
const _hoisted_76 = { class: "notify-msg-title" };
const _hoisted_77 = { class: "notify-msg-time" };
const _hoisted_78 = { class: "notify-msg-text" };
const _hoisted_79 = {
  key: 0,
  class: "notify-detail-kv"
};
const _hoisted_80 = { class: "kv-item" };
const _hoisted_81 = {
  key: 2,
  class: "notify-message-card"
};
const _hoisted_82 = { class: "notify-msg-left" };
const _hoisted_83 = { class: "notify-msg-body" };
const _hoisted_84 = { class: "notify-msg-head" };
const _hoisted_85 = { class: "notify-msg-title" };
const _hoisted_86 = { class: "notify-msg-time" };
const _hoisted_87 = { class: "notify-msg-text" };
const _hoisted_88 = { class: "notify-detail-list" };
const _hoisted_89 = { class: "detail-main" };
const _hoisted_90 = {
  key: 0,
  class: "tag-urgent"
};
const _hoisted_91 = { class: "detail-sub" };
const _hoisted_92 = { key: 0 };
const _hoisted_93 = { key: 1 };
const _hoisted_94 = { key: 2 };
const _hoisted_95 = {
  key: 3,
  class: "notify-message-card"
};
const _hoisted_96 = { class: "notify-msg-left" };
const _hoisted_97 = { class: "notify-msg-body" };
const _hoisted_98 = { class: "notify-msg-head" };
const _hoisted_99 = { class: "notify-msg-title" };
const _hoisted_100 = { class: "notify-msg-time" };
const _hoisted_101 = { class: "notify-msg-text" };
const _hoisted_102 = {
  key: 0,
  class: "notify-msg-text"
};
const _hoisted_103 = {
  key: 4,
  class: "notify-message-card"
};
const _hoisted_104 = { class: "notify-msg-left" };
const _hoisted_105 = { class: "notify-msg-body" };
const _hoisted_106 = { class: "notify-msg-head" };
const _hoisted_107 = { class: "notify-msg-time" };
const _hoisted_108 = { class: "notify-msg-text" };
const _hoisted_109 = {
  key: 0,
  class: "notify-msg-text warn"
};
const _hoisted_110 = {
  key: 5,
  class: "notify-message-card"
};
const _hoisted_111 = { class: "notify-msg-left" };
const _hoisted_112 = { class: "notify-msg-body" };
const _hoisted_113 = { class: "notify-msg-head" };
const _hoisted_114 = { class: "notify-msg-time" };
const _hoisted_115 = { class: "notify-msg-text" };
const _hoisted_116 = {
  key: 0,
  class: "notify-msg-text warn"
};
const _hoisted_117 = { class: "notify-end-hint" };
const _hoisted_118 = {
  key: 0,
  class: "status-row"
};
const _hoisted_119 = {
  key: 0,
  class: "status-pill soft"
};
const _hoisted_120 = { class: "status-pill soft" };
const _hoisted_121 = {
  key: 0,
  class: "status-msg"
};
const _hoisted_122 = {
  key: 1,
  class: "status-err"
};
const _hoisted_123 = {
  key: 2,
  class: "modal-mask"
};
const _hoisted_124 = { class: "modal-card" };
const _hoisted_125 = { class: "modal-actions" };
const NOTIFICATION_LAYOUT_LONG_PRESS_MS = 380;
const NOTIFICATION_LAYOUT_LONG_PRESS_DISTANCE = 14;
const NOTIFICATION_LAYOUT_SCROLL_OFFSET_PX = 18;
const _sfc_main = {
  __name: "NotificationView",
  props: {
    studentId: String
  },
  emits: ["back", "openWorkspaceLayout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const uiSettings = useUiSettings();
    const { t: tLocale } = useLocale();
    const enableBackground = ref(false);
    const enableExamReminders = ref(true);
    const enableGradeNotices = ref(true);
    const enablePowerNotices = ref(true);
    const enableClassReminders = ref(true);
    const enableSchoolInboxNotices = ref(true);
    const enableChaoxingInboxNotices = ref(true);
    const bgNativeState = ref(null);
    const classLeadMinutes = ref(30);
    const checkInterval = ref(30);
    const showBatteryPrompt = ref(false);
    const backgroundLockEnabled = ref(false);
    const backgroundLockSource = ref("");
    const aggressiveKeepAliveSupported = ref(false);
    const keepAliveReason = ref("");
    const permissionState = ref("unknown");
    const statusMessage = ref("");
    const lastError = ref("");
    const sending = ref(false);
    const checking = ref(false);
    const snapshot = ref(null);
    const dormData = ref([]);
    const selectedPath = ref([]);
    const currentRuntime = ref(getRuntime());
    const notificationLayoutRef = ref(null);
    const isNotificationLayoutEditing = ref(false);
    const draftNotificationCardsOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).notifications.cardsOrder]);
    const draggingNotificationKey = ref("");
    const hoverNotificationKey = ref("");
    const notificationCollisionFx = ref([]);
    const isAndroid = isAndroidLike;
    const isAclDeniedError = (err) => {
      const text = String(err || "");
      return text.includes("not allowed by ACL") || text.includes("plugin:notification");
    };
    const normalizeDormPathValue = (value) => {
      if (value && typeof value === "object") {
        return String(value.value ?? value.id ?? value.label ?? value.name ?? "").trim();
      }
      return String(value ?? "").trim();
    };
    const normalizeDormSelection = (value) => {
      if (!Array.isArray(value)) return [];
      return value.map((item) => normalizeDormPathValue(item)).filter((item) => item !== "");
    };
    const readLocalDormSelection = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem("last_dorm_selection") || "[]");
        if (!Array.isArray(parsed) || parsed.length !== 4) return [];
        return normalizeDormSelection(parsed);
      } catch {
        return [];
      }
    };
    const saveSettings = () => {
      localStorage.setItem("hbu_notify_bg", enableBackground.value ? "true" : "false");
      localStorage.setItem("hbu_notify_exam", enableExamReminders.value ? "true" : "false");
      localStorage.setItem("hbu_notify_grade", enableGradeNotices.value ? "true" : "false");
      localStorage.setItem("hbu_notify_power", enablePowerNotices.value ? "true" : "false");
      localStorage.setItem("hbu_notify_class", enableClassReminders.value ? "true" : "false");
      localStorage.setItem("hbu_notify_school_inbox", enableSchoolInboxNotices.value ? "true" : "false");
      localStorage.setItem("hbu_notify_chaoxing_inbox", enableChaoxingInboxNotices.value ? "true" : "false");
      localStorage.setItem("hbu_notify_class_lead_min", String(classLeadMinutes.value));
      localStorage.setItem("hbu_notify_interval", String(checkInterval.value));
      void platformBridge.setBackgroundCheckConfig({
        enabled: enableBackground.value,
        checkGradeChanges: enableGradeNotices.value,
        checkExamChanges: enableExamReminders.value,
        checkSchoolInbox: enableSchoolInboxNotices.value,
        intervalMinutes: checkInterval.value,
        schemaVersion: 1,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }).then((state) => {
        bgNativeState.value = state;
      }).catch(() => {
      });
      if (props.studentId) {
        void reconcileLocalReminders({
          studentId: props.studentId,
          reason: "notification-settings"
        }).catch(() => {
        });
      }
    };
    const updateSettingsFromStorage = () => {
      const settings = getNotificationMonitorSettings();
      enableBackground.value = !!settings.enableBackground;
      enableExamReminders.value = !!settings.enableExamReminder;
      enableGradeNotices.value = !!settings.enableGradeNotice;
      enablePowerNotices.value = !!settings.enablePowerNotice;
      enableClassReminders.value = !!settings.enableClassReminder;
      enableSchoolInboxNotices.value = settings.enableSchoolInbox !== false;
      enableChaoxingInboxNotices.value = settings.enableChaoxingInbox !== false;
      classLeadMinutes.value = [5, 10, 15, 20, 30, 45, 60].includes(Number(settings.classLeadMinutes)) ? Number(settings.classLeadMinutes) : 30;
      checkInterval.value = [15, 30, 60].includes(settings.intervalMinutes) ? settings.intervalMinutes : 30;
    };
    const permissionLabel = computed(() => {
      if (permissionState.value === "granted") return tLocale("notify.permission.granted");
      if (permissionState.value === "denied") return tLocale("notify.permission.denied");
      if (permissionState.value === "default") return tLocale("notify.permission.default");
      if (permissionState.value === "unsupported") return tLocale("notify.permission.unsupported");
      return tLocale("notify.permission.unknown");
    });
    const lastCheckText = computed(() => {
      const checkedAt = snapshot.value?.checkedAt;
      return checkedAt ? formatRelativeTime(checkedAt) : tLocale("notify.status.notChecked");
    });
    const gradeSummary = computed(() => snapshot.value?.grades || {});
    const gradeItems = computed(
      () => Array.isArray(gradeSummary.value?.latestItems) ? gradeSummary.value.latestItems : []
    );
    const examSummary = computed(() => snapshot.value?.exams || {});
    const examItems = computed(
      () => Array.isArray(examSummary.value?.upcoming) ? examSummary.value.upcoming : []
    );
    const formatNotifyExamTime = (timeStr) => {
      if (!timeStr) return "";
      const text = String(timeStr).trim();
      const match = text.match(/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/);
      if (match) return `${match[1]}~${match[2]}`;
      return text;
    };
    const classSummary = computed(() => snapshot.value?.classReminder || {});
    const schoolInboxSummary = computed(() => snapshot.value?.schoolInbox || {});
    const chaoxingInboxSummary = computed(() => snapshot.value?.chaoxingInbox || {});
    const powerSummary = computed(() => snapshot.value?.electricity || {});
    const powerQuantityText = computed(() => {
      const quantity = Number(powerSummary.value?.quantity);
      if (!Number.isFinite(quantity)) return "--";
      return tf("notify.unit.kwh", { n: quantity.toFixed(2) });
    });
    const acPowerQuantityText = computed(() => {
      const q = Number(powerSummary.value?.acQuantity);
      if (!Number.isFinite(q)) return "--";
      return tf("notify.unit.kwh", { n: q.toFixed(2) });
    });
    const powerStatusText = computed(() => {
      if (powerSummary.value?.error === tLocale("notify.electricity.noRoomSelected") && selectedPath.value.length === 4) {
        return tLocale("notify.electricity.reconfigured");
      }
      if (powerSummary.value?.error) return powerSummary.value.error;
      return powerSummary.value?.status || tLocale("notify.electricity.noStatus");
    });
    const classReminderText = computed(() => {
      if (!classSummary.value?.enabled) return tLocale("notify.common.disabled");
      const total = Number(classSummary.value?.totalToday || 0);
      const trigger = Number(classSummary.value?.triggered || 0);
      return tf("notify.class.todaySummary", { total, triggered: trigger });
    });
    const nextClassText = computed(() => {
      const next = classSummary.value?.nextCourse;
      if (!next?.name) return tLocale("notify.class.noneUpcoming");
      const mins = Number(next?.minsUntilStart || 0);
      const when = mins > 0 ? tf("notify.class.inMinutes", { n: mins }) : tLocale("notify.class.soon");
      return tf("notify.class.nextCourse", {
        when,
        course: next.name,
        clock: next.startClock || "--:--",
        room: next.room || tLocale("notify.room.tbd")
      });
    });
    const bgFeatureStatusText = computed(() => {
      const state = bgNativeState.value;
      if (!state) return tLocale("notify.status.statusUnknown");
      if (!state?.supported) return state?.reason || tLocale("notify.bg.unsupported");
      if (state?.scheduler?.status === "unavailable") return tLocale("notify.bg.schedulerUnavailable");
      const lastResult = String(state?.lastResult || "unknown");
      const errorText = state?.lastError ? tf("notify.bg.lastErrorSuffix", { error: state.lastError }) : "";
      return tf("notify.bg.schedulerStatus", {
        kind: state?.scheduler?.kind || "unknown",
        result: lastResult
      }) + errorText;
    });
    const backgroundLockStatusText = computed(() => {
      if (backgroundLockEnabled.value) {
        return tf("notify.keepalive.enabled", { source: backgroundLockSource.value || tLocale("notify.keepalive.system") });
      }
      if (aggressiveKeepAliveSupported.value) {
        return tLocale("notify.keepalive.canEnable");
      }
      if (keepAliveReason.value) {
        return tf("notify.keepalive.disabledReason", { reason: keepAliveReason.value });
      }
      if (currentRuntime.value === "tauri") {
        return tLocale("notify.keepalive.desktopAvailable");
      }
      return tLocale("notify.keepalive.notEnabled");
    });
    const notificationCardsOrder = computed(
      () => isNotificationLayoutEditing.value ? draftNotificationCardsOrder.value : uiSettings.workspaceLayout.notifications.cardsOrder
    );
    const orderedInfoCards = computed(() => {
      const cardMap = {
        class_reminder: { key: "class_reminder" },
        electricity: { key: "electricity" },
        grades: { key: "grades" },
        exams: { key: "exams" },
        school_inbox: { key: "school_inbox" },
        chaoxing_inbox: { key: "chaoxing_inbox" }
      };
      return notificationCardsOrder.value.map((key) => cardMap[key]).filter(Boolean);
    });
    let notificationLayoutLongPressTimer = null;
    let notificationLayoutLongPressStart = { x: 0, y: 0 };
    let notificationDragAnchors = [];
    let notificationDragTargetIndex = -1;
    let notificationCollisionFxRaf = 0;
    let notificationCollisionFxLastTs = 0;
    const syncNotificationLayoutDraft = () => {
      const snapshot2 = cloneWorkspaceLayout(uiSettings.workspaceLayout);
      draftNotificationCardsOrder.value = [...snapshot2.notifications.cardsOrder];
    };
    const getNotificationCollisionPalette = (activeKey, targetKey = "") => {
      const paletteMap = {
        class_reminder: ["#5b8cff", "#8fd6ff", "#c4b5fd"],
        electricity: ["#22c55e", "#86efac", "#bef264"],
        grades: ["#f59e0b", "#fcd34d", "#fdba74"],
        exams: ["#ef4444", "#fda4af", "#fbbf24"],
        school_inbox: ["#6366f1", "#a5b4fc", "#c4b5fd"],
        chaoxing_inbox: ["#14b8a6", "#5eead4", "#99f6e4"]
      };
      return resolveCollisionPalette(paletteMap[activeKey], paletteMap[targetKey], "#8fd6ff");
    };
    const stopNotificationCollisionFxLoop = () => {
      if (notificationCollisionFxRaf) {
        cancelAnimationFrame(notificationCollisionFxRaf);
        notificationCollisionFxRaf = 0;
      }
      notificationCollisionFxLastTs = 0;
    };
    const tickNotificationCollisionFx = (timestamp) => {
      const previousTs = notificationCollisionFxLastTs || timestamp;
      notificationCollisionFxLastTs = timestamp;
      notificationCollisionFx.value = advanceLayoutCollisionFx(
        notificationCollisionFx.value,
        timestamp - previousTs
      );
      if (notificationCollisionFx.value.length === 0) {
        stopNotificationCollisionFxLoop();
        return;
      }
      notificationCollisionFxRaf = requestAnimationFrame(tickNotificationCollisionFx);
    };
    const ensureNotificationCollisionFxLoop = () => {
      if (notificationCollisionFxRaf) return;
      notificationCollisionFxLastTs = performance.now();
      notificationCollisionFxRaf = requestAnimationFrame(tickNotificationCollisionFx);
    };
    const spawnNotificationCollisionFx = (activeKey, target) => {
      const root = notificationLayoutRef.value;
      const rootRect = root?.getBoundingClientRect?.();
      if (!rootRect || !target?.rect) return;
      const sourceRect = notificationDragAnchors.find((item) => item.id === activeKey)?.rect || null;
      const origin = resolveRelativeCollisionPoint({
        rootRect,
        sourceRect,
        targetRect: target.rect
      });
      const burst = createLayoutCollisionBurst({
        x: origin.x,
        y: origin.y,
        colors: getNotificationCollisionPalette(activeKey, target.id)
      });
      notificationCollisionFx.value = [...notificationCollisionFx.value.slice(-48), ...burst];
      ensureNotificationCollisionFxLoop();
    };
    const reorderDraftNotificationLayout = (activeKey, targetIndex) => {
      if (!activeKey || !Number.isFinite(Number(targetIndex))) return;
      draftNotificationCardsOrder.value = moveLayoutItemToIndex(
        draftNotificationCardsOrder.value,
        activeKey,
        targetIndex
      );
    };
    const stopNotificationLayoutDrag = () => {
      draggingNotificationKey.value = "";
      hoverNotificationKey.value = "";
      notificationDragAnchors = [];
      notificationDragTargetIndex = -1;
    };
    const scrollNotificationLayoutIntoView = () => {
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const root = notificationLayoutRef.value;
            if (!root) return;
            const shell = root.closest?.(".app-shell");
            if (shell && typeof shell.scrollTo === "function") {
              const shellRect = shell.getBoundingClientRect();
              const rootRect = root.getBoundingClientRect();
              const nextTop2 = Math.max(
                0,
                shell.scrollTop + rootRect.top - shellRect.top - NOTIFICATION_LAYOUT_SCROLL_OFFSET_PX
              );
              shell.scrollTo({
                top: nextTop2,
                behavior: "smooth"
              });
              return;
            }
            const nextTop = Math.max(
              0,
              window.scrollY + root.getBoundingClientRect().top - NOTIFICATION_LAYOUT_SCROLL_OFFSET_PX
            );
            window.scrollTo({
              top: nextTop,
              behavior: "smooth"
            });
          });
        });
      });
    };
    const enterNotificationLayoutEdit = () => {
      if (!isNotificationLayoutEditing.value) {
        syncNotificationLayoutDraft();
        isNotificationLayoutEditing.value = true;
      }
      scrollNotificationLayoutIntoView();
    };
    const cancelNotificationLayoutEdit = () => {
      stopNotificationLayoutDrag();
      syncNotificationLayoutDraft();
      isNotificationLayoutEditing.value = false;
    };
    const resetNotificationLayoutEdit = () => {
      draftNotificationCardsOrder.value = [...buildDefaultWorkspaceLayout().notifications.cardsOrder];
    };
    const saveNotificationLayoutEdit = () => {
      const nextLayout = cloneWorkspaceLayout(uiSettings.workspaceLayout);
      nextLayout.notifications.cardsOrder = [...draftNotificationCardsOrder.value];
      uiSettings.workspaceLayout = nextLayout;
      flushUiSettings();
      stopNotificationLayoutDrag();
      isNotificationLayoutEditing.value = false;
    };
    const handleNotificationDragStart = ({ id }) => {
      const activeId = String(id || "");
      draggingNotificationKey.value = activeId;
      hoverNotificationKey.value = activeId;
      notificationDragAnchors = captureLayoutSlotAnchors(notificationLayoutRef.value, "notifications");
      notificationDragTargetIndex = notificationDragAnchors.find((item) => item.id === activeId)?.index ?? -1;
    };
    const handleNotificationDragMove = ({ id, point }) => {
      if (!isNotificationLayoutEditing.value) return;
      const activeId = String(id || "").trim();
      if (!activeId || !point) return;
      const target = resolveLayoutSlotTarget(notificationDragAnchors, point);
      if (!target || notificationDragTargetIndex === target.index) return;
      spawnNotificationCollisionFx(activeId, target);
      notificationDragTargetIndex = target.index;
      hoverNotificationKey.value = target.id;
      reorderDraftNotificationLayout(activeId, target.index);
    };
    const clearNotificationLayoutLongPress = () => {
      if (notificationLayoutLongPressTimer) {
        window.clearTimeout(notificationLayoutLongPressTimer);
        notificationLayoutLongPressTimer = null;
      }
    };
    const isTouchPointerEvent = (event) => String(event?.pointerType || "").toLowerCase() === "touch";
    const handleInfoGridPressStart = (event) => {
      if (isNotificationLayoutEditing.value) return;
      if (!isTouchPointerEvent(event)) return;
      clearNotificationLayoutLongPress();
      notificationLayoutLongPressStart = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0)
      };
      notificationLayoutLongPressTimer = window.setTimeout(() => {
        enterNotificationLayoutEdit();
        clearNotificationLayoutLongPress();
      }, NOTIFICATION_LAYOUT_LONG_PRESS_MS);
    };
    const handleInfoGridPressMove = (event) => {
      if (!notificationLayoutLongPressTimer || !isTouchPointerEvent(event)) return;
      const deltaX = Math.abs(Number(event.clientX || 0) - notificationLayoutLongPressStart.x);
      const deltaY = Math.abs(Number(event.clientY || 0) - notificationLayoutLongPressStart.y);
      if (deltaX > NOTIFICATION_LAYOUT_LONG_PRESS_DISTANCE || deltaY > NOTIFICATION_LAYOUT_LONG_PRESS_DISTANCE) {
        clearNotificationLayoutLongPress();
      }
    };
    const handleInfoGridPressEnd = () => {
      clearNotificationLayoutLongPress();
    };
    const getNativePermissionState = async (requestNow = false) => {
      try {
        if (requestNow) {
          const state2 = await invokeNative("request_notification_permission_native");
          return String(state2 || "default");
        }
        const state = await invokeNative("get_notification_permission_native");
        return String(state || "default");
      } catch (error) {
        throw new Error(String(error));
      }
    };
    const updatePermissionState = async (requestNow = false) => {
      try {
        const state = requestNow ? await platformBridge.requestNotificationPermission() : await platformBridge.getNotificationPermission();
        permissionState.value = state;
        if (requestNow) {
          statusMessage.value = state === "granted" ? tLocale("notify.msg.permissionGranted") : tLocale("notify.msg.permissionDenied");
        }
        return state === "granted";
      } catch (error) {
        if (currentRuntime.value === "web") {
          permissionState.value = "unsupported";
          statusMessage.value = tLocale("notify.msg.unsupportedEnv");
          return false;
        }
        if (isAclDeniedError(error) && isTauriRuntime()) {
          try {
            const nativeState = await getNativePermissionState(requestNow);
            permissionState.value = nativeState;
            if (requestNow) {
              statusMessage.value = nativeState === "granted" ? tLocale("notify.msg.permissionGranted") : tLocale("notify.msg.permissionDenied");
            }
            return nativeState === "granted";
          } catch (nativeErr) {
            permissionState.value = "denied";
            lastError.value = String(nativeErr);
            statusMessage.value = tf("notify.msg.queryFailed", { error: lastError.value });
            return false;
          }
        }
        permissionState.value = "denied";
        lastError.value = String(error);
        statusMessage.value = tf("notify.msg.queryFailed", { error: lastError.value });
        return false;
      }
    };
    const ensureAndroidChannel = async () => {
      if (!isAndroid()) return;
      try {
        await platformBridge.ensureNotificationChannel("hbut-default");
      } catch (error) {
        if (!isAclDeniedError(error)) {
          lastError.value = String(error || "");
        }
      }
    };
    const handleRequestPermission = async () => {
      statusMessage.value = "";
      lastError.value = "";
      const granted = await updatePermissionState(true);
      if (!granted && currentRuntime.value === "capacitor" && isAndroid()) {
        const opened = await platformBridge.openNotificationSettings().catch(() => false);
        statusMessage.value = opened ? tLocale("notify.msg.settingsOpened") : tLocale("notify.msg.settingsNotOpened");
      }
    };
    const updateSnapshot = (nextSnapshot) => {
      if (!nextSnapshot) return;
      if (String(nextSnapshot?.studentId || "") !== String(props.studentId || "")) return;
      snapshot.value = nextSnapshot;
      if (Array.isArray(nextSnapshot?.electricity?.selectedPath)) {
        selectedPath.value = nextSnapshot.electricity.selectedPath.map((item) => String(item));
      } else {
        selectedPath.value = readLocalDormSelection();
      }
    };
    const handleSnapshotEvent = (event) => {
      updateSnapshot(event?.detail);
    };
    const runManualCheck = async () => {
      if (!props.studentId) {
        statusMessage.value = tLocale("notify.msg.notLoggedIn");
        return;
      }
      checking.value = true;
      statusMessage.value = "";
      lastError.value = "";
      try {
        const result = await runNotificationCheck({
          studentId: props.studentId,
          reason: "manual",
          launchCheck: false,
          allowPermissionPrompt: false
        });
        updateSnapshot(result);
        await refreshRuntimeStates();
        const queuedCount = Number(result?.notifications?.queued || 0);
        const sentCount = Number(result?.notifications?.sent || 0);
        statusMessage.value = queuedCount > 0 && sentCount === 0 ? tLocale("notify.msg.checkDoneNoSend") : tf("notify.msg.checkDone", { queued: queuedCount, sent: sentCount });
      } catch (error) {
        lastError.value = String(error);
        statusMessage.value = tf("notify.msg.checkFailed", { error: lastError.value });
      } finally {
        checking.value = false;
      }
    };
    const refreshRuntimeStates = async () => {
      currentRuntime.value = getRuntime();
      try {
        bgNativeState.value = await platformBridge.getBackgroundCheckState();
      } catch {
        bgNativeState.value = null;
      }
      try {
        const state = await platformBridge.getAggressiveKeepAliveState();
        aggressiveKeepAliveSupported.value = !!state?.supported;
        backgroundLockEnabled.value = !!state?.active;
        backgroundLockSource.value = String(state?.source || "");
        keepAliveReason.value = String(state?.reason || "");
      } catch {
        aggressiveKeepAliveSupported.value = false;
        keepAliveReason.value = tLocale("notify.msg.keepAliveReadFailed");
      }
    };
    const handleBackgroundToggle = async () => {
      saveSettings();
      if (currentRuntime.value === "capacitor") {
        if (enableBackground.value && isAndroid()) {
          showBatteryPrompt.value = true;
        }
        await refreshRuntimeStates();
        return;
      }
      if (isTauriRuntime()) {
        if (isAndroid() || isIOSLike()) {
          if (enableBackground.value && isAndroid()) {
            showBatteryPrompt.value = true;
          }
          await refreshRuntimeStates();
          return;
        }
        if (enableBackground.value) {
          const result2 = await enableBackgroundPowerLock();
          backgroundLockEnabled.value = result2.enabled;
          backgroundLockSource.value = result2.source.join(" + ");
          return;
        }
        const result = await disableBackgroundPowerLock();
        backgroundLockEnabled.value = false;
        backgroundLockSource.value = result.source.join(" + ");
      }
    };
    const handleOtherSettingChange = () => {
      saveSettings();
    };
    const handleIntervalChange = () => {
      if (![15, 30, 60].includes(Number(checkInterval.value))) {
        checkInterval.value = 30;
      }
      saveSettings();
    };
    const confirmBatterySettings = () => {
      showBatteryPrompt.value = false;
      void platformBridge.openBatteryOptimizationSettings().then((ok) => {
        statusMessage.value = ok ? tLocale("notify.msg.batterySettingsOpened") : tLocale("notify.msg.batterySettingsFailed");
      }).catch(() => {
        statusMessage.value = tLocale("notify.msg.batterySettingsFailed");
      });
    };
    const cancelBatterySettings = () => {
      showBatteryPrompt.value = false;
    };
    const handleTestNotification = async () => {
      sending.value = true;
      statusMessage.value = "";
      lastError.value = "";
      try {
        const granted = await updatePermissionState(false);
        if (!granted) {
          statusMessage.value = tLocale("notify.msg.testNotSent");
          return;
        }
        await ensureAndroidChannel();
        const testId = Math.floor(Date.now() % 2147483e3);
        try {
          const ok = await platformBridge.sendLocalNotification({
            id: testId,
            channelId: "hbut-default",
            title: "Mini-HBUT",
            body: tLocale("notify.test.body")
          });
          if (!ok && currentRuntime.value === "capacitor") {
            const retryOk = await platformBridge.sendLocalNotification({
              id: testId + 1,
              channelId: "hbut-default",
              title: "Mini-HBUT",
              body: tLocale("notify.test.bodyRetry")
            });
            if (!retryOk) {
              throw new Error(tLocale("notify.test.mobileFailed"));
            }
          }
          if (!ok && isTauriRuntime()) {
            await invokeNative("send_test_notification_native", {
              title: "Mini-HBUT",
              body: tLocale("notify.test.bodyRust")
            });
          }
        } catch (notifyError) {
          if (!isAclDeniedError(notifyError)) throw notifyError;
        }
        statusMessage.value = tLocale("notify.msg.testSent");
      } catch (error) {
        lastError.value = String(error);
        statusMessage.value = tf("notify.msg.testFailed", { error: lastError.value });
      } finally {
        sending.value = false;
      }
    };
    onMounted(async () => {
      currentRuntime.value = getRuntime();
      updateSettingsFromStorage();
      selectedPath.value = readLocalDormSelection();
      snapshot.value = getLastNotifySnapshot(props.studentId) || null;
      try {
        const { data } = await fetchDormitoryDataset();
        dormData.value = Array.isArray(data?.data) ? data.data : [];
      } catch {
        dormData.value = [];
      }
      await updatePermissionState(false);
      await ensureAndroidChannel();
      await refreshRuntimeStates();
      if (enableBackground.value && isTauriRuntime() && !isAndroidLike() && !isIOSLike()) {
        const result = await enableBackgroundPowerLock();
        backgroundLockEnabled.value = result.enabled;
        backgroundLockSource.value = result.source.join(" + ");
        keepAliveReason.value = result.enabled ? "" : tLocale("notify.msg.keepAliveInactive");
      }
      window.addEventListener(NOTIFY_SNAPSHOT_EVENT, handleSnapshotEvent);
    });
    onBeforeUnmount(() => {
      clearNotificationLayoutLongPress();
      stopNotificationLayoutDrag();
      stopNotificationCollisionFxLoop();
      window.removeEventListener(NOTIFY_SNAPSHOT_EVENT, handleSnapshotEvent);
    });
    watch(
      () => uiSettings.workspaceLayout.notifications.cardsOrder.join("|"),
      () => {
        if (!isNotificationLayoutEditing.value) {
          syncNotificationLayoutDraft();
        }
      },
      { immediate: true }
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[14] || (_cache[14] = createBaseVNode("div", { class: "header-left" }, [
            createBaseVNode("img", {
              class: "logo-img",
              src: _imports_0,
              alt: "HBUT"
            }),
            createBaseVNode("span", { class: "header-title" }, "Mini-HBUT")
          ], -1)),
          createBaseVNode("span", _hoisted_3, toDisplayString(unref(tLocale)("tab.notifications")), 1)
        ]),
        createBaseVNode("main", _hoisted_4, [
          createBaseVNode("section", _hoisted_5, [
            createBaseVNode("div", _hoisted_6, [
              _cache[15] || (_cache[15] = createBaseVNode("div", { class: "permission-icon-circle" }, [
                createBaseVNode("span", { class: "material-symbols-outlined fill" }, "notifications_active")
              ], -1)),
              createBaseVNode("div", _hoisted_7, [
                createBaseVNode("h2", _hoisted_8, toDisplayString(permissionLabel.value === unref(tLocale)("notify.permission.granted") ? unref(tLocale)("notify.permission.pushOn") : unref(tLocale)("notify.permission.pushOff")), 1),
                createBaseVNode("p", _hoisted_9, toDisplayString(permissionLabel.value === unref(tLocale)("notify.permission.granted") ? unref(tLocale)("notify.permission.grantedDesc") : unref(tLocale)("notify.permission.notGrantedDesc")), 1)
              ])
            ]),
            createBaseVNode("button", {
              class: "permission-manage-btn",
              onClick: handleRequestPermission
            }, toDisplayString(unref(tLocale)("notify.permission.manage")), 1)
          ]),
          createBaseVNode("section", _hoisted_10, [
            createBaseVNode("h3", _hoisted_11, toDisplayString(unref(tLocale)("notify.section.types")), 1),
            createBaseVNode("div", {
              class: "notify-types-grid",
              ref_key: "notificationLayoutRef",
              ref: notificationLayoutRef,
              onPointerdown: handleInfoGridPressStart,
              onPointermove: handleInfoGridPressMove,
              onPointerup: handleInfoGridPressEnd,
              onPointercancel: handleInfoGridPressEnd
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(orderedInfoCards.value, (card) => {
                return openBlock(), createBlock(_sfc_main$1, {
                  key: card.key,
                  "item-id": card.key,
                  editing: isNotificationLayoutEditing.value,
                  dragging: draggingNotificationKey.value === card.key,
                  hover: hoverNotificationKey.value === card.key,
                  onDragStart: handleNotificationDragStart,
                  onDragMove: handleNotificationDragMove,
                  onDragEnd: stopNotificationLayoutDrag
                }, {
                  default: withCtx(() => [
                    card.key === "grades" ? (openBlock(), createElementBlock("div", _hoisted_12, [
                      createBaseVNode("div", _hoisted_13, [
                        _cache[17] || (_cache[17] = createBaseVNode("div", { class: "notify-type-icon icon-accent" }, [
                          createBaseVNode("span", { class: "material-symbols-outlined fill" }, "school")
                        ], -1)),
                        createBaseVNode("label", {
                          class: "toggle-switch",
                          onClick: _cache[1] || (_cache[1] = withModifiers(() => {
                          }, ["stop"]))
                        }, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => enableGradeNotices.value = $event),
                            onChange: handleOtherSettingChange
                          }, null, 544), [
                            [vModelCheckbox, enableGradeNotices.value]
                          ]),
                          _cache[16] || (_cache[16] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_14, [
                        createBaseVNode("h4", _hoisted_15, toDisplayString(unref(tLocale)("notify.card.grades")), 1),
                        createBaseVNode("p", _hoisted_16, toDisplayString(unref(tLocale)("notify.card.gradesDesc")), 1)
                      ])
                    ])) : createCommentVNode("", true),
                    card.key === "exams" ? (openBlock(), createElementBlock("div", _hoisted_17, [
                      createBaseVNode("div", _hoisted_18, [
                        _cache[19] || (_cache[19] = createBaseVNode("div", { class: "notify-type-icon icon-orange" }, [
                          createBaseVNode("span", { class: "material-symbols-outlined fill" }, "edit_document")
                        ], -1)),
                        createBaseVNode("label", {
                          class: "toggle-switch",
                          onClick: _cache[3] || (_cache[3] = withModifiers(() => {
                          }, ["stop"]))
                        }, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => enableExamReminders.value = $event),
                            onChange: handleOtherSettingChange
                          }, null, 544), [
                            [vModelCheckbox, enableExamReminders.value]
                          ]),
                          _cache[18] || (_cache[18] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_19, [
                        createBaseVNode("h4", _hoisted_20, toDisplayString(unref(tLocale)("notify.card.exams")), 1),
                        createBaseVNode("p", _hoisted_21, toDisplayString(unref(tLocale)("notify.card.examsDesc")), 1)
                      ])
                    ])) : createCommentVNode("", true),
                    card.key === "electricity" ? (openBlock(), createElementBlock("div", _hoisted_22, [
                      createBaseVNode("div", _hoisted_23, [
                        _cache[21] || (_cache[21] = createBaseVNode("div", { class: "notify-type-icon icon-teal" }, [
                          createBaseVNode("span", { class: "material-symbols-outlined fill" }, "bolt")
                        ], -1)),
                        createBaseVNode("label", {
                          class: "toggle-switch",
                          onClick: _cache[5] || (_cache[5] = withModifiers(() => {
                          }, ["stop"]))
                        }, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => enablePowerNotices.value = $event),
                            onChange: handleOtherSettingChange
                          }, null, 544), [
                            [vModelCheckbox, enablePowerNotices.value]
                          ]),
                          _cache[20] || (_cache[20] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_24, [
                        createBaseVNode("h4", _hoisted_25, toDisplayString(unref(tLocale)("notify.card.electricity")), 1),
                        createBaseVNode("p", _hoisted_26, toDisplayString(unref(tLocale)("notify.card.electricityDesc")), 1)
                      ])
                    ])) : createCommentVNode("", true),
                    card.key === "class_reminder" ? (openBlock(), createElementBlock("div", _hoisted_27, [
                      createBaseVNode("div", _hoisted_28, [
                        _cache[23] || (_cache[23] = createBaseVNode("div", { class: "notify-type-icon icon-sky" }, [
                          createBaseVNode("span", { class: "material-symbols-outlined fill" }, "schedule")
                        ], -1)),
                        createBaseVNode("label", {
                          class: "toggle-switch",
                          onClick: _cache[7] || (_cache[7] = withModifiers(() => {
                          }, ["stop"]))
                        }, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => enableClassReminders.value = $event),
                            onChange: handleOtherSettingChange
                          }, null, 544), [
                            [vModelCheckbox, enableClassReminders.value]
                          ]),
                          _cache[22] || (_cache[22] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_29, [
                        createBaseVNode("h4", _hoisted_30, toDisplayString(unref(tLocale)("notify.card.classReminder")), 1),
                        createBaseVNode("p", _hoisted_31, toDisplayString(unref(tf)("notify.card.classReminderDesc", { n: classLeadMinutes.value })), 1)
                      ])
                    ])) : createCommentVNode("", true),
                    card.key === "school_inbox" ? (openBlock(), createElementBlock("div", _hoisted_32, [
                      createBaseVNode("div", _hoisted_33, [
                        _cache[25] || (_cache[25] = createBaseVNode("div", { class: "notify-type-icon icon-indigo" }, [
                          createBaseVNode("span", { class: "material-symbols-outlined fill" }, "mail")
                        ], -1)),
                        createBaseVNode("label", {
                          class: "toggle-switch",
                          onClick: _cache[9] || (_cache[9] = withModifiers(() => {
                          }, ["stop"]))
                        }, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => enableSchoolInboxNotices.value = $event),
                            onChange: handleOtherSettingChange
                          }, null, 544), [
                            [vModelCheckbox, enableSchoolInboxNotices.value]
                          ]),
                          _cache[24] || (_cache[24] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_34, [
                        createBaseVNode("h4", _hoisted_35, toDisplayString(unref(tLocale)("notify.card.schoolInbox")), 1),
                        createBaseVNode("p", _hoisted_36, toDisplayString(unref(tLocale)("notify.card.schoolInboxDesc")), 1)
                      ])
                    ])) : createCommentVNode("", true),
                    card.key === "chaoxing_inbox" ? (openBlock(), createElementBlock("div", _hoisted_37, [
                      createBaseVNode("div", _hoisted_38, [
                        _cache[27] || (_cache[27] = createBaseVNode("div", { class: "notify-type-icon icon-teal" }, [
                          createBaseVNode("span", { class: "material-symbols-outlined fill" }, "mark_email_unread")
                        ], -1)),
                        createBaseVNode("label", {
                          class: "toggle-switch",
                          onClick: _cache[11] || (_cache[11] = withModifiers(() => {
                          }, ["stop"]))
                        }, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => enableChaoxingInboxNotices.value = $event),
                            onChange: handleOtherSettingChange
                          }, null, 544), [
                            [vModelCheckbox, enableChaoxingInboxNotices.value]
                          ]),
                          _cache[26] || (_cache[26] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_39, [
                        createBaseVNode("h4", _hoisted_40, toDisplayString(unref(tLocale)("notify.card.chaoxingInbox")), 1),
                        createBaseVNode("p", _hoisted_41, toDisplayString(unref(tLocale)("notify.card.chaoxingInboxDesc")), 1)
                      ])
                    ])) : createCommentVNode("", true)
                  ]),
                  _: 2
                }, 1032, ["item-id", "editing", "dragging", "hover"]);
              }), 128)),
              createVNode(LayoutCollisionFxLayer, { particles: notificationCollisionFx.value }, null, 8, ["particles"])
            ], 544),
            isNotificationLayoutEditing.value ? (openBlock(), createElementBlock("div", _hoisted_42, [
              createBaseVNode("button", {
                class: "layout-edit-btn",
                onClick: resetNotificationLayoutEdit
              }, toDisplayString(unref(tLocale)("common.reset")), 1),
              createBaseVNode("button", {
                class: "layout-edit-btn",
                onClick: cancelNotificationLayoutEdit
              }, toDisplayString(unref(tLocale)("common.cancel")), 1),
              createBaseVNode("button", {
                class: "layout-edit-btn primary",
                onClick: saveNotificationLayoutEdit
              }, toDisplayString(unref(tLocale)("common.save")), 1)
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("section", _hoisted_43, [
            createBaseVNode("div", _hoisted_44, [
              createBaseVNode("div", _hoisted_45, [
                _cache[28] || (_cache[28] = createBaseVNode("span", { class: "material-symbols-outlined" }, "sync", -1)),
                createBaseVNode("h3", _hoisted_46, toDisplayString(unref(tLocale)("notify.sync.title")), 1)
              ]),
              createBaseVNode("label", _hoisted_47, [
                withDirectives(createBaseVNode("input", {
                  type: "checkbox",
                  "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => enableBackground.value = $event),
                  onChange: handleBackgroundToggle
                }, null, 544), [
                  [vModelCheckbox, enableBackground.value]
                ]),
                _cache[29] || (_cache[29] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
              ])
            ]),
            createBaseVNode("div", _hoisted_48, [
              createBaseVNode("span", _hoisted_49, toDisplayString(unref(tLocale)("notify.sync.intervalLabel")), 1),
              withDirectives(createBaseVNode("select", {
                class: "sync-interval-select",
                "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => checkInterval.value = $event),
                onChange: handleIntervalChange
              }, [
                createBaseVNode("option", _hoisted_50, toDisplayString(unref(tf)("notify.sync.intervalMinutes", { n: 15 })), 1),
                createBaseVNode("option", _hoisted_51, toDisplayString(unref(tf)("notify.sync.intervalMinutes", { n: 30 })), 1),
                createBaseVNode("option", _hoisted_52, toDisplayString(unref(tLocale)("notify.sync.intervalHourly")), 1)
              ], 544), [
                [vModelSelect, checkInterval.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_53, [
              createBaseVNode("p", _hoisted_54, toDisplayString(unref(tf)("notify.sync.statusPrefix", { status: bgFeatureStatusText.value })), 1)
            ])
          ]),
          createBaseVNode("section", _hoisted_55, [
            createBaseVNode("button", {
              class: "action-btn secondary",
              disabled: checking.value,
              onClick: runManualCheck
            }, toDisplayString(checking.value ? unref(tLocale)("notify.action.checking") : unref(tLocale)("notify.action.checkNow")), 9, _hoisted_56),
            createBaseVNode("button", {
              class: "action-btn secondary",
              disabled: sending.value,
              onClick: handleTestNotification
            }, toDisplayString(sending.value ? unref(tLocale)("notify.action.sending") : unref(tLocale)("notify.action.sendTest")), 9, _hoisted_57)
          ]),
          createBaseVNode("section", _hoisted_58, [
            createBaseVNode("div", _hoisted_59, [
              createBaseVNode("h3", _hoisted_60, toDisplayString(unref(tLocale)("notify.recent.title")), 1),
              createBaseVNode("span", _hoisted_61, toDisplayString(lastCheckText.value), 1)
            ]),
            gradeItems.value.length ? (openBlock(), createElementBlock("div", _hoisted_62, [
              createBaseVNode("div", _hoisted_63, [
                _cache[30] || (_cache[30] = createBaseVNode("div", { class: "notify-msg-icon icon-accent" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "school")
                ], -1)),
                createBaseVNode("div", _hoisted_64, [
                  createBaseVNode("div", _hoisted_65, [
                    createBaseVNode("h4", {
                      class: normalizeClass(["notify-msg-title", { bold: gradeSummary.value?.changed }])
                    }, toDisplayString(gradeSummary.value?.changed ? unref(tLocale)("notify.card.gradesNew") : unref(tLocale)("notify.card.grades")), 3),
                    createBaseVNode("span", _hoisted_66, toDisplayString(lastCheckText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_67, toDisplayString(unref(tf)("notify.recent.gradesSummary", { total: gradeSummary.value?.total || 0, changed: gradeSummary.value?.changed ? unref(tLocale)("notify.recent.changed") : unref(tLocale)("notify.recent.unchanged") })), 1),
                  gradeItems.value.length ? (openBlock(), createElementBlock("ul", _hoisted_68, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(gradeItems.value.slice(0, 3), (item, idx) => {
                      return openBlock(), createElementBlock("li", {
                        key: `grade-${idx}`,
                        class: "detail-row"
                      }, [
                        createBaseVNode("span", _hoisted_69, toDisplayString(item.course_name || "-"), 1),
                        createBaseVNode("span", _hoisted_70, [
                          createBaseVNode("span", null, toDisplayString(item.term || unref(tLocale)("grade.term.unknown")), 1),
                          createBaseVNode("span", _hoisted_71, toDisplayString(item.final_score || "-"), 1)
                        ])
                      ]);
                    }), 128))
                  ])) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            classSummary.value?.enabled ? (openBlock(), createElementBlock("div", _hoisted_72, [
              createBaseVNode("div", _hoisted_73, [
                _cache[32] || (_cache[32] = createBaseVNode("div", { class: "notify-msg-icon icon-sky" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "schedule")
                ], -1)),
                createBaseVNode("div", _hoisted_74, [
                  createBaseVNode("div", _hoisted_75, [
                    createBaseVNode("h4", _hoisted_76, toDisplayString(unref(tLocale)("notify.card.classReminder")), 1),
                    createBaseVNode("span", _hoisted_77, toDisplayString(classReminderText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_78, toDisplayString(nextClassText.value), 1),
                  classSummary.value?.nextCourse?.name ? (openBlock(), createElementBlock("div", _hoisted_79, [
                    createBaseVNode("span", _hoisted_80, [
                      _cache[31] || (_cache[31] = createBaseVNode("span", { class: "material-symbols-outlined mini-icon" }, "alarm", -1)),
                      createTextVNode(" " + toDisplayString(unref(tf)("notify.class.leadMinutes", { n: classLeadMinutes.value })), 1)
                    ])
                  ])) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            examItems.value.length ? (openBlock(), createElementBlock("div", _hoisted_81, [
              createBaseVNode("div", _hoisted_82, [
                _cache[33] || (_cache[33] = createBaseVNode("div", { class: "notify-msg-icon icon-orange" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "edit_document")
                ], -1)),
                createBaseVNode("div", _hoisted_83, [
                  createBaseVNode("div", _hoisted_84, [
                    createBaseVNode("h4", _hoisted_85, toDisplayString(unref(tLocale)("notify.card.exams")), 1),
                    createBaseVNode("span", _hoisted_86, toDisplayString(examSummary.value?.tomorrowCount ? unref(tLocale)("notify.exams.tomorrowBadge") : ""), 1)
                  ]),
                  createBaseVNode("p", _hoisted_87, toDisplayString(unref(tf)("notify.recent.examsSummary", { recent: examItems.value.length, tomorrow: examSummary.value?.tomorrowCount || 0 })), 1),
                  createBaseVNode("ul", _hoisted_88, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(examItems.value.slice(0, 3), (item, idx) => {
                      return openBlock(), createElementBlock("li", {
                        key: `exam-${idx}`
                      }, [
                        createBaseVNode("span", _hoisted_89, [
                          createTextVNode(toDisplayString(item.course_name || "-") + " ", 1),
                          item.is_tomorrow ? (openBlock(), createElementBlock("small", _hoisted_90, toDisplayString(unref(tLocale)("notify.exams.tomorrow")), 1)) : createCommentVNode("", true)
                        ]),
                        createBaseVNode("span", _hoisted_91, [
                          item.exam_date ? (openBlock(), createElementBlock("span", _hoisted_92, toDisplayString(item.exam_date), 1)) : createCommentVNode("", true),
                          item.exam_time ? (openBlock(), createElementBlock("span", _hoisted_93, toDisplayString(formatNotifyExamTime(item.exam_time)), 1)) : createCommentVNode("", true),
                          item.location ? (openBlock(), createElementBlock("span", _hoisted_94, toDisplayString(item.location), 1)) : createCommentVNode("", true)
                        ])
                      ]);
                    }), 128))
                  ])
                ])
              ])
            ])) : createCommentVNode("", true),
            powerSummary.value?.quantity != null ? (openBlock(), createElementBlock("div", _hoisted_95, [
              createBaseVNode("div", _hoisted_96, [
                _cache[34] || (_cache[34] = createBaseVNode("div", { class: "notify-msg-icon icon-teal" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "bolt")
                ], -1)),
                createBaseVNode("div", _hoisted_97, [
                  createBaseVNode("div", _hoisted_98, [
                    createBaseVNode("h4", _hoisted_99, toDisplayString(unref(tLocale)("notify.card.electricity")), 1),
                    createBaseVNode("span", _hoisted_100, toDisplayString(powerStatusText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_101, toDisplayString(unref(tf)("notify.recent.powerRemaining", { quantity: powerQuantityText.value })), 1),
                  powerSummary.value?.isDual ? (openBlock(), createElementBlock("p", _hoisted_102, toDisplayString(unref(tf)("notify.recent.powerAc", { quantity: acPowerQuantityText.value })), 1)) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            schoolInboxSummary.value?.enabled ? (openBlock(), createElementBlock("div", _hoisted_103, [
              createBaseVNode("div", _hoisted_104, [
                _cache[35] || (_cache[35] = createBaseVNode("div", { class: "notify-msg-icon icon-indigo" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "mail")
                ], -1)),
                createBaseVNode("div", _hoisted_105, [
                  createBaseVNode("div", _hoisted_106, [
                    createBaseVNode("h4", {
                      class: normalizeClass(["notify-msg-title", { bold: schoolInboxSummary.value?.triggered > 0 }])
                    }, toDisplayString(schoolInboxSummary.value?.triggered > 0 ? unref(tLocale)("notify.card.schoolInboxNew") : unref(tLocale)("notify.card.schoolInbox")), 3),
                    createBaseVNode("span", _hoisted_107, toDisplayString(lastCheckText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_108, toDisplayString(unref(tf)("notify.recent.inboxSummary", {
                    total: schoolInboxSummary.value?.total || 0,
                    source: schoolInboxSummary.value?.source ? unref(tf)("notify.recent.sourceParens", { source: schoolInboxSummary.value.source === "chaoxing" ? unref(tLocale)("notify.source.chaoxing") : unref(tLocale)("notify.source.academic") }) : "",
                    triggered: schoolInboxSummary.value?.triggered || 0
                  })), 1),
                  schoolInboxSummary.value?.error ? (openBlock(), createElementBlock("p", _hoisted_109, toDisplayString(schoolInboxSummary.value.error), 1)) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            chaoxingInboxSummary.value?.enabled ? (openBlock(), createElementBlock("div", _hoisted_110, [
              createBaseVNode("div", _hoisted_111, [
                _cache[36] || (_cache[36] = createBaseVNode("div", { class: "notify-msg-icon icon-teal" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "mark_email_unread")
                ], -1)),
                createBaseVNode("div", _hoisted_112, [
                  createBaseVNode("div", _hoisted_113, [
                    createBaseVNode("h4", {
                      class: normalizeClass(["notify-msg-title", { bold: chaoxingInboxSummary.value?.triggered > 0 }])
                    }, toDisplayString(chaoxingInboxSummary.value?.triggered > 0 ? unref(tLocale)("notify.card.chaoxingInboxNew") : unref(tLocale)("notify.card.chaoxingInbox")), 3),
                    createBaseVNode("span", _hoisted_114, toDisplayString(lastCheckText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_115, toDisplayString(unref(tf)("notify.recent.inboxSummaryPlain", { total: chaoxingInboxSummary.value?.total || 0, triggered: chaoxingInboxSummary.value?.triggered || 0 })), 1),
                  chaoxingInboxSummary.value?.error ? (openBlock(), createElementBlock("p", _hoisted_116, toDisplayString(chaoxingInboxSummary.value.error), 1)) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_117, toDisplayString(unref(tLocale)("notify.recent.longPressHint")), 1)
          ]),
          enableBackground.value ? (openBlock(), createElementBlock("div", _hoisted_118, [
            currentRuntime.value === "tauri" && !unref(isAndroidLike)() && !unref(isIOSLike)() ? (openBlock(), createElementBlock("span", _hoisted_119, toDisplayString(unref(tf)("notify.status.keepAlivePrefix", { status: backgroundLockStatusText.value })), 1)) : createCommentVNode("", true),
            createBaseVNode("span", _hoisted_120, toDisplayString(unref(tf)("notify.status.schedulerPrefix", { status: bgFeatureStatusText.value })), 1)
          ])) : createCommentVNode("", true)
        ]),
        statusMessage.value ? (openBlock(), createElementBlock("p", _hoisted_121, toDisplayString(statusMessage.value), 1)) : createCommentVNode("", true),
        lastError.value ? (openBlock(), createElementBlock("p", _hoisted_122, toDisplayString(unref(tf)("notify.status.errorDetail", { error: lastError.value })), 1)) : createCommentVNode("", true),
        showBatteryPrompt.value ? (openBlock(), createElementBlock("div", _hoisted_123, [
          createBaseVNode("div", _hoisted_124, [
            createBaseVNode("h3", null, toDisplayString(unref(tLocale)("notify.battery.title")), 1),
            createBaseVNode("p", null, toDisplayString(unref(tLocale)("notify.battery.desc")), 1),
            createBaseVNode("div", _hoisted_125, [
              createBaseVNode("button", {
                class: "btn-text",
                onClick: cancelBatterySettings
              }, toDisplayString(unref(tLocale)("notify.battery.later")), 1),
              createBaseVNode("button", {
                class: "btn-primary",
                onClick: confirmBatterySettings
              }, toDisplayString(unref(tLocale)("notify.battery.ack")), 1)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const NotificationView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-fb610be9"]]);
export {
  NotificationView as default
};
