import { r as ref, h as computed, y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, L as withDirectives, M as vModelText, m as withKeys, g as createTextVNode, n as normalizeClass, d as createCommentVNode, F as Fragment, f as renderList } from "./vue-core-D-44rohN.js";
import { u as useI18n, c as useAuthStore, _ as _export_sfc } from "./app-demo-DztvWo2z.js";
import { b as normalizeSemester, d as fetchTeacherTeaching } from "./teacherApi-BZ56ekcn.js";
import { r as readStoredSemester, d as deriveSemesterByDate } from "./semester-DXaOneP4.js";
import { b as buildTeacherScopedKey, n as normalizeScopeAccountId, r as resolveTeacherAccountId } from "./teacher_scope-Dh6O3Ukw.js";
import "./runtime-bridge-gQMtwwk6.js";
import "./more-modules-yxgAg-Rh.js";
import "./debug-tools-CyNtADDO.js";
import "./capture-YhmA9GNe.js";
import "./school_inbox_content-CxpfsU1v.js";
import "./constants-NOUSPpZg.js";
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
  const memoryCache = /* @__PURE__ */ new Map();
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const scopeKey = computed(
    () => buildTeacherScopedKey("teaching", accountId.value, semester.value)
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
    const result = await fetchTeacherTeaching(semester.value);
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (result.status === "ready" && result.data) {
      memoryCache.set(scope, result.data);
    }
    state.value = result;
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidTeachingSemester(next) || next === semester.value) return;
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
    tasks,
    classes,
    links,
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
  class: "teacher-teaching",
  role: "region",
  "aria-labelledby": "teacher-teaching-title"
};
const _hoisted_2 = { class: "teacher-teaching__header" };
const _hoisted_3 = {
  id: "teacher-teaching-title",
  class: "teacher-teaching__title"
};
const _hoisted_4 = { class: "teacher-teaching__semester" };
const _hoisted_5 = {
  class: "teacher-teaching__semester-label",
  for: "teacher-teaching-semester"
};
const _hoisted_6 = ["placeholder"];
const _hoisted_7 = ["disabled"];
const _hoisted_8 = {
  key: 0,
  class: "teacher-teaching__tabs",
  role: "tablist",
  "aria-label": "teaching tabs"
};
const _hoisted_9 = ["aria-selected"];
const _hoisted_10 = { class: "teacher-teaching__tab-count" };
const _hoisted_11 = ["aria-selected"];
const _hoisted_12 = { class: "teacher-teaching__tab-count" };
const _hoisted_13 = {
  key: 1,
  class: "teacher-teaching__state",
  role: "status",
  "aria-live": "polite"
};
const _hoisted_14 = {
  key: 2,
  class: "teacher-teaching__state teacher-teaching__state--error",
  role: "alert"
};
const _hoisted_15 = {
  key: 3,
  class: "teacher-teaching__detail",
  role: "region"
};
const _hoisted_16 = { class: "teacher-teaching__detail-head" };
const _hoisted_17 = { class: "teacher-teaching__detail-title" };
const _hoisted_18 = {
  key: 0,
  class: "teacher-teaching__fields"
};
const _hoisted_19 = { class: "teacher-teaching__row" };
const _hoisted_20 = { class: "teacher-teaching__row" };
const _hoisted_21 = {
  key: 0,
  class: "teacher-teaching__row"
};
const _hoisted_22 = {
  key: 1,
  class: "teacher-teaching__row"
};
const _hoisted_23 = {
  key: 2,
  class: "teacher-teaching__row"
};
const _hoisted_24 = {
  key: 3,
  class: "teacher-teaching__row"
};
const _hoisted_25 = {
  key: 1,
  class: "teacher-teaching__fields"
};
const _hoisted_26 = { class: "teacher-teaching__row" };
const _hoisted_27 = { class: "teacher-teaching__row" };
const _hoisted_28 = {
  key: 0,
  class: "teacher-teaching__row"
};
const _hoisted_29 = {
  key: 1,
  class: "teacher-teaching__row"
};
const _hoisted_30 = {
  key: 2,
  class: "teacher-teaching__row"
};
const _hoisted_31 = {
  key: 3,
  class: "teacher-teaching__row"
};
const _hoisted_32 = {
  key: 4,
  class: "teacher-teaching__row"
};
const _hoisted_33 = {
  key: 5,
  class: "teacher-teaching__row"
};
const _hoisted_34 = {
  key: 6,
  class: "teacher-teaching__row"
};
const _hoisted_35 = {
  key: 2,
  class: "teacher-teaching__linked"
};
const _hoisted_36 = { class: "teacher-teaching__linked-title" };
const _hoisted_37 = {
  key: 0,
  class: "teacher-teaching__linked-empty"
};
const _hoisted_38 = {
  key: 1,
  class: "teacher-teaching__fields"
};
const _hoisted_39 = { class: "teacher-teaching__row" };
const _hoisted_40 = {
  key: 0,
  class: "teacher-teaching__row"
};
const _hoisted_41 = {
  key: 1,
  class: "teacher-teaching__row"
};
const _hoisted_42 = {
  key: 2,
  class: "teacher-teaching__row"
};
const _hoisted_43 = {
  key: 4,
  class: "teacher-teaching__panel",
  role: "tabpanel"
};
const _hoisted_44 = {
  key: 0,
  class: "teacher-teaching__state"
};
const _hoisted_45 = {
  key: 1,
  class: "teacher-teaching__grid"
};
const _hoisted_46 = ["onClick"];
const _hoisted_47 = { class: "teacher-teaching__card-course" };
const _hoisted_48 = { class: "teacher-teaching__card-class" };
const _hoisted_49 = { class: "teacher-teaching__card-meta" };
const _hoisted_50 = { key: 0 };
const _hoisted_51 = { key: 1 };
const _hoisted_52 = {
  key: 5,
  class: "teacher-teaching__panel",
  role: "tabpanel"
};
const _hoisted_53 = {
  key: 0,
  class: "teacher-teaching__state"
};
const _hoisted_54 = {
  key: 1,
  class: "teacher-teaching__grid"
};
const _hoisted_55 = ["onClick"];
const _hoisted_56 = { class: "teacher-teaching__card-course" };
const _hoisted_57 = { class: "teacher-teaching__card-class" };
const _hoisted_58 = { class: "teacher-teaching__card-meta" };
const _hoisted_59 = { key: 0 };
const _hoisted_60 = { key: 1 };
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
      load,
      setSemester,
      retry
    } = useTeacherTeaching({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const semesterDraft = ref(semester.value);
    const openTask = (task) => {
      selectedTask.value = task;
    };
    const openClass = (cls) => {
      selectedClass.value = cls;
    };
    const closeDetail = () => {
      selectedTask.value = null;
      selectedClass.value = null;
    };
    const selectedLinkedClass = computed(() => {
      const task = selectedTask.value;
      if (!task) return null;
      return links.value.find((link) => link.task.id === task.id)?.linkedClass ?? null;
    });
    const showDetail = computed(() => selectedTask.value !== null || selectedClass.value !== null);
    const applySemester = async () => {
      await setSemester(semesterDraft.value);
      semesterDraft.value = semester.value;
      closeDetail();
    };
    const reload = async () => {
      closeDetail();
      await retry();
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "teacher-teaching__back",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back"))
          }, toDisplayString(unref(t)("teacher.teaching.action.back")), 1),
          createBaseVNode("h2", _hoisted_3, toDisplayString(unref(t)("teacher.teaching.title")), 1),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("label", _hoisted_5, toDisplayString(unref(t)("teacher.teaching.semester.label")), 1),
            withDirectives(createBaseVNode("input", {
              id: "teacher-teaching-semester",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => semesterDraft.value = $event),
              class: "teacher-teaching__semester-input",
              type: "text",
              inputmode: "numeric",
              placeholder: unref(t)("teacher.teaching.semester.placeholder"),
              onKeyup: withKeys(applySemester, ["enter"])
            }, null, 40, _hoisted_6), [
              [vModelText, semesterDraft.value]
            ]),
            createBaseVNode("button", {
              class: "teacher-teaching__btn",
              type: "button",
              onClick: applySemester
            }, toDisplayString(unref(t)("teacher.teaching.semester.apply")), 1),
            createBaseVNode("button", {
              class: "teacher-teaching__btn teacher-teaching__btn--ghost",
              type: "button",
              disabled: unref(isLoading),
              onClick: reload
            }, toDisplayString(unref(t)("teacher.teaching.action.refresh")), 9, _hoisted_7)
          ])
        ]),
        !showDetail.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
          createBaseVNode("button", {
            class: normalizeClass(["teacher-teaching__tab", { "is-active": activeTab.value === "tasks" }]),
            type: "button",
            role: "tab",
            "aria-selected": activeTab.value === "tasks",
            onClick: _cache[2] || (_cache[2] = ($event) => activeTab.value = "tasks")
          }, [
            createTextVNode(toDisplayString(unref(t)("teacher.teaching.tab.tasks")) + " ", 1),
            createBaseVNode("span", _hoisted_10, toDisplayString(unref(tasks).length), 1)
          ], 10, _hoisted_9),
          createBaseVNode("button", {
            class: normalizeClass(["teacher-teaching__tab", { "is-active": activeTab.value === "classes" }]),
            type: "button",
            role: "tab",
            "aria-selected": activeTab.value === "classes",
            onClick: _cache[3] || (_cache[3] = ($event) => activeTab.value = "classes")
          }, [
            createTextVNode(toDisplayString(unref(t)("teacher.teaching.tab.classes")) + " ", 1),
            createBaseVNode("span", _hoisted_12, toDisplayString(unref(classes).length), 1)
          ], 10, _hoisted_11)
        ])) : createCommentVNode("", true),
        unref(isLoading) ? (openBlock(), createElementBlock("p", _hoisted_13, toDisplayString(unref(t)("teacher.teaching.loading")), 1)) : unref(isError) ? (openBlock(), createElementBlock("div", _hoisted_14, [
          createBaseVNode("p", null, toDisplayString(unref(t)(unref(errorKey))), 1),
          createBaseVNode("button", {
            class: "teacher-teaching__btn",
            type: "button",
            onClick: reload
          }, toDisplayString(unref(t)("teacher.teaching.action.retry")), 1)
        ])) : showDetail.value ? (openBlock(), createElementBlock("div", _hoisted_15, [
          createBaseVNode("div", _hoisted_16, [
            createBaseVNode("h3", _hoisted_17, toDisplayString(selectedTask.value ? selectedTask.value.kcmc : selectedClass.value?.kcmc), 1),
            createBaseVNode("button", {
              class: "teacher-teaching__btn teacher-teaching__btn--ghost",
              type: "button",
              onClick: closeDetail
            }, toDisplayString(unref(t)("teacher.teaching.action.backToList")), 1)
          ]),
          selectedTask.value ? (openBlock(), createElementBlock("dl", _hoisted_18, [
            createBaseVNode("div", _hoisted_19, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.courseName")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedTask.value.kcmc), 1)
            ]),
            createBaseVNode("div", _hoisted_20, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.className")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedTask.value.name), 1)
            ]),
            selectedTask.value.jxbzc ? (openBlock(), createElementBlock("div", _hoisted_21, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.classComposition")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedTask.value.jxbzc), 1)
            ])) : createCommentVNode("", true),
            selectedTask.value.bjrs !== void 0 ? (openBlock(), createElementBlock("div", _hoisted_22, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.classSize")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedTask.value.bjrs), 1)
            ])) : createCommentVNode("", true),
            selectedTask.value.xf ? (openBlock(), createElementBlock("div", _hoisted_23, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.credit")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedTask.value.xf), 1)
            ])) : createCommentVNode("", true),
            selectedTask.value.xnxq ? (openBlock(), createElementBlock("div", _hoisted_24, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.semester")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedTask.value.xnxq), 1)
            ])) : createCommentVNode("", true)
          ])) : selectedClass.value ? (openBlock(), createElementBlock("dl", _hoisted_25, [
            createBaseVNode("div", _hoisted_26, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.courseName")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.kcmc), 1)
            ]),
            createBaseVNode("div", _hoisted_27, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.className")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.name), 1)
            ]),
            selectedClass.value.kcbh ? (openBlock(), createElementBlock("div", _hoisted_28, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.courseCode")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.kcbh), 1)
            ])) : createCommentVNode("", true),
            selectedClass.value.jxbzc ? (openBlock(), createElementBlock("div", _hoisted_29, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.classComposition")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.jxbzc), 1)
            ])) : createCommentVNode("", true),
            selectedClass.value.bjrs !== void 0 ? (openBlock(), createElementBlock("div", _hoisted_30, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.classSize")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.bjrs), 1)
            ])) : createCommentVNode("", true),
            selectedClass.value.xs ? (openBlock(), createElementBlock("div", _hoisted_31, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.hours")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.xs), 1)
            ])) : createCommentVNode("", true),
            selectedClass.value.xf ? (openBlock(), createElementBlock("div", _hoisted_32, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.credit")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.xf), 1)
            ])) : createCommentVNode("", true),
            selectedClass.value.kkyxmc ? (openBlock(), createElementBlock("div", _hoisted_33, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.college")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.kkyxmc), 1)
            ])) : createCommentVNode("", true),
            selectedClass.value.xnxq ? (openBlock(), createElementBlock("div", _hoisted_34, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.semester")), 1),
              createBaseVNode("dd", null, toDisplayString(selectedClass.value.xnxq), 1)
            ])) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          selectedTask.value ? (openBlock(), createElementBlock("section", _hoisted_35, [
            createBaseVNode("h4", _hoisted_36, toDisplayString(unref(t)("teacher.teaching.detail.linkedClass")), 1),
            !selectedLinkedClass.value ? (openBlock(), createElementBlock("p", _hoisted_37, toDisplayString(unref(t)("teacher.teaching.detail.noLinkedClass")), 1)) : (openBlock(), createElementBlock("dl", _hoisted_38, [
              createBaseVNode("div", _hoisted_39, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.className")), 1),
                createBaseVNode("dd", null, toDisplayString(selectedLinkedClass.value.name), 1)
              ]),
              selectedLinkedClass.value.kcbh ? (openBlock(), createElementBlock("div", _hoisted_40, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.courseCode")), 1),
                createBaseVNode("dd", null, toDisplayString(selectedLinkedClass.value.kcbh), 1)
              ])) : createCommentVNode("", true),
              selectedLinkedClass.value.xs ? (openBlock(), createElementBlock("div", _hoisted_41, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.hours")), 1),
                createBaseVNode("dd", null, toDisplayString(selectedLinkedClass.value.xs), 1)
              ])) : createCommentVNode("", true),
              selectedLinkedClass.value.kkyxmc ? (openBlock(), createElementBlock("div", _hoisted_42, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("teacher.teaching.field.college")), 1),
                createBaseVNode("dd", null, toDisplayString(selectedLinkedClass.value.kkyxmc), 1)
              ])) : createCommentVNode("", true)
            ]))
          ])) : createCommentVNode("", true)
        ])) : activeTab.value === "tasks" ? (openBlock(), createElementBlock("div", _hoisted_43, [
          unref(tasks).length === 0 ? (openBlock(), createElementBlock("p", _hoisted_44, toDisplayString(unref(t)("teacher.teaching.empty.tasks")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_45, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(links), (link) => {
              return openBlock(), createElementBlock("li", {
                key: link.task.id,
                class: "teacher-teaching__card"
              }, [
                createBaseVNode("button", {
                  class: "teacher-teaching__card-btn",
                  type: "button",
                  onClick: ($event) => openTask(link.task)
                }, [
                  createBaseVNode("span", _hoisted_47, toDisplayString(link.task.kcmc), 1),
                  createBaseVNode("span", _hoisted_48, toDisplayString(link.task.name), 1),
                  createBaseVNode("span", _hoisted_49, [
                    link.task.bjrs !== void 0 ? (openBlock(), createElementBlock("span", _hoisted_50, toDisplayString(link.task.bjrs) + " " + toDisplayString(unref(t)("teacher.teaching.unit.people")), 1)) : createCommentVNode("", true),
                    link.task.xf ? (openBlock(), createElementBlock("span", _hoisted_51, toDisplayString(link.task.xf) + " " + toDisplayString(unref(t)("teacher.teaching.unit.credit")), 1)) : createCommentVNode("", true)
                  ])
                ], 8, _hoisted_46)
              ]);
            }), 128))
          ]))
        ])) : (openBlock(), createElementBlock("div", _hoisted_52, [
          unref(classes).length === 0 ? (openBlock(), createElementBlock("p", _hoisted_53, toDisplayString(unref(t)("teacher.teaching.empty.classes")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_54, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(classes), (cls) => {
              return openBlock(), createElementBlock("li", {
                key: cls.id,
                class: "teacher-teaching__card"
              }, [
                createBaseVNode("button", {
                  class: "teacher-teaching__card-btn",
                  type: "button",
                  onClick: ($event) => openClass(cls)
                }, [
                  createBaseVNode("span", _hoisted_56, toDisplayString(cls.kcmc), 1),
                  createBaseVNode("span", _hoisted_57, toDisplayString(cls.name), 1),
                  createBaseVNode("span", _hoisted_58, [
                    cls.bjrs !== void 0 ? (openBlock(), createElementBlock("span", _hoisted_59, toDisplayString(cls.bjrs) + " " + toDisplayString(unref(t)("teacher.teaching.unit.people")), 1)) : createCommentVNode("", true),
                    cls.xs ? (openBlock(), createElementBlock("span", _hoisted_60, toDisplayString(cls.xs) + " " + toDisplayString(unref(t)("teacher.teaching.unit.hours")), 1)) : createCommentVNode("", true)
                  ])
                ], 8, _hoisted_55)
              ]);
            }), 128))
          ]))
        ]))
      ]);
    };
  }
});
const TeacherTeachingView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ae1cf9a6"]]);
export {
  TeacherTeachingView as default
};
