import { v as watch, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, t as toDisplayString, F as Fragment, g as renderList, f as normalizeStyle, J as withDirectives, K as vModelText, e as createTextVNode, d as createCommentVNode, T as Transition, h as computed, r as ref, C as nextTick, L as resolveComponent, n as normalizeClass, j as createBlock, u as unref, M as vModelRadio, w as withModifiers, s as Teleport } from "./vue-core-DWoFi2CM.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _export_sfc, j as resolveCurrentSemester, n as normalizeSemesterList, k as compareSemesterDesc } from "./app-demo-Bca6_3ab.js";
import { T as TEmptyState } from "./TEmptyState-DID0vJFI.js";
import "./runtime-bridge-BU9jeOXP.js";
import "./more-modules-CfNfahoc.js";
import "./debug-tools-BgYILSb8.js";
import "./capture-D-zd0oUS.js";
function getServiceBaseUrl() {
  try {
    const endpoint = localStorage.getItem("hbu_ocr_endpoint") || "";
    if (endpoint) {
      const url = new URL(endpoint);
      return `${url.protocol}//${url.host}`;
    }
  } catch {
  }
  return "https://mini-hbut-ocr-service.hf.space";
}
const GRADE_API_PREFIX = "/api/grade-distribution";
const REQUEST_TIMEOUT_MS = 1e4;
const isTimeoutError = (e) => e && e.name === "AbortError";
const isNetworkError = (e) => e instanceof TypeError || /failed to fetch|network error/i.test(String(e && e.message || e));
async function requestJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url, controller ? { ...options, signal: controller.signal } : options);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || "查询失败");
    return data;
  } catch (e) {
    if (controller?.signal.aborted || isTimeoutError(e)) {
      throw new Error("查询超时，请检查网络后重试");
    }
    if (isNetworkError(e)) {
      throw new Error("无法连接给分查询服务，请检查网络后重试");
    }
    throw e;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
async function fetchGradeDistribution(params = {}) {
  const base = getServiceBaseUrl();
  const data = await requestJson(`${base}${GRADE_API_PREFIX}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      semester: params.semester || null,
      course_name: params.course_name || null,
      teacher_name: params.teacher_name || null,
      page: params.page || 1,
      page_size: params.page_size || 50
    })
  });
  return {
    total: data.total || 0,
    page: data.page || 1,
    page_size: data.page_size || 50,
    items: data.items || []
  };
}
const _hoisted_1$1 = {
  key: "detail",
  class: "gd-detail"
};
const _hoisted_2$1 = { class: "gd-detail-card" };
const _hoisted_3$1 = { class: "gd-detail-title" };
const _hoisted_4$1 = { class: "gd-detail-meta" };
const _hoisted_5$1 = { class: "gd-meta-tag" };
const _hoisted_6$1 = { class: "gd-meta-badge" };
const _hoisted_7$1 = { class: "gd-detail-stats" };
const _hoisted_8$1 = { class: "gd-dstat" };
const _hoisted_9$1 = {
  class: "gd-dstat-value",
  style: { "color": "#22c55e" }
};
const _hoisted_10$1 = { class: "gd-dstat" };
const _hoisted_11$1 = {
  class: "gd-dstat-value",
  style: { "color": "#ef4444" }
};
const _hoisted_12$1 = { class: "gd-dstat" };
const _hoisted_13$1 = {
  class: "gd-dstat-value",
  style: { "color": "#3b82f6" }
};
const _hoisted_14$1 = { class: "gd-dstat" };
const _hoisted_15$1 = {
  class: "gd-dstat-value",
  style: { "color": "#8b5cf6" }
};
const _hoisted_16$1 = { class: "gd-dstat" };
const _hoisted_17$1 = {
  class: "gd-dstat-value",
  style: { "color": "var(--color-primary,#6366f1)" }
};
const _hoisted_18$1 = { class: "gd-detail-segments" };
const _hoisted_19$1 = { class: "gd-seg-label" };
const _hoisted_20$1 = { class: "gd-seg-bar-bg" };
const _hoisted_21$1 = { class: "gd-seg-info" };
const _hoisted_22$1 = {
  key: "list",
  class: "gd-list-page"
};
const _hoisted_23$1 = { class: "gd-filters" };
const _hoisted_24$1 = { class: "gd-search" };
const _hoisted_25$1 = {
  key: 0,
  class: "gd-error"
};
const _hoisted_26$1 = {
  key: 1,
  class: "gd-loading"
};
const _hoisted_27$1 = {
  key: 2,
  class: "gd-empty"
};
const _hoisted_28$1 = {
  key: 3,
  class: "gd-empty"
};
const _hoisted_29$1 = {
  key: 4,
  class: "gd-list"
};
const _hoisted_30$1 = ["onClick"];
const _hoisted_31$1 = { class: "gd-item-left" };
const _hoisted_32$1 = { class: "gd-item-name" };
const _hoisted_33$1 = { class: "gd-item-sub" };
const _hoisted_34$1 = { class: "gd-item-right" };
const _hoisted_35$1 = {
  class: "gd-item-avg",
  style: { color: "#ef4444" }
};
const _hoisted_36$1 = {
  key: 5,
  class: "gd-pagination"
};
const _hoisted_37$1 = ["disabled"];
const _hoisted_38$1 = { class: "gd-page-info" };
const _hoisted_39$1 = ["disabled"];
const pageSize = 50;
const _sfc_main$1 = {
  __name: "GradeDistributionView",
  setup(__props) {
    const loading = ref(false);
    const error = ref("");
    const searchQuery = ref("");
    const items = ref([]);
    const total = ref(0);
    const page = ref(1);
    const selectedItem = ref(null);
    const SEGMENT_KEYS = ["90-100", "80-89", "70-79", "60-69", "<60"];
    const SEGMENT_COLORS = {
      "90-100": "#22c55e",
      "80-89": "#3b82f6",
      "70-79": "#f59e0b",
      "60-69": "#f97316",
      "<60": "#ef4444"
    };
    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
    const loadData = async () => {
      loading.value = true;
      error.value = "";
      try {
        const q = searchQuery.value.trim();
        const result = await fetchGradeDistribution({
          teacher_name: q || null,
          page: page.value,
          page_size: pageSize
        });
        items.value = [...result.items].sort((a, b) => (b.sample_count || 0) - (a.sample_count || 0));
        total.value = result.total;
      } catch (e) {
        error.value = `查询失败：${e.message}`;
        items.value = [];
        total.value = 0;
      } finally {
        loading.value = false;
      }
    };
    const retrySearch = () => {
      if (hasQuery.value) {
        loadData();
      }
    };
    const hasQuery = computed(() => searchQuery.value.trim().length > 0);
    let searchTimer = null;
    const onSearchInput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        page.value = 1;
        if (hasQuery.value) {
          loadData();
        } else {
          items.value = [];
          total.value = 0;
        }
      }, 400);
    };
    const failRate = (item) => {
      const failCount = item.score_segments?.["<60"] || 0;
      if (!item.sample_count) return "-";
      return (failCount / item.sample_count * 100).toFixed(1) + "%";
    };
    const containerRef = ref(null);
    const scrollToTop = () => {
      const scrollEl = document.querySelector(".app-shell");
      if (scrollEl) {
        scrollEl.scrollTo({ top: 0, behavior: "instant" });
      }
    };
    const openDetail = (item) => {
      selectedItem.value = item;
      nextTick(scrollToTop);
    };
    const closeDetail = () => {
      selectedItem.value = null;
      nextTick(scrollToTop);
    };
    const segmentWidth = (item, key) => {
      const count = item.score_segments?.[key] || 0;
      if (!item.sample_count) return 0;
      return Math.max(2, count / item.sample_count * 100);
    };
    const segmentPercent = (item, key) => {
      const count = item.score_segments?.[key] || 0;
      if (!item.sample_count) return "0.0";
      return (count / item.sample_count * 100).toFixed(1);
    };
    const segmentCount = (item, key) => item.score_segments?.[key] || 0;
    watch(page, () => {
      if (hasQuery.value) loadData();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "containerRef",
        ref: containerRef,
        class: "gd-container"
      }, [
        createVNode(Transition, {
          name: "gd-slide",
          mode: "out-in"
        }, {
          default: withCtx(() => [
            selectedItem.value ? (openBlock(), createElementBlock("div", _hoisted_1$1, [
              createBaseVNode("div", {
                class: "gd-detail-header",
                onClick: closeDetail
              }, [..._cache[3] || (_cache[3] = [
                createBaseVNode("span", { class: "gd-back-icon" }, "‹", -1),
                createBaseVNode("span", null, "返回列表", -1)
              ])]),
              createBaseVNode("div", _hoisted_2$1, [
                createBaseVNode("div", _hoisted_3$1, toDisplayString(selectedItem.value.course_name), 1),
                createBaseVNode("div", _hoisted_4$1, [
                  createBaseVNode("span", _hoisted_5$1, "👨‍🏫 " + toDisplayString(selectedItem.value.teacher_name), 1),
                  createBaseVNode("span", _hoisted_6$1, toDisplayString(selectedItem.value.semester), 1)
                ]),
                createBaseVNode("div", _hoisted_7$1, [
                  createBaseVNode("div", _hoisted_8$1, [
                    createBaseVNode("div", _hoisted_9$1, toDisplayString(selectedItem.value.max_score ?? "-"), 1),
                    _cache[4] || (_cache[4] = createBaseVNode("div", { class: "gd-dstat-label" }, "最高分", -1))
                  ]),
                  createBaseVNode("div", _hoisted_10$1, [
                    createBaseVNode("div", _hoisted_11$1, toDisplayString(selectedItem.value.min_score ?? "-"), 1),
                    _cache[5] || (_cache[5] = createBaseVNode("div", { class: "gd-dstat-label" }, "最低分", -1))
                  ]),
                  createBaseVNode("div", _hoisted_12$1, [
                    createBaseVNode("div", _hoisted_13$1, toDisplayString(selectedItem.value.avg_score ?? "-"), 1),
                    _cache[6] || (_cache[6] = createBaseVNode("div", { class: "gd-dstat-label" }, "平均分", -1))
                  ]),
                  createBaseVNode("div", _hoisted_14$1, [
                    createBaseVNode("div", _hoisted_15$1, toDisplayString(selectedItem.value.median_score ?? "-"), 1),
                    _cache[7] || (_cache[7] = createBaseVNode("div", { class: "gd-dstat-label" }, "中位数", -1))
                  ]),
                  createBaseVNode("div", _hoisted_16$1, [
                    createBaseVNode("div", _hoisted_17$1, toDisplayString(selectedItem.value.sample_count ?? 0), 1),
                    _cache[8] || (_cache[8] = createBaseVNode("div", { class: "gd-dstat-label" }, "样本数", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_18$1, [
                  _cache[9] || (_cache[9] = createBaseVNode("div", { class: "gd-seg-title" }, "分数段分布", -1)),
                  (openBlock(), createElementBlock(Fragment, null, renderList(SEGMENT_KEYS, (seg) => {
                    return createBaseVNode("div", {
                      key: seg,
                      class: "gd-seg-row"
                    }, [
                      createBaseVNode("span", _hoisted_19$1, toDisplayString(seg), 1),
                      createBaseVNode("div", _hoisted_20$1, [
                        createBaseVNode("div", {
                          class: "gd-seg-bar",
                          style: normalizeStyle({
                            width: segmentWidth(selectedItem.value, seg) + "%",
                            backgroundColor: SEGMENT_COLORS[seg]
                          })
                        }, null, 4)
                      ]),
                      createBaseVNode("span", _hoisted_21$1, toDisplayString(segmentCount(selectedItem.value, seg)) + "人 · " + toDisplayString(segmentPercent(selectedItem.value, seg)) + "%", 1)
                    ]);
                  }), 64))
                ])
              ])
            ])) : (openBlock(), createElementBlock("div", _hoisted_22$1, [
              createBaseVNode("div", _hoisted_23$1, [
                createBaseVNode("div", _hoisted_24$1, [
                  _cache[10] || (_cache[10] = createBaseVNode("span", { class: "gd-search-icon" }, "🔍", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => searchQuery.value = $event),
                    type: "text",
                    placeholder: "搜索教师姓名...",
                    class: "gd-search-input",
                    onInput: onSearchInput
                  }, null, 544), [
                    [vModelText, searchQuery.value]
                  ])
                ])
              ]),
              error.value ? (openBlock(), createElementBlock("div", _hoisted_25$1, [
                createTextVNode(toDisplayString(error.value) + " ", 1),
                createBaseVNode("button", {
                  type: "button",
                  class: "gd-retry",
                  onClick: retrySearch
                }, "重试")
              ])) : createCommentVNode("", true),
              loading.value ? (openBlock(), createElementBlock("div", _hoisted_26$1, [..._cache[11] || (_cache[11] = [
                createBaseVNode("div", { class: "gd-spinner" }, null, -1),
                createBaseVNode("span", null, "查询中，请稍候…（数据较多时可能较慢）", -1)
              ])])) : !hasQuery.value ? (openBlock(), createElementBlock("div", _hoisted_27$1, [..._cache[12] || (_cache[12] = [
                createBaseVNode("span", { class: "gd-empty-icon" }, "🔍", -1),
                createBaseVNode("p", null, "请输入教师姓名搜索给分记录", -1)
              ])])) : items.value.length === 0 && !error.value ? (openBlock(), createElementBlock("div", _hoisted_28$1, [..._cache[13] || (_cache[13] = [
                createBaseVNode("span", { class: "gd-empty-icon" }, "📭", -1),
                createBaseVNode("p", null, "暂无给分记录数据", -1)
              ])])) : (openBlock(), createElementBlock("div", _hoisted_29$1, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
                  return openBlock(), createElementBlock("div", {
                    key: item.id,
                    class: "gd-list-item",
                    onClick: ($event) => openDetail(item)
                  }, [
                    createBaseVNode("div", _hoisted_31$1, [
                      createBaseVNode("div", _hoisted_32$1, toDisplayString(item.course_name), 1),
                      createBaseVNode("div", _hoisted_33$1, [
                        createBaseVNode("span", null, toDisplayString(item.teacher_name), 1),
                        _cache[14] || (_cache[14] = createBaseVNode("span", { class: "gd-dot" }, "·", -1)),
                        createBaseVNode("span", null, toDisplayString(item.semester), 1),
                        _cache[15] || (_cache[15] = createBaseVNode("span", { class: "gd-dot" }, "·", -1)),
                        createBaseVNode("span", null, "样本 " + toDisplayString(item.sample_count ?? 0), 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_34$1, [
                      createBaseVNode("div", _hoisted_35$1, toDisplayString(failRate(item)), 1),
                      _cache[16] || (_cache[16] = createBaseVNode("div", { class: "gd-item-avg-label" }, "挂科率", -1))
                    ]),
                    _cache[17] || (_cache[17] = createBaseVNode("span", { class: "gd-item-arrow" }, "›", -1))
                  ], 8, _hoisted_30$1);
                }), 128))
              ])),
              total.value > pageSize ? (openBlock(), createElementBlock("div", _hoisted_36$1, [
                createBaseVNode("button", {
                  class: "gd-page-btn",
                  disabled: page.value <= 1,
                  onClick: _cache[1] || (_cache[1] = ($event) => page.value--)
                }, "‹ 上一页", 8, _hoisted_37$1),
                createBaseVNode("span", _hoisted_38$1, toDisplayString(page.value) + " / " + toDisplayString(totalPages.value), 1),
                createBaseVNode("button", {
                  class: "gd-page-btn",
                  disabled: page.value >= totalPages.value,
                  onClick: _cache[2] || (_cache[2] = ($event) => page.value++)
                }, "下一页 ›", 8, _hoisted_39$1)
              ])) : createCommentVNode("", true)
            ]))
          ]),
          _: 1
        })
      ], 512);
    };
  }
};
const GradeDistributionView = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-8adc46d4"]]);
const GradeOutcome = {
  /** 数字成绩（含百分制，60 分线判定合格） */
  NUMERIC: "numeric",
  /** 优秀 */
  EXCELLENT: "excellent",
  /** 良好 */
  GOOD: "good",
  /** 中等 */
  MEDIUM: "medium",
  /** 合格（含“及格”兼容映射） */
  QUALIFIED: "qualified",
  /** 通过 */
  PASS: "pass",
  /** 不合格 */
  UNQUALIFIED: "unqualified",
  /** 未通过（含“不及格”“挂科”） */
  FAILED: "failed",
  /** 缺考 */
  ABSENT: "absent",
  /** 缓考（含 cjbj=2 / sfsq=1） */
  DEFERRED: "deferred",
  /** 免修（含 cjbj=3） */
  EXEMPT: "exempt",
  /** 免考 */
  EXEMPTED_EXAM: "exempted_exam",
  /** 补考/重修记录 */
  RETAKE: "retake",
  /** 待录入 */
  PENDING: "pending",
  /** 未知（无法识别的非空文本） */
  UNKNOWN: "unknown"
};
const COURSE_NATURE_LABEL_MAP = {
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
};
const PASS_OUTCOMES = /* @__PURE__ */ new Set([
  GradeOutcome.EXCELLENT,
  GradeOutcome.GOOD,
  GradeOutcome.MEDIUM,
  GradeOutcome.QUALIFIED,
  GradeOutcome.PASS
]);
const FAIL_OUTCOMES = /* @__PURE__ */ new Set([
  GradeOutcome.UNQUALIFIED,
  GradeOutcome.FAILED
]);
const QUALITATIVE_SORT_SCORES = {
  [GradeOutcome.EXCELLENT]: 95,
  [GradeOutcome.GOOD]: 80,
  [GradeOutcome.MEDIUM]: 80,
  [GradeOutcome.QUALIFIED]: 60,
  [GradeOutcome.PASS]: 60,
  [GradeOutcome.UNQUALIFIED]: 0,
  [GradeOutcome.FAILED]: 0,
  [GradeOutcome.ABSENT]: 0
};
const OFFICIAL_GRADE_POINT_KEYS = ["xfjd", "fxcj", "creditPoint", "credit_grade_point", "gpa", "gradePoint"];
const toSafeText = (value) => String(value ?? "").trim();
const parseScoreNumber = (score) => {
  const n = Number.parseFloat(toSafeText(score));
  return Number.isFinite(n) ? n : null;
};
const extractScoreFromText = (text) => {
  const direct = parseScoreNumber(text);
  if (direct !== null) return direct;
  const matched = text.match(/(\d+(?:\.\d+)?)/);
  if (!matched) return null;
  const n = Number.parseFloat(matched[1]);
  return Number.isFinite(n) ? n : null;
};
const firstDefined = (record, keys, fallback = "") => {
  for (const key of keys) {
    const value = record[key];
    if (value !== void 0 && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
};
const firstPresent = (record, keys, fallback = "") => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];
      if (value !== void 0 && value !== null) return value;
    }
  }
  return fallback;
};
const normalizeCourseName = (value) => {
  const text = toSafeText(value);
  if (!text) return "";
  const matched = text.match(/^\[[^\]]+\](.+)$/);
  return matched ? toSafeText(matched[1]) : text;
};
const formatPointNumber = (value) => {
  if (!Number.isFinite(value)) return "-";
  const safeValue = Math.max(0, value);
  return safeValue.toFixed(2).replace(/\.0+$|(\.\d*?)0+$/g, "$1").replace(/\.$/, "");
};
const normalizeCourseNature = (raw) => {
  const codes = [
    toSafeText(raw.kcxz),
    toSafeText(raw.course_nature_code),
    toSafeText(raw.course_nature)
  ].filter(Boolean);
  for (const code of codes) {
    if (COURSE_NATURE_LABEL_MAP[code]) return COURSE_NATURE_LABEL_MAP[code];
  }
  return toSafeText(raw.course_nature || raw.kcxzmc || codes[0] || "");
};
const estimateGradePoint = (scoreNumber) => {
  if (scoreNumber === null) return null;
  return Math.round(Math.max(0, scoreNumber / 10 - 5) * 100) / 100;
};
const resolveOutcome = (scoreText, flags = {}) => {
  const text = toSafeText(scoreText);
  const cjbj = toSafeText(flags.cjbj);
  const sfsq = toSafeText(flags.sfsq);
  const sfbk = toSafeText(flags.sfbk);
  const combined = `${text}|${toSafeText(flags.cjfxms)}|${cjbj}`;
  if (/缺考/.test(combined)) return GradeOutcome.ABSENT;
  if (sfsq === "1" || cjbj === "2" || /缓考/.test(combined)) return GradeOutcome.DEFERRED;
  if (cjbj === "3" || /免修|免听/.test(combined)) return GradeOutcome.EXEMPT;
  if (/免考/.test(combined)) return GradeOutcome.EXEMPTED_EXAM;
  if (sfbk === "1" || cjbj === "1" || /补考|重修/.test(combined)) return GradeOutcome.RETAKE;
  if (!text || /待录入|未录入/.test(text)) return GradeOutcome.PENDING;
  if (extractScoreFromText(text) !== null) return GradeOutcome.NUMERIC;
  if (/优秀/.test(text)) return GradeOutcome.EXCELLENT;
  if (/良好/.test(text)) return GradeOutcome.GOOD;
  if (/中等/.test(text)) return GradeOutcome.MEDIUM;
  if (/不合格/.test(text)) return GradeOutcome.UNQUALIFIED;
  if (/未通过|不及格|挂科/.test(text)) return GradeOutcome.FAILED;
  if (/合格|及格/.test(text)) return GradeOutcome.QUALIFIED;
  if (/通过/.test(text)) return GradeOutcome.PASS;
  return GradeOutcome.UNKNOWN;
};
const resolveSortScore = (outcome, scoreNumber) => {
  if (outcome === GradeOutcome.NUMERIC || outcome === GradeOutcome.RETAKE) return scoreNumber ?? -1;
  return QUALITATIVE_SORT_SCORES[outcome] ?? -1;
};
const isPassOutcome = (outcome, scoreNumber) => {
  if (outcome === GradeOutcome.NUMERIC || outcome === GradeOutcome.RETAKE) return scoreNumber !== null && scoreNumber >= 60;
  return PASS_OUTCOMES.has(outcome);
};
const isFailedOutcome = (outcome, scoreNumber) => {
  if (outcome === GradeOutcome.NUMERIC || outcome === GradeOutcome.RETAKE) return scoreNumber !== null && scoreNumber < 60;
  return FAIL_OUTCOMES.has(outcome);
};
const parseOfficialGradePoint = (raw) => {
  for (const key of OFFICIAL_GRADE_POINT_KEYS) {
    const n = parseScoreNumber(raw[key]);
    if (n !== null && n >= 0) return n;
  }
  return null;
};
const resolveEstimatedScore = (outcome, scoreNumber) => {
  if (outcome === GradeOutcome.NUMERIC || outcome === GradeOutcome.RETAKE) return scoreNumber;
  if (PASS_OUTCOMES.has(outcome) || FAIL_OUTCOMES.has(outcome)) {
    return QUALITATIVE_SORT_SCORES[outcome] ?? null;
  }
  return null;
};
const resolveStatusTags = (params) => {
  const tags = [];
  if (params.isFailed) tags.push({ key: "failed", label: "挂科" });
  if (params.isMakeup) tags.push({ key: "makeup", label: "补考" });
  if (params.outcome === GradeOutcome.DEFERRED) tags.push({ key: "deferred", label: "缓考" });
  if (params.outcome === GradeOutcome.EXEMPT) tags.push({ key: "exempt", label: "免修" });
  if (params.outcome === GradeOutcome.EXEMPTED_EXAM) tags.push({ key: "exempted_exam", label: "免考" });
  if (params.outcome === GradeOutcome.ABSENT) tags.push({ key: "absent", label: "缺考" });
  if (params.outcome === GradeOutcome.PENDING) tags.push({ key: "pending", label: "待录入" });
  return tags;
};
const normalizeGradeRecord = (raw, originIndex = 0) => {
  const record = raw && typeof raw === "object" ? raw : {};
  const term = toSafeText(firstDefined(record, ["term", "xnxq"]));
  const course_name = normalizeCourseName(firstDefined(record, ["course_name", "kcmc"]));
  const course_credit = toSafeText(firstDefined(record, ["course_credit", "xf"]));
  const earned_credit = toSafeText(firstDefined(record, ["earned_credit", "hdxf", "jd"]));
  const final_score = toSafeText(firstPresent(record, ["final_score", "zhcj", "yscj", "cj"], "-"));
  const scoreNumber = extractScoreFromText(final_score);
  const cjbj = toSafeText(record.cjbj);
  const sfbk = toSafeText(record.sfbk);
  const sfsq = toSafeText(record.sfsq);
  const cjfxms = toSafeText(record.cjfxms);
  const outcome = resolveOutcome(final_score, { cjbj, sfsq, sfbk, cjfxms });
  const isMakeup = outcome === GradeOutcome.RETAKE;
  const isPass = isPassOutcome(outcome, scoreNumber);
  const isFailed = isFailedOutcome(outcome, scoreNumber);
  const isDeferred = outcome === GradeOutcome.DEFERRED;
  const isExempt = outcome === GradeOutcome.EXEMPT || outcome === GradeOutcome.EXEMPTED_EXAM;
  const officialPoint = parseOfficialGradePoint(record);
  let gradePoint = null;
  let gradePointEstimated = false;
  if (officialPoint !== null) {
    gradePoint = officialPoint;
  } else {
    gradePoint = estimateGradePoint(resolveEstimatedScore(outcome, scoreNumber));
    gradePointEstimated = gradePoint !== null;
  }
  const entryTeacher = toSafeText(firstDefined(record, ["teacher", "cjlrjsxm", "jsxm"]));
  const courseTeacher = toSafeText(firstDefined(record, ["course_teacher", "courseTeacher"]));
  return {
    originIndex,
    term,
    course_name,
    course_credit,
    earned_credit,
    final_score,
    scoreNumber,
    outcome,
    course_nature: normalizeCourseNature(record),
    teacher: entryTeacher || courseTeacher,
    entryTeacher,
    courseTeacher,
    gradePoint,
    gradePointEstimated,
    gradePointText: formatPointNumber(gradePoint),
    creditGradePoint: officialPoint !== null ? formatPointNumber(officialPoint) : "-",
    statusTags: resolveStatusTags({ outcome, isFailed, isMakeup }),
    isPass,
    isFailed,
    isMakeup,
    isDeferred,
    isExempt,
    sortScore: resolveSortScore(outcome, scoreNumber),
    raw: record
  };
};
const normalizeGradeRecords = (grades) => {
  if (!Array.isArray(grades)) return [];
  return grades.map((grade, index) => normalizeGradeRecord(grade, index));
};
const _hoisted_1 = { class: "grade-view" };
const _hoisted_2 = { class: "grade-stitch-header" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = { class: "grade-stitch-main" };
const _hoisted_5 = { class: "grade-tab-bar rounded-2xl" };
const _hoisted_6 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_7 = { class: "grade-filter-card" };
const _hoisted_8 = { class: "search-box" };
const _hoisted_9 = { class: "select-wrap" };
const _hoisted_10 = ["value"];
const _hoisted_11 = { class: "filter-divider" };
const _hoisted_12 = {
  key: 0,
  class: "filter-advanced"
};
const _hoisted_13 = { class: "filter-group" };
const _hoisted_14 = { class: "radio-group" };
const _hoisted_15 = { class: "filter-group" };
const _hoisted_16 = { class: "radio-group" };
const _hoisted_17 = { class: "filter-group" };
const _hoisted_18 = { class: "radio-group" };
const _hoisted_19 = { class: "filter-group filter-sort-row" };
const _hoisted_20 = { class: "grade-stats-grid" };
const _hoisted_21 = { class: "stat-card" };
const _hoisted_22 = { class: "stat-value" };
const _hoisted_23 = { class: "stat-card" };
const _hoisted_24 = { class: "stat-value" };
const _hoisted_25 = { class: "stat-card" };
const _hoisted_26 = { class: "stat-value stat-value-dark" };
const _hoisted_27 = { class: "grade-list" };
const _hoisted_28 = { class: "term-header" };
const _hoisted_29 = { class: "grade-grid" };
const _hoisted_30 = ["onClick"];
const _hoisted_31 = { class: "card-score" };
const _hoisted_32 = { class: "card-name" };
const _hoisted_33 = { class: "card-meta" };
const _hoisted_34 = { class: "credit" };
const _hoisted_35 = { class: "nature" };
const _hoisted_36 = {
  key: 0,
  class: "card-status"
};
const _hoisted_37 = {
  key: 1,
  class: "card-teacher"
};
const _hoisted_38 = {
  key: 1,
  class: "grade-grid"
};
const _hoisted_39 = ["onClick"];
const _hoisted_40 = { class: "card-score" };
const _hoisted_41 = { class: "card-name" };
const _hoisted_42 = { class: "card-meta" };
const _hoisted_43 = { class: "credit" };
const _hoisted_44 = { class: "nature" };
const _hoisted_45 = { class: "nature" };
const _hoisted_46 = {
  key: 0,
  class: "card-status"
};
const _hoisted_47 = {
  key: 1,
  class: "card-teacher"
};
const _hoisted_48 = { class: "grade-updated-at" };
const _hoisted_49 = { class: "detail-header" };
const _hoisted_50 = { class: "detail-grid" };
const _hoisted_51 = { class: "detail-item" };
const _hoisted_52 = { class: "detail-value" };
const _hoisted_53 = { class: "detail-item" };
const _hoisted_54 = { class: "detail-value" };
const _hoisted_55 = { class: "detail-item" };
const _hoisted_56 = { class: "detail-value" };
const _hoisted_57 = { class: "detail-item" };
const _hoisted_58 = { class: "detail-value" };
const _hoisted_59 = {
  key: 0,
  class: "point-estimated"
};
const _hoisted_60 = { class: "detail-item" };
const _hoisted_61 = { class: "detail-value" };
const _hoisted_62 = { class: "detail-item" };
const _hoisted_63 = { class: "detail-value" };
const _hoisted_64 = { class: "detail-item" };
const _hoisted_65 = { class: "detail-value" };
const _hoisted_66 = { class: "detail-item" };
const _hoisted_67 = { class: "detail-value" };
const _hoisted_68 = { class: "detail-item" };
const _hoisted_69 = { class: "detail-value" };
const _hoisted_70 = { class: "detail-item" };
const _hoisted_71 = { class: "detail-value" };
const _hoisted_72 = { class: "detail-item" };
const _hoisted_73 = { class: "detail-value" };
const _hoisted_74 = { class: "detail-item" };
const _hoisted_75 = { class: "detail-value" };
const _hoisted_76 = {
  key: 0,
  class: "detail-item full-width"
};
const _hoisted_77 = { class: "detail-tags" };
const _sfc_main = {
  __name: "GradeView",
  props: {
    grades: { type: Array, default: () => [] },
    studentId: { type: String, default: "" },
    offline: { type: Boolean, default: false },
    syncTime: { type: String, default: "" },
    refreshing: { type: Boolean, default: false }
  },
  emits: ["back", "logout", "refresh"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const searchName = ref("");
    const filterTerm = ref("");
    const filterPass = ref("all");
    const filterMakeup = ref("all");
    const viewMode = ref("grouped");
    const sortMode = ref("origin");
    const showAdvancedFilters = ref(false);
    const selectedGrade = ref(null);
    const showDetail = ref(false);
    const activeGradeTab = ref("grades");
    const toSafeText2 = (value) => String(value ?? "").trim();
    const normalizedGrades = computed(() => normalizeGradeRecords(props.grades));
    const terms = computed(() => {
      const termSet = /* @__PURE__ */ new Set();
      normalizedGrades.value.forEach((g) => {
        if (g.term) termSet.add(g.term);
      });
      return normalizeSemesterList(Array.from(termSet));
    });
    const filteredGrades = computed(() => {
      return normalizedGrades.value.filter((grade) => {
        const name = toSafeText2(grade.course_name).toLowerCase();
        if (searchName.value && !name.includes(searchName.value.toLowerCase())) {
          return false;
        }
        if (filterTerm.value && grade.term !== filterTerm.value) {
          return false;
        }
        if (filterPass.value !== "all") {
          if (filterPass.value === "pass" && !grade.isPass) return false;
          if (filterPass.value === "fail" && !grade.isFailed) return false;
        }
        if (filterMakeup.value !== "all") {
          if (filterMakeup.value === "yes" && !grade.isMakeup) return false;
          if (filterMakeup.value === "no" && grade.isMakeup) return false;
        }
        return true;
      });
    });
    const compareBySortMode = (a, b) => {
      if (sortMode.value === "origin") {
        return a.originIndex - b.originIndex;
      }
      const diff = sortMode.value === "score_asc" ? a.sortScore - b.sortScore : b.sortScore - a.sortScore;
      if (diff !== 0) return diff;
      return a.originIndex - b.originIndex;
    };
    const sortGradeList = (list) => [...list].sort(compareBySortMode);
    const sortedGrades = computed(() => sortGradeList(filteredGrades.value));
    const groupedGrades = computed(() => {
      const groups = {};
      filteredGrades.value.forEach((grade) => {
        const term = grade.term || "未知学期";
        if (!groups[term]) {
          groups[term] = [];
        }
        groups[term].push(grade);
      });
      return Object.entries(groups).sort((a, b) => compareSemesterDesc(a[0], b[0])).map(([term, items]) => ({ term, items: sortGradeList(items) }));
    });
    const stats = computed(() => {
      const total = filteredGrades.value.length;
      const credits = filteredGrades.value.reduce((sum, g) => sum + (parseFloat(g.course_credit) || 0), 0);
      const failed = filteredGrades.value.filter((g) => g.isFailed).length;
      return { total, credits: credits.toFixed(2), failed };
    });
    const lastUpdatedAt = computed(() => props.syncTime ? formatRelativeTime(props.syncTime) : "暂未更新");
    const getScoreClass = (score) => {
      const text = toSafeText2(score);
      const num = parseFloat(text);
      if (isNaN(num)) {
        if (/优秀/.test(text)) return "excellent";
        if (/(良好|中等)/.test(text)) return "good";
        if (/(及格|合格|通过)/.test(text)) return "pass";
        if (/(不及格|不合格|未通过)/.test(text)) return "fail";
        return "";
      }
      if (num >= 90) return "excellent";
      if (num >= 80) return "good";
      if (num >= 70) return "average";
      if (num >= 60) return "pass";
      return "fail";
    };
    const openDetail = (grade) => {
      selectedGrade.value = grade;
      showDetail.value = true;
    };
    const closeDetail = () => {
      showDetail.value = false;
      selectedGrade.value = null;
    };
    const resetFilters = () => {
      searchName.value = "";
      filterTerm.value = "";
      filterPass.value = "all";
      filterMakeup.value = "all";
    };
    const handleBack = () => emit("back");
    const handleRefresh = () => emit("refresh");
    const readPreferredSemester = () => {
      try {
        const raw = localStorage.getItem("hbu_schedule_meta");
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        return String(parsed?.semester || "").trim();
      } catch {
        return "";
      }
    };
    watch(
      terms,
      (list) => {
        if (!Array.isArray(list) || list.length === 0) {
          filterTerm.value = "";
          return;
        }
        if (filterTerm.value && list.includes(filterTerm.value)) {
          return;
        }
        filterTerm.value = resolveCurrentSemester(list, readPreferredSemester());
      },
      { immediate: true }
    );
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          createBaseVNode("button", {
            class: "grade-stitch-back",
            type: "button",
            "aria-label": "返回",
            onClick: handleBack
          }, [..._cache[15] || (_cache[15] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_left", -1)
          ])]),
          _cache[16] || (_cache[16] = createBaseVNode("h1", null, "成绩查询", -1)),
          createBaseVNode("button", {
            class: "grade-stitch-refresh grade-refresh-btn",
            type: "button",
            disabled: __props.refreshing,
            "aria-label": "刷新成绩",
            title: "刷新成绩",
            onClick: handleRefresh
          }, [
            createBaseVNode("span", {
              class: normalizeClass(["material-symbols-outlined", { spinning: __props.refreshing || __props.offline }])
            }, "refresh", 2)
          ], 8, _hoisted_3)
        ]),
        createBaseVNode("main", _hoisted_4, [
          createBaseVNode("div", _hoisted_5, [
            createBaseVNode("button", {
              class: normalizeClass(["grade-tab-btn", { active: activeGradeTab.value === "grades" }]),
              onClick: _cache[0] || (_cache[0] = ($event) => activeGradeTab.value = "grades")
            }, " 成绩查询 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["grade-tab-btn", { active: activeGradeTab.value === "distribution" }]),
              onClick: _cache[1] || (_cache[1] = ($event) => activeGradeTab.value = "distribution")
            }, [..._cache[17] || (_cache[17] = [
              createTextVNode(" 给分记录", -1),
              createBaseVNode("span", { class: "beta-tag" }, "Beta", -1)
            ])], 2)
          ]),
          activeGradeTab.value === "distribution" ? (openBlock(), createBlock(GradeDistributionView, { key: 0 })) : createCommentVNode("", true),
          activeGradeTab.value === "grades" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            __props.offline ? (openBlock(), createElementBlock("div", _hoisted_6, " 当前显示为离线数据，更新于" + toDisplayString(unref(formatRelativeTime)(__props.syncTime)), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_7, [
              createBaseVNode("div", _hoisted_8, [
                _cache[18] || (_cache[18] = createBaseVNode("span", { class: "material-symbols-outlined search-icon" }, "search", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => searchName.value = $event),
                  type: "text",
                  placeholder: "搜索课程名称...",
                  class: "search-input"
                }, null, 512), [
                  [vModelText, searchName.value]
                ])
              ]),
              createBaseVNode("div", _hoisted_9, [
                createVNode(_component_IOSSelect, {
                  modelValue: filterTerm.value,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => filterTerm.value = $event),
                  class: "filter-select"
                }, {
                  default: withCtx(() => [
                    _cache[19] || (_cache[19] = createBaseVNode("option", { value: "" }, "全部学期", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(terms.value, (term) => {
                      return openBlock(), createElementBlock("option", {
                        key: term,
                        value: term
                      }, toDisplayString(term), 9, _hoisted_10);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("button", {
                  class: "ghost-btn",
                  type: "button",
                  onClick: _cache[4] || (_cache[4] = ($event) => showAdvancedFilters.value = !showAdvancedFilters.value)
                }, [
                  createTextVNode(toDisplayString(showAdvancedFilters.value ? "收起筛选" : "展开筛选") + " ", 1),
                  _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined" }, "expand_more", -1))
                ])
              ]),
              showAdvancedFilters.value ? (openBlock(), createElementBlock("div", _hoisted_12, [
                createBaseVNode("div", _hoisted_13, [
                  _cache[24] || (_cache[24] = createBaseVNode("label", null, "成绩状态", -1)),
                  createBaseVNode("div", _hoisted_14, [
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: filterPass.value === "all" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => filterPass.value = $event),
                        value: "all"
                      }, null, 512), [
                        [vModelRadio, filterPass.value]
                      ]),
                      _cache[21] || (_cache[21] = createBaseVNode("span", null, "全部", -1))
                    ], 2),
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: filterPass.value === "pass" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => filterPass.value = $event),
                        value: "pass"
                      }, null, 512), [
                        [vModelRadio, filterPass.value]
                      ]),
                      _cache[22] || (_cache[22] = createBaseVNode("span", null, "合格", -1))
                    ], 2),
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: filterPass.value === "fail" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => filterPass.value = $event),
                        value: "fail"
                      }, null, 512), [
                        [vModelRadio, filterPass.value]
                      ]),
                      _cache[23] || (_cache[23] = createBaseVNode("span", null, "不合格", -1))
                    ], 2)
                  ])
                ]),
                createBaseVNode("div", _hoisted_15, [
                  _cache[28] || (_cache[28] = createBaseVNode("label", null, "补考", -1)),
                  createBaseVNode("div", _hoisted_16, [
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: filterMakeup.value === "all" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => filterMakeup.value = $event),
                        value: "all"
                      }, null, 512), [
                        [vModelRadio, filterMakeup.value]
                      ]),
                      _cache[25] || (_cache[25] = createBaseVNode("span", null, "全部", -1))
                    ], 2),
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: filterMakeup.value === "no" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => filterMakeup.value = $event),
                        value: "no"
                      }, null, 512), [
                        [vModelRadio, filterMakeup.value]
                      ]),
                      _cache[26] || (_cache[26] = createBaseVNode("span", null, "正常", -1))
                    ], 2),
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: filterMakeup.value === "yes" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => filterMakeup.value = $event),
                        value: "yes"
                      }, null, 512), [
                        [vModelRadio, filterMakeup.value]
                      ]),
                      _cache[27] || (_cache[27] = createBaseVNode("span", null, "补考", -1))
                    ], 2)
                  ])
                ]),
                createBaseVNode("div", _hoisted_17, [
                  _cache[31] || (_cache[31] = createBaseVNode("label", null, "展示方式", -1)),
                  createBaseVNode("div", _hoisted_18, [
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: viewMode.value === "grouped" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => viewMode.value = $event),
                        value: "grouped"
                      }, null, 512), [
                        [vModelRadio, viewMode.value]
                      ]),
                      _cache[29] || (_cache[29] = createBaseVNode("span", null, "分组", -1))
                    ], 2),
                    createBaseVNode("label", {
                      class: normalizeClass(["radio-label", { active: viewMode.value === "all" }])
                    }, [
                      withDirectives(createBaseVNode("input", {
                        type: "radio",
                        "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => viewMode.value = $event),
                        value: "all"
                      }, null, 512), [
                        [vModelRadio, viewMode.value]
                      ]),
                      _cache[30] || (_cache[30] = createBaseVNode("span", null, "全部", -1))
                    ], 2)
                  ])
                ]),
                createBaseVNode("div", _hoisted_19, [
                  _cache[33] || (_cache[33] = createBaseVNode("label", null, "排序", -1)),
                  createVNode(_component_IOSSelect, {
                    modelValue: sortMode.value,
                    "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => sortMode.value = $event),
                    class: "filter-select sort-select"
                  }, {
                    default: withCtx(() => [..._cache[32] || (_cache[32] = [
                      createBaseVNode("option", { value: "origin" }, "成绩公布先后", -1),
                      createBaseVNode("option", { value: "score_desc" }, "成绩高到低", -1),
                      createBaseVNode("option", { value: "score_asc" }, "成绩低到高", -1)
                    ])]),
                    _: 1
                  }, 8, ["modelValue"]),
                  createBaseVNode("button", {
                    class: "reset-btn",
                    type: "button",
                    onClick: resetFilters
                  }, "重置")
                ])
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_20, [
              createBaseVNode("div", _hoisted_21, [
                createBaseVNode("span", _hoisted_22, toDisplayString(stats.value.total), 1),
                _cache[34] || (_cache[34] = createBaseVNode("span", { class: "stat-label" }, "筛选结果", -1))
              ]),
              createBaseVNode("div", _hoisted_23, [
                createBaseVNode("span", _hoisted_24, toDisplayString(stats.value.credits), 1),
                _cache[35] || (_cache[35] = createBaseVNode("span", { class: "stat-label" }, "总学分", -1))
              ]),
              createBaseVNode("div", _hoisted_25, [
                createBaseVNode("span", _hoisted_26, toDisplayString(stats.value.failed), 1),
                _cache[36] || (_cache[36] = createBaseVNode("span", { class: "stat-label" }, "挂科数", -1))
              ])
            ]),
            createBaseVNode("div", _hoisted_27, [
              viewMode.value === "grouped" ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(groupedGrades.value, (group) => {
                return openBlock(), createElementBlock("div", {
                  key: group.term,
                  class: "term-group"
                }, [
                  createBaseVNode("div", _hoisted_28, [
                    _cache[37] || (_cache[37] = createBaseVNode("span", { class: "term-icon" }, [
                      createBaseVNode("i", { class: "fa-regular fa-calendar" })
                    ], -1)),
                    createBaseVNode("h2", null, toDisplayString(group.term) + " (" + toDisplayString(group.items.length) + "门)", 1)
                  ]),
                  createBaseVNode("div", _hoisted_29, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(group.items, (grade) => {
                      return openBlock(), createElementBlock("div", {
                        key: `${group.term}-${grade.course_name}-${grade.originIndex}`,
                        class: normalizeClass(["grade-card", getScoreClass(grade.final_score)]),
                        onClick: ($event) => openDetail(grade)
                      }, [
                        createBaseVNode("div", _hoisted_31, toDisplayString(grade.final_score), 1),
                        createBaseVNode("h3", _hoisted_32, toDisplayString(grade.course_name), 1),
                        createBaseVNode("div", _hoisted_33, [
                          createBaseVNode("span", _hoisted_34, toDisplayString(grade.course_credit) + "分", 1),
                          createBaseVNode("span", _hoisted_35, toDisplayString(grade.course_nature), 1)
                        ]),
                        grade.statusTags?.length ? (openBlock(), createElementBlock("div", _hoisted_36, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(grade.statusTags, (tag) => {
                            return openBlock(), createElementBlock("span", {
                              key: `${grade.course_name}-${tag.key}`,
                              class: normalizeClass(["status-chip", `status-${tag.key}`])
                            }, toDisplayString(tag.label), 3);
                          }), 128))
                        ])) : createCommentVNode("", true),
                        grade.teacher ? (openBlock(), createElementBlock("div", _hoisted_37, [
                          _cache[38] || (_cache[38] = createBaseVNode("span", { class: "material-symbols-outlined" }, "person", -1)),
                          createTextVNode(" " + toDisplayString(grade.teacher), 1)
                        ])) : createCommentVNode("", true)
                      ], 10, _hoisted_30);
                    }), 128))
                  ])
                ]);
              }), 128)) : (openBlock(), createElementBlock("div", _hoisted_38, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(sortedGrades.value, (grade) => {
                  return openBlock(), createElementBlock("div", {
                    key: `all-${grade.term}-${grade.course_name}-${grade.originIndex}`,
                    class: normalizeClass(["grade-card", getScoreClass(grade.final_score)]),
                    onClick: ($event) => openDetail(grade)
                  }, [
                    createBaseVNode("div", _hoisted_40, toDisplayString(grade.final_score), 1),
                    createBaseVNode("h3", _hoisted_41, toDisplayString(grade.course_name), 1),
                    createBaseVNode("div", _hoisted_42, [
                      createBaseVNode("span", _hoisted_43, toDisplayString(grade.course_credit) + "分", 1),
                      createBaseVNode("span", _hoisted_44, toDisplayString(grade.course_nature), 1),
                      createBaseVNode("span", _hoisted_45, toDisplayString(grade.term), 1)
                    ]),
                    grade.statusTags?.length ? (openBlock(), createElementBlock("div", _hoisted_46, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(grade.statusTags, (tag) => {
                        return openBlock(), createElementBlock("span", {
                          key: `${grade.course_name}-${tag.key}`,
                          class: normalizeClass(["status-chip", `status-${tag.key}`])
                        }, toDisplayString(tag.label), 3);
                      }), 128))
                    ])) : createCommentVNode("", true),
                    grade.teacher ? (openBlock(), createElementBlock("div", _hoisted_47, [
                      _cache[39] || (_cache[39] = createBaseVNode("span", { class: "material-symbols-outlined" }, "person", -1)),
                      createTextVNode(" " + toDisplayString(grade.teacher), 1)
                    ])) : createCommentVNode("", true)
                  ], 10, _hoisted_39);
                }), 128))
              ])),
              __props.refreshing && props.grades.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 2,
                type: "loading",
                message: "正在获取成绩数据..."
              })) : sortedGrades.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 3,
                message: "没有找到符合条件的成绩"
              }, {
                default: withCtx(() => [
                  createBaseVNode("button", { onClick: resetFilters }, "清除筛选")
                ]),
                _: 1
              })) : createCommentVNode("", true)
            ]),
            createBaseVNode("p", _hoisted_48, "最新更新时间：" + toDisplayString(lastUpdatedAt.value), 1),
            (openBlock(), createBlock(Teleport, { to: "body" }, [
              createVNode(Transition, { name: "modal-pop" }, {
                default: withCtx(() => [
                  showDetail.value ? (openBlock(), createElementBlock("div", {
                    key: 0,
                    class: "modal-overlay",
                    onClick: closeDetail
                  }, [
                    createBaseVNode("div", {
                      class: "modal-content modal-pop-card",
                      onClick: _cache[14] || (_cache[14] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      createBaseVNode("button", {
                        class: "modal-close",
                        onClick: closeDetail
                      }, "×"),
                      createBaseVNode("div", _hoisted_49, [
                        createBaseVNode("div", {
                          class: normalizeClass(["detail-score", getScoreClass(selectedGrade.value.final_score)])
                        }, toDisplayString(selectedGrade.value.final_score), 3),
                        createBaseVNode("h2", null, toDisplayString(selectedGrade.value.course_name), 1)
                      ]),
                      createBaseVNode("div", _hoisted_50, [
                        createBaseVNode("div", _hoisted_51, [
                          _cache[40] || (_cache[40] = createBaseVNode("span", { class: "detail-label" }, "学期", -1)),
                          createBaseVNode("span", _hoisted_52, toDisplayString(selectedGrade.value.term), 1)
                        ]),
                        createBaseVNode("div", _hoisted_53, [
                          _cache[41] || (_cache[41] = createBaseVNode("span", { class: "detail-label" }, "学分", -1)),
                          createBaseVNode("span", _hoisted_54, toDisplayString(selectedGrade.value.course_credit), 1)
                        ]),
                        createBaseVNode("div", _hoisted_55, [
                          _cache[42] || (_cache[42] = createBaseVNode("span", { class: "detail-label" }, "获得学分", -1)),
                          createBaseVNode("span", _hoisted_56, toDisplayString(selectedGrade.value.earned_credit || "-"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_57, [
                          _cache[43] || (_cache[43] = createBaseVNode("span", { class: "detail-label" }, "绩点", -1)),
                          createBaseVNode("span", _hoisted_58, [
                            createTextVNode(toDisplayString(selectedGrade.value.gradePointText || "-") + " ", 1),
                            selectedGrade.value.gradePointEstimated ? (openBlock(), createElementBlock("span", _hoisted_59, "估算")) : createCommentVNode("", true)
                          ])
                        ]),
                        createBaseVNode("div", _hoisted_60, [
                          _cache[44] || (_cache[44] = createBaseVNode("span", { class: "detail-label" }, "学分绩点", -1)),
                          createBaseVNode("span", _hoisted_61, toDisplayString(selectedGrade.value.creditGradePoint || "-"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_62, [
                          _cache[45] || (_cache[45] = createBaseVNode("span", { class: "detail-label" }, "课程性质", -1)),
                          createBaseVNode("span", _hoisted_63, toDisplayString(selectedGrade.value.course_nature || "-"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_64, [
                          _cache[46] || (_cache[46] = createBaseVNode("span", { class: "detail-label" }, "录入教师", -1)),
                          createBaseVNode("span", _hoisted_65, toDisplayString(selectedGrade.value.entryTeacher || "-"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_66, [
                          _cache[47] || (_cache[47] = createBaseVNode("span", { class: "detail-label" }, "课程教师", -1)),
                          createBaseVNode("span", _hoisted_67, toDisplayString(selectedGrade.value.courseTeacher || "-"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_68, [
                          _cache[48] || (_cache[48] = createBaseVNode("span", { class: "detail-label" }, "是否挂科", -1)),
                          createBaseVNode("span", _hoisted_69, toDisplayString(selectedGrade.value.isFailed ? "是" : "否"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_70, [
                          _cache[49] || (_cache[49] = createBaseVNode("span", { class: "detail-label" }, "是否补考", -1)),
                          createBaseVNode("span", _hoisted_71, toDisplayString(selectedGrade.value.isMakeup ? "是" : "否"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_72, [
                          _cache[50] || (_cache[50] = createBaseVNode("span", { class: "detail-label" }, "是否缓考", -1)),
                          createBaseVNode("span", _hoisted_73, toDisplayString(selectedGrade.value.isDeferred ? "是" : "否"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_74, [
                          _cache[51] || (_cache[51] = createBaseVNode("span", { class: "detail-label" }, "是否免修", -1)),
                          createBaseVNode("span", _hoisted_75, toDisplayString(selectedGrade.value.isExempt ? "是" : "否"), 1)
                        ]),
                        selectedGrade.value.statusTags?.length ? (openBlock(), createElementBlock("div", _hoisted_76, [
                          _cache[52] || (_cache[52] = createBaseVNode("span", { class: "detail-label" }, "关键状态", -1)),
                          createBaseVNode("div", _hoisted_77, [
                            (openBlock(true), createElementBlock(Fragment, null, renderList(selectedGrade.value.statusTags, (tag) => {
                              return openBlock(), createElementBlock("span", {
                                key: `detail-${selectedGrade.value.course_name}-${tag.key}`,
                                class: normalizeClass(["status-chip", `status-${tag.key}`])
                              }, toDisplayString(tag.label), 3);
                            }), 128))
                          ])
                        ])) : createCommentVNode("", true),
                        _cache[53] || (_cache[53] = createBaseVNode("div", { class: "detail-item full-width detail-formula-note" }, [
                          createBaseVNode("span", { class: "detail-label" }, "绩点说明"),
                          createBaseVNode("div", { class: "detail-note-lines" }, [
                            createBaseVNode("span", null, "绩点 = 分数 / 10 - 5"),
                            createBaseVNode("span", null, "学分绩点 = 学分 × 绩点")
                          ])
                        ], -1))
                      ])
                    ])
                  ])) : createCommentVNode("", true)
                ]),
                _: 1
              })
            ]))
          ], 64)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const GradeView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f6175ac9"]]);
export {
  GradeView as default
};
