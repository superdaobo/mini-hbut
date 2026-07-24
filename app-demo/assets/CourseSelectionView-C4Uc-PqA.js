import { o as onMounted, a as ref, m as onBeforeUnmount, E as resolveComponent, c as createElementBlock, b as openBlock, d as createBaseVNode, k as createBlock, q as createVNode, t as toDisplayString, e as computed, F as Fragment, f as createCommentVNode, C as withDirectives, D as vModelText, l as withCtx, i as renderList, u as unref, n as normalizeClass, j as withModifiers, H as vModelCheckbox, v as Teleport, g as createTextVNode, T as Transition } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, a as axiosInstance } from "./app-demo-CxKBY5JQ.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "course-selection-view" };
const _hoisted_2 = { class: "course-page-header glass-card" };
const _hoisted_3 = { class: "header-top" };
const _hoisted_4 = { class: "course-page-title" };
const _hoisted_5 = ["disabled"];
const _hoisted_6 = {
  key: 1,
  class: "refresh-btn-placeholder",
  "aria-hidden": "true"
};
const _hoisted_7 = { class: "header-meta-row" };
const _hoisted_8 = { class: "header-mini-pill" };
const _hoisted_9 = { class: "header-mini-pill" };
const _hoisted_10 = { class: "content" };
const _hoisted_11 = {
  key: 0,
  class: "entry-grid"
};
const _hoisted_12 = { class: "filter-card glass-card" };
const _hoisted_13 = { class: "filter-header" };
const _hoisted_14 = { class: "filter-actions" };
const _hoisted_15 = ["disabled"];
const _hoisted_16 = { class: "filter-grid compact-grid" };
const _hoisted_17 = { class: "field span-2" };
const _hoisted_18 = { class: "field" };
const _hoisted_19 = ["value"];
const _hoisted_20 = { class: "field" };
const _hoisted_21 = ["value"];
const _hoisted_22 = { class: "field" };
const _hoisted_23 = ["value"];
const _hoisted_24 = { class: "field" };
const _hoisted_25 = { class: "filter-grid advanced-grid" };
const _hoisted_26 = { class: "field" };
const _hoisted_27 = ["value"];
const _hoisted_28 = { class: "field" };
const _hoisted_29 = ["value"];
const _hoisted_30 = { class: "field" };
const _hoisted_31 = ["value"];
const _hoisted_32 = { class: "batch-card glass-card" };
const _hoisted_33 = { class: "section-head" };
const _hoisted_34 = {
  key: 0,
  class: "batch-select-wrap"
};
const _hoisted_35 = ["value"];
const _hoisted_36 = { class: "result-block" };
const _hoisted_37 = {
  key: 2,
  class: "course-list"
};
const _hoisted_38 = ["onClick"];
const _hoisted_39 = { class: "course-top" };
const _hoisted_40 = { class: "course-name" };
const _hoisted_41 = { class: "course-class" };
const _hoisted_42 = { class: "course-top-right" };
const _hoisted_43 = {
  key: 0,
  class: "meta-chip conflict-meta-pill"
};
const _hoisted_44 = { class: "course-credit" };
const _hoisted_45 = { class: "course-meta-row" };
const _hoisted_46 = { class: "meta-chip teacher-chip" };
const _hoisted_47 = {
  key: 0,
  class: "meta-chip online-pill"
};
const _hoisted_48 = {
  key: 1,
  class: "meta-chip schedule-chip"
};
const _hoisted_49 = { class: "course-footer-row" };
const _hoisted_50 = { class: "course-meta-row secondary compact" };
const _hoisted_51 = { class: "meta-chip" };
const _hoisted_52 = ["disabled", "onClick"];
const _hoisted_53 = ["disabled", "onClick"];
const _hoisted_54 = { class: "filter-card glass-card" };
const _hoisted_55 = { class: "filter-header" };
const _hoisted_56 = { class: "filter-actions" };
const _hoisted_57 = ["disabled"];
const _hoisted_58 = { class: "filter-grid info-base-grid" };
const _hoisted_59 = { class: "field" };
const _hoisted_60 = ["value"];
const _hoisted_61 = { class: "filter-grid compact-grid" };
const _hoisted_62 = { class: "field span-2" };
const _hoisted_63 = { class: "field" };
const _hoisted_64 = { class: "filter-grid advanced-grid" };
const _hoisted_65 = { class: "field" };
const _hoisted_66 = ["value"];
const _hoisted_67 = { class: "field" };
const _hoisted_68 = ["value"];
const _hoisted_69 = { class: "field" };
const _hoisted_70 = ["value"];
const _hoisted_71 = { class: "info-toggle-row" };
const _hoisted_72 = { class: "info-toggle-check" };
const _hoisted_73 = { class: "result-block" };
const _hoisted_74 = {
  key: 0,
  class: "info-source-tip"
};
const _hoisted_75 = { class: "course-list" };
const _hoisted_76 = ["onClick"];
const _hoisted_77 = { class: "course-top" };
const _hoisted_78 = { class: "course-name" };
const _hoisted_79 = { class: "course-class" };
const _hoisted_80 = { class: "course-top-right" };
const _hoisted_81 = { class: "meta-chip success-meta-pill" };
const _hoisted_82 = { class: "course-credit" };
const _hoisted_83 = { class: "course-meta-row" };
const _hoisted_84 = { class: "meta-chip teacher-chip" };
const _hoisted_85 = {
  key: 0,
  class: "meta-chip online-pill"
};
const _hoisted_86 = {
  key: 1,
  class: "meta-chip schedule-chip"
};
const _hoisted_87 = { class: "course-meta-row secondary compact" };
const _hoisted_88 = { class: "meta-chip" };
const _hoisted_89 = { class: "meta-chip" };
const _hoisted_90 = { class: "modal-header" };
const _hoisted_91 = { class: "modal-title" };
const _hoisted_92 = { class: "modal-subtitle" };
const _hoisted_93 = { class: "detail-badges" };
const _hoisted_94 = {
  key: 0,
  class: "meta-chip online-pill"
};
const _hoisted_95 = { class: "detail-grid" };
const _hoisted_96 = { class: "detail-label" };
const _hoisted_97 = { class: "detail-value" };
const _hoisted_98 = { class: "detail-section" };
const _hoisted_99 = { class: "detail-paragraph" };
const _hoisted_100 = { class: "detail-section" };
const _hoisted_101 = { class: "detail-paragraph" };
const _hoisted_102 = {
  key: 0,
  class: "detail-loading"
};
const _hoisted_103 = { class: "modal-header" };
const _hoisted_104 = { class: "modal-subtitle" };
const _hoisted_105 = { class: "child-class-list" };
const _hoisted_106 = ["onClick"];
const _hoisted_107 = { class: "child-class-name" };
const _hoisted_108 = { class: "child-class-meta" };
const _hoisted_109 = { class: "child-class-meta" };
const _hoisted_110 = { class: "confirm-actions" };
const _hoisted_111 = ["disabled"];
const _hoisted_112 = { class: "modal-title" };
const _hoisted_113 = { class: "detail-paragraph" };
const _hoisted_114 = { class: "confirm-actions" };
const _hoisted_115 = ["disabled"];
const DEFAULT_FROM = "ggxxk";
const ENTRY_MODE_MENU = "menu";
const ENTRY_MODE_SELECTION = "selection";
const ENTRY_MODE_INFO = "info";
const _sfc_main = {
  __name: "CourseSelectionView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const API_BASE = "/api";
    const KKLX_FROM_MAP = Object.freeze({
      "1": "jhxk",
      "2": "ggxxk",
      "3": "fjjx",
      "5": "cxxk",
      "6": "jhxk",
      "7": "jhxk",
      "8": "jhxk",
      "16": "ggxxk",
      "18": "cxxk",
      "22": "jhxk"
    });
    const KCXZ_LABEL_MAP = Object.freeze({
      "11": "通识必修",
      "12": "通识选修",
      "16": "限定选修",
      "31": "学科基础",
      "32": "工程基础",
      "40": "专业核心",
      "41": "专业方向组",
      "42": "专业任选",
      "43": "专业基础",
      "44": "专业必修",
      "45": "专业选修",
      "50": "基础实践",
      "51": "专业实践",
      "52": "综合实践",
      "53": "其他实践",
      "54": "短学期实践",
      "70": "辅修理论",
      "71": "辅修实践",
      "90": "必修",
      "98": "重修",
      "99": "公共选修"
    });
    const KCLX_LABEL_MAP = Object.freeze({
      ...KCXZ_LABEL_MAP,
      "1": "理论",
      "2": "实验",
      "3": "上机",
      "4": "实践",
      "5": "环节",
      "6": "公选",
      "7": "自修",
      "9": "分级",
      "10": "其他",
      "15": "辅修"
    });
    const EMPTY_LIST_FILTERS = Object.freeze({
      kcmc: "",
      kcxz: "",
      kcgs: "",
      jxms: "",
      teacher: "",
      kkxq: "",
      kclb: "",
      kclx: ""
    });
    const loadingOverview = ref(false);
    const loadingList = ref(false);
    const loadingInfo = ref(false);
    const refreshing = ref(false);
    const overviewError = ref("");
    const infoError = ref("");
    const offline = ref(false);
    const syncTime = ref("");
    const overview = ref(null);
    const tabs = ref([]);
    const activeTabId = ref("");
    const listConditions = ref({});
    const pcencMap = ref({});
    const courses = ref([]);
    const listMessage = ref("");
    const occupiedSlots = ref([]);
    const availableRatio = ref("100");
    const count = ref(0);
    const remainingSeconds = ref(null);
    const countdownText = ref("");
    const isPreview = ref(false);
    const showAdvanced = ref(false);
    const infoShowAdvanced = ref(false);
    const centerMode = ref(ENTRY_MODE_MENU);
    const infoSourceMessage = ref("");
    const infoLoaded = ref(false);
    const infoCourses = ref([]);
    const infoShowOtherModes = ref(false);
    const filters = ref({
      kcmc: "",
      kcxz: "",
      kcgs: "",
      jxms: "",
      teacher: "",
      kkxq: "",
      kclb: "",
      kclx: ""
    });
    const infoFilters = ref({
      term: "",
      kcmc: "",
      teacher: "",
      kcxz: "",
      kclx: "",
      xkfs: "选课"
    });
    const infoOptions = ref({
      term: [{ value: "", label: "全部学期" }],
      kcxz: [{ value: "", label: "全部性质" }],
      kclx: [{ value: "", label: "全部类型" }],
      xkfs: [{ value: "", label: "全部方式" }]
    });
    const showDetail = ref(false);
    const selectedCourse = ref(null);
    const detailLoading = ref(false);
    const detailIntro = ref("");
    const detailTeachers = ref([]);
    const showChildClassDialog = ref(false);
    const childClasses = ref([]);
    const pendingSelectCourse = ref(null);
    const selectedChildClassId = ref("");
    const selectingCourseId = ref("");
    const showActionConfirmDialog = ref(false);
    const confirmActionType = ref("");
    const confirmTargetCourse = ref(null);
    const confirmTargetChildClassId = ref("");
    const withdrawingCourseId = ref("");
    const toastState = ref({
      visible: false,
      message: "",
      type: "info"
    });
    let toastTimer = null;
    let countdownTimer = null;
    let endTimeRefreshTimer = null;
    const safeText = (value) => String(value ?? "").trim();
    const resolveCourseTypeLabel = (value, fallback = "") => {
      const code = safeText(value);
      const fallbackText = safeText(fallback);
      if (code && KCLX_LABEL_MAP[code]) return KCLX_LABEL_MAP[code];
      if (fallbackText && KCLX_LABEL_MAP[fallbackText]) return KCLX_LABEL_MAP[fallbackText];
      return fallbackText || code;
    };
    const isEnabledValue = (value) => {
      const text = safeText(value).toLowerCase();
      return text === "1" || text === "true" || text === "yes" || text === "y";
    };
    const isPickedValue = (value) => {
      const text = safeText(value);
      if (!text) return false;
      if (isEnabledValue(text)) return true;
      if (text.includes("已选") || text.includes("已修") || text.includes("已报名")) return true;
      const num = Number(text);
      return Number.isFinite(num) && num > 0;
    };
    const resolveTabFrom = (tab) => {
      const kklx = safeText(tab?.kklx);
      return KKLX_FROM_MAP[kklx] || DEFAULT_FROM;
    };
    const stripHtml = (value) => {
      const raw = safeText(value);
      if (!raw) return "";
      const doc = new DOMParser().parseFromString(raw, "text/html");
      return safeText(doc.body?.textContent || raw);
    };
    const looksLikeEncodedSchedule = (value) => {
      const text = safeText(value);
      if (!text) return false;
      return /^\d+(,\d+)+$/.test(text) || /^\d{4,}$/.test(text);
    };
    const normalizeScheduleText = (item) => {
      const sksjdd = stripHtml(item.sksjdd);
      if (sksjdd && !looksLikeEncodedSchedule(sksjdd)) return sksjdd;
      const sksjddstr = stripHtml(item.sksjddstr);
      if (sksjddstr && !looksLikeEncodedSchedule(sksjddstr)) return sksjddstr;
      return "";
    };
    const compactTeachingClassName = (value) => {
      let text = stripHtml(value);
      if (!text) return "";
      text = text.replace(/([\-—_]?)(?:理论|实践|实验|混合|线上|线下)?\s*\d{3,}\s*$/u, "$1").replace(/[\-—_]\s*$/u, "").trim();
      return text || stripHtml(value);
    };
    const hasConflictHint = (value) => {
      const text = stripHtml(value);
      if (!text) return false;
      return /(冲突课程|冲突上课时间地点|conflictingCourse|冲突状态|冲突课程编号|冲突课程名称)/i.test(text);
    };
    const looksLikeCodeLine = (line) => {
      const text = safeText(line);
      if (!text) return false;
      const lower = text.toLowerCase();
      if (/^(\/\/|\/\*|\*\/)/.test(lower)) return true;
      if (/^(var|let|const|function|if|else|for|while|try|catch|return)\b/.test(lower)) return true;
      if (/^(\$\(.*\)|document\.|window\.)/.test(lower)) return true;
      if (/[{};$<>]/.test(text) && /(ajax|validform|jquery|document|window|ready|tiptype|cssctl|openDialog|submit|callback)/i.test(text)) return true;
      if (/^\s*[\w$]+\s*=/.test(text) && /[;{}()]/.test(text)) return true;
      return false;
    };
    const normalizeDetailIntro = (value, options = {}) => {
      const allowConflictText = options.allowConflictText === true;
      const raw = safeText(value);
      if (!raw) return "";
      const doc = new DOMParser().parseFromString(raw, "text/html");
      doc.querySelectorAll("script,style,noscript,iframe,svg,canvas").forEach((node) => node.remove());
      const text = safeText((doc.body?.innerText || doc.body?.textContent || raw).replace(/\u00a0/g, " "));
      if (!text) return "";
      const lines = text.split(/\r?\n+/).map((line) => safeText(line.replace(/^[\s*•-]+/, ""))).filter(Boolean);
      const filtered = lines.filter((line) => {
        if (looksLikeCodeLine(line)) return false;
        if (!allowConflictText && /(冲突课程|冲突上课时间地点|冲突状态|conflictingCourse|detailsForm)/i.test(line)) {
          return false;
        }
        return true;
      });
      const source = filtered.length >= 2 ? filtered : lines;
      const merged = [];
      source.forEach((line) => {
        if (!line) return;
        if (merged[merged.length - 1] === line) return;
        merged.push(line);
      });
      return merged.join("\n");
    };
    const cleanMessage = (value) => {
      const text = safeText(value);
      const normalized = text.toLowerCase();
      if (!text) return "";
      if (normalized === "success" || normalized === "ok" || text === "获取成功") return "";
      return text;
    };
    const resolveErrorMessage = (error, fallback = "请求失败") => {
      const responseData = error?.response?.data;
      const messageCandidates = [
        responseData?.error,
        responseData?.message,
        responseData?.msg,
        responseData?.data?.msg,
        responseData?.data?.message,
        error?.message
      ];
      const matched = messageCandidates.map((item) => safeText(item)).find(Boolean);
      return matched || fallback;
    };
    const normalizeOptionList = (source, placeholder = "全部") => {
      const options = [{ value: "", label: placeholder }];
      const pushOption = (value, label) => {
        const nextValue = safeText(value);
        const nextLabel = safeText(label || value);
        if (!nextLabel) return;
        if (options.some((item) => item.value === nextValue && item.label === nextLabel)) return;
        options.push({ value: nextValue, label: nextLabel });
      };
      if (Array.isArray(source)) {
        source.forEach((item) => {
          if (item && typeof item === "object") {
            pushOption(
              item.value ?? item.dm ?? item.code ?? item.id ?? item.key ?? item.mc,
              item.label ?? item.mc ?? item.name ?? item.text ?? item.value ?? item.dm
            );
          } else {
            pushOption(item, item);
          }
        });
      } else if (source && typeof source === "object") {
        Object.entries(source).forEach(([key, value]) => {
          if (value && typeof value === "object") {
            pushOption(value.value ?? value.dm ?? value.id ?? key, value.label ?? value.mc ?? value.name ?? key);
          } else {
            pushOption(key, value);
          }
        });
      }
      return options;
    };
    const findOptionLabel = (options, value, fallback = "") => {
      const matched = (options || []).find((item) => safeText(item.value) === safeText(value));
      return matched?.label || safeText(fallback || value);
    };
    const formatRatioText = (value) => {
      const num = Number.parseFloat(safeText(value));
      if (!Number.isFinite(num)) return "--";
      return `${Math.max(0, Math.min(100, num)).toFixed(num % 1 === 0 ? 0 : 1)}%`;
    };
    const parseCapacityInfo = (raw, ratioText) => {
      const text = safeText(raw);
      const ratio = Number.parseFloat(safeText(ratioText));
      const normalizedRatio = Number.isFinite(ratio) ? ratio : null;
      let selected = null;
      let total = null;
      const slashMatch = text.match(/(\d+)\s*[\/／]\s*(\d+)/);
      if (slashMatch) {
        selected = Number.parseInt(slashMatch[1], 10);
        total = Number.parseInt(slashMatch[2], 10);
      } else {
        const numberMatch = text.match(/\d+/g);
        if (numberMatch?.length >= 2) {
          selected = Number.parseInt(numberMatch[0], 10);
          total = Number.parseInt(numberMatch[1], 10);
        } else if (numberMatch?.length === 1 && normalizedRatio === 0) {
          total = Number.parseInt(numberMatch[0], 10);
          selected = total;
        }
      }
      const isFullByText = /已满|满额/.test(text);
      const isFullByRatio = normalizedRatio !== null && normalizedRatio <= 0;
      const isFullByCount = Number.isFinite(selected) && Number.isFinite(total) && total > 0 && selected >= total;
      const display = text || (normalizedRatio !== null ? `容量开放率 ${formatRatioText(ratioText)}` : "--");
      return {
        display,
        selected,
        total,
        ratio: normalizedRatio,
        isFull: isFullByText || isFullByRatio || isFullByCount
      };
    };
    const normalizeTeacherContent = (content) => {
      if (Array.isArray(content)) {
        return content.map((item) => {
          if (item && typeof item === "object") {
            return stripHtml(item.jsxm || item.teacher || item.name || item.jsmc || item.content || JSON.stringify(item));
          }
          return stripHtml(item);
        }).filter(Boolean);
      }
      if (content && typeof content === "object") {
        if (Array.isArray(content.list)) return normalizeTeacherContent(content.list);
        if (Array.isArray(content.data)) return normalizeTeacherContent(content.data);
        return Object.values(content).map((item) => {
          if (item && typeof item === "object") {
            return stripHtml(item.jsxm || item.teacher || item.name || item.jsmc || item.content || JSON.stringify(item));
          }
          return stripHtml(item);
        }).filter(Boolean);
      }
      const text = stripHtml(content);
      if (!text) return [];
      return text.split(/[\n,，、]/).map((item) => safeText(item)).filter(Boolean);
    };
    const currentTab = computed(() => tabs.value.find((item) => safeText(item.xkgzid) === safeText(activeTabId.value)) || null);
    const currentPcid = computed(() => safeText(currentTab.value?.xkgzid));
    const currentPcenc = computed(() => {
      const pcid = currentPcid.value;
      if (!pcid) return "";
      const map = pcencMap.value || {};
      return safeText(map[pcid] || map[String(pcid)] || currentTab.value?.pcenc);
    });
    const summaryStudent = computed(() => overview.value?.student || {});
    const optionMaps = computed(() => {
      const overviewConditions = overview.value?.conditions || {};
      const condition = listConditions.value || {};
      return {
        kcxz: normalizeOptionList(condition.kcxzList || overviewConditions.kcxzList, "全部性质"),
        kcgs: normalizeOptionList(condition.kcgsList || overviewConditions.kcgsList, "全部归属"),
        jxms: normalizeOptionList(condition.jxmsList || overviewConditions.jxmsList, "全部模式"),
        kkxq: normalizeOptionList(condition.kkxqList || overviewConditions.kkxqList, "全部校区"),
        kclb: normalizeOptionList(condition.kclbList || overviewConditions.kclbList, "全部类别"),
        kclx: normalizeOptionList(condition.kclxList || overviewConditions.kclxList, "全部类型")
      };
    });
    const detailFields = computed(() => {
      const course = selectedCourse.value;
      if (!course) return [];
      const rows = [
        { label: "课程名称", value: course.kcmc },
        { label: "教学班名称", value: course.jxbmc },
        { label: "学分", value: course.xf },
        { label: "课程性质", value: findOptionLabel(optionMaps.value.kcxz, course.kcxz, KCXZ_LABEL_MAP[course.kcxz] || course.kcxz) },
        { label: "课程类别", value: course.kclbname || findOptionLabel(optionMaps.value.kclb, course.kclb, course.kclb) },
        { label: "课程类型", value: findOptionLabel(optionMaps.value.kclx, course.kclx, resolveCourseTypeLabel(course.kclx, course.kclx)) },
        { label: "教学模式", value: findOptionLabel(optionMaps.value.jxms, course.jxms, course.jxms) },
        { label: "授课教师", value: course.teacher },
        { label: "上课时间地点", value: course.isOnline ? "未提供线下上课时间与地点，按网课展示" : course.scheduleText || course.sksjdd || "未公布时间地点" },
        { label: "上课校区", value: course.kkxqmc || findOptionLabel(optionMaps.value.kkxq, course.kkxq, course.kkxqmc || course.kkxq) },
        { label: "教学班组成", value: course.jxbzc },
        { label: "容量情况", value: course.capacity.display },
        { label: "冲突状态", value: course.isConflict ? "与当前课表冲突" : "无冲突" },
        { label: "标签", value: course.label },
        { label: "考试形式", value: course.ksxs }
      ];
      return rows.filter((item) => safeText(item.value));
    });
    const detailTeacherText = computed(() => detailTeachers.value.join("、"));
    const formatCountdown = (seconds) => {
      if (!Number.isFinite(seconds)) return "--";
      if (seconds <= 0) return "已结束";
      const day = Math.floor(seconds / 86400);
      const hour = Math.floor(seconds % 86400 / 3600);
      const minute = Math.floor(seconds % 3600 / 60);
      const second = Math.floor(seconds % 60);
      const chunks = [];
      if (day > 0) chunks.push(`${day}天`);
      if (hour > 0) chunks.push(`${hour}小时`);
      if (minute > 0) chunks.push(`${minute}分钟`);
      if (second > 0 || chunks.length === 0) chunks.push(`${second}秒`);
      return chunks.join("");
    };
    const reconcileFilterSelection = () => {
      Object.entries(optionMaps.value).forEach(([key, options]) => {
        const current = safeText(filters.value[key]);
        if (!current) return;
        const valid = options.some((item) => safeText(item.value) === current);
        if (!valid) {
          filters.value[key] = "";
        }
      });
    };
    const resolveCourseStatus = ({ picked, selectable, full, conflict }) => {
      if (picked) return { statusLabel: "已选", statusClass: "picked" };
      if (!selectable) return { statusLabel: "不可选", statusClass: "disabled" };
      if (full) return { statusLabel: "已满", statusClass: "full" };
      if (conflict) return { statusLabel: "冲突", statusClass: "conflict" };
      return { statusLabel: "可选", statusClass: "ready" };
    };
    const normalizeCourse = (item) => {
      const capacity = parseCapacityInfo(item.yxrl, availableRatio.value);
      const picked = isPickedValue(item.status) || safeText(item.zt) === "已选" || safeText(item.statusLabel).includes("已选");
      const conflict = !picked && (safeText(item.sfct) === "1" || hasConflictHint(item.label));
      const selectable = isEnabledValue(item.sfkxk);
      const full = !picked && capacity.isFull;
      const { statusLabel, statusClass } = resolveCourseStatus({ picked, selectable, full, conflict });
      return {
        ...item,
        id: safeText(item.id),
        kcmc: stripHtml(item.kcmc),
        jxbmc: stripHtml(item.jxbmc),
        jxbmcDisplay: compactTeachingClassName(item.jxbmc),
        teacher: stripHtml(item.teacher),
        scheduleText: normalizeScheduleText(item),
        capacity,
        isPicked: picked,
        isConflict: conflict,
        isSelectable: selectable,
        isFull: full,
        isOnline: item.is_online === true || safeText(item.is_online) === "true",
        hasChildClasses: item.has_child_classes === true || safeText(item.has_child_classes) === "true",
        statusLabel,
        statusClass
      };
    };
    const getCoursePriority = (course) => {
      if (course.isPicked) return 0;
      if (course.isSelectable && !course.isFull) return 1;
      if (course.isSelectable && course.isFull) return 2;
      return 3;
    };
    const sortCoursesForDisplay = (list) => {
      return [...list].sort((a, b) => {
        const rankDiff = getCoursePriority(a) - getCoursePriority(b);
        if (rankDiff !== 0) return rankDiff;
        if (a.isConflict !== b.isConflict) return a.isConflict ? 1 : -1;
        return (a.kcmc || "").localeCompare(b.kcmc || "", "zh-CN");
      });
    };
    const applyCoursePatch = (courseId, patcher) => {
      const targetId = safeText(courseId);
      if (!targetId || typeof patcher !== "function") return;
      let nextSelected = null;
      courses.value = sortCoursesForDisplay(
        courses.value.map((course) => {
          if (safeText(course.id) !== targetId) return course;
          const nextCourse = patcher(course);
          if (selectedCourse.value?.id && safeText(selectedCourse.value.id) === targetId) {
            nextSelected = nextCourse;
          }
          return nextCourse;
        })
      );
      infoCourses.value = sortInfoCourses(
        infoCourses.value.map((course) => {
          if (safeText(course.id) !== targetId) return course;
          const nextCourse = patcher(course);
          if (selectedCourse.value?.id && safeText(selectedCourse.value.id) === targetId) {
            nextSelected = nextCourse;
          }
          return nextCourse;
        })
      );
      if (nextSelected) selectedCourse.value = nextSelected;
    };
    const normalizeDetailSourceText = (content) => {
      if (typeof content === "string") return content;
      if (content == null) return "";
      try {
        return JSON.stringify(content);
      } catch {
        return String(content);
      }
    };
    const showToast = (message, type = "info") => {
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      toastState.value = { visible: true, message, type };
      toastTimer = setTimeout(() => {
        toastState.value.visible = false;
      }, 2800);
    };
    const stopCountdownTick = () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };
    const startCountdownTick = () => {
      stopCountdownTick();
      if (!Number.isFinite(remainingSeconds.value) || remainingSeconds.value <= 0) return;
      countdownTimer = setInterval(() => {
        if (!Number.isFinite(remainingSeconds.value)) return;
        if (remainingSeconds.value <= 0) {
          remainingSeconds.value = 0;
          countdownText.value = "已结束";
          stopCountdownTick();
          return;
        }
        remainingSeconds.value -= 1;
        countdownText.value = formatCountdown(remainingSeconds.value);
      }, 1e3);
    };
    const stopEndTimeRefresh = () => {
      if (endTimeRefreshTimer) {
        clearInterval(endTimeRefreshTimer);
        endTimeRefreshTimer = null;
      }
    };
    const startEndTimeRefresh = () => {
      stopEndTimeRefresh();
      if (!currentPcid.value) return;
      endTimeRefreshTimer = setInterval(() => {
        void fetchEndTime();
      }, 3e4);
    };
    const unwrapApiResult = (response, fallback = "请求失败") => {
      let payload = response?.data;
      let meta = {};
      for (let i = 0; i < 3; i += 1) {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) break;
        if (payload.success === false) {
          throw new Error(payload.error || payload.message || fallback);
        }
        if ("success" in payload || "sync_time" in payload || "offline" in payload || "error" in payload || "message" in payload) {
          meta = { ...meta, ...payload };
        }
        if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
          payload = payload.data;
          continue;
        }
        break;
      }
      return {
        data: payload || {},
        meta
      };
    };
    const buildListPayload = ({ pcid, pcenc, filtersSource = EMPTY_LIST_FILTERS } = {}) => {
      const source = filtersSource || EMPTY_LIST_FILTERS;
      return {
        pcid: safeText(pcid),
        pcenc: safeText(pcenc),
        from: safeText(source.from || DEFAULT_FROM) || DEFAULT_FROM,
        kcmc: safeText(source.kcmc),
        kcxz: safeText(source.kcxz),
        kcgs: safeText(source.kcgs),
        jxms: safeText(source.jxms),
        teacher: safeText(source.teacher),
        kkxq: safeText(source.kkxq),
        kclb: safeText(source.kclb),
        kclx: safeText(source.kclx)
      };
    };
    const getRequestPayload = () => buildListPayload({
      pcid: currentPcid.value,
      pcenc: currentPcenc.value,
      filtersSource: {
        ...filters.value,
        from: resolveTabFrom(currentTab.value)
      }
    });
    const fetchOverview = async () => {
      loadingOverview.value = true;
      overviewError.value = "";
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/overview`, {});
        console.log("[选课调试] overview 原始响应:", JSON.stringify(res?.data).slice(0, 500));
        const { data, meta } = unwrapApiResult(res, "获取选课总览失败");
        console.log("[选课调试] overview unwrap 后 data keys:", Object.keys(data || {}));
        console.log("[选课调试] tabs 数量:", Array.isArray(data.tabs) ? data.tabs.length : "N/A", ", pcencs keys:", Object.keys(data.pcencs || {}));
        console.log("[选课调试] has_valid_pcencs:", data.has_valid_pcencs, ", message:", data.message);
        if (Array.isArray(data.tabs)) {
          data.tabs.forEach((t, i) => console.log(`[选课调试] tab[${i}]: xkgzid=${t.xkgzid}, xkgzMc=${t.xkgzMc}, kklx=${t.kklx}`));
        }
        overview.value = data;
        tabs.value = Array.isArray(data.tabs) ? data.tabs : [];
        pcencMap.value = data.pcencs || {};
        offline.value = meta.offline === true || data.offline === true;
        syncTime.value = safeText(meta.sync_time || data.sync_time);
        if (tabs.value.length > 0) {
          activeTabId.value = safeText(tabs.value[0].xkgzid);
        } else {
          activeTabId.value = "";
          courses.value = [];
          listMessage.value = cleanMessage(data.message) || "当前暂无可选课程";
          stopCountdownTick();
          stopEndTimeRefresh();
        }
      } catch (err) {
        overviewError.value = resolveErrorMessage(err, "获取选课总览失败");
        tabs.value = [];
        courses.value = [];
        stopCountdownTick();
        stopEndTimeRefresh();
      } finally {
        loadingOverview.value = false;
      }
    };
    const fetchEndTime = async () => {
      if (!currentPcid.value || !safeText(currentTab.value?.kklx)) {
        remainingSeconds.value = null;
        countdownText.value = "--";
        isPreview.value = false;
        stopCountdownTick();
        stopEndTimeRefresh();
        return;
      }
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/end_time`, {
          pcid: currentPcid.value,
          kklx: safeText(currentTab.value?.kklx)
        });
        const { data } = unwrapApiResult(res, "获取批次倒计时失败");
        remainingSeconds.value = Number.isFinite(Number(data.remaining_seconds)) ? Number(data.remaining_seconds) : null;
        if (Number.isFinite(remainingSeconds.value)) {
          countdownText.value = formatCountdown(remainingSeconds.value);
          startCountdownTick();
        } else {
          countdownText.value = safeText(data.countdown_text || "--");
          stopCountdownTick();
        }
        isPreview.value = data.is_preview === true;
      } catch {
        remainingSeconds.value = null;
        countdownText.value = "--";
        isPreview.value = false;
        stopCountdownTick();
      }
    };
    const fetchList = async () => {
      console.log("[选课调试] fetchList: pcid=", currentPcid.value, ", pcenc=", currentPcenc.value ? currentPcenc.value.slice(0, 20) + "..." : "(空)");
      if (!currentPcid.value || !currentPcenc.value) {
        courses.value = [];
        listMessage.value = "当前批次缺少有效凭证";
        console.warn("[选课调试] fetchList 中止：pcid 或 pcenc 为空");
        return;
      }
      loadingList.value = true;
      listMessage.value = "";
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/list`, getRequestPayload());
        const { data, meta } = unwrapApiResult(res, "获取选课列表失败");
        listConditions.value = data.condition || {};
        availableRatio.value = safeText(data.available_ratio || "100");
        occupiedSlots.value = Array.isArray(data.occupied_slots) ? data.occupied_slots : [];
        count.value = Number(data.count || 0);
        courses.value = Array.isArray(data.courses) ? sortCoursesForDisplay(data.courses.map(normalizeCourse)) : [];
        listMessage.value = cleanMessage(data.message);
        offline.value = meta.offline === true || data.offline === true || offline.value;
        syncTime.value = safeText(meta.sync_time || data.sync_time || syncTime.value);
        reconcileFilterSelection();
      } catch (err) {
        courses.value = [];
        listMessage.value = resolveErrorMessage(err, "获取选课列表失败");
      } finally {
        loadingList.value = false;
      }
    };
    const loadTabBundle = async () => {
      await Promise.all([fetchList(), fetchEndTime()]);
      startEndTimeRefresh();
    };
    const handleTabChange = async (tabId) => {
      if (!safeText(tabId) || safeText(tabId) === safeText(activeTabId.value)) return;
      activeTabId.value = safeText(tabId);
      detailIntro.value = "";
      detailTeachers.value = [];
      selectedCourse.value = null;
      showDetail.value = false;
      reconcileFilterSelection();
      await loadTabBundle();
    };
    const resetFilters = async () => {
      filters.value = {
        kcmc: "",
        kcxz: "",
        kcgs: "",
        jxms: "",
        teacher: "",
        kkxq: "",
        kclb: "",
        kclx: ""
      };
      await fetchList();
    };
    const queryCourses = async () => {
      await fetchList();
    };
    const refreshCourseData = async () => {
      if (refreshing.value || loadingOverview.value || loadingList.value) return;
      refreshing.value = true;
      try {
        if (!tabs.value.length) {
          await fetchOverview();
        }
        if (activeTabId.value) {
          await loadTabBundle();
          showToast("已刷新当前批次课程", "success");
        } else {
          showToast("当前暂无可刷新的选课批次", "info");
        }
      } catch (err) {
        showToast(resolveErrorMessage(err, "刷新选课数据失败"), "error");
      } finally {
        refreshing.value = false;
      }
    };
    const mapToOptions = (sourceMap, placeholder = "全部") => {
      const options = [{ value: "", label: placeholder }];
      Array.from(sourceMap.entries()).map(([value, label]) => ({
        value: safeText(value),
        label: safeText(label || value)
      })).filter((item) => item.label).sort((a, b) => a.label.localeCompare(b.label, "zh-CN")).forEach((item) => {
        if (options.some((existing) => existing.value === item.value && existing.label === item.label)) return;
        options.push(item);
      });
      return options;
    };
    const resolveInfoSelectionMode = (item) => {
      return safeText(
        item?.xkfsmc || item?.xkfs || item?.selection_mode || item?.select_mode || item?.mode || "选课"
      ) || "选课";
    };
    const deriveTabTermLabel = (tab) => {
      const tabName = safeText(tab?.xkgzMc);
      if (tabName) return tabName;
      const studentSemester = safeText(summaryStudent.value?.semester);
      return studentSemester || "当前学期";
    };
    const normalizeInfoCourse = (item, context = {}) => {
      const fallbackId = `${safeText(context.tabId || "tab")}-${safeText(context.index || "0")}-${safeText(item?.kcmc || item?.course_name || "course")}`;
      const merged = {
        ...item,
        id: safeText(item?.id || item?.jxbid || item?.jxb_id || item?.source_id || fallbackId),
        jxbmc: item?.jxbmc ?? item?.jxbmcDisplay ?? item?.jxb_name ?? item?.bjmc ?? "",
        kcmc: item?.kcmc ?? item?.course_name ?? item?.kcname ?? "",
        xf: item?.xf ?? item?.credit ?? "",
        teacher: item?.teacher ?? item?.jsxm ?? item?.lsxm ?? item?.skjs ?? "",
        sksjdd: item?.sksjdd ?? item?.skdd ?? item?.time_place ?? "",
        sksjddstr: item?.sksjddstr ?? item?.sksj ?? item?.time_text ?? "",
        yxrl: item?.yxrl ?? item?.capacity ?? item?.capacity_text ?? "",
        status: item?.status ?? (item?.picked === true || item?.isPicked === true ? "1" : ""),
        sfkxk: item?.sfkxk ?? (item?.isSelectable === true ? "1" : "0"),
        sfct: item?.sfct ?? (item?.isConflict === true ? "1" : "0"),
        kkxqmc: item?.kkxqmc ?? item?.campus ?? "",
        kcxz: item?.kcxz ?? item?.course_nature ?? "",
        kclx: item?.kclx ?? item?.course_type ?? "",
        kclbname: item?.kclbname ?? item?.kclb ?? "",
        kcjj: item?.kcjj ?? item?.course_intro ?? "",
        jxbzc: item?.jxbzc ?? item?.class_group ?? "",
        label: item?.label ?? item?.remark ?? "",
        jxms: item?.jxms ?? item?.teaching_mode ?? "",
        ksxs: item?.ksxs ?? item?.exam_mode ?? ""
      };
      const normalized = normalizeCourse(merged);
      const picked = normalized.isPicked || isPickedValue(item?.status) || safeText(item?.zt) === "已选" || safeText(item?.statusLabel).includes("已选");
      const status = resolveCourseStatus({
        picked,
        selectable: normalized.isSelectable,
        full: normalized.isFull,
        conflict: normalized.isConflict
      });
      return {
        ...normalized,
        ...status,
        isPicked: picked,
        termLabel: safeText(item?.xnxq || item?.semester || context.termLabel || summaryStudent.value?.semester || "当前学期"),
        xkfsText: resolveInfoSelectionMode(item),
        sourceTabId: safeText(context.tabId || item?.sourceTabId),
        sourceTabName: safeText(context.tabName || item?.sourceTabName)
      };
    };
    const dedupeInfoCourses = (list) => {
      const map = /* @__PURE__ */ new Map();
      (list || []).forEach((item) => {
        const key = [safeText(item.id), safeText(item.termLabel), safeText(item.sourceTabId), safeText(item.xkfsText)].join("::");
        if (!map.has(key)) {
          map.set(key, item);
        }
      });
      return Array.from(map.values());
    };
    const sortInfoCourses = (list) => {
      return [...list].sort((a, b) => {
        const termDiff = safeText(b.termLabel).localeCompare(safeText(a.termLabel), "zh-CN");
        if (termDiff !== 0) return termDiff;
        return safeText(a.kcmc).localeCompare(safeText(b.kcmc), "zh-CN");
      });
    };
    const pickArrayPayload = (data) => {
      if (Array.isArray(data)) return data;
      if (!data || typeof data !== "object") return [];
      const candidates = [data.courses, data.list, data.items, data.rows, data.records, data.data];
      const found = candidates.find((item) => Array.isArray(item));
      return Array.isArray(found) ? found : [];
    };
    const mergeConditionOptions = (condition, kcxzMap, kclxMap) => {
      normalizeOptionList(condition?.kcxzList, "全部性质").forEach((item) => {
        const value = safeText(item.value || item.label);
        const label = safeText(item.label || item.value);
        if (!value || !label) return;
        kcxzMap.set(value, label);
      });
      normalizeOptionList(condition?.kclxList, "全部类型").forEach((item) => {
        const value = safeText(item.value || item.label);
        const label = resolveCourseTypeLabel(value, item.label || item.value);
        if (!value || !label) return;
        kclxMap.set(value, label);
      });
    };
    const applyInfoOptionsAndDefaults = ({ termMap, xkfsSet, kcxzMap, kclxMap }) => {
      infoOptions.value = {
        term: mapToOptions(termMap, "全部学期"),
        xkfs: mapToOptions(new Map(Array.from(xkfsSet).map((value) => [value, value])), "全部方式"),
        kcxz: mapToOptions(kcxzMap, "全部性质"),
        kclx: mapToOptions(kclxMap, "全部类型")
      };
      const semester = safeText(summaryStudent.value?.semester);
      const termOptions = infoOptions.value.term;
      const selectedTerm = safeText(infoFilters.value.term);
      const currentTermValid = selectedTerm && termOptions.some((item) => safeText(item.value) === selectedTerm);
      if (!currentTermValid) {
        const matchedTerm = termOptions.find((item) => {
          if (!safeText(item.value)) return false;
          if (!semester) return false;
          return safeText(item.label).includes(semester) || safeText(item.value).includes(semester);
        });
        const firstNonEmpty = termOptions.find((item) => safeText(item.value));
        infoFilters.value.term = matchedTerm?.value || firstNonEmpty?.value || "";
      }
      if (!infoShowOtherModes.value) {
        infoFilters.value.xkfs = "选课";
      } else {
        const xkfsValid = infoOptions.value.xkfs.some((item) => safeText(item.value) === safeText(infoFilters.value.xkfs));
        if (!xkfsValid) infoFilters.value.xkfs = "";
      }
      ["kcxz", "kclx"].forEach((key) => {
        const valid = infoOptions.value[key].some((item) => safeText(item.value) === safeText(infoFilters.value[key]));
        if (!valid) infoFilters.value[key] = "";
      });
    };
    const fetchSelectedCoursesByEndpoint = async (querySemester) => {
      const semester = safeText(querySemester) || safeText(infoFilters.value.term) || safeText(summaryStudent.value?.semester);
      const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/selected_courses`, {
        semester
      });
      const { data } = unwrapApiResult(res, "获取已选课程失败");
      const list = pickArrayPayload(data);
      if (!list.length) {
        throw new Error("已选课程接口暂无数据");
      }
      const termMap = /* @__PURE__ */ new Map();
      const serverSemesters = Array.isArray(data?.semesters) ? data.semesters : [];
      serverSemesters.forEach((sem) => {
        const s = safeText(sem);
        if (s) termMap.set(s, s);
      });
      const xkfsSet = /* @__PURE__ */ new Set(["选课"]);
      const kcxzMap = /* @__PURE__ */ new Map();
      const kclxMap = /* @__PURE__ */ new Map();
      const normalized = list.map((item, index) => {
        const course = normalizeInfoCourse(item, {
          tabId: safeText(item?.sourceTabId || item?.pcid || "selected_api"),
          tabName: safeText(item?.sourceTabName || item?.source || "已选课程"),
          termLabel: safeText(item?.xnxq || item?.semester || data?.current_semester || summaryStudent.value?.semester || "当前学期"),
          index
        });
        termMap.set(course.termLabel, course.termLabel);
        xkfsSet.add(course.xkfsText || "选课");
        if (safeText(course.kcxz)) {
          const code = safeText(course.kcxz);
          kcxzMap.set(code, KCXZ_LABEL_MAP[code] || safeText(course.kclb) || code);
        }
        if (safeText(course.kclx)) {
          const code = safeText(course.kclx);
          kclxMap.set(code, resolveCourseTypeLabel(code, code));
        }
        return course;
      });
      mergeConditionOptions(data?.condition || data?.conditions || {}, kcxzMap, kclxMap);
      return {
        courses: normalized,
        termMap,
        xkfsSet,
        kcxzMap,
        kclxMap,
        currentSemester: safeText(data?.current_semester),
        source: "endpoint"
      };
    };
    const fetchSelectedCoursesByTabs = async () => {
      if (!tabs.value.length) {
        await fetchOverview();
      }
      console.log("[选课调试] fetchSelectedCoursesByTabs: tabs 数量=", tabs.value.length, ", pcencMap keys=", Object.keys(pcencMap.value || {}));
      const termMap = /* @__PURE__ */ new Map();
      const xkfsSet = /* @__PURE__ */ new Set(["选课"]);
      const kcxzMap = /* @__PURE__ */ new Map();
      const kclxMap = /* @__PURE__ */ new Map();
      const merged = [];
      for (const tab of tabs.value) {
        const tabId = safeText(tab?.xkgzid);
        if (!tabId) {
          console.warn("[选课调试] 跳过无 xkgzid 的 tab");
          continue;
        }
        const termLabel = deriveTabTermLabel(tab);
        const tabFrom = resolveTabFrom(tab);
        termMap.set(termLabel, termLabel);
        const tabPcenc = safeText(pcencMap.value?.[tabId] || pcencMap.value?.[String(tabId)] || tab?.pcenc);
        console.log(`[选课调试] tab ${tabId}: pcenc=${tabPcenc ? tabPcenc.slice(0, 20) + "..." : "(空)"}, from=${tabFrom}`);
        if (!tabPcenc) {
          console.warn(`[选课调试] tab ${tabId} 无 pcenc，跳过`);
          continue;
        }
        try {
          const res = await axiosInstance.post(
            `${API_BASE}/v2/course_selection/list`,
            buildListPayload({
              pcid: tabId,
              pcenc: tabPcenc,
              filtersSource: {
                ...EMPTY_LIST_FILTERS,
                from: tabFrom
              }
            })
          );
          const { data } = unwrapApiResult(res, "获取已选课程失败");
          mergeConditionOptions(data?.condition || {}, kcxzMap, kclxMap);
          const rawCourses = Array.isArray(data?.courses) ? data.courses : [];
          console.log(`[选课调试] tab ${tabId}: list 返回 ${rawCourses.length} 门课程`);
          if (rawCourses.length > 0) {
            console.log(`[选课调试] tab ${tabId}: 第一门课程 status=${rawCourses[0].status}, kcmc=${rawCourses[0].kcmc}`);
          }
          let pickedCount = 0;
          rawCourses.forEach((item, index) => {
            const normalized = normalizeInfoCourse(item, {
              tabId,
              tabName: safeText(tab?.xkgzMc || "未命名批次"),
              termLabel,
              index
            });
            if (!normalized.isPicked) return;
            pickedCount += 1;
            merged.push(normalized);
            xkfsSet.add(normalized.xkfsText || "选课");
            if (safeText(normalized.kcxz)) {
              kcxzMap.set(safeText(normalized.kcxz), findOptionLabel(optionMaps.value.kcxz, normalized.kcxz, KCXZ_LABEL_MAP[normalized.kcxz] || normalized.kcxz));
            }
            if (safeText(normalized.kclx)) {
              const code = safeText(normalized.kclx);
              kclxMap.set(code, findOptionLabel(optionMaps.value.kclx, code, resolveCourseTypeLabel(code, code)));
            }
          });
          console.log(`[选课调试] tab ${tabId}: isPicked 数量= ${pickedCount}`);
        } catch (tabErr) {
          console.error(`[选课调试] tab ${tabId} list 请求失败:`, tabErr?.message || tabErr);
          continue;
        }
      }
      return {
        courses: merged,
        termMap,
        xkfsSet,
        kcxzMap,
        kclxMap,
        source: "tabs"
      };
    };
    const querySelectedCourses = async ({ showSuccessToast = false } = {}) => {
      if (loadingInfo.value) return;
      loadingInfo.value = true;
      infoError.value = "";
      infoSourceMessage.value = "";
      try {
        let fetched = null;
        try {
          const endpointFetched = await fetchSelectedCoursesByEndpoint();
          console.log("[选课调试] endpoint 结果: courses=", endpointFetched.courses.length);
          if (endpointFetched.courses.length) {
            fetched = endpointFetched;
            infoSourceMessage.value = "已通过已选课程接口自动查询";
          }
        } catch (epErr) {
          console.warn("[选课调试] endpoint 查询失败:", epErr?.message || epErr);
        }
        if (!fetched || !fetched.courses.length) {
          if (!tabs.value.length) {
            await fetchOverview();
          }
          const tabsFetched = await fetchSelectedCoursesByTabs();
          console.log("[选课调试] fetchSelectedCoursesByTabs 结果: courses=", tabsFetched.courses.length, ", termMap=", Array.from(tabsFetched.termMap.keys()));
          if (tabsFetched.courses.length) {
            fetched = tabsFetched;
            infoSourceMessage.value = "已从选课批次聚合已选课程结果";
          } else if (!fetched) {
            fetched = tabsFetched;
          }
        }
        const deduped = dedupeInfoCourses(fetched.courses);
        infoCourses.value = sortInfoCourses(deduped);
        applyInfoOptionsAndDefaults({
          termMap: fetched.termMap,
          xkfsSet: fetched.xkfsSet,
          kcxzMap: fetched.kcxzMap,
          kclxMap: fetched.kclxMap
        });
        infoLoaded.value = true;
        if (showSuccessToast) {
          showToast("已刷新信息查询结果", "success");
        }
      } catch (err) {
        infoCourses.value = [];
        infoError.value = resolveErrorMessage(err, "获取已选课程失败");
        if (showSuccessToast) {
          showToast(infoError.value, "error");
        }
      } finally {
        loadingInfo.value = false;
      }
    };
    const resetInfoFilters = () => {
      const defaultTerm = infoOptions.value.term.find((item) => safeText(item.value))?.value || "";
      infoFilters.value = {
        term: defaultTerm,
        kcmc: "",
        teacher: "",
        kcxz: "",
        kclx: "",
        xkfs: infoShowOtherModes.value ? "" : "选课"
      };
    };
    const handleInfoOtherModesChange = () => {
      if (infoShowOtherModes.value) {
        infoFilters.value.xkfs = "";
      } else {
        infoFilters.value.xkfs = "选课";
      }
    };
    const onInfoTermChange = async () => {
      const term = safeText(infoFilters.value.term);
      if (!term) return;
      const hasData = infoCourses.value.some((c) => safeText(c.termLabel) === term);
      if (hasData) return;
      try {
        loadingInfo.value = true;
        const endpointFetched = await fetchSelectedCoursesByEndpoint(term);
        if (endpointFetched.courses.length) {
          const merged = [...infoCourses.value, ...endpointFetched.courses];
          infoCourses.value = sortInfoCourses(dedupeInfoCourses(merged));
        }
      } catch (err) {
        console.warn("[选课调试] 切换学期查询失败:", err?.message || err);
      } finally {
        loadingInfo.value = false;
      }
    };
    const enterSelectionMode = async () => {
      centerMode.value = ENTRY_MODE_SELECTION;
      if (!tabs.value.length) {
        await fetchOverview();
      }
      if (activeTabId.value && !courses.value.length && !loadingList.value) {
        await loadTabBundle();
      }
    };
    const enterInfoMode = async () => {
      centerMode.value = ENTRY_MODE_INFO;
      if (!infoLoaded.value || !infoCourses.value.length) {
        await querySelectedCourses();
      }
    };
    const backToEntryMenu = () => {
      centerMode.value = ENTRY_MODE_MENU;
      infoShowAdvanced.value = false;
    };
    const handleBack = () => {
      if (centerMode.value === ENTRY_MODE_MENU) {
        emit("back");
        return;
      }
      backToEntryMenu();
    };
    const handleHeaderRefresh = async () => {
      if (centerMode.value === ENTRY_MODE_SELECTION) {
        await refreshCourseData();
        return;
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        await querySelectedCourses({ showSuccessToast: true });
      }
    };
    const openDetail = async (course) => {
      selectedCourse.value = course;
      const cachedIntroText = normalizeDetailSourceText(course.kcjj);
      const cachedConflictHint = hasConflictHint(cachedIntroText);
      if (cachedConflictHint && !course.isPicked && !course.isConflict) {
        applyCoursePatch(course.id, (prev) => {
          const nextConflict = true;
          const nextStatus = resolveCourseStatus({
            picked: prev.isPicked,
            selectable: prev.isSelectable,
            full: prev.isFull,
            conflict: nextConflict
          });
          return { ...prev, isConflict: nextConflict, ...nextStatus };
        });
      }
      detailIntro.value = normalizeDetailIntro(cachedIntroText, {
        allowConflictText: course.isConflict || cachedConflictHint
      });
      detailTeachers.value = course.teacher ? [course.teacher] : [];
      showDetail.value = true;
      detailLoading.value = true;
      try {
        const [introRes, teacherRes] = await Promise.allSettled([
          axiosInstance.post(`${API_BASE}/v2/course_selection/detail_intro`, { jxbid: course.id }),
          axiosInstance.post(`${API_BASE}/v2/course_selection/detail_teacher`, { jxbid: course.id })
        ]);
        if (introRes.status === "fulfilled") {
          const { data } = unwrapApiResult(introRes.value, "获取课程简介失败");
          const introRaw = normalizeDetailSourceText(data.content || detailIntro.value);
          const introHasConflict = hasConflictHint(introRaw);
          if (introHasConflict && !course.isPicked) {
            applyCoursePatch(course.id, (prev) => {
              const nextConflict = true;
              const nextStatus = resolveCourseStatus({
                picked: prev.isPicked,
                selectable: prev.isSelectable,
                full: prev.isFull,
                conflict: nextConflict
              });
              return { ...prev, isConflict: nextConflict, ...nextStatus };
            });
          }
          const latestCourse = courses.value.find((item) => item.id === course.id);
          detailIntro.value = normalizeDetailIntro(introRaw, {
            allowConflictText: latestCourse?.isConflict === true || introHasConflict
          });
        }
        if (teacherRes.status === "fulfilled") {
          const { data } = unwrapApiResult(teacherRes.value, "获取教师详情失败");
          const normalized = normalizeTeacherContent(data.content);
          if (normalized.length > 0) detailTeachers.value = normalized;
        }
      } catch {
      } finally {
        detailLoading.value = false;
      }
    };
    const closeDetail = () => {
      showDetail.value = false;
      selectedCourse.value = null;
      detailLoading.value = false;
    };
    const submitSelect = async (course, zjxbid = "") => {
      if (!course?.id) return;
      selectingCourseId.value = course.id;
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/select`, {
          pcid: currentPcid.value,
          jxbid: course.id,
          zjxbid: safeText(zjxbid) || void 0,
          from: resolveTabFrom(currentTab.value)
        });
        const { data } = unwrapApiResult(res, "选课失败");
        showChildClassDialog.value = false;
        childClasses.value = [];
        pendingSelectCourse.value = null;
        selectedChildClassId.value = "";
        showToast(safeText(data.msg) || "选课成功", "success");
        await fetchList();
        if (selectedCourse.value?.id === course.id) {
          const next = courses.value.find((item) => item.id === course.id);
          if (next) selectedCourse.value = next;
        }
      } catch (err) {
        showToast(resolveErrorMessage(err, "选课失败"), "error");
      } finally {
        selectingCourseId.value = "";
      }
    };
    const openActionConfirm = ({ type, course, childClassId = "" }) => {
      if (!course?.id) return;
      confirmActionType.value = type;
      confirmTargetCourse.value = course;
      confirmTargetChildClassId.value = safeText(childClassId);
      showActionConfirmDialog.value = true;
    };
    const closeActionConfirm = () => {
      showActionConfirmDialog.value = false;
      confirmActionType.value = "";
      confirmTargetCourse.value = null;
      confirmTargetChildClassId.value = "";
    };
    const submitConfirmedAction = async () => {
      const course = confirmTargetCourse.value;
      if (!course?.id) return;
      const actionType = confirmActionType.value;
      const childClassId = confirmTargetChildClassId.value;
      closeActionConfirm();
      if (actionType === "select") {
        await submitSelect(course, childClassId);
        return;
      }
      if (actionType === "withdraw") {
        await submitWithdraw(course);
      }
    };
    const openChildClassPicker = async (course) => {
      if (!course?.id) return;
      selectingCourseId.value = course.id;
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/child_classes`, {
          pcid: currentPcid.value,
          pcenc: currentPcenc.value,
          jxbid: course.id,
          from: resolveTabFrom(currentTab.value)
        });
        const { data } = unwrapApiResult(res, "获取子教学班失败");
        const classes = Array.isArray(data.classes) ? data.classes : [];
        const childIds = Array.isArray(data.child_ids) ? data.child_ids.map((item) => safeText(item)).filter(Boolean) : [];
        const normalized = classes.map((item) => ({
          id: safeText(item.id),
          name: stripHtml(item.name || item.id),
          teacher: stripHtml(item.teacher),
          schedule: looksLikeEncodedSchedule(item.schedule) ? "" : stripHtml(item.schedule)
        })).filter((item) => item.id);
        if (normalized.length <= 1) {
          const singleId = normalized[0]?.id || childIds[0] || "";
          openActionConfirm({ type: "select", course, childClassId: singleId });
          return;
        }
        pendingSelectCourse.value = course;
        childClasses.value = normalized;
        selectedChildClassId.value = normalized[0]?.id || "";
        showChildClassDialog.value = true;
      } catch (err) {
        showToast(resolveErrorMessage(err, "获取子教学班失败"), "error");
      } finally {
        selectingCourseId.value = "";
      }
    };
    const handleSelectCourse = async (course) => {
      if (!course?.isSelectable || course?.isFull || course?.isPicked) return;
      if (course.hasChildClasses) {
        await openChildClassPicker(course);
        return;
      }
      openActionConfirm({ type: "select", course });
    };
    const openWithdrawConfirm = (course) => {
      openActionConfirm({ type: "withdraw", course });
    };
    const submitWithdraw = async (course) => {
      if (!course?.id) return;
      withdrawingCourseId.value = course.id;
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/withdraw`, {
          pcid: currentPcid.value,
          jxbid: course.id
        });
        const { data } = unwrapApiResult(res, "退课失败");
        showToast(safeText(data.msg) || "退课成功", "success");
        await fetchList();
        if (selectedCourse.value?.id === course.id) {
          const next = courses.value.find((item) => item.id === course.id);
          if (next) selectedCourse.value = next;
        }
      } catch (err) {
        showToast(resolveErrorMessage(err, "退课失败"), "error");
      } finally {
        withdrawingCourseId.value = "";
      }
    };
    const currentDetailCourse = computed(() => {
      if (!selectedCourse.value?.id) return selectedCourse.value;
      const fromSelection = courses.value.find((item) => item.id === selectedCourse.value.id);
      if (fromSelection) return fromSelection;
      return infoCourses.value.find((item) => item.id === selectedCourse.value.id) || selectedCourse.value;
    });
    const filteredInfoCourses = computed(() => {
      const keyword = safeText(infoFilters.value.kcmc).toLowerCase();
      const teacher = safeText(infoFilters.value.teacher).toLowerCase();
      return infoCourses.value.filter((course) => {
        if (safeText(infoFilters.value.term) && safeText(course.termLabel) !== safeText(infoFilters.value.term)) {
          return false;
        }
        if (keyword && !safeText(course.kcmc).toLowerCase().includes(keyword)) {
          return false;
        }
        if (teacher && !safeText(course.teacher).toLowerCase().includes(teacher)) {
          return false;
        }
        if (safeText(infoFilters.value.kcxz) && safeText(course.kcxz) !== safeText(infoFilters.value.kcxz)) {
          return false;
        }
        if (safeText(infoFilters.value.kclx) && safeText(course.kclx) !== safeText(infoFilters.value.kclx)) {
          return false;
        }
        const mode = safeText(course.xkfsText || "选课");
        if (!infoShowOtherModes.value && mode !== "选课") {
          return false;
        }
        if (infoShowOtherModes.value && safeText(infoFilters.value.xkfs) && mode !== safeText(infoFilters.value.xkfs)) {
          return false;
        }
        return true;
      });
    });
    const infoEmptyHint = computed(() => {
      if (loadingInfo.value) return "正在查询已选课程...";
      if (infoError.value) return infoError.value;
      if (!infoLoaded.value) return "点击“信息查询”后将自动加载结果";
      return "当前筛选条件下暂无课程";
    });
    const refreshButtonLabel = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) {
        return refreshing.value ? "刷新中…" : "刷新";
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        return loadingInfo.value ? "查询中…" : "刷新查询";
      }
      return "刷新";
    });
    const refreshDisabled = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) {
        return refreshing.value || loadingList.value || loadingOverview.value;
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        return loadingInfo.value;
      }
      return true;
    });
    const headerMainPill = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) {
        return `可选课程 ${count.value} 门`;
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        return `已选课程 ${filteredInfoCourses.value.length} 门`;
      }
      return "请选择查询入口";
    });
    const headerSubPill = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) {
        return `批次倒计时 ${countdownText.value || "--"}`;
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        return `当前学期 ${safeText(infoFilters.value.term) || safeText(summaryStudent.value?.semester) || "--"}`;
      }
      return "左侧选课，右侧信息查询";
    });
    const pageTitle = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) return "选课中心 · 选课";
      if (centerMode.value === ENTRY_MODE_INFO) return "选课中心 · 信息查询";
      return "选课中心";
    });
    const backButtonLabel = computed(() => centerMode.value === ENTRY_MODE_MENU ? "← 返回" : "← 入口");
    const emptyHint = computed(() => {
      if (loadingOverview.value || loadingList.value) return "加载中...";
      if (overviewError.value) return overviewError.value;
      return listMessage.value || "当前暂无可选课程";
    });
    const canShowList = computed(() => tabs.value.length > 0);
    onMounted(async () => {
      await fetchOverview();
      if (activeTabId.value) {
        await loadTabBundle();
      }
    });
    onBeforeUnmount(() => {
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      stopCountdownTick();
      stopEndTimeRefresh();
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              class: "back-btn ios26-btn",
              onClick: handleBack
            }, toDisplayString(backButtonLabel.value), 1),
            createBaseVNode("div", _hoisted_4, toDisplayString(pageTitle.value), 1),
            centerMode.value !== ENTRY_MODE_MENU ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "refresh-btn ios26-btn",
              type: "button",
              disabled: refreshDisabled.value,
              onClick: handleHeaderRefresh
            }, toDisplayString(refreshButtonLabel.value), 9, _hoisted_5)) : (openBlock(), createElementBlock("div", _hoisted_6))
          ]),
          createBaseVNode("div", _hoisted_7, [
            createBaseVNode("span", _hoisted_8, toDisplayString(headerMainPill.value), 1),
            createBaseVNode("span", _hoisted_9, toDisplayString(headerSubPill.value), 1)
          ])
        ]),
        createBaseVNode("div", _hoisted_10, [
          centerMode.value === ENTRY_MODE_MENU ? (openBlock(), createElementBlock("div", _hoisted_11, [
            createBaseVNode("button", {
              type: "button",
              class: "entry-tile glass-card",
              onClick: enterSelectionMode
            }, [..._cache[26] || (_cache[26] = [
              createBaseVNode("div", { class: "entry-badge entry-badge-selection" }, "选课", -1),
              createBaseVNode("div", { class: "entry-title" }, "选课", -1),
              createBaseVNode("div", { class: "entry-desc" }, "沿用当前选课与退课能力，支持批次切换、筛选与课程详情。", -1)
            ])]),
            createBaseVNode("button", {
              type: "button",
              class: "entry-tile glass-card",
              onClick: enterInfoMode
            }, [..._cache[27] || (_cache[27] = [
              createBaseVNode("div", { class: "entry-badge entry-badge-info" }, "信息查询", -1),
              createBaseVNode("div", { class: "entry-title" }, "信息查询", -1),
              createBaseVNode("div", { class: "entry-desc" }, "自动查询已选课程，默认匹配当前学期，并支持展开高级筛选。", -1)
            ])])
          ])) : centerMode.value === ENTRY_MODE_SELECTION ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_12, [
              createBaseVNode("div", _hoisted_13, [
                _cache[28] || (_cache[28] = createBaseVNode("div", null, [
                  createBaseVNode("div", { class: "filter-title" }, "查询条件"),
                  createBaseVNode("div", { class: "filter-subtitle" }, "默认折叠，按需展开筛选条件")
                ], -1)),
                createBaseVNode("div", _hoisted_14, [
                  createBaseVNode("button", {
                    class: "ghost-btn",
                    type: "button",
                    onClick: backToEntryMenu
                  }, "返回入口"),
                  createBaseVNode("button", {
                    class: "ghost-btn",
                    type: "button",
                    onClick: resetFilters
                  }, "重置"),
                  createBaseVNode("button", {
                    class: "ghost-btn",
                    type: "button",
                    onClick: _cache[0] || (_cache[0] = ($event) => showAdvanced.value = !showAdvanced.value)
                  }, toDisplayString(showAdvanced.value ? "收起筛选" : "展开筛选"), 1),
                  createBaseVNode("button", {
                    class: "primary-btn",
                    type: "button",
                    disabled: loadingList.value || !canShowList.value,
                    onClick: queryCourses
                  }, "查询课程", 8, _hoisted_15)
                ])
              ]),
              showAdvanced.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("div", _hoisted_16, [
                  createBaseVNode("div", _hoisted_17, [
                    _cache[29] || (_cache[29] = createBaseVNode("label", null, "课程名称", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => filters.value.kcmc = $event),
                      class: "text-input",
                      type: "text",
                      placeholder: "输入课程名称关键词"
                    }, null, 512), [
                      [
                        vModelText,
                        filters.value.kcmc,
                        void 0,
                        { trim: true }
                      ]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_18, [
                    _cache[30] || (_cache[30] = createBaseVNode("label", null, "课程性质", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: filters.value.kcxz,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => filters.value.kcxz = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(optionMaps.value.kcxz, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-kcxz",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_19);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_20, [
                    _cache[31] || (_cache[31] = createBaseVNode("label", null, "课程归属", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: filters.value.kcgs,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => filters.value.kcgs = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(optionMaps.value.kcgs, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-kcgs",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_21);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_22, [
                    _cache[32] || (_cache[32] = createBaseVNode("label", null, "教学模式", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: filters.value.jxms,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => filters.value.jxms = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(optionMaps.value.jxms, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-jxms",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_23);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_24, [
                    _cache[33] || (_cache[33] = createBaseVNode("label", null, "教师", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => filters.value.teacher = $event),
                      class: "text-input",
                      type: "text",
                      placeholder: "输入授课教师"
                    }, null, 512), [
                      [
                        vModelText,
                        filters.value.teacher,
                        void 0,
                        { trim: true }
                      ]
                    ])
                  ])
                ]),
                createBaseVNode("div", _hoisted_25, [
                  createBaseVNode("div", _hoisted_26, [
                    _cache[34] || (_cache[34] = createBaseVNode("label", null, "上课校区", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: filters.value.kkxq,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => filters.value.kkxq = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(optionMaps.value.kkxq, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-kkxq",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_27);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_28, [
                    _cache[35] || (_cache[35] = createBaseVNode("label", null, "课程类别", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: filters.value.kclb,
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => filters.value.kclb = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(optionMaps.value.kclb, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-kclb",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_29);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_30, [
                    _cache[36] || (_cache[36] = createBaseVNode("label", null, "课程类型", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: filters.value.kclx,
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => filters.value.kclx = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(optionMaps.value.kclx, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-kclx",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_31);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ])
                ])
              ], 64)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_32, [
              createBaseVNode("div", _hoisted_33, [
                createBaseVNode("div", null, [
                  _cache[37] || (_cache[37] = createBaseVNode("h3", null, "选课批次", -1)),
                  createBaseVNode("p", null, toDisplayString(cleanMessage(overview.value?.message) || "从教务系统中选择当前开放的选课批次"), 1)
                ])
              ]),
              tabs.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_34, [
                createVNode(_component_IOSSelect, {
                  "model-value": activeTabId.value,
                  class: "modern-select batch-select",
                  "onUpdate:modelValue": handleTabChange
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(tabs.value, (tab) => {
                      return openBlock(), createElementBlock("option", {
                        key: tab.xkgzid,
                        value: tab.xkgzid
                      }, toDisplayString(tab.xkgzMc || "未命名批次"), 9, _hoisted_35);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["model-value"])
              ])) : (openBlock(), createBlock(unref(TEmptyState), {
                key: 1,
                message: "",
                icon: ""
              }, {
                default: withCtx(() => [
                  createBaseVNode("p", null, toDisplayString(overviewError.value || cleanMessage(overview.value?.message) || "当前暂无选课批次"), 1)
                ]),
                _: 1
              }))
            ]),
            createBaseVNode("div", _hoisted_36, [
              loadingOverview.value || loadingList.value ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                type: "loading",
                message: "正在同步选课数据..."
              })) : !canShowList.value || courses.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 1,
                message: emptyHint.value
              }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_37, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(courses.value, (course) => {
                  return openBlock(), createElementBlock("button", {
                    key: course.id,
                    type: "button",
                    class: "course-card glass-card",
                    onClick: ($event) => openDetail(course)
                  }, [
                    createBaseVNode("div", _hoisted_39, [
                      createBaseVNode("div", null, [
                        createBaseVNode("div", _hoisted_40, toDisplayString(course.kcmc || "未命名课程"), 1),
                        createBaseVNode("div", _hoisted_41, toDisplayString(course.jxbmcDisplay || course.jxbmc || "未命名教学班"), 1)
                      ]),
                      createBaseVNode("div", _hoisted_42, [
                        course.isConflict ? (openBlock(), createElementBlock("span", _hoisted_43, "冲突")) : createCommentVNode("", true),
                        createBaseVNode("div", _hoisted_44, toDisplayString(course.xf || "--") + " 学分", 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_45, [
                      createBaseVNode("span", _hoisted_46, toDisplayString(course.teacher || "待定教师"), 1),
                      course.isOnline ? (openBlock(), createElementBlock("span", _hoisted_47, "网课")) : (openBlock(), createElementBlock("span", _hoisted_48, toDisplayString(course.scheduleText || "未公布时间地点"), 1))
                    ]),
                    createBaseVNode("div", _hoisted_49, [
                      createBaseVNode("div", _hoisted_50, [
                        createBaseVNode("span", _hoisted_51, "容量 " + toDisplayString(course.capacity.display), 1),
                        createBaseVNode("span", {
                          class: normalizeClass(["status-pill", course.statusClass])
                        }, toDisplayString(course.statusLabel), 3)
                      ]),
                      createBaseVNode("div", {
                        class: "course-actions",
                        onClick: _cache[9] || (_cache[9] = withModifiers(() => {
                        }, ["stop"]))
                      }, [
                        !course.isPicked ? (openBlock(), createElementBlock("button", {
                          key: 0,
                          class: "action-btn primary",
                          type: "button",
                          disabled: !course.isSelectable || course.isFull || selectingCourseId.value === course.id,
                          onClick: ($event) => handleSelectCourse(course)
                        }, toDisplayString(selectingCourseId.value === course.id ? "提交中..." : "选课"), 9, _hoisted_52)) : (openBlock(), createElementBlock("button", {
                          key: 1,
                          class: "action-btn danger",
                          type: "button",
                          disabled: withdrawingCourseId.value === course.id,
                          onClick: ($event) => openWithdrawConfirm(course)
                        }, toDisplayString(withdrawingCourseId.value === course.id ? "处理中..." : "退课"), 9, _hoisted_53))
                      ])
                    ])
                  ], 8, _hoisted_38);
                }), 128))
              ]))
            ])
          ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("div", _hoisted_54, [
              createBaseVNode("div", _hoisted_55, [
                _cache[38] || (_cache[38] = createBaseVNode("div", null, [
                  createBaseVNode("div", { class: "filter-title" }, "信息查询条件"),
                  createBaseVNode("div", { class: "filter-subtitle" }, "默认显示当前学期，展开后可查看更多筛选项")
                ], -1)),
                createBaseVNode("div", _hoisted_56, [
                  createBaseVNode("button", {
                    class: "ghost-btn",
                    type: "button",
                    onClick: backToEntryMenu
                  }, "返回入口"),
                  createBaseVNode("button", {
                    class: "ghost-btn",
                    type: "button",
                    onClick: resetInfoFilters
                  }, "重置"),
                  createBaseVNode("button", {
                    class: "ghost-btn",
                    type: "button",
                    onClick: _cache[10] || (_cache[10] = ($event) => infoShowAdvanced.value = !infoShowAdvanced.value)
                  }, toDisplayString(infoShowAdvanced.value ? "收起筛选" : "展开筛选"), 1),
                  createBaseVNode("button", {
                    class: "primary-btn",
                    type: "button",
                    disabled: loadingInfo.value,
                    onClick: _cache[11] || (_cache[11] = ($event) => querySelectedCourses())
                  }, "查询", 8, _hoisted_57)
                ])
              ]),
              createBaseVNode("div", _hoisted_58, [
                createBaseVNode("div", _hoisted_59, [
                  _cache[39] || (_cache[39] = createBaseVNode("label", null, "当前学期", -1)),
                  createVNode(_component_IOSSelect, {
                    modelValue: infoFilters.value.term,
                    "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => infoFilters.value.term = $event),
                    class: "modern-select",
                    onChange: onInfoTermChange
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(infoOptions.value.term, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value || "empty-info-term",
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_60);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ])
              ]),
              infoShowAdvanced.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("div", _hoisted_61, [
                  createBaseVNode("div", _hoisted_62, [
                    _cache[40] || (_cache[40] = createBaseVNode("label", null, "课程名称", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => infoFilters.value.kcmc = $event),
                      class: "text-input",
                      type: "text",
                      placeholder: "输入课程名称关键词"
                    }, null, 512), [
                      [
                        vModelText,
                        infoFilters.value.kcmc,
                        void 0,
                        { trim: true }
                      ]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_63, [
                    _cache[41] || (_cache[41] = createBaseVNode("label", null, "授课教师", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => infoFilters.value.teacher = $event),
                      class: "text-input",
                      type: "text",
                      placeholder: "输入授课教师"
                    }, null, 512), [
                      [
                        vModelText,
                        infoFilters.value.teacher,
                        void 0,
                        { trim: true }
                      ]
                    ])
                  ])
                ]),
                createBaseVNode("div", _hoisted_64, [
                  createBaseVNode("div", _hoisted_65, [
                    _cache[42] || (_cache[42] = createBaseVNode("label", null, "课程性质", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: infoFilters.value.kcxz,
                      "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => infoFilters.value.kcxz = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(infoOptions.value.kcxz, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-info-kcxz",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_66);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_67, [
                    _cache[43] || (_cache[43] = createBaseVNode("label", null, "课程类型", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: infoFilters.value.kclx,
                      "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => infoFilters.value.kclx = $event),
                      class: "modern-select"
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(infoOptions.value.kclx, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-info-kclx",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_68);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_69, [
                    _cache[44] || (_cache[44] = createBaseVNode("label", null, "选课方式", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: infoFilters.value.xkfs,
                      "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => infoFilters.value.xkfs = $event),
                      class: "modern-select",
                      disabled: !infoShowOtherModes.value
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(infoOptions.value.xkfs, (item) => {
                          return openBlock(), createElementBlock("option", {
                            key: item.value || "empty-info-xkfs",
                            value: item.value
                          }, toDisplayString(item.label), 9, _hoisted_70);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue", "disabled"])
                  ])
                ]),
                createBaseVNode("div", _hoisted_71, [
                  createBaseVNode("label", _hoisted_72, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => infoShowOtherModes.value = $event),
                      type: "checkbox",
                      onChange: handleInfoOtherModesChange
                    }, null, 544), [
                      [vModelCheckbox, infoShowOtherModes.value]
                    ]),
                    _cache[45] || (_cache[45] = createBaseVNode("span", null, "显示其他选课方式课程（默认仅展示“选课”）", -1))
                  ])
                ])
              ], 64)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_73, [
              loadingInfo.value ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                type: "loading",
                message: "正在查询已选课程..."
              })) : filteredInfoCourses.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 1,
                message: infoEmptyHint.value
              }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                infoSourceMessage.value ? (openBlock(), createElementBlock("div", _hoisted_74, toDisplayString(infoSourceMessage.value), 1)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_75, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(filteredInfoCourses.value, (course) => {
                    return openBlock(), createElementBlock("button", {
                      key: `${course.id}-${course.termLabel}-${course.sourceTabId}`,
                      type: "button",
                      class: "course-card glass-card",
                      onClick: ($event) => openDetail(course)
                    }, [
                      createBaseVNode("div", _hoisted_77, [
                        createBaseVNode("div", null, [
                          createBaseVNode("div", _hoisted_78, toDisplayString(course.kcmc || "未命名课程"), 1),
                          createBaseVNode("div", _hoisted_79, toDisplayString(course.jxbmcDisplay || course.jxbmc || "未命名教学班"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_80, [
                          createBaseVNode("span", _hoisted_81, toDisplayString(course.xkfsText || "选课"), 1),
                          createBaseVNode("div", _hoisted_82, toDisplayString(course.xf || "--") + " 学分", 1)
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_83, [
                        createBaseVNode("span", _hoisted_84, toDisplayString(course.teacher || "待定教师"), 1),
                        course.isOnline ? (openBlock(), createElementBlock("span", _hoisted_85, "网课")) : (openBlock(), createElementBlock("span", _hoisted_86, toDisplayString(course.scheduleText || "未公布时间地点"), 1))
                      ]),
                      createBaseVNode("div", _hoisted_87, [
                        createBaseVNode("span", _hoisted_88, "学期 " + toDisplayString(course.termLabel || "--"), 1),
                        createBaseVNode("span", _hoisted_89, "选课方式 " + toDisplayString(course.xkfsText || "选课"), 1),
                        createBaseVNode("span", {
                          class: normalizeClass(["status-pill", course.statusClass])
                        }, toDisplayString(course.statusLabel), 3)
                      ])
                    ], 8, _hoisted_76);
                  }), 128))
                ])
              ], 64))
            ])
          ], 64))
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showDetail.value && currentDetailCourse.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: closeDetail
          }, [
            createBaseVNode("div", {
              class: "modal-content detail-modal glass",
              onClick: _cache[19] || (_cache[19] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_90, [
                createBaseVNode("div", null, [
                  createBaseVNode("div", _hoisted_91, toDisplayString(currentDetailCourse.value.kcmc), 1),
                  createBaseVNode("div", _hoisted_92, toDisplayString(currentDetailCourse.value.jxbmc), 1)
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  type: "button",
                  onClick: closeDetail
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_93, [
                currentDetailCourse.value.isOnline ? (openBlock(), createElementBlock("span", _hoisted_94, "网课")) : createCommentVNode("", true),
                createBaseVNode("span", {
                  class: normalizeClass(["status-pill", currentDetailCourse.value.statusClass])
                }, toDisplayString(currentDetailCourse.value.statusLabel), 3)
              ]),
              createBaseVNode("div", _hoisted_95, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(detailFields.value, (item) => {
                  return openBlock(), createElementBlock("div", {
                    key: item.label,
                    class: "detail-item"
                  }, [
                    createBaseVNode("span", _hoisted_96, toDisplayString(item.label), 1),
                    createBaseVNode("span", _hoisted_97, toDisplayString(item.value), 1)
                  ]);
                }), 128))
              ]),
              createBaseVNode("div", _hoisted_98, [
                _cache[46] || (_cache[46] = createBaseVNode("h4", null, "课程简介", -1)),
                createBaseVNode("div", _hoisted_99, toDisplayString(detailIntro.value || normalizeDetailIntro(normalizeDetailSourceText(currentDetailCourse.value.kcjj), { allowConflictText: currentDetailCourse.value.isConflict }) || "暂无课程简介"), 1)
              ]),
              createBaseVNode("div", _hoisted_100, [
                _cache[47] || (_cache[47] = createBaseVNode("h4", null, "教师详情", -1)),
                createBaseVNode("div", _hoisted_101, toDisplayString(detailTeacherText.value || currentDetailCourse.value.teacher || "暂无教师详情"), 1)
              ]),
              detailLoading.value ? (openBlock(), createElementBlock("div", _hoisted_102, "正在补充课程简介与教师详情...")) : createCommentVNode("", true)
            ])
          ])) : createCommentVNode("", true)
        ])),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showChildClassDialog.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: _cache[24] || (_cache[24] = ($event) => showChildClassDialog.value = false)
          }, [
            createBaseVNode("div", {
              class: "modal-content child-modal glass",
              onClick: _cache[23] || (_cache[23] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_103, [
                createBaseVNode("div", null, [
                  _cache[48] || (_cache[48] = createBaseVNode("div", { class: "modal-title" }, "选择子教学班", -1)),
                  createBaseVNode("div", _hoisted_104, toDisplayString(pendingSelectCourse.value?.kcmc || "当前课程"), 1)
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  type: "button",
                  onClick: _cache[20] || (_cache[20] = ($event) => showChildClassDialog.value = false)
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_105, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(childClasses.value, (item) => {
                  return openBlock(), createElementBlock("button", {
                    key: item.id,
                    type: "button",
                    class: normalizeClass(["child-class-item", { active: selectedChildClassId.value === item.id }]),
                    onClick: ($event) => selectedChildClassId.value = item.id
                  }, [
                    createBaseVNode("div", _hoisted_107, toDisplayString(item.name || item.id), 1),
                    createBaseVNode("div", _hoisted_108, toDisplayString(item.teacher || "待定教师"), 1),
                    createBaseVNode("div", _hoisted_109, toDisplayString(item.schedule || "时间地点待公布"), 1)
                  ], 10, _hoisted_106);
                }), 128))
              ]),
              createBaseVNode("div", _hoisted_110, [
                createBaseVNode("button", {
                  class: "ghost-btn",
                  type: "button",
                  onClick: _cache[21] || (_cache[21] = ($event) => showChildClassDialog.value = false)
                }, "取消"),
                createBaseVNode("button", {
                  class: "primary-btn",
                  type: "button",
                  disabled: !selectedChildClassId.value || !pendingSelectCourse.value,
                  onClick: _cache[22] || (_cache[22] = ($event) => {
                    showChildClassDialog.value = false;
                    openActionConfirm({ type: "select", course: pendingSelectCourse.value, childClassId: selectedChildClassId.value });
                  })
                }, " 确认选课 ", 8, _hoisted_111)
              ])
            ])
          ])) : createCommentVNode("", true)
        ])),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showActionConfirmDialog.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: closeActionConfirm
          }, [
            createBaseVNode("div", {
              class: "modal-content confirm-modal glass",
              onClick: _cache[25] || (_cache[25] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("div", _hoisted_112, toDisplayString(confirmActionType.value === "withdraw" ? "确认退课" : "确认选课"), 1),
              createBaseVNode("div", _hoisted_113, [
                confirmActionType.value === "withdraw" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createTextVNode(" 确定要退掉“" + toDisplayString(confirmTargetCourse.value?.kcmc || "当前课程") + "”吗？退课后会立即刷新当前批次列表。 ", 1)
                ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createTextVNode(" 确定要选择“" + toDisplayString(confirmTargetCourse.value?.kcmc || "当前课程") + "”吗？提交后会按教务系统规则实时校验容量与选课门数限制。 ", 1)
                ], 64))
              ]),
              createBaseVNode("div", _hoisted_114, [
                createBaseVNode("button", {
                  class: "ghost-btn",
                  type: "button",
                  onClick: closeActionConfirm
                }, "取消"),
                createBaseVNode("button", {
                  class: normalizeClass(confirmActionType.value === "withdraw" ? "danger-btn" : "primary-btn"),
                  type: "button",
                  disabled: !confirmTargetCourse.value || confirmActionType.value === "withdraw" && withdrawingCourseId.value === confirmTargetCourse.value.id || confirmActionType.value === "select" && selectingCourseId.value === confirmTargetCourse.value.id,
                  onClick: submitConfirmedAction
                }, [
                  confirmActionType.value === "withdraw" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createTextVNode(toDisplayString(withdrawingCourseId.value === confirmTargetCourse.value?.id ? "处理中..." : "确认退课"), 1)
                  ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                    createTextVNode(toDisplayString(selectingCourseId.value === confirmTargetCourse.value?.id ? "提交中..." : "确认选课"), 1)
                  ], 64))
                ], 10, _hoisted_115)
              ])
            ])
          ])) : createCommentVNode("", true)
        ])),
        createVNode(Transition, { name: "fade" }, {
          default: withCtx(() => [
            toastState.value.visible ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: normalizeClass(["toast-pill", toastState.value.type])
            }, toDisplayString(toastState.value.message), 3)) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ]);
    };
  }
};
const CourseSelectionView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-49669f17"]]);
export {
  CourseSelectionView as default
};
