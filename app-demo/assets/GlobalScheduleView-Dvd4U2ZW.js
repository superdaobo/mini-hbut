import { v as watch, o as onMounted, M as resolveComponent, a as openBlock, c as createElementBlock, p as createVNode, u as unref, t as toDisplayString, d as createCommentVNode, b as createBaseVNode, k as withCtx, F as Fragment, f as renderList, K as withDirectives, L as vModelText, Q as vModelCheckbox, n as normalizeClass, g as createTextVNode, j as createBlock, e as normalizeStyle, w as withModifiers, s as Teleport, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import { _ as _export_sfc, m as useI18n, d as axiosInstance } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { t as tf } from "./i18n_text-DCDXEUTK.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "qxzkb-view" };
const _hoisted_2 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_3 = { class: "content" };
const _hoisted_4 = { class: "filter-card glass-card" };
const _hoisted_5 = { class: "filter-header" };
const _hoisted_6 = { class: "filter-title" };
const _hoisted_7 = { class: "filter-actions" };
const _hoisted_8 = ["disabled"];
const _hoisted_9 = { class: "filter-grid compact-grid" };
const _hoisted_10 = { class: "field" };
const _hoisted_11 = { value: "" };
const _hoisted_12 = ["value"];
const _hoisted_13 = { class: "field" };
const _hoisted_14 = { value: "" };
const _hoisted_15 = ["value"];
const _hoisted_16 = { class: "field" };
const _hoisted_17 = { value: "" };
const _hoisted_18 = ["value"];
const _hoisted_19 = { class: "field" };
const _hoisted_20 = { value: "" };
const _hoisted_21 = ["value"];
const _hoisted_22 = { class: "field" };
const _hoisted_23 = ["placeholder"];
const _hoisted_24 = { class: "field" };
const _hoisted_25 = ["placeholder"];
const _hoisted_26 = {
  key: 0,
  class: "advanced-section"
};
const _hoisted_27 = { class: "filter-grid" };
const _hoisted_28 = { class: "field" };
const _hoisted_29 = { value: "" };
const _hoisted_30 = ["value"];
const _hoisted_31 = { class: "field" };
const _hoisted_32 = { value: "" };
const _hoisted_33 = ["value"];
const _hoisted_34 = { class: "field" };
const _hoisted_35 = { value: "" };
const _hoisted_36 = ["value"];
const _hoisted_37 = { class: "field" };
const _hoisted_38 = { value: "" };
const _hoisted_39 = ["value"];
const _hoisted_40 = { class: "field" };
const _hoisted_41 = { value: "" };
const _hoisted_42 = ["value"];
const _hoisted_43 = { class: "field" };
const _hoisted_44 = { value: "" };
const _hoisted_45 = ["value"];
const _hoisted_46 = { class: "field" };
const _hoisted_47 = { value: "" };
const _hoisted_48 = ["value"];
const _hoisted_49 = { class: "field" };
const _hoisted_50 = { value: "" };
const _hoisted_51 = ["value"];
const _hoisted_52 = { class: "field" };
const _hoisted_53 = { value: "" };
const _hoisted_54 = ["value"];
const _hoisted_55 = { class: "field" };
const _hoisted_56 = { value: "" };
const _hoisted_57 = ["value"];
const _hoisted_58 = { class: "field" };
const _hoisted_59 = ["placeholder"];
const _hoisted_60 = { class: "filter-grid" };
const _hoisted_61 = { class: "field" };
const _hoisted_62 = { value: "" };
const _hoisted_63 = ["value"];
const _hoisted_64 = { class: "field" };
const _hoisted_65 = { value: "" };
const _hoisted_66 = ["value"];
const _hoisted_67 = { class: "field" };
const _hoisted_68 = { value: "" };
const _hoisted_69 = ["value"];
const _hoisted_70 = { class: "field" };
const _hoisted_71 = { value: "" };
const _hoisted_72 = ["value"];
const _hoisted_73 = { class: "field" };
const _hoisted_74 = { value: "" };
const _hoisted_75 = ["value"];
const _hoisted_76 = { class: "field" };
const _hoisted_77 = { value: "" };
const _hoisted_78 = ["value"];
const _hoisted_79 = { class: "field" };
const _hoisted_80 = ["value"];
const _hoisted_81 = { class: "kklx-section" };
const _hoisted_82 = { class: "kklx-title" };
const _hoisted_83 = { class: "kklx-options" };
const _hoisted_84 = ["value"];
const _hoisted_85 = { class: "pagination-bar" };
const _hoisted_86 = { class: "page-info" };
const _hoisted_87 = { class: "page-actions" };
const _hoisted_88 = ["disabled"];
const _hoisted_89 = ["disabled"];
const _hoisted_90 = ["value"];
const _hoisted_91 = {
  key: 0,
  class: "error-banner"
};
const _hoisted_92 = {
  key: 1,
  class: "tab-bar"
};
const _hoisted_93 = {
  key: 0,
  class: "tab-loading"
};
const _hoisted_94 = {
  key: 1,
  class: "tab-badge"
};
const _hoisted_95 = {
  key: 3,
  class: "result-list"
};
const _hoisted_96 = ["onClick"];
const _hoisted_97 = { class: "result-title" };
const _hoisted_98 = { class: "result-brief" };
const _hoisted_99 = { class: "brief-item" };
const _hoisted_100 = { class: "brief-label" };
const _hoisted_101 = { class: "brief-value" };
const _hoisted_102 = { class: "brief-item" };
const _hoisted_103 = { class: "brief-label" };
const _hoisted_104 = { class: "brief-value" };
const _hoisted_105 = { class: "brief-item full-row" };
const _hoisted_106 = { class: "brief-label" };
const _hoisted_107 = { class: "brief-value multiline" };
const _hoisted_108 = { key: 4 };
const _hoisted_109 = { class: "class-search" };
const _hoisted_110 = ["placeholder"];
const _hoisted_111 = { class: "class-list" };
const _hoisted_112 = ["onClick"];
const _hoisted_113 = { class: "class-name" };
const _hoisted_114 = { class: "class-meta" };
const _hoisted_115 = {
  key: 0,
  class: "class-teacher"
};
const _hoisted_116 = {
  key: 5,
  class: "class-schedule-view"
};
const _hoisted_117 = { class: "class-schedule-header" };
const _hoisted_118 = { class: "class-schedule-title" };
const _hoisted_119 = {
  key: 0,
  class: "week-selector"
};
const _hoisted_120 = ["disabled"];
const _hoisted_121 = { class: "week-label" };
const _hoisted_122 = ["disabled"];
const _hoisted_123 = { class: "schedule-date-header" };
const _hoisted_124 = { class: "schedule-day-labels" };
const _hoisted_125 = { class: "schedule-grid-body" };
const _hoisted_126 = { class: "schedule-time-axis" };
const _hoisted_127 = { class: "schedule-time-start" };
const _hoisted_128 = { class: "schedule-period-num" };
const _hoisted_129 = { class: "schedule-time-end" };
const _hoisted_130 = { class: "schedule-courses-grid" };
const _hoisted_131 = { class: "schedule-grid-lines" };
const _hoisted_132 = ["onClick"];
const _hoisted_133 = { class: "schedule-course-name" };
const _hoisted_134 = { class: "schedule-course-room" };
const _hoisted_135 = {
  key: 0,
  class: "schedule-course-teacher"
};
const _hoisted_136 = { class: "modal-title" };
const _hoisted_137 = { class: "detail-grid" };
const _hoisted_138 = { class: "detail-label" };
const _hoisted_139 = { class: "detail-value" };
const _sfc_main = {
  __name: "GlobalScheduleView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    const API_BASE = "/api";
    const loading = ref(false);
    const loadingOptions = ref(false);
    const error = ref("");
    const offline = ref(false);
    const syncTime = ref("");
    const showAdvanced = ref(false);
    const showDetail = ref(false);
    const selectedRow = ref(null);
    const activeTab = ref("courses");
    const selectedClassId = ref(null);
    const classSearchKeyword = ref("");
    const allResults = ref([]);
    const loadingAll = ref(false);
    const WEEKDAY_MAP = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7 };
    const parseSksjdd = (raw) => {
      if (!raw || typeof raw !== "string") return [];
      const segments = [];
      const parts = raw.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const weekMatch = part.match(/\u7b2c([\d,，、\-]+)\u5468/);
        const weeks = [];
        if (weekMatch) {
          const weekExpr = String(weekMatch[1] || "");
          const chunks = weekExpr.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
          for (const chunk of chunks) {
            const rangeMatch = chunk.match(/^(\d+)(?:-(\d+))?$/);
            if (!rangeMatch) continue;
            const wStart = parseInt(rangeMatch[1], 10);
            const wEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : wStart;
            if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) continue;
            const [startWeek, endWeek] = wStart <= wEnd ? [wStart, wEnd] : [wEnd, wStart];
            for (let w = startWeek; w <= endWeek; w += 1) {
              weeks.push(w);
            }
          }
        }
        const dayMatch = part.match(/\u661f\u671f([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])/);
        const weekday = dayMatch ? WEEKDAY_MAP[dayMatch[1]] || 0 : 0;
        const periodMatch = part.match(/(\d+)(?:-(\d+))?\u8282/);
        const startNode = periodMatch ? parseInt(periodMatch[1]) : 0;
        const endNode = periodMatch && periodMatch[2] ? parseInt(periodMatch[2]) : startNode;
        const roomMatch = part.match(/[【\[](.*?)[】\]]/);
        const room = roomMatch ? roomMatch[1] : "";
        if (weekday && startNode) {
          segments.push({ weeks, weekday, startNode, endNode, room });
        }
      }
      return segments;
    };
    const courseThemes = [
      { bg: "#e7f4ff", text: "#0f5da8", border: "#72b9ff" },
      { bg: "#fff0e8", text: "#cb4f2f", border: "#ffb390" },
      { bg: "#efe9ff", text: "#5f52cf", border: "#b8aaff" },
      { bg: "#fff4db", text: "#be7a07", border: "#efc465" },
      { bg: "#ffeaf2", text: "#c33f73", border: "#f3a8c4" },
      { bg: "#e8faf5", text: "#117f67", border: "#8adcc4" },
      { bg: "#e8efff", text: "#335ccb", border: "#9eb4ff" },
      { bg: "#fff1f5", text: "#b63f58", border: "#f0acbb" },
      { bg: "#edf8ef", text: "#2f8c3d", border: "#9dd7a7" },
      { bg: "#e8f9ff", text: "#007893", border: "#84d6ec" },
      { bg: "#f4edff", text: "#7548c1", border: "#c6adf1" },
      { bg: "#fff2e2", text: "#b05c16", border: "#efb67f" }
    ];
    const timeSchedule = [
      { p: 1, start: "08:20", end: "09:05" },
      { p: 2, start: "09:10", end: "09:55" },
      { p: 3, start: "10:15", end: "11:00" },
      { p: 4, start: "11:05", end: "11:50" },
      { p: 5, start: "14:00", end: "14:45" },
      { p: 6, start: "14:50", end: "15:35" },
      { p: 7, start: "15:55", end: "16:40" },
      { p: 8, start: "16:45", end: "17:30" },
      { p: 9, start: "18:30", end: "19:15" },
      { p: 10, start: "19:20", end: "20:05" },
      { p: 11, start: "20:10", end: "20:55" }
    ];
    const getDayLabelText = (day) => t(`schedule.weekday.${day}`);
    const toPositiveInt = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const readStoredScheduleMeta = () => {
      if (typeof window === "undefined" || !window?.localStorage) {
        return {};
      }
      try {
        const raw = window.localStorage.getItem("hbu_schedule_meta");
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    };
    const calculateWeekFromStartDate = (startDateText) => {
      const text = String(startDateText || "").trim();
      if (!text) return 0;
      const start = new Date(text);
      if (Number.isNaN(start.getTime())) return 0;
      const now = /* @__PURE__ */ new Date();
      const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const begin = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const diff = current.getTime() - begin.getTime();
      if (diff < 0) return 1;
      return Math.floor(diff / (7 * 24 * 60 * 60 * 1e3)) + 1;
    };
    const getPreferredCurrentWeek = () => {
      const meta = readStoredScheduleMeta();
      const selectedSemester = String(filters.value.xnxq || "").trim();
      const metaSemester = String(meta?.semester || "").trim();
      if (selectedSemester && metaSemester && selectedSemester !== metaSemester) {
        return 1;
      }
      const storedWeek = toPositiveInt(meta?.current_week, 0);
      if (storedWeek > 0) return storedWeek;
      const derivedWeek = calculateWeekFromStartDate(meta?.start_date);
      return toPositiveInt(derivedWeek, 1);
    };
    const pickAutoWeek = (weeks) => {
      const normalized = [...new Set((Array.isArray(weeks) ? weeks : []).map((item) => toPositiveInt(item, 0)).filter(Boolean))].sort((a, b) => a - b);
      if (!normalized.length) return 1;
      const preferredWeek = getPreferredCurrentWeek();
      if (normalized.includes(preferredWeek)) return preferredWeek;
      const nextWeek2 = normalized.find((week) => week >= preferredWeek);
      return nextWeek2 || normalized[normalized.length - 1];
    };
    const collectWeeksFromRows = (rows) => {
      const weekSet = /* @__PURE__ */ new Set();
      for (const row of Array.isArray(rows) ? rows : []) {
        const segments = parseSksjdd(row?.sksjdd || "");
        for (const seg of segments) {
          for (const week of seg.weeks || []) {
            const normalized = toPositiveInt(week, 0);
            if (normalized > 0) weekSet.add(normalized);
          }
        }
      }
      return [...weekSet].sort((a, b) => a - b);
    };
    const formatWeekRanges = (weeks) => {
      const sorted = [...new Set((Array.isArray(weeks) ? weeks : []).map((item) => toPositiveInt(item, 0)).filter(Boolean))].sort((a, b) => a - b);
      if (!sorted.length) return "";
      const ranges = [];
      let start = sorted[0];
      let end = sorted[0];
      for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        if (current === end + 1) {
          end = current;
          continue;
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = current;
        end = current;
      }
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      return ranges.join(",");
    };
    const formatSegmentText = (seg) => {
      const weekText = formatWeekRanges(seg?.weeks || []);
      const day = toPositiveInt(seg?.weekday, 1) || 1;
      const startNode = toPositiveInt(seg?.startNode, 1);
      const endNode = toPositiveInt(seg?.endNode, startNode);
      const roomText = seg?.room ? `【${seg.room}】` : "";
      return tf("schedule.global.segmentText", { w: weekText, day: String(day), s: String(startNode), e: String(endNode) }) + roomText;
    };
    const options = ref({
      xnxq: [],
      xqid: [],
      nj: [],
      yxid: [],
      zyid: [],
      kkyxid: [],
      kkjysid: [],
      kcxz: [],
      kclb: [],
      xslx: [],
      jxlid: [],
      jslx: [],
      ksxs: [],
      ksfs: [],
      zxxq: [],
      zdxq: [],
      xsqbkb: [],
      kklx: []
    });
    const defaults = ref({
      xnxq: "",
      xsqbkb: "0",
      kklx: []
    });
    const jcOptions = ref({
      jc: [],
      zc: []
    });
    const zyOptions = ref([]);
    const kkjysOptions = ref([]);
    const filters = ref({
      xnxq: "",
      xqid: "",
      nj: "",
      yxid: "",
      zyid: "",
      kkyxid: "",
      kkjysid: "",
      kcxz: "",
      kclb: "",
      xslx: "",
      kcmc: "",
      skjs: "",
      jxlid: "",
      jslx: "",
      ksxs: "",
      ksfs: "",
      jsmc: "",
      zxjc: "",
      zdjc: "",
      zxzc: "",
      zdzc: "",
      zxxq: "",
      zdxq: "",
      xsqbkb: "0",
      kklx: []
    });
    const pagination = ref({
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0
    });
    const results = ref([]);
    const pageSizes = [20, 50, 100];
    const disableWeekRange = computed(() => filters.value.xsqbkb === "1");
    const kklxOptions = computed(() => (options.value.kklx || []).filter((item) => item?.value !== ""));
    const FIELD_LABEL_KEYS = {
      kcmc: "schedule.global.field.kcmc",
      kcxz: "schedule.global.field.kcxz",
      kclb: "schedule.global.field.kclb",
      kkyxmc: "schedule.global.field.kkyxmc",
      xz: "schedule.global.field.xz",
      skjs: "schedule.global.field.skjs",
      sksjdd: "schedule.global.field.sksjdd",
      schooltime: "schedule.global.field.schooltime",
      skdd: "schedule.global.field.skdd",
      zongxs: "schedule.global.field.zongxs",
      llxs: "schedule.global.field.llxs",
      syxs: "schedule.global.field.syxs",
      shijianxs: "schedule.global.field.shijianxs",
      jxbmc: "schedule.global.field.jxbmc",
      jxbzc: "schedule.global.field.jxbzc",
      bjrs: "schedule.global.field.bjrs",
      zdskrnrs: "schedule.global.field.zdskrnrs",
      zymc: "schedule.global.field.zymc",
      rxnf: "schedule.global.field.rxnf",
      currentUserName: "schedule.global.field.currentUserName",
      currentDepartmentId: "schedule.global.field.currentDepartmentId",
      xnxq: "schedule.global.field.xnxq",
      dataXnxq: "schedule.global.field.dataXnxq",
      jxbid: "schedule.global.field.jxbid",
      tid: "schedule.global.field.tid",
      kcid: "schedule.global.field.kcid",
      dataAuth: "schedule.global.field.dataAuth",
      kkyxAuth: "schedule.global.field.kkyxAuth"
    };
    const DETAIL_SECTION_TITLES = {
      core: "schedule.global.section.core",
      teaching: "schedule.global.section.teaching",
      classMembers: "schedule.global.section.classMembers",
      system: "schedule.global.section.system"
    };
    const DETAIL_SECTIONS = [
      {
        titleKey: "core",
        keys: ["kcmc", "kcxz", "kclb", "kkyxmc", "xz"]
      },
      {
        titleKey: "teaching",
        keys: ["skjs", "sksjdd", "schooltime", "skdd", "zongxs", "llxs", "syxs", "shijianxs"]
      },
      {
        titleKey: "classMembers",
        keys: ["jxbmc", "jxbzc", "bjrs", "zdskrnrs", "zymc", "rxnf"]
      },
      {
        titleKey: "system",
        keys: ["currentUserName", "currentDepartmentId", "xnxq", "dataXnxq", "jxbid", "tid", "kcid", "dataAuth", "kkyxAuth"]
      }
    ];
    const decodeHtmlEntities = (text) => {
      if (!text || typeof text !== "string") return "";
      return text.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&");
    };
    const stripHtml = (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "";
      if (!/[<>]|&[a-z#0-9]+;/i.test(raw)) return raw;
      if (typeof window !== "undefined" && window?.document) {
        try {
          const div = window.document.createElement("div");
          div.innerHTML = raw;
          return String(div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
        } catch {
        }
      }
      return decodeHtmlEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    };
    const normalizeFieldValue = (value) => {
      if (value == null) return "";
      if (Array.isArray(value)) {
        return value.map((item) => stripHtml(item)).filter(Boolean).join("、");
      }
      if (typeof value === "object") {
        try {
          return JSON.stringify(value);
        } catch {
          return "";
        }
      }
      if (typeof value === "boolean") return value ? "true" : "false";
      return stripHtml(value);
    };
    const hasValue = (value) => String(value ?? "").trim() !== "";
    const getFieldLabel = (key) => t(FIELD_LABEL_KEYS[key] || key) || key;
    const getFieldValue = (row, key) => {
      if (!row || typeof row !== "object") return "";
      return normalizeFieldValue(row[key]);
    };
    const getCourseName = (row) => {
      const value = getFieldValue(row, "kcmc") || getFieldValue(row, "kcname") || getFieldValue(row, "courseName");
      return value || t("schedule.global.unknownCourse");
    };
    const getCredit = (row) => getFieldValue(row, "xz") || getFieldValue(row, "xf") || "-";
    const getTeacher = (row) => getFieldValue(row, "skjs") || getFieldValue(row, "jsmc") || "-";
    const getClassComposition = (row) => getFieldValue(row, "jxbzc") || "-";
    const adminClasses = computed(() => {
      const map = /* @__PURE__ */ new Map();
      for (const row of allResults.value) {
        const rawZc = stripHtml(row.jxbzc || "");
        if (!rawZc) continue;
        const classNames = rawZc.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean);
        for (const cn of classNames) {
          if (!map.has(cn)) {
            map.set(cn, { name: cn, courses: [], teachers: /* @__PURE__ */ new Set() });
          }
          const cls = map.get(cn);
          cls.courses.push(row);
          const teacher = stripHtml(row.skjs || "");
          if (teacher) cls.teachers.add(teacher);
        }
      }
      return [...map.values()].map((c) => ({
        ...c,
        teachers: [...c.teachers].join("、"),
        courseCount: c.courses.length
      })).sort((a, b) => {
        const countDiff = Number(b.courseCount || 0) - Number(a.courseCount || 0);
        if (countDiff !== 0) return countDiff;
        return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
      });
    });
    const filteredClasses = computed(() => {
      const kw = classSearchKeyword.value.trim().toLowerCase();
      if (!kw) return adminClasses.value;
      return adminClasses.value.filter(
        (c) => c.name.toLowerCase().includes(kw) || c.teachers.toLowerCase().includes(kw)
      );
    });
    const selectedClass = computed(() => {
      if (!selectedClassId.value) return null;
      return adminClasses.value.find((c) => c.name === selectedClassId.value) || null;
    });
    const classAllWeeks = computed(() => {
      const cls = selectedClass.value;
      if (!cls) return [];
      return collectWeeksFromRows(cls.courses);
    });
    const selectedWeek = ref(1);
    const classScheduleData = computed(() => {
      const cls = selectedClass.value;
      if (!cls) return {};
      const week = selectedWeek.value;
      const byDay = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
      const nameColorMap = /* @__PURE__ */ new Map();
      let colorIdx = 0;
      for (const row of cls.courses) {
        const kcmc = stripHtml(row.kcmc || t("schedule.global.unknownCourse"));
        const skjs = stripHtml(row.skjs || "");
        const segments = parseSksjdd(row.sksjdd || "");
        if (!nameColorMap.has(kcmc)) {
          nameColorMap.set(kcmc, colorIdx++ % courseThemes.length);
        }
        const ci = nameColorMap.get(kcmc);
        for (const seg of segments) {
          if (seg.weeks.length > 0 && !seg.weeks.includes(week)) continue;
          const span = seg.endNode - seg.startNode + 1;
          const detailRow = {
            ...row,
            kcmc,
            skjs,
            skdd: seg.room || row.skdd,
            schooltime: formatSegmentText(seg),
            sksjdd: formatSegmentText(seg)
          };
          byDay[seg.weekday]?.push({
            name: kcmc,
            teacher: skjs,
            room: seg.room,
            period: seg.startNode,
            djs: span,
            weeks: seg.weeks,
            colorIndex: ci,
            _detailRow: detailRow,
            _uid: `${kcmc}-${seg.weekday}-${seg.startNode}-${seg.endNode}`
          });
        }
      }
      for (let day = 1; day <= 7; day++) {
        byDay[day].sort((a, b) => a.period - b.period);
        const seen = /* @__PURE__ */ new Set();
        byDay[day] = byDay[day].filter((c) => {
          const key = `${c.name}|${c.teacher}|${c.period}|${c.djs}|${c.room}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      return byDay;
    });
    const getClassCourseStyle = (course) => {
      const start = Number(course.period) || 1;
      const span = Math.max(1, Number(course.djs) || 1);
      const theme = courseThemes[course.colorIndex || 0];
      return {
        "--course-bg": "var(--ui-surface, rgba(255, 255, 255, 0.92))",
        "--course-text": theme.text,
        "--course-border": theme.border,
        "--course-shadow": "0 6px 14px rgba(71, 85, 105, 0.16)",
        "--course-radius": "14px",
        gridRow: `${start} / span ${span}`,
        gridColumn: "1",
        zIndex: 1
      };
    };
    const fetchAllForClasses = async () => {
      loadingAll.value = true;
      try {
        const payload = {
          ...filters.value,
          kklx: Array.isArray(filters.value.kklx) ? filters.value.kklx : [],
          page: 1,
          page_size: 9999
        };
        const res = await axiosInstance.post(`${API_BASE}/v2/qxzkb/query`, payload);
        const data = res.data;
        if (data?.success === false) return;
        const rootCandidate = data.data;
        const root = rootCandidate && (Array.isArray(rootCandidate) || Array.isArray(rootCandidate.rows) || Array.isArray(rootCandidate.results) || Array.isArray(rootCandidate.list) || Array.isArray(rootCandidate.data)) ? rootCandidate : data;
        const rowCandidates = [root.rows, root.results, root.data, root.list, root.resultData];
        allResults.value = rowCandidates.find((item) => Array.isArray(item)) || (Array.isArray(root) ? root : []);
      } catch (err) {
      } finally {
        loadingAll.value = false;
      }
    };
    const selectClass = (cls) => {
      selectedClassId.value = cls.name;
      const weeks = collectWeeksFromRows(cls?.courses || []);
      selectedWeek.value = pickAutoWeek(weeks);
    };
    const backToClassList = () => {
      selectedClassId.value = null;
    };
    const prevWeek = () => {
      const weeks = classAllWeeks.value;
      const idx = weeks.indexOf(selectedWeek.value);
      if (idx > 0) selectedWeek.value = weeks[idx - 1];
    };
    const nextWeek = () => {
      const weeks = classAllWeeks.value;
      const idx = weeks.indexOf(selectedWeek.value);
      if (idx < weeks.length - 1) selectedWeek.value = weeks[idx + 1];
    };
    const touchStartX = ref(0);
    const handleTouchStart = (e) => {
      touchStartX.value = e.touches[0].clientX;
    };
    const handleTouchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX.value;
      if (Math.abs(dx) > 50) {
        if (dx > 0) prevWeek();
        else nextWeek();
      }
    };
    const openClassCourseDetail = (course) => {
      if (!course) return;
      openDetail(course._detailRow || course);
    };
    const normalizeOptions = (list) => {
      if (!Array.isArray(list)) return [];
      const mapped = list.map((item) => {
        if (item == null) return null;
        if (typeof item === "string" || typeof item === "number") {
          return { value: String(item), label: String(item) };
        }
        const value = item.value ?? item.id ?? item.dm ?? item.code ?? item.key ?? item.yxid ?? item.zyid ?? item.kkyxid ?? item.kkjysid ?? item.jc ?? item.zc ?? item.bh ?? "";
        const label = item.label ?? item.name ?? item.mc ?? item.text ?? item.jc ?? item.zc ?? item.zymc ?? item.kkjysmc ?? value;
        if (value === "" && label === "") return null;
        return { value: String(value), label: String(label || value) };
      }).filter(Boolean);
      const seen = /* @__PURE__ */ new Set();
      return mapped.filter((item) => {
        const key = String(item.value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const pickList = (payload, keys) => {
      if (!payload) return [];
      const root = payload.data ?? payload.resultData ?? payload;
      for (const key of keys) {
        const candidate = root?.[key] ?? payload?.[key];
        if (Array.isArray(candidate)) return candidate;
      }
      return [];
    };
    const fetchOptions = async () => {
      loadingOptions.value = true;
      try {
        const res = await axiosInstance.get(`${API_BASE}/v2/qxzkb/options`);
        const payload = res.data;
        if (payload?.success === false) {
          error.value = payload?.error || t("schedule.global.fetchOptionsFailed");
          return;
        }
        options.value = {
          ...options.value,
          ...payload.options || {}
        };
        defaults.value = payload.defaults || defaults.value;
        filters.value.xnxq = defaults.value.xnxq || filters.value.xnxq;
        filters.value.xsqbkb = defaults.value.xsqbkb ?? filters.value.xsqbkb;
        filters.value.kklx = Array.isArray(defaults.value.kklx) ? [...defaults.value.kklx] : [];
      } catch (err) {
        error.value = err.toString();
      } finally {
        loadingOptions.value = false;
      }
    };
    const applyProfileToFilters = (profile) => {
      if (!profile) return;
      const college = profile.college || profile.college_name || "";
      const grade = profile.grade || profile.grade_name || "";
      if (!filters.value.nj && grade) {
        const match = (options.value.nj || []).find((opt) => opt.value === grade || opt.label === grade || opt.label.includes(grade));
        if (match) {
          filters.value.nj = match.value;
        }
      }
      if (!filters.value.yxid && college) {
        const match = (options.value.yxid || []).find((opt) => {
          if (!opt?.label) return false;
          return opt.label === college || opt.label.includes(college) || college.includes(opt.label);
        });
        if (match) {
          filters.value.yxid = match.value;
        }
      }
    };
    const fetchUserProfile = async () => {
      if (!props.studentId) return;
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/student_info`, {
          student_id: props.studentId
        });
        const payload = res.data;
        if (payload?.success) {
          const profile = payload.data || payload.user || payload.info || {};
          applyProfileToFilters(profile);
        }
      } catch (err) {
      }
    };
    const fetchJcinfo = async () => {
      if (!filters.value.xnxq) return;
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/qxzkb/jcinfo`, { xnxq: filters.value.xnxq });
        const payload = res.data;
        if (payload?.success === false) return;
        const jcList = normalizeOptions(pickList(payload, ["jcList", "jc", "jcs", "jcInfo", "jcxx"]));
        const zcList = normalizeOptions(pickList(payload, ["zcList", "zc", "zcs", "zcInfo", "zcxx"]));
        jcOptions.value = { jc: jcList, zc: zcList };
      } catch (err) {
      }
    };
    const fetchZyxx = async () => {
      if (!filters.value.yxid || !filters.value.nj) {
        zyOptions.value = [];
        filters.value.zyid = "";
        return;
      }
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/qxzkb/zyxx`, {
          yxid: filters.value.yxid,
          nj: filters.value.nj
        });
        const payload = res.data;
        if (payload?.success === false) return;
        const root = payload.data ?? payload.resultData ?? payload;
        const list = Array.isArray(root) ? root : root.list || root.rows || root.data || [];
        zyOptions.value = normalizeOptions(list);
        if (zyOptions.value.length === 0) {
          filters.value.zyid = "";
        }
      } catch (err) {
        zyOptions.value = [];
      }
    };
    const fetchKkjys = async () => {
      if (!filters.value.kkyxid) {
        kkjysOptions.value = [];
        filters.value.kkjysid = "";
        return;
      }
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/qxzkb/kkjys`, {
          kkyxid: filters.value.kkyxid
        });
        const payload = res.data;
        if (payload?.success === false) return;
        const root = payload.data ?? payload.resultData ?? payload;
        const list = Array.isArray(root) ? root : root.list || root.rows || root.data || [];
        kkjysOptions.value = normalizeOptions(list);
        if (kkjysOptions.value.length === 0) {
          filters.value.kkjysid = "";
        }
      } catch (err) {
        kkjysOptions.value = [];
      }
    };
    const buildQueryPayload = (page) => ({
      ...filters.value,
      kklx: Array.isArray(filters.value.kklx) ? filters.value.kklx : [],
      page: toPositiveInt(page, 1),
      page_size: toPositiveInt(pagination.value.pageSize, 50)
    });
    const fetchList = async (page = 1) => {
      loading.value = true;
      error.value = "";
      try {
        const payload = buildQueryPayload(page);
        const res = await axiosInstance.post(`${API_BASE}/v2/qxzkb/query`, payload);
        const data = res.data;
        if (data?.success === false) {
          error.value = data.error || t("schedule.global.queryFailed");
          return;
        }
        offline.value = !!data.offline;
        syncTime.value = data.sync_time || "";
        const rootCandidate = data.data;
        const root = rootCandidate && (Array.isArray(rootCandidate) || Array.isArray(rootCandidate.rows) || Array.isArray(rootCandidate.results) || Array.isArray(rootCandidate.list) || Array.isArray(rootCandidate.data)) ? rootCandidate : data;
        const rowCandidates = [root.rows, root.results, root.data, root.list, root.resultData];
        const rowList = rowCandidates.find((item) => Array.isArray(item)) || (Array.isArray(root) ? root : []);
        results.value = rowList;
        const totalRecords = root.records || root.totalRecords || (root.totalPages ? root.total : null) || results.value.length;
        const totalPages = root.totalPages || (root.total && !root.totalPages ? root.total : Math.ceil(totalRecords / pagination.value.pageSize));
        pagination.value.page = root.page || page;
        pagination.value.total = totalRecords;
        pagination.value.totalPages = totalPages || 1;
      } catch (err) {
        error.value = err.toString();
      } finally {
        loading.value = false;
      }
    };
    const handleSearch = () => {
      if (!filters.value.xnxq) {
        error.value = t("schedule.global.semesterRequired");
        return;
      }
      selectedClassId.value = null;
      activeTab.value = "courses";
      allResults.value = [];
      fetchList(1);
      if (!showAdvanced.value) {
        fetchAllForClasses();
      }
    };
    const handleReset = () => {
      filters.value = {
        ...filters.value,
        xnxq: defaults.value.xnxq || "",
        xqid: "",
        nj: "",
        yxid: "",
        zyid: "",
        kkyxid: "",
        kkjysid: "",
        kcxz: "",
        kclb: "",
        xslx: "",
        kcmc: "",
        skjs: "",
        jxlid: "",
        jslx: "",
        ksxs: "",
        ksfs: "",
        jsmc: "",
        zxjc: "",
        zdjc: "",
        zxzc: "",
        zdzc: "",
        zxxq: "",
        zdxq: "",
        xsqbkb: defaults.value.xsqbkb ?? "0",
        kklx: Array.isArray(defaults.value.kklx) ? [...defaults.value.kklx] : []
      };
      zyOptions.value = [];
      kkjysOptions.value = [];
    };
    const changePage = (next) => {
      if (next < 1 || next > pagination.value.totalPages) return;
      fetchList(next);
    };
    const handlePageSizeChange = () => {
      pagination.value.pageSize = toPositiveInt(pagination.value.pageSize, 50);
      pagination.value.page = 1;
      fetchList(1);
    };
    const openDetail = (row) => {
      selectedRow.value = row;
      showDetail.value = true;
    };
    const closeDetail = () => {
      showDetail.value = false;
      selectedRow.value = null;
    };
    const detailTitle = computed(() => getCourseName(selectedRow.value));
    const selectedSections = computed(() => {
      const row = selectedRow.value;
      if (!row || typeof row !== "object") return [];
      return DETAIL_SECTIONS.map((section) => {
        const items = section.keys.map((key) => ({
          key,
          label: getFieldLabel(key),
          value: getFieldValue(row, key)
        })).filter((item) => hasValue(item.value));
        return { title: t(DETAIL_SECTION_TITLES[section.titleKey]), items };
      }).filter((section) => section.items.length > 0);
    });
    watch(() => filters.value.xnxq, () => fetchJcinfo());
    watch([() => filters.value.yxid, () => filters.value.nj], () => fetchZyxx());
    watch(() => filters.value.kkyxid, () => fetchKkjys());
    watch(classAllWeeks, (weeks) => {
      if (!selectedClassId.value) return;
      const normalizedWeeks = Array.isArray(weeks) ? weeks : [];
      const current = toPositiveInt(selectedWeek.value, 0);
      if (!normalizedWeeks.length) {
        selectedWeek.value = 1;
        return;
      }
      if (!normalizedWeeks.includes(current)) {
        selectedWeek.value = pickAutoWeek(normalizedWeeks);
      }
    });
    onMounted(async () => {
      await fetchOptions();
      await fetchUserProfile();
      await fetchJcinfo();
      if (filters.value.yxid && filters.value.nj) {
        await fetchZyxx();
      }
      if (filters.value.kkyxid) {
        await fetchKkjys();
      }
      if (filters.value.xnxq) {
        await fetchList(1);
        if (!showAdvanced.value) {
          fetchAllForClasses();
        }
      }
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          icon: "calendar_month",
          title: unref(t)("schedule.global.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, toDisplayString(unref(t)("schedule.view.offlineUpdatedAt").replace("{t}", unref(formatRelativeTime)(syncTime.value))), 1)) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_3, [
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("div", _hoisted_6, toDisplayString(unref(t)("schedule.global.filterTitle")), 1),
              createBaseVNode("div", _hoisted_7, [
                createBaseVNode("button", {
                  class: "ghost-btn",
                  onClick: handleReset
                }, toDisplayString(unref(t)("schedule.global.reset")), 1),
                createBaseVNode("button", {
                  class: "ghost-btn",
                  onClick: _cache[1] || (_cache[1] = ($event) => showAdvanced.value = !showAdvanced.value)
                }, toDisplayString(showAdvanced.value ? unref(t)("schedule.global.collapseAdvanced") : unref(t)("schedule.global.expandAdvanced")), 1),
                createBaseVNode("button", {
                  class: "primary-btn",
                  onClick: handleSearch,
                  disabled: loading.value
                }, toDisplayString(loading.value ? unref(t)("schedule.global.searching") : unref(t)("schedule.global.search")), 9, _hoisted_8)
              ])
            ]),
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.xnxq")) + " *", 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.xnxq,
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => filters.value.xnxq = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_11, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.xnxq, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value,
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_12);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_13, [
                createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.nj")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.nj,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => filters.value.nj = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_14, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.nj, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value,
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_15);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_16, [
                createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.yxmc")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.yxid,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => filters.value.yxid = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_17, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.yxid, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value,
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_18);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_19, [
                createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.zymc")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: filters.value.zyid,
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => filters.value.zyid = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_20, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(zyOptions.value, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value,
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_21);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_22, [
                createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.kcmc")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => filters.value.kcmc = $event),
                  class: "text-input",
                  placeholder: unref(t)("schedule.global.fuzzyMatchHint")
                }, null, 8, _hoisted_23), [
                  [vModelText, filters.value.kcmc]
                ])
              ]),
              createBaseVNode("div", _hoisted_24, [
                createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.skjs")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => filters.value.skjs = $event),
                  class: "text-input",
                  placeholder: unref(t)("schedule.global.teacherNameHint")
                }, null, 8, _hoisted_25), [
                  [vModelText, filters.value.skjs]
                ])
              ])
            ]),
            showAdvanced.value ? (openBlock(), createElementBlock("div", _hoisted_26, [
              createBaseVNode("div", _hoisted_27, [
                createBaseVNode("div", _hoisted_28, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.xqid")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.xqid,
                    "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => filters.value.xqid = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_29, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.xqid, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_30);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_31, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.kkyxmc")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.kkyxid,
                    "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => filters.value.kkyxid = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_32, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kkyxid, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_33);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_34, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.jys")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.kkjysid,
                    "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => filters.value.kkjysid = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_35, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(kkjysOptions.value, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_36);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_37, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.kcxz")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.kcxz,
                    "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => filters.value.kcxz = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_38, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kcxz, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_39);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_40, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.kclb")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.kclb,
                    "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => filters.value.kclb = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_41, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.kclb, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_42);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_43, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.xslx")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.xslx,
                    "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => filters.value.xslx = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_44, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.xslx, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_45);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_46, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.jxl")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.jxlid,
                    "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => filters.value.jxlid = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_47, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.jxlid, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_48);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_49, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.jslx")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.jslx,
                    "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => filters.value.jslx = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_50, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.jslx, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_51);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_52, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.ksxs")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.ksxs,
                    "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => filters.value.ksxs = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_53, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.ksxs, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_54);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_55, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.ksfs")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.ksfs,
                    "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => filters.value.ksfs = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_56, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.ksfs, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_57);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_58, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.field.jsmc")), 1),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => filters.value.jsmc = $event),
                    class: "text-input",
                    placeholder: unref(t)("schedule.global.field.jsmc")
                  }, null, 8, _hoisted_59), [
                    [vModelText, filters.value.jsmc]
                  ])
                ])
              ]),
              createBaseVNode("div", _hoisted_60, [
                createBaseVNode("div", _hoisted_61, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.minPeriod")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.zxjc,
                    "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => filters.value.zxjc = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_62, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(jcOptions.value.jc, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_63);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_64, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.maxPeriod")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.zdjc,
                    "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => filters.value.zdjc = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_65, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(jcOptions.value.jc, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_66);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_67, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.startWeek")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.zxzc,
                    "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => filters.value.zxzc = $event),
                    class: "modern-select",
                    disabled: disableWeekRange.value
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_68, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(jcOptions.value.zc, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_69);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue", "disabled"])
                ]),
                createBaseVNode("div", _hoisted_70, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.endWeek")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.zdzc,
                    "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => filters.value.zdzc = $event),
                    class: "modern-select",
                    disabled: disableWeekRange.value
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_71, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(jcOptions.value.zc, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_72);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue", "disabled"])
                ]),
                createBaseVNode("div", _hoisted_73, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.startDay")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.zxxq,
                    "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => filters.value.zxxq = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_74, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.zxxq, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_75);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_76, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.endDay")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.zdxq,
                    "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => filters.value.zdxq = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      createBaseVNode("option", _hoisted_77, toDisplayString(unref(t)("schedule.global.pleaseSelect")), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.zdxq, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_78);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ]),
                createBaseVNode("div", _hoisted_79, [
                  createBaseVNode("label", null, toDisplayString(unref(t)("schedule.global.showEmpty")), 1),
                  createVNode(_component_IOSSelect, {
                    modelValue: filters.value.xsqbkb,
                    "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => filters.value.xsqbkb = $event),
                    class: "modern-select"
                  }, {
                    default: withCtx(() => [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(options.value.xsqbkb, (item) => {
                        return openBlock(), createElementBlock("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label), 9, _hoisted_80);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue"])
                ])
              ]),
              createBaseVNode("div", _hoisted_81, [
                createBaseVNode("div", _hoisted_82, toDisplayString(unref(t)("schedule.global.kklxTitle")), 1),
                createBaseVNode("div", _hoisted_83, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(kklxOptions.value, (item) => {
                    return openBlock(), createElementBlock("label", {
                      key: item.value,
                      class: "kklx-chip"
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "checkbox",
                        value: item.value,
                        "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => filters.value.kklx = $event)
                      }, null, 8, _hoisted_84), [
                        [vModelCheckbox, filters.value.kklx]
                      ]),
                      createBaseVNode("span", null, toDisplayString(item.label), 1)
                    ]);
                  }), 128))
                ])
              ])
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_85, [
              createBaseVNode("div", _hoisted_86, toDisplayString(unref(tf)("schedule.global.pageInfo", { total: pagination.value.total || 0, page: pagination.value.page })), 1),
              createBaseVNode("div", _hoisted_87, [
                createBaseVNode("button", {
                  class: "ghost-btn",
                  onClick: _cache[27] || (_cache[27] = ($event) => changePage(pagination.value.page - 1)),
                  disabled: pagination.value.page <= 1
                }, toDisplayString(unref(t)("schedule.global.prevPage")), 9, _hoisted_88),
                createBaseVNode("button", {
                  class: "ghost-btn",
                  onClick: _cache[28] || (_cache[28] = ($event) => changePage(pagination.value.page + 1)),
                  disabled: pagination.value.page >= pagination.value.totalPages
                }, toDisplayString(unref(t)("schedule.global.nextPage")), 9, _hoisted_89),
                createVNode(_component_IOSSelect, {
                  modelValue: pagination.value.pageSize,
                  "onUpdate:modelValue": _cache[29] || (_cache[29] = ($event) => pagination.value.pageSize = $event),
                  class: "modern-select compact-select",
                  onChange: handlePageSizeChange
                }, {
                  default: withCtx(() => [
                    (openBlock(), createElementBlock(Fragment, null, renderList(pageSizes, (size) => {
                      return createBaseVNode("option", {
                        key: size,
                        value: size
                      }, toDisplayString(unref(tf)("schedule.global.perPage", { n: size })), 9, _hoisted_90);
                    }), 64))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ])
            ])
          ]),
          error.value ? (openBlock(), createElementBlock("div", _hoisted_91, toDisplayString(error.value), 1)) : createCommentVNode("", true),
          !showAdvanced.value && results.value.length > 0 && !loading.value ? (openBlock(), createElementBlock("div", _hoisted_92, [
            createBaseVNode("button", {
              class: normalizeClass(["tab-btn", { active: activeTab.value === "courses" }]),
              onClick: _cache[30] || (_cache[30] = ($event) => {
                activeTab.value = "courses";
                selectedClassId.value = null;
              })
            }, toDisplayString(unref(t)("schedule.global.tabCourses")), 3),
            createBaseVNode("button", {
              class: normalizeClass(["tab-btn", { active: activeTab.value === "classes" }]),
              onClick: _cache[31] || (_cache[31] = ($event) => {
                activeTab.value = "classes";
                selectedClassId.value = null;
              })
            }, [
              createTextVNode(toDisplayString(unref(t)("schedule.global.tabClasses")) + " ", 1),
              loadingAll.value ? (openBlock(), createElementBlock("span", _hoisted_93, "⏳")) : adminClasses.value.length ? (openBlock(), createElementBlock("span", _hoisted_94, toDisplayString(adminClasses.value.length), 1)) : createCommentVNode("", true)
            ], 2)
          ])) : createCommentVNode("", true),
          loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "loading"
          })) : activeTab.value === "courses" || showAdvanced.value ? (openBlock(), createElementBlock("div", _hoisted_95, [
            results.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              message: unref(t)("schedule.global.noScheduleData")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(results.value, (row, idx) => {
              return openBlock(), createElementBlock("button", {
                key: row.jxbid || row.jxbmc || idx,
                class: "result-card",
                type: "button",
                onClick: ($event) => openDetail(row)
              }, [
                createBaseVNode("div", _hoisted_97, toDisplayString(getCourseName(row)), 1),
                createBaseVNode("div", _hoisted_98, [
                  createBaseVNode("div", _hoisted_99, [
                    createBaseVNode("span", _hoisted_100, toDisplayString(unref(t)("schedule.global.field.xz")), 1),
                    createBaseVNode("span", _hoisted_101, toDisplayString(getCredit(row)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_102, [
                    createBaseVNode("span", _hoisted_103, toDisplayString(unref(t)("schedule.global.field.skjs")), 1),
                    createBaseVNode("span", _hoisted_104, toDisplayString(getTeacher(row)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_105, [
                    createBaseVNode("span", _hoisted_106, toDisplayString(unref(t)("schedule.global.field.jxbzc")), 1),
                    createBaseVNode("span", _hoisted_107, toDisplayString(getClassComposition(row)), 1)
                  ])
                ])
              ], 8, _hoisted_96);
            }), 128))
          ])) : activeTab.value === "classes" && !selectedClassId.value ? (openBlock(), createElementBlock("div", _hoisted_108, [
            loadingAll.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading"
            })) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createBaseVNode("div", _hoisted_109, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => classSearchKeyword.value = $event),
                  class: "text-input",
                  placeholder: unref(t)("schedule.global.classSearchHint")
                }, null, 8, _hoisted_110), [
                  [vModelText, classSearchKeyword.value]
                ])
              ]),
              filteredClasses.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                message: unref(t)("schedule.global.noClassMatched")
              }, null, 8, ["message"])) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_111, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(filteredClasses.value, (cls) => {
                  return openBlock(), createElementBlock("button", {
                    key: cls.name,
                    class: "class-card",
                    type: "button",
                    onClick: ($event) => selectClass(cls)
                  }, [
                    createBaseVNode("div", _hoisted_113, toDisplayString(cls.name), 1),
                    createBaseVNode("div", _hoisted_114, [
                      createBaseVNode("span", null, toDisplayString(unref(tf)("schedule.global.courseCount", { n: cls.courseCount })), 1)
                    ]),
                    cls.teachers ? (openBlock(), createElementBlock("div", _hoisted_115, toDisplayString(cls.teachers), 1)) : createCommentVNode("", true)
                  ], 8, _hoisted_112);
                }), 128))
              ])
            ], 64))
          ])) : activeTab.value === "classes" && selectedClassId.value && selectedClass.value ? (openBlock(), createElementBlock("div", _hoisted_116, [
            createBaseVNode("div", _hoisted_117, [
              createBaseVNode("button", {
                class: "ghost-btn",
                onClick: backToClassList
              }, "← " + toDisplayString(unref(t)("schedule.global.backToList")), 1),
              createBaseVNode("div", _hoisted_118, toDisplayString(selectedClass.value.name), 1)
            ]),
            classAllWeeks.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_119, [
              createBaseVNode("button", {
                class: "week-btn",
                disabled: classAllWeeks.value.indexOf(selectedWeek.value) <= 0,
                onClick: prevWeek
              }, "‹", 8, _hoisted_120),
              createBaseVNode("div", _hoisted_121, toDisplayString(unref(tf)("schedule.weekPicker.cell", { n: selectedWeek.value })), 1),
              createBaseVNode("button", {
                class: "week-btn",
                disabled: classAllWeeks.value.indexOf(selectedWeek.value) >= classAllWeeks.value.length - 1,
                onClick: nextWeek
              }, "›", 8, _hoisted_122)
            ])) : createCommentVNode("", true),
            createBaseVNode("div", {
              class: "schedule-grid-wrapper",
              onTouchstart: handleTouchStart,
              onTouchend: handleTouchEnd
            }, [
              createBaseVNode("div", _hoisted_123, [
                _cache[34] || (_cache[34] = createBaseVNode("div", { class: "schedule-corner" }, null, -1)),
                createBaseVNode("div", _hoisted_124, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(7, (d) => {
                    return createBaseVNode("div", {
                      key: d,
                      class: "schedule-day-label"
                    }, toDisplayString(getDayLabelText(d)), 1);
                  }), 64))
                ])
              ]),
              createBaseVNode("div", _hoisted_125, [
                createBaseVNode("div", _hoisted_126, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(timeSchedule, (t2) => {
                    return createBaseVNode("div", {
                      key: t2.p,
                      class: "schedule-time-slot"
                    }, [
                      createBaseVNode("span", _hoisted_127, toDisplayString(t2.start), 1),
                      createBaseVNode("span", _hoisted_128, toDisplayString(t2.p), 1),
                      createBaseVNode("span", _hoisted_129, toDisplayString(t2.end), 1)
                    ]);
                  }), 64))
                ]),
                createBaseVNode("div", _hoisted_130, [
                  createBaseVNode("div", _hoisted_131, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(11, (i) => {
                      return createBaseVNode("div", {
                        key: i,
                        class: "schedule-line-row"
                      });
                    }), 64))
                  ]),
                  (openBlock(), createElementBlock(Fragment, null, renderList(7, (day) => {
                    return createBaseVNode("div", {
                      key: day,
                      class: "schedule-day-column"
                    }, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(classScheduleData.value[day] || [], (course) => {
                        return openBlock(), createElementBlock("div", {
                          key: course._uid,
                          class: "schedule-course-card",
                          style: normalizeStyle(getClassCourseStyle(course)),
                          onClick: ($event) => openClassCourseDetail(course)
                        }, [
                          createBaseVNode("div", _hoisted_133, toDisplayString(course.name), 1),
                          createBaseVNode("div", _hoisted_134, toDisplayString(course.room || ""), 1),
                          course.teacher ? (openBlock(), createElementBlock("div", _hoisted_135, toDisplayString(course.teacher), 1)) : createCommentVNode("", true)
                        ], 12, _hoisted_132);
                      }), 128))
                    ]);
                  }), 64))
                ])
              ])
            ], 32)
          ])) : createCommentVNode("", true)
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showDetail.value && selectedRow.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "modal-overlay",
            onClick: closeDetail
          }, [
            createBaseVNode("div", {
              class: "modal-content",
              onClick: _cache[33] || (_cache[33] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("button", {
                class: "modal-close",
                onClick: closeDetail
              }, "×"),
              createBaseVNode("div", _hoisted_136, toDisplayString(detailTitle.value), 1),
              selectedSections.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 0,
                message: unref(t)("schedule.global.noDetailFields")
              }, null, 8, ["message"])) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList(selectedSections.value, (section) => {
                return openBlock(), createElementBlock("div", {
                  key: section.title,
                  class: "detail-section"
                }, [
                  createBaseVNode("h3", null, toDisplayString(section.title), 1),
                  createBaseVNode("div", _hoisted_137, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(section.items, (item) => {
                      return openBlock(), createElementBlock("div", {
                        key: `${section.title}-${item.key}`,
                        class: "detail-item"
                      }, [
                        createBaseVNode("span", _hoisted_138, toDisplayString(item.label), 1),
                        createBaseVNode("span", _hoisted_139, toDisplayString(item.value), 1)
                      ]);
                    }), 128))
                  ])
                ]);
              }), 128))
            ])
          ])) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const GlobalScheduleView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-d0d4dee2"]]);
export {
  GlobalScheduleView as default
};
