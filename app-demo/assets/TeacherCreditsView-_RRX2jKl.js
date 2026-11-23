import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, d as createCommentVNode } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, cm as fetchTeacherCredits, ad as dedupeByStableKey, ae as asArray, af as asRecord, a9 as asString, ay as normalizeTeacherText, ac as buildStableKey, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherCreditsErrorKey = (kind) => `teacher.error.${kind}`;
const CREDITS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidCreditsSemester = (value) => CREDITS_SEMESTER_PATTERN.test(value);
const resolveInitialCreditsSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidCreditsSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidCreditsSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const tierSortKey = (key) => {
  const parsed = Number(key);
  return Number.isFinite(parsed) ? { numeric: true, value: parsed, text: key } : { numeric: false, value: 0, text: key };
};
const compareTierKeys = (a, b) => {
  const ka = tierSortKey(a);
  const kb = tierSortKey(b);
  if (ka.numeric && kb.numeric) return ka.value - kb.value;
  if (ka.numeric !== kb.numeric) return ka.numeric ? -1 : 1;
  return ka.text.localeCompare(kb.text);
};
const normalizeCreditCell = (value) => {
  const record = asRecord(value);
  const key = normalizeTeacherText(record.key);
  if (!key) return null;
  return { key, value: asString(record.value) };
};
const normalizeCreditRow = (value, index) => {
  const record = asRecord(value);
  const studentId = asString(record.studentId);
  const majorName = normalizeTeacherText(record.majorName) || null;
  const className = normalizeTeacherText(record.className) || null;
  const cells = asArray(record.cells).map(normalizeCreditCell).filter((cell) => cell !== null).sort((a, b) => compareTierKeys(a.key, b.key));
  return {
    key: buildStableKey([studentId || "unknown", className, index]),
    studentId,
    majorName,
    className,
    cells
  };
};
const normalizeFailedCourse = (value, index) => {
  const record = asRecord(value);
  const courseName = normalizeTeacherText(record.kcmc);
  const courseCode = asString(record.kcdm);
  const courseNo = asString(record.kcbh);
  return {
    key: buildStableKey([courseNo || courseCode || courseName, index]),
    courseName,
    courseCode,
    courseNo,
    credit: asString(record.xf),
    grade: asString(record.cj)
  };
};
const normalizeCreditsPayload = (raw) => {
  const payload = asRecord(raw);
  const rows = dedupeByStableKey(
    asArray(payload.rows).map(normalizeCreditRow),
    (item) => item.key
  );
  const failedCourses = dedupeByStableKey(
    asArray(payload.failedCourses).map(normalizeFailedCourse),
    (item) => item.key
  );
  return { rows, failedCourses };
};
const CREDITS_CACHE_TTL_MS = 5 * 60 * 1e3;
const creditsSnapshots = /* @__PURE__ */ new Map();
const CREDITS_SNAPSHOT_MAX_ENTRIES = 32;
const readCreditsSnapshot = (key, now = Date.now()) => {
  const snapshot = creditsSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > CREDITS_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeCreditsSnapshot = (key, data, syncedAt) => {
  creditsSnapshots.set(key, { syncedAt, data });
  while (creditsSnapshots.size > CREDITS_SNAPSHOT_MAX_ENTRIES) {
    const oldest = creditsSnapshots.keys().next().value;
    if (oldest === void 0) break;
    creditsSnapshots.delete(oldest);
  }
};
const useTeacherCredits = (options = {}) => {
  const semester = ref(resolveInitialCreditsSemester(options.initialSemester));
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
    () => buildTeacherScopedKey("credits", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const data = computed(() => state.value.data);
  const rows = computed(() => state.value.data?.rows ?? []);
  const failedCourses = computed(
    () => state.value.data?.failedCourses ?? []
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherCreditsErrorKey(state.value.error.kind) : ""
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
    const empty = snapshot.data.rows.length === 0 && snapshot.data.failedCourses.length === 0;
    state.value = empty ? { status: "empty", data: null, error: { kind: "empty", message: "" } } : { status: "ready", data: snapshot.data, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherCredits(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const normalized = normalizeCreditsPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (normalized.rows.length === 0 && normalized.failedCourses.length === 0) {
        state.value = { status: "empty", data: null, error: { kind: "empty", message: "" } };
        return;
      }
      if (key) writeCreditsSnapshot(key, normalized, syncedAt);
      state.value = { status: "ready", data: normalized, error: null };
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
      const snapshot = readCreditsSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidCreditsSemester(next) || next === semester.value) return;
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
    rows,
    failedCourses,
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
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-cr" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-cr-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = {
  key: 0,
  class: "flex flex-col gap-2"
};
const _hoisted_8 = { class: "flex items-center justify-between px-1" };
const _hoisted_9 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_10 = { class: "tch-cr-label-caption text-on-surface-variant" };
const _hoisted_11 = { class: "min-w-0" };
const _hoisted_12 = { class: "tch-cr-title truncate" };
const _hoisted_13 = ["title"];
const _hoisted_14 = {
  key: 0,
  class: "tch-cr-scroll mt-3"
};
const _hoisted_15 = { class: "tch-cr-tierrow" };
const _hoisted_16 = { class: "tch-cr-tierkey text-on-surface-variant" };
const _hoisted_17 = { class: "tch-cr-tiervalue" };
const _hoisted_18 = {
  key: 1,
  class: "mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-surface-canvas tch-cr-note"
};
const _hoisted_19 = { class: "text-sm text-on-surface-variant" };
const _hoisted_20 = {
  key: 1,
  class: "flex flex-col gap-2"
};
const _hoisted_21 = { class: "flex items-center justify-between px-1" };
const _hoisted_22 = { class: "flex items-center gap-1.5 min-w-0" };
const _hoisted_23 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_24 = { class: "tch-cr-label-caption text-on-surface-variant" };
const _hoisted_25 = { class: "flex items-start justify-between gap-2 min-w-0" };
const _hoisted_26 = { class: "min-w-0" };
const _hoisted_27 = { class: "tch-cr-title truncate" };
const _hoisted_28 = {
  key: 0,
  class: "tch-cr-meta text-on-surface-variant mt-0.5 truncate"
};
const _hoisted_29 = {
  key: 0,
  class: "tch-cr-chip tch-cr-chip--danger shrink-0"
};
const _hoisted_30 = { class: "tch-cr-footnote text-center pb-1" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherCreditsView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      rows,
      failedCourses,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherCredits({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => rows.value.length > 0 || failedCourses.value.length > 0);
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
    const studentCountText = computed(
      () => tf("teacher.credits.students.count", { n: rows.value.length })
    );
    const failedCountText = computed(
      () => tf("teacher.credits.failed.count", { n: failedCourses.value.length })
    );
    const tierLabel = (key) => tf("teacher.credits.tier", { key });
    const rowMeta = (item) => {
      const parts = [item.majorName, item.className].filter(
        (part) => Boolean(part)
      );
      return parts.length > 0 ? parts.join(" · ") : "—";
    };
    const failedCourseMeta = (item) => {
      const parts = [];
      if (item.courseCode) parts.push(item.courseCode);
      if (item.credit) parts.push(tf("teacher.credits.failed.credit", { n: item.credit }));
      return parts.join(" · ");
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.credits.title"),
          icon: "school",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-cr-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-cr-semester-pill",
                title: unref(t)("teacher.credits.semester.label")
              }, [
                createBaseVNode("span", _hoisted_3, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_2),
              createBaseVNode("div", {
                class: "tch-cr-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-cr-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-credits-semester",
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
              "aria-label": unref(t)("teacher.credits.action.refresh"),
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
            message: unref(t)("teacher.credits.loading")
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
              }, toDisplayString(unref(t)("teacher.credits.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.credits.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            unref(rows).length > 0 ? (openBlock(), createElementBlock("section", _hoisted_7, [
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("h2", _hoisted_9, toDisplayString(unref(t)("teacher.credits.students.title")), 1),
                createBaseVNode("span", _hoisted_10, toDisplayString(studentCountText.value), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(rows), (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.key,
                  class: "tch-cr-card p-4"
                }, [
                  createBaseVNode("div", _hoisted_11, [
                    createBaseVNode("h3", _hoisted_12, toDisplayString(item.studentId || "—"), 1),
                    createBaseVNode("p", {
                      class: "tch-cr-meta text-on-surface-variant mt-0.5 truncate",
                      title: rowMeta(item)
                    }, toDisplayString(rowMeta(item)), 9, _hoisted_13)
                  ]),
                  item.cells.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_14, [
                    createBaseVNode("div", _hoisted_15, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(item.cells, (cell) => {
                        return openBlock(), createElementBlock("div", {
                          key: cell.key,
                          class: "tch-cr-tiercol"
                        }, [
                          createBaseVNode("span", _hoisted_16, toDisplayString(tierLabel(cell.key)), 1),
                          createBaseVNode("span", _hoisted_17, toDisplayString(cell.value || "—"), 1)
                        ]);
                      }), 128))
                    ])
                  ])) : (openBlock(), createElementBlock("div", _hoisted_18, [
                    _cache[2] || (_cache[2] = createBaseVNode("span", {
                      class: "material-symbols-outlined text-[18px] text-outline",
                      "aria-hidden": "true"
                    }, "hourglass_empty", -1)),
                    createBaseVNode("span", _hoisted_19, toDisplayString(unref(t)("teacher.credits.row.noCells")), 1)
                  ]))
                ]);
              }), 128))
            ])) : createCommentVNode("", true),
            unref(failedCourses).length > 0 ? (openBlock(), createElementBlock("section", _hoisted_20, [
              createBaseVNode("div", _hoisted_21, [
                createBaseVNode("div", _hoisted_22, [
                  _cache[3] || (_cache[3] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-danger text-[18px]",
                    "aria-hidden": "true"
                  }, "warning", -1)),
                  createBaseVNode("h2", _hoisted_23, toDisplayString(unref(t)("teacher.credits.failed.title")), 1)
                ]),
                createBaseVNode("span", _hoisted_24, toDisplayString(failedCountText.value), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(failedCourses), (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.key,
                  class: "tch-cr-card tch-cr-failcard p-4"
                }, [
                  createBaseVNode("div", _hoisted_25, [
                    createBaseVNode("div", _hoisted_26, [
                      createBaseVNode("h3", _hoisted_27, toDisplayString(item.courseName || "—"), 1),
                      failedCourseMeta(item) ? (openBlock(), createElementBlock("p", _hoisted_28, toDisplayString(failedCourseMeta(item)), 1)) : createCommentVNode("", true)
                    ]),
                    item.grade ? (openBlock(), createElementBlock("span", _hoisted_29, toDisplayString(unref(tf)("teacher.credits.failed.grade", { n: item.grade })), 1)) : createCommentVNode("", true)
                  ])
                ]);
              }), 128))
            ])) : createCommentVNode("", true),
            createBaseVNode("p", _hoisted_30, toDisplayString(unref(t)("teacher.credits.tier.note")), 1)
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
const TeacherCreditsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-76ddd6f3"]]);
export {
  TeacherCreditsView as default
};
