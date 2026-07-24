import { o as onMounted, a as ref, E as resolveComponent, c as createElementBlock, b as openBlock, q as createVNode, f as createCommentVNode, d as createBaseVNode, u as unref, t as toDisplayString, l as withCtx, F as Fragment, i as renderList, C as withDirectives, D as vModelText, k as createBlock, j as withModifiers } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, f as fetchWithCache, a as axiosInstance, L as LONG_TTL } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { i as isTestAccountSession } from "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "training-plan-view" };
const _hoisted_2 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_3 = { class: "filters" };
const _hoisted_4 = { class: "filter-grid compact-main" };
const _hoisted_5 = ["value"];
const _hoisted_6 = ["value"];
const _hoisted_7 = { class: "filter-actions" };
const _hoisted_8 = {
  key: 0,
  class: "advanced-section"
};
const _hoisted_9 = { class: "filter-grid" };
const _hoisted_10 = ["value"];
const _hoisted_11 = ["value"];
const _hoisted_12 = ["value"];
const _hoisted_13 = ["value"];
const _hoisted_14 = { class: "content" };
const _hoisted_15 = {
  key: 2,
  class: "course-grid"
};
const _hoisted_16 = ["onClick"];
const _hoisted_17 = { class: "course-title" };
const _hoisted_18 = { class: "course-tags" };
const _hoisted_19 = { class: "tag primary" };
const _hoisted_20 = { class: "tag" };
const _hoisted_21 = { class: "tag ghost" };
const _hoisted_22 = { class: "course-sub" };
const _hoisted_23 = {
  key: 0,
  class: "empty"
};
const _hoisted_24 = {
  key: 3,
  class: "pagination"
};
const _hoisted_25 = ["disabled"];
const _hoisted_26 = ["disabled"];
const _hoisted_27 = { class: "modal-header" };
const _hoisted_28 = { class: "modal-body" };
const _hoisted_29 = { class: "detail-item" };
const _hoisted_30 = { class: "value" };
const _hoisted_31 = { class: "detail-item" };
const _hoisted_32 = { class: "value" };
const _hoisted_33 = { class: "detail-item" };
const _hoisted_34 = { class: "value" };
const _hoisted_35 = { class: "detail-item" };
const _hoisted_36 = { class: "value" };
const _hoisted_37 = { class: "detail-item" };
const _hoisted_38 = { class: "value" };
const _hoisted_39 = { class: "detail-item" };
const _hoisted_40 = { class: "value" };
const _hoisted_41 = { class: "detail-item" };
const _hoisted_42 = { class: "value" };
const _hoisted_43 = { class: "detail-item" };
const _hoisted_44 = { class: "value" };
const _hoisted_45 = { class: "detail-item" };
const _hoisted_46 = { class: "value" };
const _hoisted_47 = { class: "detail-item" };
const _hoisted_48 = { class: "value" };
const _sfc_main = {
  __name: "TrainingPlanView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
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
    const COURSE_NATURE_FALLBACK_MAP = {
      "11": "通识教育必修课",
      "12": "通识教育选修课",
      "16": "限定性选修课",
      "31": "学科基础课",
      "32": "工程基础课",
      "40": "专业核心课",
      "41": "专业方向组选课",
      "42": "专业任选课",
      "43": "专业基础课",
      "44": "专业必修课",
      "45": "专业选修课",
      "50": "基础实践",
      "51": "专业实践",
      "52": "综合实践",
      "53": "其他实践",
      "54": "短学期实践",
      "70": "辅修双学位理论",
      "71": "辅修双学位实践",
      "90": "必修",
      "98": "重修课",
      "99": "公共选修课"
    };
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
          error.value = data?.error || "获取培养方案失败";
        }
      } catch (e) {
        error.value = e.response?.data?.error || "网络错误";
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
      if (fromOptions?.label) return String(fromOptions.label).trim();
      return COURSE_NATURE_FALLBACK_MAP[raw] || raw;
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
          title: "培养方案",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, " 当前显示为离线数据，更新于" + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_3, [
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("label", null, [
              _cache[12] || (_cache[12] = createBaseVNode("span", null, "开设学年", -1)),
              createVNode(_component_IOSSelect, {
                modelValue: filters.value.grade,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => filters.value.grade = $event)
              }, {
                default: withCtx(() => [
                  _cache[11] || (_cache[11] = createBaseVNode("option", { value: "" }, "请选择", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.grade, (opt) => {
                    return openBlock(), createElementBlock("option", {
                      key: opt.value,
                      value: opt.value
                    }, toDisplayString(opt.label), 9, _hoisted_5);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ]),
            createBaseVNode("label", null, [
              _cache[14] || (_cache[14] = createBaseVNode("span", null, "开设学期", -1)),
              createVNode(_component_IOSSelect, {
                modelValue: filters.value.kkxq,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => filters.value.kkxq = $event)
              }, {
                default: withCtx(() => [
                  _cache[13] || (_cache[13] = createBaseVNode("option", { value: "" }, "请选择", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kkxq, (opt) => {
                    return openBlock(), createElementBlock("option", {
                      key: opt.value,
                      value: opt.value
                    }, toDisplayString(opt.label), 9, _hoisted_6);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ])
          ]),
          createBaseVNode("div", _hoisted_7, [
            createBaseVNode("button", {
              class: "primary",
              onClick: handleSearch
            }, "搜索"),
            createBaseVNode("button", {
              class: "ghost",
              onClick: resetFilters
            }, "重置"),
            createBaseVNode("button", {
              class: "ghost",
              onClick: _cache[3] || (_cache[3] = ($event) => showAdvanced.value = !showAdvanced.value)
            }, toDisplayString(showAdvanced.value ? "收起高级" : "展开高级"), 1)
          ]),
          showAdvanced.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("label", null, [
                _cache[16] || (_cache[16] = createBaseVNode("span", null, "开课院系", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kkyx,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => filters.value.kkyx = $event),
                  onChange: fetchJys
                }, {
                  default: withCtx(() => [
                    _cache[15] || (_cache[15] = createBaseVNode("option", { value: "" }, "请选择", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kkyx, (opt) => {
                      return openBlock(), createElementBlock("option", {
                        key: opt.value,
                        value: opt.value
                      }, toDisplayString(opt.label), 9, _hoisted_10);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("label", null, [
                _cache[18] || (_cache[18] = createBaseVNode("span", null, "开课教研室", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kkjys,
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => filters.value.kkjys = $event)
                }, {
                  default: withCtx(() => [
                    _cache[17] || (_cache[17] = createBaseVNode("option", { value: "" }, "请选择", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kkjys, (opt) => {
                      return openBlock(), createElementBlock("option", {
                        key: opt.value,
                        value: opt.value
                      }, toDisplayString(opt.label), 9, _hoisted_11);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("label", null, [
                _cache[20] || (_cache[20] = createBaseVNode("span", null, "课程性质", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kcxz,
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => filters.value.kcxz = $event)
                }, {
                  default: withCtx(() => [
                    _cache[19] || (_cache[19] = createBaseVNode("option", { value: "" }, "请选择", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kcxz, (opt) => {
                      return openBlock(), createElementBlock("option", {
                        key: opt.value,
                        value: opt.value
                      }, toDisplayString(opt.label), 9, _hoisted_12);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("label", null, [
                _cache[22] || (_cache[22] = createBaseVNode("span", null, "课程归属", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.kcgs,
                  "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => filters.value.kcgs = $event)
                }, {
                  default: withCtx(() => [
                    _cache[21] || (_cache[21] = createBaseVNode("option", { value: "" }, "请选择", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kcgs, (opt) => {
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
                _cache[23] || (_cache[23] = createBaseVNode("span", null, "课程编号", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => filters.value.kcbh = $event),
                  placeholder: "输入编号"
                }, null, 512), [
                  [vModelText, filters.value.kcbh]
                ])
              ]),
              createBaseVNode("label", null, [
                _cache[24] || (_cache[24] = createBaseVNode("span", null, "课程名称", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => filters.value.kcmc = $event),
                  placeholder: "输入名称"
                }, null, 512), [
                  [vModelText, filters.value.kcmc]
                ])
              ])
            ])
          ])) : createCommentVNode("", true)
        ]),
        createBaseVNode("section", _hoisted_14, [
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading"
          })) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: error.value
          }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_15, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(courses.value, (row) => {
              return openBlock(), createElementBlock("div", {
                key: row.id,
                class: "course-card",
                onClick: ($event) => openDetail(row)
              }, [
                createBaseVNode("div", _hoisted_17, toDisplayString(row.kcmc || "-"), 1),
                createBaseVNode("div", _hoisted_18, [
                  createBaseVNode("span", _hoisted_19, toDisplayString(row.sfbx || "未知"), 1),
                  createBaseVNode("span", _hoisted_20, "学分 " + toDisplayString(row.xf || "-"), 1),
                  createBaseVNode("span", _hoisted_21, toDisplayString(resolveCourseNature(row.kcxz)), 1)
                ]),
                createBaseVNode("div", _hoisted_22, [
                  createBaseVNode("span", null, toDisplayString(row.kcbh || "-"), 1),
                  createBaseVNode("span", null, toDisplayString(row.kkxq || "-"), 1)
                ])
              ], 8, _hoisted_16);
            }), 128)),
            courses.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_23, "暂无数据")) : createCommentVNode("", true)
          ])),
          pagination.value.totalPages > 1 ? (openBlock(), createElementBlock("div", _hoisted_24, [
            createBaseVNode("button", {
              onClick: handlePrev,
              disabled: pagination.value.page <= 1
            }, "上一页", 8, _hoisted_25),
            createBaseVNode("span", null, "第 " + toDisplayString(pagination.value.page) + " / " + toDisplayString(pagination.value.totalPages) + " 页", 1),
            createBaseVNode("button", {
              onClick: handleNext,
              disabled: pagination.value.page >= pagination.value.totalPages
            }, "下一页", 8, _hoisted_26)
          ])) : createCommentVNode("", true),
          showDetail.value ? (openBlock(), createElementBlock("div", {
            key: 4,
            class: "modal-overlay",
            onClick: closeDetail
          }, [
            createBaseVNode("div", {
              class: "modal-content",
              onClick: _cache[10] || (_cache[10] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_27, [
                createBaseVNode("h3", null, toDisplayString(selectedCourse.value?.kcmc || "课程详情"), 1),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: closeDetail
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_28, [
                createBaseVNode("div", _hoisted_29, [
                  _cache[25] || (_cache[25] = createBaseVNode("span", { class: "label" }, "课程编号", -1)),
                  createBaseVNode("span", _hoisted_30, toDisplayString(selectedCourse.value?.kcbh || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_31, [
                  _cache[26] || (_cache[26] = createBaseVNode("span", { class: "label" }, "课程性质", -1)),
                  createBaseVNode("span", _hoisted_32, toDisplayString(resolveCourseNature(selectedCourse.value?.kcxz)), 1)
                ]),
                createBaseVNode("div", _hoisted_33, [
                  _cache[27] || (_cache[27] = createBaseVNode("span", { class: "label" }, "选/必修", -1)),
                  createBaseVNode("span", _hoisted_34, toDisplayString(selectedCourse.value?.sfbx || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_35, [
                  _cache[28] || (_cache[28] = createBaseVNode("span", { class: "label" }, "课程归属", -1)),
                  createBaseVNode("span", _hoisted_36, toDisplayString(selectedCourse.value?.kcgs || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_37, [
                  _cache[29] || (_cache[29] = createBaseVNode("span", { class: "label" }, "开设学年", -1)),
                  createBaseVNode("span", _hoisted_38, toDisplayString(selectedCourse.value?.gradename || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_39, [
                  _cache[30] || (_cache[30] = createBaseVNode("span", { class: "label" }, "开设学期", -1)),
                  createBaseVNode("span", _hoisted_40, toDisplayString(selectedCourse.value?.kkxq || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_41, [
                  _cache[31] || (_cache[31] = createBaseVNode("span", { class: "label" }, "学分", -1)),
                  createBaseVNode("span", _hoisted_42, toDisplayString(selectedCourse.value?.xf || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_43, [
                  _cache[32] || (_cache[32] = createBaseVNode("span", { class: "label" }, "开课院系", -1)),
                  createBaseVNode("span", _hoisted_44, toDisplayString(selectedCourse.value?.kkyxmc || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_45, [
                  _cache[33] || (_cache[33] = createBaseVNode("span", { class: "label" }, "开课教研室", -1)),
                  createBaseVNode("span", _hoisted_46, toDisplayString(selectedCourse.value?.kkjysmc || "-"), 1)
                ]),
                createBaseVNode("div", _hoisted_47, [
                  _cache[34] || (_cache[34] = createBaseVNode("span", { class: "label" }, "考试形式", -1)),
                  createBaseVNode("span", _hoisted_48, toDisplayString(selectedCourse.value?.ksxs || "-"), 1)
                ])
              ])
            ])
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const TrainingPlanView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-4316dced"]]);
export {
  TrainingPlanView as default
};
