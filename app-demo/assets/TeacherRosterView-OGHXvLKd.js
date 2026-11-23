import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, p as onBeforeUnmount, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, N as vModelText, d as createCommentVNode, g as createTextVNode } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a4 as normalizeSemester, co as fetchTeacherRosterByClass, cp as fetchTeacherGradeEntry, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, cq as fetchTeacherRoster, ad as dedupeByStableKey, a7 as canPersistTeacherState, a8 as fetchTeacherScheduleLists, ae as asArray, a9 as asString, ab as asNumber, af as asRecord, aa as stripTeacherHtml, ac as buildStableKey, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherRosterErrorKey = (kind) => `teacher.error.${kind}`;
const ROSTER_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidRosterSemester = (value) => ROSTER_SEMESTER_PATTERN.test(value);
const resolveInitialRosterSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidRosterSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidRosterSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const ROSTER_PAGE_SIZE = 20;
const cleanRosterText = (value) => stripTeacherHtml(value);
const normalizeRosterClass = (value, index) => {
  const record = asRecord(value);
  const classNo = asString(record.classNo ?? record.bjbh);
  const rosterId = asString(record.bjid ?? record.id) || classNo;
  const className = cleanRosterText(record.className ?? record.bjmc);
  return {
    key: buildStableKey([rosterId, classNo, className, index]),
    rosterId,
    classNo,
    className,
    studentCount: asNumber(record.studentCount ?? record.bjrs) ?? null,
    departmentName: cleanRosterText(record.departmentName ?? record.yxmc),
    majorName: cleanRosterText(record.majorName ?? record.zymc),
    enrollYear: asString(record.enrollYear ?? record.rxnf)
  };
};
const normalizeRosterStudent = (value, index) => {
  const record = asRecord(value);
  const studentId = asString(record.studentId ?? record.xh);
  return {
    key: buildStableKey([studentId, asString(record.classId ?? record.bjdm), index]),
    studentId,
    name: stripTeacherHtml(record.name ?? record.xm),
    classId: asString(record.classId ?? record.bjdm),
    className: stripTeacherHtml(record.className ?? record.bjmc),
    majorName: stripTeacherHtml(record.majorName ?? record.zymc),
    departmentId: asString(record.departmentId ?? record.yxdm),
    grade: asString(record.grade ?? record.sznj)
  };
};
const normalizeRosterPayload = (raw) => {
  const payload = asRecord(raw);
  const students = dedupeByStableKey(
    asArray(payload.students).map(normalizeRosterStudent),
    (item) => item.key
  );
  return {
    students,
    total: asNumber(payload.total) ?? students.length,
    page: asNumber(payload.page) ?? 1,
    pageSize: asNumber(payload.pageSize) ?? ROSTER_PAGE_SIZE,
    classId: asString(payload.classId)
  };
};
const normalizeRosterClassList = (raw) => dedupeByStableKey(
  asArray(asRecord(raw).classes).map(normalizeRosterClass),
  (item) => item.key
);
const ROSTER_CLASSES_CACHE_TTL_MS = 5 * 60 * 1e3;
const rosterClassesSnapshots = /* @__PURE__ */ new Map();
const ROSTER_CLASSES_SNAPSHOT_MAX_ENTRIES = 32;
const readClassesSnapshot = (key, now = Date.now()) => {
  const snapshot = rosterClassesSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > ROSTER_CLASSES_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeClassesSnapshot = (key, data, syncedAt) => {
  rosterClassesSnapshots.set(key, { syncedAt, data });
  while (rosterClassesSnapshots.size > ROSTER_CLASSES_SNAPSHOT_MAX_ENTRIES) {
    const oldest = rosterClassesSnapshots.keys().next().value;
    if (oldest === void 0) break;
    rosterClassesSnapshots.delete(oldest);
  }
};
const rosterEmptyError = () => ({ kind: "empty", message: "" });
const useTeacherRoster = (options = {}) => {
  const semester = ref(resolveInitialRosterSemester(options.initialSemester));
  const classesState = ref({
    status: "idle",
    data: null,
    error: null
  });
  const classesSeq = ref(0);
  const lastSuccessfulSyncAt = ref("");
  const fromCache = ref(false);
  const snapshotStale = ref(false);
  const rosterState = ref({
    status: "idle",
    data: null,
    error: null
  });
  const rosterSeq = ref(0);
  const selectedClassId = ref("");
  const keyword = ref("");
  const teachingClasses = ref([]);
  const teachingClassesLoading = ref(false);
  const selectedJxbid = ref("");
  const loadTeachingClasses = async () => {
    teachingClassesLoading.value = true;
    try {
      const state = await fetchTeacherGradeEntry(semester.value || void 0);
      const payload = state.data || {};
      const list = Array.isArray(payload.teachingClasses) ? payload.teachingClasses : [];
      teachingClasses.value = list.map((item) => ({
        classId: String(item.classId || "").trim(),
        courseName: String(item.courseName || "").trim(),
        studentCount: typeof item.studentCount === "number" ? item.studentCount : null
      })).filter((item) => item.classId);
    } catch {
      teachingClasses.value = [];
    } finally {
      teachingClassesLoading.value = false;
    }
  };
  const selectTeachingClass = async (jxbid) => {
    const next = jxbid.trim();
    selectedJxbid.value = next;
    if (!next) {
      rosterState.value = { status: "ready", data: [], error: null };
      total.value = 0;
      return;
    }
    rosterState.value = { status: "loading", data: [], error: null };
    try {
      const state = await fetchTeacherRosterByClass({ jxbid: next, page: 1, pageSize: ROSTER_PAGE_SIZE });
      const payload = state.data || {};
      const students2 = Array.isArray(payload.students) ? payload.students : [];
      rosterState.value = {
        status: "ready",
        error: null,
        data: students2.map((item, index) => ({
          key: String(item.studentId || index),
          studentId: String(item.studentId || ""),
          name: String(item.name || ""),
          classId: String(item.classId || ""),
          className: String(item.className || ""),
          majorName: String(item.majorName || ""),
          departmentId: String(item.departmentName || ""),
          grade: String(item.grade || ""),
          courseName: String(item.courseName || ""),
          weeks: Array.isArray(item.weeks) ? item.weeks : [],
          recordedWeeks: typeof item.recordedWeeks === "number" ? item.recordedWeeks : 0
        }))
      };
      total.value = typeof payload.total === "number" ? payload.total : students2.length;
    } catch (err) {
      rosterState.value = {
        status: "error",
        data: [],
        error: { kind: "unknown", message: err instanceof Error ? err.message : String(err) }
      };
    }
  };
  const total = ref(-1);
  const hasMore = ref(false);
  const lastLoadedPage = ref(0);
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const scopeKey = computed(
    () => buildTeacherScopedKey("roster", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const classes = computed(() => classesState.value.data ?? []);
  const students = computed(() => rosterState.value.data ?? []);
  const selectedClass = computed(
    () => classes.value.find((item) => item.rosterId === selectedClassId.value) ?? null
  );
  const loadedCount = computed(() => students.value.length);
  const classesLoading = computed(() => classesState.value.status === "loading");
  const classesError = computed(() => classesState.value.status === "error");
  const classesErrorKey = computed(
    () => classesState.value.error ? teacherRosterErrorKey(classesState.value.error.kind) : ""
  );
  const classesEmpty = computed(
    () => classesState.value.status === "empty" || classes.value.length === 0
  );
  const rosterLoading = computed(() => rosterState.value.status === "loading");
  const rosterError = computed(() => rosterState.value.status === "error");
  const rosterReady = computed(() => rosterState.value.status === "ready");
  const rosterErrorKey = computed(
    () => rosterState.value.error ? teacherRosterErrorKey(rosterState.value.error.kind) : ""
  );
  const hasStudents = computed(() => students.value.length > 0);
  const syncStatus = computed(
    () => resolveTeacherSyncStatus({
      phase: classesState.value.status,
      hasData: classesState.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: classesState.value.error?.kind ?? null
    })
  );
  const resetRoster = () => {
    rosterSeq.value += 1;
    rosterState.value = { status: "idle", data: null, error: null };
    total.value = -1;
    hasMore.value = false;
    lastLoadedPage.value = 0;
  };
  const fetchRosterPage = async (page) => {
    const kw = keyword.value.trim();
    if (!kw) return;
    const seq = ++rosterSeq.value;
    const scope = scopeKey.value;
    const account = accountId.value;
    const term = semester.value;
    rosterState.value = {
      status: "loading",
      data: rosterState.value.data,
      error: null
    };
    const result = await fetchTeacherRoster(
      { bjid: "", page, pageSize: ROSTER_PAGE_SIZE, keyword: kw },
      { scope: account }
    );
    if (seq !== rosterSeq.value) return;
    if (scope !== scopeKey.value || term !== semester.value) return;
    if (kw !== keyword.value.trim()) return;
    if (result.status === "ready" && result.data) {
      const parsed = normalizeRosterPayload(result.data);
      total.value = parsed.total;
      lastLoadedPage.value = parsed.page;
      const merged = page > 1 ? dedupeByStableKey([...rosterState.value.data ?? [], ...parsed.students], (item) => item.key) : parsed.students;
      hasMore.value = merged.length < parsed.total;
      rosterState.value = merged.length === 0 ? { status: "empty", data: null, error: rosterEmptyError() } : { status: "ready", data: merged, error: null };
      return;
    }
    if (result.status === "empty") {
      total.value = page > 1 ? total.value : 0;
      lastLoadedPage.value = page;
      const previous = page > 1 ? rosterState.value.data ?? [] : [];
      hasMore.value = previous.length < Math.max(total.value, 0);
      rosterState.value = previous.length === 0 ? { status: "empty", data: null, error: rosterEmptyError() } : { status: "ready", data: previous, error: null };
      return;
    }
    rosterState.value = { status: "error", data: rosterState.value.data, error: result.error };
  };
  const selectClass = async (rosterId) => {
    const next = rosterId.trim();
    if (!next) {
      selectedClassId.value = "";
      resetRoster();
      return;
    }
    if (next === selectedClassId.value) return;
    selectedClassId.value = next;
    resetRoster();
    await fetchRosterPage(1);
  };
  const setKeyword = async (value) => {
    const next = value.trim();
    if (next === keyword.value) return;
    keyword.value = next;
    if (!selectedClassId.value.trim()) return;
    resetRoster();
    await fetchRosterPage(1);
  };
  const loadMore = async () => {
    if (!selectedClassId.value.trim()) return;
    if (!hasMore.value || rosterLoading.value) return;
    await fetchRosterPage(lastLoadedPage.value + 1);
  };
  const retryRoster = async () => {
    if (!selectedClassId.value.trim()) return;
    if (rosterState.value.data && rosterState.value.data.length > 0) {
      await fetchRosterPage(lastLoadedPage.value + 1);
      return;
    }
    await fetchRosterPage(1);
  };
  const applyClassesSnapshot = (snapshot, stale) => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt;
    fromCache.value = true;
    snapshotStale.value = stale;
    classesState.value = snapshot.data.length === 0 ? { status: "empty", data: null, error: rosterEmptyError() } : { status: "ready", data: snapshot.data, error: null };
  };
  const revalidateClasses = async (account, key) => {
    const seq = ++classesSeq.value;
    const scope = scopeKey.value;
    classesState.value = { status: "loading", data: classesState.value.data, error: null };
    const result = await fetchTeacherScheduleLists(
      { semester: semester.value },
      { scope: account }
    );
    if (seq !== classesSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const list = normalizeRosterClassList(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (list.length === 0) {
        classesState.value = { status: "empty", data: null, error: rosterEmptyError() };
        return;
      }
      if (key) writeClassesSnapshot(key, list, syncedAt);
      classesState.value = { status: "ready", data: list, error: null };
      return;
    }
    if (result.status === "empty") {
      lastSuccessfulSyncAt.value = (/* @__PURE__ */ new Date()).toISOString();
      fromCache.value = false;
      snapshotStale.value = false;
      classesState.value = { status: "empty", data: null, error: rosterEmptyError() };
      return;
    }
    classesState.value = {
      status: "error",
      data: classesState.value.data,
      error: result.error
    };
  };
  const loadClasses = async (opts = {}) => {
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && key) {
      const snapshot = readClassesSnapshot(key);
      if (snapshot) {
        applyClassesSnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidateClasses(account, key);
  };
  const load = async () => {
    await loadClasses();
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidRosterSemester(next) || next === semester.value) return;
    semester.value = next;
    classesState.value = { status: "idle", data: null, error: null };
    lastSuccessfulSyncAt.value = "";
    fromCache.value = false;
    snapshotStale.value = false;
    selectedClassId.value = "";
    keyword.value = "";
    resetRoster();
    await loadClasses();
  };
  const retryClasses = () => loadClasses({ force: true });
  const clearRoster = () => {
    selectedClassId.value = "";
    keyword.value = "";
    resetRoster();
  };
  return {
    semester,
    accountId,
    scopeKey,
    // 班级候选
    classesState,
    classes,
    classesLoading,
    classesError,
    classesErrorKey,
    classesEmpty,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    // 名册（内存态）
    rosterState,
    students,
    selectedClassId,
    selectedClass,
    keyword,
    total,
    hasMore,
    loadedCount,
    lastLoadedPage,
    rosterLoading,
    rosterError,
    rosterReady,
    rosterErrorKey,
    hasStudents,
    // 行为
    load,
    loadClasses,
    selectClass,
    setKeyword,
    loadMore,
    retryRoster,
    retryClasses,
    setSemester,
    clearRoster,
    teachingClasses,
    teachingClassesLoading,
    selectedJxbid,
    loadTeachingClasses,
    selectTeachingClass
  };
};
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-ro" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-ro-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = { class: "tch-ro-search" };
const _hoisted_8 = ["placeholder", "aria-label"];
const _hoisted_9 = ["aria-label"];
const _hoisted_10 = { class: "tch-ro-jxbid" };
const _hoisted_11 = {
  key: 0,
  class: "tch-ro-jxbid__hint"
};
const _hoisted_12 = {
  key: 1,
  class: "tch-ro-jxbid__hint"
};
const _hoisted_13 = {
  key: 2,
  class: "tch-ro-jxbid__chips"
};
const _hoisted_14 = ["onClick"];
const _hoisted_15 = { class: "truncate max-w-[140px]" };
const _hoisted_16 = {
  key: 0,
  class: "tch-ro-jxbid__count"
};
const _hoisted_17 = ["aria-label"];
const _hoisted_18 = ["disabled", "aria-pressed", "title", "onClick"];
const _hoisted_19 = { class: "truncate max-w-[120px]" };
const _hoisted_20 = {
  key: 0,
  class: "tch-ro-class-count"
};
const _hoisted_21 = { class: "flex items-center gap-3 min-w-0" };
const _hoisted_22 = {
  class: "tch-ro-avatar shrink-0",
  "aria-hidden": "true"
};
const _hoisted_23 = { class: "min-w-0 flex-1" };
const _hoisted_24 = { class: "flex items-center gap-2 min-w-0" };
const _hoisted_25 = { class: "tch-ro-name truncate" };
const _hoisted_26 = {
  key: 0,
  class: "tch-ro-studentid shrink-0"
};
const _hoisted_27 = ["title"];
const _hoisted_28 = { class: "flex flex-col items-center justify-center pt-1 space-y-2" };
const _hoisted_29 = {
  key: 0,
  class: "tch-ro-footer"
};
const _hoisted_30 = {
  key: 1,
  class: "flex items-center gap-2"
};
const _hoisted_31 = { class: "tch-ro-footer text-danger" };
const _hoisted_32 = {
  key: 2,
  class: "tch-ro-footer"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherRosterView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      classes,
      classesLoading,
      classesError,
      classesErrorKey,
      classesEmpty,
      lastSuccessfulSyncAt,
      syncStatus,
      students,
      selectedClassId,
      total,
      hasMore,
      loadedCount,
      rosterLoading,
      rosterError,
      rosterReady,
      rosterErrorKey,
      hasStudents,
      load,
      selectClass,
      setKeyword,
      loadMore,
      retryRoster,
      retryClasses,
      // goal-22：按教学班列学生
      teachingClasses,
      teachingClassesLoading,
      selectedJxbid,
      loadTeachingClasses,
      selectTeachingClass,
      setSemester,
      clearRoster
    } = useTeacherRoster({ accountId: () => resolveTeacherAccountId(auth.studentId) });
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
      await retryClasses();
    };
    const keywordDraft = ref("");
    let keywordTimer = null;
    const onKeywordInput = () => {
      if (keywordTimer) clearTimeout(keywordTimer);
      keywordTimer = setTimeout(() => {
        keywordTimer = null;
        void setKeyword(keywordDraft.value);
      }, 300);
    };
    const clearKeyword = () => {
      keywordDraft.value = "";
      if (keywordTimer) clearTimeout(keywordTimer);
      keywordTimer = null;
      void setKeyword("");
    };
    const sentinelRef = ref(null);
    let sentinelObserver = null;
    const classEnabled = (item) => item.rosterId.trim() !== "";
    const classSelected = (item) => item.rosterId === selectedClassId.value;
    const onSelectClass = (item) => {
      if (!classEnabled(item)) return;
      void selectClass(item.rosterId);
    };
    const studentMeta = (item) => [item.className, item.majorName, item.grade].filter(Boolean).join(" · ");
    const avatarText = (item) => item.name ? item.name.slice(0, 1) : "—";
    const totalText = computed(() => total.value >= 0 ? total.value : null);
    const loadedFooterText = computed(
      () => totalText.value === null ? "" : tf("teacher.roster.footer.loaded", { loaded: loadedCount.value, total: totalText.value })
    );
    onMounted(() => {
      void loadTeachingClasses();
      void load();
      sentinelObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      }, { rootMargin: "160px" });
      if (sentinelRef.value) sentinelObserver.observe(sentinelRef.value);
    });
    watch(sentinelRef, (el, prev) => {
      if (prev) sentinelObserver?.unobserve(prev);
      if (el) sentinelObserver?.observe(el);
    });
    onBeforeUnmount(() => {
      sentinelObserver?.disconnect();
      sentinelObserver = null;
      if (keywordTimer) clearTimeout(keywordTimer);
      clearRoster();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.roster.title"),
          icon: "groups",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-ro-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-ro-semester-pill",
                title: unref(t)("teacher.roster.semester.label")
              }, [
                createBaseVNode("span", _hoisted_3, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_2),
              createBaseVNode("div", {
                class: "tch-ro-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-ro-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-roster-semester",
                      value,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => semesterDraft.value = $event),
                      disabled: unref(classesLoading),
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
              "aria-label": unref(t)("teacher.roster.action.refresh"),
              disabled: unref(classesLoading),
              onClick: reload
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(classesLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_5)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("main", _hoisted_6, [
          unref(classesLoading) && !unref(classes).length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("teacher.roster.classes.loading")
          }, null, 8, ["message"])) : unref(classesError) && !unref(classes).length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: unref(t)(unref(classesErrorKey))
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "mt-3 text-primary font-semibold",
                onClick: reload
              }, toDisplayString(unref(t)("teacher.roster.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : unref(classesEmpty) ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.roster.classes.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("div", _hoisted_7, [
              _cache[7] || (_cache[7] = createBaseVNode("span", {
                class: "material-symbols-outlined text-[20px] text-outline",
                "aria-hidden": "true"
              }, "search", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => keywordDraft.value = $event),
                class: "tch-ro-search-input",
                type: "text",
                placeholder: unref(t)("teacher.roster.search.placeholder"),
                "aria-label": unref(t)("teacher.roster.search.aria"),
                onInput: onKeywordInput
              }, null, 40, _hoisted_8), [
                [vModelText, keywordDraft.value]
              ]),
              keywordDraft.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "tch-ro-search-clear",
                "aria-label": unref(t)("teacher.roster.search.clear"),
                onClick: clearKeyword
              }, [..._cache[6] || (_cache[6] = [
                createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "close", -1)
              ])], 8, _hoisted_9)) : createCommentVNode("", true)
            ]),
            createBaseVNode("section", _hoisted_10, [
              _cache[8] || (_cache[8] = createBaseVNode("p", { class: "tch-ro-jxbid__title" }, "按教学班查看", -1)),
              unref(teachingClassesLoading) ? (openBlock(), createElementBlock("div", _hoisted_11, "正在加载教学班…")) : !unref(teachingClasses).length ? (openBlock(), createElementBlock("div", _hoisted_12, " 暂无教学班（本学期未排课） ")) : (openBlock(), createElementBlock("div", _hoisted_13, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(teachingClasses), (item) => {
                  return openBlock(), createElementBlock("button", {
                    key: item.classId,
                    type: "button",
                    class: normalizeClass(["tch-ro-jxbid__chip", { "tch-ro-jxbid__chip--active": unref(selectedJxbid) === item.classId }]),
                    onClick: ($event) => unref(selectTeachingClass)(item.classId)
                  }, [
                    createBaseVNode("span", _hoisted_15, toDisplayString(item.courseName || "未命名课程"), 1),
                    item.studentCount !== null ? (openBlock(), createElementBlock("span", _hoisted_16, toDisplayString(item.studentCount) + "人", 1)) : createCommentVNode("", true)
                  ], 10, _hoisted_14);
                }), 128))
              ]))
            ]),
            createBaseVNode("div", {
              class: "tch-ro-classes",
              role: "listbox",
              "aria-label": unref(t)("teacher.roster.classes.aria")
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(classes), (item) => {
                return openBlock(), createElementBlock("button", {
                  key: item.key,
                  type: "button",
                  class: normalizeClass(["tch-ro-class-pill", { "tch-ro-class-pill--active": classSelected(item), "tch-ro-class-pill--disabled": !classEnabled(item) }]),
                  disabled: !classEnabled(item),
                  "aria-pressed": classSelected(item),
                  title: item.className || item.classNo,
                  onClick: ($event) => onSelectClass(item)
                }, [
                  createBaseVNode("span", _hoisted_19, toDisplayString(item.className || item.classNo || "—"), 1),
                  item.studentCount !== null ? (openBlock(), createElementBlock("span", _hoisted_20, toDisplayString(unref(tf)("teacher.roster.class.count", { n: item.studentCount })), 1)) : createCommentVNode("", true)
                ], 10, _hoisted_18);
              }), 128))
            ], 8, _hoisted_17),
            !unref(selectedClassId) ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              message: unref(t)("teacher.roster.selectClass")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              unref(rosterLoading) && !unref(hasStudents) ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                type: "loading",
                message: unref(t)("teacher.roster.loading")
              }, null, 8, ["message"])) : unref(rosterError) && !unref(hasStudents) ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 1,
                type: "error",
                message: unref(t)(unref(rosterErrorKey))
              }, {
                default: withCtx(() => [
                  createBaseVNode("button", {
                    type: "button",
                    class: "mt-3 text-primary font-semibold",
                    onClick: _cache[3] || (_cache[3] = //@ts-ignore
                    (...args) => unref(retryRoster) && unref(retryRoster)(...args))
                  }, toDisplayString(unref(t)("teacher.roster.action.retry")), 1)
                ]),
                _: 1
              }, 8, ["message"])) : unref(rosterReady) && !unref(hasStudents) ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 2,
                message: unref(t)("teacher.roster.empty")
              }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(students), (item) => {
                  return openBlock(), createElementBlock("article", {
                    key: item.key,
                    class: "tch-ro-student p-3.5"
                  }, [
                    createBaseVNode("div", _hoisted_21, [
                      createBaseVNode("div", _hoisted_22, toDisplayString(avatarText(item)), 1),
                      createBaseVNode("div", _hoisted_23, [
                        createBaseVNode("div", _hoisted_24, [
                          createBaseVNode("span", _hoisted_25, toDisplayString(item.name || "—"), 1),
                          item.studentId ? (openBlock(), createElementBlock("span", _hoisted_26, toDisplayString(item.studentId), 1)) : createCommentVNode("", true)
                        ]),
                        studentMeta(item) ? (openBlock(), createElementBlock("p", {
                          key: 0,
                          class: "tch-ro-meta mt-1 truncate",
                          title: studentMeta(item)
                        }, toDisplayString(studentMeta(item)), 9, _hoisted_27)) : createCommentVNode("", true)
                      ])
                    ])
                  ]);
                }), 128)),
                createBaseVNode("div", _hoisted_28, [
                  loadedFooterText.value ? (openBlock(), createElementBlock("p", _hoisted_29, [
                    _cache[9] || (_cache[9] = createBaseVNode("span", {
                      class: "tch-ro-footer-dot",
                      "aria-hidden": "true"
                    }, null, -1)),
                    createTextVNode(" " + toDisplayString(loadedFooterText.value) + " ", 1),
                    _cache[10] || (_cache[10] = createBaseVNode("span", {
                      class: "tch-ro-footer-dot",
                      "aria-hidden": "true"
                    }, null, -1))
                  ])) : createCommentVNode("", true),
                  unref(rosterError) && unref(hasStudents) ? (openBlock(), createElementBlock("div", _hoisted_30, [
                    createBaseVNode("span", _hoisted_31, toDisplayString(unref(t)(unref(rosterErrorKey))), 1),
                    createBaseVNode("button", {
                      type: "button",
                      class: "text-primary font-semibold text-[11px]",
                      onClick: _cache[4] || (_cache[4] = //@ts-ignore
                      (...args) => unref(retryRoster) && unref(retryRoster)(...args))
                    }, toDisplayString(unref(t)("teacher.roster.action.retry")), 1)
                  ])) : unref(rosterLoading) && unref(hasStudents) ? (openBlock(), createElementBlock("p", _hoisted_32, toDisplayString(unref(t)("teacher.roster.loadingMore")), 1)) : unref(hasMore) ? (openBlock(), createElementBlock("button", {
                    key: 3,
                    type: "button",
                    class: "tch-ro-more",
                    onClick: _cache[5] || (_cache[5] = //@ts-ignore
                    (...args) => unref(loadMore) && unref(loadMore)(...args))
                  }, [
                    _cache[11] || (_cache[11] = createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "expand_more", -1)),
                    createBaseVNode("span", null, toDisplayString(unref(t)("teacher.roster.action.loadMore")), 1)
                  ])) : createCommentVNode("", true),
                  createBaseVNode("div", {
                    ref_key: "sentinelRef",
                    ref: sentinelRef,
                    class: "h-1 w-full",
                    "aria-hidden": "true"
                  }, null, 512)
                ])
              ], 64))
            ], 64))
          ], 64)),
          createVNode(_sfc_main$2, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": unref(classesError) ? unref(classesErrorKey) : ""
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ])
      ]);
    };
  }
});
const TeacherRosterView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-912d9f69"]]);
export {
  TeacherRosterView as default
};
