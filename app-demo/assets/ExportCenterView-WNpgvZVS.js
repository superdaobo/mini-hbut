const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-apFQ0nCw.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { b as isTauriRuntime, c as isCapacitorRuntime, _ as __vitePreload, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { o as onMounted, e as computed, a as ref, c as createElementBlock, b as openBlock, d as createBaseVNode, y as createStaticVNode, f as createCommentVNode, t as toDisplayString, F as Fragment, i as renderList, n as normalizeClass, C as withDirectives, H as vModelCheckbox, g as createTextVNode, z as nextTick } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, f as fetchWithCache, a as axiosInstance, n as normalizeSemesterList, h as resolveCurrentSemester } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { b as blobToDataUrl, w as waitForCaptureReady, r as renderElementToCanvas } from "./capture-DZL0crXj.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
const _hoisted_1 = { class: "export-view" };
const _hoisted_2 = { class: "export-page-header" };
const _hoisted_3 = { class: "export-main" };
const _hoisted_4 = { class: "config-card" };
const _hoisted_5 = { class: "card-title-row" };
const _hoisted_6 = { class: "semester-hint" };
const _hoisted_7 = {
  key: 0,
  class: "hint-line"
};
const _hoisted_8 = {
  key: 1,
  class: "hint-line warn"
};
const _hoisted_9 = {
  key: 2,
  class: "semester-grid"
};
const _hoisted_10 = ["disabled", "checked", "onChange"];
const _hoisted_11 = {
  key: 0,
  class: "config-card"
};
const _hoisted_12 = { class: "inline-switch" };
const _hoisted_13 = {
  key: 1,
  class: "config-card"
};
const _hoisted_14 = { class: "card-title-row" };
const _hoisted_15 = { class: "semester-hint" };
const _hoisted_16 = { class: "month-grid" };
const _hoisted_17 = ["checked", "onChange"];
const _hoisted_18 = { class: "export-module-grid" };
const _hoisted_19 = ["checked", "onChange"];
const _hoisted_20 = { class: "export-module-icon" };
const _hoisted_21 = { class: "export-module-name" };
const _hoisted_22 = {
  key: 0,
  class: "export-semester-tag"
};
const _hoisted_23 = { class: "actions-card" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = ["disabled"];
const _hoisted_26 = ["disabled"];
const _hoisted_27 = {
  key: 2,
  class: "export-feedback export-feedback--error"
};
const _hoisted_28 = { class: "export-feedback__title" };
const _hoisted_29 = {
  key: 3,
  class: "export-feedback export-feedback--success"
};
const _hoisted_30 = { class: "export-feedback__title" };
const _hoisted_31 = {
  key: 0,
  class: "export-feedback__path"
};
const _hoisted_32 = {
  key: 1,
  class: "export-feedback__hint"
};
const _hoisted_33 = {
  key: 4,
  class: "preview-wrap"
};
const _hoisted_34 = { class: "preview-header" };
const _hoisted_35 = { key: 0 };
const _hoisted_36 = { class: "preview-summary" };
const _hoisted_37 = { class: "preview-module-header" };
const _hoisted_38 = {
  key: 0,
  class: "module-empty"
};
const _hoisted_39 = {
  key: 1,
  class: "module-empty error"
};
const _hoisted_40 = {
  key: 0,
  class: "module-block"
};
const _hoisted_41 = { class: "module-kv" };
const _hoisted_42 = { class: "detail-table" };
const _hoisted_43 = { key: 0 };
const _hoisted_44 = {
  key: 1,
  class: "module-block"
};
const _hoisted_45 = {
  key: 0,
  class: "warn-text"
};
const _hoisted_46 = {
  key: 1,
  class: "module-kv-grid"
};
const _hoisted_47 = { class: "module-kv" };
const _hoisted_48 = { class: "module-kv" };
const _hoisted_49 = { class: "module-kv" };
const _hoisted_50 = { class: "module-kv" };
const _hoisted_51 = {
  key: 2,
  class: "module-block"
};
const _hoisted_52 = { class: "detail-table" };
const _hoisted_53 = { key: 0 };
const _hoisted_54 = {
  key: 3,
  class: "module-block"
};
const _hoisted_55 = {
  key: 0,
  class: "warn-text"
};
const _hoisted_56 = {
  key: 1,
  class: "detail-table"
};
const _hoisted_57 = { key: 0 };
const _hoisted_58 = {
  key: 4,
  class: "module-block"
};
const _hoisted_59 = {
  key: 0,
  class: "warn-text"
};
const _hoisted_60 = {
  key: 1,
  class: "detail-table"
};
const _hoisted_61 = { key: 0 };
const _hoisted_62 = {
  key: 5,
  class: "module-block module-kv-grid"
};
const _hoisted_63 = {
  key: 6,
  class: "module-block"
};
const _hoisted_64 = { class: "module-kv-grid" };
const _hoisted_65 = { class: "hint-line" };
const _hoisted_66 = {
  key: 7,
  class: "module-block"
};
const _hoisted_67 = { class: "module-kv" };
const _hoisted_68 = { class: "detail-table" };
const _hoisted_69 = { key: 0 };
const _hoisted_70 = {
  key: 8,
  class: "module-block"
};
const _hoisted_71 = { class: "module-kv" };
const _hoisted_72 = {
  key: 0,
  class: "warn-text"
};
const _hoisted_73 = {
  key: 1,
  class: "detail-table"
};
const _hoisted_74 = { key: 0 };
const _hoisted_75 = {
  key: 9,
  class: "module-block"
};
const _hoisted_76 = {
  key: 0,
  class: "warn-text"
};
const _hoisted_77 = { class: "hint-line" };
const _hoisted_78 = { class: "module-kv-grid" };
const _hoisted_79 = { class: "module-kv" };
const _hoisted_80 = { class: "module-kv" };
const _hoisted_81 = { class: "module-kv" };
const _hoisted_82 = { class: "module-kv" };
const _hoisted_83 = {
  key: 10,
  class: "module-block"
};
const _hoisted_84 = {
  key: 0,
  class: "warn-text"
};
const _hoisted_85 = { class: "hint-line" };
const _hoisted_86 = { class: "classroom-grid" };
const _hoisted_87 = {
  key: 11,
  class: "module-block"
};
const _hoisted_88 = {
  key: 0,
  class: "warn-text"
};
const _hoisted_89 = { class: "hint-line" };
const _hoisted_90 = { class: "module-kv-grid" };
const _hoisted_91 = { class: "module-kv" };
const _hoisted_92 = { class: "detail-table" };
const _hoisted_93 = { key: 0 };
const _hoisted_94 = {
  key: 12,
  class: "module-block"
};
const _hoisted_95 = { class: "cache-preview" };
const _sfc_main = {
  __name: "ExportCenterView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const API_BASE = "/api";
    const isNative = isTauriRuntime();
    const isCapacitor = isCapacitorRuntime();
    const periodTimeMap = {
      1: { start: "08:20", end: "09:05" },
      2: { start: "09:10", end: "09:55" },
      3: { start: "10:15", end: "11:00" },
      4: { start: "11:05", end: "11:50" },
      5: { start: "14:00", end: "14:45" },
      6: { start: "14:50", end: "15:35" },
      7: { start: "15:55", end: "16:40" },
      8: { start: "16:45", end: "17:30" },
      9: { start: "18:30", end: "19:15" },
      10: { start: "19:20", end: "20:05" },
      11: { start: "20:10", end: "20:55" }
    };
    const weekdayText = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const moduleGroups = [
      {
        id: "academic",
        title: "学业类",
        modules: [
          { id: "grades", name: "成绩查询", icon: "📊", semesterAware: true },
          { id: "ranking", name: "绩点排名", icon: "🏆", semesterAware: true },
          { id: "schedule", name: "课表", icon: "📅", semesterAware: true },
          { id: "exams", name: "考试安排", icon: "📝", semesterAware: true },
          { id: "calendar", name: "校历", icon: "📘", semesterAware: true },
          { id: "academic_progress", name: "学业完成情况", icon: "🎓", semesterAware: false },
          { id: "training_plan", name: "培养方案", icon: "📚", semesterAware: false }
        ]
      },
      {
        id: "basic",
        title: "基础信息",
        modules: [
          { id: "student_info", name: "个人信息", icon: "👤", semesterAware: false }
        ]
      },
      {
        id: "life",
        title: "生活类",
        modules: [
          { id: "classroom", name: "空教室（缓存）", icon: "🏫", semesterAware: false },
          { id: "electricity", name: "电费（缓存）", icon: "⚡", semesterAware: false },
          { id: "transactions", name: "交易记录", icon: "💰", semesterAware: false },
          { id: "campus_map", name: "校园地图（缓存）", icon: "🗺️", semesterAware: false }
        ]
      }
    ];
    const moduleMap = computed(() => {
      const out = /* @__PURE__ */ new Map();
      moduleGroups.forEach((group) => {
        group.modules.forEach((mod) => out.set(mod.id, mod));
      });
      return out;
    });
    const defaultSelected = ["grades", "ranking", "schedule", "calendar", "student_info"];
    const selectedModules = ref([...defaultSelected]);
    const semesters = ref([]);
    const currentSemester = ref("");
    const selectedSemesters = ref([]);
    const rankingIncludeAll = ref(true);
    const selectedTransactionMonths = ref([]);
    const loadingSemesters = ref(false);
    const preparing = ref(false);
    const exporting = ref(false);
    const exportError = ref("");
    const exportSuccess = ref("");
    const exportSuccessPath = ref("");
    const exportSuccessHint = ref("");
    const previewRef = ref(null);
    const exportPayload = ref(null);
    const lastSyncTime = ref("");
    const requiresSemester = computed(
      () => selectedModules.value.some((id) => moduleMap.value.get(id)?.semesterAware)
    );
    const effectiveSemesters = computed(() => {
      const normalized = normalizeSemesterList(selectedSemesters.value);
      if (normalized.length) return normalized;
      if (currentSemester.value) return [currentSemester.value];
      if (semesters.value.length) return [semesters.value[0]];
      return [];
    });
    const selectedModuleMetas = computed(
      () => selectedModules.value.map((id) => moduleMap.value.get(id)).filter(Boolean)
    );
    const studentInfoFieldMap = {
      name: "姓名",
      student_id: "学号",
      class_name: "班级",
      college: "学院",
      major: "专业",
      grade: "年级",
      gender: "性别",
      ethnicity: "民族",
      id_card: "身份证号",
      id_number: "身份证号"
    };
    const studentInfoFieldOrder = [
      "name",
      "student_id",
      "class_name",
      "college",
      "major",
      "grade",
      "gender",
      "ethnicity",
      "id_card",
      "id_number"
    ];
    const transactionMonthOptions = computed(() => {
      const now = /* @__PURE__ */ new Date();
      const list = [];
      for (let i = 0; i < 12; i += 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        list.push({
          value: `${year}-${month}`,
          label: `${year}/${month}`
        });
      }
      return list;
    });
    const readCacheEntry = (matcher) => {
      let latest = null;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("cache:")) continue;
        if (!matcher(key)) continue;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || "{}");
          const timestamp = Number(parsed?.timestamp || 0);
          if (!latest || timestamp > latest.timestamp) {
            latest = { key, timestamp, data: parsed?.data };
          }
        } catch {
        }
      }
      return latest;
    };
    const clearExportSuccess = () => {
      exportSuccess.value = "";
      exportSuccessPath.value = "";
      exportSuccessHint.value = "";
    };
    const setExportSuccess = (message, { path = "", hint = "" } = {}) => {
      exportSuccess.value = String(message || "").trim();
      exportSuccessPath.value = String(path || "").trim();
      exportSuccessHint.value = String(hint || "").trim();
    };
    const ensureModuleSelected = () => {
      if (selectedModules.value.length === 0) {
        selectedModules.value = [...defaultSelected];
      }
    };
    const safeText = (value) => {
      if (value === null || value === void 0 || value === "") return "-";
      return String(value);
    };
    const toggleModule = (moduleId) => {
      const idx = selectedModules.value.indexOf(moduleId);
      if (idx >= 0) {
        selectedModules.value.splice(idx, 1);
      } else {
        selectedModules.value.push(moduleId);
      }
      ensureModuleSelected();
    };
    const toggleSemester = (semester) => {
      const idx = selectedSemesters.value.indexOf(semester);
      if (idx >= 0) {
        selectedSemesters.value.splice(idx, 1);
      } else {
        selectedSemesters.value.push(semester);
      }
      selectedSemesters.value = normalizeSemesterList(selectedSemesters.value);
    };
    const semesterChecked = (semester) => selectedSemesters.value.includes(semester);
    const toggleTransactionMonth = (monthValue) => {
      const idx = selectedTransactionMonths.value.indexOf(monthValue);
      if (idx >= 0) {
        selectedTransactionMonths.value.splice(idx, 1);
      } else {
        selectedTransactionMonths.value.push(monthValue);
      }
      if (selectedTransactionMonths.value.length === 0 && transactionMonthOptions.value.length) {
        selectedTransactionMonths.value = [transactionMonthOptions.value[0].value];
      }
    };
    const monthChecked = (monthValue) => selectedTransactionMonths.value.includes(monthValue);
    const semesterHint = computed(() => {
      if (!requiresSemester.value) return "当前已选模块无需学期过滤。";
      if (!effectiveSemesters.value.length) return "暂无可用学期，请先登录并同步数据。";
      return `已选择 ${effectiveSemesters.value.length} 个学期`;
    });
    const transactionHint = computed(() => {
      if (!selectedModules.value.includes("transactions")) return "未选择交易记录模块。";
      return `交易记录将导出 ${selectedTransactionMonths.value.length} 个月份`;
    });
    const formatScore = (value) => {
      if (value === null || value === void 0 || value === "") return "-";
      return String(value);
    };
    const sortCourses = (list) => {
      const arr = Array.isArray(list) ? [...list] : [];
      arr.sort((a, b) => {
        const dayDiff = Number(a.weekday || 0) - Number(b.weekday || 0);
        if (dayDiff !== 0) return dayDiff;
        return Number(a.period || 0) - Number(b.period || 0);
      });
      return arr;
    };
    const formatPeriod = (course) => {
      const start = Number(course.period || 0);
      if (!Number.isFinite(start) || start <= 0) return "-";
      const len = Number(course.duration || 1);
      const end = start + Math.max(1, len) - 1;
      const startText = periodTimeMap[start]?.start || "";
      const endText = periodTimeMap[end]?.end || "";
      return `${start}-${end}${startText && endText ? ` (${startText}-${endText})` : ""}`;
    };
    const formatWeekday = (weekday) => {
      const idx = Number(weekday || 0) - 1;
      if (idx < 0 || idx >= weekdayText.length) return "-";
      return weekdayText[idx];
    };
    const formatTimestampText = (timestamp) => {
      if (!timestamp) return "-";
      return formatRelativeTime(new Date(timestamp).toISOString());
    };
    const normalizeStudentInfoEntries = (raw) => {
      const data = raw && typeof raw === "object" ? raw : {};
      const entries = [];
      const used = /* @__PURE__ */ new Set();
      studentInfoFieldOrder.forEach((key) => {
        if (!(key in data)) return;
        const label = studentInfoFieldMap[key] || key;
        if (label === "身份证号" && used.has("身份证号")) return;
        if (label === "身份证号") used.add("身份证号");
        entries.push({ label, value: safeText(data[key]) });
      });
      Object.keys(data).forEach((key) => {
        if (studentInfoFieldOrder.includes(key)) return;
        entries.push({ label: key, value: safeText(data[key]) });
      });
      return entries;
    };
    const currentDormitoryLabel = () => {
      try {
        const raw = localStorage.getItem("last_dorm_selection");
        if (!raw) return "-";
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.length) return "-";
        return parsed.map((item) => {
          if (!item) return "";
          if (typeof item === "string") return item;
          return String(item.name || item.label || item.value || "").trim();
        }).filter(Boolean).join(" / ") || "-";
      } catch {
        return "-";
      }
    };
    const normalizeClassroomRows = (cachePayload) => {
      const inner = cachePayload?.data;
      const list = Array.isArray(inner?.data) ? inner.data : Array.isArray(inner) ? inner : [];
      return list.map((item, index) => ({
        id: item.id || `${item.building || ""}-${item.name || ""}-${index}`,
        name: safeText(item.name),
        building: safeText(item.building),
        campus: safeText(item.campus),
        floor: safeText(item.floor),
        seats: safeText(item.seats),
        status: safeText(item.status),
        roomType: safeText(item.type)
      }));
    };
    const normalizeElectricityInfo = (cachePayload) => {
      const inner = cachePayload?.data && typeof cachePayload.data === "object" ? cachePayload.data : {};
      return {
        dormitory: currentDormitoryLabel(),
        quantity: safeText(inner.quantity ?? inner.power),
        balance: safeText(inner.balance),
        status: safeText(inner.status),
        syncTime: safeText(inner.sync_time)
      };
    };
    const normalizeCampusMaps = (cachePayload) => {
      const inner = cachePayload?.data;
      if (Array.isArray(inner)) return inner;
      if (Array.isArray(inner?.maps)) return inner.maps;
      if (Array.isArray(inner?.list)) return inner.list;
      return [];
    };
    const monthRange = (monthValue) => {
      const [yearText, monthText] = String(monthValue || "").split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      if (!year || !month) return null;
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      const format = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return {
        start: format(start),
        end: format(end)
      };
    };
    const loadSemesters = async () => {
      loadingSemesters.value = true;
      try {
        const { data } = await fetchWithCache("semesters", async () => {
          const res = await axiosInstance.get(`${API_BASE}/v2/semesters`);
          return res.data;
        });
        if (data?.success) {
          const sorted = normalizeSemesterList(data.semesters || []);
          semesters.value = sorted;
          currentSemester.value = resolveCurrentSemester(sorted, data.current || "");
          if (!selectedSemesters.value.length && currentSemester.value) {
            selectedSemesters.value = [currentSemester.value];
          }
        }
      } catch (e) {
        exportError.value = `获取学期失败：${e?.message || e}`;
      } finally {
        loadingSemesters.value = false;
      }
    };
    const fetchGradesData = async (selected) => {
      const res = await axiosInstance.post(`${API_BASE}/v2/quick_fetch`, { student_id: props.studentId });
      const payload = res.data || {};
      if (!payload.success) throw new Error(payload.error || "成绩查询失败");
      const allGrades = Array.isArray(payload.data) ? payload.data : [];
      const sourceSemesters = normalizeSemesterList(
        allGrades.map((item) => String(item.term || "").trim()).filter(Boolean)
      );
      const targetSemesters = selected.length ? selected : sourceSemesters;
      const grouped = targetSemesters.map((semester) => ({
        semester,
        list: allGrades.filter((item) => String(item.term || "").trim() === semester).sort((a, b) => String(a.course_name || "").localeCompare(String(b.course_name || ""), "zh-Hans-CN"))
      }));
      const noTerm = allGrades.filter((item) => !String(item.term || "").trim());
      return {
        total: allGrades.length,
        grouped,
        noTerm,
        offline: !!payload.offline,
        syncTime: payload.sync_time || ""
      };
    };
    const fetchRankingData = async (selected) => {
      const semesterSet = /* @__PURE__ */ new Set();
      if (rankingIncludeAll.value) semesterSet.add("");
      (selected.length ? selected : []).forEach((value) => semesterSet.add(value));
      if (semesterSet.size === 0) semesterSet.add("");
      const rows = [];
      for (const sem of semesterSet) {
        const res = await axiosInstance.post(`${API_BASE}/v2/ranking`, {
          student_id: props.studentId,
          semester: sem
        });
        const payload = res.data || {};
        if (!payload.success) {
          rows.push({
            semester: sem || "全部（从入学至今）",
            error: payload.error || "获取失败"
          });
          continue;
        }
        rows.push({
          semester: sem || "全部（从入学至今）",
          data: payload.data || {},
          offline: !!payload.offline,
          syncTime: payload.sync_time || ""
        });
      }
      return rows;
    };
    const fetchScheduleData = async (selected) => {
      const res = await axiosInstance.post(`${API_BASE}/v2/schedule/query`, { student_id: props.studentId });
      const payload = res.data || {};
      if (!payload.success) throw new Error(payload.error || "课表查询失败");
      const metaSemester = String(payload?.meta?.semester || "").trim() || "当前学期";
      const courses = Array.isArray(payload.data) ? payload.data : [];
      const groups = /* @__PURE__ */ new Map();
      courses.forEach((course) => {
        const semKey = String(course.semester || course.term || metaSemester).trim() || metaSemester;
        if (!groups.has(semKey)) groups.set(semKey, []);
        groups.get(semKey).push(course);
      });
      const keys = normalizeSemesterList([...groups.keys()]);
      const targetSemesters = selected.length ? selected : keys;
      const grouped = targetSemesters.map((semester) => ({
        semester,
        list: sortCourses(groups.get(semester) || [])
      }));
      return {
        grouped,
        meta: payload.meta || {},
        offline: !!payload.offline,
        syncTime: payload.sync_time || ""
      };
    };
    const fetchExamsData = async (selected) => {
      const targetSemesters = selected.length ? selected : [""];
      const grouped = [];
      for (const sem of targetSemesters) {
        const res = await axiosInstance.post(`${API_BASE}/v2/exams`, { semester: sem });
        const payload = res.data || {};
        if (!payload.success) {
          grouped.push({
            semester: sem || "全部学期",
            error: payload.error || "获取失败",
            list: []
          });
          continue;
        }
        grouped.push({
          semester: sem || "全部学期",
          list: Array.isArray(payload.data) ? payload.data : [],
          offline: !!payload.offline,
          syncTime: payload.sync_time || ""
        });
      }
      return grouped;
    };
    const fetchCalendarData = async (selected) => {
      const targetSemesters = selected.length ? selected : [""];
      const grouped = [];
      for (const sem of targetSemesters) {
        const res = await axiosInstance.post(`${API_BASE}/v2/calendar`, {
          student_id: props.studentId,
          semester: sem
        });
        const payload = res.data || {};
        if (!payload.success) {
          grouped.push({
            semester: sem || "当前学期",
            error: payload.error || "获取失败",
            list: [],
            meta: {}
          });
          continue;
        }
        grouped.push({
          semester: payload?.meta?.semester || sem || "当前学期",
          list: Array.isArray(payload.data) ? payload.data : [],
          meta: payload.meta || {},
          offline: !!payload.offline,
          syncTime: payload.sync_time || ""
        });
      }
      return grouped;
    };
    const fetchStudentInfoData = async () => {
      const res = await axiosInstance.post(`${API_BASE}/v2/student_info`, { student_id: props.studentId });
      const payload = res.data || {};
      if (!payload.success) throw new Error(payload.error || "个人信息查询失败");
      return {
        data: payload.data || {},
        offline: !!payload.offline,
        syncTime: payload.sync_time || ""
      };
    };
    const fetchAcademicProgressData = async () => {
      const res = await axiosInstance.post(`${API_BASE}/v2/academic_progress`, {
        student_id: props.studentId,
        fasz: 1
      });
      const payload = res.data || {};
      if (!payload.success) throw new Error(payload.error || "学业完成情况查询失败");
      return {
        data: payload.data || {},
        offline: !!payload.offline,
        syncTime: payload.sync_time || ""
      };
    };
    const fetchTrainingPlanData = async () => {
      let options = null;
      try {
        const optionRes = await axiosInstance.post(`${API_BASE}/v2/training_plan/options`, {
          student_id: props.studentId
        });
        const optionPayload = optionRes.data || {};
        if (optionPayload.success) {
          options = optionPayload.options || optionPayload.data || null;
        }
      } catch {
      }
      const firstValue = (arr) => Array.isArray(arr) && arr.length ? arr[0]?.value || arr[0] || "" : "";
      const payload = {
        grade: firstValue(options?.grade),
        kkxq: firstValue(options?.kkxq),
        kkyx: firstValue(options?.kkyx),
        kkjys: "",
        kcxz: "",
        kcgs: "",
        kcbh: "",
        kcmc: "",
        page: 1,
        page_size: 500
      };
      const res = await axiosInstance.post(`${API_BASE}/v2/training_plan`, payload);
      const data = res.data || {};
      if (!data.success) throw new Error(data.error || "培养方案查询失败");
      return {
        list: Array.isArray(data.data) ? data.data : [],
        total: Number(data.total || 0),
        filters: payload,
        offline: !!data.offline,
        syncTime: data.sync_time || ""
      };
    };
    const fetchCachedOnlyData = (id) => {
      if (id === "classroom") {
        const latest = readCacheEntry((key) => key.includes("classroom:"));
        return latest ? { found: true, timestamp: latest.timestamp, data: latest.data } : { found: false, message: "未命中空教室缓存，请先进入空教室页面查询一次。" };
      }
      if (id === "electricity") {
        const latest = readCacheEntry((key) => key.includes("electricity:"));
        return latest ? { found: true, timestamp: latest.timestamp, data: latest.data } : { found: false, message: "未命中电费缓存，请先进入电费页面查询一次。" };
      }
      if (id === "campus_map") {
        const latest = readCacheEntry((key) => key.includes("campus_map") || key.includes("maps:"));
        return latest ? { found: true, timestamp: latest.timestamp, data: latest.data } : { found: false, message: "未命中校园地图缓存。" };
      }
      return { found: false, message: "暂无缓存数据。" };
    };
    const parseTransactionPayload = (payload) => {
      if (!payload || typeof payload !== "object") return { ok: false, list: [], message: "返回为空" };
      const list = Array.isArray(payload.resultData) ? payload.resultData : Array.isArray(payload.data) ? payload.data : [];
      const ok = payload.success === true || payload.code === "" || list.length > 0;
      return {
        ok,
        list,
        message: payload.message || payload.error || ""
      };
    };
    const fetchTransactionsData = async () => {
      if (!isNative) {
        return { grouped: [], total: 0, error: "浏览器模式不支持交易记录导出。" };
      }
      const selected = Array.isArray(selectedTransactionMonths.value) && selectedTransactionMonths.value.length ? selectedTransactionMonths.value : transactionMonthOptions.value.length ? [transactionMonthOptions.value[0].value] : [];
      const grouped = [];
      for (const month of selected) {
        const range = monthRange(month);
        if (!range) continue;
        try {
          const payload = await invokeNative("fetch_transaction_history", {
            startDate: range.start,
            endDate: range.end,
            pageNo: 1,
            pageSize: 1200
          });
          const parsed = parseTransactionPayload(payload);
          grouped.push({
            month,
            label: transactionMonthOptions.value.find((item) => item.value === month)?.label || month,
            list: parsed.list,
            error: parsed.ok ? "" : parsed.message || "查询失败"
          });
        } catch (e) {
          grouped.push({
            month,
            label: transactionMonthOptions.value.find((item) => item.value === month)?.label || month,
            list: [],
            error: e?.message || String(e)
          });
        }
      }
      return {
        grouped,
        total: grouped.reduce((sum, item) => sum + (item.list?.length || 0), 0)
      };
    };
    const fetchByModule = async (moduleId, semesterList) => {
      if (moduleId === "grades") return fetchGradesData(semesterList);
      if (moduleId === "ranking") return fetchRankingData(semesterList);
      if (moduleId === "schedule") return fetchScheduleData(semesterList);
      if (moduleId === "exams") return fetchExamsData(semesterList);
      if (moduleId === "calendar") return fetchCalendarData(semesterList);
      if (moduleId === "student_info") return fetchStudentInfoData();
      if (moduleId === "academic_progress") return fetchAcademicProgressData();
      if (moduleId === "training_plan") return fetchTrainingPlanData();
      if (moduleId === "classroom") return fetchCachedOnlyData("classroom");
      if (moduleId === "electricity") return fetchCachedOnlyData("electricity");
      if (moduleId === "transactions") return fetchTransactionsData();
      if (moduleId === "campus_map") return fetchCachedOnlyData("campus_map");
      return { error: "未实现的数据模块" };
    };
    const collectExportData = async () => {
      exportError.value = "";
      clearExportSuccess();
      preparing.value = true;
      try {
        const payload = {
          studentId: props.studentId,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          semesters: [...effectiveSemesters.value],
          ranking_include_all: rankingIncludeAll.value,
          transaction_months: [...selectedTransactionMonths.value],
          modules: {}
        };
        let newestSync = "";
        for (const moduleId of selectedModules.value) {
          try {
            const data = await fetchByModule(moduleId, effectiveSemesters.value);
            payload.modules[moduleId] = { success: true, data };
            const syncTime = data?.syncTime || "";
            if (syncTime && syncTime > newestSync) newestSync = syncTime;
          } catch (e) {
            payload.modules[moduleId] = {
              success: false,
              error: e?.message || String(e)
            };
          }
        }
        exportPayload.value = payload;
        lastSyncTime.value = newestSync;
        setExportSuccess("导出数据已准备完成，可直接导出 JSON 或长图片。");
      } catch (e) {
        exportError.value = `准备导出数据失败：${e?.message || e}`;
      } finally {
        preparing.value = false;
      }
    };
    const saveByTauri = async (fileName, mimeType, base64Content, preferMedia = false) => {
      const result = await invokeNative("save_export_file", {
        req: {
          fileName,
          mimeType,
          contentBase64: base64Content,
          preferMedia
        }
      });
      return result;
    };
    const saveByBrowser = (fileName, mimeType, content) => {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
      const link = document.createElement("a");
      const href = URL.createObjectURL(blob);
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    };
    const saveByCapacitor = async (fileName, blob) => {
      const { Filesystem, Directory } = await __vitePreload(async () => {
        const { Filesystem: Filesystem2, Directory: Directory2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.X);
        return { Filesystem: Filesystem2, Directory: Directory2 };
      }, true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
      const dataUrl = await blobToDataUrl(blob);
      const base64 = dataUrl.split(",")[1] || "";
      const written = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache
      });
      const fileUri = written.uri;
      const { Share } = await __vitePreload(async () => {
        const { Share: Share2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.Y);
        return { Share: Share2 };
      }, true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
      await Share.share({
        title: fileName,
        text: "Mini-HBUT 导出图片",
        url: fileUri,
        dialogTitle: "保存长图到相册"
      });
      return fileUri;
    };
    const exportJson = async () => {
      if (!exportPayload.value) {
        await collectExportData();
      }
      if (!exportPayload.value) return;
      exporting.value = true;
      exportError.value = "";
      clearExportSuccess();
      try {
        const fileName = `Mini-HBUT_Export_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:T]/g, "-").slice(0, 19)}.json`;
        const jsonText = JSON.stringify(exportPayload.value, null, 2);
        if (isNative) {
          const base64 = btoa(unescape(encodeURIComponent(jsonText)));
          const saved = await saveByTauri(fileName, "application/json", base64, false);
          setExportSuccess("JSON 导出成功。", { path: saved.path });
        } else if (isCapacitor) {
          const { Filesystem, Directory } = await __vitePreload(async () => {
            const { Filesystem: Filesystem2, Directory: Directory2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.X);
            return { Filesystem: Filesystem2, Directory: Directory2 };
          }, true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
          const base64 = btoa(unescape(encodeURIComponent(jsonText)));
          await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
          const { Share } = await __vitePreload(async () => {
            const { Share: Share2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.Y);
            return { Share: Share2 };
          }, true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
          const written = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
          await Share.share({ title: fileName, url: written.uri, dialogTitle: "保存 JSON 文件" });
          setExportSuccess("JSON 已生成，请通过分享面板保存。");
        } else {
          saveByBrowser(fileName, "application/json", jsonText);
          setExportSuccess("JSON 已通过浏览器下载。");
        }
      } catch (e) {
        exportError.value = `JSON 导出失败：${e?.message || e}`;
      } finally {
        exporting.value = false;
      }
    };
    const renderWideCanvas = async () => {
      if (!previewRef.value) throw new Error("导出画布未准备完成");
      const exportWidth = Math.max(1280, Math.ceil(previewRef.value.scrollWidth || 0));
      const wrapper = document.createElement("div");
      wrapper.style.position = "fixed";
      wrapper.style.left = "-99999px";
      wrapper.style.top = "0";
      wrapper.style.width = `${exportWidth}px`;
      wrapper.style.background = "#f4f7ff";
      wrapper.style.padding = "16px";
      wrapper.style.opacity = "0";
      wrapper.style.pointerEvents = "none";
      wrapper.style.zIndex = "0";
      wrapper.style.overflow = "visible";
      const clone = previewRef.value.cloneNode(true);
      clone.classList.add("capture-mode");
      clone.style.width = `${exportWidth}px`;
      clone.style.minWidth = `${exportWidth}px`;
      clone.style.maxWidth = `${exportWidth}px`;
      clone.style.boxSizing = "border-box";
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);
      try {
        await nextTick();
        await waitForCaptureReady(clone);
        return await renderElementToCanvas(clone, {
          exportWidth,
          backgroundColor: "#f4f7ff",
          scale: 2
        });
      } finally {
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      }
    };
    const exportImage = async () => {
      if (!exportPayload.value) {
        await collectExportData();
      }
      if (!exportPayload.value) return;
      exporting.value = true;
      exportError.value = "";
      clearExportSuccess();
      try {
        const canvas = await renderWideCanvas();
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value) resolve(value);
            else reject(new Error("无法生成图片"));
          }, "image/png", 0.98);
        });
        const fileName = `Mini-HBUT_Export_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:T]/g, "-").slice(0, 19)}.png`;
        if (isNative) {
          const dataUrl = await blobToDataUrl(blob);
          const base64 = dataUrl.split(",")[1] || "";
          const saved = await saveByTauri(fileName, "image/png", base64, true);
          setExportSuccess("长图片导出成功。", {
            path: saved.path,
            hint: saved.needs_manual_import ? "已写入应用目录，可在系统文件中导入相册。" : ""
          });
        } else if (isCapacitor) {
          await saveByCapacitor(fileName, blob);
          setExportSuccess("长图片已生成，请在弹出面板中选择“保存到相册”。");
        } else {
          saveByBrowser(fileName, "image/png", blob);
          setExportSuccess("长图片已通过浏览器下载。");
        }
      } catch (e) {
        exportError.value = `长图片导出失败：${e?.message || e}`;
      } finally {
        exporting.value = false;
      }
    };
    const getModuleResult = (moduleId) => exportPayload.value?.modules?.[moduleId];
    const hasPreparedData = computed(() => !!exportPayload.value);
    const prettySyncText = computed(() => {
      if (!lastSyncTime.value) return "";
      return formatRelativeTime(lastSyncTime.value);
    });
    const topSummary = computed(() => {
      const modules = selectedModuleMetas.value.map((item) => `${item.icon} ${item.name}`);
      return modules.join(" · ");
    });
    onMounted(async () => {
      await loadSemesters();
      if (transactionMonthOptions.value.length) {
        selectedTransactionMonths.value = [transactionMonthOptions.value[0].value];
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "header-icon-btn",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("back"))
          }, [..._cache[2] || (_cache[2] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
          ])]),
          _cache[3] || (_cache[3] = createBaseVNode("h1", { class: "header-title-center" }, "导出中心", -1)),
          _cache[4] || (_cache[4] = createBaseVNode("div", { class: "header-spacer" }, null, -1))
        ]),
        createBaseVNode("main", _hoisted_3, [
          _cache[39] || (_cache[39] = createStaticVNode('<section class="export-hero" data-v-1969d808><div class="hero-bg-icon" data-v-1969d808><span class="material-symbols-outlined" data-v-1969d808>cloud_download</span></div><h2 class="hero-title" data-v-1969d808>数据自由导出</h2><p class="hero-desc" data-v-1969d808>选择你需要的模块和时间范围，生成个性化的数据报告或图表。</p></section><section class="intro-card" data-v-1969d808><h2 data-v-1969d808>导出模块</h2><p data-v-1969d808>可按业务分类导出 JSON 或长图片。成绩、课表、排名等模块会按所选学期输出完整明细。</p></section>', 2)),
          createBaseVNode("section", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              _cache[5] || (_cache[5] = createBaseVNode("h3", null, "学期选择", -1)),
              createBaseVNode("span", _hoisted_6, toDisplayString(semesterHint.value), 1)
            ]),
            loadingSemesters.value ? (openBlock(), createElementBlock("div", _hoisted_7, "正在加载学期...")) : semesters.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_8, "未获取到学期列表，导出时将使用当前缓存学期。")) : (openBlock(), createElementBlock("div", _hoisted_9, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (sem) => {
                return openBlock(), createElementBlock("label", {
                  key: sem,
                  class: normalizeClass(["semester-chip", { active: semesterChecked(sem), disabled: !requiresSemester.value }])
                }, [
                  createBaseVNode("input", {
                    type: "checkbox",
                    disabled: !requiresSemester.value,
                    checked: semesterChecked(sem),
                    onChange: ($event) => toggleSemester(sem)
                  }, null, 40, _hoisted_10),
                  createBaseVNode("span", null, toDisplayString(sem), 1)
                ], 2);
              }), 128))
            ]))
          ]),
          selectedModules.value.includes("ranking") ? (openBlock(), createElementBlock("section", _hoisted_11, [
            _cache[7] || (_cache[7] = createBaseVNode("h3", null, "绩点排名导出", -1)),
            createBaseVNode("label", _hoisted_12, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => rankingIncludeAll.value = $event),
                type: "checkbox"
              }, null, 512), [
                [vModelCheckbox, rankingIncludeAll.value]
              ]),
              _cache[6] || (_cache[6] = createBaseVNode("span", null, "包含“全部（从入学至今）”统计", -1))
            ])
          ])) : createCommentVNode("", true),
          selectedModules.value.includes("transactions") ? (openBlock(), createElementBlock("section", _hoisted_13, [
            createBaseVNode("div", _hoisted_14, [
              _cache[8] || (_cache[8] = createBaseVNode("h3", null, "交易记录月份", -1)),
              createBaseVNode("span", _hoisted_15, toDisplayString(transactionHint.value), 1)
            ]),
            createBaseVNode("div", _hoisted_16, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(transactionMonthOptions.value, (item) => {
                return openBlock(), createElementBlock("label", {
                  key: item.value,
                  class: normalizeClass(["month-chip", { active: monthChecked(item.value) }])
                }, [
                  createBaseVNode("input", {
                    type: "checkbox",
                    checked: monthChecked(item.value),
                    onChange: ($event) => toggleTransactionMonth(item.value)
                  }, null, 40, _hoisted_17),
                  createBaseVNode("span", null, toDisplayString(item.label), 1)
                ], 2);
              }), 128))
            ])
          ])) : createCommentVNode("", true),
          (openBlock(), createElementBlock(Fragment, null, renderList(moduleGroups, (group) => {
            return createBaseVNode("section", {
              key: group.id,
              class: "config-card"
            }, [
              createBaseVNode("h3", null, toDisplayString(group.title), 1),
              createBaseVNode("div", _hoisted_18, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(group.modules, (mod) => {
                  return openBlock(), createElementBlock("label", {
                    key: mod.id,
                    class: normalizeClass(["export-module-item", { active: selectedModules.value.includes(mod.id) }])
                  }, [
                    createBaseVNode("input", {
                      type: "checkbox",
                      checked: selectedModules.value.includes(mod.id),
                      onChange: ($event) => toggleModule(mod.id)
                    }, null, 40, _hoisted_19),
                    createBaseVNode("span", _hoisted_20, toDisplayString(mod.icon), 1),
                    createBaseVNode("span", _hoisted_21, toDisplayString(mod.name), 1),
                    mod.semesterAware ? (openBlock(), createElementBlock("span", _hoisted_22, "学期")) : createCommentVNode("", true)
                  ], 2);
                }), 128))
              ])
            ]);
          }), 64)),
          createBaseVNode("section", _hoisted_23, [
            createBaseVNode("button", {
              class: "export-btn outline",
              disabled: preparing.value || exporting.value,
              onClick: exportJson
            }, [
              _cache[9] || (_cache[9] = createBaseVNode("span", { class: "material-symbols-outlined" }, "data_object", -1)),
              createTextVNode(" " + toDisplayString(exporting.value ? "处理中..." : "导出 JSON"), 1)
            ], 8, _hoisted_24),
            createBaseVNode("button", {
              class: "export-btn primary",
              disabled: preparing.value || exporting.value,
              onClick: exportImage
            }, [
              _cache[10] || (_cache[10] = createBaseVNode("span", { class: "material-symbols-outlined" }, "image", -1)),
              createTextVNode(" " + toDisplayString(exporting.value ? "处理中..." : "生成长图分享"), 1)
            ], 8, _hoisted_25),
            createBaseVNode("button", {
              class: "export-btn outline",
              disabled: preparing.value || exporting.value,
              onClick: collectExportData
            }, toDisplayString(preparing.value ? "正在准备数据..." : "预览导出数据"), 9, _hoisted_26)
          ]),
          exportError.value ? (openBlock(), createElementBlock("div", _hoisted_27, [
            createBaseVNode("div", _hoisted_28, toDisplayString(exportError.value), 1)
          ])) : createCommentVNode("", true),
          exportSuccess.value ? (openBlock(), createElementBlock("div", _hoisted_29, [
            createBaseVNode("div", _hoisted_30, toDisplayString(exportSuccess.value), 1),
            exportSuccessPath.value ? (openBlock(), createElementBlock("div", _hoisted_31, [
              _cache[11] || (_cache[11] = createBaseVNode("span", null, "保存位置", -1)),
              createBaseVNode("strong", null, toDisplayString(exportSuccessPath.value), 1)
            ])) : createCommentVNode("", true),
            exportSuccessHint.value ? (openBlock(), createElementBlock("div", _hoisted_32, toDisplayString(exportSuccessHint.value), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          hasPreparedData.value ? (openBlock(), createElementBlock("section", _hoisted_33, [
            createBaseVNode("div", {
              ref_key: "previewRef",
              ref: previewRef,
              class: "preview-content"
            }, [
              createBaseVNode("div", _hoisted_34, [
                createBaseVNode("div", null, [
                  _cache[12] || (_cache[12] = createBaseVNode("h2", null, "Mini-HBUT 导出报表", -1)),
                  createBaseVNode("p", null, "学号：" + toDisplayString(__props.studentId || "未登录"), 1),
                  createBaseVNode("p", null, "导出时间：" + toDisplayString(exportPayload.value.generatedAt), 1),
                  prettySyncText.value ? (openBlock(), createElementBlock("p", _hoisted_35, "最近同步：" + toDisplayString(prettySyncText.value), 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_36, toDisplayString(topSummary.value), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(selectedModuleMetas.value, (meta) => {
                return openBlock(), createElementBlock("article", {
                  key: meta.id,
                  class: "preview-module"
                }, [
                  createBaseVNode("header", _hoisted_37, [
                    createBaseVNode("h3", null, toDisplayString(meta.icon) + " " + toDisplayString(meta.name), 1)
                  ]),
                  !getModuleResult(meta.id) ? (openBlock(), createElementBlock("div", _hoisted_38, "暂无该模块导出数据。")) : !getModuleResult(meta.id).success ? (openBlock(), createElementBlock("div", _hoisted_39, toDisplayString(getModuleResult(meta.id).error), 1)) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                    meta.id === "grades" ? (openBlock(), createElementBlock("div", _hoisted_40, [
                      createBaseVNode("div", _hoisted_41, [
                        _cache[13] || (_cache[13] = createBaseVNode("span", null, "总课程数", -1)),
                        createBaseVNode("strong", null, toDisplayString(getModuleResult(meta.id).data.total), 1)
                      ]),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data.grouped, (term) => {
                        return openBlock(), createElementBlock("div", {
                          key: `grade-${term.semester}`,
                          class: "term-block"
                        }, [
                          createBaseVNode("h4", null, toDisplayString(term.semester) + "（" + toDisplayString(term.list.length) + " 门）", 1),
                          createBaseVNode("table", _hoisted_42, [
                            _cache[15] || (_cache[15] = createBaseVNode("thead", null, [
                              createBaseVNode("tr", null, [
                                createBaseVNode("th", null, "课程"),
                                createBaseVNode("th", null, "成绩"),
                                createBaseVNode("th", null, "学分"),
                                createBaseVNode("th", null, "课程性质"),
                                createBaseVNode("th", null, "教师")
                              ])
                            ], -1)),
                            createBaseVNode("tbody", null, [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(term.list, (item) => {
                                return openBlock(), createElementBlock("tr", {
                                  key: `${term.semester}-${item.course_name}-${item.teacher}`
                                }, [
                                  createBaseVNode("td", null, toDisplayString(item.course_name), 1),
                                  createBaseVNode("td", null, toDisplayString(formatScore(item.final_score)), 1),
                                  createBaseVNode("td", null, toDisplayString(item.course_credit || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.course_nature || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.teacher || "-"), 1)
                                ]);
                              }), 128)),
                              term.list.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_43, [..._cache[14] || (_cache[14] = [
                                createBaseVNode("td", { colspan: "5" }, "该学期无数据", -1)
                              ])])) : createCommentVNode("", true)
                            ])
                          ])
                        ]);
                      }), 128))
                    ])) : meta.id === "ranking" ? (openBlock(), createElementBlock("div", _hoisted_44, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data, (row) => {
                        return openBlock(), createElementBlock("div", {
                          key: `ranking-${row.semester}`,
                          class: "term-block"
                        }, [
                          createBaseVNode("h4", null, toDisplayString(row.semester), 1),
                          row.error ? (openBlock(), createElementBlock("p", _hoisted_45, toDisplayString(row.error), 1)) : (openBlock(), createElementBlock("div", _hoisted_46, [
                            createBaseVNode("div", _hoisted_47, [
                              _cache[16] || (_cache[16] = createBaseVNode("span", null, "平均学分绩点", -1)),
                              createBaseVNode("strong", null, toDisplayString(row.data?.gpa || "-"), 1)
                            ]),
                            createBaseVNode("div", _hoisted_48, [
                              _cache[17] || (_cache[17] = createBaseVNode("span", null, "算术平均分", -1)),
                              createBaseVNode("strong", null, toDisplayString(row.data?.avg_score || "-"), 1)
                            ]),
                            createBaseVNode("div", _hoisted_49, [
                              _cache[18] || (_cache[18] = createBaseVNode("span", null, "专业绩点排名", -1)),
                              createBaseVNode("strong", null, toDisplayString(row.data?.gpa_major_rank || "-") + "/" + toDisplayString(row.data?.gpa_major_total || "-"), 1)
                            ]),
                            createBaseVNode("div", _hoisted_50, [
                              _cache[19] || (_cache[19] = createBaseVNode("span", null, "班级绩点排名", -1)),
                              createBaseVNode("strong", null, toDisplayString(row.data?.gpa_class_rank || "-") + "/" + toDisplayString(row.data?.gpa_class_total || "-"), 1)
                            ])
                          ]))
                        ]);
                      }), 128))
                    ])) : meta.id === "schedule" ? (openBlock(), createElementBlock("div", _hoisted_51, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data.grouped, (term) => {
                        return openBlock(), createElementBlock("div", {
                          key: `schedule-${term.semester}`,
                          class: "term-block"
                        }, [
                          createBaseVNode("h4", null, toDisplayString(term.semester) + "（" + toDisplayString(term.list.length) + " 条）", 1),
                          createBaseVNode("table", _hoisted_52, [
                            _cache[21] || (_cache[21] = createBaseVNode("thead", null, [
                              createBaseVNode("tr", null, [
                                createBaseVNode("th", null, "星期"),
                                createBaseVNode("th", null, "节次"),
                                createBaseVNode("th", null, "课程"),
                                createBaseVNode("th", null, "地点"),
                                createBaseVNode("th", null, "教师"),
                                createBaseVNode("th", null, "周次")
                              ])
                            ], -1)),
                            createBaseVNode("tbody", null, [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(term.list, (item) => {
                                return openBlock(), createElementBlock("tr", {
                                  key: `${term.semester}-${item.course_name}-${item.weekday}-${item.period}-${item.room}`
                                }, [
                                  createBaseVNode("td", null, toDisplayString(formatWeekday(item.weekday)), 1),
                                  createBaseVNode("td", null, toDisplayString(formatPeriod(item)), 1),
                                  createBaseVNode("td", null, toDisplayString(item.course_name || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.room || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.teacher || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.weeks || "-"), 1)
                                ]);
                              }), 128)),
                              term.list.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_53, [..._cache[20] || (_cache[20] = [
                                createBaseVNode("td", { colspan: "6" }, "该学期无课表数据", -1)
                              ])])) : createCommentVNode("", true)
                            ])
                          ])
                        ]);
                      }), 128))
                    ])) : meta.id === "exams" ? (openBlock(), createElementBlock("div", _hoisted_54, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data, (term) => {
                        return openBlock(), createElementBlock("div", {
                          key: `exam-${term.semester}`,
                          class: "term-block"
                        }, [
                          createBaseVNode("h4", null, toDisplayString(term.semester) + "（" + toDisplayString(term.list.length) + " 场）", 1),
                          term.error ? (openBlock(), createElementBlock("p", _hoisted_55, toDisplayString(term.error), 1)) : (openBlock(), createElementBlock("table", _hoisted_56, [
                            _cache[23] || (_cache[23] = createBaseVNode("thead", null, [
                              createBaseVNode("tr", null, [
                                createBaseVNode("th", null, "课程"),
                                createBaseVNode("th", null, "考试日期"),
                                createBaseVNode("th", null, "考试时间"),
                                createBaseVNode("th", null, "地点"),
                                createBaseVNode("th", null, "座位号")
                              ])
                            ], -1)),
                            createBaseVNode("tbody", null, [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(term.list, (item) => {
                                return openBlock(), createElementBlock("tr", {
                                  key: `${term.semester}-${item.course_name}-${item.exam_date}-${item.exam_time}`
                                }, [
                                  createBaseVNode("td", null, toDisplayString(item.course_name || item.name || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.exam_date || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.exam_time || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.exam_room || item.room || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.seat_no || "-"), 1)
                                ]);
                              }), 128)),
                              term.list.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_57, [..._cache[22] || (_cache[22] = [
                                createBaseVNode("td", { colspan: "5" }, "该学期无考试安排", -1)
                              ])])) : createCommentVNode("", true)
                            ])
                          ]))
                        ]);
                      }), 128))
                    ])) : meta.id === "calendar" ? (openBlock(), createElementBlock("div", _hoisted_58, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data, (term) => {
                        return openBlock(), createElementBlock("div", {
                          key: `cal-${term.semester}`,
                          class: "term-block"
                        }, [
                          createBaseVNode("h4", null, toDisplayString(term.semester) + "（" + toDisplayString(term.list.length) + " 周）", 1),
                          term.error ? (openBlock(), createElementBlock("p", _hoisted_59, toDisplayString(term.error), 1)) : (openBlock(), createElementBlock("table", _hoisted_60, [
                            _cache[25] || (_cache[25] = createBaseVNode("thead", null, [
                              createBaseVNode("tr", null, [
                                createBaseVNode("th", null, "月份"),
                                createBaseVNode("th", null, "周次"),
                                createBaseVNode("th", null, "周一"),
                                createBaseVNode("th", null, "周二"),
                                createBaseVNode("th", null, "周三"),
                                createBaseVNode("th", null, "周四"),
                                createBaseVNode("th", null, "周五"),
                                createBaseVNode("th", null, "周六"),
                                createBaseVNode("th", null, "周日")
                              ])
                            ], -1)),
                            createBaseVNode("tbody", null, [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(term.list, (item) => {
                                return openBlock(), createElementBlock("tr", {
                                  key: `${term.semester}-${item.ny}-${item.zc}`
                                }, [
                                  createBaseVNode("td", null, toDisplayString(item.ny || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.zc || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.monday || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.tuesday || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.wednesday || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.thursday || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.friday || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.saturday || "-"), 1),
                                  createBaseVNode("td", null, toDisplayString(item.sunday || "-"), 1)
                                ]);
                              }), 128)),
                              term.list.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_61, [..._cache[24] || (_cache[24] = [
                                createBaseVNode("td", { colspan: "9" }, "该学期无校历数据", -1)
                              ])])) : createCommentVNode("", true)
                            ])
                          ]))
                        ]);
                      }), 128))
                    ])) : meta.id === "student_info" ? (openBlock(), createElementBlock("div", _hoisted_62, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(normalizeStudentInfoEntries(getModuleResult(meta.id).data.data), (item) => {
                        return openBlock(), createElementBlock("div", {
                          key: `stu-${item.label}`,
                          class: "module-kv"
                        }, [
                          createBaseVNode("span", null, toDisplayString(item.label), 1),
                          createBaseVNode("strong", null, toDisplayString(item.value), 1)
                        ]);
                      }), 128))
                    ])) : meta.id === "academic_progress" ? (openBlock(), createElementBlock("div", _hoisted_63, [
                      createBaseVNode("div", _hoisted_64, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data.data.summary || {}, (value, key) => {
                          return openBlock(), createElementBlock("div", {
                            key: `prog-${key}`,
                            class: "module-kv"
                          }, [
                            createBaseVNode("span", null, toDisplayString(key), 1),
                            createBaseVNode("strong", null, toDisplayString(value || "-"), 1)
                          ]);
                        }), 128))
                      ]),
                      createBaseVNode("p", _hoisted_65, "树形节点数量：" + toDisplayString((getModuleResult(meta.id).data.data.tree || []).length), 1)
                    ])) : meta.id === "training_plan" ? (openBlock(), createElementBlock("div", _hoisted_66, [
                      createBaseVNode("div", _hoisted_67, [
                        _cache[26] || (_cache[26] = createBaseVNode("span", null, "课程总数", -1)),
                        createBaseVNode("strong", null, toDisplayString(getModuleResult(meta.id).data.total || getModuleResult(meta.id).data.list.length), 1)
                      ]),
                      createBaseVNode("table", _hoisted_68, [
                        _cache[28] || (_cache[28] = createBaseVNode("thead", null, [
                          createBaseVNode("tr", null, [
                            createBaseVNode("th", null, "课程编号"),
                            createBaseVNode("th", null, "课程名称"),
                            createBaseVNode("th", null, "学分"),
                            createBaseVNode("th", null, "课程性质")
                          ])
                        ], -1)),
                        createBaseVNode("tbody", null, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data.list, (item) => {
                            return openBlock(), createElementBlock("tr", {
                              key: `${item.kcbh || item.course_code}-${item.kcmc || item.course_name}`
                            }, [
                              createBaseVNode("td", null, toDisplayString(item.kcbh || item.course_code || "-"), 1),
                              createBaseVNode("td", null, toDisplayString(item.kcmc || item.course_name || "-"), 1),
                              createBaseVNode("td", null, toDisplayString(item.xf || item.course_credit || "-"), 1),
                              createBaseVNode("td", null, toDisplayString(item.kcxzmc || item.course_nature || "-"), 1)
                            ]);
                          }), 128)),
                          (getModuleResult(meta.id).data.list || []).length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_69, [..._cache[27] || (_cache[27] = [
                            createBaseVNode("td", { colspan: "4" }, "暂无培养方案数据", -1)
                          ])])) : createCommentVNode("", true)
                        ])
                      ])
                    ])) : meta.id === "transactions" ? (openBlock(), createElementBlock("div", _hoisted_70, [
                      createBaseVNode("div", _hoisted_71, [
                        _cache[29] || (_cache[29] = createBaseVNode("span", null, "交易总条数", -1)),
                        createBaseVNode("strong", null, toDisplayString(safeText(getModuleResult(meta.id).data.total)), 1)
                      ]),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(getModuleResult(meta.id).data.grouped, (item) => {
                        return openBlock(), createElementBlock("div", {
                          key: `tx-${item.month}`,
                          class: "term-block"
                        }, [
                          createBaseVNode("h4", null, toDisplayString(item.label) + "（" + toDisplayString(item.list.length) + " 条）", 1),
                          item.error ? (openBlock(), createElementBlock("p", _hoisted_72, toDisplayString(item.error), 1)) : (openBlock(), createElementBlock("table", _hoisted_73, [
                            _cache[31] || (_cache[31] = createBaseVNode("thead", null, [
                              createBaseVNode("tr", null, [
                                createBaseVNode("th", null, "时间"),
                                createBaseVNode("th", null, "商户"),
                                createBaseVNode("th", null, "金额"),
                                createBaseVNode("th", null, "备注")
                              ])
                            ], -1)),
                            createBaseVNode("tbody", null, [
                              (openBlock(true), createElementBlock(Fragment, null, renderList(item.list, (row, idx) => {
                                return openBlock(), createElementBlock("tr", {
                                  key: `tx-row-${item.month}-${idx}`
                                }, [
                                  createBaseVNode("td", null, toDisplayString(safeText(row.date || row.tradeTime || row.time)), 1),
                                  createBaseVNode("td", null, toDisplayString(safeText(row.merchantName || row.summary || row.title)), 1),
                                  createBaseVNode("td", null, toDisplayString(safeText(row.amt || row.amount || row.money)), 1),
                                  createBaseVNode("td", null, toDisplayString(safeText(row.summary || row.remark)), 1)
                                ]);
                              }), 128)),
                              item.list.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_74, [..._cache[30] || (_cache[30] = [
                                createBaseVNode("td", { colspan: "4" }, "该月份无交易记录", -1)
                              ])])) : createCommentVNode("", true)
                            ])
                          ]))
                        ]);
                      }), 128))
                    ])) : meta.id === "electricity" ? (openBlock(), createElementBlock("div", _hoisted_75, [
                      !getModuleResult(meta.id).data.found ? (openBlock(), createElementBlock("p", _hoisted_76, toDisplayString(getModuleResult(meta.id).data.message || "暂无电费缓存数据"), 1)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createBaseVNode("p", _hoisted_77, "命中缓存时间：" + toDisplayString(formatTimestampText(getModuleResult(meta.id).data.timestamp)), 1),
                        createBaseVNode("div", _hoisted_78, [
                          createBaseVNode("div", _hoisted_79, [
                            _cache[32] || (_cache[32] = createBaseVNode("span", null, "宿舍", -1)),
                            createBaseVNode("strong", null, toDisplayString(normalizeElectricityInfo(getModuleResult(meta.id).data).dormitory), 1)
                          ]),
                          createBaseVNode("div", _hoisted_80, [
                            _cache[33] || (_cache[33] = createBaseVNode("span", null, "剩余电量", -1)),
                            createBaseVNode("strong", null, toDisplayString(normalizeElectricityInfo(getModuleResult(meta.id).data).quantity), 1)
                          ]),
                          createBaseVNode("div", _hoisted_81, [
                            _cache[34] || (_cache[34] = createBaseVNode("span", null, "余额", -1)),
                            createBaseVNode("strong", null, toDisplayString(normalizeElectricityInfo(getModuleResult(meta.id).data).balance), 1)
                          ]),
                          createBaseVNode("div", _hoisted_82, [
                            _cache[35] || (_cache[35] = createBaseVNode("span", null, "状态", -1)),
                            createBaseVNode("strong", null, toDisplayString(normalizeElectricityInfo(getModuleResult(meta.id).data).status), 1)
                          ])
                        ])
                      ], 64))
                    ])) : meta.id === "classroom" ? (openBlock(), createElementBlock("div", _hoisted_83, [
                      !getModuleResult(meta.id).data.found ? (openBlock(), createElementBlock("p", _hoisted_84, toDisplayString(getModuleResult(meta.id).data.message || "暂无空教室缓存数据"), 1)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createBaseVNode("p", _hoisted_85, "命中缓存时间：" + toDisplayString(formatTimestampText(getModuleResult(meta.id).data.timestamp)), 1),
                        createBaseVNode("div", _hoisted_86, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(normalizeClassroomRows(getModuleResult(meta.id).data).slice(0, 24), (room) => {
                            return openBlock(), createElementBlock("div", {
                              key: `cls-${room.id}`,
                              class: "classroom-card"
                            }, [
                              createBaseVNode("h5", null, toDisplayString(room.name), 1),
                              createBaseVNode("p", null, toDisplayString(room.campus) + " · " + toDisplayString(room.building) + " · " + toDisplayString(room.floor) + "层", 1),
                              createBaseVNode("p", null, "座位：" + toDisplayString(room.seats) + " · 状态：" + toDisplayString(room.status), 1)
                            ]);
                          }), 128))
                        ])
                      ], 64))
                    ])) : meta.id === "campus_map" ? (openBlock(), createElementBlock("div", _hoisted_87, [
                      !getModuleResult(meta.id).data.found ? (openBlock(), createElementBlock("p", _hoisted_88, toDisplayString(getModuleResult(meta.id).data.message || "暂无校园地图缓存数据"), 1)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createBaseVNode("p", _hoisted_89, "命中缓存时间：" + toDisplayString(formatTimestampText(getModuleResult(meta.id).data.timestamp)), 1),
                        createBaseVNode("div", _hoisted_90, [
                          createBaseVNode("div", _hoisted_91, [
                            _cache[36] || (_cache[36] = createBaseVNode("span", null, "地图数量", -1)),
                            createBaseVNode("strong", null, toDisplayString(normalizeCampusMaps(getModuleResult(meta.id).data).length), 1)
                          ])
                        ]),
                        createBaseVNode("table", _hoisted_92, [
                          _cache[38] || (_cache[38] = createBaseVNode("thead", null, [
                            createBaseVNode("tr", null, [
                              createBaseVNode("th", null, "名称"),
                              createBaseVNode("th", null, "说明"),
                              createBaseVNode("th", null, "链接")
                            ])
                          ], -1)),
                          createBaseVNode("tbody", null, [
                            (openBlock(true), createElementBlock(Fragment, null, renderList(normalizeCampusMaps(getModuleResult(meta.id).data), (item, idx) => {
                              return openBlock(), createElementBlock("tr", {
                                key: `map-${idx}`
                              }, [
                                createBaseVNode("td", null, toDisplayString(safeText(item.name || item.title)), 1),
                                createBaseVNode("td", null, toDisplayString(safeText(item.desc || item.description)), 1),
                                createBaseVNode("td", null, toDisplayString(safeText(item.url || item.image)), 1)
                              ]);
                            }), 128)),
                            normalizeCampusMaps(getModuleResult(meta.id).data).length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_93, [..._cache[37] || (_cache[37] = [
                              createBaseVNode("td", { colspan: "3" }, "缓存中没有地图详情列表", -1)
                            ])])) : createCommentVNode("", true)
                          ])
                        ])
                      ], 64))
                    ])) : (openBlock(), createElementBlock("div", _hoisted_94, [
                      createBaseVNode("pre", _hoisted_95, toDisplayString(JSON.stringify(getModuleResult(meta.id).data || {}, null, 2)), 1)
                    ]))
                  ], 64))
                ]);
              }), 128))
            ], 512)
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const ExportCenterView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-1969d808"]]);
export {
  ExportCenterView as default
};
