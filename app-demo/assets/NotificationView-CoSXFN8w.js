import { c as createElementBlock, f as createCommentVNode, e as computed, b as openBlock, F as Fragment, i as renderList, h as normalizeStyle, n as normalizeClass, m as onBeforeUnmount, k as createBlock, l as withCtx, s as renderSlot, a as ref, L as resolveDynamicComponent, o as onMounted, w as watch, y as createStaticVNode, d as createBaseVNode, t as toDisplayString, q as createVNode, j as withModifiers, C as withDirectives, H as vModelCheckbox, K as vModelSelect, g as createTextVNode, z as nextTick } from "./vue-core-DdLVj9yW.js";
import { _ as _imports_0 } from "./app_icon-BoqTJkLh.js";
import { _ as _export_sfc, c as cloneWorkspaceLayout, u as useUiSettings, T as getLastNotifySnapshot, U as NOTIFY_SNAPSHOT_EVENT, V as getNotificationMonitorSettings, W as getBackgroundFetchRuntimeState, X as buildDefaultWorkspaceLayout, A as flushUiSettings, Y as runNotificationCheck, Z as syncBackgroundFetchContext } from "./app-demo-CxKBY5JQ.js";
import { q as getRuntime, f as platformBridge, b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { f as fetchDormitoryDataset } from "./static_resource_cache-E8R6eQd0.js";
/* empty css                                                                                */
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1$1 = {
  key: 0,
  class: "layout-collision-fx",
  "aria-hidden": "true"
};
const _sfc_main$2 = {
  __name: "LayoutCollisionFxLayer",
  props: {
    items: {
      type: Array,
      default: () => []
    }
  },
  setup(__props) {
    const props = __props;
    const normalizedItems = computed(
      () => (Array.isArray(props.items) ? props.items : []).map((item) => ({
        ...item,
        className: `layout-collision-fx__node layout-collision-fx__node--${item?.kind || "spark"}`,
        style: {
          "--fx-x": `${Number(item?.x || 0).toFixed(2)}px`,
          "--fx-y": `${Number(item?.y || 0).toFixed(2)}px`,
          "--fx-size": `${Number(item?.size || 0).toFixed(2)}px`,
          "--fx-radius": `${Number(item?.radius || 0).toFixed(2)}px`,
          "--fx-opacity": Number(item?.life || 0).toFixed(3),
          "--fx-color": String(item?.color || "#5b8cff")
        }
      }))
    );
    return (_ctx, _cache) => {
      return normalizedItems.value.length ? (openBlock(), createElementBlock("div", _hoisted_1$1, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(normalizedItems.value, (item) => {
          return openBlock(), createElementBlock("div", {
            key: item.id,
            class: normalizeClass(item.className),
            style: normalizeStyle(item.style)
          }, null, 6);
        }), 128))
      ])) : createCommentVNode("", true);
    };
  }
};
const LayoutCollisionFxLayer = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-27812505"]]);
const DRAG_START_DISTANCE_PX = 8;
const CLICK_SUPPRESS_MS = 220;
const _sfc_main$1 = {
  __name: "SortableSurface",
  props: {
    id: {
      type: [String, Number],
      required: true
    },
    group: {
      type: String,
      required: true
    },
    section: {
      type: String,
      default: ""
    },
    tag: {
      type: String,
      default: "div"
    },
    editing: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    surfaceClass: {
      type: [String, Array, Object],
      default: ""
    },
    surfaceStyle: {
      type: [String, Array, Object],
      default: ""
    }
  },
  emits: [
    "drag-start",
    "drag-move",
    "drag-end",
    "click",
    "pointerdown",
    "pointermove",
    "pointerleave"
  ],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const elementRef = ref(null);
    const isDragging = ref(false);
    let activePointerId = null;
    let dragPressing = false;
    let startPoint = { x: 0, y: 0 };
    let lastPoint = { x: 0, y: 0 };
    let suppressClickUntil = 0;
    const dragDisabled = computed(() => !props.editing || props.disabled);
    const dragOffset = computed(() => ({
      x: lastPoint.x - startPoint.x,
      y: lastPoint.y - startPoint.y
    }));
    const mergedClass = computed(() => [
      props.surfaceClass,
      {
        editing: props.editing,
        dragging: isDragging.value
      }
    ]);
    const mergedStyle = computed(() => [
      props.surfaceStyle,
      {
        "--drag-translate-x": isDragging.value ? `${dragOffset.value.x}px` : "0px",
        "--drag-translate-y": isDragging.value ? `${dragOffset.value.y}px` : "0px"
      }
    ]);
    const setElementRef = (node) => {
      elementRef.value = node;
    };
    const releaseDragTracking = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerUp, true);
      const node = elementRef.value;
      if (node && activePointerId !== null && typeof node.releasePointerCapture === "function") {
        try {
          node.releasePointerCapture(activePointerId);
        } catch {
        }
      }
      activePointerId = null;
      dragPressing = false;
      isDragging.value = false;
      startPoint = { x: 0, y: 0 };
      lastPoint = { x: 0, y: 0 };
    };
    const beginDragTracking = (event) => {
      dragPressing = true;
      activePointerId = event.pointerId;
      startPoint = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0)
      };
      lastPoint = { ...startPoint };
      const node = elementRef.value;
      if (node && typeof node.setPointerCapture === "function") {
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
        }
      }
      window.addEventListener("pointermove", handleWindowPointerMove, true);
      window.addEventListener("pointerup", handleWindowPointerUp, true);
      window.addEventListener("pointercancel", handleWindowPointerUp, true);
    };
    const handleWindowPointerMove = (event) => {
      if (!dragPressing || event.pointerId !== activePointerId) return;
      emit("pointermove", event);
      const point = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0)
      };
      lastPoint = point;
      const deltaX = point.x - startPoint.x;
      const deltaY = point.y - startPoint.y;
      if (!isDragging.value) {
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < DRAG_START_DISTANCE_PX) {
          return;
        }
        isDragging.value = true;
        emit("drag-start", {
          id: props.id,
          section: props.section,
          point: { ...startPoint }
        });
      }
      event.preventDefault();
      emit("drag-move", {
        id: props.id,
        section: props.section,
        point,
        delta: {
          x: deltaX,
          y: deltaY
        }
      });
    };
    const handleWindowPointerUp = (event) => {
      if (!dragPressing || event.pointerId !== activePointerId) return;
      const point = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0)
      };
      if (isDragging.value) {
        suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        emit("drag-end", {
          id: props.id,
          section: props.section,
          point,
          delta: {
            x: point.x - startPoint.x,
            y: point.y - startPoint.y
          }
        });
      }
      releaseDragTracking();
    };
    const handlePointerDownInternal = (event) => {
      emit("pointerdown", event);
      if (dragDisabled.value) return;
      if (event.button !== void 0 && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      beginDragTracking(event);
    };
    const handleClickInternal = (event) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      emit("click", event);
    };
    onBeforeUnmount(() => {
      releaseDragTracking();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(__props.tag), {
        ref: setElementRef,
        "data-layout-id": String(__props.id),
        "data-layout-section": __props.section,
        class: normalizeClass(mergedClass.value),
        style: normalizeStyle(mergedStyle.value),
        onClick: handleClickInternal,
        onPointerdown: handlePointerDownInternal,
        onPointermove: _cache[0] || (_cache[0] = ($event) => emit("pointermove", $event)),
        onPointerleave: _cache[1] || (_cache[1] = ($event) => emit("pointerleave", $event))
      }, {
        default: withCtx(() => [
          renderSlot(_ctx.$slots, "default", {
            isDragging: isDragging.value,
            isOvered: false
          })
        ]),
        _: 3
      }, 40, ["data-layout-id", "data-layout-section", "class", "style"]);
    };
  }
};
const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const getRectGap = (value, start, end) => {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
};
const captureLayoutSlotAnchors = (root, section) => {
  const scope = root instanceof Element ? root : document;
  return Array.from(scope.querySelectorAll(`[data-layout-section="${section}"]`)).map((element, index) => {
    const id = String(element.getAttribute("data-layout-id") || "").trim();
    if (!id) return null;
    const rect = element.getBoundingClientRect();
    return {
      id,
      index,
      rect,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  }).filter(Boolean);
};
const resolveLayoutSlotTarget = (anchors, point) => {
  if (!Array.isArray(anchors) || !anchors.length || !point) return null;
  const x = toFiniteNumber(point.x);
  const y = toFiniteNumber(point.y);
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of anchors) {
    const gapX = getRectGap(x, item.rect.left, item.rect.right);
    const gapY = getRectGap(y, item.rect.top, item.rect.bottom);
    const edgeScore = gapX * gapX + gapY * gapY;
    const dx = x - item.centerX;
    const dy = y - item.centerY;
    const centerScore = dx * dx + dy * dy;
    const score = edgeScore * 0.72 + centerScore * 0.28;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
};
const moveLayoutItemToIndex = (list, activeKey, targetIndex) => {
  const next = [...list];
  const activeIndex = next.indexOf(activeKey);
  const normalizedTargetIndex = Math.max(0, Math.min(Number(targetIndex) || 0, next.length - 1));
  if (activeIndex < 0 || activeIndex === normalizedTargetIndex) {
    return next;
  }
  const [moved] = next.splice(activeIndex, 1);
  next.splice(normalizedTargetIndex, 0, moved);
  return next;
};
let layoutCollisionFxSeed = 0;
const DEFAULT_PALETTE = ["#5b8cff", "#8fd6ff", "#f6c56f"];
const clampNumber = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
};
const nextFxId = (prefix) => `${prefix}-${Date.now()}-${layoutCollisionFxSeed += 1}`;
const resolveCollisionPalette = (...colors) => {
  const palette = colors.flat().map((item) => String(item || "").trim()).filter(Boolean);
  return palette.length ? palette : [...DEFAULT_PALETTE];
};
const resolveRelativeCollisionPoint = ({ rootRect, sourceRect, targetRect }) => {
  if (!rootRect || !targetRect) {
    return { x: 0, y: 0 };
  }
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const sourceCenterX = sourceRect ? sourceRect.left + sourceRect.width / 2 : targetCenterX;
  const sourceCenterY = sourceRect ? sourceRect.top + sourceRect.height / 2 : targetCenterY;
  return {
    x: (sourceCenterX + targetCenterX) / 2 - rootRect.left,
    y: (sourceCenterY + targetCenterY) / 2 - rootRect.top
  };
};
const createLayoutCollisionBurst = ({
  x = 0,
  y = 0,
  colors = DEFAULT_PALETTE,
  sparkCount = 12
} = {}) => {
  const palette = resolveCollisionPalette(colors);
  const burst = [
    {
      id: nextFxId("ring"),
      kind: "ring",
      x,
      y,
      radius: 18,
      growth: 3.1 + Math.random() * 0.8,
      life: 0.92,
      decay: 0.07,
      color: palette[0]
    },
    {
      id: nextFxId("core"),
      kind: "core",
      x,
      y,
      size: 12,
      life: 0.72,
      decay: 0.09,
      color: palette[Math.min(1, palette.length - 1)] || palette[0]
    }
  ];
  for (let index = 0; index < sparkCount; index += 1) {
    const angle = Math.PI * 2 * index / sparkCount + (Math.random() - 0.5) * 0.22;
    const speed = 2 + Math.random() * 3.8;
    burst.push({
      id: nextFxId("spark"),
      kind: "spark",
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.08 + Math.random() * 0.08,
      life: 1,
      decay: 0.045 + Math.random() * 0.025,
      size: 2.6 + Math.random() * 3.1,
      color: palette[index % palette.length]
    });
  }
  return burst;
};
const advanceLayoutCollisionFx = (items, deltaMs = 16.67) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const step = clampNumber(deltaMs / 16.67, 0.72, 1.9);
  return items.map((item) => {
    if (!item) return null;
    const next = { ...item };
    if (next.kind === "spark") {
      next.x += next.vx * step;
      next.y += next.vy * step;
      next.vy += next.gravity * step;
      next.vx *= 0.984;
      next.life -= next.decay * step;
      next.size *= 0.994;
    } else if (next.kind === "ring") {
      next.radius += next.growth * step;
      next.life -= next.decay * step;
    } else {
      next.size += 0.18 * step;
      next.life -= next.decay * step;
    }
    return next.life > 0.02 ? next : null;
  }).filter(Boolean);
};
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
const _hoisted_2 = { class: "notify-content" };
const _hoisted_3 = { class: "permission-card" };
const _hoisted_4 = { class: "permission-left" };
const _hoisted_5 = { class: "permission-info" };
const _hoisted_6 = { class: "permission-title" };
const _hoisted_7 = { class: "permission-desc" };
const _hoisted_8 = { class: "notify-types-section" };
const _hoisted_9 = {
  key: 0,
  class: "notify-type-card"
};
const _hoisted_10 = { class: "notify-type-top" };
const _hoisted_11 = {
  key: 1,
  class: "notify-type-card"
};
const _hoisted_12 = { class: "notify-type-top" };
const _hoisted_13 = {
  key: 2,
  class: "notify-type-card"
};
const _hoisted_14 = { class: "notify-type-top" };
const _hoisted_15 = {
  key: 3,
  class: "notify-type-card"
};
const _hoisted_16 = { class: "notify-type-top" };
const _hoisted_17 = { class: "notify-type-body" };
const _hoisted_18 = { class: "notify-type-desc" };
const _hoisted_19 = {
  key: 4,
  class: "notify-type-card"
};
const _hoisted_20 = { class: "notify-type-top" };
const _hoisted_21 = {
  key: 0,
  class: "layout-edit-bar"
};
const _hoisted_22 = { class: "sync-settings-card" };
const _hoisted_23 = { class: "sync-header" };
const _hoisted_24 = { class: "toggle-switch" };
const _hoisted_25 = { class: "sync-interval-row" };
const _hoisted_26 = { class: "action-buttons" };
const _hoisted_27 = ["disabled"];
const _hoisted_28 = ["disabled"];
const _hoisted_29 = { class: "recent-section" };
const _hoisted_30 = { class: "recent-header" };
const _hoisted_31 = { class: "recent-time" };
const _hoisted_32 = {
  key: 0,
  class: "notify-message-card unread"
};
const _hoisted_33 = { class: "notify-msg-left" };
const _hoisted_34 = { class: "notify-msg-body" };
const _hoisted_35 = { class: "notify-msg-head" };
const _hoisted_36 = { class: "notify-msg-time" };
const _hoisted_37 = { class: "notify-msg-text" };
const _hoisted_38 = {
  key: 0,
  class: "notify-detail-list"
};
const _hoisted_39 = { class: "detail-main" };
const _hoisted_40 = { class: "detail-sub" };
const _hoisted_41 = { class: "detail-score" };
const _hoisted_42 = {
  key: 1,
  class: "notify-message-card"
};
const _hoisted_43 = { class: "notify-msg-left" };
const _hoisted_44 = { class: "notify-msg-body" };
const _hoisted_45 = { class: "notify-msg-head" };
const _hoisted_46 = { class: "notify-msg-time" };
const _hoisted_47 = { class: "notify-msg-text" };
const _hoisted_48 = {
  key: 0,
  class: "notify-detail-kv"
};
const _hoisted_49 = { class: "kv-item" };
const _hoisted_50 = {
  key: 2,
  class: "notify-message-card"
};
const _hoisted_51 = { class: "notify-msg-left" };
const _hoisted_52 = { class: "notify-msg-body" };
const _hoisted_53 = { class: "notify-msg-head" };
const _hoisted_54 = { class: "notify-msg-time" };
const _hoisted_55 = { class: "notify-msg-text" };
const _hoisted_56 = { class: "notify-detail-list" };
const _hoisted_57 = { class: "detail-main" };
const _hoisted_58 = {
  key: 0,
  class: "tag-urgent"
};
const _hoisted_59 = { class: "detail-sub" };
const _hoisted_60 = { key: 0 };
const _hoisted_61 = { key: 1 };
const _hoisted_62 = { key: 2 };
const _hoisted_63 = {
  key: 3,
  class: "notify-message-card"
};
const _hoisted_64 = { class: "notify-msg-left" };
const _hoisted_65 = { class: "notify-msg-body" };
const _hoisted_66 = { class: "notify-msg-head" };
const _hoisted_67 = { class: "notify-msg-time" };
const _hoisted_68 = { class: "notify-msg-text" };
const _hoisted_69 = {
  key: 0,
  class: "notify-msg-text warn"
};
const _hoisted_70 = {
  key: 4,
  class: "notify-message-card"
};
const _hoisted_71 = { class: "notify-msg-left" };
const _hoisted_72 = { class: "notify-msg-body" };
const _hoisted_73 = { class: "notify-msg-head" };
const _hoisted_74 = { class: "notify-msg-time" };
const _hoisted_75 = { class: "notify-msg-text" };
const _hoisted_76 = {
  key: 0,
  class: "notify-msg-text"
};
const _hoisted_77 = {
  key: 0,
  class: "status-row"
};
const _hoisted_78 = { class: "status-pill soft" };
const _hoisted_79 = { class: "status-pill soft" };
const _hoisted_80 = {
  key: 0,
  class: "status-msg"
};
const _hoisted_81 = {
  key: 1,
  class: "status-err"
};
const _hoisted_82 = {
  key: 2,
  class: "modal-mask"
};
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
    const enableBackground = ref(false);
    const enableExamReminders = ref(true);
    const enableGradeNotices = ref(true);
    const enablePowerNotices = ref(true);
    const enableClassReminders = ref(true);
    const enableSchoolInboxNotices = ref(true);
    const classLeadMinutes = ref(30);
    const checkInterval = ref(30);
    const showBatteryPrompt = ref(false);
    const backgroundLockEnabled = ref(false);
    const backgroundLockSource = ref("");
    const aggressiveKeepAliveSupported = ref(false);
    const keepAliveReason = ref("");
    const backgroundFetchState = ref(null);
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
    const isAndroid = () => /Android/i.test(navigator.userAgent);
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
      localStorage.setItem("hbu_notify_class_lead_min", String(classLeadMinutes.value));
      localStorage.setItem("hbu_notify_interval", String(checkInterval.value));
      syncBackgroundFetchContext({
        studentId: props.studentId,
        settings: {
          enableBackground: enableBackground.value,
          enableExamReminder: enableExamReminders.value,
          enableGradeNotice: enableGradeNotices.value,
          enablePowerNotice: enablePowerNotices.value,
          enableClassReminder: enableClassReminders.value,
          enableSchoolInbox: enableSchoolInboxNotices.value,
          classLeadMinutes: classLeadMinutes.value,
          intervalMinutes: checkInterval.value
        },
        dormSelection: selectedPath.value
      }).catch(() => {
      });
    };
    const updateSettingsFromStorage = () => {
      const settings = getNotificationMonitorSettings();
      enableBackground.value = !!settings.enableBackground;
      enableExamReminders.value = !!settings.enableExamReminder;
      enableGradeNotices.value = !!settings.enableGradeNotice;
      enablePowerNotices.value = !!settings.enablePowerNotice;
      enableClassReminders.value = !!settings.enableClassReminder;
      enableSchoolInboxNotices.value = settings.enableSchoolInbox !== false;
      classLeadMinutes.value = [5, 10, 15, 20, 30, 45, 60].includes(Number(settings.classLeadMinutes)) ? Number(settings.classLeadMinutes) : 30;
      checkInterval.value = [15, 30, 60].includes(settings.intervalMinutes) ? settings.intervalMinutes : 30;
    };
    const permissionLabel = computed(() => {
      if (permissionState.value === "granted") return "已授权";
      if (permissionState.value === "denied") return "已拒绝";
      if (permissionState.value === "default") return "未授权";
      if (permissionState.value === "unsupported") return "当前环境不支持";
      return "未知";
    });
    const lastCheckText = computed(() => {
      const checkedAt = snapshot.value?.checkedAt;
      return checkedAt ? formatRelativeTime(checkedAt) : "未检测";
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
    const powerSummary = computed(() => snapshot.value?.electricity || {});
    const powerQuantityText = computed(() => {
      const quantity = Number(powerSummary.value?.quantity);
      if (!Number.isFinite(quantity)) return "--";
      return `${quantity.toFixed(2)} 度`;
    });
    const acPowerQuantityText = computed(() => {
      const q = Number(powerSummary.value?.acQuantity);
      if (!Number.isFinite(q)) return "--";
      return `${q.toFixed(2)} 度`;
    });
    const powerStatusText = computed(() => {
      if (powerSummary.value?.error === "未设置宿舍房间，请先在电费模块选择房间。" && selectedPath.value.length === 4) {
        return "已配置宿舍房间，等待重新检测";
      }
      if (powerSummary.value?.error) return powerSummary.value.error;
      return powerSummary.value?.status || "暂无状态";
    });
    const classReminderText = computed(() => {
      if (!classSummary.value?.enabled) return "已关闭";
      const total = Number(classSummary.value?.totalToday || 0);
      const trigger = Number(classSummary.value?.triggered || 0);
      return `今日课程 ${total} 门，本次触发 ${trigger} 条`;
    });
    const nextClassText = computed(() => {
      const next = classSummary.value?.nextCourse;
      if (!next?.name) return "暂无即将开始课程";
      const mins = Number(next?.minsUntilStart || 0);
      const when = mins > 0 ? `${mins} 分钟后` : "即将";
      return `${when}：${next.name}（${next.startClock || "--:--"} ${next.room || "教室待定"}）`;
    });
    const backgroundFetchStatusText = computed(() => {
      const state = backgroundFetchState.value;
      if (!state) return "状态未知";
      if (state?.runtime === "tauri") return "桌面前台轮询（已启用）";
      if (!state?.supported) return state?.reason || "当前环境不支持";
      if (state?.available) return "可用";
      if (state?.configured) return "已配置（待系统调度）";
      return "未配置";
    });
    const backgroundLockStatusText = computed(() => {
      if (backgroundLockEnabled.value) {
        return `已启用（${backgroundLockSource.value || "系统"}）`;
      }
      if (aggressiveKeepAliveSupported.value) {
        return "未启用（可启用）";
      }
      if (keepAliveReason.value) {
        return `未启用（${keepAliveReason.value}）`;
      }
      if (currentRuntime.value === "tauri") {
        return "未启用（桌面端可用）";
      }
      return "未启用";
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
        school_inbox: { key: "school_inbox" }
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
        school_inbox: ["#6366f1", "#a5b4fc", "#c4b5fd"]
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
          statusMessage.value = state === "granted" ? "通知权限已授权。" : "通知权限未授权，请在系统设置中允许通知。";
        }
        return state === "granted";
      } catch (error) {
        if (currentRuntime.value === "web") {
          permissionState.value = "unsupported";
          statusMessage.value = "当前环境不支持系统通知。";
          return false;
        }
        if (isAclDeniedError(error) && isTauriRuntime()) {
          try {
            const nativeState = await getNativePermissionState(requestNow);
            permissionState.value = nativeState;
            if (requestNow) {
              statusMessage.value = nativeState === "granted" ? "通知权限已授权。" : "通知权限未授权，请在系统设置中允许通知。";
            }
            return nativeState === "granted";
          } catch (nativeErr) {
            permissionState.value = "denied";
            lastError.value = String(nativeErr);
            statusMessage.value = `查询通知权限失败：${lastError.value}`;
            return false;
          }
        }
        permissionState.value = "denied";
        lastError.value = String(error);
        statusMessage.value = `查询通知权限失败：${lastError.value}`;
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
        statusMessage.value = opened ? "已打开系统通知设置，请允许 Mini-HBUT 发送通知。" : "通知权限未授权，请在系统设置中允许 Mini-HBUT 发送通知。";
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
        statusMessage.value = "未登录状态下无法执行检查。";
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
        statusMessage.value = queuedCount > 0 && sentCount === 0 ? "已完成检查，但系统通知未发送。请确认通知权限已授权。" : `已完成一次实时检查。通知队列 ${queuedCount} 条，已发送 ${sentCount} 条。`;
      } catch (error) {
        lastError.value = String(error);
        statusMessage.value = `检查失败：${lastError.value}`;
      } finally {
        checking.value = false;
      }
    };
    const refreshRuntimeStates = async () => {
      currentRuntime.value = getRuntime();
      try {
        backgroundFetchState.value = await getBackgroundFetchRuntimeState();
      } catch {
        backgroundFetchState.value = null;
      }
      try {
        const state = await platformBridge.getAggressiveKeepAliveState();
        aggressiveKeepAliveSupported.value = !!state?.supported;
        backgroundLockEnabled.value = !!state?.active;
        backgroundLockSource.value = String(state?.source || "");
        keepAliveReason.value = String(state?.reason || "");
      } catch {
        aggressiveKeepAliveSupported.value = false;
        keepAliveReason.value = "状态读取失败";
      }
    };
    const handleBackgroundToggle = async () => {
      saveSettings();
      if (currentRuntime.value === "capacitor") {
        const keepAlive = await platformBridge.setAggressiveKeepAlive(enableBackground.value);
        aggressiveKeepAliveSupported.value = !!keepAlive?.supported;
        backgroundLockEnabled.value = !!keepAlive?.active;
        backgroundLockSource.value = String(keepAlive?.source || "");
        keepAliveReason.value = String(keepAlive?.reason || "");
        if (enableBackground.value && isAndroid()) {
          showBatteryPrompt.value = true;
        }
        if (enableBackground.value && !isAndroid() && currentRuntime.value === "capacitor") {
          statusMessage.value = "iOS 后台任务由系统自动调度，前台服务保活不可用。请确保已授予通知权限。";
        }
        await refreshRuntimeStates();
        return;
      }
      if (isTauriRuntime()) {
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
        statusMessage.value = ok ? "已打开系统设置，请允许通知与后台运行权限。" : "无法自动打开系统设置，请手动授予后台权限。";
      }).catch(() => {
        statusMessage.value = "无法自动打开系统设置，请手动授予后台权限。";
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
          statusMessage.value = "通知权限未授权，测试通知未发送。请点击上方“管理”开启通知权限。";
          return;
        }
        await ensureAndroidChannel();
        const testId = Math.floor(Date.now() % 2147483e3);
        try {
          const ok = await platformBridge.sendLocalNotification({
            id: testId,
            channelId: "hbut-default",
            title: "Mini-HBUT",
            body: "这是一个测试通知，用于验证通知权限和推送能力。"
          });
          if (!ok && currentRuntime.value === "capacitor") {
            const retryOk = await platformBridge.sendLocalNotification({
              id: testId + 1,
              channelId: "hbut-default",
              title: "Mini-HBUT",
              body: "这是一个测试通知（移动端重试通道）。"
            });
            if (!retryOk) {
              throw new Error("移动端通知调度失败，请检查系统通知权限与电池优化设置");
            }
          }
          if (!ok && isTauriRuntime()) {
            await invokeNative("send_test_notification_native", {
              title: "Mini-HBUT",
              body: "这是一个测试通知（Rust 兜底通道）。"
            });
          }
        } catch (notifyError) {
          if (!isAclDeniedError(notifyError)) throw notifyError;
        }
        statusMessage.value = "测试通知已发送，请查看系统通知栏。";
      } catch (error) {
        lastError.value = String(error);
        statusMessage.value = `发送测试通知失败：${lastError.value}`;
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
      if (enableBackground.value && currentRuntime.value === "capacitor") {
        const keepAlive = await platformBridge.setAggressiveKeepAlive(true);
        aggressiveKeepAliveSupported.value = !!keepAlive?.supported;
        backgroundLockEnabled.value = !!keepAlive?.active;
        backgroundLockSource.value = String(keepAlive?.source || "");
        keepAliveReason.value = String(keepAlive?.reason || "");
      } else if (enableBackground.value && isTauriRuntime()) {
        const result = await enableBackgroundPowerLock();
        backgroundLockEnabled.value = result.enabled;
        backgroundLockSource.value = result.source.join(" + ");
        keepAliveReason.value = result.enabled ? "" : "窗口保活未生效";
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
        _cache[46] || (_cache[46] = createStaticVNode('<header class="dashboard-header" data-v-8ccbffd5><div class="header-left" data-v-8ccbffd5><img class="logo-img" src="' + _imports_0 + '" alt="HBUT" data-v-8ccbffd5><span class="header-title" data-v-8ccbffd5>Mini-HBUT</span></div><span class="header-pill" data-v-8ccbffd5>通知</span></header>', 1)),
        createBaseVNode("main", _hoisted_2, [
          createBaseVNode("section", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              _cache[12] || (_cache[12] = createBaseVNode("div", { class: "permission-icon-circle" }, [
                createBaseVNode("span", { class: "material-symbols-outlined fill" }, "notifications_active")
              ], -1)),
              createBaseVNode("div", _hoisted_5, [
                createBaseVNode("h2", _hoisted_6, "推送通知" + toDisplayString(permissionLabel.value === "已授权" ? "已开启" : "未开启"), 1),
                createBaseVNode("p", _hoisted_7, toDisplayString(permissionLabel.value === "已授权" ? "你将准时收到校园提醒" : "请授权通知权限以接收提醒"), 1)
              ])
            ]),
            createBaseVNode("button", {
              class: "permission-manage-btn",
              onClick: handleRequestPermission
            }, "管理")
          ]),
          createBaseVNode("section", _hoisted_8, [
            _cache[28] || (_cache[28] = createBaseVNode("h3", { class: "section-heading" }, "通知类型设置", -1)),
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
                    card.key === "grades" ? (openBlock(), createElementBlock("div", _hoisted_9, [
                      createBaseVNode("div", _hoisted_10, [
                        _cache[14] || (_cache[14] = createBaseVNode("div", { class: "notify-type-icon icon-accent" }, [
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
                          _cache[13] || (_cache[13] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      _cache[15] || (_cache[15] = createBaseVNode("div", { class: "notify-type-body" }, [
                        createBaseVNode("h4", { class: "notify-type-name" }, "成绩更新"),
                        createBaseVNode("p", { class: "notify-type-desc" }, "出分第一时间提醒")
                      ], -1))
                    ])) : createCommentVNode("", true),
                    card.key === "exams" ? (openBlock(), createElementBlock("div", _hoisted_11, [
                      createBaseVNode("div", _hoisted_12, [
                        _cache[17] || (_cache[17] = createBaseVNode("div", { class: "notify-type-icon icon-orange" }, [
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
                          _cache[16] || (_cache[16] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      _cache[18] || (_cache[18] = createBaseVNode("div", { class: "notify-type-body" }, [
                        createBaseVNode("h4", { class: "notify-type-name" }, "考试安排"),
                        createBaseVNode("p", { class: "notify-type-desc" }, "考前 3 天提醒")
                      ], -1))
                    ])) : createCommentVNode("", true),
                    card.key === "electricity" ? (openBlock(), createElementBlock("div", _hoisted_13, [
                      createBaseVNode("div", _hoisted_14, [
                        _cache[20] || (_cache[20] = createBaseVNode("div", { class: "notify-type-icon icon-teal" }, [
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
                          _cache[19] || (_cache[19] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      _cache[21] || (_cache[21] = createBaseVNode("div", { class: "notify-type-body" }, [
                        createBaseVNode("h4", { class: "notify-type-name" }, "寝室电费"),
                        createBaseVNode("p", { class: "notify-type-desc" }, "余额不足自动推送")
                      ], -1))
                    ])) : createCommentVNode("", true),
                    card.key === "class_reminder" ? (openBlock(), createElementBlock("div", _hoisted_15, [
                      createBaseVNode("div", _hoisted_16, [
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
                      createBaseVNode("div", _hoisted_17, [
                        _cache[24] || (_cache[24] = createBaseVNode("h4", { class: "notify-type-name" }, "上课提醒", -1)),
                        createBaseVNode("p", _hoisted_18, "课前 " + toDisplayString(classLeadMinutes.value) + " 分钟提醒", 1)
                      ])
                    ])) : createCommentVNode("", true),
                    card.key === "school_inbox" ? (openBlock(), createElementBlock("div", _hoisted_19, [
                      createBaseVNode("div", _hoisted_20, [
                        _cache[26] || (_cache[26] = createBaseVNode("div", { class: "notify-type-icon icon-indigo" }, [
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
                          _cache[25] || (_cache[25] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
                        ])
                      ]),
                      _cache[27] || (_cache[27] = createBaseVNode("div", { class: "notify-type-body" }, [
                        createBaseVNode("h4", { class: "notify-type-name" }, "学校消息"),
                        createBaseVNode("p", { class: "notify-type-desc" }, "教务/学习通消息中心新通知")
                      ], -1))
                    ])) : createCommentVNode("", true)
                  ]),
                  _: 2
                }, 1032, ["item-id", "editing", "dragging", "hover"]);
              }), 128)),
              createVNode(LayoutCollisionFxLayer, { particles: notificationCollisionFx.value }, null, 8, ["particles"])
            ], 544),
            isNotificationLayoutEditing.value ? (openBlock(), createElementBlock("div", _hoisted_21, [
              createBaseVNode("button", {
                class: "layout-edit-btn",
                onClick: resetNotificationLayoutEdit
              }, "重置"),
              createBaseVNode("button", {
                class: "layout-edit-btn",
                onClick: cancelNotificationLayoutEdit
              }, "取消"),
              createBaseVNode("button", {
                class: "layout-edit-btn primary",
                onClick: saveNotificationLayoutEdit
              }, "保存")
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("section", _hoisted_22, [
            createBaseVNode("div", _hoisted_23, [
              _cache[30] || (_cache[30] = createBaseVNode("div", { class: "sync-header-left" }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "sync"),
                createBaseVNode("h3", { class: "sync-title" }, "后台自动检查")
              ], -1)),
              createBaseVNode("label", _hoisted_24, [
                withDirectives(createBaseVNode("input", {
                  type: "checkbox",
                  "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => enableBackground.value = $event),
                  onChange: handleBackgroundToggle
                }, null, 544), [
                  [vModelCheckbox, enableBackground.value]
                ]),
                _cache[29] || (_cache[29] = createBaseVNode("span", { class: "toggle-track" }, null, -1))
              ])
            ]),
            createBaseVNode("div", _hoisted_25, [
              _cache[32] || (_cache[32] = createBaseVNode("span", { class: "sync-interval-label" }, "检查间隔", -1)),
              withDirectives(createBaseVNode("select", {
                class: "sync-interval-select",
                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => checkInterval.value = $event),
                onChange: handleIntervalChange
              }, [..._cache[31] || (_cache[31] = [
                createBaseVNode("option", { value: 15 }, "每 15 分钟", -1),
                createBaseVNode("option", { value: 30 }, "每 30 分钟", -1),
                createBaseVNode("option", { value: 60 }, "每 1 小时", -1)
              ])], 544), [
                [vModelSelect, checkInterval.value]
              ])
            ])
          ]),
          createBaseVNode("section", _hoisted_26, [
            createBaseVNode("button", {
              class: "action-btn secondary",
              disabled: checking.value,
              onClick: runManualCheck
            }, toDisplayString(checking.value ? "检查中..." : "立即检查一次"), 9, _hoisted_27),
            createBaseVNode("button", {
              class: "action-btn secondary",
              disabled: sending.value,
              onClick: handleTestNotification
            }, toDisplayString(sending.value ? "发送中..." : "发送测试通知"), 9, _hoisted_28)
          ]),
          createBaseVNode("section", _hoisted_29, [
            createBaseVNode("div", _hoisted_30, [
              _cache[33] || (_cache[33] = createBaseVNode("h3", { class: "section-heading" }, "近期消息", -1)),
              createBaseVNode("span", _hoisted_31, toDisplayString(lastCheckText.value), 1)
            ]),
            gradeItems.value.length ? (openBlock(), createElementBlock("div", _hoisted_32, [
              createBaseVNode("div", _hoisted_33, [
                _cache[34] || (_cache[34] = createBaseVNode("div", { class: "notify-msg-icon icon-accent" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "school")
                ], -1)),
                createBaseVNode("div", _hoisted_34, [
                  createBaseVNode("div", _hoisted_35, [
                    createBaseVNode("h4", {
                      class: normalizeClass(["notify-msg-title", { bold: gradeSummary.value?.changed }])
                    }, toDisplayString(gradeSummary.value?.changed ? "新成绩发布" : "成绩动态"), 3),
                    createBaseVNode("span", _hoisted_36, toDisplayString(lastCheckText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_37, "总成绩 " + toDisplayString(gradeSummary.value?.total || 0) + " 条 · 本次" + toDisplayString(gradeSummary.value?.changed ? "有变化" : "无变化"), 1),
                  gradeItems.value.length ? (openBlock(), createElementBlock("ul", _hoisted_38, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(gradeItems.value.slice(0, 3), (item, idx) => {
                      return openBlock(), createElementBlock("li", {
                        key: `grade-${idx}`,
                        class: "detail-row"
                      }, [
                        createBaseVNode("span", _hoisted_39, toDisplayString(item.course_name || "-"), 1),
                        createBaseVNode("span", _hoisted_40, [
                          createBaseVNode("span", null, toDisplayString(item.term || "未知学期"), 1),
                          createBaseVNode("span", _hoisted_41, toDisplayString(item.final_score || "-"), 1)
                        ])
                      ]);
                    }), 128))
                  ])) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            classSummary.value?.enabled ? (openBlock(), createElementBlock("div", _hoisted_42, [
              createBaseVNode("div", _hoisted_43, [
                _cache[37] || (_cache[37] = createBaseVNode("div", { class: "notify-msg-icon icon-sky" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "schedule")
                ], -1)),
                createBaseVNode("div", _hoisted_44, [
                  createBaseVNode("div", _hoisted_45, [
                    _cache[35] || (_cache[35] = createBaseVNode("h4", { class: "notify-msg-title" }, "上课提醒", -1)),
                    createBaseVNode("span", _hoisted_46, toDisplayString(classReminderText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_47, toDisplayString(nextClassText.value), 1),
                  classSummary.value?.nextCourse?.name ? (openBlock(), createElementBlock("div", _hoisted_48, [
                    createBaseVNode("span", _hoisted_49, [
                      _cache[36] || (_cache[36] = createBaseVNode("span", { class: "material-symbols-outlined mini-icon" }, "alarm", -1)),
                      createTextVNode(" 提前 " + toDisplayString(classLeadMinutes.value) + " 分钟", 1)
                    ])
                  ])) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            examItems.value.length ? (openBlock(), createElementBlock("div", _hoisted_50, [
              createBaseVNode("div", _hoisted_51, [
                _cache[39] || (_cache[39] = createBaseVNode("div", { class: "notify-msg-icon icon-orange" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "edit_document")
                ], -1)),
                createBaseVNode("div", _hoisted_52, [
                  createBaseVNode("div", _hoisted_53, [
                    _cache[38] || (_cache[38] = createBaseVNode("h4", { class: "notify-msg-title" }, "考试安排", -1)),
                    createBaseVNode("span", _hoisted_54, toDisplayString(examSummary.value?.tomorrowCount ? "明日有考试" : ""), 1)
                  ]),
                  createBaseVNode("p", _hoisted_55, "近期 " + toDisplayString(examItems.value.length) + " 门 · 明日 " + toDisplayString(examSummary.value?.tomorrowCount || 0) + " 门", 1),
                  createBaseVNode("ul", _hoisted_56, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(examItems.value.slice(0, 3), (item, idx) => {
                      return openBlock(), createElementBlock("li", {
                        key: `exam-${idx}`
                      }, [
                        createBaseVNode("span", _hoisted_57, [
                          createTextVNode(toDisplayString(item.course_name || "-") + " ", 1),
                          item.is_tomorrow ? (openBlock(), createElementBlock("small", _hoisted_58, "明日")) : createCommentVNode("", true)
                        ]),
                        createBaseVNode("span", _hoisted_59, [
                          item.exam_date ? (openBlock(), createElementBlock("span", _hoisted_60, toDisplayString(item.exam_date), 1)) : createCommentVNode("", true),
                          item.exam_time ? (openBlock(), createElementBlock("span", _hoisted_61, toDisplayString(formatNotifyExamTime(item.exam_time)), 1)) : createCommentVNode("", true),
                          item.location ? (openBlock(), createElementBlock("span", _hoisted_62, toDisplayString(item.location), 1)) : createCommentVNode("", true)
                        ])
                      ]);
                    }), 128))
                  ])
                ])
              ])
            ])) : createCommentVNode("", true),
            schoolInboxSummary.value?.enabled ? (openBlock(), createElementBlock("div", _hoisted_63, [
              createBaseVNode("div", _hoisted_64, [
                _cache[40] || (_cache[40] = createBaseVNode("div", { class: "notify-msg-icon icon-indigo" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "mail")
                ], -1)),
                createBaseVNode("div", _hoisted_65, [
                  createBaseVNode("div", _hoisted_66, [
                    createBaseVNode("h4", {
                      class: normalizeClass(["notify-msg-title", { bold: schoolInboxSummary.value?.triggered > 0 }])
                    }, toDisplayString(schoolInboxSummary.value?.triggered > 0 ? "新学校消息" : "学校消息"), 3),
                    createBaseVNode("span", _hoisted_67, toDisplayString(lastCheckText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_68, [
                    createTextVNode(" 共 " + toDisplayString(schoolInboxSummary.value?.total || 0) + " 条 ", 1),
                    schoolInboxSummary.value?.source ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      createTextVNode("（" + toDisplayString(schoolInboxSummary.value.source === "chaoxing" ? "学习通" : "教务") + "）", 1)
                    ], 64)) : createCommentVNode("", true),
                    createTextVNode(" · 本次新增 " + toDisplayString(schoolInboxSummary.value?.triggered || 0) + " 条 ", 1)
                  ]),
                  schoolInboxSummary.value?.error ? (openBlock(), createElementBlock("p", _hoisted_69, toDisplayString(schoolInboxSummary.value.error), 1)) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            powerSummary.value?.quantity != null ? (openBlock(), createElementBlock("div", _hoisted_70, [
              createBaseVNode("div", _hoisted_71, [
                _cache[42] || (_cache[42] = createBaseVNode("div", { class: "notify-msg-icon icon-teal" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined fill" }, "bolt")
                ], -1)),
                createBaseVNode("div", _hoisted_72, [
                  createBaseVNode("div", _hoisted_73, [
                    _cache[41] || (_cache[41] = createBaseVNode("h4", { class: "notify-msg-title" }, "电费监控", -1)),
                    createBaseVNode("span", _hoisted_74, toDisplayString(powerStatusText.value), 1)
                  ]),
                  createBaseVNode("p", _hoisted_75, "剩余电量：" + toDisplayString(powerQuantityText.value), 1),
                  powerSummary.value?.isDual ? (openBlock(), createElementBlock("p", _hoisted_76, "空调电量：" + toDisplayString(acPowerQuantityText.value), 1)) : createCommentVNode("", true)
                ])
              ])
            ])) : createCommentVNode("", true),
            _cache[43] || (_cache[43] = createBaseVNode("div", { class: "notify-end-hint" }, "长按卡片进入管理模式", -1))
          ]),
          enableBackground.value ? (openBlock(), createElementBlock("div", _hoisted_77, [
            createBaseVNode("span", _hoisted_78, "保活：" + toDisplayString(backgroundLockStatusText.value), 1),
            createBaseVNode("span", _hoisted_79, "调度：" + toDisplayString(backgroundFetchStatusText.value), 1)
          ])) : createCommentVNode("", true)
        ]),
        statusMessage.value ? (openBlock(), createElementBlock("p", _hoisted_80, toDisplayString(statusMessage.value), 1)) : createCommentVNode("", true),
        lastError.value ? (openBlock(), createElementBlock("p", _hoisted_81, "错误详情：" + toDisplayString(lastError.value), 1)) : createCommentVNode("", true),
        showBatteryPrompt.value ? (openBlock(), createElementBlock("div", _hoisted_82, [
          createBaseVNode("div", { class: "modal-card" }, [
            _cache[44] || (_cache[44] = createBaseVNode("h3", null, "电池优化提示", -1)),
            _cache[45] || (_cache[45] = createBaseVNode("p", null, "Android 建议将本应用加入后台白名单，避免系统回收后无法按时通知。", -1)),
            createBaseVNode("div", { class: "modal-actions" }, [
              createBaseVNode("button", {
                class: "btn-text",
                onClick: cancelBatterySettings
              }, "稍后"),
              createBaseVNode("button", {
                class: "btn-primary",
                onClick: confirmBatterySettings
              }, "我知道了")
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const NotificationView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-8ccbffd5"]]);
export {
  NotificationView as default
};
