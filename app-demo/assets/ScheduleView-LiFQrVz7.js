import { b as useUiSettings, h as flushUiSettings, t, j as showToast, x as recordSemesterStartDate, y as readScheduleRenderSnapshot, z as writeScheduleRenderSnapshot, f as fetchWithCache, d as axiosInstance, E as EXTRA_LONG_TTL, D as DEFAULT_SWR_OPTIONS, n as normalizeSemesterList, k as resolveCurrentSemester, A as afterScheduleRefresh, B as writeScheduleLock, C as getCachedScheduleSnapshot, F as restoreOfficialCourseToSchedule, G as removeOfficialCourseFromSchedule, H as listRemovedOfficialCourses, I as buildOfficialCourseIdentityKey, J as buildEffectiveSchedule, K as tryWriteSnapshotFromCache, M as reconcileLocalReminders, m as useI18n, N as runCloudSyncDownload, O as runCloudSyncUpload, P as getCloudSyncCooldownState, r as readScheduleLockDetail, Q as isAutoScheduleLockReason, R as semesterIsNewer, T as probeSemesterSchedule, U as readSemesterStartDates, _ as _export_sfc, V as CLOUD_SYNC_UPDATED_EVENT, W as consumeScheduleSwitchPending, X as clearScheduleLock, Y as readScheduleLock, Z as warmupScheduleForStudent } from "./app-demo-DqAlnDLf.js";
import { p as pushDebugLog, i as isTestAccountSession, P as isMobileLike, a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-i9KZPKjs.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { r as ref, v as watch, h as computed, C as nextTick, M as resolveComponent, a as openBlock, c as createElementBlock, b as createBaseVNode, u as unref, t as toDisplayString, p as createVNode, k as withCtx, F as Fragment, f as renderList, d as createCommentVNode, T as Transition, w as withModifiers, g as createTextVNode, n as normalizeClass, m as withKeys, e as normalizeStyle, j as createBlock, o as onMounted, l as onBeforeUnmount, s as Teleport, K as withDirectives, L as vModelText, P as vModelSelect, y as defineComponent } from "./vue-core-Dzs4fLAU.js";
import { g as getScheduleViewModeOptions, a as getCourseCardStyleOptions, S as SCHEDULE_META_KEY, b as getWeekDays, n as normalizeOptionalCourseColor, D as DEFAULT_COURSE_COLOR, p as processScheduleData, c as getCourseStyle, d as buildWeekCoursesWithColors, e as getCourseEndPeriod, f as periodOptions, h as getWeekDayLabels, L as LOGIN_SESSION_TOKEN_KEY, i as buildExportEventsForSemester, j as buildExportEventsForWeek, r as resolveSemesterDateRange, k as resolveWeekDateRange, m as mergePersonalEventsIntoExport, l as createTimestampSuffix, C as COURSE_COLOR_PRESETS, o as pickBestThemeCandidate, q as hashText, s as normalizeHexColor, t as findPresetByHex, u as normalizeScheduleEvent, v as parseClockToMinute, w as getCourseRealInterval, x as intervalsOverlap, y as courseThemes, z as isValidCalendarDate, A as ALLOWED_REMINDER_MINUTES, B as toScheduleEventPayload, E as timeSchedule, M as MINUTES_PER_DAY, F as getGridTotalHeight, G as intervalToGridRect, H as buildScheduleTimeGeometry, I as MAX_PERIOD, J as hexToHsv, K as hsvToHex, R as REMINDER_OPTIONS } from "./eventTypes-Bo1oTXbU.js";
import { h as hasBootMetric, m as markBootMetric } from "./debug-tools-93yJPXbp.js";
import { t as tf } from "./i18n_text-DaGKXvNF.js";
import "./more-modules-rEERMQm_.js";
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
const normalizeScheduleViewMode = (value) => value === "courses" || value === "events" ? value : "all";
const useScheduleMenu = () => {
  const uiSettings = useUiSettings();
  const showMenu = ref(false);
  const scheduleCourseCardStyle = ref(normalizeCourseCardStyle(uiSettings.scheduleCourseCardStyle));
  const scheduleViewMode = ref(normalizeScheduleViewMode(uiSettings.scheduleViewMode));
  const courseCardRefreshNonce = ref(0);
  const styleOptions = computed(() => getCourseCardStyleOptions());
  const viewModeOptions = computed(() => getScheduleViewModeOptions());
  watch(
    () => uiSettings.scheduleCourseCardStyle,
    (value) => {
      scheduleCourseCardStyle.value = normalizeCourseCardStyle(value);
      pushDebugLog("Schedule", `Schedule style state synced: ${scheduleCourseCardStyle.value}`, "debug");
    },
    { immediate: true }
  );
  watch(
    () => uiSettings.scheduleViewMode,
    (value) => {
      scheduleViewMode.value = normalizeScheduleViewMode(value);
      pushDebugLog("Schedule", `Schedule view mode synced: ${scheduleViewMode.value}`, "debug");
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
    pushDebugLog("Schedule", `Schedule style switched: ${nextStyle}`, "info");
    try {
      const snapshot = JSON.parse(localStorage.getItem("hbu_ui_settings_v2") || "{}");
      pushDebugLog(
        "Schedule",
        `Schedule style persisted to local cache: ${String(snapshot?.scheduleCourseCardStyle || "") || "unknown"}`,
        "debug"
      );
    } catch (error) {
      pushDebugLog("Schedule", "Failed to read schedule style cache", "warn", error);
    }
    const styleLabelMap = {
      modern: t("schedule.menu.styleModern"),
      traditional: t("schedule.menu.styleTraditional"),
      class: t("schedule.menu.styleClass")
    };
    showToast(t("schedule.menu.styleToast").replace("{t}", styleLabelMap[nextStyle] || t("schedule.menu.styleModern")), "success");
  };
  const setScheduleViewMode = (value) => {
    const nextMode = normalizeScheduleViewMode(value);
    if (scheduleViewMode.value === nextMode) return;
    scheduleViewMode.value = nextMode;
    uiSettings.scheduleViewMode = nextMode;
    flushUiSettings();
    pushDebugLog("Schedule", `Schedule view mode switched: ${nextMode}`, "info");
  };
  const anyOverlayOpen = computed(() => showMenu.value);
  return {
    showMenu,
    scheduleCourseCardStyle,
    scheduleViewMode,
    courseCardRefreshNonce,
    styleOptions,
    viewModeOptions,
    anyOverlayOpen,
    toggleMenu,
    setScheduleCourseCardStyle,
    setScheduleViewMode
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
const readStoredSemesterMeta = () => {
  try {
    const raw = localStorage.getItem(SCHEDULE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};
const readStoredSemester = () => {
  return String(readStoredSemesterMeta()?.semester || "").trim();
};
const getNextSemesterString = (semester) => {
  const m = String(semester || "").trim().match(/^(\d{4})-(\d{4})-([12])$/);
  if (!m) return "";
  const startYear = Number(m[1]);
  const endYear = Number(m[2]);
  const term = Number(m[3]);
  if (endYear !== startYear + 1) return "";
  if (term === 1) return `${startYear}-${endYear}-2`;
  return `${endYear}-${endYear + 1}-1`;
};
const SEMESTER_SWITCH_LEAD_DAYS = 3;
const parseSemesterLocalDate = (text) => {
  const raw = String(text || "").trim();
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};
const startOfDay = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
const resolveSemesterByStartDate = (entries, today = /* @__PURE__ */ new Date(), leadDays = SEMESTER_SWITCH_LEAD_DAYS) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const baseDay = startOfDay(today instanceof Date && !Number.isNaN(today.getTime()) ? today : /* @__PURE__ */ new Date());
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.floor(Number(leadDays))) : SEMESTER_SWITCH_LEAD_DAYS;
  const cutoff = new Date(baseDay);
  cutoff.setDate(cutoff.getDate() + lead);
  let best = null;
  for (const entry of entries) {
    const semester = String(entry?.semester || "").trim();
    if (!semester) continue;
    const start = parseSemesterLocalDate(entry?.start_date);
    if (!start) continue;
    if (start.getTime() > cutoff.getTime()) continue;
    if (!best || start.getTime() > best.start.getTime()) {
      best = { semester, start };
    }
  }
  return best ? best.semester : null;
};
const isSemesterStartWithinLeadWindow = (startDate, today = /* @__PURE__ */ new Date(), leadDays = SEMESTER_SWITCH_LEAD_DAYS) => {
  const start = parseSemesterLocalDate(startDate);
  if (!start) return false;
  const baseDay = startOfDay(today instanceof Date && !Number.isNaN(today.getTime()) ? today : /* @__PURE__ */ new Date());
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.floor(Number(leadDays))) : SEMESTER_SWITCH_LEAD_DAYS;
  const cutoff = new Date(baseDay);
  cutoff.setDate(cutoff.getDate() + lead);
  return start.getTime() <= cutoff.getTime();
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
        dayLabel: getWeekDays()[i],
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
      if (resolvedSemester && startDateStr.value) {
        recordSemesterStartDate(resolvedSemester, startDateStr.value);
      }
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
const mergeScheduleSources = (state, visibility = {}) => {
  const merged = buildEffectiveSchedule(
    visibility.studentId || "",
    visibility.semester || "",
    state.remoteScheduleData.value,
    state.customScheduleData.value
  );
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
  const removedOfficialCourses = ref([]);
  const API_BASE = "/api";
  const sortSemesterKeys = (a, b) => {
    const currentSemester = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    if (a === currentSemester && b !== currentSemester) return -1;
    if (b === currentSemester && a !== currentSemester) return 1;
    return String(b).localeCompare(String(a), "zh-CN", { numeric: true });
  };
  const getFallbackSemester = () => String(semester.semester.value || semester.semesterDraft.value || "").trim();
  const mergeCurrentScheduleSources = () => mergeScheduleSources(
    { remoteScheduleData, customScheduleData, scheduleData },
    {
      studentId: String(props.studentId || "").trim(),
      semester: getFallbackSemester()
    }
  );
  const refreshRemovedOfficialCourses = (_targetSemester = "") => {
    const sid = String(props.studentId || "").trim();
    removedOfficialCourses.value = sid ? listRemovedOfficialCourses(sid) : [];
    return removedOfficialCourses.value;
  };
  const removeOfficialCourse = (course) => {
    const sid = String(props.studentId || "").trim();
    const sem = String(course?.semester || getFallbackSemester()).trim();
    const record = removeOfficialCourseFromSchedule(sid, sem, course, remoteScheduleData.value);
    if (!record) return false;
    refreshRemovedOfficialCourses(sem);
    mergeCurrentScheduleSources();
    persistScheduleRenderSnapshot("official-course-remove");
    return true;
  };
  const restoreOfficialCourse = (record) => {
    const sid = String(props.studentId || "").trim();
    const sem = String(record?.representative?.semester || record?.semester || getFallbackSemester()).trim();
    if (!restoreOfficialCourseToSchedule(sid, sem, record)) return false;
    refreshRemovedOfficialCourses(sem);
    mergeCurrentScheduleSources();
    persistScheduleRenderSnapshot("official-course-restore");
    return true;
  };
  const loadCustomCourses = async (targetSemester = "") => {
    const sid = String(props.studentId || "").trim();
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || "").trim();
    if (!sid || !sem) {
      customScheduleData.value = [];
      mergeCurrentScheduleSources();
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
      mergeCurrentScheduleSources();
      persistScheduleRenderSnapshot("custom-load");
      return true;
    } catch (e) {
      console.warn("加载自定义课程失败", e);
      customScheduleData.value = [];
      mergeCurrentScheduleSources();
      return false;
    }
  };
  const managedCourseGroups = computed(() => {
    const groups = /* @__PURE__ */ new Map();
    const ensureGroup = (semesterKey) => {
      const key = String(semesterKey || "未分配学期").trim() || "未分配学期";
      if (!groups.has(key)) {
        groups.set(key, {
          officialMap: /* @__PURE__ */ new Map(),
          removedMap: /* @__PURE__ */ new Map(),
          customCourses: []
        });
      }
      return groups.get(key);
    };
    const currentSemester = getFallbackSemester();
    for (const course of remoteScheduleData.value || []) {
      const key = buildOfficialCourseIdentityKey(course);
      if (!key) continue;
      const group = ensureGroup(String(course?.semester || currentSemester));
      if (!group.officialMap.has(key)) {
        group.officialMap.set(key, {
          ...course,
          semester: String(course?.semester || currentSemester),
          course_identity_key: key,
          is_custom: false
        });
      }
    }
    for (const record of removedOfficialCourses.value || []) {
      const representative = record?.representative;
      const key = String(record?.key || buildOfficialCourseIdentityKey(representative)).trim();
      if (!key || !representative) continue;
      const group = ensureGroup(String(representative.semester || currentSemester));
      group.officialMap.delete(key);
      group.removedMap.set(key, {
        ...representative,
        semester: String(representative.semester || currentSemester),
        course_identity_key: key,
        visibility_record: record,
        is_removed_official: true,
        is_custom: false
      });
    }
    for (const rawCourse of allCustomCourses.value || []) {
      const course = normalizeCustomCourse(rawCourse, currentSemester);
      if (!course?.id) continue;
      ensureGroup(String(course.semester || "未分配学期")).customCourses.push(course);
    }
    const sortCourses = (courses) => courses.sort((a, b) => {
      if (a.weekday !== b.weekday) return a.weekday - b.weekday;
      if (a.period !== b.period) return a.period - b.period;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });
    return Array.from(groups.entries()).sort((a, b) => sortSemesterKeys(a[0], b[0])).map(([semesterKey, group]) => {
      const officialCourses = sortCourses([...group.officialMap.values()]);
      const removedCourses = sortCourses([...group.removedMap.values()]);
      const customCourses = sortCourses(group.customCourses);
      return {
        semester: semesterKey,
        officialCourses,
        removedCourses,
        customCourses,
        // 兼容旧组件/测试中的 courses 字段；语义仍为自定义课程。
        courses: customCourses,
        totalCount: officialCourses.length + removedCourses.length + customCourses.length
      };
    });
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
      refreshRemovedOfficialCourses();
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
    refreshRemovedOfficialCourses(resolvedSemester);
    mergeCurrentScheduleSources();
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
    const resolvedSemester = String(payload?.meta?.semester || requestedSemester || getFallbackSemester()).trim();
    refreshRemovedOfficialCourses(resolvedSemester);
    mergeCurrentScheduleSources();
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
        mergeScheduleSources(
          { remoteScheduleData, customScheduleData, scheduleData },
          {
            studentId: String(props.studentId || "").trim(),
            semester: requestedSemester || getFallbackSemester()
          }
        );
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
          mergeCurrentScheduleSources();
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
        mergeCurrentScheduleSources();
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
    removedOfficialCourses,
    loadingManageCourses,
    manageCoursesError,
    manageExpandedSemesters,
    managedCourseGroups,
    loadCustomCourses,
    loadAllCustomCourses,
    refreshRemovedOfficialCourses,
    removeOfficialCourse,
    restoreOfficialCourse,
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
    mergeScheduleSources: mergeCurrentScheduleSources
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
const formatMinuteToClock$1 = (value) => {
  const minute = Number(value);
  if (!Number.isFinite(minute) || minute < 0) return "";
  const total = Math.floor(minute);
  const hour = Math.floor(total / 60);
  if (hour > 23) return "";
  const rest = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
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
    return weeks > 0 ? t("schedule.weeks.selectedCount").replace("{n}", String(weeks)) : t("schedule.weeks.noneSelected");
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
  const resetAddCourseForm = (prefill = {}) => {
    const weekdayRaw = Number(prefill.weekday);
    const periodRaw = Number(prefill.period);
    const weekday = Number.isInteger(weekdayRaw) && weekdayRaw >= 1 && weekdayRaw <= 7 ? weekdayRaw : 1;
    const period = Number.isInteger(periodRaw) && periodRaw >= 1 && periodRaw <= 11 ? periodRaw : 1;
    const maxSpan = Math.max(1, 12 - period);
    const spanRaw = Number(prefill.djs);
    const djs = Number.isInteger(spanRaw) && spanRaw >= 1 ? Math.min(spanRaw, maxSpan) : 1;
    addCourseForm.value = {
      name: "",
      teacher: "",
      room: "",
      weekday,
      period,
      djs,
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
    data.errorMsg.value = t("schedule.editor.loginRequiredError");
    menu.showMenu.value = false;
    await askConfirm({
      title: t("schedule.editor.loginRequiredTitle"),
      lines: [t("schedule.editor.loginRequiredLine")],
      confirmText: t("schedule.editor.loginRequiredConfirm"),
      cancelText: t("schedule.editor.loginRequiredCancel"),
      danger: false
    });
  };
  const openAddCourseDialog = (prefill = {}) => {
    if (!hasValidLoginSession()) {
      void promptLoginRequired();
      return;
    }
    const sem = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    if (!sem) {
      data.semesterError.value = t("schedule.editor.semesterRequired");
      return;
    }
    courseDialogMode.value = "add";
    editingCourseId.value = "";
    editingCourseSemester.value = sem;
    returnToDetailAfterCourseSubmit.value = false;
    returnToManageAfterCourseSubmit.value = false;
    resetAddCourseForm(prefill);
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
    if (!name) return t("schedule.editor.nameRequired");
    const weeks = normalizeWeeks(addCourseForm.value.weeks);
    if (!weeks.length) return t("schedule.editor.weeksRequired");
    const weekday = Number(addCourseForm.value.weekday);
    if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) return t("schedule.editor.weekdayRequired");
    const period = Number(addCourseForm.value.period);
    if (!Number.isFinite(period) || period < 1 || period > 11) return t("schedule.editor.periodRange");
    const span = Number(addCourseForm.value.djs);
    const maxSpan = Math.max(1, 12 - period);
    if (!Number.isFinite(span) || span < 1 || span > maxSpan) {
      return t("schedule.editor.spanRange").replace("{max}", String(maxSpan));
    }
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
      addCourseError.value = t("schedule.editor.semesterInvalid");
      return;
    }
    const sid = String(props.studentId || "").trim();
    if (!sid) {
      addCourseError.value = t("schedule.editor.loginRequiredToAdd");
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
    const actionWord = isEditing ? t("schedule.editor.actionEdit") : t("schedule.editor.actionAdd");
    const confirmText = [
      t("schedule.editor.confirmToSemester").replace("{action}", actionWord).replace("{t}", sem),
      t("schedule.editor.confirmCourse").replace("{t}", payload.name),
      t("schedule.editor.confirmTime").replace("{day}", getWeekDayLabels()[payload.weekday - 1]).replace("{s}", String(payload.period)).replace("{e}", String(payload.period + payload.djs - 1)),
      t("schedule.editor.confirmWeeks").replace("{t}", formatWeeksText(weeks))
    ];
    const confirmed = await askConfirm({
      title: isEditing ? t("schedule.editor.confirmEditTitle") : t("schedule.editor.confirmAddTitle"),
      lines: confirmText,
      confirmText: isEditing ? t("schedule.editor.confirmEdit") : t("schedule.editor.confirmAdd"),
      cancelText: t("schedule.confirm.cancel"),
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
        throw new Error(res.data?.error || t("schedule.editor.submitFailed").replace("{action}", actionWord));
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
      addCourseError.value = String(e?.response?.data?.error || e?.message || t("schedule.editor.submitFailed").replace("{action}", actionWord));
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
    const message = isCurrentWeek ? t("schedule.editor.deleteCurrentWeekLine").replace("{name}", normalized.name).replace("{w}", String(week)) : t("schedule.editor.deleteAllLine").replace("{name}", normalized.name);
    const confirmed = await askConfirm({
      title: t("schedule.editor.deleteConfirmTitle"),
      lines: [message],
      confirmText: t("schedule.editor.confirmDelete"),
      cancelText: t("schedule.confirm.cancel"),
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
        throw new Error(res.data?.error || t("schedule.editor.deleteFailed"));
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
      detail.detailActionError.value = String(e?.response?.data?.error || e?.message || t("schedule.editor.deleteFailed"));
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
  const removeOfficialCourse = async (courseArg = null) => {
    const course = courseArg || detail.selectedCourse.value;
    if (!course || course?.is_custom || course?.is_removed_official) return false;
    const name = String(course?.name || "").trim() || t("schedule.editor.officialCourseFallback");
    const confirmed = await askConfirm({
      title: t("schedule.editor.removeOfficialTitle"),
      lines: [
        t("schedule.editor.removeOfficialLine").replace("{name}", name),
        t("schedule.editor.removeOfficialHint")
      ],
      confirmText: t("schedule.editor.confirmRemoveOfficial"),
      cancelText: t("schedule.confirm.cancel"),
      danger: true
    });
    if (!confirmed) return false;
    const ok = data.removeOfficialCourse(course);
    if (!ok) {
      detail.detailActionError.value = t("schedule.editor.removeOfficialFailed");
      return false;
    }
    detail.detailActionError.value = "";
    detail.showDetail.value = false;
    detail.selectedCourse.value = null;
    const sid = String(props.studentId || "").trim();
    const sem = String(course?.semester || semester.semester.value || semester.semesterDraft.value || "").trim();
    void tryWriteSnapshotFromCache(sid);
    void reconcileLocalReminders({
      studentId: sid,
      semesterHint: sem,
      reason: "schedule-visibility-remove"
    });
    return true;
  };
  const restoreOfficialCourse = async (course) => {
    const record = course?.visibility_record || course;
    const name = String(record?.representative?.name || course?.name || "").trim() || t("schedule.editor.officialCourseFallback");
    const confirmed = await askConfirm({
      title: t("schedule.editor.restoreOfficialTitle"),
      lines: [t("schedule.editor.restoreOfficialLine").replace("{name}", name)],
      confirmText: t("schedule.editor.confirmRestoreOfficial"),
      cancelText: t("schedule.confirm.cancel"),
      danger: false
    });
    if (!confirmed) return false;
    const ok = data.restoreOfficialCourse(record);
    if (!ok) {
      data.manageCoursesError.value = t("schedule.editor.restoreOfficialFailed");
      return false;
    }
    data.manageCoursesError.value = "";
    const sid = String(props.studentId || "").trim();
    const sem = String(record?.representative?.semester || course?.semester || semester.semester.value || "").trim();
    void tryWriteSnapshotFromCache(sid);
    void reconcileLocalReminders({
      studentId: sid,
      semesterHint: sem,
      reason: "schedule-visibility-restore"
    });
    return true;
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
    deleteManagedCourse,
    removeOfficialCourse,
    restoreOfficialCourse
  };
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
  const requestPersonalEvents = async (range) => {
    const sid = String(props.studentId || "").trim();
    if (!sid) return [];
    const res = await axiosInstance.post(`${API_BASE}/v2/schedule/event/list-range`, {
      student_id: sid,
      start_date: range.startDate,
      end_date: range.endDate
    });
    if (!res.data?.success) {
      throw new Error(res.data?.error || "获取日程失败");
    }
    return Array.isArray(res.data?.data) ? res.data.data : [];
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
    exporting.value = true;
    try {
      const weekNumber = Number(semester.selectedWeek.value || 1);
      const startDateStr = semester.startDateStr.value;
      const scheduleData = data.scheduleData.value;
      const courseEvents = mode === "semester" ? buildExportEventsForSemester({ startDateStr, scheduleData }) : buildExportEventsForWeek(weekNumber, { startDateStr, scheduleData });
      const range = mode === "semester" ? resolveSemesterDateRange(startDateStr, scheduleData) : resolveWeekDateRange({ weekDates: semester.weekDates.value, startDateStr, weekNumber });
      const merged = await mergePersonalEventsIntoExport({
        courseEvents,
        range,
        fetchEvents: options.fetchPersonalEvents || requestPersonalEvents
      });
      if (merged.personalEventsFailed) {
        console.warn("[Schedule] 个人日程拉取失败，本次导出仅包含课程：", range);
      }
      const events = merged.events;
      if (!events.length) {
        exportError.value = "当前周暂无可导出的课表数据";
        return;
      }
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
const buildPreviewWeekDates = (startDateStr, week, options = {}) => {
  const startText = String(startDateStr || "").trim();
  if (!startText) return [];
  const start = new Date(startText);
  if (Number.isNaN(start.getTime())) return [];
  const parsedWeek = Number(week);
  const safeWeek = Number.isFinite(parsedWeek) && parsedWeek > 0 ? Math.round(parsedWeek) : 1;
  start.setDate(start.getDate() + (safeWeek - 1) * 7);
  const dayLabels = Array.isArray(options.dayLabels) ? options.dayLabels : [];
  const today = options.today instanceof Date ? options.today : /* @__PURE__ */ new Date();
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
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
      dayLabel: dayLabels[i] || "",
      isToday: d.toDateString() === today.toDateString()
    });
  }
  return dates;
};
const isWeekActive = (weeks, week) => {
  const target = Number(week);
  if (!Number.isFinite(target)) return false;
  return normalizeWeeks(weeks).includes(target);
};
const toPreviewGridCourse = (item) => {
  if (!item || !item.selected) return null;
  if (item.duplicateKind === "exact") return null;
  const course = item.course;
  const color = String(item.colorOverride || DEFAULT_COURSE_COLOR || "").trim();
  const uid = `import-${course.sourceIndex}`;
  return {
    _uid: uid,
    _preview: true,
    id: uid,
    name: course.name,
    teacher: course.teacher,
    room: course.room,
    room_code: course.room,
    period: course.period,
    djs: course.djs,
    weekday: course.weekday,
    weeks: Array.isArray(course.weeks) ? [...course.weeks] : [],
    color,
    is_custom: !!color,
    // 冲突可视化复用 ScheduleGrid 内置能力：is_conflict 为真即渲染冲突卡片
    is_conflict: item.conflicts.length > 0
  };
};
const buildPreviewGridCourses = (items) => {
  if (!Array.isArray(items)) return [];
  const nodes = [];
  for (const item of items) {
    const node = toPreviewGridCourse(item);
    if (node) nodes.push(node);
  }
  return nodes;
};
const AI_COURSE_IMPORT_FORMAT = "mini-hbut-course-import";
const AI_COURSE_IMPORT_VERSION = 1;
const IMPORT_WEEKDAY_MIN = 1;
const IMPORT_WEEKDAY_MAX = 7;
const IMPORT_PERIOD_MIN = 1;
const IMPORT_PERIOD_MAX = 11;
const IMPORT_WEEKS_MIN = 1;
const IMPORT_WEEKS_MAX = 60;
const buildAiCourseImportPrompt = () => {
  const colorCandidates = COURSE_COLOR_PRESETS.map((preset) => `${preset.hex}(${preset.label})`).join("、");
  return [
    "你正在把大学课表截图转换成 Mini-HBUT 可以导入的数据。",
    "",
    "请严格识别截图中的真实信息，不要补充、推测或虚构任何课程。",
    "",
    "输出要求：",
    "1. 只输出 JSON，不要输出解释，不要使用 Markdown 代码块。",
    "2. 顶层格式固定为：",
    "   {",
    `     "format": "${AI_COURSE_IMPORT_FORMAT}",`,
    `     "version": ${AI_COURSE_IMPORT_VERSION},`,
    '     "courses": [ ... ]',
    "   }",
    "3. 每门课程的字段：",
    "   - name：课程名（必填）",
    "   - weekday：星期，使用「周一」到「周日」（必填）",
    "   - periods：节次，写成「起始节-结束节」；数字与连字符都必须用半角字符，",
    "     连字符只能是 ASCII 的「-」，例如「3-4」「7-8」「9-10」；",
    "     不要使用波浪号（~）、全角减号（－）、破折号（—）等其它符号，也不要写「第」或「节」字（必填）",
    "   - weeks：周次（必填）",
    "   - teacher：任课老师（可选）",
    "   - room：上课地点（可选）",
    "   - color：颜色（可选）",
    "4. weeks 的写法（连字符同样只用半角「-」）：",
    "   - 连续周：1-16",
    "   - 单周：1-15单",
    "   - 双周：2-16双",
    "   - 不连续：1-4,6,8-12",
    "5. 如果同一门课在不同周的老师、地点、星期或节次不同，请拆成多条。",
    "6. 如果只是同一门课同一时间被图片重复显示，请合并成一条，不要逐周输出。",
    "7. teacher 或 room 无法确认时填空字符串，不要猜测。",
    "8. 不要输出 semester、id、source_id。",
    "9. color 只能从下面这份颜色列表中选择（必须原样使用其中的十六进制值）：",
    `   ${colorCandidates}`,
    "",
    "只输出 JSON。"
  ].join("\n");
};
const buildAiCourseImportExample = () => JSON.stringify(
  {
    format: AI_COURSE_IMPORT_FORMAT,
    version: AI_COURSE_IMPORT_VERSION,
    courses: [
      {
        name: "电路理论",
        teacher: "张老师",
        room: "实2-C301",
        weekday: "周二",
        periods: "3-4",
        weeks: "1-16",
        color: COURSE_COLOR_PRESETS[0]?.hex ?? ""
      },
      {
        name: "大学体育",
        teacher: "李老师",
        room: "西区操场",
        weekday: "周四",
        periods: "5-6",
        weeks: "1-15单"
      }
    ]
  },
  null,
  2
);
const FIELD_ALIASES = {
  name: ["name", "课程", "课程名", "课程名称"],
  teacher: ["teacher", "老师", "教师", "任课老师"],
  room: ["room", "地点", "教室", "上课地点"],
  weekday: ["weekday", "星期", "周几"],
  periods: ["periods", "节次", "上课节次"],
  weeks: ["weeks", "周次", "上课周次"],
  color: ["color", "颜色"]
};
const EXTRA_RECOGNIZED_KEYS = /* @__PURE__ */ new Set(["period", "djs"]);
const IGNORED_KEYS = /* @__PURE__ */ new Set([
  "semester",
  "id",
  "source_id",
  "sourceId",
  "source",
  "sourceIndex",
  "term",
  "year"
]);
const RECOGNIZED_KEYS = /* @__PURE__ */ new Set([
  ...Object.values(FIELD_ALIASES).flat(),
  ...EXTRA_RECOGNIZED_KEYS
]);
const makeDiag = (level, code, message, field, sourceIndex) => {
  const diag = { level, code, message };
  if (field !== void 0) diag.field = field;
  if (sourceIndex !== void 0) diag.sourceIndex = sourceIndex;
  return diag;
};
const globalError = (code, message) => ({
  ok: false,
  courses: [],
  diagnostics: [makeDiag("error", code, message)],
  rawCount: 0
});
const MAX_RAW_VALUE_LENGTH = 80;
function stringifyRawValue(value) {
  let text = "";
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else if (value !== null && value !== void 0) {
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = "";
    }
    if (text === "{}" || text === "[]") text = "";
  }
  return text.length > MAX_RAW_VALUE_LENGTH ? `${text.slice(0, MAX_RAW_VALUE_LENGTH)}…` : text;
}
function makeCourseFieldError(code, message, field, sourceIndex, options = {}) {
  const diag = makeDiag("error", code, message, field, sourceIndex);
  const rawValue = stringifyRawValue(options.rawValue);
  if (rawValue) diag.rawValue = rawValue;
  if (options.courseName) diag.courseName = options.courseName;
  return diag;
}
const RANGE_SEPARATOR_PATTERN = /[\u002D\u007E\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u223C\u301C\uFE58\uFE63\uFF0D\uFF5E]/g;
const normalizeRangeSeparators = (text) => text.replace(RANGE_SEPARATOR_PATTERN, "-");
function matchBalanced(source, start) {
  const open = source[start];
  if (open !== "{" && open !== "[") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth += 1;
    } else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}
function findBalancedCandidates(source) {
  const candidates = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "{" || ch === "[") {
      const end = matchBalanced(source, i);
      if (end === -1) {
        i += 1;
        continue;
      }
      candidates.push(source.slice(i, end));
      i = end;
    } else {
      i += 1;
    }
  }
  return candidates;
}
function extractJsonBody(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, diagnostics: [makeDiag("error", "empty_input", "输入为空，未找到课表数据")] };
  }
  const diagnostics = [];
  const fences = [...trimmed.matchAll(/```[ \t]*([a-zA-Z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)```/g)];
  let body = trimmed;
  if (fences.length > 1) {
    return {
      ok: false,
      diagnostics: [makeDiag("error", "multiple_json_bodies", "检测到多个代码块，无法安全确定唯一的课表 JSON")]
    };
  }
  if (fences.length === 1) {
    body = fences[0][2].trim();
    diagnostics.push(makeDiag("info", "code_fence_stripped", "已自动剥离 Markdown 代码块包裹"));
    if (!body) {
      return { ok: false, diagnostics: [makeDiag("error", "empty_input", "代码块内没有内容")] };
    }
  }
  const candidates = findBalancedCandidates(body);
  if (candidates.length === 0) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        makeDiag("error", "json_body_not_found", "未找到可解析的 JSON 主体（可能括号未配平）")
      ]
    };
  }
  const valid = candidates.filter((candidate) => {
    try {
      JSON.parse(candidate);
      return true;
    } catch {
      return false;
    }
  });
  if (valid.length > 1) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        makeDiag("error", "multiple_json_bodies", "检测到多个 JSON 主体，无法安全确定哪一个是课表数据")
      ]
    };
  }
  if (valid.length === 0) {
    return {
      ok: false,
      diagnostics: [...diagnostics, makeDiag("error", "json_parse_failed", "定位到 JSON 主体但解析失败")]
    };
  }
  const picked = valid[0];
  if (picked !== body.trim()) {
    diagnostics.push(makeDiag("info", "json_body_extracted", "已从说明文字中提取 JSON 主体"));
  }
  return { ok: true, body: picked, diagnostics };
}
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function pickField(raw, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== void 0 && raw[key] !== null) {
      return { present: true, value: raw[key], key };
    }
  }
  return { present: false, value: void 0, key: keys[0] };
}
function toInt(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}
function toOptionalText$1(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
const CN_WEEKDAY = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
  七: 7
};
const EN_WEEKDAY = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7
};
function parseWeekday(value) {
  const num = toInt(value);
  if (num !== null) {
    return num >= IMPORT_WEEKDAY_MIN && num <= IMPORT_WEEKDAY_MAX ? num : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const cnMatch = /^(?:周|星期|礼拜)([一二三四五六日天七]|\d)$/.exec(text);
  if (cnMatch) {
    const token = cnMatch[1];
    const weekday = /^\d$/.test(token) ? Number(token) : CN_WEEKDAY[token];
    if (weekday === void 0) return null;
    return weekday >= IMPORT_WEEKDAY_MIN && weekday <= IMPORT_WEEKDAY_MAX ? weekday : null;
  }
  const enWeekday = EN_WEEKDAY[text.toLowerCase()];
  if (enWeekday !== void 0) return enWeekday;
  return null;
}
function validatePeriods(period, djs) {
  if (!Number.isInteger(period) || !Number.isInteger(djs)) return null;
  if (period < IMPORT_PERIOD_MIN || djs < 1) return null;
  if (period + djs - 1 > IMPORT_PERIOD_MAX) return null;
  return { period, djs };
}
function parsePeriods(value) {
  if (isPlainObject(value)) {
    const period = toInt(value.period);
    if (period === null) return null;
    const djs = value.djs === void 0 || value.djs === null ? 1 : toInt(value.djs);
    if (djs === null) return null;
    return validatePeriods(period, djs);
  }
  const direct = toInt(value);
  if (direct !== null) return validatePeriods(direct, 1);
  if (typeof value !== "string") return null;
  const text = normalizeRangeSeparators(
    value.trim().replace(/^第/, "").replace(/节$/, "")
  ).trim();
  const range = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(text);
  if (range) {
    let start = Number(range[1]);
    let end = Number(range[2]);
    if (start > end) [start, end] = [end, start];
    return validatePeriods(start, end - start + 1);
  }
  if (/^\d{1,2}$/.test(text)) {
    return validatePeriods(Number(text), 1);
  }
  return null;
}
function finalizeWeeks(values) {
  if (!values.length) return null;
  for (const week of values) {
    if (!Number.isInteger(week) || week < IMPORT_WEEKS_MIN || week > IMPORT_WEEKS_MAX) return null;
  }
  return normalizeWeeks(values);
}
function parseWeekToken(token) {
  let text = token.trim();
  if (!text) return [];
  let parity = null;
  if (/单周?$/.test(text)) {
    parity = "odd";
    text = text.replace(/单周?$/, "");
  } else if (/双周?$/.test(text)) {
    parity = "even";
    text = text.replace(/双周?$/, "");
  }
  text = text.replace(/周$/, "").trim();
  if (!text) return null;
  text = normalizeRangeSeparators(text);
  let start;
  let end;
  const range = /^(\d{1,3})\s*-\s*(\d{1,3})$/.exec(text);
  if (range) {
    start = Number(range[1]);
    end = Number(range[2]);
    if (start > end) [start, end] = [end, start];
  } else if (/^\d{1,3}$/.test(text)) {
    start = Number(text);
    end = start;
  } else {
    return null;
  }
  if (start < IMPORT_WEEKS_MIN || end > IMPORT_WEEKS_MAX) return null;
  const result = [];
  for (let week = start; week <= end; week += 1) {
    if (parity === "odd" && week % 2 === 0) continue;
    if (parity === "even" && week % 2 === 1) continue;
    result.push(week);
  }
  return result;
}
function parseWeeks(value) {
  if (Array.isArray(value)) {
    const values = [];
    for (const item of value) {
      const week = toInt(item);
      if (week === null || week < IMPORT_WEEKS_MIN || week > IMPORT_WEEKS_MAX) return null;
      values.push(week);
    }
    return finalizeWeeks(values);
  }
  const direct = toInt(value);
  if (direct !== null) {
    return finalizeWeeks([direct]);
  }
  if (typeof value !== "string") return null;
  const tokens = value.split(/[,，、;；]/);
  const collected = [];
  for (const token of tokens) {
    if (!token.trim()) continue;
    const parsed = parseWeekToken(token);
    if (parsed === null) return null;
    collected.push(...parsed);
  }
  return finalizeWeeks(collected);
}
function looksLikeColor(value) {
  const text = value.trim();
  if (!text) return false;
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return true;
  if (/^(?:rgb|rgba|hsl|hsla)\(/i.test(text)) return true;
  if (/^[a-z]{2,20}$/i.test(text)) return true;
  if (/^[\u4e00-\u9fa5]{1,10}$/.test(text)) return true;
  return false;
}
function parseCourse(rawItem, sourceIndex) {
  const errors = [];
  const diagnostics = [];
  if (!isPlainObject(rawItem)) {
    return {
      errors: [
        // 条目级错误没有具体字段：定位信息（第 N 条）由诊断结构提供，message 不再重复序号
        makeCourseFieldError("invalid_course_entry", "该条不是合法的课程对象", void 0, sourceIndex, {
          rawValue: rawItem
        })
      ]
    };
  }
  const nameField = pickField(rawItem, FIELD_ALIASES.name);
  const nameText = toOptionalText$1(nameField.value);
  if (!nameField.present || !nameText) {
    return {
      errors: [
        makeCourseFieldError("missing_name", "缺少课程名称", nameField.key, sourceIndex, {
          rawValue: nameField.value
        })
      ]
    };
  }
  const weekdayValue = pickField(rawItem, FIELD_ALIASES.weekday).value;
  const weekday = parseWeekday(weekdayValue);
  if (weekday === null) {
    return {
      errors: [
        makeCourseFieldError(
          "invalid_weekday",
          `星期无法解析或超出范围（应为 ${IMPORT_WEEKDAY_MIN}..${IMPORT_WEEKDAY_MAX}）`,
          "weekday",
          sourceIndex,
          { rawValue: weekdayValue, courseName: nameText }
        )
      ]
    };
  }
  const periodsField = pickField(rawItem, FIELD_ALIASES.periods);
  const periodsValue = periodsField.present ? periodsField.value : { period: rawItem.period, djs: rawItem.djs };
  const periods = parsePeriods(periodsValue);
  if (!periods) {
    return {
      errors: [
        makeCourseFieldError(
          "invalid_periods",
          `节次无法解析或超出范围（起始 ${IMPORT_PERIOD_MIN}..${IMPORT_PERIOD_MAX}，末节不超过 ${IMPORT_PERIOD_MAX}）`,
          "periods",
          sourceIndex,
          { rawValue: periodsValue, courseName: nameText }
        )
      ]
    };
  }
  const weeksValue = pickField(rawItem, FIELD_ALIASES.weeks).value;
  const weeks = parseWeeks(weeksValue);
  if (!weeks) {
    return {
      errors: [
        makeCourseFieldError(
          "invalid_weeks",
          `周次无法解析、为空或超出范围（应为 ${IMPORT_WEEKS_MIN}..${IMPORT_WEEKS_MAX}）`,
          "weeks",
          sourceIndex,
          { rawValue: weeksValue, courseName: nameText }
        )
      ]
    };
  }
  const teacherField = pickField(rawItem, FIELD_ALIASES.teacher);
  const teacher = toOptionalText$1(teacherField.value) ?? "";
  if (!teacher) {
    diagnostics.push(makeDiag("warning", "missing_teacher", "缺少教师信息", "teacher", sourceIndex));
  }
  const roomField = pickField(rawItem, FIELD_ALIASES.room);
  const room = toOptionalText$1(roomField.value) ?? "";
  if (!room) {
    diagnostics.push(makeDiag("warning", "missing_room", "缺少上课地点", "room", sourceIndex));
  }
  let requestedColor;
  const colorField = pickField(rawItem, FIELD_ALIASES.color);
  if (colorField.present) {
    const colorText = toOptionalText$1(colorField.value);
    if (colorText && looksLikeColor(colorText)) {
      requestedColor = colorText;
    } else {
      diagnostics.push(
        makeDiag("warning", "invalid_color", "颜色格式无法识别，已忽略该颜色", "color", sourceIndex)
      );
    }
  }
  for (const key of Object.keys(rawItem)) {
    if (RECOGNIZED_KEYS.has(key) || IGNORED_KEYS.has(key)) continue;
    diagnostics.push(makeDiag("warning", "unknown_field", `未识别的字段「${key}」已忽略`, key, sourceIndex));
  }
  const course = {
    name: nameText,
    teacher,
    room,
    weekday,
    period: periods.period,
    djs: periods.djs,
    weeks,
    sourceIndex,
    diagnostics
  };
  if (requestedColor !== void 0) course.requestedColor = requestedColor;
  return { course, errors };
}
function parseAiCourseImport(text) {
  const globalDiagnostics = [];
  let body;
  if (typeof text === "string") {
    const extracted = extractJsonBody(text);
    if (!extracted.ok) {
      return { ok: false, courses: [], diagnostics: extracted.diagnostics, rawCount: 0 };
    }
    globalDiagnostics.push(...extracted.diagnostics);
    try {
      body = JSON.parse(extracted.body);
    } catch {
      return globalError("json_parse_failed", "JSON 主体解析失败");
    }
  } else if (isPlainObject(text) || Array.isArray(text)) {
    body = text;
  } else {
    return globalError("invalid_input_type", "输入类型不受支持，应为文本或 JSON 对象 / 数组");
  }
  let rawCourses;
  if (Array.isArray(body)) {
    rawCourses = body;
  } else if (isPlainObject(body) && Array.isArray(body.courses)) {
    rawCourses = body.courses;
  } else {
    return {
      ok: false,
      courses: [],
      diagnostics: [
        ...globalDiagnostics,
        makeDiag("error", "courses_not_found", "未找到课程数组（应为顶层数组或 { courses: [...] }）")
      ],
      rawCount: 0
    };
  }
  const courses = [];
  for (let index = 0; index < rawCourses.length; index += 1) {
    const outcome = parseCourse(rawCourses[index], index);
    if (outcome.course) {
      courses.push(outcome.course);
    } else {
      globalDiagnostics.push(...outcome.errors);
    }
  }
  return {
    ok: courses.length > 0,
    courses,
    diagnostics: globalDiagnostics,
    rawCount: rawCourses.length
  };
}
const LOCATION_SEPARATOR = " · ";
const FIELD_LABEL_KEYS = {
  name: "schedule.import.field.name",
  weekday: "schedule.import.field.weekday",
  periods: "schedule.import.field.periods",
  weeks: "schedule.import.field.weeks"
};
const fieldLabel = (field) => {
  const key = FIELD_LABEL_KEYS[field];
  return key ? tf(key, {}) : field;
};
const describeImportDiagnosticLocation = (diagnostic) => {
  const sourceIndex = diagnostic.sourceIndex;
  if (sourceIndex === void 0 || sourceIndex === null) return "";
  const parts = [];
  const courseName = String(diagnostic.courseName ?? "").trim();
  parts.push(
    courseName ? tf("schedule.import.diag.locationNamed", { n: sourceIndex + 1, name: courseName }) : tf("schedule.import.diag.location", { n: sourceIndex + 1 })
  );
  if (diagnostic.field) parts.push(fieldLabel(diagnostic.field));
  const rawValue = String(diagnostic.rawValue ?? "").trim();
  if (rawValue) parts.push(tf("schedule.import.diag.rawValue", { raw: rawValue }));
  return parts.join(LOCATION_SEPARATOR);
};
const describeImportDiagnostic = (diagnostic) => {
  const location = describeImportDiagnosticLocation(diagnostic);
  return location ? `${location}${LOCATION_SEPARATOR}${diagnostic.message}` : diagnostic.message;
};
const mergeKeyOf = (course) => JSON.stringify([course.name, course.teacher, course.room, course.weekday, course.period, course.djs]);
const diagnosticKeyOf = (diag) => JSON.stringify([diag.level, diag.code, diag.message, diag.field ?? null, diag.sourceIndex ?? null]);
const isSameWeeks = (left, right) => {
  const a = normalizeWeeks(left);
  const b = normalizeWeeks(right);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};
const hasWeeksOverlap = (left, right) => {
  const rightSet = new Set(normalizeWeeks(right));
  return normalizeWeeks(left).some((week) => rightSet.has(week));
};
function mergeImportCourses(courses) {
  const order = [];
  const groups = /* @__PURE__ */ new Map();
  for (const course of courses) {
    const key = mergeKeyOf(course);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(course);
    } else {
      groups.set(key, [course]);
      order.push(key);
    }
  }
  const mergedCourses = [];
  const diagnostics = [];
  let mergedCount = 0;
  for (const key of order) {
    const group = groups.get(key);
    if (!group || group.length === 0) continue;
    const first = group[0];
    const weeks = normalizeWeeks(group.flatMap((course) => course.weeks));
    let sourceIndex = first.sourceIndex;
    for (const course of group) {
      if (course.sourceIndex < sourceIndex) sourceIndex = course.sourceIndex;
    }
    const seenDiag = /* @__PURE__ */ new Set();
    const groupDiagnostics = [];
    for (const course of group) {
      for (const diag of course.diagnostics) {
        const diagKey = diagnosticKeyOf(diag);
        if (seenDiag.has(diagKey)) continue;
        seenDiag.add(diagKey);
        groupDiagnostics.push(diag);
      }
    }
    let requestedColor;
    for (const course of group) {
      if (course.requestedColor !== void 0) {
        requestedColor = course.requestedColor;
        break;
      }
    }
    const mergedCourse = {
      name: first.name,
      teacher: first.teacher,
      room: first.room,
      weekday: first.weekday,
      period: first.period,
      djs: first.djs,
      weeks,
      sourceIndex,
      diagnostics: groupDiagnostics
    };
    if (requestedColor !== void 0) mergedCourse.requestedColor = requestedColor;
    mergedCourses.push(mergedCourse);
    if (group.length > 1) {
      const removed = group.length - 1;
      mergedCount += removed;
      diagnostics.push({
        level: "info",
        code: "merged_duplicate_weeks",
        message: `已自动合并 ${removed} 条仅周次不同的重复记录（${first.name}）`,
        sourceIndex
      });
    }
  }
  return { courses: mergedCourses, mergedCount, diagnostics };
}
const toExistingView = (existing) => {
  const view = {
    name: existing.name ?? "",
    teacher: existing.teacher ?? "",
    room: existing.room ?? "",
    weeks: normalizeWeeks(existing.weeks ?? [])
  };
  if (existing.weekday !== void 0) view.weekday = existing.weekday;
  if (existing.period !== void 0) view.period = existing.period;
  if (existing.djs !== void 0) view.djs = existing.djs;
  return view;
};
const isExactWithExisting = (course, view) => view.weekday !== void 0 && view.period !== void 0 && view.djs !== void 0 && course.name === view.name && course.teacher === view.teacher && course.room === view.room && course.weekday === view.weekday && course.period === view.period && course.djs === view.djs && isSameWeeks(course.weeks, view.weeks);
const isExactBetweenCourses = (left, right) => left.name === right.name && left.teacher === right.teacher && left.room === right.room && left.weekday === right.weekday && left.period === right.period && left.djs === right.djs && isSameWeeks(left.weeks, right.weeks);
const isPossibleWithExisting = (course, view) => view.weekday !== void 0 && view.period !== void 0 && course.name === view.name && course.weekday === view.weekday && course.period === view.period && hasWeeksOverlap(course.weeks, view.weeks) && (course.teacher !== view.teacher || course.room !== view.room);
const isPossibleBetweenCourses = (left, right) => left.name === right.name && left.weekday === right.weekday && left.period === right.period && hasWeeksOverlap(left.weeks, right.weeks) && (left.teacher !== right.teacher || left.room !== right.room);
function detectImportDuplicates(courses, existing) {
  const existingViews = existing.map(toExistingView);
  return courses.map((course, index) => {
    for (let j = 0; j < courses.length; j += 1) {
      if (j === index) continue;
      if (isExactBetweenCourses(course, courses[j])) return "exact";
    }
    for (const view of existingViews) {
      if (isExactWithExisting(course, view)) return "exact";
    }
    for (let j = 0; j < courses.length; j += 1) {
      if (j === index) continue;
      if (isPossibleBetweenCourses(course, courses[j])) return "possible";
    }
    for (const view of existingViews) {
      if (isPossibleWithExisting(course, view)) return "possible";
    }
    return "none";
  });
}
const rangesOverlap = (leftPeriod, leftSpan, rightPeriod, rightSpan) => {
  const leftEnd = leftPeriod + leftSpan - 1;
  const rightEnd = rightPeriod + rightSpan - 1;
  return leftPeriod <= rightEnd && rightPeriod <= leftEnd;
};
const intersectWeeks = (left, right) => {
  const rightSet = new Set(normalizeWeeks(right));
  return normalizeWeeks(left).filter((week) => rightSet.has(week));
};
const toBatchTarget = (course) => ({
  name: course.name,
  weekday: course.weekday,
  period: course.period,
  djs: course.djs,
  weeks: course.weeks,
  source: "import"
});
const toExistingTarget = (existing) => {
  if (existing.weekday === void 0 || existing.period === void 0) return null;
  const target = {
    name: existing.name ?? "",
    weekday: existing.weekday,
    period: existing.period,
    djs: existing.djs === void 0 || existing.djs < 1 ? 1 : existing.djs,
    weeks: normalizeWeeks(existing.weeks ?? []),
    // 未标注来源时按教务课表处理
    source: existing.source === "custom" ? "custom" : "official"
  };
  if (existing.id !== void 0) target.id = existing.id;
  return target;
};
const buildConflict = (course, target) => {
  if (course.weekday !== target.weekday) return null;
  if (!rangesOverlap(course.period, course.djs, target.period, target.djs)) return null;
  const overlapWeeks = intersectWeeks(course.weeks, target.weeks);
  if (overlapWeeks.length === 0) return null;
  const overlapPeriodStart = Math.max(course.period, target.period);
  const overlapPeriodEnd = Math.min(
    course.period + course.djs - 1,
    target.period + target.djs - 1
  );
  const conflict = {
    withCourseName: target.name,
    overlapWeeks,
    overlapPeriodStart,
    overlapPeriodEnd,
    source: target.source
  };
  if (target.id !== void 0) conflict.withCourseId = target.id;
  return conflict;
};
const conflictKeyOf = (conflict) => JSON.stringify([
  conflict.source,
  conflict.withCourseId ?? null,
  conflict.withCourseName,
  conflict.overlapPeriodStart,
  conflict.overlapPeriodEnd,
  conflict.overlapWeeks
]);
function detectImportConflicts(courses, existing) {
  const result = courses.map(() => []);
  for (let i = 0; i < courses.length; i += 1) {
    for (let j = i + 1; j < courses.length; j += 1) {
      const left = courses[i];
      const right = courses[j];
      const leftConflict = buildConflict(left, toBatchTarget(right));
      if (leftConflict) result[i].push(leftConflict);
      const rightConflict = buildConflict(right, toBatchTarget(left));
      if (rightConflict) result[j].push(rightConflict);
    }
  }
  const existingTargets = [];
  for (const item of existing) {
    const target = toExistingTarget(item);
    if (target) existingTargets.push(target);
  }
  for (let i = 0; i < courses.length; i += 1) {
    for (const target of existingTargets) {
      const conflict = buildConflict(courses[i], target);
      if (conflict) result[i].push(conflict);
    }
  }
  return result.map((conflicts) => {
    const seen = /* @__PURE__ */ new Set();
    const deduped = [];
    for (const conflict of conflicts) {
      const key = conflictKeyOf(conflict);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(conflict);
    }
    return deduped;
  });
}
const IMPORT_COLOR_CODE_INVALID = "import.color.invalid";
const IMPORT_COLOR_CODE_OUT_OF_PALETTE = "import.color.out_of_palette";
const PRESET_INDICES = COURSE_COLOR_PRESETS.map((_, index) => index);
function normalizeCourseName(name) {
  return String(name ?? "").trim().toLowerCase();
}
function presetIndexOfHex(hex) {
  const preset = findPresetByHex(hex);
  return preset ? COURSE_COLOR_PRESETS.indexOf(preset) : -1;
}
function validateImportColor(value) {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;
  const preset = findPresetByHex(normalized);
  return preset ? preset.hex.toLowerCase() : null;
}
function assignImportColors(courses, existingColors = []) {
  const result = /* @__PURE__ */ new Map();
  if (courses.length === 0) return result;
  const groupOrder = [];
  const groupsByKey = /* @__PURE__ */ new Map();
  for (const course of courses) {
    const key = normalizeCourseName(course.name);
    const bucket = groupsByKey.get(key);
    if (bucket) {
      bucket.push(course);
    } else {
      groupsByKey.set(key, [course]);
      groupOrder.push(key);
    }
  }
  const usage = new Array(COURSE_COLOR_PRESETS.length).fill(0);
  for (const hex of existingColors) {
    const index = presetIndexOfHex(String(hex ?? ""));
    if (index >= 0) usage[index] += 1;
  }
  const groupColor = /* @__PURE__ */ new Map();
  for (const key of groupOrder) {
    for (const course of groupsByKey.get(key) ?? []) {
      const accepted = validateImportColor(course.requestedColor);
      if (!accepted) continue;
      groupColor.set(key, accepted);
      const index = presetIndexOfHex(accepted);
      if (index >= 0) usage[index] += 1;
      break;
    }
  }
  let previousIndex = null;
  for (const key of groupOrder) {
    let hex = groupColor.get(key);
    if (!hex) {
      const minUsage = Math.min(...usage);
      const candidates = PRESET_INDICES.filter((index) => usage[index] === minUsage);
      const neighborColors = previousIndex === null ? [] : [previousIndex];
      const globalColors = PRESET_INDICES.filter((index) => usage[index] > 0);
      const picked = pickBestThemeCandidate(candidates, hashText(key), neighborColors, globalColors);
      const chosen = picked ?? candidates[0];
      hex = COURSE_COLOR_PRESETS[chosen].hex.toLowerCase();
      usage[chosen] += 1;
      groupColor.set(key, hex);
    }
    previousIndex = presetIndexOfHex(hex);
    for (const course of groupsByKey.get(key) ?? []) {
      result.set(course.sourceIndex, hex);
    }
  }
  return result;
}
function setCourseGroupColor(courses, colors, courseName, color) {
  const next = new Map(colors);
  const normalized = normalizeHexColor(color);
  if (!normalized) return next;
  const targetKey = normalizeCourseName(courseName);
  for (const course of courses) {
    if (normalizeCourseName(course.name) === targetKey) {
      next.set(course.sourceIndex, normalized);
    }
  }
  return next;
}
function resetImportColors(courses, existingColors = []) {
  return assignImportColors(courses, existingColors);
}
function collectImportColorDiagnostics(courses) {
  const diagnostics = [];
  const reported = /* @__PURE__ */ new Set();
  for (const course of courses) {
    const raw = course.requestedColor;
    if (raw === void 0 || raw === null) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    const normalized = normalizeHexColor(raw);
    const code = !normalized ? IMPORT_COLOR_CODE_INVALID : findPresetByHex(normalized) ? null : IMPORT_COLOR_CODE_OUT_OF_PALETTE;
    if (!code) continue;
    const key = normalizeCourseName(course.name);
    if (reported.has(key)) continue;
    reported.add(key);
    diagnostics.push({
      level: "warning",
      code,
      message: code === IMPORT_COLOR_CODE_INVALID ? `课程「${course.name}」的 AI 颜色格式非法，已改用自动配色` : `课程「${course.name}」的 AI 颜色不在允许色板内，已改用自动配色`,
      field: "color",
      sourceIndex: course.sourceIndex
    });
  }
  return diagnostics;
}
function resolvePersistColor(item) {
  const override = normalizeHexColor(item.colorOverride);
  if (override) return override;
  const requested = normalizeHexColor(item.course.requestedColor);
  if (requested) return requested;
  return DEFAULT_COURSE_COLOR;
}
function buildPersistPayload(preview, semester) {
  return preview.map((item) => {
    const course = item.course;
    return {
      semester,
      name: course.name,
      teacher: course.teacher,
      room: course.room,
      weekday: course.weekday,
      period: course.period,
      djs: course.djs,
      weeks: normalizeWeeks(course.weeks),
      color: resolvePersistColor(item)
    };
  });
}
function hasHardError(item) {
  const all = [...item.diagnostics, ...item.course.diagnostics];
  return all.some((d) => d.level === "error");
}
function shouldCommit(item) {
  if (item.selected !== true) return false;
  if (item.duplicateKind === "exact") return false;
  return !hasHardError(item);
}
function extractErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "提交失败";
}
async function commitImportCourses(preview, ctx) {
  const payloads = buildPersistPayload(preview, ctx.semester);
  const items = [];
  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (let index = 0; index < preview.length; index += 1) {
    const item = preview[index];
    const payload = payloads[index];
    const locator = { key: item.key, sourceIndex: item.course.sourceIndex };
    if (!shouldCommit(item)) {
      skipped += 1;
      items.push({ ...locator, status: "skipped" });
      continue;
    }
    try {
      const res = await axiosInstance.post(
        `${ctx.apiBase}/v2/schedule/custom/add`,
        {
          student_id: ctx.studentId,
          semester: payload.semester,
          name: payload.name,
          teacher: payload.teacher,
          room: payload.room,
          weekday: payload.weekday,
          period: payload.period,
          djs: payload.djs,
          weeks: payload.weeks,
          color: payload.color
        }
      );
      if (res.data?.success) {
        added += 1;
        items.push({ ...locator, status: "added" });
      } else {
        failed += 1;
        items.push({ ...locator, status: "failed", error: res.data?.error || "新增失败" });
      }
    } catch (error) {
      failed += 1;
      items.push({ ...locator, status: "failed", error: extractErrorMessage(error) });
    }
  }
  return {
    ok: failed === 0,
    added,
    skipped,
    failed,
    items
  };
}
const previewKeyOf = (sourceIndex) => `import-${sourceIndex}`;
const useScheduleImport = (options) => {
  const { props, data, semester, editor } = options;
  const { t: t2 } = useI18n();
  const API_BASE = "/api";
  const showImportDialog = ref(false);
  const stage = ref("input");
  const targetSemester = ref("");
  const rawText = ref("");
  const showExample = ref(false);
  const parsing = ref(false);
  const committing = ref(false);
  const parseError = ref("");
  const globalDiagnostics = ref([]);
  const previewCourses = ref([]);
  const rawCount = ref(0);
  const mergedCount = ref(0);
  const importResult = ref(null);
  const previewMode = ref("list");
  const previewWeek = ref(1);
  const officialCourses = computed(() => {
    const list = Array.isArray(data.remoteScheduleData?.value) ? data.remoteScheduleData.value : [];
    return list.map((item) => toExistingCourse(item, "official"));
  });
  const customCourses = computed(() => {
    const list = Array.isArray(data.customScheduleData?.value) ? data.customScheduleData.value : [];
    return list.map((item) => toExistingCourse(item, "custom"));
  });
  const allExistingCourses = computed(() => [
    ...officialCourses.value,
    ...customCourses.value
  ]);
  const existingColors = computed(() => {
    const list = Array.isArray(data.scheduleData?.value) ? data.scheduleData.value : [];
    return list.map((item) => String(item?.color || "").trim()).filter((color) => /^#[0-9a-fA-F]{6}$/.test(color));
  });
  const summary = computed(() => {
    const items = previewCourses.value;
    return {
      raw: rawCount.value,
      merged: mergedCount.value,
      importable: items.filter((item) => item.selected).length,
      total: items.length,
      duplicate: items.filter((item) => item.duplicateKind === "exact").length,
      conflict: items.filter((item) => item.conflicts.length > 0).length,
      warning: items.reduce((count, item) => count + item.diagnostics.length, 0),
      error: Math.max(0, rawCount.value - items.length)
    };
  });
  function toExistingCourse(raw, source) {
    return {
      id: String(raw?.id || raw?.source_id || "").trim(),
      name: String(raw?.name || "").trim(),
      teacher: String(raw?.teacher || "").trim(),
      room: String(raw?.room || raw?.room_code || "").trim(),
      weekday: Number(raw?.weekday || 0),
      period: Number(raw?.period || 0),
      djs: Number(raw?.djs || 0),
      weeks: normalizeWeeks(raw?.weeks),
      source
    };
  }
  const resetPreviewState = () => {
    stage.value = "input";
    parseError.value = "";
    globalDiagnostics.value = [];
    previewCourses.value = [];
    importResult.value = null;
    rawCount.value = 0;
    mergedCount.value = 0;
    previewMode.value = "list";
    previewWeek.value = 1;
  };
  const applyColorMap = (colorMap) => {
    previewCourses.value = previewCourses.value.map((item) => {
      const next = colorMap.get(item.course.sourceIndex);
      return next ? { ...item, colorOverride: next } : item;
    });
  };
  const currentColorMap = () => {
    const map = /* @__PURE__ */ new Map();
    for (const item of previewCourses.value) {
      map.set(item.course.sourceIndex, item.colorOverride || DEFAULT_COURSE_COLOR);
    }
    return map;
  };
  const previewTotalWeeks = computed(() => Math.max(1, Number(semester.totalWeeks.value || 1)));
  const clampPreviewWeek = (week) => {
    const parsed = Number(week);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(previewTotalWeeks.value, Math.max(1, Math.round(parsed)));
  };
  const previewWeekDates = computed(
    () => buildPreviewWeekDates(semester.startDateStr.value, previewWeek.value, {
      dayLabels: getWeekDays()
    })
  );
  const previewGetCoursesForDay = (dayIndex) => {
    const day = Number(dayIndex);
    if (!Number.isFinite(day) || day < 1 || day > 7) return [];
    const week = previewWeek.value;
    const existingList = Array.isArray(data.scheduleData?.value) ? data.scheduleData.value : [];
    const existing = existingList.filter(
      (course) => Number(course?.weekday) === day && isWeekActive(course?.weeks, week)
    );
    const preview = buildPreviewGridCourses(previewCourses.value).filter(
      (node) => node.weekday === day
    );
    return [...existing, ...preview];
  };
  const previewConflictsOf = (courseKey) => {
    const key = String(courseKey || "").trim();
    if (!key) return null;
    return previewCourses.value.find((item) => item.key === key) || null;
  };
  const openImportDialog = () => {
    rawText.value = "";
    showExample.value = false;
    resetPreviewState();
    previewWeek.value = clampPreviewWeek(Number(semester.selectedWeek.value || 1));
    targetSemester.value = String(semester.semester.value || semester.semesterDraft.value || "").trim();
    showImportDialog.value = true;
  };
  const closeImportDialog = () => {
    showImportDialog.value = false;
    rawText.value = "";
    showExample.value = false;
    resetPreviewState();
  };
  const backToInput = () => {
    stage.value = "input";
    parseError.value = "";
    importResult.value = null;
  };
  const setPreviewMode = (mode) => {
    previewMode.value = mode === "grid" ? "grid" : "list";
  };
  const setPreviewWeek = (week) => {
    previewWeek.value = clampPreviewWeek(week);
  };
  const prevPreviewWeek = () => {
    setPreviewWeek(previewWeek.value - 1);
  };
  const nextPreviewWeek = () => {
    setPreviewWeek(previewWeek.value + 1);
  };
  const copyPrompt = async () => {
    const promptText = buildAiCourseImportPrompt();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = promptText;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast(t2("schedule.import.toast.promptCopied"), "success");
    } catch {
      showToast(t2("schedule.import.toast.promptCopyFailed"), "error");
    }
  };
  const handleFileChange = async (event) => {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      rawText.value = await readTextFromFile(file);
      parseText();
    } catch {
      showToast(t2("schedule.import.toast.fileFailed"), "error");
    } finally {
      if (input) input.value = "";
    }
  };
  const parseText = () => {
    parseError.value = "";
    importResult.value = null;
    const parsed = parseAiCourseImport(rawText.value);
    globalDiagnostics.value = parsed.diagnostics;
    rawCount.value = parsed.rawCount;
    if (!parsed.courses.length) {
      const firstError = parsed.diagnostics.find((item) => item.level === "error");
      parseError.value = firstError ? describeImportDiagnostic(firstError) : t2("schedule.import.error.noCourses");
      stage.value = "input";
      return;
    }
    const merged = mergeImportCourses(parsed.courses);
    mergedCount.value = merged.mergedCount;
    const duplicates = detectImportDuplicates(merged.courses, allExistingCourses.value);
    const conflicts = detectImportConflicts(merged.courses, allExistingCourses.value);
    const colorMap = assignImportColors(merged.courses, existingColors.value);
    const colorDiagnostics = collectImportColorDiagnostics(merged.courses);
    previewCourses.value = merged.courses.map((course, index) => {
      const duplicateKind = duplicates[index] || "none";
      const courseColorWarnings = colorDiagnostics.filter((item) => item.sourceIndex === course.sourceIndex);
      return {
        key: previewKeyOf(course.sourceIndex),
        course,
        // 精确重复默认不勾选，其余默认勾选
        selected: duplicateKind !== "exact",
        duplicateKind,
        conflicts: conflicts[index] || [],
        diagnostics: [...course.diagnostics, ...courseColorWarnings],
        colorOverride: colorMap.get(course.sourceIndex) || DEFAULT_COURSE_COLOR
      };
    });
    stage.value = "preview";
  };
  const toggleSelected = (key) => {
    previewCourses.value = previewCourses.value.map(
      (item) => item.key === key ? { ...item, selected: !item.selected } : item
    );
  };
  const setAllSelected = (selected) => {
    previewCourses.value = previewCourses.value.map((item) => {
      if (item.duplicateKind === "exact") return { ...item, selected: false };
      return { ...item, selected };
    });
  };
  const changeCourseColor = (item, color) => {
    const courses = previewCourses.value.map((entry) => entry.course);
    const next = setCourseGroupColor(courses, currentColorMap(), item.course.name, color);
    applyColorMap(next);
  };
  const useAiRecommendedColors = () => {
    const courses = previewCourses.value.map((entry) => entry.course);
    applyColorMap(resetImportColors(courses, existingColors.value));
  };
  const useBalancedColors = () => {
    const courses = previewCourses.value.map((entry) => ({ ...entry.course, requestedColor: void 0 }));
    applyColorMap(assignImportColors(courses, existingColors.value));
  };
  const resetColors = () => {
    useAiRecommendedColors();
  };
  const hasImportable = computed(
    () => previewCourses.value.some((item) => item.selected && item.duplicateKind !== "exact")
  );
  const commitImport = async () => {
    const sid = String(props.studentId || "").trim();
    if (!sid) {
      showToast(t2("schedule.import.toast.needLogin"), "error");
      return;
    }
    const target = String(targetSemester.value || "").trim();
    if (!target) {
      showToast(t2("schedule.import.toast.needSemester"), "error");
      return;
    }
    if (!hasImportable.value) {
      showToast(t2("schedule.import.toast.nothingToImport"), "warning");
      return;
    }
    if (committing.value) return;
    committing.value = true;
    try {
      const result = await commitImportCourses(previewCourses.value, {
        apiBase: API_BASE,
        studentId: sid,
        semester: target
      });
      importResult.value = result;
      await editor.refreshCustomCourseViews(target);
      stage.value = "result";
      if (result.failed > 0) {
        showToast(
          t2("schedule.import.toast.partial").replace("{a}", String(result.added)).replace("{f}", String(result.failed)),
          "warning",
          4500
        );
      } else {
        showToast(t2("schedule.import.toast.success").replace("{n}", String(result.added)), "success");
      }
    } catch (error) {
      showToast(String(error?.message || t2("schedule.import.toast.commitFailed")), "error");
    } finally {
      committing.value = false;
    }
  };
  return {
    // 状态
    showImportDialog,
    stage,
    targetSemester,
    rawText,
    showExample,
    parsing,
    committing,
    parseError,
    globalDiagnostics,
    previewCourses,
    importResult,
    summary,
    hasImportable,
    // 课表预览（#821）
    previewMode,
    previewWeek,
    previewTotalWeeks,
    previewWeekDates,
    previewGetCoursesForDay,
    previewConflictsOf,
    // 动作
    openImportDialog,
    closeImportDialog,
    backToInput,
    copyPrompt,
    handleFileChange,
    parseText,
    toggleSelected,
    setAllSelected,
    changeCourseColor,
    useAiRecommendedColors,
    useBalancedColors,
    resetColors,
    setPreviewMode,
    setPreviewWeek,
    prevPreviewWeek,
    nextPreviewWeek,
    commitImport
  };
};
const useScheduleSync = (options) => {
  const { props, data, semester, editor, confirmDialog, onPersonalEventsChanged } = options;
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
    if (syncResult?.personalEventsApplied?.applied) {
      await onPersonalEventsChanged?.();
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
        "将覆盖云端已有的自定义课程与个人日程数据。",
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
        includePersonalEvents: true,
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
    syncStatusText.value = "正在下载云端备份并覆盖本地课表与日程...";
    try {
      const result = await runCloudSyncDownload({
        studentId: sid,
        reason: "schedule-manual-download",
        force: false,
        applySettings: false,
        applyCustomCourses: true,
        applyPersonalEvents: true,
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
        showToast("云下载完成，已应用自定义课程与个人日程", "success");
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
const FOREGROUND_PROBE_COOLDOWN_MS = 6e4;
const useScheduleTermStart = (options) => {
  const { props, data, semester } = options;
  const termStartNotice = ref("");
  let ensureInflight = null;
  let lastForegroundProbeAt = 0;
  const resolveTimeDrivenSemester = () => {
    const map = readSemesterStartDates();
    const entries = Object.entries(map).map(([semesterKey, startDate]) => ({
      semester: semesterKey,
      start_date: startDate
    }));
    const storedMeta = readStoredSemesterMeta();
    const storedSemester = String(storedMeta?.semester || "").trim();
    const storedStartDate = String(storedMeta?.start_date || "").trim();
    if (storedSemester && storedStartDate && !map[storedSemester]) {
      entries.push({ semester: storedSemester, start_date: storedStartDate });
    }
    const byStartDate = resolveSemesterByStartDate(entries, /* @__PURE__ */ new Date(), SEMESTER_SWITCH_LEAD_DAYS);
    const fallbackTarget = byStartDate ? "" : deriveSemesterByDate();
    pushDebugLog(
      "Schedule",
      `#750 时间驱动应选学期判定 entries=${entries.length} target=${byStartDate || "null"} fallback=${fallbackTarget || "无"}`,
      "debug"
    );
    return {
      target: byStartDate || fallbackTarget,
      /** true = 由开学日期数据驱动；false = 回退月份推算 */
      fromStartDate: !!byStartDate,
      entryCount: entries.length
    };
  };
  const pickUpcomingSemesterCandidate = (currentSemester) => {
    const list = Array.isArray(data.semesterOptions.value) ? data.semesterOptions.value : [];
    for (const item of list) {
      const sem = String(item || "").trim();
      if (sem && sem !== currentSemester && semesterIsNewer(sem, currentSemester)) {
        return sem;
      }
    }
    return getNextSemesterString(currentSemester);
  };
  const setTermStartNotice = (targetSemester, startDate) => {
    const current = String(semester.semester.value || "").trim();
    if (!current || targetSemester === current) return;
    const dateText = String(startDate || "").trim();
    const next = dateText ? `新学期（${targetSemester}）将于 ${dateText} 开学，课表发布后自动切换显示` : `新学期（${targetSemester}）即将开始，课表发布后自动切换显示`;
    if (termStartNotice.value === next) return;
    termStartNotice.value = next;
    pushDebugLog(
      "Schedule",
      `#750 提前窗口内新学期课表未发布，保持学期 ${current}，等待 semester=${targetSemester} start_date=${dateText || "未知"}`,
      "info"
    );
  };
  const switchToTimeDrivenSemester = async (targetSemester, probe, reason) => {
    const sid = String(props.studentId || "").trim();
    if (!sid || !targetSemester) return;
    const previous = String(semester.semester.value || "").trim();
    if (previous === targetSemester) return;
    writeScheduleLock(sid, targetSemester, "term-start");
    termStartNotice.value = "";
    pushDebugLog(
      "Schedule",
      `#750 时间驱动切换学期 ${previous || "无"}→${targetSemester}（reason=${reason}，探测课数=${Number(probe?.count ?? 0)}）`,
      "info"
    );
    semester.semester.value = targetSemester;
    semester.semesterDraft.value = targetSemester;
    const appliedFromProbe = probe?.payload ? data.applySchedulePayload(probe.payload, targetSemester) : false;
    if (!appliedFromProbe) {
      const cached = data.applyCachedScheduleImmediately(targetSemester);
      if (!cached) {
        await data.fetchSchedule(targetSemester);
        return;
      }
    }
    await data.loadCustomCourses(targetSemester);
  };
  const discoverUpcomingSemester = async (sid, currentSemester, reason) => {
    const upcoming = pickUpcomingSemesterCandidate(currentSemester);
    if (!upcoming || upcoming === currentSemester) return;
    const knownStart = String(readSemesterStartDates()[upcoming] || "").trim();
    if (knownStart && !isSemesterStartWithinLeadWindow(knownStart)) return;
    const probe = await probeSemesterSchedule(sid, upcoming);
    if (probe?.needLogin) return;
    const startDate = String(probe?.startDate || knownStart || "").trim();
    if (probe?.published) {
      if (startDate && isSemesterStartWithinLeadWindow(startDate)) {
        await switchToTimeDrivenSemester(upcoming, probe, `${reason}/discovery`);
      }
      return;
    }
    if (startDate && isSemesterStartWithinLeadWindow(startDate)) {
      setTermStartNotice(upcoming, startDate);
    }
  };
  const ensureTimeDrivenSemester = async (reason) => {
    const sid = String(props.studentId || "").trim();
    if (!sid) return;
    if (ensureInflight) return ensureInflight;
    const lockDetail = readScheduleLockDetail(sid);
    if (lockDetail && !isAutoScheduleLockReason(lockDetail.reason)) {
      pushDebugLog(
        "Schedule",
        `#750 会话内手动锁定(${lockDetail.semester})优先，跳过时间驱动自动切换 reason=${reason}`,
        "debug"
      );
      return;
    }
    const run = (async () => {
      const decision = resolveTimeDrivenSemester();
      const current = String(semester.semester.value || semester.semesterDraft.value || "").trim();
      if (decision.fromStartDate && decision.target) {
        if (decision.target === current) {
          termStartNotice.value = "";
        } else if (!semesterIsNewer(decision.target, current)) {
          pushDebugLog(
            "Schedule",
            `#750 时间驱动 target(${decision.target}) 早于当前显示(${current || "无"})，跳过切换`,
            "debug"
          );
          return;
        } else {
          const probe = await probeSemesterSchedule(sid, decision.target);
          if (probe?.needLogin) return;
          if (probe?.published) {
            await switchToTimeDrivenSemester(decision.target, probe, reason);
            return;
          }
          setTermStartNotice(decision.target, String(probe?.startDate || "").trim());
          return;
        }
      }
      await discoverUpcomingSemester(sid, current, reason);
    })().finally(() => {
      ensureInflight = null;
    });
    ensureInflight = run;
    return run;
  };
  const handleForegroundVisibility = () => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastForegroundProbeAt < FOREGROUND_PROBE_COOLDOWN_MS) return;
    lastForegroundProbeAt = now;
    void ensureTimeDrivenSemester("visibility-foreground");
  };
  const clearNoticeIfMatches = (targetSemester) => {
    const sem = String(targetSemester || "").trim();
    if (sem && termStartNotice.value && termStartNotice.value.includes(sem)) {
      termStartNotice.value = "";
    }
  };
  return {
    termStartNotice,
    resolveTimeDrivenSemester,
    ensureTimeDrivenSemester,
    handleForegroundVisibility,
    clearNoticeIfMatches
  };
};
const useScheduleEventData = (options) => {
  const { props, semester } = options;
  const API_BASE = "/api";
  const weekEvents = ref([]);
  const loadingWeekEvents = ref(false);
  let requestToken = 0;
  const weekIsoDates = computed(() => {
    const days = semester?.weekDates?.value;
    if (!Array.isArray(days)) return [];
    return days.map((day) => typeof day?.iso === "string" ? day.iso : "").filter((iso) => iso.length > 0);
  });
  const extractEventList = (response) => {
    const body = response?.data;
    const inner = body?.data ?? body;
    return Array.isArray(inner) ? inner : [];
  };
  const loadWeekEvents = async () => {
    const token = requestToken + 1;
    requestToken = token;
    const studentId = String(props?.studentId || "").trim();
    const dates = weekIsoDates.value;
    if (!studentId || dates.length === 0) {
      weekEvents.value = [];
      loadingWeekEvents.value = false;
      return;
    }
    loadingWeekEvents.value = true;
    const requestKey = `${studentId}|${dates.join(",")}`;
    const isCurrentRequest = () => token === requestToken && requestKey === `${String(props?.studentId || "").trim()}|${weekIsoDates.value.join(",")}`;
    try {
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/event/list-range`, {
        student_id: studentId,
        start_date: dates[0],
        end_date: dates[dates.length - 1]
      });
      if (!isCurrentRequest()) return;
      weekEvents.value = extractEventList(res).map((item) => normalizeScheduleEvent(item)).filter((event) => event !== null);
    } catch {
      if (!isCurrentRequest()) return;
      weekEvents.value = [];
    } finally {
      if (isCurrentRequest()) loadingWeekEvents.value = false;
    }
  };
  const getEventsForDay = (dayIndex) => {
    const index = Number(dayIndex) - 1;
    if (!Number.isInteger(index) || index < 0 || index > 6) return [];
    const iso = weekIsoDates.value[index];
    if (!iso) return [];
    return weekEvents.value.filter((event) => event.date === iso);
  };
  const findEventById = (eventId) => {
    const id = String(eventId || "").trim();
    if (!id) return null;
    return weekEvents.value.find((event) => event.id === id) ?? null;
  };
  watch(
    () => [String(props?.studentId || ""), weekIsoDates.value.join(",")],
    () => {
      void loadWeekEvents();
    },
    { immediate: true }
  );
  return {
    weekEvents,
    loadingWeekEvents,
    weekIsoDates,
    getEventsForDay,
    findEventById,
    refreshWeekEvents: loadWeekEvents
  };
};
const DEFAULT_EVENT_START = "09:00";
const DEFAULT_EVENT_END = "10:00";
const DEFAULT_EVENT_COLOR = courseThemes[0]?.border || "#72b9ff";
const formatMinuteToClock = (minute) => {
  if (!Number.isFinite(minute)) return "";
  const clamped = Math.min(Math.max(Math.trunc(minute), 0), MINUTES_PER_DAY - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};
const todayIso = () => {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const weekdayIndexOfDate = (date) => {
  if (!isValidCalendarDate(date)) return null;
  const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getDay();
  return day === 0 ? 7 : day;
};
const withGuaranteedOrder = (startTime, endTime) => {
  const startMinute = parseClockToMinute(startTime);
  if (startMinute === null) {
    return { startTime: DEFAULT_EVENT_START, endTime: DEFAULT_EVENT_END };
  }
  const endMinute = parseClockToMinute(endTime);
  if (endMinute !== null && endMinute > startMinute) {
    return { startTime, endTime };
  }
  const fallbackEnd = Math.min(startMinute + 60, MINUTES_PER_DAY - 1);
  if (fallbackEnd <= startMinute) {
    return { startTime: DEFAULT_EVENT_START, endTime: DEFAULT_EVENT_END };
  }
  return { startTime, endTime: formatMinuteToClock(fallbackEnd) };
};
const useScheduleEvents = (options) => {
  const { props, semester, data, confirmDialog, onChanged } = options;
  const eventDraft = ref({
    title: "",
    date: "",
    startTime: DEFAULT_EVENT_START,
    endTime: DEFAULT_EVENT_END,
    location: "",
    note: "",
    color: DEFAULT_EVENT_COLOR,
    reminderMinutes: null
  });
  const eventError = ref("");
  const savingEvent = ref(false);
  const deletingEvent = ref(false);
  const editingEventId = ref("");
  const API_BASE = "/api";
  const pickDefaultEventDate = () => {
    const days = semester?.weekDates?.value;
    if (Array.isArray(days) && days.length > 0) {
      const today = days.find((day) => day?.isToday && isValidCalendarDate(day?.iso));
      if (today) return String(today.iso);
      const first = days.find((day) => isValidCalendarDate(day?.iso));
      if (first) return String(first.iso);
    }
    return todayIso();
  };
  const resetEventDraft = (overrides = {}) => {
    const date = isValidCalendarDate(overrides.date) ? String(overrides.date) : pickDefaultEventDate();
    const order = withGuaranteedOrder(
      typeof overrides.startTime === "string" ? overrides.startTime : DEFAULT_EVENT_START,
      typeof overrides.endTime === "string" ? overrides.endTime : DEFAULT_EVENT_END
    );
    const reminder = overrides.reminderMinutes;
    eventDraft.value = {
      title: typeof overrides.title === "string" ? overrides.title : "",
      date,
      startTime: order.startTime,
      endTime: order.endTime,
      location: typeof overrides.location === "string" ? overrides.location : "",
      note: typeof overrides.note === "string" ? overrides.note : "",
      color: typeof overrides.color === "string" && overrides.color.trim() ? overrides.color.trim() : DEFAULT_EVENT_COLOR,
      reminderMinutes: reminder !== void 0 && ALLOWED_REMINDER_MINUTES.includes(reminder) ? reminder : null
    };
    eventError.value = "";
    editingEventId.value = "";
  };
  const populateEventDraft = (event) => {
    const normalized = normalizeScheduleEvent(event);
    if (!normalized) return false;
    eventDraft.value = {
      title: normalized.title,
      date: normalized.date,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      location: normalized.location,
      note: normalized.note,
      color: normalized.color || DEFAULT_EVENT_COLOR,
      reminderMinutes: normalized.reminderMinutes
    };
    editingEventId.value = normalized.id;
    eventError.value = "";
    return true;
  };
  const validateEventDraft = () => {
    const draft = eventDraft.value;
    if (!String(draft?.title || "").trim()) return "schedule.event.titleRequired";
    const date = String(draft?.date || "").trim();
    if (!date) return "schedule.event.dateRequired";
    if (!isValidCalendarDate(date)) return "schedule.event.dateInvalid";
    const startMinute = parseClockToMinute(String(draft?.startTime || ""));
    const endMinute = parseClockToMinute(String(draft?.endTime || ""));
    if (startMinute === null || endMinute === null) return "schedule.event.timeInvalid";
    if (endMinute <= startMinute) return "schedule.event.endBeforeStart";
    const reminder = draft?.reminderMinutes ?? null;
    if (!ALLOWED_REMINDER_MINUTES.includes(reminder)) return "schedule.event.reminderInvalid";
    return "";
  };
  const conflictsOf = (draft = eventDraft.value, context = {}) => {
    const date = String(draft?.date || "").trim();
    const weekday = weekdayIndexOfDate(date);
    const startMinute = parseClockToMinute(String(draft?.startTime || ""));
    const endMinute = parseClockToMinute(String(draft?.endTime || ""));
    if (weekday === null || startMinute === null || endMinute === null || endMinute <= startMinute) {
      return [];
    }
    const untitled = t("schedule.event.untitled");
    const conflicts = [];
    const courses = Array.isArray(context.courses) ? context.courses : data?.scheduleData?.value ?? [];
    for (const course of courses) {
      if (Number(course?.weekday) !== weekday) continue;
      const interval = getCourseRealInterval(Number(course?.period), Number(course?.djs), timeSchedule);
      if (!interval) continue;
      if (!intervalsOverlap(startMinute, endMinute, interval.startMinute, interval.endMinute)) continue;
      conflicts.push({
        label: String(course?.name || "").trim() || untitled,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute
      });
    }
    const excludeId = String(context.excludeEventId || "").trim();
    const events = Array.isArray(context.events) ? context.events : [];
    for (const item of events) {
      if (!item) continue;
      if (excludeId && String(item.id) === excludeId) continue;
      if (String(item.date || "") !== date) continue;
      const itemStart = parseClockToMinute(String(item.startTime || ""));
      const itemEnd = parseClockToMinute(String(item.endTime || ""));
      if (itemStart === null || itemEnd === null) continue;
      if (!intervalsOverlap(startMinute, endMinute, itemStart, itemEnd)) continue;
      conflicts.push({
        label: String(item.title || "").trim() || untitled,
        startMinute: itemStart,
        endMinute: itemEnd
      });
    }
    return conflicts.sort((a, b) => a.startMinute - b.startMinute);
  };
  const submitEvent = async () => {
    if (savingEvent.value) return false;
    const sid = String(props?.studentId || "").trim();
    if (!sid) {
      eventError.value = t("schedule.event.studentRequired");
      return false;
    }
    const errorKey = validateEventDraft();
    if (errorKey) {
      eventError.value = t(errorKey);
      return false;
    }
    const isEditing = !!editingEventId.value;
    const draft = eventDraft.value;
    const event = {
      id: editingEventId.value,
      title: String(draft.title || "").trim(),
      date: String(draft.date || "").trim(),
      startTime: String(draft.startTime || "").trim(),
      endTime: String(draft.endTime || "").trim(),
      location: String(draft.location || "").trim(),
      note: String(draft.note || "").trim(),
      color: String(draft.color || "").trim() || DEFAULT_EVENT_COLOR,
      reminderMinutes: draft.reminderMinutes ?? null
    };
    const payload = isEditing ? { student_id: sid, event_id: event.id, ...toScheduleEventPayload(event) } : { student_id: sid, ...toScheduleEventPayload(event) };
    savingEvent.value = true;
    eventError.value = "";
    try {
      const res = await axiosInstance.post(
        `${API_BASE}/v2/schedule/event/${isEditing ? "update" : "add"}`,
        payload
      );
      if (!res.data?.success) {
        throw new Error(res.data?.error || t("schedule.event.submitFailed"));
      }
      await onChanged?.();
      editingEventId.value = "";
      return true;
    } catch (e) {
      eventError.value = String(
        e?.response?.data?.error || e?.message || t("schedule.event.submitFailed")
      );
      return false;
    } finally {
      savingEvent.value = false;
    }
  };
  const deleteEvent = async (eventId) => {
    const sid = String(props?.studentId || "").trim();
    const id = String(eventId || "").trim();
    if (!sid || !id || deletingEvent.value) return false;
    if (confirmDialog?.askConfirm) {
      const confirmed = await confirmDialog.askConfirm({
        title: t("schedule.event.deleteConfirmTitle"),
        lines: [t("schedule.event.deleteConfirmLine")],
        confirmText: t("schedule.editor.confirmDelete"),
        cancelText: t("schedule.confirm.cancel"),
        danger: true
      });
      if (!confirmed) return false;
    }
    deletingEvent.value = true;
    eventError.value = "";
    try {
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/event/delete`, {
        student_id: sid,
        event_id: id
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || t("schedule.event.deleteFailed"));
      }
      await onChanged?.();
      if (editingEventId.value === id) editingEventId.value = "";
      return true;
    } catch (e) {
      eventError.value = String(
        e?.response?.data?.error || e?.message || t("schedule.event.deleteFailed")
      );
      return false;
    } finally {
      deletingEvent.value = false;
    }
  };
  return {
    eventDraft,
    eventError,
    savingEvent,
    deletingEvent,
    editingEventId,
    resetEventDraft,
    populateEventDraft,
    validateEventDraft,
    conflictsOf,
    submitEvent,
    deleteEvent
  };
};
const useScheduleEventDetail = (options) => {
  const { props, eventData, events, getWeekCourses, onEdit } = options;
  const showEventDetail = ref(false);
  const selectedEvent = ref(null);
  const detailError = ref("");
  const draftOfSelectedEvent = (event) => ({
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    note: event.note,
    color: event.color,
    reminderMinutes: event.reminderMinutes
  });
  const detailConflicts = computed(() => {
    const event = selectedEvent.value;
    if (!event) return [];
    const courses = typeof getWeekCourses === "function" ? getWeekCourses() : [];
    return events.conflictsOf(draftOfSelectedEvent(event), {
      courses: Array.isArray(courses) ? courses : [],
      events: eventData.weekEvents.value,
      excludeEventId: event.id
    });
  });
  const openEventDetail = (raw) => {
    const normalized = normalizeScheduleEvent(raw);
    if (!normalized) return false;
    detailError.value = "";
    selectedEvent.value = normalized;
    showEventDetail.value = true;
    return true;
  };
  const closeEventDetail = () => {
    showEventDetail.value = false;
    selectedEvent.value = null;
    detailError.value = "";
  };
  const requestEditEvent = () => {
    const event = selectedEvent.value;
    if (!event) return false;
    if (!events.populateEventDraft(event)) return false;
    closeEventDetail();
    onEdit?.(event);
    return true;
  };
  const requestDeleteEvent = async () => {
    const event = selectedEvent.value;
    if (!event?.id) return false;
    detailError.value = "";
    events.eventError.value = "";
    const ok = await events.deleteEvent(event.id);
    if (!ok) {
      detailError.value = String(events.eventError?.value || "").trim();
      return false;
    }
    closeEventDetail();
    await eventData.refreshWeekEvents();
    return true;
  };
  watch(
    () => [
      String(props?.studentId || ""),
      eventData.weekIsoDates.value.join(","),
      eventData.weekEvents.value.map((item) => item.id).join(",")
    ],
    () => {
      const current = selectedEvent.value;
      if (!current) return;
      const stillExists = eventData.weekEvents.value.some((item) => item.id === current.id);
      if (!stillExists) closeEventDetail();
    }
  );
  return {
    showEventDetail,
    selectedEvent,
    detailConflicts,
    detailError,
    openEventDetail,
    closeEventDetail,
    requestEditEvent,
    requestDeleteEvent
  };
};
const _hoisted_1$e = { class: "schedule-topbar" };
const _hoisted_2$e = ["aria-label"];
const _hoisted_3$e = { class: "topbar-center" };
const _hoisted_4$d = { class: "topbar-title" };
const _hoisted_5$d = { class: "topbar-semester" };
const _hoisted_6$c = { class: "topbar-right" };
const _hoisted_7$c = { class: "week-selector" };
const _hoisted_8$a = {
  disabled: "",
  value: 0
};
const _hoisted_9$9 = ["value"];
const _sfc_main$f = {
  __name: "ScheduleTopbar",
  props: {
    semester: { type: String, default: "" },
    selectedWeek: { type: Number, default: 0 },
    totalWeeks: { type: Number, default: 25 }
  },
  emits: ["update:selectedWeek", "toggle-menu"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t: t2 } = useI18n();
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1$e, [
        createBaseVNode("button", {
          class: "menu-btn btn-ripple",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("toggle-menu")),
          "aria-label": unref(t2)("schedule.topbar.openMenu")
        }, [..._cache[2] || (_cache[2] = [
          createBaseVNode("span", { class: "material-symbols-outlined menu-icon" }, "menu", -1)
        ])], 8, _hoisted_2$e),
        createBaseVNode("div", _hoisted_3$e, [
          createBaseVNode("h1", _hoisted_4$d, toDisplayString(unref(t2)("schedule.topbar.title")), 1),
          createBaseVNode("p", _hoisted_5$d, toDisplayString(__props.semester || unref(t2)("schedule.topbar.loading")), 1)
        ]),
        createBaseVNode("div", _hoisted_6$c, [
          createBaseVNode("div", _hoisted_7$c, [
            createVNode(_component_IOSSelect, {
              "model-value": __props.selectedWeek,
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => emit("update:selectedWeek", $event))
            }, {
              default: withCtx(() => [
                createBaseVNode("option", _hoisted_8$a, toDisplayString(unref(t2)("schedule.topbar.weekPlaceholder")), 1),
                (openBlock(true), createElementBlock(Fragment, null, renderList(__props.totalWeeks, (w) => {
                  return openBlock(), createElementBlock("option", {
                    key: w,
                    value: w
                  }, toDisplayString(unref(t2)("schedule.topbar.weekOption").replace("{n}", String(w))), 9, _hoisted_9$9);
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
const ScheduleTopbar = /* @__PURE__ */ _export_sfc(_sfc_main$f, [["__scopeId", "data-v-121b4cdb"]]);
const _hoisted_1$d = { class: "drawer-title" };
const _hoisted_2$d = { class: "drawer-section" };
const _hoisted_3$d = {
  class: "drawer-subtitle",
  "data-step": "1"
};
const _hoisted_4$c = { class: "drawer-semester-row" };
const _hoisted_5$c = {
  disabled: "",
  value: ""
};
const _hoisted_6$b = ["value"];
const _hoisted_7$b = {
  key: 0,
  class: "drawer-error"
};
const _hoisted_8$9 = { class: "drawer-section" };
const _hoisted_9$8 = {
  class: "drawer-subtitle",
  "data-step": "2"
};
const _hoisted_10$8 = ["aria-label"];
const _hoisted_11$8 = ["aria-pressed", "aria-selected", "onClick"];
const _hoisted_12$8 = { class: "drawer-section" };
const _hoisted_13$8 = {
  class: "drawer-subtitle",
  "data-step": "3"
};
const _hoisted_14$7 = ["aria-label"];
const _hoisted_15$7 = ["aria-pressed", "aria-selected", "onClick"];
const _hoisted_16$7 = { class: "drawer-actions" };
const _hoisted_17$6 = { class: "drawer-course-group" };
const _hoisted_18$6 = {
  class: "drawer-subtitle",
  "data-step": "4"
};
const _hoisted_19$5 = { class: "drawer-course-actions" };
const _hoisted_20$5 = ["disabled"];
const _hoisted_21$5 = ["disabled"];
const _hoisted_22$4 = { class: "drawer-sync-group" };
const _hoisted_23$4 = {
  class: "drawer-subtitle",
  "data-step": "5"
};
const _hoisted_24$4 = { class: "drawer-sync-actions" };
const _hoisted_25$3 = ["disabled"];
const _hoisted_26$3 = ["disabled"];
const _hoisted_27$3 = { class: "drawer-sync-actions drawer-sync-actions--json" };
const _hoisted_28$3 = ["disabled"];
const _hoisted_29$3 = ["disabled"];
const _hoisted_30$3 = { class: "drawer-sync-status" };
const _hoisted_31$3 = { class: "drawer-sync-cooldown" };
const _hoisted_32$3 = { class: "drawer-sync-cooldown" };
const _hoisted_33$3 = {
  key: 0,
  class: "drawer-sync-running"
};
const _hoisted_34$3 = {
  key: 1,
  class: "drawer-sync-export-path"
};
const _hoisted_35$3 = {
  class: "drawer-subtitle",
  "data-step": "6"
};
const _hoisted_36$3 = ["disabled"];
const _hoisted_37$2 = ["disabled"];
const _hoisted_38$2 = { class: "drawer-tip" };
const _hoisted_39$2 = {
  key: 0,
  class: "export-result"
};
const _hoisted_40$2 = { class: "export-label" };
const _hoisted_41$2 = { class: "export-row" };
const _hoisted_42$2 = ["value"];
const _hoisted_43$1 = {
  key: 0,
  class: "export-copied"
};
const _hoisted_44$1 = {
  key: 1,
  class: "export-error"
};
const _sfc_main$e = {
  __name: "ScheduleDrawer",
  props: {
    showMenu: { type: Boolean, default: false },
    semesterOptions: { type: Array, default: () => [] },
    semesterDraft: { type: String, default: "" },
    semesterLoading: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    semesterError: { type: String, default: "" },
    scheduleCourseCardStyle: { type: String, default: "modern" },
    scheduleViewMode: { type: String, default: "all" },
    viewModeOptions: { type: Array, default: () => [] },
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
    "set-view-mode",
    "set-style",
    "open-add-arrangement",
    "open-manage-courses",
    "open-ai-import",
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
    const { t: t2 } = useI18n();
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
              onClick: _cache[14] || (_cache[14] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_1$d, [
                _cache[15] || (_cache[15] = createBaseVNode("span", { class: "material-symbols-outlined drawer-title-icon" }, "calendar_month", -1)),
                createTextVNode(" " + toDisplayString(unref(t2)("schedule.drawer.title")), 1)
              ]),
              createBaseVNode("div", _hoisted_2$d, [
                createBaseVNode("div", _hoisted_3$d, toDisplayString(unref(t2)("schedule.drawer.section.semester")), 1),
                createBaseVNode("div", _hoisted_4$c, [
                  createVNode(_component_IOSSelect, {
                    class: "drawer-select",
                    modelValue: semesterDraftModel.value,
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => semesterDraftModel.value = $event),
                    disabled: __props.semesterLoading || __props.loading,
                    onChange: _cache[2] || (_cache[2] = ($event) => emit("semester-change"))
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_5$c, toDisplayString(unref(t2)("schedule.drawer.semesterPlaceholder")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(__props.semesterOptions, (sem) => {
                        return openBlock(), createElementBlock("option", {
                          key: sem,
                          value: sem
                        }, toDisplayString(sem), 9, _hoisted_6$b);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue", "disabled"])
                ]),
                __props.semesterError ? (openBlock(), createElementBlock("div", _hoisted_7$b, toDisplayString(__props.semesterError), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_8$9, [
                createBaseVNode("div", _hoisted_9$8, toDisplayString(unref(t2)("schedule.drawer.section.view")), 1),
                createBaseVNode("div", {
                  class: "drawer-view-switch",
                  role: "tablist",
                  "aria-label": unref(t2)("schedule.viewMode.aria")
                }, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(__props.viewModeOptions, (item) => {
                    return openBlock(), createElementBlock("button", {
                      key: item.key,
                      type: "button",
                      class: normalizeClass(["drawer-view-chip", { active: __props.scheduleViewMode === item.key }]),
                      role: "tab",
                      "aria-pressed": __props.scheduleViewMode === item.key,
                      "aria-selected": __props.scheduleViewMode === item.key,
                      onClick: withModifiers(($event) => emit("set-view-mode", item.key), ["stop"])
                    }, [
                      createBaseVNode("strong", null, toDisplayString(item.label), 1)
                    ], 10, _hoisted_11$8);
                  }), 128))
                ], 8, _hoisted_10$8)
              ]),
              createBaseVNode("div", _hoisted_12$8, [
                createBaseVNode("div", _hoisted_13$8, toDisplayString(unref(t2)("schedule.drawer.section.style")), 1),
                createBaseVNode("div", {
                  class: "drawer-style-switch",
                  role: "tablist",
                  "aria-label": unref(t2)("schedule.drawer.styleSwitchAria")
                }, [
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
                    ], 10, _hoisted_15$7);
                  }), 128))
                ], 8, _hoisted_14$7)
              ]),
              createBaseVNode("div", _hoisted_16$7, [
                createBaseVNode("div", _hoisted_17$6, [
                  createBaseVNode("div", _hoisted_18$6, toDisplayString(unref(t2)("schedule.drawer.section.manage")), 1),
                  createBaseVNode("div", _hoisted_19$5, [
                    createBaseVNode("button", {
                      class: "drawer-action add-course",
                      disabled: __props.addingCourse,
                      onClick: _cache[3] || (_cache[3] = ($event) => emit("open-add-arrangement"))
                    }, [
                      _cache[16] || (_cache[16] = createBaseVNode("span", { class: "material-symbols-outlined" }, "add_circle", -1)),
                      createTextVNode(" " + toDisplayString(unref(t2)("schedule.drawer.addArrangement")), 1)
                    ], 8, _hoisted_20$5),
                    createBaseVNode("button", {
                      class: "drawer-action manage-course",
                      disabled: __props.loadingManageCourses,
                      onClick: _cache[4] || (_cache[4] = ($event) => emit("open-manage-courses"))
                    }, [
                      _cache[17] || (_cache[17] = createBaseVNode("span", { class: "material-symbols-outlined" }, "folder_copy", -1)),
                      createTextVNode(" " + toDisplayString(__props.loadingManageCourses ? unref(t2)("schedule.topbar.loading") : unref(t2)("schedule.drawer.manageCourses")), 1)
                    ], 8, _hoisted_21$5),
                    createBaseVNode("button", {
                      class: "drawer-action ai-import-course",
                      onClick: _cache[5] || (_cache[5] = ($event) => emit("open-ai-import"))
                    }, [
                      _cache[18] || (_cache[18] = createBaseVNode("span", { class: "material-symbols-outlined" }, "auto_awesome", -1)),
                      createTextVNode(" " + toDisplayString(unref(t2)("schedule.import.entry")), 1)
                    ])
                  ])
                ]),
                createBaseVNode("div", _hoisted_22$4, [
                  createBaseVNode("div", _hoisted_23$4, toDisplayString(unref(t2)("schedule.drawer.section.sync")), 1),
                  createBaseVNode("div", _hoisted_24$4, [
                    createBaseVNode("button", {
                      class: "drawer-action sync-upload",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[6] || (_cache[6] = ($event) => emit("sync-upload"))
                    }, [
                      _cache[19] || (_cache[19] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_upload", -1)),
                      createTextVNode(" " + toDisplayString(__props.syncUploading ? unref(t2)("schedule.drawer.syncUploading") : unref(t2)("schedule.drawer.syncUpload")), 1)
                    ], 8, _hoisted_25$3),
                    createBaseVNode("button", {
                      class: "drawer-action sync-download",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[7] || (_cache[7] = ($event) => emit("sync-download"))
                    }, [
                      _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_download", -1)),
                      createTextVNode(" " + toDisplayString(__props.syncDownloading ? unref(t2)("schedule.drawer.syncDownloading") : unref(t2)("schedule.drawer.syncDownload")), 1)
                    ], 8, _hoisted_26$3)
                  ]),
                  createBaseVNode("div", _hoisted_27$3, [
                    createBaseVNode("button", {
                      class: "drawer-action sync-json-export",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[8] || (_cache[8] = ($event) => emit("export-json"))
                    }, [
                      _cache[21] || (_cache[21] = createBaseVNode("span", { class: "material-symbols-outlined" }, "data_object", -1)),
                      createTextVNode(" " + toDisplayString(__props.customCourseExporting ? unref(t2)("schedule.drawer.exporting") : unref(t2)("schedule.drawer.exportJson")), 1)
                    ], 8, _hoisted_28$3),
                    createBaseVNode("button", {
                      class: "drawer-action sync-json-import",
                      disabled: __props.syncUploading || __props.syncDownloading || __props.customCourseImporting || __props.customCourseExporting,
                      onClick: _cache[9] || (_cache[9] = ($event) => emit("import-json"))
                    }, [
                      _cache[22] || (_cache[22] = createBaseVNode("span", { class: "material-symbols-outlined" }, "file_upload", -1)),
                      createTextVNode(" " + toDisplayString(__props.customCourseImporting ? unref(t2)("schedule.drawer.importing") : unref(t2)("schedule.drawer.importJson")), 1)
                    ], 8, _hoisted_29$3)
                  ]),
                  createBaseVNode("input", {
                    ref: "customCourseFileInput",
                    type: "file",
                    accept: ".json,application/json",
                    style: { "display": "none" },
                    onChange: _cache[10] || (_cache[10] = ($event) => emit("import-file", $event))
                  }, null, 544),
                  createBaseVNode("div", _hoisted_30$3, [
                    createBaseVNode("span", _hoisted_31$3, toDisplayString(unref(t2)("schedule.drawer.uploadCooldown").replace("{t}", __props.syncUploadCooldownText)), 1),
                    createBaseVNode("span", _hoisted_32$3, toDisplayString(unref(t2)("schedule.drawer.downloadCooldown").replace("{t}", __props.syncDownloadCooldownText)), 1),
                    __props.syncStatusText ? (openBlock(), createElementBlock("span", _hoisted_33$3, toDisplayString(__props.syncStatusText), 1)) : createCommentVNode("", true),
                    __props.customCourseExportLocation ? (openBlock(), createElementBlock("span", _hoisted_34$3, toDisplayString(unref(t2)("schedule.drawer.exportLocation").replace("{t}", __props.customCourseExportLocation)), 1)) : createCommentVNode("", true)
                  ])
                ]),
                createBaseVNode("div", _hoisted_35$3, toDisplayString(unref(t2)("schedule.drawer.section.export")), 1),
                createBaseVNode("button", {
                  class: "drawer-action",
                  disabled: __props.exporting,
                  onClick: _cache[11] || (_cache[11] = ($event) => emit("export-calendar", "week"))
                }, [
                  _cache[23] || (_cache[23] = createBaseVNode("span", { class: "material-symbols-outlined" }, "calendar_today", -1)),
                  createTextVNode(" " + toDisplayString(__props.exporting && __props.exportingMode === "week" ? unref(t2)("schedule.drawer.generating") : unref(t2)("schedule.drawer.exportWeek")), 1)
                ], 8, _hoisted_36$3),
                createBaseVNode("button", {
                  class: "drawer-action ghost",
                  disabled: __props.exporting,
                  onClick: _cache[12] || (_cache[12] = ($event) => emit("export-calendar", "semester"))
                }, [
                  _cache[24] || (_cache[24] = createBaseVNode("span", { class: "material-symbols-outlined" }, "school", -1)),
                  createTextVNode(" " + toDisplayString(__props.exporting && __props.exportingMode === "semester" ? unref(t2)("schedule.drawer.generating") : unref(t2)("schedule.drawer.exportSemester")), 1)
                ], 8, _hoisted_37$2)
              ]),
              createBaseVNode("div", _hoisted_38$2, toDisplayString(unref(t2)("schedule.drawer.exportTip")), 1),
              __props.exportUrl ? (openBlock(), createElementBlock("div", _hoisted_39$2, [
                createBaseVNode("div", _hoisted_40$2, toDisplayString(unref(t2)("schedule.drawer.exportResultLabel")), 1),
                createBaseVNode("div", _hoisted_41$2, [
                  createBaseVNode("input", {
                    class: "export-input",
                    type: "text",
                    value: __props.exportUrl,
                    readonly: ""
                  }, null, 8, _hoisted_42$2),
                  createBaseVNode("button", {
                    class: "export-copy",
                    onClick: _cache[13] || (_cache[13] = ($event) => emit("copy-export-url"))
                  }, toDisplayString(unref(t2)("schedule.drawer.copy")), 1)
                ]),
                __props.exportCopied ? (openBlock(), createElementBlock("div", _hoisted_43$1, toDisplayString(unref(t2)("schedule.drawer.copied")), 1)) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              __props.exportError ? (openBlock(), createElementBlock("div", _hoisted_44$1, toDisplayString(__props.exportError), 1)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ], 64);
    };
  }
};
const ScheduleDrawer = /* @__PURE__ */ _export_sfc(_sfc_main$e, [["__scopeId", "data-v-104ffdfe"]]);
const _hoisted_1$c = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_2$c = {
  key: 1,
  class: "vacation-banner"
};
const _hoisted_3$c = {
  key: 2,
  class: "term-start-banner"
};
const _hoisted_4$b = {
  key: 3,
  class: "error-banner"
};
const _hoisted_5$b = ["title"];
const _sfc_main$d = {
  __name: "ScheduleBanners",
  props: {
    offline: { type: Boolean, default: false },
    initialFetchDone: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    offlineBannerText: { type: String, default: "" },
    vacationNotice: { type: String, default: "" },
    errorMsg: { type: String, default: "" },
    currentWeek: { type: Number, default: 0 },
    selectedWeek: { type: Number, default: 0 },
    termStartNotice: { type: String, default: "" }
  },
  emits: ["jump-current"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t: t2 } = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        __props.offline && __props.initialFetchDone && !__props.loading ? (openBlock(), createElementBlock("div", _hoisted_1$c, toDisplayString(__props.offlineBannerText), 1)) : createCommentVNode("", true),
        __props.vacationNotice ? (openBlock(), createElementBlock("div", _hoisted_2$c, toDisplayString(__props.vacationNotice), 1)) : createCommentVNode("", true),
        __props.termStartNotice ? (openBlock(), createElementBlock("div", _hoisted_3$c, toDisplayString(__props.termStartNotice), 1)) : createCommentVNode("", true),
        __props.errorMsg ? (openBlock(), createElementBlock("div", _hoisted_4$b, toDisplayString(__props.errorMsg), 1)) : createCommentVNode("", true),
        __props.currentWeek && __props.selectedWeek && __props.selectedWeek !== __props.currentWeek ? (openBlock(), createElementBlock("button", {
          key: 4,
          class: "jump-current-btn",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("jump-current")),
          title: unref(t2)("schedule.banners.jumpToCurrentWeekTitle")
        }, toDisplayString(unref(t2)("schedule.banners.jumpToCurrentWeek")), 9, _hoisted_5$b)) : createCommentVNode("", true)
      ], 64);
    };
  }
};
const ScheduleBanners = /* @__PURE__ */ _export_sfc(_sfc_main$d, [["__scopeId", "data-v-882491aa"]]);
const _hoisted_1$b = ["onKeydown"];
const _hoisted_2$b = { class: "event-card__body" };
const _hoisted_3$b = {
  key: 0,
  class: "event-card__name"
};
const _hoisted_4$a = { class: "event-card__time" };
const _hoisted_5$a = { class: "event-card__clock" };
const _hoisted_6$a = {
  key: 0,
  class: "event-card__more"
};
const _hoisted_7$a = {
  key: 1,
  class: "event-card__place"
};
const _sfc_main$c = {
  __name: "ScheduleEventCard",
  props: {
    /** 渲染输入（ScheduleTimelineItem） */
    item: { type: Object, required: true },
    /** lane 布局结果（ScheduleLayoutSlot） */
    slot: { type: Object, required: true },
    /** 强制精简态（调用方按上下文收窄时使用） */
    compact: { type: Boolean, default: false }
  },
  emits: ["open-detail"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const widthPercent = computed(() => {
      const value = Number(props.slot?.widthPercent);
      return Number.isFinite(value) && value > 0 ? value : 100;
    });
    const heightPercent = computed(() => {
      const value = Number(props.slot?.heightPercent);
      return Number.isFinite(value) && value > 0 ? value : 0;
    });
    const isDense = computed(() => props.compact || !!props.slot?.collapsed);
    const isSingleLine = computed(() => isDense.value || heightPercent.value < 4);
    const showTimeRange = computed(() => !isSingleLine.value && widthPercent.value >= 48);
    const showPlace = computed(
      () => !isSingleLine.value && !!props.item?.subtitle && widthPercent.value >= 52 && heightPercent.value >= 8
    );
    const hiddenCount = computed(() => {
      const value = Number(props.slot?.hiddenCount);
      return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
    });
    const startText = computed(() => formatMinuteToClock$1(props.item?.startMinute));
    const endText = computed(() => formatMinuteToClock$1(props.item?.endMinute));
    const cardStyle = computed(() => {
      const slot = props.slot || {};
      const left = Number.isFinite(Number(slot.leftPercent)) ? Number(slot.leftPercent) : 0;
      const top = Number.isFinite(Number(slot.topPercent)) ? Number(slot.topPercent) : 0;
      return {
        top: `${top}%`,
        height: `${heightPercent.value}%`,
        // 左右各留 1px 缝隙，与相邻 lane / 课程卡保持可辨识的间隔
        left: `calc(${left}% + 1px)`,
        width: `calc(${widthPercent.value}% - 2px)`,
        "--event-accent": props.item?.color || "var(--event-accent-default, #2563eb)"
      };
    });
    const openDetail = () => emit("open-detail", props.item?.raw);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["event-card", { "event-card--dense": isDense.value, "event-card--single-line": isSingleLine.value }]),
        style: normalizeStyle(cardStyle.value),
        role: "button",
        tabindex: "0",
        onClick: withModifiers(openDetail, ["stop"]),
        onKeydown: withKeys(withModifiers(openDetail, ["stop"]), ["enter"])
      }, [
        _cache[0] || (_cache[0] = createBaseVNode("span", {
          class: "event-card__bar",
          "aria-hidden": "true"
        }, null, -1)),
        createBaseVNode("div", _hoisted_2$b, [
          !isSingleLine.value ? (openBlock(), createElementBlock("div", _hoisted_3$b, toDisplayString(__props.item?.title), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_4$a, [
            createBaseVNode("span", _hoisted_5$a, toDisplayString(showTimeRange.value ? `${startText.value} - ${endText.value}` : startText.value), 1),
            hiddenCount.value > 0 ? (openBlock(), createElementBlock("span", _hoisted_6$a, toDisplayString(`+${hiddenCount.value}`), 1)) : createCommentVNode("", true)
          ]),
          showPlace.value ? (openBlock(), createElementBlock("div", _hoisted_7$a, toDisplayString(__props.item?.subtitle), 1)) : createCommentVNode("", true)
        ])
      ], 46, _hoisted_1$b);
    };
  }
};
const ScheduleEventCard = /* @__PURE__ */ _export_sfc(_sfc_main$c, [["__scopeId", "data-v-fd891728"]]);
const normalizeDayIndex = (value) => {
  const day = Number(value);
  if (!Number.isFinite(day)) return null;
  const truncated = Math.trunc(day);
  if (truncated < 1 || truncated > 7) return null;
  return truncated;
};
const toOptionalText = (value) => {
  if (value === null || value === void 0) return void 0;
  const text = String(value).trim();
  return text.length > 0 ? text : void 0;
};
const toMonthDayKey = (value) => {
  const text = String(value ?? "").trim();
  if (text.length === 0) return null;
  const matched = /(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})/.exec(text);
  let month;
  let day;
  if (matched) {
    month = Number(matched[2]);
    day = Number(matched[3]);
  } else {
    const short = /^(\d{1,2})\D+(\d{1,2})$/.exec(text);
    if (!short) return null;
    month = Number(short[1]);
    day = Number(short[2]);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${month}-${day}`;
};
function courseToTimelineItem(course, dayIndex, source, timeSchedule2) {
  if (!course || typeof course !== "object") return null;
  const day = normalizeDayIndex(dayIndex) ?? normalizeDayIndex(course.weekday);
  if (day === null) return null;
  const interval = getCourseRealInterval(
    Number(course.period),
    Number(course.djs),
    timeSchedule2
  );
  if (interval === null) return null;
  const title = toOptionalText(course.name) ?? "";
  const subtitle = [toOptionalText(course.teacher), toOptionalText(course.room_code ?? course.room)].filter((part) => !!part).join(" · ");
  const id = toOptionalText(course._uid ?? course.id ?? course.source_id) ?? `${source}:${day}:${interval.startMinute}:${interval.endMinute}:${title}`;
  return {
    id,
    kind: "course",
    dayIndex: day,
    startMinute: interval.startMinute,
    endMinute: interval.endMinute,
    title,
    subtitle: subtitle.length > 0 ? subtitle : void 0,
    color: toOptionalText(course.color),
    source,
    raw: course
  };
}
function eventToTimelineItem(event, weekDates, dayIndexHint) {
  if (!event || typeof event !== "object") return null;
  const startMinute = parseClockToMinute(event.startTime);
  const endMinute = parseClockToMinute(event.endTime);
  if (startMinute === null || endMinute === null) return null;
  if (endMinute <= startMinute) return null;
  const dates = Array.isArray(weekDates) ? weekDates : [];
  const eventKey = toMonthDayKey(event.date);
  let day = null;
  if (eventKey !== null) {
    for (let i = 0; i < dates.length; i += 1) {
      if (toMonthDayKey(dates[i]) === eventKey) {
        day = i + 1;
        break;
      }
    }
  }
  if (day === null && dates.length === 0) {
    day = normalizeDayIndex(dayIndexHint);
  }
  if (day === null) return null;
  const title = toOptionalText(event.title) ?? "";
  const id = toOptionalText(event.id) ?? `personal-event:${day}:${startMinute}:${endMinute}:${title}`;
  return {
    id,
    kind: "event",
    dayIndex: day,
    startMinute,
    endMinute,
    title,
    subtitle: toOptionalText(event.location),
    color: toOptionalText(event.color),
    source: "personal-event",
    raw: event
  };
}
const DEFAULT_MAX_LANES = 3;
const MIN_LANE_WIDTH_PERCENT = 20;
const COMPACT_WIDTH_PERCENT = 30;
const COURSE_LANE_WEIGHT = 1.6;
const MIN_COURSE_REGION_PERCENT = 50;
const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};
const compareEntries = (a, b) => {
  if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
  if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
  if (a.kind !== b.kind) return a.kind === "course" ? -1 : 1;
  const idA = String(a.id ?? "");
  const idB = String(b.id ?? "");
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
};
const isBeforeVisibleRange = (item, geometry) => {
  if (!geometry?.valid || !Number.isFinite(geometry.firstMinute) || !Number.isFinite(geometry.lastMinute) || geometry.lastMinute <= geometry.firstMinute || !Number.isFinite(item?.startMinute) || !Number.isFinite(item?.endMinute) || item.endMinute <= item.startMinute) {
    return true;
  }
  return item.endMinute <= geometry.firstMinute;
};
const isAfterVisibleRange = (item, geometry) => {
  if (!geometry?.valid || !Number.isFinite(item?.startMinute) || !Number.isFinite(item?.endMinute) || item.endMinute <= item.startMinute) {
    return false;
  }
  return item.startMinute >= geometry.lastMinute;
};
function splitOutOfRangeEvents(items, geometry) {
  const before = [];
  const after = [];
  const inRange = [];
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item) continue;
    if (isBeforeVisibleRange(item, geometry)) {
      before.push(item);
    } else if (isAfterVisibleRange(item, geometry)) {
      after.push(item);
    } else {
      inRange.push(item);
    }
  }
  return { before, after, inRange };
}
const assignLanes = (entries) => {
  const lanes = [];
  for (const entry of entries) {
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      if (!intervalsOverlap(
        last.item.startMinute,
        last.item.endMinute,
        entry.item.startMinute,
        entry.item.endMinute
      )) {
        lane.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([entry]);
  }
  return lanes;
};
const courseRegionPercent = (courseLanes, eventLanes) => {
  if (courseLanes <= 0) return 0;
  if (eventLanes <= 0) return 100;
  const weighted = COURSE_LANE_WEIGHT * courseLanes;
  const raw = 100 * weighted / (eventLanes + weighted);
  return clampNumber(raw, MIN_COURSE_REGION_PERCENT, 100);
};
function layoutTimelineItems(items, geometry, options) {
  const result = { slots: [], overflowGroups: [] };
  const list = Array.isArray(items) ? items.filter((item) => !!item) : [];
  if (list.length === 0) return result;
  const totalHeight = getGridTotalHeight(geometry);
  if (!geometry?.valid || totalHeight <= 0) return result;
  const laneLimit = DEFAULT_MAX_LANES;
  const entries = [];
  for (const item of list) {
    if (isBeforeVisibleRange(item, geometry) || isAfterVisibleRange(item, geometry)) continue;
    const rect = intervalToGridRect(item.startMinute, item.endMinute, geometry);
    if (!rect) continue;
    entries.push({
      item,
      topPercent: rect.top / totalHeight * 100,
      heightPercent: rect.height / totalHeight * 100
    });
  }
  if (entries.length === 0) return result;
  entries.sort((a, b) => compareEntries(a.item, b.item));
  const clusters = [];
  let current = null;
  for (const entry of entries) {
    if (current && !intervalsOverlap(
      entry.item.startMinute,
      entry.item.endMinute,
      current.startMinute,
      current.endMinute
    )) {
      clusters.push(current);
      current = null;
    }
    if (!current) {
      current = {
        entries: [],
        startMinute: entry.item.startMinute,
        endMinute: entry.item.endMinute
      };
    }
    current.entries.push(entry);
    current.endMinute = Math.max(current.endMinute, entry.item.endMinute);
  }
  if (current) clusters.push(current);
  for (const cluster of clusters) {
    const courseLanes = assignLanes(cluster.entries.filter((entry) => entry.item.kind === "course"));
    const eventLanes = assignLanes(cluster.entries.filter((entry) => entry.item.kind === "event"));
    let visibleCourse = Math.min(courseLanes.length, laneLimit);
    let visibleEvent = Math.min(eventLanes.length, laneLimit - visibleCourse);
    while (visibleCourse + visibleEvent > 0) {
      const region2 = courseRegionPercent(visibleCourse, visibleEvent);
      const widths = [];
      if (visibleCourse > 0) widths.push(region2 / visibleCourse);
      if (visibleEvent > 0) widths.push((100 - region2) / visibleEvent);
      if (Math.min(...widths) >= MIN_LANE_WIDTH_PERCENT) break;
      if (visibleEvent > 0) visibleEvent -= 1;
      else visibleCourse -= 1;
    }
    const region = courseRegionPercent(visibleCourse, visibleEvent);
    const courseWidth = visibleCourse > 0 ? region / visibleCourse : 0;
    const eventWidth = visibleEvent > 0 ? (100 - region) / visibleEvent : 0;
    const courseLaneIndex = /* @__PURE__ */ new Map();
    courseLanes.forEach((lane, index) => lane.forEach((entry) => courseLaneIndex.set(entry, index)));
    const eventLaneIndex = /* @__PURE__ */ new Map();
    eventLanes.forEach((lane, index) => lane.forEach((entry) => eventLaneIndex.set(entry, index)));
    const clusterSlotStart = result.slots.length;
    const hiddenEntries = [];
    for (const entry of cluster.entries) {
      const courseIndex = courseLaneIndex.get(entry);
      if (courseIndex !== void 0) {
        if (courseIndex >= visibleCourse) {
          hiddenEntries.push(entry);
          continue;
        }
        result.slots.push({
          item: entry.item,
          leftPercent: courseIndex * courseWidth,
          widthPercent: courseWidth,
          topPercent: entry.topPercent,
          heightPercent: entry.heightPercent,
          collapsed: courseWidth < COMPACT_WIDTH_PERCENT,
          hiddenCount: 0
        });
        continue;
      }
      const eventIndex = eventLaneIndex.get(entry);
      if (eventIndex === void 0 || eventIndex >= visibleEvent) {
        hiddenEntries.push(entry);
        continue;
      }
      result.slots.push({
        item: entry.item,
        leftPercent: region + eventIndex * eventWidth,
        widthPercent: eventWidth,
        topPercent: entry.topPercent,
        heightPercent: entry.heightPercent,
        collapsed: eventWidth < COMPACT_WIDTH_PERCENT,
        hiddenCount: 0
      });
    }
    if (hiddenEntries.length > 0) {
      for (let i = clusterSlotStart; i < result.slots.length; i += 1) {
        result.slots[i].hiddenCount = hiddenEntries.length;
      }
      result.overflowGroups.push({
        dayIndex: hiddenEntries[0].item.dayIndex,
        topPercent: Math.min(...hiddenEntries.map((entry) => entry.topPercent)),
        hiddenCount: hiddenEntries.length,
        items: hiddenEntries.map((entry) => entry.item)
      });
    }
  }
  return result;
}
function gridYToMinute(y, geometry) {
  if (!Number.isFinite(y)) return null;
  const rows = geometry?.rows ?? [];
  const totalHeight = getGridTotalHeight(geometry);
  if (!geometry?.valid || rows.length === 0 || totalHeight <= 0) return null;
  const clampedY = clampNumber(y, 0, totalHeight);
  let row = rows[0];
  for (let i = 0; i < rows.length; i += 1) {
    if (clampedY >= rows[i].rowTop) row = rows[i];
    else break;
  }
  if (clampedY <= row.rowTop + row.periodBand) {
    const ratio = row.periodBand > 0 ? (clampedY - row.rowTop) / row.periodBand : 0;
    return row.startMinute + clampNumber(ratio, 0, 1) * (row.endMinute - row.startMinute);
  }
  const gapRatio = row.gapBand > 0 ? (clampedY - row.rowTop - row.periodBand) / row.gapBand : 0;
  return row.endMinute + clampNumber(gapRatio, 0, 1) * row.rawGapMinutes;
}
const normalizeSlots = (slots = timeSchedule) => (Array.isArray(slots) ? slots : []).map((slot) => {
  const startMinute = parseClockToMinute(slot?.start);
  const endMinute = parseClockToMinute(slot?.end);
  if (!Number.isFinite(slot?.p) || startMinute === null || endMinute === null || endMinute <= startMinute) {
    return null;
  }
  return {
    ...slot,
    p: Number(slot.p),
    startMinute,
    endMinute
  };
}).filter((slot) => !!slot).sort((a, b) => a.p - b.p);
const resolveClickedPeriod = (approximateMinute, slots = timeSchedule) => {
  const minute = Number(approximateMinute);
  const normalized = normalizeSlots(slots);
  if (!Number.isFinite(minute) || normalized.length === 0) return null;
  if (minute <= normalized[0].startMinute) return normalized[0].p;
  for (let index = 0; index < normalized.length; index += 1) {
    const slot = normalized[index];
    if (minute <= slot.endMinute) return slot.p;
    const next = normalized[index + 1];
    if (next && minute < next.startMinute) return next.p;
  }
  return normalized[normalized.length - 1].p;
};
const resolveCourseBlock = (period, slots = timeSchedule) => {
  const normalized = normalizeSlots(slots);
  if (normalized.length === 0) return null;
  const validPeriods = new Set(normalized.map((slot) => slot.p));
  const p = Number(period);
  if (!validPeriods.has(p)) return null;
  if (p >= 11 || !validPeriods.has(p % 2 === 0 ? p - 1 : p + 1)) {
    return { startPeriod: p, endPeriod: p, span: 1 };
  }
  const startPeriod = p % 2 === 0 ? p - 1 : p;
  const endPeriod = startPeriod + 1;
  if (!validPeriods.has(startPeriod) || !validPeriods.has(endPeriod)) {
    return { startPeriod: p, endPeriod: p, span: 1 };
  }
  return { startPeriod, endPeriod, span: 2 };
};
const courseBlockToGridRect = (startPeriod, endPeriod, totalPeriods = timeSchedule.length) => {
  const start = Number(startPeriod);
  const end = Number(endPeriod);
  const total = Number(totalPeriods);
  if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(total) || total <= 0 || start < 1 || end < start || end > total) {
    return null;
  }
  return {
    top: (start - 1) / total * 100,
    height: (end - start + 1) / total * 100
  };
};
const buildBlankTimeSelection = (approximateMinute, dayIndex, date, slots = timeSchedule) => {
  const normalized = normalizeSlots(slots);
  const period = resolveClickedPeriod(approximateMinute, slots);
  const block = period === null ? null : resolveCourseBlock(period, slots);
  if (!block) return null;
  const startSlot = normalized.find((slot) => slot.p === block.startPeriod);
  const endSlot = normalized.find((slot) => slot.p === block.endPeriod);
  if (!startSlot || !endSlot) return null;
  const day = Number(dayIndex);
  if (!Number.isInteger(day) || day < 1 || day > 7) return null;
  return {
    dayIndex: day,
    date: String(date || ""),
    startPeriod: block.startPeriod,
    endPeriod: block.endPeriod,
    span: block.span,
    startMinute: startSlot.startMinute,
    endMinute: endSlot.endMinute,
    startTime: formatMinuteToClock$1(startSlot.startMinute),
    endTime: formatMinuteToClock$1(endSlot.endMinute)
  };
};
const isSameBlankTimeSelection = (left, right) => !!left && !!right && left.dayIndex === right.dayIndex && left.date === right.date && left.startPeriod === right.startPeriod && left.endPeriod === right.endPeriod;
const _hoisted_1$a = { class: "date-header" };
const _hoisted_2$a = { class: "month-col" };
const _hoisted_3$a = { class: "month-num" };
const _hoisted_4$9 = {
  key: 0,
  class: "month-label"
};
const _hoisted_5$9 = { class: "days-row" };
const _hoisted_6$9 = { class: "day-num" };
const _hoisted_7$9 = { class: "day-label" };
const _hoisted_8$8 = { class: "grid-body" };
const _hoisted_9$7 = { class: "time-axis" };
const _hoisted_10$7 = { class: "time-start" };
const _hoisted_11$7 = { class: "period-num" };
const _hoisted_12$7 = { class: "time-end" };
const _hoisted_13$7 = {
  class: "grid-lines",
  "aria-hidden": "true"
};
const _hoisted_14$6 = ["onClick"];
const _hoisted_15$6 = ["onClick"];
const _hoisted_16$6 = { class: "course-name" };
const _hoisted_17$5 = { class: "course-room" };
const _hoisted_18$5 = {
  key: 0,
  class: "course-teacher"
};
const _hoisted_19$4 = {
  class: "blank-selection-layer",
  "aria-hidden": "true"
};
const _hoisted_20$4 = { class: "blank-time-selection-label" };
const _hoisted_21$4 = { class: "event-layer" };
const _hoisted_22$3 = ["onClick"];
const _hoisted_23$3 = ["onClick"];
const _hoisted_24$3 = ["onClick"];
const TAP_MOVE_THRESHOLD_PX = 8;
const _sfc_main$b = {
  __name: "ScheduleGrid",
  props: {
    weekDates: { type: Array, default: () => [] },
    currentMonth: { type: Number, default: 0 },
    selectedWeek: { type: Number, default: 0 },
    // #742a：周切换过渡方向（由 useScheduleSemester 按滑动/键盘方向设置）
    weekTransitionName: { type: String, default: "week-slide-left" },
    scheduleCourseCardStyle: { type: String, default: "modern" },
    courseCardRefreshNonce: { type: Number, default: 0 },
    getCoursesForDay: { type: Function, default: () => () => [] },
    getCourseStyle: { type: Function, default: () => ({}) },
    isWidgetHighlighted: { type: Function, default: () => false },
    // #837：该天的事件（camelCase 领域对象）。默认返回空数组 → 未接线时零改动
    getEventsForDay: { type: Function, default: () => () => [] },
    // #856：all | courses | events。筛选发生在 lane 输入层，不做 CSS 假隐藏。
    viewMode: { type: String, default: "all" },
    // #837：是否允许点击空白处快速创建（默认开启）
    enableBlankCreate: { type: Boolean, default: true },
    // #857：父层打开抽屉/弹窗时递增，清掉未确认的临时虚线框。
    selectionResetNonce: { type: Number, default: 0 }
  },
  emits: ["open-detail", "open-event-detail", "confirm-blank-selection"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t: t2 } = useI18n();
    const percentGeometry = buildScheduleTimeGeometry(timeSchedule, 100 / MAX_PERIOD);
    const EMPTY_LAYOUT = { slots: [], overflowGroups: [] };
    const isTodayColumn = (dayIndex) => {
      const idx = Number(dayIndex) - 1;
      if (idx < 0 || idx > 6) return false;
      const date = props.weekDates[idx];
      return !!date?.isToday;
    };
    const periodRows = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1);
    const weekIsoDates = computed(
      () => (Array.isArray(props.weekDates) ? props.weekDates : []).map((entry) => entry?.iso || "")
    );
    const showCourses = computed(() => props.viewMode !== "events");
    const showEvents = computed(() => props.viewMode !== "courses");
    const visibleCoursesForDay = (day) => {
      if (!showCourses.value) return [];
      const courses = props.getCoursesForDay(day);
      return Array.isArray(courses) ? courses : [];
    };
    const visibleEventsForDay = (day) => {
      if (!showEvents.value) return [];
      const events = props.getEventsForDay(day);
      return Array.isArray(events) ? events : [];
    };
    const courseKeyOf = (course) => String(course?._uid ?? course?.id ?? course?.source_id ?? "");
    const collectTimelineItems = (day) => {
      const items = [];
      const courses = visibleCoursesForDay(day);
      if (Array.isArray(courses)) {
        for (const course of courses) {
          const item = courseToTimelineItem(
            course,
            day,
            course?.is_custom ? "custom-course" : "official",
            timeSchedule
          );
          if (item) items.push(item);
        }
      }
      const events = visibleEventsForDay(day);
      if (Array.isArray(events)) {
        for (const event of events) {
          const item = eventToTimelineItem(event, weekIsoDates.value, day);
          if (item) items.push(item);
        }
      }
      return items;
    };
    const sortByStart = (list) => [...list].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    const dayTimeline = computed(() => {
      const map = {};
      for (let day = 1; day <= 7; day += 1) {
        const items = collectTimelineItems(day);
        const { before, after } = splitOutOfRangeEvents(items, percentGeometry);
        map[day] = {
          layout: layoutTimelineItems(items, percentGeometry),
          before: sortByStart(before),
          after: sortByStart(after)
        };
      }
      return map;
    });
    const dayLayout = (day) => dayTimeline.value[day]?.layout || EMPTY_LAYOUT;
    const eventSlots = (day) => dayLayout(day).slots.filter((slot) => slot.item.kind === "event");
    const overflowGroups = (day) => showEvents.value ? dayLayout(day).overflowGroups : [];
    const beforeEvents = (day) => dayTimeline.value[day]?.before || [];
    const afterEvents = (day) => dayTimeline.value[day]?.after || [];
    const courseSlotMap = computed(() => {
      const map = /* @__PURE__ */ new Map();
      for (let day = 1; day <= 7; day += 1) {
        const courses = visibleCoursesForDay(day);
        if (!Array.isArray(courses) || courses.length === 0) continue;
        const byId = /* @__PURE__ */ new Map();
        for (const slot of dayLayout(day).slots) {
          if (slot.item.kind === "course") byId.set(slot.item.id, slot);
        }
        if (byId.size === 0) continue;
        for (const course of courses) {
          const key = courseKeyOf(course);
          const slot = byId.get(key);
          if (slot) map.set(`${day}:${key}`, slot);
        }
      }
      return map;
    });
    const courseLaneStyle = (course, day) => {
      const slot = courseSlotMap.value.get(`${day}:${courseKeyOf(course)}`);
      if (!slot || slot.widthPercent >= 100) return null;
      const left = slot.leftPercent;
      const width = slot.widthPercent;
      return {
        width: `calc(${width}% - 2px)`,
        marginLeft: `calc(${left}% + 1px)`,
        marginRight: `calc(${100 - left - width}% + 1px)`
      };
    };
    const blankSelection = ref(null);
    const clearBlankSelection = () => {
      blankSelection.value = null;
    };
    watch(
      [
        () => props.selectedWeek,
        () => props.viewMode,
        () => props.selectionResetNonce,
        () => weekIsoDates.value.join("|")
      ],
      clearBlankSelection
    );
    const blankSelectionStyle = (day) => {
      const selection = blankSelection.value;
      if (!selection || selection.dayIndex !== Number(day)) return null;
      const rect = courseBlockToGridRect(selection.startPeriod, selection.endPeriod, MAX_PERIOD);
      if (!rect) return null;
      return {
        top: `${rect.top}%`,
        height: `${rect.height}%`
      };
    };
    const blankSelectionLabel = (day) => {
      const selection = blankSelection.value;
      if (!selection || selection.dayIndex !== Number(day)) return "";
      return selection.startPeriod === selection.endPeriod ? String(selection.startPeriod) : `${selection.startPeriod}–${selection.endPeriod}`;
    };
    let pointerOrigin = null;
    let tapMoved = false;
    const handleColumnPointerDown = (event) => {
      pointerOrigin = { x: event.clientX, y: event.clientY };
      tapMoved = false;
    };
    const handleColumnPointerUp = (event) => {
      const origin = pointerOrigin;
      pointerOrigin = null;
      if (!origin) return;
      tapMoved = Math.abs(event.clientX - origin.x) > TAP_MOVE_THRESHOLD_PX || Math.abs(event.clientY - origin.y) > TAP_MOVE_THRESHOLD_PX;
    };
    const handleColumnClick = (event, day) => {
      if (!props.enableBlankCreate || tapMoved) return;
      const target = event.target;
      if (target?.closest?.(".course-card, .event-card, .event-overflow-chip, .event-edge-indicator")) {
        clearBlankSelection();
        return;
      }
      const layer = event.currentTarget?.querySelector?.(".event-layer");
      const rect = layer?.getBoundingClientRect?.();
      if (!rect || rect.height <= 0) return;
      const offsetY = event.clientY - rect.top;
      if (offsetY < 0 || offsetY > rect.height) return;
      const approximate = gridYToMinute(
        offsetY / rect.height * getGridTotalHeight(percentGeometry),
        percentGeometry
      );
      if (approximate === null) return;
      const nextSelection = buildBlankTimeSelection(
        approximate,
        Number(day),
        props.weekDates?.[day - 1]?.iso || "",
        timeSchedule
      );
      if (!nextSelection) return;
      if (isSameBlankTimeSelection(blankSelection.value, nextSelection)) {
        clearBlankSelection();
        emit("confirm-blank-selection", nextSelection);
        return;
      }
      blankSelection.value = nextSelection;
    };
    const edgeHint = (list) => {
      const first = list[0];
      if (!first) return "";
      const clock = formatMinuteToClock$1(first.startMinute);
      const suffix = list.length > 1 ? ` +${list.length - 1}` : "";
      return `${clock} ${first.title || ""}${suffix}`.trim();
    };
    const openFirstEvent = (list) => {
      const first = Array.isArray(list) ? list[0] : null;
      if (first) {
        clearBlankSelection();
        emit("open-event-detail", first.raw);
      }
    };
    const openCourseDetail = (course) => {
      clearBlankSelection();
      emit("open-detail", course);
    };
    const openEventDetail = (raw) => {
      clearBlankSelection();
      emit("open-event-detail", raw);
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, {
        name: __props.weekTransitionName,
        mode: "out-in"
      }, {
        default: withCtx(() => [
          (openBlock(), createElementBlock("div", {
            class: "timetable-container",
            key: `week-${__props.selectedWeek}`
          }, [
            createBaseVNode("div", _hoisted_1$a, [
              createBaseVNode("div", _hoisted_2$a, [
                createBaseVNode("div", _hoisted_3$a, [
                  createTextVNode(toDisplayString(__props.currentMonth), 1),
                  unref(t2)("schedule.grid.monthSuffix") ? (openBlock(), createElementBlock("span", _hoisted_4$9, toDisplayString(unref(t2)("schedule.grid.monthSuffix")), 1)) : createCommentVNode("", true)
                ])
              ]),
              createBaseVNode("div", _hoisted_5$9, [
                (openBlock(), createElementBlock(Fragment, null, renderList(7, (day) => {
                  return createBaseVNode("div", {
                    key: day,
                    class: normalizeClass(["day-col", { "is-today": isTodayColumn(day) }])
                  }, [
                    createBaseVNode("div", _hoisted_6$9, toDisplayString(__props.weekDates[day - 1]?.date || day), 1),
                    createBaseVNode("div", _hoisted_7$9, toDisplayString(__props.weekDates[day - 1]?.dayLabel || ""), 1)
                  ], 2);
                }), 64))
              ])
            ]),
            createBaseVNode("div", _hoisted_8$8, [
              createBaseVNode("div", _hoisted_9$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(timeSchedule), (t3) => {
                  return openBlock(), createElementBlock("div", {
                    key: t3.p,
                    class: "time-slot"
                  }, [
                    createBaseVNode("span", _hoisted_10$7, toDisplayString(t3.start), 1),
                    createBaseVNode("span", _hoisted_11$7, toDisplayString(t3.p), 1),
                    createBaseVNode("span", _hoisted_12$7, toDisplayString(t3.end), 1)
                  ]);
                }), 128))
              ]),
              (openBlock(), createElementBlock("div", {
                class: "courses-grid",
                key: `courses-grid-${__props.scheduleCourseCardStyle}-${__props.courseCardRefreshNonce}`
              }, [
                createBaseVNode("div", _hoisted_13$7, [
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
                    class: normalizeClass(["day-column", { "is-today-column": isTodayColumn(day) }]),
                    onPointerdown: handleColumnPointerDown,
                    onPointerup: handleColumnPointerUp,
                    onClick: ($event) => handleColumnClick($event, day)
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(visibleCoursesForDay(day), (course) => {
                      return openBlock(), createElementBlock("div", {
                        key: course._uid || course.id,
                        class: normalizeClass(["course-card", [
                          `course-card--${__props.scheduleCourseCardStyle}`,
                          { conflict: course.is_conflict },
                          { "widget-highlight": __props.isWidgetHighlighted(course, day) }
                        ]]),
                        style: normalizeStyle([__props.getCourseStyle(course), courseLaneStyle(course, day)]),
                        onClick: ($event) => openCourseDetail(course)
                      }, [
                        createBaseVNode("div", _hoisted_16$6, toDisplayString(course.name), 1),
                        createBaseVNode("div", _hoisted_17$5, toDisplayString(course.is_conflict ? unref(t2)("schedule.grid.conflictHint") : course.room_code || course.room), 1),
                        __props.scheduleCourseCardStyle === "class" && !course.is_conflict ? (openBlock(), createElementBlock("div", _hoisted_18$5, toDisplayString(course.teacher || unref(t2)("schedule.grid.noTeacher")), 1)) : createCommentVNode("", true)
                      ], 14, _hoisted_15$6);
                    }), 128)),
                    createBaseVNode("div", _hoisted_19$4, [
                      blankSelectionStyle(day) ? (openBlock(), createElementBlock("div", {
                        key: 0,
                        class: "blank-time-selection",
                        style: normalizeStyle(blankSelectionStyle(day))
                      }, [
                        createBaseVNode("span", _hoisted_20$4, toDisplayString(blankSelectionLabel(day)), 1)
                      ], 4)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_21$4, [
                      beforeEvents(day).length ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        type: "button",
                        class: "event-edge-indicator event-edge-indicator--before",
                        onClick: withModifiers(($event) => openFirstEvent(beforeEvents(day)), ["stop"])
                      }, toDisplayString(`↑ ${edgeHint(beforeEvents(day))}`), 9, _hoisted_22$3)) : createCommentVNode("", true),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(eventSlots(day), (slot) => {
                        return openBlock(), createBlock(ScheduleEventCard, {
                          key: `event-${slot.item.id}`,
                          item: slot.item,
                          slot,
                          onOpenDetail: _cache[0] || (_cache[0] = ($event) => openEventDetail($event))
                        }, null, 8, ["item", "slot"]);
                      }), 128)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(overflowGroups(day), (group) => {
                        return openBlock(), createElementBlock("button", {
                          key: `overflow-${day}-${group.topPercent}`,
                          type: "button",
                          class: "event-overflow-chip",
                          style: normalizeStyle({ top: `${group.topPercent}%` }),
                          onClick: withModifiers(($event) => openFirstEvent(group.items), ["stop"])
                        }, toDisplayString(`+${group.hiddenCount}`), 13, _hoisted_23$3);
                      }), 128)),
                      afterEvents(day).length ? (openBlock(), createElementBlock("button", {
                        key: 1,
                        type: "button",
                        class: "event-edge-indicator event-edge-indicator--after",
                        onClick: withModifiers(($event) => openFirstEvent(afterEvents(day)), ["stop"])
                      }, toDisplayString(`↓ ${edgeHint(afterEvents(day))}`), 9, _hoisted_24$3)) : createCommentVNode("", true)
                    ])
                  ], 42, _hoisted_14$6);
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
const ScheduleGrid = /* @__PURE__ */ _export_sfc(_sfc_main$b, [["__scopeId", "data-v-293fdd30"]]);
const _hoisted_1$9 = { class: "modal-header" };
const _hoisted_2$9 = {
  key: 0,
  class: "modal-body"
};
const _hoisted_3$9 = { class: "conflict-hint" };
const _hoisted_4$8 = ["onClick"];
const _hoisted_5$8 = { class: "conflict-item-title" };
const _hoisted_6$8 = {
  key: 0,
  class: "conflict-tag"
};
const _hoisted_7$8 = { class: "conflict-item-row" };
const _hoisted_8$7 = { class: "conflict-item-row" };
const _hoisted_9$6 = { class: "conflict-item-row" };
const _hoisted_10$6 = {
  key: 1,
  class: "modal-body"
};
const _hoisted_11$6 = { class: "info-row" };
const _hoisted_12$6 = { class: "label" };
const _hoisted_13$6 = { class: "value" };
const _hoisted_14$5 = { class: "info-row" };
const _hoisted_15$5 = { class: "label" };
const _hoisted_16$5 = { class: "value" };
const _hoisted_17$4 = { class: "info-row" };
const _hoisted_18$4 = { class: "label" };
const _hoisted_19$3 = { class: "value" };
const _hoisted_20$3 = { class: "info-row" };
const _hoisted_21$3 = { class: "label" };
const _hoisted_22$2 = { class: "value" };
const _hoisted_23$2 = { class: "info-row" };
const _hoisted_24$2 = { class: "label" };
const _hoisted_25$2 = { class: "value" };
const _hoisted_26$2 = { class: "info-row" };
const _hoisted_27$2 = { class: "label" };
const _hoisted_28$2 = { class: "value" };
const _hoisted_29$2 = { class: "info-row" };
const _hoisted_30$2 = { class: "label" };
const _hoisted_31$2 = { class: "value" };
const _hoisted_32$2 = {
  key: 0,
  class: "custom-course-actions"
};
const _hoisted_33$2 = {
  key: 1,
  class: "official-course-actions"
};
const _hoisted_34$2 = { class: "official-remove-hint" };
const _hoisted_35$2 = { class: "detail-copy-actions" };
const _hoisted_36$2 = {
  key: 2,
  class: "detail-action-error"
};
const _sfc_main$a = {
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
    "remove-official-course",
    "copy-detail"
  ],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t: t2 } = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "fade" }, {
        default: withCtx(() => [
          __props.showDetail ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: _cache[7] || (_cache[7] = ($event) => emit("close"))
          }, [
            createBaseVNode("div", {
              class: "modal-content glass",
              onClick: _cache[6] || (_cache[6] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_1$9, [
                createBaseVNode("h3", null, toDisplayString(__props.selectedCourse?.name), 1),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                }, "×")
              ]),
              __props.selectedCourse?.is_conflict ? (openBlock(), createElementBlock("div", _hoisted_2$9, [
                createBaseVNode("div", _hoisted_3$9, toDisplayString(unref(t2)("schedule.detail.conflictBannerHint")), 1),
                (openBlock(true), createElementBlock(Fragment, null, renderList(__props.selectedCourse?.conflict_courses || [], (item, idx) => {
                  return openBlock(), createElementBlock("div", {
                    key: `${item.id || item.name}-${idx}`,
                    class: normalizeClass(["conflict-item", { clickable: item.is_custom }]),
                    onClick: ($event) => item.is_custom && emit("open-conflict-course-detail", item)
                  }, [
                    createBaseVNode("div", _hoisted_5$8, [
                      createTextVNode(toDisplayString(idx + 1) + ". " + toDisplayString(item.name) + " ", 1),
                      item.is_custom ? (openBlock(), createElementBlock("span", _hoisted_6$8, toDisplayString(unref(t2)("schedule.detail.tag.custom")), 1)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_7$8, toDisplayString(unref(t2)("schedule.detail.teacher")) + "：" + toDisplayString(item.teacher || unref(t2)("schedule.detail.teacherNotFilled")), 1),
                    createBaseVNode("div", _hoisted_8$7, toDisplayString(unref(t2)("schedule.detail.location")) + "：" + toDisplayString([item.building, item.room || item.room_code].filter(Boolean).join(" ") || unref(t2)("schedule.detail.locationNotFilled")), 1),
                    createBaseVNode("div", _hoisted_9$6, toDisplayString(unref(t2)("schedule.detail.time")) + "：" + toDisplayString(unref(t2)("schedule.detail.conflictPeriod").replace("{n}", String(item.weekday)).replace("{s}", String(item.period)).replace("{e}", String(unref(getCourseEndPeriod)(item)))), 1)
                  ], 10, _hoisted_4$8);
                }), 128))
              ])) : (openBlock(), createElementBlock("div", _hoisted_10$6, [
                createBaseVNode("div", _hoisted_11$6, [
                  createBaseVNode("span", _hoisted_12$6, toDisplayString(unref(t2)("schedule.detail.type")), 1),
                  createBaseVNode("span", _hoisted_13$6, toDisplayString(__props.selectedCourse?.is_custom ? unref(t2)("schedule.detail.typeCustom") : unref(t2)("schedule.detail.typeOfficial")), 1)
                ]),
                createBaseVNode("div", _hoisted_14$5, [
                  createBaseVNode("span", _hoisted_15$5, toDisplayString(unref(t2)("schedule.detail.teacher")), 1),
                  createBaseVNode("span", _hoisted_16$5, toDisplayString(__props.selectedCourse?.teacher), 1)
                ]),
                createBaseVNode("div", _hoisted_17$4, [
                  createBaseVNode("span", _hoisted_18$4, toDisplayString(unref(t2)("schedule.detail.classroom")), 1),
                  createBaseVNode("span", _hoisted_19$3, toDisplayString(__props.selectedCourse?.room) + " (" + toDisplayString(__props.selectedCourse?.building) + ")", 1)
                ]),
                createBaseVNode("div", _hoisted_20$3, [
                  createBaseVNode("span", _hoisted_21$3, toDisplayString(unref(t2)("schedule.detail.time")), 1),
                  createBaseVNode("span", _hoisted_22$2, toDisplayString(unref(t2)("schedule.detail.conflictPeriod").replace("{n}", String(__props.selectedCourse?.weekday ?? "")).replace("{s}", String(__props.selectedCourse?.period ?? "")).replace("{e}", String(unref(getCourseEndPeriod)(__props.selectedCourse)))), 1)
                ]),
                createBaseVNode("div", _hoisted_23$2, [
                  createBaseVNode("span", _hoisted_24$2, toDisplayString(unref(t2)("schedule.detail.weeks")), 1),
                  createBaseVNode("span", _hoisted_25$2, toDisplayString(__props.selectedCourse?.weeks_text), 1)
                ]),
                createBaseVNode("div", _hoisted_26$2, [
                  createBaseVNode("span", _hoisted_27$2, toDisplayString(unref(t2)("schedule.detail.credit")), 1),
                  createBaseVNode("span", _hoisted_28$2, toDisplayString(__props.selectedCourse?.credit), 1)
                ]),
                createBaseVNode("div", _hoisted_29$2, [
                  createBaseVNode("span", _hoisted_30$2, toDisplayString(unref(t2)("schedule.detail.classGroup")), 1),
                  createBaseVNode("span", _hoisted_31$2, toDisplayString(__props.selectedCourse?.class_name), 1)
                ]),
                __props.selectedCourse?.is_custom ? (openBlock(), createElementBlock("div", _hoisted_32$2, [
                  createBaseVNode("button", {
                    class: "custom-delete-btn edit",
                    onClick: _cache[1] || (_cache[1] = ($event) => emit("open-edit-course", __props.selectedCourse, { reopenDetail: true }))
                  }, toDisplayString(unref(t2)("schedule.detail.editCourse")), 1),
                  createBaseVNode("button", {
                    class: "custom-delete-btn week",
                    onClick: _cache[2] || (_cache[2] = ($event) => emit("delete-custom-course", "current_week"))
                  }, toDisplayString(unref(t2)("schedule.detail.deleteCurrentWeek")), 1),
                  createBaseVNode("button", {
                    class: "custom-delete-btn all",
                    onClick: _cache[3] || (_cache[3] = ($event) => emit("delete-custom-course", "all"))
                  }, toDisplayString(unref(t2)("schedule.detail.deleteAllWeeks")), 1)
                ])) : (openBlock(), createElementBlock("div", _hoisted_33$2, [
                  createBaseVNode("button", {
                    class: "official-remove-btn",
                    onClick: _cache[4] || (_cache[4] = ($event) => emit("remove-official-course", __props.selectedCourse))
                  }, toDisplayString(unref(t2)("schedule.detail.removeOfficial")), 1),
                  createBaseVNode("p", _hoisted_34$2, toDisplayString(unref(t2)("schedule.detail.removeOfficialHint")), 1)
                ]))
              ])),
              createBaseVNode("div", _hoisted_35$2, [
                createBaseVNode("button", {
                  class: "detail-copy-btn",
                  onClick: _cache[5] || (_cache[5] = ($event) => emit("copy-detail"))
                }, toDisplayString(unref(t2)("schedule.detail.copyDetail")), 1)
              ]),
              __props.detailActionError ? (openBlock(), createElementBlock("div", _hoisted_36$2, toDisplayString(__props.detailActionError), 1)) : createCommentVNode("", true)
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleCourseDetail = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["__scopeId", "data-v-fe4bbb90"]]);
const _hoisted_1$8 = { class: "course-color-picker" };
const _hoisted_2$8 = { class: "ccp-entry-right" };
const _hoisted_3$8 = { class: "ccp-entry-meta" };
const _hoisted_4$7 = { class: "ccp-preset-grid" };
const _hoisted_5$7 = ["title", "aria-label", "onClick"];
const _hoisted_6$7 = { class: "ccp-custom-body" };
const _hoisted_7$7 = { class: "ccp-preview-row" };
const _hoisted_8$6 = { class: "ccp-hex" };
const hueGradient = "linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";
const _sfc_main$9 = {
  __name: "CourseColorPicker",
  props: {
    /** 当前颜色 hex，空字符串表示未设定 */
    modelValue: { type: String, default: DEFAULT_COURSE_COLOR }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const panel = ref("closed");
    const draftHex = ref("");
    const hue = ref(210);
    const sat = ref(0.55);
    const val = ref(0.95);
    const displayHex = computed(() => {
      const n = normalizeOptionalCourseColor(props.modelValue);
      return n === null ? "" : n;
    });
    const displaySwatch = computed(() => displayHex.value || "#cbd5e1");
    const isPresetSelected = (hex) => {
      const a = normalizeHexColor(hex);
      const b = normalizeHexColor(draftHex.value);
      return !!a && !!b && a === b;
    };
    const syncDraftFromModel = () => {
      const n = normalizeOptionalCourseColor(props.modelValue);
      draftHex.value = n || "";
      const hsv = hexToHsv(draftHex.value || "#72b9ff");
      if (hsv) {
        hue.value = hsv.h;
        sat.value = hsv.s;
        val.value = hsv.v;
      }
    };
    watch(
      () => props.modelValue,
      () => {
        if (panel.value === "closed") syncDraftFromModel();
      },
      { immediate: true }
    );
    const openPreset = () => {
      syncDraftFromModel();
      panel.value = "preset";
    };
    const closePanel = () => {
      panel.value = "closed";
    };
    const goCustom = () => {
      const hsv = hexToHsv(draftHex.value || "#72b9ff");
      if (hsv) {
        hue.value = hsv.h;
        sat.value = hsv.s;
        val.value = hsv.v;
      }
      panel.value = "custom";
    };
    const backToPreset = () => {
      panel.value = "preset";
    };
    const selectPreset = (hex) => {
      const n = normalizeHexColor(hex);
      if (!n) return;
      draftHex.value = n;
    };
    const clearColor = () => {
      draftHex.value = "";
    };
    const confirmColor = () => {
      const n = normalizeOptionalCourseColor(draftHex.value);
      if (n === null) return;
      emit("update:modelValue", n);
      panel.value = "closed";
    };
    const customPreview = computed(() => hsvToHex(hue.value, sat.value, val.value));
    watch([hue, sat, val], () => {
      if (panel.value !== "custom") return;
      draftHex.value = customPreview.value;
    });
    const svPanelRef = ref(null);
    const hueBarRef = ref(null);
    let draggingSv = false;
    let draggingHue = false;
    const applySvFromEvent = (event) => {
      const el = svPanelRef.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clientX = event.touches?.[0]?.clientX ?? event.clientX;
      const clientY = event.touches?.[0]?.clientY ?? event.clientY;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      sat.value = x;
      val.value = 1 - y;
    };
    const applyHueFromEvent = (event) => {
      const el = hueBarRef.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clientX = event.touches?.[0]?.clientX ?? event.clientX;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      hue.value = x * 360;
    };
    const onSvPointerDown = (event) => {
      draggingSv = true;
      applySvFromEvent(event);
      event.preventDefault?.();
    };
    const onHuePointerDown = (event) => {
      draggingHue = true;
      applyHueFromEvent(event);
      event.preventDefault?.();
    };
    const onPointerMove = (event) => {
      if (draggingSv) applySvFromEvent(event);
      if (draggingHue) applyHueFromEvent(event);
    };
    const onPointerUp = () => {
      draggingSv = false;
      draggingHue = false;
    };
    onMounted(() => {
      if (typeof window === "undefined") return;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("touchmove", onPointerMove, { passive: false });
      window.addEventListener("touchend", onPointerUp);
    });
    onBeforeUnmount(() => {
      if (typeof window === "undefined") return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
    });
    const svKnobStyle = computed(() => ({
      left: `${sat.value * 100}%`,
      top: `${(1 - val.value) * 100}%`
    }));
    const hueKnobStyle = computed(() => ({
      left: `${hue.value / 360 * 100}%`
    }));
    const svBackground = computed(() => {
      const pure = hsvToHex(hue.value, 1, 1);
      return {
        background: `
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, ${pure})
    `
      };
    });
    const presetMatchLabel = computed(() => {
      const p = findPresetByHex(displayHex.value);
      return p?.label || (displayHex.value ? displayHex.value.toUpperCase() : "未设定");
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$8, [
        createBaseVNode("button", {
          type: "button",
          class: "ccp-entry",
          onClick: openPreset
        }, [
          _cache[3] || (_cache[3] = createBaseVNode("span", { class: "ccp-entry-label" }, "设定颜色", -1)),
          createBaseVNode("span", _hoisted_2$8, [
            createBaseVNode("span", {
              class: "ccp-swatch",
              style: normalizeStyle({ background: displaySwatch.value })
            }, null, 4),
            createBaseVNode("span", _hoisted_3$8, toDisplayString(presetMatchLabel.value), 1),
            _cache[2] || (_cache[2] = createBaseVNode("span", {
              class: "ccp-chevron",
              "aria-hidden": "true"
            }, "›", -1))
          ])
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          createVNode(Transition, { name: "ccp-fade" }, {
            default: withCtx(() => [
              panel.value !== "closed" ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "ccp-mask",
                onClick: withModifiers(closePanel, ["self"])
              }, [
                createVNode(Transition, {
                  name: "ccp-sheet",
                  mode: "out-in"
                }, {
                  default: withCtx(() => [
                    panel.value === "preset" ? (openBlock(), createElementBlock("div", {
                      key: "preset",
                      class: "ccp-sheet",
                      onClick: _cache[0] || (_cache[0] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      createBaseVNode("div", { class: "ccp-sheet-header" }, [
                        _cache[4] || (_cache[4] = createBaseVNode("div", { class: "ccp-sheet-title" }, "预设", -1)),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-text-btn",
                          onClick: closePanel
                        }, "关闭")
                      ]),
                      createBaseVNode("div", _hoisted_4$7, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(COURSE_COLOR_PRESETS), (item) => {
                          return openBlock(), createElementBlock("button", {
                            key: item.id,
                            type: "button",
                            class: normalizeClass(["ccp-preset-cell", { active: isPresetSelected(item.hex) }]),
                            title: item.label,
                            "aria-label": item.label,
                            style: normalizeStyle({ background: item.hex }),
                            onClick: ($event) => selectPreset(item.hex)
                          }, null, 14, _hoisted_5$7);
                        }), 128))
                      ]),
                      createBaseVNode("div", { class: "ccp-sheet-actions ccp-actions-3" }, [
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-secondary",
                          onClick: clearColor
                        }, "清除"),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-secondary",
                          onClick: goCustom
                        }, "自定义"),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-primary",
                          onClick: confirmColor
                        }, "完成")
                      ])
                    ])) : panel.value === "custom" ? (openBlock(), createElementBlock("div", {
                      key: "custom",
                      class: "ccp-sheet",
                      onClick: _cache[1] || (_cache[1] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      createBaseVNode("div", { class: "ccp-sheet-header ccp-header-3" }, [
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-text-btn",
                          onClick: backToPreset
                        }, "返回"),
                        _cache[5] || (_cache[5] = createBaseVNode("div", { class: "ccp-sheet-title" }, "自定义", -1)),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-text-btn",
                          onClick: closePanel
                        }, "关闭")
                      ]),
                      createBaseVNode("div", _hoisted_6$7, [
                        createBaseVNode("div", {
                          ref_key: "svPanelRef",
                          ref: svPanelRef,
                          class: "ccp-sv",
                          style: normalizeStyle(svBackground.value),
                          onPointerdown: onSvPointerDown,
                          onTouchstart: withModifiers(onSvPointerDown, ["prevent"])
                        }, [
                          createBaseVNode("span", {
                            class: "ccp-sv-knob",
                            style: normalizeStyle(svKnobStyle.value)
                          }, null, 4)
                        ], 36),
                        createBaseVNode("div", {
                          ref_key: "hueBarRef",
                          ref: hueBarRef,
                          class: "ccp-hue",
                          style: normalizeStyle({ background: hueGradient }),
                          onPointerdown: onHuePointerDown,
                          onTouchstart: withModifiers(onHuePointerDown, ["prevent"])
                        }, [
                          createBaseVNode("span", {
                            class: "ccp-hue-knob",
                            style: normalizeStyle(hueKnobStyle.value)
                          }, null, 4)
                        ], 36),
                        createBaseVNode("div", _hoisted_7$7, [
                          createBaseVNode("span", {
                            class: "ccp-swatch large",
                            style: normalizeStyle({ background: customPreview.value })
                          }, null, 4),
                          createBaseVNode("span", _hoisted_8$6, toDisplayString(customPreview.value.toUpperCase()), 1)
                        ])
                      ]),
                      createBaseVNode("div", { class: "ccp-sheet-actions ccp-actions-2" }, [
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-secondary",
                          onClick: backToPreset
                        }, "预设"),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-primary",
                          onClick: confirmColor
                        }, "完成")
                      ])
                    ])) : createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ])) : createCommentVNode("", true)
            ]),
            _: 1
          })
        ]))
      ]);
    };
  }
};
const CourseColorPicker = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["__scopeId", "data-v-1513f417"]]);
const _hoisted_1$7 = { class: "course-form-fields" };
const _hoisted_2$7 = { class: "add-course-semester" };
const _hoisted_3$7 = { class: "add-field" };
const _hoisted_4$6 = ["placeholder"];
const _hoisted_5$6 = { class: "add-field" };
const _hoisted_6$6 = ["placeholder"];
const _hoisted_7$6 = { class: "add-field" };
const _hoisted_8$5 = ["placeholder"];
const _hoisted_9$5 = { class: "add-field" };
const _hoisted_10$5 = ["value"];
const _hoisted_11$5 = { class: "add-row" };
const _hoisted_12$5 = { class: "add-field" };
const _hoisted_13$5 = ["value"];
const _hoisted_14$4 = { class: "add-field" };
const _hoisted_15$4 = ["value"];
const _hoisted_16$4 = { class: "add-field" };
const _sfc_main$8 = {
  __name: "ScheduleCourseForm",
  props: {
    /** 课程表单对象（由 useScheduleEditor.addCourseForm 提供） */
    form: { type: Object, default: () => ({}) },
    /** 当前学期（仅展示） */
    semester: { type: String, default: "" },
    /** 可选上课节数（随开始节次变化） */
    spanOptions: { type: Array, default: () => [] },
    /** 已选周次文案（由 useScheduleEditor.addWeeksCountText 计算） */
    weeksCountText: { type: String, default: "" }
  },
  emits: ["open-week-picker"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const form = computed(() => props.form);
    const { t: t2 } = useI18n();
    const weekDayLabels = computed(() => getWeekDayLabels());
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1$7, [
        createBaseVNode("div", _hoisted_2$7, toDisplayString(unref(t2)("schedule.addCourse.semesterLabel").replace("{t}", __props.semester)), 1),
        createBaseVNode("label", _hoisted_3$7, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.addCourse.nameLabel")), 1),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.name = $event),
            type: "text",
            placeholder: unref(t2)("schedule.addCourse.namePlaceholder")
          }, null, 8, _hoisted_4$6), [
            [
              vModelText,
              form.value.name,
              void 0,
              { trim: true }
            ]
          ])
        ]),
        createBaseVNode("label", _hoisted_5$6, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.addCourse.teacherLabel")), 1),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.teacher = $event),
            type: "text",
            placeholder: unref(t2)("schedule.addCourse.teacherPlaceholder")
          }, null, 8, _hoisted_6$6), [
            [
              vModelText,
              form.value.teacher,
              void 0,
              { trim: true }
            ]
          ])
        ]),
        createBaseVNode("label", _hoisted_7$6, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.addCourse.roomLabel")), 1),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.room = $event),
            type: "text",
            placeholder: unref(t2)("schedule.addCourse.roomPlaceholder")
          }, null, 8, _hoisted_8$5), [
            [
              vModelText,
              form.value.room,
              void 0,
              { trim: true }
            ]
          ])
        ]),
        createBaseVNode("div", _hoisted_9$5, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.addCourse.timeLabel")), 1),
          createVNode(_component_IOSSelect, {
            modelValue: form.value.weekday,
            "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.weekday = $event),
            modelModifiers: { number: true }
          }, {
            default: withCtx(() => [
              (openBlock(true), createElementBlock(Fragment, null, renderList(weekDayLabels.value, (label, idx) => {
                return openBlock(), createElementBlock("option", {
                  key: label,
                  value: idx + 1
                }, toDisplayString(label), 9, _hoisted_10$5);
              }), 128))
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]),
        createBaseVNode("div", _hoisted_11$5, [
          createBaseVNode("label", _hoisted_12$5, [
            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.addCourse.startPeriodLabel")), 1),
            createVNode(_component_IOSSelect, {
              modelValue: form.value.period,
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.period = $event),
              modelModifiers: { number: true }
            }, {
              default: withCtx(() => [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(periodOptions), (p) => {
                  return openBlock(), createElementBlock("option", {
                    key: p,
                    value: p
                  }, toDisplayString(unref(t2)("schedule.addCourse.periodOption").replace("{n}", String(p))), 9, _hoisted_13$5);
                }), 128))
              ]),
              _: 1
            }, 8, ["modelValue"])
          ]),
          createBaseVNode("label", _hoisted_14$4, [
            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.addCourse.spanLabel")), 1),
            createVNode(_component_IOSSelect, {
              modelValue: form.value.djs,
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.djs = $event),
              modelModifiers: { number: true }
            }, {
              default: withCtx(() => [
                (openBlock(true), createElementBlock(Fragment, null, renderList(__props.spanOptions, (s) => {
                  return openBlock(), createElementBlock("option", {
                    key: s,
                    value: s
                  }, toDisplayString(unref(t2)("schedule.addCourse.spanOption").replace("{n}", String(s))), 9, _hoisted_15$4);
                }), 128))
              ]),
              _: 1
            }, 8, ["modelValue"])
          ])
        ]),
        createBaseVNode("div", _hoisted_16$4, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.addCourse.weeksLabel")), 1),
          createBaseVNode("button", {
            class: "week-picker-trigger",
            onClick: _cache[6] || (_cache[6] = ($event) => emit("open-week-picker"))
          }, toDisplayString(__props.weeksCountText), 1)
        ])
      ]);
    };
  }
};
const ScheduleCourseForm = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["__scopeId", "data-v-8b2fa45c"]]);
const _hoisted_1$6 = { class: "event-form-fields" };
const _hoisted_2$6 = { class: "add-field" };
const _hoisted_3$6 = ["placeholder"];
const _hoisted_4$5 = { class: "add-field" };
const _hoisted_5$5 = { class: "add-row" };
const _hoisted_6$5 = { class: "add-field" };
const _hoisted_7$5 = { class: "add-field" };
const _hoisted_8$4 = { class: "add-field" };
const _hoisted_9$4 = ["placeholder"];
const _hoisted_10$4 = { class: "add-field" };
const _hoisted_11$4 = ["value"];
const _hoisted_12$4 = ["value"];
const _hoisted_13$4 = {
  key: 0,
  class: "event-conflict"
};
const _hoisted_14$3 = { class: "event-conflict-title" };
const _hoisted_15$3 = {
  key: 0,
  class: "event-conflict-summary"
};
const _hoisted_16$3 = ["aria-expanded"];
const _hoisted_17$3 = { class: "material-symbols-outlined event-more-icon" };
const _hoisted_18$3 = {
  key: 1,
  class: "event-more"
};
const _hoisted_19$2 = { class: "add-field" };
const _hoisted_20$2 = { class: "add-field" };
const _hoisted_21$2 = ["placeholder"];
const _sfc_main$7 = {
  __name: "ScheduleEventForm",
  props: {
    /** 日程草稿对象（useScheduleEvents.eventDraft） */
    draft: { type: Object, default: () => ({}) },
    /** 冲突提示（useScheduleEvents.conflictsOf 的结果） */
    conflicts: { type: Array, default: () => [] }
  },
  setup(__props) {
    const props = __props;
    const form = computed(() => props.draft);
    const { t: t2 } = useI18n();
    const showMore = ref(false);
    watch(
      () => props.draft,
      () => {
        showMore.value = false;
      }
    );
    const reminderOptions = REMINDER_OPTIONS;
    const reminderValue = computed(() => {
      const value = form.value?.reminderMinutes;
      return value === null || value === void 0 ? "" : String(value);
    });
    const onReminderChange = (event) => {
      const target = event?.target;
      const raw = target && target.value !== void 0 ? String(target.value) : "";
      form.value.reminderMinutes = raw === "" ? null : Number(raw);
    };
    const visibleConflicts = computed(
      () => (Array.isArray(props.conflicts) ? props.conflicts : []).slice(0, 3)
    );
    const conflictCount = computed(() => Array.isArray(props.conflicts) ? props.conflicts.length : 0);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$6, [
        createBaseVNode("label", _hoisted_2$6, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.titleLabel")), 1),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.title = $event),
            type: "text",
            placeholder: unref(t2)("schedule.event.titlePlaceholder")
          }, null, 8, _hoisted_3$6), [
            [
              vModelText,
              form.value.title,
              void 0,
              { trim: true }
            ]
          ])
        ]),
        createBaseVNode("label", _hoisted_4$5, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.dateLabel")), 1),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.date = $event),
            type: "date"
          }, null, 512), [
            [vModelText, form.value.date]
          ])
        ]),
        createBaseVNode("div", _hoisted_5$5, [
          createBaseVNode("label", _hoisted_6$5, [
            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.startTimeLabel")), 1),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.startTime = $event),
              type: "time"
            }, null, 512), [
              [vModelText, form.value.startTime]
            ])
          ]),
          createBaseVNode("label", _hoisted_7$5, [
            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.endTimeLabel")), 1),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.endTime = $event),
              type: "time"
            }, null, 512), [
              [vModelText, form.value.endTime]
            ])
          ])
        ]),
        createBaseVNode("label", _hoisted_8$4, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.locationLabel")), 1),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.location = $event),
            type: "text",
            placeholder: unref(t2)("schedule.event.locationPlaceholder")
          }, null, 8, _hoisted_9$4), [
            [
              vModelText,
              form.value.location,
              void 0,
              { trim: true }
            ]
          ])
        ]),
        createBaseVNode("div", _hoisted_10$4, [
          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.reminderLabel")), 1),
          createBaseVNode("select", {
            class: "event-reminder-select",
            value: reminderValue.value,
            onChange: onReminderChange
          }, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(reminderOptions), (option) => {
              return openBlock(), createElementBlock("option", {
                key: String(option.value),
                value: option.value === null ? "" : String(option.value)
              }, toDisplayString(unref(t2)(option.labelKey)), 9, _hoisted_12$4);
            }), 128))
          ], 40, _hoisted_11$4)
        ]),
        conflictCount.value > 0 ? (openBlock(), createElementBlock("div", _hoisted_13$4, [
          createBaseVNode("div", _hoisted_14$3, toDisplayString(unref(t2)("schedule.event.conflictTitle")), 1),
          (openBlock(true), createElementBlock(Fragment, null, renderList(visibleConflicts.value, (item, index) => {
            return openBlock(), createElementBlock("div", {
              key: index,
              class: "event-conflict-item"
            }, toDisplayString(unref(tf)("schedule.event.conflictItem", {
              start: unref(formatMinuteToClock)(item.startMinute),
              end: unref(formatMinuteToClock)(item.endMinute),
              label: item.label
            })), 1);
          }), 128)),
          conflictCount.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_15$3, toDisplayString(unref(tf)("schedule.event.conflictSummary", { n: conflictCount.value })), 1)) : createCommentVNode("", true)
        ])) : createCommentVNode("", true),
        createBaseVNode("button", {
          type: "button",
          class: "event-more-toggle",
          "aria-expanded": showMore.value,
          onClick: _cache[5] || (_cache[5] = ($event) => showMore.value = !showMore.value)
        }, [
          createBaseVNode("span", _hoisted_17$3, toDisplayString(showMore.value ? "expand_less" : "expand_more"), 1),
          createTextVNode(" " + toDisplayString(showMore.value ? unref(t2)("schedule.event.moreSettingsHide") : unref(t2)("schedule.event.moreSettings")), 1)
        ], 8, _hoisted_16$3),
        showMore.value ? (openBlock(), createElementBlock("div", _hoisted_18$3, [
          createBaseVNode("div", _hoisted_19$2, [
            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.colorLabel")), 1),
            createVNode(CourseColorPicker, {
              modelValue: form.value.color,
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.color = $event)
            }, null, 8, ["modelValue"])
          ]),
          createBaseVNode("label", _hoisted_20$2, [
            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.event.noteLabel")), 1),
            withDirectives(createBaseVNode("textarea", {
              "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.value.note = $event),
              rows: "3",
              placeholder: unref(t2)("schedule.event.notePlaceholder")
            }, null, 8, _hoisted_21$2), [
              [
                vModelText,
                form.value.note,
                void 0,
                { trim: true }
              ]
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const ScheduleEventForm = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-5e8ed60d"]]);
const _hoisted_1$5 = { class: "modal-header" };
const _hoisted_2$5 = ["aria-label"];
const _hoisted_3$5 = ["aria-selected"];
const _hoisted_4$4 = ["aria-selected"];
const _hoisted_5$4 = { class: "arrangement-body" };
const _hoisted_6$4 = { class: "add-field" };
const _hoisted_7$4 = {
  key: 0,
  class: "drawer-error"
};
const _hoisted_8$3 = {
  key: 0,
  class: "drawer-error"
};
const _hoisted_9$3 = { class: "arrangement-actions" };
const _hoisted_10$3 = ["disabled"];
const _hoisted_11$3 = { class: "arrangement-actions-row" };
const _hoisted_12$3 = ["disabled"];
const _hoisted_13$3 = ["disabled"];
const _sfc_main$6 = {
  __name: "ScheduleAddArrangementDialog",
  props: {
    show: { type: Boolean, default: false },
    /** add | editCourse | editEvent */
    mode: { type: String, default: "add" },
    /** 创建态默认选中的 Tab：course | event */
    initialTab: { type: String, default: "course" },
    // —— 课程 Tab ——
    courseSemester: { type: String, default: "" },
    courseDraft: { type: Object, default: () => ({}) },
    courseError: { type: String, default: "" },
    savingCourse: { type: Boolean, default: false },
    courseSpanOptions: { type: Array, default: () => [] },
    addWeeksCountText: { type: String, default: "" },
    // —— 日程 Tab ——
    eventDraft: { type: Object, default: () => ({}) },
    eventError: { type: String, default: "" },
    savingEvent: { type: Boolean, default: false },
    deletingEvent: { type: Boolean, default: false },
    eventConflicts: { type: Array, default: () => [] }
  },
  emits: [
    "close",
    "submit-course",
    "submit-event",
    "delete-event",
    "open-week-picker"
  ],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const courseForm = computed(() => props.courseDraft);
    const { t: t2 } = useI18n();
    const activeTab = ref("course");
    const isCreateMode = computed(() => props.mode === "add");
    const isEditEventMode = computed(() => props.mode === "editEvent");
    const busy = computed(() => props.savingCourse || props.savingEvent || props.deletingEvent);
    const applyModeTab = () => {
      if (props.mode === "editEvent") {
        activeTab.value = "event";
        return;
      }
      if (props.mode === "editCourse") {
        activeTab.value = "course";
        return;
      }
      activeTab.value = props.initialTab === "event" ? "event" : "course";
    };
    watch(
      () => [props.show, props.mode, props.initialTab],
      () => {
        if (props.show) applyModeTab();
      },
      { immediate: true }
    );
    const title = computed(() => {
      if (props.mode === "editEvent") return t2("schedule.arrangement.titleEditEvent");
      if (props.mode === "editCourse") return t2("schedule.arrangement.titleEditCourse");
      return t2("schedule.arrangement.titleAdd");
    });
    const submitText = computed(() => {
      const editing = props.mode !== "add";
      if (activeTab.value === "event") {
        if (props.savingEvent) {
          return editing ? t2("schedule.event.submittingEdit") : t2("schedule.event.submittingAdd");
        }
        return editing ? t2("schedule.event.submitEdit") : t2("schedule.event.submitAdd");
      }
      if (props.savingCourse) {
        return editing ? t2("schedule.addCourse.submittingEdit") : t2("schedule.addCourse.submittingAdd");
      }
      return editing ? t2("schedule.addCourse.submitEdit") : t2("schedule.addCourse.submitAdd");
    });
    const onSubmit = () => {
      if (busy.value) return;
      if (activeTab.value === "event") {
        emit("submit-event");
        return;
      }
      emit("submit-course");
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "fade" }, {
        default: withCtx(() => [
          __props.show ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: _cache[8] || (_cache[8] = ($event) => emit("close"))
          }, [
            createBaseVNode("div", {
              class: "modal-content glass arrangement-modal",
              onClick: _cache[7] || (_cache[7] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_1$5, [
                createBaseVNode("h3", null, toDisplayString(title.value), 1),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                }, "×")
              ]),
              isCreateMode.value ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "arrangement-tabs",
                role: "tablist",
                "aria-label": unref(t2)("schedule.arrangement.tabAria")
              }, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass(["arrangement-tab", { active: activeTab.value === "course" }]),
                  role: "tab",
                  "aria-selected": activeTab.value === "course",
                  onClick: _cache[1] || (_cache[1] = ($event) => activeTab.value = "course")
                }, [
                  _cache[9] || (_cache[9] = createBaseVNode("span", { class: "material-symbols-outlined" }, "menu_book", -1)),
                  createTextVNode(" " + toDisplayString(unref(t2)("schedule.arrangement.tabCourse")), 1)
                ], 10, _hoisted_3$5),
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass(["arrangement-tab", { active: activeTab.value === "event" }]),
                  role: "tab",
                  "aria-selected": activeTab.value === "event",
                  onClick: _cache[2] || (_cache[2] = ($event) => activeTab.value = "event")
                }, [
                  _cache[10] || (_cache[10] = createBaseVNode("span", { class: "material-symbols-outlined" }, "event", -1)),
                  createTextVNode(" " + toDisplayString(unref(t2)("schedule.arrangement.tabEvent")), 1)
                ], 10, _hoisted_4$4)
              ], 8, _hoisted_2$5)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_5$4, [
                activeTab.value === "course" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createVNode(ScheduleCourseForm, {
                    form: courseForm.value,
                    semester: __props.courseSemester,
                    "span-options": __props.courseSpanOptions,
                    "weeks-count-text": __props.addWeeksCountText,
                    onOpenWeekPicker: _cache[3] || (_cache[3] = ($event) => emit("open-week-picker"))
                  }, null, 8, ["form", "semester", "span-options", "weeks-count-text"]),
                  createBaseVNode("div", _hoisted_6$4, [
                    createVNode(CourseColorPicker, {
                      modelValue: courseForm.value.color,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => courseForm.value.color = $event)
                    }, null, 8, ["modelValue"])
                  ]),
                  __props.courseError ? (openBlock(), createElementBlock("div", _hoisted_7$4, toDisplayString(__props.courseError), 1)) : createCommentVNode("", true)
                ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createVNode(ScheduleEventForm, {
                    draft: __props.eventDraft,
                    conflicts: __props.eventConflicts
                  }, null, 8, ["draft", "conflicts"]),
                  __props.eventError ? (openBlock(), createElementBlock("div", _hoisted_8$3, toDisplayString(__props.eventError), 1)) : createCommentVNode("", true)
                ], 64))
              ]),
              createBaseVNode("div", _hoisted_9$3, [
                isEditEventMode.value ? (openBlock(), createElementBlock("button", {
                  key: 0,
                  class: "drawer-action danger",
                  disabled: busy.value,
                  onClick: _cache[5] || (_cache[5] = ($event) => emit("delete-event"))
                }, [
                  _cache[11] || (_cache[11] = createBaseVNode("span", { class: "material-symbols-outlined" }, "delete", -1)),
                  createTextVNode(" " + toDisplayString(__props.deletingEvent ? unref(t2)("schedule.event.deleting") : unref(t2)("schedule.event.deleteEvent")), 1)
                ], 8, _hoisted_10$3)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_11$3, [
                  createBaseVNode("button", {
                    class: "drawer-action ghost",
                    disabled: busy.value,
                    onClick: _cache[6] || (_cache[6] = ($event) => emit("close"))
                  }, toDisplayString(unref(t2)("schedule.addCourse.cancel")), 9, _hoisted_12$3),
                  createBaseVNode("button", {
                    class: "drawer-action",
                    disabled: busy.value,
                    onClick: onSubmit
                  }, toDisplayString(submitText.value), 9, _hoisted_13$3)
                ])
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleAddArrangementDialog = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-29aed9e2"]]);
const _hoisted_1$4 = ["aria-label"];
const _hoisted_2$4 = { class: "modal-header" };
const _hoisted_3$4 = ["aria-label"];
const _hoisted_4$3 = { class: "event-detail-body" };
const _hoisted_5$3 = { class: "event-detail-type" };
const _hoisted_6$3 = {
  key: 0,
  class: "event-detail-row event-detail-date"
};
const _hoisted_7$3 = {
  key: 1,
  class: "event-detail-row event-detail-time"
};
const _hoisted_8$2 = {
  key: 2,
  class: "event-detail-row event-detail-place"
};
const _hoisted_9$2 = {
  key: 3,
  class: "event-detail-row event-detail-reminder"
};
const _hoisted_10$2 = {
  key: 4,
  class: "event-detail-row event-detail-note"
};
const _hoisted_11$2 = {
  key: 5,
  class: "event-detail-conflict"
};
const _hoisted_12$2 = { class: "event-detail-conflict-title" };
const _hoisted_13$2 = {
  key: 0,
  class: "event-detail-conflict-summary"
};
const _hoisted_14$2 = ["aria-expanded"];
const _hoisted_15$2 = {
  key: 0,
  class: "event-detail-error"
};
const _hoisted_16$2 = { class: "event-detail-actions" };
const _hoisted_17$2 = ["disabled"];
const _hoisted_18$2 = ["disabled"];
const _sfc_main$5 = {
  __name: "ScheduleEventDetail",
  props: {
    show: { type: Boolean, default: false },
    /** 当前选中的日程（camelCase 领域对象），null 表示无选中 */
    event: { type: Object, default: null },
    /** 该日程的冲突列表（父组件用共享 overlap 逻辑算好后传入） */
    conflicts: { type: Array, default: () => [] },
    deleting: { type: Boolean, default: false },
    error: { type: String, default: "" }
  },
  emits: ["close", "edit", "delete"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t: t2 } = useI18n();
    const titleText = computed(
      () => String(props.event?.title || "").trim() || t2("schedule.event.untitled")
    );
    const weekdayIndex = computed(() => {
      const date = String(props.event?.date || "");
      if (!isValidCalendarDate(date)) return null;
      const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return null;
      const day = parsed.getDay();
      return day === 0 ? 7 : day;
    });
    const dateText = computed(() => {
      const date = String(props.event?.date || "").trim();
      const index = weekdayIndex.value;
      if (index === null) return date;
      return tf("schedule.event.detailDate", {
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
        weekday: t2(`schedule.weekday.${index}`)
      });
    });
    const timeText = computed(() => {
      const start = String(props.event?.startTime || "").trim();
      const end = String(props.event?.endTime || "").trim();
      if (!start || !end) return "";
      return `${start} - ${end}`;
    });
    const locationText = computed(() => String(props.event?.location || "").trim());
    const noteText = computed(() => String(props.event?.note || "").trim());
    const reminderText = computed(() => {
      const value = props.event?.reminderMinutes;
      if (value === null || value === void 0) return "";
      const option = REMINDER_OPTIONS.find((item) => item.value === Number(value));
      return option ? t2(option.labelKey) : "";
    });
    const conflictList = computed(() => Array.isArray(props.conflicts) ? props.conflicts : []);
    const conflictCount = computed(() => conflictList.value.length);
    const showAllConflicts = ref(false);
    const visibleConflicts = computed(
      () => showAllConflicts.value ? conflictList.value : conflictList.value.slice(0, 2)
    );
    const canExpandConflicts = computed(() => conflictCount.value > 2);
    watch(
      () => props.event,
      () => {
        showAllConflicts.value = false;
      }
    );
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "fade" }, {
        default: withCtx(() => [
          __props.show ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: _cache[5] || (_cache[5] = ($event) => emit("close"))
          }, [
            createBaseVNode("div", {
              class: "modal-content glass event-detail-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": unref(t2)("schedule.event.detailTitle"),
              onClick: _cache[4] || (_cache[4] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_2$4, [
                createBaseVNode("h3", null, toDisplayString(titleText.value), 1),
                createBaseVNode("button", {
                  class: "close-btn",
                  type: "button",
                  "aria-label": unref(t2)("common.close"),
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                }, " × ", 8, _hoisted_3$4)
              ]),
              createBaseVNode("div", _hoisted_4$3, [
                createBaseVNode("div", _hoisted_5$3, toDisplayString(unref(t2)("schedule.arrangement.tabEvent")), 1),
                dateText.value ? (openBlock(), createElementBlock("div", _hoisted_6$3, toDisplayString(dateText.value), 1)) : createCommentVNode("", true),
                timeText.value ? (openBlock(), createElementBlock("div", _hoisted_7$3, toDisplayString(timeText.value), 1)) : createCommentVNode("", true),
                locationText.value ? (openBlock(), createElementBlock("div", _hoisted_8$2, toDisplayString(locationText.value), 1)) : createCommentVNode("", true),
                reminderText.value ? (openBlock(), createElementBlock("div", _hoisted_9$2, toDisplayString(reminderText.value), 1)) : createCommentVNode("", true),
                noteText.value ? (openBlock(), createElementBlock("div", _hoisted_10$2, toDisplayString(unref(tf)("schedule.event.detailNote", { note: noteText.value })), 1)) : createCommentVNode("", true),
                conflictCount.value > 0 ? (openBlock(), createElementBlock("div", _hoisted_11$2, [
                  createBaseVNode("div", _hoisted_12$2, "⚠ " + toDisplayString(unref(t2)("schedule.event.conflictTitle")), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(visibleConflicts.value, (item, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: `${item.label}-${index}`,
                      class: "event-detail-conflict-entry"
                    }, toDisplayString(unref(tf)("schedule.event.conflictItem", {
                      start: unref(formatMinuteToClock$1)(item.startMinute),
                      end: unref(formatMinuteToClock$1)(item.endMinute),
                      label: item.label
                    })), 1);
                  }), 128)),
                  conflictCount.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_13$2, toDisplayString(unref(tf)("schedule.event.conflictSummary", { n: conflictCount.value })), 1)) : createCommentVNode("", true),
                  canExpandConflicts.value ? (openBlock(), createElementBlock("button", {
                    key: 1,
                    type: "button",
                    class: "event-detail-conflict-toggle",
                    "aria-expanded": showAllConflicts.value,
                    onClick: _cache[1] || (_cache[1] = ($event) => showAllConflicts.value = !showAllConflicts.value)
                  }, toDisplayString(showAllConflicts.value ? unref(t2)("schedule.event.conflictCollapse") : unref(t2)("schedule.event.conflictExpand")), 9, _hoisted_14$2)) : createCommentVNode("", true)
                ])) : createCommentVNode("", true)
              ]),
              __props.error ? (openBlock(), createElementBlock("div", _hoisted_15$2, toDisplayString(__props.error), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_16$2, [
                createBaseVNode("button", {
                  class: "event-detail-action ghost",
                  type: "button",
                  disabled: __props.deleting,
                  onClick: _cache[2] || (_cache[2] = ($event) => emit("edit"))
                }, toDisplayString(unref(t2)("schedule.arrangement.titleEditEvent")), 9, _hoisted_17$2),
                createBaseVNode("button", {
                  class: "event-detail-action danger",
                  type: "button",
                  disabled: __props.deleting,
                  onClick: _cache[3] || (_cache[3] = ($event) => emit("delete"))
                }, toDisplayString(__props.deleting ? unref(t2)("schedule.event.deleting") : unref(t2)("schedule.event.deleteEvent")), 9, _hoisted_18$2)
              ])
            ], 8, _hoisted_1$4)
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleEventDetail = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-5f9cbdc5"]]);
const _hoisted_1$3 = { class: "sci-header" };
const _hoisted_2$3 = { class: "sci-title" };
const _hoisted_3$3 = ["aria-label"];
const _hoisted_4$2 = {
  key: 0,
  class: "sci-body"
};
const _hoisted_5$2 = { class: "sci-desc" };
const _hoisted_6$2 = { class: "sci-field" };
const _hoisted_7$2 = { class: "sci-field-label" };
const _hoisted_8$1 = ["value"];
const _hoisted_9$1 = { class: "sci-tools" };
const _hoisted_10$1 = {
  key: 0,
  class: "sci-example"
};
const _hoisted_11$1 = ["placeholder"];
const _hoisted_12$1 = {
  key: 1,
  class: "sci-error"
};
const _hoisted_13$1 = { class: "sci-footer" };
const _hoisted_14$1 = ["disabled"];
const _hoisted_15$1 = {
  key: 1,
  class: "sci-body"
};
const _hoisted_16$1 = { class: "sci-summary" };
const _hoisted_17$1 = { class: "sci-chip" };
const _hoisted_18$1 = { class: "sci-chip" };
const _hoisted_19$1 = { class: "sci-chip accent" };
const _hoisted_20$1 = {
  key: 0,
  class: "sci-chip warn"
};
const _hoisted_21$1 = {
  key: 1,
  class: "sci-chip warn"
};
const _hoisted_22$1 = {
  key: 2,
  class: "sci-chip warn"
};
const _hoisted_23$1 = {
  key: 3,
  class: "sci-chip danger"
};
const _hoisted_24$1 = {
  class: "sci-mode-switch",
  role: "tablist"
};
const _hoisted_25$1 = { class: "sci-list-tools" };
const _hoisted_26$1 = {
  key: 0,
  class: "sci-empty"
};
const _hoisted_27$1 = {
  key: 1,
  class: "sci-list"
};
const _hoisted_28$1 = { class: "sci-item-main" };
const _hoisted_29$1 = ["checked", "disabled", "onChange"];
const _hoisted_30$1 = { class: "sci-item-text" };
const _hoisted_31$1 = { class: "sci-item-name" };
const _hoisted_32$1 = {
  key: 0,
  class: "sci-badge warn"
};
const _hoisted_33$1 = {
  key: 1,
  class: "sci-badge warn"
};
const _hoisted_34$1 = { class: "sci-item-meta" };
const _hoisted_35$1 = {
  key: 0,
  class: "sci-item-meta"
};
const _hoisted_36$1 = { class: "sci-item-color" };
const _hoisted_37$1 = {
  key: 2,
  class: "sci-global-diag"
};
const _hoisted_38$1 = { class: "sci-week-nav" };
const _hoisted_39$1 = ["disabled", "aria-label"];
const _hoisted_40$1 = ["value"];
const _hoisted_41$1 = ["value"];
const _hoisted_42$1 = ["disabled", "aria-label"];
const _hoisted_43 = { class: "sci-week-note" };
const _hoisted_44 = { class: "sci-grid-scroll" };
const _hoisted_45 = { class: "sci-grid-inner" };
const _hoisted_46 = {
  key: 0,
  class: "sci-conflict-panel"
};
const _hoisted_47 = { class: "sci-conflict-head" };
const _hoisted_48 = { class: "sci-conflict-title" };
const _hoisted_49 = ["aria-label"];
const _hoisted_50 = { class: "sci-conflict-course" };
const _hoisted_51 = {
  key: 0,
  class: "sci-item-meta"
};
const _hoisted_52 = { key: 0 };
const _hoisted_53 = { class: "sci-footer" };
const _hoisted_54 = ["disabled"];
const _hoisted_55 = {
  key: 2,
  class: "sci-body"
};
const _hoisted_56 = { class: "sci-result" };
const _hoisted_57 = { class: "sci-result-row" };
const _hoisted_58 = { class: "sci-result-label" };
const _hoisted_59 = { class: "sci-result-value" };
const _hoisted_60 = { class: "sci-result-row" };
const _hoisted_61 = { class: "sci-result-label" };
const _hoisted_62 = { class: "sci-result-value" };
const _hoisted_63 = { class: "sci-result-row" };
const _hoisted_64 = { class: "sci-result-label" };
const _hoisted_65 = { class: "sci-result-value danger" };
const _hoisted_66 = { class: "sci-footer" };
const _sfc_main$4 = {
  __name: "ScheduleCourseImportDialog",
  props: {
    showImportDialog: { type: Boolean, default: false },
    /** input | preview | result */
    stage: { type: String, default: "input" },
    targetSemester: { type: String, default: "" },
    rawText: { type: String, default: "" },
    showExample: { type: Boolean, default: false },
    parsing: { type: Boolean, default: false },
    committing: { type: Boolean, default: false },
    parseError: { type: String, default: "" },
    globalDiagnostics: { type: Array, default: () => [] },
    previewCourses: { type: Array, default: () => [] },
    importResult: { type: Object, default: null },
    summary: { type: Object, default: () => ({}) },
    hasImportable: { type: Boolean, default: false },
    semesterOptions: { type: Array, default: () => [] },
    // #821 课表预览
    previewMode: { type: String, default: "list" },
    previewWeek: { type: Number, default: 1 },
    previewTotalWeeks: { type: Number, default: 1 },
    previewWeekDates: { type: Array, default: () => [] },
    previewGetCoursesForDay: { type: Function, default: () => () => [] },
    previewConflictsOf: { type: Function, default: () => null },
    scheduleCourseCardStyle: { type: String, default: "modern" }
  },
  emits: [
    "close",
    "update:targetSemester",
    "update:rawText",
    "toggle-example",
    "copy-prompt",
    "file-import",
    "parse",
    "back",
    "toggle-select",
    "select-all",
    "color-change",
    "ai-colors",
    "balanced-colors",
    "reset-colors",
    "commit",
    "set-preview-mode",
    "set-preview-week",
    "prev-preview-week",
    "next-preview-week"
  ],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t: t2 } = useI18n();
    const fileInputEl = ref(null);
    const exampleText = computed(() => buildAiCourseImportExample());
    const semesterModel = computed({
      get: () => props.targetSemester,
      set: (value) => emit("update:targetSemester", value)
    });
    const rawTextModel = computed({
      get: () => props.rawText,
      set: (value) => emit("update:rawText", value)
    });
    const weekdayLabels = computed(() => getWeekDayLabels());
    const weekdayText = (weekday) => weekdayLabels.value[Number(weekday) - 1] || `周${weekday}`;
    const weeksText = (weeks) => {
      const text = formatWeeksText(weeks);
      return text ? t2("schedule.import.weeksSuffix").replace("{t}", text) : "";
    };
    const periodText = (course) => `${course.period}-${course.period + course.djs - 1}`;
    const diagText = (diagnostic) => describeImportDiagnostic(diagnostic);
    const triggerFilePick = () => fileInputEl.value?.click();
    const onFileChange = (event) => emit("file-import", event);
    const previewCourseStyle = (course) => getCourseStyle(course, props.scheduleCourseCardStyle);
    const noHighlight = () => false;
    const previewWeekOptions = computed(
      () => Array.from({ length: Math.max(1, Number(props.previewTotalWeeks) || 1) }, (_, i) => i + 1)
    );
    const previewCurrentMonth = computed(
      () => Number(props.previewWeekDates[0]?.month || 0) || (/* @__PURE__ */ new Date()).getMonth() + 1
    );
    const activeConflictKey = ref("");
    const activeConflict = computed(() => {
      if (!activeConflictKey.value) return null;
      return props.previewConflictsOf(activeConflictKey.value) || null;
    });
    const onPreviewOpenDetail = (course) => {
      if (!course || !course._preview) return;
      const key = String(course._uid || "");
      if (!key) return;
      activeConflictKey.value = key;
    };
    const closeConflict = () => {
      activeConflictKey.value = "";
    };
    const conflictSourceText = (source) => t2(`schedule.import.preview.source.${source}`);
    const weekOptionText = (week) => t2("schedule.import.preview.weekOption").replace("{n}", String(week));
    const onPreviewWeekChange = (event) => {
      emit("set-preview-week", Number(event?.target?.value || 1));
    };
    watch(
      () => [props.previewMode, props.previewWeek],
      () => {
        activeConflictKey.value = "";
      }
    );
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "sci-fade" }, {
          default: withCtx(() => [
            __props.showImportDialog ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "sci-mask",
              onClick: _cache[18] || (_cache[18] = withModifiers(($event) => emit("close"), ["self"]))
            }, [
              createBaseVNode("div", {
                class: normalizeClass(["sci-panel", { "sci-panel--wide": __props.stage === "preview" && __props.previewMode === "grid" }]),
                role: "dialog",
                "aria-modal": "true"
              }, [
                createBaseVNode("header", _hoisted_1$3, [
                  createBaseVNode("div", _hoisted_2$3, toDisplayString(unref(t2)("schedule.import.title")), 1),
                  createBaseVNode("button", {
                    type: "button",
                    class: "sci-close",
                    "aria-label": unref(t2)("common.close"),
                    onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                  }, [..._cache[19] || (_cache[19] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
                  ])], 8, _hoisted_3$3)
                ]),
                __props.stage === "input" ? (openBlock(), createElementBlock("div", _hoisted_4$2, [
                  createBaseVNode("p", _hoisted_5$2, toDisplayString(unref(t2)("schedule.import.desc")), 1),
                  createBaseVNode("label", _hoisted_6$2, [
                    createBaseVNode("span", _hoisted_7$2, toDisplayString(unref(t2)("schedule.import.semester")), 1),
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => semesterModel.value = $event),
                      class: "sci-select"
                    }, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(__props.semesterOptions, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value || item,
                          value: item.value || item
                        }, toDisplayString(item.label || item), 9, _hoisted_8$1);
                      }), 128))
                    ], 512), [
                      [vModelSelect, semesterModel.value]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_9$1, [
                    createBaseVNode("button", {
                      type: "button",
                      class: "sci-btn ghost",
                      onClick: _cache[2] || (_cache[2] = ($event) => emit("copy-prompt"))
                    }, [
                      _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined" }, "content_copy", -1)),
                      createTextVNode(" " + toDisplayString(unref(t2)("schedule.import.copyPrompt")), 1)
                    ]),
                    createBaseVNode("button", {
                      type: "button",
                      class: "sci-btn ghost",
                      onClick: _cache[3] || (_cache[3] = ($event) => emit("toggle-example"))
                    }, [
                      _cache[21] || (_cache[21] = createBaseVNode("span", { class: "material-symbols-outlined" }, "help", -1)),
                      createTextVNode(" " + toDisplayString(__props.showExample ? unref(t2)("schedule.import.hideExample") : unref(t2)("schedule.import.showExample")), 1)
                    ])
                  ]),
                  __props.showExample ? (openBlock(), createElementBlock("pre", _hoisted_10$1, toDisplayString(exampleText.value), 1)) : createCommentVNode("", true),
                  withDirectives(createBaseVNode("textarea", {
                    "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => rawTextModel.value = $event),
                    class: "sci-textarea",
                    placeholder: unref(t2)("schedule.import.placeholder"),
                    spellcheck: "false"
                  }, null, 8, _hoisted_11$1), [
                    [vModelText, rawTextModel.value]
                  ]),
                  __props.parseError ? (openBlock(), createElementBlock("div", _hoisted_12$1, toDisplayString(__props.parseError), 1)) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_13$1, [
                    createBaseVNode("button", {
                      type: "button",
                      class: "sci-btn ghost",
                      onClick: triggerFilePick
                    }, [
                      _cache[22] || (_cache[22] = createBaseVNode("span", { class: "material-symbols-outlined" }, "file_upload", -1)),
                      createTextVNode(" " + toDisplayString(unref(t2)("schedule.import.fromFile")), 1)
                    ]),
                    createBaseVNode("button", {
                      type: "button",
                      class: "sci-btn primary",
                      disabled: __props.parsing || !__props.rawText.trim(),
                      onClick: _cache[5] || (_cache[5] = ($event) => emit("parse"))
                    }, toDisplayString(__props.parsing ? unref(t2)("schedule.import.parsing") : unref(t2)("schedule.import.parse")), 9, _hoisted_14$1)
                  ]),
                  createBaseVNode("input", {
                    ref_key: "fileInputEl",
                    ref: fileInputEl,
                    type: "file",
                    accept: ".json,.txt,application/json,text/plain",
                    class: "sci-file-input",
                    onChange: onFileChange
                  }, null, 544)
                ])) : __props.stage === "preview" ? (openBlock(), createElementBlock("div", _hoisted_15$1, [
                  createBaseVNode("div", _hoisted_16$1, [
                    createBaseVNode("span", _hoisted_17$1, toDisplayString(unref(t2)("schedule.import.summary.raw")) + " " + toDisplayString(__props.summary.raw), 1),
                    createBaseVNode("span", _hoisted_18$1, toDisplayString(unref(t2)("schedule.import.summary.merged")) + " " + toDisplayString(__props.summary.merged), 1),
                    createBaseVNode("span", _hoisted_19$1, toDisplayString(unref(t2)("schedule.import.summary.importable")) + " " + toDisplayString(__props.summary.importable), 1),
                    __props.summary.duplicate ? (openBlock(), createElementBlock("span", _hoisted_20$1, toDisplayString(unref(t2)("schedule.import.summary.duplicate")) + " " + toDisplayString(__props.summary.duplicate), 1)) : createCommentVNode("", true),
                    __props.summary.conflict ? (openBlock(), createElementBlock("span", _hoisted_21$1, toDisplayString(unref(t2)("schedule.import.summary.conflict")) + " " + toDisplayString(__props.summary.conflict), 1)) : createCommentVNode("", true),
                    __props.summary.warning ? (openBlock(), createElementBlock("span", _hoisted_22$1, toDisplayString(unref(t2)("schedule.import.summary.warning")) + " " + toDisplayString(__props.summary.warning), 1)) : createCommentVNode("", true),
                    __props.summary.error ? (openBlock(), createElementBlock("span", _hoisted_23$1, toDisplayString(unref(t2)("schedule.import.summary.error")) + " " + toDisplayString(__props.summary.error), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_24$1, [
                    createBaseVNode("button", {
                      type: "button",
                      class: normalizeClass(["sci-mode-btn", { active: __props.previewMode === "list" }]),
                      onClick: _cache[6] || (_cache[6] = ($event) => emit("set-preview-mode", "list"))
                    }, toDisplayString(unref(t2)("schedule.import.preview.modeList")), 3),
                    createBaseVNode("button", {
                      type: "button",
                      class: normalizeClass(["sci-mode-btn", { active: __props.previewMode === "grid" }]),
                      onClick: _cache[7] || (_cache[7] = ($event) => emit("set-preview-mode", "grid"))
                    }, toDisplayString(unref(t2)("schedule.import.preview.modeGrid")), 3)
                  ]),
                  __props.previewMode === "list" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createBaseVNode("div", _hoisted_25$1, [
                      createBaseVNode("button", {
                        type: "button",
                        class: "sci-link",
                        onClick: _cache[8] || (_cache[8] = ($event) => emit("select-all", true))
                      }, toDisplayString(unref(t2)("schedule.import.selectAll")), 1),
                      createBaseVNode("button", {
                        type: "button",
                        class: "sci-link",
                        onClick: _cache[9] || (_cache[9] = ($event) => emit("select-all", false))
                      }, toDisplayString(unref(t2)("schedule.import.selectNone")), 1),
                      _cache[23] || (_cache[23] = createBaseVNode("span", { class: "sci-list-tools-spacer" }, null, -1)),
                      createBaseVNode("button", {
                        type: "button",
                        class: "sci-link",
                        onClick: _cache[10] || (_cache[10] = ($event) => emit("ai-colors"))
                      }, toDisplayString(unref(t2)("schedule.import.color.ai")), 1),
                      createBaseVNode("button", {
                        type: "button",
                        class: "sci-link",
                        onClick: _cache[11] || (_cache[11] = ($event) => emit("balanced-colors"))
                      }, toDisplayString(unref(t2)("schedule.import.color.balanced")), 1),
                      createBaseVNode("button", {
                        type: "button",
                        class: "sci-link",
                        onClick: _cache[12] || (_cache[12] = ($event) => emit("reset-colors"))
                      }, toDisplayString(unref(t2)("schedule.import.color.reset")), 1)
                    ]),
                    !__props.previewCourses.length ? (openBlock(), createElementBlock("div", _hoisted_26$1, toDisplayString(unref(t2)("schedule.import.empty")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_27$1, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(__props.previewCourses, (item) => {
                        return openBlock(), createElementBlock("li", {
                          key: item.key,
                          class: "sci-item"
                        }, [
                          createBaseVNode("label", _hoisted_28$1, [
                            createBaseVNode("input", {
                              type: "checkbox",
                              class: "sci-check",
                              checked: item.selected,
                              disabled: item.duplicateKind === "exact",
                              onChange: ($event) => emit("toggle-select", item.key)
                            }, null, 40, _hoisted_29$1),
                            createBaseVNode("span", _hoisted_30$1, [
                              createBaseVNode("span", _hoisted_31$1, [
                                createTextVNode(toDisplayString(item.course.name) + " ", 1),
                                item.duplicateKind === "exact" ? (openBlock(), createElementBlock("span", _hoisted_32$1, toDisplayString(unref(t2)("schedule.import.badge.duplicate")), 1)) : item.duplicateKind === "possible" ? (openBlock(), createElementBlock("span", _hoisted_33$1, toDisplayString(unref(t2)("schedule.import.badge.possibleDuplicate")), 1)) : createCommentVNode("", true)
                              ]),
                              createBaseVNode("span", _hoisted_34$1, [
                                createTextVNode(toDisplayString(weekdayText(item.course.weekday)) + " " + toDisplayString(periodText(item.course)) + toDisplayString(unref(t2)("schedule.import.periodSuffix")) + " ", 1),
                                weeksText(item.course.weeks) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                                  createTextVNode(" · " + toDisplayString(weeksText(item.course.weeks)), 1)
                                ], 64)) : createCommentVNode("", true)
                              ]),
                              item.course.room || item.course.teacher ? (openBlock(), createElementBlock("span", _hoisted_35$1, toDisplayString(item.course.room || "—") + " · " + toDisplayString(item.course.teacher || "—"), 1)) : createCommentVNode("", true),
                              (openBlock(true), createElementBlock(Fragment, null, renderList(item.conflicts, (conflict, ci) => {
                                return openBlock(), createElementBlock("span", {
                                  key: `c-${ci}`,
                                  class: "sci-item-warn"
                                }, [
                                  createTextVNode(toDisplayString(unref(t2)("schedule.import.badge.conflictWith").replace("{name}", conflict.withCourseName)) + " ", 1),
                                  conflict.overlapWeeks.length ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                                    createTextVNode(" （" + toDisplayString(unref(t2)("schedule.import.overlapWeeks").replace("{t}", unref(formatWeeksText)(conflict.overlapWeeks))) + "） ", 1)
                                  ], 64)) : createCommentVNode("", true)
                                ]);
                              }), 128))
                            ])
                          ]),
                          createBaseVNode("div", _hoisted_36$1, [
                            createVNode(CourseColorPicker, {
                              "model-value": item.colorOverride || "",
                              "onUpdate:modelValue": ($event) => emit("color-change", item, $event)
                            }, null, 8, ["model-value", "onUpdate:modelValue"])
                          ])
                        ]);
                      }), 128))
                    ])),
                    __props.globalDiagnostics.length ? (openBlock(), createElementBlock("div", _hoisted_37$1, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(__props.globalDiagnostics, (diag, di) => {
                        return openBlock(), createElementBlock("div", {
                          key: `g-${di}`,
                          class: "sci-item-warn"
                        }, toDisplayString(diagText(diag)), 1);
                      }), 128))
                    ])) : createCommentVNode("", true)
                  ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                    createBaseVNode("div", _hoisted_38$1, [
                      createBaseVNode("button", {
                        type: "button",
                        class: "sci-btn ghost sci-week-btn",
                        disabled: __props.previewWeek <= 1,
                        "aria-label": unref(t2)("schedule.import.preview.prevWeek"),
                        onClick: _cache[13] || (_cache[13] = ($event) => emit("prev-preview-week"))
                      }, [..._cache[24] || (_cache[24] = [
                        createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_left", -1)
                      ])], 8, _hoisted_39$1),
                      createBaseVNode("select", {
                        class: "sci-select sci-week-select",
                        value: __props.previewWeek,
                        onChange: onPreviewWeekChange
                      }, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(previewWeekOptions.value, (w) => {
                          return openBlock(), createElementBlock("option", {
                            key: w,
                            value: w
                          }, toDisplayString(weekOptionText(w)), 9, _hoisted_41$1);
                        }), 128))
                      ], 40, _hoisted_40$1),
                      createBaseVNode("button", {
                        type: "button",
                        class: "sci-btn ghost sci-week-btn",
                        disabled: __props.previewWeek >= __props.previewTotalWeeks,
                        "aria-label": unref(t2)("schedule.import.preview.nextWeek"),
                        onClick: _cache[14] || (_cache[14] = ($event) => emit("next-preview-week"))
                      }, [..._cache[25] || (_cache[25] = [
                        createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1)
                      ])], 8, _hoisted_42$1),
                      createBaseVNode("span", _hoisted_43, toDisplayString(unref(t2)("schedule.import.preview.weekNote")), 1)
                    ]),
                    createBaseVNode("div", _hoisted_44, [
                      createBaseVNode("div", _hoisted_45, [
                        createVNode(ScheduleGrid, {
                          "week-dates": __props.previewWeekDates,
                          "current-month": previewCurrentMonth.value,
                          "selected-week": __props.previewWeek,
                          "week-transition-name": "week-slide-left",
                          "schedule-course-card-style": __props.scheduleCourseCardStyle,
                          "course-card-refresh-nonce": 0,
                          "get-courses-for-day": __props.previewGetCoursesForDay,
                          "get-course-style": previewCourseStyle,
                          "is-widget-highlighted": noHighlight,
                          "enable-blank-create": false,
                          onOpenDetail: onPreviewOpenDetail
                        }, null, 8, ["week-dates", "current-month", "selected-week", "schedule-course-card-style", "get-courses-for-day"])
                      ])
                    ]),
                    activeConflict.value ? (openBlock(), createElementBlock("div", _hoisted_46, [
                      createBaseVNode("div", _hoisted_47, [
                        createBaseVNode("span", _hoisted_48, toDisplayString(unref(t2)("schedule.import.preview.conflictTitle")), 1),
                        createBaseVNode("button", {
                          type: "button",
                          class: "sci-close",
                          "aria-label": unref(t2)("common.close"),
                          onClick: closeConflict
                        }, [..._cache[26] || (_cache[26] = [
                          createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
                        ])], 8, _hoisted_49)
                      ]),
                      createBaseVNode("div", _hoisted_50, toDisplayString(activeConflict.value.course.name), 1),
                      !activeConflict.value.conflicts.length ? (openBlock(), createElementBlock("div", _hoisted_51, toDisplayString(unref(t2)("schedule.import.preview.noConflict")), 1)) : createCommentVNode("", true),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(activeConflict.value.conflicts, (conflict, ci) => {
                        return openBlock(), createElementBlock("div", {
                          key: `pc-${ci}`,
                          class: "sci-item-warn"
                        }, [
                          createBaseVNode("div", null, toDisplayString(unref(t2)("schedule.import.badge.conflictWith").replace("{name}", conflict.withCourseName)), 1),
                          createBaseVNode("div", null, toDisplayString(unref(t2)("schedule.import.preview.conflictPeriod").replace("{a}", String(conflict.overlapPeriodStart)).replace("{b}", String(conflict.overlapPeriodEnd))), 1),
                          conflict.overlapWeeks.length ? (openBlock(), createElementBlock("div", _hoisted_52, toDisplayString(unref(t2)("schedule.import.overlapWeeks").replace("{t}", unref(formatWeeksText)(conflict.overlapWeeks))), 1)) : createCommentVNode("", true),
                          createBaseVNode("div", null, toDisplayString(unref(t2)("schedule.import.preview.conflictSource").replace("{s}", conflictSourceText(conflict.source))), 1)
                        ]);
                      }), 128))
                    ])) : createCommentVNode("", true)
                  ], 64)),
                  createBaseVNode("div", _hoisted_53, [
                    createBaseVNode("button", {
                      type: "button",
                      class: "sci-btn ghost",
                      onClick: _cache[15] || (_cache[15] = ($event) => emit("back"))
                    }, toDisplayString(unref(t2)("schedule.import.back")), 1),
                    createBaseVNode("button", {
                      type: "button",
                      class: "sci-btn primary",
                      disabled: __props.committing || !__props.hasImportable,
                      onClick: _cache[16] || (_cache[16] = ($event) => emit("commit"))
                    }, toDisplayString(__props.committing ? unref(t2)("schedule.import.committing") : unref(t2)("schedule.import.confirm").replace("{n}", String(__props.summary.importable))), 9, _hoisted_54)
                  ])
                ])) : (openBlock(), createElementBlock("div", _hoisted_55, [
                  createBaseVNode("div", _hoisted_56, [
                    createBaseVNode("div", _hoisted_57, [
                      createBaseVNode("span", _hoisted_58, toDisplayString(unref(t2)("schedule.import.result.added")), 1),
                      createBaseVNode("span", _hoisted_59, toDisplayString(__props.importResult?.added ?? 0), 1)
                    ]),
                    createBaseVNode("div", _hoisted_60, [
                      createBaseVNode("span", _hoisted_61, toDisplayString(unref(t2)("schedule.import.result.skipped")), 1),
                      createBaseVNode("span", _hoisted_62, toDisplayString(__props.importResult?.skipped ?? 0), 1)
                    ]),
                    createBaseVNode("div", _hoisted_63, [
                      createBaseVNode("span", _hoisted_64, toDisplayString(unref(t2)("schedule.import.result.failed")), 1),
                      createBaseVNode("span", _hoisted_65, toDisplayString(__props.importResult?.failed ?? 0), 1)
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_66, [
                    createBaseVNode("button", {
                      type: "button",
                      class: "sci-btn primary",
                      onClick: _cache[17] || (_cache[17] = ($event) => emit("close"))
                    }, toDisplayString(unref(t2)("schedule.import.done")), 1)
                  ])
                ]))
              ], 2)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ]);
    };
  }
};
const ScheduleCourseImportDialog = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-9d16886f"]]);
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
const _hoisted_6$1 = {
  key: 3,
  class: "manage-course-groups"
};
const _hoisted_7$1 = ["onClick"];
const _hoisted_8 = { class: "manage-course-group-title" };
const _hoisted_9 = { class: "manage-course-group-arrow" };
const _hoisted_10 = {
  key: 0,
  class: "manage-course-list"
};
const _hoisted_11 = {
  key: 0,
  class: "manage-course-category"
};
const _hoisted_12 = { class: "manage-course-category-title" };
const _hoisted_13 = { class: "manage-course-card-main" };
const _hoisted_14 = { class: "manage-course-card-name-row" };
const _hoisted_15 = { class: "manage-course-card-name" };
const _hoisted_16 = { class: "manage-course-tag official" };
const _hoisted_17 = { class: "manage-course-card-meta" };
const _hoisted_18 = { class: "manage-course-card-meta" };
const _hoisted_19 = {
  key: 0,
  class: "manage-course-card-meta"
};
const _hoisted_20 = {
  key: 1,
  class: "manage-course-category removed"
};
const _hoisted_21 = { class: "manage-course-category-title" };
const _hoisted_22 = { class: "manage-course-category-hint" };
const _hoisted_23 = { class: "manage-course-card-main" };
const _hoisted_24 = { class: "manage-course-card-name-row" };
const _hoisted_25 = { class: "manage-course-card-name" };
const _hoisted_26 = { class: "manage-course-tag removed" };
const _hoisted_27 = { class: "manage-course-card-meta" };
const _hoisted_28 = {
  key: 0,
  class: "manage-course-card-meta"
};
const _hoisted_29 = { class: "manage-course-card-actions" };
const _hoisted_30 = ["onClick"];
const _hoisted_31 = {
  key: 2,
  class: "manage-course-category"
};
const _hoisted_32 = { class: "manage-course-category-title" };
const _hoisted_33 = { class: "manage-course-card-main" };
const _hoisted_34 = { class: "manage-course-card-name-row" };
const _hoisted_35 = { class: "manage-course-card-name" };
const _hoisted_36 = { class: "manage-course-tag custom" };
const _hoisted_37 = { class: "manage-course-card-meta" };
const _hoisted_38 = { class: "manage-course-card-meta" };
const _hoisted_39 = {
  key: 0,
  class: "manage-course-card-meta"
};
const _hoisted_40 = { class: "manage-course-card-actions" };
const _hoisted_41 = ["onClick"];
const _hoisted_42 = ["onClick"];
const _sfc_main$3 = {
  __name: "ScheduleManageCoursesDialog",
  props: {
    showManageCourses: { type: Boolean, default: false },
    loadingManageCourses: { type: Boolean, default: false },
    manageCoursesError: { type: String, default: "" },
    managedCourseGroups: { type: Array, default: () => [] },
    manageExpandedSemesters: { type: Object, default: () => ({}) }
  },
  emits: ["close", "toggle-semester", "edit-course", "delete-course", "restore-official-course"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t: t2 } = useI18n();
    const weekDayLabels = computed(() => getWeekDayLabels());
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
                createBaseVNode("h3", null, toDisplayString(unref(t2)("schedule.manageCourses.title")), 1),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_2$2, [
                __props.loadingManageCourses ? (openBlock(), createElementBlock("div", _hoisted_3$2, toDisplayString(unref(t2)("schedule.manageCourses.loading")), 1)) : __props.manageCoursesError ? (openBlock(), createElementBlock("div", _hoisted_4$1, toDisplayString(__props.manageCoursesError), 1)) : !__props.managedCourseGroups.length ? (openBlock(), createElementBlock("div", _hoisted_5$1, toDisplayString(unref(t2)("schedule.manageCourses.empty")), 1)) : (openBlock(), createElementBlock("div", _hoisted_6$1, [
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
                          createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.manageCourses.courseCount").replace("{n}", String(group.totalCount ?? group.courses.length))), 1)
                        ]),
                        createBaseVNode("span", _hoisted_9, toDisplayString(__props.manageExpandedSemesters[group.semester] ? unref(t2)("schedule.manageCourses.collapse") : unref(t2)("schedule.manageCourses.expand")), 1)
                      ], 8, _hoisted_7$1),
                      __props.manageExpandedSemesters[group.semester] ? (openBlock(), createElementBlock("div", _hoisted_10, [
                        group.officialCourses?.length ? (openBlock(), createElementBlock("section", _hoisted_11, [
                          createBaseVNode("div", _hoisted_12, [
                            createBaseVNode("strong", null, toDisplayString(unref(t2)("schedule.manageCourses.officialSection")), 1),
                            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.manageCourses.courseCount").replace("{n}", String(group.officialCourses.length))), 1)
                          ]),
                          (openBlock(true), createElementBlock(Fragment, null, renderList(group.officialCourses, (course) => {
                            return openBlock(), createElementBlock("article", {
                              key: `${group.semester}-official-${course.course_identity_key || course.id}`,
                              class: "manage-course-card"
                            }, [
                              createBaseVNode("div", _hoisted_13, [
                                createBaseVNode("div", _hoisted_14, [
                                  createBaseVNode("div", _hoisted_15, toDisplayString(course.name), 1),
                                  createBaseVNode("span", _hoisted_16, toDisplayString(unref(t2)("schedule.manageCourses.officialTag")), 1)
                                ]),
                                createBaseVNode("div", _hoisted_17, toDisplayString(unref(t2)("schedule.manageCourses.timeMeta").replace("{day}", weekDayLabels.value[(course.weekday || 1) - 1]).replace("{s}", String(course.period)).replace("{e}", String(unref(getCourseEndPeriod)(course)))), 1),
                                createBaseVNode("div", _hoisted_18, toDisplayString(unref(t2)("schedule.manageCourses.weeksMeta").replace("{t}", course.weeks_text || "-")), 1),
                                course.teacher || course.room ? (openBlock(), createElementBlock("div", _hoisted_19, toDisplayString([course.teacher, course.room].filter(Boolean).join(" · ")), 1)) : createCommentVNode("", true)
                              ])
                            ]);
                          }), 128))
                        ])) : createCommentVNode("", true),
                        group.removedCourses?.length ? (openBlock(), createElementBlock("section", _hoisted_20, [
                          createBaseVNode("div", _hoisted_21, [
                            createBaseVNode("strong", null, toDisplayString(unref(t2)("schedule.manageCourses.removedSection")), 1),
                            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.manageCourses.courseCount").replace("{n}", String(group.removedCourses.length))), 1)
                          ]),
                          createBaseVNode("p", _hoisted_22, toDisplayString(unref(t2)("schedule.manageCourses.removedHint")), 1),
                          (openBlock(true), createElementBlock(Fragment, null, renderList(group.removedCourses, (course) => {
                            return openBlock(), createElementBlock("article", {
                              key: `${group.semester}-removed-${course.course_identity_key || course.id}`,
                              class: "manage-course-card removed"
                            }, [
                              createBaseVNode("div", _hoisted_23, [
                                createBaseVNode("div", _hoisted_24, [
                                  createBaseVNode("div", _hoisted_25, toDisplayString(course.name), 1),
                                  createBaseVNode("span", _hoisted_26, toDisplayString(unref(t2)("schedule.manageCourses.removedTag")), 1)
                                ]),
                                createBaseVNode("div", _hoisted_27, toDisplayString(unref(t2)("schedule.manageCourses.timeMeta").replace("{day}", weekDayLabels.value[(course.weekday || 1) - 1]).replace("{s}", String(course.period)).replace("{e}", String(unref(getCourseEndPeriod)(course)))), 1),
                                course.teacher || course.room ? (openBlock(), createElementBlock("div", _hoisted_28, toDisplayString([course.teacher, course.room].filter(Boolean).join(" · ")), 1)) : createCommentVNode("", true)
                              ]),
                              createBaseVNode("div", _hoisted_29, [
                                createBaseVNode("button", {
                                  class: "manage-course-btn restore",
                                  onClick: ($event) => emit("restore-official-course", course)
                                }, toDisplayString(unref(t2)("schedule.manageCourses.restore")), 9, _hoisted_30)
                              ])
                            ]);
                          }), 128))
                        ])) : createCommentVNode("", true),
                        group.customCourses?.length || group.courses?.length ? (openBlock(), createElementBlock("section", _hoisted_31, [
                          createBaseVNode("div", _hoisted_32, [
                            createBaseVNode("strong", null, toDisplayString(unref(t2)("schedule.manageCourses.customSection")), 1),
                            createBaseVNode("span", null, toDisplayString(unref(t2)("schedule.manageCourses.courseCount").replace("{n}", String((group.customCourses || group.courses || []).length))), 1)
                          ]),
                          (openBlock(true), createElementBlock(Fragment, null, renderList(group.customCourses || group.courses || [], (course) => {
                            return openBlock(), createElementBlock("article", {
                              key: `${group.semester}-custom-${course.source_id || course.id}`,
                              class: "manage-course-card"
                            }, [
                              createBaseVNode("div", _hoisted_33, [
                                createBaseVNode("div", _hoisted_34, [
                                  createBaseVNode("div", _hoisted_35, toDisplayString(course.name), 1),
                                  createBaseVNode("span", _hoisted_36, toDisplayString(unref(t2)("schedule.manageCourses.customTag")), 1)
                                ]),
                                createBaseVNode("div", _hoisted_37, toDisplayString(unref(t2)("schedule.manageCourses.timeMeta").replace("{day}", weekDayLabels.value[(course.weekday || 1) - 1]).replace("{s}", String(course.period)).replace("{e}", String(unref(getCourseEndPeriod)(course)))), 1),
                                createBaseVNode("div", _hoisted_38, toDisplayString(unref(t2)("schedule.manageCourses.weeksMeta").replace("{t}", course.weeks_text)), 1),
                                course.teacher || course.room ? (openBlock(), createElementBlock("div", _hoisted_39, toDisplayString([course.teacher, course.room].filter(Boolean).join(" · ")), 1)) : createCommentVNode("", true)
                              ]),
                              createBaseVNode("div", _hoisted_40, [
                                createBaseVNode("button", {
                                  class: "manage-course-btn edit",
                                  onClick: ($event) => emit("edit-course", course)
                                }, toDisplayString(unref(t2)("schedule.manageCourses.edit")), 9, _hoisted_41),
                                createBaseVNode("button", {
                                  class: "manage-course-btn delete",
                                  onClick: ($event) => emit("delete-course", course)
                                }, toDisplayString(unref(t2)("schedule.manageCourses.delete")), 9, _hoisted_42)
                              ])
                            ]);
                          }), 128))
                        ])) : createCommentVNode("", true)
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
const ScheduleManageCoursesDialog = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-48d69e23"]]);
const _hoisted_1$1 = ["data-locale"];
const _hoisted_2$1 = { class: "week-picker-sheet" };
const _hoisted_3$1 = { class: "week-picker-header" };
const _hoisted_4 = { class: "week-picker-title" };
const _hoisted_5 = { class: "week-picker-ops" };
const _hoisted_6 = { class: "week-picker-grid" };
const _hoisted_7 = ["onClick"];
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
    const { locale, t: t2 } = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "sheet-up" }, {
          default: withCtx(() => [
            __props.showWeekPicker ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "week-picker-mask",
              "data-locale": unref(locale),
              onClick: _cache[3] || (_cache[3] = withModifiers(($event) => emit("close"), ["self"]))
            }, [
              createBaseVNode("div", _hoisted_2$1, [
                createBaseVNode("div", _hoisted_3$1, [
                  createBaseVNode("div", _hoisted_4, toDisplayString(unref(t2)("schedule.weekPicker.title")), 1),
                  createBaseVNode("div", _hoisted_5, [
                    createBaseVNode("button", {
                      onClick: _cache[0] || (_cache[0] = ($event) => emit("select-all"))
                    }, toDisplayString(unref(t2)("schedule.weekPicker.selectAll")), 1),
                    createBaseVNode("button", {
                      onClick: _cache[1] || (_cache[1] = ($event) => emit("clear-all"))
                    }, toDisplayString(unref(t2)("schedule.weekPicker.clearAll")), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_6, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(__props.semesterWeekOptions, (week) => {
                    return openBlock(), createElementBlock("button", {
                      key: week,
                      class: normalizeClass(["week-cell", { active: __props.selectedWeeks.includes(week) }]),
                      onClick: ($event) => emit("toggle-week", week)
                    }, toDisplayString(unref(tf)("schedule.weekPicker.cell", { n: week })), 11, _hoisted_7);
                  }), 128))
                ]),
                createBaseVNode("button", {
                  class: "week-picker-confirm",
                  onClick: _cache[2] || (_cache[2] = ($event) => emit("close"))
                }, toDisplayString(unref(t2)("schedule.weekPicker.done")), 1)
              ])
            ], 8, _hoisted_1$1)) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ]);
    };
  }
};
const ScheduleWeekPicker = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-84b99303"]]);
const _hoisted_1 = { class: "confirm-title" };
const _hoisted_2 = { class: "confirm-lines" };
const _hoisted_3 = { class: "confirm-actions" };
const _sfc_main$1 = {
  __name: "ScheduleConfirmDialog",
  props: {
    showConfirmDialog: { type: Boolean, default: false },
    confirmDialogTitle: { type: String, default: "" },
    confirmDialogLines: { type: Array, default: () => [] },
    confirmDialogConfirmText: { type: String, default: "" },
    confirmDialogCancelText: { type: String, default: "" },
    confirmDialogDanger: { type: Boolean, default: false }
  },
  emits: ["confirm"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t: t2 } = useI18n();
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
                }, toDisplayString(__props.confirmDialogCancelText || unref(t2)("schedule.confirm.cancel")), 1),
                createBaseVNode("button", {
                  class: normalizeClass(["confirm-btn", { danger: __props.confirmDialogDanger }]),
                  onClick: _cache[1] || (_cache[1] = ($event) => emit("confirm", true))
                }, toDisplayString(__props.confirmDialogConfirmText || unref(t2)("schedule.confirm.confirm")), 3)
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const ScheduleConfirmDialog = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-ef608c46"]]);
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
    const menu = useScheduleMenu();
    const semesterApi = useScheduleSemester({
      // 惰性求值：运行时各弹层状态均已就绪
      isAnyOverlayOpen: () => anyOverlayOpen.value
    });
    const data = useScheduleData(props, emit, { semester: semesterApi });
    const grid = useScheduleGrid({ data, semester: semesterApi, menu });
    const detail = useScheduleDetail({ data, semester: semesterApi });
    const editor = useScheduleEditor({ props, data, semester: semesterApi, detail, menu, confirmDialog });
    const eventData = useScheduleEventData({ props, semester: semesterApi });
    const events = useScheduleEvents({
      props,
      semester: semesterApi,
      data,
      confirmDialog,
      onChanged: () => eventData.refreshWeekEvents()
    });
    const allWeekCourses = computed(() => {
      const list = [];
      for (let day = 1; day <= 7; day += 1) {
        const dayCourses = grid.getCoursesForDay(day);
        if (!Array.isArray(dayCourses)) continue;
        for (const course of dayCourses) {
          list.push({ ...course, weekday: Number(course?.weekday) || day });
        }
      }
      return list;
    });
    const eventDetail = useScheduleEventDetail({
      props,
      eventData,
      events,
      getWeekCourses: () => allWeekCourses.value,
      onEdit: () => {
        arrangementMode.value = "editEvent";
        arrangementInitialTab.value = "event";
        showArrangement.value = true;
      }
    });
    const io = useScheduleIO({ props, data, semester: semesterApi, editor, confirmDialog });
    const importApi = useScheduleImport({ props, data, semester: semesterApi, editor });
    const sync = useScheduleSync({
      props,
      data,
      semester: semesterApi,
      editor,
      confirmDialog,
      onPersonalEventsChanged: () => eventData.refreshWeekEvents()
    });
    const termStart = useScheduleTermStart({ props, data, semester: semesterApi });
    const showArrangement = ref(false);
    const arrangementMode = ref("add");
    const arrangementInitialTab = ref("course");
    const gridSelectionResetNonce = ref(0);
    const anyOverlayOpen = computed(() => {
      return menu.showMenu.value || detail.showDetail.value || eventDetail.showEventDetail.value || showArrangement.value || editor.showAddCourse.value || editor.showManageCourses.value || editor.showWeekPicker.value || importApi.showImportDialog.value || confirmDialog.showConfirmDialog.value;
    });
    watch(anyOverlayOpen, (open) => {
      if (open) gridSelectionResetNonce.value += 1;
    });
    watch(
      () => editor.showAddCourse.value,
      (open) => {
        if (!open) showArrangement.value = false;
      }
    );
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
      scheduleViewMode,
      courseCardRefreshNonce,
      styleOptions,
      viewModeOptions,
      toggleMenu,
      setScheduleCourseCardStyle,
      setScheduleViewMode
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
      courseDialogSemester,
      addCourseForm,
      addCourseError,
      addingCourse,
      courseSpanOptions,
      addWeeksCountText,
      showManageCourses,
      showWeekPicker
    } = editor;
    const { eventDraft, eventError, savingEvent, deletingEvent } = events;
    const { showEventDetail, selectedEvent, detailConflicts, detailError } = eventDetail;
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
    const { locale, t: t2 } = useI18n();
    const offlineBannerText = computed(() => {
      void locale.value;
      if (offlineHint.value) return offlineHint.value;
      if (syncTime.value) {
        return t2("schedule.view.offlineUpdatedAt").replace("{t}", formatRelativeTime(syncTime.value));
      }
      return t2("schedule.view.offline");
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
    const openAddArrangement = (payload = {}) => {
      showMenu.value = false;
      if (payload?.source === "grid") {
        const coursePrefill = {
          weekday: Number(payload?.weekday),
          period: Number(payload?.period),
          djs: Number(payload?.djs)
        };
        editor.openAddCourseDialog(coursePrefill);
        if (!editor.showAddCourse.value) return;
        events.resetEventDraft({
          date: payload?.date,
          startTime: payload?.startTime,
          endTime: payload?.endTime
        });
        events.editingEventId.value = "";
        arrangementMode.value = "add";
        arrangementInitialTab.value = payload?.type === "event" ? "event" : "course";
        showArrangement.value = true;
        return;
      }
      if (payload?.type === "event") {
        events.resetEventDraft({
          date: payload?.date,
          startTime: payload?.startTime,
          endTime: payload?.endTime
        });
        events.editingEventId.value = "";
        arrangementMode.value = "add";
        arrangementInitialTab.value = "event";
        showArrangement.value = true;
        return;
      }
      arrangementInitialTab.value = "course";
      arrangementMode.value = "add";
      editor.openAddCourseDialog();
      showArrangement.value = editor.showAddCourse.value;
    };
    const closeArrangement = () => {
      showArrangement.value = false;
      events.editingEventId.value = "";
      if (editor.showAddCourse.value) editor.closeAddCourseDialog();
    };
    const handleEditManagedCourse = async (course) => {
      editor.openEditCourseDialog(course, { reopenManage: true });
      await nextTick();
      arrangementMode.value = "editCourse";
      showArrangement.value = editor.showAddCourse.value;
    };
    const handleConfirmBlankSelection = (selection) => {
      if (!selection) return;
      const defaultType = scheduleViewMode.value === "events" ? "event" : "course";
      openAddArrangement({
        source: "grid",
        type: defaultType,
        date: selection.date,
        startTime: selection.startTime,
        endTime: selection.endTime,
        weekday: selection.dayIndex,
        period: selection.startPeriod,
        djs: selection.span
      });
    };
    const handleOpenEventDetail = (raw) => {
      eventDetail.openEventDetail(raw);
    };
    const handleSubmitEvent = async () => {
      const ok = await events.submitEvent();
      if (ok) {
        closeArrangement();
      }
    };
    const handleDeleteEvent = async () => {
      const ok = await events.deleteEvent(events.editingEventId.value);
      if (ok) {
        closeArrangement();
      }
    };
    const arrangementConflicts = computed(() => {
      if (!showArrangement.value || arrangementMode.value === "editCourse") return [];
      return events.conflictsOf(events.eventDraft.value, {
        courses: allWeekCourses.value,
        events: eventData.weekEvents.value,
        excludeEventId: events.editingEventId.value
      });
    });
    const handleSemesterChange = () => {
      gridSelectionResetNonce.value += 1;
      termStart.clearNoticeIfMatches(semesterDraft.value);
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
      document.addEventListener("visibilitychange", termStart.handleForegroundVisibility);
      sync.refreshCloudSyncCooldown();
      sync.ensureCloudSyncCooldownTimer();
      void data.fetchSemesterOptions();
      const timeDriven = termStart.resolveTimeDrivenSemester();
      const switchSemester = consumeScheduleSwitchPending(props.studentId);
      if (switchSemester) {
        const pendingStale = !!timeDriven.target && timeDriven.target !== switchSemester && !semesterIsNewer(switchSemester, timeDriven.target);
        if (pendingStale) {
          pushDebugLog(
            "Schedule",
            `#750 pending semester(${switchSemester}) from background is older than time-driven target(${timeDriven.target}), dropping to avoid rollback`,
            "warn"
          );
        } else {
          writeScheduleLock(props.studentId, switchSemester, "pending-switch");
          semester.value = switchSemester;
          semesterDraft.value = switchSemester;
        }
      }
      const lockDetail = readScheduleLockDetail(props.studentId);
      if (lockDetail?.semester) {
        const lockIsManual = !isAutoScheduleLockReason(lockDetail.reason);
        const lockNewerThanTarget = timeDriven.target ? semesterIsNewer(lockDetail.semester, timeDriven.target) : true;
        const shouldClearLock = lockIsManual || !!timeDriven.target && lockDetail.semester !== timeDriven.target && !lockNewerThanTarget;
        if (shouldClearLock) {
          const cleared = clearScheduleLock(props.studentId);
          if (cleared) {
            pushDebugLog(
              "Schedule",
              lockIsManual ? `#750 manual lock(${lockDetail.semester}) is session-scoped, cleared at startup` : `#750 auto lock(${lockDetail.semester}) is older than time-driven target(${timeDriven.target}), cleared and re-probed`,
              "warn"
            );
          }
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
            reason: "first-enter",
            // #750：传入时间驱动应选学期——探测命中且有课表 → term-start 锁定；
            // picked 早于 target（窗口内新学期未发布）→ 不写锁，等待发布后自动切。
            targetSemester: timeDriven.target || ""
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
      void termStart.ensureTimeDrivenSemester("startup");
    });
    onBeforeUnmount(() => {
      data.persistScheduleRenderSnapshot("component-unmount");
      window.removeEventListener("keydown", semesterApi.handleWeekKeydown);
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, sync.handleCloudSyncUpdated);
      window.removeEventListener("hbu-session-online", data.handleSessionOnline);
      window.removeEventListener("hbu-session-logout", data.handleSessionLogout);
      document.removeEventListener("visibilitychange", sync.handleScheduleVisibilityChange);
      document.removeEventListener("visibilitychange", termStart.handleForegroundVisibility);
      sync.clearCloudSyncCooldownTimer();
      if (widgetHighlightTimer) {
        clearTimeout(widgetHighlightTimer);
        widgetHighlightTimer = null;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "schedule-view",
        onTouchstartPassive: _cache[8] || (_cache[8] = //@ts-ignore
        (...args) => unref(semesterApi).handleTouchStart && unref(semesterApi).handleTouchStart(...args)),
        onTouchmovePassive: _cache[9] || (_cache[9] = //@ts-ignore
        (...args) => unref(semesterApi).handleTouchMove && unref(semesterApi).handleTouchMove(...args)),
        onTouchendPassive: _cache[10] || (_cache[10] = //@ts-ignore
        (...args) => unref(semesterApi).handleTouchEnd && unref(semesterApi).handleTouchEnd(...args)),
        onTouchcancelPassive: _cache[11] || (_cache[11] = //@ts-ignore
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
          "schedule-view-mode": unref(scheduleViewMode),
          "view-mode-options": unref(viewModeOptions),
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
          onSetViewMode: unref(setScheduleViewMode),
          onSetStyle: unref(setScheduleCourseCardStyle),
          onOpenAddArrangement: openAddArrangement,
          onOpenManageCourses: unref(editor).openManageCoursesDialog,
          onOpenAiImport: unref(importApi).openImportDialog,
          onSyncUpload: unref(sync).handleCloudSyncUpload,
          onSyncDownload: unref(sync).handleCloudSyncDownload,
          onExportJson: unref(io).exportCustomCoursesJson,
          onImportJson: unref(io).triggerImportCustomCourses,
          onImportFile: unref(io).handleCustomCourseFileChange,
          onExportCalendar: unref(io).exportCalendar,
          onCopyExportUrl: unref(io).copyExportUrl
        }, null, 8, ["show-menu", "semester-options", "semester-draft", "semester-loading", "loading", "semester-error", "schedule-course-card-style", "schedule-view-mode", "view-mode-options", "style-options", "adding-course", "loading-manage-courses", "sync-uploading", "sync-downloading", "custom-course-importing", "custom-course-exporting", "sync-upload-cooldown-text", "sync-download-cooldown-text", "sync-status-text", "custom-course-export-location", "exporting", "exporting-mode", "export-url", "export-error", "export-copied", "onSetViewMode", "onSetStyle", "onOpenManageCourses", "onOpenAiImport", "onSyncUpload", "onSyncDownload", "onExportJson", "onImportJson", "onImportFile", "onExportCalendar", "onCopyExportUrl"]),
        createVNode(ScheduleBanners, {
          offline: unref(offline),
          "initial-fetch-done": unref(initialFetchDone),
          loading: unref(loading),
          "offline-banner-text": offlineBannerText.value,
          "vacation-notice": unref(vacationNotice),
          "error-msg": unref(errorMsg),
          "current-week": unref(currentWeek),
          "selected-week": unref(selectedWeek),
          "term-start-notice": unref(termStart).termStartNotice.value,
          onJumpCurrent: unref(jumpToCurrentWeek)
        }, null, 8, ["offline", "initial-fetch-done", "loading", "offline-banner-text", "vacation-notice", "error-msg", "current-week", "selected-week", "term-start-notice", "onJumpCurrent"]),
        createVNode(ScheduleGrid, {
          "week-dates": unref(weekDates),
          "current-month": unref(currentMonth),
          "selected-week": unref(selectedWeek),
          "week-transition-name": unref(weekTransitionName),
          "schedule-course-card-style": unref(scheduleCourseCardStyle),
          "course-card-refresh-nonce": unref(courseCardRefreshNonce),
          "get-courses-for-day": unref(grid).getCoursesForDay,
          "get-course-style": unref(grid).getCourseCardStyle,
          "get-events-for-day": unref(eventData).getEventsForDay,
          "view-mode": unref(scheduleViewMode),
          "selection-reset-nonce": gridSelectionResetNonce.value,
          "is-widget-highlighted": unref(grid).isWidgetHighlighted,
          onOpenDetail: unref(detail).openDetail,
          onOpenEventDetail: handleOpenEventDetail,
          onConfirmBlankSelection: handleConfirmBlankSelection
        }, null, 8, ["week-dates", "current-month", "selected-week", "week-transition-name", "schedule-course-card-style", "course-card-refresh-nonce", "get-courses-for-day", "get-course-style", "get-events-for-day", "view-mode", "selection-reset-nonce", "is-widget-highlighted", "onOpenDetail"]),
        createVNode(ScheduleCourseDetail, {
          "show-detail": unref(showDetail),
          "selected-course": unref(selectedCourse),
          "detail-action-error": unref(detailActionError),
          onClose: _cache[2] || (_cache[2] = ($event) => showDetail.value = false),
          onOpenConflictCourseDetail: unref(detail).openConflictCourseDetail,
          onOpenEditCourse: unref(editor).openEditCourseDialog,
          onDeleteCustomCourse: unref(editor).deleteCustomCourse,
          onRemoveOfficialCourse: unref(editor).removeOfficialCourse,
          onCopyDetail: unref(detail).copySelectedCourseDetail
        }, null, 8, ["show-detail", "selected-course", "detail-action-error", "onOpenConflictCourseDetail", "onOpenEditCourse", "onDeleteCustomCourse", "onRemoveOfficialCourse", "onCopyDetail"]),
        createVNode(ScheduleEventDetail, {
          show: unref(showEventDetail),
          event: unref(selectedEvent),
          conflicts: unref(detailConflicts),
          deleting: unref(deletingEvent),
          error: unref(detailError),
          onClose: unref(eventDetail).closeEventDetail,
          onEdit: unref(eventDetail).requestEditEvent,
          onDelete: unref(eventDetail).requestDeleteEvent
        }, null, 8, ["show", "event", "conflicts", "deleting", "error", "onClose", "onEdit", "onDelete"]),
        createVNode(ScheduleAddArrangementDialog, {
          show: showArrangement.value,
          mode: arrangementMode.value,
          "initial-tab": arrangementInitialTab.value,
          "course-semester": unref(courseDialogSemester),
          "course-draft": unref(addCourseForm),
          "course-error": unref(addCourseError),
          "saving-course": unref(addingCourse),
          "course-span-options": unref(courseSpanOptions),
          "add-weeks-count-text": unref(addWeeksCountText),
          "event-draft": unref(eventDraft),
          "event-error": unref(eventError),
          "saving-event": unref(savingEvent),
          "deleting-event": unref(deletingEvent),
          "event-conflicts": arrangementConflicts.value,
          onClose: closeArrangement,
          onSubmitCourse: unref(editor).submitAddCourse,
          onSubmitEvent: handleSubmitEvent,
          onDeleteEvent: handleDeleteEvent,
          onOpenWeekPicker: _cache[3] || (_cache[3] = ($event) => showWeekPicker.value = true)
        }, null, 8, ["show", "mode", "initial-tab", "course-semester", "course-draft", "course-error", "saving-course", "course-span-options", "add-weeks-count-text", "event-draft", "event-error", "saving-event", "deleting-event", "event-conflicts", "onSubmitCourse"]),
        createVNode(ScheduleManageCoursesDialog, {
          "show-manage-courses": unref(showManageCourses),
          "loading-manage-courses": unref(loadingManageCourses),
          "manage-courses-error": unref(manageCoursesError),
          "managed-course-groups": unref(managedCourseGroups),
          "manage-expanded-semesters": unref(manageExpandedSemesters),
          onClose: unref(editor).closeManageCoursesDialog,
          onToggleSemester: unref(editor).toggleManageSemester,
          onEditCourse: handleEditManagedCourse,
          onDeleteCourse: unref(editor).deleteManagedCourse,
          onRestoreOfficialCourse: unref(editor).restoreOfficialCourse
        }, null, 8, ["show-manage-courses", "loading-manage-courses", "manage-courses-error", "managed-course-groups", "manage-expanded-semesters", "onClose", "onToggleSemester", "onDeleteCourse", "onRestoreOfficialCourse"]),
        createVNode(ScheduleCourseImportDialog, {
          "show-import-dialog": unref(importApi).showImportDialog.value,
          stage: unref(importApi).stage.value,
          "target-semester": unref(importApi).targetSemester.value,
          "raw-text": unref(importApi).rawText.value,
          "show-example": unref(importApi).showExample.value,
          parsing: unref(importApi).parsing.value,
          committing: unref(importApi).committing.value,
          "parse-error": unref(importApi).parseError.value,
          "global-diagnostics": unref(importApi).globalDiagnostics.value,
          "preview-courses": unref(importApi).previewCourses.value,
          "import-result": unref(importApi).importResult.value,
          summary: unref(importApi).summary.value,
          "has-importable": unref(importApi).hasImportable.value,
          "semester-options": unref(semesterOptions),
          "preview-mode": unref(importApi).previewMode.value,
          "preview-week": unref(importApi).previewWeek.value,
          "preview-total-weeks": unref(importApi).previewTotalWeeks.value,
          "preview-week-dates": unref(importApi).previewWeekDates.value,
          "preview-get-courses-for-day": unref(importApi).previewGetCoursesForDay,
          "preview-conflicts-of": unref(importApi).previewConflictsOf,
          "schedule-course-card-style": unref(scheduleCourseCardStyle),
          onClose: unref(importApi).closeImportDialog,
          "onUpdate:targetSemester": _cache[4] || (_cache[4] = ($event) => unref(importApi).targetSemester.value = $event),
          "onUpdate:rawText": _cache[5] || (_cache[5] = ($event) => unref(importApi).rawText.value = $event),
          onToggleExample: _cache[6] || (_cache[6] = ($event) => unref(importApi).showExample.value = !unref(importApi).showExample.value),
          onCopyPrompt: unref(importApi).copyPrompt,
          onFileImport: unref(importApi).handleFileChange,
          onParse: unref(importApi).parseText,
          onBack: unref(importApi).backToInput,
          onToggleSelect: unref(importApi).toggleSelected,
          onSelectAll: unref(importApi).setAllSelected,
          onColorChange: unref(importApi).changeCourseColor,
          onAiColors: unref(importApi).useAiRecommendedColors,
          onBalancedColors: unref(importApi).useBalancedColors,
          onResetColors: unref(importApi).resetColors,
          onSetPreviewMode: unref(importApi).setPreviewMode,
          onSetPreviewWeek: unref(importApi).setPreviewWeek,
          onPrevPreviewWeek: unref(importApi).prevPreviewWeek,
          onNextPreviewWeek: unref(importApi).nextPreviewWeek,
          onCommit: unref(importApi).commitImport
        }, null, 8, ["show-import-dialog", "stage", "target-semester", "raw-text", "show-example", "parsing", "committing", "parse-error", "global-diagnostics", "preview-courses", "import-result", "summary", "has-importable", "semester-options", "preview-mode", "preview-week", "preview-total-weeks", "preview-week-dates", "preview-get-courses-for-day", "preview-conflicts-of", "schedule-course-card-style", "onClose", "onCopyPrompt", "onFileImport", "onParse", "onBack", "onToggleSelect", "onSelectAll", "onColorChange", "onAiColors", "onBalancedColors", "onResetColors", "onSetPreviewMode", "onSetPreviewWeek", "onPrevPreviewWeek", "onNextPreviewWeek", "onCommit"]),
        createVNode(ScheduleWeekPicker, {
          "show-week-picker": unref(showWeekPicker),
          "semester-week-options": unref(semesterWeekOptions),
          "selected-weeks": unref(addCourseForm).weeks,
          onClose: _cache[7] || (_cache[7] = ($event) => showWeekPicker.value = false),
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
const ScheduleView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-a7dfd200"]]);
export {
  ScheduleView as default
};
