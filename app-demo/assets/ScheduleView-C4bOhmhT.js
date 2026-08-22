import { m as SCHEDULE_POPUP_PENDING_KEY, a as useUiSettings, e as flushUiSettings, i as showToast, p as readScheduleRenderSnapshot, q as writeScheduleRenderSnapshot, f as fetchWithCache, b as axiosInstance, E as EXTRA_LONG_TTL, D as DEFAULT_SWR_OPTIONS, n as normalizeSemesterList, j as resolveCurrentSemester, t as afterScheduleRefresh, v as writeScheduleLock, x as getCachedScheduleSnapshot, y as runCloudSyncDownload, z as runCloudSyncUpload, A as getCloudSyncCooldownState, _ as _export_sfc, C as CLOUD_SYNC_UPDATED_EVENT, B as consumeScheduleSwitchPending, r as readScheduleLockDetail, F as isAutoScheduleLockReason, G as clearScheduleLock, H as readScheduleLock, I as warmupScheduleForStudent } from "./app-demo-Bca6_3ab.js";
import { p as pushDebugLog, i as isTestAccountSession, O as isMobileLike, a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-BU9jeOXP.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { r as ref, v as watch, h as computed, C as nextTick, L as resolveComponent, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, p as createVNode, k as withCtx, F as Fragment, g as renderList, d as createCommentVNode, T as Transition, w as withModifiers, e as createTextVNode, n as normalizeClass, j as createBlock, u as unref, f as normalizeStyle, J as withDirectives, K as vModelText, s as Teleport, y as defineComponent, o as onMounted, l as onBeforeUnmount } from "./vue-core-DWoFi2CM.js";
import { h as hasBootMetric, m as markBootMetric } from "./debug-tools-BgYILSb8.js";
import "./more-modules-CfNfahoc.js";
import "./capture-D-zd0oUS.js";
const useConfirmDialog = () => {
  const showConfirmDialog = ref(false);
  const confirmDialogTitle = ref("");
  const confirmDialogLines = ref([]);
  const confirmDialogConfirmText = ref("确认");
  const confirmDialogCancelText = ref("取消");
  const confirmDialogDanger = ref(false);
  let confirmDialogResolver = null;
  const openConfirmDialog = (options = {}) => {
    confirmDialogTitle.value = String(options.title || "请确认");
    confirmDialogLines.value = Array.isArray(options.lines) ? options.lines.map((line) => String(line || "").trim()).filter(Boolean) : [];
    confirmDialogConfirmText.value = String(options.confirmText || "确认");
    confirmDialogCancelText.value = String(options.cancelText || "取消");
    confirmDialogDanger.value = !!options.danger;
    showConfirmDialog.value = true;
  };
  const closeConfirmDialog = (result = false) => {
    showConfirmDialog.value = false;
    const resolver = confirmDialogResolver;
    confirmDialogResolver = null;
    if (resolver) {
      resolver(!!result);
    }
  };
  const askConfirm = (options = {}) => {
    if (confirmDialogResolver) {
      confirmDialogResolver(false);
      confirmDialogResolver = null;
    }
    openConfirmDialog(options);
    return new Promise((resolve) => {
      confirmDialogResolver = resolve;
    });
  };
  return {
    showConfirmDialog,
    confirmDialogTitle,
    confirmDialogLines,
    confirmDialogConfirmText,
    confirmDialogCancelText,
    confirmDialogDanger,
    openConfirmDialog,
    closeConfirmDialog,
    askConfirm
  };
};
const weekDays = ["1 周一", "2 周二", "3 周三", "4 周四", "5 周五", "6 周六", "7 周日"];
const weekDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MAX_PERIOD = 11;
const periodOptions = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1);
const courseCardStyleOptions = [
  { key: "modern", label: "现代" },
  { key: "traditional", label: "传统" },
  { key: "class", label: "标准" }
];
const timeSchedule = [
  { p: 1, start: "08:20", end: "09:05" },
  { p: 2, start: "09:10", end: "09:55" },
  { p: 3, start: "10:15", end: "11:00" },
  { p: 4, start: "11:05", end: "11:50" },
  { p: 5, start: "14:00", end: "14:45" },
  { p: 6, start: "14:50", end: "15:35" },
  { p: 7, start: "15:55", end: "16:40" },
  { p: 8, start: "16:45", end: "17:30" },
  { p: 9, start: "18:30", end: "19:15" },
  { p: 10, start: "19:20", end: "20:05" },
  { p: 11, start: "20:10", end: "20:55" }
];
const courseThemes = [
  { bg: "#e7f4ff", text: "#0f5da8", border: "#72b9ff" },
  // 湖蓝
  { bg: "#fff0e8", text: "#cb4f2f", border: "#ffb390" },
  // 珊瑚橘
  { bg: "#efe9ff", text: "#5f52cf", border: "#b8aaff" },
  // 紫藤
  { bg: "#fff4db", text: "#be7a07", border: "#efc465" },
  // 琥珀
  { bg: "#ffeaf2", text: "#c33f73", border: "#f3a8c4" },
  // 玫瑰
  { bg: "#e8faf5", text: "#117f67", border: "#8adcc4" },
  // 青绿
  { bg: "#e8efff", text: "#335ccb", border: "#9eb4ff" },
  // 靛蓝
  { bg: "#fff1f5", text: "#b63f58", border: "#f0acbb" },
  // 浅莓
  { bg: "#edf8ef", text: "#2f8c3d", border: "#9dd7a7" },
  // 春绿
  { bg: "#e8f9ff", text: "#007893", border: "#84d6ec" },
  // 青空
  { bg: "#f4edff", text: "#7548c1", border: "#c6adf1" },
  // 兰紫
  { bg: "#fff2e2", text: "#b05c16", border: "#efb67f" }
  // 暖杏
];
const LOGIN_SESSION_TOKEN_KEY = "hbu_login_session_token";
const SCHEDULE_META_KEY = "hbu_schedule_meta";
const normalizeWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return [];
  const normalized = weeks.map((w) => Number(w)).filter((w) => Number.isFinite(w) && w > 0);
  return Array.from(new Set(normalized)).sort((a, b) => a - b);
};
const formatWeeksText = (weeks) => {
  const values = normalizeWeeks(weeks);
  if (!values.length) return "";
  const ranges = [];
  let start = values[0];
  let prev = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const current = values[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = current;
    prev = current;
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(",");
};
const normalizeCourseCardStyle = (value) => {
  const key = String(value || "").trim().toLowerCase();
  return ["modern", "traditional", "class"].includes(key) ? key : "modern";
};
const buildPopupShownKey = (studentId) => {
  const sid = String(studentId || "").trim();
  const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || "").trim();
  if (!sid || !sessionToken) return "";
  return `hbu_schedule_popup_shown:${sid}:${sessionToken}`;
};
const markPopupShown = (studentId) => {
  const key = buildPopupShownKey(studentId);
  if (!key) return;
  localStorage.setItem(key, "1");
};
const consumePendingSemesterPopup = (studentId) => {
  try {
    const raw = localStorage.getItem(SCHEDULE_POPUP_PENDING_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const targetSid = String(parsed?.student_id || "").trim();
    const sem = String(parsed?.semester || "").trim();
    if (targetSid && targetSid !== String(studentId || "").trim()) {
      return "";
    }
    localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY);
    return sem;
  } catch {
    localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY);
    return "";
  }
};
const useScheduleMenu = (options) => {
  const { props } = options;
  const uiSettings = useUiSettings();
  const showMenu = ref(false);
  const showSemesterPopup = ref(false);
  const semesterPopupText = ref("");
  const showSemesterBadgePopover = ref(false);
  const scheduleCourseCardStyle = ref(normalizeCourseCardStyle(uiSettings.scheduleCourseCardStyle));
  const courseCardRefreshNonce = ref(0);
  const styleOptions = courseCardStyleOptions;
  watch(
    () => uiSettings.scheduleCourseCardStyle,
    (value) => {
      scheduleCourseCardStyle.value = normalizeCourseCardStyle(value);
      pushDebugLog("Schedule", `课表样式状态同步：${scheduleCourseCardStyle.value}`, "debug");
    },
    { immediate: true }
  );
  const toggleMenu = () => {
    showMenu.value = !showMenu.value;
  };
  const setScheduleCourseCardStyle = (styleKey) => {
    const nextStyle = normalizeCourseCardStyle(styleKey);
    if (scheduleCourseCardStyle.value === nextStyle) return;
    scheduleCourseCardStyle.value = nextStyle;
    courseCardRefreshNonce.value += 1;
    uiSettings.scheduleCourseCardStyle = nextStyle;
    flushUiSettings();
    pushDebugLog("Schedule", `切换课表样式：${nextStyle}`, "info");
    try {
      const snapshot = JSON.parse(localStorage.getItem("hbu_ui_settings_v2") || "{}");
      pushDebugLog(
        "Schedule",
        `课表样式已写入本地缓存：${String(snapshot?.scheduleCourseCardStyle || "") || "unknown"}`,
        "debug"
      );
    } catch (error) {
      pushDebugLog("Schedule", "读取课表样式缓存失败", "warn", error);
    }
    const styleLabelMap = {
      modern: "现代",
      traditional: "传统",
      class: "标准"
    };
    showToast(`已切换为${styleLabelMap[nextStyle] || "现代"}样式`, "success");
  };
  const openSemesterPopup = (targetSemester = "") => {
    const sem = String(targetSemester || "").trim();
    if (!sem) return;
    semesterPopupText.value = sem;
    showSemesterPopup.value = true;
    markPopupShown(props.studentId);
  };
  const onSemesterBadgeClick = () => {
    showSemesterPopup.value = false;
    showSemesterBadgePopover.value = !showSemesterBadgePopover.value;
  };
  const closeSemesterBadgePopover = (e) => {
    if (showSemesterBadgePopover.value && !e.target.closest(".semester-badge-wrap")) {
      showSemesterBadgePopover.value = false;
    }
  };
  const isPopupShown = () => {
    const sid = String(props.studentId || "").trim();
    const sessionToken = String(localStorage.getItem("hbu_login_session_token") || "").trim();
    if (!sid || !sessionToken) return true;
    return localStorage.getItem(`hbu_schedule_popup_shown:${sid}:${sessionToken}`) === "1";
  };
  const anyOverlayOpen = computed(
    () => showMenu.value || showSemesterBadgePopover.value || showSemesterPopup.value
  );
  return {
    showMenu,
    showSemesterPopup,
    semesterPopupText,
    showSemesterBadgePopover,
    scheduleCourseCardStyle,
    courseCardRefreshNonce,
    styleOptions,
    anyOverlayOpen,
    toggleMenu,
    setScheduleCourseCardStyle,
    openSemesterPopup,
    onSemesterBadgeClick,
    closeSemesterBadgePopover,
    isPopupShown
  };
};
const deriveSemesterByDate = (date = /* @__PURE__ */ new Date()) => {
  const year = Number(date.getFullYear());
  const month = Number(date.getMonth()) + 1;
  const day = Number(date.getDate());
  let academicYearStart = year - 1;
  let term = 1;
  if (month >= 9) {
    academicYearStart = year;
    term = 1;
  } else if (month >= 3) {
    academicYearStart = year - 1;
    term = 2;
  } else if (month === 2 && day >= 15) {
    academicYearStart = year - 1;
    term = 2;
  } else {
    academicYearStart = year - 1;
    term = 1;
  }
  return `${academicYearStart}-${academicYearStart + 1}-${term}`;
};
const resolveDisplayStudentId = (studentId) => {
  const sid = String(studentId || "").trim();
  if (sid) return sid;
  if (localStorage.getItem("hbu_manual_logout") === "true") return "";
  const fallback = String(localStorage.getItem("hbu_username") || "").trim();
  return /^\d{10}$/.test(fallback) ? fallback : "";
};
const readStoredSemester = () => {
  try {
    const raw = localStorage.getItem(SCHEDULE_META_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.semester || "").trim();
  } catch {
    return "";
  }
};
const useScheduleSemester = (options) => {
  const { isAnyOverlayOpen } = options;
  const semester = ref("");
  const semesterDraft = ref("");
  const currentWeek = ref(0);
  const selectedWeek = ref(0);
  const totalWeeks = ref(25);
  const startDateStr = ref("");
  const vacationNotice = ref("");
  const weekTransitionName = ref("week-slide-left");
  const storedSemester = readStoredSemester();
  if (storedSemester) {
    semester.value = storedSemester;
    semesterDraft.value = storedSemester;
  }
  const weekDates = computed(() => {
    if (!startDateStr.value) return [];
    const start = new Date(startDateStr.value);
    const daysToAdd = (selectedWeek.value - 1) * 7;
    start.setDate(start.getDate() + daysToAdd);
    const dates = [];
    const today = /* @__PURE__ */ new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      dates.push({
        year: yyyy,
        month: d.getMonth() + 1,
        date: d.getDate(),
        iso: `${yyyy}-${mm}-${dd}`,
        dayLabel: weekDays[i],
        isToday: d.toDateString() === today.toDateString()
      });
    }
    return dates;
  });
  const currentMonth = computed(() => {
    if (weekDates.value.length > 0) return weekDates.value[0].month;
    return (/* @__PURE__ */ new Date()).getMonth() + 1;
  });
  const isTodayColumn = (dayIndex) => {
    const idx = Number(dayIndex) - 1;
    if (idx < 0 || idx > 6) return false;
    return !!weekDates.value[idx]?.isToday;
  };
  const semesterWeekOptions = computed(() => {
    const count = Number(totalWeeks.value);
    const safeCount = Number.isFinite(count) && count > 0 ? count : 25;
    return Array.from({ length: safeCount }, (_, i) => i + 1);
  });
  const applyMeta = (meta, requestedSemester = "") => {
    const safeMeta = meta && typeof meta === "object" ? meta : {};
    const resolvedSemester = String(safeMeta.semester || requestedSemester || semester.value || "").trim();
    if (resolvedSemester) {
      semester.value = resolvedSemester;
      semesterDraft.value = resolvedSemester;
    }
    startDateStr.value = String(safeMeta.start_date || "").trim();
    vacationNotice.value = String(safeMeta.vacation_notice || "").trim();
    const parsedWeeks = Number(safeMeta.total_weeks || 0);
    totalWeeks.value = Number.isFinite(parsedWeeks) && parsedWeeks > 0 ? parsedWeeks : 25;
    const parsedCurrentWeek = Number(safeMeta.current_week || 0);
    const safeWeek = Number.isFinite(parsedCurrentWeek) && parsedCurrentWeek > 0 ? Math.min(parsedCurrentWeek, totalWeeks.value) : 1;
    currentWeek.value = safeWeek;
    selectedWeek.value = safeWeek;
    if (!isTestAccountSession()) {
      localStorage.setItem(SCHEDULE_META_KEY, JSON.stringify({
        semester: resolvedSemester,
        start_date: startDateStr.value,
        current_week: currentWeek.value,
        total_weeks: totalWeeks.value,
        vacation_notice: vacationNotice.value
      }));
    }
  };
  watch(selectedWeek, (next, prev) => {
    const current = Number(next || 0);
    const previous = Number(prev || 0);
    const maxWeeks = Math.max(1, Number(totalWeeks.value || 1));
    if (!Number.isFinite(current) || current <= 0) {
      selectedWeek.value = 1;
      return;
    }
    if (current > maxWeeks) {
      selectedWeek.value = maxWeeks;
      return;
    }
    if (previous > 0 && current !== previous) {
      weekTransitionName.value = current > previous ? "week-slide-left" : "week-slide-right";
    }
  });
  watch(totalWeeks, (maxWeeks) => {
    if (!Number.isFinite(maxWeeks) || maxWeeks <= 0) return;
    if (selectedWeek.value > maxWeeks) {
      selectedWeek.value = maxWeeks;
    }
    if (currentWeek.value > maxWeeks) {
      currentWeek.value = maxWeeks;
    }
  });
  let touchStartX = 0;
  let touchStartY = 0;
  let touchLastX = 0;
  let touchStartAt = 0;
  let swipeTracking = false;
  let swipeLocked = false;
  const shouldIgnoreWeekSwipe = () => {
    return isAnyOverlayOpen();
  };
  const shiftWeek = (delta) => {
    if (swipeLocked) return false;
    const current = Number(selectedWeek.value || 0);
    const max = Math.max(1, Number(totalWeeks.value || 1));
    const target = Math.min(max, Math.max(1, current + delta));
    if (target === current) return false;
    weekTransitionName.value = delta > 0 ? "week-slide-left" : "week-slide-right";
    selectedWeek.value = target;
    swipeLocked = true;
    window.setTimeout(() => {
      swipeLocked = false;
    }, 260);
    return true;
  };
  const handleTouchStart = (e) => {
    if (shouldIgnoreWeekSwipe()) return;
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    swipeTracking = true;
    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
    touchLastX = touch.screenX;
    touchStartAt = Date.now();
  };
  const handleTouchMove = (e) => {
    if (!swipeTracking) return;
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    touchLastX = touch.screenX;
    const dx = Math.abs(touch.screenX - touchStartX);
    const dy = Math.abs(touch.screenY - touchStartY);
    if (dy > dx && dy > 16) {
      swipeTracking = false;
    }
  };
  const handleTouchEnd = (e) => {
    if (!swipeTracking) return;
    swipeTracking = false;
    const touch = e.changedTouches?.[0];
    const endX = touch?.screenX ?? touchLastX;
    const diff = touchStartX - endX;
    const durationMs = Math.max(1, Date.now() - touchStartAt);
    const velocity = Math.abs(diff) / durationMs;
    const distancePass = Math.abs(diff) >= 52;
    const velocityPass = Math.abs(diff) >= 24 && velocity >= 0.52;
    if (!distancePass && !velocityPass) return;
    if (diff > 0) {
      shiftWeek(1);
      return;
    }
    shiftWeek(-1);
  };
  const shouldIgnoreKeyboardWeekSwitch = () => {
    if (shouldIgnoreWeekSwipe()) return true;
    const active = document.activeElement;
    if (!active) return false;
    const tag = String(active.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return !!active.getAttribute?.("contenteditable");
  };
  const handleWeekKeydown = (event) => {
    if (!event) return;
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (shouldIgnoreKeyboardWeekSwitch()) return;
    if (event.key === "ArrowLeft") {
      const changed = shiftWeek(-1);
      if (changed) event.preventDefault();
      return;
    }
    if (event.key === "ArrowRight") {
      const changed = shiftWeek(1);
      if (changed) event.preventDefault();
    }
  };
  const jumpToCurrentWeek = () => {
    if (currentWeek.value) {
      weekTransitionName.value = Number(currentWeek.value) >= Number(selectedWeek.value) ? "week-slide-left" : "week-slide-right";
      selectedWeek.value = currentWeek.value;
    }
  };
  const scrollToWidgetTarget = (_day, period) => {
    try {
      const gridBody = document.querySelector(".schedule-view .grid-body");
      if (!gridBody) return;
      if (period >= 1) {
        const timeSlots = gridBody.querySelectorAll(".time-axis .time-slot");
        const targetSlot = timeSlots[period - 1];
        if (targetSlot) {
          const offsetTop = targetSlot.offsetTop;
          gridBody.scrollTo({ top: Math.max(0, offsetTop - 20), behavior: "smooth" });
        }
      }
    } catch {
    }
  };
  return {
    semester,
    semesterDraft,
    currentWeek,
    selectedWeek,
    totalWeeks,
    startDateStr,
    vacationNotice,
    weekTransitionName,
    weekDates,
    currentMonth,
    isTodayColumn,
    semesterWeekOptions,
    applyMeta,
    shiftWeek,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWeekKeydown,
    jumpToCurrentWeek,
    scrollToWidgetTarget
  };
};
const DEFAULT_COURSE_COLOR = "";
function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const hasHash = raw.startsWith("#");
  let body = hasHash ? raw.slice(1).trim() : raw;
  if (hasHash && /^[0-9a-fA-F]{3}$/.test(body)) {
    body = body.split("").map((ch) => ch + ch).join("");
  } else if (/^[0-9a-fA-F]{8}$/.test(body)) {
    body = body.slice(0, 6);
  } else if (!/^[0-9a-fA-F]{6}$/.test(body)) {
    return null;
  }
  return `#${body.toLowerCase()}`;
}
function normalizeOptionalCourseColor(value) {
  if (value === null || value === void 0) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeHexColor(trimmed);
}
function contrastTextForHex(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#0f172a";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? "#0f172a" : "#ffffff";
}
function mixHexWithWhite(hex, amount = 0.22) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#f8fafc";
  const t = Math.min(1, Math.max(0, amount));
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const mix = (c) => Math.round(255 * (1 - t) + c * t);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
const normalizeCustomCourse = (raw, fallbackSemester = "") => {
  if (!raw || typeof raw !== "object") return null;
  const weeks = normalizeWeeks(raw.weeks);
  const colorNorm = normalizeOptionalCourseColor(raw.color);
  return {
    id: String(raw.id || raw.source_id || ""),
    name: String(raw.name || "").trim(),
    teacher: String(raw.teacher || "").trim(),
    room: String(raw.room || raw.room_code || "").trim(),
    room_code: String(raw.room_code || raw.room || "").trim(),
    building: String(raw.building || "自定义").trim(),
    weekday: Number(raw.weekday || 1),
    period: Number(raw.period || 1),
    djs: Number(raw.djs || 1),
    weeks,
    weeks_text: String(raw.weeks_text || formatWeeksText(weeks)),
    credit: String(raw.credit || ""),
    class_name: String(raw.class_name || "自定义课程"),
    semester: String(raw.semester || fallbackSemester || ""),
    source_id: String(raw.source_id || raw.id || ""),
    created_at: String(raw.created_at || ""),
    updated_at: String(raw.updated_at || ""),
    // 可选用户色；#469 本地表单用，#470 持久化后由后端下发
    color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm,
    is_custom: true
  };
};
const hashText = (value) => {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};
const hexToRgb = (hex) => {
  const text = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return null;
  return {
    r: Number.parseInt(text.slice(0, 2), 16),
    g: Number.parseInt(text.slice(2, 4), 16),
    b: Number.parseInt(text.slice(4, 6), 16)
  };
};
const colorDistance = (aHex, bHex) => {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  if (!a || !b) return 0;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};
const getThemeContrastScore = (aIndex, bIndex) => {
  const themeA = courseThemes[aIndex] || {};
  const themeB = courseThemes[bIndex] || {};
  const borderGap = colorDistance(themeA.border, themeB.border);
  const textGap = colorDistance(themeA.text, themeB.text);
  return borderGap * 0.72 + textGap * 0.28;
};
const getCircularOffset = (seed, candidate) => {
  const len = courseThemes.length;
  const forward = (candidate - seed + len) % len;
  const backward = (seed - candidate + len) % len;
  return Math.min(forward, backward);
};
const evaluateThemeCandidate = (candidate, seed, neighborColors, globalColors) => {
  const neighborMinContrast = neighborColors.length ? neighborColors.reduce((minGap, neighborColor) => {
    const gap = getThemeContrastScore(candidate, neighborColor);
    return gap < minGap ? gap : minGap;
  }, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  const globalMinContrast = globalColors.length ? globalColors.reduce((minGap, globalColor) => {
    const gap = getThemeContrastScore(candidate, globalColor);
    return gap < minGap ? gap : minGap;
  }, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  return {
    candidate,
    neighborMinContrast,
    globalMinContrast,
    offset: getCircularOffset(seed, candidate)
  };
};
const pickBestThemeCandidate = (candidates, seed, neighborColors, globalColors) => {
  let best = null;
  for (const candidate of candidates) {
    const metrics = evaluateThemeCandidate(candidate, seed, neighborColors, globalColors);
    if (!best) {
      best = metrics;
      continue;
    }
    if (metrics.neighborMinContrast > best.neighborMinContrast) {
      best = metrics;
      continue;
    }
    if (metrics.neighborMinContrast === best.neighborMinContrast && metrics.globalMinContrast > best.globalMinContrast) {
      best = metrics;
      continue;
    }
    if (metrics.neighborMinContrast === best.neighborMinContrast && metrics.globalMinContrast === best.globalMinContrast && metrics.offset < best.offset) {
      best = metrics;
    }
  }
  return best?.candidate ?? null;
};
const processScheduleData = (courses) => {
  if (!courses || courses.length === 0) return [];
  courses.sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    return a.period - b.period;
  });
  return courses;
};
const periodsOverlap = (aStart, aEnd, bStart, bEnd) => {
  return !(aEnd < bStart || bEnd < aStart);
};
const areAdjacentCourses = (a, b) => {
  if (a._day === b._day) {
    return a._end + 1 === b._start || b._end + 1 === a._start;
  }
  if (Math.abs(a._day - b._day) === 1) {
    return periodsOverlap(a._start, a._end, b._start, b._end);
  }
  return false;
};
const getCourseMergeSignature = (course) => {
  const id = String(course?.id || course?.source_id || "").trim();
  const name = String(course?.name || "").trim();
  const teacher = String(course?.teacher || "").trim();
  const room = String(course?.room_code || course?.room || "").trim();
  const building = String(course?.building || "").trim();
  const className = String(course?.class_name || "").trim();
  const custom = course?.is_custom ? "1" : "0";
  return `${id}|${name}|${teacher}|${room}|${building}|${className}|${custom}`;
};
const getCourseEndPeriod = (course) => {
  const start = Number(course?.period) || 1;
  const span = Math.max(1, Number(course?.djs) || 1);
  return Math.min(MAX_PERIOD, start + span - 1);
};
const mergeDailyCourses = (dailyCourses) => {
  if (!dailyCourses.length) return [];
  const signatureCount = /* @__PURE__ */ new Map();
  dailyCourses.forEach((course) => {
    const signature = getCourseMergeSignature(course);
    signatureCount.set(signature, (signatureCount.get(signature) || 0) + 1);
  });
  const resolveRawSpan = (course) => {
    const start = Number(course?.period) || 1;
    if (course?.is_custom) {
      return Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course?.djs) || 1));
    }
    const signature = getCourseMergeSignature(course);
    const count = Number(signatureCount.get(signature) || 0);
    if (count > 1) {
      return 1;
    }
    const candidate = Number(course?.djs) || 1;
    if (candidate >= 1 && candidate <= MAX_PERIOD && start + candidate - 1 <= MAX_PERIOD) {
      return candidate;
    }
    return 1;
  };
  const merged = [];
  let i = 0;
  while (i < dailyCourses.length) {
    const current = dailyCourses[i];
    const startPeriod = Number(current.period) || 1;
    const currentSpan = resolveRawSpan(current);
    let endPeriod = Math.min(MAX_PERIOD, startPeriod + currentSpan - 1);
    let j = i + 1;
    while (j < dailyCourses.length) {
      const next = dailyCourses[j];
      const nextStart = Number(next.period) || 1;
      const nextSpan = resolveRawSpan(next);
      const nextEnd = Math.min(MAX_PERIOD, nextStart + nextSpan - 1);
      const sameSignature = getCourseMergeSignature(next) === getCourseMergeSignature(current);
      const canMergeSinglePeriodOnly = currentSpan === 1 && nextSpan === 1;
      if (sameSignature && canMergeSinglePeriodOnly && !!next.is_custom === !!current.is_custom && nextStart === endPeriod + 1) {
        endPeriod = Math.max(endPeriod, nextEnd);
        j++;
      } else {
        break;
      }
    }
    const span = endPeriod - startPeriod + 1;
    merged.push({
      ...current,
      djs: span
    });
    i = j;
  }
  return merged;
};
const buildConflictBlocks = (day, mergedCourses, weekNumber, fallbackSemester = "") => {
  if (!Array.isArray(mergedCourses) || mergedCourses.length < 2) return [];
  const periodConflicts = [];
  for (let period = 1; period <= 11; period += 1) {
    const activeRaw = mergedCourses.filter((course) => {
      const start = Number(course._start || course.period || 1);
      const span = Math.max(1, Number(course.djs || 1));
      const end = Number(course._end || start + span - 1);
      return period >= start && period <= end && !course.is_conflict;
    });
    const active = [];
    const signatureSet = /* @__PURE__ */ new Set();
    activeRaw.forEach((course) => {
      const signature = `${getCourseMergeSignature(course)}|${course.period}|${course.djs}`;
      if (signatureSet.has(signature)) return;
      signatureSet.add(signature);
      active.push(course);
    });
    if (active.length > 1) {
      const ids = active.map((course) => String(course._uid || course.id || course.name)).sort();
      periodConflicts.push({
        period,
        key: ids.join("|"),
        active
      });
    }
  }
  if (!periodConflicts.length) return [];
  const blocks = [];
  let i = 0;
  while (i < periodConflicts.length) {
    const current = periodConflicts[i];
    let end = current.period;
    let j = i + 1;
    while (j < periodConflicts.length && periodConflicts[j].period === end + 1 && periodConflicts[j].key === current.key) {
      end = periodConflicts[j].period;
      j += 1;
    }
    const conflictCourses = current.active;
    const title = `课程冲突（${conflictCourses.length}门）`;
    blocks.push({
      id: `conflict:${day}:${current.period}:${end}:${current.key}`,
      name: title,
      teacher: "",
      room: "点击查看冲突详情",
      room_code: `${conflictCourses.length}门冲突`,
      building: "冲突提示",
      weekday: day,
      period: current.period,
      djs: end - current.period + 1,
      weeks: [weekNumber],
      weeks_text: String(weekNumber),
      credit: "",
      class_name: "冲突课程",
      is_conflict: true,
      conflict_courses: conflictCourses.map((course) => ({
        id: course.id,
        source_id: course.source_id || course.id,
        name: course.name,
        teacher: course.teacher,
        room: course.room,
        room_code: course.room_code,
        building: course.building,
        weekday: course.weekday,
        period: course.period,
        djs: course.djs,
        weeks: Array.isArray(course.weeks) ? [...course.weeks] : [],
        weeks_text: course.weeks_text,
        credit: course.credit,
        class_name: course.class_name,
        semester: course.semester || fallbackSemester || "",
        is_custom: !!course.is_custom
      }))
    });
    i = j;
  }
  return blocks;
};
const buildWeekCoursesWithColors = (weekNumber, options) => {
  const { scheduleData, fallbackSemester = "" } = options || {};
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  const byDay = {};
  const nodes = [];
  const nameBuckets = /* @__PURE__ */ new Map();
  for (let day = 1; day <= 7; day += 1) {
    const dailyCourses = source.filter((course) => course.weekday === day && course.weeks.includes(weekNumber)).sort((a, b) => a.period - b.period);
    const merged = mergeDailyCourses(dailyCourses).map((course, index) => {
      const span = Math.max(1, Number(course.djs) || 1);
      const start = Number(course.period);
      const end = Math.min(MAX_PERIOD, start + span - 1);
      return {
        ...course,
        _day: day,
        _start: start,
        _end: end,
        _uid: `${day}-${start}-${end}-${course.name}-${index}`
      };
    });
    const conflicts = buildConflictBlocks(day, merged, weekNumber, fallbackSemester);
    byDay[day] = [...merged, ...conflicts];
    merged.forEach((node) => {
      nodes.push(node);
      const nameKey = String(node.name || "");
      if (!nameBuckets.has(nameKey)) {
        nameBuckets.set(nameKey, []);
      }
      nameBuckets.get(nameKey).push(node);
    });
  }
  if (!nodes.length) return byDay;
  const nameNeighbors = new Map([...nameBuckets.keys()].map((name) => [name, /* @__PURE__ */ new Set()]));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const nameA = String(a.name || "");
      const nameB = String(b.name || "");
      if (nameA !== nameB && areAdjacentCourses(a, b)) {
        nameNeighbors.get(nameA)?.add(nameB);
        nameNeighbors.get(nameB)?.add(nameA);
      }
    }
  }
  const orderedNames = [...nameBuckets.keys()].sort((a, b) => {
    const degreeDiff = (nameNeighbors.get(b)?.size || 0) - (nameNeighbors.get(a)?.size || 0);
    if (degreeDiff !== 0) return degreeDiff;
    return hashText(a) - hashText(b);
  });
  const colorByName = /* @__PURE__ */ new Map();
  const globallyUsedColors = /* @__PURE__ */ new Set();
  const allCandidates = Array.from({ length: courseThemes.length }, (_, i) => i);
  orderedNames.forEach((name) => {
    const neighborColorSet = /* @__PURE__ */ new Set();
    nameNeighbors.get(name)?.forEach((neighborName) => {
      if (!colorByName.has(neighborName)) return;
      const neighborColor = colorByName.get(neighborName);
      neighborColorSet.add(neighborColor);
    });
    const neighborColors = [...neighborColorSet];
    const globalColors = [...globallyUsedColors];
    const seed = hashText(name) % courseThemes.length;
    const uniqueCandidates = allCandidates.filter(
      (candidate) => !globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    );
    const reusableCandidates = allCandidates.filter(
      (candidate) => globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    );
    const noNeighborConflictCandidates = allCandidates.filter(
      (candidate) => !neighborColorSet.has(candidate)
    );
    let chosen = pickBestThemeCandidate(uniqueCandidates, seed, neighborColors, globalColors);
    if (chosen === null) {
      chosen = pickBestThemeCandidate(reusableCandidates, seed, neighborColors, globalColors);
    }
    if (chosen === null) {
      chosen = pickBestThemeCandidate(noNeighborConflictCandidates, seed, neighborColors, globalColors);
    }
    if (chosen === null) {
      chosen = pickBestThemeCandidate(allCandidates, seed, neighborColors, globalColors);
    }
    if (chosen === null) chosen = seed;
    colorByName.set(name, chosen);
    globallyUsedColors.add(chosen);
  });
  for (let day = 1; day <= 7; day += 1) {
    byDay[day] = (byDay[day] || []).map((course) => ({
      ...course,
      colorIndex: course.is_conflict ? 0 : colorByName.get(String(course.name || "")) ?? 0
    }));
  }
  return byDay;
};
const getCourseStyle = (course, cardStyle) => {
  if (!course) return {};
  const start = Number(course.period) || 1;
  const span = Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course.djs) || 1));
  const isTraditionalCard = cardStyle === "traditional";
  const isClassCard = cardStyle === "class";
  const modernRadius = "14px";
  const traditionalRadius = "12px";
  const classRadius = "12px";
  if (course.is_conflict) {
    return {
      "--course-bg": isTraditionalCard ? "#fef2f2" : isClassCard ? "rgba(254, 242, 242, 0.96)" : "repeating-linear-gradient(135deg, #fff1f2 0, #fff1f2 8px, #ffe4e6 8px, #ffe4e6 16px)",
      "--course-text": isTraditionalCard ? "#b91c1c" : "#b91c1c",
      "--course-border": isTraditionalCard ? "#fecaca" : "#dc2626",
      "--course-shadow": isTraditionalCard ? "0 2px 8px rgba(220, 38, 38, 0.08)" : isClassCard ? "0 6px 14px rgba(220, 38, 38, 0.16)" : "0 8px 18px rgba(220, 38, 38, 0.2)",
      "--course-span": String(span),
      "--course-radius": isTraditionalCard ? traditionalRadius : isClassCard ? classRadius : modernRadius,
      "--course-border-width": isClassCard ? "1px" : "2px",
      gridRow: `${start} / span ${span}`,
      gridColumn: "1",
      zIndex: 4
    };
  }
  let index = 0;
  if (course.colorIndex !== void 0) {
    index = course.colorIndex;
  } else {
    let hash = 0;
    for (let i = 0; i < course.name.length; i++) {
      hash = course.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    index = Math.abs(hash) % courseThemes.length;
  }
  const theme = courseThemes[index];
  const isCustom = !!course.is_custom;
  const userColor = isCustom ? normalizeOptionalCourseColor(course.color) : null;
  const hasUserColor = !!(userColor && userColor.length);
  const borderColor = hasUserColor ? userColor : isCustom ? "#111111" : theme.border || "#cbd5e1";
  const traditionalBackground = hasUserColor ? mixHexWithWhite(userColor, 0.22) : isCustom ? "#111111" : theme.bg;
  const traditionalText = hasUserColor ? contrastTextForHex(traditionalBackground) : isCustom ? "#ffffff" : theme.text;
  const modernText = hasUserColor ? userColor : theme.text;
  const modernBackground = "rgba(255, 255, 255, 0.92)";
  const classBackground = "rgba(255, 255, 255, 0.94)";
  const normalShadow = isCustom ? "0 7px 16px rgba(15, 23, 42, 0.24)" : "0 6px 14px rgba(71, 85, 105, 0.16)";
  const traditionalShadow = "0 2px 8px rgba(0, 0, 0, 0.04)";
  const classShadow = isCustom ? "0 6px 14px rgba(15, 23, 42, 0.2)" : "0 4px 10px rgba(71, 85, 105, 0.14)";
  return {
    "--course-bg": isTraditionalCard ? traditionalBackground : isClassCard ? classBackground : modernBackground,
    "--course-text": isTraditionalCard ? traditionalText : modernText,
    "--course-border": borderColor,
    "--course-shadow": isTraditionalCard ? traditionalShadow : isClassCard ? classShadow : normalShadow,
    "--course-span": String(span),
    "--course-radius": isTraditionalCard ? traditionalRadius : isClassCard ? classRadius : modernRadius,
    "--course-border-width": isClassCard ? "1px" : isCustom ? "2px" : "1px",
    gridRow: `${start} / span ${span}`,
    gridColumn: "1",
    zIndex: 1
  };
};
const mergeScheduleSources = (state) => {
  const merged = [...state.remoteScheduleData.value, ...state.customScheduleData.value];
  state.scheduleData.value = processScheduleData(merged);
};
const useScheduleData = (props, emit, options) => {
  const { semester } = options;
  const loading = ref(false);
  const scheduleData = ref([]);
  const remoteScheduleData = ref([]);
  const customScheduleData = ref([]);
  const errorMsg = ref("");
  const offline = ref(false);
  const offlineHint = ref("");
  const syncTime = ref("");
  const initialFetchDone = ref(false);
  const semesterOptions = ref([]);
  const semesterLoading = ref(false);
  const semesterError = ref("");
  const allCustomCourses = ref([]);
  const loadingManageCourses = ref(false);
  const manageCoursesError = ref("");
  const manageExpandedSemesters = ref({});
  const API_BASE = "/api";
  const sortSemesterKeys = (a, b) => {
    const currentSemester = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    if (a === currentSemester && b !== currentSemester) return -1;
    if (b === currentSemester && a !== currentSemester) return 1;
    return String(b).localeCompare(String(a), "zh-CN", { numeric: true });
  };
  const getFallbackSemester = () => String(semester.semester.value || semester.semesterDraft.value || "").trim();
  const loadCustomCourses = async (targetSemester = "") => {
    const sid = String(props.studentId || "").trim();
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || "").trim();
    if (!sid || !sem) {
      customScheduleData.value = [];
      mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData });
      return false;
    }
    try {
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list`, {
        student_id: sid,
        semester: sem
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || "加载自定义课程失败");
      }
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      customScheduleData.value = list.map((item) => normalizeCustomCourse(item, sem)).filter(Boolean).filter((course) => course.name && course.weekday >= 1 && course.weekday <= 7 && course.period >= 1 && course.period <= 11);
      mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData });
      persistScheduleRenderSnapshot("custom-load");
      return true;
    } catch (e) {
      console.warn("加载自定义课程失败", e);
      customScheduleData.value = [];
      mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData });
      return false;
    }
  };
  const managedCourseGroups = computed(() => {
    const groups = /* @__PURE__ */ new Map();
    for (const rawCourse of allCustomCourses.value || []) {
      const course = normalizeCustomCourse(rawCourse, getFallbackSemester());
      if (!course?.id) continue;
      const sem = String(course.semester || "未分配学期").trim() || "未分配学期";
      if (!groups.has(sem)) {
        groups.set(sem, []);
      }
      groups.get(sem).push(course);
    }
    return Array.from(groups.entries()).sort((a, b) => sortSemesterKeys(a[0], b[0])).map(([semesterKey, courses]) => ({
      semester: semesterKey,
      courses: courses.sort((a, b) => {
        if (a.weekday !== b.weekday) return a.weekday - b.weekday;
        if (a.period !== b.period) return a.period - b.period;
        return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
      })
    }));
  });
  const syncManageExpandedSemesters = () => {
    const next = {};
    const currentSemester = getFallbackSemester();
    for (const group of managedCourseGroups.value) {
      next[group.semester] = manageExpandedSemesters.value[group.semester] ?? group.semester === currentSemester;
    }
    manageExpandedSemesters.value = next;
  };
  const loadAllCustomCourses = async () => {
    const sid = String(props.studentId || "").trim();
    if (!sid) {
      allCustomCourses.value = [];
      manageCoursesError.value = "请先登录后再管理课程";
      return false;
    }
    loadingManageCourses.value = true;
    manageCoursesError.value = "";
    try {
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list_all`, {
        student_id: sid
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || "加载课程列表失败");
      }
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      allCustomCourses.value = list.map((item) => normalizeCustomCourse(item, getFallbackSemester())).filter(Boolean).filter((course) => course.name && course.weekday >= 1 && course.weekday <= 7 && course.period >= 1 && course.period <= 11);
      syncManageExpandedSemesters();
      return true;
    } catch (e) {
      console.warn("加载全部自定义课程失败", e);
      allCustomCourses.value = [];
      manageCoursesError.value = String(e?.response?.data?.error || e?.message || "加载课程列表失败");
      return false;
    } finally {
      loadingManageCourses.value = false;
    }
  };
  const buildScheduleRenderSnapshotPayload = () => {
    const sid = resolveDisplayStudentId(props.studentId);
    const sem = getFallbackSemester();
    if (!sid || !sem) return null;
    return {
      student_id: sid,
      semester: sem,
      meta: {
        semester: sem,
        start_date: String(semester.startDateStr.value || "").trim(),
        current_week: Number(semester.currentWeek.value || 1),
        total_weeks: Number(semester.totalWeeks.value || 25),
        vacation_notice: String(semester.vacationNotice.value || "").trim()
      },
      selected_week: Number(semester.selectedWeek.value || semester.currentWeek.value || 1),
      sync_time: String(syncTime.value || "").trim(),
      offline: !!offline.value,
      remote_schedule_data: Array.isArray(remoteScheduleData.value) ? remoteScheduleData.value : [],
      custom_schedule_data: Array.isArray(customScheduleData.value) ? customScheduleData.value : [],
      merged_schedule_data: Array.isArray(scheduleData.value) ? scheduleData.value : [],
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  };
  const persistScheduleRenderSnapshot = (reason = "unknown") => {
    const payload = buildScheduleRenderSnapshotPayload();
    if (!payload) return false;
    const courseCount = Array.isArray(payload.merged_schedule_data) ? payload.merged_schedule_data.length : 0;
    const hasRenderableData = courseCount > 0 || Array.isArray(payload.remote_schedule_data) && payload.remote_schedule_data.length > 0 || Array.isArray(payload.custom_schedule_data) && payload.custom_schedule_data.length > 0;
    if (!hasRenderableData) return false;
    const saved = writeScheduleRenderSnapshot(payload.student_id, payload);
    if (!saved) return false;
    pushDebugLog(
      "Schedule",
      `课表首屏快照已写入 reason=${reason} semester=${saved.semester} courses=${courseCount}`,
      "debug"
    );
    return true;
  };
  const applyScheduleRenderSnapshot = (snapshot, snapshotOptions = {}) => {
    const saved = snapshot && typeof snapshot === "object" ? snapshot : null;
    if (!saved) return false;
    const resolvedSemester = String(saved.semester || saved.meta?.semester || "").trim();
    if (!resolvedSemester) return false;
    semester.semester.value = resolvedSemester;
    semester.semesterDraft.value = resolvedSemester;
    remoteScheduleData.value = Array.isArray(saved.remote_schedule_data) ? saved.remote_schedule_data : [];
    customScheduleData.value = Array.isArray(saved.custom_schedule_data) ? saved.custom_schedule_data : [];
    scheduleData.value = Array.isArray(saved.merged_schedule_data) && saved.merged_schedule_data.length ? saved.merged_schedule_data : processScheduleData([...remoteScheduleData.value, ...customScheduleData.value]);
    semester.applyMeta(saved.meta, resolvedSemester);
    const nextWeek = Number(saved.selected_week || semester.currentWeek.value || 1);
    const safeWeek = Math.min(Math.max(nextWeek, 1), Math.max(Number(semester.totalWeeks.value || 1), 1));
    semester.selectedWeek.value = safeWeek;
    syncTime.value = String(saved.sync_time || "").trim();
    const markOffline = snapshotOptions?.markOffline === true;
    offline.value = markOffline;
    offlineHint.value = markOffline ? String(
      snapshotOptions?.offlineHint || "当前为缓存课表，登录恢复后自动刷新。"
    ).trim() : "";
    errorMsg.value = scheduleData.value.length ? "" : "暂无可用课表";
    initialFetchDone.value = true;
    if (snapshotOptions?.markBoot !== false) {
      markBootMetric("schedule_snapshot_applied", {
        semester: resolvedSemester,
        courses: scheduleData.value.length,
        updated_at: saved.updated_at || ""
      });
      requestAnimationFrame(() => {
        markBootMetric("schedule_first_paint", {
          semester: resolvedSemester,
          courses: scheduleData.value.length
        });
      });
    }
    return true;
  };
  const applySchedulePayload = (payload, requestedSemester = "", payloadOptions = {}) => {
    if (!payload?.success) return false;
    const rawData = Array.isArray(payload?.data) ? payload.data : [];
    const silentCachePaint = payloadOptions?.silentCachePaint === true;
    const forceOfflineBanner = payloadOptions?.forceOfflineBanner === true;
    const loggedIn = !!String(props.studentId || "").trim();
    if (forceOfflineBanner || payload.offline && !silentCachePaint && !loggedIn) {
      offline.value = true;
      offlineHint.value = String(
        payloadOptions?.offlineHint || (loggedIn ? "当前显示为缓存课表，教务暂不可用。" : "当前显示为离线数据，登录恢复后自动刷新。")
      ).trim();
    } else {
      offline.value = false;
      offlineHint.value = "";
    }
    syncTime.value = payload.sync_time || "";
    remoteScheduleData.value = processScheduleData(rawData);
    mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData });
    semester.applyMeta(payload.meta, requestedSemester);
    errorMsg.value = rawData.length === 0 ? "暂无可用课表" : "";
    return true;
  };
  const applyCachedScheduleImmediately = (targetSemester = "", cacheOptions = {}) => {
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || "").trim();
    const sid = resolveDisplayStudentId(props.studentId);
    if (!sid || !sem) return false;
    const snapshot = getCachedScheduleSnapshot(sid, sem);
    if (!snapshot?.data?.success) return false;
    const silent = cacheOptions?.silentCachePaint !== false && String(props.studentId || sid || "").trim();
    const applied = applySchedulePayload(snapshot.data, sem, {
      silentCachePaint: !!silent
    });
    if (applied && silent) {
      offline.value = false;
      offlineHint.value = "";
    }
    if (applied && !syncTime.value && snapshot.timestamp) {
      syncTime.value = new Date(snapshot.timestamp).toISOString();
    }
    return applied;
  };
  let onlineRevalidateToken = 0;
  const revalidateScheduleOnline = async (targetSemester = "") => {
    const sid = String(props.studentId || "").trim();
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || "").trim();
    if (!sid) return false;
    const token = ++onlineRevalidateToken;
    const cacheKey = sem ? `schedule:${sid}:${sem}` : `schedule:${sid}`;
    try {
      const { data } = await fetchWithCache(
        cacheKey,
        async () => {
          const res = await axiosInstance.post(`${API_BASE}/v2/schedule/query`, {
            student_id: sid,
            semester: sem || void 0
          });
          return res.data;
        },
        void 0,
        { forceRemote: true, priority: "background", staleWhileRevalidate: false }
      );
      if (token !== onlineRevalidateToken) return false;
      if (data?.success && !data?.offline) {
        applySchedulePayload(data, sem, { silentCachePaint: false });
        offline.value = false;
        offlineHint.value = "";
        persistScheduleRenderSnapshot("online-revalidate");
        return true;
      }
      if (data?.need_login && (remoteScheduleData.value.length || customScheduleData.value.length)) {
        offline.value = true;
        offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
      }
      return false;
    } catch {
      if (token !== onlineRevalidateToken) return false;
      return false;
    }
  };
  const applyStoredScheduleRenderSnapshot = (targetSemester = "", snapshotOptions = {}) => {
    const sid = resolveDisplayStudentId(props.studentId);
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || "").trim();
    if (!sid) return false;
    const snapshot = readScheduleRenderSnapshot(sid, sem || "");
    if (!snapshot) return false;
    return applyScheduleRenderSnapshot(snapshot, snapshotOptions);
  };
  const initialRenderSnapshotApplied = applyStoredScheduleRenderSnapshot("", {
    markBoot: true
  });
  const fetchSchedule = async (targetSemester = "", fetchOptions = {}) => {
    loading.value = true;
    semesterError.value = "";
    const persistLock = fetchOptions?.persistLock === true;
    const lockReason = String(fetchOptions?.lockReason || "schedule-fetch").trim() || "schedule-fetch";
    const requestedSemester = String(targetSemester || semester.semester.value || semester.semesterDraft.value || "").trim();
    const previousSemester = String(semester.semester.value || "").trim();
    errorMsg.value = "";
    if (String(props.studentId || "").trim() && fetchOptions?.preserveOfflineBanner !== true) {
      offline.value = false;
      offlineHint.value = "";
    }
    try {
      if (requestedSemester && requestedSemester !== previousSemester) {
        customScheduleData.value = [];
        remoteScheduleData.value = [];
        mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData });
      }
      if (requestedSemester) {
        semester.semester.value = requestedSemester;
      }
      if (!props.studentId) {
        const fallbackSemester = String(requestedSemester || semester.semester.value || semester.semesterDraft.value || readStoredSemester() || deriveSemesterByDate()).trim();
        const hasRenderSnapshot = fallbackSemester ? applyStoredScheduleRenderSnapshot(fallbackSemester, { markBoot: false }) : false;
        const hasInstantCache = hasRenderSnapshot || (fallbackSemester ? applyCachedScheduleImmediately(fallbackSemester) : false);
        if (hasInstantCache) {
          initialFetchDone.value = true;
          errorMsg.value = "";
        } else if (localStorage.getItem("hbu_manual_logout") === "true") {
          scheduleData.value = [];
          remoteScheduleData.value = [];
          customScheduleData.value = [];
          offline.value = false;
          offlineHint.value = "";
          initialFetchDone.value = true;
          errorMsg.value = "请先登录后查看课表";
        } else {
          errorMsg.value = "";
        }
        return false;
      }
      const cacheKey = requestedSemester ? `schedule:${props.studentId}:${requestedSemester}` : `schedule:${props.studentId}`;
      const { data, fromCache, stale } = await fetchWithCache(cacheKey, async () => {
        const res = await axiosInstance.post(`${API_BASE}/v2/schedule/query`, {
          student_id: props.studentId,
          semester: requestedSemester || void 0
        });
        return res.data;
      }, void 0, DEFAULT_SWR_OPTIONS);
      if (data?.success) {
        const treatAsSilentCache = !!String(props.studentId || "").trim() && (!!fromCache || !!data?.offline || !!stale);
        applySchedulePayload(data, requestedSemester, {
          silentCachePaint: treatAsSilentCache
        });
        if (treatAsSilentCache && data?.offline) {
          void revalidateScheduleOnline(requestedSemester || semester.semester.value);
        }
        await loadCustomCourses(requestedSemester || semester.semester.value);
        if (!remoteScheduleData.value.length && customScheduleData.value.length > 0) {
          errorMsg.value = "";
        }
        persistScheduleRenderSnapshot("fetch-success");
        if (props.studentId) {
          afterScheduleRefresh(props.studentId, data, { selectedWeek: semester.selectedWeek.value || semester.currentWeek.value || 1 }).catch(() => {
          });
        }
        if (!hasBootMetric("schedule_first_paint")) {
          requestAnimationFrame(() => {
            markBootMetric("schedule_first_paint", {
              semester: String(requestedSemester || semester.semester.value || "").trim(),
              courses: scheduleData.value.length,
              source: "remote-refresh"
            });
          });
        }
        if (requestedSemester && persistLock) {
          writeScheduleLock(props.studentId, requestedSemester, lockReason);
        }
        return true;
      } else {
        if (data?.need_login) {
          const method = String(localStorage.getItem("hbu_login_method") || "").trim();
          const isTemp = localStorage.getItem("hbu_login_temp") === "1" || method.endsWith("_temp");
          if (isTemp) {
            emit("logout");
            return false;
          }
          if (remoteScheduleData.value.length || customScheduleData.value.length) {
            offline.value = true;
            offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
            errorMsg.value = "";
            return false;
          }
          const hasRenderSnapshot = requestedSemester ? applyStoredScheduleRenderSnapshot(requestedSemester, { markBoot: false }) : false;
          const hasCached = hasRenderSnapshot || (requestedSemester ? applyCachedScheduleImmediately(requestedSemester) : false);
          if (hasCached) {
            offline.value = true;
            offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
            errorMsg.value = "";
            return false;
          }
          errorMsg.value = data?.error || "会话已过期，请重新登录";
          return false;
        }
        if (!(remoteScheduleData.value.length || customScheduleData.value.length)) {
          remoteScheduleData.value = [];
          mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData });
          offline.value = false;
          semester.vacationNotice.value = "";
          semester.startDateStr.value = "";
          semester.currentWeek.value = 1;
          semester.selectedWeek.value = 1;
          semester.totalWeeks.value = 25;
        } else {
          offline.value = true;
          offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
        }
        await loadCustomCourses(requestedSemester || semester.semester.value);
        const message = String(data?.error || "获取课表失败");
        errorMsg.value = remoteScheduleData.value.length || customScheduleData.value.length ? "" : /无课表|暂无/.test(message) ? "暂无可用课表" : message;
        if (customScheduleData.value.length > 0) {
          errorMsg.value = "";
        }
        return false;
      }
    } catch (e) {
      console.error("获取课表异常", e);
      if (!(remoteScheduleData.value.length || customScheduleData.value.length)) {
        remoteScheduleData.value = [];
        mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData });
        offline.value = false;
        semester.vacationNotice.value = "";
        semester.startDateStr.value = "";
        semester.currentWeek.value = 1;
        semester.selectedWeek.value = 1;
        semester.totalWeeks.value = 25;
      } else {
        offline.value = true;
        offlineHint.value = "当前为缓存课表，连接恢复后自动刷新。";
      }
      await loadCustomCourses(requestedSemester || semester.semester.value);
      const message = String(e?.message || "获取课表失败");
      errorMsg.value = remoteScheduleData.value.length || customScheduleData.value.length ? "" : /无课表|暂无/.test(message) ? "暂无可用课表" : message;
      if (customScheduleData.value.length > 0) {
        errorMsg.value = "";
      }
      return false;
    } finally {
      loading.value = false;
      initialFetchDone.value = true;
      if (!hasBootMetric("schedule_snapshot_applied")) {
        markBootMetric("schedule_snapshot_applied", {
          semester: String(requestedSemester || semester.semester.value || "").trim(),
          courses: scheduleData.value.length,
          applied: false,
          reason: "snapshot-missing"
        });
      }
      markBootMetric("schedule_remote_refresh_finished", {
        semester: String(requestedSemester || semester.semester.value || "").trim(),
        courses: scheduleData.value.length,
        offline: !!offline.value
      });
    }
  };
  const fetchSemesterOptions = async () => {
    semesterLoading.value = true;
    semesterError.value = "";
    try {
      const { data } = await fetchWithCache("semesters", async () => {
        const res = await axiosInstance.get(`${API_BASE}/v2/semesters`);
        return res.data;
      }, EXTRA_LONG_TTL, DEFAULT_SWR_OPTIONS);
      if (!data?.success) {
        throw new Error(data?.error || "获取学期列表失败");
      }
      const list = normalizeSemesterList(data?.semesters || []);
      semesterOptions.value = list;
      const resolved = resolveCurrentSemester(list, semester.semester.value || data?.current);
      if (resolved) {
        semester.semesterDraft.value = resolved;
        if (!semester.semester.value) semester.semester.value = resolved;
      }
    } catch (e) {
      semesterError.value = e?.message || "获取学期列表失败";
    } finally {
      semesterLoading.value = false;
    }
  };
  const applySemesterQuery = async () => {
    const selected = String(semester.semesterDraft.value || "").trim();
    if (!selected) {
      semesterError.value = "请选择学期";
      return;
    }
    semester.currentWeek.value = 1;
    semester.selectedWeek.value = 1;
    semester.totalWeeks.value = 25;
    semester.startDateStr.value = "";
    semester.vacationNotice.value = "";
    await fetchSchedule(selected, { persistLock: true, lockReason: "manual-select" });
  };
  const onSemesterChange = async () => {
    const selected = String(semester.semesterDraft.value || "").trim();
    if (!selected || selected === semester.semester.value) return;
    await applySemesterQuery();
  };
  const handleSessionLogout = () => {
    scheduleData.value = [];
    remoteScheduleData.value = [];
    customScheduleData.value = [];
    offline.value = false;
    offlineHint.value = "";
    errorMsg.value = "请先登录后查看课表";
    initialFetchDone.value = true;
  };
  const handleSessionOnline = () => {
    const sid = String(props.studentId || "").trim();
    if (!sid) return;
    offline.value = false;
    offlineHint.value = "";
    const targetSemester = String(semester.semester.value || semester.semesterDraft.value || readStoredSemester() || deriveSemesterByDate()).trim();
    void fetchSchedule(targetSemester);
  };
  watch(semester.selectedWeek, (next, prev) => {
    if (next === prev) return;
    if (!initialFetchDone.value) return;
    persistScheduleRenderSnapshot("selected-week");
  });
  return {
    loading,
    scheduleData,
    remoteScheduleData,
    customScheduleData,
    errorMsg,
    offline,
    offlineHint,
    syncTime,
    initialFetchDone,
    semesterOptions,
    semesterLoading,
    semesterError,
    allCustomCourses,
    loadingManageCourses,
    manageCoursesError,
    manageExpandedSemesters,
    managedCourseGroups,
    loadCustomCourses,
    loadAllCustomCourses,
    syncManageExpandedSemesters,
    persistScheduleRenderSnapshot,
    applyScheduleRenderSnapshot,
    applySchedulePayload,
    applyCachedScheduleImmediately,
    revalidateScheduleOnline,
    applyStoredScheduleRenderSnapshot,
    initialRenderSnapshotApplied,
    fetchSchedule,
    fetchSemesterOptions,
    applySemesterQuery,
    onSemesterChange,
    handleSessionLogout,
    handleSessionOnline,
    mergeScheduleSources: () => mergeScheduleSources({ remoteScheduleData, customScheduleData, scheduleData })
  };
};
const useScheduleGrid = (options) => {
  const { data, semester, menu } = options;
  const widgetHighlightPeriod = ref(0);
  const widgetHighlightDay = ref(0);
  const weekCoursesWithColor = computed(() => {
    const fallbackSemester = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    return buildWeekCoursesWithColors(Number(semester.selectedWeek.value || 1), {
      scheduleData: data.scheduleData.value,
      fallbackSemester
    });
  });
  const getCoursesForDay = (dayIndex) => {
    const day = Number(dayIndex);
    return weekCoursesWithColor.value[day] || [];
  };
  const isWidgetHighlighted = (course, day) => {
    if (!widgetHighlightPeriod.value || !widgetHighlightDay.value) return false;
    if (Number(day) !== widgetHighlightDay.value) return false;
    const start = Number(course?.period) || 1;
    const span = Math.max(1, Number(course?.djs) || 1);
    const end = start + span - 1;
    return widgetHighlightPeriod.value >= start && widgetHighlightPeriod.value <= end;
  };
  const setWidgetHighlight = (day, period) => {
    widgetHighlightDay.value = day >= 1 && day <= 7 ? day : 0;
    widgetHighlightPeriod.value = period >= 1 && period <= 14 ? period : 0;
  };
  const clearWidgetHighlight = () => {
    widgetHighlightPeriod.value = 0;
    widgetHighlightDay.value = 0;
  };
  const getCourseCardStyle = (course) => {
    return getCourseStyle(course, menu.scheduleCourseCardStyle.value);
  };
  return {
    weekCoursesWithColor,
    widgetHighlightPeriod,
    widgetHighlightDay,
    getCoursesForDay,
    isWidgetHighlighted,
    setWidgetHighlight,
    clearWidgetHighlight,
    getCourseCardStyle
  };
};
const formatCooldownText = (value) => {
  const ms = Number(value || 0);
  if (ms <= 0) return "可立即同步";
  const sec = Math.ceil(ms / 1e3);
  if (sec < 60) return `${sec} 秒后可再次同步`;
  const min = Math.floor(sec / 60);
  const remain = sec % 60;
  return remain > 0 ? `${min}分${remain}秒后可再次同步` : `${min} 分钟后可再次同步`;
};
const buildLocationText = (course) => {
  const building = String(course?.building || "").trim();
  const room = String(course?.room_code || course?.room || "").trim();
  return [building, room].filter(Boolean).join(" ") || "未填写";
};
const buildCourseTimeText = (course) => {
  const weekday = Number(course?.weekday || 0);
  const period = Number(course?.period || 0);
  if (!weekday || !period) return "未填写";
  const endPeriod = getCourseEndPeriod(course);
  return `周${weekday} 第${period}-${endPeriod}节`;
};
const buildSingleCourseDetailText = (course) => {
  const lines = [
    `课程名称：${String(course?.name || "").trim() || "未填写"}`,
    `课程类型：${course?.is_custom ? "自定义课程" : "教务课程"}`,
    `教师：${String(course?.teacher || "").trim() || "未填写"}`,
    `地点：${buildLocationText(course)}`,
    `时间：${buildCourseTimeText(course)}`,
    `周次：${String(course?.weeks_text || "").trim() ? `${String(course?.weeks_text || "").trim()}周` : "未填写"}`,
    `学分：${String(course?.credit || "").trim() || "无"}`,
    `教学班：${String(course?.class_name || "").trim() || "无"}`
  ];
  if (course?.semester) {
    lines.push(`学期：${String(course.semester).trim()}`);
  }
  return lines.join("\n");
};
const buildConflictDetailText = (course) => {
  const conflicts = Array.isArray(course?.conflict_courses) ? course.conflict_courses : [];
  if (!conflicts.length) {
    return `课程名称：${String(course?.name || "").trim() || "未填写"}
冲突详情：无`;
  }
  const lines = ["冲突课程详情："];
  conflicts.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${String(item?.name || "").trim() || "未命名课程"}`);
    lines.push(`   类型：${item?.is_custom ? "自定义课程" : "教务课程"}`);
    lines.push(`   教师：${String(item?.teacher || "").trim() || "未填写"}`);
    lines.push(`   地点：${buildLocationText(item)}`);
    lines.push(`   时间：${buildCourseTimeText(item)}`);
    lines.push(`   周次：${String(item?.weeks_text || "").trim() ? `${String(item.weeks_text).trim()}周` : "未填写"}`);
  });
  return lines.join("\n");
};
const buildCourseDetailText = (course) => {
  if (!course) return "";
  if (course.is_conflict) {
    return buildConflictDetailText(course);
  }
  return buildSingleCourseDetailText(course);
};
const copyTextWithFallback = async (text) => {
  const content = String(text || "").trim();
  if (!content) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
};
const useScheduleDetail = (options) => {
  const { data, semester } = options;
  const showDetail = ref(false);
  const selectedCourse = ref(null);
  const detailActionError = ref("");
  const openDetail = (course) => {
    detailActionError.value = "";
    selectedCourse.value = course;
    showDetail.value = true;
  };
  const copySelectedCourseDetail = async () => {
    const course = selectedCourse.value;
    if (!course) return;
    const copied = await copyTextWithFallback(buildCourseDetailText(course));
    if (copied) {
      showToast(course.is_conflict ? "冲突课程详情已复制" : "课程详情已复制", "success");
      return;
    }
    showToast("复制失败，请稍后重试", "error");
  };
  const findCustomCourseRecord = (courseId, targetSemester = "") => {
    if (!courseId) return null;
    const id = String(courseId).trim();
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || "").trim();
    const fallbackSemester = sem;
    const candidates = [
      ...Array.isArray(data.customScheduleData.value) ? data.customScheduleData.value : [],
      ...Array.isArray(data.allCustomCourses.value) ? data.allCustomCourses.value : []
    ];
    const matches = candidates.map((item) => normalizeCustomCourse(item, fallbackSemester)).filter(Boolean).filter((course) => {
      if (!course) return false;
      const courseIdValue = String(course.source_id || course.id || "").trim();
      if (!courseIdValue) return false;
      if (courseIdValue !== id) return false;
      if (sem && course.semester && course.semester !== sem) return false;
      return true;
    });
    return matches[0] || null;
  };
  const syncSelectedCustomCourse = (courseId, targetSemester = "") => {
    const nextCourse = findCustomCourseRecord(courseId, targetSemester);
    if (!nextCourse) {
      if (showDetail.value) {
        showDetail.value = false;
      }
      selectedCourse.value = null;
      return;
    }
    selectedCourse.value = nextCourse;
  };
  const openConflictCourseDetail = (course) => {
    const nextCourse = course?.is_custom ? findCustomCourseRecord(course.source_id || course.id, course.semester) || normalizeCustomCourse(course, semester.semester.value || "") : {
      ...course,
      is_conflict: false
    };
    if (!nextCourse) return;
    showDetail.value = false;
    nextTick(() => {
      openDetail({
        ...nextCourse,
        is_conflict: false
      });
    });
  };
  return {
    showDetail,
    selectedCourse,
    detailActionError,
    openDetail,
    copySelectedCourseDetail,
    findCustomCourseRecord,
    syncSelectedCustomCourse,
    openConflictCourseDetail
  };
};
const useScheduleEditor = (options) => {
  const { props, data, semester, detail, menu, confirmDialog } = options;
  const { askConfirm } = confirmDialog;
  const showAddCourse = ref(false);
  const courseDialogMode = ref("add");
  const editingCourseId = ref("");
  const editingCourseSemester = ref("");
  const showWeekPicker = ref(false);
  const addingCourse = ref(false);
  const addCourseError = ref("");
  const showManageCourses = ref(false);
  const returnToManageAfterCourseSubmit = ref(false);
  const returnToDetailAfterCourseSubmit = ref(false);
  const addCourseForm = ref({
    name: "",
    teacher: "",
    room: "",
    weekday: 1,
    period: 1,
    djs: 1,
    weeks: [],
    color: DEFAULT_COURSE_COLOR
  });
  const API_BASE = "/api";
  const courseDialogSemester = computed(() => {
    if (courseDialogMode.value === "edit") {
      return String(editingCourseSemester.value || semester.semester.value || semester.semesterDraft.value || "").trim();
    }
    return String(semester.semester.value || semester.semesterDraft.value || "").trim();
  });
  const courseSpanOptions = computed(() => {
    const start = Number(addCourseForm.value.period) || 1;
    const maxSpan = Math.max(1, 12 - start);
    return Array.from({ length: maxSpan }, (_, i) => i + 1);
  });
  const addWeeksCountText = computed(() => {
    const weeks = Array.isArray(addCourseForm.value.weeks) ? addCourseForm.value.weeks.length : 0;
    return weeks > 0 ? `已选 ${weeks} 周` : "未选择周次";
  });
  watch(
    () => addCourseForm.value.period,
    () => {
      const start = Number(addCourseForm.value.period) || 1;
      const maxSpan = Math.max(1, 12 - start);
      if (Number(addCourseForm.value.djs) > maxSpan) {
        addCourseForm.value.djs = maxSpan;
      }
    }
  );
  const resetAddCourseForm = () => {
    addCourseForm.value = {
      name: "",
      teacher: "",
      room: "",
      weekday: 1,
      period: 1,
      djs: 1,
      weeks: semester.semesterWeekOptions.value.slice(),
      color: DEFAULT_COURSE_COLOR
    };
    addCourseError.value = "";
    showWeekPicker.value = false;
  };
  const populateCourseForm = (course) => {
    const normalized = normalizeCustomCourse(course, courseDialogSemester.value);
    if (!normalized) return;
    const colorNorm = normalizeOptionalCourseColor(normalized.color);
    addCourseForm.value = {
      name: String(normalized.name || "").trim(),
      teacher: String(normalized.teacher || "").trim(),
      room: String(normalized.room || "").trim(),
      weekday: Number(normalized.weekday || 1),
      period: Number(normalized.period || 1),
      djs: Math.max(1, Number(normalized.djs || 1)),
      weeks: normalizeWeeks(normalized.weeks),
      // #469：回显已有 color；后端未下发时保持空（本地态）
      color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm
    };
    addCourseError.value = "";
    showWeekPicker.value = false;
  };
  const hasValidLoginSession = () => {
    const sid = String(props.studentId || "").trim();
    const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || "").trim();
    return !!sid && !!sessionToken;
  };
  const promptLoginRequired = async () => {
    data.errorMsg.value = "请先登录后再管理自定义课程";
    menu.showMenu.value = false;
    await askConfirm({
      title: "需要登录",
      lines: ["请先登录后再管理自定义课程。"],
      confirmText: "我知道了",
      cancelText: "关闭",
      danger: false
    });
  };
  const openAddCourseDialog = () => {
    if (!hasValidLoginSession()) {
      void promptLoginRequired();
      return;
    }
    const sem = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    if (!sem) {
      data.semesterError.value = "请先选择学期后再添加课程";
      return;
    }
    courseDialogMode.value = "add";
    editingCourseId.value = "";
    editingCourseSemester.value = sem;
    returnToDetailAfterCourseSubmit.value = false;
    returnToManageAfterCourseSubmit.value = false;
    resetAddCourseForm();
    showAddCourse.value = true;
  };
  const closeAddCourseDialog = () => {
    const reopenManage = returnToManageAfterCourseSubmit.value;
    showAddCourse.value = false;
    showWeekPicker.value = false;
    addCourseError.value = "";
    courseDialogMode.value = "add";
    editingCourseId.value = "";
    editingCourseSemester.value = "";
    returnToDetailAfterCourseSubmit.value = false;
    returnToManageAfterCourseSubmit.value = false;
    if (reopenManage) {
      showManageCourses.value = true;
      void data.loadAllCustomCourses();
    }
  };
  const openEditCourseDialog = (course, dialogOptions = {}) => {
    const normalized = normalizeCustomCourse(course, courseDialogSemester.value);
    if (!normalized?.is_custom) return;
    courseDialogMode.value = "edit";
    editingCourseId.value = String(normalized.source_id || normalized.id || "").trim();
    editingCourseSemester.value = String(normalized.semester || semester.semester.value || semester.semesterDraft.value || "").trim();
    returnToDetailAfterCourseSubmit.value = !!dialogOptions.reopenDetail;
    returnToManageAfterCourseSubmit.value = !!dialogOptions.reopenManage || showManageCourses.value;
    populateCourseForm(normalized);
    detail.showDetail.value = false;
    showManageCourses.value = false;
    menu.showMenu.value = false;
    showAddCourse.value = false;
    nextTick(() => {
      showAddCourse.value = true;
    });
  };
  const toggleManageSemester = (semesterKey) => {
    data.manageExpandedSemesters.value = {
      ...data.manageExpandedSemesters.value,
      [semesterKey]: !data.manageExpandedSemesters.value[semesterKey]
    };
  };
  const openManageCoursesDialog = async () => {
    if (!hasValidLoginSession()) {
      await promptLoginRequired();
      return;
    }
    menu.showMenu.value = false;
    showManageCourses.value = true;
    await data.loadAllCustomCourses();
  };
  const closeManageCoursesDialog = () => {
    showManageCourses.value = false;
    data.loadingManageCourses.value = false;
    data.manageCoursesError.value = "";
  };
  const toggleAddCourseWeek = (week) => {
    const current = normalizeWeeks(addCourseForm.value.weeks);
    if (current.includes(week)) {
      addCourseForm.value.weeks = current.filter((w) => w !== week);
      return;
    }
    addCourseForm.value.weeks = normalizeWeeks([...current, week]);
  };
  const selectAllAddCourseWeeks = () => {
    addCourseForm.value.weeks = semester.semesterWeekOptions.value.slice();
  };
  const clearAddCourseWeeks = () => {
    addCourseForm.value.weeks = [];
  };
  const validateAddCourse = () => {
    const name = String(addCourseForm.value.name || "").trim();
    if (!name) return "课程名称不能为空";
    const weeks = normalizeWeeks(addCourseForm.value.weeks);
    if (!weeks.length) return "请至少选择一个周次";
    const weekday = Number(addCourseForm.value.weekday);
    if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) return "请选择上课时间";
    const period = Number(addCourseForm.value.period);
    if (!Number.isFinite(period) || period < 1 || period > 11) return "开始节次必须在 1-11 节";
    const span = Number(addCourseForm.value.djs);
    const maxSpan = Math.max(1, 12 - period);
    if (!Number.isFinite(span) || span < 1 || span > maxSpan) return `上课节数必须在 1-${maxSpan} 节`;
    return "";
  };
  const refreshCustomCourseViews = async (targetSemester = "") => {
    const normalizedSemester = String(targetSemester || "").trim();
    const currentSemester = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    if (normalizedSemester && normalizedSemester === currentSemester) {
      await data.loadCustomCourses(normalizedSemester);
    } else {
      data.mergeScheduleSources();
    }
    if (showManageCourses.value) {
      await data.loadAllCustomCourses();
    }
  };
  const submitAddCourse = async () => {
    if (!hasValidLoginSession()) {
      await promptLoginRequired();
      return;
    }
    const sem = String(courseDialogSemester.value || "").trim();
    if (!sem) {
      addCourseError.value = "学期无效，请重新选择";
      return;
    }
    const sid = String(props.studentId || "").trim();
    if (!sid) {
      addCourseError.value = "请先登录后再添加课程";
      return;
    }
    const validationError = validateAddCourse();
    if (validationError) {
      addCourseError.value = validationError;
      return;
    }
    const weeks = normalizeWeeks(addCourseForm.value.weeks);
    const colorNorm = normalizeOptionalCourseColor(addCourseForm.value.color);
    const payload = {
      student_id: sid,
      semester: sem,
      name: String(addCourseForm.value.name || "").trim(),
      teacher: String(addCourseForm.value.teacher || "").trim(),
      room: String(addCourseForm.value.room || "").trim(),
      weekday: Number(addCourseForm.value.weekday),
      period: Number(addCourseForm.value.period),
      djs: Number(addCourseForm.value.djs),
      weeks,
      // #470：可选用户色；空字符串表示未设定
      color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm
    };
    const isEditing = courseDialogMode.value === "edit";
    const confirmText = [
      `确认${isEditing ? "修改" : "添加"}到学期：${sem}`,
      `课程：${payload.name}`,
      `时间：${weekDayLabels[payload.weekday - 1]} 第${payload.period}-${payload.period + payload.djs - 1}节`,
      `周次：${formatWeeksText(weeks)}`
    ];
    const confirmed = await askConfirm({
      title: isEditing ? "确认修改课程" : "确认添加课程",
      lines: confirmText,
      confirmText: isEditing ? "确认修改" : "确认添加",
      cancelText: "取消",
      danger: false
    });
    if (!confirmed) {
      return;
    }
    addingCourse.value = true;
    addCourseError.value = "";
    try {
      const requestPayload = isEditing ? {
        ...payload,
        course_id: String(editingCourseId.value || "").trim()
      } : payload;
      const res = await axiosInstance.post(
        `${API_BASE}${isEditing ? "/v2/schedule/custom/update" : "/v2/schedule/custom/add"}`,
        requestPayload
      );
      if (!res.data?.success) {
        throw new Error(res.data?.error || `${isEditing ? "修改" : "添加"}课程失败`);
      }
      await refreshCustomCourseViews(sem);
      showAddCourse.value = false;
      showWeekPicker.value = false;
      if (isEditing && returnToManageAfterCourseSubmit.value) {
        showManageCourses.value = true;
        await data.loadAllCustomCourses();
      }
      if (isEditing && editingCourseId.value && returnToDetailAfterCourseSubmit.value) {
        detail.syncSelectedCustomCourse(editingCourseId.value, sem);
        detail.showDetail.value = !!detail.selectedCourse.value;
      }
      courseDialogMode.value = "add";
      editingCourseId.value = "";
      editingCourseSemester.value = "";
      returnToDetailAfterCourseSubmit.value = false;
      returnToManageAfterCourseSubmit.value = false;
    } catch (e) {
      addCourseError.value = String(e?.response?.data?.error || e?.message || `${isEditing ? "修改" : "添加"}课程失败`);
    } finally {
      addingCourse.value = false;
    }
  };
  const deleteCustomCourseRecord = async (course, mode = "all", recordOptions = {}) => {
    const normalized = normalizeCustomCourse(course, courseDialogSemester.value);
    if (!normalized?.is_custom) return false;
    const sem = String(normalized.semester || semester.semester.value || semester.semesterDraft.value || "").trim();
    const sid = String(props.studentId || "").trim();
    if (!sem || !sid) return false;
    const courseId = String(normalized.source_id || normalized.id || "").trim();
    if (!courseId) return false;
    const isCurrentWeek = mode === "current_week";
    const week = Number(semester.selectedWeek.value || 0);
    const message = isCurrentWeek ? `确认删除“${normalized.name}”在第${week}周的课程吗？` : `确认删除“${normalized.name}”的全部已选周次吗？`;
    const confirmed = await askConfirm({
      title: "确认删除课程",
      lines: [message],
      confirmText: "确认删除",
      cancelText: "取消",
      danger: true
    });
    if (!confirmed) return false;
    try {
      const payload = {
        student_id: sid,
        semester: sem,
        course_id: courseId,
        mode: isCurrentWeek ? "current_week" : "all",
        current_week: isCurrentWeek ? week : void 0
      };
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/delete`, payload);
      if (!res.data?.success) {
        throw new Error(res.data?.error || "删除课程失败");
      }
      await refreshCustomCourseViews(sem);
      if (recordOptions.reopenDetail && !isCurrentWeek) {
        detail.syncSelectedCustomCourse(courseId, sem);
        detail.showDetail.value = !!detail.selectedCourse.value;
      } else {
        detail.showDetail.value = false;
        detail.selectedCourse.value = null;
      }
      detail.detailActionError.value = "";
      return true;
    } catch (e) {
      detail.detailActionError.value = String(e?.response?.data?.error || e?.message || "删除课程失败");
      return false;
    }
  };
  const deleteCustomCourse = async (mode) => {
    const course = detail.selectedCourse.value;
    if (!course?.is_custom) return;
    await deleteCustomCourseRecord(course, mode, { reopenDetail: mode === "current_week" });
  };
  const deleteManagedCourse = async (course) => {
    const ok = await deleteCustomCourseRecord(course, "all", { reopenDetail: false });
    if (!ok && detail.detailActionError.value) {
      data.manageCoursesError.value = detail.detailActionError.value;
    }
  };
  return {
    showAddCourse,
    courseDialogMode,
    editingCourseId,
    editingCourseSemester,
    showWeekPicker,
    addingCourse,
    addCourseError,
    showManageCourses,
    returnToManageAfterCourseSubmit,
    returnToDetailAfterCourseSubmit,
    addCourseForm,
    courseDialogSemester,
    courseSpanOptions,
    addWeeksCountText,
    periodOptions,
    weekDayLabels,
    resetAddCourseForm,
    populateCourseForm,
    hasValidLoginSession,
    promptLoginRequired,
    openAddCourseDialog,
    closeAddCourseDialog,
    openEditCourseDialog,
    toggleManageSemester,
    openManageCoursesDialog,
    closeManageCoursesDialog,
    toggleAddCourseWeek,
    selectAllAddCourseWeeks,
    clearAddCourseWeeks,
    validateAddCourse,
    refreshCustomCourseViews,
    submitAddCourse,
    deleteCustomCourseRecord,
    deleteCustomCourse,
    deleteManagedCourse
  };
};
const getCoursesForDayAndWeek = (_startDateStr, scheduleData, dayIndex, weekNumber) => {
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  const dailyCourses = source.filter((course) => {
    return course.weekday === dayIndex && course.weeks.includes(weekNumber);
  });
  dailyCourses.sort((a, b) => a.period - b.period);
  return mergeDailyCourses(dailyCourses);
};
const createTimestampSuffix = () => {
  const now = /* @__PURE__ */ new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};
