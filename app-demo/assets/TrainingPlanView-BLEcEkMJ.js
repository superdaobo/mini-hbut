import { o as onMounted, M as resolveComponent, a as openBlock, c as createElementBlock, p as createVNode, u as unref, t as toDisplayString, d as createCommentVNode, b as createBaseVNode, k as withCtx, F as Fragment, f as renderList, K as withDirectives, L as vModelText, j as createBlock, w as withModifiers, s as Teleport, r as ref } from "./vue-core-Dzs4fLAU.js";
import { _ as _export_sfc, u as useLocale, t, f as fetchWithCache, d as axiosInstance, L as LONG_TTL } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { i as isTestAccountSession } from "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "training-plan-view" };
const _hoisted_2 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_3 = { class: "filters" };
const _hoisted_4 = { class: "filter-grid compact-main" };
const _hoisted_5 = { value: "" };
const _hoisted_6 = ["value"];
const _hoisted_7 = { value: "" };
const _hoisted_8 = ["value"];
const _hoisted_9 = { class: "filter-actions" };
const _hoisted_10 = {
  key: 0,
  class: "advanced-section"
};
const _hoisted_11 = { class: "filter-grid" };
const _hoisted_12 = { value: "" };
const _hoisted_13 = ["value"];
const _hoisted_14 = { value: "" };
const _hoisted_15 = ["value"];
const _hoisted_16 = { value: "" };
const _hoisted_17 = ["value"];
const _hoisted_18 = { value: "" };
const _hoisted_19 = ["value"];
const _hoisted_20 = ["placeholder"];
const _hoisted_21 = ["placeholder"];
const _hoisted_22 = { class: "content" };
const _hoisted_23 = {
  key: 2,
  class: "course-grid"
};
const _hoisted_24 = ["onClick"];
const _hoisted_25 = { class: "course-title" };
const _hoisted_26 = { class: "course-tags" };
const _hoisted_27 = { class: "tag primary" };
const _hoisted_28 = { class: "tag" };
const _hoisted_29 = { class: "tag ghost" };
const _hoisted_30 = { class: "course-sub" };
const _hoisted_31 = {
  key: 0,
  class: "empty"
};
const _hoisted_32 = {
  key: 3,
  class: "pagination"
};
const _hoisted_33 = ["disabled"];
const _hoisted_34 = ["disabled"];
const _hoisted_35 = { class: "modal-header" };
const _hoisted_36 = { class: "modal-body" };
const _hoisted_37 = { class: "detail-item" };
const _hoisted_38 = { class: "label" };
const _hoisted_39 = { class: "value" };
const _hoisted_40 = { class: "detail-item" };
const _hoisted_41 = { class: "label" };
const _hoisted_42 = { class: "value" };
const _hoisted_43 = { class: "detail-item" };
const _hoisted_44 = { class: "label" };
const _hoisted_45 = { class: "value" };
const _hoisted_46 = { class: "detail-item" };
const _hoisted_47 = { class: "label" };
const _hoisted_48 = { class: "value" };
const _hoisted_49 = { class: "detail-item" };
const _hoisted_50 = { class: "label" };
const _hoisted_51 = { class: "value" };
const _hoisted_52 = { class: "detail-item" };
const _hoisted_53 = { class: "label" };
const _hoisted_54 = { class: "value" };
const _hoisted_55 = { class: "detail-item" };
const _hoisted_56 = { class: "label" };
const _hoisted_57 = { class: "value" };
const _hoisted_58 = { class: "detail-item" };
const _hoisted_59 = { class: "label" };
const _hoisted_60 = { class: "value" };
const _hoisted_61 = { class: "detail-item" };
const _hoisted_62 = { class: "label" };
const _hoisted_63 = { class: "value" };
const _hoisted_64 = { class: "detail-item" };
const _hoisted_65 = { class: "label" };
const _hoisted_66 = { class: "value" };
const _sfc_main = {
  __name: "TrainingPlanView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const { locale } = useLocale();
    const API_BASE = "/api";
    const props = __props;
    const emit = __emit;
    const loading = ref(false);
    const error = ref("");
    const courses = ref([]);
    const offline = ref(false);
    const syncTime = ref("");
    const selectedCourse = ref(null);
    const showDetail = ref(false);
    const showAdvanced = ref(false);
    const options = ref({
      grade: [],
      kkxq: [],
      kkyx: [],
      kcxz: [],
      kcgs: [],
      kkjys: []
    });
    const COURSE_NATURE_FALLBACK_CODES = [
      "11",
      "12",
      "16",
      "31",
      "32",
      "40",
      "41",
      "42",
      "43",
      "44",
      "45",
      "50",
      "51",
      "52",
      "53",
      "54",
      "70",
      "71",
      "90",
      "98",
      "99"
    ];
    const defaults = ref({
      grade: "",
      kkxq: ""
    });
    const filters = ref({
      grade: "",
      kkxq: "",
      kkyx: "",
      kkjys: "",
      kcxz: "",
      kcgs: "",
      kcbh: "",
      kcmc: ""
    });
    const pagination = ref({
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0
    });
    const loadLocalOptions = () => {
      const raw = localStorage.getItem("hbu_training_options");
      if (!raw) return;
      try {
        const cached = JSON.parse(raw);
        if (cached?.options) {
          options.value = {
            ...options.value,
            ...cached.options
          };
        }
        if (cached?.defaults) {
          defaults.value = cached.defaults;
          filters.value.grade = cached.defaults.grade || filters.value.grade;
          filters.value.kkxq = cached.defaults.kkxq || filters.value.kkxq;
        }
      } catch (e) {
      }
    };
    const fetchOptions = async () => {
      try {
        console.log("[TrainingPlan] Fetching options...");
        const { data, fromCache } = await fetchWithCache(`training:options:${props.studentId}`, async () => {
          console.log("[TrainingPlan] Making API call for options");
          const res = await axiosInstance.post(`${API_BASE}/v2/training_plan/options`, {
            student_id: props.studentId
          });
          console.log("[TrainingPlan] Options API response:", res.data);
          return res.data;
        }, LONG_TTL);
        console.log("[TrainingPlan] Options data:", data, "fromCache:", fromCache);
        if (data?.success) {
          options.value = {
            ...options.value,
            ...data.options
          };
          defaults.value = data.defaults || defaults.value;
          filters.value.grade = defaults.value.grade || "";
          filters.value.kkxq = defaults.value.kkxq || "";
          if (!isTestAccountSession()) {
            localStorage.setItem("hbu_training_options", JSON.stringify({
              options: options.value,
              defaults: defaults.value
            }));
          }
          await fetchJys();
        } else if (data?.need_login) {
          emit("logout");
        }
      } catch (e) {
        console.error("获取培养方案筛选项失败", e);
      }
    };
    const fetchJys = async () => {
      if (!filters.value.kkyx) {
        options.value.kkjys = [];
        filters.value.kkjys = "";
        return;
      }
      try {
        const { data } = await fetchWithCache(`training:jys:${props.studentId}:${filters.value.kkyx}`, async () => {
          const res = await axiosInstance.post(`${API_BASE}/v2/training_plan/jys`, {
            student_id: props.studentId,
            kkyx: filters.value.kkyx
          });
          return res.data;
        }, LONG_TTL);
        if (data?.success) {
          options.value.kkjys = data.data || [];
          filters.value.kkjys = "";
        }
      } catch (e) {
        console.error("获取教研室失败", e);
      }
    };
    const fetchCourses = async (page = pagination.value.page) => {
      loading.value = true;
      error.value = "";
      console.log("[TrainingPlan] fetchCourses called with page:", page, "filters:", JSON.stringify(filters.value));
      try {
        const cacheKey = `training:${props.studentId}:${page}:${JSON.stringify(filters.value)}`;
        const { data, fromCache } = await fetchWithCache(cacheKey, async () => {
          console.log("[TrainingPlan] Making API call for courses");
          const res = await axiosInstance.post(`${API_BASE}/v2/training_plan`, {
            student_id: props.studentId,
            ...filters.value,
            page,
            page_size: pagination.value.pageSize
          });
          console.log("[TrainingPlan] Courses API response:", res.data);
          return res.data;
        }, LONG_TTL);
        console.log("[TrainingPlan] Courses data:", data, "fromCache:", fromCache);
        if (data?.success) {
          courses.value = data.data || [];
          pagination.value.page = data.page || page;
          pagination.value.total = data.total || 0;
          pagination.value.totalPages = data.totalPages || 0;
          offline.value = !!data.offline;
          syncTime.value = data.sync_time || "";
        } else {
          error.value = data?.error || t("trainingplan.error.fetch");
        }
      } catch (e) {
        error.value = e.response?.data?.error || t("common.error.network");
        console.error("[TrainingPlan] fetchCourses error:", e);
      } finally {
        loading.value = false;
      }
    };
    const resetFilters = async () => {
      filters.value = {
        grade: defaults.value.grade || "",
        kkxq: defaults.value.kkxq || "",
        kkyx: "",
        kkjys: "",
        kcxz: "",
        kcgs: "",
        kcbh: "",
        kcmc: ""
      };
      await fetchJys();
      fetchCourses(1);
    };
    const handleSearch = () => {
      fetchCourses(1);
    };
    const handlePrev = () => {
      if (pagination.value.page > 1) {
        fetchCourses(pagination.value.page - 1);
      }
    };
    const handleNext = () => {
      if (pagination.value.page < pagination.value.totalPages) {
        fetchCourses(pagination.value.page + 1);
      }
    };
    const resolveCourseNature = (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "-";
      if (/[^\d]/.test(raw)) return raw;
      const fromOptions = (options.value.kcxz || []).find(
        (item) => String(item?.value ?? "").trim() === raw
      );
      if (fromOptions?.label) return translateNatureText(String(fromOptions.label).trim());
      if (COURSE_NATURE_FALLBACK_CODES.includes(raw)) return t(`grade.nature.${raw}`);
      return raw;
    };
    const translateNatureText = (text) => {
      if (!text) return text;
      const NATURE_KEY_MAP = [
        [/通识教育必修|通识必修/, "grade.nature.11"],
        [/通识教育选修|通识选修|公共选修/, "grade.nature.99"],
        [/限定性选修|限定选修/, "grade.nature.16"],
        [/学科基础/, "grade.nature.31"],
        [/工程基础/, "grade.nature.32"],
        [/专业核心/, "grade.nature.40"],
        [/专业方向组/, "grade.nature.41"],
        [/专业任选/, "grade.nature.42"],
        [/专业基础/, "grade.nature.43"],
        [/专业必修/, "grade.nature.44"],
        [/专业选修/, "grade.nature.45"],
        [/基础实践/, "grade.nature.50"],
        [/专业实践/, "grade.nature.51"],
        [/综合实践/, "grade.nature.52"],
        [/其他实践/, "grade.nature.53"],
        [/短学期实践/, "grade.nature.54"],
        [/辅修双学位理论|辅修理论/, "grade.nature.70"],
        [/辅修双学位实践|辅修实践/, "grade.nature.71"],
        [/重修/, "grade.nature.98"],
        [/必修/, "trainingplan.sfbx.compulsory"],
        [/选修/, "trainingplan.sfbx.elective"]
      ];
      for (const [pattern, key] of NATURE_KEY_MAP) {
        if (pattern.test(text)) return t(key);
      }
      return text;
    };
    const resolveSfbxText = (value) => {
      const text = String(value ?? "").trim();
      if (!text) return text;
      if (/必修/.test(text)) return t("trainingplan.sfbx.compulsory");
      if (/选修/.test(text)) return t("trainingplan.sfbx.elective");
      return text;
    };
    const openDetail = (course) => {
      selectedCourse.value = course;
      showDetail.value = true;
    };
    const closeDetail = () => {
      showDetail.value = false;
      selectedCourse.value = null;
    };
    onMounted(async () => {
      loadLocalOptions();
      await fetchOptions();
      console.log("[TrainingPlan] Mounted, fetching courses with filters:", JSON.stringify(filters.value));
      await fetchCourses(1);
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("trainingplan.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, toDisplayString(unref(t)("common.offline.prefix")) + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_3, [
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("label", null, [
              createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.year.label")), 1),
              createVNode(_component_IOSSelect, {
                modelValue: filters.value.grade,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => filters.value.grade = $event)
              }, {
                default: withCtx(() => [
                  createBaseVNode("option", _hoisted_5, toDisplayString(unref(t)("trainingplan.option.please")), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.grade, (opt) => {
                    return openBlock(), createElementBlock("option", {
                      key: opt.value,
                      value: opt.value
                    }, toDisplayString(opt.label), 9, _hoisted_6);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ]),
            createBaseVNode("label", null, [
              createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.term.label")), 1),
              createVNode(_component_IOSSelect, {
                modelValue: filters.value.kkxq,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => filters.value.kkxq = $event)
              }, {
                default: withCtx(() => [
                  createBaseVNode("option", _hoisted_7, toDisplayString(unref(t)("trainingplan.option.please")), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kkxq, (opt) => {
                    return openBlock(), createElementBlock("option", {
                      key: opt.value,
                      value: opt.value
                    }, toDisplayString(opt.label), 9, _hoisted_8);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ])
          ]),
          createBaseVNode("div", _hoisted_9, [
            createBaseVNode("button", {
              class: "primary",
              onClick: handleSearch
            }, toDisplayString(unref(t)("trainingplan.search")), 1),
            createBaseVNode("button", {
              class: "ghost",
              onClick: resetFilters
            }, toDisplayString(unref(t)("trainingplan.reset")), 1),
            createBaseVNode("button", {
              class: "ghost",
              onClick: _cache[3] || (_cache[3] = ($event) => showAdvanced.value = !showAdvanced.value)
            }, toDisplayString(showAdvanced.value ? unref(t)("trainingplan.advanced.collapse") : unref(t)("trainingplan.advanced.expand")), 1)
          ]),
          showAdvanced.value ? (openBlock(), createElementBlock("div", _hoisted_10, [
            createBaseVNode("div", _hoisted_11, [
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.dept.label")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kkyx,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => filters.value.kkyx = $event),
                  onChange: fetchJys
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_12, toDisplayString(unref(t)("trainingplan.option.please")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kkyx, (opt) => {
                      return openBlock(), createElementBlock("option", {
                        key: opt.value,
                        value: opt.value
                      }, toDisplayString(opt.label), 9, _hoisted_13);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.jys.label")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kkjys,
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => filters.value.kkjys = $event)
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_14, toDisplayString(unref(t)("trainingplan.option.please")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kkjys, (opt) => {
                      return openBlock(), createElementBlock("option", {
                        key: opt.value,
                        value: opt.value
                      }, toDisplayString(opt.label), 9, _hoisted_15);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.nature.label")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kcxz,
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => filters.value.kcxz = $event)
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_16, toDisplayString(unref(t)("trainingplan.option.please")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kcxz, (opt) => {
                      return openBlock(), createElementBlock("option", {
                        key: opt.value,
                        value: opt.value
                      }, toDisplayString(opt.label), 9, _hoisted_17);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.attribution.label")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kcgs,
                  "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => filters.value.kcgs = $event)
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_18, toDisplayString(unref(t)("trainingplan.option.please")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kcgs, (opt) => {
                      return openBlock(), createElementBlock("option", {
                        key: opt.value,
                        value: opt.value
                      }, toDisplayString(opt.label), 9, _hoisted_19);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.code.label")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => filters.value.kcbh = $event),
                  placeholder: unref(t)("trainingplan.code.placeholder")
                }, null, 8, _hoisted_20), [
                  [vModelText, filters.value.kcbh]
                ])
              ]),
              createBaseVNode("label", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.name.label")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => filters.value.kcmc = $event),
                  placeholder: unref(t)("trainingplan.name.placeholder")
                }, null, 8, _hoisted_21), [
                  [vModelText, filters.value.kcmc]
                ])
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        createBaseVNode("section", _hoisted_22, [
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading"
          })) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: error.value
          }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_23, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(courses.value, (row) => {
              return openBlock(), createElementBlock("div", {
                key: row.id,
                class: "course-card",
                onClick: ($event) => openDetail(row)
              }, [
                createBaseVNode("div", _hoisted_25, toDisplayString(row.kcmc || "-"), 1),
                createBaseVNode("div", _hoisted_26, [
                  createBaseVNode("span", _hoisted_27, toDisplayString(resolveSfbxText(row.sfbx) || unref(t)("common.unknown")), 1),
                  createBaseVNode("span", _hoisted_28, toDisplayString(unref(t)("trainingplan.creditPrefix")) + " " + toDisplayString(row.xf || "-"), 1),
                  createBaseVNode("span", _hoisted_29, toDisplayString(resolveCourseNature(row.kcxz)), 1)
                ]),
                createBaseVNode("div", _hoisted_30, [
                  createBaseVNode("span", null, toDisplayString(row.kcbh || "-"), 1),
                  createBaseVNode("span", null, toDisplayString(row.kkxq || "-"), 1)
                ])
              ], 8, _hoisted_24);
            }), 128)),
            courses.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_31, toDisplayString(unref(t)("trainingplan.empty")), 1)) : createCommentVNode("", true)
          ])),
          pagination.value.totalPages > 1 ? (openBlock(), createElementBlock("div", _hoisted_32, [
            createBaseVNode("button", {
              onClick: handlePrev,
              disabled: pagination.value.page <= 1
            }, toDisplayString(unref(t)("trainingplan.prev")), 9, _hoisted_33),
            createBaseVNode("span", null, toDisplayString(unref(t)("trainingplan.pagePrefix")) + " " + toDisplayString(pagination.value.page) + " / " + toDisplayString(pagination.value.totalPages) + " " + toDisplayString(unref(t)("trainingplan.pageSuffix")), 1),
            createBaseVNode("button", {
              onClick: handleNext,
              disabled: pagination.value.page >= pagination.value.totalPages
            }, toDisplayString(unref(t)("trainingplan.next")), 9, _hoisted_34)
          ])) : createCommentVNode("", true),
          (openBlock(), createBlock(Teleport, { to: "body" }, [
            showDetail.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-overlay",
              onClick: closeDetail
            }, [
              createBaseVNode("div", {
                class: "modal-content",
                onClick: _cache[10] || (_cache[10] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("div", _hoisted_35, [
                  createBaseVNode("h3", null, toDisplayString(selectedCourse.value?.kcmc || unref(t)("trainingplan.detail.default")), 1),
                  createBaseVNode("button", {
                    class: "close-btn",
                    onClick: closeDetail
                  }, "×")
                ]),
                createBaseVNode("div", _hoisted_36, [
                  createBaseVNode("div", _hoisted_37, [
                    createBaseVNode("span", _hoisted_38, toDisplayString(unref(t)("trainingplan.detail.code")), 1),
                    createBaseVNode("span", _hoisted_39, toDisplayString(selectedCourse.value?.kcbh || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_40, [
                    createBaseVNode("span", _hoisted_41, toDisplayString(unref(t)("trainingplan.detail.nature")), 1),
                    createBaseVNode("span", _hoisted_42, toDisplayString(resolveCourseNature(selectedCourse.value?.kcxz)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_43, [
                    createBaseVNode("span", _hoisted_44, toDisplayString(unref(t)("trainingplan.detail.sfbx")), 1),
                    createBaseVNode("span", _hoisted_45, toDisplayString(resolveSfbxText(selectedCourse.value?.sfbx) || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_46, [
                    createBaseVNode("span", _hoisted_47, toDisplayString(unref(t)("trainingplan.detail.attribution")), 1),
                    createBaseVNode("span", _hoisted_48, toDisplayString(selectedCourse.value?.kcgs || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_49, [
                    createBaseVNode("span", _hoisted_50, toDisplayString(unref(t)("trainingplan.detail.year")), 1),
                    createBaseVNode("span", _hoisted_51, toDisplayString(selectedCourse.value?.gradename || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_52, [
                    createBaseVNode("span", _hoisted_53, toDisplayString(unref(t)("trainingplan.detail.term")), 1),
                    createBaseVNode("span", _hoisted_54, toDisplayString(selectedCourse.value?.kkxq || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_55, [
                    createBaseVNode("span", _hoisted_56, toDisplayString(unref(t)("trainingplan.detail.credit")), 1),
                    createBaseVNode("span", _hoisted_57, toDisplayString(selectedCourse.value?.xf || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_58, [
                    createBaseVNode("span", _hoisted_59, toDisplayString(unref(t)("trainingplan.detail.dept")), 1),
                    createBaseVNode("span", _hoisted_60, toDisplayString(selectedCourse.value?.kkyxmc || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_61, [
                    createBaseVNode("span", _hoisted_62, toDisplayString(unref(t)("trainingplan.detail.jys")), 1),
                    createBaseVNode("span", _hoisted_63, toDisplayString(selectedCourse.value?.kkjysmc || "-"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_64, [
                    createBaseVNode("span", _hoisted_65, toDisplayString(unref(t)("trainingplan.detail.examForm")), 1),
                    createBaseVNode("span", _hoisted_66, toDisplayString(selectedCourse.value?.ksxs || "-"), 1)
                  ])
                ])
              ])
            ])) : createCommentVNode("", true)
          ]))
        ])
      ]);
    };
  }
};
const TrainingPlanView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-99dfbbb2"]]);
export {
  TrainingPlanView as default
};
