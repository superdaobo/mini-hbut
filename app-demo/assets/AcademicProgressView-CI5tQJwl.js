import { o as onMounted, E as resolveComponent, c as createElementBlock, b as openBlock, q as createVNode, f as createCommentVNode, d as createBaseVNode, k as createBlock, u as unref, a as ref, t as toDisplayString, l as withCtx, F as Fragment, i as renderList, e as computed, n as normalizeClass, j as withModifiers, v as Teleport } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, f as fetchWithCache, a as axiosInstance } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "progress-view" };
const _hoisted_2 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_3 = { class: "controls" };
const _hoisted_4 = ["value"];
const _hoisted_5 = {
  key: 0,
  class: "content"
};
const _hoisted_6 = {
  key: 0,
  class: "summary-card"
};
const _hoisted_7 = { class: "summary-label" };
const _hoisted_8 = { class: "summary-value" };
const _hoisted_9 = {
  key: 1,
  class: "category-section"
};
const _hoisted_10 = { class: "category-header" };
const _hoisted_11 = { class: "category-path" };
const _hoisted_12 = {
  key: 0,
  class: "category-requirement"
};
const _hoisted_13 = { class: "course-count" };
const _hoisted_14 = { class: "course-list" };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = { class: "course-title" };
const _hoisted_17 = { class: "course-meta" };
const _hoisted_18 = {
  key: 2,
  class: "empty"
};
const _hoisted_19 = { class: "modal-top" };
const _hoisted_20 = { class: "modal-tags" };
const _hoisted_21 = { class: "modal-tag" };
const _hoisted_22 = { class: "modal-path" };
const _hoisted_23 = { class: "detail-grid" };
const _hoisted_24 = { class: "detail-label" };
const _hoisted_25 = { class: "detail-value" };
const _sfc_main = {
  __name: "AcademicProgressView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const API_BASE = "/api";
    const loading = ref(false);
    const error = ref("");
    const progressData = ref(null);
    const fasz = ref(1);
    const offline = ref(false);
    const syncTime = ref("");
    const showDetail = ref(false);
    const selectedCourse = ref(null);
    const faszOptions = [
      { value: 1, label: "课程性质完成度" },
      { value: 0, label: "培养方案完成度" },
      { value: 2, label: "教学计划完成度" },
      { value: 4, label: "毕业学分完成度" }
    ];
    const FASZ_ALLOWED = new Set(faszOptions.map((item) => item.value));
    const SUMMARY_FIELD_LABEL = {
      gpa: "GPA",
      pjcj: "平均成绩",
      hdzxf: "累计获得学分",
      yxkms: "已选课门数",
      bjgms: "不及格门数",
      gpazypm: "GPA专业排名",
      xwjdpm: "学位绩点排名"
    };
    const SUMMARY_FIELD_ORDER = ["gpa", "pjcj", "hdzxf", "yxkms", "bjgms", "gpazypm", "xwjdpm"];
    const COURSE_FIELD_LABEL = {
      kcmc: "课程名称",
      kcbh: "课程编号",
      xf: "学分",
      hdxf: "获得学分",
      xfjd: "绩点",
      zhcj: "最高成绩",
      xnxq: "成绩学年学期",
      cjxq: "允许修读学年学期",
      kcxz: "课程性质",
      kclb: "课程类别",
      kkyxmc: "开课学院",
      skjs: "授课教师",
      jxbmc: "教学班名称",
      jxbzc: "教学班组成",
      wczt: "完成状态",
      sfbk: "是否补考",
      sfsq: "是否缓考",
      sfmx: "是否免修",
      bz: "备注"
    };
    const COURSE_DETAIL_FIELD_ORDER = [
      "kcbh",
      "xnxq",
      "cjxq",
      "xf",
      "hdxf",
      "xfjd",
      "zhcj",
      "kcxz",
      "kclb",
      "kkyxmc",
      "skjs",
      "jxbmc",
      "jxbzc",
      "wczt",
      "sfbk",
      "sfsq",
      "sfmx",
      "bz"
    ];
    const BOOLEAN_TEXT_KEYS = /* @__PURE__ */ new Set(["sfbk", "sfsq", "sfmx"]);
    const normalizeFasz = (value) => {
      const n = Number.parseInt(String(value ?? "").trim(), 10);
      if (!Number.isFinite(n)) return 1;
      return FASZ_ALLOWED.has(n) ? n : 1;
    };
    const normalizeValue = (value) => {
      if (value == null) return "";
      if (Array.isArray(value)) return value.map((item) => normalizeValue(item)).filter(Boolean).join("、");
      if (typeof value === "object") {
        try {
          return JSON.stringify(value);
        } catch {
          return "";
        }
      }
      if (typeof value === "boolean") return value ? "是" : "否";
      return String(value).trim();
    };
    const hasValue = (value) => normalizeValue(value) !== "";
    const normalizeCourseFieldValue = (key, rawValue) => {
      const value = normalizeValue(rawValue);
      if (!BOOLEAN_TEXT_KEYS.has(key)) return value;
      if (["1", "是", "Y", "y", "true", "TRUE"].includes(value)) return "是";
      if (["0", "否", "N", "n", "false", "FALSE", "-"].includes(value)) return "否";
      return value;
    };
    const normalizeCompletionText = (raw) => {
      const text = normalizeValue(raw);
      if (!text) return "";
      return text;
    };
    const completionPillClass = (raw) => {
      const text = normalizeCompletionText(raw);
      if (!text) return "state-unknown";
      if (/(已修|完成|通过)/.test(text) && !/(未修|未通过)/.test(text)) return "state-done";
      if (/(未修|未完成|未通过)/.test(text)) return "state-todo";
      if (/(已选课|未得分|未获得成绩|在修|修读中)/.test(text)) return "state-pending";
      return "state-unknown";
    };
    const requirementText = (node) => {
      if (!node || typeof node !== "object") return "";
      const parts = [];
      if (hasValue(node.yqzdxf)) parts.push(`最低学分 ${normalizeValue(node.yqzdxf)}`);
      if (hasValue(node.yqzgxf)) parts.push(`最高学分 ${normalizeValue(node.yqzgxf)}`);
      if (hasValue(node.yqzdms)) parts.push(`最低门数 ${normalizeValue(node.yqzdms)}`);
      if (hasValue(node.yqzgms)) parts.push(`最高门数 ${normalizeValue(node.yqzgms)}`);
      return parts.join(" / ");
    };
    const flattenCategorySections = (tree) => {
      const sections = [];
      const walk = (nodes, parentPath = []) => {
        if (!Array.isArray(nodes)) return;
        nodes.forEach((node, idx) => {
          if (!node || typeof node !== "object") return;
          const nodeName = normalizeValue(node.nodeName) || normalizeValue(node.name) || `分类${idx + 1}`;
          const path = [...parentPath, nodeName];
          const courses = Array.isArray(node.kcList) ? node.kcList.map((course, courseIdx) => ({
            ...course,
            _categoryPath: path.join(" / "),
            _categoryName: nodeName,
            _courseId: `${normalizeValue(node.nodeId) || path.join("-")}-${normalizeValue(course.kcbh) || normalizeValue(course.kcmc) || courseIdx}`
          })) : [];
          if (courses.length) {
            sections.push({
              id: normalizeValue(node.nodeId) || path.join("-"),
              name: nodeName,
              path: path.join(" / "),
              requirement: requirementText(node),
              courses
            });
          }
          walk(node.children, path);
        });
      };
      walk(tree, []);
      return sections;
    };
    const summaryItems = computed(() => {
      const summary = progressData.value?.summary;
      if (!summary || typeof summary !== "object") return [];
      return SUMMARY_FIELD_ORDER.map((key) => ({
        key,
        label: SUMMARY_FIELD_LABEL[key],
        value: normalizeValue(summary[key])
      })).filter((item) => hasValue(item.value));
    });
    const categorySections = computed(() => {
      const tree = progressData.value?.tree;
      if (Array.isArray(tree) && tree.length) {
        return flattenCategorySections(tree);
      }
      const list = progressData.value?.kcList;
      if (Array.isArray(list) && list.length) {
        return [{
          id: "all-courses",
          name: "全部课程",
          path: "全部课程",
          requirement: "",
          courses: list.map((course, idx) => ({
            ...course,
            _categoryPath: "全部课程",
            _categoryName: "全部课程",
            _courseId: `${normalizeValue(course.kcbh) || normalizeValue(course.kcmc) || idx}`
          }))
        }];
      }
      return [];
    });
    const selectedCourseFields = computed(() => {
      const course = selectedCourse.value;
      if (!course || typeof course !== "object") return [];
      return COURSE_DETAIL_FIELD_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(course, key)).map((key) => ({
        key,
        label: COURSE_FIELD_LABEL[key],
        value: normalizeCourseFieldValue(key, course[key])
      })).filter((item) => hasValue(item.value));
    });
    const selectedCourseTitle = computed(() => normalizeValue(selectedCourse.value?.kcmc) || "课程详情");
    const selectedCourseCategory = computed(() => normalizeValue(selectedCourse.value?._categoryPath) || "-");
    const openCourseDetail = (course) => {
      selectedCourse.value = course;
      showDetail.value = true;
    };
    const closeCourseDetail = () => {
      showDetail.value = false;
      selectedCourse.value = null;
    };
    const fetchProgress = async () => {
      loading.value = true;
      error.value = "";
      try {
        const faszInt = normalizeFasz(fasz.value);
        fasz.value = faszInt;
        const cacheKey = `academic:${props.studentId}:${faszInt}`;
        const { data } = await fetchWithCache(cacheKey, async () => {
          const res = await axiosInstance.post(`${API_BASE}/v2/academic_progress`, {
            student_id: props.studentId,
            fasz: faszInt
          });
          return res.data;
        });
        if (data?.success) {
          progressData.value = data.data || {};
          offline.value = !!data.offline;
          syncTime.value = data.sync_time || "";
        } else {
          if (data?.need_login) {
            emit("logout");
            return;
          }
          error.value = data?.error || "获取学业完成情况失败";
        }
      } catch (e) {
        error.value = e.response?.data?.error || "网络错误";
      } finally {
        loading.value = false;
      }
    };
    const handleFaszChange = () => {
      fasz.value = normalizeFasz(fasz.value);
      fetchProgress();
    };
    onMounted(() => {
      fetchProgress();
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "学业完成情况",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, " 当前显示为离线数据，更新于" + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_3, [
          _cache[3] || (_cache[3] = createBaseVNode("label", null, "完成度类型", -1)),
          createVNode(_component_IOSSelect, {
            modelValue: fasz.value,
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => fasz.value = $event),
            modelModifiers: { number: true },
            class: "fasz-select",
            onChange: handleFaszChange
          }, {
            default: withCtx(() => [
              (openBlock(), createElementBlock(Fragment, null, renderList(faszOptions, (f) => {
                return createBaseVNode("option", {
                  key: f.value,
                  value: f.value
                }, toDisplayString(f.label), 9, _hoisted_4);
              }), 64))
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]),
        loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 1,
          type: "loading"
        })) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 2,
          type: "error",
          message: error.value
        }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
          progressData.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
            summaryItems.value.length ? (openBlock(), createElementBlock("div", _hoisted_6, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(summaryItems.value, (item) => {
                return openBlock(), createElementBlock("div", {
                  class: "summary-item",
                  key: item.key
                }, [
                  createBaseVNode("span", _hoisted_7, toDisplayString(item.label), 1),
                  createBaseVNode("span", _hoisted_8, toDisplayString(item.value), 1)
                ]);
              }), 128))
            ])) : createCommentVNode("", true),
            categorySections.value.length ? (openBlock(), createElementBlock("div", _hoisted_9, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(categorySections.value, (section) => {
                return openBlock(), createElementBlock("section", {
                  class: "category-card",
                  key: section.id
                }, [
                  createBaseVNode("div", _hoisted_10, [
                    createBaseVNode("div", null, [
                      createBaseVNode("h2", null, toDisplayString(section.name), 1),
                      createBaseVNode("p", _hoisted_11, toDisplayString(section.path), 1),
                      section.requirement ? (openBlock(), createElementBlock("p", _hoisted_12, toDisplayString(section.requirement), 1)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_13, toDisplayString(section.courses.length) + " 门", 1)
                  ]),
                  createBaseVNode("div", _hoisted_14, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(section.courses, (course) => {
                      return openBlock(), createElementBlock("button", {
                        key: course._courseId,
                        type: "button",
                        class: "course-card",
                        onClick: ($event) => openCourseDetail(course)
                      }, [
                        createBaseVNode("div", _hoisted_16, toDisplayString(normalizeValue(course.kcmc) || "-"), 1),
                        createBaseVNode("div", _hoisted_17, [
                          createBaseVNode("span", null, "学分 " + toDisplayString(normalizeValue(course.xf) || "-"), 1),
                          createBaseVNode("span", null, toDisplayString(normalizeValue(course.kcxz) || normalizeValue(course.kclb) || "-"), 1),
                          createBaseVNode("span", {
                            class: normalizeClass(["status-pill", completionPillClass(course.wczt)])
                          }, toDisplayString(normalizeCompletionText(course.wczt) || "状态未知"), 3)
                        ])
                      ], 8, _hoisted_15);
                    }), 128))
                  ])
                ]);
              }), 128))
            ])) : (openBlock(), createElementBlock("div", _hoisted_18, "暂无学业情况数据"))
          ])) : createCommentVNode("", true)
        ], 64)),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showDetail.value && selectedCourse.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: closeCourseDetail
          }, [
            createBaseVNode("div", {
              class: "modal-content",
              onClick: _cache[2] || (_cache[2] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("button", {
                class: "modal-close",
                onClick: closeCourseDetail
              }, "×"),
              createBaseVNode("div", _hoisted_19, [
                createBaseVNode("h2", null, toDisplayString(selectedCourseTitle.value), 1),
                createBaseVNode("div", _hoisted_20, [
                  createBaseVNode("span", _hoisted_21, "学分 " + toDisplayString(normalizeValue(selectedCourse.value.xf) || "-"), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["modal-tag status-pill", completionPillClass(selectedCourse.value.wczt)])
                  }, toDisplayString(normalizeCompletionText(selectedCourse.value.wczt) || "状态未知"), 3)
                ]),
                createBaseVNode("div", _hoisted_22, "所属分类：" + toDisplayString(selectedCourseCategory.value), 1)
              ]),
              createBaseVNode("div", _hoisted_23, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(selectedCourseFields.value, (item) => {
                  return openBlock(), createElementBlock("div", {
                    class: "detail-item",
                    key: item.key
                  }, [
                    createBaseVNode("span", _hoisted_24, toDisplayString(item.label), 1),
                    createBaseVNode("span", _hoisted_25, toDisplayString(item.value), 1)
                  ]);
                }), 128))
              ])
            ])
          ])) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const AcademicProgressView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f1dc3284"]]);
export {
  AcademicProgressView as default
};
