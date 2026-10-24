import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { T as TCard, _ as _sfc_main$5 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-Cnj2iqbI.js";
import { T as TEmptyState } from "./TEmptyState-BN1DyviL.js";
import { c7 as normalizeDate, c2 as normalizeScopeAccountId, c4 as normalizeSemester, an as normalizeTeacherText, c8 as invigilationKey, ak as buildTeacherScopedKey, c9 as dedupeByStableKey, c0 as clearTeacherSnapshotScope, ae as readTeacherSnapshot, ai as buildTeacherSnapshotKey, ca as fetchTeacherExams, ag as writeTeacherSnapshot, ao as stripTeacherHtml, u as useI18n, c as useAuthStore, c6 as IOSSelect, z as tf, c3 as resolveTeacherAccountId } from "./app-demo-D7XNtlJ4.js";
import { _ as _sfc_main$2, a as _sfc_main$3, b as _sfc_main$4 } from "./TabsTrigger.vue_vue_type_script_setup_true_lang-CZzaKQwe.js";
import { r as readStoredSemester, d as deriveSemesterByDate } from "./semester-CFmxdau-.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, t as toDisplayString, F as Fragment, f as renderList, g as createTextVNode, j as createBlock, d as createCommentVNode } from "./vue-core-CVT-P0lT.js";
import { _ as _sfc_main$6, t as teacherSemesterOptions } from "./TeacherRecordDetail.vue_vue_type_script_setup_true_lang-C12B94Yq.js";
import "./runtime-bridge-BimU7Kjk.js";
import "./more-modules-DshM5kk8.js";
import "./debug-tools-Qn_xy0xQ.js";
import "./capture-C0vEZJ2q.js";
import "./constants-DXb2o7CT.js";
const TEACHER_INVIGILATION_REMINDER_KIND = "invigilation-reminder";
const TEACHER_INVIGILATION_LEAD_DAYS = 1;
const TEACHER_INVIGILATION_DEFAULT_HOUR = 9;
const stableHash31 = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = hash * 31 + text.charCodeAt(i) >>> 0;
  }
  return hash & 2147483647 || 1;
};
const buildTeacherInvigilationReminderKey = (accountId, semester, invigilation) => `${buildTeacherScopedKey(
  TEACHER_INVIGILATION_REMINDER_KIND,
  accountId,
  semester
)}:${invigilationKey(invigilation)}`;
const deriveTeacherInvigilationReminderId = (reminderKey) => stableHash31(reminderKey);
const localDateAtHour = (dateKey, hour) => {
  const match = String(dateKey || "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, hour, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};
const toTeacherInvigilationReminderEvent = (accountId, semester, invigilation) => {
  const dateKey = normalizeDate(invigilation.ksrq);
  if (!dateKey) return null;
  const account = normalizeScopeAccountId(accountId);
  const term = normalizeSemester(semester);
  const startAt = localDateAtHour(dateKey, TEACHER_INVIGILATION_DEFAULT_HOUR);
  if (!startAt) return null;
  const atEpochMs = startAt.getTime() - TEACHER_INVIGILATION_LEAD_DAYS * 24 * 60 * 60 * 1e3;
  const reminderKey = buildTeacherInvigilationReminderKey(account, term, invigilation);
  return {
    scopeKey: buildTeacherScopedKey("exams", account, term),
    reminderKey,
    id: deriveTeacherInvigilationReminderId(reminderKey),
    type: "teacher-invigilation",
    accountId: account,
    semester: term,
    invigilationId: invigilationKey(invigilation),
    courseName: normalizeTeacherText(invigilation.kcmc),
    dateKey,
    sessionLabel: normalizeTeacherText(invigilation.kscc),
    room: normalizeTeacherText(invigilation.jsmc),
    campus: normalizeTeacherText(invigilation.xqmc),
    role: normalizeTeacherText(invigilation.zjk),
    atEpochMs,
    atEpochSecs: Math.floor(atEpochMs / 1e3),
    targetView: "teachexams"
  };
};
const dedupeTeacherInvigilationReminderEvents = (events) => dedupeByStableKey(events, (event) => event.reminderKey);
const buildTeacherInvigilationReminderEvents = (input) => {
  const events = (Array.isArray(input.invigilations) ? input.invigilations : []).map((item) => toTeacherInvigilationReminderEvent(input.accountId, input.semester, item)).filter((event) => event !== null);
  return dedupeTeacherInvigilationReminderEvents(events).sort(
    (a, b) => a.atEpochMs - b.atEpochMs
  );
};
const teacherExamsErrorKey = (kind) => `teacher.error.${kind}`;
const sanitizeInvigilation = (item) => {
  const cleaned = {
    ...item,
    kcmc: stripTeacherHtml(item.kcmc)
  };
  if (item.jsmc !== void 0) cleaned.jsmc = stripTeacherHtml(item.jsmc);
  if (item.zjk !== void 0) cleaned.zjk = stripTeacherHtml(item.zjk);
  if (item.xqmc !== void 0) cleaned.xqmc = stripTeacherHtml(item.xqmc);
  if (item.kscc !== void 0) cleaned.kscc = stripTeacherHtml(item.kscc);
  if (item.kspcmc !== void 0) cleaned.kspcmc = stripTeacherHtml(item.kspcmc);
  if (item.ksfs !== void 0) cleaned.ksfs = stripTeacherHtml(item.ksfs);
  if (item.jkjsxm !== void 0) cleaned.jkjsxm = stripTeacherHtml(item.jkjsxm);
  if (item.kkyx !== void 0) cleaned.kkyx = stripTeacherHtml(item.kkyx);
  if (item.ksbj !== void 0) cleaned.ksbj = stripTeacherHtml(item.ksbj);
  return cleaned;
};
const sanitizeTeacherExam = (exam) => {
  const cleaned = {
    ...exam,
    kcmc: stripTeacherHtml(exam.kcmc)
  };
  if (exam.jsmc !== void 0) cleaned.jsmc = stripTeacherHtml(exam.jsmc);
  if (exam.jkjs !== void 0) cleaned.jkjs = stripTeacherHtml(exam.jkjs);
  if (exam.jxbmc !== void 0) cleaned.jxbmc = stripTeacherHtml(exam.jxbmc);
  if (exam.bjmc !== void 0) cleaned.bjmc = stripTeacherHtml(exam.bjmc);
  if (exam.jsname !== void 0) cleaned.jsname = stripTeacherHtml(exam.jsname);
  if (exam.kkyx !== void 0) cleaned.kkyx = stripTeacherHtml(exam.kkyx);
  if (exam.kspcmc !== void 0) cleaned.kspcmc = stripTeacherHtml(exam.kspcmc);
  return cleaned;
};
const startOfToday = (today) => new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
const isExamPast = (dateKey, today = /* @__PURE__ */ new Date()) => {
  const normalized = normalizeDate(dateKey);
  if (!normalized) return false;
  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day).getTime();
  return date < startOfToday(today);
};
const filterByTimeline = (items, filter, dateOf, today = /* @__PURE__ */ new Date()) => {
  if (filter === "all") return items.slice();
  return items.filter((item) => {
    const past = isExamPast(dateOf(item), today);
    return filter === "past" ? past : !past;
  });
};
const EXAMS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidExamsSemester = (value) => EXAMS_SEMESTER_PATTERN.test(value);
const resolveInitialExamsSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidExamsSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidExamsSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const useTeacherExams = (options = {}) => {
  const semester = ref(resolveInitialExamsSemester(options.initialSemester));
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
    () => buildTeacherScopedKey("exams", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => buildTeacherSnapshotKey({
      resource: "exams",
      accountId: accountId.value,
      semester: semester.value
    })
  );
  const invigilations = computed(
    () => (state.value.data?.invigilations ?? []).map(sanitizeInvigilation)
  );
  const exams = computed(
    () => (state.value.data?.exams ?? []).map(sanitizeTeacherExam)
  );
  const reminderEvents = computed(
    () => buildTeacherInvigilationReminderEvents({
      accountId: accountId.value,
      semester: semester.value,
      invigilations: invigilations.value
    })
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherExamsErrorKey(state.value.error.kind) : ""
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
  const applySnapshot = (snapshot, syncedAt, stale) => {
    lastSuccessfulSyncAt.value = syncedAt;
    fromCache.value = true;
    snapshotStale.value = stale;
    const empty = snapshot.invigilations.length === 0 && snapshot.exams.length === 0;
    state.value = empty ? { status: "empty", data: null, error: { kind: "empty", message: "" } } : { status: "ready", data: snapshot, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherExams(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (key) {
        writeTeacherSnapshot({
          scopeKey: key,
          accountId: account,
          semester: semester.value,
          resource: "exams",
          queryKey: "",
          data: result.data,
          lastSuccessfulSyncAt: syncedAt
        });
      }
      state.value = result;
      return;
    }
    if (result.status === "empty") {
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (key) {
        writeTeacherSnapshot({
          scopeKey: key,
          accountId: account,
          semester: semester.value,
          resource: "exams",
          queryKey: "",
          data: { invigilations: [], exams: [] },
          lastSuccessfulSyncAt: syncedAt
        });
      }
      state.value = result;
      return;
    }
    state.value = { status: "error", data: state.value.data, error: result.error };
  };
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && key) {
      const snapshot = readTeacherSnapshot(key);
      if (snapshot) {
        applySnapshot(snapshot.data, snapshot.meta.lastSuccessfulSyncAt, snapshot.meta.stale);
        if (!snapshot.meta.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidExamsSemester(next) || next === semester.value) return;
    semester.value = next;
    state.value = { status: "idle", data: null, error: null };
    lastSuccessfulSyncAt.value = "";
    fromCache.value = false;
    snapshotStale.value = false;
    await load();
  };
  const retry = () => load({ force: true });
  const clearCache = () => {
    clearTeacherSnapshotScope(accountId.value);
  };
  return {
    semester,
    accountId,
    scopeKey,
    snapshotKey,
    state,
    invigilations,
    exams,
    reminderEvents,
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
    retry,
    clearCache
  };
};
const _hoisted_1 = { class: "min-h-screen bg-surface text-on-surface max-w-[448px] mx-auto pb-24" };
const _hoisted_2 = ["aria-label", "disabled"];
const _hoisted_3 = { class: "p-4 space-y-4" };
const _hoisted_4 = { class: "block text-xs font-semibold text-on-surface-variant mb-2" };
const _hoisted_5 = ["value"];
const _hoisted_6 = ["aria-label"];
const _hoisted_7 = ["aria-pressed", "onClick"];
const _hoisted_8 = {
  key: 0,
  class: "text-xs text-on-surface-variant"
};
const _hoisted_9 = {
  key: 2,
  class: "space-y-3"
};
const _hoisted_10 = ["aria-label", "onClick"];
const _hoisted_11 = { class: "min-w-0 flex-1" };
const _hoisted_12 = { class: "block font-bold text-on-surface truncate" };
const _hoisted_13 = { class: "block text-sm text-on-surface-variant mt-1" };
const _hoisted_14 = { class: "block text-xs text-on-surface-variant mt-2" };
const _hoisted_15 = {
  key: 0,
  class: "ml-2"
};
const _hoisted_16 = {
  key: 1,
  class: "space-y-3"
};
const _hoisted_17 = ["aria-label", "onClick"];
const _hoisted_18 = { class: "min-w-0 flex-1" };
const _hoisted_19 = { class: "block font-bold text-on-surface truncate" };
const _hoisted_20 = { class: "block text-sm text-on-surface-variant mt-1" };
const _hoisted_21 = { class: "block text-xs text-on-surface-variant mt-2" };
const _hoisted_22 = {
  key: 0,
  class: "ml-2"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherExamsView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const activeTab = ref("invigilations");
    const timelineFilter = ref("all");
    const selectedInvigilation = ref(null);
    const selectedExam = ref(null);
    const {
      semester,
      invigilations,
      exams,
      reminderEvents,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherExams({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => invigilations.value.length > 0 || exams.value.length > 0);
    const semesterDraft = ref(semester.value);
    watch(semester, (value) => {
      semesterDraft.value = value;
    });
    const semesters = computed(() => teacherSemesterOptions(semesterDraft.value));
    const visibleInvigilations = computed(
      () => filterByTimeline(invigilations.value, timelineFilter.value, (item) => item.ksrq ?? "")
    );
    const visibleExams = computed(
      () => filterByTimeline(exams.value, timelineFilter.value, (item) => item.ksrq ?? "")
    );
    const isPastInvigilation = (item) => isExamPast(item.ksrq ?? "");
    const isPastExam = (item) => isExamPast(item.ksrq ?? "");
    const openInvigilation = (item) => {
      selectedInvigilation.value = item;
      selectedExam.value = null;
    };
    const openExam = (item) => {
      selectedExam.value = item;
      selectedInvigilation.value = null;
    };
    const closeDetail = () => {
      selectedInvigilation.value = null;
      selectedExam.value = null;
    };
    const showDetail = computed(() => selectedInvigilation.value !== null || selectedExam.value !== null);
    const selectedTitle = computed(() => selectedInvigilation.value?.kcmc || selectedExam.value?.kcmc || "");
    const detailRows = computed(() => {
      const inv = selectedInvigilation.value;
      const exam = selectedExam.value;
      if (inv) return [
        { key: "course", label: t("teacher.exams.field.courseName"), value: inv.kcmc },
        { key: "date", label: t("teacher.exams.field.date"), value: inv.ksrq },
        { key: "session", label: t("teacher.exams.field.session"), value: inv.kscc },
        { key: "room", label: t("teacher.exams.field.room"), value: inv.jsmc },
        { key: "role", label: t("teacher.exams.field.role"), value: inv.zjk },
        { key: "count", label: t("teacher.exams.field.examCount"), value: inv.ksrs }
      ];
      if (exam) return [
        { key: "course", label: t("teacher.exams.field.courseName"), value: exam.kcmc },
        { key: "date", label: t("teacher.exams.field.date"), value: exam.ksrq },
        { key: "time", label: t("teacher.exams.field.time"), value: exam.kssj },
        { key: "room", label: t("teacher.exams.field.room"), value: exam.jsmc },
        { key: "class", label: t("teacher.exams.field.teachingClass"), value: exam.jxbmc },
        { key: "count", label: t("teacher.exams.field.examCount"), value: exam.ksrs }
      ];
      return [];
    });
    const extraRows = computed(() => {
      const inv = selectedInvigilation.value;
      const exam = selectedExam.value;
      if (inv) return [
        { key: "campus", label: t("teacher.exams.field.campus"), value: inv.xqmc },
        { key: "batch", label: t("teacher.exams.field.batch"), value: inv.kspcmc },
        { key: "examClass", label: t("teacher.exams.field.examClass"), value: inv.ksbj },
        { key: "type", label: t("teacher.exams.field.examMethod"), value: inv.ksfs },
        { key: "staff", label: t("teacher.exams.field.invigilators"), value: inv.jkjsxm },
        { key: "college", label: t("teacher.exams.field.college"), value: inv.kkyx }
      ];
      if (exam) return [
        { key: "className", label: t("teacher.exams.field.className"), value: exam.bjmc },
        { key: "teacher", label: t("teacher.exams.field.teacher"), value: exam.jsname },
        { key: "staff", label: t("teacher.exams.field.invigilators"), value: exam.jkjs },
        { key: "batch", label: t("teacher.exams.field.batch"), value: exam.kspcmc },
        { key: "college", label: t("teacher.exams.field.college"), value: exam.kkyx },
        { key: "code", label: t("teacher.exams.field.courseCode"), value: exam.kcbh }
      ];
      return [];
    });
    const applySemester = async () => {
      if (semesterDraft.value === semester.value) return;
      await setSemester(semesterDraft.value);
      closeDetail();
    };
    const reload = async () => {
      await retry();
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.exams.title"),
          icon: "edit_calendar",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest",
              "aria-label": unref(t)("teacher.exams.action.refresh"),
              disabled: unref(isLoading),
              onClick: reload
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(isLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("main", _hoisted_3, [
          createVNode(unref(TCard), { compact: "" }, {
            default: withCtx(() => [
              createBaseVNode("label", _hoisted_4, toDisplayString(unref(t)("teacher.exams.semester.label")), 1),
              createVNode(IOSSelect, {
                modelValue: semesterDraft.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => semesterDraft.value = $event),
                disabled: unref(isLoading),
                title: unref(t)("teacher.exams.semester.label"),
                class: "w-full text-sm text-on-surface font-medium",
                onChange: applySemester
              }, {
                default: withCtx(() => [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                    return openBlock(), createElementBlock("option", {
                      key: value,
                      value
                    }, toDisplayString(value), 9, _hoisted_5);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue", "disabled", "title"])
            ]),
            _: 1
          }),
          createVNode(unref(_sfc_main$4), {
            modelValue: activeTab.value,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => activeTab.value = $event),
            class: "w-full"
          }, {
            default: withCtx(() => [
              createVNode(unref(_sfc_main$2), {
                class: "w-full rounded-2xl bg-surface-container-high p-1",
                "aria-label": unref(t)("teacher.exams.title")
              }, {
                default: withCtx(() => [
                  createVNode(unref(_sfc_main$3), {
                    value: "invigilations",
                    class: "flex-1 rounded-xl"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(unref(t)("teacher.exams.tab.invigilations")) + " (" + toDisplayString(unref(invigilations).length) + ") ", 1)
                    ]),
                    _: 1
                  }),
                  createVNode(unref(_sfc_main$3), {
                    value: "exams",
                    class: "flex-1 rounded-xl"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(unref(t)("teacher.exams.tab.exams")) + " (" + toDisplayString(unref(exams).length) + ") ", 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["aria-label"])
            ]),
            _: 1
          }, 8, ["modelValue"]),
          createBaseVNode("div", {
            class: "flex flex-wrap gap-2",
            role: "group",
            "aria-label": unref(t)("teacher.exams.filter.label")
          }, [
            (openBlock(), createElementBlock(Fragment, null, renderList(["all", "upcoming", "past"], (value) => {
              return createBaseVNode("button", {
                key: value,
                type: "button",
                "aria-pressed": timelineFilter.value === value,
                onClick: ($event) => timelineFilter.value = value,
                class: normalizeClass(["px-3 py-1.5 rounded-full text-xs font-semibold border border-outline-variant/40 transition-colors", timelineFilter.value === value ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"])
              }, toDisplayString(unref(t)("teacher.exams.filter." + value)), 11, _hoisted_7);
            }), 64))
          ], 8, _hoisted_6),
          unref(isLoading) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("teacher.exams.loading")
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
              }, toDisplayString(unref(t)("teacher.exams.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : activeTab.value === "invigilations" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            unref(reminderEvents).length ? (openBlock(), createElementBlock("p", _hoisted_8, toDisplayString(unref(tf)("teacher.exams.reminder.ready", { n: unref(reminderEvents).length })), 1)) : createCommentVNode("", true),
            !visibleInvigilations.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              message: unref(t)("teacher.exams.empty.invigilations")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("ul", _hoisted_9, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(visibleInvigilations.value, (item) => {
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
                        "aria-label": item.kcmc + " " + unref(t)("teacher.detail.view"),
                        onClick: ($event) => openInvigilation(item)
                      }, [
                        createBaseVNode("span", _hoisted_11, [
                          createBaseVNode("span", _hoisted_12, toDisplayString(item.kcmc), 1),
                          createBaseVNode("span", _hoisted_13, toDisplayString([item.ksrq, item.kscc, item.jsmc].filter(Boolean).join(" · ")), 1),
                          createBaseVNode("span", _hoisted_14, [
                            createTextVNode(toDisplayString(item.zjk || unref(t)("teacher.exams.tab.invigilations")) + " ", 1),
                            isPastInvigilation(item) ? (openBlock(), createElementBlock("span", _hoisted_15, toDisplayString(unref(t)("teacher.exams.status.past")), 1)) : createCommentVNode("", true)
                          ])
                        ]),
                        _cache[3] || (_cache[3] = createBaseVNode("span", {
                          class: "material-symbols-outlined text-on-surface-variant text-lg",
                          "aria-hidden": "true"
                        }, "chevron_right", -1))
                      ], 8, _hoisted_10)
                    ]),
                    _: 2
                  }, 1024)
                ]);
              }), 128))
            ]))
          ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            !visibleExams.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              message: unref(t)("teacher.exams.empty.exams")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("ul", _hoisted_16, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(visibleExams.value, (item) => {
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
                        "aria-label": item.kcmc + " " + unref(t)("teacher.detail.view"),
                        onClick: ($event) => openExam(item)
                      }, [
                        createBaseVNode("span", _hoisted_18, [
                          createBaseVNode("span", _hoisted_19, toDisplayString(item.kcmc), 1),
                          createBaseVNode("span", _hoisted_20, toDisplayString([item.ksrq, item.kssj, item.jsmc].filter(Boolean).join(" · ")), 1),
                          createBaseVNode("span", _hoisted_21, [
                            createTextVNode(toDisplayString(item.jxbmc || item.bjmc) + " ", 1),
                            isPastExam(item) ? (openBlock(), createElementBlock("span", _hoisted_22, toDisplayString(unref(t)("teacher.exams.status.past")), 1)) : createCommentVNode("", true)
                          ])
                        ]),
                        _cache[4] || (_cache[4] = createBaseVNode("span", {
                          class: "material-symbols-outlined text-on-surface-variant text-lg",
                          "aria-hidden": "true"
                        }, "chevron_right", -1))
                      ], 8, _hoisted_17)
                    ]),
                    _: 2
                  }, 1024)
                ]);
              }), 128))
            ]))
          ], 64)),
          createVNode(_sfc_main$5, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": unref(isError) ? unref(errorKey) : ""
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ]),
        createVNode(_sfc_main$6, {
          visible: showDetail.value,
          title: selectedTitle.value,
          primary: detailRows.value,
          extra: extraRows.value,
          onClose: closeDetail
        }, null, 8, ["visible", "title", "primary", "extra"])
      ]);
    };
  }
});
export {
  _sfc_main as default
};
