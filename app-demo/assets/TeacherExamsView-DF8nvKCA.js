import { r as ref, h as computed, y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, L as withDirectives, M as vModelText, m as withKeys, n as normalizeClass, g as createTextVNode, F as Fragment, f as renderList, d as createCommentVNode } from "./vue-core-D-44rohN.js";
import { u as useI18n, c as useAuthStore, z as tf, _ as _export_sfc } from "./app-demo-DztvWo2z.js";
import { e as normalizeDate, b as normalizeSemester, n as normalizeTeacherText, i as invigilationKey, g as dedupeByStableKey, h as fetchTeacherExams, s as stripTeacherHtml } from "./teacherApi-BZ56ekcn.js";
import { r as readStoredSemester, d as deriveSemesterByDate } from "./semester-DXaOneP4.js";
import { n as normalizeScopeAccountId, b as buildTeacherScopedKey, r as resolveTeacherAccountId } from "./teacher_scope-Dh6O3Ukw.js";
import "./runtime-bridge-gQMtwwk6.js";
import "./more-modules-yxgAg-Rh.js";
import "./debug-tools-CyNtADDO.js";
import "./capture-YhmA9GNe.js";
import "./school_inbox_content-CxpfsU1v.js";
import "./constants-NOUSPpZg.js";
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
  const memoryCache = /* @__PURE__ */ new Map();
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const scopeKey = computed(
    () => buildTeacherScopedKey("exams", accountId.value, semester.value)
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
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    if (!opts.force) {
      const cached = memoryCache.get(scope);
      if (cached) {
        state.value = { status: "ready", data: cached, error: null };
        return;
      }
    }
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: null, error: null };
    const result = await fetchTeacherExams(semester.value);
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      memoryCache.set(scope, result.data);
    }
    state.value = result;
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidExamsSemester(next) || next === semester.value) return;
    semester.value = next;
    state.value = { status: "idle", data: null, error: null };
    await load();
  };
  const retry = () => load({ force: true });
  const clearCache = () => {
    memoryCache.clear();
  };
  return {
    semester,
    accountId,
    scopeKey,
    state,
    invigilations,
    exams,
    reminderEvents,
    isLoading,
    isEmpty,
    isReady,
    isError,
    errorKey,
    load,
    setSemester,
    retry,
    clearCache
  };
};
const _hoisted_1 = {
  class: "teacher-exams",
  role: "region",
  "aria-labelledby": "teacher-exams-title"
};
const _hoisted_2 = { class: "teacher-exams__header" };
const _hoisted_3 = {
  id: "teacher-exams-title",
  class: "teacher-exams__title"
};
const _hoisted_4 = { class: "teacher-exams__semester" };
const _hoisted_5 = {
  class: "teacher-exams__semester-label",
  for: "teacher-exams-semester"
};
const _hoisted_6 = ["placeholder"];
const _hoisted_7 = ["disabled"];
const _hoisted_8 = {
  class: "teacher-exams__tabs",
  role: "tablist",
  "aria-label": "exams tabs"
};
const _hoisted_9 = ["aria-selected"];
const _hoisted_10 = { class: "teacher-exams__tab-count" };
const _hoisted_11 = ["aria-selected"];
const _hoisted_12 = { class: "teacher-exams__tab-count" };
const _hoisted_13 = {
  key: 0,
  class: "teacher-exams__filters",
  role: "group"
};
const _hoisted_14 = { class: "teacher-exams__filters-label" };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = {
  key: 1,
  class: "teacher-exams__state",
  role: "status",
  "aria-live": "polite"
};
const _hoisted_17 = {
  key: 2,
  class: "teacher-exams__state teacher-exams__state--error",
  role: "alert"
};
const _hoisted_18 = {
  key: 3,
  class: "teacher-exams__panel",
  role: "tabpanel"
};
const _hoisted_19 = {
  key: 0,
  class: "teacher-exams__hint"
};
const _hoisted_20 = {
  key: 1,
  class: "teacher-exams__state"
};
const _hoisted_21 = {
  key: 2,
  class: "teacher-exams__grid"
};
const _hoisted_22 = { class: "teacher-exams__card-head" };
const _hoisted_23 = { class: "teacher-exams__card-course" };
const _hoisted_24 = {
  key: 0,
  class: "teacher-exams__badge"
};
const _hoisted_25 = {
  key: 1,
  class: "teacher-exams__badge teacher-exams__badge--role"
};
const _hoisted_26 = { class: "teacher-exams__fields" };
const _hoisted_27 = {
  key: 0,
  class: "teacher-exams__row"
};
const _hoisted_28 = {
  key: 1,
  class: "teacher-exams__row"
};
const _hoisted_29 = {
  key: 2,
  class: "teacher-exams__row"
};
const _hoisted_30 = {
  key: 3,
  class: "teacher-exams__row"
};
const _hoisted_31 = {
  key: 4,
  class: "teacher-exams__row"
};
const _hoisted_32 = {
  key: 5,
  class: "teacher-exams__row"
};
const _hoisted_33 = {
  key: 6,
  class: "teacher-exams__row"
};
const _hoisted_34 = {
  key: 7,
  class: "teacher-exams__row"
};
const _hoisted_35 = {
  key: 8,
  class: "teacher-exams__row"
};
const _hoisted_36 = {
  key: 9,
  class: "teacher-exams__row"
};
const _hoisted_37 = {
  key: 10,
  class: "teacher-exams__row"
};
const _hoisted_38 = {
  key: 4,
  class: "teacher-exams__panel",
  role: "tabpanel"
};
const _hoisted_39 = {
  key: 0,
  class: "teacher-exams__state"
};
const _hoisted_40 = {
  key: 1,
  class: "teacher-exams__grid"
};
const _hoisted_41 = { class: "teacher-exams__card-head" };
const _hoisted_42 = { class: "teacher-exams__card-course" };
const _hoisted_43 = {
  key: 0,
  class: "teacher-exams__badge"
};
const _hoisted_44 = { class: "teacher-exams__fields" };
const _hoisted_45 = {
  key: 0,
  class: "teacher-exams__row"
};
const _hoisted_46 = {
  key: 1,
  class: "teacher-exams__row"
};
const _hoisted_47 = {
  key: 2,
  class: "teacher-exams__row"
};
const _hoisted_48 = {
  key: 3,
  class: "teacher-exams__row"
};
const _hoisted_49 = {
  key: 4,
  class: "teacher-exams__row"
};
const _hoisted_50 = {
  key: 5,
  class: "teacher-exams__row"
};
const _hoisted_51 = {
  key: 6,
  class: "teacher-exams__row"
};
const _hoisted_52 = {
  key: 7,
  class: "teacher-exams__row"
};
const _hoisted_53 = {
  key: 8,
  class: "teacher-exams__row"
};
const _hoisted_54 = {
  key: 9,
  class: "teacher-exams__row"
};
const _hoisted_55 = {
  key: 10,
  class: "teacher-exams__row"
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
    const {
      semester,
      invigilations,
      exams,
      reminderEvents,
      isLoading,
      isError,
      errorKey,
      load,
      setSemester,
      retry
    } = useTeacherExams({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const semesterDraft = ref(semester.value);
    const visibleInvigilations = computed(
      () => filterByTimeline(invigilations.value, timelineFilter.value, (item) => item.ksrq ?? "")
    );
    const visibleExams = computed(
      () => filterByTimeline(exams.value, timelineFilter.value, (item) => item.ksrq ?? "")
    );
    const isPastInvigilation = (item) => isExamPast(item.ksrq ?? "");
    const isPastExam = (exam) => isExamPast(exam.ksrq ?? "");
    const applySemester = async () => {
      await setSemester(semesterDraft.value);
      semesterDraft.value = semester.value;
    };
    const reload = async () => {
      await retry();
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "teacher-exams__back",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back"))
          }, toDisplayString(unref(t)("teacher.exams.action.back")), 1),
          createBaseVNode("h2", _hoisted_3, toDisplayString(unref(t)("teacher.exams.title")), 1),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("label", _hoisted_5, toDisplayString(unref(t)("teacher.exams.semester.label")), 1),
            withDirectives(createBaseVNode("input", {
              id: "teacher-exams-semester",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => semesterDraft.value = $event),
              class: "teacher-exams__semester-input",
              type: "text",
              inputmode: "numeric",
              placeholder: unref(t)("teacher.exams.semester.placeholder"),
              onKeyup: withKeys(applySemester, ["enter"])
            }, null, 40, _hoisted_6), [
              [vModelText, semesterDraft.value]
            ]),
            createBaseVNode("button", {
              class: "teacher-exams__btn",
              type: "button",
              onClick: applySemester
            }, toDisplayString(unref(t)("teacher.exams.semester.apply")), 1),
            createBaseVNode("button", {
              class: "teacher-exams__btn teacher-exams__btn--ghost",
              type: "button",
              disabled: unref(isLoading),
              onClick: reload
            }, toDisplayString(unref(t)("teacher.exams.action.refresh")), 9, _hoisted_7)
          ])
        ]),
        createBaseVNode("div", _hoisted_8, [
          createBaseVNode("button", {
            class: normalizeClass(["teacher-exams__tab", { "is-active": activeTab.value === "invigilations" }]),
            type: "button",
            role: "tab",
            "aria-selected": activeTab.value === "invigilations",
            onClick: _cache[2] || (_cache[2] = ($event) => activeTab.value = "invigilations")
          }, [
            createTextVNode(toDisplayString(unref(t)("teacher.exams.tab.invigilations")) + " ", 1),
            createBaseVNode("span", _hoisted_10, toDisplayString(unref(invigilations).length), 1)
          ], 10, _hoisted_9),
          createBaseVNode("button", {
            class: normalizeClass(["teacher-exams__tab", { "is-active": activeTab.value === "exams" }]),
            type: "button",
            role: "tab",
            "aria-selected": activeTab.value === "exams",
            onClick: _cache[3] || (_cache[3] = ($event) => activeTab.value = "exams")
          }, [
            createTextVNode(toDisplayString(unref(t)("teacher.exams.tab.exams")) + " ", 1),
            createBaseVNode("span", _hoisted_12, toDisplayString(unref(exams).length), 1)
          ], 10, _hoisted_11)
        ]),
        !unref(isLoading) && !unref(isError) ? (openBlock(), createElementBlock("div", _hoisted_13, [
          createBaseVNode("span", _hoisted_14, toDisplayString(unref(t)("teacher.exams.filter.label")), 1),
          (openBlock(), createElementBlock(Fragment, null, renderList(["all", "upcoming", "past"], (option) => {
            return createBaseVNode("button", {
              key: option,
              class: normalizeClass(["teacher-exams__chip", { "is-active": timelineFilter.value === option }]),
              type: "button",
              onClick: ($event) => timelineFilter.value = option
            }, toDisplayString(unref(t)(`teacher.exams.filter.${option}`)), 11, _hoisted_15);
          }), 64))
        ])) : createCommentVNode("", true),
        unref(isLoading) ? (openBlock(), createElementBlock("p", _hoisted_16, toDisplayString(unref(t)("teacher.exams.loading")), 1)) : unref(isError) ? (openBlock(), createElementBlock("div", _hoisted_17, [
          createBaseVNode("p", null, toDisplayString(unref(t)(unref(errorKey))), 1),
          createBaseVNode("button", {
            class: "teacher-exams__btn",
            type: "button",
            onClick: reload
          }, toDisplayString(unref(t)("teacher.exams.action.retry")), 1)
        ])) : activeTab.value === "invigilations" ? (openBlock(), createElementBlock("div", _hoisted_18, [
          unref(reminderEvents).length > 0 ? (openBlock(), createElementBlock("p", _hoisted_19, toDisplayString(unref(tf)("teacher.exams.reminder.ready", { n: unref(reminderEvents).length })), 1)) : createCommentVNode("", true),
          visibleInvigilations.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_20, toDisplayString(unref(t)("teacher.exams.empty.invigilations")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_21, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(visibleInvigilations.value, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.id,
                class: "teacher-exams__card"
              }, [
                createBaseVNode("article", {
                  class: normalizeClass(["teacher-exams__card-inner", { "is-past": isPastInvigilation(item) }])
                }, [
                  createBaseVNode("div", _hoisted_22, [
                    createBaseVNode("h3", _hoisted_23, toDisplayString(item.kcmc), 1),
                    isPastInvigilation(item) ? (openBlock(), createElementBlock("span", _hoisted_24, toDisplayString(unref(t)("teacher.exams.status.past")), 1)) : item.zjk ? (openBlock(), createElementBlock("span", _hoisted_25, toDisplayString(item.zjk), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("dl", _hoisted_26, [
                    item.ksrq ? (openBlock(), createElementBlock("div", _hoisted_27, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.date")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.ksrq), 1)
                    ])) : createCommentVNode("", true),
                    item.kscc ? (openBlock(), createElementBlock("div", _hoisted_28, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.session")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.kscc), 1)
                    ])) : createCommentVNode("", true),
                    item.jsmc ? (openBlock(), createElementBlock("div", _hoisted_29, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.room")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.jsmc), 1)
                    ])) : createCommentVNode("", true),
                    item.xqmc ? (openBlock(), createElementBlock("div", _hoisted_30, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.campus")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.xqmc), 1)
                    ])) : createCommentVNode("", true),
                    item.zjk ? (openBlock(), createElementBlock("div", _hoisted_31, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.role")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.zjk), 1)
                    ])) : createCommentVNode("", true),
                    item.ksrs !== void 0 ? (openBlock(), createElementBlock("div", _hoisted_32, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.examCount")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.ksrs) + " " + toDisplayString(unref(t)("teacher.exams.unit.people")), 1)
                    ])) : createCommentVNode("", true),
                    item.ksbj ? (openBlock(), createElementBlock("div", _hoisted_33, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.examClass")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.ksbj), 1)
                    ])) : createCommentVNode("", true),
                    item.kspcmc ? (openBlock(), createElementBlock("div", _hoisted_34, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.batch")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.kspcmc), 1)
                    ])) : createCommentVNode("", true),
                    item.ksfs ? (openBlock(), createElementBlock("div", _hoisted_35, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.examMethod")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.ksfs), 1)
                    ])) : createCommentVNode("", true),
                    item.kkyx ? (openBlock(), createElementBlock("div", _hoisted_36, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.college")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.kkyx), 1)
                    ])) : createCommentVNode("", true),
                    item.jkjsxm ? (openBlock(), createElementBlock("div", _hoisted_37, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.invigilators")), 1),
                      createBaseVNode("dd", null, toDisplayString(item.jkjsxm), 1)
                    ])) : createCommentVNode("", true)
                  ])
                ], 2)
              ]);
            }), 128))
          ]))
        ])) : (openBlock(), createElementBlock("div", _hoisted_38, [
          visibleExams.value.length === 0 ? (openBlock(), createElementBlock("p", _hoisted_39, toDisplayString(unref(t)("teacher.exams.empty.exams")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_40, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(visibleExams.value, (exam) => {
              return openBlock(), createElementBlock("li", {
                key: exam.id,
                class: "teacher-exams__card"
              }, [
                createBaseVNode("article", {
                  class: normalizeClass(["teacher-exams__card-inner", { "is-past": isPastExam(exam) }])
                }, [
                  createBaseVNode("div", _hoisted_41, [
                    createBaseVNode("h3", _hoisted_42, toDisplayString(exam.kcmc), 1),
                    isPastExam(exam) ? (openBlock(), createElementBlock("span", _hoisted_43, toDisplayString(unref(t)("teacher.exams.status.past")), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("dl", _hoisted_44, [
                    exam.ksrq ? (openBlock(), createElementBlock("div", _hoisted_45, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.date")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.ksrq), 1)
                    ])) : createCommentVNode("", true),
                    exam.kssj ? (openBlock(), createElementBlock("div", _hoisted_46, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.time")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.kssj), 1)
                    ])) : createCommentVNode("", true),
                    exam.jsmc ? (openBlock(), createElementBlock("div", _hoisted_47, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.room")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.jsmc), 1)
                    ])) : createCommentVNode("", true),
                    exam.jxbmc ? (openBlock(), createElementBlock("div", _hoisted_48, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.teachingClass")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.jxbmc), 1)
                    ])) : createCommentVNode("", true),
                    exam.bjmc ? (openBlock(), createElementBlock("div", _hoisted_49, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.className")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.bjmc), 1)
                    ])) : createCommentVNode("", true),
                    exam.jsname ? (openBlock(), createElementBlock("div", _hoisted_50, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.teacher")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.jsname), 1)
                    ])) : createCommentVNode("", true),
                    exam.jkjs ? (openBlock(), createElementBlock("div", _hoisted_51, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.invigilators")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.jkjs), 1)
                    ])) : createCommentVNode("", true),
                    exam.ksrs !== void 0 ? (openBlock(), createElementBlock("div", _hoisted_52, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.examCount")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.ksrs) + " " + toDisplayString(unref(t)("teacher.exams.unit.people")), 1)
                    ])) : createCommentVNode("", true),
                    exam.kspcmc ? (openBlock(), createElementBlock("div", _hoisted_53, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.batch")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.kspcmc), 1)
                    ])) : createCommentVNode("", true),
                    exam.kkyx ? (openBlock(), createElementBlock("div", _hoisted_54, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.college")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.kkyx), 1)
                    ])) : createCommentVNode("", true),
                    exam.kcbh ? (openBlock(), createElementBlock("div", _hoisted_55, [
                      createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.exams.field.courseCode")), 1),
                      createBaseVNode("dd", null, toDisplayString(exam.kcbh), 1)
                    ])) : createCommentVNode("", true)
                  ])
                ], 2)
              ]);
            }), 128))
          ]))
        ]))
      ]);
    };
  }
});
const TeacherExamsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-38793ae7"]]);
export {
  TeacherExamsView as default
};
