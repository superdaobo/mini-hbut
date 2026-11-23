import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, d as createCommentVNode, e as normalizeStyle } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { T as TCard } from "./TCard-PWi6RV37.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, cj as fetchTeacherAttendance, af as asRecord, ae as asArray, ab as asNumber, aa as stripTeacherHtml, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherAttendanceErrorKey = (kind) => `teacher.error.${kind}`;
const ATTENDANCE_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidAttendanceSemester = (value) => ATTENDANCE_SEMESTER_PATTERN.test(value);
const resolveInitialAttendanceSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidAttendanceSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidAttendanceSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const ATTENDANCE_WEEK_COUNT = 20;
const isRecordedWeek = (status) => {
  const text = typeof status === "string" ? status.trim() : String(status ?? "").trim();
  return text !== "" && text !== "0";
};
const normalizeAttendanceClass = (value, index) => {
  const record = asRecord(value);
  const rawWeeks = asArray(record.weeks).map(
    (item) => typeof item === "string" ? item.trim() : String(item ?? "")
  );
  const weeks = Array.from({ length: ATTENDANCE_WEEK_COUNT }, (_, i) => rawWeeks[i] ?? "");
  const recordedWeeks = asNumber(record.recordedWeeks) ?? weeks.filter(isRecordedWeek).length;
  const className = stripTeacherHtml(record.className);
  const courseName = stripTeacherHtml(record.courseName);
  const classId = String(record.classId ?? "").trim();
  return {
    key: classId || `attendance-class-${index}`,
    courseCode: stripTeacherHtml(record.courseCode),
    courseName,
    classId,
    className,
    classNo: String(record.classNo ?? ""),
    studentCount: asNumber(record.studentCount) ?? null,
    totalHours: asNumber(record.totalHours) ?? null,
    weeklyHours: asNumber(record.weeklyHours) ?? null,
    weekRange: stripTeacherHtml(record.weekRange),
    confirmed: String(record.confirmed ?? ""),
    weeks,
    recordedWeeks
  };
};
const normalizeAttendancePayload = (raw) => {
  const payload = asRecord(raw);
  const summaryRecord = asRecord(payload.summary);
  const classes = asArray(payload.classes).map(normalizeAttendanceClass);
  return {
    summary: {
      classCount: asNumber(summaryRecord.classCount) ?? classes.length,
      studentTotal: asNumber(summaryRecord.studentTotal) ?? 0,
      recordedClassCount: asNumber(summaryRecord.recordedClassCount) ?? classes.filter((item) => item.recordedWeeks > 0).length,
      weeks: asNumber(summaryRecord.weeks) ?? ATTENDANCE_WEEK_COUNT
    },
    classes
  };
};
const classCoveragePercent = (item) => {
  if (item.recordedWeeks <= 0) return null;
  return Math.min(100, item.recordedWeeks / ATTENDANCE_WEEK_COUNT * 100);
};
const overallCoveragePercent = (data) => {
  const totalRecorded = data.classes.reduce((sum, item) => sum + item.recordedWeeks, 0);
  if (totalRecorded <= 0 || data.classes.length === 0) return null;
  const denominator = data.classes.length * ATTENDANCE_WEEK_COUNT;
  return Math.min(100, totalRecorded / denominator * 100);
};
const ATTENDANCE_CACHE_TTL_MS = 5 * 60 * 1e3;
const attendanceSnapshots = /* @__PURE__ */ new Map();
const ATTENDANCE_SNAPSHOT_MAX_ENTRIES = 32;
const readAttendanceSnapshot = (key, now = Date.now()) => {
  const snapshot = attendanceSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > ATTENDANCE_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeAttendanceSnapshot = (key, data, syncedAt) => {
  attendanceSnapshots.set(key, { syncedAt, data });
  while (attendanceSnapshots.size > ATTENDANCE_SNAPSHOT_MAX_ENTRIES) {
    const oldest = attendanceSnapshots.keys().next().value;
    if (oldest === void 0) break;
    attendanceSnapshots.delete(oldest);
  }
};
const useTeacherAttendance = (options = {}) => {
  const semester = ref(resolveInitialAttendanceSemester(options.initialSemester));
  const state = ref({
    status: "idle",
    data: null,
    error: null
  });
  const requestSeq = ref(0);
  const lastSuccessfulSyncAt = ref("");
  const fromCache = ref(false);
  const snapshotStale = ref(false);
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const scopeKey = computed(
    () => buildTeacherScopedKey("attendance", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const classes = computed(() => state.value.data?.classes ?? []);
  const summary = computed(() => state.value.data?.summary ?? null);
  const totalRecordedWeeks = computed(
    () => classes.value.reduce((sum, item) => sum + item.recordedWeeks, 0)
  );
  const hasRecorded = computed(() => totalRecordedWeeks.value > 0);
  const coveragePercent = computed(
    () => state.value.data ? overallCoveragePercent(state.value.data) : null
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherAttendanceErrorKey(state.value.error.kind) : ""
  );
  const syncStatus = computed(
    () => resolveTeacherSyncStatus({
      phase: state.value.status,
      hasData: state.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: state.value.error?.kind ?? null
    })
  );
  const applySnapshot = (snapshot, stale) => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt;
    fromCache.value = true;
    snapshotStale.value = stale;
    const empty = snapshot.data.classes.length === 0;
    state.value = empty ? { status: "empty", data: null, error: { kind: "empty", message: "" } } : { status: "ready", data: snapshot.data, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherAttendance(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const data = normalizeAttendancePayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (data.classes.length === 0) {
        state.value = { status: "empty", data: null, error: { kind: "empty", message: "" } };
        return;
      }
      if (key) writeAttendanceSnapshot(key, data, syncedAt);
      state.value = { status: "ready", data, error: null };
      return;
    }
    if (result.status === "empty") {
      lastSuccessfulSyncAt.value = (/* @__PURE__ */ new Date()).toISOString();
      fromCache.value = false;
      snapshotStale.value = false;
      state.value = { status: "empty", data: null, error: { kind: "empty", message: "" } };
      return;
    }
    state.value = { status: "error", data: state.value.data, error: result.error };
  };
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && key) {
      const snapshot = readAttendanceSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidAttendanceSemester(next) || next === semester.value) return;
    semester.value = next;
    state.value = { status: "idle", data: null, error: null };
    lastSuccessfulSyncAt.value = "";
    fromCache.value = false;
    snapshotStale.value = false;
    await load();
  };
  const retry = () => load({ force: true });
  return {
    semester,
    accountId,
    scopeKey,
    state,
    classes,
    summary,
    totalRecordedWeeks,
    hasRecorded,
    coveragePercent,
    isLoading,
    isEmpty,
    isReady,
    isError,
    errorKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    setSemester,
    retry
  };
};
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-attendance" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = {
  class: "tch-a-card p-4 flex flex-col gap-3",
  "aria-live": "polite"
};
const _hoisted_8 = { class: "flex items-center gap-1.5" };
const _hoisted_9 = { class: "text-xs font-semibold text-on-surface-variant" };
const _hoisted_10 = { class: "flex items-end justify-between" };
const _hoisted_11 = { class: "min-w-0" };
const _hoisted_12 = { class: "tch-label-caption text-on-surface-variant" };
const _hoisted_13 = { class: "flex items-baseline gap-1 mt-1" };
const _hoisted_14 = {
  key: 0,
  class: "text-base font-bold text-primary"
};
const _hoisted_15 = { class: "tch-label-caption text-on-surface-variant mt-1" };
const _hoisted_16 = ["aria-label"];
const _hoisted_17 = {
  class: "w-14 h-14 -rotate-90",
  viewBox: "0 0 56 56"
};
const _hoisted_18 = ["stroke-dashoffset"];
const _hoisted_19 = { class: "grid grid-cols-2 gap-2" };
const _hoisted_20 = { class: "flex items-center gap-2 bg-surface-canvas rounded-lg px-2.5 py-2" };
const _hoisted_21 = { class: "min-w-0" };
const _hoisted_22 = { class: "tch-label-micro text-outline block" };
const _hoisted_23 = { class: "text-sm font-bold text-on-surface truncate block" };
const _hoisted_24 = { class: "flex items-center gap-2 bg-surface-canvas rounded-lg px-2.5 py-2" };
const _hoisted_25 = { class: "min-w-0" };
const _hoisted_26 = { class: "tch-label-micro text-outline block" };
const _hoisted_27 = { class: "text-sm font-bold text-on-surface truncate block" };
const _hoisted_28 = { class: "flex flex-col gap-2" };
const _hoisted_29 = { class: "flex items-center justify-between px-1" };
const _hoisted_30 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_31 = { class: "tch-label-caption text-on-surface-variant" };
const _hoisted_32 = { class: "flex items-center justify-between gap-2" };
const _hoisted_33 = { class: "flex items-center gap-2 min-w-0" };
const _hoisted_34 = { class: "text-sm font-bold text-on-surface truncate" };
const _hoisted_35 = { class: "w-full bg-surface-muted h-1.5 rounded-full overflow-hidden mt-2" };
const _hoisted_36 = { class: "flex items-center justify-between tch-label-caption text-on-surface-variant pt-1.5" };
const _hoisted_37 = { class: "tch-a-card p-4" };
const _hoisted_38 = { class: "flex items-center justify-between" };
const _hoisted_39 = { class: "min-w-0" };
const _hoisted_40 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_41 = { class: "tch-label-caption text-on-surface-variant mt-0.5" };
const _hoisted_42 = { class: "shrink-0 px-2 py-1 rounded-full bg-surface-canvas tch-label-micro text-on-surface-variant" };
const _hoisted_43 = { class: "tch-matrix-legend flex items-center gap-1.5 mt-2" };
const _hoisted_44 = { class: "tch-label-micro text-on-surface-variant" };
const _hoisted_45 = { class: "tch-label-micro text-on-surface-variant" };
const _hoisted_46 = { class: "overflow-x-auto mt-2 -mx-4 px-4 pb-1" };
const _hoisted_47 = { class: "min-w-[360px] flex flex-col gap-1.5" };
const _hoisted_48 = { class: "grid tch-matrix-grid items-center" };
const _hoisted_49 = ["title"];
const _hoisted_50 = ["aria-label", "onClick"];
const _hoisted_51 = {
  key: 0,
  class: "tch-popover mt-2 rounded-lg p-2.5 bg-surface-canvas flex items-center justify-between"
};
const _hoisted_52 = { class: "flex items-center gap-2 min-w-0" };
const _hoisted_53 = { class: "min-w-0" };
const _hoisted_54 = { class: "text-sm font-bold text-on-surface block leading-tight truncate" };
const _hoisted_55 = { class: "tch-label-caption text-on-surface-variant block mt-0.5" };
const _hoisted_56 = ["aria-label"];
const _hoisted_57 = { class: "tch-a-card overflow-hidden" };
const _hoisted_58 = ["aria-expanded"];
const _hoisted_59 = { class: "flex items-center gap-2 min-w-0" };
const _hoisted_60 = { class: "text-sm font-bold text-on-surface truncate" };
const _hoisted_61 = { class: "flex items-center gap-1 text-on-surface-variant shrink-0" };
const _hoisted_62 = { class: "tch-label-caption" };
const _hoisted_63 = { class: "p-4 pt-1 bg-surface-canvas" };
const _hoisted_64 = { class: "tch-label-caption text-outline" };
const _hoisted_65 = { class: "mt-2 flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-lowest tch-empty-note" };
const _hoisted_66 = { class: "text-sm text-on-surface-variant" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherAttendanceView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      classes,
      summary,
      totalRecordedWeeks,
      hasRecorded,
      coveragePercent,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherAttendance({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => classes.value.length > 0);
    const semesterDraft = ref(semester.value);
    watch(semester, (value) => {
      semesterDraft.value = value;
    });
    const semesters = computed(() => teacherSemesterOptions(semesterDraft.value));
    const semesterDetails = ref(null);
    const semesterMenuOpen = ref(false);
    const onSemesterToggle = () => {
      semesterMenuOpen.value = semesterDetails.value?.open === true;
    };
    const closeSemesterMenu = () => {
      if (semesterDetails.value) semesterDetails.value.open = false;
      semesterMenuOpen.value = false;
    };
    const applySemester = async () => {
      closeSemesterMenu();
      if (semesterDraft.value === semester.value) return;
      await setSemester(semesterDraft.value);
    };
    const reload = async () => {
      await retry();
    };
    const coverageText = computed(
      () => coveragePercent.value === null ? "" : coveragePercent.value.toFixed(1)
    );
    const sortedClasses = computed(
      () => [...classes.value].sort((a, b) => {
        const ca = classCoveragePercent(a);
        const cb = classCoveragePercent(b);
        if (ca === null && cb === null) return 0;
        if (ca === null) return 1;
        if (cb === null) return -1;
        return cb - ca;
      })
    );
    const classCoverageText = (item) => {
      const percent = classCoveragePercent(item);
      return percent === null ? "—" : `${percent.toFixed(1)}%`;
    };
    const coverageBarClass = (item) => {
      const percent = classCoveragePercent(item);
      if (percent === null) return "bg-surface-track";
      if (percent > 95) return "bg-success";
      if (percent >= 90) return "bg-primary";
      return "bg-danger";
    };
    const coveragePercentTextClass = (item) => {
      const percent = classCoveragePercent(item);
      if (percent === null) return "text-on-surface-variant";
      if (percent > 95) return "text-success";
      if (percent >= 90) return "text-primary";
      return "text-danger";
    };
    const coverageWidth = (item) => {
      const percent = classCoveragePercent(item);
      return `${percent === null ? 0 : Math.min(100, percent).toFixed(1)}%`;
    };
    const matrixRowLabel = (item) => item.courseName || item.className || "—";
    const weekCellClass = (status) => status !== "" && status !== "0" ? "bg-primary" : "bg-surface-muted";
    const popover = ref(null);
    const openWeekPopover = (item, weekIndex) => {
      const status = item.weeks[weekIndex] ?? "";
      popover.value = {
        title: `${item.courseName || item.className} · ${tf("teacher.attendance.weekLabel", { n: weekIndex + 1 })}`,
        recorded: status !== "" && status !== "0"
      };
    };
    const closeWeekPopover = () => {
      popover.value = null;
    };
    const riskOpen = ref(false);
    const toggleRisk = () => {
      riskOpen.value = !riskOpen.value;
    };
    const heroSubtitle = computed(
      () => tf("teacher.attendance.hero.sub", {
        classes: summary.value?.classCount ?? 0,
        weeks: totalRecordedWeeks.value
      })
    );
    const classCountText = computed(
      () => tf("teacher.attendance.chip.classes", { n: summary.value?.classCount ?? 0 })
    );
    const studentTotalText = computed(
      () => tf("teacher.attendance.chip.students", { n: summary.value?.studentTotal ?? 0 })
    );
    const weekColumns = Array.from({ length: ATTENDANCE_WEEK_COUNT }, (_, i) => i + 1);
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.attendance.title"),
          icon: "fact_check",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-semester-pill",
                title: unref(t)("teacher.attendance.semester.label")
              }, [
                createBaseVNode("span", _hoisted_3, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_2),
              createBaseVNode("div", {
                class: "tch-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-attendance-semester",
                      value,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => semesterDraft.value = $event),
                      disabled: unref(isLoading),
                      onChange: applySemester
                    }, null, 40, _hoisted_4), [
                      [vModelRadio, semesterDraft.value]
                    ]),
                    createBaseVNode("span", null, toDisplayString(value), 1)
                  ]);
                }), 128))
              ])
            ], 544),
            createBaseVNode("button", {
              type: "button",
              class: "w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest",
              "aria-label": unref(t)("teacher.attendance.action.refresh"),
              disabled: unref(isLoading),
              onClick: reload
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(isLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_5)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("main", _hoisted_6, [
          unref(isLoading) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("teacher.attendance.loading")
          }, null, 8, ["message"])) : unref(isError) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: unref(t)(unref(errorKey))
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "mt-3 text-primary font-semibold",
                onClick: reload
              }, toDisplayString(unref(t)("teacher.attendance.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.attendance.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_7, [
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("span", {
                  class: normalizeClass(["w-2 h-2 rounded-full", unref(hasRecorded) ? "bg-success" : "bg-surface-track"])
                }, null, 2),
                createBaseVNode("span", _hoisted_9, toDisplayString(unref(semester)), 1)
              ]),
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("div", _hoisted_11, [
                  createBaseVNode("p", _hoisted_12, toDisplayString(unref(t)("teacher.attendance.hero.title")), 1),
                  createBaseVNode("div", _hoisted_13, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tch-kpi", unref(hasRecorded) ? "text-primary" : "text-on-surface-variant"])
                    }, toDisplayString(unref(hasRecorded) ? coverageText.value : "—"), 3),
                    unref(hasRecorded) ? (openBlock(), createElementBlock("span", _hoisted_14, "%")) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("p", _hoisted_15, toDisplayString(unref(hasRecorded) ? heroSubtitle.value : unref(t)("teacher.attendance.hero.empty")), 1)
                ]),
                createBaseVNode("div", {
                  class: "relative w-14 h-14 shrink-0",
                  role: "img",
                  "aria-label": unref(hasRecorded) ? `${coverageText.value}%` : unref(t)("teacher.attendance.hero.empty")
                }, [
                  (openBlock(), createElementBlock("svg", _hoisted_17, [
                    _cache[2] || (_cache[2] = createBaseVNode("circle", {
                      class: "tch-ring-track",
                      cx: "28",
                      cy: "28",
                      fill: "none",
                      r: "23",
                      "stroke-width": "4"
                    }, null, -1)),
                    unref(hasRecorded) ? (openBlock(), createElementBlock("circle", {
                      key: 0,
                      class: "text-primary tch-ring-arc",
                      cx: "28",
                      cy: "28",
                      fill: "none",
                      r: "23",
                      stroke: "currentColor",
                      "stroke-dasharray": "144.5",
                      "stroke-linecap": "round",
                      "stroke-width": "4",
                      "stroke-dashoffset": 144.5 * (1 - Math.min(100, unref(coveragePercent) ?? 0) / 100)
                    }, null, 8, _hoisted_18)) : createCommentVNode("", true)
                  ])),
                  createBaseVNode("span", {
                    class: normalizeClass(["absolute inset-0 flex items-center justify-center material-symbols-outlined text-[18px]", unref(hasRecorded) ? "text-primary" : "text-outline"]),
                    "aria-hidden": "true"
                  }, "fact_check", 2)
                ], 8, _hoisted_16)
              ]),
              createBaseVNode("div", _hoisted_19, [
                createBaseVNode("div", _hoisted_20, [
                  _cache[3] || (_cache[3] = createBaseVNode("span", { class: "w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center text-primary" }, [
                    createBaseVNode("span", {
                      class: "material-symbols-outlined text-[16px]",
                      "aria-hidden": "true"
                    }, "groups")
                  ], -1)),
                  createBaseVNode("div", _hoisted_21, [
                    createBaseVNode("span", _hoisted_22, toDisplayString(unref(t)("teacher.attendance.chip.classes.label")), 1),
                    createBaseVNode("span", _hoisted_23, toDisplayString(classCountText.value), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_24, [
                  _cache[4] || (_cache[4] = createBaseVNode("span", { class: "w-7 h-7 rounded-full bg-success-soft flex items-center justify-center text-success" }, [
                    createBaseVNode("span", {
                      class: "material-symbols-outlined text-[16px]",
                      "aria-hidden": "true"
                    }, "groups")
                  ], -1)),
                  createBaseVNode("div", _hoisted_25, [
                    createBaseVNode("span", _hoisted_26, toDisplayString(unref(t)("teacher.attendance.chip.students.label")), 1),
                    createBaseVNode("span", _hoisted_27, toDisplayString(studentTotalText.value), 1)
                  ])
                ])
              ])
            ]),
            createBaseVNode("section", _hoisted_28, [
              createBaseVNode("div", _hoisted_29, [
                createBaseVNode("h2", _hoisted_30, toDisplayString(unref(t)("teacher.attendance.classes.title")), 1),
                createBaseVNode("span", _hoisted_31, toDisplayString(unref(t)("teacher.attendance.classes.sorted")), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(sortedClasses.value, (item) => {
                return openBlock(), createBlock(unref(TCard), {
                  key: item.key,
                  compact: ""
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_32, [
                      createBaseVNode("div", _hoisted_33, [
                        createBaseVNode("span", {
                          class: normalizeClass(["w-2.5 h-2.5 rounded-full shrink-0", coverageBarClass(item)])
                        }, null, 2),
                        createBaseVNode("span", _hoisted_34, toDisplayString(item.courseName || item.className), 1)
                      ]),
                      createBaseVNode("span", {
                        class: normalizeClass(["text-sm font-bold shrink-0", coveragePercentTextClass(item)])
                      }, toDisplayString(classCoverageText(item)), 3)
                    ]),
                    createBaseVNode("div", _hoisted_35, [
                      createBaseVNode("div", {
                        class: normalizeClass(["h-full rounded-full transition-all duration-700 ease-out tch-progress-fill", coverageBarClass(item)]),
                        style: normalizeStyle({ width: coverageWidth(item) })
                      }, null, 6)
                    ]),
                    createBaseVNode("div", _hoisted_36, [
                      createBaseVNode("span", null, toDisplayString(unref(tf)("teacher.attendance.class.students", { n: item.studentCount ?? "—" })), 1),
                      createBaseVNode("span", null, toDisplayString(unref(tf)("teacher.attendance.class.weeks", { n: item.recordedWeeks })), 1)
                    ])
                  ]),
                  _: 2
                }, 1024);
              }), 128))
            ]),
            createBaseVNode("section", _hoisted_37, [
              createBaseVNode("div", _hoisted_38, [
                createBaseVNode("div", _hoisted_39, [
                  createBaseVNode("h2", _hoisted_40, toDisplayString(unref(t)("teacher.attendance.heatmap.title")), 1),
                  createBaseVNode("p", _hoisted_41, toDisplayString(unref(t)("teacher.attendance.heatmap.hint")), 1)
                ]),
                createBaseVNode("span", _hoisted_42, toDisplayString(unref(tf)("teacher.attendance.heatmap.range", { n: unref(weekColumns).length })), 1)
              ]),
              createBaseVNode("div", _hoisted_43, [
                _cache[5] || (_cache[5] = createBaseVNode("span", { class: "w-2 h-2 rounded-sm bg-primary" }, null, -1)),
                createBaseVNode("span", _hoisted_44, toDisplayString(unref(t)("teacher.attendance.heatmap.recorded")), 1),
                _cache[6] || (_cache[6] = createBaseVNode("span", { class: "w-2 h-2 rounded-sm bg-surface-muted border border-surface-track" }, null, -1)),
                createBaseVNode("span", _hoisted_45, toDisplayString(unref(t)("teacher.attendance.heatmap.unrecorded")), 1)
              ]),
              createBaseVNode("div", _hoisted_46, [
                createBaseVNode("div", _hoisted_47, [
                  createBaseVNode("div", _hoisted_48, [
                    _cache[7] || (_cache[7] = createBaseVNode("div", null, null, -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(unref(weekColumns), (week) => {
                      return openBlock(), createElementBlock("div", {
                        key: week,
                        class: "text-center tch-label-micro text-outline"
                      }, toDisplayString(week), 1);
                    }), 128))
                  ]),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(classes), (item) => {
                    return openBlock(), createElementBlock("div", {
                      key: item.key,
                      class: "grid tch-matrix-grid items-center"
                    }, [
                      createBaseVNode("div", {
                        class: "tch-label-micro font-bold text-on-surface-variant truncate pr-1",
                        title: item.courseName || item.className
                      }, toDisplayString(matrixRowLabel(item)), 9, _hoisted_49),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(item.weeks, (status, weekIndex) => {
                        return openBlock(), createElementBlock("button", {
                          key: weekIndex,
                          type: "button",
                          class: normalizeClass(["tch-heat-cell", weekCellClass(status)]),
                          "aria-label": `${matrixRowLabel(item)} ${unref(tf)("teacher.attendance.weekLabel", { n: weekIndex + 1 })}`,
                          onClick: ($event) => openWeekPopover(item, weekIndex)
                        }, null, 10, _hoisted_50);
                      }), 128))
                    ]);
                  }), 128))
                ])
              ]),
              popover.value ? (openBlock(), createElementBlock("div", _hoisted_51, [
                createBaseVNode("div", _hoisted_52, [
                  createBaseVNode("span", {
                    class: normalizeClass(["w-2.5 h-2.5 rounded-full shrink-0", popover.value.recorded ? "bg-success" : "bg-surface-track"])
                  }, null, 2),
                  createBaseVNode("div", _hoisted_53, [
                    createBaseVNode("span", _hoisted_54, toDisplayString(popover.value.title), 1),
                    createBaseVNode("span", _hoisted_55, toDisplayString(popover.value.recorded ? unref(t)("teacher.attendance.heatmap.popover.recorded") : unref(t)("teacher.attendance.heatmap.popover.unrecorded")), 1)
                  ])
                ]),
                createBaseVNode("button", {
                  type: "button",
                  class: "w-6 h-6 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant",
                  "aria-label": unref(t)("teacher.attendance.heatmap.popover.close"),
                  onClick: closeWeekPopover
                }, [..._cache[8] || (_cache[8] = [
                  createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "close", -1)
                ])], 8, _hoisted_56)
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("section", _hoisted_57, [
              createBaseVNode("button", {
                type: "button",
                class: "w-full p-4 flex items-center justify-between active:bg-surface-canvas transition-colors",
                "aria-expanded": riskOpen.value,
                onClick: toggleRisk
              }, [
                createBaseVNode("div", _hoisted_59, [
                  _cache[9] || (_cache[9] = createBaseVNode("span", { class: "w-3 h-3 rounded-full bg-course-amber shrink-0" }, null, -1)),
                  createBaseVNode("span", _hoisted_60, toDisplayString(unref(t)("teacher.attendance.risk.title")), 1),
                  _cache[10] || (_cache[10] = createBaseVNode("span", { class: "px-2 py-0.5 rounded-full bg-surface-muted text-on-surface-variant tch-label-caption font-bold" }, "—", -1))
                ]),
                createBaseVNode("div", _hoisted_61, [
                  createBaseVNode("span", _hoisted_62, toDisplayString(riskOpen.value ? unref(t)("teacher.attendance.risk.collapse") : unref(t)("teacher.attendance.risk.expand")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["material-symbols-outlined text-[18px] transition-transform duration-300", { "rotate-180": riskOpen.value }])
                  }, "expand_more", 2)
                ])
              ], 8, _hoisted_58),
              createBaseVNode("div", {
                class: normalizeClass(["tch-collapse", { "tch-collapse--open": riskOpen.value }])
              }, [
                createBaseVNode("div", _hoisted_63, [
                  createBaseVNode("p", _hoisted_64, toDisplayString(unref(t)("teacher.attendance.risk.hint")), 1),
                  createBaseVNode("div", _hoisted_65, [
                    _cache[11] || (_cache[11] = createBaseVNode("span", {
                      class: "material-symbols-outlined text-[18px] text-outline",
                      "aria-hidden": "true"
                    }, "person_search", -1)),
                    createBaseVNode("span", _hoisted_66, toDisplayString(unref(t)("teacher.attendance.risk.empty")), 1)
                  ])
                ])
              ], 2)
            ])
          ], 64)),
          createVNode(_sfc_main$2, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": unref(isError) ? unref(errorKey) : ""
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ])
      ]);
    };
  }
});
const TeacherAttendanceView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-af99db47"]]);
export {
  TeacherAttendanceView as default
};
