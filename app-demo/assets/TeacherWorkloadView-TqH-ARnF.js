import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, d as createCommentVNode, e as normalizeStyle } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, ck as fetchTeacherWorkload, af as asRecord, ab as asNumber, ae as asArray, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherWorkloadErrorKey = (kind) => `teacher.error.${kind}`;
const WORKLOAD_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidWorkloadSemester = (value) => WORKLOAD_SEMESTER_PATTERN.test(value);
const resolveInitialWorkloadSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidWorkloadSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidWorkloadSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const extractWeeklyNumber = (item) => {
  const direct = asNumber(item);
  if (direct !== void 0) return direct;
  const record = asRecord(item);
  for (const key of ["gzl", "value", "hours", "workload", "total"]) {
    const value = asNumber(record[key]);
    if (value !== void 0) return value;
  }
  return null;
};
const normalizeWeeklyValues = (value) => {
  const list = asArray(value);
  if (list.length === 0) return null;
  const values = list.map(extractWeeklyNumber);
  return values.some((item) => item !== null) ? values : null;
};
const normalizeWorkloadPayload = (raw) => {
  const payload = asRecord(raw);
  const fields = asRecord(payload.raw);
  const normalized = {
    gzlSum: asNumber(fields.gzlSum) ?? null,
    jsRzGzlSum: asNumber(fields.jsRzGzlSum) ?? null,
    baseGzlSum: asNumber(fields.baseGzlSum) ?? null,
    edGzlSum: asNumber(fields.edGzlSum) ?? null,
    jsRzGzlList: fields.jsRzGzlList ?? null
  };
  const available = payload.available === true;
  const hasAnyValue = normalized.gzlSum !== null || normalized.jsRzGzlSum !== null || normalized.baseGzlSum !== null || normalized.edGzlSum !== null || normalized.jsRzGzlList !== null;
  return { available, fields: normalized, hasAnyValue };
};
const workloadValueText = (value) => value === null || value === void 0 || !Number.isFinite(value) ? "—" : String(value);
const WORKLOAD_CACHE_TTL_MS = 5 * 60 * 1e3;
const workloadSnapshots = /* @__PURE__ */ new Map();
const WORKLOAD_SNAPSHOT_MAX_ENTRIES = 32;
const readWorkloadSnapshot = (key, now = Date.now()) => {
  const snapshot = workloadSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > WORKLOAD_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeWorkloadSnapshot = (key, data, syncedAt) => {
  workloadSnapshots.set(key, { syncedAt, data });
  while (workloadSnapshots.size > WORKLOAD_SNAPSHOT_MAX_ENTRIES) {
    const oldest = workloadSnapshots.keys().next().value;
    if (oldest === void 0) break;
    workloadSnapshots.delete(oldest);
  }
};
const useTeacherWorkload = (options = {}) => {
  const semester = ref(resolveInitialWorkloadSemester(options.initialSemester));
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
    () => buildTeacherScopedKey("workload", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const fields = computed(
    () => state.value.data?.fields ?? {
      gzlSum: null,
      jsRzGzlSum: null,
      baseGzlSum: null,
      edGzlSum: null,
      jsRzGzlList: null
    }
  );
  const isAvailable = computed(
    () => state.value.data?.available === true && state.value.data?.hasAnyValue === true
  );
  const weeklyValues = computed(
    () => normalizeWeeklyValues(fields.value.jsRzGzlList)
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherWorkloadErrorKey(state.value.error.kind) : ""
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
    const result = await fetchTeacherWorkload(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const data = normalizeWorkloadPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (key) writeWorkloadSnapshot(key, data, syncedAt);
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
      const snapshot = readWorkloadSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidWorkloadSemester(next) || next === semester.value) return;
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
    fields,
    isAvailable,
    weeklyValues,
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
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-workload" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = {
  class: "tch-w-card p-4",
  "aria-live": "polite"
};
const _hoisted_8 = { class: "flex items-center gap-1.5" };
const _hoisted_9 = { class: "text-xs font-semibold text-on-surface-variant" };
const _hoisted_10 = { class: "mt-2" };
const _hoisted_11 = { class: "tch-label-caption text-on-surface-variant" };
const _hoisted_12 = { class: "flex items-baseline gap-1.5 mt-1" };
const _hoisted_13 = {
  key: 0,
  class: "text-base font-bold text-primary"
};
const _hoisted_14 = { class: "tch-label-caption text-on-surface-variant mt-1" };
const _hoisted_15 = { class: "grid grid-cols-3 gap-2 mt-3" };
const _hoisted_16 = { class: "bg-surface-canvas rounded-lg px-2 py-2 text-center" };
const _hoisted_17 = { class: "tch-label-micro text-outline block" };
const _hoisted_18 = { class: "bg-surface-canvas rounded-lg px-2 py-2 text-center" };
const _hoisted_19 = { class: "tch-label-micro text-outline block" };
const _hoisted_20 = { class: "bg-surface-canvas rounded-lg px-2 py-2 text-center" };
const _hoisted_21 = { class: "tch-label-micro text-outline block" };
const _hoisted_22 = { class: "tch-w-card p-4" };
const _hoisted_23 = { class: "flex items-center justify-between" };
const _hoisted_24 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_25 = {
  key: 0,
  class: "tch-label-micro text-on-surface-variant shrink-0"
};
const _hoisted_26 = ["aria-label"];
const _hoisted_27 = { class: "tch-bars flex items-end gap-1.5" };
const _hoisted_28 = ["title"];
const _hoisted_29 = { class: "flex gap-1.5 mt-1" };
const _hoisted_30 = {
  key: 1,
  class: "mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-surface-canvas tch-empty-note"
};
const _hoisted_31 = { class: "text-sm text-on-surface-variant" };
const _hoisted_32 = { class: "tch-w-card p-4" };
const _hoisted_33 = { class: "text-sm font-bold text-on-surface" };
const _hoisted_34 = { class: "tch-label-caption text-on-surface-variant mt-0.5" };
const _hoisted_35 = { class: "mt-2 divide-y divide-surface-muted" };
const _hoisted_36 = { class: "text-sm text-on-surface-variant" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherWorkloadView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      fields,
      isAvailable,
      weeklyValues,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherWorkload({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => isAvailable.value || lastSuccessfulSyncAt.value !== "");
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
    const heroNumber = computed(
      () => isAvailable.value ? workloadValueText(fields.value.gzlSum) : "—"
    );
    const heroSubtitle = computed(
      () => isAvailable.value ? t("teacher.workload.hero.sub") : t("teacher.workload.hero.unavailable")
    );
    const detailRows = computed(() => [
      { key: "base", label: t("teacher.workload.detail.base"), value: isAvailable.value ? workloadValueText(fields.value.baseGzlSum) : "—" },
      { key: "role", label: t("teacher.workload.detail.role"), value: isAvailable.value ? workloadValueText(fields.value.jsRzGzlSum) : "—" },
      { key: "extra", label: t("teacher.workload.detail.extra"), value: isAvailable.value ? workloadValueText(fields.value.edGzlSum) : "—" },
      { key: "total", label: t("teacher.workload.detail.total"), value: isAvailable.value ? workloadValueText(fields.value.gzlSum) : "—" }
    ]);
    const weeklyMax = computed(() => {
      const list = weeklyValues.value;
      if (!list) return 0;
      return Math.max(0, ...list.map((value) => value ?? 0));
    });
    const weeklyBarHeight = (value) => {
      if (value === null || !Number.isFinite(value) || weeklyMax.value <= 0) return "8%";
      const percent = Math.max(8, Math.min(100, value / weeklyMax.value * 100));
      return `${percent.toFixed(1)}%`;
    };
    const weeklyBarClass = (value) => value === null ? "bg-surface-track" : "bg-primary";
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.workload.title"),
          icon: "work",
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
                title: unref(t)("teacher.workload.semester.label")
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
                      name: "tch-workload-semester",
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
              "aria-label": unref(t)("teacher.workload.action.refresh"),
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
            message: unref(t)("teacher.workload.loading")
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
              }, toDisplayString(unref(t)("teacher.workload.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            message: unref(t)("teacher.workload.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_7, [
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("span", {
                  class: normalizeClass(["w-2 h-2 rounded-full", unref(isAvailable) ? "bg-success" : "bg-surface-track"])
                }, null, 2),
                createBaseVNode("span", _hoisted_9, toDisplayString(unref(semester)), 1)
              ]),
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("p", _hoisted_11, toDisplayString(unref(t)("teacher.workload.hero.title")), 1),
                createBaseVNode("div", _hoisted_12, [
                  createBaseVNode("span", {
                    class: normalizeClass(["tch-kpi", unref(isAvailable) ? "text-primary" : "text-on-surface-variant"])
                  }, toDisplayString(heroNumber.value), 3),
                  unref(isAvailable) ? (openBlock(), createElementBlock("span", _hoisted_13, toDisplayString(unref(t)("teacher.workload.hero.unit")), 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("p", _hoisted_14, toDisplayString(heroSubtitle.value), 1)
              ]),
              createBaseVNode("div", _hoisted_15, [
                createBaseVNode("div", _hoisted_16, [
                  createBaseVNode("span", _hoisted_17, toDisplayString(unref(t)("teacher.workload.detail.base")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["text-sm font-bold block mt-0.5", unref(isAvailable) && unref(fields).baseGzlSum !== null ? "text-on-surface" : "text-on-surface-variant"])
                  }, toDisplayString(unref(isAvailable) ? unref(workloadValueText)(unref(fields).baseGzlSum) : "—"), 3)
                ]),
                createBaseVNode("div", _hoisted_18, [
                  createBaseVNode("span", _hoisted_19, toDisplayString(unref(t)("teacher.workload.detail.role")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["text-sm font-bold block mt-0.5", unref(isAvailable) && unref(fields).jsRzGzlSum !== null ? "text-on-surface" : "text-on-surface-variant"])
                  }, toDisplayString(unref(isAvailable) ? unref(workloadValueText)(unref(fields).jsRzGzlSum) : "—"), 3)
                ]),
                createBaseVNode("div", _hoisted_20, [
                  createBaseVNode("span", _hoisted_21, toDisplayString(unref(t)("teacher.workload.detail.extra")), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["text-sm font-bold block mt-0.5", unref(isAvailable) && unref(fields).edGzlSum !== null ? "text-on-surface" : "text-on-surface-variant"])
                  }, toDisplayString(unref(isAvailable) ? unref(workloadValueText)(unref(fields).edGzlSum) : "—"), 3)
                ])
              ])
            ]),
            createBaseVNode("section", _hoisted_22, [
              createBaseVNode("div", _hoisted_23, [
                createBaseVNode("h2", _hoisted_24, toDisplayString(unref(t)("teacher.workload.chart.title")), 1),
                unref(weeklyValues) ? (openBlock(), createElementBlock("span", _hoisted_25, toDisplayString(unref(tf)("teacher.workload.chart.weeks", { n: unref(weeklyValues).length })), 1)) : createCommentVNode("", true)
              ]),
              unref(weeklyValues) ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "mt-3",
                role: "img",
                "aria-label": unref(t)("teacher.workload.chart.title")
              }, [
                createBaseVNode("div", _hoisted_27, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(weeklyValues), (value, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: index,
                      class: "flex-1 h-full flex items-end"
                    }, [
                      createBaseVNode("div", {
                        class: normalizeClass(["tch-bar w-full", weeklyBarClass(value)]),
                        style: normalizeStyle({ height: weeklyBarHeight(value) }),
                        title: value === null ? "—" : String(value)
                      }, null, 14, _hoisted_28)
                    ]);
                  }), 128))
                ]),
                createBaseVNode("div", _hoisted_29, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(weeklyValues), (_, index) => {
                    return openBlock(), createElementBlock("span", {
                      key: index,
                      class: "flex-1 text-center tch-label-micro text-outline"
                    }, toDisplayString(index + 1), 1);
                  }), 128))
                ])
              ], 8, _hoisted_26)) : (openBlock(), createElementBlock("div", _hoisted_30, [
                _cache[2] || (_cache[2] = createBaseVNode("span", {
                  class: "material-symbols-outlined text-[18px] text-outline",
                  "aria-hidden": "true"
                }, "bar_chart", -1)),
                createBaseVNode("span", _hoisted_31, toDisplayString(unref(t)("teacher.workload.chart.empty")), 1)
              ]))
            ]),
            createBaseVNode("section", _hoisted_32, [
              createBaseVNode("h2", _hoisted_33, toDisplayString(unref(t)("teacher.workload.detail.title")), 1),
              createBaseVNode("p", _hoisted_34, toDisplayString(unref(t)("teacher.workload.detail.source")), 1),
              createBaseVNode("ul", _hoisted_35, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(detailRows.value, (row) => {
                  return openBlock(), createElementBlock("li", {
                    key: row.key,
                    class: "flex items-center justify-between py-2.5"
                  }, [
                    createBaseVNode("span", _hoisted_36, toDisplayString(row.label), 1),
                    createBaseVNode("span", {
                      class: normalizeClass(["text-sm font-bold", row.value === "—" ? "text-on-surface-variant" : "text-on-surface"])
                    }, toDisplayString(row.value), 3)
                  ]);
                }), 128))
              ])
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
const TeacherWorkloadView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-5928aac5"]]);
export {
  TeacherWorkloadView as default
};