const getDateForWeekDay = (startDateStr, weekNumber, weekday) => {
  if (!startDateStr) return null;
  const base = new Date(startDateStr);
  base.setDate(base.getDate() + (weekNumber - 1) * 7 + (weekday - 1));
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const buildCourseEvent = (course, iso, weekNumber, day) => {
  const startPeriod = Number(course.period) || 1;
  const endPeriod = getCourseEndPeriod(course);
  const startSlot = timeSchedule.find((t) => t.p === startPeriod);
  const endSlot = timeSchedule.find((t) => t.p === endPeriod);
  if (!startSlot || !endSlot) return null;
  const start = `${iso}T${startSlot.start}:00`;
  const end = `${iso}T${endSlot.end}:00`;
  const room = course.room_code || course.room || "";
  const location = [course.building, room].filter(Boolean).join(" ");
  const timeLabel = `第${weekNumber}周 周${day} 第${startPeriod}-${endPeriod}节 ${startSlot.start}-${endSlot.end}`;
  const description = `时间: ${timeLabel}
地点: ${location || "未标注"}`;
  return {
    summary: course.name,
    description,
    location: location || void 0,
    start,
    end
  };
};
const buildExportEventsForWeek = (weekNumber, options) => {
  const { startDateStr, scheduleData } = options || {};
  const events = [];
  if (!startDateStr) return events;
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  for (let day = 1; day <= 7; day++) {
    const iso = getDateForWeekDay(startDateStr, weekNumber, day);
    if (!iso) continue;
    const courses = getCoursesForDayAndWeek(startDateStr, source, day, weekNumber);
    courses.forEach((course) => {
      const event = buildCourseEvent(course, iso, weekNumber, day);
      if (event) events.push(event);
    });
  }
  return events;
};
const buildExportEventsForSemester = (options) => {
  const { startDateStr, scheduleData } = options || {};
  const events = [];
  if (!startDateStr) return events;
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  const maxWeek = source.reduce((acc, course) => {
    const maxCourseWeek = Array.isArray(course.weeks) && course.weeks.length ? Math.max(...course.weeks) : 0;
    return Math.max(acc, maxCourseWeek);
  }, 0);
  const totalWeeks = maxWeek || 25;
  const seen = /* @__PURE__ */ new Set();
  for (let week = 1; week <= totalWeeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const iso = getDateForWeekDay(startDateStr, week, day);
      if (!iso) continue;
      const courses = getCoursesForDayAndWeek(startDateStr, source, day, week);
      courses.forEach((course) => {
        const event = buildCourseEvent(course, iso, week, day);
        if (!event) return;
        const teacher = course.teacher || "";
        const key = `${course.name}|${event.start}|${event.end}|${event.location || ""}|${teacher}`;
        if (seen.has(key)) return;
        seen.add(key);
        events.push(event);
      });
    }
  }
  return events;
};
const triggerTextFileDownload = (fileName, content, mimeType = "application/json;charset=utf-8") => {
  try {
    const blob = new Blob([content], { type: mimeType });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    return true;
  } catch {
    return false;
  }
};
const encodeBase64Utf8 = (content) => {
  const bytes = new TextEncoder().encode(String(content || ""));
  const chunkSize = 32768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};
