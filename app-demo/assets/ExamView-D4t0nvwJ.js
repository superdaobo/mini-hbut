import { _ as _export_sfc, m as useI18n, p as tf, R as getPreferredSemesterFast, T as mergeSemesterOptions, f as fetchWithCache, d as axiosInstance, s as setCachedData, U as writeExamToWidget, n as normalizeSemesterList, k as resolveCurrentSemester, V as getStaleCachedData } from "./app-demo-CUOWTnz-.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { o as onMounted, l as onBeforeUnmount, M as resolveComponent, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, t as toDisplayString, d as createCommentVNode, F as Fragment, f as renderList, j as createBlock, g as createTextVNode, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "exam-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-24" };
const _hoisted_2 = ["aria-busy", "aria-label"];
const _hoisted_3 = {
  key: 0,
  class: "mx-4 mt-2 px-3 py-2 rounded-xl bg-error-container/60 text-on-error-container text-xs font-medium"
};
const _hoisted_4 = { class: "flex-1 flex flex-col gap-5 p-4" };
const _hoisted_5 = { class: "flex flex-col gap-3" };
const _hoisted_6 = { class: "flex items-center justify-between" };
const _hoisted_7 = { class: "relative bg-surface-container-lowest rounded-lg border border-outline-variant shadow-sm px-3 py-2 flex items-center gap-2 cursor-pointer active:scale-95 transition-transform" };
const _hoisted_8 = ["value"];
const _hoisted_9 = {
  key: 0,
  class: "grid grid-cols-2 gap-3"
};
const _hoisted_10 = { class: "bg-primary-container rounded-2xl p-4 flex flex-col justify-center items-start shadow-sm" };
const _hoisted_11 = { class: "text-xs font-medium text-on-primary-container/80 mb-1" };
const _hoisted_12 = { class: "flex items-baseline gap-1" };
const _hoisted_13 = { class: "text-3xl font-bold text-on-primary-container leading-tight" };
const _hoisted_14 = { class: "text-[10px] font-semibold text-on-primary-container/80" };
const _hoisted_15 = { class: "bg-surface-container-lowest rounded-2xl p-4 flex flex-col justify-center items-start border border-surface-container-highest shadow-sm" };
const _hoisted_16 = { class: "text-xs font-medium text-on-surface-variant mb-1" };
const _hoisted_17 = { class: "flex items-baseline gap-1" };
const _hoisted_18 = { class: "text-3xl font-bold text-on-surface leading-tight" };
const _hoisted_19 = { class: "text-[10px] font-semibold text-on-surface-variant" };
const _hoisted_20 = { class: "flex flex-col gap-4" };
const _hoisted_21 = {
  key: 0,
  class: "h-1 w-full bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end"
};
const _hoisted_22 = { class: "p-4 flex flex-col gap-3" };
const _hoisted_23 = { class: "flex justify-between items-start" };
const _hoisted_24 = {
  key: 0,
  class: "bg-surface-container-high text-on-surface-variant text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1"
};
const _hoisted_25 = {
  key: 1,
  class: "bg-error-container text-on-error-container text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1"
};
const _hoisted_26 = { class: "grid grid-cols-1 gap-2 mt-1" };
const _hoisted_27 = {
  key: 0,
  class: "flex items-center gap-2 text-on-surface-variant text-sm"
};
const _hoisted_28 = {
  key: 1,
  class: "flex items-center gap-2 text-on-surface-variant text-sm"
};
const _hoisted_29 = {
  key: 2,
  class: "flex items-center gap-2 text-on-surface-variant text-sm"
};
const _hoisted_30 = { class: "exam-updated-at" };
const EXAM_CACHE_REFRESH_RETRY_MS = 8e3;
const _sfc_main = {
  __name: "ExamView",
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
    const exams = ref([]);
    const displayedExamCacheKey = ref("");
    const semesters = ref([]);
    const selectedSemester = ref("");
    const currentSemester = ref("");
    const offline = ref(false);
    const syncTime = ref("");
    const resolveExamSyncTime = (data) => {
      const explicit = String(data?.sync_time || data?.updated_at || data?.timestamp || "").trim();
      if (explicit) return explicit;
      if (data?.offline) return syncTime.value || "";
      return (/* @__PURE__ */ new Date()).toISOString();
    };
    const lastUpdatedAt = computed(() => syncTime.value ? formatRelativeTime(syncTime.value) : t("exam.notUpdated"));
    const isInitialLoading = computed(() => loading.value && exams.value.length === 0);
    let examRequestSeq = 0;
    let examRealtimeRetryTimer = null;
    const applyStaleExamSnapshot = (cacheKey) => {
      const stale = getStaleCachedData(cacheKey);
      const data = stale?.data;
      if (!data?.success || !Array.isArray(data.data)) {
        return false;
      }
      exams.value = data.data || [];
      offline.value = true;
      syncTime.value = resolveExamSyncTime(data);
      displayedExamCacheKey.value = cacheKey;
      return true;
    };
    const clearExamRealtimeRetry = () => {
      if (examRealtimeRetryTimer) {
        clearTimeout(examRealtimeRetryTimer);
        examRealtimeRetryTimer = null;
      }
    };
    const scheduleExamRealtimeRetry = () => {
      clearExamRealtimeRetry();
      examRealtimeRetryTimer = setTimeout(() => {
        examRealtimeRetryTimer = null;
        if (offline.value) {
          fetchExams({ keepOfflineBanner: true }).catch(() => {
          });
        }
      }, EXAM_CACHE_REFRESH_RETRY_MS);
    };
    const initializeFastSemester = () => {
      const preferred = getPreferredSemesterFast();
      if (preferred && !selectedSemester.value) {
        selectedSemester.value = preferred;
      }
      semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value);
    };
    const isPassed = (examDate) => {
      if (!examDate) return false;
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const date = new Date(examDate);
      return date < today;
    };
    const formatExamTime = (timeStr) => {
      if (!timeStr) return "";
      const text = String(timeStr).trim();
      const match = text.match(/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/);
      if (match) return `${match[1]}~${match[2]}`;
      const timeOnly = text.match(/^\d{1,2}:\d{2}/);
      if (timeOnly) return text;
      return text;
    };
    const formatExamDate = (dateStr) => {
      if (!dateStr) return "";
      const text = String(dateStr).trim();
      const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[1]}-${match[2]}-${match[3]}`;
      return text;
    };
    const daysUntilExam = (examDate) => {
      if (!examDate) return null;
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const date = new Date(examDate);
      date.setHours(0, 0, 0, 0);
      const diff = Math.ceil((date - today) / (1e3 * 60 * 60 * 24));
      return diff;
    };
    const getCountdownLabel = (examDate) => {
      const days = daysUntilExam(examDate);
      if (days === null) return "";
      if (days === 0) return t("exam.countdown.today");
      if (days === 1) return t("exam.countdown.tomorrow");
      if (days < 0) return "";
      if (days <= 7) return tf("exam.countdown.daysLater", { n: days });
      return "";
    };
    const processedExams = computed(() => {
      if (!exams.value) return [];
      const future = [];
      const passed = [];
      exams.value.forEach((exam) => {
        if (isPassed(exam.exam_date)) {
          passed.push(exam);
        } else {
          future.push(exam);
        }
      });
      future.sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date));
      passed.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
      return [...future, ...passed];
    });
    const futureCount = computed(() => processedExams.value.filter((e) => !isPassed(e.exam_date)).length);
    const passedCount = computed(() => processedExams.value.filter((e) => isPassed(e.exam_date)).length);
    const fetchSemesters = async () => {
      const previousSemester = selectedSemester.value;
      try {
        const { data } = await fetchWithCache("semesters", async () => {
          const res = await axiosInstance.get(`${API_BASE}/v2/semesters`);
          return res.data;
        }, void 0, { staleWhileRevalidate: true, priority: "foreground" });
        if (data?.success) {
          const sorted = normalizeSemesterList(data.semesters || []);
          semesters.value = mergeSemesterOptions(sorted, selectedSemester.value);
          currentSemester.value = resolveCurrentSemester(sorted, data.current || "");
          if (!selectedSemester.value) {
            selectedSemester.value = currentSemester.value || sorted[0] || "";
            semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value);
          }
          const shouldRefetchResolvedSemester = !previousSemester && selectedSemester.value;
          if (shouldRefetchResolvedSemester) {
            fetchExams({ keepOfflineBanner: true }).catch(() => {
            });
          }
        }
      } catch (e) {
        console.error("failed to load semesters:", e);
      }
    };
    const fetchExams = async (options = {}) => {
      const requestSeq = ++examRequestSeq;
      const cacheKey = `exams:${props.studentId}:${selectedSemester.value || "current"}`;
      const staleApplied = applyStaleExamSnapshot(cacheKey);
      if (!staleApplied && displayedExamCacheKey.value && displayedExamCacheKey.value !== cacheKey) {
        exams.value = [];
        displayedExamCacheKey.value = "";
      }
      loading.value = exams.value.length === 0;
      refreshing.value = true;
      error.value = "";
      clearExamRealtimeRetry();
      if (!staleApplied || !options.keepOfflineBanner) {
        offline.value = false;
        syncTime.value = "";
      }
      try {
        const { data } = await fetchWithCache(cacheKey, async () => {
          const res = await axiosInstance.post(`${API_BASE}/v2/exams`, {
            student_id: props.studentId,
            semester: selectedSemester.value
          });
          return res.data;
        }, void 0, { forceRemote: true, priority: "foreground" });
        if (requestSeq !== examRequestSeq) return;
        if (data?.success) {
          exams.value = data.data || [];
          offline.value = !!data.offline;
          syncTime.value = resolveExamSyncTime(data);
          displayedExamCacheKey.value = cacheKey;
          if (!data.offline) {
            setCachedData(cacheKey, data);
          } else {
            scheduleExamRealtimeRetry();
          }
          const futureExams = (data.data || []).filter((e) => !isPassed(e.exam_date));
          if (futureExams.length > 0) {
            const daysLeft = daysUntilExam(futureExams[0].exam_date);
            writeExamToWidget({
              exams: futureExams.slice(0, 3).map((e) => ({
                course_name: e.course_name || "",
                exam_date: e.exam_date || "",
                exam_time: e.exam_time || "",
                location: e.location || ""
              })),
              days_left: daysLeft ?? -1
            }).catch(() => {
            });
          }
        } else {
          error.value = data?.error || t("exam.error.fetchFailed");
        }
      } catch (e) {
        if (requestSeq !== examRequestSeq) return;
        error.value = e.response?.data?.error || t("exam.error.network");
      } finally {
        if (requestSeq === examRequestSeq) {
          loading.value = false;
          refreshing.value = false;
        }
      }
    };
    const handleSemesterChange = () => {
      fetchExams();
    };
    onMounted(() => {
      initializeFastSemester();
      fetchExams();
      fetchSemesters();
    });
    onBeforeUnmount(() => {
      clearExamRealtimeRetry();
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("exam.title"),
          icon: "edit_document",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "exam-refresh-btn",
              type: "button",
              "aria-busy": refreshing.value || loading.value,
              "aria-label": unref(t)("exam.refreshAria"),
              onClick: fetchExams
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: refreshing.value || loading.value || offline.value }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_3, toDisplayString(unref(tf)("exam.offlineBanner", { time: unref(formatRelativeTime)(syncTime.value) })), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_4, [
          createBaseVNode("section", _hoisted_5, [
            createBaseVNode("div", _hoisted_6, [
              createBaseVNode("div", _hoisted_7, [
                createVNode(_component_IOSSelect, {
                  modelValue: selectedSemester.value,
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selectedSemester.value = $event),
                  onChange: handleSemesterChange,
                  class: "appearance-none bg-transparent border-none text-sm text-on-surface font-medium pr-6 focus:outline-none"
                }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(semesters.value, (sem) => {
                      return openBlock(), createElementBlock("option", {
                        key: sem,
                        value: sem
                      }, toDisplayString(sem), 9, _hoisted_8);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"]),
                _cache[2] || (_cache[2] = createBaseVNode("span", { class: "material-symbols-outlined text-outline absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-base" }, "arrow_drop_down", -1))
              ])
            ]),
            !isInitialLoading.value && exams.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("span", _hoisted_11, toDisplayString(unref(t)("exam.upcoming")), 1),
                createBaseVNode("div", _hoisted_12, [
                  createBaseVNode("span", _hoisted_13, toDisplayString(futureCount.value), 1),
                  createBaseVNode("span", _hoisted_14, toDisplayString(unref(t)("exam.countUnit")), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_15, [
                createBaseVNode("span", _hoisted_16, toDisplayString(unref(t)("exam.passed")), 1),
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("span", _hoisted_18, toDisplayString(passedCount.value), 1),
                  createBaseVNode("span", _hoisted_19, toDisplayString(unref(t)("exam.countUnit")), 1)
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("section", _hoisted_20, [
            isInitialLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(t)("exam.loading")
            }, null, 8, ["message"])) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "error",
              message: error.value
            }, {
              default: withCtx(() => [
                createBaseVNode("button", {
                  class: "mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold text-sm",
                  onClick: fetchExams
                }, toDisplayString(unref(t)("common.retry")), 1)
              ]),
              _: 1
            }, 8, ["message"])) : exams.value.length === 0 ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 2,
              type: "empty",
              message: unref(t)("exam.empty")
            }, null, 8, ["message"])) : (openBlock(true), createElementBlock(Fragment, { key: 3 }, renderList(processedExams.value, (exam, index) => {
              return openBlock(), createElementBlock("article", {
                key: index,
                class: normalizeClass([
                  "bg-surface-container-lowest rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.03)] border relative",
                  isPassed(exam.exam_date) ? "border-surface-container-highest opacity-70" : getCountdownLabel(exam.exam_date) ? "border-primary/10" : "border-surface-container-highest"
                ])
              }, [
                !isPassed(exam.exam_date) && getCountdownLabel(exam.exam_date) ? (openBlock(), createElementBlock("div", _hoisted_21)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_22, [
                  createBaseVNode("div", _hoisted_23, [
                    createBaseVNode("div", null, [
                      createBaseVNode("h2", {
                        class: normalizeClass([
                          "text-lg font-bold mb-1",
                          isPassed(exam.exam_date) ? "text-on-surface line-through decoration-outline-variant" : "text-on-surface"
                        ])
                      }, toDisplayString(exam.course_name), 3),
                      exam.exam_type ? (openBlock(), createElementBlock("span", {
                        key: 0,
                        class: normalizeClass([
                          "inline-block text-[10px] font-semibold px-2 py-0.5 rounded",
                          isPassed(exam.exam_date) ? "bg-surface-container text-on-surface-variant" : "bg-primary-fixed text-on-primary-fixed"
                        ])
                      }, toDisplayString(exam.exam_type), 3)) : createCommentVNode("", true)
                    ]),
                    isPassed(exam.exam_date) ? (openBlock(), createElementBlock("div", _hoisted_24, [
                      _cache[3] || (_cache[3] = createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "check_circle", -1)),
                      createTextVNode(" " + toDisplayString(unref(t)("exam.status.finished")), 1)
                    ])) : getCountdownLabel(exam.exam_date) ? (openBlock(), createElementBlock("div", _hoisted_25, [
                      _cache[4] || (_cache[4] = createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "timer", -1)),
                      createTextVNode(" " + toDisplayString(getCountdownLabel(exam.exam_date)), 1)
                    ])) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_26, [
                    exam.exam_date ? (openBlock(), createElementBlock("div", _hoisted_27, [
                      _cache[5] || (_cache[5] = createBaseVNode("span", { class: "material-symbols-outlined text-[18px] text-primary" }, "calendar_clock", -1)),
                      createBaseVNode("span", null, toDisplayString(formatExamDate(exam.exam_date)) + " " + toDisplayString(formatExamTime(exam.exam_time)), 1)
                    ])) : createCommentVNode("", true),
                    exam.location ? (openBlock(), createElementBlock("div", _hoisted_28, [
                      _cache[6] || (_cache[6] = createBaseVNode("span", { class: "material-symbols-outlined text-[18px] text-primary" }, "location_on", -1)),
                      createBaseVNode("span", null, toDisplayString(exam.location), 1)
                    ])) : createCommentVNode("", true),
                    exam.seat_no ? (openBlock(), createElementBlock("div", _hoisted_29, [
                      _cache[7] || (_cache[7] = createBaseVNode("span", { class: "material-symbols-outlined text-[18px] text-primary" }, "chair_alt", -1)),
                      createBaseVNode("span", null, toDisplayString(unref(tf)("exam.seatLabel", { seat: exam.seat_no })), 1)
                    ])) : createCommentVNode("", true)
                  ])
                ])
              ], 2);
            }), 128))
          ]),
          createBaseVNode("p", _hoisted_30, toDisplayString(unref(tf)("exam.lastUpdated", { time: lastUpdatedAt.value })), 1)
        ])
      ]);
    };
  }
};
const ExamView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6e1effdb"]]);
export {
  ExamView as default
};
