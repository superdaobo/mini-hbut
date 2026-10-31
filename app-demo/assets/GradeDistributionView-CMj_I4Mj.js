import { x as watch, a as openBlock, c as createElementBlock, k as createVNode, l as withCtx, b as createBaseVNode, t as toDisplayString, u as unref, F as Fragment, f as renderList, e as normalizeStyle, n as normalizeClass, L as withDirectives, M as vModelText, g as createTextVNode, d as createCommentVNode, m as Transition, h as computed, r as ref, C as nextTick } from "./vue-core-CVT-P0lT.js";
import { P as PRIMARY_BACKEND_ORIGIN, _ as _export_sfc, b as useLocale, v as t } from "./app-demo-BXR7Wchv.js";
function getServiceBaseUrl() {
  try {
    const endpoint = localStorage.getItem("hbu_ocr_endpoint") || "";
    if (endpoint) {
      const url = new URL(endpoint);
      return `${url.protocol}//${url.host}`;
    }
  } catch {
  }
  return PRIMARY_BACKEND_ORIGIN;
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
const VALID_MODES = ["teacher", "course"];
function normalizeGradeSearchMode(value) {
  if (typeof value === "string" && VALID_MODES.includes(value)) {
    return value;
  }
  return "teacher";
}
function isGradeSearchActive(keyword) {
  if (keyword === null || keyword === void 0) return false;
  return String(keyword).trim().length > 0;
}
function buildGradeDistributionQuery(mode, keyword, page, pageSize2) {
  const normalizedMode = normalizeGradeSearchMode(mode);
  const active = isGradeSearchActive(keyword);
  const trimmed = active ? String(keyword).trim() : null;
  const safePage = Math.floor(Number(page));
  return {
    semester: null,
    teacher_name: normalizedMode === "teacher" ? trimmed : null,
    course_name: normalizedMode === "course" ? trimmed : null,
    page: Number.isFinite(safePage) && safePage >= 1 ? safePage : 1,
    page_size: pageSize2
  };
}
const _hoisted_1 = {
  key: "detail",
  class: "gd-detail"
};
const _hoisted_2 = { class: "gd-detail-card" };
const _hoisted_3 = { class: "gd-detail-title" };
const _hoisted_4 = { class: "gd-detail-meta" };
const _hoisted_5 = { class: "gd-meta-tag" };
const _hoisted_6 = { class: "gd-meta-badge" };
const _hoisted_7 = { class: "gd-detail-stats" };
const _hoisted_8 = { class: "gd-dstat" };
const _hoisted_9 = {
  class: "gd-dstat-value",
  style: { "color": "#22c55e" }
};
const _hoisted_10 = { class: "gd-dstat-label" };
const _hoisted_11 = { class: "gd-dstat" };
const _hoisted_12 = {
  class: "gd-dstat-value",
  style: { "color": "#ef4444" }
};
const _hoisted_13 = { class: "gd-dstat-label" };
const _hoisted_14 = { class: "gd-dstat" };
const _hoisted_15 = {
  class: "gd-dstat-value",
  style: { "color": "#3b82f6" }
};
const _hoisted_16 = { class: "gd-dstat-label" };
const _hoisted_17 = { class: "gd-dstat" };
const _hoisted_18 = {
  class: "gd-dstat-value",
  style: { "color": "#8b5cf6" }
};
const _hoisted_19 = { class: "gd-dstat-label" };
const _hoisted_20 = { class: "gd-dstat" };
const _hoisted_21 = {
  class: "gd-dstat-value",
  style: { "color": "var(--color-primary,#6366f1)" }
};
const _hoisted_22 = { class: "gd-dstat-label" };
const _hoisted_23 = { class: "gd-detail-segments" };
const _hoisted_24 = { class: "gd-seg-title" };
const _hoisted_25 = { class: "gd-seg-label" };
const _hoisted_26 = { class: "gd-seg-bar-bg" };
const _hoisted_27 = { class: "gd-seg-info" };
const _hoisted_28 = {
  key: "list",
  class: "gd-list-page"
};
const _hoisted_29 = { class: "gd-filters" };
const _hoisted_30 = ["aria-label"];
const _hoisted_31 = ["aria-pressed"];
const _hoisted_32 = ["aria-pressed"];
const _hoisted_33 = { class: "gd-search" };
const _hoisted_34 = ["placeholder"];
const _hoisted_35 = {
  key: 0,
  class: "gd-error"
};
const _hoisted_36 = {
  key: 1,
  class: "gd-loading"
};
const _hoisted_37 = {
  key: 2,
  class: "gd-empty"
};
const _hoisted_38 = {
  key: 3,
  class: "gd-empty"
};
const _hoisted_39 = {
  key: 4,
  class: "gd-list"
};
const _hoisted_40 = ["onClick"];
const _hoisted_41 = { class: "gd-item-left" };
const _hoisted_42 = { class: "gd-item-name" };
const _hoisted_43 = { class: "gd-item-sub" };
const _hoisted_44 = { class: "gd-item-right" };
const _hoisted_45 = {
  class: "gd-item-avg",
  style: { color: "#ef4444" }
};
const _hoisted_46 = { class: "gd-item-avg-label" };
const _hoisted_47 = {
  key: 5,
  class: "gd-pagination"
};
const _hoisted_48 = ["disabled"];
const _hoisted_49 = { class: "gd-page-info" };
const _hoisted_50 = ["disabled"];
const pageSize = 50;
const _sfc_main = {
  __name: "GradeDistributionView",
  setup(__props) {
    const { locale } = useLocale();
    const loading = ref(false);
    const error = ref("");
    const searchMode = ref("teacher");
    const searchQuery = ref("");
    const items = ref([]);
    const total = ref(0);
    const page = ref(1);
    const selectedItem = ref(null);
    let requestSeq = 0;
    let searchTimer = null;
    const SEGMENT_KEYS = ["90-100", "80-89", "70-79", "60-69", "<60"];
    const SEGMENT_COLORS = {
      "90-100": "#22c55e",
      "80-89": "#3b82f6",
      "70-79": "#f59e0b",
      "60-69": "#f97316",
      "<60": "#ef4444"
    };
    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
    const hasQuery = computed(() => isGradeSearchActive(searchQuery.value));
    const resetResults = () => {
      items.value = [];
      total.value = 0;
      error.value = "";
      selectedItem.value = null;
    };
    const loadData = async () => {
      if (!hasQuery.value) return;
      const query = buildGradeDistributionQuery(searchMode.value, searchQuery.value, page.value, pageSize);
      const seq = ++requestSeq;
      loading.value = true;
      error.value = "";
      try {
        const result = await fetchGradeDistribution(query);
        if (seq !== requestSeq) return;
        items.value = [...result.items].sort((a, b) => (b.sample_count || 0) - (a.sample_count || 0));
        total.value = result.total;
      } catch (e) {
        if (seq !== requestSeq) return;
        error.value = `${t("grade.dist.errorPrefix")}${e?.message || String(e)}`;
        items.value = [];
        total.value = 0;
      } finally {
        if (seq === requestSeq) loading.value = false;
      }
    };
    const switchMode = (mode) => {
      if (mode === searchMode.value) return;
      if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
      }
      requestSeq += 1;
      searchMode.value = mode;
      searchQuery.value = "";
      page.value = 1;
      loading.value = false;
      resetResults();
    };
    const retrySearch = () => {
      if (hasQuery.value) {
        loadData();
      }
    };
    const onSearchInput = () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchTimer = null;
        if (hasQuery.value) {
          const pageChanged = page.value !== 1;
          page.value = 1;
          if (!pageChanged) loadData();
        } else {
          requestSeq += 1;
          loading.value = false;
          page.value = 1;
          resetResults();
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
            selectedItem.value ? (openBlock(), createElementBlock("div", _hoisted_1, [
              createBaseVNode("div", {
                class: "gd-detail-header",
                onClick: closeDetail
              }, [
                _cache[5] || (_cache[5] = createBaseVNode("span", { class: "gd-back-icon" }, "‹", -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("grade.dist.back")), 1)
              ]),
              createBaseVNode("div", _hoisted_2, [
                createBaseVNode("div", _hoisted_3, toDisplayString(selectedItem.value.course_name), 1),
                createBaseVNode("div", _hoisted_4, [
                  createBaseVNode("span", _hoisted_5, "👨‍🏫 " + toDisplayString(selectedItem.value.teacher_name), 1),
                  createBaseVNode("span", _hoisted_6, toDisplayString(selectedItem.value.semester), 1)
                ]),
                createBaseVNode("div", _hoisted_7, [
                  createBaseVNode("div", _hoisted_8, [
                    createBaseVNode("div", _hoisted_9, toDisplayString(selectedItem.value.max_score ?? "-"), 1),
                    createBaseVNode("div", _hoisted_10, toDisplayString(unref(t)("grade.dist.stat.max")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_11, [
                    createBaseVNode("div", _hoisted_12, toDisplayString(selectedItem.value.min_score ?? "-"), 1),
                    createBaseVNode("div", _hoisted_13, toDisplayString(unref(t)("grade.dist.stat.min")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_14, [
                    createBaseVNode("div", _hoisted_15, toDisplayString(selectedItem.value.avg_score ?? "-"), 1),
                    createBaseVNode("div", _hoisted_16, toDisplayString(unref(t)("grade.dist.stat.avg")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_17, [
                    createBaseVNode("div", _hoisted_18, toDisplayString(selectedItem.value.median_score ?? "-"), 1),
                    createBaseVNode("div", _hoisted_19, toDisplayString(unref(t)("grade.dist.stat.median")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_20, [
                    createBaseVNode("div", _hoisted_21, toDisplayString(selectedItem.value.sample_count ?? 0), 1),
                    createBaseVNode("div", _hoisted_22, toDisplayString(unref(t)("grade.dist.stat.samples")), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_23, [
                  createBaseVNode("div", _hoisted_24, toDisplayString(unref(t)("grade.dist.segTitle")), 1),
                  (openBlock(), createElementBlock(Fragment, null, renderList(SEGMENT_KEYS, (seg) => {
                    return createBaseVNode("div", {
                      key: seg,
                      class: "gd-seg-row"
                    }, [
                      createBaseVNode("span", _hoisted_25, toDisplayString(seg), 1),
                      createBaseVNode("div", _hoisted_26, [
                        createBaseVNode("div", {
                          class: "gd-seg-bar",
                          style: normalizeStyle({
                            width: segmentWidth(selectedItem.value, seg) + "%",
                            backgroundColor: SEGMENT_COLORS[seg]
                          })
                        }, null, 4)
                      ]),
                      createBaseVNode("span", _hoisted_27, toDisplayString(segmentCount(selectedItem.value, seg)) + toDisplayString(unref(t)("grade.dist.segSuffix")) + " · " + toDisplayString(segmentPercent(selectedItem.value, seg)) + "%", 1)
                    ]);
                  }), 64))
                ])
              ])
            ])) : (openBlock(), createElementBlock("div", _hoisted_28, [
              createBaseVNode("div", _hoisted_29, [
                createBaseVNode("div", {
                  class: "gd-mode-switch",
                  role: "group",
                  "aria-label": unref(t)("grade.dist.mode.label")
                }, [
                  createBaseVNode("button", {
                    type: "button",
                    class: normalizeClass(["gd-mode-btn", { active: searchMode.value === "teacher" }]),
                    "aria-pressed": searchMode.value === "teacher",
                    onClick: _cache[0] || (_cache[0] = ($event) => switchMode("teacher"))
                  }, toDisplayString(unref(t)("grade.dist.mode.teacher")), 11, _hoisted_31),
                  createBaseVNode("button", {
                    type: "button",
                    class: normalizeClass(["gd-mode-btn", { active: searchMode.value === "course" }]),
                    "aria-pressed": searchMode.value === "course",
                    onClick: _cache[1] || (_cache[1] = ($event) => switchMode("course"))
                  }, toDisplayString(unref(t)("grade.dist.mode.course")), 11, _hoisted_32)
                ], 8, _hoisted_30),
                createBaseVNode("div", _hoisted_33, [
                  _cache[6] || (_cache[6] = createBaseVNode("span", { class: "gd-search-icon" }, "🔍", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => searchQuery.value = $event),
                    type: "text",
                    placeholder: searchMode.value === "teacher" ? unref(t)("grade.dist.search.teacherPlaceholder") : unref(t)("grade.dist.search.coursePlaceholder"),
                    class: "gd-search-input",
                    onInput: onSearchInput
                  }, null, 40, _hoisted_34), [
                    [vModelText, searchQuery.value]
                  ])
                ])
              ]),
              error.value ? (openBlock(), createElementBlock("div", _hoisted_35, [
                createTextVNode(toDisplayString(error.value) + " ", 1),
                createBaseVNode("button", {
                  type: "button",
                  class: "gd-retry",
                  onClick: retrySearch
                }, toDisplayString(unref(t)("grade.dist.retry")), 1)
              ])) : createCommentVNode("", true),
              loading.value ? (openBlock(), createElementBlock("div", _hoisted_36, [
                _cache[7] || (_cache[7] = createBaseVNode("div", { class: "gd-spinner" }, null, -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("grade.dist.loading")), 1)
              ])) : !hasQuery.value ? (openBlock(), createElementBlock("div", _hoisted_37, [
                _cache[8] || (_cache[8] = createBaseVNode("span", { class: "gd-empty-icon" }, "🔍", -1)),
                createBaseVNode("p", null, toDisplayString(searchMode.value === "teacher" ? unref(t)("grade.dist.empty.searchHintTeacher") : unref(t)("grade.dist.empty.searchHintCourse")), 1)
              ])) : items.value.length === 0 && !error.value ? (openBlock(), createElementBlock("div", _hoisted_38, [
                _cache[9] || (_cache[9] = createBaseVNode("span", { class: "gd-empty-icon" }, "📭", -1)),
                createBaseVNode("p", null, toDisplayString(unref(t)("grade.dist.empty.none")), 1)
              ])) : (openBlock(), createElementBlock("div", _hoisted_39, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
                  return openBlock(), createElementBlock("div", {
                    key: item.id,
                    class: "gd-list-item",
                    onClick: ($event) => openDetail(item)
                  }, [
                    createBaseVNode("div", _hoisted_41, [
                      createBaseVNode("div", _hoisted_42, toDisplayString(item.course_name), 1),
                      createBaseVNode("div", _hoisted_43, [
                        createBaseVNode("span", null, toDisplayString(item.teacher_name), 1),
                        _cache[10] || (_cache[10] = createBaseVNode("span", { class: "gd-dot" }, "·", -1)),
                        createBaseVNode("span", null, toDisplayString(item.semester), 1),
                        _cache[11] || (_cache[11] = createBaseVNode("span", { class: "gd-dot" }, "·", -1)),
                        createBaseVNode("span", null, toDisplayString(unref(t)("grade.dist.samplesPrefix")) + " " + toDisplayString(item.sample_count ?? 0), 1)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_44, [
                      createBaseVNode("div", _hoisted_45, toDisplayString(failRate(item)), 1),
                      createBaseVNode("div", _hoisted_46, toDisplayString(unref(t)("grade.dist.failRate")), 1)
                    ]),
                    _cache[12] || (_cache[12] = createBaseVNode("span", { class: "gd-item-arrow" }, "›", -1))
                  ], 8, _hoisted_40);
                }), 128))
              ])),
              total.value > pageSize ? (openBlock(), createElementBlock("div", _hoisted_47, [
                createBaseVNode("button", {
                  class: "gd-page-btn",
                  disabled: page.value <= 1,
                  onClick: _cache[3] || (_cache[3] = ($event) => page.value--)
                }, toDisplayString(unref(t)("grade.dist.prev")), 9, _hoisted_48),
                createBaseVNode("span", _hoisted_49, toDisplayString(page.value) + " / " + toDisplayString(totalPages.value), 1),
                createBaseVNode("button", {
                  class: "gd-page-btn",
                  disabled: page.value >= totalPages.value,
                  onClick: _cache[4] || (_cache[4] = ($event) => page.value++)
                }, toDisplayString(unref(t)("grade.dist.next")), 9, _hoisted_50)
              ])) : createCommentVNode("", true)
            ]))
          ]),
          _: 1
        })
      ], 512);
    };
  }
};
const GradeDistributionView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-95da0fd3"]]);
export {
  GradeDistributionView as G
};
