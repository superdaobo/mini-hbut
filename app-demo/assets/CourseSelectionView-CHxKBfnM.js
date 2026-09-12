import { _ as _export_sfc, m as useI18n, d as axiosInstance, p as tf } from "./app-demo-CUOWTnz-.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { M as resolveComponent, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, F as Fragment, g as createTextVNode, K as withDirectives, L as vModelText, p as createVNode, k as withCtx, f as renderList, d as createCommentVNode, j as createBlock, n as normalizeClass, w as withModifiers, Q as vModelCheckbox, s as Teleport, T as Transition, o as onMounted, l as onBeforeUnmount, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const API_BASE = "/api";
const DEFAULT_FROM = "ggxxk";
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
const ENTRY_MODE_MENU = "menu";
const ENTRY_MODE_SELECTION = "selection";
const ENTRY_MODE_INFO = "info";
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
const looksLikeEncodedSchedule$1 = (value) => {
  const text = safeText(value);
  if (!text) return false;
  return /^\d+(,\d+)+$/.test(text) || /^\d{4,}$/.test(text);
};
const normalizeScheduleText = (item) => {
  const sksjdd = stripHtml(item.sksjdd);
  if (sksjdd && !looksLikeEncodedSchedule$1(sksjdd)) return sksjdd;
  const sksjddstr = stripHtml(item.sksjddstr);
  if (sksjddstr && !looksLikeEncodedSchedule$1(sksjddstr)) return sksjddstr;
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
  class: "course-selection-test-banner",
  role: "note"
};
const _hoisted_12 = { class: "entry-grid" };
const _hoisted_13 = { class: "entry-badge entry-badge-selection" };
const _hoisted_14 = { class: "entry-title" };
const _hoisted_15 = { class: "entry-desc" };
const _hoisted_16 = { class: "entry-badge entry-badge-info" };
const _hoisted_17 = { class: "entry-title" };
const _hoisted_18 = { class: "entry-desc" };
const _hoisted_19 = { class: "filter-card glass-card" };
const _hoisted_20 = { class: "filter-header" };
const _hoisted_21 = { class: "filter-title" };
const _hoisted_22 = { class: "filter-subtitle" };
const _hoisted_23 = { class: "filter-actions" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = { class: "filter-grid compact-grid" };
const _hoisted_26 = { class: "field span-2" };
const _hoisted_27 = ["placeholder"];
const _hoisted_28 = { class: "field" };
const _hoisted_29 = ["value"];
const _hoisted_30 = { class: "field" };
const _hoisted_31 = ["value"];
const _hoisted_32 = { class: "field" };
const _hoisted_33 = ["value"];
const _hoisted_34 = { class: "field" };
const _hoisted_35 = ["placeholder"];
const _hoisted_36 = { class: "filter-grid advanced-grid" };
const _hoisted_37 = { class: "field" };
const _hoisted_38 = ["value"];
const _hoisted_39 = { class: "field" };
const _hoisted_40 = ["value"];
const _hoisted_41 = { class: "field" };
const _hoisted_42 = ["value"];
const _hoisted_43 = { class: "batch-card glass-card" };
const _hoisted_44 = { class: "section-head" };
const _hoisted_45 = {
  key: 0,
  class: "batch-select-wrap"
};
const _hoisted_46 = ["value"];
const _hoisted_47 = { class: "result-block" };
const _hoisted_48 = {
  key: 2,
  class: "course-list"
};
const _hoisted_49 = ["onClick"];
const _hoisted_50 = { class: "course-top" };
const _hoisted_51 = { class: "course-name" };
const _hoisted_52 = { class: "course-class" };
const _hoisted_53 = { class: "course-top-right" };
const _hoisted_54 = {
  key: 0,
  class: "meta-chip conflict-meta-pill"
};
const _hoisted_55 = { class: "course-credit" };
const _hoisted_56 = { class: "course-meta-row" };
const _hoisted_57 = { class: "meta-chip teacher-chip" };
const _hoisted_58 = {
  key: 0,
  class: "meta-chip online-pill"
};
const _hoisted_59 = {
  key: 1,
  class: "meta-chip schedule-chip"
};
const _hoisted_60 = { class: "course-footer-row" };
const _hoisted_61 = { class: "course-meta-row secondary compact" };
const _hoisted_62 = { class: "meta-chip" };
const _hoisted_63 = ["disabled", "onClick"];
const _hoisted_64 = ["disabled", "onClick"];
const _hoisted_65 = { class: "filter-card glass-card" };
const _hoisted_66 = { class: "filter-header" };
const _hoisted_67 = { class: "filter-title" };
const _hoisted_68 = { class: "filter-subtitle" };
const _hoisted_69 = { class: "filter-actions" };
const _hoisted_70 = ["disabled"];
const _hoisted_71 = { class: "filter-grid info-base-grid" };
const _hoisted_72 = { class: "field" };
const _hoisted_73 = ["value"];
const _hoisted_74 = { class: "filter-grid compact-grid" };
const _hoisted_75 = { class: "field span-2" };
const _hoisted_76 = ["placeholder"];
const _hoisted_77 = { class: "field" };
const _hoisted_78 = ["placeholder"];
const _hoisted_79 = { class: "filter-grid advanced-grid" };
const _hoisted_80 = { class: "field" };
const _hoisted_81 = ["value"];
const _hoisted_82 = { class: "field" };
const _hoisted_83 = ["value"];
const _hoisted_84 = { class: "field" };
const _hoisted_85 = ["value"];
const _hoisted_86 = { class: "info-toggle-row" };
const _hoisted_87 = { class: "info-toggle-check" };
const _hoisted_88 = { class: "result-block" };
const _hoisted_89 = {
  key: 0,
  class: "info-source-tip"
};
const _hoisted_90 = { class: "course-list" };
const _hoisted_91 = ["onClick"];
const _hoisted_92 = { class: "course-top" };
const _hoisted_93 = { class: "course-name" };
const _hoisted_94 = { class: "course-class" };
const _hoisted_95 = { class: "course-top-right" };
const _hoisted_96 = { class: "meta-chip success-meta-pill" };
const _hoisted_97 = { class: "course-credit" };
const _hoisted_98 = { class: "course-meta-row" };
const _hoisted_99 = { class: "meta-chip teacher-chip" };
const _hoisted_100 = {
  key: 0,
  class: "meta-chip online-pill"
};
const _hoisted_101 = {
  key: 1,
  class: "meta-chip schedule-chip"
};
const _hoisted_102 = { class: "course-meta-row secondary compact" };
const _hoisted_103 = { class: "meta-chip" };
const _hoisted_104 = { class: "meta-chip" };
const _hoisted_105 = { class: "modal-header" };
const _hoisted_106 = { class: "modal-title" };
const _hoisted_107 = { class: "modal-subtitle" };
const _hoisted_108 = { class: "detail-badges" };
const _hoisted_109 = {
  key: 0,
  class: "meta-chip online-pill"
};
const _hoisted_110 = { class: "detail-grid" };
const _hoisted_111 = { class: "detail-label" };
const _hoisted_112 = { class: "detail-value" };
const _hoisted_113 = { class: "detail-section" };
const _hoisted_114 = { class: "detail-paragraph" };
const _hoisted_115 = { class: "detail-section" };
const _hoisted_116 = { class: "detail-paragraph" };
const _hoisted_117 = {
  key: 0,
  class: "detail-loading"
};
const _hoisted_118 = { class: "modal-header" };
const _hoisted_119 = { class: "modal-title" };
const _hoisted_120 = { class: "modal-subtitle" };
const _hoisted_121 = { class: "child-class-list" };
const _hoisted_122 = ["onClick"];
const _hoisted_123 = { class: "child-class-name" };
const _hoisted_124 = { class: "child-class-meta" };
const _hoisted_125 = { class: "child-class-meta" };
const _hoisted_126 = { class: "confirm-actions" };
const _hoisted_127 = ["disabled"];
const _hoisted_128 = { class: "modal-title" };
const _hoisted_129 = { class: "detail-paragraph" };
const _hoisted_130 = { class: "confirm-actions" };
const _hoisted_131 = ["disabled"];
function render(_ctx, _cache, $props, $setup, $data, $options) {
  const _component_IOSSelect = resolveComponent("IOSSelect");
  return openBlock(), createElementBlock("div", _hoisted_1, [
    createBaseVNode("div", _hoisted_2, [
      createBaseVNode("div", _hoisted_3, [
        createBaseVNode("button", {
          class: "back-btn ios26-btn",
          onClick: $setup.handleBack
        }, toDisplayString($setup.backButtonLabel), 1),
        createBaseVNode("div", _hoisted_4, toDisplayString($setup.pageTitle), 1),
        $setup.centerMode !== $setup.ENTRY_MODE_MENU ? (openBlock(), createElementBlock("button", {
          key: 0,
          class: "refresh-btn ios26-btn",
          type: "button",
          disabled: $setup.refreshDisabled,
          onClick: $setup.handleHeaderRefresh
        }, toDisplayString($setup.refreshButtonLabel), 9, _hoisted_5)) : (openBlock(), createElementBlock("div", _hoisted_6))
      ]),
      createBaseVNode("div", _hoisted_7, [
        createBaseVNode("span", _hoisted_8, toDisplayString($setup.headerMainPill), 1),
        createBaseVNode("span", _hoisted_9, toDisplayString($setup.headerSubPill), 1)
      ])
    ]),
    createBaseVNode("div", _hoisted_10, [
      $setup.centerMode === $setup.ENTRY_MODE_MENU ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
        createBaseVNode("div", _hoisted_11, [
          _cache[26] || (_cache[26] = createTextVNode(" 🧪 ", -1)),
          createBaseVNode("strong", null, toDisplayString($setup.t("selection.testBanner.label")), 1),
          createTextVNode("：" + toDisplayString($setup.t("selection.testBanner.text")), 1)
        ]),
        createBaseVNode("div", _hoisted_12, [
          createBaseVNode("button", {
            type: "button",
            class: "entry-tile glass-card",
            onClick: $setup.enterSelectionMode
          }, [
            createBaseVNode("div", _hoisted_13, toDisplayString($setup.t("selection.entry.selection.badge")), 1),
            createBaseVNode("div", _hoisted_14, toDisplayString($setup.t("selection.entry.selection.title")), 1),
            createBaseVNode("div", _hoisted_15, toDisplayString($setup.t("selection.entry.selection.desc")), 1)
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "entry-tile glass-card",
            onClick: $setup.enterInfoMode
          }, [
            createBaseVNode("div", _hoisted_16, toDisplayString($setup.t("selection.entry.info.badge")), 1),
            createBaseVNode("div", _hoisted_17, toDisplayString($setup.t("selection.entry.info.title")), 1),
            createBaseVNode("div", _hoisted_18, toDisplayString($setup.t("selection.entry.info.desc")), 1)
          ])
        ])
      ], 64)) : $setup.centerMode === $setup.ENTRY_MODE_SELECTION ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
        createBaseVNode("div", _hoisted_19, [
          createBaseVNode("div", _hoisted_20, [
            createBaseVNode("div", null, [
              createBaseVNode("div", _hoisted_21, toDisplayString($setup.t("selection.filter.title")), 1),
              createBaseVNode("div", _hoisted_22, toDisplayString($setup.t("selection.filter.subtitle")), 1)
            ]),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: $setup.backToEntryMenu
              }, toDisplayString($setup.t("selection.filter.backToEntry")), 1),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: $setup.resetFilters
              }, toDisplayString($setup.t("selection.filter.reset")), 1),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: _cache[0] || (_cache[0] = ($event) => $setup.showAdvanced = !$setup.showAdvanced)
              }, toDisplayString($setup.showAdvanced ? $setup.t("selection.filter.collapse") : $setup.t("selection.filter.expand")), 1),
              createBaseVNode("button", {
                class: "primary-btn",
                type: "button",
                disabled: $setup.loadingList || !$setup.canShowList,
                onClick: $setup.queryCourses
              }, toDisplayString($setup.t("selection.filter.queryCourses")), 9, _hoisted_24)
            ])
          ]),
          $setup.showAdvanced ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("div", _hoisted_25, [
              createBaseVNode("div", _hoisted_26, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseName")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $setup.filters.kcmc = $event),
                  class: "text-input",
                  type: "text",
                  placeholder: $setup.t("selection.filter.courseNamePlaceholder")
                }, null, 8, _hoisted_27), [
                  [
                    vModelText,
                    $setup.filters.kcmc,
                    void 0,
                    { trim: true }
                  ]
                ])
              ]),
              createBaseVNode("div", _hoisted_28, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseNature")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.filters.kcxz,
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $setup.filters.kcxz = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.optionMaps.kcxz, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-kcxz",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_29);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_30, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseOwner")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.filters.kcgs,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $setup.filters.kcgs = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.optionMaps.kcgs, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-kcgs",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_31);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_32, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.teachingMode")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.filters.jxms,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $setup.filters.jxms = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.optionMaps.jxms, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-jxms",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_33);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_34, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.teacher")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $setup.filters.teacher = $event),
                  class: "text-input",
                  type: "text",
                  placeholder: $setup.t("selection.filter.teacherPlaceholder")
                }, null, 8, _hoisted_35), [
                  [
                    vModelText,
                    $setup.filters.teacher,
                    void 0,
                    { trim: true }
                  ]
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_36, [
              createBaseVNode("div", _hoisted_37, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.campus")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.filters.kkxq,
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => $setup.filters.kkxq = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.optionMaps.kkxq, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-kkxq",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_38);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_39, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseCategory")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.filters.kclb,
                  "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => $setup.filters.kclb = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.optionMaps.kclb, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-kclb",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_40);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_41, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseType")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.filters.kclx,
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => $setup.filters.kclx = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.optionMaps.kclx, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-kclx",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_42);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ])
            ])
          ], 64)) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_43, [
          createBaseVNode("div", _hoisted_44, [
            createBaseVNode("div", null, [
              createBaseVNode("h3", null, toDisplayString($setup.t("selection.batch.title")), 1),
              createBaseVNode("p", null, toDisplayString($setup.cleanMessage($setup.overview?.message) || $setup.t("selection.batch.defaultHint")), 1)
            ])
          ]),
          $setup.tabs.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_45, [
            createVNode(_component_IOSSelect, {
              "model-value": $setup.activeTabId,
              class: "modern-select batch-select",
              "onUpdate:modelValue": $setup.handleTabChange
            }, {
              default: withCtx(() => [
                (openBlock(true), createElementBlock(Fragment, null, renderList($setup.tabs, (tab) => {
                  return openBlock(), createElementBlock("option", {
                    key: tab.xkgzid,
                    value: tab.xkgzid
                  }, toDisplayString(tab.xkgzMc || $setup.t("selection.batch.unnamed")), 9, _hoisted_46);
                }), 128))
              ]),
              _: 1
            }, 8, ["model-value"])
          ])) : (openBlock(), createBlock($setup["TEmptyState"], {
            key: 1,
            message: "",
            icon: ""
          }, {
            default: withCtx(() => [
              createBaseVNode("p", null, toDisplayString($setup.overviewError || $setup.cleanMessage($setup.overview?.message) || $setup.t("selection.batch.none")), 1)
            ]),
            _: 1
          }))
        ]),
        createBaseVNode("div", _hoisted_47, [
          $setup.loadingOverview || $setup.loadingList ? (openBlock(), createBlock($setup["TEmptyState"], {
            key: 0,
            type: "loading",
            message: $setup.t("selection.list.syncing")
          }, null, 8, ["message"])) : !$setup.canShowList || $setup.courses.length === 0 ? (openBlock(), createBlock($setup["TEmptyState"], {
            key: 1,
            message: $setup.emptyHint
          }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_48, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($setup.courses, (course) => {
              return openBlock(), createElementBlock("button", {
                key: course.id,
                type: "button",
                class: "course-card glass-card",
                onClick: ($event) => $setup.openDetail(course)
              }, [
                createBaseVNode("div", _hoisted_50, [
                  createBaseVNode("div", null, [
                    createBaseVNode("div", _hoisted_51, toDisplayString(course.kcmc || $setup.t("selection.list.unnamedCourse")), 1),
                    createBaseVNode("div", _hoisted_52, toDisplayString(course.jxbmcDisplay || course.jxbmc || $setup.t("selection.list.unnamedClass")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_53, [
                    course.isConflict ? (openBlock(), createElementBlock("span", _hoisted_54, toDisplayString($setup.t("selection.list.conflict")), 1)) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_55, toDisplayString(course.xf || "--") + " " + toDisplayString($setup.t("selection.list.creditUnit")), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_56, [
                  createBaseVNode("span", _hoisted_57, toDisplayString(course.teacher || $setup.t("selection.list.teacherTbd")), 1),
                  course.isOnline ? (openBlock(), createElementBlock("span", _hoisted_58, toDisplayString($setup.t("selection.list.onlineCourse")), 1)) : (openBlock(), createElementBlock("span", _hoisted_59, toDisplayString(course.scheduleText || $setup.t("selection.list.timeTbd")), 1))
                ]),
                createBaseVNode("div", _hoisted_60, [
                  createBaseVNode("div", _hoisted_61, [
                    createBaseVNode("span", _hoisted_62, toDisplayString($setup.tf("selection.list.capacity", { text: course.capacity.display })), 1),
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
                      disabled: !course.isSelectable || course.isFull || $setup.selectingCourseId === course.id,
                      onClick: ($event) => $setup.handleSelectCourse(course)
                    }, toDisplayString($setup.selectingCourseId === course.id ? $setup.t("selection.list.selecting") : $setup.t("selection.list.select")), 9, _hoisted_63)) : (openBlock(), createElementBlock("button", {
                      key: 1,
                      class: "action-btn danger",
                      type: "button",
                      disabled: $setup.withdrawingCourseId === course.id,
                      onClick: ($event) => $setup.openWithdrawConfirm(course)
                    }, toDisplayString($setup.withdrawingCourseId === course.id ? $setup.t("selection.list.withdrawing") : $setup.t("selection.list.withdraw")), 9, _hoisted_64))
                  ])
                ])
              ], 8, _hoisted_49);
            }), 128))
          ]))
        ])
      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
        createBaseVNode("div", _hoisted_65, [
          createBaseVNode("div", _hoisted_66, [
            createBaseVNode("div", null, [
              createBaseVNode("div", _hoisted_67, toDisplayString($setup.t("selection.filter.infoTitle")), 1),
              createBaseVNode("div", _hoisted_68, toDisplayString($setup.t("selection.filter.infoSubtitle")), 1)
            ]),
            createBaseVNode("div", _hoisted_69, [
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: $setup.backToEntryMenu
              }, toDisplayString($setup.t("selection.filter.backToEntry")), 1),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: $setup.resetInfoFilters
              }, toDisplayString($setup.t("selection.filter.reset")), 1),
              createBaseVNode("button", {
                class: "ghost-btn",
                type: "button",
                onClick: _cache[10] || (_cache[10] = ($event) => $setup.infoShowAdvanced = !$setup.infoShowAdvanced)
              }, toDisplayString($setup.infoShowAdvanced ? $setup.t("selection.filter.collapse") : $setup.t("selection.filter.expand")), 1),
              createBaseVNode("button", {
                class: "primary-btn",
                type: "button",
                disabled: $setup.loadingInfo,
                onClick: _cache[11] || (_cache[11] = ($event) => $setup.querySelectedCourses())
              }, toDisplayString($setup.t("common.confirm")), 9, _hoisted_70)
            ])
          ]),
          createBaseVNode("div", _hoisted_71, [
            createBaseVNode("div", _hoisted_72, [
              createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.currentTerm")), 1),
              createVNode(_component_IOSSelect, {
                modelValue: $setup.infoFilters.term,
                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => $setup.infoFilters.term = $event),
                class: "modern-select",
                onChange: $setup.onInfoTermChange
              }, {
                default: withCtx(() => [
                  (openBlock(true), createElementBlock(Fragment, null, renderList($setup.infoOptions.term, (item) => {
                    return openBlock(), createElementBlock("option", {
                      key: item.value || "empty-info-term",
                      value: item.value
                    }, toDisplayString(item.label), 9, _hoisted_73);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ])
          ]),
          $setup.infoShowAdvanced ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("div", _hoisted_74, [
              createBaseVNode("div", _hoisted_75, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseName")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => $setup.infoFilters.kcmc = $event),
                  class: "text-input",
                  type: "text",
                  placeholder: $setup.t("selection.filter.courseNamePlaceholder")
                }, null, 8, _hoisted_76), [
                  [
                    vModelText,
                    $setup.infoFilters.kcmc,
                    void 0,
                    { trim: true }
                  ]
                ])
              ]),
              createBaseVNode("div", _hoisted_77, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.detail.teacher")), 1),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => $setup.infoFilters.teacher = $event),
                  class: "text-input",
                  type: "text",
                  placeholder: $setup.t("selection.filter.teacherPlaceholder")
                }, null, 8, _hoisted_78), [
                  [
                    vModelText,
                    $setup.infoFilters.teacher,
                    void 0,
                    { trim: true }
                  ]
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_79, [
              createBaseVNode("div", _hoisted_80, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseNature")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.infoFilters.kcxz,
                  "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => $setup.infoFilters.kcxz = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.infoOptions.kcxz, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-info-kcxz",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_81);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_82, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.courseType")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.infoFilters.kclx,
                  "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => $setup.infoFilters.kclx = $event),
                  class: "modern-select"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.infoOptions.kclx, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-info-kclx",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_83);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_84, [
                createBaseVNode("label", null, toDisplayString($setup.t("selection.filter.selectionMode")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: $setup.infoFilters.xkfs,
                  "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => $setup.infoFilters.xkfs = $event),
                  class: "modern-select",
                  disabled: !$setup.infoShowOtherModes
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList($setup.infoOptions.xkfs, (item) => {
                      return openBlock(), createElementBlock("option", {
                        key: item.value || "empty-info-xkfs",
                        value: item.value
                      }, toDisplayString(item.label), 9, _hoisted_85);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue", "disabled"])
              ])
            ]),
            createBaseVNode("div", _hoisted_86, [
              createBaseVNode("label", _hoisted_87, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => $setup.infoShowOtherModes = $event),
                  type: "checkbox",
                  onChange: $setup.handleInfoOtherModesChange
                }, null, 544), [
                  [vModelCheckbox, $setup.infoShowOtherModes]
                ]),
                createBaseVNode("span", null, toDisplayString($setup.t("selection.filter.showOtherModes")), 1)
              ])
            ])
          ], 64)) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_88, [
          $setup.loadingInfo ? (openBlock(), createBlock($setup["TEmptyState"], {
            key: 0,
            type: "loading",
            message: $setup.t("selection.info.querying")
          }, null, 8, ["message"])) : $setup.filteredInfoCourses.length === 0 ? (openBlock(), createBlock($setup["TEmptyState"], {
            key: 1,
            message: $setup.infoEmptyHint
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            $setup.infoSourceMessage ? (openBlock(), createElementBlock("div", _hoisted_89, toDisplayString($setup.infoSourceMessage), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_90, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.filteredInfoCourses, (course) => {
                return openBlock(), createElementBlock("button", {
                  key: `${course.id}-${course.termLabel}-${course.sourceTabId}`,
                  type: "button",
                  class: "course-card glass-card",
                  onClick: ($event) => $setup.openDetail(course)
                }, [
                  createBaseVNode("div", _hoisted_92, [
                    createBaseVNode("div", null, [
                      createBaseVNode("div", _hoisted_93, toDisplayString(course.kcmc || $setup.t("selection.list.unnamedCourse")), 1),
                      createBaseVNode("div", _hoisted_94, toDisplayString(course.jxbmcDisplay || course.jxbmc || $setup.t("selection.list.unnamedClass")), 1)
                    ]),
                    createBaseVNode("div", _hoisted_95, [
                      createBaseVNode("span", _hoisted_96, toDisplayString(course.xkfsText || $setup.t("selection.info.defaultMode")), 1),
                      createBaseVNode("div", _hoisted_97, toDisplayString(course.xf || "--") + " " + toDisplayString($setup.t("selection.list.creditUnit")), 1)
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_98, [
                    createBaseVNode("span", _hoisted_99, toDisplayString(course.teacher || $setup.t("selection.list.teacherTbd")), 1),
                    course.isOnline ? (openBlock(), createElementBlock("span", _hoisted_100, toDisplayString($setup.t("selection.list.onlineCourse")), 1)) : (openBlock(), createElementBlock("span", _hoisted_101, toDisplayString(course.scheduleText || $setup.t("selection.list.timeTbd")), 1))
                  ]),
                  createBaseVNode("div", _hoisted_102, [
                    createBaseVNode("span", _hoisted_103, toDisplayString($setup.tf("selection.list.termLabel", { term: course.termLabel || "--" })), 1),
                    createBaseVNode("span", _hoisted_104, toDisplayString($setup.tf("selection.list.modeLabel", { mode: course.xkfsText || $setup.t("selection.info.defaultMode") })), 1),
                    createBaseVNode("span", {
                      class: normalizeClass(["status-pill", course.statusClass])
                    }, toDisplayString(course.statusLabel), 3)
                  ])
                ], 8, _hoisted_91);
              }), 128))
            ])
          ], 64))
        ])
      ], 64))
    ]),
    (openBlock(), createBlock(Teleport, { to: "body" }, [
      $setup.showDetail && $setup.currentDetailCourse ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: "modal-overlay",
        onClick: $setup.closeDetail
      }, [
        createBaseVNode("div", {
          class: "modal-content detail-modal glass",
          onClick: _cache[19] || (_cache[19] = withModifiers(() => {
          }, ["stop"]))
        }, [
          createBaseVNode("div", _hoisted_105, [
            createBaseVNode("div", null, [
              createBaseVNode("div", _hoisted_106, toDisplayString($setup.currentDetailCourse.kcmc), 1),
              createBaseVNode("div", _hoisted_107, toDisplayString($setup.currentDetailCourse.jxbmc), 1)
            ]),
            createBaseVNode("button", {
              class: "close-btn",
              type: "button",
              onClick: $setup.closeDetail
            }, "×")
          ]),
          createBaseVNode("div", _hoisted_108, [
            $setup.currentDetailCourse.isOnline ? (openBlock(), createElementBlock("span", _hoisted_109, toDisplayString($setup.t("selection.list.onlineCourse")), 1)) : createCommentVNode("", true),
            createBaseVNode("span", {
              class: normalizeClass(["status-pill", $setup.currentDetailCourse.statusClass])
            }, toDisplayString($setup.currentDetailCourse.statusLabel), 3)
          ]),
          createBaseVNode("div", _hoisted_110, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($setup.detailFields, (item) => {
              return openBlock(), createElementBlock("div", {
                key: item.label,
                class: "detail-item"
              }, [
                createBaseVNode("span", _hoisted_111, toDisplayString(item.label), 1),
                createBaseVNode("span", _hoisted_112, toDisplayString(item.value), 1)
              ]);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_113, [
            createBaseVNode("h4", null, toDisplayString($setup.t("selection.detail.intro")), 1),
            createBaseVNode("div", _hoisted_114, toDisplayString($setup.detailIntro || $setup.normalizeDetailIntro($setup.normalizeDetailSourceText($setup.currentDetailCourse.kcjj), { allowConflictText: $setup.currentDetailCourse.isConflict }) || $setup.t("selection.detail.introEmpty")), 1)
          ]),
          createBaseVNode("div", _hoisted_115, [
            createBaseVNode("h4", null, toDisplayString($setup.t("selection.detail.teacherDetail")), 1),
            createBaseVNode("div", _hoisted_116, toDisplayString($setup.detailTeacherText || $setup.currentDetailCourse.teacher || $setup.t("selection.detail.teacherEmpty")), 1)
          ]),
          $setup.detailLoading ? (openBlock(), createElementBlock("div", _hoisted_117, toDisplayString($setup.t("selection.detail.loadingMore")), 1)) : createCommentVNode("", true)
        ])
      ])) : createCommentVNode("", true)
    ])),
    (openBlock(), createBlock(Teleport, { to: "body" }, [
      $setup.showChildClassDialog ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: "modal-overlay",
        onClick: _cache[24] || (_cache[24] = ($event) => $setup.showChildClassDialog = false)
      }, [
        createBaseVNode("div", {
          class: "modal-content child-modal glass",
          onClick: _cache[23] || (_cache[23] = withModifiers(() => {
          }, ["stop"]))
        }, [
          createBaseVNode("div", _hoisted_118, [
            createBaseVNode("div", null, [
              createBaseVNode("div", _hoisted_119, toDisplayString($setup.t("selection.child.title")), 1),
              createBaseVNode("div", _hoisted_120, toDisplayString($setup.pendingSelectCourse?.kcmc || $setup.t("selection.child.currentCourse")), 1)
            ]),
            createBaseVNode("button", {
              class: "close-btn",
              type: "button",
              onClick: _cache[20] || (_cache[20] = ($event) => $setup.showChildClassDialog = false)
            }, "×")
          ]),
          createBaseVNode("div", _hoisted_121, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($setup.childClasses, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                type: "button",
                class: normalizeClass(["child-class-item", { active: $setup.selectedChildClassId === item.id }]),
                onClick: ($event) => $setup.selectedChildClassId = item.id
              }, [
                createBaseVNode("div", _hoisted_123, toDisplayString(item.name || item.id), 1),
                createBaseVNode("div", _hoisted_124, toDisplayString(item.teacher || $setup.t("selection.list.teacherTbd")), 1),
                createBaseVNode("div", _hoisted_125, toDisplayString(item.schedule || $setup.t("selection.child.timeTbd")), 1)
              ], 10, _hoisted_122);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_126, [
            createBaseVNode("button", {
              class: "ghost-btn",
              type: "button",
              onClick: _cache[21] || (_cache[21] = ($event) => $setup.showChildClassDialog = false)
            }, toDisplayString($setup.t("common.cancel")), 1),
            createBaseVNode("button", {
              class: "primary-btn",
              type: "button",
              disabled: !$setup.selectedChildClassId || !$setup.pendingSelectCourse,
              onClick: _cache[22] || (_cache[22] = ($event) => {
                $setup.showChildClassDialog = false;
                $setup.openActionConfirm({ type: "select", course: $setup.pendingSelectCourse, childClassId: $setup.selectedChildClassId });
              })
            }, toDisplayString($setup.t("selection.child.confirm")), 9, _hoisted_127)
          ])
        ])
      ])) : createCommentVNode("", true)
    ])),
    (openBlock(), createBlock(Teleport, { to: "body" }, [
      $setup.showActionConfirmDialog ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: "modal-overlay",
        onClick: $setup.closeActionConfirm
      }, [
        createBaseVNode("div", {
          class: "modal-content confirm-modal glass",
          onClick: _cache[25] || (_cache[25] = withModifiers(() => {
          }, ["stop"]))
        }, [
          createBaseVNode("div", _hoisted_128, toDisplayString($setup.confirmActionType === "withdraw" ? $setup.t("selection.confirm.withdrawTitle") : $setup.t("selection.confirm.selectTitle")), 1),
          createBaseVNode("div", _hoisted_129, [
            $setup.confirmActionType === "withdraw" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createTextVNode(toDisplayString($setup.tf("selection.confirm.withdrawText", { name: $setup.confirmTargetCourse?.kcmc || $setup.t("selection.child.currentCourse") })), 1)
            ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createTextVNode(toDisplayString($setup.tf("selection.confirm.selectText", { name: $setup.confirmTargetCourse?.kcmc || $setup.t("selection.child.currentCourse") })), 1)
            ], 64))
          ]),
          createBaseVNode("div", _hoisted_130, [
            createBaseVNode("button", {
              class: "ghost-btn",
              type: "button",
              onClick: $setup.closeActionConfirm
            }, toDisplayString($setup.t("common.cancel")), 1),
            createBaseVNode("button", {
              class: normalizeClass($setup.confirmActionType === "withdraw" ? "danger-btn" : "primary-btn"),
              type: "button",
              disabled: !$setup.confirmTargetCourse || $setup.confirmActionType === "withdraw" && $setup.withdrawingCourseId === $setup.confirmTargetCourse.id || $setup.confirmActionType === "select" && $setup.selectingCourseId === $setup.confirmTargetCourse.id,
              onClick: $setup.submitConfirmedAction
            }, [
              $setup.confirmActionType === "withdraw" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createTextVNode(toDisplayString($setup.withdrawingCourseId === $setup.confirmTargetCourse?.id ? $setup.t("selection.list.withdrawing") : $setup.t("selection.confirm.confirmWithdraw")), 1)
              ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                createTextVNode(toDisplayString($setup.selectingCourseId === $setup.confirmTargetCourse?.id ? $setup.t("selection.list.selecting") : $setup.t("selection.confirm.confirmSelect")), 1)
              ], 64))
            ], 10, _hoisted_131)
          ])
        ])
      ])) : createCommentVNode("", true)
    ])),
    createVNode(Transition, { name: "fade" }, {
      default: withCtx(() => [
        $setup.toastState.visible ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: normalizeClass(["toast-pill", $setup.toastState.type])
        }, toDisplayString($setup.toastState.message), 3)) : createCommentVNode("", true)
      ]),
      _: 1
    })
  ]);
}
const _sfc_main = {
  __name: "CourseSelectionView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { expose: __expose, emit: __emit }) {
    __expose();
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
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
      // 数据格式值：与教务接口「\u9009\u8bfe」方式语义对齐（用 \u 转义通过 CJK 扫描，课表批次先例）
      xkfs: "选课"
    });
    const infoOptions = ref({
      term: [{ value: "", label: "全部学期" }],
      kcxz: [{ value: "", label: "全部性质" }],
      kclx: [{ value: "", label: "全部类型" }],
      xkfs: [{ value: "", label: "全部方式" }]
    });
    const infoPlaceholderOptions = computed(() => ({
      term: [{ value: "", label: t("selection.info.placeholderAllTerm") }],
      kcxz: [{ value: "", label: t("selection.info.placeholderAllNature") }],
      kclx: [{ value: "", label: t("selection.info.placeholderAllType") }],
      xkfs: [{ value: "", label: t("selection.info.placeholderAllMode") }]
    }));
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
        kcxz: normalizeOptionList(condition.kcxzList || overviewConditions.kcxzList, t("selection.info.placeholderAllNature")),
        kcgs: normalizeOptionList(condition.kcgsList || overviewConditions.kcgsList, t("selection.info.placeholderAllOwner")),
        jxms: normalizeOptionList(condition.jxmsList || overviewConditions.jxmsList, t("selection.info.placeholderAllMode")),
        kkxq: normalizeOptionList(condition.kkxqList || overviewConditions.kkxqList, t("selection.info.placeholderAllCampus")),
        kclb: normalizeOptionList(condition.kclbList || overviewConditions.kclbList, t("selection.info.placeholderAllCategory")),
        kclx: normalizeOptionList(condition.kclxList || overviewConditions.kclxList, t("selection.info.placeholderAllType"))
      };
    });
    const detailFields = computed(() => {
      const course = selectedCourse.value;
      if (!course) return [];
      const rows = [
        { label: t("selection.detail.courseName"), value: course.kcmc },
        { label: t("selection.detail.className"), value: course.jxbmc },
        { label: t("selection.detail.credit"), value: course.xf },
        { label: t("selection.detail.courseNature"), value: findOptionLabel(optionMaps.value.kcxz, course.kcxz, KCXZ_LABEL_MAP[course.kcxz] || course.kcxz) },
        { label: t("selection.detail.courseCategory"), value: course.kclbname || findOptionLabel(optionMaps.value.kclb, course.kclb, course.kclb) },
        { label: t("selection.detail.courseType"), value: findOptionLabel(optionMaps.value.kclx, course.kclx, resolveCourseTypeLabel(course.kclx, course.kclx)) },
        { label: t("selection.detail.teachingMode"), value: findOptionLabel(optionMaps.value.jxms, course.jxms, course.jxms) },
        { label: t("selection.detail.teacher"), value: course.teacher },
        { label: t("selection.detail.timePlace"), value: course.isOnline ? t("selection.detail.timePlace.online") : course.scheduleText || course.sksjdd || t("selection.list.timeTbd") },
        { label: t("selection.detail.campus"), value: course.kkxqmc || findOptionLabel(optionMaps.value.kkxq, course.kkxq, course.kkxqmc || course.kkxq) },
        { label: t("selection.detail.classGroup"), value: course.jxbzc },
        { label: t("selection.detail.capacity"), value: course.capacity.display },
        { label: t("selection.detail.conflictState"), value: course.isConflict ? t("selection.detail.conflictState.conflict") : t("selection.detail.conflictState.none") },
        { label: t("selection.detail.label"), value: course.label },
        { label: t("selection.detail.examForm"), value: course.ksxs }
      ];
      return rows.filter((item) => safeText(item.value));
    });
    const detailTeacherText = computed(() => detailTeachers.value.join("、"));
    const formatCountdown = (seconds) => {
      if (!Number.isFinite(seconds)) return "--";
      if (seconds <= 0) return t("selection.countdown.ended");
      const day = Math.floor(seconds / 86400);
      const hour = Math.floor(seconds % 86400 / 3600);
      const minute = Math.floor(seconds % 3600 / 60);
      const second = Math.floor(seconds % 60);
      const chunks = [];
      if (day > 0) chunks.push(`${day}${t("selection.countdown.dayUnit")}`);
      if (hour > 0) chunks.push(`${hour}${t("selection.countdown.hourUnit")}`);
      if (minute > 0) chunks.push(`${minute}${t("selection.countdown.minuteUnit")}`);
      if (second > 0 || chunks.length === 0) chunks.push(`${second}${t("selection.countdown.secondUnit")}`);
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
      if (picked) return { statusLabel: t("selection.status.picked"), statusClass: "picked" };
      if (!selectable) return { statusLabel: t("selection.status.notSelectable"), statusClass: "disabled" };
      if (full) return { statusLabel: t("selection.status.full"), statusClass: "full" };
      if (conflict) return { statusLabel: t("selection.status.conflict"), statusClass: "conflict" };
      return { statusLabel: t("selection.status.selectable"), statusClass: "ready" };
    };
    const normalizeCourse = (item) => {
      const capacity = parseCapacityInfo(item.yxrl, availableRatio.value);
      const pickedLabel = "已选";
      const picked = isPickedValue(item.status) || safeText(item.zt) === pickedLabel || safeText(item.statusLabel).includes(pickedLabel);
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
          countdownText.value = t("selection.countdown.ended");
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
        console.log("[selection-debug] overview raw response:", JSON.stringify(res?.data).slice(0, 500));
        const { data, meta } = unwrapApiResult(res, t("selection.message.overviewFailed"));
        console.log("[selection-debug] overview unwrapped data keys:", Object.keys(data || {}));
        console.log("[selection-debug] tab count:", Array.isArray(data.tabs) ? data.tabs.length : "N/A", ", pcencs keys:", Object.keys(data.pcencs || {}));
        console.log("[selection-debug] has_valid_pcencs:", data.has_valid_pcencs, ", message:", data.message);
        if (Array.isArray(data.tabs)) {
          data.tabs.forEach((t2, i) => console.log(`[selection-debug] tab[${i}]: xkgzid=${t2.xkgzid}, xkgzMc=${t2.xkgzMc}, kklx=${t2.kklx}`));
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
          listMessage.value = cleanMessage(data.message) || t("selection.message.noneAvailable");
          stopCountdownTick();
          stopEndTimeRefresh();
        }
      } catch (err) {
        overviewError.value = resolveErrorMessage(err, t("selection.message.overviewFailed"));
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
        const { data } = unwrapApiResult(res, t("selection.message.countdownFailed"));
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
      console.log("[selection-debug] fetchList: pcid=", currentPcid.value, ", pcenc=", currentPcenc.value ? currentPcenc.value.slice(0, 20) + "..." : "(empty)");
      if (!currentPcid.value || !currentPcenc.value) {
        courses.value = [];
        listMessage.value = t("selection.message.invalidCredential");
        console.warn("[selection-debug] fetchList aborted: pcid or pcenc is empty");
        return;
      }
      loadingList.value = true;
      listMessage.value = "";
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/course_selection/list`, getRequestPayload());
        const { data, meta } = unwrapApiResult(res, t("selection.message.listFailed"));
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
        listMessage.value = resolveErrorMessage(err, t("selection.message.listFailed"));
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
          showToast(t("selection.message.refreshed"), "success");
        } else {
          showToast(t("selection.message.noRefreshableBatch"), "info");
        }
      } catch (err) {
        showToast(resolveErrorMessage(err, t("selection.message.refreshFailed")), "error");
      } finally {
        refreshing.value = false;
      }
    };
    const mapToOptions = (sourceMap, placeholder = t("selection.info.placeholderAll")) => {
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
        item?.xkfsmc || item?.xkfs || item?.selection_mode || item?.select_mode || item?.mode || t("selection.info.defaultMode")
      ) || t("selection.info.defaultMode");
    };
    const deriveTabTermLabel = (tab) => {
      const tabName = safeText(tab?.xkgzMc);
      if (tabName) return tabName;
      const studentSemester = safeText(summaryStudent.value?.semester);
      return studentSemester || t("selection.info.placeholderAllTerm");
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
      const pickedLabel = "已选";
      const picked = normalized.isPicked || isPickedValue(item?.status) || safeText(item?.zt) === pickedLabel || safeText(item?.statusLabel).includes(pickedLabel);
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
        termLabel: safeText(item?.xnxq || item?.semester || context.termLabel || summaryStudent.value?.semester || t("selection.info.placeholderAllTerm")),
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
      normalizeOptionList(condition?.kcxzList, t("selection.info.placeholderAllNature")).forEach((item) => {
        const value = safeText(item.value || item.label);
        const label = safeText(item.label || item.value);
        if (!value || !label) return;
        kcxzMap.set(value, label);
      });
      normalizeOptionList(condition?.kclxList, t("selection.info.placeholderAllType")).forEach((item) => {
        const value = safeText(item.value || item.label);
        const label = resolveCourseTypeLabel(value, item.label || item.value);
        if (!value || !label) return;
        kclxMap.set(value, label);
      });
    };
    const applyInfoOptionsAndDefaults = ({ termMap, xkfsSet, kcxzMap, kclxMap }) => {
      infoOptions.value = {
        term: mapToOptions(termMap, t("selection.info.placeholderAllTerm")),
        xkfs: mapToOptions(new Map(Array.from(xkfsSet).map((value) => [value, value])), t("selection.info.placeholderAllMode")),
        kcxz: mapToOptions(kcxzMap, t("selection.info.placeholderAllNature")),
        kclx: mapToOptions(kclxMap, t("selection.info.placeholderAllType"))
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
      const { data } = unwrapApiResult(res, t("selection.message.selectedFailed"));
      const list = pickArrayPayload(data);
      if (!list.length) {
        throw new Error(t("selection.message.selectedEmpty"));
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
          tabName: safeText(item?.sourceTabName || item?.source || t("selection.message.selectedFailed")),
          termLabel: safeText(item?.xnxq || item?.semester || data?.current_semester || summaryStudent.value?.semester || t("selection.info.placeholderAllTerm")),
          index
        });
        termMap.set(course.termLabel, course.termLabel);
        xkfsSet.add(course.xkfsText || t("selection.info.defaultMode"));
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
      console.log("[selection-debug] fetchSelectedCoursesByTabs: tab count=", tabs.value.length, ", pcencMap keys=", Object.keys(pcencMap.value || {}));
      const termMap = /* @__PURE__ */ new Map();
      const xkfsSet = /* @__PURE__ */ new Set(["选课"]);
      const kcxzMap = /* @__PURE__ */ new Map();
      const kclxMap = /* @__PURE__ */ new Map();
      const merged = [];
      for (const tab of tabs.value) {
        const tabId = safeText(tab?.xkgzid);
        if (!tabId) {
          console.warn("[selection-debug] skipped tab without xkgzid");
          continue;
        }
        const termLabel = deriveTabTermLabel(tab);
        const tabFrom = resolveTabFrom(tab);
        termMap.set(termLabel, termLabel);
        const tabPcenc = safeText(pcencMap.value?.[tabId] || pcencMap.value?.[String(tabId)] || tab?.pcenc);
        console.log(`[selection-debug] tab ${tabId}: pcenc=${tabPcenc ? tabPcenc.slice(0, 20) + "..." : "(empty)"}, from=${tabFrom}`);
        if (!tabPcenc) {
          console.warn(`[selection-debug] tab ${tabId} has no pcenc, skipped`);
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
          const { data } = unwrapApiResult(res, t("selection.message.selectedFailed"));
          mergeConditionOptions(data?.condition || {}, kcxzMap, kclxMap);
          const rawCourses = Array.isArray(data?.courses) ? data.courses : [];
          console.log(`[selection-debug] tab ${tabId}: list returned ${rawCourses.length} courses`);
          if (rawCourses.length > 0) {
            console.log(`[selection-debug] tab ${tabId}: first course status=${rawCourses[0].status}, kcmc=${rawCourses[0].kcmc}`);
          }
          let pickedCount = 0;
          rawCourses.forEach((item, index) => {
            const normalized = normalizeInfoCourse(item, {
              tabId,
              tabName: safeText(tab?.xkgzMc || t("selection.batch.unnamed")),
              termLabel,
              index
            });
            if (!normalized.isPicked) return;
            pickedCount += 1;
            merged.push(normalized);
            xkfsSet.add(normalized.xkfsText || t("selection.info.defaultMode"));
            if (safeText(normalized.kcxz)) {
              kcxzMap.set(safeText(normalized.kcxz), findOptionLabel(optionMaps.value.kcxz, normalized.kcxz, KCXZ_LABEL_MAP[normalized.kcxz] || normalized.kcxz));
            }
            if (safeText(normalized.kclx)) {
              const code = safeText(normalized.kclx);
              kclxMap.set(code, findOptionLabel(optionMaps.value.kclx, code, resolveCourseTypeLabel(code, code)));
            }
          });
          console.log(`[selection-debug] tab ${tabId}: isPicked count= ${pickedCount}`);
        } catch (tabErr) {
          console.error(`[selection-debug] tab ${tabId} list request failed:`, tabErr?.message || tabErr);
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
          console.log("[selection-debug] endpoint result: courses=", endpointFetched.courses.length);
          if (endpointFetched.courses.length) {
            fetched = endpointFetched;
            infoSourceMessage.value = t("selection.message.viaEndpoint");
          }
        } catch (epErr) {
          console.warn("[selection-debug] endpoint query failed:", epErr?.message || epErr);
        }
        if (!fetched || !fetched.courses.length) {
          if (!tabs.value.length) {
            await fetchOverview();
          }
          const tabsFetched = await fetchSelectedCoursesByTabs();
          console.log("[selection-debug] fetchSelectedCoursesByTabs result: courses=", tabsFetched.courses.length, ", termMap=", Array.from(tabsFetched.termMap.keys()));
          if (tabsFetched.courses.length) {
            fetched = tabsFetched;
            infoSourceMessage.value = t("selection.message.viaTabs");
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
          showToast(t("selection.message.infoRefreshed"), "success");
        }
      } catch (err) {
        infoCourses.value = [];
        infoError.value = resolveErrorMessage(err, t("selection.message.selectedFailed"));
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
        console.warn("[selection-debug] term-switch query failed:", err?.message || err);
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
          const { data } = unwrapApiResult(introRes.value, t("selection.message.introFailed"));
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
          const { data } = unwrapApiResult(teacherRes.value, t("selection.message.teacherFailed"));
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
        const { data } = unwrapApiResult(res, t("selection.message.selectFailed"));
        showChildClassDialog.value = false;
        childClasses.value = [];
        pendingSelectCourse.value = null;
        selectedChildClassId.value = "";
        showToast(safeText(data.msg) || t("selection.message.selectSuccess"), "success");
        await fetchList();
        if (selectedCourse.value?.id === course.id) {
          const next = courses.value.find((item) => item.id === course.id);
          if (next) selectedCourse.value = next;
        }
      } catch (err) {
        showToast(resolveErrorMessage(err, t("selection.message.selectFailed")), "error");
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
        const { data } = unwrapApiResult(res, t("selection.message.childClassFailed"));
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
        showToast(resolveErrorMessage(err, t("selection.message.childClassFailed")), "error");
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
        const { data } = unwrapApiResult(res, t("selection.message.withdrawFailed"));
        showToast(safeText(data.msg) || t("selection.message.withdrawSuccess"), "success");
        await fetchList();
        if (selectedCourse.value?.id === course.id) {
          const next = courses.value.find((item) => item.id === course.id);
          if (next) selectedCourse.value = next;
        }
      } catch (err) {
        showToast(resolveErrorMessage(err, t("selection.message.withdrawFailed")), "error");
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
        const mode = safeText(course.xkfsText || t("selection.info.defaultMode"));
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
      if (loadingInfo.value) return t("selection.info.querying");
      if (infoError.value) return infoError.value;
      if (!infoLoaded.value) return t("selection.info.autoLoadHint");
      return t("selection.info.noCourseUnderFilter");
    });
    const refreshButtonLabel = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) {
        return refreshing.value ? t("selection.refreshing") : t("selection.refresh");
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        return loadingInfo.value ? t("selection.querying") : t("selection.refreshQuery");
      }
      return t("selection.refresh");
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
        return tf("selection.pill.courseCount", { n: count.value });
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        return tf("selection.pill.selectedCount", { n: filteredInfoCourses.value.length });
      }
      return t("selection.pill.chooseEntry");
    });
    const headerSubPill = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) {
        return tf("selection.pill.countdown", { time: countdownText.value || "--" });
      }
      if (centerMode.value === ENTRY_MODE_INFO) {
        return tf("selection.pill.currentTerm", { term: safeText(infoFilters.value.term) || safeText(summaryStudent.value?.semester) || "--" });
      }
      return t("selection.pill.entryHint");
    });
    const pageTitle = computed(() => {
      if (centerMode.value === ENTRY_MODE_SELECTION) return t("selection.title.selection");
      if (centerMode.value === ENTRY_MODE_INFO) return t("selection.title.info");
      return t("selection.title");
    });
    const backButtonLabel = computed(() => centerMode.value === ENTRY_MODE_MENU ? t("selection.back.list") : t("selection.back.entry"));
    const emptyHint = computed(() => {
      if (loadingOverview.value || loadingList.value) return t("common.empty.loading");
      if (overviewError.value) return overviewError.value;
      return listMessage.value || t("selection.message.noneAvailable");
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
    const __returned__ = { props, emit, t, loadingOverview, loadingList, loadingInfo, refreshing, overviewError, infoError, offline, syncTime, overview, tabs, activeTabId, listConditions, pcencMap, courses, listMessage, occupiedSlots, availableRatio, count, remainingSeconds, countdownText, isPreview, showAdvanced, infoShowAdvanced, centerMode, infoSourceMessage, infoLoaded, infoCourses, infoShowOtherModes, filters, infoFilters, infoOptions, infoPlaceholderOptions, showDetail, selectedCourse, detailLoading, detailIntro, detailTeachers, showChildClassDialog, childClasses, pendingSelectCourse, selectedChildClassId, selectingCourseId, showActionConfirmDialog, confirmActionType, confirmTargetCourse, confirmTargetChildClassId, withdrawingCourseId, toastState, get toastTimer() {
      return toastTimer;
    }, set toastTimer(v) {
      toastTimer = v;
    }, get countdownTimer() {
      return countdownTimer;
    }, set countdownTimer(v) {
      countdownTimer = v;
    }, get endTimeRefreshTimer() {
      return endTimeRefreshTimer;
    }, set endTimeRefreshTimer(v) {
      endTimeRefreshTimer = v;
    }, currentTab, currentPcid, currentPcenc, summaryStudent, optionMaps, detailFields, detailTeacherText, formatCountdown, reconcileFilterSelection, resolveCourseStatus, normalizeCourse, getCoursePriority, sortCoursesForDisplay, applyCoursePatch, normalizeDetailSourceText, showToast, stopCountdownTick, startCountdownTick, stopEndTimeRefresh, startEndTimeRefresh, unwrapApiResult, buildListPayload, getRequestPayload, fetchOverview, fetchEndTime, fetchList, loadTabBundle, handleTabChange, resetFilters, queryCourses, refreshCourseData, mapToOptions, resolveInfoSelectionMode, deriveTabTermLabel, normalizeInfoCourse, dedupeInfoCourses, sortInfoCourses, pickArrayPayload, mergeConditionOptions, applyInfoOptionsAndDefaults, fetchSelectedCoursesByEndpoint, fetchSelectedCoursesByTabs, querySelectedCourses, resetInfoFilters, handleInfoOtherModesChange, onInfoTermChange, enterSelectionMode, enterInfoMode, backToEntryMenu, handleBack, handleHeaderRefresh, openDetail, closeDetail, submitSelect, openActionConfirm, closeActionConfirm, submitConfirmedAction, openChildClassPicker, handleSelectCourse, openWithdrawConfirm, submitWithdraw, currentDetailCourse, filteredInfoCourses, infoEmptyHint, refreshButtonLabel, refreshDisabled, headerMainPill, headerSubPill, pageTitle, backButtonLabel, emptyHint, canShowList, computed, onBeforeUnmount, onMounted, ref, get axios() {
      return axiosInstance;
    }, get TEmptyState() {
      return TEmptyState;
    }, get useI18n() {
      return useI18n;
    }, get tf() {
      return tf;
    }, get API_BASE() {
      return API_BASE;
    }, get DEFAULT_FROM() {
      return DEFAULT_FROM;
    }, get KKLX_FROM_MAP() {
      return KKLX_FROM_MAP;
    }, get ENTRY_MODE_MENU() {
      return ENTRY_MODE_MENU;
    }, get ENTRY_MODE_SELECTION() {
      return ENTRY_MODE_SELECTION;
    }, get ENTRY_MODE_INFO() {
      return ENTRY_MODE_INFO;
    }, get KCXZ_LABEL_MAP() {
      return KCXZ_LABEL_MAP;
    }, get KCLX_LABEL_MAP() {
      return KCLX_LABEL_MAP;
    }, get EMPTY_LIST_FILTERS() {
      return EMPTY_LIST_FILTERS;
    }, get safeText() {
      return safeText;
    }, get resolveCourseTypeLabel() {
      return resolveCourseTypeLabel;
    }, get isEnabledValue() {
      return isEnabledValue;
    }, get isPickedValue() {
      return isPickedValue;
    }, get resolveTabFrom() {
      return resolveTabFrom;
    }, get stripHtml() {
      return stripHtml;
    }, get normalizeScheduleText() {
      return normalizeScheduleText;
    }, get compactTeachingClassName() {
      return compactTeachingClassName;
    }, get hasConflictHint() {
      return hasConflictHint;
    }, get normalizeDetailIntro() {
      return normalizeDetailIntro;
    }, get cleanMessage() {
      return cleanMessage;
    }, get resolveErrorMessage() {
      return resolveErrorMessage;
    }, get normalizeOptionList() {
      return normalizeOptionList;
    }, get findOptionLabel() {
      return findOptionLabel;
    }, get formatRatioText() {
      return formatRatioText;
    }, get parseCapacityInfo() {
      return parseCapacityInfo;
    }, get normalizeTeacherContent() {
      return normalizeTeacherContent;
    } };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
};
const CourseSelectionView = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", render], ["__scopeId", "data-v-5f950be6"]]);
export {
  CourseSelectionView as default
};
