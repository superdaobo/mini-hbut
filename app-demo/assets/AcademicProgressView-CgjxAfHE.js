import { o as onMounted, M as resolveComponent, a as openBlock, c as createElementBlock, p as createVNode, u as unref, t as toDisplayString, d as createCommentVNode, b as createBaseVNode, k as withCtx, F as Fragment, f as renderList, j as createBlock, n as normalizeClass, w as withModifiers, s as Teleport, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import { _ as _export_sfc, u as useLocale, t, f as fetchWithCache, d as axiosInstance } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
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
    const { locale } = useLocale();
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
      { value: 1, labelKey: "academic.fasz.nature" },
      { value: 0, labelKey: "academic.fasz.curriculum" },
      { value: 2, labelKey: "academic.fasz.teaching" },
      { value: 4, labelKey: "academic.fasz.graduation" }
    ];
    const FASZ_ALLOWED = new Set(faszOptions.map((item) => item.value));
    const SUMMARY_FIELD_LABEL = {
      gpa: "academic.summary.gpa",
      pjcj: "academic.summary.avgScore",
      hdzxf: "academic.summary.earnedCredits",
      yxkms: "academic.summary.selectedCourses",
      bjgms: "academic.summary.failedCourses",
      gpazypm: "academic.summary.gpaRank",
      xwjdpm: "academic.summary.degreeRank"
    };
    const SUMMARY_FIELD_ORDER = ["gpa", "pjcj", "hdzxf", "yxkms", "bjgms", "gpazypm", "xwjdpm"];
    const COURSE_FIELD_LABEL = {
      kcmc: "academic.course.kcmc",
      kcbh: "academic.course.kcbh",
      xf: "academic.course.xf",
      hdxf: "academic.course.hdxf",
      xfjd: "academic.course.xfjd",
      zhcj: "academic.course.zhcj",
      xnxq: "academic.course.xnxq",
      cjxq: "academic.course.cjxq",
      kcxz: "academic.course.kcxz",
      kclb: "academic.course.kclb",
      kkyxmc: "academic.course.kkyxmc",
      skjs: "academic.course.skjs",
      jxbmc: "academic.course.jxbmc",
      jxbzc: "academic.course.jxbzc",
      wczt: "academic.course.wczt",
      sfbk: "academic.course.sfbk",
      sfsq: "academic.course.sfsq",
      sfmx: "academic.course.sfmx",
      bz: "academic.course.bz"
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
      if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
      return String(value).trim();
    };
    const hasValue = (value) => normalizeValue(value) !== "";
    const normalizeCourseFieldValue = (key, rawValue) => {
      const value = normalizeValue(rawValue);
      if (!BOOLEAN_TEXT_KEYS.has(key)) return value;
      if (["1", "是", "Y", "y", "true", "TRUE"].includes(value)) return t("common.yes");
      if (["0", "否", "N", "n", "false", "FALSE", "-"].includes(value)) return t("common.no");
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
      if (hasValue(node.yqzdxf)) parts.push(`${t("academic.req.minCredits")} ${normalizeValue(node.yqzdxf)}`);
      if (hasValue(node.yqzgxf)) parts.push(`${t("academic.req.maxCredits")} ${normalizeValue(node.yqzgxf)}`);
      if (hasValue(node.yqzdms)) parts.push(`${t("academic.req.minCourses")} ${normalizeValue(node.yqzdms)}`);
      if (hasValue(node.yqzgms)) parts.push(`${t("academic.req.maxCourses")} ${normalizeValue(node.yqzgms)}`);
      return parts.join(" / ");
    };
    const flattenCategorySections = (tree) => {
      const sections = [];
      const walk = (nodes, parentPath = []) => {
        if (!Array.isArray(nodes)) return;
        nodes.forEach((node, idx) => {
          if (!node || typeof node !== "object") return;
          const nodeName = normalizeValue(node.nodeName) || normalizeValue(node.name) || `${t("academic.category.prefix")}${idx + 1}`;
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
        const allCoursesLabel = t("academic.allCourses");
        return [{
          id: "all-courses",
          name: allCoursesLabel,
          path: allCoursesLabel,
          requirement: "",
          courses: list.map((course, idx) => ({
            ...course,
            _categoryPath: allCoursesLabel,
            _categoryName: allCoursesLabel,
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
    const selectedCourseTitle = computed(() => normalizeValue(selectedCourse.value?.kcmc) || t("academic.courseDetail.default"));
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
          error.value = data?.error || t("academic.error.fetch");
        }
      } catch (e) {
        error.value = e.response?.data?.error || t("common.error.network");
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
          title: unref(t)("academic.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, toDisplayString(unref(t)("common.offline.prefix")) + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_3, [
          createBaseVNode("label", null, toDisplayString(unref(t)("academic.progressType")), 1),
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
                }, toDisplayString(unref(t)(f.labelKey)), 9, _hoisted_4);
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
                  createBaseVNode("span", _hoisted_7, toDisplayString(unref(t)(item.label)), 1),
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
                    createBaseVNode("div", _hoisted_13, toDisplayString(section.courses.length) + " " + toDisplayString(unref(t)("academic.unit.courses")), 1)
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
                          createBaseVNode("span", null, toDisplayString(unref(t)("academic.creditPrefix")) + " " + toDisplayString(normalizeValue(course.xf) || "-"), 1),
                          createBaseVNode("span", null, toDisplayString(normalizeValue(course.kcxz) || normalizeValue(course.kclb) || "-"), 1),
                          createBaseVNode("span", {
                            class: normalizeClass(["status-pill", completionPillClass(course.wczt)])
                          }, toDisplayString(normalizeCompletionText(course.wczt) || unref(t)("academic.status.unknown")), 3)
                        ])
                      ], 8, _hoisted_15);
                    }), 128))
                  ])
                ]);
              }), 128))
            ])) : (openBlock(), createElementBlock("div", _hoisted_18, toDisplayString(unref(t)("academic.empty")), 1))
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
                  createBaseVNode("span", _hoisted_21, toDisplayString(unref(t)("academic.creditPrefix")) + " " + toDisplayString(normalizeValue(selectedCourse.value.xf) || "-"), 1),
                  createBaseVNode("span", {
                    class: normalizeClass(["modal-tag status-pill", completionPillClass(selectedCourse.value.wczt)])
                  }, toDisplayString(normalizeCompletionText(selectedCourse.value.wczt) || unref(t)("academic.status.unknown")), 3)
                ]),
                createBaseVNode("div", _hoisted_22, toDisplayString(unref(t)("academic.belongCategory")) + "：" + toDisplayString(selectedCourseCategory.value), 1)
              ]),
              createBaseVNode("div", _hoisted_23, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(selectedCourseFields.value, (item) => {
                  return openBlock(), createElementBlock("div", {
                    class: "detail-item",
                    key: item.key
                  }, [
                    createBaseVNode("span", _hoisted_24, toDisplayString(unref(t)(item.label)), 1),
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
const AcademicProgressView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b4f860f6"]]);
export {
  AcademicProgressView as default
};