const saveJsonByFilePicker = async (fileName, content) => {
  const picker = window.showSaveFilePicker;
  if (typeof picker !== "function") {
    return { ok: false, canceled: false, location: "" };
  }
  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [
        {
          description: "JSON 文件",
          accept: {
            "application/json": [".json"]
          }
        }
      ]
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return {
      ok: true,
      canceled: false,
      location: handle?.name ? `已保存：${handle.name}` : "已保存到所选位置"
    };
  } catch (error) {
    if (String(error?.name || "").trim() === "AbortError") {
      return { ok: true, canceled: true, location: "已取消保存" };
    }
    return { ok: false, canceled: false, location: "" };
  }
};
const saveJsonByNativeExport = async (fileName, content) => {
  if (!isTauriRuntime()) {
    return { ok: false, canceled: false, location: "" };
  }
  try {
    const payload = await invokeNative("save_export_file", {
      req: {
        fileName,
        mimeType: "application/json",
        contentBase64: encodeBase64Utf8(content),
        preferMedia: false
      }
    });
    const path = String(payload?.path || "").trim();
    return {
      ok: true,
      canceled: false,
      location: path || "已保存到本地导出目录"
    };
  } catch (error) {
    const message = String(error?.message || error || "");
    if (message.includes("取消")) {
      return { ok: true, canceled: true, location: "已取消保存" };
    }
    return { ok: false, canceled: false, location: "" };
  }
};
const isLikelyMobileDevice = () => isMobileLike() || /Mobile|HarmonyOS/i.test(String(navigator.userAgent || ""));
const shareCustomCoursesJson = async (fileName, content) => {
  try {
    if (!navigator.share || typeof File === "undefined") return { ok: false, canceled: false };
    const file = new File([content], fileName, { type: "application/json" });
    await navigator.share({
      title: "Mini-HBUT 自定义课程备份",
      text: "自定义课程 JSON 备份",
      files: [file]
    });
    return { ok: true, canceled: false };
  } catch (error) {
    if (String(error?.name || "").trim() === "AbortError") {
      return { ok: true, canceled: true };
    }
    return { ok: false, canceled: false };
  }
};
const toPortableCustomCourse = (course, fallbackSemester = "") => {
  const normalized = normalizeCustomCourse(course, fallbackSemester);
  if (!normalized?.name) return null;
  return {
    id: normalized.source_id || normalized.id || "",
    source_id: normalized.source_id || normalized.id || "",
    semester: normalized.semester || "",
    name: normalized.name || "",
    teacher: normalized.teacher || "",
    room: normalized.room || "",
    weekday: Number(normalized.weekday || 1),
    period: Number(normalized.period || 1),
    djs: Number(normalized.djs || 1),
    weeks: normalizeWeeks(normalized.weeks),
    color: normalized.color || DEFAULT_COURSE_COLOR
  };
};
const readTextFromFile = async (file) => {
  if (!file) return "";
  if (typeof file.text === "function") {
    return await file.text();
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsText(file, "utf-8");
  });
};
const parseImportedCustomCourse = (item, index) => {
  if (!item || typeof item !== "object") {
    throw new Error(`第 ${index + 1} 条课程数据格式错误`);
  }
  const semesterValue = String(item.semester || "").trim();
  const nameValue = String(item.name || "").trim();
  const teacherValue = String(item.teacher || "").trim();
  const roomValue = String(item.room || "").trim();
  const sourceId = String(item.source_id || item.id || "").trim();
  const weekdayValue = Number(item.weekday);
  const periodValue = Number(item.period);
  const djsValue = Number(item.djs);
  const weeksValue = normalizeWeeks(item.weeks);
  if (!semesterValue) throw new Error(`第 ${index + 1} 条课程缺少 semester`);
  if (!nameValue) throw new Error(`第 ${index + 1} 条课程缺少 name`);
  if (!Number.isFinite(weekdayValue) || weekdayValue < 1 || weekdayValue > 7) {
    throw new Error(`第 ${index + 1} 条课程 weekday 不合法`);
  }
  if (!Number.isFinite(periodValue) || periodValue < 1 || periodValue > 11) {
    throw new Error(`第 ${index + 1} 条课程 period 不合法`);
  }
  const maxSpan = Math.max(1, 12 - periodValue);
  if (!Number.isFinite(djsValue) || djsValue < 1 || djsValue > maxSpan) {
    throw new Error(`第 ${index + 1} 条课程 djs 不合法（最多 ${maxSpan}）`);
  }
  if (!weeksValue.length) throw new Error(`第 ${index + 1} 条课程 weeks 不能为空`);
  const colorNorm = normalizeOptionalCourseColor(item.color);
  const colorValue = colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm;
  return {
    source_id: sourceId,
    semester: semesterValue,
    name: nameValue,
    teacher: teacherValue,
    room: roomValue,
    color: colorValue,
    weekday: weekdayValue,
    period: periodValue,
    djs: djsValue,
    weeks: weeksValue
  };
};
const useScheduleIO = (options) => {
  const { props, data, semester, editor, confirmDialog } = options;
  const { askConfirm } = confirmDialog;
  const exporting = ref(false);
  const exportingMode = ref("");
  const exportUrl = ref("");
  const exportError = ref("");
  const exportCopied = ref(false);
  const customCourseExporting = ref(false);
  const customCourseImporting = ref(false);
  const customCourseExportLocation = ref("");
  const customCourseFileInput = ref(null);
  const API_BASE = "/api";
  const exportCustomCoursesJson = async () => {
    const sid = String(props.studentId || "").trim();
    if (!sid) {
      showToast("请先登录后再导出自定义课程", "error");
      return;
    }
    if (customCourseExporting.value) return;
    customCourseExporting.value = true;
    customCourseExportLocation.value = "";
    try {
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list_all`, {
        student_id: sid
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || "导出自定义课程失败");
      }
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      const courses = list.map((item) => toPortableCustomCourse(item, semester.semester.value || "")).filter(Boolean);
      const payload = {
        version: "1.0.0",
        exported_at: (/* @__PURE__ */ new Date()).toISOString(),
        student_id: sid,
        courses
      };
      const content = JSON.stringify(payload, null, 2);
      const fileName = `mini-hbut-custom-courses-${createTimestampSuffix()}.json`;
      const pickerResult = await saveJsonByFilePicker(fileName, content);
      if (pickerResult.ok) {
        customCourseExportLocation.value = pickerResult.location;
        if (!pickerResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, "success");
        }
        return;
      }
      const preferShare = isLikelyMobileDevice();
      const shareResult = preferShare ? await shareCustomCoursesJson(fileName, content) : { ok: false, canceled: false };
      if (shareResult.ok) {
        customCourseExportLocation.value = shareResult.canceled ? "已取消保存" : "系统文件保存器/分享面板";
        if (!shareResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, "success");
        }
        return;
      }
      const nativeResult = await saveJsonByNativeExport(fileName, content);
      if (nativeResult.ok) {
        customCourseExportLocation.value = nativeResult.location;
        if (!nativeResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, "success");
        }
        return;
      }
      const fallbackShareResult = preferShare ? { ok: false, canceled: false } : await shareCustomCoursesJson(fileName, content);
      if (fallbackShareResult.ok) {
        customCourseExportLocation.value = fallbackShareResult.canceled ? "已取消保存" : "系统文件保存器/分享面板";
        if (!fallbackShareResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, "success");
        }
        return;
      }
      if (triggerTextFileDownload(fileName, content)) {
        customCourseExportLocation.value = "浏览器默认下载目录";
        showToast(`已导出 ${courses.length} 门自定义课程`, "success");
        return;
      }
      const copied = await copyTextWithFallback(content);
      if (copied) {
        customCourseExportLocation.value = "未生成文件，已复制 JSON 到剪贴板";
        showToast("文件导出失败，已复制 JSON 到剪贴板", "warning");
        return;
      }
      throw new Error("导出失败，请稍后重试");
    } catch (error) {
      showToast(String(error?.message || "导出自定义课程失败"), "error");
    } finally {
      customCourseExporting.value = false;
    }
  };
  const triggerImportCustomCourses = () => {
    if (customCourseImporting.value) return;
    customCourseFileInput.value?.click();
  };
  const importCustomCoursesFromText = async (content = "") => {
    const sid = String(props.studentId || "").trim();
    if (!sid) {
      throw new Error("请先登录后再导入自定义课程");
    }
    let parsed;
    try {
      parsed = JSON.parse(String(content || ""));
    } catch {
      throw new Error("JSON 解析失败，请检查文件格式");
    }
    const importStudentId = String(parsed?.student_id || "").trim();
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.courses) ? parsed.courses : [];
    if (!rows.length) {
      throw new Error("导入文件中没有可用课程数据");
    }
    if (importStudentId && importStudentId !== sid) {
      const confirmed = await askConfirm({
        title: "学号不一致，是否继续导入？",
        lines: [
          `当前登录学号：${sid}`,
          `导入文件学号：${importStudentId}`,
          "继续导入会写入当前登录账号的本地自定义课表。"
        ],
        confirmText: "继续导入",
        cancelText: "取消",
        danger: false
      });
      if (!confirmed) {
        throw new Error("已取消导入");
      }
    }
    const listRes = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list_all`, {
      student_id: sid
    });
    if (!listRes.data?.success) {
      throw new Error(listRes.data?.error || "读取本地课程失败，无法导入");
    }
    const existingList = Array.isArray(listRes.data?.data) ? listRes.data.data : [];
    const existingMap = /* @__PURE__ */ new Map();
    existingList.forEach((item) => {
      const normalized = normalizeCustomCourse(item, semester.semester.value || "");
      if (!normalized) return;
      const sourceId = String(normalized.source_id || normalized.id || "").trim();
      if (!sourceId) return;
      existingMap.set(sourceId, normalized);
    });
    let added = 0;
    let updated = 0;
    let failed = 0;
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const course = parseImportedCustomCourse(rows[index], index);
        const existing = course.source_id ? existingMap.get(course.source_id) : null;
        if (existing && String(existing.semester || "").trim() === course.semester) {
          const updateRes = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/update`, {
            student_id: sid,
            semester: course.semester,
            course_id: course.source_id,
            name: course.name,
            teacher: course.teacher,
            room: course.room,
            weekday: course.weekday,
            period: course.period,
            djs: course.djs,
            weeks: course.weeks,
            color: course.color || DEFAULT_COURSE_COLOR
          });
          if (!updateRes.data?.success) {
            throw new Error(updateRes.data?.error || "更新失败");
          }
          updated += 1;
          continue;
        }
        const addRes = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/add`, {
          student_id: sid,
          semester: course.semester,
          name: course.name,
          teacher: course.teacher,
          room: course.room,
          weekday: course.weekday,
          period: course.period,
          djs: course.djs,
          weeks: course.weeks,
          color: course.color || DEFAULT_COURSE_COLOR
        });
        if (!addRes.data?.success) {
          throw new Error(addRes.data?.error || "新增失败");
        }
        added += 1;
      } catch (error) {
        failed += 1;
        console.warn("[Schedule] 自定义课程导入失败：", error);
      }
    }
    await editor.refreshCustomCourseViews(String(semester.semester.value || semester.semesterDraft.value || "").trim());
    if (failed > 0) {
      showToast(`导入完成：新增 ${added}，更新 ${updated}，失败 ${failed}`, "warning", 4500);
    } else {
      showToast(`导入完成：新增 ${added}，更新 ${updated}`, "success");
    }
  };
  const handleCustomCourseFileChange = async (event) => {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    customCourseImporting.value = true;
    try {
      const content = await readTextFromFile(file);
      await importCustomCoursesFromText(content);
    } catch (error) {
      const message = String(error?.message || "导入失败");
      if (message !== "已取消导入") {
        showToast(message, "error");
      }
    } finally {
      customCourseImporting.value = false;
      if (input) input.value = "";
    }
  };
  const exportCalendar = async (mode = "week") => {
    exportError.value = "";
    exportUrl.value = "";
    exportCopied.value = false;
    if (exporting.value) return;
    if (!props.studentId) {
      exportError.value = "请先登录后再导出";
      return;
    }
    if (!semester.startDateStr.value) {
      exportError.value = "缺少学期开始日期，暂无法导出";
      return;
    }
    exportingMode.value = mode;
    const events = mode === "semester" ? buildExportEventsForSemester({ startDateStr: semester.startDateStr.value, scheduleData: data.scheduleData.value }) : buildExportEventsForWeek(Number(semester.selectedWeek.value || 1), { startDateStr: semester.startDateStr.value, scheduleData: data.scheduleData.value });
    if (!events.length) {
      exportError.value = "当前周暂无可导出的课表数据";
      return;
    }
    exporting.value = true;
    try {
      const uploadEndpoint = String(localStorage.getItem("hbu_temp_upload_endpoint") || "").trim();
      const payload = {
        student_id: props.studentId,
        semester: semester.semester.value,
        week: semester.selectedWeek.value,
        events
      };
      if (uploadEndpoint) {
        payload.upload_endpoint = uploadEndpoint;
      }
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/export_calendar`, payload);
      if (res.data?.success) {
        exportUrl.value = res.data.url || "";
        if (!exportUrl.value) {
          exportError.value = "导出成功但未返回链接";
        } else {
          showToast("日历导出成功，复制链接用浏览器打开即可导入", "success", 3e3);
          nextTick(() => {
            const panel = document.querySelector(".drawer-panel");
            if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
          });
        }
      } else {
        exportError.value = res.data?.error || "导出失败";
      }
    } catch (e) {
      exportError.value = e?.response?.data?.error || e?.message || "导出失败";
    } finally {
      exporting.value = false;
      exportingMode.value = "";
    }
  };
  const copyExportUrl = async () => {
    if (!exportUrl.value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportUrl.value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = exportUrl.value;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      exportCopied.value = true;
      setTimeout(() => {
        exportCopied.value = false;
      }, 2e3);
    } catch (e) {
      exportError.value = "复制失败，请手动复制";
    }
  };
  return {
    exporting,
    exportingMode,
    exportUrl,
    exportError,
    exportCopied,
    customCourseExporting,
    customCourseImporting,
    customCourseExportLocation,
    customCourseFileInput,
    exportCustomCoursesJson,
    triggerImportCustomCourses,
    importCustomCoursesFromText,
    handleCustomCourseFileChange,
    exportCalendar,
    copyExportUrl
  };
};
const useScheduleSync = (options) => {
  const { props, data, semester, editor, confirmDialog } = options;
  const { askConfirm } = confirmDialog;
  const syncUploading = ref(false);
  const syncDownloading = ref(false);
  const syncUploadCooldownMs = ref(0);
  const syncDownloadCooldownMs = ref(0);
  const syncStatusText = ref("");
  let syncCooldownTimer = null;
  const syncUploadCooldownText = computed(() => formatCooldownText(syncUploadCooldownMs.value));
  const syncDownloadCooldownText = computed(() => formatCooldownText(syncDownloadCooldownMs.value));
  const refreshCloudSyncCooldown = () => {
    const sid = String(props.studentId || "").trim();
    if (!sid) {
      syncUploadCooldownMs.value = 0;
      syncDownloadCooldownMs.value = 0;
      return;
    }
    const uploadState = getCloudSyncCooldownState(sid, "upload");
    const downloadState = getCloudSyncCooldownState(sid, "download");
    syncUploadCooldownMs.value = Math.max(0, Number(uploadState.remainingMs || 0));
    syncDownloadCooldownMs.value = Math.max(0, Number(downloadState.remainingMs || 0));
  };
  const clearCloudSyncCooldownTimer = () => {
    if (!syncCooldownTimer) return;
    window.clearInterval(syncCooldownTimer);
    syncCooldownTimer = null;
  };
  const ensureCloudSyncCooldownTimer = () => {
    clearCloudSyncCooldownTimer();
    syncCooldownTimer = window.setInterval(() => {
      refreshCloudSyncCooldown();
    }, 1e3);
  };
  const refreshScheduleAfterCloudDownload = async (syncResult = {}) => {
    const sem = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    if (!sem) return;
    const downloadedSemesters = Array.isArray(syncResult?.academicApplied?.scheduleSemesters) ? syncResult.academicApplied.scheduleSemesters.map((item) => String(item || "").trim()).filter(Boolean) : [];
    const shouldRefreshSchedule = downloadedSemesters.length === 0 || downloadedSemesters.includes(sem);
    const hasCached = shouldRefreshSchedule ? data.applyCachedScheduleImmediately(sem) : false;
    await data.loadCustomCourses(sem);
    if (!hasCached && shouldRefreshSchedule) {
      await data.fetchSchedule(sem);
    }
  };
  const handleCloudSyncUpdated = (event) => {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    const sid = String(props.studentId || "").trim();
    const targetSid = String(detail?.studentId || "").trim();
    if (!sid || !targetSid || sid !== targetSid) return;
    refreshCloudSyncCooldown();
    if (detail?.action !== "download" || !detail?.success) return;
    if (syncDownloading.value) return;
    void refreshScheduleAfterCloudDownload(detail).catch((error) => {
      console.warn("[Schedule] cloud sync auto refresh failed:", error);
    });
  };
  const handleScheduleVisibilityChange = () => {
    if (document.hidden) {
      data.persistScheduleRenderSnapshot("app-hidden");
    }
  };
  const handleCloudSyncUpload = async () => {
    if (!editor.hasValidLoginSession()) {
      await editor.promptLoginRequired();
      return;
    }
    const sid = String(props.studentId || "").trim();
    if (!sid || syncUploading.value || syncDownloading.value) return;
    refreshCloudSyncCooldown();
    if (syncUploadCooldownMs.value > 0) {
      showToast(`上传冷却中，${syncUploadCooldownText.value}`, "info");
      return;
    }
    const sem = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    const confirmed = await askConfirm({
      title: "确认上传到云端",
      lines: [
        "将覆盖云端已有的自定义课程数据。",
        `当前学期：${sem || "未选择学期"}`,
        "确认后将立即执行上传。"
      ],
      confirmText: "确认上传",
      cancelText: "取消",
      danger: true
    });
    if (!confirmed) return;
    syncUploading.value = true;
    syncStatusText.value = "正在上传云端备份...";
    try {
      const result = await runCloudSyncUpload({
        studentId: sid,
        reason: "schedule-manual-upload",
        force: false,
        includeCustomCourses: true,
        includeAcademic: false,
        includeSettings: false
      });
      if (!result?.success) {
        if (result?.cooldown) {
          syncUploadCooldownMs.value = Number(result.remainingMs || 0);
          showToast(`上传冷却中，${syncUploadCooldownText.value}`, "info");
        } else {
          showToast(result?.error || "云上传失败", "error");
        }
        return;
      }
      refreshCloudSyncCooldown();
      showToast("云上传完成", "success");
    } catch (e) {
      showToast(String(e?.message || "云上传失败"), "error");
    } finally {
      syncUploading.value = false;
      syncStatusText.value = "";
    }
  };
  const handleCloudSyncDownload = async () => {
    if (!editor.hasValidLoginSession()) {
      await editor.promptLoginRequired();
      return;
    }
    const sid = String(props.studentId || "").trim();
    if (!sid || syncUploading.value || syncDownloading.value) return;
    refreshCloudSyncCooldown();
    if (syncDownloadCooldownMs.value > 0) {
      showToast(`下载冷却中，${syncDownloadCooldownText.value}`, "info");
      return;
    }
    syncDownloading.value = true;
    syncStatusText.value = "正在下载云端备份并覆盖本地课表...";
    try {
      const result = await runCloudSyncDownload({
        studentId: sid,
        reason: "schedule-manual-download",
        force: false,
        applySettings: false,
        applyCustomCourses: true,
        applyAcademic: false
      });
      if (!result?.success) {
        if (result?.cooldown) {
          syncDownloadCooldownMs.value = Number(result.remainingMs || 0);
          showToast(`下载冷却中，${syncDownloadCooldownText.value}`, "info");
        } else {
          showToast(result?.error || "云下载失败", "error");
        }
        return;
      }
      await refreshScheduleAfterCloudDownload(result);
      refreshCloudSyncCooldown();
      if (result?.empty) {
        showToast("云端暂无备份，已记录本次同步", "info");
      } else {
        showToast("云下载完成，已应用自定义课程", "success");
      }
    } catch (e) {
      showToast(String(e?.message || "云下载失败"), "error");
    } finally {
      syncDownloading.value = false;
      syncStatusText.value = "";
    }
  };
  return {
    syncUploading,
    syncDownloading,
    syncUploadCooldownMs,
    syncDownloadCooldownMs,
    syncStatusText,
    syncUploadCooldownText,
    syncDownloadCooldownText,
    refreshCloudSyncCooldown,
    clearCloudSyncCooldownTimer,
    ensureCloudSyncCooldownTimer,
    refreshScheduleAfterCloudDownload,
    handleCloudSyncUpdated,
    handleScheduleVisibilityChange,
    handleCloudSyncUpload,
    handleCloudSyncDownload
  };
};
const _hoisted_1$8 = { class: "schedule-topbar" };
const _hoisted_2$8 = { class: "topbar-center" };
const _hoisted_3$8 = { class: "topbar-semester" };
const _hoisted_4$6 = { class: "topbar-right" };
const _hoisted_5$6 = { class: "week-selector" };
const _hoisted_6$5 = ["value"];
const _sfc_main$9 = {
  __name: "ScheduleTopbar",
  props: {
    semester: { type: String, default: "" },
    selectedWeek: { type: Number, default: 0 },
    totalWeeks: { type: Number, default: 25 }
  },
  emits: ["update:selectedWeek", "toggle-menu"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1$8, [
        createBaseVNode("button", {
          class: "menu-btn btn-ripple",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("toggle-menu")),
          "aria-label": "打开课表菜单"
        }, [..._cache[2] || (_cache[2] = [
          createBaseVNode("span", { class: "material-symbols-outlined menu-icon" }, "menu", -1)
        ])]),
        createBaseVNode("div", _hoisted_2$8, [
          _cache[3] || (_cache[3] = createBaseVNode("h1", { class: "topbar-title" }, "课表", -1)),
          createBaseVNode("p", _hoisted_3$8, toDisplayString(__props.semester || "加载中..."), 1)
        ]),
        createBaseVNode("div", _hoisted_4$6, [
          createBaseVNode("div", _hoisted_5$6, [
            createVNode(_component_IOSSelect, {
              "model-value": __props.selectedWeek,
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => emit("update:selectedWeek", $event))
            }, {
              default: withCtx(() => [
                _cache[4] || (_cache[4] = createBaseVNode("option", {
                  disabled: "",
                  value: 0
                }, "请选择周次", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(__props.totalWeeks, (w) => {
                  return openBlock(), createElementBlock("option", {
                    key: w,
                    value: w
                  }, "第" + toDisplayString(w) + "周", 9, _hoisted_6$5);
                }), 128))
              ]),
              _: 1
            }, 8, ["model-value"])
          ])
        ])
      ]);
    };
  }
};
const ScheduleTopbar = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["__scopeId", "data-v-fc69a524"]]);
const _hoisted_1$7 = { class: "drawer-section" };
const _hoisted_2$7 = { class: "drawer-semester-row" };
const _hoisted_3$7 = ["value"];
const _hoisted_4$5 = {
  key: 0,
  class: "drawer-error"
};
const _hoisted_5$5 = { class: "drawer-section" };
const _hoisted_6$4 = {
  class: "drawer-style-switch",
  role: "tablist",
  "aria-label": "课程样式切换"
};
const _hoisted_7$4 = ["aria-pressed", "aria-selected", "onClick"];
const _hoisted_8$4 = { class: "drawer-actions" };
const _hoisted_9$4 = { class: "drawer-course-group" };
const _hoisted_10$4 = { class: "drawer-course-actions" };
const _hoisted_11$4 = ["disabled"];
const _hoisted_12$4 = ["disabled"];
const _hoisted_13$4 = { class: "drawer-sync-group" };
const _hoisted_14$4 = { class: "drawer-sync-actions" };
const _hoisted_15$4 = ["disabled"];
const _hoisted_16$4 = ["disabled"];
const _hoisted_17$3 = { class: "drawer-sync-actions drawer-sync-actions--json" };
const _hoisted_18$3 = ["disabled"];
const _hoisted_19$2 = ["disabled"];
const _hoisted_20$1 = { class: "drawer-sync-status" };
const _hoisted_21$1 = { class: "drawer-sync-cooldown" };
const _hoisted_22$1 = { class: "drawer-sync-cooldown" };
const _hoisted_23$1 = {
  key: 0,
  class: "drawer-sync-running"
};
const _hoisted_24$1 = {
  key: 1,
  class: "drawer-sync-export-path"
};
const _hoisted_25$1 = ["disabled"];
const _hoisted_26 = ["disabled"];
const _hoisted_27 = {
  key: 0,
  class: "export-result"
};
const _hoisted_28 = { class: "export-row" };
const _hoisted_29 = ["value"];
const _hoisted_30 = {
  key: 0,
  class: "export-copied"
};
const _hoisted_31 = {
  key: 1,
  class: "export-error"
};
const _sfc_main$8 = {
  __name: "ScheduleDrawer",
  props: {
    showMenu: { type: Boolean, default: false },
    semesterOptions: { type: Array, default: () => [] },
    semesterDraft: { type: String, default: "" },
    semesterLoading: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    semesterError: { type: String, default: "" },
    scheduleCourseCardStyle: { type: String, default: "modern" },
    styleOptions: { type: Array, default: () => [] },
    addingCourse: { type: Boolean, default: false },
    loadingManageCourses: { type: Boolean, default: false },
    syncUploading: { type: Boolean, default: false },
    syncDownloading: { type: Boolean, default: false },
    customCourseImporting: { type: Boolean, default: false },
    customCourseExporting: { type: Boolean, default: false },
    syncUploadCooldownText: { type: String, default: "" },
    syncDownloadCooldownText: { type: String, default: "" },
    syncStatusText: { type: String, default: "" },
    customCourseExportLocation: { type: String, default: "" },
    exporting: { type: Boolean, default: false },
    exportingMode: { type: String, default: "" },
    exportUrl: { type: String, default: "" },
    exportError: { type: String, default: "" },
    exportCopied: { type: Boolean, default: false }
  },
  emits: [
    "close",
    "update:semesterDraft",
    "semester-change",
    "set-style",
    "open-add-course",
    "open-manage-courses",
    "sync-upload",
    "sync-download",
    "export-json",
    "import-json",
    "import-file",
    "export-calendar",
    "copy-export-url"
  ],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const semesterDraftModel = computed({
      get: () => props.semesterDraft,
      set: (value) => emit("update:semesterDraft", value)
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock(Fragment, null, [
        createVNode(Transition, { name: "drawer-fade" }, {
          default: withCtx(() => [
            __props.showMenu ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "drawer-overlay",
              onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
            })) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        createVNode(Transition, { name: "drawer-slide" }, {
          default: withCtx(() => [
            __props.showMenu ? (openBlock(), createElementBlock("aside", {
              key: 0,
              class: "drawer-panel",
              onClick: _cache[13] || (_cache[13] = withModifiers(() => {
              }, ["stop"]))
            }, [
              _cache[29] || (_cache[29] = createBaseVNode("div", { class: "drawer-title" }, [
                createBaseVNode("span", { class: "material-symbols-outlined drawer-title-icon" }, "calendar_month"),
                createTextVNode(" 课表工具 ")
              ], -1)),
              createBaseVNode("div", _hoisted_1$7, [
                _cache[15] || (_cache[15] = createBaseVNode("div", {
                  class: "drawer-subtitle",
                  "data-step": "1"
                }, "选择学期", -1)),
                createBaseVNode("div", _hoisted_2$7, [
                  createVNode(_component_IOSSelect, {
                    class: "drawer-select",
                    modelValue: semesterDraftModel.value,
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => semesterDraftModel.value = $event),
                    disabled: __props.semesterLoading || __props.loading,
                    onChange: _cache[2] || (_cache[2] = ($event) => emit("semester-change"))
                  }, {
                    default: withCtx(() => [
                      _cache[14] || (_cache[14] = createBaseVNode("option", {
                        disabled: "",
                        value: ""
                      }, "请选择学期", -1)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(__props.semesterOptions, (sem) => {
                        return openBlock(), createElementBlock("option", {
                          key: sem,
                          value: sem
                        }, toDisplayString(sem), 9, _hoisted_3$7);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue", "disabled"])
                ]),
                __props.semesterError ? (openBlock(), createElementBlock("div", _hoisted_4$5, toDisplayString(__props.semesterError), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_5$5, [
                _cache[16] || (_cache[16] = createBaseVNode("div", {
                  class: "drawer-subtitle",
                  "data-step": "2"
                }, "课程样式", -1)),
                createBaseVNode("div", _hoisted_6$4, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(__props.styleOptions, (item) => {
                    return openBlock(), createElementBlock("button", {
                      key: item.key,
                      type: "button",
                      class: normalizeClass(["drawer-style-chip", { active: __props.scheduleCourseCardStyle === item.key }]),
                      role: "tab",
                      "aria-pressed": __props.scheduleCourseCardStyle === item.key,
                      "aria-selected": __props.scheduleCourseCardStyle === item.key,
                      onClick: withModifiers(($event) => emit("set-style", item.key), ["stop"])
                    }, [
                      createBaseVNode("strong", null, toDisplayString(item.label), 1)
                    ], 10, _hoisted_7$4);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_8$4, [
                createBaseVNode("div", _hoisted_9$4, [
                  _cache[19] || (_cache[19] = createBaseVNode("div", {
                    class: "drawer-subtitle",
                    "data-step": "3"
                  }, "自定义课程管理", -1)),
                  createBaseVNode("div", _hoisted_10$4, [
                    createBaseVNode("button", {
                      class: "drawer-action add-course",
                      disabled: __props.addingCourse,
                      onClick: _cache[3] || (_cache[3] = ($event) => emit("open-add-course"))
                    }, [..._cache[17] || (_cache[17] = [
                      createBaseVNode("span", { class: "material-symbols-outlined" }, "add_circle", -1),
                      createTextVNode(" 添加课程 ", -1)
                    ])], 8, _hoisted_11$4),
                    createBaseVNode("button", {
                      class: "drawer-action manage-course",
                      disabled: __props.loadingManageCourses,
                      onClick: _cache[4] || (_cache[4] = ($event) => emit("open-manage-courses"))
                    }, [
                      _cache[18] || (_cache[18] = createBaseVNode("span", { class: "material-symbols-outlined" }, "folder_copy", -1)),
                      createTextVNode(" " + toDisplayString(__props.loadingManageCourses ? "加载中..." : "管理课程"), 1)
                    ], 8, _hoisted_12$4)
                  ])
                ]),
                createBaseVNode("div", _hoisted_13$4, [
                  _cache[24] || (_cache[24] = createBaseVNode("div", {
                    class: "drawer-subtitle",
                    "data-step": "4"
                  }, "自定义课程同步", -1)),
                  createBaseVNode("div", _hoisted_14$4, [
                    createBaseVNode("button", {
                      class: "drawer-action sync-upload",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[5] || (_cache[5] = ($event) => emit("sync-upload"))
                    }, [
                      _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_upload", -1)),
                      createTextVNode(" " + toDisplayString(__props.syncUploading ? "云上传中..." : "云上传"), 1)
                    ], 8, _hoisted_15$4),
                    createBaseVNode("button", {
                      class: "drawer-action sync-download",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[6] || (_cache[6] = ($event) => emit("sync-download"))
                    }, [
                      _cache[21] || (_cache[21] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_download", -1)),
                      createTextVNode(" " + toDisplayString(__props.syncDownloading ? "云下载中..." : "云下载"), 1)
                    ], 8, _hoisted_16$4)
                  ]),
                  createBaseVNode("div", _hoisted_17$3, [
                    createBaseVNode("button", {
                      class: "drawer-action sync-json-export",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[7] || (_cache[7] = ($event) => emit("export-json"))
                    }, [
                      _cache[22] || (_cache[22] = createBaseVNode("span", { class: "material-symbols-outlined" }, "data_object", -1)),
                      createTextVNode(" " + toDisplayString(__props.customCourseExporting ? "导出中..." : "导出 JSON"), 1)
                    ], 8, _hoisted_18$3),
                    createBaseVNode("button", {
                      class: "drawer-action sync-json-import",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[8] || (_cache[8] = ($event) => emit("import-json"))
                    }, [
                      _cache[23] || (_cache[23] = createBaseVNode("span", { class: "material-symbols-outlined" }, "file_upload", -1)),
                      createTextVNode(" " + toDisplayString(__props.customCourseImporting ? "导入中..." : "导入 JSON"), 1)
                    ], 8, _hoisted_19$2)
                  ]),
                  createBaseVNode("input", {
                    ref: "customCourseFileInput",
                    type: "file",
                    accept: ".json,application/json",
                    style: { "display": "none" },
                    onChange: _cache[9] || (_cache[9] = ($event) => emit("import-file", $event))
                  }, null, 544),
                  createBaseVNode("div", _hoisted_20$1, [
                    createBaseVNode("span", _hoisted_21$1, "上传：" + toDisplayString(__props.syncUploadCooldownText), 1),
                    createBaseVNode("span", _hoisted_22$1, "下载：" + toDisplayString(__props.syncDownloadCooldownText), 1),
                    __props.syncStatusText ? (openBlock(), createElementBlock("span", _hoisted_23$1, toDisplayString(__props.syncStatusText), 1)) : createCommentVNode("", true),
                    __props.customCourseExportLocation ? (openBlock(), createElementBlock("span", _hoisted_24$1, "导出位置：" + toDisplayString(__props.customCourseExportLocation), 1)) : createCommentVNode("", true)
                  ])
                ]),
                _cache[27] || (_cache[27] = createBaseVNode("div", {
                  class: "drawer-subtitle",
                  "data-step": "5"
                }, "导出数据", -1)),
                createBaseVNode("button", {
                  class: "drawer-action",
                  disabled: __props.exporting,
                  onClick: _cache[10] || (_cache[10] = ($event) => emit("export-calendar", "week"))
                }, [
                  _cache[25] || (_cache[25] = createBaseVNode("span", { class: "material-symbols-outlined" }, "calendar_today", -1)),
                  createTextVNode(" " + toDisplayString(__props.exporting && __props.exportingMode === "week" ? "正在生成..." : "导出本周"), 1)
                ], 8, _hoisted_25$1),
                createBaseVNode("button", {
                  class: "drawer-action ghost",
                  disabled: __props.exporting,
                  onClick: _cache[11] || (_cache[11] = ($event) => emit("export-calendar", "semester"))
                }, [
                  _cache[26] || (_cache[26] = createBaseVNode("span", { class: "material-symbols-outlined" }, "school", -1)),
                  createTextVNode(" " + toDisplayString(__props.exporting && __props.exportingMode === "semester" ? "正在生成..." : "导出本学期"), 1)
                ], 8, _hoisted_26)
              ]),
              _cache[30] || (_cache[30] = createBaseVNode("div", { class: "drawer-tip" }, "生成后复制链接，用浏览器打开即可导入手机日历", -1)),
              __props.exportUrl ? (openBlock(), createElementBlock("div", _hoisted_27, [
                _cache[28] || (_cache[28] = createBaseVNode("div", { class: "export-label" }, "本地导入链接", -1)),
                createBaseVNode("div", _hoisted_28, [
                  createBaseVNode("input", {
                    class: "export-input",
                    type: "text",
                    value: __props.exportUrl,
                    readonly: ""
                  }, null, 8, _hoisted_29),
                  createBaseVNode("button", {
                    class: "export-copy",
                    onClick: _cache[12] || (_cache[12] = ($event) => emit("copy-export-url"))
                  }, "复制")
                ]),
                __props.exportCopied ? (openBlock(), createElementBlock("div", _hoisted_30, "已复制链接")) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              __props.exportError ? (openBlock(), createElementBlock("div", _hoisted_31, toDisplayString(__props.exportError), 1)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ], 64);
    };
  }
};
const ScheduleDrawer = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["__scopeId", "data-v-a96d780c"]]);
const _hoisted_1$6 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_2$6 = {
  key: 1,
  class: "vacation-banner"
};
const _hoisted_3$6 = {
  key: 2,
  class: "error-banner"
};
const _sfc_main$7 = {
  __name: "ScheduleBanners",
  props: {
    offline: { type: Boolean, default: false },
    initialFetchDone: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    offlineBannerText: { type: String, default: "" },
    vacationNotice: { type: String, default: "" },
    errorMsg: { type: String, default: "" },
    currentWeek: { type: Number, default: 0 },
    selectedWeek: { type: Number, default: 0 }
  },
  emits: ["jump-current"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        __props.offline && __props.initialFetchDone && !__props.loading ? (openBlock(), createElementBlock("div", _hoisted_1$6, toDisplayString(__props.offlineBannerText), 1)) : createCommentVNode("", true),
        __props.vacationNotice ? (openBlock(), createElementBlock("div", _hoisted_2$6, toDisplayString(__props.vacationNotice), 1)) : createCommentVNode("", true),
        __props.errorMsg ? (openBlock(), createElementBlock("div", _hoisted_3$6, toDisplayString(__props.errorMsg), 1)) : createCommentVNode("", true),
        __props.currentWeek && __props.selectedWeek && __props.selectedWeek !== __props.currentWeek ? (openBlock(), createElementBlock("button", {
          key: 3,
          class: "jump-current-btn",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("jump-current")),
          title: "跳转到当前周"
        }, " 回到当前周 ")) : createCommentVNode("", true)
      ], 64);
    };
  }
};
const ScheduleBanners = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-0e56ab5b"]]);
const _hoisted_1$5 = { class: "date-header" };
const _hoisted_2$5 = { class: "month-col" };
const _hoisted_3$5 = { class: "month-num" };
const _hoisted_4$4 = { class: "days-row" };
const _hoisted_5$4 = { class: "day-num" };
const _hoisted_6$3 = { class: "day-label" };
const _hoisted_7$3 = { class: "grid-body" };
const _hoisted_8$3 = { class: "time-axis" };
const _hoisted_9$3 = { class: "time-start" };
const _hoisted_10$3 = { class: "period-num" };
const _hoisted_11$3 = { class: "time-end" };
const _hoisted_12$3 = { class: "grid-lines" };
const _hoisted_13$3 = ["onClick"];
const _hoisted_14$3 = { class: "course-name" };
const _hoisted_15$3 = { class: "course-room" };
const _hoisted_16$3 = {
  key: 0,
  class: "course-teacher"
};
const _sfc_main$6 = {
  __name: "ScheduleGrid",
  props: {
    weekDates: { type: Array, default: () => [] },
    currentMonth: { type: Number, default: 0 },
    selectedWeek: { type: Number, default: 0 },
    scheduleCourseCardStyle: { type: String, default: "modern" },
    courseCardRefreshNonce: { type: Number, default: 0 },
    getCoursesForDay: { type: Function, default: () => () => [] },
    getCourseStyle: { type: Function, default: () => ({}) },
    isWidgetHighlighted: { type: Function, default: () => false }
  },
  emits: ["open-detail"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const isTodayColumn = (dayIndex) => {
      const idx = Number(dayIndex) - 1;
      if (idx < 0 || idx > 6) return false;
      const date = props.weekDates[idx];
      return !!date?.isToday;
    };
    const periodRows = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1);
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, {
        name: __props.selectedWeek ? "week-slide-left" : "week-slide-right",
        mode: "out-in"
      }, {
        default: withCtx(() => [
          (openBlock(), createElementBlock("div", {
            class: "timetable-container",
            key: `week-${__props.selectedWeek}`
          }, [
            createBaseVNode("div", _hoisted_1$5, [
              createBaseVNode("div", _hoisted_2$5, [
                createBaseVNode("div", _hoisted_3$5, [
                  createTextVNode(toDisplayString(__props.currentMonth), 1),
                  _cache[0] || (_cache[0] = createBaseVNode("span", { class: "month-label" }, "月", -1))
                ])
              ]),
              createBaseVNode("div", _hoisted_4$4, [
                (openBlock(), createElementBlock(Fragment, null, renderList(7, (day) => {
                  return createBaseVNode("div", {
                    key: day,
                    class: normalizeClass(["day-col", { "is-today": isTodayColumn(day) }])
                  }, [
                    createBaseVNode("div", _hoisted_5$4, toDisplayString(__props.weekDates[day - 1]?.date || day), 1),
                    createBaseVNode("div", _hoisted_6$3, toDisplayString(__props.weekDates[day - 1]?.dayLabel || ""), 1)
                  ], 2);
                }), 64))
              ])
            ]),
            createBaseVNode("div", _hoisted_7$3, [
              createBaseVNode("div", _hoisted_8$3, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(timeSchedule), (t) => {
                  return openBlock(), createElementBlock("div", {
                    key: t.p,
                    class: "time-slot"
                  }, [
                    createBaseVNode("span", _hoisted_9$3, toDisplayString(t.start), 1),
                    createBaseVNode("span", _hoisted_10$3, toDisplayString(t.p), 1),
                    createBaseVNode("span", _hoisted_11$3, toDisplayString(t.end), 1)
                  ]);
                }), 128))
              ]),
              (openBlock(), createElementBlock("div", {
                class: "courses-grid",
                key: `courses-grid-${__props.scheduleCourseCardStyle}-${__props.courseCardRefreshNonce}`
              }, [
                createBaseVNode("div", _hoisted_12$3, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(periodRows), (i) => {
                    return openBlock(), createElementBlock("div", {
                      key: i,
                      class: "line-row"
                    });
                  }), 128))
                ]),
                (openBlock(), createElementBlock(Fragment, null, renderList(7, (day) => {
                  return createBaseVNode("div", {
                    key: day,
                    class: normalizeClass(["day-column", { "is-today-column": isTodayColumn(day) }])
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(__props.getCoursesForDay(day), (course) => {
                      return openBlock(), createElementBlock("div", {
                        key: course._uid || course.id,
                        class: normalizeClass(["course-card", [
                          `course-card--${__props.scheduleCourseCardStyle}`,
                          { conflict: course.is_conflict },
                          { "widget-highlight": __props.isWidgetHighlighted(course, day) }
                        ]]),
                        style: normalizeStyle(__props.getCourseStyle(course)),
                        onClick: ($event) => emit("open-detail", course)
                      }, [
                        createBaseVNode("div", _hoisted_14$3, toDisplayString(course.name), 1),
                        createBaseVNode("div", _hoisted_15$3, toDisplayString(course.is_conflict ? "点击查看冲突课程详情" : course.room_code || course.room), 1),
                        __props.scheduleCourseCardStyle === "class" && !course.is_conflict ? (openBlock(), createElementBlock("div", _hoisted_16$3, toDisplayString(course.teacher || "未标注教师"), 1)) : createCommentVNode("", true)
                      ], 14, _hoisted_13$3);
                    }), 128))
                  ], 2);
                }), 64))
              ]))
            ])
          ]))
        ]),
        _: 1
      }, 8, ["name"]);
    };
  }
};
const ScheduleGrid = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-fd7b2cbb"]]);
const _hoisted_1$4 = { class: "modal-header" };
const _hoisted_2$4 = {
  key: 0,
  class: "modal-body"
};
const _hoisted_3$4 = ["onClick"];
const _hoisted_4$3 = { class: "conflict-item-title" };
const _hoisted_5$3 = {
  key: 0,
  class: "conflict-tag"
};
const _hoisted_6$2 = { class: "conflict-item-row" };
const _hoisted_7$2 = { class: "conflict-item-row" };
const _hoisted_8$2 = { class: "conflict-item-row" };
const _hoisted_9$2 = {
  key: 1,
  class: "modal-body"
};
const _hoisted_10$2 = {
  key: 0,
  class: "info-row"
};
const _hoisted_11$2 = { class: "info-row" };
const _hoisted_12$2 = { class: "value" };
const _hoisted_13$2 = { class: "info-row" };
const _hoisted_14$2 = { class: "value" };
const _hoisted_15$2 = { class: "info-row" };
const _hoisted_16$2 = { class: "value" };
const _hoisted_17$2 = { class: "info-row" };
const _hoisted_18$2 = { class: "value" };
const _hoisted_19$1 = { class: "info-row" };
const _hoisted_20 = { class: "value" };
const _hoisted_21 = { class: "info-row" };
const _hoisted_22 = { class: "value" };
const _hoisted_23 = {
  key: 1,
  class: "custom-course-actions"
};
const _hoisted_24 = { class: "detail-copy-actions" };
const _hoisted_25 = {
  key: 2,
  class: "detail-action-error"
};
const _sfc_main$5 = {
  __name: "ScheduleCourseDetail",
  props: {
    showDetail: { type: Boolean, default: false },
    selectedCourse: { type: Object, default: null },
    detailActionError: { type: String, default: "" }
  },
  emits: [
    "close",
    "open-conflict-course-detail",
    "open-edit-course",
    "delete-custom-course",
    "copy-detail"
  ],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "fade" }, {
        default: withCtx(() => [
          __props.showDetail ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: _cache[6] || (_cache[6] = ($event) => emit("close"))
          }, [
            createBaseVNode("div", {
              class: "modal-content glass",
              onClick: _cache[5] || (_cache[5] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_1$4, [
                createBaseVNode("h3", null, toDisplayString(__props.selectedCourse?.name), 1),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                }, "×")
              ]),
              __props.selectedCourse?.is_conflict ? (openBlock(), createElementBlock("div", _hoisted_2$4, [
                _cache[7] || (_cache[7] = createBaseVNode("div", { class: "conflict-hint" }, "当前时段存在多个课程重叠，请按下列信息核对。", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(__props.selectedCourse?.conflict_courses || [], (item, idx) => {
                  return openBlock(), createElementBlock("div", {
                    key: `${item.id || item.name}-${idx}`,
                    class: normalizeClass(["conflict-item", { clickable: item.is_custom }]),
                    onClick: ($event) => item.is_custom && emit("open-conflict-course-detail", item)
                  }, [
                    createBaseVNode("div", _hoisted_4$3, [
                      createTextVNode(toDisplayString(idx + 1) + ". " + toDisplayString(item.name) + " ", 1),
                      item.is_custom ? (openBlock(), createElementBlock("span", _hoisted_5$3, "自定义")) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_6$2, "教师：" + toDisplayString(item.teacher || "未填写"), 1),
                    createBaseVNode("div", _hoisted_7$2, " 地点：" + toDisplayString([item.building, item.room || item.room_code].filter(Boolean).join(" ") || "未填写"), 1),
                    createBaseVNode("div", _hoisted_8$2, " 时间：周" + toDisplayString(item.weekday) + " 第" + toDisplayString(item.period) + "-" + toDisplayString(unref(getCourseEndPeriod)(item)) + "节 ", 1)
                  ], 10, _hoisted_3$4);
                }), 128))
              ])) : (openBlock(), createElementBlock("div", _hoisted_9$2, [
                __props.selectedCourse?.is_custom ? (openBlock(), createElementBlock("div", _hoisted_10$2, [..._cache[8] || (_cache[8] = [
                  createBaseVNode("span", { class: "label" }, "类型", -1),
                  createBaseVNode("span", { class: "value" }, "自定义课程", -1)
                ])])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_11$2, [
                  _cache[9] || (_cache[9] = createBaseVNode("span", { class: "label" }, "教师", -1)),
                  createBaseVNode("span", _hoisted_12$2, toDisplayString(__props.selectedCourse?.teacher), 1)
                ]),
                createBaseVNode("div", _hoisted_13$2, [
                  _cache[10] || (_cache[10] = createBaseVNode("span", { class: "label" }, "教室", -1)),
                  createBaseVNode("span", _hoisted_14$2, toDisplayString(__props.selectedCourse?.room) + " (" + toDisplayString(__props.selectedCourse?.building) + ")", 1)
                ]),
                createBaseVNode("div", _hoisted_15$2, [
                  _cache[11] || (_cache[11] = createBaseVNode("span", { class: "label" }, "时间", -1)),
                  createBaseVNode("span", _hoisted_16$2, "周" + toDisplayString(__props.selectedCourse?.weekday) + " 第" + toDisplayString(__props.selectedCourse?.period) + "-" + toDisplayString(unref(getCourseEndPeriod)(__props.selectedCourse)) + "节", 1)
                ]),
                createBaseVNode("div", _hoisted_17$2, [
                  _cache[12] || (_cache[12] = createBaseVNode("span", { class: "label" }, "周次", -1)),
                  createBaseVNode("span", _hoisted_18$2, toDisplayString(__props.selectedCourse?.weeks_text) + "周", 1)
                ]),
                createBaseVNode("div", _hoisted_19$1, [
                  _cache[13] || (_cache[13] = createBaseVNode("span", { class: "label" }, "学分", -1)),
                  createBaseVNode("span", _hoisted_20, toDisplayString(__props.selectedCourse?.credit), 1)
                ]),
                createBaseVNode("div", _hoisted_21, [
                  _cache[14] || (_cache[14] = createBaseVNode("span", { class: "label" }, "教学班", -1)),
                  createBaseVNode("span", _hoisted_22, toDisplayString(__props.selectedCourse?.class_name), 1)
                ]),
                __props.selectedCourse?.is_custom ? (openBlock(), createElementBlock("div", _hoisted_23, [
                  createBaseVNode("button", {
                    class: "custom-delete-btn edit",
                    onClick: _cache[1] || (_cache[1] = ($event) => emit("open-edit-course", __props.selectedCourse, { reopenDetail: true }))
                  }, "修改课程"),
                  createBaseVNode("button", {
                    class: "custom-delete-btn week",
                    onClick: _cache[2] || (_cache[2] = ($event) => emit("delete-custom-course", "current_week"))
                  }, "删除这一周"),
                  createBaseVNode("button", {
                    class: "custom-delete-btn all",
                    onClick: _cache[3] || (_cache[3] = ($event) => emit("delete-custom-course", "all"))
                  }, "删除全部周次")
                ])) : createCommentVNode("", true)
              ])),
              createBaseVNode("div", _hoisted_24, [
                createBaseVNode("button", {
                  class: "detail-copy-btn",
                  onClick: _cache[4] || (_cache[4] = ($event) => emit("copy-detail"))
                }, "复制课程详情")
              ]),
              __props.detailActionError ? (openBlock(), createElementBlock("div", _hoisted_25, toDisplayString(__props.detailActionError), 1)) : createCommentVNode("", true)
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleCourseDetail = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-0d66fb78"]]);
const _hoisted_1$3 = { class: "modal-header" };
const _hoisted_2$3 = { class: "modal-body add-course-body" };
const _hoisted_3$3 = { class: "add-course-semester" };
const _hoisted_4$2 = { class: "add-field" };
const _hoisted_5$2 = { class: "add-field" };
const _hoisted_6$1 = { class: "add-field" };
const _hoisted_7$1 = { class: "add-field" };
const _hoisted_8$1 = ["value"];
const _hoisted_9$1 = { class: "add-row" };
const _hoisted_10$1 = { class: "add-field" };
const _hoisted_11$1 = ["value"];
const _hoisted_12$1 = { class: "add-field" };
const _hoisted_13$1 = ["value"];
const _hoisted_14$1 = { class: "add-field" };
const _hoisted_15$1 = { class: "add-field" };
const _hoisted_16$1 = {
  key: 0,
  class: "drawer-error add-course-error"
};
const _hoisted_17$1 = { class: "add-actions" };
const _hoisted_18$1 = ["disabled"];
const _hoisted_19 = ["disabled"];
const _sfc_main$4 = {
  __name: "ScheduleAddCourseDialog",
  props: {
    showAddCourse: { type: Boolean, default: false },
    courseDialogMode: { type: String, default: "add" },
    courseDialogSemester: { type: String, default: "" },
    addCourseForm: { type: Object, default: () => ({}) },
    addCourseError: { type: String, default: "" },
    addingCourse: { type: Boolean, default: false },
    courseSpanOptions: { type: Array, default: () => [] },
    addWeeksCountText: { type: String, default: "" }
  },
  emits: ["close", "submit", "open-week-picker"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const form = props.addCourseForm;
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      const _component_CourseColorPicker = resolveComponent("CourseColorPicker");
      return openBlock(), createBlock(Transition, { name: "fade" }, {
        default: withCtx(() => [
          __props.showAddCourse ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: _cache[12] || (_cache[12] = ($event) => emit("close"))
          }, [
            createBaseVNode("div", {
              class: "modal-content glass add-course-modal",
              onClick: _cache[11] || (_cache[11] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_1$3, [
                createBaseVNode("h3", null, toDisplayString(__props.courseDialogMode === "edit" ? "修改课程" : "添加课程"), 1),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_2$3, [
                createBaseVNode("div", _hoisted_3$3, "学期：" + toDisplayString(__props.courseDialogSemester), 1),
                createBaseVNode("label", _hoisted_4$2, [
                  _cache[13] || (_cache[13] = createBaseVNode("span", null, "课程名称 *", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => unref(form).name = $event),
                    type: "text",
                    placeholder: "请输入课程名称"
                  }, null, 512), [
                    [
                      vModelText,
                      unref(form).name,
                      void 0,
                      { trim: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_5$2, [
                  _cache[14] || (_cache[14] = createBaseVNode("span", null, "教师", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => unref(form).teacher = $event),
                    type: "text",
                    placeholder: "可选"
                  }, null, 512), [
                    [
                      vModelText,
                      unref(form).teacher,
                      void 0,
                      { trim: true }
                    ]
                  ])
                ]),
                createBaseVNode("label", _hoisted_6$1, [
                  _cache[15] || (_cache[15] = createBaseVNode("span", null, "上课地点", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => unref(form).room = $event),
                    type: "text",
                    placeholder: "可选"
                  }, null, 512), [
                    [
                      vModelText,
                      unref(form).room,
                      void 0,
                      { trim: true }
                    ]
                  ])
                ]),
                createBaseVNode("div", _hoisted_7$1, [
                  _cache[16] || (_cache[16] = createBaseVNode("span", null, "上课时间 *", -1)),
                  createVNode(_component_IOSSelect, {
                    modelValue: unref(form).weekday,
                    "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => unref(form).weekday = $event),
                    modelModifiers: { number: true }
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(unref(weekDayLabels), (label, idx) => {
                        return openBlock(), createElementBlock("option", {
                          key: label,
                          value: idx + 1
                        }, toDisplayString(label), 9, _hoisted_8$1);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_9$1, [
                  createBaseVNode("label", _hoisted_10$1, [
                    _cache[17] || (_cache[17] = createBaseVNode("span", null, "开始节次 *", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: unref(form).period,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => unref(form).period = $event),
                      modelModifiers: { number: true }
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(periodOptions), (p) => {
                          return openBlock(), createElementBlock("option", {
                            key: p,
                            value: p
                          }, "第" + toDisplayString(p) + "节", 9, _hoisted_11$1);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("label", _hoisted_12$1, [
                    _cache[18] || (_cache[18] = createBaseVNode("span", null, "上课节数 *", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: unref(form).djs,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => unref(form).djs = $event),
                      modelModifiers: { number: true }
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(__props.courseSpanOptions, (s) => {
                          return openBlock(), createElementBlock("option", {
                            key: s,
                            value: s
                          }, toDisplayString(s) + "节", 9, _hoisted_13$1);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ])
                ]),
                createBaseVNode("div", _hoisted_14$1, [
                  _cache[19] || (_cache[19] = createBaseVNode("span", null, "上课周次 *", -1)),
                  createBaseVNode("button", {
                    class: "week-picker-trigger",
                    onClick: _cache[7] || (_cache[7] = ($event) => emit("open-week-picker"))
                  }, toDisplayString(__props.addWeeksCountText), 1)
                ]),
                createBaseVNode("div", _hoisted_15$1, [
                  createVNode(_component_CourseColorPicker, {
                    modelValue: unref(form).color,
                    "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => unref(form).color = $event)
                  }, null, 8, ["modelValue"])
                ]),
                __props.addCourseError ? (openBlock(), createElementBlock("div", _hoisted_16$1, toDisplayString(__props.addCourseError), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_17$1, [
                createBaseVNode("button", {
                  class: "drawer-action ghost",
                  disabled: __props.addingCourse,
                  onClick: _cache[9] || (_cache[9] = ($event) => emit("close"))
                }, "取消", 8, _hoisted_18$1),
                createBaseVNode("button", {
                  class: "drawer-action",
                  disabled: __props.addingCourse,
                  onClick: _cache[10] || (_cache[10] = ($event) => emit("submit"))
                }, toDisplayString(__props.addingCourse ? `正在${__props.courseDialogMode === "edit" ? "修改" : "添加"}...` : `${__props.courseDialogMode === "edit" ? "修改" : "添加"}并确认`), 9, _hoisted_19)
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleAddCourseDialog = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-6e1577de"]]);
const _hoisted_1$2 = { class: "modal-header" };
const _hoisted_2$2 = { class: "modal-body manage-course-body" };
const _hoisted_3$2 = {
  key: 0,
  class: "manage-course-empty"
};
const _hoisted_4$1 = {
  key: 1,
  class: "manage-course-error"
};
const _hoisted_5$1 = {
  key: 2,
  class: "manage-course-empty"
};
const _hoisted_6 = {
  key: 3,
  class: "manage-course-groups"
};
const _hoisted_7 = ["onClick"];
const _hoisted_8 = { class: "manage-course-group-title" };
const _hoisted_9 = { class: "manage-course-group-arrow" };
const _hoisted_10 = {
  key: 0,
  class: "manage-course-list"
};
const _hoisted_11 = { class: "manage-course-card-main" };
const _hoisted_12 = { class: "manage-course-card-name" };
const _hoisted_13 = { class: "manage-course-card-meta" };
const _hoisted_14 = { class: "manage-course-card-meta" };
const _hoisted_15 = {
  key: 0,
  class: "manage-course-card-meta"
};
const _hoisted_16 = { class: "manage-course-card-actions" };
const _hoisted_17 = ["onClick"];
const _hoisted_18 = ["onClick"];
const _sfc_main$3 = {
  __name: "ScheduleManageCoursesDialog",
  props: {
    showManageCourses: { type: Boolean, default: false },
    loadingManageCourses: { type: Boolean, default: false },
    manageCoursesError: { type: String, default: "" },
    managedCourseGroups: { type: Array, default: () => [] },
    manageExpandedSemesters: { type: Object, default: () => ({}) }
  },
  emits: ["close", "toggle-semester", "edit-course", "delete-course"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "fade" }, {
        default: withCtx(() => [
          __props.showManageCourses ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: _cache[2] || (_cache[2] = ($event) => emit("close"))
          }, [
            createBaseVNode("div", {
              class: "modal-content glass manage-course-modal",
              onClick: _cache[1] || (_cache[1] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_1$2, [
                _cache[3] || (_cache[3] = createBaseVNode("h3", null, "管理课程", -1)),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_2$2, [
                __props.loadingManageCourses ? (openBlock(), createElementBlock("div", _hoisted_3$2, "正在加载自定义课程...")) : __props.manageCoursesError ? (openBlock(), createElementBlock("div", _hoisted_4$1, toDisplayString(__props.manageCoursesError), 1)) : !__props.managedCourseGroups.length ? (openBlock(), createElementBlock("div", _hoisted_5$1, "暂未添加自定义课程")) : (openBlock(), createElementBlock("div", _hoisted_6, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(__props.managedCourseGroups, (group) => {
                    return openBlock(), createElementBlock("section", {
                      key: group.semester,
                      class: "manage-course-group"
                    }, [
                      createBaseVNode("button", {
                        class: "manage-course-group-header",
                        onClick: ($event) => emit("toggle-semester", group.semester)
                      }, [
                        createBaseVNode("div", _hoisted_8, [
                          createBaseVNode("strong", null, toDisplayString(group.semester), 1),
                          createBaseVNode("span", null, toDisplayString(group.courses.length) + " 门", 1)
                        ]),
                        createBaseVNode("span", _hoisted_9, toDisplayString(__props.manageExpandedSemesters[group.semester] ? "收起" : "展开"), 1)
                      ], 8, _hoisted_7),
                      __props.manageExpandedSemesters[group.semester] ? (openBlock(), createElementBlock("div", _hoisted_10, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(group.courses, (course) => {
                          return openBlock(), createElementBlock("article", {
                            key: `${group.semester}-${course.source_id || course.id}`,
                            class: "manage-course-card"
                          }, [
                            createBaseVNode("div", _hoisted_11, [
                              createBaseVNode("div", _hoisted_12, toDisplayString(course.name), 1),
                              createBaseVNode("div", _hoisted_13, toDisplayString(unref(weekDayLabels)[(course.weekday || 1) - 1]) + " 第" + toDisplayString(course.period) + "-" + toDisplayString(unref(getCourseEndPeriod)(course)) + "节 ", 1),
                              createBaseVNode("div", _hoisted_14, "周次：" + toDisplayString(course.weeks_text), 1),
                              course.teacher || course.room ? (openBlock(), createElementBlock("div", _hoisted_15, toDisplayString([course.teacher, course.room].filter(Boolean).join(" · ")), 1)) : createCommentVNode("", true)
                            ]),
                            createBaseVNode("div", _hoisted_16, [
                              createBaseVNode("button", {
                                class: "manage-course-btn edit",
                                onClick: ($event) => emit("edit-course", course)
                              }, "修改", 8, _hoisted_17),
                              createBaseVNode("button", {
                                class: "manage-course-btn delete",
                                onClick: ($event) => emit("delete-course", course)
                              }, "删除", 8, _hoisted_18)
                            ])
                          ]);
                        }), 128))
                      ])) : createCommentVNode("", true)
                    ]);
                  }), 128))
                ]))
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleManageCoursesDialog = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-d5b3f456"]]);
const _hoisted_1$1 = { class: "week-picker-sheet" };
const _hoisted_2$1 = { class: "week-picker-header" };
const _hoisted_3$1 = { class: "week-picker-ops" };
const _hoisted_4 = { class: "week-picker-grid" };
const _hoisted_5 = ["onClick"];
const _sfc_main$2 = {
  __name: "ScheduleWeekPicker",
  props: {
    showWeekPicker: { type: Boolean, default: false },
    semesterWeekOptions: { type: Array, default: () => [] },
    selectedWeeks: { type: Array, default: () => [] }
  },
  emits: ["close", "toggle-week", "select-all", "clear-all"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "sheet-up" }, {
          default: withCtx(() => [
            __props.showWeekPicker ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "week-picker-mask",
              onClick: _cache[3] || (_cache[3] = withModifiers(($event) => emit("close"), ["self"]))
            }, [
              createBaseVNode("div", _hoisted_1$1, [
                createBaseVNode("div", _hoisted_2$1, [
                  _cache[4] || (_cache[4] = createBaseVNode("div", { class: "week-picker-title" }, "选择周次", -1)),
                  createBaseVNode("div", _hoisted_3$1, [
                    createBaseVNode("button", {
                      onClick: _cache[0] || (_cache[0] = ($event) => emit("select-all"))
                    }, "全选"),
                    createBaseVNode("button", {
                      onClick: _cache[1] || (_cache[1] = ($event) => emit("clear-all"))
                    }, "清空")
                  ])
                ]),
                createBaseVNode("div", _hoisted_4, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(__props.semesterWeekOptions, (week) => {
                    return openBlock(), createElementBlock("button", {
                      key: week,
                      class: normalizeClass(["week-cell", { active: __props.selectedWeeks.includes(week) }]),
                      onClick: ($event) => emit("toggle-week", week)
                    }, " 第" + toDisplayString(week) + "周 ", 11, _hoisted_5);
                  }), 128))
                ]),
                createBaseVNode("button", {
                  class: "week-picker-confirm",
                  onClick: _cache[2] || (_cache[2] = ($event) => emit("close"))
                }, "完成")
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ]);
    };
  }
};
const ScheduleWeekPicker = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-adce8b4a"]]);
const _hoisted_1 = { class: "confirm-title" };
const _hoisted_2 = { class: "confirm-lines" };
const _hoisted_3 = { class: "confirm-actions" };
const _sfc_main$1 = {
  __name: "ScheduleConfirmDialog",
  props: {
    showConfirmDialog: { type: Boolean, default: false },
    confirmDialogTitle: { type: String, default: "" },
    confirmDialogLines: { type: Array, default: () => [] },
    confirmDialogConfirmText: { type: String, default: "确认" },
    confirmDialogCancelText: { type: String, default: "取消" },
    confirmDialogDanger: { type: Boolean, default: false }
  },
  emits: ["confirm"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "fade" }, {
        default: withCtx(() => [
          __props.showConfirmDialog ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay confirm-overlay",
            onClick: _cache[3] || (_cache[3] = ($event) => emit("confirm", false))
          }, [
            createBaseVNode("div", {
              class: "modal-content confirm-modal",
              onClick: _cache[2] || (_cache[2] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_1, toDisplayString(__props.confirmDialogTitle), 1),
              createBaseVNode("div", _hoisted_2, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(__props.confirmDialogLines, (line, idx) => {
                  return openBlock(), createElementBlock("p", {
                    key: `confirm-${idx}`
                  }, toDisplayString(line), 1);
                }), 128))
              ]),
              createBaseVNode("div", _hoisted_3, [
                createBaseVNode("button", {
                  class: "confirm-btn cancel",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("confirm", false))
                }, toDisplayString(__props.confirmDialogCancelText), 1),
                createBaseVNode("button", {
                  class: normalizeClass(["confirm-btn", { danger: __props.confirmDialogDanger }]),
                  onClick: _cache[1] || (_cache[1] = ($event) => emit("confirm", true))
                }, toDisplayString(__props.confirmDialogConfirmText), 3)
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleConfirmDialog = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-16c82ab5"]]);
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "ScheduleView",
  props: {
    studentId: { type: String, default: "" },
    widgetDate: { type: String, default: "" },
    widgetPeriod: { type: Number, default: 0 }
  },
  emits: ["back", "logout", "widget-deeplink-consumed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const confirmDialog = useConfirmDialog();
    const menu = useScheduleMenu({ props });
    const semesterApi = useScheduleSemester({
      // 惰性求值：运行时各弹层状态均已就绪
      isAnyOverlayOpen: () => anyOverlayOpen.value
    });
    const data = useScheduleData(props, emit, { semester: semesterApi });
    const grid = useScheduleGrid({ data, semester: semesterApi, menu });
    const detail = useScheduleDetail({ data, semester: semesterApi });
    const editor = useScheduleEditor({ props, data, semester: semesterApi, detail, menu, confirmDialog });
    const io = useScheduleIO({ props, data, semester: semesterApi, editor, confirmDialog });
    const sync = useScheduleSync({ props, data, semester: semesterApi, editor, confirmDialog });
    const anyOverlayOpen = computed(() => {
      return menu.showMenu.value || menu.showSemesterBadgePopover.value || menu.showSemesterPopup.value || detail.showDetail.value || editor.showAddCourse.value || editor.showManageCourses.value || editor.showWeekPicker.value || confirmDialog.showConfirmDialog.value;
    });
    const {
      semester,
      semesterDraft,
      currentWeek,
      selectedWeek,
      totalWeeks,
      vacationNotice,
      weekDates,
      currentMonth,
      semesterWeekOptions,
      weekTransitionName,
      jumpToCurrentWeek
    } = semesterApi;
    const {
      showMenu,
      scheduleCourseCardStyle,
      courseCardRefreshNonce,
      styleOptions,
      toggleMenu,
      setScheduleCourseCardStyle
    } = menu;
    const {
      loading,
      errorMsg,
      offline,
      offlineHint,
      syncTime,
      initialFetchDone,
      semesterOptions,
      semesterLoading,
      semesterError,
      loadingManageCourses,
      manageCoursesError,
      managedCourseGroups,
      manageExpandedSemesters
    } = data;
    const { showDetail, selectedCourse, detailActionError } = detail;
    const {
      showAddCourse,
      courseDialogMode,
      courseDialogSemester,
      addCourseForm,
      addCourseError,
      addingCourse,
      courseSpanOptions,
      addWeeksCountText,
      showManageCourses,
      showWeekPicker
    } = editor;
    const {
      exporting,
      exportingMode,
      exportUrl,
      exportError,
      exportCopied,
      customCourseExporting,
      customCourseImporting,
      customCourseExportLocation
    } = io;
    const {
      syncUploading,
      syncDownloading,
      syncStatusText,
      syncUploadCooldownText,
      syncDownloadCooldownText
    } = sync;
    const {
      showConfirmDialog,
      confirmDialogTitle,
      confirmDialogLines,
      confirmDialogConfirmText,
      confirmDialogCancelText,
      confirmDialogDanger
    } = confirmDialog;
    const offlineBannerText = computed(() => {
      if (offlineHint.value) return offlineHint.value;
      if (syncTime.value) {
        return `当前显示为离线数据，更新于${formatRelativeTime(syncTime.value)}`;
      }
      return "当前显示为离线数据";
    });
    const handleToggleMenu = () => {
      toggleMenu();
      if (!showMenu.value) {
        exportCopied.value = false;
      }
    };
    const closeMenu = () => {
      showMenu.value = false;
      exportCopied.value = false;
    };
    const openAddCourseDialog = () => {
      showMenu.value = false;
      void editor.openAddCourseDialog();
    };
    const handleEditManagedCourse = (course) => {
      void editor.openEditCourseDialog(course, { reopenManage: true });
    };
    const handleSemesterChange = () => {
      void data.onSemesterChange();
    };
    watch(
      () => props.studentId,
      async (nextSid, prevSid) => {
        sync.refreshCloudSyncCooldown();
        const next = String(nextSid || "").trim();
        const prev = String(prevSid || "").trim();
        if (!next || next === prev) return;
        const targetSemester = String(
          semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()
        ).trim();
        if (targetSemester) {
          const hasRenderSnapshot = data.applyStoredScheduleRenderSnapshot(targetSemester, { markBoot: false });
          const hasInstantCache = hasRenderSnapshot || data.applyCachedScheduleImmediately(targetSemester);
          if (hasInstantCache) {
            initialFetchDone.value = true;
            errorMsg.value = "";
          }
        }
        void data.fetchSchedule(targetSemester);
      }
    );
    let widgetHighlightTimer = null;
    watch(
      () => props.widgetDate,
      (dateStr) => {
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
        if (!semesterApi.startDateStr.value) return;
        const targetDate = /* @__PURE__ */ new Date(`${dateStr}T00:00:00+08:00`);
        const startDate = /* @__PURE__ */ new Date(`${semesterApi.startDateStr.value}T00:00:00+08:00`);
        if (Number.isNaN(targetDate.getTime()) || Number.isNaN(startDate.getTime())) return;
        const diffMs = targetDate.getTime() - startDate.getTime();
        const diffDays = Math.round(diffMs / 864e5);
        const targetWeek = Math.max(1, Math.floor(diffDays / 7) + 1);
        const targetDay = diffDays % 7 + 1;
        const maxWeeks = Math.max(1, Number(totalWeeks.value || 1));
        if (targetWeek >= 1 && targetWeek <= maxWeeks) {
          selectedWeek.value = targetWeek;
        }
        const period = Number(props.widgetPeriod) || 0;
        grid.setWidgetHighlight(targetDay, period);
        nextTick(() => {
          semesterApi.scrollToWidgetTarget(targetDay, period);
        });
        if (widgetHighlightTimer) clearTimeout(widgetHighlightTimer);
        widgetHighlightTimer = setTimeout(() => {
          grid.clearWidgetHighlight();
          widgetHighlightTimer = null;
        }, 3e3);
        emit("widget-deeplink-consumed");
      },
      { immediate: true }
    );
    onMounted(async () => {
      window.addEventListener("keydown", semesterApi.handleWeekKeydown);
      window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, sync.handleCloudSyncUpdated);
      window.addEventListener("hbu-session-online", data.handleSessionOnline);
      window.addEventListener("hbu-session-logout", data.handleSessionLogout);
      document.addEventListener("visibilitychange", sync.handleScheduleVisibilityChange);
      sync.refreshCloudSyncCooldown();
      sync.ensureCloudSyncCooldownTimer();
      void data.fetchSemesterOptions();
      const switchSemester = consumeScheduleSwitchPending(props.studentId);
      if (switchSemester) {
        writeScheduleLock(props.studentId, switchSemester, "pending-switch");
        semester.value = switchSemester;
        semesterDraft.value = switchSemester;
      }
      const lockDetail = readScheduleLockDetail(props.studentId);
      const todaySemester = deriveSemesterByDate();
      if (lockDetail?.semester && todaySemester && lockDetail.semester !== todaySemester && isAutoScheduleLockReason(lockDetail.reason)) {
        const cleared = clearScheduleLock(props.studentId);
        if (cleared) {
          pushDebugLog(
            "Schedule",
            `检测到自动锁定学期(${lockDetail.semester})与当前日期学期(${todaySemester})冲突，已清理并重探测`,
            "warn"
          );
        }
      }
      const lockedSemester = String(readScheduleLock(props.studentId) || "").trim();
      const startupSemester = String(
        semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()
      ).trim();
      const startupRenderSnapshot = data.initialRenderSnapshotApplied || (startupSemester ? data.applyStoredScheduleRenderSnapshot(startupSemester, { markBoot: false }) : false);
      const startupCached = startupRenderSnapshot || (startupSemester ? data.applyCachedScheduleImmediately(startupSemester) : false);
      if (startupCached) {
        initialFetchDone.value = true;
        errorMsg.value = "";
        void data.loadCustomCourses(startupSemester);
      }
      if (lockedSemester) {
        semester.value = lockedSemester;
        semesterDraft.value = lockedSemester;
        const hasInstantCache = data.applyCachedScheduleImmediately(lockedSemester);
        if (hasInstantCache) {
          void data.loadCustomCourses(lockedSemester);
          void data.fetchSchedule(lockedSemester);
        } else {
          await data.fetchSchedule(lockedSemester);
        }
      } else if (props.studentId) {
        const probeAndRefresh = async () => {
          const warmed = await warmupScheduleForStudent(props.studentId, {
            forceProbe: true,
            reason: "first-enter"
          });
          if (warmed?.success && warmed?.semester) {
            semester.value = warmed.semester;
            semesterDraft.value = warmed.semester;
            if (!data.applySchedulePayload(warmed.payload, warmed.semester)) {
              await data.fetchSchedule(warmed.semester);
            } else {
              await data.loadCustomCourses(warmed.semester);
            }
          } else {
            await data.fetchSchedule();
          }
        };
        if (startupCached) {
          void probeAndRefresh();
        } else {
          await probeAndRefresh();
        }
      } else {
        if (!startupCached) {
          await data.fetchSchedule();
        }
      }
      const pendingSemester = consumePendingSemesterPopup(props.studentId);
      if (pendingSemester) {
        menu.openSemesterPopup(pendingSemester);
        return;
      }
      if (!menu.isPopupShown()) {
        menu.openSemesterPopup(semester.value || semesterDraft.value);
      }
      document.addEventListener("click", menu.closeSemesterBadgePopover);
    });
    onBeforeUnmount(() => {
      data.persistScheduleRenderSnapshot("component-unmount");
      window.removeEventListener("keydown", semesterApi.handleWeekKeydown);
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, sync.handleCloudSyncUpdated);
      window.removeEventListener("hbu-session-online", data.handleSessionOnline);
      window.removeEventListener("hbu-session-logout", data.handleSessionLogout);
      document.removeEventListener("visibilitychange", sync.handleScheduleVisibilityChange);
      document.removeEventListener("click", menu.closeSemesterBadgePopover);
      sync.clearCloudSyncCooldownTimer();
      if (widgetHighlightTimer) {
        clearTimeout(widgetHighlightTimer);
        widgetHighlightTimer = null;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "schedule-view",
        onTouchstartPassive: _cache[5] || (_cache[5] = //@ts-ignore
        (...args) => unref(semesterApi).handleTouchStart && unref(semesterApi).handleTouchStart(...args)),
        onTouchmovePassive: _cache[6] || (_cache[6] = //@ts-ignore
        (...args) => unref(semesterApi).handleTouchMove && unref(semesterApi).handleTouchMove(...args)),
        onTouchendPassive: _cache[7] || (_cache[7] = //@ts-ignore
        (...args) => unref(semesterApi).handleTouchEnd && unref(semesterApi).handleTouchEnd(...args)),
        onTouchcancelPassive: _cache[8] || (_cache[8] = //@ts-ignore
        (...args) => unref(semesterApi).handleTouchEnd && unref(semesterApi).handleTouchEnd(...args))
      }, [
        createVNode(ScheduleTopbar, {
          semester: unref(semester),
          "selected-week": unref(selectedWeek),
          "total-weeks": unref(totalWeeks),
          "onUpdate:selectedWeek": _cache[0] || (_cache[0] = ($event) => selectedWeek.value = $event),
          onToggleMenu: handleToggleMenu
        }, null, 8, ["semester", "selected-week", "total-weeks"]),
        createVNode(ScheduleDrawer, {
          "show-menu": unref(showMenu),
          "semester-options": unref(semesterOptions),
          "semester-draft": unref(semesterDraft),
          "semester-loading": unref(semesterLoading),
          loading: unref(loading),
          "semester-error": unref(semesterError),
          "schedule-course-card-style": unref(scheduleCourseCardStyle),
          "style-options": unref(styleOptions),
          "adding-course": unref(addingCourse),
          "loading-manage-courses": unref(loadingManageCourses),
          "sync-uploading": unref(syncUploading),
          "sync-downloading": unref(syncDownloading),
          "custom-course-importing": unref(customCourseImporting),
          "custom-course-exporting": unref(customCourseExporting),
          "sync-upload-cooldown-text": unref(syncUploadCooldownText),
          "sync-download-cooldown-text": unref(syncDownloadCooldownText),
          "sync-status-text": unref(syncStatusText),
          "custom-course-export-location": unref(customCourseExportLocation),
          exporting: unref(exporting),
          "exporting-mode": unref(exportingMode),
          "export-url": unref(exportUrl),
          "export-error": unref(exportError),
          "export-copied": unref(exportCopied),
          onClose: closeMenu,
          "onUpdate:semesterDraft": _cache[1] || (_cache[1] = ($event) => semesterDraft.value = $event),
          onSemesterChange: handleSemesterChange,
          onSetStyle: unref(setScheduleCourseCardStyle),
          onOpenAddCourse: openAddCourseDialog,
          onOpenManageCourses: unref(editor).openManageCoursesDialog,
          onSyncUpload: unref(sync).handleCloudSyncUpload,
          onSyncDownload: unref(sync).handleCloudSyncDownload,
          onExportJson: unref(io).exportCustomCoursesJson,
          onImportJson: unref(io).triggerImportCustomCourses,
          onImportFile: unref(io).handleCustomCourseFileChange,
          onExportCalendar: unref(io).exportCalendar,
          onCopyExportUrl: unref(io).copyExportUrl
        }, null, 8, ["show-menu", "semester-options", "semester-draft", "semester-loading", "loading", "semester-error", "schedule-course-card-style", "style-options", "adding-course", "loading-manage-courses", "sync-uploading", "sync-downloading", "custom-course-importing", "custom-course-exporting", "sync-upload-cooldown-text", "sync-download-cooldown-text", "sync-status-text", "custom-course-export-location", "exporting", "exporting-mode", "export-url", "export-error", "export-copied", "onSetStyle", "onOpenManageCourses", "onSyncUpload", "onSyncDownload", "onExportJson", "onImportJson", "onImportFile", "onExportCalendar", "onCopyExportUrl"]),
        createVNode(ScheduleBanners, {
          offline: unref(offline),
          "initial-fetch-done": unref(initialFetchDone),
          loading: unref(loading),
          "offline-banner-text": offlineBannerText.value,
          "vacation-notice": unref(vacationNotice),
          "error-msg": unref(errorMsg),
          "current-week": unref(currentWeek),
          "selected-week": unref(selectedWeek),
          onJumpCurrent: unref(jumpToCurrentWeek)
        }, null, 8, ["offline", "initial-fetch-done", "loading", "offline-banner-text", "vacation-notice", "error-msg", "current-week", "selected-week", "onJumpCurrent"]),
        createVNode(ScheduleGrid, {
          "week-dates": unref(weekDates),
          "current-month": unref(currentMonth),
          "selected-week": unref(selectedWeek),
          "week-transition-name": unref(weekTransitionName),
          "schedule-course-card-style": unref(scheduleCourseCardStyle),
          "course-card-refresh-nonce": unref(courseCardRefreshNonce),
          "get-courses-for-day": unref(grid).getCoursesForDay,
          "get-course-style": unref(grid).getCourseCardStyle,
          "is-widget-highlighted": unref(grid).isWidgetHighlighted,
          onOpenDetail: unref(detail).openDetail
        }, null, 8, ["week-dates", "current-month", "selected-week", "week-transition-name", "schedule-course-card-style", "course-card-refresh-nonce", "get-courses-for-day", "get-course-style", "is-widget-highlighted", "onOpenDetail"]),
        createVNode(ScheduleCourseDetail, {
          "show-detail": unref(showDetail),
          "selected-course": unref(selectedCourse),
          "detail-action-error": unref(detailActionError),
          onClose: _cache[2] || (_cache[2] = ($event) => showDetail.value = false),
          onOpenConflictCourseDetail: unref(detail).openConflictCourseDetail,
          onOpenEditCourse: unref(editor).openEditCourseDialog,
          onDeleteCustomCourse: unref(editor).deleteCustomCourse,
          onCopyDetail: unref(detail).copySelectedCourseDetail
        }, null, 8, ["show-detail", "selected-course", "detail-action-error", "onOpenConflictCourseDetail", "onOpenEditCourse", "onDeleteCustomCourse", "onCopyDetail"]),
        createVNode(ScheduleAddCourseDialog, {
          "show-add-course": unref(showAddCourse),
          "course-dialog-mode": unref(courseDialogMode),
          "course-dialog-semester": unref(courseDialogSemester),
          "add-course-form": unref(addCourseForm),
          "add-course-error": unref(addCourseError),
          "adding-course": unref(addingCourse),
          "course-span-options": unref(courseSpanOptions),
          "add-weeks-count-text": unref(addWeeksCountText),
          onClose: unref(editor).closeAddCourseDialog,
          onSubmit: unref(editor).submitAddCourse,
          onOpenWeekPicker: _cache[3] || (_cache[3] = ($event) => showWeekPicker.value = true)
        }, null, 8, ["show-add-course", "course-dialog-mode", "course-dialog-semester", "add-course-form", "add-course-error", "adding-course", "course-span-options", "add-weeks-count-text", "onClose", "onSubmit"]),
        createVNode(ScheduleManageCoursesDialog, {
          "show-manage-courses": unref(showManageCourses),
          "loading-manage-courses": unref(loadingManageCourses),
          "manage-courses-error": unref(manageCoursesError),
          "managed-course-groups": unref(managedCourseGroups),
          "manage-expanded-semesters": unref(manageExpandedSemesters),
          onClose: unref(editor).closeManageCoursesDialog,
          onToggleSemester: unref(editor).toggleManageSemester,
          onEditCourse: handleEditManagedCourse,
          onDeleteCourse: unref(editor).deleteManagedCourse
        }, null, 8, ["show-manage-courses", "loading-manage-courses", "manage-courses-error", "managed-course-groups", "manage-expanded-semesters", "onClose", "onToggleSemester", "onDeleteCourse"]),
        createVNode(ScheduleWeekPicker, {
          "show-week-picker": unref(showWeekPicker),
          "semester-week-options": unref(semesterWeekOptions),
          "selected-weeks": unref(addCourseForm).weeks,
          onClose: _cache[4] || (_cache[4] = ($event) => showWeekPicker.value = false),
          onToggleWeek: unref(editor).toggleAddCourseWeek,
          onSelectAll: unref(editor).selectAllAddCourseWeeks,
          onClearAll: unref(editor).clearAddCourseWeeks
        }, null, 8, ["show-week-picker", "semester-week-options", "selected-weeks", "onToggleWeek", "onSelectAll", "onClearAll"]),
        createVNode(ScheduleConfirmDialog, {
          "show-confirm-dialog": unref(showConfirmDialog),
          "confirm-dialog-title": unref(confirmDialogTitle),
          "confirm-dialog-lines": unref(confirmDialogLines),
          "confirm-dialog-confirm-text": unref(confirmDialogConfirmText),
          "confirm-dialog-cancel-text": unref(confirmDialogCancelText),
          "confirm-dialog-danger": unref(confirmDialogDanger),
          onConfirm: unref(confirmDialog).closeConfirmDialog
        }, null, 8, ["show-confirm-dialog", "confirm-dialog-title", "confirm-dialog-lines", "confirm-dialog-confirm-text", "confirm-dialog-cancel-text", "confirm-dialog-danger", "onConfirm"])
      ], 32);
    };
  }
});
const ScheduleView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-fbbb885e"]]);
export {
  ScheduleView as default
};
