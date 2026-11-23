import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, d as createCommentVNode } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, cl as fetchTeacherExamAffairs, ae as asArray, af as asRecord, aa as stripTeacherHtml, a9 as asString, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n } from "./more-modules-CjuZH60i.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherExamAffairsErrorKey = (kind) => `teacher.error.${kind}`;
const EXAM_AFFAIRS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidExamAffairsSemester = (value) => EXAM_AFFAIRS_SEMESTER_PATTERN.test(value);
const resolveInitialExamAffairsSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidExamAffairsSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidExamAffairsSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const firstNonEmpty = (record, keys) => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return "";
};
const normalizeExamRow = (value, index, spec) => {
  const record = asRecord(value);
  const details = [];
  for (const detailSpec of spec.detailSpecs) {
    const text = firstNonEmpty(record, detailSpec.keys);
    if (!text) continue;
    details.push({ key: detailSpec.label, label: detailSpec.label, value: text });
  }
  return {
    key: asString(record.id) || `${spec.titleKeys[0] ?? "row"}-${index}`,
    title: stripTeacherHtml(firstNonEmpty(record, spec.titleKeys)),
    subtitle: firstNonEmpty(record, spec.subtitleKeys),
    status: firstNonEmpty(record, spec.statusKeys),
    details
  };
};
const DEFERRED_SPEC = {
  titleKeys: ["kcmc"],
  subtitleKeys: ["bjmc"],
  statusKeys: [],
  detailSpecs: [
    { keys: ["kkyx"], label: "teacher.examAffairs.deferred.field.college" },
    { keys: ["skyx"], label: "teacher.examAffairs.deferred.field.applyCollege" },
    { keys: ["rkjs"], label: "teacher.examAffairs.deferred.field.teacher" },
    { keys: ["cjlrjs"], label: "teacher.examAffairs.deferred.field.recorder" },
    { keys: ["startTime"], label: "teacher.examAffairs.deferred.field.startTime" },
    { keys: ["endTime"], label: "teacher.examAffairs.deferred.field.endTime" },
    { keys: ["hmkyy"], label: "teacher.examAffairs.deferred.field.reason" },
    { keys: ["xdxz"], label: "teacher.examAffairs.deferred.field.limit" }
  ]
};
const PAPERS_SPEC = {
  titleKeys: ["kcmc"],
  subtitleKeys: ["pcmc"],
  statusKeys: [],
  detailSpecs: [
    { keys: ["kcbh"], label: "teacher.examAffairs.papers.field.courseCode" },
    { keys: ["sjbh"], label: "teacher.examAffairs.papers.field.paperNo" },
    { keys: ["rkjs"], label: "teacher.examAffairs.papers.field.teacher" },
    { keys: ["skbj"], label: "teacher.examAffairs.papers.field.class" },
    { keys: ["zrs"], label: "teacher.examAffairs.papers.field.total" },
    { keys: ["zdsj"], label: "teacher.examAffairs.papers.field.time" },
    { keys: ["fzrxm"], label: "teacher.examAffairs.papers.field.owner" }
  ]
};
const EVAL_SPEC = {
  titleKeys: ["kcmc"],
  subtitleKeys: ["zbmbmc"],
  statusKeys: ["jsxm"],
  detailSpecs: [
    { keys: ["jxbmc"], label: "teacher.examAffairs.eval.field.class" },
    { keys: ["pjsj"], label: "teacher.examAffairs.eval.field.time" },
    { keys: ["bmmc"], label: "teacher.examAffairs.eval.field.dept" },
    { keys: ["yxmc"], label: "teacher.examAffairs.eval.field.college" },
    { keys: ["sksjdd"], label: "teacher.examAffairs.eval.field.place" },
    { keys: ["bz"], label: "teacher.examAffairs.eval.field.note" }
  ]
};
const normalizeExamRows = (list, spec) => asArray(list).map((item, index) => normalizeExamRow(item, index, spec));
const normalizeExamAffairsPayload = (raw) => {
  const payload = asRecord(raw);
  const deferred = normalizeExamRows(payload.deferred, DEFERRED_SPEC);
  const remainingPapers = normalizeExamRows(payload.remainingPapers, PAPERS_SPEC);
  const evalInfo = normalizeExamRows(payload.evalInfo, EVAL_SPEC);
  const allEmpty = payload.allEmpty === true || deferred.length === 0 && remainingPapers.length === 0 && evalInfo.length === 0;
  return { deferred, remainingPapers, evalInfo, allEmpty };
};
const EXAM_AFFAIRS_CACHE_TTL_MS = 5 * 60 * 1e3;
const examAffairsSnapshots = /* @__PURE__ */ new Map();
const EXAM_AFFAIRS_SNAPSHOT_MAX_ENTRIES = 32;
const readExamAffairsSnapshot = (key, now = Date.now()) => {
  const snapshot = examAffairsSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > EXAM_AFFAIRS_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeExamAffairsSnapshot = (key, data, syncedAt) => {
  examAffairsSnapshots.set(key, { syncedAt, data });
  while (examAffairsSnapshots.size > EXAM_AFFAIRS_SNAPSHOT_MAX_ENTRIES) {
    const oldest = examAffairsSnapshots.keys().next().value;
    if (oldest === void 0) break;
    examAffairsSnapshots.delete(oldest);
  }
};
const emptyExamAffairsData = () => ({
  deferred: [],
  remainingPapers: [],
  evalInfo: [],
  allEmpty: true
});
const useTeacherExamAffairs = (options = {}) => {
  const semester = ref(resolveInitialExamAffairsSemester(options.initialSemester));
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
    () => buildTeacherScopedKey("examAffairs", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const data = computed(() => state.value.data);
  const deferred = computed(() => data.value?.deferred ?? []);
  const remainingPapers = computed(() => data.value?.remainingPapers ?? []);
  const evalInfo = computed(() => data.value?.evalInfo ?? []);
  const allEmpty = computed(() => data.value?.allEmpty === true);
  const counts = computed(() => ({
    deferred: deferred.value.length,
    papers: remainingPapers.value.length,
    eval: evalInfo.value.length
  }));
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherExamAffairsErrorKey(state.value.error.kind) : ""
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
    state.value = { status: "ready", data: snapshot.data, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherExamAffairs(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const normalized = normalizeExamAffairsPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (key) writeExamAffairsSnapshot(key, normalized, syncedAt);
      state.value = { status: "ready", data: normalized, error: null };
      return;
    }
    if (result.status === "empty") {
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      const normalized = emptyExamAffairsData();
      if (key) writeExamAffairsSnapshot(key, normalized, syncedAt);
      state.value = { status: "ready", data: normalized, error: null };
      return;
    }
    state.value = { status: "error", data: state.value.data, error: result.error };
  };
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && key) {
      const snapshot = readExamAffairsSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidExamAffairsSemester(next) || next === semester.value) return;
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
    counts,
    deferred,
    remainingPapers,
    evalInfo,
    allEmpty,
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
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-ea" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-ea-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = {
  class: "grid grid-cols-3 gap-2",
  "aria-live": "polite"
};
const _hoisted_8 = { class: "tch-ea-label-caption text-outline mt-1 truncate" };
const _hoisted_9 = {
  key: 0,
  class: "text-center text-[13px] leading-5 text-on-surface-variant py-4"
};
const _hoisted_10 = { class: "flex items-center gap-1.5 px-1" };
const _hoisted_11 = {
  class: "material-symbols-outlined text-primary text-[18px]",
  "aria-hidden": "true"
};
const _hoisted_12 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_13 = { class: "px-2 py-0.5 rounded-full bg-surface-highlight text-primary tch-ea-label-micro font-bold" };
const _hoisted_14 = { class: "flex items-start justify-between gap-2" };
const _hoisted_15 = { class: "tch-ea-title min-w-0" };
const _hoisted_16 = {
  key: 0,
  class: "tch-ea-chip"
};
const _hoisted_17 = {
  key: 0,
  class: "tch-ea-meta text-on-surface-variant mt-1 truncate"
};
const _hoisted_18 = {
  key: 1,
  class: "grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2"
};
const _hoisted_19 = { class: "tch-ea-label-micro text-outline block" };
const _hoisted_20 = { class: "text-[12px] font-medium text-on-surface truncate block mt-0.5" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherExamAffairsView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      data,
      counts,
      deferred,
      remainingPapers,
      evalInfo,
      allEmpty,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherExamAffairs({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => data.value !== null);
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
    const stats = computed(() => [
      { key: "deferred", label: t("teacher.examAffairs.stat.deferred"), value: counts.value.deferred, primary: true },
      { key: "papers", label: t("teacher.examAffairs.stat.papers"), value: counts.value.papers, primary: false },
      { key: "eval", label: t("teacher.examAffairs.stat.eval"), value: counts.value.eval, primary: false }
    ]);
    const visibleSections = computed(() => [
      { key: "deferred", icon: "event_busy", title: t("teacher.examAffairs.section.deferred"), rows: deferred.value },
      { key: "papers", icon: "inventory_2", title: t("teacher.examAffairs.section.papers"), rows: remainingPapers.value },
      { key: "eval", icon: "hotel_class", title: t("teacher.examAffairs.section.eval"), rows: evalInfo.value }
    ].filter((section) => section.rows.length > 0));
    const rowTitle = (item) => item.title || t("teacher.examAffairs.row.fallback");
    const detailLabel = (key) => t(key);
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.examAffairs.title"),
          icon: "task_alt",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-ea-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-ea-semester-pill",
                title: unref(t)("teacher.examAffairs.semester.label")
              }, [
                createBaseVNode("span", _hoisted_3, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_2),
              createBaseVNode("div", {
                class: "tch-ea-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-ea-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-exam-affairs-semester",
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
              "aria-label": unref(t)("teacher.examAffairs.action.refresh"),
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
            message: unref(t)("teacher.examAffairs.loading")
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
              }, toDisplayString(unref(t)("teacher.examAffairs.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : hasData.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("section", _hoisted_7, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(stats.value, (stat) => {
                return openBlock(), createElementBlock("div", {
                  key: stat.key,
                  class: "tch-ea-card px-3 py-3.5 text-center"
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["tch-ea-metric", stat.primary ? "text-primary" : "text-on-surface"])
                  }, toDisplayString(stat.value), 3),
                  createBaseVNode("div", _hoisted_8, toDisplayString(stat.label), 1)
                ]);
              }), 128))
            ]),
            unref(allEmpty) ? (openBlock(), createElementBlock("p", _hoisted_9, toDisplayString(unref(t)("teacher.examAffairs.allEmpty")), 1)) : (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(visibleSections.value, (section) => {
              return openBlock(), createElementBlock("section", {
                key: section.key,
                class: "flex flex-col gap-2"
              }, [
                createBaseVNode("div", _hoisted_10, [
                  createBaseVNode("span", _hoisted_11, toDisplayString(section.icon), 1),
                  createBaseVNode("h2", _hoisted_12, toDisplayString(section.title), 1),
                  createBaseVNode("span", _hoisted_13, toDisplayString(section.rows.length), 1)
                ]),
                (openBlock(true), createElementBlock(Fragment, null, renderList(section.rows, (item) => {
                  return openBlock(), createElementBlock("article", {
                    key: item.key,
                    class: "tch-ea-card p-4"
                  }, [
                    createBaseVNode("div", _hoisted_14, [
                      createBaseVNode("h3", _hoisted_15, toDisplayString(rowTitle(item)), 1),
                      item.status ? (openBlock(), createElementBlock("span", _hoisted_16, toDisplayString(item.status), 1)) : createCommentVNode("", true)
                    ]),
                    item.subtitle ? (openBlock(), createElementBlock("p", _hoisted_17, toDisplayString(item.subtitle), 1)) : createCommentVNode("", true),
                    item.details.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_18, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(item.details, (detail) => {
                        return openBlock(), createElementBlock("div", {
                          key: detail.key,
                          class: "min-w-0"
                        }, [
                          createBaseVNode("span", _hoisted_19, toDisplayString(detailLabel(detail.key)), 1),
                          createBaseVNode("span", _hoisted_20, toDisplayString(detail.value), 1)
                        ]);
                      }), 128))
                    ])) : createCommentVNode("", true)
                  ]);
                }), 128))
              ]);
            }), 128))
          ], 64)) : createCommentVNode("", true),
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
const TeacherExamAffairsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-da66c36d"]]);
export {
  TeacherExamAffairsView as default
};
