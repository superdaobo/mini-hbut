import { _ as _export_sfc, m as useI18n, p as tf, f as fetchWithCache, d as axiosInstance, n as normalizeSemesterList, k as resolveCurrentSemester, V as getStaleCachedData, s as setCachedData } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { o as onMounted, l as onBeforeUnmount, M as resolveComponent, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, t as toDisplayString, d as createCommentVNode, F as Fragment, f as renderList, j as createBlock, g as createTextVNode, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "ranking-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-20" };
const _hoisted_2 = ["aria-busy", "aria-label"];
const _hoisted_3 = {
  key: 0,
  class: "mx-4 mt-2 px-3 py-2 rounded-xl bg-error-container/60 text-on-error-container text-xs font-medium"
};
const _hoisted_4 = { class: "flex-1 w-full px-4 pt-5 flex flex-col gap-5" };
const _hoisted_5 = { class: "flex flex-col gap-3" };
const _hoisted_6 = { class: "relative" };
const _hoisted_7 = { value: "" };
const _hoisted_8 = ["value"];
const _hoisted_9 = { class: "text-on-surface-variant text-xs mt-1" };
const _hoisted_10 = { class: "bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end rounded-[24px] p-5 text-on-primary shadow-[0_10px_20px_rgba(54,209,220,0.3)] relative overflow-hidden" };
const _hoisted_11 = { class: "relative z-10 flex justify-between items-start mb-6" };
const _hoisted_12 = { class: "text-3xl font-bold leading-tight mb-1" };
const _hoisted_13 = { class: "text-sm text-on-primary/80" };
const _hoisted_14 = { class: "bg-on-primary/20 backdrop-blur-sm rounded-lg px-3 py-1 text-xs font-medium border border-on-primary/30" };
const _hoisted_15 = { class: "relative z-10 grid grid-cols-2 gap-4" };
const _hoisted_16 = { class: "flex flex-col" };
const _hoisted_17 = { class: "text-[10px] font-semibold text-on-primary/70 mb-1" };
const _hoisted_18 = { class: "flex items-baseline gap-2" };
const _hoisted_19 = { class: "text-3xl font-bold leading-tight" };
const _hoisted_20 = { class: "flex flex-col pl-4 border-l border-on-primary/20" };
const _hoisted_21 = { class: "text-[10px] font-semibold text-on-primary/70 mb-1" };
const _hoisted_22 = { class: "text-xl font-bold mt-1" };
const _hoisted_23 = { class: "grid grid-cols-1 gap-5" };
const _hoisted_24 = { class: "text-lg font-bold text-on-surface" };
const _hoisted_25 = { class: "bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col gap-4 border border-outline-variant/20" };
const _hoisted_26 = { class: "flex items-center gap-2 mb-2" };
const _hoisted_27 = { class: "text-base font-semibold text-on-surface" };
const _hoisted_28 = { class: "grid grid-cols-3 gap-3" };
const _hoisted_29 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_30 = { class: "text-[10px] font-semibold text-on-surface-variant mb-1" };
const _hoisted_31 = { class: "text-xl font-bold text-primary" };
const _hoisted_32 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_33 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_34 = { class: "text-[10px] font-semibold text-on-surface-variant mb-1" };
const _hoisted_35 = { class: "text-xl font-bold text-primary" };
const _hoisted_36 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_37 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_38 = { class: "text-[10px] font-semibold text-on-surface-variant mb-1" };
const _hoisted_39 = { class: "text-xl font-bold text-primary" };
const _hoisted_40 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_41 = { class: "bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col gap-4 border border-outline-variant/20" };
const _hoisted_42 = { class: "flex items-center gap-2 mb-2" };
const _hoisted_43 = { class: "text-base font-semibold text-on-surface" };
const _hoisted_44 = { class: "grid grid-cols-3 gap-3" };
const _hoisted_45 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_46 = { class: "text-[10px] font-semibold text-on-surface-variant mb-1" };
const _hoisted_47 = { class: "text-xl font-bold text-success-teal" };
const _hoisted_48 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_49 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_50 = { class: "text-[10px] font-semibold text-on-surface-variant mb-1" };
const _hoisted_51 = { class: "text-xl font-bold text-success-teal" };
const _hoisted_52 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_53 = { class: "bg-surface rounded-xl p-3 flex flex-col items-center justify-center text-center" };
const _hoisted_54 = { class: "text-[10px] font-semibold text-on-surface-variant mb-1" };
const _hoisted_55 = { class: "text-xl font-bold text-success-teal" };
const _hoisted_56 = { class: "text-[12px] text-on-surface-variant ml-1 font-normal" };
const _hoisted_57 = {
  key: 0,
  class: "mt-4 text-center"
};
const _hoisted_58 = { class: "text-xs font-medium text-on-surface-variant" };
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
    const { t } = useI18n();
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
    const lastUpdatedAt = computed(() => syncTime.value ? formatRelativeTime(syncTime.value) : t("exam.notUpdated"));
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
        console.error("failed to load semesters:", e);
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
            console.warn(`[Ranking] session expired, retry #${attempt + 1}...`);
            await new Promise((r) => setTimeout(r, 800));
            return doFetch(attempt + 1);
          }
          error.value = errMsg || t("ranking.error.fetchFailed");
        } catch (e) {
          if (requestSeq !== rankingRequestSeq) return;
          if (attempt < MAX_RETRIES) {
            console.warn(`[Ranking] network error, retry #${attempt + 1}:`, e);
            await new Promise((r) => setTimeout(r, 1e3));
            return doFetch(attempt + 1);
          }
          error.value = e.response?.data?.error || e.message || t("ranking.error.network");
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
          title: unref(t)("ranking.title"),
          icon: "emoji_events",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "ranking-refresh-btn",
              type: "button",
              "aria-busy": refreshing.value || loading.value,
              "aria-label": unref(t)("ranking.refreshAria"),
              onClick: fetchRanking
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: refreshing.value || loading.value || offline.value }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_3, toDisplayString(unref(tf)("ranking.offlineBanner", { time: unref(formatRelativeTime)(syncTime.value) })), 1)) : createCommentVNode("", true),
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
                  createBaseVNode("option", _hoisted_7, toDisplayString(unref(t)("ranking.allSemesters")), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (sem) => {
                    return openBlock(), createElementBlock("option", {
                      key: sem,
                      value: sem
                    }, toDisplayString(sem), 9, _hoisted_8);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"]),
              _cache[2] || (_cache[2] = createBaseVNode("span", { class: "material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" }, "expand_more", -1))
            ])
          ]),
          isInitialLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("ranking.loading")
          }, null, 8, ["message"])) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 1,
            type: "error",
            message: error.value
          }, {
            default: withCtx(() => [
              createBaseVNode("button", {
                class: "mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold text-sm",
                onClick: fetchRanking
              }, toDisplayString(unref(t)("common.retry")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : !ranking.value || !ranking.value.gpa ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "empty",
            message: unref(t)("ranking.empty")
          }, {
            default: withCtx(() => [
              createBaseVNode("p", _hoisted_9, toDisplayString(unref(t)("ranking.emptyHint")), 1)
            ]),
            _: 1
          }, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_10, [
              _cache[4] || (_cache[4] = createBaseVNode("div", {
                class: "absolute inset-0 opacity-30 mix-blend-overlay",
                style: { "background-image": "url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTU0LjYyNyAwTDYwIDUuMzczLjM3MyA2MEwwIDU0LjYyN1oiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==')" }
              }, null, -1)),
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("div", null, [
                  createBaseVNode("h2", _hoisted_12, toDisplayString(ranking.value.name || "-"), 1),
                  createBaseVNode("p", _hoisted_13, toDisplayString(unref(tf)("ranking.studentId", { id: ranking.value.student_id || __props.studentId })), 1)
                ]),
                createBaseVNode("div", _hoisted_14, toDisplayString(ranking.value.major || "-"), 1)
              ]),
              createBaseVNode("div", _hoisted_15, [
                createBaseVNode("div", _hoisted_16, [
                  createBaseVNode("span", _hoisted_17, toDisplayString(unref(t)("ranking.gpaLabel")), 1),
                  createBaseVNode("div", _hoisted_18, [
                    createBaseVNode("span", _hoisted_19, toDisplayString(ranking.value.gpa || "-"), 1),
                    _cache[3] || (_cache[3] = createBaseVNode("span", { class: "text-sm text-on-primary/80" }, "/ 5.0", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_20, [
                  createBaseVNode("span", _hoisted_21, toDisplayString(unref(t)("ranking.avgScoreLabel")), 1),
                  createBaseVNode("span", _hoisted_22, toDisplayString(ranking.value.avg_score || "-"), 1)
                ])
              ])
            ]),
            createBaseVNode("section", _hoisted_23, [
              createBaseVNode("h3", _hoisted_24, toDisplayString(unref(t)("ranking.overview")), 1),
              createBaseVNode("div", _hoisted_25, [
                createBaseVNode("div", _hoisted_26, [
                  _cache[5] || (_cache[5] = createBaseVNode("div", { class: "w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary" }, [
                    createBaseVNode("span", { class: "material-symbols-outlined text-[18px]" }, "trending_up")
                  ], -1)),
                  createBaseVNode("h4", _hoisted_27, toDisplayString(unref(t)("ranking.gpaRank")), 1)
                ]),
                createBaseVNode("div", _hoisted_28, [
                  createBaseVNode("div", _hoisted_29, [
                    createBaseVNode("span", _hoisted_30, toDisplayString(unref(t)("ranking.class")), 1),
                    createBaseVNode("span", _hoisted_31, [
                      ranking.value.gpa_class_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.gpa_class_rank), 1),
                        createBaseVNode("span", _hoisted_32, "/" + toDisplayString(ranking.value.gpa_class_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_33, [
                    createBaseVNode("span", _hoisted_34, toDisplayString(unref(t)("ranking.major")), 1),
                    createBaseVNode("span", _hoisted_35, [
                      ranking.value.gpa_major_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.gpa_major_rank), 1),
                        createBaseVNode("span", _hoisted_36, "/" + toDisplayString(ranking.value.gpa_major_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_37, [
                    createBaseVNode("span", _hoisted_38, toDisplayString(unref(t)("ranking.college")), 1),
                    createBaseVNode("span", _hoisted_39, [
                      ranking.value.gpa_college_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.gpa_college_rank), 1),
                        createBaseVNode("span", _hoisted_40, "/" + toDisplayString(ranking.value.gpa_college_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ])
                ])
              ]),
              createBaseVNode("div", _hoisted_41, [
                createBaseVNode("div", _hoisted_42, [
                  _cache[6] || (_cache[6] = createBaseVNode("div", { class: "w-8 h-8 rounded-full bg-success-teal/10 flex items-center justify-center text-success-teal" }, [
                    createBaseVNode("span", { class: "material-symbols-outlined text-[18px]" }, "bar_chart")
                  ], -1)),
                  createBaseVNode("h4", _hoisted_43, toDisplayString(unref(t)("ranking.avgRank")), 1)
                ]),
                createBaseVNode("div", _hoisted_44, [
                  createBaseVNode("div", _hoisted_45, [
                    createBaseVNode("span", _hoisted_46, toDisplayString(unref(t)("ranking.class")), 1),
                    createBaseVNode("span", _hoisted_47, [
                      ranking.value.avg_class_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.avg_class_rank), 1),
                        createBaseVNode("span", _hoisted_48, "/" + toDisplayString(ranking.value.avg_class_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_49, [
                    createBaseVNode("span", _hoisted_50, toDisplayString(unref(t)("ranking.major")), 1),
                    createBaseVNode("span", _hoisted_51, [
                      ranking.value.avg_major_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.avg_major_rank), 1),
                        createBaseVNode("span", _hoisted_52, "/" + toDisplayString(ranking.value.avg_major_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_53, [
                    createBaseVNode("span", _hoisted_54, toDisplayString(unref(t)("ranking.college")), 1),
                    createBaseVNode("span", _hoisted_55, [
                      ranking.value.avg_college_rank ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(ranking.value.avg_college_rank), 1),
                        createBaseVNode("span", _hoisted_56, "/" + toDisplayString(ranking.value.avg_college_total), 1)
                      ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("-")
                      ], 64))
                    ])
                  ])
                ])
              ]),
              syncTime.value ? (openBlock(), createElementBlock("div", _hoisted_57, [
                createBaseVNode("p", _hoisted_58, toDisplayString(unref(tf)("ranking.lastUpdated", { time: lastUpdatedAt.value })), 1)
              ])) : createCommentVNode("", true)
            ])
          ], 64))
        ])
      ]);
    };
  }
};
const RankingView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-94e94200"]]);
export {
  RankingView as default
};
