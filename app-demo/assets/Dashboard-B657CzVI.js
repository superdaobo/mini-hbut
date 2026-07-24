const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-apFQ0nCw.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload, i as isTestAccountSession } from "./runtime-bridge-apFQ0nCw.js";
import { w as watch, a as ref, o as onMounted, m as onBeforeUnmount, c as createElementBlock, b as openBlock, d as createBaseVNode, k as createBlock, f as createCommentVNode, t as toDisplayString, e as computed, h as normalizeStyle, n as normalizeClass, g as createTextVNode, F as Fragment, i as renderList, j as withModifiers, C as withDirectives, D as vModelText, v as Teleport, u as unref, z as nextTick } from "./vue-core-DdLVj9yW.js";
import { _ as _imports_0 } from "./app_icon-BoqTJkLh.js";
import { _ as _export_sfc, c as cloneWorkspaceLayout, u as useUiSettings, s as showToast, d as decideHomeNavigate, g as getCachedData, f as fetchWithCache, a as axiosInstance, D as DEFAULT_SWR_OPTIONS, b as setCachedData, r as readScheduleLockDetail } from "./app-demo-CxKBY5JQ.js";
/* empty css                                                                                */
import { t as isModuleAllowed, v as filterAllowedModules } from "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _imports_1 = "" + new URL("../splash/course_done_icon.webp", import.meta.url).href;
const _imports_2 = "" + new URL("../splash/campus_illustration.webp", import.meta.url).href;
function stripMarkdown(content = "") {
  if (!content) return "";
  return content.replace(/`{1,3}[^`]*`{1,3}/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/[#>*_~\-]/g, "").replace(/\s+/g, " ").trim();
}
const SERVICE_ALIASES = Object.freeze({
  grades: ["成绩", "分数", "绩点", "绩点查询", "成绩查询"],
  classroom: ["空教室", "教室", "自习室"],
  electricity: ["电费", "宿舍电费", "余额"],
  transactions: ["交易", "消费", "一卡通", "一码通"],
  exams: ["考试", "考试安排", "考场"],
  ranking: ["排名", "绩点排名", "专业排名"],
  campus_code: ["校园码", "二维码", "一码通"],
  calendar: ["校历", "日历", "学期"],
  school_inbox: ["消息", "通知", "公告", "收件箱", "学习通消息", "教务消息"],
  academic: ["学业", "学分", "完成度"],
  qxzkb: ["全校课表", "课程", "排课"],
  course_selection: ["选课", "退课", "通识课"],
  training: ["培养方案", "方案", "课程设置"],
  library: ["图书", "图书馆", "馆藏"],
  campus_map: ["地图", "校园地图", "导航"],
  resource_share: ["资料", "文件", "分享", "下载"],
  chaoxing_class: ["学习通", "超星", "邀请码", "入班", "班级资料", "课件"],
  towergo: ["小塔", "小塔出行", "出行", "电动车", "电单车", "骑行", "骑车", "单车", "扫码用车"],
  smart_orientation: ["智慧迎新", "迎新", "班导师", "辅导员", "宿舍", "报到"],
  ai: ["AI", "助手", "校园助手"]
});
const safeText = (value) => String(value ?? "").trim();
const normalizeText = (value) => safeText(value).toLowerCase().replace(/\s+/g, "");
const toPositiveInt = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
};
const WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const isOrderedCharMatch = (value, query) => {
  const normalized = normalizeText(value);
  if (!normalized || !query) return false;
  let cursor = 0;
  for (const char of query) {
    cursor = normalized.indexOf(char, cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
};
const scoreText = (value, query, weight) => {
  const normalized = normalizeText(value);
  if (!normalized || !query) return 0;
  if (normalized === query) return weight + 40;
  if (normalized.startsWith(query)) return weight + 20;
  if (normalized.includes(query)) return weight;
  if (isOrderedCharMatch(normalized, query)) return Math.max(1, weight - 18);
  return 0;
};
const scoreService = (module, query) => {
  const aliases = [
    ...Array.isArray(module?.aliases) ? module.aliases : [],
    ...SERVICE_ALIASES[module?.id] || []
  ];
  return Math.max(
    scoreText(module?.name, query, 120),
    scoreText(module?.desc || module?.description, query, 70),
    scoreText(module?.id, query, 45),
    ...aliases.map((alias) => scoreText(alias, query, 95))
  );
};
const normalizeNoticeSummary = (notice) => safeText(notice?.summary || notice?.description || notice?.content || "");
const byScoreThenTitle = (a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  return safeText(a.title).localeCompare(safeText(b.title), "zh-Hans-CN");
};
const normalizeWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return [];
  return weeks.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
};
const getCoursePeriodRange = (course) => {
  const startPeriod = toPositiveInt(course?.period ?? course?.start_period, 0);
  if (startPeriod < 1 || startPeriod > 99) return null;
  const endByField = toPositiveInt(course?.end_period, 0);
  const span = Math.max(1, toPositiveInt(course?.djs ?? course?.duration, 1));
  const computedEnd = endByField > 0 ? endByField : startPeriod + span - 1;
  const endPeriod = Math.max(startPeriod, computedEnd);
  return { startPeriod, endPeriod };
};
const resolvePeriodTime = (periodTimeMap, period, field, fallback) => safeText(periodTimeMap?.[period]?.[field] || fallback);
const getWeeklyCourseSignature = (course, room, teacher, weekday) => {
  const name = safeText(course?.name);
  const className = safeText(course?.class_name);
  const building = safeText(course?.building);
  const custom = course?.is_custom ? "1" : "0";
  return normalizeText(`${weekday}|${name}|${teacher}|${room}|${className}|${building}|${custom}`);
};
const buildWeeklyCourseSearchEntries = ({
  courses = [],
  currentWeek = 1,
  periodTimeMap = {}
} = {}) => {
  const safeWeek = toPositiveInt(currentWeek, 1);
  const normalized = (Array.isArray(courses) ? courses : []).filter((course) => {
    const name = safeText(course?.name);
    const weekday = toPositiveInt(course?.weekday, 0);
    const weeks = normalizeWeeks(course?.weeks);
    return name && weekday >= 1 && weekday <= 7 && (weeks.length === 0 || weeks.includes(safeWeek));
  }).map((course) => {
    const range = getCoursePeriodRange(course);
    if (!range) return null;
    const weekday = toPositiveInt(course?.weekday, 0);
    const room = safeText(course?.room_code || course?.room || "-");
    const teacher = safeText(course?.teacher || "-");
    return {
      ...course,
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday] || `周${weekday}`,
      startPeriod: range.startPeriod,
      endPeriod: range.endPeriod,
      room,
      teacher,
      signature: getWeeklyCourseSignature(course, room, teacher, weekday)
    };
  }).filter(Boolean).sort(
    (a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod || safeText(a.name).localeCompare(safeText(b.name), "zh-Hans-CN")
  );
  const merged = [];
  let index = 0;
  while (index < normalized.length) {
    const current = normalized[index];
    let endPeriod = current.endPeriod;
    let nextIndex = index + 1;
    while (nextIndex < normalized.length) {
      const next = normalized[nextIndex];
      if (next.signature === current.signature && next.startPeriod <= endPeriod + 1) {
        endPeriod = Math.max(endPeriod, next.endPeriod);
        nextIndex += 1;
        continue;
      }
      break;
    }
    const startText = resolvePeriodTime(periodTimeMap, current.startPeriod, "start", safeText(current.start));
    const endText = resolvePeriodTime(periodTimeMap, endPeriod, "end", safeText(current.end));
    const dedupeKey = normalizeText([
      safeWeek,
      current.weekday,
      current.name,
      current.teacher,
      current.room,
      current.startPeriod,
      endPeriod
    ].join("|"));
    merged.push({
      key: `week-${safeWeek}-${current.weekday}-${current.startPeriod}-${endPeriod}-${current.name}-${current.room}-${current.teacher}`,
      dedupeKey,
      name: current.name,
      room: current.room,
      teacher: current.teacher,
      weekday: current.weekday,
      weekdayLabel: current.weekdayLabel,
      startPeriod: current.startPeriod,
      endPeriod,
      start: startText,
      end: endText
    });
    index = nextIndex;
  }
  return merged;
};
const dedupeSearchItems = (items) => {
  const map = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = safeText(item?.dedupeKey || item?.id);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || item.score > existing.score) map.set(key, item);
  }
  return [...map.values()];
};
const buildHomeSearchSections = ({
  query = "",
  modules = [],
  courses = [],
  notices = [],
  limitPerSection = 6
} = {}) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];
  const serviceItems = (Array.isArray(modules) ? modules : []).map((module) => ({
    type: "service",
    id: safeText(module?.id),
    title: safeText(module?.name),
    subtitle: safeText(module?.desc || module?.description),
    target: safeText(module?.id),
    iconKey: safeText(module?.iconKey || module?.id),
    color: safeText(module?.color),
    requiresLogin: module?.requiresLogin === true,
    score: scoreService(module, normalizedQuery)
  })).filter((item) => item.id && item.title && item.score > 0).sort(byScoreThenTitle).slice(0, limitPerSection);
  const courseItems = (Array.isArray(courses) ? courses : []).map((course, index) => {
    const title = safeText(course?.name);
    const room = safeText(course?.room);
    const teacher = safeText(course?.teacher);
    const weekday = safeText(course?.weekdayLabel);
    const time = [safeText(course?.start), safeText(course?.end)].filter(Boolean).join(" - ");
    const score = Math.max(
      scoreText(title, normalizedQuery, 110),
      scoreText(room, normalizedQuery, 80),
      scoreText(teacher, normalizedQuery, 65),
      scoreText(weekday, normalizedQuery, 45)
    );
    return {
      type: "course",
      id: safeText(course?.key || `course-${index}`),
      dedupeKey: safeText(course?.dedupeKey || course?.key || `course-${index}`),
      title,
      subtitle: [weekday, time, room, teacher].filter(Boolean).join(" · "),
      target: "schedule",
      score
    };
  }).filter((item) => item.title && item.score > 0);
  const dedupedCourseItems = dedupeSearchItems(courseItems).sort(byScoreThenTitle).slice(0, limitPerSection);
  const noticeItems = (Array.isArray(notices) ? notices : []).map((notice, index) => {
    const title = safeText(notice?.title);
    const summary = normalizeNoticeSummary(notice);
    const score = Math.max(
      scoreText(title, normalizedQuery, 100),
      scoreText(summary, normalizedQuery, 65)
    );
    return {
      type: "notice",
      id: safeText(notice?.id || notice?.title || `notice-${index}`),
      title,
      subtitle: summary,
      target: "notice",
      raw: notice,
      score
    };
  }).filter((item) => item.title && item.score > 0).sort(byScoreThenTitle).slice(0, limitPerSection);
  return [
    { title: "服务", items: serviceItems },
    { title: "课程", items: dedupedCourseItems },
    { title: "资讯", items: noticeItems }
  ].filter((section) => section.items.length > 0);
};
const FALLBACK_SCALE = { leftPct: 46, widthPct: 8 };
const MIN_VISIBLE_WIDTH_PCT = 8;
const FALLBACK_TEXT_COLOR = "#64748b";
const FALLBACK_BAR_COLOR = "#94a3b8";
const toFiniteTemperature = (value) => {
  if (value === null || value === void 0) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const temperature = Number(value);
  return Number.isFinite(temperature) ? temperature : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundPct = (value) => Math.round(value * 100) / 100;
const getTemperatureColor = (temperatureValue, usage = "bar") => {
  const temperature = toFiniteTemperature(temperatureValue);
  if (temperature === null) return usage === "text" ? FALLBACK_TEXT_COLOR : FALLBACK_BAR_COLOR;
  if (usage === "text") {
    if (temperature < 8) return "#2563eb";
    if (temperature < 24) return "#0f766e";
    if (temperature < 32) return "#c2410c";
    return "#dc2626";
  }
  if (temperature < 8) return "#60a5fa";
  if (temperature < 24) return "#2dd4bf";
  if (temperature < 32) return "#fb923c";
  return "#f87171";
};
const getWeatherIconTone = (conditionValue) => {
  const condition = String(conditionValue || "").trim();
  if (condition.includes("雷") || condition.includes("暴雨") || condition.includes("大雨")) {
    return { category: "heavyRain", color: "#3f6f95" };
  }
  if (condition.includes("雨")) {
    return { category: "rain", color: "#4f8fbf" };
  }
  if (condition.includes("雪")) {
    return { category: "snow", color: "#7b8fc5" };
  }
  if (condition.includes("雾") || condition.includes("霾")) {
    return { category: "fog", color: "#8491a0" };
  }
  if (condition.includes("阴")) {
    return { category: "overcast", color: "#6f7f91" };
  }
  if (condition.includes("云")) {
    return { category: "cloudy", color: "#7b8798" };
  }
  if (condition.includes("晴")) {
    return { category: "sunny", color: "#d99a2b" };
  }
  return { category: "default", color: "#6f95b8" };
};
const getForecastTemperatureBounds = (forecast = []) => {
  const lows = [];
  const highs = [];
  for (const day of forecast) {
    const low = toFiniteTemperature(day?.temp_low);
    const high = toFiniteTemperature(day?.temp_high);
    if (low === null || high === null) continue;
    lows.push(Math.min(low, high));
    highs.push(Math.max(low, high));
  }
  if (lows.length === 0 || highs.length === 0) {
    return { min: 0, max: 0, span: 0 };
  }
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  return { min, max, span: max - min };
};
const getTemperatureRangeScale = (lowValue, highValue, bounds) => {
  const low = toFiniteTemperature(lowValue);
  const high = toFiniteTemperature(highValue);
  const min = toFiniteTemperature(bounds?.min);
  const max = toFiniteTemperature(bounds?.max);
  const span = toFiniteTemperature(bounds?.span);
  if (low === null || high === null || min === null || max === null || span === null || span <= 0) {
    return { ...FALLBACK_SCALE };
  }
  const rangeLow = Math.min(low, high);
  const rangeHigh = Math.max(low, high);
  const rawLeft = (rangeLow - min) / span * 100;
  const rawWidth = (rangeHigh - rangeLow) / span * 100;
  const center = rawLeft + rawWidth / 2;
  const widthPct = clamp(rawWidth, MIN_VISIBLE_WIDTH_PCT, 100);
  const leftPct = clamp(center - widthPct / 2, 0, 100 - widthPct);
  return {
    leftPct: roundPct(leftPct),
    widthPct: roundPct(widthPct)
  };
};
const getTemperatureRangeStyle = (low, high, bounds) => {
  const scale = getTemperatureRangeScale(low, high, bounds);
  return {
    left: `${scale.leftPct}%`,
    width: `${scale.widthPct}%`,
    background: `linear-gradient(90deg, ${getTemperatureColor(low, "bar")} 0%, ${getTemperatureColor(high, "bar")} 100%)`
  };
};
const _hoisted_1 = { class: "dashboard-root antialiased max-w-[520px] mx-auto relative min-h-screen bg-[#f0f4f8]" };
const _hoisted_2 = { class: "flex items-center justify-between px-4 pt-4 pb-4" };
const _hoisted_3 = { class: "flex items-center space-x-3 flex-1 ml-4" };
const _hoisted_4 = { class: "relative flex-1" };
const _hoisted_5 = { class: "px-4 space-y-6 pb-6" };
const _hoisted_6 = { class: "flex justify-between items-end" };
const _hoisted_7 = { class: "text-3xl font-bold text-gray-900" };
const _hoisted_8 = { class: "flex flex-col items-end" };
const _hoisted_9 = { class: "flex items-center space-x-1" };
const _hoisted_10 = { class: "font-semibold text-gray-800" };
const _hoisted_11 = { class: "text-xs text-gray-500" };
const _hoisted_12 = { class: "bg-white rounded-2xl p-4 flex items-center justify-between gap-3 card-shadow" };
const _hoisted_13 = { class: "min-w-0" };
const _hoisted_14 = { class: "flex items-center space-x-2" };
const _hoisted_15 = { class: "font-bold text-lg text-gray-800 truncate" };
const _hoisted_16 = { class: "text-xs text-gray-500 mt-1 truncate" };
const _hoisted_17 = ["aria-label", "title"];
const _hoisted_18 = {
  key: 0,
  class: "bg-orange-50 border border-orange-200 rounded-2xl p-4 card-shadow",
  role: "status",
  "aria-live": "polite"
};
const _hoisted_19 = { class: "flex items-start justify-between gap-2" };
const _hoisted_20 = { class: "min-w-0" };
const _hoisted_21 = { class: "font-bold text-orange-800 text-sm" };
const _hoisted_22 = { class: "text-[11px] text-orange-500 mt-0.5" };
const _hoisted_23 = { class: "text-xs text-orange-700 mt-2 leading-relaxed" };
const _hoisted_24 = {
  key: 0,
  class: "mt-2 text-[11px] text-orange-900/80 bg-white/60 border border-orange-100 rounded-xl px-2.5 py-2 break-words"
};
const _hoisted_25 = {
  key: 1,
  class: "mt-2 text-[10px] text-orange-500"
};
const _hoisted_26 = {
  key: 2,
  class: "mt-3 pt-2 border-t border-orange-100"
};
const _hoisted_27 = ["onClick"];
const _hoisted_28 = { class: "line-clamp-2" };
const _hoisted_29 = { class: "mt-3 flex flex-wrap gap-2" };
const _hoisted_30 = ["disabled"];
const _hoisted_31 = { class: "bg-white rounded-2xl p-5 card-shadow relative" };
const _hoisted_32 = { class: "flex justify-between items-center mb-5" };
const _hoisted_33 = {
  key: 0,
  class: "text-center py-8 text-gray-400 text-sm"
};
const _hoisted_34 = {
  key: 1,
  class: "text-center py-8 text-gray-400 text-sm"
};
const _hoisted_35 = {
  key: 2,
  class: "text-center py-8 text-red-400 text-sm"
};
const _hoisted_36 = {
  key: 3,
  class: "flex flex-col items-center py-8"
};
const _hoisted_37 = {
  key: 4,
  class: "relative"
};
const _hoisted_38 = { class: "w-12 flex flex-col items-start shrink-0" };
const _hoisted_39 = { class: "text-sm font-medium text-gray-800 leading-tight" };
const _hoisted_40 = { class: "text-xs text-gray-400 mt-0.5" };
const _hoisted_41 = { class: "flex-1 flex justify-between items-start pl-1 pr-1" };
const _hoisted_42 = { class: "min-w-0 flex-1 mr-2" };
const _hoisted_43 = { class: "font-medium text-gray-800 text-base truncate" };
const _hoisted_44 = { class: "text-xs text-gray-500 mt-1 flex items-center" };
const _hoisted_45 = {
  key: 1,
  class: "w-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-2xl pt-3 pb-4 pr-4 flex shadow-lg relative overflow-hidden"
};
const _hoisted_46 = { class: "w-12 flex flex-col items-start shrink-0 text-white relative z-10" };
const _hoisted_47 = { class: "text-sm font-bold leading-tight" };
const _hoisted_48 = { class: "text-xs opacity-80 mt-0.5" };
const _hoisted_49 = { class: "flex-1 text-white relative z-10 pl-1 pr-20" };
const _hoisted_50 = { class: "text-[10px] bg-blue-400 bg-opacity-50 px-2 py-0.5 rounded text-white inline-block mb-1" };
const _hoisted_51 = { class: "font-bold text-xl mb-1" };
const _hoisted_52 = { class: "text-xs opacity-90 flex items-center" };
const _hoisted_53 = { class: "absolute right-0 top-0 bottom-0 flex flex-col justify-center items-end w-36" };
const _hoisted_54 = { class: "relative z-10 text-right mb-2 text-white text-xs pr-3" };
const _hoisted_55 = { class: "w-12 flex flex-col items-start shrink-0" };
const _hoisted_56 = { class: "text-sm font-medium text-gray-800 leading-tight" };
const _hoisted_57 = { class: "text-xs text-gray-400 mt-0.5" };
const _hoisted_58 = { class: "flex-1 flex justify-between items-start pl-1 pr-1" };
const _hoisted_59 = { class: "min-w-0 flex-1 mr-2" };
const _hoisted_60 = { class: "font-medium text-gray-800 text-base truncate" };
const _hoisted_61 = { class: "text-xs text-gray-500 mt-1 flex items-center" };
const _hoisted_62 = {
  key: 5,
  class: "mt-6 pt-4 border-t border-gray-100 flex justify-between items-center px-2"
};
const _hoisted_63 = { class: "flex items-center space-x-2" };
const _hoisted_64 = { class: "text-sm font-bold text-gray-800" };
const _hoisted_65 = { class: "flex items-center space-x-2" };
const _hoisted_66 = { class: "text-sm font-bold text-gray-800" };
const _hoisted_67 = { class: "flex items-center space-x-2" };
const _hoisted_68 = { class: "text-sm font-bold text-gray-800" };
const _hoisted_69 = { class: "bg-white rounded-2xl p-5 card-shadow" };
const _hoisted_70 = { class: "grid grid-cols-5 gap-y-4" };
const _hoisted_71 = ["onClick"];
const _hoisted_72 = ["data-module"];
const _hoisted_73 = { class: "text-[11px] text-gray-600" };
const _hoisted_74 = { class: "bg-white rounded-2xl p-5 card-shadow home-all-features" };
const _hoisted_75 = {
  class: "home-feature-tabs",
  role: "tablist",
  "aria-label": "功能分类"
};
const _hoisted_76 = ["aria-selected", "onClick"];
const _hoisted_77 = ["onClick"];
const _hoisted_78 = { class: "text-xs text-gray-700 text-center" };
const _hoisted_79 = { class: "w-full max-w-md bg-white rounded-[24px] shadow-2xl overflow-hidden animate-scale-in" };
const _hoisted_80 = { class: "px-4 pt-4 pb-3 border-b border-gray-100" };
const _hoisted_81 = { class: "flex items-center gap-2" };
const _hoisted_82 = { class: "relative flex-1" };
const _hoisted_83 = { class: "max-h-[68vh] overflow-y-auto px-4 py-4" };
const _hoisted_84 = {
  key: 0,
  class: "space-y-3"
};
const _hoisted_85 = { class: "grid grid-cols-2 gap-2" };
const _hoisted_86 = ["onClick"];
const _hoisted_87 = { class: "min-w-0" };
const _hoisted_88 = { class: "block text-sm text-gray-800 truncate" };
const _hoisted_89 = { class: "block text-xs text-gray-400 truncate" };
const _hoisted_90 = {
  key: 1,
  class: "space-y-5"
};
const _hoisted_91 = { class: "text-xs font-semibold text-gray-400 px-1" };
const _hoisted_92 = ["onClick"];
const _hoisted_93 = { class: "min-w-0 flex-1" };
const _hoisted_94 = { class: "block text-sm text-gray-800 truncate" };
const _hoisted_95 = { class: "block text-xs text-gray-400 truncate" };
const _hoisted_96 = {
  key: 2,
  class: "py-10 text-center"
};
const _hoisted_97 = { class: "w-[92%] max-w-sm rounded-[28px] overflow-hidden shadow-2xl animate-scale-in bg-white" };
const _hoisted_98 = { class: "flex justify-between items-start relative z-10" };
const _hoisted_99 = { class: "text-center my-6 relative z-10" };
const _hoisted_100 = { class: "flex justify-center gap-3 relative z-10" };
const _hoisted_101 = { class: "bg-black/5 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5" };
const _hoisted_102 = { class: "bg-black/5 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5" };
const _hoisted_103 = { class: "bg-black/5 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5" };
const _hoisted_104 = { class: "bg-white px-5 pt-5 pb-4" };
const _hoisted_105 = { class: "flex gap-4 overflow-x-auto pb-2 scrollbar-hide" };
const _hoisted_106 = { class: "text-[11px] text-gray-500 mb-1.5" };
const _hoisted_107 = { class: "text-sm font-semibold text-gray-800" };
const _hoisted_108 = { class: "bg-white px-5 pt-3 pb-5 border-t border-gray-100/80" };
const _hoisted_109 = { class: "space-y-3" };
const _hoisted_110 = { class: "text-sm text-gray-600 w-10 font-medium" };
const _hoisted_111 = { class: "text-xs text-gray-400 w-10 ml-1" };
const _hoisted_112 = { class: "flex-1 mx-2 h-[6px] rounded-full bg-gray-100 relative overflow-hidden" };
const _hoisted_113 = { class: "quick-entry-editor-panel w-full max-w-md bg-white rounded-t-3xl p-6 animate-slide-up max-h-[80vh] overflow-y-auto" };
const _hoisted_114 = { class: "flex items-center justify-between mb-4" };
const _hoisted_115 = { class: "text-xs text-gray-500 mb-4" };
const _hoisted_116 = { class: "grid grid-cols-4 gap-3 mb-6" };
const _hoisted_117 = ["onClick"];
const _hoisted_118 = ["data-module"];
const _hoisted_119 = { class: "text-[10px] text-gray-600 text-center" };
const _hoisted_120 = {
  key: 0,
  class: "w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center mt-1"
};
const _hoisted_121 = ["disabled"];
const TICKER_AUTO_SPEED = 26;
const LOGIN_METHOD_KEY = "hbu_login_method";
const CLOCK_TICK_MS = 1e3;
const WEATHER_CACHE_KEY = "dashboard:weather";
const WEATHER_CACHE_TTL = 5 * 60 * 1e3;
const QUICK_ENTRY_KEY = "hbu_quick_entry_modules";
const HOME_FEATURE_TAB_KEY = "hbu_home_feature_tab";
const FEATURE_GRID_COLS = 4;
const _sfc_main = {
  __name: "Dashboard",
  props: {
    studentId: { type: String, default: "" },
    userUuid: { type: String, default: "" },
    isLoggedIn: { type: Boolean, default: false },
    jwxtMaintenance: { type: Boolean, default: false },
    jwxtMaintenanceHint: { type: String, default: "" },
    jwxtMaintenanceDetail: { type: String, default: "" },
    jwxtRecoveryPhase: { type: String, default: "idle" },
    jwxtLastCheckTime: { type: String, default: "" },
    tickerNotices: { type: Array, default: () => [] },
    pinnedNotices: { type: Array, default: () => [] },
    noticeList: { type: Array, default: () => [] }
  },
  emits: [
    "navigate",
    "logout",
    "require-login",
    "retry-session-recovery",
    "open-notice",
    "openSettings"
  ],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const maintenanceTitle = computed(() => {
      const phase = String(props.jwxtRecoveryPhase || "");
      if (phase === "recovering") return "正在后台恢复登录";
      if (phase === "need_login") return "需要重新登录";
      if (phase === "failed") return "会话恢复未成功";
      return "教务系统正在维护";
    });
    const maintenancePhaseLabel = computed(() => {
      const phase = String(props.jwxtRecoveryPhase || "");
      if (phase === "recovering") return "后台自动登录中";
      if (phase === "need_login") return "请手动登录";
      if (phase === "failed") return "将定时重试";
      if (phase === "maintenance") return "教务暂不可用";
      return "状态未知";
    });
    const maintenanceNotices = computed(() => {
      const pick = (list) => (Array.isArray(list) ? list : []).map((n) => ({
        id: n?.id || n?.key || n?.title || "",
        title: String(n?.title || n?.name || stripMarkdown(n?.content || n?.body || "") || "").trim(),
        raw: n
      })).filter((n) => n.title);
      const pinned = pick(props.pinnedNotices).slice(0, 3);
      if (pinned.length) return pinned;
      const ticker = pick(props.tickerNotices).slice(0, 3);
      if (ticker.length) return ticker;
      return pick(props.noticeList).slice(0, 3);
    });
    const sessionDetailOpen = ref(false);
    const sessionStatusVisual = computed(() => {
      if (!props.isLoggedIn) return "red";
      const phase = String(props.jwxtRecoveryPhase || "idle");
      if (phase === "recovering") return "blink";
      if (phase === "failed" || phase === "need_login" || phase === "maintenance") {
        return "red";
      }
      if (props.jwxtMaintenance && phase !== "idle") return "red";
      if (props.jwxtMaintenance && phase === "idle") return "red";
      return "green";
    });
    const sessionStatusAria = computed(() => {
      const v = sessionStatusVisual.value;
      if (v === "green") return "会话已连接";
      if (v === "blink") return "正在重连会话，点击查看详情";
      return "会话异常或未连接，点击查看详情";
    });
    const onSessionStatusClick = (event) => {
      event?.stopPropagation?.();
      event?.preventDefault?.();
      if (sessionStatusVisual.value === "green") {
        sessionDetailOpen.value = false;
        return;
      }
      sessionDetailOpen.value = !sessionDetailOpen.value;
    };
    watch(
      () => [props.jwxtMaintenance, props.jwxtRecoveryPhase, props.isLoggedIn],
      () => {
        if (sessionStatusVisual.value === "green") {
          sessionDetailOpen.value = false;
        }
      }
    );
    const uiSettings = useUiSettings();
    const cardListeners = [];
    const isMobileNoticeSwipe = ref(false);
    const isTickerInteracting = ref(false);
    const tickerItemsRef = ref(null);
    const tickerTranslateX = ref(0);
    const tickerTransitionMs = ref(0);
    const tickerStepWidth = ref(236);
    const tickerLoopWidth = ref(0);
    let tickerRafId = 0;
    let tickerLastFrameTs = 0;
    let noticeResizeRaf = 0;
    let lastNoticeViewportWidth = 0;
    const API_BASE = "/api";
    const JWXT_MODULE_ALLOWLIST = /* @__PURE__ */ new Set([
      "grades",
      "classroom",
      "exams",
      "ranking",
      "calendar",
      "school_inbox",
      "academic",
      "qxzkb",
      "course_selection",
      "training",
      "teaching_eval",
      "library",
      "campus_map",
      "resource_share",
      "chaoxing_hub",
      "chaoxing_inbox",
      "chaoxing_class",
      "broadband",
      "sports_venue",
      "towergo",
      "smart_orientation"
    ]);
    const loginMethod = ref("");
    const isChaoxingMethod = (value) => String(value || "").trim().startsWith("chaoxing");
    const refreshLoginMethod = () => {
      loginMethod.value = String(localStorage.getItem(LOGIN_METHOD_KEY) || "").trim();
    };
    const todayCourses = ref([]);
    const homeSearchCourses = ref([]);
    const todayLoading = ref(false);
    const todayError = ref("");
    const nowTick = ref(Date.now());
    let clockTimer = null;
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
    const toMinutes = (timeText) => {
      if (!timeText || !timeText.includes(":")) return 0;
      const [h, m] = timeText.split(":").map(Number);
      return h * 60 + m;
    };
    const greetingText = computed(() => {
      const hour = new Date(nowTick.value).getHours();
      if (hour >= 5 && hour < 8) return "早上好";
      if (hour >= 8 && hour < 11) return "上午好";
      if (hour >= 11 && hour < 13) return "中午好";
      if (hour >= 13 && hour < 17) return "下午好";
      if (hour >= 17 && hour < 19) return "傍晚好";
      if (hour >= 19 && hour < 22) return "晚上好";
      return "夜深了";
    });
    const userCollegeInfo = computed(() => {
      const sid = String(props.studentId || "").trim();
      if (!sid) return "湖北工业大学";
      try {
        const raw = localStorage.getItem(`cache:studentinfo:${sid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const info = parsed?.data?.data || parsed?.data || {};
          const college = String(info.college || "").trim();
          const grade = String(info.grade || "").trim();
          if (college && grade) return `${college} • ${grade}级`;
          if (college) return college;
        }
      } catch (_e) {
      }
      return "湖北工业大学";
    });
    const currentMinutePrecise = computed(() => {
      const now = new Date(nowTick.value);
      return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    });
    const timelineCourses = computed(() => {
      return todayCourses.value.filter((course) => course.endMinutes > currentMinutePrecise.value);
    });
    const syncNowTick = () => {
      nowTick.value = Date.now();
    };
    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") syncNowTick();
    };
    const getTodayWeekday = () => {
      const day = new Date(nowTick.value).getDay();
      return day === 0 ? 7 : day;
    };
    const getCurrentWeek = (metaWeek) => {
      if (Number(metaWeek) > 0) return Number(metaWeek);
      try {
        const cachedMeta = localStorage.getItem("hbu_schedule_meta");
        if (!cachedMeta) return 1;
        const parsed = JSON.parse(cachedMeta);
        const week = Number(parsed?.current_week || 1);
        return week > 0 ? week : 1;
      } catch (e) {
        return 1;
      }
    };
    const getPreferredScheduleSemester = () => {
      const lockDetail = readScheduleLockDetail(props.studentId);
      const lockedSemester = String(lockDetail?.semester || "").trim();
      if (lockedSemester) return { semester: lockedSemester, source: "lock", reason: String(lockDetail?.reason || "").trim() };
      try {
        const cachedMeta = localStorage.getItem("hbu_schedule_meta");
        if (!cachedMeta) return { semester: "", source: "none", reason: "" };
        const parsed = JSON.parse(cachedMeta);
        return { semester: String(parsed?.semester || "").trim(), source: "meta", reason: "" };
      } catch (e) {
        return { semester: "", source: "none", reason: "" };
      }
    };
    const isVacationPreviousMeta = (meta = {}) => {
      const strategy = String(meta?.auto_strategy || "").trim();
      const notice = String(meta?.vacation_notice || "").trim();
      return strategy === "vacation_previous" || notice.includes("当前为假期");
    };
    const buildScheduleCacheKey = (studentId, semester) => {
      const sid = String(studentId || "").trim();
      const sem = String(semester || "").trim();
      if (!sid) return "";
      return sem ? `schedule:${sid}:${sem}` : `schedule:${sid}`;
    };
    const toPositiveInt2 = (value, fallback = 0) => {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return fallback;
      return Math.floor(num);
    };
    const normalizeWeeks2 = (weeks) => {
      if (!Array.isArray(weeks)) return [];
      return weeks.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
    };
    const getCoursePeriodRange2 = (course) => {
      const startPeriod = toPositiveInt2(course?.period ?? course?.start_period, 0);
      if (startPeriod < 1 || startPeriod > 11) return null;
      const endByField = toPositiveInt2(course?.end_period, 0);
      const span = Math.max(1, toPositiveInt2(course?.djs ?? course?.duration, 1));
      const computedEnd = endByField > 0 ? endByField : startPeriod + span - 1;
      const endPeriod = Math.min(11, Math.max(startPeriod, computedEnd));
      return { startPeriod, endPeriod };
    };
    const getTodayCourseSignature = (course, room, teacher) => {
      const name = String(course?.name || "").trim();
      const className = String(course?.class_name || "").trim();
      const building = String(course?.building || "").trim();
      const custom = course?.is_custom ? "1" : "0";
      return `${name}|${teacher}|${room}|${className}|${building}|${custom}`;
    };
    const fetchCustomCoursesForToday = async (semester) => {
      const sid = String(props.studentId || "").trim();
      const sem = String(semester || "").trim();
      if (!sid || !sem) return [];
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list`, { student_id: sid, semester: sem });
        if (!res.data?.success) return [];
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        return list.filter((course) => {
          const weekday = toPositiveInt2(course?.weekday, 0);
          const hasName = !!String(course?.name || "").trim();
          const range = getCoursePeriodRange2(course);
          return hasName && weekday >= 1 && weekday <= 7 && !!range;
        });
      } catch (_error) {
        return [];
      }
    };
    const buildTodayCourses = (courses, currentWeek) => {
      const safeWeek = toPositiveInt2(currentWeek, 1);
      const todayWeekday = getTodayWeekday();
      const normalized = (courses || []).filter((course) => toPositiveInt2(course?.weekday, 0) === todayWeekday).filter((course) => {
        const weeks = normalizeWeeks2(course?.weeks);
        return weeks.length === 0 || weeks.includes(safeWeek);
      }).map((course) => {
        const range = getCoursePeriodRange2(course);
        if (!range) return null;
        return { ...course, startPeriod: range.startPeriod, endPeriod: range.endPeriod, room: course?.room_code || course?.room || "-", teacher: course?.teacher || "-" };
      }).filter(Boolean);
      const signatureCount = /* @__PURE__ */ new Map();
      normalized.forEach((course) => {
        const signature = getTodayCourseSignature(course, course.room, course.teacher);
        signatureCount.set(signature, (signatureCount.get(signature) || 0) + 1);
      });
      const daily = normalized.map((course) => {
        const signature = getTodayCourseSignature(course, course.room, course.teacher);
        const rawSpan = Math.max(1, course.endPeriod - course.startPeriod + 1);
        const duplicateCount = Number(signatureCount.get(signature) || 0);
        const unitSpan = course.is_custom ? rawSpan : duplicateCount > 1 ? 1 : rawSpan;
        const endPeriod = Math.min(11, course.startPeriod + unitSpan - 1);
        return { ...course, signature, rawSpan, unitSpan, endPeriod };
      }).sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod);
      const merged = [];
      let index = 0;
      while (index < daily.length) {
        const current = daily[index];
        const room = current.room;
        const teacher = current.teacher;
        const startPeriod = current.startPeriod;
        let endPeriod = current.endPeriod;
        let nextIndex = index + 1;
        while (nextIndex < daily.length) {
          const next = daily[nextIndex];
          if (current.unitSpan === 1 && next.unitSpan === 1 && next.signature === current.signature && next.startPeriod === endPeriod + 1) {
            endPeriod = next.endPeriod;
            nextIndex += 1;
          } else {
            break;
          }
        }
        const startText = periodTimeMap[startPeriod]?.start || "--:--";
        const endText = periodTimeMap[endPeriod]?.end || "--:--";
        merged.push({
          key: `${current.name}-${teacher}-${startPeriod}-${endPeriod}-${room}`,
          name: current.name,
          teacher,
          room,
          start: startText,
          end: endText,
          startMinutes: toMinutes(startText),
          endMinutes: toMinutes(endText)
        });
        index = nextIndex;
      }
      return merged;
    };
    const fetchTodayCourses = async () => {
      if (!props.isLoggedIn || !props.studentId) {
        todayCourses.value = [];
        homeSearchCourses.value = [];
        todayError.value = "";
        return;
      }
      const preferredInfo = getPreferredScheduleSemester();
      const preferredSemester = String(preferredInfo?.semester || "").trim();
      const sid = String(props.studentId || "").trim();
      const cacheKey = buildScheduleCacheKey(props.studentId, preferredSemester);
      const cached = getCachedData(cacheKey);
      if (cached?.data?.success && !cached.data.offline) {
        todayLoading.value = false;
      } else {
        todayLoading.value = true;
      }
      todayError.value = "";
      try {
        let customCourses = [];
        let payload = cached?.data;
        if (!payload?.success) {
          const res = await fetchWithCache(cacheKey, async () => {
            const rsp = await axiosInstance.post(`${API_BASE}/v2/schedule/query`, { student_id: props.studentId, semester: preferredSemester || void 0 });
            return rsp.data;
          }, void 0, DEFAULT_SWR_OPTIONS);
          payload = res?.data;
        }
        const shouldForceOnlineRetry = !!payload?.success && !!payload?.offline && isVacationPreviousMeta(payload?.meta);
        if (shouldForceOnlineRetry && sid) {
          try {
            const onlineRes = await axiosInstance.post(`${API_BASE}/v2/schedule/query`, { student_id: sid, semester: void 0 });
            const onlinePayload = onlineRes?.data;
            if (onlinePayload?.success && !onlinePayload?.offline) {
              payload = onlinePayload;
              const onlineSemester = String(onlinePayload?.meta?.semester || "").trim();
              if (onlineSemester) setCachedData(`schedule:${sid}:${onlineSemester}`, onlinePayload);
              setCachedData(`schedule:${sid}`, onlinePayload);
            }
          } catch (_error) {
          }
        }
        const semesterForCustom = String(payload?.meta?.semester || preferredSemester || "").trim();
        customCourses = await fetchCustomCoursesForToday(semesterForCustom);
        if (!payload?.success) {
          if (customCourses.length > 0) {
            const week2 = getCurrentWeek();
            todayCourses.value = buildTodayCourses(customCourses, week2);
            homeSearchCourses.value = buildWeeklyCourseSearchEntries({ courses: customCourses, currentWeek: week2, periodTimeMap });
            todayError.value = "";
          } else {
            todayCourses.value = [];
            homeSearchCourses.value = [];
            todayError.value = payload?.error || "今日课程加载失败";
          }
          return;
        }
        if (payload?.meta) {
          const nextWeek = Number(payload.meta.current_week || 0);
          const persistedWeek = nextWeek > 0 ? nextWeek : getCurrentWeek();
          if (!isTestAccountSession()) {
            localStorage.setItem("hbu_schedule_meta", JSON.stringify({ semester: payload.meta.semester || preferredSemester || "", start_date: payload.meta.start_date || "", current_week: persistedWeek }));
          }
        }
        const week = getCurrentWeek(payload?.meta?.current_week);
        const remoteCourses = Array.isArray(payload?.data) ? payload.data : [];
        const mergedCourses = [...remoteCourses, ...customCourses];
        todayCourses.value = buildTodayCourses(mergedCourses, week);
        homeSearchCourses.value = buildWeeklyCourseSearchEntries({ courses: mergedCourses, currentWeek: week, periodTimeMap });
        todayError.value = "";
      } catch (error) {
        todayCourses.value = [];
        homeSearchCourses.value = [];
        todayError.value = "今日课程加载失败";
      } finally {
        todayLoading.value = false;
      }
    };
    const baseModules = [
      { id: "grades", name: "成绩查询", iconKey: "grades", color: "#667eea", desc: "查看所有学期成绩", available: true, requiresLogin: true },
      { id: "classroom", name: "空教室", iconKey: "classroom", color: "#ed8936", desc: "查询空闲教室", available: true, requiresLogin: true },
      { id: "electricity", name: "电费查询", iconKey: "electricity", color: "#e53e3e", desc: "宿舍电费余额", available: true, requiresLogin: true },
      { id: "transactions", name: "交易记录", iconKey: "transactions", color: "#F56C6C", desc: "一码通消费记录", available: true, requiresLogin: true },
      { id: "exams", name: "考试安排", iconKey: "exams", color: "#38b2ac", desc: "查询考试时间地点", available: true, requiresLogin: true },
      { id: "ranking", name: "绩点排名", iconKey: "ranking", color: "#f6ad55", desc: "专业班级排名", available: true, requiresLogin: true },
      { id: "campus_code", name: "校园码", iconKey: "campus_code", color: "#0f766e", desc: "在线/高能模式二维码", available: true, requiresLogin: true },
      { id: "calendar", name: "校历", iconKey: "calendar", color: "#3b82f6", desc: "查看学期校历", available: true, requiresLogin: true },
      { id: "school_inbox", name: "学校消息", iconKey: "school_inbox", color: "#6366f1", desc: "教务与学习通消息", available: true, requiresLogin: true },
      { id: "academic", name: "学业情况", iconKey: "academic", color: "#10b981", desc: "学业完成度与课程进度", available: true, requiresLogin: true },
      { id: "qxzkb", name: "全校课表", iconKey: "qxzkb", color: "#6366f1", desc: "查询全校课程与排课", available: true, requiresLogin: true },
      { id: "course_selection", name: "选课中心", iconKey: "course_selection", color: "#f59e0b", desc: "通识选课与退课", available: true, requiresLogin: true },
      { id: "training", name: "培养方案", iconKey: "training", color: "#0ea5e9", desc: "培养方案与课程设置", available: true, requiresLogin: true },
      { id: "teaching_eval", name: "教学评教", iconKey: "teaching_eval", color: "#a855f7", desc: "待评课程与一键满分提交", available: true, requiresLogin: true },
      { id: "chaoxing_hub", name: "课程中心", iconKey: "chaoxing_hub", color: "#2563eb", desc: "学习通课程、作业与进度", available: true, requiresLogin: true },
      { id: "chaoxing_inbox", name: "收件箱", iconKey: "chaoxing_inbox", color: "#4f46e5", desc: "学习通通知与消息", available: true, requiresLogin: true },
      { id: "chaoxing_class", name: "资料分享", iconKey: "chaoxing_class", color: "#3b82f6", desc: "邀请码入班与班级资料", available: true, requiresLogin: true },
      { id: "broadband", name: "教育网网费", iconKey: "broadband", color: "#0891b2", desc: "校园网费用查询与缴纳入口", available: true, requiresLogin: true },
      // 场馆依赖 172.16.54.20 校园网 + accessToken；外网/无校园网时 third/open 无法落地，暂禁用避免死入口
      { id: "sports_venue", name: "运动场馆", iconKey: "sports_venue", color: "#16a34a", desc: "场馆预约需校园网（暂不可用）", available: false, requiresLogin: true },
      { id: "library", name: "图书查询", iconKey: "library", color: "#0f766e", desc: "馆藏检索与定位", available: true, requiresLogin: false },
      { id: "campus_map", name: "校园地图", iconKey: "campus_map", color: "#14b8a6", desc: "校园地图查看", available: true, requiresLogin: false },
      { id: "resource_share", name: "资源网盘", iconKey: "resource_share", color: "#0ea5e9", desc: "WebDAV 资料浏览与下载", available: true, requiresLogin: false },
      { id: "towergo", name: "小塔出行", iconKey: "towergo", color: "#22c55e", desc: "校园电单车与骑行服务", available: true, requiresLogin: false },
      { id: "smart_orientation", name: "智慧迎新", iconKey: "smart_orientation", color: "#f59e0b", desc: "迎新消息与班导师宿舍等只读信息", available: true, requiresLogin: true },
      { id: "ai", name: "校园助手", iconKey: "ai", color: "#94a3b8", desc: "暂不可用", available: true, requiresLogin: true }
    ];
    const modules = computed(() => {
      void props.isLoggedIn;
      void props.studentId;
      const scoped = !isChaoxingMethod(loginMethod.value) ? baseModules : baseModules.filter((mod) => JWXT_MODULE_ALLOWLIST.has(mod.id));
      return filterAllowedModules(scoped, {
        isLoggedIn: props.isLoggedIn,
        isDemoSession: isTestAccountSession()
      });
    });
    const isHomeLayoutEditing = ref(false);
    const draftHomeWidgetsOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).home.widgetsOrder]);
    const draftHomeModuleOrder = ref([...cloneWorkspaceLayout(uiSettings.workspaceLayout).home.moduleOrder]);
    const activeHomeDragSection = ref("");
    const hoverLayoutKey = ref("");
    const moduleCategories = computed(() => {
      const cats = [
        {
          title: "教务服务",
          modules: modules.value.filter(
            (m) => [
              "grades",
              "exams",
              "ranking",
              "academic",
              "qxzkb",
              "course_selection",
              "training",
              "teaching_eval",
              "classroom",
              "calendar",
              "school_inbox"
            ].includes(m.id)
          )
        },
        {
          title: "学习通",
          modules: modules.value.filter(
            (m) => ["chaoxing_hub", "chaoxing_inbox", "chaoxing_class"].includes(m.id)
          )
        },
        {
          title: "一码通",
          modules: modules.value.filter(
            (m) => ["campus_code", "electricity", "transactions", "broadband", "sports_venue"].includes(m.id)
          )
        },
        {
          title: "资源",
          modules: modules.value.filter(
            (m) => ["library", "campus_map", "resource_share", "towergo", "smart_orientation", "ai"].includes(m.id)
          )
        }
      ];
      return cats.filter((c) => Array.isArray(c.modules) && c.modules.length > 0);
    });
    const navigateTo = (moduleId) => {
      if (!isModuleAllowed(moduleId, {
        isLoggedIn: props.isLoggedIn,
        isDemoSession: isTestAccountSession()
      })) {
        showToast("当前版本不可用该功能");
        return;
      }
      const access = decideHomeNavigate(moduleId, modules.value, {
        isLoggedIn: props.isLoggedIn
      });
      if (!access.ok) {
        if (access.needLogin) {
          emit("require-login");
          return;
        }
        showToast(access.reason || "暂不可用");
        return;
      }
      emit("navigate", moduleId);
    };
    const syncHomeLayoutDraft = () => {
      const snapshot = cloneWorkspaceLayout(uiSettings.workspaceLayout);
      draftHomeWidgetsOrder.value = [...snapshot.home.widgetsOrder];
      draftHomeModuleOrder.value = [...snapshot.home.moduleOrder];
    };
    const stopHomeLayoutDrag = () => {
      activeHomeDragSection.value = "";
      hoverLayoutKey.value = "";
    };
    const getCourseCountdown = (course) => {
      const now = currentMinutePrecise.value;
      if (course.startMinutes <= now && now < course.endMinutes) {
        const remaining = Math.ceil(course.endMinutes - now);
        return `剩余 ${remaining} 分钟`;
      }
      const minutesUntil = Math.ceil(course.startMinutes - now);
      if (minutesUntil <= 0) return "即将开始";
      if (minutesUntil < 60) return `距开始 ${minutesUntil} 分钟`;
      const hours = Math.floor(minutesUntil / 60);
      const mins = minutesUntil % 60;
      return `距开始 ${hours}h${mins > 0 ? mins + "m" : ""}`;
    };
    const handleProfileClick = () => {
      emit("navigate", "me");
    };
    const weatherData = ref({
      temp: "--",
      city: "武汉市洪山区",
      condition: "加载中",
      icon: "fa-cloud",
      humidity: 0,
      wind: "--",
      aqi: 0,
      forecast: []
    });
    const showWeatherDetail = ref(false);
    const forecastTemperatureBounds = computed(() => getForecastTemperatureBounds(weatherData.value.forecast));
    const weatherIconColor = computed(() => getWeatherIconTone(weatherData.value.condition).color);
    const getWeatherIconColor = (condition) => getWeatherIconTone(condition).color;
    const weatherGradientClass = computed(() => {
      const c = weatherData.value.condition;
      if (c === "晴") return "bg-gradient-to-br from-orange-50 to-amber-100";
      if (c === "多云") return "bg-gradient-to-br from-blue-50 to-indigo-50";
      if (c === "阴") return "bg-gradient-to-br from-slate-100 to-slate-200";
      if (c === "小雨" || c === "中雨") return "bg-gradient-to-br from-cyan-50 to-blue-100";
      if (c === "大雨" || c === "雷阵雨") return "bg-gradient-to-br from-gray-200 to-zinc-300";
      if (c === "雪") return "bg-gradient-to-br from-sky-50 to-indigo-100";
      if (c === "雾") return "bg-gradient-to-br from-stone-100 to-stone-200";
      return "bg-gradient-to-br from-blue-50 to-indigo-50";
    });
    const weatherTextClass = computed(() => {
      const c = weatherData.value.condition;
      if (c === "晴") return "text-amber-900";
      if (c === "多云") return "text-indigo-900";
      if (c === "阴") return "text-slate-800";
      if (c === "小雨" || c === "中雨") return "text-blue-900";
      if (c === "大雨" || c === "雷阵雨") return "text-zinc-900";
      if (c === "雪") return "text-indigo-900";
      if (c === "雾") return "text-stone-800";
      return "text-indigo-900";
    });
    const weatherGlowClass = computed(() => {
      const c = weatherData.value.condition;
      if (c === "晴") return "bg-amber-300/20";
      if (c === "多云") return "bg-blue-300/20";
      if (c === "阴") return "bg-slate-400/20";
      if (c === "小雨" || c === "中雨") return "bg-blue-400/20";
      if (c === "大雨" || c === "雷阵雨") return "bg-zinc-500/20";
      if (c === "雪") return "bg-indigo-300/20";
      if (c === "雾") return "bg-stone-400/20";
      return "bg-blue-300/20";
    });
    const weatherTempClass = computed(() => {
      const c = weatherData.value.condition;
      if (c === "晴") return "text-amber-600";
      if (c === "多云") return "text-indigo-600";
      if (c === "阴") return "text-slate-600";
      if (c === "小雨" || c === "中雨") return "text-blue-600";
      if (c === "大雨" || c === "雷阵雨") return "text-zinc-700";
      if (c === "雪") return "text-indigo-600";
      if (c === "雾") return "text-stone-600";
      return "text-indigo-600";
    });
    const weatherPillTextClass = computed(() => {
      const c = weatherData.value.condition;
      if (c === "晴") return "text-amber-800";
      if (c === "多云") return "text-indigo-800";
      if (c === "阴") return "text-slate-700";
      if (c === "小雨" || c === "中雨") return "text-blue-800";
      if (c === "大雨" || c === "雷阵雨") return "text-zinc-800";
      if (c === "雪") return "text-indigo-800";
      if (c === "雾") return "text-stone-700";
      return "text-indigo-800";
    });
    const hourlyForecast = computed(() => {
      if (weatherData.value.hourly && weatherData.value.hourly.length > 0) {
        return weatherData.value.hourly;
      }
      const now = /* @__PURE__ */ new Date();
      const baseTemp = Number(weatherData.value.temp) || 25;
      const result = [];
      for (let i = 0; i < 24; i++) {
        const h = new Date(now.getTime() + i * 36e5);
        const hour = h.getHours();
        const tempOffset = Math.round(Math.sin((hour - 14) * Math.PI / 12) * 5);
        result.push({
          time: i === 0 ? "现在" : `${String(hour).padStart(2, "0")}:00`,
          temp: baseTemp + tempOffset,
          condition: weatherData.value.condition,
          icon: weatherData.value.icon
        });
      }
      return result;
    });
    const loadWeatherFromCache = () => {
      try {
        const raw = localStorage.getItem(WEATHER_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - (parsed.ts || 0) > WEATHER_CACHE_TTL) return null;
        return parsed.data;
      } catch {
        return null;
      }
    };
    const saveWeatherToCache = (data) => {
      try {
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch {
      }
    };
    const fetchWeather = async (force = false) => {
      const cached = !force && loadWeatherFromCache();
      if (cached) {
        weatherData.value = cached;
        return;
      }
      try {
        const { invokeNative } = await __vitePreload(async () => {
          const { invokeNative: invokeNative2 } = await import("./runtime-bridge-apFQ0nCw.js").then((n) => n.Q);
          return { invokeNative: invokeNative2 };
        }, true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
        const data = await invokeNative("fetch_weather");
        if (data) {
          weatherData.value = data;
          saveWeatherToCache(data);
        }
      } catch (e) {
        console.warn("[Weather] 天气获取失败:", e);
        const cachedFallback = loadWeatherFromCache();
        if (cachedFallback) {
          weatherData.value = cachedFallback;
          return;
        }
        weatherData.value = {
          temp: 26,
          city: "武汉市洪山区",
          condition: "晴",
          icon: "fa-sun",
          humidity: 65,
          wind: "东南风 3级",
          aqi: 72,
          forecast: [
            { day: "明天", temp_high: 28, temp_low: 18, condition: "多云", icon: "fa-cloud" },
            { day: "后天", temp_high: 25, temp_low: 16, condition: "小雨", icon: "fa-cloud-rain" }
          ]
        };
      }
    };
    const defaultQuickEntries = ["grades", "exams", "classroom", "electricity", "ranking"];
    const appStoreSessionOpts = () => ({
      isLoggedIn: props.isLoggedIn,
      isDemoSession: isTestAccountSession()
    });
    const quickEntryIds = ref([...defaultQuickEntries]);
    const showQuickEntryEditor = ref(false);
    const draftQuickEntries = ref([...defaultQuickEntries]);
    const loadQuickEntries = () => {
      try {
        const stored = localStorage.getItem(QUICK_ENTRY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length === 5) {
            quickEntryIds.value = parsed;
            return;
          }
        }
      } catch (_e) {
      }
      quickEntryIds.value = [...defaultQuickEntries];
    };
    const saveQuickEntries = () => {
      const session = appStoreSessionOpts();
      const next = draftQuickEntries.value.filter((id) => isModuleAllowed(id, session));
      if (next.length !== 5) {
        showToast("请选择 5 个可用模块");
        return;
      }
      quickEntryIds.value = next;
      localStorage.setItem(QUICK_ENTRY_KEY, JSON.stringify(quickEntryIds.value));
      showQuickEntryEditor.value = false;
      showToast("快捷入口已更新", "success");
    };
    const openQuickEntryEditor = () => {
      const session = appStoreSessionOpts();
      draftQuickEntries.value = quickEntryIds.value.filter((id) => isModuleAllowed(id, session));
      showQuickEntryEditor.value = true;
    };
    const toggleDraftEntry = (id) => {
      if (!isModuleAllowed(id, appStoreSessionOpts())) return;
      const idx = draftQuickEntries.value.indexOf(id);
      if (idx >= 0) {
        draftQuickEntries.value.splice(idx, 1);
      } else if (draftQuickEntries.value.length < 5) {
        draftQuickEntries.value.push(id);
      }
    };
    const quickEntryMeta = {
      grades: { name: "成绩查询", icon: "fa-award", color: "bg-blue-50", iconColor: "text-blue-500" },
      schedule: { name: "课表", icon: "fa-calendar-check", color: "bg-orange-50", iconColor: "text-orange-500" },
      classroom: { name: "空教室", icon: "fa-door-open", color: "bg-green-50", iconColor: "text-green-500" },
      electricity: { name: "电费查询", icon: "fa-bolt", color: "bg-red-50", iconColor: "text-red-500" },
      ranking: { name: "绩点排名", icon: "fa-chart-bar", color: "bg-yellow-50", iconColor: "text-yellow-500" },
      exams: { name: "考试安排", icon: "fa-file-alt", color: "bg-teal-50", iconColor: "text-teal-500" },
      calendar: { name: "校历", icon: "fa-calendar-alt", color: "bg-indigo-50", iconColor: "text-indigo-500" },
      school_inbox: { name: "学校消息", icon: "fa-envelope", color: "bg-indigo-50", iconColor: "text-indigo-600" },
      academic: { name: "学业情况", icon: "fa-chart-line", color: "bg-emerald-50", iconColor: "text-emerald-500" },
      campus_code: { name: "校园码", icon: "fa-qrcode", color: "bg-cyan-50", iconColor: "text-cyan-500" },
      transactions: { name: "交易记录", icon: "fa-wallet", color: "bg-pink-50", iconColor: "text-pink-500" },
      qxzkb: { name: "全校课表", icon: "fa-table", color: "bg-violet-50", iconColor: "text-violet-500" },
      course_selection: { name: "选课中心", icon: "fa-tasks", color: "bg-amber-50", iconColor: "text-amber-500" },
      training: { name: "培养方案", icon: "fa-sitemap", color: "bg-sky-50", iconColor: "text-sky-500" },
      teaching_eval: { name: "教学评教", icon: "fa-star", color: "bg-purple-50", iconColor: "text-purple-500" },
      chaoxing_hub: { name: "课程中心", icon: "fa-graduation-cap", color: "bg-blue-50", iconColor: "text-blue-600" },
      chaoxing_inbox: { name: "收件箱", icon: "fa-inbox", color: "bg-indigo-50", iconColor: "text-indigo-500" },
      chaoxing_class: { name: "资料分享", icon: "fa-folder-open", color: "bg-sky-50", iconColor: "text-sky-600" },
      broadband: { name: "教育网网费", icon: "fa-wifi", color: "bg-cyan-50", iconColor: "text-cyan-600" },
      sports_venue: { name: "运动场馆", icon: "fa-futbol", color: "bg-green-50", iconColor: "text-green-600" },
      library: { name: "图书查询", icon: "fa-book", color: "bg-lime-50", iconColor: "text-lime-600" },
      resource_share: { name: "资源网盘", icon: "fa-cloud", color: "bg-blue-50", iconColor: "text-blue-500" },
      campus_map: { name: "校园地图", icon: "fa-map-marked-alt", color: "bg-teal-50", iconColor: "text-teal-600" },
      resource_share: { name: "资料分享", icon: "fa-folder-open", color: "bg-blue-50", iconColor: "text-blue-600" },
      towergo: { name: "小塔出行", icon: "fa-bicycle", color: "bg-emerald-50", iconColor: "text-emerald-600" },
      smart_orientation: { name: "智慧迎新", icon: "fa-user-graduate", color: "bg-amber-50", iconColor: "text-amber-600" },
      ai: { name: "校园助手", icon: "fa-robot", color: "bg-gray-50", iconColor: "text-gray-500" }
    };
    const quickEntryItems = computed(() => {
      return quickEntryIds.value.map((id) => ({ id, ...quickEntryMeta[id] })).filter((item) => item.name && isModuleAllowed(item.id, appStoreSessionOpts()));
    });
    const editableQuickEntryMeta = computed(() => {
      const session = appStoreSessionOpts();
      return Object.fromEntries(
        Object.entries(quickEntryMeta).filter(([id]) => isModuleAllowed(id, session))
      );
    });
    const handleQuickEntryClick = (id) => {
      persistHomeFeatureTab();
      if (id === "schedule") {
        emit("navigate", "schedule");
        return;
      }
      navigateFromHome(id);
    };
    const readStoredHomeFeatureTab = () => {
      try {
        return localStorage.getItem(HOME_FEATURE_TAB_KEY) || "教务服务";
      } catch (_e) {
        return "教务服务";
      }
    };
    const activeFeatureTab = ref(readStoredHomeFeatureTab());
    const persistHomeFeatureTab = () => {
      try {
        localStorage.setItem(HOME_FEATURE_TAB_KEY, activeFeatureTab.value);
      } catch (_e) {
      }
    };
    watch(
      moduleCategories,
      (cats) => {
        if (!cats.length) return;
        if (!cats.some((c) => c.title === activeFeatureTab.value)) {
          activeFeatureTab.value = cats[0].title;
          persistHomeFeatureTab();
        }
      },
      { immediate: true }
    );
    const featureGridMaxRows = computed(() => {
      const counts = moduleCategories.value.map((c) => Array.isArray(c.modules) ? c.modules.length : 0);
      const maxCount = counts.length ? Math.max(...counts) : 1;
      return Math.max(1, Math.ceil(maxCount / FEATURE_GRID_COLS));
    });
    const featureGridMinHeightPx = computed(() => {
      const rows = featureGridMaxRows.value;
      const rowBody = 74;
      const rowGap = 24;
      return rows * rowBody + Math.max(0, rows - 1) * rowGap;
    });
    const featureGridStyle = computed(() => ({
      minHeight: `${featureGridMinHeightPx.value}px`
    }));
    const readHomeShellScrollTop = () => {
      try {
        const shell = typeof document !== "undefined" ? document.querySelector(".app-shell") : null;
        if (shell && typeof shell.scrollTop === "number" && Number.isFinite(shell.scrollTop)) {
          return Math.max(0, shell.scrollTop);
        }
      } catch {
      }
      return null;
    };
    const restoreHomeShellScrollTop = (top) => {
      if (top == null || !Number.isFinite(top)) return;
      try {
        const shell = typeof document !== "undefined" ? document.querySelector(".app-shell") : null;
        if (!shell) return;
        const maxTop = Math.max(0, (shell.scrollHeight || 0) - (shell.clientHeight || 0));
        shell.scrollTop = Math.min(Math.max(0, top), maxTop);
      } catch {
      }
    };
    const setActiveFeatureTab = (title) => {
      if (title === activeFeatureTab.value) {
        persistHomeFeatureTab();
        return;
      }
      const prevTop = readHomeShellScrollTop();
      activeFeatureTab.value = title;
      persistHomeFeatureTab();
      nextTick(() => {
        restoreHomeShellScrollTop(prevTop);
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => restoreHomeShellScrollTop(prevTop));
        }
      });
    };
    const navigateFromHome = (moduleId) => {
      persistHomeFeatureTab();
      navigateTo(moduleId);
    };
    const featureTabModules = computed(() => {
      const cat = moduleCategories.value.find((c) => c.title === activeFeatureTab.value) || moduleCategories.value[0];
      return cat ? cat.modules : [];
    });
    const featureIconColors = {
      grades: "bg-blue-500",
      classroom: "bg-orange-400",
      exams: "bg-teal-500",
      ranking: "bg-yellow-500",
      calendar: "bg-blue-500",
      school_inbox: "bg-indigo-500",
      academic: "bg-green-500",
      qxzkb: "bg-indigo-500",
      course_selection: "bg-orange-500",
      training: "bg-sky-400",
      teaching_eval: "bg-purple-500",
      campus_code: "bg-teal-600",
      electricity: "bg-red-500",
      transactions: "bg-pink-500",
      chaoxing_hub: "bg-blue-600",
      chaoxing_inbox: "bg-indigo-600",
      chaoxing_class: "bg-sky-500",
      broadband: "bg-cyan-600",
      sports_venue: "bg-green-600",
      library: "bg-emerald-600",
      campus_map: "bg-teal-500",
      resource_share: "bg-blue-500",
      towergo: "bg-emerald-500",
      smart_orientation: "bg-amber-500",
      ai: "bg-gray-400"
    };
    const featureIcons = {
      grades: "fa-graduation-cap",
      classroom: "fa-door-open",
      exams: "fa-calendar-check",
      ranking: "fa-chart-bar",
      calendar: "fa-calendar-alt",
      school_inbox: "fa-envelope",
      academic: "fa-chart-line",
      qxzkb: "fa-table",
      course_selection: "fa-tasks",
      training: "fa-sitemap",
      teaching_eval: "fa-star",
      campus_code: "fa-qrcode",
      electricity: "fa-bolt",
      transactions: "fa-wallet",
      chaoxing_hub: "fa-graduation-cap",
      chaoxing_inbox: "fa-inbox",
      chaoxing_class: "fa-folder-open",
      broadband: "fa-wifi",
      sports_venue: "fa-futbol",
      library: "fa-book",
      campus_map: "fa-map-marked-alt",
      resource_share: "fa-cloud",
      towergo: "fa-bicycle",
      smart_orientation: "fa-user-graduate",
      ai: "fa-robot"
    };
    const noticeItems = computed(() => [...props.noticeList]);
    const allNotices = computed(() => {
      const map = /* @__PURE__ */ new Map();
      [...props.tickerNotices, ...props.pinnedNotices, ...noticeItems.value].forEach((item) => {
        if (!item) return;
        const key = item.id || item.title;
        if (key && !map.has(key)) map.set(key, item);
      });
      return [...map.values()];
    });
    const marqueeItems = computed(() => {
      if (!allNotices.value.length) return [];
      return allNotices.value.length > 1 ? [...allNotices.value, ...allNotices.value, ...allNotices.value] : allNotices.value;
    });
    const getTickerBaseCount = () => {
      const count = Number(allNotices.value.length || 0);
      return Number.isFinite(count) && count > 0 ? count : 0;
    };
    const normalizeTickerTranslate = (value) => {
      const loopWidth = Number(tickerLoopWidth.value || 0);
      if (loopWidth <= 0) return 0;
      const baseCount = getTickerBaseCount();
      if (baseCount <= 1) return 0;
      const min = -loopWidth * 2;
      const max = -loopWidth;
      let x = Number(value || 0);
      while (x <= min) x += loopWidth;
      while (x > max) x -= loopWidth;
      return x;
    };
    const refreshTickerMetrics = async () => {
      await nextTick();
      const baseCount = getTickerBaseCount();
      const el = tickerItemsRef.value;
      if (!el || baseCount <= 0) {
        tickerLoopWidth.value = 0;
        tickerStepWidth.value = 236;
        tickerTranslateX.value = 0;
        return;
      }
      const prevLoopWidth = Number(tickerLoopWidth.value || 0);
      const firstItem = el.querySelector(".ticker-item");
      const gap = Number.parseFloat(window.getComputedStyle(el).gap || "20") || 20;
      const width = firstItem?.getBoundingClientRect?.().width || 216;
      tickerStepWidth.value = Math.max(140, width + gap);
      tickerLoopWidth.value = baseCount > 1 ? baseCount * tickerStepWidth.value : 0;
      if (baseCount <= 1) {
        tickerTranslateX.value = 0;
        return;
      }
      if (prevLoopWidth <= 0) {
        tickerTranslateX.value = -tickerLoopWidth.value;
        return;
      }
      tickerTranslateX.value = normalizeTickerTranslate(tickerTranslateX.value);
    };
    const startTickerLoop = () => {
      if (tickerRafId) return;
      tickerLastFrameTs = 0;
      const tick = (ts) => {
        if (!tickerLastFrameTs) tickerLastFrameTs = ts;
        const dt = ts - tickerLastFrameTs;
        tickerLastFrameTs = ts;
        const canAutoMove = getTickerBaseCount() > 1 && !isTickerInteracting.value && true && tickerTransitionMs.value === 0;
        if (canAutoMove) {
          const next = tickerTranslateX.value - TICKER_AUTO_SPEED * dt / 1e3;
          tickerTranslateX.value = normalizeTickerTranslate(next);
        }
        tickerRafId = window.requestAnimationFrame(tick);
      };
      tickerRafId = window.requestAnimationFrame(tick);
    };
    const stopTickerLoop = () => {
      if (!tickerRafId) return;
      window.cancelAnimationFrame(tickerRafId);
      tickerRafId = 0;
      tickerLastFrameTs = 0;
    };
    const updateNoticeSwipeMode = (force = false) => {
      if (typeof window === "undefined") return;
      const width = Math.max(0, Number(window.innerWidth || 0));
      const mobile = width <= 720;
      const modeChanged = isMobileNoticeSwipe.value !== mobile;
      const widthDelta = Math.abs(width - lastNoticeViewportWidth);
      isMobileNoticeSwipe.value = mobile;
      lastNoticeViewportWidth = width;
      if (force || modeChanged || widthDelta >= 24) void refreshTickerMetrics();
    };
    const handleNoticeResize = () => {
      if (noticeResizeRaf) return;
      noticeResizeRaf = window.requestAnimationFrame(() => {
        noticeResizeRaf = 0;
        updateNoticeSwipeMode(false);
      });
    };
    const noticeSummary = (notice) => notice?.summary || stripMarkdown(notice?.content || "") || "点击查看详情";
    const showHomeSearch = ref(false);
    const homeSearchQuery = ref("");
    const homeSearchInputRef = ref(null);
    const homeSearchHasQuery = computed(() => homeSearchQuery.value.trim().length > 0);
    const homeSearchSections = computed(
      () => buildHomeSearchSections({
        query: homeSearchQuery.value,
        modules: modules.value,
        courses: homeSearchCourses.value,
        notices: allNotices.value.map((notice) => ({
          ...notice,
          summary: noticeSummary(notice)
        }))
      })
    );
    const homeSearchSuggestions = computed(
      () => quickEntryItems.value.map((item) => ({
        type: "service",
        id: item.id,
        title: item.name,
        subtitle: item.id === "schedule" ? "本周课表与课程安排" : "常用服务",
        target: item.id,
        iconClass: item.icon,
        colorClass: item.color,
        iconColor: item.iconColor
      }))
    );
    const openHomeSearch = async () => {
      showHomeSearch.value = true;
      await nextTick();
      homeSearchInputRef.value?.focus?.();
    };
    const closeHomeSearch = () => {
      showHomeSearch.value = false;
      homeSearchQuery.value = "";
    };
    const clearHomeSearchQuery = async () => {
      homeSearchQuery.value = "";
      await nextTick();
      homeSearchInputRef.value?.focus?.();
    };
    const getHomeSearchItemIcon = (item) => {
      if (item?.type === "course") return "fa-calendar-day";
      if (item?.type === "notice") return "fa-bullhorn";
      const id = item?.target || item?.id;
      return item?.iconClass || featureIcons[id] || quickEntryMeta[id]?.icon || "fa-cube";
    };
    const getHomeSearchIconClass = (item) => {
      if (item?.type === "course") return "bg-blue-50 text-blue-500";
      if (item?.type === "notice") return "bg-amber-50 text-amber-500";
      const id = item?.target || item?.id;
      const meta = quickEntryMeta[id];
      return [item?.colorClass || meta?.color || "bg-gray-50", item?.iconColor || meta?.iconColor || "text-gray-500"];
    };
    const selectHomeSearchItem = (item) => {
      if (!item) return;
      const target = item.target || item.id;
      closeHomeSearch();
      if (item.type === "notice") {
        emit("open-notice", item.raw);
        return;
      }
      if (target === "schedule") {
        emit("navigate", "schedule");
        return;
      }
      navigateTo(target);
    };
    const selectFirstHomeSearchItem = () => {
      const firstResult = homeSearchSections.value[0]?.items?.[0];
      const firstSuggestion = homeSearchSuggestions.value[0];
      selectHomeSearchItem(firstResult || firstSuggestion);
    };
    const handleHomeSearchKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHomeSearch();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        selectFirstHomeSearchItem();
      }
    };
    const currentAnnouncementIndex = ref(0);
    let announcementTimer = null;
    const startAnnouncementRotation = () => {
      stopAnnouncementRotation();
      if (marqueeItems.value.length <= 1) return;
      announcementTimer = setInterval(() => {
        currentAnnouncementIndex.value = (currentAnnouncementIndex.value + 1) % Math.min(marqueeItems.value.length, 5);
      }, 3e3);
    };
    const stopAnnouncementRotation = () => {
      if (announcementTimer) {
        clearInterval(announcementTimer);
        announcementTimer = null;
      }
    };
    const attachCardSpotlight = () => {
      const cards = document.querySelectorAll(".module-card");
      cards.forEach((card) => {
        const handleMove = (event) => {
          const rect = card.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          card.style.setProperty("--hover-x", `${x}px`);
          card.style.setProperty("--hover-y", `${y}px`);
        };
        card.addEventListener("mousemove", handleMove);
        cardListeners.push({ card, handleMove });
      });
    };
    const detachCardSpotlight = () => {
      cardListeners.forEach(({ card, handleMove }) => {
        card.removeEventListener("mousemove", handleMove);
      });
      cardListeners.length = 0;
    };
    onMounted(() => {
      refreshLoginMethod();
      loadQuickEntries();
      fetchWeather();
      updateNoticeSwipeMode(true);
      void refreshTickerMetrics();
      startTickerLoop();
      attachCardSpotlight();
      syncNowTick();
      clockTimer = window.setInterval(() => {
        syncNowTick();
      }, CLOCK_TICK_MS);
      window.addEventListener("resize", handleNoticeResize);
      window.addEventListener("focus", syncNowTick);
      document.addEventListener("visibilitychange", handleVisibilityRefresh);
    });
    onBeforeUnmount(() => {
      detachCardSpotlight();
      stopTickerLoop();
      stopAnnouncementRotation();
      stopHomeLayoutDrag();
      if (clockTimer) {
        window.clearInterval(clockTimer);
        clockTimer = null;
      }
      window.removeEventListener("resize", handleNoticeResize);
      if (noticeResizeRaf) {
        window.cancelAnimationFrame(noticeResizeRaf);
        noticeResizeRaf = 0;
      }
      window.removeEventListener("focus", syncNowTick);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    });
    watch(() => marqueeItems.value.length, () => {
      tickerTransitionMs.value = 0;
      tickerTranslateX.value = 0;
      void refreshTickerMetrics();
    }, { immediate: true });
    watch(() => marqueeItems.value.length, (len) => {
      if (len > 0) startAnnouncementRotation();
      else stopAnnouncementRotation();
    }, { immediate: true });
    watch(() => [props.studentId, props.isLoggedIn], () => {
      refreshLoginMethod();
      nowTick.value = Date.now();
      fetchTodayCourses();
    }, { immediate: true });
    watch(() => [uiSettings.workspaceLayout.home.widgetsOrder.join("|"), uiSettings.workspaceLayout.home.moduleOrder.join("|")], () => {
      if (!isHomeLayoutEditing.value) syncHomeLayoutDraft();
    }, { immediate: true });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[12] || (_cache[12] = createBaseVNode("div", { class: "flex items-center space-x-2" }, [
            createBaseVNode("img", {
              class: "home-logo-img",
              src: _imports_0,
              alt: "HBUT",
              width: "32",
              height: "32"
            }),
            createBaseVNode("span", { class: "font-bold text-lg tracking-wide text-gray-800" }, "Mini-HBUT")
          ], -1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              _cache[11] || (_cache[11] = createBaseVNode("i", { class: "fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" }, null, -1)),
              createBaseVNode("input", {
                class: "w-full bg-white rounded-full py-1.5 pl-8 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 border-none shadow-sm text-gray-600 cursor-pointer",
                placeholder: "搜索服务/课程/资讯",
                type: "text",
                readonly: "",
                "aria-label": "搜索服务",
                onClick: openHomeSearch,
                onFocus: openHomeSearch
              }, null, 32)
            ])
          ])
        ]),
        createBaseVNode("main", _hoisted_5, [
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("div", null, [
              createBaseVNode("h1", _hoisted_7, toDisplayString(greetingText.value), 1),
              _cache[13] || (_cache[13] = createBaseVNode("p", { class: "text-gray-500 text-sm mt-1" }, "新的一天，元气满满！", -1))
            ]),
            createBaseVNode("div", {
              class: "flex items-center space-x-4 cursor-pointer",
              onClick: _cache[0] || (_cache[0] = ($event) => showWeatherDetail.value = true)
            }, [
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("div", _hoisted_9, [
                  createBaseVNode("i", {
                    class: normalizeClass(["fas", weatherData.value.icon]),
                    style: normalizeStyle({ color: weatherIconColor.value })
                  }, null, 6),
                  createBaseVNode("span", _hoisted_10, toDisplayString(weatherData.value.temp) + "°C", 1)
                ]),
                createBaseVNode("span", _hoisted_11, toDisplayString(weatherData.value.condition), 1)
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_12, [
            createBaseVNode("div", {
              class: "flex items-center space-x-4 min-w-0 flex-1 cursor-pointer",
              onClick: handleProfileClick
            }, [
              _cache[15] || (_cache[15] = createBaseVNode("div", { class: "w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 shrink-0" }, [
                createBaseVNode("i", { class: "fas fa-user-graduate text-2xl" })
              ], -1)),
              createBaseVNode("div", _hoisted_13, [
                createBaseVNode("div", _hoisted_14, [
                  createBaseVNode("h2", _hoisted_15, toDisplayString(__props.studentId || "未登录"), 1),
                  _cache[14] || (_cache[14] = createBaseVNode("span", { class: "bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-sm shrink-0" }, "本科生", -1))
                ]),
                createBaseVNode("p", _hoisted_16, toDisplayString(userCollegeInfo.value), 1)
              ])
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "session-status-btn shrink-0 flex items-center justify-center p-2 rounded-lg active:opacity-80",
              "aria-label": sessionStatusAria.value,
              title: sessionStatusAria.value,
              onClick: onSessionStatusClick
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["session-status-dot", {
                  "is-green": sessionStatusVisual.value === "green",
                  "is-red": sessionStatusVisual.value === "red",
                  "is-blink": sessionStatusVisual.value === "blink"
                }])
              }, null, 2)
            ], 8, _hoisted_17)
          ]),
          sessionDetailOpen.value && sessionStatusVisual.value !== "green" ? (openBlock(), createElementBlock("div", _hoisted_18, [
            createBaseVNode("div", _hoisted_19, [
              createBaseVNode("div", _hoisted_20, [
                createBaseVNode("div", _hoisted_21, toDisplayString(maintenanceTitle.value), 1),
                createBaseVNode("div", _hoisted_22, toDisplayString(maintenancePhaseLabel.value), 1)
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "shrink-0 text-[11px] text-orange-500 px-2 py-0.5",
                onClick: _cache[1] || (_cache[1] = ($event) => sessionDetailOpen.value = false)
              }, "收起")
            ]),
            createBaseVNode("div", _hoisted_23, toDisplayString(__props.jwxtMaintenanceHint || (sessionStatusVisual.value === "blink" ? "正在后台恢复登录会话，请稍候…" : "当前可能无法同步最新教务数据，可查看下方详情或重试。")), 1),
            __props.jwxtMaintenanceDetail ? (openBlock(), createElementBlock("div", _hoisted_24, [
              _cache[16] || (_cache[16] = createBaseVNode("span", { class: "font-medium text-orange-800" }, "详情：", -1)),
              createTextVNode(toDisplayString(__props.jwxtMaintenanceDetail), 1)
            ])) : createCommentVNode("", true),
            __props.jwxtLastCheckTime ? (openBlock(), createElementBlock("div", _hoisted_25, " 最近检查：" + toDisplayString(__props.jwxtLastCheckTime), 1)) : createCommentVNode("", true),
            maintenanceNotices.value.length ? (openBlock(), createElementBlock("div", _hoisted_26, [
              _cache[18] || (_cache[18] = createBaseVNode("div", { class: "text-[11px] font-semibold text-orange-800 mb-1.5" }, "相关通知", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(maintenanceNotices.value, (n, idx) => {
                return openBlock(), createElementBlock("button", {
                  key: n.id || idx,
                  type: "button",
                  class: "w-full text-left text-[11px] text-orange-700 py-1 flex items-start gap-1.5 hover:text-orange-900",
                  onClick: ($event) => _ctx.$emit("open-notice", n.raw)
                }, [
                  _cache[17] || (_cache[17] = createBaseVNode("span", { class: "text-orange-400 shrink-0" }, "•", -1)),
                  createBaseVNode("span", _hoisted_28, toDisplayString(n.title), 1)
                ], 8, _hoisted_27);
              }), 128))
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_29, [
              __props.jwxtRecoveryPhase !== "need_login" ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "text-xs px-3 py-1.5 rounded-full bg-orange-600 text-white font-medium active:opacity-90",
                disabled: __props.jwxtRecoveryPhase === "recovering",
                onClick: _cache[2] || (_cache[2] = ($event) => _ctx.$emit("retry-session-recovery"))
              }, toDisplayString(__props.jwxtRecoveryPhase === "recovering" ? "正在恢复…" : "立即重试"), 9, _hoisted_30)) : createCommentVNode("", true),
              __props.jwxtRecoveryPhase === "need_login" || __props.jwxtRecoveryPhase === "failed" || sessionStatusVisual.value === "red" ? (openBlock(), createElementBlock("button", {
                key: 1,
                type: "button",
                class: "text-xs px-3 py-1.5 rounded-full bg-white border border-orange-300 text-orange-800 font-medium",
                onClick: _cache[3] || (_cache[3] = ($event) => _ctx.$emit("require-login"))
              }, " 去登录 ")) : createCommentVNode("", true)
            ])
          ])) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_31, [
            createBaseVNode("div", _hoisted_32, [
              _cache[20] || (_cache[20] = createBaseVNode("h3", { class: "font-bold text-lg text-gray-800" }, "今日安排", -1)),
              createBaseVNode("a", {
                class: "text-sm text-blue-500 flex items-center cursor-pointer",
                onClick: _cache[4] || (_cache[4] = ($event) => _ctx.$emit("navigate", "schedule"))
              }, [..._cache[19] || (_cache[19] = [
                createTextVNode(" 查看全部 ", -1),
                createBaseVNode("i", { class: "fas fa-chevron-right text-xs ml-1" }, null, -1)
              ])])
            ]),
            !__props.isLoggedIn ? (openBlock(), createElementBlock("div", _hoisted_33, "登录后可查看今日课程")) : todayLoading.value ? (openBlock(), createElementBlock("div", _hoisted_34, "正在加载今日课程...")) : todayError.value ? (openBlock(), createElementBlock("div", _hoisted_35, toDisplayString(todayError.value), 1)) : todayCourses.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_36, [..._cache[21] || (_cache[21] = [
              createBaseVNode("img", {
                src: _imports_1,
                class: "today-empty-icon",
                alt: "All done"
              }, null, -1),
              createBaseVNode("span", { class: "text-gray-400 text-sm" }, "今日无课程安排 🎉", -1)
            ])])) : (openBlock(), createElementBlock("div", _hoisted_37, [
              createBaseVNode("div", {
                class: "timeline-line",
                style: normalizeStyle({ bottom: todayCourses.value.length <= 1 ? "100%" : void 0 })
              }, null, 4),
              (openBlock(true), createElementBlock(Fragment, null, renderList(todayCourses.value, (course, idx) => {
                return openBlock(), createElementBlock("div", {
                  key: course.key,
                  class: normalizeClass(["flex relative z-10", [{ "opacity-50": course.endMinutes <= currentMinutePrecise.value }, idx < todayCourses.value.length - 1 ? "mb-7" : ""]])
                }, [
                  course.endMinutes <= currentMinutePrecise.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    _cache[24] || (_cache[24] = createBaseVNode("div", { class: "w-6 flex flex-col items-center shrink-0 pt-1" }, [
                      createBaseVNode("div", { class: "w-2.5 h-2.5 bg-blue-500 rounded-full" })
                    ], -1)),
                    createBaseVNode("div", _hoisted_38, [
                      createBaseVNode("span", _hoisted_39, toDisplayString(course.start), 1),
                      createBaseVNode("span", _hoisted_40, "~ " + toDisplayString(course.end), 1)
                    ]),
                    createBaseVNode("div", _hoisted_41, [
                      createBaseVNode("div", _hoisted_42, [
                        createBaseVNode("h4", _hoisted_43, toDisplayString(course.name), 1),
                        createBaseVNode("p", _hoisted_44, [
                          _cache[22] || (_cache[22] = createBaseVNode("i", { class: "fas fa-map-marker-alt mr-1" }, null, -1)),
                          createTextVNode(" " + toDisplayString(course.room), 1)
                        ])
                      ]),
                      _cache[23] || (_cache[23] = createBaseVNode("span", { class: "text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full whitespace-nowrap shrink-0" }, "已结束", -1))
                    ])
                  ], 64)) : idx === 0 || todayCourses.value[idx - 1] && todayCourses.value[idx - 1].endMinutes <= currentMinutePrecise.value && course.endMinutes > currentMinutePrecise.value ? (openBlock(), createElementBlock("div", _hoisted_45, [
                    _cache[28] || (_cache[28] = createBaseVNode("div", { class: "absolute -right-8 -top-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl" }, null, -1)),
                    _cache[29] || (_cache[29] = createBaseVNode("div", { class: "w-6 flex flex-col items-center shrink-0 pt-1 text-white relative z-10" }, [
                      createBaseVNode("div", { class: "w-3 h-3 bg-white border-2 border-blue-500 rounded-full" })
                    ], -1)),
                    createBaseVNode("div", _hoisted_46, [
                      createBaseVNode("span", _hoisted_47, toDisplayString(course.start), 1),
                      createBaseVNode("span", _hoisted_48, "~ " + toDisplayString(course.end), 1)
                    ]),
                    createBaseVNode("div", _hoisted_49, [
                      createBaseVNode("span", _hoisted_50, toDisplayString(course.startMinutes <= currentMinutePrecise.value ? "进行中" : "下一节"), 1),
                      createBaseVNode("h4", _hoisted_51, toDisplayString(course.name), 1),
                      createBaseVNode("p", _hoisted_52, [
                        _cache[25] || (_cache[25] = createBaseVNode("i", { class: "fas fa-map-marker-alt mr-1" }, null, -1)),
                        createTextVNode(" " + toDisplayString(course.room), 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_53, [
                      _cache[27] || (_cache[27] = createBaseVNode("img", {
                        src: _imports_2,
                        class: "today-course-illustration",
                        alt: ""
                      }, null, -1)),
                      createBaseVNode("div", _hoisted_54, toDisplayString(getCourseCountdown(course)), 1),
                      createBaseVNode("button", {
                        class: "relative z-10 bg-white text-blue-500 text-sm font-medium px-4 py-1.5 rounded-full flex items-center shadow-sm hover:bg-gray-50 mr-3",
                        onClick: _cache[5] || (_cache[5] = withModifiers(($event) => _ctx.$emit("navigate", "schedule"), ["stop"]))
                      }, [..._cache[26] || (_cache[26] = [
                        createTextVNode(" 去上课 ", -1),
                        createBaseVNode("i", { class: "fas fa-arrow-right ml-1 text-xs" }, null, -1)
                      ])])
                    ])
                  ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                    _cache[32] || (_cache[32] = createBaseVNode("div", { class: "w-6 flex flex-col items-center shrink-0 pt-1" }, [
                      createBaseVNode("div", { class: "w-2 h-2 bg-gray-300 rounded-full" })
                    ], -1)),
                    createBaseVNode("div", _hoisted_55, [
                      createBaseVNode("span", _hoisted_56, toDisplayString(course.start), 1),
                      createBaseVNode("span", _hoisted_57, "~ " + toDisplayString(course.end), 1)
                    ]),
                    createBaseVNode("div", _hoisted_58, [
                      createBaseVNode("div", _hoisted_59, [
                        createBaseVNode("h4", _hoisted_60, toDisplayString(course.name), 1),
                        createBaseVNode("p", _hoisted_61, [
                          _cache[30] || (_cache[30] = createBaseVNode("i", { class: "fas fa-map-marker-alt mr-1" }, null, -1)),
                          createTextVNode(" " + toDisplayString(course.room), 1)
                        ])
                      ]),
                      _cache[31] || (_cache[31] = createBaseVNode("span", { class: "text-xs text-gray-400 whitespace-nowrap shrink-0" }, "未开始", -1))
                    ])
                  ], 64))
                ], 2);
              }), 128))
            ])),
            todayCourses.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_62, [
              createBaseVNode("div", _hoisted_63, [
                _cache[35] || (_cache[35] = createBaseVNode("div", { class: "w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500" }, [
                  createBaseVNode("i", { class: "far fa-calendar-alt text-sm" })
                ], -1)),
                createBaseVNode("div", null, [
                  _cache[34] || (_cache[34] = createBaseVNode("p", { class: "text-[10px] text-gray-400" }, "今日课程", -1)),
                  createBaseVNode("p", _hoisted_64, [
                    createTextVNode(toDisplayString(todayCourses.value.length) + " ", 1),
                    _cache[33] || (_cache[33] = createBaseVNode("span", { class: "text-xs font-normal" }, "节", -1))
                  ])
                ])
              ]),
              _cache[42] || (_cache[42] = createBaseVNode("div", { class: "w-px h-8 bg-gray-100" }, null, -1)),
              createBaseVNode("div", _hoisted_65, [
                _cache[38] || (_cache[38] = createBaseVNode("div", { class: "w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-500" }, [
                  createBaseVNode("i", { class: "far fa-check-circle text-sm" })
                ], -1)),
                createBaseVNode("div", null, [
                  _cache[37] || (_cache[37] = createBaseVNode("p", { class: "text-[10px] text-gray-400" }, "已完成", -1)),
                  createBaseVNode("p", _hoisted_66, [
                    createTextVNode(toDisplayString(todayCourses.value.length > 0 ? Math.round((todayCourses.value.length - timelineCourses.value.length) / todayCourses.value.length * 100) : 0) + " ", 1),
                    _cache[36] || (_cache[36] = createBaseVNode("span", { class: "text-xs font-normal" }, "%", -1))
                  ])
                ])
              ]),
              _cache[43] || (_cache[43] = createBaseVNode("div", { class: "w-px h-8 bg-gray-100" }, null, -1)),
              createBaseVNode("div", _hoisted_67, [
                _cache[41] || (_cache[41] = createBaseVNode("div", { class: "w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-500" }, [
                  createBaseVNode("i", { class: "far fa-clock text-sm" })
                ], -1)),
                createBaseVNode("div", null, [
                  _cache[40] || (_cache[40] = createBaseVNode("p", { class: "text-[10px] text-gray-400" }, "剩余课程", -1)),
                  createBaseVNode("p", _hoisted_68, [
                    createTextVNode(toDisplayString(timelineCourses.value.length) + " ", 1),
                    _cache[39] || (_cache[39] = createBaseVNode("span", { class: "text-xs font-normal" }, "节", -1))
                  ])
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_69, [
            createBaseVNode("div", { class: "flex justify-between items-center mb-4" }, [
              _cache[44] || (_cache[44] = createBaseVNode("h3", { class: "font-bold text-lg text-gray-800" }, "快捷入口", -1)),
              createBaseVNode("i", {
                class: "fas fa-pencil-alt text-gray-400 cursor-pointer hover:text-blue-500 transition-colors",
                onClick: openQuickEntryEditor
              })
            ]),
            createBaseVNode("div", _hoisted_70, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(quickEntryItems.value, (item) => {
                return openBlock(), createElementBlock("div", {
                  key: item.id,
                  class: "flex flex-col items-center cursor-pointer group",
                  onClick: ($event) => handleQuickEntryClick(item.id)
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["quick-entry-icon w-12 h-12 rounded-[14px] flex items-center justify-center mb-1 group-hover:scale-105 transition-transform", item.color]),
                    "data-module": item.id
                  }, [
                    createBaseVNode("i", {
                      class: normalizeClass(["fas text-xl", [item.icon, item.iconColor]])
                    }, null, 2)
                  ], 10, _hoisted_72),
                  createBaseVNode("span", _hoisted_73, toDisplayString(item.name), 1)
                ], 8, _hoisted_71);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_74, [
            _cache[45] || (_cache[45] = createBaseVNode("div", { class: "home-all-features__head" }, [
              createBaseVNode("h3", { class: "font-bold text-lg text-gray-800" }, "所有功能")
            ], -1)),
            createBaseVNode("div", _hoisted_75, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(moduleCategories.value, (cat) => {
                return openBlock(), createElementBlock("button", {
                  key: cat.title,
                  type: "button",
                  class: normalizeClass(["home-feature-tab", activeFeatureTab.value === cat.title ? "is-active" : ""]),
                  role: "tab",
                  "aria-selected": activeFeatureTab.value === cat.title,
                  onClick: ($event) => setActiveFeatureTab(cat.title)
                }, toDisplayString(cat.title), 11, _hoisted_76);
              }), 128))
            ]),
            createBaseVNode("div", {
              class: "grid grid-cols-4 gap-y-6 gap-x-2 mt-4 home-feature-grid",
              style: normalizeStyle(featureGridStyle.value)
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(featureTabModules.value, (mod) => {
                return openBlock(), createElementBlock("div", {
                  key: mod.id,
                  class: "flex flex-col items-center cursor-pointer",
                  onClick: ($event) => navigateFromHome(mod.id)
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-2 shadow-sm", featureIconColors[mod.id] || "bg-gray-400"])
                  }, [
                    createBaseVNode("i", {
                      class: normalizeClass(["fas text-xl", featureIcons[mod.id] || "fa-cube"])
                    }, null, 2)
                  ], 2),
                  createBaseVNode("span", _hoisted_78, toDisplayString(mod.name), 1)
                ], 8, _hoisted_77);
              }), 128))
            ], 4)
          ])
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showHomeSearch.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "fixed inset-0 z-[210] bg-black/35 backdrop-blur-sm flex items-start justify-center px-4",
            style: { "padding-top": "calc(env(safe-area-inset-top) + 24px)" },
            onClick: withModifiers(closeHomeSearch, ["self"])
          }, [
            createBaseVNode("div", _hoisted_79, [
              createBaseVNode("div", _hoisted_80, [
                createBaseVNode("div", _hoisted_81, [
                  createBaseVNode("div", _hoisted_82, [
                    _cache[47] || (_cache[47] = createBaseVNode("i", { class: "fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" }, null, -1)),
                    withDirectives(createBaseVNode("input", {
                      ref_key: "homeSearchInputRef",
                      ref: homeSearchInputRef,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => homeSearchQuery.value = $event),
                      class: "w-full bg-gray-50 rounded-2xl py-3 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-800",
                      placeholder: "搜索服务、课程、资讯",
                      type: "search",
                      onKeydown: handleHomeSearchKeydown
                    }, null, 544), [
                      [vModelText, homeSearchQuery.value]
                    ]),
                    homeSearchQuery.value ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      class: "absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600",
                      type: "button",
                      onClick: clearHomeSearchQuery
                    }, [..._cache[46] || (_cache[46] = [
                      createBaseVNode("i", { class: "fas fa-times text-xs" }, null, -1)
                    ])])) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("button", {
                    class: "px-3 h-10 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50",
                    type: "button",
                    onClick: closeHomeSearch
                  }, " 取消 ")
                ])
              ]),
              createBaseVNode("div", _hoisted_83, [
                !homeSearchHasQuery.value ? (openBlock(), createElementBlock("div", _hoisted_84, [
                  _cache[48] || (_cache[48] = createBaseVNode("p", { class: "text-xs font-semibold text-gray-400 px-1" }, "常用", -1)),
                  createBaseVNode("div", _hoisted_85, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(homeSearchSuggestions.value, (item) => {
                      return openBlock(), createElementBlock("button", {
                        key: item.id,
                        class: "flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-3 text-left hover:bg-blue-50 transition-colors",
                        type: "button",
                        onClick: ($event) => selectHomeSearchItem(item)
                      }, [
                        createBaseVNode("span", {
                          class: normalizeClass(["w-10 h-10 rounded-xl flex items-center justify-center shrink-0", getHomeSearchIconClass(item)])
                        }, [
                          createBaseVNode("i", {
                            class: normalizeClass(["fas", getHomeSearchItemIcon(item)])
                          }, null, 2)
                        ], 2),
                        createBaseVNode("span", _hoisted_87, [
                          createBaseVNode("strong", _hoisted_88, toDisplayString(item.title), 1),
                          createBaseVNode("small", _hoisted_89, toDisplayString(item.subtitle), 1)
                        ])
                      ], 8, _hoisted_86);
                    }), 128))
                  ])
                ])) : homeSearchSections.value.length ? (openBlock(), createElementBlock("div", _hoisted_90, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(homeSearchSections.value, (section) => {
                    return openBlock(), createElementBlock("section", {
                      key: section.title,
                      class: "space-y-2"
                    }, [
                      createBaseVNode("p", _hoisted_91, toDisplayString(section.title), 1),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(section.items, (item) => {
                        return openBlock(), createElementBlock("button", {
                          key: `${item.type}:${item.id}`,
                          class: "w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-gray-50 transition-colors",
                          type: "button",
                          onClick: ($event) => selectHomeSearchItem(item)
                        }, [
                          createBaseVNode("span", {
                            class: normalizeClass(["w-10 h-10 rounded-xl flex items-center justify-center shrink-0", getHomeSearchIconClass(item)])
                          }, [
                            createBaseVNode("i", {
                              class: normalizeClass(["fas", getHomeSearchItemIcon(item)])
                            }, null, 2)
                          ], 2),
                          createBaseVNode("span", _hoisted_93, [
                            createBaseVNode("strong", _hoisted_94, toDisplayString(item.title), 1),
                            createBaseVNode("small", _hoisted_95, toDisplayString(item.subtitle), 1)
                          ]),
                          _cache[49] || (_cache[49] = createBaseVNode("i", { class: "fas fa-chevron-right text-[10px] text-gray-300" }, null, -1))
                        ], 8, _hoisted_92);
                      }), 128))
                    ]);
                  }), 128))
                ])) : (openBlock(), createElementBlock("div", _hoisted_96, [..._cache[50] || (_cache[50] = [
                  createBaseVNode("div", { class: "w-12 h-12 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300" }, [
                    createBaseVNode("i", { class: "fas fa-search" })
                  ], -1),
                  createBaseVNode("p", { class: "mt-3 text-sm text-gray-400" }, "没有匹配结果", -1)
                ])]))
              ])
            ])
          ])) : createCommentVNode("", true)
        ])),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showWeatherDetail.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-md",
            onClick: _cache[8] || (_cache[8] = withModifiers(($event) => showWeatherDetail.value = false, ["self"]))
          }, [
            createBaseVNode("div", _hoisted_97, [
              createBaseVNode("div", {
                class: normalizeClass(["p-6 pb-5 relative rounded-t-[28px]", weatherGradientClass.value])
              }, [
                createBaseVNode("div", {
                  class: normalizeClass(["absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none", weatherGlowClass.value])
                }, null, 2),
                createBaseVNode("div", _hoisted_98, [
                  createBaseVNode("div", null, [
                    createBaseVNode("p", {
                      class: normalizeClass(["text-sm opacity-70", weatherPillTextClass.value])
                    }, "洪山区", 2),
                    createBaseVNode("h3", {
                      class: normalizeClass(["font-bold text-2xl mt-1", weatherTextClass.value])
                    }, toDisplayString(weatherData.value.condition), 3)
                  ]),
                  createBaseVNode("button", {
                    class: "w-8 h-8 rounded-full bg-black/10 flex items-center justify-center",
                    onClick: _cache[7] || (_cache[7] = ($event) => showWeatherDetail.value = false)
                  }, [
                    createBaseVNode("i", {
                      class: normalizeClass(["fas fa-times", weatherTextClass.value])
                    }, null, 2)
                  ])
                ]),
                createBaseVNode("div", _hoisted_99, [
                  createBaseVNode("span", {
                    class: normalizeClass(["text-7xl font-extralight", weatherTempClass.value])
                  }, toDisplayString(weatherData.value.temp) + "°", 3)
                ]),
                createBaseVNode("div", _hoisted_100, [
                  createBaseVNode("div", _hoisted_101, [
                    createBaseVNode("i", {
                      class: normalizeClass(["fas fa-tint text-xs", weatherPillTextClass.value])
                    }, null, 2),
                    createBaseVNode("span", {
                      class: normalizeClass(["text-xs font-medium", weatherPillTextClass.value])
                    }, toDisplayString(weatherData.value.humidity) + "%", 3)
                  ]),
                  createBaseVNode("div", _hoisted_102, [
                    createBaseVNode("i", {
                      class: normalizeClass(["fas fa-wind text-xs", weatherPillTextClass.value])
                    }, null, 2),
                    createBaseVNode("span", {
                      class: normalizeClass(["text-xs font-medium", weatherPillTextClass.value])
                    }, toDisplayString(weatherData.value.wind), 3)
                  ]),
                  createBaseVNode("div", _hoisted_103, [
                    createBaseVNode("i", {
                      class: normalizeClass(["fas fa-smog text-xs", weatherPillTextClass.value])
                    }, null, 2),
                    createBaseVNode("span", {
                      class: normalizeClass(["text-xs font-medium", weatherPillTextClass.value])
                    }, "AQI " + toDisplayString(weatherData.value.aqi), 3)
                  ])
                ])
              ], 2),
              createBaseVNode("div", _hoisted_104, [
                _cache[51] || (_cache[51] = createBaseVNode("h4", { class: "font-semibold text-sm text-gray-700 mb-3" }, "逐时预报", -1)),
                createBaseVNode("div", _hoisted_105, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(hourlyForecast.value, (h) => {
                    return openBlock(), createElementBlock("div", {
                      key: h.time,
                      class: "flex flex-col items-center shrink-0 min-w-[48px]"
                    }, [
                      createBaseVNode("span", _hoisted_106, toDisplayString(h.time), 1),
                      createBaseVNode("i", {
                        class: normalizeClass(["fas mb-1.5", h.icon]),
                        style: normalizeStyle({ color: getWeatherIconColor(h.condition) })
                      }, null, 6),
                      createBaseVNode("span", _hoisted_107, toDisplayString(h.temp) + "°", 1)
                    ]);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_108, [
                _cache[52] || (_cache[52] = createBaseVNode("h4", { class: "font-semibold text-sm text-gray-700 mb-3" }, "未来天气", -1)),
                createBaseVNode("div", _hoisted_109, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(weatherData.value.forecast, (f) => {
                    return openBlock(), createElementBlock("div", {
                      key: f.day,
                      class: "flex items-center"
                    }, [
                      createBaseVNode("span", _hoisted_110, toDisplayString(f.day), 1),
                      createBaseVNode("i", {
                        class: normalizeClass(["fas w-6 text-center", f.icon]),
                        style: normalizeStyle({ color: getWeatherIconColor(f.condition) })
                      }, null, 6),
                      createBaseVNode("span", _hoisted_111, toDisplayString(f.condition), 1),
                      createBaseVNode("span", {
                        class: "text-xs font-medium w-8 text-right",
                        style: normalizeStyle({ color: unref(getTemperatureColor)(f.temp_low, "text") })
                      }, toDisplayString(f.temp_low) + "°", 5),
                      createBaseVNode("div", _hoisted_112, [
                        createBaseVNode("div", {
                          class: "absolute inset-y-0 rounded-full",
                          style: normalizeStyle(unref(getTemperatureRangeStyle)(f.temp_low, f.temp_high, forecastTemperatureBounds.value))
                        }, null, 4)
                      ]),
                      createBaseVNode("span", {
                        class: "text-xs font-medium w-8",
                        style: normalizeStyle({ color: unref(getTemperatureColor)(f.temp_high, "text") })
                      }, toDisplayString(f.temp_high) + "°", 5)
                    ]);
                  }), 128))
                ])
              ])
            ])
          ])) : createCommentVNode("", true)
        ])),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          showQuickEntryEditor.value ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "quick-entry-editor-overlay fixed inset-0 z-[200] flex items-end justify-center bg-black/40",
            onClick: _cache[10] || (_cache[10] = withModifiers(($event) => showQuickEntryEditor.value = false, ["self"]))
          }, [
            createBaseVNode("div", _hoisted_113, [
              createBaseVNode("div", _hoisted_114, [
                _cache[54] || (_cache[54] = createBaseVNode("h3", { class: "font-bold text-lg text-gray-800" }, "编辑快捷入口", -1)),
                createBaseVNode("button", {
                  class: "w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center",
                  onClick: _cache[9] || (_cache[9] = ($event) => showQuickEntryEditor.value = false)
                }, [..._cache[53] || (_cache[53] = [
                  createBaseVNode("i", { class: "fas fa-times text-gray-500" }, null, -1)
                ])])
              ]),
              createBaseVNode("p", _hoisted_115, "选择 5 个模块作为快捷入口（已选 " + toDisplayString(draftQuickEntries.value.length) + "/5）", 1),
              createBaseVNode("div", _hoisted_116, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(editableQuickEntryMeta.value, (meta, id) => {
                  return openBlock(), createElementBlock("div", {
                    key: id,
                    class: normalizeClass(["quick-entry-editor-item flex flex-col items-center p-2 rounded-xl cursor-pointer border-2 transition-all", draftQuickEntries.value.includes(id) ? "quick-entry-editor-item--selected" : "border-transparent"]),
                    onClick: ($event) => toggleDraftEntry(id)
                  }, [
                    createBaseVNode("div", {
                      class: normalizeClass(["quick-entry-icon w-10 h-10 rounded-xl flex items-center justify-center mb-1", meta.color]),
                      "data-module": id
                    }, [
                      createBaseVNode("i", {
                        class: normalizeClass(["fas", [meta.icon, meta.iconColor]])
                      }, null, 2)
                    ], 10, _hoisted_118),
                    createBaseVNode("span", _hoisted_119, toDisplayString(meta.name), 1),
                    draftQuickEntries.value.includes(id) ? (openBlock(), createElementBlock("div", _hoisted_120, [..._cache[55] || (_cache[55] = [
                      createBaseVNode("i", { class: "fas fa-check text-white text-[8px]" }, null, -1)
                    ])])) : createCommentVNode("", true)
                  ], 10, _hoisted_117);
                }), 128))
              ]),
              createBaseVNode("button", {
                class: normalizeClass(["w-full py-3 rounded-xl font-bold text-white transition-all", draftQuickEntries.value.length === 5 ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-300 cursor-not-allowed"]),
                disabled: draftQuickEntries.value.length !== 5,
                onClick: saveQuickEntries
              }, " 保存 ", 10, _hoisted_121)
            ])
          ])) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const Dashboard = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0d30b8c8"]]);
export {
  Dashboard as default
};
