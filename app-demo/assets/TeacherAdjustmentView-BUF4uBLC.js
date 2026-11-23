import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, d as createCommentVNode } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, cn as fetchTeacherAdjustment, ad as dedupeByStableKey, ae as asArray, af as asRecord, a9 as asString, ac as buildStableKey, ay as normalizeTeacherText, ab as asNumber, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherAdjustmentErrorKey = (kind) => `teacher.error.${kind}`;
const ADJUSTMENT_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidAdjustmentSemester = (value) => ADJUSTMENT_SEMESTER_PATTERN.test(value);
const resolveInitialAdjustmentSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidAdjustmentSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidAdjustmentSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const normalizeAdjustmentCourse = (value, index) => {
  const record = asRecord(value);
  const courseName = normalizeTeacherText(record.courseName ?? record.kcmc);
  const className = normalizeTeacherText(record.className ?? record.jxbmc);
  const classNo = asString(record.classNo ?? record.jxbbh);
  return {
    key: buildStableKey([classNo, courseName, className, index]),
    courseName,
    className,
    classNo,
    weeklyHours: asNumber(record.weeklyHours ?? record.zsqs) ?? null,
    totalHours: asNumber(record.totalHours ?? record.tzzxs) ?? null,
    isLeaf: typeof record.isLeaf === "boolean" ? record.isLeaf : typeof record.leaf === "boolean" ? record.leaf : null
  };
};
const APPLY_TITLE_KEYS = [
  "kcmc",
  "courseName",
  "jxbmc",
  "className",
  "sqxx",
  "definitionName",
  "busiType",
  "title",
  "bt",
  "name"
];
const APPLY_STATUS_KEYS = ["shzt", "dqspzt", "status", "sqzt", "zt", "dqstatus", "spzt"];
const APPLY_TIME_KEYS = [
  "createTime",
  "sqsj",
  "sqrq",
  "djtime",
  "endTime",
  "time",
  "date",
  "ksrq"
];
const APPLY_USED_KEYS = /* @__PURE__ */ new Set([
  ...APPLY_TITLE_KEYS,
  ...APPLY_STATUS_KEYS,
  ...APPLY_TIME_KEYS
]);
const APPLY_SKIP_KEYS = /^(id|.*_id|.*id|encodeid|processinstanceidenc|new)$/i;
const APPLY_EXTRAS_MAX = 4;
const pickFirstText = (record, keys) => {
  for (const key of keys) {
    const text = normalizeTeacherText(record[key]);
    if (text) return text;
  }
  return "";
};
const normalizeAdjustmentApply = (value, index) => {
  const record = asRecord(value);
  const title = pickFirstText(record, APPLY_TITLE_KEYS);
  const status = pickFirstText(record, APPLY_STATUS_KEYS);
  const time = pickFirstText(record, APPLY_TIME_KEYS);
  const extras = [];
  for (const [fieldKey, fieldValue] of Object.entries(record)) {
    if (extras.length >= APPLY_EXTRAS_MAX) break;
    if (APPLY_USED_KEYS.has(fieldKey)) continue;
    if (APPLY_SKIP_KEYS.test(fieldKey)) continue;
    const text = asString(fieldValue);
    if (!text || text.length > 40) continue;
    extras.push({ key: fieldKey, value: text });
  }
  return {
    key: buildStableKey([asString(record.id), title, time, index]),
    title,
    status,
    time,
    extras
  };
};
const normalizeAdjustmentPayload = (raw) => {
  const payload = asRecord(raw);
  const myApply = dedupeByStableKey(
    asArray(payload.myApply).map(normalizeAdjustmentApply),
    (item) => item.key
  );
  const applicable = dedupeByStableKey(
    asArray(payload.applicable).map(normalizeAdjustmentCourse),
    (item) => item.key
  );
  return { myApply, applicable };
};
const ADJUSTMENT_CACHE_TTL_MS = 5 * 60 * 1e3;
const adjustmentSnapshots = /* @__PURE__ */ new Map();
const ADJUSTMENT_SNAPSHOT_MAX_ENTRIES = 32;
const readAdjustmentSnapshot = (key, now = Date.now()) => {
  const snapshot = adjustmentSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > ADJUSTMENT_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeAdjustmentSnapshot = (key, data, syncedAt) => {
  adjustmentSnapshots.set(key, { syncedAt, data });
  while (adjustmentSnapshots.size > ADJUSTMENT_SNAPSHOT_MAX_ENTRIES) {
    const oldest = adjustmentSnapshots.keys().next().value;
    if (oldest === void 0) break;
    adjustmentSnapshots.delete(oldest);
  }
};
const useTeacherAdjustment = (options = {}) => {
  const semester = ref(resolveInitialAdjustmentSemester(options.initialSemester));
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
    () => buildTeacherScopedKey("adjustment", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const data = computed(() => state.value.data);
  const myApply = computed(() => state.value.data?.myApply ?? []);
  const applicable = computed(
    () => state.value.data?.applicable ?? []
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherAdjustmentErrorKey(state.value.error.kind) : ""
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
    const empty = snapshot.data.myApply.length === 0 && snapshot.data.applicable.length === 0;
    state.value = empty ? { status: "empty", data: null, error: { kind: "empty", message: "" } } : { status: "ready", data: snapshot.data, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherAdjustment(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const normalized = normalizeAdjustmentPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (normalized.myApply.length === 0 && normalized.applicable.length === 0) {
        state.value = { status: "empty", data: null, error: { kind: "empty", message: "" } };
        return;
      }
      if (key) writeAdjustmentSnapshot(key, normalized, syncedAt);
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
      const snapshot = readAdjustmentSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidAdjustmentSemester(next) || next === semester.value) return;
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
    myApply,
    applicable,
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
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-adj" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-adj-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = {
  key: 0,
  class: "flex flex-col gap-2"
};
const _hoisted_8 = { class: "flex items-center justify-between px-1" };
const _hoisted_9 = { class: "flex items-center gap-1.5 min-w-0" };
const _hoisted_10 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_11 = { class: "tch-adj-label-caption text-on-surface-variant" };
const _hoisted_12 = { class: "flex items-start justify-between gap-2 min-w-0" };
const _hoisted_13 = { class: "min-w-0" };
const _hoisted_14 = { class: "tch-adj-title truncate" };
const _hoisted_15 = ["title"];
const _hoisted_16 = {
  key: 0,
  class: "tch-adj-chip shrink-0"
};
const _hoisted_17 = { class: "flex flex-col gap-2" };
const _hoisted_18 = { class: "flex items-center justify-between px-1" };
const _hoisted_19 = { class: "flex items-center gap-1.5 min-w-0" };
const _hoisted_20 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_21 = { class: "tch-adj-label-caption text-on-surface-variant" };
const _hoisted_22 = {
  key: 0,
  class: "tch-adj-card p-4"
};
const _hoisted_23 = { class: "flex items-center gap-2 p-2.5 rounded-lg bg-surface-canvas tch-adj-note" };
const _hoisted_24 = { class: "text-sm text-on-surface-variant" };
const _hoisted_25 = { class: "flex items-start justify-between gap-2 min-w-0" };
const _hoisted_26 = { class: "tch-adj-title min-w-0 truncate" };
const _hoisted_27 = {
  key: 0,
  class: "tch-adj-chip shrink-0"
};
const _hoisted_28 = {
  key: 0,
  class: "tch-adj-meta text-on-surface-variant mt-1 truncate"
};
const _hoisted_29 = {
  key: 1,
  class: "grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2"
};
const _hoisted_30 = { class: "tch-adj-label-micro text-outline block truncate" };
const _hoisted_31 = { class: "text-[12px] font-medium text-on-surface truncate block mt-0.5" };
const _hoisted_32 = { class: "tch-adj-footnote text-center pb-1" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherAdjustmentView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      myApply,
      applicable,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherAdjustment({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => myApply.value.length > 0 || applicable.value.length > 0);
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
    const applicableCountText = computed(
      () => tf("teacher.adjustment.applicable.count", { n: applicable.value.length })
    );
    const myApplyCountText = computed(
      () => tf("teacher.adjustment.myApply.count", { n: myApply.value.length })
    );
    const courseMeta = (item) => {
      const parts = [];
      if (item.className) parts.push(item.className);
      if (item.weeklyHours !== null) {
        parts.push(tf("teacher.adjustment.course.weeklyHours", { n: item.weeklyHours }));
      }
      return parts.join(" · ");
    };
    const totalHoursText = (item) => item.totalHours === null ? "" : tf("teacher.adjustment.course.totalHours", { n: item.totalHours });
    const applyTitle = (item, index) => item.title || tf("teacher.adjustment.apply.fallback", { n: index + 1 });
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.adjustment.title"),
          icon: "edit_calendar",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-adj-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-adj-semester-pill",
                title: unref(t)("teacher.adjustment.semester.label")
              }, [
                createBaseVNode("span", _hoisted_3, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_2),
              createBaseVNode("div", {
                class: "tch-adj-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-adj-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-adjustment-semester",
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
              "aria-label": unref(t)("teacher.adjustment.action.refresh"),
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
            message: unref(t)("teacher.adjustment.loading")
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
              }, toDisplayString(unref(t)("teacher.adjustment.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.adjustment.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            unref(applicable).length > 0 ? (openBlock(), createElementBlock("section", _hoisted_7, [
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("div", _hoisted_9, [
                  _cache[2] || (_cache[2] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-primary text-[18px]",
                    "aria-hidden": "true"
                  }, "class", -1)),
                  createBaseVNode("h2", _hoisted_10, toDisplayString(unref(t)("teacher.adjustment.applicable.title")), 1)
                ]),
                createBaseVNode("span", _hoisted_11, toDisplayString(applicableCountText.value), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(applicable), (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.key,
                  class: "tch-adj-card tch-adj-course p-4"
                }, [
                  createBaseVNode("div", _hoisted_12, [
                    createBaseVNode("div", _hoisted_13, [
                      createBaseVNode("h3", _hoisted_14, toDisplayString(item.courseName || "—"), 1),
                      courseMeta(item) ? (openBlock(), createElementBlock("p", {
                        key: 0,
                        class: "tch-adj-meta text-on-surface-variant mt-1 truncate",
                        title: courseMeta(item)
                      }, toDisplayString(courseMeta(item)), 9, _hoisted_15)) : createCommentVNode("", true)
                    ]),
                    totalHoursText(item) ? (openBlock(), createElementBlock("span", _hoisted_16, toDisplayString(totalHoursText(item)), 1)) : createCommentVNode("", true)
                  ])
                ]);
              }), 128))
            ])) : createCommentVNode("", true),
            createBaseVNode("section", _hoisted_17, [
              createBaseVNode("div", _hoisted_18, [
                createBaseVNode("div", _hoisted_19, [
                  _cache[3] || (_cache[3] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-primary text-[18px]",
                    "aria-hidden": "true"
                  }, "assignment", -1)),
                  createBaseVNode("h2", _hoisted_20, toDisplayString(unref(t)("teacher.adjustment.myApply.title")), 1)
                ]),
                createBaseVNode("span", _hoisted_21, toDisplayString(myApplyCountText.value), 1)
              ]),
              unref(myApply).length === 0 ? (openBlock(), createElementBlock("div", _hoisted_22, [
                createBaseVNode("div", _hoisted_23, [
                  _cache[4] || (_cache[4] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-[18px] text-outline",
                    "aria-hidden": "true"
                  }, "inbox", -1)),
                  createBaseVNode("span", _hoisted_24, toDisplayString(unref(t)("teacher.adjustment.myApply.empty")), 1)
                ])
              ])) : (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(unref(myApply), (item, index) => {
                return openBlock(), createElementBlock("article", {
                  key: item.key,
                  class: "tch-adj-card p-4"
                }, [
                  createBaseVNode("div", _hoisted_25, [
                    createBaseVNode("h3", _hoisted_26, toDisplayString(applyTitle(item, index)), 1),
                    item.status ? (openBlock(), createElementBlock("span", _hoisted_27, toDisplayString(item.status), 1)) : createCommentVNode("", true)
                  ]),
                  item.time ? (openBlock(), createElementBlock("p", _hoisted_28, toDisplayString(item.time), 1)) : createCommentVNode("", true),
                  item.extras.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_29, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(item.extras, (extra) => {
                      return openBlock(), createElementBlock("div", {
                        key: extra.key,
                        class: "min-w-0"
                      }, [
                        createBaseVNode("span", _hoisted_30, toDisplayString(extra.key), 1),
                        createBaseVNode("span", _hoisted_31, toDisplayString(extra.value), 1)
                      ]);
                    }), 128))
                  ])) : createCommentVNode("", true)
                ]);
              }), 128))
            ]),
            createBaseVNode("p", _hoisted_32, toDisplayString(unref(t)("teacher.adjustment.footer.readonly")), 1)
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
const TeacherAdjustmentView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-a10af8ee"]]);
export {
  TeacherAdjustmentView as default
};
