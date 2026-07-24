import { _ as _export_sfc, f as fetchWithCache, a as axiosInstance, n as normalizeSemesterList, h as resolveCurrentSemester, J as getStaleCachedData, b as setCachedData } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { o as onMounted, m as onBeforeUnmount, E as resolveComponent, c as createElementBlock, b as openBlock, q as createVNode, f as createCommentVNode, d as createBaseVNode, l as withCtx, a as ref, n as normalizeClass, u as unref, t as toDisplayString, k as createBlock, F as Fragment, i as renderList, e as computed, g as createTextVNode } from "./vue-core-DdLVj9yW.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "ranking-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-20" };
const _hoisted_2 = ["aria-busy"];
const _hoisted_3 = {
  key: 0,
  class: "mx-4 mt-2 px-3 py-2 rounded-xl bg-error-container/60 text-on-error-container text-xs font-medium"
};
const _hoisted_4 = { class: "flex-1 w-full px-4 pt-5 flex flex-col gap-5" };
const _hoisted_5 = { class: "flex flex-col gap-3" };
const _hoisted_6 = { class: "relative" };
const _hoisted_7 = ["value"];
const _hoisted_8 = { class: "bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end rounded-[24px] p-5 text-on-primary shadow-[0_10px_20px_rgba(54,209,220,0.3)] relative overflow-hidden" };
const _hoisted_9 = { class: "relative z-10 flex justify-between items-start mb-6" };
const _hoisted_10 = { class: "text-3xl font-bold leading-tight mb-1" };
const _hoisted_11 = { class: "text-sm text-on-primary/80" };
const _hoisted_12 = { class: "bg-on-primary/20 backdrop-blur-sm rounded-lg px-3 py-1 text-xs font-medium border border-on-primary/30" };
const _hoisted_13 = { class: "relative z-10 grid grid-cols-2 gap-4" };
const _hoisted_14 = { class: "flex flex-col" };
const _hoisted_15 = { class: "flex items-baseline gap-2" };
const _hoisted_16 = { class: "text-3xl font-bold leading-tight" };
const _hoisted_17 = { class: "flex flex-col pl-4 border-l border-on-primary/20" };
const _hoisted_18 = { class: "text-xl font-bold mt-1" };
const _hoisted_19 = { class: "grid grid-cols-1 gap-5" };
const _hoisted_20 = { class: "bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col gap-4 border border-outline-variant/20" };
const _hoisted_21 = { class: "grid grid-cols-3 gap-3" };
const _hoisted_22 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_23 = { class: "text-xl font-bold text-primary" };
const _hoisted_24 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_25 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_26 = { class: "text-xl font-bold text-primary" };
const _hoisted_27 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_28 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_29 = { class: "text-xl font-bold text-primary" };
const _hoisted_30 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_31 = { class: "bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col gap-4 border border-outline-variant/20" };
const _hoisted_32 = { class: "grid grid-cols-3 gap-3" };
const _hoisted_33 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_34 = { class: "text-xl font-bold text-success-teal" };
const _hoisted_35 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_36 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_37 = { class: "text-xl font-bold text-success-teal" };
const _hoisted_38 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_39 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_40 = { class: "text-xl font-bold text-success-teal" };
const _hoisted_41 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_42 = {
  key: 0,
  class: "mt-4 text-center"
};
const _hoisted_43 = { class: "text-xs font-medium text-on-surface-variant" };
const RANKING_CACHE_REFRESH_RETRY_MS = 8e3;
const MAX_RETRIES = 2;
const _sfc_main = {
  __name: "RankingView",
  props: {
    studentId: { type: String, required: true }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const API_BASE = "/api";
    const props = __props;
    const emit = __emit;
    const loading = ref(false);
    const refreshing = ref(false);
    const error = ref("");
    const ranking = ref(null);
    const semesters = ref([]);
    const selectedSemester = ref("");
    const currentSemester = ref("");
    const offline = ref(false);
    const syncTime = ref("");
    const displayedRankingCacheKey = ref("");
    const retryCount = ref(0);
    let rankingRealtimeRetryTimer = null;
    let rankingRequestSeq = 0;
    const resolveRankingSyncTime = (data) => {
      const explicit = String(data?.sync_time || data?.updated_at || data?.timestamp || "").trim();
      if (explicit) return explicit;
      if (data?.offline) return syncTime.value || "";
      return (/* @__PURE__ */ new Date()).toISOString();
    };
    const lastUpdatedAt = computed(() => syncTime.value ? formatRelativeTime(syncTime.value) : "暂未更新");
    const isInitialLoading = computed(() => loading.value && !ranking.value);
    const applyRankingPayload = (data, cacheKey = "") => {
      if (!data?.success) return false;
      ranking.value = data.data || {};
      offline.value = !!data.offline;
      syncTime.value = resolveRankingSyncTime(data);
      displayedRankingCacheKey.value = cacheKey || displayedRankingCacheKey.value;
      return true;
    };
    const applyStaleRankingSnapshot = (cacheKey) => {
      const stale = getStaleCachedData(cacheKey);
      const data = stale?.data;
      if (!data?.success || !data.data || typeof data.data !== "object") {
        return false;
      }
      return applyRankingPayload(data, cacheKey);
    };
    const clearRankingRealtimeRetry = () => {
      if (rankingRealtimeRetryTimer) {
        clearTimeout(rankingRealtimeRetryTimer);
        rankingRealtimeRetryTimer = null;
      }
    };
    const scheduleRankingRealtimeRetry = () => {
      clearRankingRealtimeRetry();
      rankingRealtimeRetryTimer = setTimeout(() => {
        rankingRealtimeRetryTimer = null;
        if (offline.value) {
          fetchRanking({ keepOfflineBanner: true }).catch(() => {
          });
        }
      }, RANKING_CACHE_REFRESH_RETRY_MS);
    };
    const fetchSemesters = async () => {
      try {
        const { data } = await fetchWithCache("semesters", async () => {
          const res = await axiosInstance.get(`${API_BASE}/v2/semesters`);
          return res.data;
        }, void 0, { staleWhileRevalidate: true, priority: "foreground" });
        if (data?.success) {
          const sorted = normalizeSemesterList(data.semesters || []);
          semesters.value = sorted;
          currentSemester.value = resolveCurrentSemester(sorted, data.current || "");
          if (!selectedSemester.value) {
            selectedSemester.value = "";
          }
        }
      } catch (e) {
        console.error("获取学期列表失败:", e);
      }
    };
    const fetchRanking = async (options = {}) => {
      const requestSeq = ++rankingRequestSeq;
      if (!options.forceRetry) retryCount.value = 0;
      const cacheKey = `ranking:${props.studentId}:${selectedSemester.value || "all"}`;
      const staleApplied = applyStaleRankingSnapshot(cacheKey);
      if (!staleApplied && displayedRankingCacheKey.value && displayedRankingCacheKey.value !== cacheKey) {
        ranking.value = null;
        displayedRankingCacheKey.value = "";
      }
      loading.value = !ranking.value;
      refreshing.value = true;
      error.value = "";
      clearRankingRealtimeRetry();
      if (!staleApplied || !options.keepOfflineBanner) {
        offline.value = false;
        syncTime.value = "";
      }
      const doFetch = async (attempt) => {
        try {
          const { data } = await fetchWithCache(cacheKey, async () => {
            const res = await axiosInstance.post(`${API_BASE}/v2/ranking`, {
              student_id: props.studentId,
              semester: selectedSemester.value
            });
            return res.data;
          }, void 0, { forceRemote: true, priority: "foreground" });
          if (requestSeq !== rankingRequestSeq) return;
          if (data?.success) {
            applyRankingPayload(data, cacheKey);
            if (!data.offline) {
              setCachedData(cacheKey, data);
              clearRankingRealtimeRetry();
            } else {
              scheduleRankingRealtimeRetry();
            }
            return;
          }
          const errMsg = data?.error || "";
          if (attempt < MAX_RETRIES && (errMsg.includes("会话已过期") || errMsg.includes("登录"))) {
            console.warn(`[Ranking] 会话过期，第${attempt + 1}次重试...`);
            await new Promise((r) => setTimeout(r, 800));
            return doFetch(attempt + 1);
          }
          error.value = errMsg || "获取排名失败";
        } catch (e) {
          if (requestSeq !== rankingRequestSeq) return;
          if (attempt < MAX_RETRIES) {
            console.warn(`[Ranking] 网络错误，第${attempt + 1}次重试:`, e);
            await new Promise((r) => setTimeout(r, 1e3));
            return doFetch(attempt + 1);
          }
          error.value = e.response?.data?.error || e.message || "网络错误，请稍后重试";
        }
      };
      await doFetch(0);
      if (requestSeq === rankingRequestSeq) {
        loading.value = false;
        refreshing.value = false;
      }
    };
    const handleSemesterChange = () => {
      retryCount.value = 0;
      fetchRanking();
    };
    onMounted(async () => {
      fetchRanking();
      fetchSemesters();
    });
    onBeforeUnmount(() => {
      clearRankingRealtimeRetry();
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "绩点排名",
          icon: "emoji_events",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "ranking-refresh-btn",
              type: "button",
              "aria-busy": refreshing.value || loading.value,
              "aria-label": "刷新绩点排名",
              onClick: fetchRanking
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: refreshing.value || loading.value || offline.value }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_3, " 当前显示为离线数据，更新于" + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_4, [
          createBaseVNode("section", _hoisted_5, [
            createBaseVNode("div", _hoisted_6, [
              createVNode(_component_IOSSelect, {
                modelValue: selectedSemester.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selectedSemester.value = $event),
                onChange: handleSemesterChange,
                class: "w-full appearance-none bg-surface-container-lowest border-none shadow-[0_4px_15px_rgba(0,0,0,0.03)] rounded-xl py-3 px-4 text-base font-medium text-on-surface pr-10 focus:ring-2 focus:ring-primary focus:outline-none"
              }, {
                default: withCtx(() => [
                  _cache[2] || (_cache[2] = createBaseVNode("option", { value: "" }, "全部(从入学至今)", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (sem) => {
                    return openBlock(), createElementBlock("option", {
                      key: sem,
                      value: sem
                    }, toDisplayString(sem), 9, _hoisted_7);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"]),
              _cache[3] || (_cache[3] = createBaseVNode("span", { class: "material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" }, "expand_more", -1))
            ])
          ]),
          isInitialLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: "正在获取排名数据..."
          })) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: error.value
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                class: "mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold text-sm",
                onClick: fetchRanking
              }, "重试")
            ]),
            _: 1
          }, 8, ["message"])) : !ranking.value || !ranking.value.gpa ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "empty",
            message: "暂无排名数据"
          }, {
            default: withCtx(() => [..._cache[4] || (_cache[4] = [
              createBaseVNode("p", { class: "text-on-surface-variant text-xs mt-1" }, "该学期可能尚未公布排名", -1)
            ])]),
            _: 1
          })) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_8, [
              _cache[8] || (_cache[8] = createBaseVNode("div", {
                class: "absolute inset-0 opacity-30 mix-blend-overlay",
                style: { "background-image": "url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTU0LjYyNyAwTDYwIDUuMzczLjM3MyA2MEwwIDU0LjYyN1oiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==')" }
              }, null, -1)),
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("div", null, [
                  createBaseVNode("h2", _hoisted_10, toDisplayString(ranking.value.name || "-"), 1),
                  createBaseVNode("p", _hoisted_11, "学号: " + toDisplayString(ranking.value.student_id || __props.studentId), 1)
                ]),
                createBaseVNode("div", _hoisted_12, toDisplayString(ranking.value.major || "-"), 1)
              ]),
              createBaseVNode("div", _hoisted_13, [
                createBaseVNode("div", _hoisted_14, [
                  _cache[6] || (_cache[6] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-primary/70 mb-1" }, "平均学分绩点 (GPA)", -1)),
                  createBaseVNode("div", _hoisted_15, [
                    createBaseVNode("span", _hoisted_16, toDisplayString(ranking.value.gpa || "-"), 1),
                    _cache[5] || (_cache[5] = createBaseVNode("span", { class: "text-sm text-on-primary/80" }, "/ 5.0", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_17, [
                  _cache[7] || (_cache[7] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-primary/70 mb-1" }, "算术平均分", -1)),
                  createBaseVNode("span", _hoisted_18, toDisplayString(ranking.value.avg_score || "-"), 1)
                ])
              ])
            ]),
            createBaseVNode("section", _hoisted_19, [
              _cache[17] || (_cache[17] = createBaseVNode("h3", { class: "text-lg font-bold text-on-surface" }, "综合排名概览", -1)),
              createBaseVNode("div", _hoisted_20, [
                _cache[12] || (_cache[12] = createBaseVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                  createBaseVNode("div", { class: "w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary" }, [
                    createBaseVNode("span", { class: "material-symbols-outlined text-[18px]" }, "trending_up")
                  ]),
                  createBaseVNode("h4", { class: "text-base font-semibold text-on-surface" }, "绩点排名")
                ], -1)),
                createBaseVNode("div", _hoisted_21, [
                  createBaseVNode("div", _hoisted_22, [
                    _cache[9] || (_cache[9] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-surface-variant mb-1" }, "班级", -1)),
                    createBaseVNode("span", _hoisted_23, [
                      ranking.value.gpa_class_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.gpa_class_rank), 1),
                        createBaseVNode("span", _hoisted_24, "/" + toDisplayString(ranking.value.gpa_class_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_25, [
                    _cache[10] || (_cache[10] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-surface-variant mb-1" }, "专业", -1)),
                    createBaseVNode("span", _hoisted_26, [
                      ranking.value.gpa_major_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.gpa_major_rank), 1),
                        createBaseVNode("span", _hoisted_27, "/" + toDisplayString(ranking.value.gpa_major_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_28, [
                    _cache[11] || (_cache[11] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-surface-variant mb-1" }, "学院", -1)),
                    createBaseVNode("span", _hoisted_29, [
                      ranking.value.gpa_college_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.gpa_college_rank), 1),
                        createBaseVNode("span", _hoisted_30, "/" + toDisplayString(ranking.value.gpa_college_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ])
                ])
              ]),
              createBaseVNode("div", _hoisted_31, [
                _cache[16] || (_cache[16] = createBaseVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                  createBaseVNode("div", { class: "w-8 h-8 rounded-full bg-success-teal/10 flex items-center justify-center text-success-teal" }, [
                    createBaseVNode("span", { class: "material-symbols-outlined text-[18px]" }, "bar_chart")
                  ]),
                  createBaseVNode("h4", { class: "text-base font-semibold text-on-surface" }, "平均分排名")
                ], -1)),
                createBaseVNode("div", _hoisted_32, [
                  createBaseVNode("div", _hoisted_33, [
                    _cache[13] || (_cache[13] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-surface-variant mb-1" }, "班级", -1)),
                    createBaseVNode("span", _hoisted_34, [
                      ranking.value.avg_class_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.avg_class_rank), 1),
                        createBaseVNode("span", _hoisted_35, "/" + toDisplayString(ranking.value.avg_class_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_36, [
                    _cache[14] || (_cache[14] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-surface-variant mb-1" }, "专业", -1)),
                    createBaseVNode("span", _hoisted_37, [
                      ranking.value.avg_major_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.avg_major_rank), 1),
                        createBaseVNode("span", _hoisted_38, "/" + toDisplayString(ranking.value.avg_major_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_39, [
                    _cache[15] || (_cache[15] = createBaseVNode("span", { class: "text-[10px] font-semibold text-on-surface-variant mb-1" }, "学院", -1)),
                    createBaseVNode("span", _hoisted_40, [
                      ranking.value.avg_college_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.avg_college_rank), 1),
                        createBaseVNode("span", _hoisted_41, "/" + toDisplayString(ranking.value.avg_college_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ])
                ])
              ]),
              syncTime.value ? (openBlock(), createElementBlock("div", _hoisted_42, [
                createBaseVNode("p", _hoisted_43, "最新更新时间: " + toDisplayString(lastUpdatedAt.value), 1)
              ])) : createCommentVNode("", true)
            ])
          ], 64))
        ])
      ]);
    };
  }
};
const RankingView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-be20e145"]]);
export {
  RankingView as default
};
