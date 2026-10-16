import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-CSGuhC_h.js";
import { T as TCard, _ as _sfc_main$5 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-hy13FaxX.js";
import { T as TEmptyState } from "./TEmptyState-Q6txwufz.js";
import { c4 as normalizeSemester, c0 as clearTeacherSnapshotScope, ad as readTeacherSnapshot, ah as buildTeacherSnapshotKey, aj as buildTeacherScopedKey, c2 as normalizeScopeAccountId, c5 as fetchTeacherTeaching, af as writeTeacherSnapshot, u as useI18n, c as useAuthStore, c6 as IOSSelect, c3 as resolveTeacherAccountId } from "./app-demo-TQEQRs3d.js";
import { _ as _sfc_main$2, a as _sfc_main$3, b as _sfc_main$4 } from "./TabsTrigger.vue_vue_type_script_setup_true_lang-Dq713ErW.js";
import { r as readStoredSemester, d as deriveSemesterByDate } from "./semester-r5EW3dI5.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { r as ref, h as computed, y as defineComponent, v as watch, o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, t as toDisplayString, F as Fragment, f as renderList, g as createTextVNode, j as createBlock, d as createCommentVNode } from "./vue-core-CU1bwGIw.js";
import { _ as _sfc_main$6, t as teacherSemesterOptions } from "./TeacherRecordDetail.vue_vue_type_script_setup_true_lang-DVBZ8Rrb.js";
import "./runtime-bridge-DtTGpr5b.js";
import "./more-modules-DxXoZJOA.js";
import "./debug-tools-Csa71jvB.js";
import "./capture-DDnJhEie.js";
import "./constants-CbGy8sp4.js";
const teacherTeachingErrorKey = (kind) => `teacher.error.${kind}`;
const linkTeachingData = (data) => {
  const classIndex = /* @__PURE__ */ new Map();
  for (const cls of data.classes) {
    const jxbid = String(cls.jxbid ?? "").trim();
    if (jxbid && !classIndex.has(jxbid)) classIndex.set(jxbid, cls);
  }
  return data.tasks.map((task) => {
    const jxbid = String(task.jxbid ?? "").trim();
    return { task, linkedClass: jxbid ? classIndex.get(jxbid) ?? null : null };
  });
};
const TEACHING_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidTeachingSemester = (value) => TEACHING_SEMESTER_PATTERN.test(value);
const resolveInitialTeachingSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidTeachingSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidTeachingSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const useTeacherTeaching = (options = {}) => {
  const semester = ref(resolveInitialTeachingSemester(options.initialSemester));
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
    () => buildTeacherScopedKey("teaching", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => buildTeacherSnapshotKey({
      resource: "teaching",
      accountId: accountId.value,
      semester: semester.value
    })
  );
  const tasks = computed(() => state.value.data?.tasks ?? []);
  const classes = computed(() => state.value.data?.classes ?? []);
  const links = computed(
    () => linkTeachingData(state.value.data ?? { tasks: [], classes: [] })
  );
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherTeachingErrorKey(state.value.error.kind) : ""
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
    const empty = snapshot.tasks.length === 0 && snapshot.classes.length === 0;
    state.value = empty ? { status: "empty", data: null, error: { kind: "empty", message: "" } } : { status: "ready", data: snapshot, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherTeaching(semester.value, { scope: account });
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
          resource: "teaching",
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
          resource: "teaching",
          queryKey: "",
          data: { tasks: [], classes: [] },
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
    if (!isValidTeachingSemester(next) || next === semester.value) return;
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
    tasks,
    classes,
    links,
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
const _hoisted_6 = {
  key: 1,
  class: "space-y-3"
};
const _hoisted_7 = ["aria-label", "onClick"];
const _hoisted_8 = { class: "flex-1 min-w-0" };
const _hoisted_9 = { class: "block font-bold text-on-surface truncate" };
const _hoisted_10 = { class: "block text-sm text-on-surface-variant mt-1 break-words" };
const _hoisted_11 = { class: "block text-xs text-on-surface-variant mt-2" };
const _hoisted_12 = { key: 0 };
const _hoisted_13 = {
  key: 1,
  class: "ml-2"
};
const _hoisted_14 = {
  key: 1,
  class: "space-y-3"
};
const _hoisted_15 = ["aria-label", "onClick"];
const _hoisted_16 = { class: "flex-1 min-w-0" };
const _hoisted_17 = { class: "block font-bold text-on-surface truncate" };
const _hoisted_18 = { class: "block text-sm text-on-surface-variant mt-1 break-words" };
const _hoisted_19 = { class: "block text-xs text-on-surface-variant mt-2" };
const _hoisted_20 = { key: 0 };
const _hoisted_21 = {
  key: 1,
  class: "ml-2"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherTeachingView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const activeTab = ref("tasks");
    const selectedTask = ref(null);
    const selectedClass = ref(null);
    const {
      semester,
      tasks,
      classes,
      links,
      isLoading,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      retry
    } = useTeacherTeaching({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => tasks.value.length > 0 || classes.value.length > 0);
    const semesterDraft = ref(semester.value);
    watch(semester, (value) => {
      semesterDraft.value = value;
    });
    const semesters = computed(() => teacherSemesterOptions(semesterDraft.value));
    const showDetail = computed(() => selectedTask.value !== null || selectedClass.value !== null);
    const selectedTitle = computed(() => selectedTask.value?.kcmc || selectedClass.value?.kcmc || "");
    const selectedLinkedClass = computed(() => {
      const task = selectedTask.value;
      return task ? links.value.find((item) => item.task.id === task.id)?.linkedClass ?? null : null;
    });
    const openTask = (item) => {
      selectedTask.value = item;
      selectedClass.value = null;
    };
    const openClass = (item) => {
      selectedClass.value = item;
      selectedTask.value = null;
    };
    const closeDetail = () => {
      selectedTask.value = null;
      selectedClass.value = null;
    };
    const applySemester = async () => {
      if (semesterDraft.value === semester.value) return;
      await setSemester(semesterDraft.value);
      closeDetail();
    };
    const reload = async () => {
      await retry();
    };
    const detailRows = computed(() => {
      const data = selectedTask.value || selectedClass.value;
      if (!data) return [];
      return [
        { key: "course", label: t("teacher.teaching.field.courseName"), value: data.kcmc },
        { key: "class", label: t("teacher.teaching.field.className"), value: data.name },
        { key: "people", label: t("teacher.teaching.field.classSize"), value: data.bjrs },
        { key: "credit", label: t("teacher.teaching.field.credit"), value: data.xf }
      ];
    });
    const additionalRows = computed(() => {
      const data = selectedTask.value || selectedClass.value;
      if (!data) return [];
      const cls = selectedLinkedClass.value;
      return [
        { key: "composition", label: t("teacher.teaching.field.classComposition"), value: data.jxbzc },
        { key: "semester", label: t("teacher.teaching.field.semester"), value: data.xnxq },
        { key: "courseCode", label: t("teacher.teaching.field.courseCode"), value: selectedClass.value?.kcbh || cls?.kcbh },
        { key: "hours", label: t("teacher.teaching.field.hours"), value: selectedClass.value?.xs || cls?.xs },
        { key: "college", label: t("teacher.teaching.field.college"), value: selectedClass.value?.kkyxmc || cls?.kkyxmc },
        ...selectedTask.value ? [{
          key: "linked",
          label: t("teacher.teaching.detail.linkedClass"),
          value: cls?.name || t("teacher.teaching.detail.noLinkedClass")
        }] : []
      ];
    });
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("teacher.teaching.title"),
          icon: "school",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "w-10 h-10 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-highest",
              "aria-label": unref(t)("teacher.teaching.action.refresh"),
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
              createBaseVNode("label", _hoisted_4, toDisplayString(unref(t)("teacher.teaching.semester.label")), 1),
              createVNode(IOSSelect, {
                modelValue: semesterDraft.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => semesterDraft.value = $event),
                disabled: unref(isLoading),
                title: unref(t)("teacher.teaching.semester.label"),
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
                "aria-label": unref(t)("teacher.teaching.title")
              }, {
                default: withCtx(() => [
                  createVNode(unref(_sfc_main$3), {
                    value: "tasks",
                    class: "flex-1 rounded-xl"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(unref(t)("teacher.teaching.tab.tasks")) + " (" + toDisplayString(unref(tasks).length) + ") ", 1)
                    ]),
                    _: 1
                  }),
                  createVNode(unref(_sfc_main$3), {
                    value: "classes",
                    class: "flex-1 rounded-xl"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(unref(t)("teacher.teaching.tab.classes")) + " (" + toDisplayString(unref(classes).length) + ") ", 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["aria-label"])
            ]),
            _: 1
          }, 8, ["modelValue"]),
          unref(isLoading) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("teacher.teaching.loading")
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
              }, toDisplayString(unref(t)("teacher.teaching.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : activeTab.value === "tasks" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            !unref(tasks).length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              message: unref(t)("teacher.teaching.empty.tasks")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("ul", _hoisted_6, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(links), (link) => {
                return openBlock(), createElementBlock("li", {
                  key: link.task.id
                }, [
                  createVNode(unref(TCard), {
                    compact: "",
                    hoverable: ""
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("button", {
                        type: "button",
                        class: "w-full text-left flex items-center gap-3 min-w-0",
                        "aria-label": link.task.kcmc + " " + unref(t)("teacher.detail.view"),
                        onClick: ($event) => openTask(link.task)
                      }, [
                        createBaseVNode("span", _hoisted_8, [
                          createBaseVNode("span", _hoisted_9, toDisplayString(link.task.kcmc), 1),
                          createBaseVNode("span", _hoisted_10, toDisplayString(link.task.name), 1),
                          createBaseVNode("span", _hoisted_11, [
                            link.task.bjrs !== void 0 ? (openBlock(), createElementBlock("span", _hoisted_12, toDisplayString(link.task.bjrs) + " " + toDisplayString(unref(t)("teacher.teaching.unit.people")), 1)) : createCommentVNode("", true),
                            link.task.xf ? (openBlock(), createElementBlock("span", _hoisted_13, toDisplayString(link.task.xf) + " " + toDisplayString(unref(t)("teacher.teaching.unit.credit")), 1)) : createCommentVNode("", true)
                          ])
                        ]),
                        _cache[3] || (_cache[3] = createBaseVNode("span", {
                          class: "material-symbols-outlined text-on-surface-variant text-lg",
                          "aria-hidden": "true"
                        }, "chevron_right", -1))
                      ], 8, _hoisted_7)
                    ]),
                    _: 2
                  }, 1024)
                ]);
              }), 128))
            ]))
          ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            !unref(classes).length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              message: unref(t)("teacher.teaching.empty.classes")
            }, null, 8, ["message"])) : (openBlock(), createElementBlock("ul", _hoisted_14, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(classes), (item) => {
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
                        onClick: ($event) => openClass(item)
                      }, [
                        createBaseVNode("span", _hoisted_16, [
                          createBaseVNode("span", _hoisted_17, toDisplayString(item.kcmc), 1),
                          createBaseVNode("span", _hoisted_18, toDisplayString(item.name), 1),
                          createBaseVNode("span", _hoisted_19, [
                            item.bjrs !== void 0 ? (openBlock(), createElementBlock("span", _hoisted_20, toDisplayString(item.bjrs) + " " + toDisplayString(unref(t)("teacher.teaching.unit.people")), 1)) : createCommentVNode("", true),
                            item.xs ? (openBlock(), createElementBlock("span", _hoisted_21, toDisplayString(item.xs) + " " + toDisplayString(unref(t)("teacher.teaching.unit.hours")), 1)) : createCommentVNode("", true)
                          ])
                        ]),
                        _cache[4] || (_cache[4] = createBaseVNode("span", {
                          class: "material-symbols-outlined text-on-surface-variant text-lg",
                          "aria-hidden": "true"
                        }, "chevron_right", -1))
                      ], 8, _hoisted_15)
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
          extra: additionalRows.value,
          onClose: closeDetail
        }, null, 8, ["visible", "title", "primary", "extra"])
      ]);
    };
  }
});
export {
  _sfc_main as default
};
