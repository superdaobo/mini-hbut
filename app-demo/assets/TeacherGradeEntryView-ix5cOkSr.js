import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, d as createCommentVNode, g as createTextVNode } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { T as TCard } from "./TCard-PWi6RV37.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, cp as fetchTeacherGradeEntry, ad as dedupeByStableKey, ae as asArray, af as asRecord, a9 as asString, ab as asNumber, aa as stripTeacherHtml, ac as buildStableKey, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherGradeEntryErrorKey = (kind) => `teacher.error.${kind}`;
const GRADE_ENTRY_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidGradeEntrySemester = (value) => GRADE_ENTRY_SEMESTER_PATTERN.test(value);
const resolveInitialGradeEntrySemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidGradeEntrySemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidGradeEntrySemester(stored)) return stored;
  return deriveSemesterByDate();
};
const normalizeGradeProgressItem = (value, index) => {
  const record = asRecord(value);
  const classId = asString(record.classId);
  const classNo = asString(record.classNo);
  const className = asString(record.className);
  const courseId = asString(record.courseId);
  return {
    key: buildStableKey([classId, courseId, classNo, index]),
    classId,
    courseId,
    classNo,
    className,
    confirmStatus: asString(record.confirmStatus),
    entryStartAt: asString(record.entryStartAt),
    entryEndAt: asString(record.entryEndAt),
    shouldEnter: asNumber(record.shouldEnter) ?? null,
    mustEnter: asNumber(record.mustEnter) ?? null,
    processId: asString(record.processId)
  };
};
const normalizeGradeTeachingClass = (value, index) => {
  const record = asRecord(value);
  const classId = asString(record.classId);
  return {
    key: buildStableKey([classId, asString(record.courseName), index]),
    courseName: stripTeacherHtml(record.courseName),
    classId,
    classWeek: asString(record.classWeek),
    studentCount: asNumber(record.studentCount) ?? null,
    credits: asNumber(record.credits) ?? null,
    publishStatus: asString(record.publishStatus),
    classType: asString(record.classType)
  };
};
const normalizeGradeEntryPayload = (raw) => {
  const payload = asRecord(raw);
  return {
    progress: dedupeByStableKey(
      asArray(payload.progress).map(normalizeGradeProgressItem),
      (item) => item.key
    ),
    teachingClasses: dedupeByStableKey(
      asArray(payload.teachingClasses).map(normalizeGradeTeachingClass),
      (item) => item.key
    )
  };
};
const linkGradeEntryData = (data) => {
  const classIndex = /* @__PURE__ */ new Map();
  for (const cls of data.teachingClasses) {
    const classId = cls.classId.trim();
    if (classId && !classIndex.has(classId)) classIndex.set(classId, cls);
  }
  return data.progress.map((item) => {
    const classId = item.classId.trim();
    return { item, linkedClass: classId ? classIndex.get(classId) ?? null : null };
  });
};
const unmatchedTeachingClasses = (data) => {
  const used = new Set(data.progress.map((item) => item.classId.trim()).filter(Boolean));
  return data.teachingClasses.filter((cls) => cls.classId.trim() && !used.has(cls.classId.trim()));
};
const entryCounts = (item) => {
  const should = item.shouldEnter;
  const must = item.mustEnter;
  const total = should !== null && should > 0 ? should : must !== null && must > 0 ? must : null;
  if (total === null || total <= 0) return null;
  const entered = total === should ? must ?? 0 : should ?? 0;
  return { entered, total };
};
const entryRingPercent = (item) => {
  const counts = entryCounts(item);
  if (!counts) return null;
  const raw = counts.entered / counts.total * 100;
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
};
const entryProgressText = (item) => {
  const counts = entryCounts(item);
  return counts ? `${counts.entered}/${counts.total}` : "—";
};
const publishBadgeTone = (publishStatus) => publishStatus.trim() === "1" ? "published" : "neutral";
const confirmBadgeTone = (confirmStatus) => confirmStatus.trim() === "1" ? "confirmed" : "neutral";
const entryWindowText = (item) => {
  const parts = [];
  if (item.entryStartAt) parts.push(item.entryStartAt);
  if (item.entryEndAt) parts.push(item.entryEndAt);
  return parts.join(" ~ ");
};
const totalShouldEnter = (data) => {
  const values = data.progress.map((item) => item.shouldEnter).filter((v) => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0);
};
const totalMustEnter = (data) => {
  const values = data.progress.map((item) => item.mustEnter).filter((v) => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0);
};
const completedProgressCount = (data) => data.progress.filter((item) => entryRingPercent(item) === 100).length;
const publishedClassCount = (data) => data.teachingClasses.filter((cls) => publishBadgeTone(cls.publishStatus) === "published").length;
const latestEntryDeadline = (data) => {
  let best = "";
  for (const item of data.progress) {
    if (!item.entryEndAt) continue;
    if (!best || item.entryEndAt > best) best = item.entryEndAt;
  }
  return best;
};
const GRADE_ENTRY_CACHE_TTL_MS = 5 * 60 * 1e3;
const gradeEntrySnapshots = /* @__PURE__ */ new Map();
const GRADE_ENTRY_SNAPSHOT_MAX_ENTRIES = 32;
const readGradeEntrySnapshot = (key, now = Date.now()) => {
  const snapshot = gradeEntrySnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > GRADE_ENTRY_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeGradeEntrySnapshot = (key, data, syncedAt) => {
  gradeEntrySnapshots.set(key, { syncedAt, data });
  while (gradeEntrySnapshots.size > GRADE_ENTRY_SNAPSHOT_MAX_ENTRIES) {
    const oldest = gradeEntrySnapshots.keys().next().value;
    if (oldest === void 0) break;
    gradeEntrySnapshots.delete(oldest);
  }
};
const gradeEntryEmptyError = () => ({ kind: "empty", message: "" });
const useTeacherGradeEntry = (options = {}) => {
  const semester = ref(resolveInitialGradeEntrySemester(options.initialSemester));
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
    () => buildTeacherScopedKey("gradeEntry", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const data = computed(() => state.value.data);
  const progress = computed(() => state.value.data?.progress ?? []);
  const teachingClasses = computed(
    () => state.value.data?.teachingClasses ?? []
  );
  const links = computed(
    () => linkGradeEntryData(state.value.data ?? { progress: [], teachingClasses: [] })
  );
  const orphanClasses = computed(
    () => unmatchedTeachingClasses(state.value.data ?? { progress: [], teachingClasses: [] })
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherGradeEntryErrorKey(state.value.error.kind) : ""
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
    const empty = snapshot.data.progress.length === 0 && snapshot.data.teachingClasses.length === 0;
    state.value = empty ? { status: "empty", data: null, error: gradeEntryEmptyError() } : { status: "ready", data: snapshot.data, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherGradeEntry(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const normalized = normalizeGradeEntryPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (normalized.progress.length === 0 && normalized.teachingClasses.length === 0) {
        state.value = { status: "empty", data: null, error: gradeEntryEmptyError() };
        return;
      }
      if (key) writeGradeEntrySnapshot(key, normalized, syncedAt);
      state.value = { status: "ready", data: normalized, error: null };
      return;
    }
    if (result.status === "empty") {
      lastSuccessfulSyncAt.value = (/* @__PURE__ */ new Date()).toISOString();
      fromCache.value = false;
      snapshotStale.value = false;
      state.value = { status: "empty", data: null, error: gradeEntryEmptyError() };
      return;
    }
    state.value = { status: "error", data: state.value.data, error: result.error };
  };
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && key) {
      const snapshot = readGradeEntrySnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidGradeEntrySemester(next) || next === semester.value) return;
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
    data,
    progress,
    teachingClasses,
    links,
    orphanClasses,
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
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-ge" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-ge-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = {
  class: "tch-ge-card p-4",
  "aria-live": "polite"
};
const _hoisted_8 = { class: "flex items-center gap-4" };
const _hoisted_9 = ["aria-label"];
const _hoisted_10 = {
  class: "w-11 h-11 -rotate-90",
  viewBox: "0 0 44 44"
};
const _hoisted_11 = ["stroke-dashoffset"];
const _hoisted_12 = { class: "flex-1 min-w-0" };
const _hoisted_13 = { class: "flex items-center gap-1.5" };
const _hoisted_14 = { class: "tch-ge-label-caption text-on-surface-variant" };
const _hoisted_15 = { class: "tch-ge-title truncate mt-0.5" };
const _hoisted_16 = {
  key: 0,
  class: "tch-ge-meta text-on-surface-variant mt-1 truncate"
};
const _hoisted_17 = { class: "grid grid-cols-3 gap-2 mt-3 pt-3 rounded-lg bg-surface-muted/60 p-2.5 text-center" };
const _hoisted_18 = { class: "min-w-0" };
const _hoisted_19 = { class: "tch-ge-label-micro text-outline block truncate" };
const _hoisted_20 = { class: "tch-ge-title block mt-0.5" };
const _hoisted_21 = { class: "min-w-0" };
const _hoisted_22 = { class: "tch-ge-label-micro text-course-lake-blue block truncate" };
const _hoisted_23 = { class: "tch-ge-title text-course-lake-blue block mt-0.5" };
const _hoisted_24 = { class: "min-w-0" };
const _hoisted_25 = { class: "tch-ge-label-micro text-outline block truncate" };
const _hoisted_26 = { class: "tch-ge-title block mt-0.5" };
const _hoisted_27 = { class: "flex flex-col gap-2" };
const _hoisted_28 = { class: "flex items-center justify-between px-1" };
const _hoisted_29 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_30 = { class: "tch-ge-label-caption text-on-surface-variant" };
const _hoisted_31 = { class: "flex items-center justify-between gap-2" };
const _hoisted_32 = ["aria-label"];
const _hoisted_33 = {
  class: "w-11 h-11 -rotate-90",
  viewBox: "0 0 44 44"
};
const _hoisted_34 = ["stroke-dashoffset"];
const _hoisted_35 = { class: "flex-1 min-w-0" };
const _hoisted_36 = { class: "tch-ge-title truncate" };
const _hoisted_37 = {
  key: 0,
  class: "tch-ge-meta text-on-surface-variant mt-1 truncate"
};
const _hoisted_38 = {
  key: 1,
  class: "tch-ge-meta text-outline mt-0.5 truncate"
};
const _hoisted_39 = { class: "shrink-0 flex flex-col items-end gap-1" };
const _hoisted_40 = {
  key: 0,
  class: "flex flex-col gap-2"
};
const _hoisted_41 = { class: "flex items-center justify-between px-1" };
const _hoisted_42 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_43 = { class: "tch-ge-label-caption text-on-surface-variant" };
const _hoisted_44 = { class: "flex items-center justify-between gap-2" };
const _hoisted_45 = { class: "min-w-0" };
const _hoisted_46 = { class: "tch-ge-title truncate" };
const _hoisted_47 = {
  key: 0,
  class: "tch-ge-meta text-on-surface-variant mt-1 truncate"
};
const RING_R = 18;
const RING_C = 113.1;
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherGradeEntryView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      progress,
      teachingClasses,
      links,
      orphanClasses,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherGradeEntry({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => progress.value.length > 0 || teachingClasses.value.length > 0);
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
    const summary = computed(() => {
      const data = {
        progress: progress.value,
        teachingClasses: teachingClasses.value
      };
      return {
        shouldTotal: totalShouldEnter(data),
        enteredTotal: totalMustEnter(data),
        completedCount: completedProgressCount(data),
        publishedCount: publishedClassCount(data),
        deadline: latestEntryDeadline(data),
        progressTotal: data.progress.length,
        classesTotal: data.teachingClasses.length
      };
    });
    const ringOffset = (percent) => percent === null ? RING_C : RING_C * (1 - percent / 100);
    const ringClass = (percent) => {
      if (percent === null) return "text-outline-variant";
      if (percent >= 100) return "text-course-lake-blue";
      if (percent <= 0) return "text-danger";
      return "text-course-lake-blue";
    };
    const ringCenterClass = (percent) => {
      if (percent === null) return "text-outline";
      if (percent <= 0) return "text-danger";
      return "text-course-lake-blue";
    };
    const progressTitle = (link) => link.linkedClass?.courseName || link.item.className || link.item.classNo || "—";
    const progressMeta = (link) => {
      const parts = [];
      const counts = entryCounts(link.item);
      if (counts) {
        parts.push(
          tf("teacher.gradeEntry.progress.count", {
            entered: counts.entered,
            total: counts.total
          })
        );
      }
      if (link.item.className) parts.push(link.item.className);
      if (link.item.classNo) parts.push(link.item.classNo);
      return parts.join(" · ");
    };
    const ringCenterText = (link) => entryProgressText(link.item);
    const progressWindow = (link) => entryWindowText(link.item);
    const publishBadgeText = (status) => status.trim() === "1" ? t("teacher.gradeEntry.badge.published") : status.trim() === "" ? t("teacher.gradeEntry.badge.unpublished") : status.trim();
    const publishBadgeClass = (status) => publishBadgeTone(status) === "published" ? "tch-ge-badge tch-ge-badge--blue" : "tch-ge-badge tch-ge-badge--neutral";
    const confirmBadgeText = (status) => status.trim() === "1" ? t("teacher.gradeEntry.badge.confirmed") : status.trim() || "—";
    const confirmBadgeClass = (status) => confirmBadgeTone(status) === "confirmed" ? "tch-ge-badge tch-ge-badge--lake" : "tch-ge-badge tch-ge-badge--neutral";
    const teachingClassMeta = (item) => {
      const parts = [];
      if (item.classWeek) parts.push(item.classWeek);
      if (item.studentCount !== null) {
        parts.push(tf("teacher.gradeEntry.class.students", { n: item.studentCount }));
      }
      if (item.credits !== null) {
        parts.push(tf("teacher.gradeEntry.class.credits", { n: item.credits }));
      }
      return parts.join(" · ");
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.gradeEntry.title"),
          icon: "assignment_turned_in",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-ge-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-ge-semester-pill",
                title: unref(t)("teacher.gradeEntry.semester.label")
              }, [
                createBaseVNode("span", _hoisted_3, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_2),
              createBaseVNode("div", {
                class: "tch-ge-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-ge-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-grade-entry-semester",
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
              "aria-label": unref(t)("teacher.gradeEntry.action.refresh"),
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
            message: unref(t)("teacher.gradeEntry.loading")
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
              }, toDisplayString(unref(t)("teacher.gradeEntry.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.gradeEntry.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_7, [
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("div", {
                  class: "relative w-11 h-11 shrink-0",
                  role: "img",
                  "aria-label": summary.value.progressTotal > 0 ? `${summary.value.completedCount}/${summary.value.progressTotal}` : unref(t)("teacher.gradeEntry.hero.empty")
                }, [
                  (openBlock(), createElementBlock("svg", _hoisted_10, [
                    createBaseVNode("circle", {
                      class: "tch-ge-ring-track",
                      cx: "22",
                      cy: "22",
                      r: RING_R,
                      fill: "none",
                      "stroke-width": "3.5"
                    }),
                    summary.value.progressTotal > 0 ? (openBlock(), createElementBlock("circle", {
                      key: 0,
                      class: "text-course-lake-blue tch-ge-ring-arc",
                      cx: "22",
                      cy: "22",
                      r: RING_R,
                      fill: "none",
                      stroke: "currentColor",
                      "stroke-dasharray": RING_C,
                      "stroke-linecap": "round",
                      "stroke-width": "3.5",
                      "stroke-dashoffset": ringOffset(summary.value.progressTotal > 0 ? Math.round(summary.value.completedCount / summary.value.progressTotal * 100) : null)
                    }, null, 8, _hoisted_11)) : createCommentVNode("", true)
                  ])),
                  createBaseVNode("span", {
                    class: normalizeClass(["absolute inset-0 flex items-center justify-center tch-ge-ring-center", summary.value.progressTotal > 0 ? "text-course-lake-blue" : "text-outline"]),
                    "aria-hidden": "true"
                  }, toDisplayString(summary.value.progressTotal > 0 ? `${summary.value.completedCount}/${summary.value.progressTotal}` : "—"), 3)
                ], 8, _hoisted_9),
                createBaseVNode("div", _hoisted_12, [
                  createBaseVNode("div", _hoisted_13, [
                    _cache[2] || (_cache[2] = createBaseVNode("span", { class: "w-1.5 h-1.5 rounded-full bg-success" }, null, -1)),
                    createBaseVNode("span", _hoisted_14, toDisplayString(unref(semester)), 1)
                  ]),
                  createBaseVNode("p", _hoisted_15, toDisplayString(unref(t)("teacher.gradeEntry.hero.title")), 1),
                  summary.value.deadline ? (openBlock(), createElementBlock("p", _hoisted_16, toDisplayString(unref(tf)("teacher.gradeEntry.hero.deadline", { time: summary.value.deadline })), 1)) : createCommentVNode("", true)
                ])
              ]),
              createBaseVNode("div", _hoisted_17, [
                createBaseVNode("div", _hoisted_18, [
                  createBaseVNode("span", _hoisted_19, toDisplayString(unref(t)("teacher.gradeEntry.hero.shouldTotal")), 1),
                  createBaseVNode("span", _hoisted_20, toDisplayString(summary.value.shouldTotal ?? "—"), 1)
                ]),
                createBaseVNode("div", _hoisted_21, [
                  createBaseVNode("span", _hoisted_22, toDisplayString(unref(t)("teacher.gradeEntry.hero.enteredTotal")), 1),
                  createBaseVNode("span", _hoisted_23, toDisplayString(summary.value.enteredTotal ?? "—"), 1)
                ]),
                createBaseVNode("div", _hoisted_24, [
                  createBaseVNode("span", _hoisted_25, toDisplayString(unref(t)("teacher.gradeEntry.hero.publishedTotal")), 1),
                  createBaseVNode("span", _hoisted_26, toDisplayString(summary.value.publishedCount) + "/" + toDisplayString(summary.value.classesTotal), 1)
                ])
              ])
            ]),
            createBaseVNode("section", _hoisted_27, [
              createBaseVNode("div", _hoisted_28, [
                createBaseVNode("h2", _hoisted_29, toDisplayString(unref(t)("teacher.gradeEntry.progress.title")), 1),
                createBaseVNode("span", _hoisted_30, toDisplayString(unref(tf)("teacher.gradeEntry.progress.count.label", { n: summary.value.progressTotal })), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(links), (link) => {
                return openBlock(), createBlock(unref(TCard), {
                  key: link.item.key,
                  compact: ""
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_31, [
                      createBaseVNode("div", {
                        class: "relative w-11 h-11 shrink-0",
                        role: "img",
                        "aria-label": unref(entryProgressText)(link.item)
                      }, [
                        (openBlock(), createElementBlock("svg", _hoisted_33, [
                          createBaseVNode("circle", {
                            class: "tch-ge-ring-track",
                            cx: "22",
                            cy: "22",
                            r: RING_R,
                            fill: "none",
                            "stroke-width": "3.5"
                          }),
                          unref(entryRingPercent)(link.item) !== null ? (openBlock(), createElementBlock("circle", {
                            key: 0,
                            class: normalizeClass(["tch-ge-ring-arc", ringClass(unref(entryRingPercent)(link.item))]),
                            cx: "22",
                            cy: "22",
                            r: RING_R,
                            fill: "none",
                            stroke: "currentColor",
                            "stroke-dasharray": RING_C,
                            "stroke-linecap": "round",
                            "stroke-width": "3.5",
                            "stroke-dashoffset": ringOffset(unref(entryRingPercent)(link.item))
                          }, null, 10, _hoisted_34)) : createCommentVNode("", true)
                        ])),
                        createBaseVNode("span", {
                          class: normalizeClass(["absolute inset-0 flex items-center justify-center tch-ge-ring-center", ringCenterClass(unref(entryRingPercent)(link.item))]),
                          "aria-hidden": "true"
                        }, toDisplayString(ringCenterText(link)), 3)
                      ], 8, _hoisted_32),
                      createBaseVNode("div", _hoisted_35, [
                        createBaseVNode("p", _hoisted_36, toDisplayString(progressTitle(link)), 1),
                        progressMeta(link) ? (openBlock(), createElementBlock("p", _hoisted_37, toDisplayString(progressMeta(link)), 1)) : createCommentVNode("", true),
                        progressWindow(link) ? (openBlock(), createElementBlock("p", _hoisted_38, toDisplayString(progressWindow(link)), 1)) : createCommentVNode("", true)
                      ]),
                      createBaseVNode("div", _hoisted_39, [
                        createBaseVNode("span", {
                          class: normalizeClass(publishBadgeClass(link.linkedClass?.publishStatus ?? ""))
                        }, [
                          _cache[3] || (_cache[3] = createBaseVNode("span", { class: "tch-ge-badge-dot" }, null, -1)),
                          createTextVNode(toDisplayString(publishBadgeText(link.linkedClass?.publishStatus ?? "")), 1)
                        ], 2),
                        link.item.confirmStatus ? (openBlock(), createElementBlock("span", {
                          key: 0,
                          class: normalizeClass(confirmBadgeClass(link.item.confirmStatus))
                        }, toDisplayString(confirmBadgeText(link.item.confirmStatus)), 3)) : createCommentVNode("", true)
                      ])
                    ])
                  ]),
                  _: 2
                }, 1024);
              }), 128))
            ]),
            unref(orphanClasses).length > 0 ? (openBlock(), createElementBlock("section", _hoisted_40, [
              createBaseVNode("div", _hoisted_41, [
                createBaseVNode("h2", _hoisted_42, toDisplayString(unref(t)("teacher.gradeEntry.classes.title")), 1),
                createBaseVNode("span", _hoisted_43, toDisplayString(unref(tf)("teacher.gradeEntry.classes.count", { n: unref(orphanClasses).length })), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(orphanClasses), (item) => {
                return openBlock(), createBlock(unref(TCard), {
                  key: item.key,
                  compact: ""
                }, {
                  default: withCtx(() => [
                    createBaseVNode("div", _hoisted_44, [
                      createBaseVNode("div", _hoisted_45, [
                        createBaseVNode("p", _hoisted_46, toDisplayString(item.courseName || item.classId || "—"), 1),
                        teachingClassMeta(item) ? (openBlock(), createElementBlock("p", _hoisted_47, toDisplayString(teachingClassMeta(item)), 1)) : createCommentVNode("", true)
                      ]),
                      createBaseVNode("span", {
                        class: normalizeClass(publishBadgeClass(item.publishStatus))
                      }, [
                        _cache[4] || (_cache[4] = createBaseVNode("span", { class: "tch-ge-badge-dot" }, null, -1)),
                        createTextVNode(toDisplayString(publishBadgeText(item.publishStatus)), 1)
                      ], 2)
                    ])
                  ]),
                  _: 2
                }, 1024);
              }), 128))
            ])) : createCommentVNode("", true)
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
const TeacherGradeEntryView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-40a27d63"]]);
export {
  TeacherGradeEntryView as default
};
