import { r as ref, h as computed, i as defineComponent, x as watch, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, j as createBlock, d as createCommentVNode } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, ci as fetchTeacherWorkflow, ae as asArray, af as asRecord, a9 as asString, aa as stripTeacherHtml, u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { r as readStoredSemester, d as deriveSemesterByDate, t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./constants-BEIPv_h0.js";
const teacherWorkflowErrorKey = (kind) => `teacher.error.${kind}`;
const WORKFLOW_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidWorkflowSemester = (value) => WORKFLOW_SEMESTER_PATTERN.test(value);
const resolveInitialWorkflowSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidWorkflowSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidWorkflowSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const WORKFLOW_STATUS_REJECT_KEYWORDS = ["驳回", "退回", "拒绝"];
const WORKFLOW_STATUS_DONE_KEYWORDS = ["完成", "办结", "通过"];
const WORKFLOW_STATUS_PENDING_KEYWORDS = ["中", "审", "办"];
const resolveWorkflowStatus = (record) => asString(record.status) || asString(record.checkstatus) || asString(record.shzt);
const workflowStatusTone = (status) => {
  const text = status.trim();
  if (!text) return "neutral";
  if (WORKFLOW_STATUS_REJECT_KEYWORDS.some((word) => text.includes(word))) return "rejected";
  if (WORKFLOW_STATUS_DONE_KEYWORDS.some((word) => text.includes(word))) return "done";
  if (WORKFLOW_STATUS_PENDING_KEYWORDS.some((word) => text.includes(word))) return "pending";
  return "neutral";
};
const workflowDate = (value) => {
  const text = value.trim();
  if (!text) return "";
  const date = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : text;
};
const normalizeWorkflowRow = (value, index) => {
  const record = asRecord(value);
  const processInstanceId = asString(record.processInstanceId) || asString(record.id) || `workflow-row-${index}`;
  const status = resolveWorkflowStatus(record);
  return {
    key: processInstanceId,
    processInstanceId,
    processInstanceIdEnc: asString(record.processInstanceIdEnc),
    title: stripTeacherHtml(record.definitionName),
    createTime: workflowDate(asString(record.createTime)),
    endTime: workflowDate(asString(record.endTime)),
    status,
    tone: workflowStatusTone(status),
    opinion: stripTeacherHtml(record.clyj)
  };
};
const normalizeWorkflowPayload = (raw) => {
  const payload = asRecord(raw);
  const apply = asArray(payload.myApply).map(normalizeWorkflowRow);
  const handled = asArray(payload.myHandled).map(normalizeWorkflowRow);
  const todo = asArray(payload.myTodo).map(normalizeWorkflowRow);
  return {
    counts: { apply: apply.length, todo: todo.length, handled: handled.length },
    apply,
    todo,
    handled
  };
};
const WORKFLOW_CACHE_TTL_MS = 5 * 60 * 1e3;
const workflowSnapshots = /* @__PURE__ */ new Map();
const WORKFLOW_SNAPSHOT_MAX_ENTRIES = 32;
const readWorkflowSnapshot = (key, now = Date.now()) => {
  const snapshot = workflowSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > WORKFLOW_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeWorkflowSnapshot = (key, data, syncedAt) => {
  workflowSnapshots.set(key, { syncedAt, data });
  while (workflowSnapshots.size > WORKFLOW_SNAPSHOT_MAX_ENTRIES) {
    const oldest = workflowSnapshots.keys().next().value;
    if (oldest === void 0) break;
    workflowSnapshots.delete(oldest);
  }
};
const emptyWorkflowData = () => ({
  counts: { apply: 0, todo: 0, handled: 0 },
  apply: [],
  todo: [],
  handled: []
});
const useTeacherWorkflow = (options = {}) => {
  const semester = ref(resolveInitialWorkflowSemester(options.initialSemester));
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
    () => buildTeacherScopedKey("workflow", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const data = computed(() => state.value.data);
  const counts = computed(() => data.value?.counts ?? { apply: 0, todo: 0, handled: 0 });
  const rows = computed(() => ({
    apply: data.value?.apply ?? [],
    todo: data.value?.todo ?? [],
    handled: data.value?.handled ?? []
  }));
  const todoCount = computed(() => counts.value.todo);
  const allEmpty = computed(
    () => counts.value.apply + counts.value.todo + counts.value.handled === 0
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherWorkflowErrorKey(state.value.error.kind) : ""
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
    const result = await fetchTeacherWorkflow(semester.value, { scope: account });
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      const normalized = normalizeWorkflowPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (key) writeWorkflowSnapshot(key, normalized, syncedAt);
      state.value = { status: "ready", data: normalized, error: null };
      return;
    }
    if (result.status === "empty") {
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      const normalized = emptyWorkflowData();
      if (key) writeWorkflowSnapshot(key, normalized, syncedAt);
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
      const snapshot = readWorkflowSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidWorkflowSemester(next) || next === semester.value) return;
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
    rows,
    todoCount,
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
const _hoisted_1 = { class: "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-wf" };
const _hoisted_2 = ["title"];
const _hoisted_3 = { class: "tch-wf-label-micro" };
const _hoisted_4 = ["value", "disabled"];
const _hoisted_5 = ["aria-label", "disabled"];
const _hoisted_6 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_7 = ["aria-label"];
const _hoisted_8 = ["aria-selected", "onClick"];
const _hoisted_9 = { class: "tch-wf-seg-count" };
const _hoisted_10 = {
  key: 0,
  class: "tch-wf-seg-badge",
  "aria-hidden": "true"
};
const _hoisted_11 = {
  key: 1,
  class: "flex flex-col gap-2.5",
  "aria-live": "polite"
};
const _hoisted_12 = { class: "flex items-start justify-between gap-2" };
const _hoisted_13 = { class: "tch-wf-title min-w-0" };
const _hoisted_14 = { class: "tch-wf-meta text-on-surface-variant mt-1" };
const _hoisted_15 = {
  key: 0,
  class: "tch-wf-opinion mt-2"
};
const _hoisted_16 = { class: "tch-wf-opinion-summary" };
const _hoisted_17 = { class: "tch-wf-opinion-body" };
const _hoisted_18 = { class: "tch-wf-footnote" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherWorkflowView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      data,
      counts,
      rows,
      todoCount,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherWorkflow({ accountId: () => resolveTeacherAccountId(auth.studentId) });
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
    const activeTab = ref("apply");
    const tabs = ["apply", "todo", "handled"];
    const tabLabel = (tab) => t(`teacher.workflow.tab.${tab}`);
    const activeRows = computed(() => rows.value[activeTab.value]);
    const tabButtonClass = (tab) => activeTab.value === tab ? "tch-wf-seg-btn tch-wf-seg-btn--active" : "tch-wf-seg-btn";
    const badgeClass = (tone) => `tch-wf-badge tch-wf-badge--${tone}`;
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.workflow.title"),
          icon: "account_tree",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-wf-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-wf-semester-pill",
                title: unref(t)("teacher.workflow.semester.label")
              }, [
                createBaseVNode("span", _hoisted_3, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_2),
              createBaseVNode("div", {
                class: "tch-wf-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-wf-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-workflow-semester",
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
              "aria-label": unref(t)("teacher.workflow.action.refresh"),
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
            message: unref(t)("teacher.workflow.loading")
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
              }, toDisplayString(unref(t)("teacher.workflow.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : hasData.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("nav", {
              class: "tch-wf-seg",
              role: "tablist",
              "aria-label": unref(t)("teacher.workflow.title")
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(tabs, (tab) => {
                return createBaseVNode("button", {
                  key: tab,
                  type: "button",
                  role: "tab",
                  class: normalizeClass(tabButtonClass(tab)),
                  "aria-selected": activeTab.value === tab,
                  onClick: ($event) => activeTab.value = tab
                }, [
                  createBaseVNode("span", null, toDisplayString(tabLabel(tab)), 1),
                  createBaseVNode("span", _hoisted_9, toDisplayString(unref(counts)[tab]), 1),
                  tab === "todo" && unref(todoCount) > 0 ? (openBlock(), createElementBlock("span", _hoisted_10)) : createCommentVNode("", true)
                ], 10, _hoisted_8);
              }), 64))
            ], 8, _hoisted_7),
            activeRows.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              message: unref(t)(`teacher.workflow.empty.${activeTab.value}`)
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("section", _hoisted_11, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(activeRows.value, (item) => {
                return openBlock(), createElementBlock("article", {
                  key: item.key,
                  class: "tch-wf-card p-4"
                }, [
                  createBaseVNode("div", _hoisted_12, [
                    createBaseVNode("h3", _hoisted_13, toDisplayString(item.title || unref(t)("teacher.workflow.fallback.title")), 1),
                    item.status ? (openBlock(), createElementBlock("span", {
                      key: 0,
                      class: normalizeClass(badgeClass(item.tone))
                    }, toDisplayString(item.status), 3)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("p", _hoisted_14, toDisplayString(unref(tf)("teacher.workflow.item.meta", { from: item.createTime || "—", to: item.endTime || "—" })), 1),
                  item.opinion ? (openBlock(), createElementBlock("details", _hoisted_15, [
                    createBaseVNode("summary", _hoisted_16, [
                      createBaseVNode("span", null, toDisplayString(unref(t)("teacher.workflow.item.opinion")), 1),
                      _cache[2] || (_cache[2] = createBaseVNode("span", {
                        class: "material-symbols-outlined text-[14px] tch-wf-opinion-icon",
                        "aria-hidden": "true"
                      }, "expand_more", -1))
                    ]),
                    createBaseVNode("p", _hoisted_17, toDisplayString(item.opinion), 1)
                  ])) : createCommentVNode("", true),
                  createBaseVNode("p", _hoisted_18, toDisplayString(unref(t)("teacher.workflow.item.webOnly")), 1)
                ]);
              }), 128))
            ]))
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
const TeacherWorkflowView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-d3be0b30"]]);
export {
  TeacherWorkflowView as default
};
