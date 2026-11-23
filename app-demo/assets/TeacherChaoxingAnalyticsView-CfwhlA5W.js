import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, af as asRecord, ab as asNumber, a7 as canPersistTeacherState, cr as fetchTeacherChaoxingAnalytics, cs as fetchTeacherChaoxingMonitor, ct as fetchTeacherChaoxingCourses, ad as dedupeByStableKey, ae as asArray, a9 as asString, ay as normalizeTeacherText, ac as buildStableKey, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { h as computed, r as ref, i as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, j as createBlock, t as toDisplayString, F as Fragment, f as renderList, d as createCommentVNode, e as normalizeStyle } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
const teacherChaoxingErrorKey = (kind) => `teacher.error.${kind}`;
const CHAOXING_DIMENSIONS = [
  "worknum",
  "examnum",
  "sign",
  "score",
  "pv",
  "monitor"
];
const normalizeChaoxingCourse = (value, index) => {
  const record = asRecord(value);
  const courseId = asString(record.courseId);
  const classId = asString(record.classId);
  const cpi = asString(record.cpi);
  return {
    key: buildStableKey([courseId, classId, cpi]) || `chaoxing-course-${index}`,
    courseId,
    courseName: normalizeTeacherText(record.courseName),
    classId,
    className: normalizeTeacherText(record.className),
    role: asString(record.role),
    cpi,
    studentCount: asNumber(record.studentCount) ?? null
  };
};
const normalizeChaoxingChannel = (value, index) => {
  const record = asRecord(value);
  return {
    key: buildStableKey([asString(record.clazzId), asString(record.cpi)]) || `chaoxing-channel-${index}`,
    className: normalizeTeacherText(record.className),
    studentCount: asNumber(record.studentCount) ?? null,
    clazzId: asString(record.clazzId),
    cpi: asString(record.cpi),
    roletype: asNumber(record.roletype) ?? null
  };
};
const normalizeChaoxingCoursesPayload = (raw) => {
  const payload = asRecord(raw);
  return {
    courses: dedupeByStableKey(
      asArray(payload.courses).map(normalizeChaoxingCourse),
      (item) => item.key
    ),
    channels: dedupeByStableKey(
      asArray(payload.channels).map(normalizeChaoxingChannel),
      (item) => item.key
    )
  };
};
const normalizeChaoxingDimensions = (raw) => {
  const record = asRecord(asRecord(raw).dimensions);
  const out = {};
  for (const key of CHAOXING_DIMENSIONS) {
    const value = record[key];
    out[key] = value === void 0 ? null : value;
  }
  return out;
};
const dimCandidates = (dim) => {
  const root = asRecord(dim);
  const out = [root];
  const data = asRecord(root.data);
  if (Object.keys(data).length > 0) out.push(data);
  const result = asRecord(root.result);
  if (Object.keys(result).length > 0) out.push(result);
  return out;
};
const digNumber = (dim, paths) => {
  for (const candidate of dimCandidates(dim)) {
    for (const path of paths) {
      let cursor = candidate;
      for (const part of path.split(".")) {
        cursor = asRecord(cursor)[part];
      }
      const parsed = asNumber(cursor);
      if (parsed !== void 0) return parsed;
    }
  }
  return null;
};
const normalizeChaoxingPercent = (value) => {
  if (value === null || !Number.isFinite(value)) return null;
  if (value <= 0) return 0;
  const percent = value <= 1 ? value * 100 : value;
  return Math.min(100, percent);
};
const chaoxingSignRate = (dim) => normalizeChaoxingPercent(digNumber(dim, ["totalRate", "avg"]));
const chaoxingWorkRate = (dim) => {
  const direct = normalizeChaoxingPercent(digNumber(dim, ["finishWorkPer", "avg_finish"]));
  if (direct !== null) return direct;
  const submit = chaoxingWorkSubmit(dim);
  const total = chaoxingWorkTotal(dim);
  if (submit === null || total === null || total <= 0) return null;
  return Math.min(100, submit / total * 100);
};
const chaoxingWorkSubmit = (dim) => digNumber(dim, ["submit"]);
const chaoxingWorkTotal = (dim) => digNumber(dim, ["total", "totalShow"]);
const chaoxingWorkPending = (dim) => digNumber(dim, [
  "unGradeNum",
  "waitGradeNum",
  "unmarkNum",
  "unMarkNum",
  "notMarkNum",
  "unCorrectNum",
  "unCorrectedNum",
  "stayNum",
  "pendingNum",
  "unreadNum"
]);
const chaoxingExamCount = (dim) => digNumber(dim, ["numObj.total", "totalShow", "count", "total"]);
const chaoxingExamAvgScore = (dim) => {
  const value = digNumber(dim, ["scoreObj.avg", "avg"]);
  return value !== null && value >= 0 && value <= 100 ? value : null;
};
const chaoxingScoreAvg = (dim) => digNumber(dim, ["avg", "scoreObj.avg"]);
const chaoxingPvTotal = (dim) => digNumber(dim, ["pvTotal", "total"]);
const chaoxingWeekActive = (dim) => digNumber(dim, ["thisWeek.personTotal", "personTotal"]);
const chaoxingCourseQueryable = (course) => course.courseId !== "" && course.cpi !== "";
const CHAOXING_CACHE_TTL_MS = 5 * 60 * 1e3;
const coursesSnapshots = /* @__PURE__ */ new Map();
const analyticsSnapshots = /* @__PURE__ */ new Map();
const CHAOXING_SNAPSHOT_MAX_ENTRIES = 32;
const readSnapshot = (store, key, now = Date.now()) => {
  const snapshot = store.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > CHAOXING_CACHE_TTL_MS;
  return { snapshot, stale };
};
const writeSnapshot = (store, key, data) => {
  store.set(key, data);
  while (store.size > CHAOXING_SNAPSHOT_MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === void 0) break;
    store.delete(oldest);
  }
};
const useTeacherChaoxingAnalytics = (options = {}) => {
  const coursesState = ref({
    status: "idle",
    data: null,
    error: null
  });
  const analyticsState = ref({
    status: "idle",
    data: null,
    error: null
  });
  const selectedCourseKey = ref("");
  const coursesSeq = ref(0);
  const analyticsSeq = ref(0);
  const lastSuccessfulSyncAt = ref("");
  const fromCache = ref(false);
  const snapshotStale = ref(false);
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const scopeKey = computed(
    () => buildTeacherScopedKey("chaoxing-courses", accountId.value, "all")
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const analyticsSnapshotKey = computed(() => {
    if (!canPersistTeacherState(accountId.value) || !selectedCourseKey.value) return "";
    return `${scopeKey.value}|${selectedCourseKey.value}`;
  });
  const courses = computed(
    () => coursesState.value.data?.courses ?? []
  );
  const channels = computed(
    () => coursesState.value.data?.channels ?? []
  );
  const selectedCourse = computed(
    () => courses.value.find((item) => item.key === selectedCourseKey.value) ?? null
  );
  const dimensions = computed(
    () => analyticsState.value.data?.dimensions ?? null
  );
  const monitorCount = computed(
    () => analyticsState.value.data?.monitorCount ?? null
  );
  const isCoursesLoading = computed(() => coursesState.value.status === "loading");
  const isCoursesError = computed(() => coursesState.value.status === "error");
  const coursesErrorKey = computed(
    () => coursesState.value.error ? teacherChaoxingErrorKey(coursesState.value.error.kind) : ""
  );
  const isAnalyticsLoading = computed(() => analyticsState.value.status === "loading");
  const isAnalyticsError = computed(() => analyticsState.value.status === "error");
  const analyticsErrorKey = computed(
    () => analyticsState.value.error ? teacherChaoxingErrorKey(analyticsState.value.error.kind) : ""
  );
  const syncStatus = computed(
    () => resolveTeacherSyncStatus({
      phase: coursesState.value.status,
      hasData: coursesState.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: coursesState.value.error?.kind ?? null
    })
  );
  const revalidateAnalytics = async (course, scope, account, key) => {
    const seq = ++analyticsSeq.value;
    analyticsState.value = {
      status: "loading",
      data: analyticsState.value.data,
      error: null
    };
    if (!chaoxingCourseQueryable(course)) {
      analyticsState.value = {
        status: "ready",
        data: {
          dimensions: normalizeChaoxingDimensions(null),
          monitorCount: null
        },
        error: null
      };
      return;
    }
    const params = { courseid: course.courseId, clazzid: course.classId, cpi: course.cpi };
    const [analyticsResult, monitorResult] = await Promise.all([
      fetchTeacherChaoxingAnalytics(params, { scope: account }),
      fetchTeacherChaoxingMonitor(params, { scope: account })
    ]);
    if (seq !== analyticsSeq.value || scope !== scopeKey.value) return;
    const monitorCount2 = monitorResult.status === "ready" && monitorResult.data ? asNumber(asRecord(monitorResult.data).count) ?? null : null;
    if (analyticsResult.status === "ready" && analyticsResult.data) {
      const data = {
        dimensions: normalizeChaoxingDimensions(analyticsResult.data),
        monitorCount: monitorCount2
      };
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (key) writeSnapshot(analyticsSnapshots, key, { syncedAt, data });
      analyticsState.value = { status: "ready", data, error: null };
      return;
    }
    if (analyticsResult.status === "empty") {
      analyticsState.value = {
        status: "empty",
        data: null,
        error: { kind: "empty", message: "" }
      };
      return;
    }
    analyticsState.value = {
      status: "error",
      data: analyticsState.value.data,
      error: analyticsResult.error
    };
  };
  const selectCourse = async (course, opts = {}) => {
    const keyChanged = selectedCourseKey.value !== course.key;
    selectedCourseKey.value = course.key;
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = analyticsSnapshotKey.value;
    if (keyChanged) {
      analyticsState.value = { status: "idle", data: null, error: null };
    }
    if (!opts.force && key) {
      const hit = readSnapshot(analyticsSnapshots, key);
      if (hit) {
        analyticsState.value = { status: "ready", data: hit.snapshot.data, error: null };
        if (!hit.stale) return;
      }
    }
    await revalidateAnalytics(course, scope, account, key);
  };
  const revalidateCourses = async (scope, account, key) => {
    const seq = ++coursesSeq.value;
    coursesState.value = {
      status: "loading",
      data: coursesState.value.data,
      error: null
    };
    const result = await fetchTeacherChaoxingCourses({ scope: account });
    if (seq !== coursesSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const data = normalizeChaoxingCoursesPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (data.courses.length === 0 && data.channels.length === 0) {
        coursesState.value = {
          status: "empty",
          data: null,
          error: { kind: "empty", message: "" }
        };
        return;
      }
      if (key) writeSnapshot(coursesSnapshots, key, { syncedAt, data });
      coursesState.value = { status: "ready", data, error: null };
      const still = data.courses.find((item) => item.key === selectedCourseKey.value);
      const first = still ?? data.courses.find(chaoxingCourseQueryable) ?? data.courses[0];
      if (first) await selectCourse(first);
      return;
    }
    if (result.status === "empty") {
      lastSuccessfulSyncAt.value = (/* @__PURE__ */ new Date()).toISOString();
      fromCache.value = false;
      snapshotStale.value = false;
      coursesState.value = {
        status: "empty",
        data: null,
        error: { kind: "empty", message: "" }
      };
      return;
    }
    coursesState.value = {
      status: "error",
      data: coursesState.value.data,
      error: result.error
    };
  };
  const applyCoursesSnapshot = (snapshot, stale) => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt;
    fromCache.value = true;
    snapshotStale.value = stale;
    const empty = snapshot.data.courses.length === 0 && snapshot.data.channels.length === 0;
    coursesState.value = empty ? { status: "empty", data: null, error: { kind: "empty", message: "" } } : { status: "ready", data: snapshot.data, error: null };
  };
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && key) {
      const hit = readSnapshot(coursesSnapshots, key);
      if (hit) {
        applyCoursesSnapshot(
          { syncedAt: hit.snapshot.syncedAt, data: hit.snapshot.data },
          hit.stale
        );
        if (coursesState.value.status === "ready" && !selectedCourse.value) {
          const first = courses.value.find(chaoxingCourseQueryable) ?? courses.value[0];
          if (first) await selectCourse(first);
        }
        if (!hit.stale) return;
      }
    }
    await revalidateCourses(scope, account, key);
  };
  const retry = () => load({ force: true });
  const retryAnalytics = async () => {
    const course = selectedCourse.value;
    if (!course) return;
    await selectCourse(course, { force: true });
  };
  return {
    accountId,
    scopeKey,
    coursesState,
    analyticsState,
    courses,
    channels,
    selectedCourse,
    selectedCourseKey,
    dimensions,
    monitorCount,
    isCoursesLoading,
    isCoursesError,
    coursesErrorKey,
    isAnalyticsLoading,
    isAnalyticsError,
    analyticsErrorKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    selectCourse,
    retry,
    retryAnalytics
  };
};
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-cx" };
const _hoisted_2 = ["aria-label", "disabled"];
const _hoisted_3 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_4 = {
  class: "tch-cx-courses -mx-4 px-4",
  "aria-label": "课程选择"
};
const _hoisted_5 = { class: "flex gap-2 overflow-x-auto pb-1 tch-cx-scroll" };
const _hoisted_6 = ["aria-pressed", "title", "onClick"];
const _hoisted_7 = { class: "flex items-center gap-1.5 min-w-0" };
const _hoisted_8 = { class: "text-xs font-bold truncate max-w-[10rem]" };
const _hoisted_9 = {
  key: 0,
  class: "tch-label-caption text-on-surface-variant mt-1 px-1"
};
const _hoisted_10 = {
  key: 0,
  class: "tch-label-caption text-on-surface-variant px-1"
};
const _hoisted_11 = { class: "grid grid-cols-4 gap-2" };
const _hoisted_12 = { class: "tch-cx-kpi" };
const _hoisted_13 = { class: "tch-label-micro text-on-surface-variant" };
const _hoisted_14 = { class: "tch-cx-kpi" };
const _hoisted_15 = { class: "tch-label-micro text-on-surface-variant" };
const _hoisted_16 = {
  key: 0,
  class: "tch-cx-kpi-hint"
};
const _hoisted_17 = { class: "tch-cx-kpi" };
const _hoisted_18 = { class: "tch-label-micro text-on-surface-variant" };
const _hoisted_19 = { class: "tch-cx-kpi" };
const _hoisted_20 = { class: "tch-label-micro text-on-surface-variant" };
const _hoisted_21 = {
  key: 0,
  class: "tch-cx-kpi-hint"
};
const _hoisted_22 = { class: "tch-cx-card p-4" };
const _hoisted_23 = { class: "flex items-center justify-between mb-3" };
const _hoisted_24 = { class: "flex items-center gap-2" };
const _hoisted_25 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_26 = { class: "tch-label-caption text-on-surface-variant mt-0.5" };
const _hoisted_27 = {
  key: 0,
  class: "material-symbols-outlined text-[18px] text-primary animate-spin",
  "aria-hidden": "true"
};
const _hoisted_28 = { class: "flex items-center gap-2 py-2" };
const _hoisted_29 = { class: "w-14 shrink-0 text-xs font-semibold text-on-surface" };
const _hoisted_30 = ["aria-valuenow"];
const _hoisted_31 = { class: "flex items-center gap-2 py-2" };
const _hoisted_32 = { class: "w-14 shrink-0 text-xs font-semibold text-on-surface" };
const _hoisted_33 = ["aria-valuenow"];
const _hoisted_34 = { class: "flex items-center gap-2 py-2" };
const _hoisted_35 = { class: "w-14 shrink-0 text-xs font-semibold text-on-surface" };
const _hoisted_36 = ["aria-valuenow"];
const _hoisted_37 = {
  key: 0,
  class: "tch-label-caption text-on-surface-variant mt-2 pt-2 border-t border-surface-muted"
};
const _hoisted_38 = {
  key: 1,
  class: "mt-2 flex items-center justify-between gap-2 p-2.5 rounded-lg bg-danger-soft"
};
const _hoisted_39 = { class: "text-xs text-danger font-semibold" };
const _hoisted_40 = { class: "tch-cx-card overflow-hidden" };
const _hoisted_41 = ["aria-expanded"];
const _hoisted_42 = { class: "flex items-center gap-2 min-w-0" };
const _hoisted_43 = { class: "text-sm font-bold text-on-surface truncate" };
const _hoisted_44 = { class: "flex items-center gap-1 text-on-surface-variant shrink-0" };
const _hoisted_45 = { class: "tch-label-caption" };
const _hoisted_46 = { class: "p-4 pt-1 bg-surface-canvas" };
const _hoisted_47 = { class: "flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-lowest tch-cx-empty-note" };
const _hoisted_48 = {
  class: "material-symbols-outlined text-[18px] text-outline",
  "aria-hidden": "true"
};
const _hoisted_49 = { class: "text-sm text-on-surface-variant" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherChaoxingAnalyticsView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      courses,
      channels,
      selectedCourse,
      selectedCourseKey,
      dimensions,
      monitorCount,
      isCoursesLoading,
      isCoursesError,
      coursesErrorKey,
      isAnalyticsLoading,
      isAnalyticsError,
      analyticsErrorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      selectCourse,
      retry,
      retryAnalytics
    } = useTeacherChaoxingAnalytics({
      accountId: () => resolveTeacherAccountId(auth.studentId)
    });
    const hasCourses = computed(() => courses.value.length > 0);
    const hasChannels = computed(() => channels.value.length > 0);
    const hasData = computed(() => hasCourses.value || hasChannels.value);
    const monitorOpen = ref(false);
    const toggleMonitor = () => {
      monitorOpen.value = !monitorOpen.value;
    };
    const onSelectCourse = async (course) => {
      if (course.key === selectedCourseKey.value) return;
      await selectCourse(course);
    };
    const roleLabel = (course) => {
      if (course.role === "1") return t("teacher.chaoxing.role.primary");
      if (course.role === "2") return t("teacher.chaoxing.role.assist");
      return "";
    };
    const courseMetaText = (course) => {
      const parts = [];
      if (course.className) parts.push(course.className);
      if (course.studentCount !== null) {
        parts.push(tf("teacher.chaoxing.students", { n: course.studentCount }));
      }
      return parts.join(" · ");
    };
    const signRate = computed(() => chaoxingSignRate(dimensions.value?.sign ?? null));
    const workRate = computed(() => chaoxingWorkRate(dimensions.value?.worknum ?? null));
    const workSubmit = computed(() => chaoxingWorkSubmit(dimensions.value?.worknum ?? null));
    const workTotal = computed(() => chaoxingWorkTotal(dimensions.value?.worknum ?? null));
    const workPending = computed(() => chaoxingWorkPending(dimensions.value?.worknum ?? null));
    const examCount = computed(() => chaoxingExamCount(dimensions.value?.examnum ?? null));
    const examAvg = computed(() => chaoxingExamAvgScore(dimensions.value?.examnum ?? null));
    const scoreAvg = computed(() => chaoxingScoreAvg(dimensions.value?.score ?? null));
    const pvTotal = computed(() => chaoxingPvTotal(dimensions.value?.pv ?? null));
    const weekActive = computed(() => chaoxingWeekActive(dimensions.value?.monitor ?? null));
    const percentText = (value) => value === null ? "—" : `${Math.round(value)}%`;
    const workKpiText = computed(() => {
      if (workSubmit.value === null || workTotal.value === null) return "—";
      return `${workSubmit.value}/${workTotal.value}`;
    });
    const workKpiHint = computed(
      () => workRate.value === null ? "" : tf("teacher.chaoxing.kpi.work.done", { v: Math.round(workRate.value) })
    );
    const examKpiHint = computed(
      () => examAvg.value === null ? "" : tf("teacher.chaoxing.kpi.exam.avg", { v: examAvg.value })
    );
    const pendingText = computed(
      () => workPending.value === null ? "—" : String(workPending.value)
    );
    const examCountText = computed(
      () => examCount.value === null ? "—" : String(examCount.value)
    );
    const barWidth = (percent) => `${(percent === null ? 0 : Math.min(100, percent)).toFixed(1)}%`;
    const extraSummary = computed(() => {
      const parts = [];
      if (scoreAvg.value !== null) {
        parts.push(tf("teacher.chaoxing.dim.score.avg", { v: scoreAvg.value }));
      }
      if (pvTotal.value !== null) {
        parts.push(tf("teacher.chaoxing.dim.pv.total", { n: pvTotal.value }));
      }
      if (weekActive.value !== null) {
        parts.push(tf("teacher.chaoxing.dim.monitor.week", { n: weekActive.value }));
      }
      return parts.join(" · ");
    });
    const monitorBadgeText = computed(() => {
      if (monitorCount.value === null) return "—";
      return tf("teacher.chaoxing.monitor.badge", { n: monitorCount.value });
    });
    const monitorHasFlagged = computed(
      () => monitorCount.value !== null && monitorCount.value > 0
    );
    const reload = async () => {
      await retry();
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.chaoxing.title"),
          icon: "monitoring",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest",
              "aria-label": unref(t)("teacher.chaoxing.action.refresh"),
              disabled: unref(isCoursesLoading),
              onClick: reload
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(isCoursesLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("main", _hoisted_3, [
          unref(isCoursesLoading) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("teacher.chaoxing.loading")
          }, null, 8, ["message"])) : unref(isCoursesError) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: unref(t)(unref(coursesErrorKey))
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "mt-3 text-primary font-semibold",
                onClick: reload
              }, toDisplayString(unref(t)("teacher.chaoxing.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.chaoxing.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_4, [
              createBaseVNode("div", _hoisted_5, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(courses), (course) => {
                  return openBlock(), createElementBlock("button", {
                    key: course.key,
                    type: "button",
                    class: normalizeClass(["tch-cx-course-pill shrink-0 text-left", { "tch-cx-course-pill--active": course.key === unref(selectedCourseKey) }]),
                    "aria-pressed": course.key === unref(selectedCourseKey),
                    title: course.courseName || unref(t)("teacher.chaoxing.course.untitled"),
                    onClick: ($event) => onSelectCourse(course)
                  }, [
                    createBaseVNode("span", _hoisted_7, [
                      createBaseVNode("span", {
                        class: normalizeClass(["w-1.5 h-1.5 rounded-full shrink-0", course.key === unref(selectedCourseKey) ? "bg-on-primary" : "bg-primary"])
                      }, null, 2),
                      createBaseVNode("span", _hoisted_8, toDisplayString(course.courseName || "—"), 1),
                      roleLabel(course) ? (openBlock(), createElementBlock("span", {
                        key: 0,
                        class: normalizeClass(["tch-cx-role", course.key === unref(selectedCourseKey) ? "tch-cx-role--active" : ""])
                      }, toDisplayString(roleLabel(course)), 3)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("span", {
                      class: normalizeClass(["tch-label-micro block mt-0.5 truncate", course.key === unref(selectedCourseKey) ? "text-on-primary" : "text-on-surface-variant"])
                    }, toDisplayString(courseMetaText(course) || "—"), 3)
                  ], 10, _hoisted_6);
                }), 128))
              ]),
              hasChannels.value ? (openBlock(), createElementBlock("p", _hoisted_9, toDisplayString(unref(tf)("teacher.chaoxing.channels", { n: unref(channels).length })), 1)) : createCommentVNode("", true)
            ]),
            unref(selectedCourse) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              !unref(chaoxingCourseQueryable)(unref(selectedCourse)) ? (openBlock(), createElementBlock("p", _hoisted_10, toDisplayString(unref(t)("teacher.chaoxing.course.notQueryable")), 1)) : createCommentVNode("", true),
              createBaseVNode("section", _hoisted_11, [
                createBaseVNode("div", _hoisted_12, [
                  createBaseVNode("span", _hoisted_13, toDisplayString(unref(t)("teacher.chaoxing.kpi.sign")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["tch-cx-kpi-num", signRate.value === null ? "text-on-surface-variant" : "text-success"])
                  }, toDisplayString(percentText(signRate.value)), 3)
                ]),
                createBaseVNode("div", _hoisted_14, [
                  createBaseVNode("span", _hoisted_15, toDisplayString(unref(t)("teacher.chaoxing.kpi.work")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["tch-cx-kpi-num", workKpiText.value === "—" ? "text-on-surface-variant" : "text-primary"])
                  }, toDisplayString(workKpiText.value), 3),
                  workKpiHint.value ? (openBlock(), createElementBlock("span", _hoisted_16, toDisplayString(workKpiHint.value), 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("span", _hoisted_18, toDisplayString(unref(t)("teacher.chaoxing.kpi.pending")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["tch-cx-kpi-num", workPending.value === null ? "text-on-surface-variant" : "text-course-amber"])
                  }, toDisplayString(pendingText.value), 3)
                ]),
                createBaseVNode("div", _hoisted_19, [
                  createBaseVNode("span", _hoisted_20, toDisplayString(unref(t)("teacher.chaoxing.kpi.exam")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["tch-cx-kpi-num", examCount.value === null ? "text-on-surface-variant" : "text-course-lake-blue"])
                  }, toDisplayString(examCountText.value), 3),
                  examKpiHint.value ? (openBlock(), createElementBlock("span", _hoisted_21, toDisplayString(examKpiHint.value), 1)) : createCommentVNode("", true)
                ])
              ]),
              createBaseVNode("section", _hoisted_22, [
                createBaseVNode("div", _hoisted_23, [
                  createBaseVNode("div", _hoisted_24, [
                    _cache[2] || (_cache[2] = createBaseVNode("div", { class: "w-7 h-7 rounded-lg bg-surface-highlight flex items-center justify-center text-primary" }, [
                      createBaseVNode("span", {
                        class: "material-symbols-outlined text-[18px]",
                        "aria-hidden": "true"
                      }, "monitoring")
                    ], -1)),
                    createBaseVNode("div", null, [
                      createBaseVNode("h2", _hoisted_25, toDisplayString(unref(t)("teacher.chaoxing.dim.title")), 1),
                      createBaseVNode("p", _hoisted_26, toDisplayString(unref(t)("teacher.chaoxing.dim.hint")), 1)
                    ])
                  ]),
                  unref(isAnalyticsLoading) ? (openBlock(), createElementBlock("span", _hoisted_27, "progress_activity")) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_28, [
                  createBaseVNode("span", _hoisted_29, toDisplayString(unref(t)("teacher.chaoxing.dim.work")), 1),
                  createBaseVNode("div", {
                    class: "flex-1 h-2 rounded-full bg-surface-muted overflow-hidden",
                    role: "progressbar",
                    "aria-valuenow": workRate.value ?? 0,
                    "aria-valuemin": "0",
                    "aria-valuemax": "100"
                  }, [
                    createBaseVNode("div", {
                      class: "h-full rounded-full bg-primary transition-all duration-700 ease-out",
                      style: normalizeStyle({ width: barWidth(workRate.value) })
                    }, null, 4)
                  ], 8, _hoisted_30),
                  createBaseVNode("span", {
                    class: normalizeClass(["w-14 shrink-0 text-right text-xs font-bold", workRate.value === null ? "text-on-surface-variant" : "text-primary"])
                  }, toDisplayString(workRate.value === null ? "—" : percentText(workRate.value)), 3)
                ]),
                createBaseVNode("div", _hoisted_31, [
                  createBaseVNode("span", _hoisted_32, toDisplayString(unref(t)("teacher.chaoxing.dim.sign")), 1),
                  createBaseVNode("div", {
                    class: "flex-1 h-2 rounded-full bg-surface-muted overflow-hidden",
                    role: "progressbar",
                    "aria-valuenow": signRate.value ?? 0,
                    "aria-valuemin": "0",
                    "aria-valuemax": "100"
                  }, [
                    createBaseVNode("div", {
                      class: "h-full rounded-full bg-success transition-all duration-700 ease-out",
                      style: normalizeStyle({ width: barWidth(signRate.value) })
                    }, null, 4)
                  ], 8, _hoisted_33),
                  createBaseVNode("span", {
                    class: normalizeClass(["w-14 shrink-0 text-right text-xs font-bold", signRate.value === null ? "text-on-surface-variant" : "text-success"])
                  }, toDisplayString(signRate.value === null ? "—" : percentText(signRate.value)), 3)
                ]),
                createBaseVNode("div", _hoisted_34, [
                  createBaseVNode("span", _hoisted_35, toDisplayString(unref(t)("teacher.chaoxing.dim.exam")), 1),
                  createBaseVNode("div", {
                    class: "flex-1 h-2 rounded-full bg-surface-muted overflow-hidden",
                    role: "progressbar",
                    "aria-valuenow": examAvg.value ?? 0,
                    "aria-valuemin": "0",
                    "aria-valuemax": "100"
                  }, [
                    createBaseVNode("div", {
                      class: "h-full rounded-full bg-course-lake-blue transition-all duration-700 ease-out",
                      style: normalizeStyle({ width: barWidth(examAvg.value) })
                    }, null, 4)
                  ], 8, _hoisted_36),
                  createBaseVNode("span", {
                    class: normalizeClass(["w-14 shrink-0 text-right text-xs font-bold", examAvg.value === null ? "text-on-surface-variant" : "text-course-lake-blue"])
                  }, toDisplayString(examAvg.value === null ? "—" : unref(tf)("teacher.chaoxing.dim.exam.avg", { v: examAvg.value })), 3)
                ]),
                extraSummary.value ? (openBlock(), createElementBlock("p", _hoisted_37, toDisplayString(extraSummary.value), 1)) : createCommentVNode("", true),
                unref(isAnalyticsError) ? (openBlock(), createElementBlock("div", _hoisted_38, [
                  createBaseVNode("span", _hoisted_39, toDisplayString(unref(t)(unref(analyticsErrorKey))), 1),
                  createBaseVNode("button", {
                    type: "button",
                    class: "text-xs font-bold text-danger shrink-0",
                    onClick: _cache[1] || (_cache[1] = //@ts-ignore
                    (...args) => unref(retryAnalytics) && unref(retryAnalytics)(...args))
                  }, toDisplayString(unref(t)("teacher.chaoxing.action.retry")), 1)
                ])) : createCommentVNode("", true)
              ]),
              createBaseVNode("section", _hoisted_40, [
                createBaseVNode("button", {
                  type: "button",
                  class: "w-full p-4 flex items-center justify-between active:bg-surface-canvas transition-colors",
                  "aria-expanded": monitorOpen.value,
                  onClick: toggleMonitor
                }, [
                  createBaseVNode("div", _hoisted_42, [
                    createBaseVNode("div", {
                      class: normalizeClass(["w-7 h-7 rounded-lg shrink-0 flex items-center justify-center", monitorHasFlagged.value ? "bg-danger-soft text-danger" : "bg-surface-highlight text-primary"])
                    }, [..._cache[3] || (_cache[3] = [
                      createBaseVNode("span", {
                        class: "material-symbols-outlined text-[18px]",
                        "aria-hidden": "true"
                      }, "emergency", -1)
                    ])], 2),
                    createBaseVNode("span", _hoisted_43, toDisplayString(unref(t)("teacher.chaoxing.monitor.title")), 1),
                    createBaseVNode("span", {
                      class: normalizeClass(["px-2 py-0.5 rounded-full tch-label-caption font-bold shrink-0", monitorHasFlagged.value ? "bg-danger-soft text-danger" : "bg-surface-muted text-on-surface-variant"])
                    }, toDisplayString(monitorBadgeText.value), 3)
                  ]),
                  createBaseVNode("div", _hoisted_44, [
                    createBaseVNode("span", _hoisted_45, toDisplayString(monitorOpen.value ? unref(t)("teacher.chaoxing.monitor.collapse") : unref(t)("teacher.chaoxing.monitor.expand")), 1),
                    createBaseVNode("span", {
                      class: normalizeClass(["material-symbols-outlined text-[18px] transition-transform duration-300", { "rotate-180": monitorOpen.value }]),
                      "aria-hidden": "true"
                    }, "expand_more", 2)
                  ])
                ], 8, _hoisted_41),
                createBaseVNode("div", {
                  class: normalizeClass(["tch-cx-collapse", { "tch-cx-collapse--open": monitorOpen.value }])
                }, [
                  createBaseVNode("div", _hoisted_46, [
                    createBaseVNode("div", _hoisted_47, [
                      createBaseVNode("span", _hoisted_48, toDisplayString(monitorHasFlagged.value ? "person_search" : "verified_user"), 1),
                      createBaseVNode("span", _hoisted_49, toDisplayString(monitorHasFlagged.value ? unref(t)("teacher.chaoxing.monitor.privacy") : unref(t)("teacher.chaoxing.monitor.empty")), 1)
                    ])
                  ])
                ], 2)
              ])
            ], 64)) : createCommentVNode("", true)
          ], 64)),
          createVNode(_sfc_main$2, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": unref(isCoursesError) ? unref(coursesErrorKey) : ""
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ])
      ]);
    };
  }
});
const TeacherChaoxingAnalyticsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b0e6c345"]]);
export {
  TeacherChaoxingAnalyticsView as default
};
