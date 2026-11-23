import { i as defineComponent, r as ref, x as watch, o as onMounted, p as onBeforeUnmount, a as openBlock, c as createElementBlock, j as createBlock, l as withCtx, b as createBaseVNode, u as unref, t as toDisplayString, n as normalizeClass, w as withModifiers, F as Fragment, f as renderList, M as withDirectives, P as vModelRadio, d as createCommentVNode, g as createTextVNode, N as vModelText, k as createVNode, h as computed } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { u as useAuthStore, a3 as resolveTeacherAccountId, _ as _export_sfc } from "./app-demo-D63SYrKg.js";
import { T as TEmptyState } from "./TEmptyState-6p1dD4Yb.js";
import { u as useI18n, t as tf } from "./more-modules-CjuZH60i.js";
import { u as useTeacherScheduleLists, d as buildWeekDates, S as ScheduleGrid, e as useTeacherScheduleGrid } from "./useTeacherScheduleGrid-CHjEg5_J.js";
import { t as teacherSemesterOptions } from "./teacher_semesters-Cl97oR_n.js";
import { _ as _sfc_main$2 } from "./TeacherSyncBar.vue_vue_type_script_setup_true_lang-rODitHm4.js";
import "./runtime-bridge-D89yarmp.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
import "./teacher_sync_status-But3HSMJ.js";
import "./constants-BEIPv_h0.js";
import "./eventTypes-BjJUfugq.js";
const _hoisted_1 = ["title"];
const _hoisted_2 = { class: "tch-cs-label-micro" };
const _hoisted_3 = ["value", "disabled"];
const _hoisted_4 = ["aria-label", "disabled"];
const _hoisted_5 = { class: "px-4 pt-3 space-y-3" };
const _hoisted_6 = { class: "tch-cs-note flex items-start gap-2 px-3.5 py-2.5" };
const _hoisted_7 = { class: "tch-cs-note-text" };
const _hoisted_8 = {
  key: 0,
  class: "tch-cs-grid-wrap"
};
const _hoisted_9 = { class: "flex items-center justify-between px-1 pb-2" };
const _hoisted_10 = { class: "min-w-0" };
const _hoisted_11 = { class: "text-[15px] font-semibold truncate" };
const _hoisted_12 = { class: "tch-cs-label-micro text-outline" };
const _hoisted_13 = { class: "tch-week-select" };
const _hoisted_14 = ["value"];
const _hoisted_15 = ["value"];
const _hoisted_16 = ["disabled"];
const _hoisted_17 = {
  key: 0,
  class: "tch-cs-grid-empty"
};
const _hoisted_18 = { class: "tch-cs-label-micro" };
const _hoisted_19 = {
  key: 1,
  class: "tch-cs-grid-empty"
};
const _hoisted_20 = { class: "tch-cs-label-micro" };
const _hoisted_21 = {
  key: 2,
  class: "tch-cs-grid-empty"
};
const _hoisted_22 = { class: "tch-cs-label-micro" };
const _hoisted_23 = { class: "tch-cs-search" };
const _hoisted_24 = ["placeholder", "aria-label"];
const _hoisted_25 = ["aria-label"];
const _hoisted_26 = ["aria-label"];
const _hoisted_27 = ["title", "onClick"];
const _hoisted_28 = { class: "truncate max-w-[140px]" };
const _hoisted_29 = { class: "flex flex-col gap-2.5" };
const _hoisted_30 = ["disabled", "onClick"];
const _hoisted_31 = { class: "flex items-center justify-between gap-2 min-w-0" };
const _hoisted_32 = { class: "tch-cs-card-title truncate" };
const _hoisted_33 = {
  key: 0,
  class: "tch-cs-card-count shrink-0"
};
const _hoisted_34 = ["title"];
const _hoisted_35 = { class: "flex items-end justify-between gap-2 mt-1" };
const _hoisted_36 = ["title"];
const _hoisted_37 = { class: "tch-cs-open shrink-0 inline-flex items-center gap-0.5" };
const _hoisted_38 = {
  key: 1,
  class: "tch-cs-card tch-cs-card--disabled p-3.5"
};
const _hoisted_39 = { class: "flex items-center justify-between gap-2 min-w-0" };
const _hoisted_40 = { class: "tch-cs-card-title truncate" };
const _hoisted_41 = {
  key: 0,
  class: "tch-cs-card-count shrink-0"
};
const _hoisted_42 = ["title"];
const _hoisted_43 = { class: "flex items-end justify-between gap-2 mt-1" };
const _hoisted_44 = ["title"];
const _hoisted_45 = { class: "tch-cs-missing shrink-0" };
const _hoisted_46 = { class: "flex items-center justify-center pt-1" };
const _hoisted_47 = { class: "tch-cs-footer" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TeacherClassScheduleView",
  props: {
    embedded: { type: Boolean, default: false }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    const auth = useAuthStore();
    const {
      semester,
      classes,
      classTotal,
      isLoading,
      isEmpty,
      isError,
      errorKey,
      lastSuccessfulSyncAt,
      syncStatus,
      load,
      setSemester,
      setKeyword,
      retry,
      loadRecentClasses,
      recordRecentClass,
      recentClasses
    } = useTeacherScheduleLists({ accountId: () => resolveTeacherAccountId(auth.studentId) });
    const hasData = computed(() => classes.value.length > 0);
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
    const onRecentPill = (item) => {
      const label = item.className || item.classNo;
      if (!label) return;
      keywordDraft.value = label;
      if (keywordTimer) clearTimeout(keywordTimer);
      keywordTimer = null;
      void setKeyword(label);
    };
    const scheduleGrid = useTeacherScheduleGrid();
    const activeClass = ref(null);
    const weekDates = buildWeekDates();
    const activeTitle = computed(() => activeClass.value?.className || activeClass.value?.classNo || "");
    const activeCourseCount = computed(() => scheduleGrid.visibleCourses.value.length);
    const activeIsEmpty = computed(
      () => !scheduleGrid.loading.value && !scheduleGrid.error.value && activeCourseCount.value === 0
    );
    const viewClassSchedule = async (item) => {
      if (!item.encodeId) return;
      activeClass.value = item;
      recordRecentClass(item);
      await scheduleGrid.load({
        kind: "class",
        encodeId: item.encodeId,
        semester: item.semester || semester.value,
        campusId: item.campusId || void 0,
        displayName: item.className || item.classNo || ""
      });
    };
    const onWeekChange = (event) => {
      const value = Number(event.target.value) || 0;
      scheduleGrid.selectedWeek.value = value;
    };
    const closeSchedule = () => {
      activeClass.value = null;
      scheduleGrid.reset();
    };
    const reloadSchedule = async () => {
      if (!activeClass.value) return;
      await viewClassSchedule(activeClass.value);
    };
    const classTitle = (item) => item.className || item.classNo || "—";
    const classMeta = (item) => [item.majorName, item.departmentName].filter(Boolean).join(" · ");
    const classMetaLine2 = (item) => [
      item.enrollYear ? tf("teacher.schedule.class.grade", { year: item.enrollYear }) : "",
      item.classNo
    ].filter(Boolean).join(" · ");
    const footerText = computed(
      () => tf("teacher.schedule.footer.loaded", { loaded: classes.value.length, total: classTotal.value })
    );
    onMounted(() => {
      loadRecentClasses();
      void load();
    });
    onBeforeUnmount(() => {
      if (keywordTimer) clearTimeout(keywordTimer);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(props.embedded ? "tch-cs tch-embedded" : "min-h-screen bg-surface-canvas text-on-surface max-w-[448px] mx-auto pb-24 tch-cs")
      }, [
        !props.embedded ? (openBlock(), createBlock(unref(_sfc_main$1), {
          key: 0,
          title: unref(t)("teacher.schedule.class.title"),
          icon: "calendar_month",
          onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("details", {
              ref_key: "semesterDetails",
              ref: semesterDetails,
              class: "tch-cs-semester",
              onToggle: onSemesterToggle
            }, [
              createBaseVNode("summary", {
                class: "tch-cs-semester-pill",
                title: unref(t)("teacher.schedule.semester.label")
              }, [
                createBaseVNode("span", _hoisted_2, toDisplayString(unref(semester)), 1),
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-[14px] transition-transform duration-300", { "rotate-180": semesterMenuOpen.value }]),
                  "aria-hidden": "true"
                }, "expand_more", 2)
              ], 8, _hoisted_1),
              createBaseVNode("div", {
                class: "tch-cs-semester-menu",
                onClick: withModifiers(closeSemesterMenu, ["self"])
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (value) => {
                  return openBlock(), createElementBlock("label", {
                    key: value,
                    class: "tch-cs-semester-option"
                  }, [
                    withDirectives(createBaseVNode("input", {
                      type: "radio",
                      name: "tch-class-schedule-semester",
                      value,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => semesterDraft.value = $event),
                      disabled: unref(isLoading),
                      onChange: applySemester
                    }, null, 40, _hoisted_3), [
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
              "aria-label": unref(t)("teacher.schedule.action.refresh"),
              disabled: unref(isLoading),
              onClick: reload
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { "animate-spin": unref(isLoading) }])
              }, "refresh", 2)
            ], 8, _hoisted_4)
          ]),
          _: 1
        }, 8, ["title"])) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_5, [
          createBaseVNode("div", _hoisted_6, [
            _cache[3] || (_cache[3] = createBaseVNode("span", {
              class: "material-symbols-outlined text-[16px] text-primary mt-px",
              "aria-hidden": "true"
            }, "grid_view", -1)),
            createBaseVNode("p", _hoisted_7, toDisplayString(unref(t)("teacher.schedule.class.gridHint")), 1)
          ]),
          activeClass.value ? (openBlock(), createElementBlock("section", _hoisted_8, [
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("p", _hoisted_11, toDisplayString(activeTitle.value), 1),
                createBaseVNode("p", _hoisted_12, [
                  createTextVNode(toDisplayString(unref(tf)("teacher.schedule.class.courseCount", { n: activeCourseCount.value })) + " ", 1),
                  createBaseVNode("div", _hoisted_13, [
                    _cache[5] || (_cache[5] = createBaseVNode("label", { class: "tch-week-select__label" }, "周次", -1)),
                    createBaseVNode("select", {
                      value: unref(scheduleGrid).selectedWeek.value,
                      onChange: onWeekChange
                    }, [
                      _cache[4] || (_cache[4] = createBaseVNode("option", { value: 0 }, "全部", -1)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(unref(scheduleGrid).weekOptions.value, (w) => {
                        return openBlock(), createElementBlock("option", {
                          key: w,
                          value: w
                        }, "第 " + toDisplayString(w) + " 周", 9, _hoisted_15);
                      }), 128))
                    ], 40, _hoisted_14)
                  ])
                ])
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "text-[13px] font-semibold text-primary shrink-0",
                disabled: unref(scheduleGrid).loading.value,
                onClick: reloadSchedule
              }, toDisplayString(unref(t)("teacher.schedule.action.refresh")), 9, _hoisted_16)
            ]),
            unref(scheduleGrid).loading.value ? (openBlock(), createElementBlock("div", _hoisted_17, [
              _cache[6] || (_cache[6] = createBaseVNode("span", {
                class: "material-symbols-outlined animate-spin",
                "aria-hidden": "true"
              }, "progress_activity", -1)),
              createBaseVNode("p", _hoisted_18, toDisplayString(unref(t)("teacher.schedule.loading")), 1)
            ])) : unref(scheduleGrid).error.value ? (openBlock(), createElementBlock("div", _hoisted_19, [
              _cache[7] || (_cache[7] = createBaseVNode("span", {
                class: "material-symbols-outlined text-danger",
                "aria-hidden": "true"
              }, "error", -1)),
              createBaseVNode("p", _hoisted_20, toDisplayString(unref(scheduleGrid).error.value), 1),
              createBaseVNode("button", {
                type: "button",
                class: "text-[13px] font-semibold text-primary mt-1",
                onClick: reloadSchedule
              }, toDisplayString(unref(t)("teacher.schedule.action.retry")), 1)
            ])) : activeIsEmpty.value ? (openBlock(), createElementBlock("div", _hoisted_21, [
              _cache[8] || (_cache[8] = createBaseVNode("span", {
                class: "material-symbols-outlined text-outline",
                "aria-hidden": "true"
              }, "event_busy", -1)),
              createBaseVNode("p", _hoisted_22, toDisplayString(unref(t)("teacher.schedule.class.noCourses")), 1)
            ])) : (openBlock(), createBlock(ScheduleGrid, {
              key: 3,
              "week-dates": unref(weekDates),
              "current-month": unref(weekDates)[0]?.month || 1,
              "selected-week": 0,
              "get-courses-for-day": unref(scheduleGrid).getCoursesForDay,
              "get-course-style": unref(scheduleGrid).getCourseStyleFor,
              "enable-blank-create": false,
              "view-mode": "courses"
            }, null, 8, ["week-dates", "current-month", "get-courses-for-day", "get-course-style"])),
            createBaseVNode("button", {
              type: "button",
              class: "tch-cs-back-list",
              onClick: closeSchedule
            }, toDisplayString(unref(t)("teacher.schedule.class.backToList")), 1)
          ])) : createCommentVNode("", true),
          !activeClass.value && unref(isLoading) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "loading",
            message: unref(t)("teacher.schedule.loading")
          }, null, 8, ["message"])) : unref(isError) && !hasData.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "error",
            message: unref(t)(unref(errorKey))
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "mt-3 text-primary font-semibold",
                onClick: reload
              }, toDisplayString(unref(t)("teacher.schedule.action.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !activeClass.value && (unref(isEmpty) || !hasData.value) ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 3,
            message: unref(t)("teacher.schedule.class.empty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            createBaseVNode("div", _hoisted_23, [
              _cache[10] || (_cache[10] = createBaseVNode("span", {
                class: "material-symbols-outlined text-[20px] text-outline",
                "aria-hidden": "true"
              }, "search", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => keywordDraft.value = $event),
                class: "tch-cs-search-input",
                type: "search",
                placeholder: unref(t)("teacher.schedule.class.search.placeholder"),
                "aria-label": unref(t)("teacher.schedule.class.search.aria"),
                onInput: onKeywordInput
              }, null, 40, _hoisted_24), [
                [vModelText, keywordDraft.value]
              ]),
              keywordDraft.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "tch-cs-search-clear",
                "aria-label": unref(t)("teacher.schedule.search.clear"),
                onClick: clearKeyword
              }, [..._cache[9] || (_cache[9] = [
                createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "close", -1)
              ])], 8, _hoisted_25)) : createCommentVNode("", true)
            ]),
            unref(recentClasses).length ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "tch-cs-recents",
              "aria-label": unref(t)("teacher.schedule.class.recent.aria")
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(recentClasses), (item) => {
                return openBlock(), createElementBlock("button", {
                  key: item.key,
                  type: "button",
                  class: "tch-cs-recent-pill",
                  title: classTitle(item),
                  onClick: ($event) => onRecentPill(item)
                }, [
                  _cache[11] || (_cache[11] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-[13px]",
                    "aria-hidden": "true"
                  }, "history", -1)),
                  createBaseVNode("span", _hoisted_28, toDisplayString(classTitle(item)), 1)
                ], 8, _hoisted_27);
              }), 128))
            ], 8, _hoisted_26)) : createCommentVNode("", true),
            createBaseVNode("section", _hoisted_29, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(classes), (item) => {
                return openBlock(), createElementBlock(Fragment, {
                  key: item.key
                }, [
                  item.scheduleUrl ? (openBlock(), createElementBlock("button", {
                    key: 0,
                    type: "button",
                    class: "tch-cs-card tch-cs-card--clickable p-3.5 text-left w-full",
                    disabled: unref(scheduleGrid).loading.value,
                    onClick: ($event) => viewClassSchedule(item)
                  }, [
                    createBaseVNode("div", _hoisted_31, [
                      createBaseVNode("span", _hoisted_32, toDisplayString(classTitle(item)), 1),
                      item.studentCount !== null ? (openBlock(), createElementBlock("span", _hoisted_33, toDisplayString(unref(tf)("teacher.schedule.class.count", { n: item.studentCount })), 1)) : createCommentVNode("", true)
                    ]),
                    classMeta(item) ? (openBlock(), createElementBlock("p", {
                      key: 0,
                      class: "tch-cs-card-meta mt-1 truncate",
                      title: classMeta(item)
                    }, toDisplayString(classMeta(item)), 9, _hoisted_34)) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_35, [
                      createBaseVNode("span", {
                        class: "tch-cs-card-meta truncate",
                        title: classMetaLine2(item)
                      }, toDisplayString(classMetaLine2(item)), 9, _hoisted_36),
                      createBaseVNode("span", _hoisted_37, [
                        unref(scheduleGrid).loading.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                          createTextVNode(toDisplayString(unref(t)("teacher.schedule.class.opening")), 1)
                        ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                          createTextVNode(toDisplayString(unref(t)("teacher.schedule.class.open")), 1)
                        ], 64)),
                        _cache[12] || (_cache[12] = createBaseVNode("span", {
                          class: "material-symbols-outlined text-[13px]",
                          "aria-hidden": "true"
                        }, "chevron_right", -1))
                      ])
                    ])
                  ], 8, _hoisted_30)) : (openBlock(), createElementBlock("article", _hoisted_38, [
                    createBaseVNode("div", _hoisted_39, [
                      createBaseVNode("span", _hoisted_40, toDisplayString(classTitle(item)), 1),
                      item.studentCount !== null ? (openBlock(), createElementBlock("span", _hoisted_41, toDisplayString(unref(tf)("teacher.schedule.class.count", { n: item.studentCount })), 1)) : createCommentVNode("", true)
                    ]),
                    classMeta(item) ? (openBlock(), createElementBlock("p", {
                      key: 0,
                      class: "tch-cs-card-meta mt-1 truncate",
                      title: classMeta(item)
                    }, toDisplayString(classMeta(item)), 9, _hoisted_42)) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_43, [
                      createBaseVNode("span", {
                        class: "tch-cs-card-meta truncate",
                        title: classMetaLine2(item)
                      }, toDisplayString(classMetaLine2(item)), 9, _hoisted_44),
                      createBaseVNode("span", _hoisted_45, toDisplayString(unref(t)("teacher.schedule.class.noParams")), 1)
                    ])
                  ]))
                ], 64);
              }), 128))
            ]),
            createBaseVNode("div", _hoisted_46, [
              createBaseVNode("p", _hoisted_47, [
                _cache[13] || (_cache[13] = createBaseVNode("span", {
                  class: "tch-cs-footer-dot",
                  "aria-hidden": "true"
                }, null, -1)),
                createTextVNode(" " + toDisplayString(footerText.value) + " ", 1),
                _cache[14] || (_cache[14] = createBaseVNode("span", {
                  class: "tch-cs-footer-dot",
                  "aria-hidden": "true"
                }, null, -1))
              ])
            ])
          ], 64)),
          createVNode(_sfc_main$2, {
            status: unref(syncStatus),
            "last-successful-sync-at": unref(lastSuccessfulSyncAt),
            "error-key": unref(isError) ? unref(errorKey) : ""
          }, null, 8, ["status", "last-successful-sync-at", "error-key"])
        ])
      ], 2);
    };
  }
});
const TeacherClassScheduleView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-534ec476"]]);
export {
  TeacherClassScheduleView as default
};
